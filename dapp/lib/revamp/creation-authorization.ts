import { ccc } from "@ckb-ccc/connector-react";
import { CampaignData, ProtocolData, type CampaignDataLike, type ProtocolDataLike } from "ssri-ckboost/types";
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { getCampaignCapabilities, verifyCampaignOwnership } from "./campaign-permissions";

export function getCreationCapabilities(lockHash:string,protocolCell:ccc.Cell,protocolData:ProtocolDataLike,campaign?:{id:string;cell:ccc.Cell;data:CampaignDataLike}) {
  const protocolTypeHash=protocolCell.cellOutput.type?.hash();
  if(!protocolTypeHash)throw new Error("The protocol type script is unavailable.");
  const ownership=campaign?verifyCampaignOwnership({campaignTypeId:campaign.id,protocolTypeHash,
    campaignTypeCodeHash:ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),
    protocolLockCodeHash:ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
    protocolLockHashType:protocolCell.cellOutput.lock.hashType,
    cell:campaign.cell}):null;
  return getCampaignCapabilities({signerLockHash:lockHash,protocol:{protocolTypeHash,
    adminLockHashes:protocolData.protocol_config.admin_lock_hash_vec.map(value=>ccc.hexFrom(value)),
    endorserLockHashes:protocolData.endorsers_whitelist.map(endorser=>ccc.hexFrom(endorser.endorser_lock_hash)),
    approvedCampaignTypeIds:protocolData.campaigns_approved.map(value=>ccc.hexFrom(value))},
    campaign:campaign?{typeId:campaign.id,ownershipVerified:ownership,staffLockHashes:campaign.data.staff_lock_hash_vec.map(value=>ccc.hexFrom(value)),
      startDate:Number(campaign.data.starting_time)*1000,endDate:Number(campaign.data.ending_time)*1000}:null});
}

export interface CreationAuthorizationSnapshot {
  signer:ccc.Signer;client:ccc.Client;campaignTypeId?:string;lockHash:string;protocolCell:ccc.Cell;protocolData:ProtocolDataLike;
  campaignCell?:ccc.Cell;campaignData?:CampaignDataLike;capabilities:ReturnType<typeof getCreationCapabilities>;
}

/** Entry authority is read from chain, never optimistic provider role state. */
export async function readCreationAuthorization(signer:ccc.Signer,campaignTypeId?:string,isCurrent:()=>boolean=()=>true):Promise<CreationAuthorizationSnapshot> {
  const assertCurrent=()=>{if(!isCurrent())throw new DOMException("The campaign access check expired or its account changed.","AbortError");};
  assertCurrent();
  if(campaignTypeId&&!/^0x[0-9a-f]{64}$/i.test(campaignTypeId))throw new Error("Invalid campaign ID.");
  const [address,protocolCell]=await Promise.all([signer.getRecommendedAddressObj(),fetchProtocolCell(signer.client)]);
  assertCurrent();
  if(!protocolCell)throw new Error("The current protocol could not be loaded.");
  const protocolData=ProtocolData.decode(protocolCell.outputData) as ProtocolDataLike;
  let campaignCell:ccc.Cell|undefined,campaignData:CampaignDataLike|undefined;
  if(campaignTypeId){
    campaignCell=await fetchCampaignByTypeId(campaignTypeId as ccc.Hex,ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),signer.client,protocolCell);
    assertCurrent();
    if(!campaignCell)throw new Error("Campaign not found.");
    campaignData=CampaignData.decode(campaignCell.outputData) as CampaignDataLike;
  }
  const lockHash=address.script.hash();
  assertCurrent();
  const capabilities=getCreationCapabilities(lockHash,protocolCell,protocolData,campaignTypeId&&campaignCell&&campaignData?{id:campaignTypeId,cell:campaignCell,data:campaignData}:undefined);
  return {signer,client:signer.client,campaignTypeId,lockHash,protocolCell,protocolData,campaignCell,campaignData,capabilities};
}
