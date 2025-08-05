// Protocol-specific types for CKBoost admin dashboard and protocol management
// This file contains ONLY UI-specific types that are not available in ssri-ckboost

import { ccc } from '@ckb-ccc/core'
import { CampaignDataLike, EndorserInfoLike, ProtocolDataLike, ScriptCodeHashesLike, TippingConfigLike, TippingProposalDataLike } from 'ssri-ckboost/types'

// Transaction status tracking for UI

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

export interface ProtocolTransaction {
  txHash: string
  type: "update_config" | "approve_campaign" | "update_tipping" | "emergency"
  description: string
  status: "pending" | "confirmed" | "failed"
  timestamp: string
  blockNumber?: ccc.Num
}

// Platform metrics derived from protocol data
export interface ProtocolMetrics {
  totalCampaigns: ccc.Num
  activeCampaigns: ccc.Num
  totalTippingProposals: ccc.Num
  pendingTippingProposals: ccc.Num
  totalEndorsers: ccc.Num
  lastUpdated: string
}

// Change tracking types for protocol updates
export interface FieldChange<T = unknown> {
  fieldPath: string
  oldValue: T
  newValue: T
  hasChanged: boolean
}

export interface ProtocolChanges {
  protocolConfig: {
    adminLockHashes: FieldChange<string[]>
  }
  scriptCodeHashes: {
    ckbBoostProtocolTypeCodeHash: FieldChange<string>
    ckbBoostProtocolLockCodeHash: FieldChange<string>
    ckbBoostCampaignTypeCodeHash: FieldChange<string>
    ckbBoostCampaignLockCodeHash: FieldChange<string>
    ckbBoostUserTypeCodeHash: FieldChange<string>
  }
  tippingConfig: {
    approvalRequirementThresholds: FieldChange<string[]>
    expirationDuration: FieldChange<number>
  }
  endorsers: {
    added: EndorserInfoLike[]
    updated: Array<{ index: ccc.Num, endorser: EndorserInfoLike }>
    removed: ccc.Num[] // indices of removed endorsers
  }
}

// Protocol context types
export interface ProtocolContextType {
  // Protocol data
  protocolData: ProtocolDataLike | null
  
  // Protocol metrics
  metrics: ProtocolMetrics | null
  
  // Transaction history
  transactions: ProtocolTransaction[]
  
  // Loading and error states
  isLoading: boolean
  error: string | null
  
  // Update functions
  updateProtocolConfig: (adminLockHashes: string[]) => Promise<void>
  updateScriptCodeHashes: (codeHashes: ScriptCodeHashesLike) => Promise<void>
  updateTippingConfig: (config: TippingConfigLike) => Promise<void>
  addEndorser: (endorser: EndorserInfoLike) => Promise<void>
  editEndorser: (index: ccc.Num, endorser: EndorserInfoLike) => Promise<void>
  removeEndorser: (index: ccc.Num) => Promise<void>
  batchUpdateProtocol: (data: Partial<ProtocolDataLike>) => Promise<void>
  
  // Query functions
  getEndorser: (lockHash: string) => EndorserInfoLike | undefined
  getTippingProposal: (id: string) => TippingProposalDataLike | undefined
  getApprovedCampaign: (id: string) => CampaignDataLike | undefined
  
  // Change detection
  detectChanges: (formData: unknown) => ProtocolChanges
  
  // Wallet connection
  walletAddress: string | null
  isWalletConnected: boolean
  userAddress: string | null
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
}