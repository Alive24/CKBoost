// Campaign Service - Abstracts data fetching logic
// This service provides high-level campaign operations by delegating to the cell layer

import { Campaign, UserProgress } from '../types/campaign'
import { fetchCampaignCells, fetchCampaignById, fetchUserProgress } from '../ckb/campaign-cells'
import { ccc } from "@ckb-ccc/connector-react"

/**
 * Campaign service that provides high-level campaign operations
 */
export class CampaignService {
  
  /**
   * Get all campaigns
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of all campaigns
   */
  static async getAllCampaigns(signer?: ccc.Signer): Promise<Campaign[]> {
    try {
      return await fetchCampaignCells(signer)
    } catch (error) {
      console.error("Failed to fetch campaigns:", error)
      throw error
    }
  }

  /**
   * Get featured campaigns (first 4)
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of featured campaigns
   */
  static async getFeaturedCampaigns(signer?: ccc.Signer): Promise<Campaign[]> {
    try {
      const allCampaigns = await fetchCampaignCells(signer)
      return allCampaigns.slice(0, 4)
    } catch (error) {
      console.error("Failed to fetch featured campaigns:", error)
      throw error
    }
  }

  /**
   * Get campaign by ID
   * @param id - Campaign ID
   * @param signer - Optional CCC signer for blockchain data
   * @returns Campaign or undefined if not found
   */
  static async getCampaignById(id: number, signer?: ccc.Signer): Promise<Campaign | undefined> {
    try {
      return await fetchCampaignById(id, signer)
    } catch (error) {
      console.error("Failed to fetch campaign by ID:", error)
      throw error
    }
  }

  /**
   * Get user progress for all campaigns
   * @param userAddress - User's CKB address
   * @param signer - Optional CCC signer for blockchain data
   * @returns Map of campaign ID to user progress
   */
  static async getUserProgress(userAddress: string, signer?: ccc.Signer): Promise<Map<number, UserProgress>> {
    try {
      return await fetchUserProgress(userAddress, signer)
    } catch (error) {
      console.error("Failed to fetch user progress:", error)
      throw error
    }
  }

  /**
   * Search campaigns by query
   * @param query - Search query
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of matching campaigns
   */
  static async searchCampaigns(query: string, signer?: ccc.Signer): Promise<Campaign[]> {
    const campaigns = await this.getAllCampaigns(signer)
    
    return campaigns.filter(campaign => 
      campaign.title.toLowerCase().includes(query.toLowerCase()) ||
      campaign.shortDescription.toLowerCase().includes(query.toLowerCase()) ||
      campaign.longDescription.toLowerCase().includes(query.toLowerCase())
    )
  }

  /**
   * Get campaigns by category
   * @param category - Category to filter by
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of campaigns in category
   */
  static async getCampaignsByCategory(category: string, signer?: ccc.Signer): Promise<Campaign[]> {
    const campaigns = await this.getAllCampaigns(signer)
    
    return campaigns.filter(campaign => 
      campaign.categories.some(cat => 
        cat.toLowerCase() === category.toLowerCase()
      )
    )
  }

  /**
   * Get campaigns by difficulty
   * @param difficulty - Difficulty to filter by
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of campaigns with specified difficulty
   */
  static async getCampaignsByDifficulty(difficulty: string, signer?: ccc.Signer): Promise<Campaign[]> {
    const campaigns = await this.getAllCampaigns(signer)
    
    return campaigns.filter(campaign => 
      campaign.difficulty.toLowerCase() === difficulty.toLowerCase()
    )
  }
}