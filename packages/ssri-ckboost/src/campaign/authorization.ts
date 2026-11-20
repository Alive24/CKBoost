import { ccc } from "@ckb-ccc/core";
import { CampaignData, ConnectedTypeID, ProtocolData, type CampaignDataLike } from "../generated";

/** Review authority belongs to the consumed campaign, never desired output
 * metadata. A current Organizer grant must accompany verified lock ownership;
 * assigned reviewers need no Organizer grant and acquire no settings rights. */
export function assertCampaignReviewAuthority(options: {
  protocolCell: ccc.Cell; campaignScript: ccc.Script; signerLockHash: ccc.Hex;
  campaignCell: Pick<ccc.Cell, "cellOutput" | "outputData">;
}): {ownerLockHash: ccc.Hex; admin: boolean; organizer: boolean; staff: boolean; owner: boolean} {
  const {protocolCell, campaignScript, campaignCell} = options;
  const protocolHash = protocolCell.cellOutput.type?.hash();
  if (!protocolHash || !campaignCell.cellOutput.type) throw new Error("Typed protocol and authoritative campaign input cells are required for review.");
  const protocol = ProtocolData.decode(protocolCell.outputData), config = protocol.protocol_config.script_code_hashes;
  const type = campaignCell.cellOutput.type, lock = campaignCell.cellOutput.lock;
  if (type.hashType !== "type" || type.codeHash !== ccc.hexFrom(config.ckb_boost_campaign_type_code_hash)
    || type.hash() !== campaignScript.hash() || lock.codeHash !== ccc.hexFrom(config.ckb_boost_protocol_lock_code_hash)
    || lock.hashType !== protocolCell.cellOutput.lock.hashType) throw new Error("Campaign review input code/type/lock does not match the configured protocol.");
  let typeConnection: ReturnType<typeof ConnectedTypeID.decode>, lockConnection: ReturnType<typeof ConnectedTypeID.decode>;
  try {
    typeConnection = ConnectedTypeID.decode(type.args); lockConnection = ConnectedTypeID.decode(lock.args);
    if (ccc.hexFrom(ConnectedTypeID.encode(typeConnection)) !== type.args || ccc.hexFrom(ConnectedTypeID.encode(lockConnection)) !== lock.args) throw new Error("noncanonical");
  } catch { throw new Error("Campaign review ownership arguments are invalid."); }
  if (ccc.hexFrom(typeConnection.connected_key) !== protocolHash || ccc.hexFrom(lockConnection.connected_key) !== protocolHash) throw new Error("Campaign review input belongs to another protocol.");
  const inputData = CampaignData.decode(campaignCell.outputData), signer = options.signerLockHash.toLowerCase();
  const ownerLockHash = ccc.hexFrom(lockConnection.type_id);
  const admin = protocol.protocol_config.admin_lock_hash_vec.some(value => ccc.hexFrom(value).toLowerCase() === signer);
  const organizer = protocol.endorsers_whitelist.some(value => ccc.hexFrom(value.endorser_lock_hash).toLowerCase() === signer);
  const staff = inputData.staff_lock_hash_vec.some(value => ccc.hexFrom(value).toLowerCase() === signer);
  const owner = ownerLockHash.toLowerCase() === signer;
  if (!admin && !staff && !(organizer && owner)) throw new Error("Only a current platform admin, this campaign's authorized Organizer owner, or an assigned input reviewer can approve submissions.");
  return {ownerLockHash, admin, organizer, staff, owner};
}

function assertSettingsPreserveApprovals(next: CampaignDataLike, previous?: CampaignDataLike) {
  const quests = new Map(next.quests.map(quest => [ccc.numFrom(quest.quest_id).toString(), quest]));
  if (quests.size !== next.quests.length) throw new Error("Campaign quest IDs must remain unique.");
  if (previous && (ccc.numFrom(previous.total_completions) !== ccc.numFrom(next.total_completions) || ccc.numFrom(previous.participants_count) !== ccc.numFrom(next.participants_count))) throw new Error("Campaign review totals can only change through the submission lifecycle.");
  if (!previous && (ccc.numFrom(next.total_completions) !== 0n || ccc.numFrom(next.participants_count) !== 0n)) throw new Error("A new campaign must start with zero submission totals.");
  const old = new Map(previous?.quests.map(quest => [ccc.numFrom(quest.quest_id).toString(), quest]) ?? []);
  for (const [id, before] of old) {
    const after = quests.get(id);
    if (!after) {
      if (before.accepted_submission_user_type_ids.length || ccc.numFrom(before.completion_count) !== 0n) throw new Error("A quest with approved submissions cannot be removed by settings updates.");
      continue;
    }
    const accepted = (values: ccc.HexLike[]) => values.map(value => ccc.hexFrom(value).toLowerCase()).join(",");
    if (ccc.numFrom(before.completion_count) !== ccc.numFrom(after.completion_count) || accepted(before.accepted_submission_user_type_ids) !== accepted(after.accepted_submission_user_type_ids)) throw new Error("Submission approvals can only change through approveCompletion.");
  }
  for (const [id, quest] of quests) if (!old.has(id) && (quest.accepted_submission_user_type_ids.length || ccc.numFrom(quest.completion_count) !== 0n)) throw new Error("A new quest cannot contain submission approvals.");
}

/** Mirrors campaign-settings consensus policy. Approval of submissions is a
 * separate operation and must not gain settings rights through staff status. */
export function assertCampaignSettingsAuthority(options: {
  protocolCell: ccc.Cell; campaignScript: ccc.Script; signerLockHash: ccc.Hex;
  campaignData: CampaignDataLike; existingCampaignCell?: ccc.Cell;
}): {ownerLockHash: ccc.Hex; protocolLock: ccc.Script} {
  const {protocolCell, campaignScript, signerLockHash, campaignData, existingCampaignCell} = options;
  const protocolHash = protocolCell.cellOutput.type?.hash();
  if (!protocolHash) throw new Error("A typed protocol cell is required for campaign settings.");
  const protocol = ProtocolData.decode(protocolCell.outputData);
  const config = protocol.protocol_config.script_code_hashes;
  if (campaignScript.codeHash !== ccc.hexFrom(config.ckb_boost_campaign_type_code_hash)) throw new Error("Campaign type does not match the connected protocol.");
  const signer = signerLockHash.toLowerCase();
  const admins = new Set(protocol.protocol_config.admin_lock_hash_vec.map(value => ccc.hexFrom(value).toLowerCase()));
  const organizers = new Set(protocol.endorsers_whitelist.map(value => ccc.hexFrom(value.endorser_lock_hash).toLowerCase()));
  let owner = ccc.hexFrom(campaignData.endorser_lock_hash);
  const expectedLock = (hash: ccc.Hex) => ccc.Script.from({codeHash: ccc.hexFrom(config.ckb_boost_protocol_lock_code_hash), hashType: protocolCell.cellOutput.lock.hashType, args: ccc.hexFrom(ConnectedTypeID.encode({type_id: hash, connected_key: protocolHash}))});
  if (existingCampaignCell) {
    const original = CampaignData.decode(existingCampaignCell.outputData);
    let ownerConnection: ReturnType<typeof ConnectedTypeID.decode>;
    try { ownerConnection = ConnectedTypeID.decode(existingCampaignCell.cellOutput.lock.args); }
    catch { throw new Error("Campaign ownership lock is invalid. Reload before editing."); }
    owner = ccc.hexFrom(ownerConnection.type_id);
    if (existingCampaignCell.cellOutput.type?.hash() !== campaignScript.hash()
      || ccc.hexFrom(campaignData.endorser_lock_hash) !== ccc.hexFrom(original.endorser_lock_hash)
      || existingCampaignCell.cellOutput.lock.hash() !== expectedLock(owner).hash()) throw new Error("Campaign ownership or protocol binding is invalid. Ownership cannot be changed by editing.");
    const connection = ConnectedTypeID.decode(campaignScript.args);
    if (ccc.hexFrom(connection.connected_key) !== protocolHash) throw new Error("Campaign belongs to a different protocol.");
    if (!admins.has(signer) && !(organizers.has(signer) && signer === owner.toLowerCase())) throw new Error("Only a current platform admin or this campaign's authorized Organizer can edit settings and reviewer assignments.");
    assertSettingsPreserveApprovals(campaignData, original);
  } else if (owner.toLowerCase() !== signer || (!admins.has(signer) && !organizers.has(signer))) {
    throw new Error("Only a current platform admin or authorized Organizer can create a campaign they own.");
  } else assertSettingsPreserveApprovals(campaignData);
  return {ownerLockHash: owner, protocolLock: expectedLock(owner)};
}
