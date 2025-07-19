// Re-export types from generated files with better organization
// This provides a clean interface for the SDK types

// Import everything from generated
import type {
  ProtocolDataType as GeneratedProtocolDataType,
  ProtocolConfigType as GeneratedProtocolConfigType,
  TippingConfigType as GeneratedTippingConfigType,
  EndorserInfoType as GeneratedEndorserInfoType,
  TippingProposalDataType as GeneratedTippingProposalDataType,
  CampaignDataType as GeneratedCampaignDataType,
  ScriptCodeHashesType as GeneratedScriptCodeHashesType,
  QuestDataType as GeneratedQuestDataType,
  QuestSubTaskDataType as GeneratedQuestSubTaskDataType,
  CompletionRecordType as GeneratedCompletionRecordType,
  CampaignMetadataType as GeneratedCampaignMetadataType,
  AssetListType as GeneratedAssetListType,
  UDTFundingType as GeneratedUDTFundingType,
  ScriptType as GeneratedScriptType,
  SponsorInfoType as GeneratedSponsorInfoType,
  UserProgressDataType as GeneratedUserProgressDataType,
  TokenRewardInfoType as GeneratedTokenRewardInfoType,
  TippingProposalMetadataType as GeneratedTippingProposalMetadataType,
  UserVerificationDataType as GeneratedUserVerificationDataType
} from "../generated";

// Re-export with cleaner names for SDK users
export type ProtocolDataType = GeneratedProtocolDataType;
export type ProtocolConfigType = GeneratedProtocolConfigType;
export type TippingConfigType = GeneratedTippingConfigType;
export type EndorserInfoType = GeneratedEndorserInfoType;
export type TippingProposalDataType = GeneratedTippingProposalDataType;
export type CampaignDataType = GeneratedCampaignDataType;
export type ScriptCodeHashesType = GeneratedScriptCodeHashesType;
export type QuestDataType = GeneratedQuestDataType;
export type QuestSubTaskDataType = GeneratedQuestSubTaskDataType;
export type CompletionRecordType = GeneratedCompletionRecordType;
export type CampaignMetadataType = GeneratedCampaignMetadataType;
export type AssetListType = GeneratedAssetListType;
export type UDTFundingType = GeneratedUDTFundingType;
export type ScriptType = GeneratedScriptType;
export type SponsorInfoType = GeneratedSponsorInfoType;
export type UserProgressDataType = GeneratedUserProgressDataType;
export type TokenRewardInfoType = GeneratedTokenRewardInfoType;
export type TippingProposalMetadataType = GeneratedTippingProposalMetadataType;
export type UserVerificationDataType = GeneratedUserVerificationDataType;

// SDK-specific interfaces that provide a more user-friendly API
// These use camelCase and more intuitive names

export interface ProtocolDataInput {
  campaignsApproved?: CampaignDataType[];
  tippingProposals?: TippingProposalDataType[];
  tippingConfig: TippingConfigInput;
  endorsersWhitelist?: EndorserInfoInput[];
  lastUpdated?: number;
  protocolConfig: ProtocolConfigInput;
}

export interface TippingConfigInput {
  approvalRequirementThresholds: (string | number | bigint)[];
  expirationDuration: number;
}

export interface ProtocolConfigInput {
  adminLockHashes: string[];
  scriptCodeHashes: ScriptCodeHashesInput;
}

export interface ScriptCodeHashesInput {
  ckbBoostProtocolTypeCodeHash: string;
  ckbBoostProtocolLockCodeHash: string;
  ckbBoostCampaignTypeCodeHash: string;
  ckbBoostCampaignLockCodeHash: string;
  ckbBoostUserTypeCodeHash: string;
  acceptedUdtTypeCodeHashes?: string[];
  acceptedDobTypeCodeHashes?: string[];
}

export interface EndorserInfoInput {
  lockHash: string;
  name: string;
  description: string;
}

// Type guards
export function isProtocolDataType(data: any): data is ProtocolDataType {
  return data && 
    'campaigns_approved' in data &&
    'tipping_proposals' in data &&
    'tipping_config' in data &&
    'endorsers_whitelist' in data &&
    'last_updated' in data &&
    'protocol_config' in data;
}