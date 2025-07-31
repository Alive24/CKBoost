// UI-specific type extensions for CKBoost dApp
// This file contains ONLY UI-specific types that are not available from ssri-ckboost
// For blockchain types, import directly from ssri-ckboost/types in your files

// UI-specific protocol metrics
export interface ProtocolMetrics {
  totalCampaigns: bigint
  activeCampaigns: bigint
  totalTippingProposals: bigint
  pendingTippingProposals: bigint
  totalEndorsers: bigint
  lastUpdated: string // ISO date string
}

// Form-specific types for UI forms
export interface ProtocolUpdateForm {
  adminLockHashes: string[]
  tippingThresholds: string[]
  expirationDuration: number
  endorsers: Array<{
    lockHash: string
    name: string
    description: string
  }>
}

// Transaction status for UI display
export interface TransactionStatus {
  hash: string
  status: 'pending' | 'confirmed' | 'failed'
  confirmations: number
  timestamp: number
}
