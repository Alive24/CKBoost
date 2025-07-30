// Auto-generated TypeScript types for CKBoost molecule schema
// This file uses CCC molecule types where available and defines custom types

// Import from CCC
import { mol, ccc } from "@ckb-ccc/core";

// Re-export basic types
export type CanCastToArrayBuffer = ArrayBuffer | {
  toArrayBuffer(): ArrayBuffer;
};
export type CreateOptions = {
  validate?: boolean;
};

// CCC basic molecule codecs
const CCCByte32 = mol.Byte32;
const CCCByte32Opt = mol.Byte32Opt;
const CCCByte32Vec = mol.Byte32Vec;
const CCCBytes = mol.Bytes;
const CCCBytesOpt = mol.BytesOpt;
const CCCBytesVec = mol.BytesVec;
const CCCUint128 = mol.Uint128;
const CCCUint128Vec = mol.Uint128Vec;
const CCCUint256 = mol.Uint256;
const CCCUint32 = mol.Uint32;
const CCCUint64 = mol.Uint64;
const CCCUint8 = mol.Uint8;

// CKB vec/opt types generated using molecule
const CCCCellDepVec = mol.vector(ccc.CellDep);
const CCCCellInputVec = mol.vector(ccc.CellInput);
const CCCCellOutputVec = mol.vector(ccc.CellOutput);
const CCCScriptOpt = mol.option(ccc.Script);
const CCCScriptVec = mol.vector(ccc.Script);
const CCCTransactionVec = mol.vector(ccc.Transaction);

// Custom type definitions
export type BytesOptVecType = BytesOptType[];
export type ProposalShortIdType = ccc.Hex;
export type UncleBlockVecType = UncleBlockType[];
export type ProposalShortIdVecType = ProposalShortIdType[];
export type UDTFundingVecType = UDTFundingType[];
export type AssetListVecType = AssetListType[];
export type QuestSubTaskDataVecType = QuestSubTaskDataType[];
export type CompletionRecordVecType = CompletionRecordType[];
export type QuestDataVecType = QuestDataType[];
export type CampaignDataVecType = CampaignDataType[];
export type TippingProposalDataVecType = TippingProposalDataType[];
export type EndorserInfoVecType = EndorserInfoType[];

export interface RawTransactionType {
  version: Uint32Type;
  cell_deps: CellDepVecType;
  header_deps: Byte32VecType;
  inputs: CellInputVecType;
  outputs: CellOutputVecType;
  outputs_data: BytesVecType;
}

export interface RawHeaderType {
  version: Uint32Type;
  compact_target: Uint32Type;
  timestamp: Uint64Type;
  number: Uint64Type;
  epoch: Uint64Type;
  parent_hash: Byte32Type;
  transactions_root: Byte32Type;
  proposals_hash: Byte32Type;
  extra_hash: Byte32Type;
  dao: Byte32Type;
}

export interface HeaderType {
  raw: RawHeaderType;
  nonce: Uint128Type;
}

export interface UncleBlockType {
  header: HeaderType;
  proposals: ProposalShortIdVecType;
}

export interface BlockType {
  header: HeaderType;
  uncles: UncleBlockVecType;
  transactions: TransactionVecType;
  proposals: ProposalShortIdVecType;
}

export interface BlockV1Type {
  header: HeaderType;
  uncles: UncleBlockVecType;
  transactions: TransactionVecType;
  proposals: ProposalShortIdVecType;
  extension: BytesType;
}

export interface CellbaseWitnessType {
  lock: ScriptType;
  message: BytesType;
}

export interface UDTFundingType {
  udt_script: ScriptType;
  amount: Uint128Type;
}

export interface AssetListType {
  ckb_amount: Uint64Type;
  nft_assets: ScriptVecType;
  udt_assets: UDTFundingVecType;
}

export interface QuestSubTaskDataType {
  id: number;
  title: BytesType;
  type: BytesType;
  description: BytesType;
  proof_required: BytesType;
}

export interface CompletionRecordType {
  user_address: BytesType;
  sub_task_id: number;
  completion_timestamp: Uint64Type;
  completion_content: BytesType;
}

export interface QuestDataType {
  id: Byte32Type;
  campaign_id: Byte32Type;
  title: BytesType;
  description: BytesType;
  requirements: BytesType;
  rewards_on_completion: AssetListVecType;
  completion_records: CompletionRecordVecType;
  completion_deadline: Uint64Type;
  status: number;
  sub_tasks: QuestSubTaskDataVecType;
  points: Uint32Type;
  difficulty: number;
  time_estimate: Uint32Type;
  completion_count: Uint32Type;
}

export interface CampaignMetadataType {
  funding_info: AssetListVecType;
  created_at: Uint64Type;
  starting_time: Uint64Type;
  ending_time: Uint64Type;
  verification_requirements: Uint32Type;
  last_updated: Uint64Type;
  categories: BytesVecType;
  difficulty: number;
  image_cid: BytesType;
  rules: BytesVecType;
}

export interface CampaignDataType {
  id: Byte32Type;
  creator: ScriptType;
  metadata: CampaignMetadataType;
  status: number;
  quests: QuestDataVecType;
  title: BytesType;
  short_description: BytesType;
  long_description: BytesType;
  endorser_info: EndorserInfoType;
  participants_count: Uint32Type;
  total_completions: Uint32Type;
}

export interface UserVerificationDataType {
  user_address: BytesType;
  telegram_personal_chat_id: Uint128Type;
  identity_verification_data: BytesType;
}

export interface TippingProposalMetadataType {
  contribution_title: BytesType;
  contribution_type_tags: BytesVecType;
  description: BytesType;
  proposal_creation_timestamp: Uint64Type;
}

export interface TippingProposalDataType {
  target_address: BytesType;
  proposer_lock_hash: Byte32Type;
  metadata: TippingProposalMetadataType;
  amount: Uint64Type;
  tipping_transaction_hash: Byte32OptType;
  approval_transaction_hash: Byte32VecType;
}

export interface EndorserInfoType {
  endorser_lock_hash: Byte32Type;
  endorser_name: BytesType;
  endorser_description: BytesType;
  website: BytesType;
  social_links: BytesVecType;
  verified: number;
}

export interface TippingConfigType {
  approval_requirement_thresholds: Uint128VecType;
  expiration_duration: Uint64Type;
}

export interface ScriptCodeHashesType {
  ckb_boost_protocol_type_code_hash: Byte32Type;
  ckb_boost_protocol_lock_code_hash: Byte32Type;
  ckb_boost_campaign_type_code_hash: Byte32Type;
  ckb_boost_campaign_lock_code_hash: Byte32Type;
  ckb_boost_user_type_code_hash: Byte32Type;
  accepted_udt_type_code_hashes: Byte32VecType;
  accepted_dob_type_code_hashes: Byte32VecType;
}

export interface ProtocolConfigType {
  admin_lock_hash_vec: Byte32VecType;
  script_code_hashes: ScriptCodeHashesType;
}

export interface ProtocolDataType {
  campaigns_approved: CampaignDataVecType;
  tipping_proposals: TippingProposalDataVecType;
  tipping_config: TippingConfigType;
  endorsers_whitelist: EndorserInfoVecType;
  last_updated: Uint64Type;
  protocol_config: ProtocolConfigType;
}

export interface UserProgressDataType {
  user_lock_script: ScriptType;
  campaign_id: Byte32Type;
  completed_quest_ids: Byte32VecType;
  total_points_earned: Uint32Type;
  last_activity_timestamp: Uint64Type;
}

export interface TokenRewardInfoType {
  udt_script: ScriptType;
  symbol: BytesType;
  decimals: number;
}

export interface ConnectedTypeIDType {
  type_id: Byte32Type;
  connected_type_hash: Byte32Type;
}

// Molecule codec implementations
export const Uint8 = CCCUint8;
export const Script = { encode: (value: ccc.ScriptLike) => ccc.Script.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.Script.fromBytes(bytes) };
export const ProposalShortId = mol.Codec.from({
  byteLength: 10,
  encode: (value: ccc.BytesLike) => ccc.bytesFrom(value),
  decode: (buffer: ccc.BytesLike) => ccc.hexFrom(buffer)
});
export const ProposalShortIdVec = mol.vector(ProposalShortId);
export const RawTransaction = mol.table({
  version: CCCUint32,
  cell_deps: CCCCellDepVec,
  header_deps: CCCByte32Vec,
  inputs: CCCCellInputVec,
  outputs: CCCCellOutputVec,
  outputs_data: CCCBytesVec
});

export const RawHeader = mol.struct({
  version: CCCUint32,
  compact_target: CCCUint32,
  timestamp: CCCUint64,
  number: CCCUint64,
  epoch: CCCUint64,
  parent_hash: CCCByte32,
  transactions_root: CCCByte32,
  proposals_hash: CCCByte32,
  extra_hash: CCCByte32,
  dao: CCCByte32
});

export const Header = mol.struct({
  raw: RawHeader,
  nonce: CCCUint128
});

export const UncleBlock = mol.table({
  header: Header,
  proposals: ProposalShortIdVec
});

export const UncleBlockVec = mol.vector(UncleBlock);
export const EndorserInfo = mol.table({
  endorser_lock_hash: CCCByte32,
  endorser_name: CCCBytes,
  endorser_description: CCCBytes,
  website: CCCBytes,
  social_links: CCCBytesVec,
  verified: CCCUint8
});

export const EndorserInfoVec = mol.vector(EndorserInfo);
export const BytesOptVec = mol.vector(CCCBytesOpt);
export const Block = mol.table({
  header: Header,
  uncles: UncleBlockVec,
  transactions: CCCTransactionVec,
  proposals: ProposalShortIdVec
});

export const BlockV1 = mol.table({
  header: Header,
  uncles: UncleBlockVec,
  transactions: CCCTransactionVec,
  proposals: ProposalShortIdVec,
  extension: CCCBytes
});

export const CellbaseWitness = mol.table({
  lock: Script,
  message: CCCBytes
});

export const UDTFunding = mol.table({
  udt_script: Script,
  amount: CCCUint128
});

export const UDTFundingVec = mol.vector(UDTFunding);
export const AssetList = mol.table({
  ckb_amount: CCCUint64,
  nft_assets: CCCScriptVec,
  udt_assets: UDTFundingVec
});

export const AssetListVec = mol.vector(AssetList);
export const QuestSubTaskData = mol.table({
  id: CCCUint8,
  title: CCCBytes,
  type: CCCBytes,
  description: CCCBytes,
  proof_required: CCCBytes
});

export const QuestSubTaskDataVec = mol.vector(QuestSubTaskData);
export const CompletionRecord = mol.table({
  user_address: CCCBytes,
  sub_task_id: CCCUint8,
  completion_timestamp: CCCUint64,
  completion_content: CCCBytes
});

export const CompletionRecordVec = mol.vector(CompletionRecord);
export const QuestData = mol.table({
  id: CCCByte32,
  campaign_id: CCCByte32,
  title: CCCBytes,
  description: CCCBytes,
  requirements: CCCBytes,
  rewards_on_completion: AssetListVec,
  completion_records: CompletionRecordVec,
  completion_deadline: CCCUint64,
  status: mol.uint(1),
  sub_tasks: QuestSubTaskDataVec,
  points: CCCUint32,
  difficulty: CCCUint8,
  time_estimate: CCCUint32,
  completion_count: CCCUint32
});

export const QuestDataVec = mol.vector(QuestData);
export const CampaignMetadata = mol.table({
  funding_info: AssetListVec,
  created_at: CCCUint64,
  starting_time: CCCUint64,
  ending_time: CCCUint64,
  verification_requirements: CCCUint32,
  last_updated: CCCUint64,
  categories: CCCBytesVec,
  difficulty: CCCUint8,
  image_cid: CCCBytes,
  rules: CCCBytesVec
});

export const CampaignData = mol.table({
  id: CCCByte32,
  creator: Script,
  metadata: CampaignMetadata,
  status: mol.uint(1),
  quests: QuestDataVec,
  title: CCCBytes,
  short_description: CCCBytes,
  long_description: CCCBytes,
  endorser_info: EndorserInfo,
  participants_count: CCCUint32,
  total_completions: CCCUint32
});

export const CampaignDataVec = mol.vector(CampaignData);
export const UserVerificationData = mol.table({
  user_address: CCCBytes,
  telegram_personal_chat_id: CCCUint128,
  identity_verification_data: CCCBytes
});

export const TippingProposalMetadata = mol.table({
  contribution_title: CCCBytes,
  contribution_type_tags: CCCBytesVec,
  description: CCCBytes,
  proposal_creation_timestamp: CCCUint64
});

export const TippingProposalData = mol.table({
  target_address: CCCBytes,
  proposer_lock_hash: CCCByte32,
  metadata: TippingProposalMetadata,
  amount: CCCUint64,
  tipping_transaction_hash: CCCByte32Opt,
  approval_transaction_hash: CCCByte32Vec
});

export const TippingProposalDataVec = mol.vector(TippingProposalData);
export const TippingConfig = mol.table({
  approval_requirement_thresholds: CCCUint128Vec,
  expiration_duration: CCCUint64
});

export const ScriptCodeHashes = mol.table({
  ckb_boost_protocol_type_code_hash: CCCByte32,
  ckb_boost_protocol_lock_code_hash: CCCByte32,
  ckb_boost_campaign_type_code_hash: CCCByte32,
  ckb_boost_campaign_lock_code_hash: CCCByte32,
  ckb_boost_user_type_code_hash: CCCByte32,
  accepted_udt_type_code_hashes: CCCByte32Vec,
  accepted_dob_type_code_hashes: CCCByte32Vec
});

export const ProtocolConfig = mol.table({
  admin_lock_hash_vec: CCCByte32Vec,
  script_code_hashes: ScriptCodeHashes
});

export const ProtocolData = mol.table({
  campaigns_approved: CampaignDataVec,
  tipping_proposals: TippingProposalDataVec,
  tipping_config: TippingConfig,
  endorsers_whitelist: EndorserInfoVec,
  last_updated: CCCUint64,
  protocol_config: ProtocolConfig
});

export const UserProgressData = mol.table({
  user_lock_script: Script,
  campaign_id: CCCByte32,
  completed_quest_ids: CCCByte32Vec,
  total_points_earned: CCCUint32,
  last_activity_timestamp: CCCUint64
});

export const TokenRewardInfo = mol.table({
  udt_script: Script,
  symbol: CCCBytes,
  decimals: CCCUint8
});

export const ConnectedTypeID = mol.table({
  type_id: CCCByte32,
  connected_type_hash: CCCByte32
});


// Serialize functions
export function SerializeBytesOptVec(value: BytesOptVecType): Uint8Array {
  return new Uint8Array(BytesOptVec.encode(value));
}
export function SerializeProposalShortId(value: ProposalShortIdType): Uint8Array {
  return new Uint8Array(ProposalShortId.encode(value));
}
export function SerializeUncleBlockVec(value: UncleBlockVecType): Uint8Array {
  return new Uint8Array(UncleBlockVec.encode(value));
}
export function SerializeProposalShortIdVec(value: ProposalShortIdVecType): Uint8Array {
  return new Uint8Array(ProposalShortIdVec.encode(value));
}
export function SerializeRawTransaction(value: RawTransactionType): Uint8Array {
  return new Uint8Array(RawTransaction.encode(value));
}
export function SerializeRawHeader(value: RawHeaderType): Uint8Array {
  return new Uint8Array(RawHeader.encode(value));
}
export function SerializeHeader(value: HeaderType): Uint8Array {
  return new Uint8Array(Header.encode(value));
}
export function SerializeUncleBlock(value: UncleBlockType): Uint8Array {
  return new Uint8Array(UncleBlock.encode(value));
}
export function SerializeBlock(value: BlockType): Uint8Array {
  return new Uint8Array(Block.encode(value));
}
export function SerializeBlockV1(value: BlockV1Type): Uint8Array {
  return new Uint8Array(BlockV1.encode(value));
}
export function SerializeCellbaseWitness(value: CellbaseWitnessType): Uint8Array {
  return new Uint8Array(CellbaseWitness.encode(value));
}
export function SerializeUDTFunding(value: UDTFundingType): Uint8Array {
  return new Uint8Array(UDTFunding.encode(value));
}
export function SerializeUDTFundingVec(value: UDTFundingVecType): Uint8Array {
  return new Uint8Array(UDTFundingVec.encode(value));
}
export function SerializeAssetList(value: AssetListType): Uint8Array {
  return new Uint8Array(AssetList.encode(value));
}
export function SerializeAssetListVec(value: AssetListVecType): Uint8Array {
  return new Uint8Array(AssetListVec.encode(value));
}
export function SerializeQuestSubTaskData(value: QuestSubTaskDataType): Uint8Array {
  return new Uint8Array(QuestSubTaskData.encode(value));
}
export function SerializeQuestSubTaskDataVec(value: QuestSubTaskDataVecType): Uint8Array {
  return new Uint8Array(QuestSubTaskDataVec.encode(value));
}
export function SerializeCompletionRecord(value: CompletionRecordType): Uint8Array {
  return new Uint8Array(CompletionRecord.encode(value));
}
export function SerializeCompletionRecordVec(value: CompletionRecordVecType): Uint8Array {
  return new Uint8Array(CompletionRecordVec.encode(value));
}
export function SerializeQuestData(value: QuestDataType): Uint8Array {
  return new Uint8Array(QuestData.encode(value));
}
export function SerializeQuestDataVec(value: QuestDataVecType): Uint8Array {
  return new Uint8Array(QuestDataVec.encode(value));
}
export function SerializeCampaignMetadata(value: CampaignMetadataType): Uint8Array {
  return new Uint8Array(CampaignMetadata.encode(value));
}
export function SerializeCampaignData(value: CampaignDataType): Uint8Array {
  return new Uint8Array(CampaignData.encode(value));
}
export function SerializeCampaignDataVec(value: CampaignDataVecType): Uint8Array {
  return new Uint8Array(CampaignDataVec.encode(value));
}
export function SerializeUserVerificationData(value: UserVerificationDataType): Uint8Array {
  return new Uint8Array(UserVerificationData.encode(value));
}
export function SerializeTippingProposalMetadata(value: TippingProposalMetadataType): Uint8Array {
  return new Uint8Array(TippingProposalMetadata.encode(value));
}
export function SerializeTippingProposalData(value: TippingProposalDataType): Uint8Array {
  return new Uint8Array(TippingProposalData.encode(value));
}
export function SerializeTippingProposalDataVec(value: TippingProposalDataVecType): Uint8Array {
  return new Uint8Array(TippingProposalDataVec.encode(value));
}
export function SerializeEndorserInfo(value: EndorserInfoType): Uint8Array {
  return new Uint8Array(EndorserInfo.encode(value));
}
export function SerializeEndorserInfoVec(value: EndorserInfoVecType): Uint8Array {
  return new Uint8Array(EndorserInfoVec.encode(value));
}
export function SerializeTippingConfig(value: TippingConfigType): Uint8Array {
  return new Uint8Array(TippingConfig.encode(value));
}
export function SerializeScriptCodeHashes(value: ScriptCodeHashesType): Uint8Array {
  return new Uint8Array(ScriptCodeHashes.encode(value));
}
export function SerializeProtocolConfig(value: ProtocolConfigType): Uint8Array {
  return new Uint8Array(ProtocolConfig.encode(value));
}
export function SerializeProtocolData(value: ProtocolDataType): Uint8Array {
  return new Uint8Array(ProtocolData.encode(value));
}
export function SerializeUserProgressData(value: UserProgressDataType): Uint8Array {
  return new Uint8Array(UserProgressData.encode(value));
}
export function SerializeTokenRewardInfo(value: TokenRewardInfoType): Uint8Array {
  return new Uint8Array(TokenRewardInfo.encode(value));
}
export function SerializeConnectedTypeID(value: ConnectedTypeIDType): Uint8Array {
  return new Uint8Array(ConnectedTypeID.encode(value));
}

// Re-export CCC types with consistent naming
export type Byte32Type = ccc.Hex;
export const Byte32 = CCCByte32;
export const SerializeByte32 = (value: ccc.BytesLike) => new Uint8Array(CCCByte32.encode(value));
export type Byte32OptType = ccc.Hex | undefined;
export const Byte32Opt = CCCByte32Opt;
export const SerializeByte32Opt = (value: ccc.BytesLike | null | undefined) => new Uint8Array(CCCByte32Opt.encode(value));
export type Byte32VecType = ccc.Hex[];
export const Byte32Vec = CCCByte32Vec;
export const SerializeByte32Vec = (value: ccc.BytesLike[]) => new Uint8Array(CCCByte32Vec.encode(value));
export type BytesType = ccc.Hex;
export const Bytes = CCCBytes;
export const SerializeBytes = (value: ccc.BytesLike) => new Uint8Array(CCCBytes.encode(value));
export type BytesOptType = ccc.Hex | undefined;
export const BytesOpt = CCCBytesOpt;
export const SerializeBytesOpt = (value: ccc.BytesLike | null | undefined) => new Uint8Array(CCCBytesOpt.encode(value));
export type BytesVecType = ccc.Hex[];
export const BytesVec = CCCBytesVec;
export const SerializeBytesVec = (value: ccc.BytesLike[]) => new Uint8Array(CCCBytesVec.encode(value));
export type Uint128Type = bigint;
export const Uint128 = CCCUint128;
export const SerializeUint128 = (value: ccc.NumLike) => new Uint8Array(CCCUint128.encode(value));
export type Uint128VecType = bigint[];
export const Uint128Vec = CCCUint128Vec;
export const SerializeUint128Vec = (value: ccc.NumLike[]) => new Uint8Array(CCCUint128Vec.encode(value));
export type Uint256Type = bigint;
export const Uint256 = CCCUint256;
export const SerializeUint256 = (value: ccc.NumLike) => new Uint8Array(CCCUint256.encode(value));
export type Uint32Type = number;
export const Uint32 = CCCUint32;
export const SerializeUint32 = (value: ccc.NumLike) => new Uint8Array(CCCUint32.encode(value));
export type Uint64Type = bigint;
export const Uint64 = CCCUint64;
export const SerializeUint64 = (value: ccc.NumLike) => new Uint8Array(CCCUint64.encode(value));
export type Uint8Type = number;
export const SerializeUint8 = (value: ccc.NumLike) => new Uint8Array(CCCUint8.encode(value));
export type CellDepVecType = ccc.CellDep[];
export const CellDepVec = CCCCellDepVec;
export const SerializeCellDepVec = (value: any) => new Uint8Array(CCCCellDepVec.encode(value));
export type CellInputVecType = ccc.CellInput[];
export const CellInputVec = CCCCellInputVec;
export const SerializeCellInputVec = (value: any) => new Uint8Array(CCCCellInputVec.encode(value));
export type CellOutputVecType = ccc.CellOutput[];
export const CellOutputVec = CCCCellOutputVec;
export const SerializeCellOutputVec = (value: any) => new Uint8Array(CCCCellOutputVec.encode(value));
export type ScriptOptType = ccc.Script | undefined;
export const ScriptOpt = CCCScriptOpt;
export const SerializeScriptOpt = (value: any) => new Uint8Array(CCCScriptOpt.encode(value));
export type ScriptVecType = ccc.Script[];
export const ScriptVec = CCCScriptVec;
export const SerializeScriptVec = (value: any) => new Uint8Array(CCCScriptVec.encode(value));
export type TransactionVecType = ccc.Transaction[];
export const TransactionVec = CCCTransactionVec;
export const SerializeTransactionVec = (value: any) => new Uint8Array(CCCTransactionVec.encode(value));
export type CellDepType = ccc.CellDep;
export const CellDep = { encode: (value: ccc.CellDepLike) => ccc.CellDep.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.CellDep.fromBytes(bytes) };
export const SerializeCellDep = (value: ccc.CellDepLike) => ccc.CellDep.from(value).toBytes();
export type CellInputType = ccc.CellInput;
export const CellInput = { encode: (value: ccc.CellInputLike) => ccc.CellInput.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.CellInput.fromBytes(bytes) };
export const SerializeCellInput = (value: ccc.CellInputLike) => ccc.CellInput.from(value).toBytes();
export type CellOutputType = ccc.CellOutput;
export const CellOutput = { encode: (value: ccc.CellOutputLike) => ccc.CellOutput.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.CellOutput.fromBytes(bytes) };
export const SerializeCellOutput = (value: ccc.CellOutputLike) => ccc.CellOutput.from(value).toBytes();
export type OutPointType = ccc.OutPoint;
export const OutPoint = { encode: (value: ccc.OutPointLike) => ccc.OutPoint.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.OutPoint.fromBytes(bytes) };
export const SerializeOutPoint = (value: ccc.OutPointLike) => ccc.OutPoint.from(value).toBytes();
export type ScriptType = ccc.Script;
export const SerializeScript = (value: ccc.ScriptLike) => ccc.Script.from(value).toBytes();
export type TransactionType = ccc.Transaction;
export const Transaction = { encode: (value: ccc.TransactionLike) => ccc.Transaction.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.Transaction.fromBytes(bytes) };
export const SerializeTransaction = (value: ccc.TransactionLike) => ccc.Transaction.from(value).toBytes();
export type WitnessArgsType = ccc.WitnessArgs;
export const WitnessArgs = { encode: (value: ccc.WitnessArgsLike) => ccc.WitnessArgs.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.WitnessArgs.fromBytes(bytes) };
export const SerializeWitnessArgs = (value: ccc.WitnessArgsLike) => ccc.WitnessArgs.from(value).toBytes();
