// UI-specific type extensions for CKBoost dApp
// This file only defines UI-specific types that are not available from ssri-ckboost
// For types available in ssri-ckboost, import directly from the SDK

// Re-export SDK types with UI-friendly names
export type {
  ProtocolDataType as ProtocolData,
  EndorserInfoType as EndorserInfo,
  TippingProposalDataType as TippingProposalData,
  CampaignDataType as CampaignData,
  ScriptCodeHashesType as ScriptCodeHashes,
  ProtocolConfigType as ProtocolConfig,
  TippingConfigType as TippingConfig,
} from 'ssri-ckboost/types'

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
