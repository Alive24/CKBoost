"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData,type QuestDataLike } from "ssri-ckboost/types";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { DEFAULT_NOSTR_RELAYS, useNostr } from "@/lib/providers/nostr-provider";
import { fetchNeventWithCache } from "@/lib/nostr/browser-fetch";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { getQuestContentNeventId, mergeQuestContentPayload, parseQuestContentPayload, unwrapStorageReference } from "@/lib/utils/campaign-nostr-content";
import type { CampaignDisplay } from "@/lib/utils/campaign-utils";
import { useNostrStorage } from "@/hooks/use-nostr-storage";
import { UserService } from "@/lib/services/user-service";
import { usePendingTransactions } from "@/lib/providers/pending-transaction-provider";
import { createContributorSigner } from "./contributor-transaction";
import { loadContributorStats } from "./contributor-stats";
import { contributorCapabilities, contributorQuestState, decodeContributorCampaign, loadContributorEligibility, loadContributorIdentity, refreshContributorFacts, type ContributorIdentity } from "./contributor-data";
import { decodeCreationDescription } from "./creation-content";
import { buildContributorSubmission, contributorTasks, validateContributorResponses, type ContributorResponses } from "./contributor-model";

function eventContent(content: string): string {
  try { const value: unknown = JSON.parse(content); if(value && typeof value==="object" && (value as {format?:unknown}).format==="ckboost-campaign-long-description" && typeof (value as {contentHtml?:unknown}).contentHtml==="string") return (value as {contentHtml:string}).contentHtml; if (value && typeof value === "object" && typeof (value as {content?:unknown}).content === "string") return (value as {content:string}).content; } catch { /* Direct content is supported. */ }
  return content;
}
export function useContributorCampaign(campaignId: string) {
  const { client } = ccc.useCcc();
  const signer = ccc.useSigner();
  const protocolContext = useProtocol();
  const { protocolCell } = protocolContext;
  // ProtocolProvider's grant editor has local unsaved whitelist changes. Only
  // the fetched cell is authoritative for Organizer/admin/approval decisions.
  const protocolSnapshot=useMemo(()=>{
    if(!protocolCell)return{data:null,error:null};
    try{return{data:ProtocolData.decode(protocolCell.outputData),error:null};}
    catch{return{data:null,error:"The protocol data is invalid. Reload before continuing."};}
  },[protocolCell]);
  const protocolData=protocolSnapshot.data;
  const { nostr } = useNostr();
  const [revision,setRevision] = useState(0);
  const reload = useCallback(() => {setRevision(value => value+1);if(protocolContext.error)void protocolContext.refreshProtocolData().catch(error=>console.warn("Protocol refresh failed",error));},[protocolContext.error,protocolContext.refreshProtocolData]);
  const [loaded,setLoaded] = useState<{id:string;protocolCell:ccc.Cell;campaign:CampaignDisplay}|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [loading,setLoading] = useState(false);
  const [content,setContent] = useState<{campaign:CampaignDisplay;description:string;quests:QuestDataLike[];errors:Record<number,string>;error:string|null;loading:boolean}|null>(null);
  const [account,setAccount] = useState<{signer:ccc.Signer;campaign:CampaignDisplay;identity:ContributorIdentity|null;eligible:boolean;missing:string[];error:string|null}|null>(null);
  const [evidence,setEvidence] = useState<{identity:ContributorIdentity;values:Record<number,string>;errors:Record<number,string>}|null>(null);
  const [stats,setStats]=useState<{campaign:CampaignDisplay;participants:number;submissions:number;error:boolean}|null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!protocolCell || !protocolData) return;
    if (!/^0x[0-9a-f]{64}$/i.test(campaignId)) { setError("This campaign link is invalid."); return; }
    setLoading(true);
    fetchCampaignByTypeId(campaignId as ccc.Hex,ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),client,protocolCell).then(cell => {
      if (!cell) throw new Error("The campaign was not found or could not be loaded.");
      const campaign = decodeContributorCampaign(cell,protocolData);
      if (!cancelled) setLoaded({id:campaignId,protocolCell,campaign});
    }).catch(error => { if (!cancelled) {setLoaded(null);setError(error instanceof Error ? error.message : "Unable to load campaign.");} }).finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled=true;};
  },[client,protocolCell,protocolData,campaignId,revision]);
  const campaign = loaded?.id === campaignId && loaded.protocolCell === protocolCell ? loaded.campaign : null;
  useEffect(()=>{if(!campaign || !protocolCell || !protocolData)return;let cancelled=false;loadContributorStats(client,protocolCell,protocolData,campaignId,campaign.quests.map(quest=>Number(quest.quest_id)),()=>cancelled).then(counts=>{if(!cancelled)setStats({campaign,...counts,error:false});}).catch(()=>{if(!cancelled)setStats({campaign,participants:0,submissions:0,error:true});});return()=>{cancelled=true;};},[client,campaign,protocolCell,protocolData,campaignId]);
  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    setContent({campaign,description:"",quests:[],errors:{},error:null,loading:true});
    const fetchText = async (reference:string) => eventContent((await fetchNeventWithCache({nostr,neventId:reference,configuredRelays:DEFAULT_NOSTR_RELAYS})).event.content);
    const errors:Record<number,string> = {};
    const quests = Promise.all(campaign.quests.map(async quest => {
      const reference = getQuestContentNeventId(quest);
      if (!reference) return quest;
      try {
        const raw=await fetchText(reference),payload=parseQuestContentPayload(raw);
        if (!payload || Number(payload.quest_id)!==Number(quest.quest_id) || !payload.sub_tasks.every(task=>task && typeof task.title==="string" && typeof task.type==="string" && typeof task.description==="string" && typeof task.proof_required==="string" && ((task as {required_response?:unknown}).required_response===undefined || typeof (task as {required_response?:unknown}).required_response==="boolean"))) throw new Error("Invalid quest requirements.");
        const resolved = mergeQuestContentPayload(quest,raw);
        if (!resolved) throw new Error("Invalid quest content.");
        return resolved;
      } catch {errors[Number(quest.quest_id)]="Quest requirements could not be loaded. Retry before submitting.";return quest;}
    }));
    const description = (async () => {
      let value = campaign.metadata.long_description;
      for (let depth=0;depth<3;depth++) {
        value = unwrapStorageReference(value);
        if (!value.startsWith("nevent1")) return decodeCreationDescription(eventContent(value)).description;
        value = await fetchText(value);
      }
      throw new Error("The campaign description could not be resolved.");
    })();
    Promise.allSettled([description,quests]).then(([descriptionResult,questResult]) => {
      if (cancelled) return;
      setContent({campaign,description:descriptionResult.status === "fulfilled" ? descriptionResult.value : "",quests:questResult.status === "fulfilled" ? questResult.value : campaign.quests,errors,error:descriptionResult.status === "rejected" ? "Campaign description is unavailable. Retry to load it." : null,loading:false});
    });
    return () => {cancelled=true;};
  },[campaign,nostr,revision]);
  useEffect(() => {
    if (!signer || !campaign || !protocolCell || !protocolData) return;
    let cancelled=false;
    (async () => {
      const identity = await loadContributorIdentity(signer,protocolCell,protocolData);
      const eligibility = await loadContributorEligibility(identity,campaign);
      if (!cancelled && (await signer.getRecommendedAddressObj()).script.hash() === identity.lockHash) setAccount({signer,campaign,identity,eligible:eligibility.eligible,missing:eligibility.missingVerifications,error:null});
    })().catch(error => {if (!cancelled) setAccount({signer,campaign,identity:null,eligible:false,missing:[],error:error instanceof Error ? error.message : "Your profile could not be loaded."});});
    return () => {cancelled=true;};
  },[signer,campaign,protocolCell,protocolData,revision]);
  const currentAccount = signer && account?.signer === signer && account.campaign === campaign ? account : null;
  const identity = currentAccount?.identity ?? null;
  useEffect(() => {
    if (!identity || !campaign) return;
    let cancelled=false;
    const values:Record<number,string> = {}, errors:Record<number,string> = {};
    Promise.all(campaign.quests.map(async quest => {
      const state = contributorQuestState(campaign,identity,Number(quest.quest_id));
      if (!state.submission) return;
      const reference = unwrapStorageReference(state.submission.submission_content);
      try { values[Number(quest.quest_id)] = reference.startsWith("nevent1") ? eventContent((await fetchNeventWithCache({nostr,neventId:reference,configuredRelays:DEFAULT_NOSTR_RELAYS})).event.content) : reference; }
      catch { errors[Number(quest.quest_id)]="Your submitted evidence is unavailable. Retry before editing."; }
    })).then(() => {if (!cancelled) setEvidence({identity,values,errors});});
    return () => {cancelled=true;};
  },[identity,campaign,nostr,revision]);
  return {stats:stats?.campaign===campaign ? stats : null,campaign,protocol:protocolData,protocolCell,signer,identity,eligible:currentAccount?.eligible ?? false,missing:currentAccount?.missing ?? [],accountError:currentAccount?.error ?? null,accountLoading:Boolean(signer && campaign && !currentAccount),description:content?.campaign===campaign ? content.description : "",quests:content?.campaign===campaign ? content.quests : [],contentLoading:content?.campaign!==campaign || content.loading,contentErrors:content?.campaign===campaign ? content.errors : {},descriptionError:content?.campaign===campaign ? content.error : null,evidence:identity && evidence?.identity===identity ? evidence.values : {},evidenceErrors:identity && evidence?.identity===identity ? evidence.errors : {},evidenceLoading:Boolean(identity && evidence?.identity!==identity),loading:protocolContext.isLoading || loading || (!campaign && !error && !protocolSnapshot.error && !protocolContext.error),error:error || protocolSnapshot.error || protocolContext.error,reload};
}

export type ContributorSubmissionStage = "uploading" | "signing" | "broadcasting" | "submitted" | "confirmed" | "error";
export interface ContributorTransaction {stage:ContributorSubmissionStage;questId:number;txHash?:ccc.Hex;neventId?:string;verifiedCopies?:number;error?:string;minimized:boolean;walletStarted:boolean}
export function useContributorSubmit(onConfirmed:()=>void) {
  const signer = ccc.useSigner();
  const currentSigner = useRef(signer); currentSigner.current=signer;
  const {storeSubmission} = useNostrStorage();
  const {confirmationTarget}=usePendingTransactions();
  const [transaction,setTransaction] = useState<ContributorTransaction|null>(null);
  const inFlight=useRef(false), cancelled=useRef(false);
  const retryConfirmation=useRef<(()=>Promise<void>)|null>(null);
  const unresolved=useRef<ContributorTransaction|null>(null);
  useEffect(()=>()=>{cancelled.current=true;},[]);
  const submit=async (input:{campaign:CampaignDisplay;identity:ContributorIdentity;quest:QuestDataLike;responses:ContributorResponses;editing:boolean;name:string}) => {
    if (inFlight.current) return;
    if (unresolved.current) {setTransaction({...unresolved.current,stage:"error",minimized:false,error:"A submitted transaction is still awaiting confirmation. Retry confirmation before sending another response."});return;}
    inFlight.current=true; cancelled.current=false; retryConfirmation.current=null;
    const capturedSigner=signer;
    const questId=Number(input.quest.quest_id);
    const assertIdentity=async () => {
      if (!capturedSigner || currentSigner.current!==capturedSigner || capturedSigner!==input.identity.signer || cancelled.current || (await capturedSigner.getRecommendedAddressObj()).script.hash().toLowerCase()!==input.identity.lockHash.toLowerCase()) throw new Error("The wallet changed or submission was cancelled. Reopen this quest with the current wallet.");
    };
    const check=async () => {
      await assertIdentity();
      const facts=await refreshContributorFacts(capturedSigner!,input.campaign.typeId as ccc.Hex,input.identity.protocolHash);
      await assertIdentity();
      const capabilities=contributorCapabilities(facts.campaign,facts.protocol,facts.identity,facts.eligibility.eligible,questId,facts.protocolCell);
      if (!(input.editing ? capabilities.canEditSubmission : capabilities.canSubmitQuest)) throw new Error("This quest can no longer be submitted or edited. Reload to check its approval, deadline, eligibility and submission status.");
      if(input.editing){
        const original=contributorQuestState(input.campaign,input.identity,questId).submission;
        const current=contributorQuestState(facts.campaign,facts.identity,questId).submission;
        if(input.identity.userTypeId?.toLowerCase()!==facts.identity.userTypeId?.toLowerCase() || !original || !current || ccc.stringify(original)!==ccc.stringify(current))throw new Error("Your saved response changed. Reload its latest version before editing.");
      }
      const freshQuest=facts.campaign.quests.find(quest=>Number(quest.quest_id)===questId);
      const originalQuest=input.campaign.quests.find(quest=>Number(quest.quest_id)===questId);
      if (!freshQuest || ccc.stringify(freshQuest.metadata)!==ccc.stringify(originalQuest?.metadata) || ccc.stringify(freshQuest.sub_tasks)!==ccc.stringify(originalQuest?.sub_tasks)) throw new Error("This quest was updated. Reload its current requirements before submitting.");
      if (!facts.identity.userTypeId && !input.name.trim()) throw new Error("Enter a display name to create your profile.");
      return facts;
    };
    try {
      setTransaction({stage:"uploading",questId,minimized:false,walletStarted:false});
      if (Object.keys(validateContributorResponses(contributorTasks(input.quest.sub_tasks),input.responses)).length) throw new Error("Complete the required responses before submitting.");
      await check();
      const result=await storeSubmission.mutateAsync({campaignTypeId:input.campaign.typeId!,questId,userAddress:input.identity.address,content:buildContributorSubmission(contributorTasks(input.quest.sub_tasks),input.responses),timestamp:Date.now()});
      const facts=await check();
      setTransaction({stage:"signing",questId,minimized:false,walletStarted:true,neventId:result.neventId,verifiedCopies:result.verifiedRelays.length});
      // Recheck on the final wallet send as well as before building the transaction.
      // The existing SDK combines wallet signature and broadcast in sendTransaction.
      const original=facts.identity.signer;
      const guardedSigner=createContributorSigner(original,check,()=>setTransaction(current=>current ? {...current,stage:"broadcasting"}:null));
      const service=new UserService(guardedSigner,ccc.hexFrom(facts.protocol.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash),facts.identity.protocolHash,true);
      const {txHash}=await service.submitQuestWithAutoCreate(input.campaign.typeId as ccc.Hex,questId,result.neventId,facts.protocolCell,facts.identity.userTypeId ? undefined : {name:input.name.trim()});
      const confirm=async () => {
        unresolved.current={stage:"submitted",questId,txHash,neventId:result.neventId,verifiedCopies:result.verifiedRelays.length,minimized:false,walletStarted:true};
        setTransaction(current=>({...current!,stage:"submitted",txHash,error:undefined,walletStarted:true}));
        const committed=await original.client.waitTransaction(txHash,confirmationTarget,300_000,2_000);
        if (!committed) throw new Error("The transaction has not been confirmed yet. Check its status before retrying confirmation.");
        unresolved.current=null;
        setTransaction(current=>({...current!,stage:"confirmed",txHash,error:undefined,walletStarted:true}));
        if (currentSigner.current===capturedSigner) onConfirmed();
      };
      retryConfirmation.current=confirm;
      await confirm();
    } catch(error) {setTransaction(current=>current ? {...current,stage:"error",error:error instanceof Error ? error.message : "Submission failed. Your draft is still available."} : null);}
    finally {inFlight.current=false;}
  };
  return {transaction,submit,busy:transaction?.stage==="uploading" || transaction?.stage==="signing" || transaction?.stage==="broadcasting" || transaction?.stage==="submitted",minimize:()=>setTransaction(current=>current ? {...current,minimized:!current.minimized}:null),dismiss:()=>{if(!inFlight.current)setTransaction(null);},cancel:()=>{if(transaction?.stage==="uploading"){cancelled.current=true;setTransaction(null);}},retry:async()=>{if(!retryConfirmation.current||inFlight.current)return;inFlight.current=true;try{await retryConfirmation.current();}catch(error){setTransaction(current=>current ? {...current,stage:"error",error:error instanceof Error ? error.message:"Confirmation is unavailable."}:null);}finally{inFlight.current=false;}}};
}
