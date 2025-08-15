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
   * Approve quest completions with Points minting (Stage 1)
   * Stage 2 placeholder: Will support UDT distribution in the future
   * 
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID to approve
   * @param userTypeIds - Array of user type IDs to approve
   * @returns Transaction hash
   */
  async approveCompletions(
    campaignTypeId: ccc.Hex,
    questId: number,
    userTypeIds: ccc.Hex[]
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to approve quest completions");
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.");
    }

    if (userTypeIds.length === 0) {
      throw new Error("At least one user type ID must be provided");
    }

    try {
      // Stage 1: Approve completions with Points minting
      // The smart contract will handle Points minting through the Points UDT
      const { res: tx } = await this.campaign.approveCompletion(
        this.signer,
        campaignTypeId,
        questId,
        userTypeIds
      );

      // Stage 2 Placeholder: Future UDT distribution logic
      // TODO: Add UDT distribution when Stage 2 is implemented
      // - Check if campaign has funded UDTs
      // - Calculate UDT rewards per user
      // - Add UDT transfer outputs to transaction

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer);
      await tx.completeFeeBy(this.signer);
      const txHash = await this.signer.sendTransaction(tx);

      console.log("Quest completions approved with Points minting:", {
        campaignTypeId,
        questId,
        userTypeIds,
        txHash,
        pointsMinted: true,
        // Stage 2: udtDistributed: false (placeholder)
      });
      
      return txHash;
    } catch (error) {
      console.error("Failed to approve quest completions:", error);
      throw error;
    }
  }

  /**
   * Fetch pending submissions for a quest
   * Used by admins to review submissions before approval
   * 
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID
   * @returns Array of pending submissions with user data
   */
  async fetchPendingSubmissions(
    campaignTypeId: ccc.Hex,
    questId: number
  ): Promise<Array<{
    userTypeId: ccc.Hex;
    submissionData: any; // UserSubmissionRecord from contract
    submittedAt: number;
    userAddress: string;
  }>> {
    if (!this.signer) {
      throw new Error("Signer is required to fetch submissions");
    }

    try {
      // TODO: Implement actual fetching logic
      // This will query user cells that have submissions for this quest
      // Filter out already approved submissions
      
      console.log("Fetching pending submissions for quest:", { campaignTypeId, questId });
      
      // Placeholder implementation
      // In production, this would:
      // 1. Fetch all user cells with submissions for this campaign/quest
      // 2. Filter out users whose type_ids are in accepted_submission_user_type_ids
      // 3. Return submission details for review
      
      return [];
    } catch (error) {
      console.error("Failed to fetch pending submissions:", error);
      throw error;
    }
  }

  /**
   * Get approved completions for a quest
   * Returns list of user type IDs that have been approved
   * 
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID
   * @returns Array of approved user type IDs
   */
  async getApprovedCompletions(
    campaignTypeId: ccc.Hex,
    questId: number
  ): Promise<ccc.Hex[]> {
    try {
      // Fetch campaign cell
      const campaigns = await fetchCampaignCells(this.signer);
      const campaignCell = campaigns.find(cell => {
        // Extract type_id from ConnectedTypeID args
        const typeScript = cell.cellOutput.type;
        if (typeScript && typeScript.args.length >= 32) {
          const typeId = typeScript.args.slice(0, 32);
          return typeId === campaignTypeId;
        }
        return false;
      });

      if (!campaignCell) {
        throw new Error("Campaign not found");
      }

      // Parse campaign data
      const campaignData = CampaignData.decode(campaignCell.outputData);
      
      // Find the quest
      const quest = campaignData.quests.find(q => q.id === questId);
      if (!quest) {
        throw new Error("Quest not found");
      }

      // Return approved user type IDs
      return quest.accepted_submission_user_type_ids || [];
    } catch (error) {
      console.error("Failed to get approved completions:", error);
      throw error;
    }
  }

  /**
   * Calculate Points to be minted for quest completion
   * Used for displaying reward information before approval
   * 
   * @param questData - Quest data containing rewards
   * @param numUsers - Number of users to approve
   * @returns Total Points to be minted
   */
  calculatePointsReward(questData: any, numUsers: number): number {
    if (!questData.rewards || !questData.rewards.points_amount) {
      return 0;
    }
    
    // Points amount is per user
    const pointsPerUser = questData.rewards.points_amount;
    return pointsPerUser * numUsers;
  }

  /**
   * Stage 2 Placeholder: Calculate UDT rewards for distribution
   * This will be implemented when UDT distribution is added
   * 
   * @param questData - Quest data containing rewards
   * @param numUsers - Number of users to approve
   * @returns UDT reward details (placeholder)
   */
  calculateUDTRewards(questData: any, numUsers: number): {
    enabled: boolean;
    udtAssets: Array<{
      scriptHash: string;
      amount: bigint;
      perUser: bigint;
    }>;
  } {
    // Stage 2 placeholder
    return {
      enabled: false,
      udtAssets: []
    };
    
    // Future implementation will:
    // 1. Check if quest has UDT rewards configured
    // 2. Calculate total UDT needed
    // 3. Verify campaign has sufficient UDT balance
    // 4. Return distribution details
  }

  /**
   * Stage 2 Placeholder: Fund campaign with UDTs for distribution
   * This will be implemented when UDT distribution is added
   * 
   * @param campaignTypeId - Campaign type ID
   * @param udtAssets - Array of UDT assets to fund
   * @returns Transaction hash (placeholder)
   */
  async fundCampaignWithUDTs(
    campaignTypeId: ccc.Hex,
    udtAssets: Array<{
      scriptHash: ccc.Hex;
      amount: bigint;
    }>
  ): Promise<string> {
    // Stage 2 placeholder
    console.log("UDT funding will be available in Stage 2:", {
      campaignTypeId,
      udtAssets
    });
    
    throw new Error("UDT funding is not yet implemented (Stage 2 feature)");
    
    // Future implementation will:
    // 1. Create transaction to transfer UDTs to campaign cell
    // 2. Update campaign data with funded amounts
    // 3. Enable UDT distribution for quests
  }

  /**
   * Get Points balance for a user in this protocol
   * Points are protocol-scoped tokens
   * 
   * @param userAddress - User's address
   * @returns Points balance
   */
  async getUserPointsBalance(userAddress: string): Promise<bigint> {
    if (!this.signer) {
      return BigInt(0);
    }

    try {
      // TODO: Implement Points balance fetching
      // This will query Points UDT cells owned by the user
      // Points UDT uses protocol type hash as args
      
      console.log("Fetching Points balance for user:", userAddress);
      
      // Placeholder - return 0 for now
      return BigInt(0);
    } catch (error) {
      console.error("Failed to fetch Points balance:", error);
      return BigInt(0);
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
