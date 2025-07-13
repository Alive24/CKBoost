// Protocol cell management types for CKBoost admin dashboard
// These types define protocol-level configuration and management based on ProtocolData schema

// CKB script definition
export interface Script {
  codeHash: string
  hashType: "type" | "data" | "data1"
  args: string
}

// Protocol cell structure
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
}

// EndorserInfo structure from Molecule schema
export interface EndorserInfo {
  endorserLockHash: string // Byte32 - the storage format
  endorserName: string // Bytes
  endorserDescription: string // Bytes
}

// Parsed ProtocolData structure from Molecule schema
export interface ProtocolData {
  campaignsApproved: CampaignData[]
  tippingProposals: TippingProposalData[]
  tippingConfig: TippingConfig
  endorsersWhitelist: EndorserInfo[]
  lastUpdated: number // Uint64 timestamp
  protocolConfig: ProtocolConfig
}

export interface CampaignData {
  id: string // Byte32
  creator: Script
  metadata: CampaignMetadata
  status: number // 0=created, 1=funding, 2=reviewing, 3=approved, 4=active, 5=completed
  quests: QuestData[]
}

export interface CampaignMetadata {
  fundingInfo: AssetList[]
  createdAt: number // Uint64
  startingTime: number // Uint64
  endingTime: number // Uint64
  verificationRequirements: number // 0=none, 1=telegram, 2=identity
  lastUpdated: number // Uint64
}

export interface AssetList {
  ckbAmount: number // Uint64
  nftAssets: Script[]
  udtAssets: UDTFunding[]
}

export interface UDTFunding {
  udtScript: Script
  amount: string // Uint128
}

export interface QuestData {
  id: string // Byte32
  campaignId: string // Byte32
  requirements: string // Bytes
  rewardsOnCompletion: AssetList[]
  completionRecords: CompletionRecord[]
  completionDeadline: number // Uint64
  status: number // 0=created, 1=active, 2=completed, 3=cancelled
  subTasks: QuestSubTaskData[]
}

export interface QuestSubTaskData {
  id: number // Uint8
  title: string // Bytes
  type: string // Bytes - text, link, txhash
  description: string // Bytes
}

export interface CompletionRecord {
  userAddress: string // Bytes
  subTaskId: number // Uint8
  completionTimestamp: number // Uint64
  completionContent: string // Bytes
}

export interface TippingProposalData {
  targetAddress: string // Bytes
  proposerLockHash: string // Byte32
  metadata: TippingProposalMetadata
  amount: number // Uint64
  tippingTransactionHash?: string // Byte32Opt
  approvalTransactionHash: string[] // Byte32Vec
}

export interface TippingProposalMetadata {
  contributionTitle: string // Bytes
  contributionTypeTags: string[] // BytesVec
  description: string // Bytes
  proposalCreationTimestamp: number // Uint64
}

export interface TippingConfig {
  approvalRequirementThresholds: string[] // Uint128Vec
  expirationDuration: number // Uint64
}

export interface ProtocolConfig {
  adminLockHashVec: string[] // Byte32Vec
  scriptCodeHashes: ScriptCodeHashes
}

export interface ScriptCodeHashes {
  ckbBoostProtocolTypeCodeHash: string // Byte32
  ckbBoostProtocolLockCodeHash: string // Byte32
  ckbBoostCampaignTypeCodeHash: string // Byte32
  ckbBoostCampaignLockCodeHash: string // Byte32
  ckbBoostUserTypeCodeHash: string // Byte32
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

// Change tracking types
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