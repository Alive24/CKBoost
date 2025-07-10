// Campaign Service - Abstracts data fetching logic
// This service decides whether to use mock data or real CKB blockchain data

import { Campaign, UserProgress } from '../types/campaign'
import { getAllMockCampaigns, getMockCampaignById, getFeaturedMockCampaigns } from '../mock/mock-campaigns'
import { fetchCampaignCells, fetchCampaignById, fetchUserProgress } from '../ckb/campaign-cells'
import { ccc } from "@ckb-ccc/connector-react"

// Configuration - Set to true when ready to use real CKB data
const USE_REAL_CKB_DATA = false

/**
 * Campaign service that abstracts data source (mock vs real CKB)
 */
export class CampaignService {
  
  /**
   * Get all campaigns
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of all campaigns
   */
  static async getAllCampaigns(signer?: ccc.Signer): Promise<Campaign[]> {
    if (USE_REAL_CKB_DATA && signer) {
      try {
        return await fetchCampaignCells(signer)
      } catch (error) {
        console.warn("Failed to fetch real CKB data, falling back to mock:", error)
        return getAllMockCampaigns()
      }
    }
    
    // Use mock data
    return getAllMockCampaigns()
  }

  /**
   * Get featured campaigns (first 4)
   * @param signer - Optional CCC signer for blockchain data
   * @returns Array of featured campaigns
   */
  static async getFeaturedCampaigns(signer?: ccc.Signer): Promise<Campaign[]> {
    if (USE_REAL_CKB_DATA && signer) {
      try {
        const allCampaigns = await fetchCampaignCells(signer)
        return allCampaigns.slice(0, 4)
      } catch (error) {
        console.warn("Failed to fetch real CKB data, falling back to mock:", error)
        return getFeaturedMockCampaigns()
      }
    }
    
    // Use mock data
    return getFeaturedMockCampaigns()
  }

  /**
   * Get campaign by ID
   * @param id - Campaign ID
   * @param signer - Optional CCC signer for blockchain data
   * @returns Campaign or undefined if not found
   */
  static async getCampaignById(id: number, signer?: ccc.Signer): Promise<Campaign | undefined> {
    if (USE_REAL_CKB_DATA && signer) {
      try {
        return await fetchCampaignById(id, signer)
      } catch (error) {
        console.warn("Failed to fetch real CKB data, falling back to mock:", error)
        return getMockCampaignById(id)
      }
    }
    
    // Use mock data
    return getMockCampaignById(id)
  }

  /**
   * Get user progress for all campaigns
   * @param userAddress - User's CKB address
   * @param signer - Optional CCC signer for blockchain data
   * @returns Map of campaign ID to user progress
   */
  static async getUserProgress(userAddress: string, signer?: ccc.Signer): Promise<Map<number, UserProgress>> {
    if (USE_REAL_CKB_DATA && signer) {
      try {
        return await fetchUserProgress(userAddress, signer)
      } catch (error) {
        console.warn("Failed to fetch real user progress, returning empty:", error)
        return new Map()
      }
    }
    
    // Return empty map for mock data
    return new Map()
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