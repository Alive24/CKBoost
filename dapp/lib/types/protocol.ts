// Protocol-specific types for CKBoost admin dashboard and protocol management
// This file contains types specific to protocol operations, forms, cells, transactions, and metrics

// Import the generated type from ssri-ckboost
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
    index: number
  }
  output: {
    capacity: string
    lock: Script
    type: Script | null
  }
  data: string // Hex-encoded cell data that will be parsed into ProtocolDataType
  blockNumber?: number
}

// Transaction types for protocol operations
export interface ProtocolTransaction {
  txHash: string
  type: "update_config" | "approve_campaign" | "update_tipping" | "emergency"
  description: string
  status: "pending" | "confirmed" | "failed"
  timestamp: string
  blockNumber?: number
}

// Platform metrics derived from protocol data
export interface ProtocolMetrics {
  totalCampaigns: number
  activeCampaigns: number
  totalTippingProposals: number
  pendingTippingProposals: number
  totalEndorsers: number
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
  approvalRequirementThresholds: string[]
  expirationDuration: number
}

export interface AddEndorserForm {
  endorserAddress: string
  endorserLockScript: Script
  endorserLockHash?: string // Computed lock hash
  endorserName: string
  endorserDescription: string
}

export interface EditEndorserForm extends AddEndorserForm {
  index: number // Index in the endorsersWhitelist array
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
    updated: Array<{ index: number, endorser: any }>
    removed: number[] // indices of removed endorsers
  }
}

export interface BatchUpdateProtocolForm {
  protocolConfig?: UpdateProtocolConfigForm
  scriptCodeHashes?: UpdateScriptCodeHashesForm
  tippingConfig?: UpdateTippingConfigForm
  endorserOperations?: {
    add?: AddEndorserForm[]
    edit?: EditEndorserForm[]
    remove?: number[]
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
  removeEndorser: (index: number) => Promise<void>
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