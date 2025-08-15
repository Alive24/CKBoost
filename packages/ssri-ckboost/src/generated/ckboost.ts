// Auto-generated TypeScript types for CKBoost molecule schema
// This file uses CCC and mol types directly where available

import { mol, ccc } from "@ckb-ccc/core";

// CKBoost molecule codec implementations
export const BytesOptVec = mol.vector(mol.BytesOpt);
export const ProposalShortId = mol.array(mol.Uint8, 10);
export const ProposalShortIdVec = mol.vector(ProposalShortId);
export const RawHeader = mol.struct({
  version: mol.Uint32,
  compact_target: mol.Uint32,
  timestamp: mol.Uint64,
  number: mol.Uint64,
  epoch: mol.Uint64,
  parent_hash: mol.Byte32,
  transactions_root: mol.Byte32,
  proposals_hash: mol.Byte32,
  extra_hash: mol.Byte32,
  dao: mol.Byte32
});
export const CellbaseWitness = mol.table({
  lock: ccc.Script,
  message: mol.Bytes
});
export const StringVec = mol.vector(mol.String);
export const UDTAsset = mol.table({
  udt_script: ccc.Script,
  amount: mol.Uint128
});
export const UDTAssetVec = mol.vector(UDTAsset);
export const AssetList = mol.table({
  points_amount: mol.Uint64,
  ckb_amount: mol.Uint64,
  nft_assets: mol.vector(ccc.Script),
  udt_assets: UDTAssetVec
});
export const AssetListVec = mol.vector(AssetList);
export const QuestSubTaskData = mol.table({
  id: mol.Uint8,
  title: mol.String,
  type: mol.String,
  description: mol.String,
  proof_required: mol.String
});
export const QuestSubTaskDataVec = mol.vector(QuestSubTaskData);
export const QuestMetadata = mol.table({
  title: mol.String,
  short_description: mol.String,
  long_description: mol.String,
  requirements: mol.String,
  difficulty: mol.Uint8,
  time_estimate: mol.Uint32
});
export const QuestData = mol.table({
  quest_id: mol.Uint32,
  metadata: QuestMetadata,
  rewards_on_completion: AssetListVec,
  accepted_submission_user_type_ids: mol.Byte32Vec,
  completion_deadline: mol.Uint64,
  status: mol.Uint8,
  sub_tasks: QuestSubTaskDataVec,
  points: mol.Uint32,
  completion_count: mol.Uint32
});
export const QuestDataVec = mol.vector(QuestData);
export const EndorserInfo = mol.table({
  endorser_lock_hash: mol.Byte32,
  endorser_name: mol.String,
  endorser_description: mol.String,
  website: mol.String,
  social_links: mol.vector(mol.String),
  verified: mol.Uint8
});
export const CampaignMetadata = mol.table({
  title: mol.String,
  endorser_info: EndorserInfo,
  short_description: mol.String,
  long_description: mol.String,
  total_rewards: AssetList,
  verification_requirements: mol.Uint8Vec,
  last_updated: mol.Uint64,
  categories: mol.vector(mol.String),
  difficulty: mol.Uint8,
  image_url: mol.String
});
export const CampaignData = mol.table({
  endorser: EndorserInfo,
  created_at: mol.Uint64,
  starting_time: mol.Uint64,
  ending_time: mol.Uint64,
  rules: mol.vector(mol.String),
  metadata: CampaignMetadata,
  status: mol.Uint8,
  quests: QuestDataVec,
  participants_count: mol.Uint32,
  total_completions: mol.Uint32
});
export const CampaignDataVec = mol.vector(CampaignData);
export const TippingProposalMetadata = mol.table({
  contribution_title: mol.String,
  contribution_type_tags: mol.vector(mol.String),
  description: mol.String,
  proposal_creation_timestamp: mol.Uint64
});
export const TippingProposalData = mol.table({
  target_address: mol.String,
  proposer_lock_hash: mol.Byte32,
  metadata: TippingProposalMetadata,
  amount: mol.Uint64,
  tipping_transaction_hash: mol.Byte32Opt,
  approval_transaction_hash: mol.Byte32Vec
});
export const TippingProposalDataVec = mol.vector(TippingProposalData);
export const EndorserInfoVec = mol.vector(EndorserInfo);
export const TippingConfig = mol.table({
  approval_requirement_thresholds: mol.Uint128Vec,
  expiration_duration: mol.Uint64
});
export const ScriptCodeHashes = mol.table({
  ckb_boost_protocol_type_code_hash: mol.Byte32,
  ckb_boost_protocol_lock_code_hash: mol.Byte32,
  ckb_boost_campaign_type_code_hash: mol.Byte32,
  ckb_boost_campaign_lock_code_hash: mol.Byte32,
  ckb_boost_user_type_code_hash: mol.Byte32,
  ckb_boost_points_udt_type_code_hash: mol.Byte32,
  accepted_udt_type_scripts: mol.vector(ccc.Script),
  accepted_dob_type_scripts: mol.vector(ccc.Script)
});
export const ProtocolConfig = mol.table({
  admin_lock_hash_vec: mol.Byte32Vec,
  script_code_hashes: ScriptCodeHashes
});
export const ProtocolData = mol.table({
  campaigns_approved: mol.Byte32Vec,
  tipping_proposals: TippingProposalDataVec,
  tipping_config: TippingConfig,
  endorsers_whitelist: EndorserInfoVec,
  last_updated: mol.Uint64,
  protocol_config: ProtocolConfig
});
export const UserVerificationData = mol.table({
  telegram_personal_chat_id: mol.Uint128,
  identity_verification_data: mol.Bytes
});
export const UserSubmissionRecord = mol.table({
  campaign_type_id: mol.Byte32,
  quest_id: mol.Uint32,
  submission_timestamp: mol.Uint64,
  submission_content: mol.String
});
export const UserSubmissionRecordVec = mol.vector(UserSubmissionRecord);
export const UserData = mol.table({
  verification_data: UserVerificationData,
  total_points_earned: mol.Uint32,
  last_activity_timestamp: mol.Uint64,
  submission_records: UserSubmissionRecordVec
});
export const ConnectedTypeID = mol.table({
  type_id: mol.Byte32,
  connected_key: mol.Byte32
});

// CKB client block type aliases
export type Header = ccc.ClientBlockHeaderLike;
export type UncleBlock = ccc.ClientBlockUncleLike;
export type UncleBlockVec = UncleBlock[];

// "Like" types for flexible input (similar to CCC pattern)
export interface RawHeaderLike {
  version: ccc.NumLike;
  compact_target: ccc.NumLike;
  timestamp: ccc.NumLike;
  number: ccc.NumLike;
  epoch: ccc.NumLike;
  parent_hash: ccc.HexLike;
  transactions_root: ccc.HexLike;
  proposals_hash: ccc.HexLike;
  extra_hash: ccc.HexLike;
  dao: ccc.HexLike;
}

export interface CellbaseWitnessLike {
  lock: ccc.ScriptLike;
  message: ccc.BytesLike;
}

export interface UDTAssetLike {
  udt_script: ccc.ScriptLike;
  amount: ccc.NumLike;
}

export interface AssetListLike {
  points_amount: ccc.NumLike;
  ckb_amount: ccc.NumLike;
  nft_assets: ccc.ScriptLike[];
  udt_assets: UDTAssetLike[];
}

export interface QuestSubTaskDataLike {
  id: ccc.NumLike;
  title: string;
  type: string;
  description: string;
  proof_required: string;
}

export interface QuestMetadataLike {
  title: string;
  short_description: string;
  long_description: string;
  requirements: string;
  difficulty: ccc.NumLike;
  time_estimate: ccc.NumLike;
}

export interface QuestDataLike {
  quest_id: ccc.NumLike;
  metadata: QuestMetadataLike;
  rewards_on_completion: AssetListLike[];
  accepted_submission_user_type_ids: ccc.HexLike[];
  completion_deadline: ccc.NumLike;
  status: ccc.NumLike;
  sub_tasks: QuestSubTaskDataLike[];
  points: ccc.NumLike;
  completion_count: ccc.NumLike;
}

export interface CampaignMetadataLike {
  title: string;
  endorser_info: EndorserInfoLike;
  short_description: string;
  long_description: string;
  total_rewards: AssetListLike;
  verification_requirements: ccc.NumLike[];
  last_updated: ccc.NumLike;
  categories: string[];
  difficulty: ccc.NumLike;
  image_url: string;
}

export interface CampaignDataLike {
  endorser: EndorserInfoLike;
  created_at: ccc.NumLike;
  starting_time: ccc.NumLike;
  ending_time: ccc.NumLike;
  rules: string[];
  metadata: CampaignMetadataLike;
  status: ccc.NumLike;
  quests: QuestDataLike[];
  participants_count: ccc.NumLike;
  total_completions: ccc.NumLike;
}

export interface TippingProposalMetadataLike {
  contribution_title: string;
  contribution_type_tags: string[];
  description: string;
  proposal_creation_timestamp: ccc.NumLike;
}

export interface TippingProposalDataLike {
  target_address: string;
  proposer_lock_hash: ccc.HexLike;
  metadata: TippingProposalMetadataLike;
  amount: ccc.NumLike;
  tipping_transaction_hash: ccc.HexLike | null;
  approval_transaction_hash: ccc.HexLike[];
}

export interface EndorserInfoLike {
  endorser_lock_hash: ccc.HexLike;
  endorser_name: string;
  endorser_description: string;
  website: string;
  social_links: string[];
  verified: ccc.NumLike;
}

export interface TippingConfigLike {
  approval_requirement_thresholds: ccc.NumLike[];
  expiration_duration: ccc.NumLike;
}

export interface ScriptCodeHashesLike {
  ckb_boost_protocol_type_code_hash: ccc.HexLike;
  ckb_boost_protocol_lock_code_hash: ccc.HexLike;
  ckb_boost_campaign_type_code_hash: ccc.HexLike;
  ckb_boost_campaign_lock_code_hash: ccc.HexLike;
  ckb_boost_user_type_code_hash: ccc.HexLike;
  ckb_boost_points_udt_type_code_hash: ccc.HexLike;
  accepted_udt_type_scripts: ccc.ScriptLike[];
  accepted_dob_type_scripts: ccc.ScriptLike[];
}

export interface ProtocolConfigLike {
  admin_lock_hash_vec: ccc.HexLike[];
  script_code_hashes: ScriptCodeHashesLike;
}

export interface ProtocolDataLike {
  campaigns_approved: ccc.HexLike[];
  tipping_proposals: TippingProposalDataLike[];
  tipping_config: TippingConfigLike;
  endorsers_whitelist: EndorserInfoLike[];
  last_updated: ccc.NumLike;
  protocol_config: ProtocolConfigLike;
}

export interface UserVerificationDataLike {
  telegram_personal_chat_id: ccc.NumLike;
  identity_verification_data: ccc.BytesLike;
}

export interface UserSubmissionRecordLike {
  campaign_type_id: ccc.HexLike;
  quest_id: ccc.NumLike;
  submission_timestamp: ccc.NumLike;
  submission_content: string;
}

export interface UserDataLike {
  verification_data: UserVerificationDataLike;
  total_points_earned: ccc.NumLike;
  last_activity_timestamp: ccc.NumLike;
  submission_records: UserSubmissionRecordLike[];
}

export interface ConnectedTypeIDLike {
  type_id: ccc.HexLike;
  connected_key: ccc.HexLike;
}

