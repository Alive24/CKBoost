// Protocol-specific types for CKBoost admin dashboard and protocol management
// This file contains types specific to protocol operations, forms, cells, transactions, and metrics

// Import the generated type from ssri-ckboost
import { ccc, mol } from '@ckb-ccc/connector-react'
import type { types } from 'ssri-ckboost'


// Basic Script interface for UI usage
export interface Script {
  codeHash: string
  hashType: string
  args: string
}

// Protocol cell structure (CKB-specific)
export interface ProtocolCell {
  outPoint: {
    txHash: string
    index: ccc.Num
  }
  output: {
    capacity: string
    lock: Script
    type: Script | null
  }
  data: string // Hex-encoded cell data that will be parsed into ProtocolDataType
  blockNumber?: ccc.Num
}

// Transaction types for protocol operations
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

// Form data types for protocol management
export interface UpdateProtocolConfigForm {
  adminLockHashes: string[]
}

export interface UpdateScriptCodeHashesForm {
  ckbBoostProtocolTypeCodeHash: string
  ckbBoostProtocolLockCodeHash: string
  ckbBoostCampaignTypeCodeHash: string
  ckbBoostCampaignLockCodeHash: string
  ckbBoostUserTypeCodeHash: string
}

export interface UpdateTippingConfigForm {
  approvalRequirementThresholds: ccc.Num[]
  expirationDuration: ccc.Num
}

export interface AddEndorserForm {
  endorserAddress: string
  endorserLockScript: Script
  endorserLockHash?: string // Computed lock hash
  endorserName: string
  endorserDescription: string
  website?: string
  socialLinks?: string[]
  verified?: number
}

export interface EditEndorserForm extends AddEndorserForm {
  index: ccc.Num // Index in the endorsersWhitelist array
}

// Change tracking types for protocol updates
export interface FieldChange<T = any> {
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
    added: any[] // Will be properly typed when SDK exports are fixed
    updated: Array<{ index: ccc.Num, endorser: any }>
    removed: ccc.Num[] // indices of removed endorsers
  }
}

export interface BatchUpdateProtocolForm {
  protocolConfig?: UpdateProtocolConfigForm
  scriptCodeHashes?: UpdateScriptCodeHashesForm
  tippingConfig?: UpdateTippingConfigForm
  endorserOperations?: {
    add?: AddEndorserForm[]
    edit?: EditEndorserForm[]
    remove?: ccc.Num[]
  }
}

// Protocol context types
export interface ProtocolContextType {
  // Protocol data
  protocolData: any | null // Will be properly typed when SDK exports are fixed
  
  // Protocol metrics
  metrics: ProtocolMetrics | null
  
  // Transaction history
  transactions: ProtocolTransaction[]
  
  // Loading and error states
  isLoading: boolean
  error: string | null
  
  // Update functions
  updateProtocolConfig: (form: UpdateProtocolConfigForm) => Promise<void>
  updateScriptCodeHashes: (form: UpdateScriptCodeHashesForm) => Promise<void>
  updateTippingConfig: (form: UpdateTippingConfigForm) => Promise<void>
  addEndorser: (form: AddEndorserForm) => Promise<void>
  editEndorser: (form: EditEndorserForm) => Promise<void>
  removeEndorser: (index: ccc.Num) => Promise<void>
  batchUpdateProtocol: (form: BatchUpdateProtocolForm) => Promise<void>
  
  // Query functions
  getEndorser: (lockHash: string) => any | undefined
  getTippingProposal: (id: string) => any | undefined
  getApprovedCampaign: (id: string) => any | undefined
  
  // Change detection
  detectChanges: (formData: any) => ProtocolChanges
  
  // Wallet connection
  walletAddress: string | null
  isWalletConnected: boolean
  userAddress: string | null
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
}