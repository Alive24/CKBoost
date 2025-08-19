// Campaign Service - Abstracts data fetching logic
// This service provides high-level campaign operations by delegating to the cell layer

import {
  CampaignData,
} from "ssri-ckboost/types";
import {
  fetchCampaignCells,
} from "../ckb/campaign-cells";
import { ccc } from "@ckb-ccc/core";
import { Campaign } from "ssri-ckboost";
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
    const network = deploymentManager.getCurrentNetwork();
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
   * Calculate Points to be minted for quest completion
   * Used for displaying reward information before approval
   * 
   * @param questData - Quest data containing rewards
   * @param numUsers - Number of users to approve
   * @returns Total Points to be minted
   */
  // calculatePointsReward(questData: QuestDataLike, numUsers: number): number {
  //   if (!questData.rewards || !questData.rewards.points_amount) {
  //     return 0;
  //   }
    
  //   // Points amount is per user
  //   const pointsPerUser = questData.rewards.points_amount;
  //   return pointsPerUser * numUsers;
  // }

  /**
   * Stage 2 Placeholder: Calculate UDT rewards for distribution
   * This will be implemented when UDT distribution is added
   * 
   * @param questData - Quest data containing rewards
   * @param numUsers - Number of users to approve
   * @returns UDT reward details (placeholder)
   */
  // calculateUDTRewards(questData: QuestDataLike, numUsers: number): {
  //   enabled: boolean;
  //   udtAssets: Array<{
  //     scriptHash: string;
  //     amount: bigint;
  //     perUser: bigint;
  //   }>;
  // } {
  //   // Stage 2 placeholder
  //   return {
  //     enabled: false,
  //     udtAssets: []
  //   };
    
    // Future implementation will:
    // 1. Check if quest has UDT rewards configured
    // 2. Calculate total UDT needed
    // 3. Verify campaign has sufficient UDT balance
    // 4. Return distribution details
  // }

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
