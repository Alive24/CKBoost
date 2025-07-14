// Protocol-specific types for CKBoost admin dashboard and protocol management
// This file contains types specific to protocol operations, forms, cells, transactions, and metrics

import type {
  // UI-friendly interfaces
  Script,
  ProtocolData,
  ProtocolConfig,
  TippingConfig,
  EndorserInfo,
  TippingProposalData,
  TippingProposalMetadata,
  CampaignData,
  CampaignMetadata,
  QuestData,
  QuestSubTaskData,
  CompletionRecord,
  AssetList,
  UDTFunding,
  ScriptCodeHashes,
  UserVerificationData,
  
  // Generated molecule types (for actual blockchain data)
  ProtocolDataType,
  ProtocolConfigType,
  TippingConfigType,
  EndorserInfoType,
  TippingProposalDataType,
  TippingProposalMetadataType,
  CampaignDataType,
  CampaignMetadataType,
  QuestDataType,
  QuestSubTaskDataType,
  CompletionRecordType,
  AssetListType,
  UDTFundingType,
  ScriptCodeHashesType,
  UserVerificationDataType,
  ScriptType,
  
  // Generated molecule classes (for runtime operations)
  ProtocolDataClass,
  ProtocolConfigClass,
  TippingConfigClass,
  EndorserInfoClass,
  TippingProposalDataClass,
  TippingProposalMetadataClass,
  CampaignDataClass,
  CampaignMetadataClass,
  QuestDataClass,
  QuestSubTaskDataClass,
  CompletionRecordClass,
  AssetListClass,
  UDTFundingClass,
  ScriptCodeHashesClass,
  UserVerificationDataClass,
  ScriptClass,
  
} from './index'

// Protocol cell structure (CKB-specific) that uses generated molecule types
export interface ProtocolCell {
  outPoint: {
    txHash: string
    index: number
  }
  output: {
    capacity: string
    lock: Script
    type?: Script
  }
  data: string // Hex-encoded ProtocolData
  
  // Parsed protocol data using generated types
  parsedData?: ProtocolDataType
}

// Helper type for working with raw protocol data from blockchain
export interface ProtocolDataWithMetadata {
  // Raw molecule data
  raw: ProtocolDataType
  
  // Parsed for UI consumption
  ui: ProtocolData
  
  // Cell reference
  cell: ProtocolCell
  
  // Additional metadata
  blockNumber?: number
  timestamp?: number
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
    added: EndorserInfo[]
    updated: Array<{ index: number, endorser: EndorserInfo }>
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

// Re-export base types for convenience (single import from protocol.ts)
export type {
  // UI-friendly interfaces
  Script,
  ProtocolData,
  ProtocolConfig,
  TippingConfig,
  EndorserInfo,
  TippingProposalData,
  TippingProposalMetadata,
  CampaignData,
  CampaignMetadata,
  QuestData,
  QuestSubTaskData,
  CompletionRecord,
  AssetList,
  UDTFunding,
  ScriptCodeHashes,
  UserVerificationData,
  
  // Generated molecule types
  ProtocolDataType,
  ProtocolConfigType,
  TippingConfigType,
  EndorserInfoType,
  TippingProposalDataType,
  TippingProposalMetadataType,
  CampaignDataType,
  CampaignMetadataType,
  QuestDataType,
  QuestSubTaskDataType,
  CompletionRecordType,
  AssetListType,
  UDTFundingType,
  ScriptCodeHashesType,
  UserVerificationDataType,
  ScriptType,
  
  // Generated molecule classes
  ProtocolDataClass,
  ProtocolConfigClass,
  TippingConfigClass,
  EndorserInfoClass,
  TippingProposalDataClass,
  TippingProposalMetadataClass,
  CampaignDataClass,
  CampaignMetadataClass,
  QuestDataClass,
  QuestSubTaskDataClass,
  CompletionRecordClass,
  AssetListClass,
  UDTFundingClass,
  ScriptCodeHashesClass,
  UserVerificationDataClass,
  ScriptClass,
  
}