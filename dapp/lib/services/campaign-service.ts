// Campaign Service - Abstracts data fetching logic
// This service provides high-level campaign operations by delegating to the cell layer

import {
  CampaignData,
  type CampaignDataLike,
} from "ssri-ckboost/types";
import {
  fetchCampaignCells,
} from "../ckb/campaign-cells";
import { ccc } from "@ckb-ccc/core";
import { Campaign } from "ssri-ckboost";
import { DeploymentManager } from "../ckb/deployment-manager";
import { deploymentManager } from "../ckb/deployment-manager";

/**
 * Campaign service that provides high-level campaign operations
 */
export class CampaignService {
  private signer: ccc.Signer;
  private campaign: Campaign;
  private protocolCell: ccc.Cell;

  constructor(signer: ccc.Signer, campaign: Campaign, protocolCell: ccc.Cell) {
    this.signer = signer;
    this.campaign = campaign;
    this.protocolCell = protocolCell;

    // Get the protocol type code outpoint and deployment info
    const network = DeploymentManager.getCurrentNetwork();
    const deployment = deploymentManager.getCurrentDeployment(
      network,
      "ckboostCampaignType"
    );
    const outPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostCampaignType"
    );

    if (!deployment || !outPoint) {
      throw new Error("Campaign type contract not found in deployments.json");
    }
  }

  /**
   * Update an existing campaign
   * @param campaignTypeId - Campaign type ID to update
   * @param updates - Updated campaign data
   * @returns Transaction hash
   */
  async updateCampaign(
    campaignData: CampaignDataLike,
    campaignTypeId?: ccc.Hex,
    tx?: ccc.Transaction
  ): Promise<ccc.Hex> {
    if (!this.signer) {
      throw new Error("Signer is required to update a campaign");
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.");
    }

    if (!this.protocolCell) {
      throw new Error("Protocol cell not found. Campaign Cell must be tied to a protocol cell.");
    }

    try {
      let updateTx: ccc.Transaction;
      
      // New Campaign
      if (!campaignTypeId) {
        const result = await this.campaign.updateCampaign(
          this.signer,
          campaignData
        );
        updateTx = result.res;
      } else {
        // Campaign updates now require a type ID, not type hash
        // The campaign should already have the current data loaded
        throw new Error(
          "Campaign updates by type hash are no longer supported. " +
          "Please use fetchCampaignByTypeId to get the campaign, then update it."
        );
      }
      
      if (!updateTx) {
        throw new Error("Failed to get transaction from SSRI updateCampaign");
      }
      
      // Complete fees and send transaction
      await updateTx.completeInputsByCapacity(this.signer);
      await updateTx.completeFeeBy(this.signer);
      
      // Log the transaction bytes before sending
      const txBytes = updateTx.toBytes();
      const txHex = ccc.hexFrom(txBytes);
      console.log("=== TRANSACTION BYTES TO RPC ===");
      console.log("Transaction Structure:", {
        version: updateTx.version,
        cellDeps: updateTx.cellDeps.map(dep => ({
          outPoint: {
            txHash: dep.outPoint.txHash,
            index: dep.outPoint.index
          },
          depType: dep.depType
        })),
        inputs: updateTx.inputs.map(input => ({
          previousOutput: {
            txHash: input.previousOutput.txHash,
            index: input.previousOutput.index
          },
          since: input.since
        })),
        outputs: updateTx.outputs.map(output => ({
          capacity: output.capacity.toString(),
          lock: {
            codeHash: output.lock.codeHash,
            hashType: output.lock.hashType,
            args: output.lock.args
          },
          type: output.type ? {
            codeHash: output.type.codeHash,
            hashType: output.type.hashType,
            args: output.type.args
          } : null
        })),
        outputsData: updateTx.outputsData.map(data => 
          typeof data === 'string' ? data : ccc.hexFrom(data)
        ),
        witnesses: updateTx.witnesses.map(witness => 
          typeof witness === 'string' ? witness : ccc.hexFrom(witness)
        )
      });
      console.log("Transaction Hex:", txHex);
      console.log("Transaction Size:", txBytes.length, "bytes");
      console.log("=== END TRANSACTION BYTES ===");
      
      const txHash = await this.signer.sendTransaction(updateTx);

      console.log("Campaign updated:", { campaignTypeId, txHash });
      return txHash;
    } catch (error) {
      console.error("Failed to update campaign:", error);
      throw error;
    }
  }

  /**
   * Approve a quest completion
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID
   * @param userId - User ID who completed the quest
   * @returns Transaction hash
   */
  async approveCompletion(
    campaignTypeId: ccc.Hex,
    questId: ccc.Num,
    userLockHash: ccc.Hex
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to approve quest completion");
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.");
    }

    try {
      const { res: tx } = await this.campaign.approveCompletion(
        this.signer,
        campaignTypeId as ccc.Hex,
        questId,
        userLockHash
      );

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer);
      await tx.completeFeeBy(this.signer);
      const txHash = await this.signer.sendTransaction(tx);

      console.log("Quest completion approved:", {
        campaignTypeId,
        questId,
        txHash,
      });
      return txHash;
    } catch (error) {
      console.error("Failed to approve quest completion:", error);
      throw error;
    }
  }

  /**
   * Get all campaigns
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of all campaigns
   */
  static async getAllCampaigns(signer?: ccc.Signer): Promise<ccc.Cell[]> {
    try {
      return await fetchCampaignCells(signer);
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      throw error;
    }
  }

  /**
   * Get featured campaigns (first 4)
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of featured campaigns
   */
  static async getFeaturedCampaigns(signer?: ccc.Signer): Promise<ccc.Cell[]> {
    try {
      const allCampaigns = await fetchCampaignCells(signer);
      return allCampaigns.slice(0, 4);
    } catch (error) {
      console.error("Failed to fetch featured campaigns:", error);
      throw error;
    }
  }

  /**
   * Search campaigns by query
   * @param query - Search query
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of matching campaigns
   */
  static async searchCampaigns(
    query: string,
    signer?: ccc.Signer
  ): Promise<ccc.Cell[]> {
    const campaigns = await this.getAllCampaigns(signer);

    return campaigns.filter((campaign) => {
      const campaignData = CampaignData.decode(campaign.outputData);
      return (
        campaignData.metadata.title
          .toLowerCase()
          .includes(query.toLowerCase()) ||
        campaignData.metadata.short_description
          .toLowerCase()
          .includes(query.toLowerCase()) ||
        campaignData.metadata.long_description
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    });
  }

  /**
   * Get campaigns by category
   * @param category - Category to filter by
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of campaigns in category
   */
  static async getCampaignsByCategory(
    category: string,
    signer?: ccc.Signer
  ): Promise<ccc.Cell[]> {
    const campaigns = await this.getAllCampaigns(signer);

    return campaigns.filter((campaign) => {
      const campaignData = CampaignData.decode(campaign.outputData);
      return campaignData.metadata.categories.some(
        (cat) => cat.toLowerCase() === category.toLowerCase()
      );
    });
  }

  /**
   * Get campaigns by endorser
   * @param endorserLockHash - Endorser's lock hash
   * @returns Array of campaigns by the endorser
   */
  async getCampaignsByEndorser(endorserLockHash: string): Promise<ccc.Cell[]> {
    if (!this.signer || !this.campaign) {
      // Fallback to fetching all campaigns and filtering
      console.log(endorserLockHash)
      const allCampaigns = await CampaignService.getAllCampaigns(this.signer);
      // TODO: Filter by endorser when we have proper data parsing
      return allCampaigns;
    }

    try {
      const campaignCells = await fetchCampaignCells(this.signer);

      // Convert cells to Campaign objects
      // TODO: Implement proper cell to campaign conversion
      return campaignCells;
    } catch (error) {
      console.error("Failed to get campaigns by endorser:", error);
      return [];
    }
  }
}
