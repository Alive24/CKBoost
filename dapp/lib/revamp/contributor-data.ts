import { ccc } from "@ckb-ccc/connector-react";
import { CampaignData, ProtocolData } from "ssri-ckboost/types";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells";
import { extractTypeIdFromUserCell, getLatestUserCellByLock, parseUserData } from "@/lib/ckb/user-cells";
import { UserService } from "@/lib/services/user-service";
import { cellToCampaignDisplay, type CampaignDisplay } from "@/lib/utils/campaign-utils";
import { createEndorserResolver } from "@/lib/utils/endorser-resolver";
import { getCampaignCapabilities, verifyCampaignOwnership, type CampaignPermissionProtocol } from "./campaign-permissions";
import { submissionRecordMatchesQuest } from "@/lib/user-submission-records";

export type ContributorProtocol = ReturnType<typeof ProtocolData.decode>;
export function contributorProtocolPermissions(protocol: ContributorProtocol, protocolCell?:ccc.Cell|null): CampaignPermissionProtocol {
  return {adminLockHashes:protocol.protocol_config.admin_lock_hash_vec.map(value => ccc.hexFrom(value)), approvedCampaignTypeIds:protocol.campaigns_approved.map(value => ccc.hexFrom(value)), endorserLockHashes:protocol.endorsers_whitelist.map(value => ccc.hexFrom(value.endorser_lock_hash)),protocolTypeHash:protocolCell?.cellOutput.type?.hash()};
}
export function contributorCampaignPermissions(campaign: CampaignDisplay, protocol:ContributorProtocol,protocolCell?:ccc.Cell|null) {
  const protocolTypeHash=protocolCell?.cellOutput.type?.hash();
  const hashes=protocol.protocol_config.script_code_hashes;
  const ownershipVerified=protocolTypeHash && protocolCell ? verifyCampaignOwnership({
    campaignTypeId:campaign.typeId ?? "",protocolTypeHash,
    campaignTypeCodeHash:ccc.hexFrom(hashes.ckb_boost_campaign_type_code_hash),
    protocolLockCodeHash:ccc.hexFrom(hashes.ckb_boost_protocol_lock_code_hash),
    protocolLockHashType:protocolCell.cellOutput.lock.hashType,cell:campaign.cell,
    declaredOwnerLockHash:ccc.hexFrom(campaign.endorser_lock_hash),
  }) : null;
  return {typeId:campaign.typeId ?? "", ownershipVerified, staffLockHashes:campaign.staff_lock_hash_vec.map(value => ccc.hexFrom(value)), endorserLockHash:ccc.hexFrom(campaign.endorser_lock_hash), startDate:campaign.startDate, endDate:campaign.endDate};
}
export function decodeContributorCampaign(cell: ccc.Cell, protocol: ContributorProtocol): CampaignDisplay {
  // Decode first: malformed chain data must not become an apparently valid form.
  CampaignData.decode(cell.outputData);
  const campaign = cellToCampaignDisplay(cell, {endorserResolver:createEndorserResolver(protocol.endorsers_whitelist)});
  const start=Date.parse(campaign.startDate),end=Date.parse(campaign.endDate);
  if (!campaign.typeId || !Number.isFinite(start) || !Number.isFinite(end) || end<=start) throw new Error("The campaign data is invalid.");
  return campaign;
}
export async function loadContributorIdentity(signer: ccc.Signer, protocolCell: ccc.Cell, protocol: ContributorProtocol) {
  const address = await signer.getRecommendedAddressObj();
  const lockHash = address.script.hash();
  const protocolHash = protocolCell.cellOutput.type?.hash();
  if (!protocolHash) throw new Error("The protocol has no type identity.");
  const userCodeHash = ccc.hexFrom(protocol.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash);
  const userCell = await getLatestUserCellByLock(address.script, userCodeHash, signer, protocolHash);
  const user = userCell ? parseUserData(userCell) : null;
  if (userCell && !user) throw new Error("Your profile data could not be read. Please retry.");
  const userTypeId = userCell ? extractTypeIdFromUserCell(userCell) : null;
  const service = new UserService(signer,userCodeHash,protocolHash,true);
  return {signer,lockHash,address:await signer.getRecommendedAddress(),protocolHash,userCell,user,userTypeId,service};
}
export type ContributorIdentity = Awaited<ReturnType<typeof loadContributorIdentity>>;
export async function loadContributorEligibility(identity: ContributorIdentity, campaign: CampaignDisplay): Promise<{eligible:boolean;missingVerifications:string[]}> {
  const required = campaign.metadata.verification_requirements.map(Number);
  if (!required.length) return {eligible:true,missingVerifications:[]};
  return identity.service.checkCampaignEligibility(required,identity.userTypeId);
}
export function contributorQuestState(campaign: CampaignDisplay, identity: ContributorIdentity | null, questId: number) {
  const quest = campaign.quests.find(value => Number(value.quest_id) === questId);
  const submission = identity?.user?.submission_records.filter(record => submissionRecordMatchesQuest(record,campaign.typeId!,questId)).sort((a,b)=>{const first=ccc.numFrom(a.submission_timestamp ?? 0),second=ccc.numFrom(b.submission_timestamp ?? 0);return first===second?0:first>second?-1:1;})[0] ?? null;
  const accepted = Boolean(identity?.userTypeId && quest?.accepted_submission_user_type_ids.some(id => ccc.hexFrom(id).toLowerCase() === identity.userTypeId!.toLowerCase()));
  return {quest,submission,accepted};
}
export function contributorCapabilities(campaign: CampaignDisplay, protocol: ContributorProtocol, identity: ContributorIdentity | null, eligible: boolean, questId?: number,protocolCell?:ccc.Cell|null) {
  const state = questId !== undefined ? contributorQuestState(campaign,identity,questId) : null;
  const capabilities = getCampaignCapabilities({signerLockHash:identity?.lockHash ?? null, protocol:contributorProtocolPermissions(protocol,protocolCell), campaign:contributorCampaignPermissions(campaign,protocol,protocolCell), eligible, questId, submission:state?.submission ? {campaignTypeId:campaign.typeId!,questId:questId!,contributorLockHash:identity!.lockHash,accepted:state.accepted} : null});
  // Accepted IDs on the campaign are authoritative even when an old user record
  // has been pruned or an indexer has not returned it.
  return state?.accepted ? {...capabilities, canSubmitQuest:false,canEditSubmission:false,canDeleteSubmission:false} : capabilities;
}
export async function refreshContributorFacts(signer: ccc.Signer, campaignId: ccc.Hex, expectedProtocolHash: ccc.Hex) {
  const protocolCell = await fetchProtocolCell(signer.client);
  if (!protocolCell || protocolCell.cellOutput.type?.hash().toLowerCase() !== expectedProtocolHash.toLowerCase()) throw new Error("The protocol or network changed. Reload this campaign.");
  const protocol = ProtocolData.decode(protocolCell.outputData);
  const campaignCell = await fetchCampaignByTypeId(campaignId,ccc.hexFrom(protocol.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),signer.client,protocolCell);
  if (!campaignCell) throw new Error("The campaign is unavailable. Reload before submitting.");
  const campaign = decodeContributorCampaign(campaignCell,protocol);
  const identity = await loadContributorIdentity(signer,protocolCell,protocol);
  const eligibility = await loadContributorEligibility(identity,campaign);
  return {protocolCell,protocol,campaign,identity,eligibility};
}
