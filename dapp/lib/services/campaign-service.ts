// Campaign Service - Abstracts data fetching logic
// This service provides high-level campaign operations by delegating to the cell layer

import type { CampaignDataLike, UserProgressDataLike, QuestDataLike } from "ssri-ckboost/types"
import { fetchCampaignCells, fetchCampaignById, fetchUserProgress, createCampaign as createCampaignCell } from '../ckb/campaign-cells'
import { ccc } from "@ckb-ccc/core"
import { ssri } from "@ckb-ccc/ssri"
import { Campaign as SSRICampaign } from "ssri-ckboost"
import { ProtocolService } from './protocol-service'
import type { Campaign, UserProgress } from '../types'

/**
 * Campaign service that provides high-level campaign operations
 */
export class CampaignService {
  private signer?: ccc.Signer
  private campaign?: SSRICampaign
  private static ssriExecutor?: ssri.ExecutorJsonRpc

  constructor(signer?: ccc.Signer) {
    this.signer = signer
    
    // Initialize Campaign if signer is available
    if (signer) {
      this.initializeCampaign().catch(error => {
        console.warn("Failed to initialize Campaign:", error)
      })
    }
  }

  private async initializeCampaign() {
    // Get SSRI executor (shared instance)
    if (!CampaignService.ssriExecutor) {
      const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
      CampaignService.ssriExecutor = new ssri.ExecutorJsonRpc(executorUrl)
    }

    // For now, we'll use dummy values since campaign type isn't deployed yet
    // TODO: Update with actual deployment info
    const outPoint = {
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      index: 0
    }

    const campaignTypeScript = {
      codeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      hashType: "type" as const,
      args: "0x"
    }

    this.campaign = new SSRICampaign(outPoint, campaignTypeScript, { 
      executor: CampaignService.ssriExecutor 
    })
  }
  
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

  /**
   * Create a new campaign
   * @param campaignData - Campaign data to create (using SSRI types)
   * @param endorserLockHash - Endorser's lock hash from the selected endorser
   * @returns Transaction hash
   */
  async createCampaign(
    campaignData: Partial<CampaignDataLike>,
    endorserLockHash: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to create a campaign")
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.")
    }

    try {
      // Get protocol data to get the protocol type hash
      const protocolService = new ProtocolService(this.signer)
      const protocolData = await protocolService.getProtocolData()
      
      // Get protocol type hash from the current deployment
      // This assumes we have access to the protocol cell's type hash
      const protocolTypeHash = "0x" + "00".repeat(32) as ccc.Hex // TODO: Get actual protocol type hash

      // Use the campaign data directly (it's already in the correct format)
      const newCampaignData: CampaignDataLike = {
        ...campaignData,
        endorser_info: {
          endorser_lock_hash: endorserLockHash as ccc.Hex,
          endorser_name: ccc.hexFrom(ccc.bytesFrom("Selected Endorser", "utf8")), // Will be populated from protocol data
          endorser_description: ccc.hexFrom(ccc.bytesFrom("Campaign endorser", "utf8")),
          website: ccc.hexFrom(ccc.bytesFrom("", "utf8")),
          social_links: [],
          verified: 1
        }
      } as CampaignDataLike

      // Create campaign using SSRICampaign
      const { res: tx } = await this.campaign.updateCampaign(
        this.signer,
        newCampaignData,
      )

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer)
      await tx.completeFeeBy(this.signer)
      const txHash = await this.signer.sendTransaction(tx)

      console.log("Campaign created:", { txHash })
      return txHash
    } catch (error) {
      console.error("Failed to create campaign:", error)
      throw error
    }
  }

  /**
   * Encode verification requirements into a uint32
   * @param requirements - Verification requirements object
   * @returns Encoded uint32
   */
  private encodeVerificationRequirements(requirements: any): number {
    let encoded = 0
    if (requirements.telegram) encoded |= 1 << 0
    if (requirements.kyc) encoded |= 1 << 1
    if (requirements.did) encoded |= 1 << 2
    if (requirements.manualReview) encoded |= 1 << 3
    if (requirements.twitter) encoded |= 1 << 4
    if (requirements.discord) encoded |= 1 << 5
    if (requirements.reddit) encoded |= 1 << 6
    return encoded
  }

  /**
   * Update an existing campaign
   * @param campaignId - Campaign ID to update
   * @param updates - Updated campaign data
   * @returns Transaction hash
   */
  async updateCampaign(
    campaignId: string,
    updates: Partial<Campaign>
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to update a campaign")
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.")
    }

    try {
      // Fetch current campaign data
      const currentCampaign = await CampaignService.getCampaignById(
        parseInt(campaignId),
        this.signer
      )

      if (!currentCampaign) {
        throw new Error("Campaign not found")
      }

      // Find the current campaign cell to preserve existing data
      const campaignCell = await this.campaign.findCampaignCell(
        this.signer.client,
        campaignId as ccc.Hex
      )
      
      if (!campaignCell) {
        throw new Error(`Campaign ${campaignId} not found on chain`)
      }

      // Convert updated campaign data to SDK format, preserving existing data
      const updatedCampaignData: CampaignDataLike = {
        id: campaignId as ccc.Hex,
        title: ccc.hexFrom(ccc.bytesFrom(updates.title || currentCampaign.title, "utf8")),
        short_description: ccc.hexFrom(ccc.bytesFrom(
          updates.shortDescription || currentCampaign.shortDescription,
          "utf8"
        )),
        long_description: ccc.hexFrom(ccc.bytesFrom(
          updates.longDescription || currentCampaign.longDescription,
          "utf8"
        )),
        creator: (await this.signer.getRecommendedAddressObj()).script,
        endorser_info: {
          endorser_lock_hash: "0x" + "00".repeat(32), // Keep existing
          endorser_name: ccc.hexFrom(ccc.bytesFrom(
            updates.endorserName || currentCampaign.endorserName || "Unknown Endorser",
            "utf8"
          )),
          endorser_description: ccc.hexFrom(ccc.bytesFrom(
            "Campaign endorser from protocol whitelist",
            "utf8"
          )),
          website: ccc.hexFrom(ccc.bytesFrom("", "utf8")),
          social_links: [],
          verified: 1
        },
        metadata: {
          funding_info: [],
          created_at: BigInt(Date.now()), // Keep original
          starting_time: BigInt(new Date(updates.startDate || currentCampaign.startDate).getTime()),
          ending_time: BigInt(new Date(updates.endDate || currentCampaign.endDate).getTime()),
          verification_requirements: this.encodeVerificationRequirements(
            updates.verificationRequirements || currentCampaign.verificationRequirements
          ),
          last_updated: BigInt(Date.now()),
          categories: (updates.categories || currentCampaign.categories).map(
            cat => ccc.hexFrom(ccc.bytesFrom(cat, "utf8"))
          ),
          difficulty: updates.difficulty === "Easy" ? 1 : 
                     updates.difficulty === "Medium" ? 2 : 
                     updates.difficulty === "Hard" ? 3 :
                     currentCampaign.difficulty === "Easy" ? 1 :
                     currentCampaign.difficulty === "Medium" ? 2 : 3,
          image_cid: ccc.hexFrom(ccc.bytesFrom(updates.image || currentCampaign.image, "utf8")),
          rules: (updates.rules || currentCampaign.rules || []).map(
            rule => ccc.hexFrom(ccc.bytesFrom(rule, "utf8"))
          )
        },
        status: 1, // Updated status
        quests: [], // Preserve existing quests
        participants_count: currentCampaign.participants,
        total_completions: currentCampaign.questsCompleted
      }

      // Update campaign using SSRICampaign
      const { res: tx } = await this.campaign.updateCampaign(
        this.signer,
        updatedCampaignData
      )

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer)
      await tx.completeFeeBy(this.signer)
      const txHash = await this.signer.sendTransaction(tx)

      console.log("Campaign updated:", { campaignId, txHash })
      return txHash
    } catch (error) {
      console.error("Failed to update campaign:", error)
      throw error
    }
  }

  /**
   * Approve a quest completion
   * @param campaignId - Campaign ID
   * @param questId - Quest ID
   * @param userId - User ID who completed the quest
   * @returns Transaction hash
   */
  async approveQuestCompletion(
    campaignId: string,
    questId: string,
    userId: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to approve quest completion")
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.")
    }

    try {
      const questData: QuestDataLike = {
        id: ccc.hexFrom(ccc.bytesFrom(questId, "utf8")),
        campaign_id: campaignId as ccc.Hex,
        title: "0x",
        description: "0x",
        requirements: "0x",
        rewards_on_completion: [],
        completion_records: [{
          user_address: ccc.hexFrom(ccc.bytesFrom(userId, "utf8")),
          sub_task_id: 0,
          completion_timestamp: BigInt(Date.now()),
          completion_content: ccc.hexFrom(ccc.bytesFrom("completed", "utf8"))
        }],
        completion_deadline: BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 1, // Completed
        sub_tasks: [],
        points: 0,
        difficulty: 1,
        time_estimate: 0,
        completion_count: 1
      }

      const { res: tx } = await this.campaign.approveCompletion(
        this.signer,
        campaignId as ccc.Hex,
        questData
      )

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer)
      await tx.completeFeeBy(this.signer)
      const txHash = await this.signer.sendTransaction(tx)

      console.log("Quest completion approved:", { campaignId, questId, txHash })
      return txHash
    } catch (error) {
      console.error("Failed to approve quest completion:", error)
      throw error
    }
  }

  /**
   * Get campaigns by endorser
   * @param endorserLockHash - Endorser's lock hash
   * @returns Array of campaigns by the endorser
   */
  async getCampaignsByEndorser(endorserLockHash: string): Promise<Campaign[]> {
    if (!this.signer || !this.campaign) {
      // Fallback to fetching all campaigns and filtering
      const allCampaigns = await CampaignService.getAllCampaigns(this.signer)
      // TODO: Filter by endorser when we have proper data parsing
      return allCampaigns
    }

    try {
      const campaignCells = await this.campaign.getCampaignsByEndorser(
        this.signer.client,
        endorserLockHash as ccc.Hex
      )

      // Convert cells to Campaign objects
      // TODO: Implement proper cell to campaign conversion
      return campaignCells.map((cell, index) => this.cellToCampaign(cell, index))
    } catch (error) {
      console.error("Failed to get campaigns by endorser:", error)
      return []
    }
  }

  /**
   * Convert campaign cell to high-level Campaign type
   * @param cell - CKB cell containing campaign data
   * @param index - Index for ID generation
   * @returns Campaign object
   */
  private cellToCampaign(_cell: ccc.Cell, index: number): Campaign {
    // TODO: Implement proper deserialization using CampaignData.decode
    // For now, return a dummy campaign
    return {
      id: index,
      title: "Campaign " + index,
      shortDescription: "Description for campaign " + index,
      longDescription: "Long description...",
      endorserName: "Protocol Endorser",
      categories: ["DeFi"],
      difficulty: "Medium",
      status: "Active",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      participants: 0,
      questsCount: 5,
      questsCompleted: 0,
      totalRewards: {
        points: ccc.numFrom(1000),
        tokens: [{
          symbol: "CKB",
          amount: ccc.numFrom(100)
        }]
      },
      verificationRequirements: {
        telegram: true,
        kyc: false,
        did: false,
        manualReview: false
      },
      image: "/placeholder.svg",
      rules: [],
      quests: [],
      completedQuests: 0
    }
  }
}