// Campaign Service - Abstracts data fetching logic
// This service provides high-level campaign operations by delegating to the cell layer

import {
  CampaignData,
} from "ssri-ckboost/types";
import { ccc } from "@ckb-ccc/connector-react";
import { Campaign } from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { fetchCampaignsConnectedToProtocol } from "../ckb/campaign-cells";

/**
 * Campaign service that provides high-level campaign operations
 */
export class CampaignService {
  private signer?: ccc.Signer;
  private campaign: Campaign;
  private protocolCell: ccc.Cell;

  constructor(signer: ccc.Signer | undefined, campaign: Campaign, protocolCell: ccc.Cell) {
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
   * Static method to get all campaigns connected to a protocol
   * Used when we don't have a service instance yet
   * @param client - CCC client for blockchain data
   * @param protocolCell - Protocol cell to find connected campaigns
   * @returns Array of all campaigns
   */
  static async fetchAllCampaigns(client: ccc.Client, protocolCell: ccc.Cell): Promise<ccc.Cell[]> {
    const network = deploymentManager.getCurrentNetwork();
    const campaignCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType");
    if (!campaignCodeHash) {
      throw new Error("Campaign type contract not deployed");
    }
    if (!protocolCell || !protocolCell.cellOutput.type) {
      throw new Error("Protocol cell not found");
    }
    const protocolTypeHash = protocolCell.cellOutput.type.hash();

    try {
      return await fetchCampaignsConnectedToProtocol(client, campaignCodeHash, protocolTypeHash);
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      throw error;
    }
  }

  /**
   * Instance method to get all campaigns using the stored protocol cell
   * @param client - CCC client for blockchain data
   * @returns Array of all campaigns
   */
  async getAllCampaigns(client: ccc.Client): Promise<ccc.Cell[]> {
    return CampaignService.fetchAllCampaigns(client, this.protocolCell);
  }

  /**
   * Get featured campaigns (first 4)
   * @param client - CCC client for blockchain data
   * @returns Array of featured campaigns
   */
  async getFeaturedCampaigns(client: ccc.Client): Promise<ccc.Cell[]> {
    try {
      const allCampaigns = await this.getAllCampaigns(client);
      return allCampaigns.slice(0, 4);
    } catch (error) {
      console.error("Failed to fetch featured campaigns:", error);
      throw error;
    }
  }

  /**
   * Get campaigns by category
   * @param category - Category to filter by
   * @param client - CCC client for blockchain data
   * @returns Array of campaigns in category
   */
  async getCampaignsByCategory(
    category: string,
    client: ccc.Client
  ): Promise<ccc.Cell[]> {
    const campaigns = await this.getAllCampaigns(client);

    return campaigns.filter((campaign) => {
      const campaignData = CampaignData.decode(campaign.outputData);
      return campaignData.metadata.categories.some(
        (cat) => cat.toLowerCase() === category.toLowerCase()
      );
    });
  }

}
