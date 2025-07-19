// Campaign-specific types for CKBoost campaign management and UI
// This file contains types specific to campaign operations, UI components, and user interactions

// Import types from ssri-ckboost SDK
import type {
  CampaignDataType,
  CampaignMetadataType,
  QuestDataType,
  QuestSubTaskDataType,
  CompletionRecordType,
  AssetListType,
  UDTFundingType,
  ScriptType,
  SponsorInfoType,
  UserProgressDataType,
  TokenRewardInfoType,
} from 'ssri-ckboost/types'

// UI-specific campaign types that extend the base campaign data
export interface TokenReward {
  symbol: string
  amount: number
}

export interface VerificationRequirements {
  telegram?: boolean
  kyc?: boolean
  did?: boolean
  manualReview?: boolean
  excludeManualReview?: boolean
  twitter?: boolean
  discord?: boolean
  reddit?: boolean
}

export interface Sponsor {
  name: string
  logo: string
  verified: boolean
  description: string
  website: string
  social: {
    twitter: string
    github: string
  }
}

export interface Subtask {
  id: number
  title: string
  type: string
  completed: boolean
  description: string
  proofRequired: string
}

export interface Quest {
  id: number
  title: string
  description: string
  points: number
  difficulty: string
  timeEstimate: string
  icon: string
  completions: number
  rewards: {
    points: number
    tokens: TokenReward[]
  }
  subtasks: Subtask[]
}

export interface Campaign {
  id: number
  title: string
  shortDescription: string // For campaign cards
  longDescription: string  // For detail page
  sponsor: Sponsor
  totalRewards: {
    points: number
    tokens: TokenReward[]
  }
  participants: number
  questsCount: number
  questsCompleted: number
  startDate: string
  endDate: string
  status: string
  difficulty: string
  categories: string[]
  image: string
  verificationRequirements: VerificationRequirements
  rules: string[]          // Campaign rules
  quests: Quest[]          // Campaign quests
  completedQuests: number  // Total quest completions across all participants
}

// User progress tracking
export interface UserProgress {
  campaignId: number
  completedQuests: number[]
  totalRewards: number
  lastActivity: string
}

// CKB blockchain specific types for campaigns that use generated molecule types
export interface CKBCampaignCell {
  outPoint: {
    txHash: string
    index: number
  }
  output: {
    capacity: string
    lock: {
      codeHash: string
      hashType: string
      args: string
    }
    type?: {
      codeHash: string
      hashType: string
      args: string
    }
  }
  data: string // Hex-encoded campaign data
  
  // Parsed campaign data using generated types
  parsedData?: CampaignDataType
}

// Helper type for working with raw campaign data from blockchain
export interface CampaignDataWithMetadata {
  // Raw molecule data
  raw: CampaignDataType
  
  // Parsed for UI consumption
  ui: Campaign // Using the Campaign interface defined above
  
  // Cell reference
  cell: CKBCampaignCell
}

export interface CKBUserProgressCell {
  outPoint: {
    txHash: string
    index: number
  }
  output: {
    capacity: string
    lock: {
      codeHash: string
      hashType: string
      args: string
    }
    type?: {
      codeHash: string
      hashType: string
      args: string
    }
  }
  data: string // Hex-encoded user progress data
}

