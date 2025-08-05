// Campaign Service - Abstracts data fetching logic
// This service provides high-level campaign operations by delegating to the cell layer

import {
  CampaignData,
  type CampaignDataLike,
} from "ssri-ckboost/types";
import {
  fetchCampaignCells,
  fetchCampaignByTypeHash,
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

  constructor(signer: ccc.Signer, campaign: Campaign) {
    this.signer = signer;
    this.campaign = campaign;

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
   * @param campaignTypeHash - Campaign type hash to update
   * @param updates - Updated campaign data
   * @returns Transaction hash
   */
  async updateCampaign(
    campaignData: CampaignDataLike,
    campaignTypeHash?: ccc.Hex,
    tx?: ccc.Transaction
  ): Promise<ccc.Hex> {
    if (!this.signer) {
      throw new Error("Signer is required to update a campaign");
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.");
    }

    try {
      let updateTx: ccc.Transaction;
      
      // New Campaign
      if (!campaignTypeHash) {
        const result = await this.campaign.updateCampaign(
          this.signer,
          campaignData
        );
        updateTx = result.res;
      } else {
        // Fetch current campaign data
        const currentCampaign = await fetchCampaignByTypeHash(
          campaignTypeHash,
          this.signer
        );

        if (!currentCampaign) {
          throw new Error(`Campaign ${campaignTypeHash} not found on chain`);
        }

        const currentCampaignData = CampaignData.decode(
          currentCampaign.outputData
        );
        const updatedCampaignData: CampaignDataLike = {
          ...currentCampaignData,
          ...campaignData,
        };

        // Update campaign using Campaign
        const result = await this.campaign.updateCampaign(
          this.signer,
          updatedCampaignData,
          tx
        );
        updateTx = result.res;
      }
      
      if (!updateTx) {
        throw new Error("Failed to get transaction from SSRI updateCampaign");
      }
      
      // Complete fees and send transaction
      await updateTx.completeInputsByCapacity(this.signer);
      await updateTx.completeFeeBy(this.signer);
      const txHash = await this.signer.sendTransaction(updateTx);

      console.log("Campaign updated:", { campaignTypeHash, txHash });
      return txHash;
    } catch (error) {
      console.error("Failed to update campaign:", error);
      throw error;
    }
  }

  /**
   * Approve a quest completion
   * @param campaignTypeHash - Campaign type hash
   * @param questId - Quest ID
   * @param userId - User ID who completed the quest
   * @returns Transaction hash
   */
  async approveCompletion(
    campaignTypeHash: ccc.Hex,
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
        campaignTypeHash as ccc.Hex,
        questId,
        userLockHash
      );

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer);
      await tx.completeFeeBy(this.signer);
      const txHash = await this.signer.sendTransaction(tx);

      console.log("Quest completion approved:", {
        campaignTypeHash,
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
