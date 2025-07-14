// Centralized base type exports for CKBoost dApp
// This file re-exports generated molecule types and extends them with UI-specific interfaces

// Import generated Molecule types
export type {
  // Core generated types
  ScriptType,
  ProtocolDataType,
  ProtocolConfigType,
  TippingConfigType,
  EndorserInfoType,
  TippingProposalDataType,
  TippingProposalMetadataType,
  ScriptCodeHashesType,
  CampaignDataType,
  CampaignMetadataType,
  QuestDataType,
  QuestSubTaskDataType,
  CompletionRecordType,
  AssetListType,
  UDTFundingType,
  UserVerificationDataType,
  
  // Vector types
  EndorserInfoVecType,
  CampaignDataVecType,
  QuestDataVecType,
  TippingProposalDataVecType,
  AssetListVecType,
  UDTFundingVecType,
  QuestSubTaskDataVecType,
  CompletionRecordVecType,
  ScriptVecType,
  
  // Core molecule classes (for runtime usage)
  Script as ScriptClass,
  ProtocolData as ProtocolDataClass,
  ProtocolConfig as ProtocolConfigClass,
  TippingConfig as TippingConfigClass,
  EndorserInfo as EndorserInfoClass,
  TippingProposalData as TippingProposalDataClass,
  TippingProposalMetadata as TippingProposalMetadataClass,
  ScriptCodeHashes as ScriptCodeHashesClass,
  CampaignData as CampaignDataClass,
  CampaignMetadata as CampaignMetadataClass,
  QuestData as QuestDataClass,
  QuestSubTaskData as QuestSubTaskDataClass,
  CompletionRecord as CompletionRecordClass,
  AssetList as AssetListClass,
  UDTFunding as UDTFundingClass,
  UserVerificationData as UserVerificationDataClass,
} from '../generated'

// Base CKB Script interface (simplified for UI usage)
export interface Script {
  codeHash: string
  hashType: string
  args: string
}

// UI-friendly interfaces that extend generated types with convenience fields
// These are simplified versions of the generated types for easier UI usage

export interface ProtocolConfig {
  adminLockHashVec: string[]
  scriptCodeHashes: ScriptCodeHashes
}

export interface ScriptCodeHashes {
  ckbBoostProtocolTypeCodeHash: string
  ckbBoostProtocolLockCodeHash: string
  ckbBoostCampaignTypeCodeHash: string
  ckbBoostCampaignLockCodeHash: string
  ckbBoostUserTypeCodeHash: string
}

export interface TippingConfig {
  approvalRequirementThresholds: string[]
  expirationDuration: number
}

export interface EndorserInfo {
  endorserLockHash: string
  endorserName: string
  endorserDescription: string
  endorserAddress?: string // UI-specific field
}

export interface TippingProposalMetadata {
  contributionTitle: string
  contributionTypeTags: string[]
  description: string
  proposalCreationTimestamp: number
}

export interface TippingProposalData {
  targetAddress: string
  proposerLockHash: string
  metadata: TippingProposalMetadata
  amount: number
  tippingTransactionHash?: string
  approvalTransactionHash: string[]
}

export interface CampaignMetadata {
  fundingInfo: AssetList[]
  createdAt: number
  startingTime: number
  endingTime: number
  verificationRequirements: number
  lastUpdated: number
}

export interface CampaignData {
  id: string
  creator: Script
  metadata: CampaignMetadata
  status: number
  quests: QuestData[]
}

export interface QuestSubTaskData {
  id: number
  title: string
  type: string
  description: string
}

export interface CompletionRecord {
  userAddress: string
  subTaskId: number
  completionTimestamp: number
  completionContent: string
}

export interface QuestData {
  id: string
  campaignId: string
  requirements: string
  rewardsOnCompletion: AssetList[]
  completionRecords: CompletionRecord[]
  completionDeadline: number
  status: number
  subTasks: QuestSubTaskData[]
}

export interface AssetList {
  ckbAmount: number
  nftAssets: Script[]
  udtAssets: UDTFunding[]
}

export interface UDTFunding {
  udtScript: Script
  amount: number
}

export interface UserVerificationData {
  userAddress: string
  telegramPersonalChatId: number
  identityVerificationData: string
}

export interface ProtocolData {
  campaignsApproved: CampaignData[]
  tippingProposals: TippingProposalData[]
  tippingConfig: TippingConfig
  endorsersWhitelist: EndorserInfo[]
  lastUpdated: number
  protocolConfig: ProtocolConfig
}
