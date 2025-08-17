import { ccc } from "@ckb-ccc/core"
import { 
  CampaignDataLike, 
  CampaignData,
  UserSubmissionRecordLike,
  UserDataLike 
} from "ssri-ckboost/types"
import { fetchAllUserCells, parseUserData, extractTypeIdFromUserCell } from "@/lib/ckb/user-cells"
import { fetchCampaignByTypeId as fetchCampaignCell } from "@/lib/ckb/campaign-cells"
import { debug } from "@/lib/utils/debug"

// Define Quest type based on CampaignDataLike structure
type QuestLike = NonNullable<CampaignDataLike['quests']>[number]

/**
 * Comprehensive service for campaign admin operations
 * Handles all campaign management tasks including submissions, quests, and analytics
 */
export class CampaignAdminService {
  private signer: ccc.Signer
  private userTypeCodeHash: ccc.Hex
  private campaignTypeCodeHash: ccc.Hex
  private protocolCell: ccc.Cell | null

  constructor(
    signer: ccc.Signer,
    userTypeCodeHash: ccc.Hex,
    _protocolTypeHash: ccc.Hex,  // Keep in constructor for potential future use
    campaignTypeCodeHash: ccc.Hex,
    protocolCell: ccc.Cell | null
  ) {
    this.signer = signer
    this.userTypeCodeHash = userTypeCodeHash
    // protocolTypeHash is available if needed in the future
    this.campaignTypeCodeHash = campaignTypeCodeHash
    this.protocolCell = protocolCell
  }

  // ============ Helper Methods ============

  /**
   * Fetch campaign by its type ID
   */
  private async fetchCampaignByTypeId(campaignTypeId: ccc.Hex) {
    if (!this.protocolCell) {
      throw new Error("Protocol cell is required to fetch campaign")
    }
    return await fetchCampaignCell(
      campaignTypeId, 
      this.campaignTypeCodeHash,
      this.signer,
      this.protocolCell
    )
  }

  /**
   * Parse campaign data from a cell
   */
  private parseCampaignData(cell: ccc.Cell): CampaignDataLike | null {
    try {
      return CampaignData.decode(cell.outputData)
    } catch (err) {
      debug.error("Failed to parse campaign data", err)
      return null
    }
  }

  // ============ Campaign Management ============

  /**
   * Update campaign data
   */
  async updateCampaign(campaignTypeId: ccc.Hex, data: CampaignDataLike): Promise<ccc.Hex> {
    // This would need to be implemented with proper SSRI calls
    // For now, throw an error indicating this needs implementation
    console.log("Update campaign called with:", { campaignTypeId, data })
    throw new Error("Campaign update not yet implemented in CampaignAdminService")
  }

  /**
   * Add a new quest to the campaign
   */
  async addQuest(campaignTypeId: ccc.Hex, quest: QuestLike): Promise<ccc.Hex> {
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId)
    if (!campaignCell) {
      throw new Error("Campaign not found")
    }

    const campaignData = this.parseCampaignData(campaignCell)
    if (!campaignData) {
      throw new Error("Failed to parse campaign data")
    }

    const updatedCampaign = {
      ...campaignData,
      quests: [...(campaignData.quests || []), quest]
    }

    return await this.updateCampaign(campaignTypeId, updatedCampaign)
  }

  /**
   * Update an existing quest
   */
  async updateQuest(campaignTypeId: ccc.Hex, questId: number, quest: QuestLike): Promise<ccc.Hex> {
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId)
    if (!campaignCell) {
      throw new Error("Campaign not found")
    }

    const campaignData = this.parseCampaignData(campaignCell)
    if (!campaignData) {
      throw new Error("Failed to parse campaign data")
    }

    const quests = [...(campaignData.quests || [])]
    const questIndex = quests.findIndex(q => Number(q.quest_id) === questId)
    
    if (questIndex === -1) {
      throw new Error(`Quest ${questId} not found`)
    }

    quests[questIndex] = quest

    const updatedCampaign = {
      ...campaignData,
      quests
    }

    return await this.updateCampaign(campaignTypeId, updatedCampaign)
  }

  /**
   * Delete a quest from the campaign
   */
  async deleteQuest(campaignTypeId: ccc.Hex, questId: number): Promise<ccc.Hex> {
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId)
    if (!campaignCell) {
      throw new Error("Campaign not found")
    }

    const campaignData = this.parseCampaignData(campaignCell)
    if (!campaignData) {
      throw new Error("Failed to parse campaign data")
    }

    const quests = (campaignData.quests || []).filter(
      q => Number(q.quest_id) !== questId
    )

    const updatedCampaign = {
      ...campaignData,
      quests
    }

    return await this.updateCampaign(campaignTypeId, updatedCampaign)
  }

  // ============ Submission Management ============

  /**
   * Fetch all submissions for a campaign
   * Returns submissions grouped by quest ID and user details
   */
  async fetchCampaignSubmissions(campaignTypeId: ccc.Hex): Promise<{
    submissions: Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>,
    userDetails: Map<string, UserDataLike>,
    stats: {
      totalSubmissions: number,
      pendingReview: number,
      approved: number
    }
  }> {
    debug.log("Fetching submissions for campaign", campaignTypeId.slice(0, 10) + "...")

    // Fetch the campaign to get quest details
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId)
    if (!campaignCell) {
      throw new Error("Campaign not found")
    }

    // Parse campaign data
    const campaignData = this.parseCampaignData(campaignCell)
    if (!campaignData) {
      throw new Error("Failed to parse campaign data")
    }

    // Fetch all user cells
    const userCells = await fetchAllUserCells(this.userTypeCodeHash, this.signer)
    debug.log(`Found ${userCells.length} total user cells`)

    // Process submissions
    const submissions = new Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>()
    const userDetails = new Map<string, UserDataLike>()
    let totalSubmissions = 0
    let pendingReview = 0

    for (const userCell of userCells) {
      try {
        // Extract user type ID
        const userTypeId = extractTypeIdFromUserCell(userCell)
        if (!userTypeId) continue

        // Parse user data
        const userData = parseUserData(userCell)
        if (!userData) continue

        // Store user details
        userDetails.set(userTypeId, userData)

        // Filter submissions for this campaign
        const userSubmissions = userData.submission_records.filter(record => {
          // Convert campaign_type_id to hex for comparison
          let recordCampaignId: string
          if (typeof record.campaign_type_id === 'string') {
            recordCampaignId = record.campaign_type_id
          } else if (record.campaign_type_id && ArrayBuffer.isView(record.campaign_type_id)) {
            recordCampaignId = ccc.hexFrom(record.campaign_type_id)
          } else {
            recordCampaignId = "0x"
          }
          
          return recordCampaignId === campaignTypeId
        })

        // Group submissions by quest ID
        for (const submission of userSubmissions) {
          const questId = Number(submission.quest_id)
          
          if (!submissions.has(questId)) {
            submissions.set(questId, [])
          }
          
          submissions.get(questId)!.push({
            ...submission,
            userTypeId
          })
          
          totalSubmissions++

          // Check if this submission is already approved
          const quest = campaignData.quests?.find(q => Number(q.quest_id) === questId)
          const isApproved = quest?.accepted_submission_user_type_ids?.includes(userTypeId)
          
          if (!isApproved) {
            pendingReview++
          }
        }
      } catch (err) {
        debug.error("Failed to process user cell", err)
        continue
      }
    }

    // Calculate approved count
    const approved = campaignData.quests?.reduce((total, quest) => {
      return total + (quest.accepted_submission_user_type_ids?.length || 0)
    }, 0) || 0

    debug.log("Submission fetch complete", {
      totalSubmissions,
      uniqueUsers: userDetails.size,
      pendingReview,
      approved,
      questsWithSubmissions: submissions.size
    })

    return {
      submissions,
      userDetails,
      stats: {
        totalSubmissions,
        pendingReview,
        approved
      }
    }
  }

  /**
   * Approve a single submission
   */
  async approveSubmission(
    campaignTypeId: ccc.Hex, 
    userTypeId: ccc.Hex, 
    questId: number,
    pointsAmount?: number
  ): Promise<ccc.Hex> {
    debug.log("Approving submission", {
      campaign: campaignTypeId.slice(0, 10) + "...",
      user: userTypeId.slice(0, 10) + "...",
      questId,
      pointsAmount
    })

    // This would need to be implemented with proper SSRI calls
    // For now, throw an error indicating this needs implementation
    throw new Error("Approval not yet implemented in CampaignAdminService - requires Campaign SSRI instance")
  }

  /**
   * Batch approve multiple submissions
   */
  async batchApproveSubmissions(
    campaignTypeId: ccc.Hex,
    approvals: Array<{
      userTypeId: ccc.Hex,
      questId: number,
      pointsAmount?: number
    }>
  ): Promise<ccc.Hex[]> {
    debug.log(`Batch approving ${approvals.length} submissions`)

    const results: ccc.Hex[] = []

    // Process approvals sequentially to avoid conflicts
    // In the future, we could optimize this to batch in a single transaction
    for (const approval of approvals) {
      try {
        const txHash = await this.approveSubmission(
          campaignTypeId,
          approval.userTypeId,
          approval.questId,
          approval.pointsAmount
        )
        results.push(txHash)
      } catch (err) {
        debug.error(`Failed to approve submission for user ${approval.userTypeId.slice(0, 10)}`, err)
        // Continue processing other approvals
      }
    }

    debug.log(`Batch approval complete: ${results.length}/${approvals.length} successful`)
    return results
  }

  // ============ Analytics ============

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignTypeId: ccc.Hex): Promise<{
    totalQuests: number,
    totalPointsAllocated: number,
    totalPointsDistributed: number,
    participantCount: number,
    completionRate: number,
    averagePointsPerUser: number
  }> {
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId)
    if (!campaignCell) {
      throw new Error("Campaign not found")
    }

    const campaignData = this.parseCampaignData(campaignCell)
    if (!campaignData) {
      throw new Error("Failed to parse campaign data")
    }

    const { stats } = await this.fetchCampaignSubmissions(campaignTypeId)

    const totalQuests = campaignData.quests?.length || 0
    const totalPointsAllocated = campaignData.quests?.reduce(
      (sum, quest) => sum + Number(quest.points || 0), 
      0
    ) || 0

    // Calculate points distributed based on approved submissions
    let totalPointsDistributed = 0
    for (const quest of (campaignData.quests || [])) {
      const approvedCount = quest.accepted_submission_user_type_ids?.length || 0
      totalPointsDistributed += approvedCount * Number(quest.points || 0)
    }

    const completionRate = stats.totalSubmissions > 0 
      ? (stats.approved / stats.totalSubmissions) * 100 
      : 0

    // Calculate average points per approval instead of per user
    const averagePointsPerUser = stats.approved > 0
      ? totalPointsDistributed / stats.approved
      : 0

    return {
      totalQuests,
      totalPointsAllocated,
      totalPointsDistributed,
      participantCount: stats.approved, // Use approved count as participant count
      completionRate,
      averagePointsPerUser
    }
  }

  /**
   * Get submission trends over time
   */
  async getSubmissionTrends(campaignTypeId: ccc.Hex, days: number = 7): Promise<{
    daily: Array<{ date: string, submissions: number, approvals: number }>
  }> {
    const { submissions } = await this.fetchCampaignSubmissions(campaignTypeId)
    
    // Group submissions by date
    const dailyData = new Map<string, { submissions: number, approvals: number }>()
    const now = Date.now()
    const cutoff = now - (days * 24 * 60 * 60 * 1000)

    // Initialize daily data
    for (let i = 0; i < days; i++) {
      const date = new Date(now - (i * 24 * 60 * 60 * 1000))
      const dateStr = date.toISOString().split('T')[0]
      dailyData.set(dateStr, { submissions: 0, approvals: 0 })
    }

    // Count submissions by date
    for (const [, questSubmissions] of submissions) {
      for (const submission of questSubmissions) {
        const timestamp = Number(submission.submission_timestamp)
        if (timestamp < cutoff) continue

        const date = new Date(timestamp)
        const dateStr = date.toISOString().split('T')[0]
        
        if (dailyData.has(dateStr)) {
          const data = dailyData.get(dateStr)!
          data.submissions++
          // Note: We'd need to track approval timestamps to properly count daily approvals
          // For now, this is a placeholder
        }
      }
    }

    return {
      daily: Array.from(dailyData.entries())
        .map(([date, data]) => ({ date, ...data }))
        .reverse()
    }
  }
}