// Display utilities and helper functions for CKBoost dApp
// This file provides utility functions to work with ssri-ckboost types
// Use the Like types from ssri-ckboost/types directly in your components

import { ccc } from "@ckb-ccc/core"
import type { 
  CampaignDataLike, 
  QuestDataLike, 
} from 'ssri-ckboost/types'

// Transaction status for UI display (this is UI-only, not stored in schema)
export interface TransactionStatus {
  hash: string
  status: 'pending' | 'confirmed' | 'failed'
  confirmations: number
  timestamp: number
}

// Re-export the schema types for convenience
export type { 
  CampaignDataLike, 
  QuestDataLike, 
  QuestSubTaskDataLike,
  AssetListLike,
  UDTAssetLike,
  EndorserInfoLike,
  CampaignMetadataLike,
} from 'ssri-ckboost/types'

// Display helpers for numeric difficulty values
export function getDifficultyString(difficulty: ccc.NumLike): string {
  const num = Number(difficulty)
  switch (num) {
    case 1: return 'Easy'
    case 2: return 'Medium'
    case 3: return 'Hard'
    default: return 'Unknown'
  }
}

// Display helper for campaign status based on dates
export function getCampaignStatus(startTime: ccc.NumLike, endTime: ccc.NumLike): string {
  const now = Date.now()
  const start = Number(startTime)
  const end = Number(endTime)
  
  if (now < start) return 'upcoming'
  if (now >= start && now <= end) return 'active'
  return 'completed'
}

// Helper to decode verification requirements bitmask
export function decodeVerificationRequirements(bitmask: ccc.NumLike): Record<string, boolean> {
  const mask = Number(bitmask)
  return {
    telegram: (mask & (1 << 0)) !== 0,
    kyc: (mask & (1 << 1)) !== 0,
    did: (mask & (1 << 2)) !== 0,
    manualReview: (mask & (1 << 3)) !== 0,
    twitter: (mask & (1 << 4)) !== 0,
    discord: (mask & (1 << 5)) !== 0,
    reddit: (mask & (1 << 6)) !== 0
  }
}

// Helper to encode verification requirements to bitmask
export function encodeVerificationRequirements(requirements: Record<string, boolean>): number {
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

// Helper to get total rewards from a campaign's quests
export function calculateCampaignTotalRewards(campaign: CampaignDataLike): {
  points: ccc.Num
  tokens: Array<{ symbol: string; amount: ccc.Num }>
} {
  let totalPoints = ccc.numFrom(0)
  const tokenRewards = new Map<string, ccc.Num>()
  
  campaign.quests?.forEach(quest => {
    totalPoints = ccc.numFrom(Number(totalPoints) + Number(quest.points))
    quest.rewards_on_completion?.forEach(assetList => {
      assetList.udt_assets?.forEach(udtAsset => {
        const symbol = 'CKB' // TODO: Resolve symbol from UDT type script
        const current = tokenRewards.get(symbol) || ccc.numFrom(0)
        tokenRewards.set(symbol, ccc.numFrom(Number(current) + Number(udtAsset.amount)))
      })
    })
  })

  return {
    points: totalPoints,
    tokens: Array.from(tokenRewards.entries()).map(([symbol, amount]) => ({
      symbol,
      amount
    }))
  }
}

// Helper to get quest rewards in display format
export function getQuestRewards(quest: QuestDataLike): {
  points: ccc.Num
  tokens: Array<{ symbol: string; amount: ccc.Num }>
} {
  const tokens: Array<{ symbol: string; amount: ccc.Num }> = []
  
  quest.rewards_on_completion?.forEach(assetList => {
    assetList.udt_assets?.forEach(udtAsset => {
      tokens.push({
        symbol: 'CKB', // TODO: Resolve symbol from UDT type script
        amount: ccc.numFrom(udtAsset.amount)
      })
    })
  })

  return {
    points: ccc.numFrom(quest.points),
    tokens
  }
}

// Helper to format timestamps for display
export function formatTimestamp(timestamp: ccc.NumLike): string {
  return new Date(Number(timestamp)).toISOString()
}

// Helper to get time estimate display string
export function getTimeEstimateString(minutes: ccc.NumLike): string {
  const mins = Number(minutes)
  if (mins < 60) return `${mins} mins`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
}

// Icon mappings for quests (purely UI, not stored in schema)
export function getQuestIcon(questTitle: string): string {
  // Simple icon mapping based on quest title or category
  const titleLower = questTitle.toLowerCase()
  
  if (titleLower.includes('social') || titleLower.includes('twitter') || titleLower.includes('x')) return '📢'
  if (titleLower.includes('deploy') || titleLower.includes('contract')) return '🚀'
  if (titleLower.includes('test') || titleLower.includes('verify')) return '🧪'
  if (titleLower.includes('write') || titleLower.includes('document')) return '📝'
  if (titleLower.includes('video') || titleLower.includes('tutorial')) return '🎥'
  if (titleLower.includes('community') || titleLower.includes('engage')) return '👥'
  
  // Default icon
  return '🎯'
}

// // Helper to check if a subtask is marked as completed in completion records
// export function isSubtaskCompleted(
//   subtaskId: number, 
//   completionRecords: UserSubmissionRecordLike[] | undefined
// ): boolean {
//   if (!completionRecords) return false
//   return completionRecords.some(record => Number(record.sub_task_id) === subtaskId)
// }

// Create a mock Campaign type hash from a numeric ID (for development only)
export function generateMockTypeHash(id: number): string {
  return `0x${id.toString(16).padStart(64, '0')}`
}

// Helper to get display-friendly status for quests
export function getQuestStatus(quest: QuestDataLike): string {
  const status = Number(quest.status)
  switch (status) {
    case 0: return 'draft'
    case 1: return 'active'
    case 2: return 'completed'
    case 3: return 'cancelled'
    default: return 'unknown'
  }
}

