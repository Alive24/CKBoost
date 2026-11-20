import { ccc, ssri } from "@ckb-ccc/connector-react";
import { Campaign } from "ssri-ckboost";
import { CampaignData, ProtocolData, type CampaignDataLike, type QuestDataLike } from "ssri-ckboost/types";
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { buildQuestChainStub, buildQuestContentPayload, getQuestContentNeventId, mergeQuestContentPayload, QUEST_CONTENT_FORMAT, QUEST_CONTENT_VERSION } from "@/lib/utils/campaign-nostr-content";
import { registerPendingTransaction } from "@/lib/pending-transactions";
import { encodeCreationDescription } from "./creation-content";
import { getCreationCapabilities } from "./creation-authorization";
import { assertCreationEditDeployment } from "./creation-deployment";
import { createCreationCampaignService } from "./creation-service";
import { creationScheduleUnix, getCreationQuestDeletionReason, validateCreation, type CreationModel } from "./creation-model";

export type CreationPublishStage = "storage" | "wallet" | "broadcast" | "confirming" | "confirmed";
export interface CreationStorageInput {
  campaignTypeId:string;contentType:"cover_image"|"long_description"|"quest_content";content:string;metadata?:Record<string,string>;
}
export interface CreationPublishOptions {
  model:CreationModel; signer:ccc.Signer; expectedSignerLockHash:string; expectedProtocolHash?:string; campaignTypeId?:string;
  /** Re-check the mounted account after every asynchronous storage step. */
  isCurrentAccount:()=>boolean;
  storeContent:(input:CreationStorageInput)=>Promise<string>;
  fetchContent?:(reference:string)=>Promise<string|null>;
  onStage:(stage:CreationPublishStage,detail:string)=>void;
}

/** Only editable content comes from the draft. Counters, assets and acceptance
 * state are always copied from the current chain cell. */
export function buildCreationQuest(model:CreationModel, index:number, current?:QuestDataLike):QuestDataLike {
  const quest=model.quests[index];
  return {
    quest_id:quest.id,
    metadata:{...current?.metadata,title:quest.title.trim(),short_description:quest.description,long_description:current?.metadata.long_description??quest.longDescription??quest.description,
      requirements:current?.metadata.requirements??quest.requirements??"",difficulty:quest.difficulty,time_estimate:BigInt(quest.minutes)},
    points:BigInt(quest.points),rewards_on_completion:current?.rewards_on_completion??quest.rewardAssets??[],
    accepted_submission_user_type_ids:current?.accepted_submission_user_type_ids??[],
    completion_deadline:current?.completion_deadline??BigInt(creationScheduleUnix(model,"end")),
    status:current?.status??0,completion_count:current?.completion_count??0,
    sub_tasks:quest.subtasks.map(task=>({id:task.id,title:task.title.trim(),type:task.type,description:task.description,proof_required:task.evidence,
      ...(typeof task.required==="boolean"?{required_response:task.required}:{})})),
  };
}

export async function publishCreation(options:CreationPublishOptions):Promise<string> {
  const {model,signer,campaignTypeId,onStage}=options;
  if(Object.keys(validateCreation(model)).length) throw new Error("Complete the required campaign fields before publishing.");
  const assertAccount=async()=>{
    if(!options.isCurrentAccount()) throw new Error("The connected account changed. Reopen this draft with its original account.");
    const hash=(await signer.getRecommendedAddressObj()).script.hash();
    if(hash.toLowerCase()!==options.expectedSignerLockHash.toLowerCase()||!options.isCurrentAccount()) throw new Error("The connected account changed. Reopen this draft with its original account.");
    return hash;
  };
  const loadAuthority=async()=>{
    const hash=await assertAccount();
    const cell=await fetchProtocolCell(signer.client);
    if(!cell) throw new Error("The current protocol could not be loaded. Nothing was published.");
    if(options.expectedProtocolHash&&cell.cellOutput.type?.hash().toLowerCase()!==options.expectedProtocolHash.toLowerCase()) throw new Error("The current protocol changed. Reopen this draft before publishing.");
    const data=ProtocolData.decode(cell.outputData);
    const permission=getCreationCapabilities(hash,cell,data);
    if(!campaignTypeId&&!permission.canCreateCampaign) throw new Error("Only a currently authorized Organizer or platform admin can create campaigns.");
    return {hash,cell,data};
  };
  const initial=await loadAuthority();
  const campaignHash=ccc.hexFrom(initial.data.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash);
  let existing:ccc.Cell|null=null;
  let current:CampaignDataLike|undefined;
  const resolvedQuests=new Map<number,QuestDataLike>();
  let changedRequirements:number[]=[];
  let deletedIds:number[]=[];
  const verifyRequirements=async(authority:typeof initial)=>{
    if(!campaignTypeId||(!changedRequirements.length&&!deletedIds.length))return;
    const protocolHash=authority.cell.cellOutput.type?.hash();
    if(!protocolHash) throw new Error("The current protocol is unavailable.");
    const checker=createCreationCampaignService(signer,authority.cell,authority.data);
    const review=await checker.fetchCampaignSubmissions(campaignTypeId as ccc.Hex);
    for(const id of changedRequirements){
      const chain=current?.quests.find(item=>Number(item.quest_id)===id);
      if(chain?.accepted_submission_user_type_ids.length||review.submissions.get(id)?.length) throw new Error(`Quest #${id} has submissions. Its response requirements are locked.`);
    }
    for(const id of deletedIds){
      const chain=review.campaignData?.quests.find(quest=>Number(quest.quest_id)===id)??current?.quests.find(quest=>Number(quest.quest_id)===id);
      if(!chain)throw new Error(`Quest #${id} changed on-chain. Reload before deleting it.`);
      const reason=getCreationQuestDeletionReason(chain,review.submissions.get(id)?.length??0);
      if(reason)throw new Error(`Quest #${id}: ${reason}`);
    }
  };
  if(campaignTypeId){
    existing=(await fetchCampaignByTypeId(campaignTypeId as ccc.Hex,campaignHash,signer.client,initial.cell))??null;
    if(!existing?.cellOutput.type) throw new Error("Campaign not found. Refresh before editing.");
    current=CampaignData.decode(existing.outputData);
    const permission=getCreationCapabilities(initial.hash,initial.cell,initial.data,{id:campaignTypeId,cell:existing,data:current});
    if(!permission.canEditCampaign)throw new Error("Only the currently authorized Organizer who owns this campaign, or a platform admin, can edit it.");
    assertCreationEditDeployment(permission.roles.admin,existing.cellOutput.lock.codeHash);
    if(model.sourceOutPoint&&model.sourceOutPoint!==`${existing.outPoint.txHash}:${String(existing.outPoint.index)}`) throw new Error("This campaign changed on-chain. Reload it before saving your edits.");
    if(!model.original||String(current.metadata.last_updated)!==String(model.original.metadata.last_updated)) throw new Error("This campaign changed on-chain. Reload it before saving your edits.");
    const ids=new Set(model.quests.map(quest=>quest.id));
    deletedIds=current.quests.filter(quest=>!ids.has(Number(quest.quest_id))).map(quest=>Number(quest.quest_id));
    // Deletion keeps every other ID unchanged and does not need the removed
    // quest's off-chain definition. Its current submissions are checked below.
    for(const quest of current.quests){
      if(!ids.has(Number(quest.quest_id)))continue;
      let resolved=quest;
      const reference=getQuestContentNeventId(quest);
      if(reference){
        const content=await options.fetchContent?.(reference);
        const merged=content?mergeQuestContentPayload(quest,content):null;
        if(!merged)throw new Error(`Quest #${Number(quest.quest_id)} content could not be verified. Reload before editing.`);
        resolved=merged;
      }
      resolvedQuests.set(Number(quest.quest_id),resolved);
    }
    changedRequirements=model.quests.filter(quest=>{const fresh=resolvedQuests.get(quest.id);return fresh&&JSON.stringify(quest.subtasks.map(task=>[task.id,task.required]))!==JSON.stringify(fresh.sub_tasks.map(task=>[Number(task.id),(task as {required_response?:boolean}).required_response]));}).map(quest=>quest.id);
    await verifyRequirements(initial);
  }
  onStage("storage","Verifying campaign content on the configured Nostr relays…");
  const reference=campaignTypeId??`draft-${crypto.randomUUID()}`;
  const quests:QuestDataLike[]=[];
  for(let index=0;index<model.quests.length;index++){
    const quest=model.quests[index];
    const old=resolvedQuests.get(quest.id);
    const normalized=buildCreationQuest(model,index,old);
    const content=JSON.stringify(buildQuestContentPayload(normalized),(_key,value)=>typeof value==="bigint"?value.toString():value);
    const nevent=await options.storeContent({campaignTypeId:reference,contentType:"quest_content",content,metadata:{format:"json",type:"quest_content",content_format:QUEST_CONTENT_FORMAT,version:String(QUEST_CONTENT_VERSION),quest_id:String(quest.id)}});
    await assertAccount();
    quests.push(buildQuestChainStub(normalized,nevent));
  }
  let image=model.cover;
  if(model.coverDirty&&image) image=await options.storeContent({campaignTypeId:reference,contentType:"cover_image",content:image,metadata:{encoding:"base64",type:"cover_image"}});
  await assertAccount();
  const description=await options.storeContent({campaignTypeId:reference,contentType:"long_description",content:encodeCreationDescription(model.description,model.timeZone),metadata:{format:"html",type:"long_description"}});
  // Fetch a fresh protocol snapshot again after relay work. A stale admin flag
  // or wallet switch must never authorize the transaction.
  const authority=await loadAuthority();
  if(ccc.hexFrom(authority.data.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash).toLowerCase()!==campaignHash.toLowerCase())throw new Error("Campaign contract configuration changed while content was being verified. Reload before publishing.");
  if(campaignTypeId){
    const latest=await fetchCampaignByTypeId(campaignTypeId as ccc.Hex,campaignHash,signer.client,authority.cell);
    if(!latest||!existing||latest.outPoint.txHash!==existing.outPoint.txHash||latest.outPoint.index!==existing.outPoint.index) throw new Error("This campaign changed while content was being verified. Reload before saving.");
    const latestData=CampaignData.decode(latest.outputData);
    const permission=getCreationCapabilities(authority.hash,authority.cell,authority.data,{id:campaignTypeId,cell:latest,data:latestData});
    if(!permission.canEditCampaign)throw new Error("Campaign editing access changed while content was being verified. Your draft is preserved.");
    assertCreationEditDeployment(permission.roles.admin,latest.cellOutput.lock.codeHash);
  }
  // Pending contributor responses live in user cells, so they can change even
  // while the campaign outpoint is unchanged. Recheck after relay verification.
  await verifyRequirements(authority);
  const now=BigInt(Math.floor(Date.now()/1000));
  const data:CampaignDataLike={
    ...current,endorser_lock_hash:current?.endorser_lock_hash??authority.hash,staff_lock_hash_vec:model.staff as ccc.Hex[],
    created_at:current?.created_at??now,starting_time:BigInt(creationScheduleUnix(model,"start")),ending_time:BigInt(creationScheduleUnix(model,"end")),
    rules:model.rules.filter(rule=>rule.trim()),metadata:{...current?.metadata,title:model.title.trim(),short_description:model.summary.trim(),long_description:description,
      image_url:image,total_rewards:current?.metadata.total_rewards??{points_amount:0,ckb_amount:0,nft_assets:[],udt_assets:[]},
      verification_requirements:current&&Number(current.metadata.verification_requirements[0]??0)===model.verification?current.metadata.verification_requirements:[model.verification],last_updated:now,categories:model.categories,difficulty:model.difficulty},
    quests,status:current?.status??0,participants_count:current?.participants_count??0,total_completions:current?.total_completions??0,
  };
  const outPoint=deploymentManager.getContractOutPoint(deploymentManager.getCurrentNetwork(),"ckboostCampaignType");
  const deployedHash=deploymentManager.getContractCodeHash(deploymentManager.getCurrentNetwork(),"ckboostCampaignType");
  const protocolHash=authority.cell.cellOutput.type?.hash();
  if(!outPoint||!protocolHash||deployedHash?.toLowerCase()!==campaignHash.toLowerCase()) throw new Error("Campaign deployment does not match the current protocol configuration. Reload before publishing.");
  const executor=new ssri.ExecutorJsonRpc(process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL||"http://localhost:9090");
  const instance=new Campaign(outPoint,existing?.cellOutput.type??ccc.Script.from({codeHash:campaignHash,hashType:"type",args:"0x"}),authority.cell,{executor});
  const service=createCreationCampaignService(signer,authority.cell,authority.data,instance);
  onStage("wallet","Build the transaction and approve it in your connected wallet.");
  await assertAccount();
  const txHash=await service.updateCampaign(data,undefined,undefined);
  onStage("broadcast","Transaction sent to the network.");
  registerPendingTransaction(txHash,{label:campaignTypeId?"Update campaign":"Launch campaign",description:model.title,context:"revamp-creation"});
  onStage("confirming","Waiting for the transaction to be confirmed on-chain.");
  return txHash;
}
