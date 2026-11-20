"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ccc } from "@ckb-ccc/connector-react";
import { CampaignData, ConnectedTypeID } from "ssri-ckboost/types";
import { usePendingTransactions } from "@/lib/providers/pending-transaction-provider";
import { useNostrFetch } from "@/hooks/use-nostr-fetch";
import { useNostrStorage } from "@/hooks/use-nostr-storage";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { getQuestContentNeventId, mergeQuestContentPayload, unwrapStorageReference } from "@/lib/utils/campaign-nostr-content";
import { getCampaignCapabilities } from "@/lib/revamp/campaign-permissions";
import { useCreationAuthorization } from "@/lib/revamp/creation-access";
import { useCreationSubmissionCheck } from "@/lib/revamp/creation-submission-check";
import { creationDateInput } from "@/lib/revamp/creation-content";
import { applyCreationTemplate, cloneCreation, creationFromCampaign, creationScheduleUnix, getCreationQuestDeletionReason, newCreationModel, newCreationQuest, validateCreation, type CreationErrors, type CreationModel, type CreationQuest } from "@/lib/revamp/creation-model";
import { creationStorageKey, discardCreationChanges, readCreationStore, removeCreationDraft, saveCreationDraft, saveCreationTemplate, type CreationDraftRecord, type CreationTemplateRecord } from "@/lib/revamp/creation-store";
import { publishCreation, type CreationPublishStage } from "@/lib/revamp/creation-publish";
import { RevampSiteShell } from "./site-shell";
import { RevampAlert, RevampButton, RevampIcon, RevampInput, RevampSelect, RevampTag, RevampTextarea } from "./ui";
import { useRevampTheme } from "./theme";
import { CreationAsset, CreationField, CreationQuestEditor, creationDifficulties } from "./creation-quest-editor";
import { CreationPreview } from "./creation-preview";
import { CreationDateTimeField, CreationTimeZoneSelect } from "./creation-schedule";
import styles from "./creation-workspace.module.css";

type Tab="overview"|"quests"|"permission";
type Modal="drafts"|"templates"|"save-template"|"leave"|"delete"|"replace"|null;
type Launch={stage:CreationPublishStage;detail:string;txHash?:string;campaignId?:string;draftId?:string;scope?:string;error?:string;minimized:boolean};
const signature=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==="bigint"?item.toString():item);
const message=(error:unknown)=>error instanceof Error?error.message:"This action could not be completed. Please try again.";

function CreationCategories({values,disabled,onChange}:{values:string[];disabled:boolean;onChange:(values:string[])=>void}) {
  const [text,setText]=useState(values.join(", "));
  const [focused,setFocused]=useState(false);
  const parse=(raw:string)=>[...new Set(raw.split(",").map(value=>value.trim()).filter(Boolean))];
  useEffect(()=>{if(signature(parse(text))!==signature(values))setText(values.join(", "));},[values,text]);
  return <div className={styles.categoryControl} data-chips={Boolean(values.length&&!focused)}>
    <RevampInput aria-label="Campaign categories" value={text} disabled={disabled} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={event=>{setText(event.target.value);onChange(parse(event.target.value));}} placeholder="e.g. Development, Education"/>
    {values.length>0&&!focused&&<div className={styles.categoryTags}>{values.map((value,index)=><RevampTag key={value} tone={index%2?"teal":"cyan"}>{value}<button type="button" aria-label={`Remove category ${value}`} disabled={disabled} onClick={()=>{const next=values.filter(item=>item!==value);setText(next.join(", "));onChange(next);}}><CreationAsset name="close"/></button></RevampTag>)}</div>}
    <RevampIcon name="caret-down"/>
  </div>;
}

function CreationModal({open,title,description,onClose,children,kind}:{open:boolean;title:string;description?:string;onClose:()=>void;children:ReactNode;kind?:"save-template"|"compact"}) {
  const {portalContainer}=useRevampTheme();
  return <Dialog.Root open={open} onOpenChange={value=>{if(!value)onClose();}}><Dialog.Portal container={portalContainer??undefined}>
    <Dialog.Overlay className={styles.overlay}/><Dialog.Content className={styles.modal} data-kind={kind}>
      <div className={styles.modalHeader}><div><Dialog.Title className={styles.modalTitle}>{title}</Dialog.Title><Dialog.Description className={styles.modalDescription}>{description??"Review the campaign settings before continuing."}</Dialog.Description></div><Dialog.Close asChild><button type="button" className={styles.iconButton} aria-label="Close dialog"><CreationAsset name="close"/></button></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function LaunchDock({launch,onMinimize,onCheck,onContinue,editing,explorer}:{launch:Launch;onMinimize:()=>void;onCheck:()=>void;onContinue:()=>void;editing:boolean;explorer:string}) {
  const step=launch.stage==="storage"?0:launch.stage==="wallet"?1:launch.stage==="broadcast"?2:launch.stage==="confirming"?3:4;
  return <section className={styles.dock} role={launch.error?"alert":"status"} aria-label="Campaign publishing progress">
    <div className={styles.dockHeading}>
      <div className={styles.progressWheel} aria-label={`${step} of 4 steps complete`}>{[1,2,3,4].map(number=><img key={number} src={`/assets/revamp/creation-step${number}.svg`} alt="" data-step={number} data-complete={step>=number}/>)}<span>{step} / 4</span></div>
      <div><strong>{launch.stage==="confirmed"?"Campaign confirmed":"Campaign launch"}</strong><p>{launch.error?"Publishing stopped":launch.detail}</p></div><button type="button" className={styles.iconButton} onClick={onMinimize} aria-expanded={!launch.minimized} aria-label={launch.minimized?"Expand publishing progress":"Minimize publishing progress"}><img src="/assets/revamp/creation-minimize.svg" alt=""/></button>
    </div>
    {!launch.minimized&&<div className={styles.dockBody}>
      <ol>{["Upload and verify Nostr content","Sign the transaction in your wallet","Broadcast to CKB","Confirm on CKB"].map((label,index)=><li key={label} data-complete={index<step} aria-current={index===step?"step":undefined}>{index<step?<CreationAsset name="check"/>:index===step&&!launch.error?<img src="/assets/revamp/creation-spinner.svg" alt="" className={styles.spinning}/>:<span className={styles.stepDot}/>}<span>{label}</span></li>)}</ol>
      {launch.error&&<p className={styles.fieldError}>{launch.error}</p>}
      {launch.txHash&&<><a href={`${explorer}${launch.txHash}`} target="_blank" rel="noopener noreferrer" className={styles.hash}>View transaction ↗</a>{launch.stage!=="confirmed"&&<RevampButton variant="secondary" size="small" onClick={onCheck}>Check confirmation</RevampButton>}</>}
      {launch.stage==="confirmed"&&<div className={styles.modalActions}>{launch.campaignId&&<RevampButton asChild><Link href={`/revamp/campaign/${launch.campaignId}`}>View campaign</Link></RevampButton>}<RevampButton variant="secondary" onClick={onContinue}>{editing?"Reload campaign":"Create another campaign"}</RevampButton></div>}
      <p className={styles.caption}>{launch.stage==="confirmed"?"Public listing depends on platform approval.":"You can minimize this panel. Confirmation follows the actual network transaction."}</p>
    </div>}
  </section>;
}

export function CreationWorkspace({campaignTypeId}:{campaignTypeId?:string}) {
  const {client,open}=ccc.useCcc();
  const signer=ccc.useSigner();
  const {fetchSubmission}=useNostrFetch();
  const {storeCampaignContent}=useNostrStorage();
  const pending=usePendingTransactions();
  const router=useRouter();
  const {portalContainer}=useRevampTheme();
  const [model,setModel]=useState<CreationModel>(()=>newCreationModel());
  const [base,setBase]=useState<CreationModel>(()=>newCreationModel());
  const [draftId,setDraftId]=useState("");
  const [loadedScope,setLoadedScope]=useState<string|null>(null);
  const [loading,setLoading]=useState(Boolean(campaignTypeId));
  const [loadError,setLoadError]=useState<string|null>(null);
  const [loadAttempt,setLoadAttempt]=useState(0);
  const authorization=useCreationAuthorization(campaignTypeId,loadAttempt);
  const protocol={protocolCell:authorization.snapshot?.protocolCell??null,protocolData:authorization.snapshot?.protocolData??null,error:authorization.error??null};
  const [submissionAttempt,setSubmissionAttempt]=useState(0);
  const [tab,setTab]=useState<Tab>("overview");
  const [dirty,setDirty]=useState(false);
  const [autosaved,setAutosaved]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [errors,setErrors]=useState<CreationErrors>({});
  const [modal,setModal]=useState<Modal>(null);
  const [drafts,setDrafts]=useState<CreationDraftRecord[]>([]);
  const [templates,setTemplates]=useState<CreationTemplateRecord[]>([]);
  const [selection,setSelection]=useState("");
  const [templateName,setTemplateName]=useState("");
  const [replacement,setReplacement]=useState<{kind:"template";item:CreationTemplateRecord}|{kind:"draft";item:CreationDraftRecord}|null>(null);
  const [deleting,setDeleting]=useState<number|null>(null);
  const [leaveHref,setLeaveHref]=useState("/revamp");
  const [staffMethod,setStaffMethod]=useState("address");
  const [staffInput,setStaffInput]=useState("");
  const [staffAdding,setStaffAdding]=useState(false);
  const [launch,setLaunch]=useState<Launch|null>(null);
  const autosaveEnabled=useRef(true);
  const accountRef=useRef({signer,hash:""});
  const scopeRef=useRef<string|null>(null);
  const operationRef=useRef(0);
  const editorRef=useRef(0);
  const editableRef=useRef(false);
  const draftSnapshotRef=useRef<{scope:string;draftId:string;model:CreationModel;dirty:boolean}|null>(null);
  const modelRef=useRef(model);modelRef.current=model;
  const identityHash=authorization.snapshot?.lockHash??null;
  accountRef.current={signer,hash:identityHash??""};
  const protocolHash=protocol.protocolCell?.cellOutput.type?.hash();
  const scope=useMemo(()=>identityHash&&protocolHash?creationStorageKey({network:deploymentManager.getCurrentNetwork(),protocol:protocolHash,wallet:identityHash}):null,[identityHash,protocolHash]);
  scopeRef.current=scope;
  const capabilities=authorization.snapshot?.capabilities??getCampaignCapabilities({signerLockHash:null,protocol:null});
  const allowed=campaignTypeId?capabilities.canEditCampaign:capabilities.canCreateCampaign;
  const busy=Boolean(launch&&!launch.error&&launch.stage!=="confirmed");
  const editable=allowed&&!loading&&!loadError&&!busy&&launch?.stage!=="confirmed"&&Boolean(scope&&loadedScope===scope);
  editableRef.current=editable;
  if(scope&&loadedScope===scope&&allowed)draftSnapshotRef.current={scope,draftId,model,dirty};
  const validation=useMemo(()=>validateCreation(model),[model]);
  const blocked=Object.keys(validation).length>0;
  useEffect(()=>{setErrors(previous=>Object.keys(previous).length?validateCreation(model):previous);},[model]);

  useEffect(()=>{
    let cancelled=false;operationRef.current++;editorRef.current++;autosaveEnabled.current=false;setDirty(false);setAutosaved(false);setLoadedScope(null);setLaunch(null);setModal(null);setLoadError(null);setErrors({});setStaffAdding(false);setStaffInput("");
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
    const blank=newCreationModel(zone);setModel(blank);setBase(cloneCreation(blank));setDraftId(campaignTypeId?`edit:${campaignTypeId}`:crypto.randomUUID());
    if(!scope){setLoading(false);return()=>{cancelled=true;};}
    const store=readCreationStore(scope);setTemplates(store.templates);setDrafts(store.drafts.filter(record=>campaignTypeId?record.id===`edit:${campaignTypeId}`:!record.id.startsWith("edit:")));
    const initialize=async()=>{
      let initial=blank;
      if(campaignTypeId){
        if(!/^0x[0-9a-f]{64}$/i.test(campaignTypeId))throw new Error("Invalid campaign ID.");
        if(!client||!protocol.protocolCell||!protocol.protocolData)throw new Error("The current protocol is not ready. Try again when it has loaded.");
        setLoading(true);
        const cell=authorization.snapshot?.campaignCell;
        if(!cell)throw new Error("Campaign not found.");
        const data=CampaignData.decode(cell.outputData);
        const descriptionRef=unwrapStorageReference(data.metadata.long_description);
        const [description,quests]=await Promise.all([
          descriptionRef.startsWith("nevent1")?fetchSubmission(descriptionRef).then(result=>{if(!result?.content)throw new Error("The campaign description could not be loaded from Nostr. Retry before editing.");return result.content;}):Promise.resolve(descriptionRef),
          Promise.all(data.quests.map(async quest=>{const ref=getQuestContentNeventId(quest);if(!ref)return quest;const result=await fetchSubmission(ref);if(!result?.content)throw new Error(`Quest #${Number(quest.quest_id)} content could not be loaded. Retry before editing.`);const resolved=mergeQuestContentPayload(quest,result.content);if(!resolved||getQuestContentNeventId(resolved))throw new Error(`Quest #${Number(quest.quest_id)} content is invalid.`);return resolved;})),
        ]);
        initial=creationFromCampaign(data,description,quests,zone);
        initial.sourceOutPoint=`${cell.outPoint.txHash}:${String(cell.outPoint.index)}`;
        initial.staff=data.staff_lock_hash_vec.map(value=>ccc.hexFrom(value));
      }
      if(cancelled)return;
      setModel(initial);setBase(cloneCreation(initial));setLoadedScope(scope);setLoading(false);autosaveEnabled.current=true;
      const candidates=readCreationStore(scope).drafts.filter(record=>campaignTypeId?record.id===`edit:${campaignTypeId}`:!record.id.startsWith("edit:"));setDrafts(candidates);
      if(candidates.length){setSelection(candidates[0].id);setModal("drafts");}
    };
    initialize().catch(failure=>{if(!cancelled){setLoading(false);setLoadError(message(failure));}});
    return()=>{cancelled=true;operationRef.current++;editorRef.current++;};
  // The scope identifies the account/protocol. Public provider refreshes must
  // not reset an in-progress editor; explicit retry reloads failed content.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scope,campaignTypeId,loadAttempt]);

  // The scan uses the successful fresh authority snapshot directly. A separate
  // ProtocolProvider read must not leave these controls permanently checking.
  const submissionCheck=useCreationSubmissionCheck(authorization.snapshot,campaignTypeId,Boolean(campaignTypeId&&allowed&&loadedScope===scope&&model.original),submissionAttempt);
  useEffect(()=>{
    if(!campaignTypeId||!model.original)return;
    const result=submissionCheck.result;
    const update=(value:CreationModel)=>({...value,quests:value.quests.map(quest=>{
      if(!quest.original)return {...quest,deletionBlockedReason:undefined};
      const current=result?.campaignData?.quests.find(item=>Number(item.quest_id)===quest.id)??quest.original;
      const count=result?result.submissions.get(quest.id)?.length??0:undefined;
      return {...quest,requiredLocked:count===undefined||Boolean(current.accepted_submission_user_type_ids.length||Number(current.completion_count)>0||count>0),deletionBlockedReason:getCreationQuestDeletionReason(current,count,Boolean(submissionCheck.error))};
    })});
    setModel(update);setBase(update);
  // Only the completed scan/state changes the locks; editing other fields does
  // not launch a new all-user scan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[campaignTypeId,loadedScope,Boolean(model.original),submissionCheck.result,submissionCheck.loading,submissionCheck.error]);

  useEffect(()=>{
    if(!scope||loadedScope!==scope||!dirty||!editable||!draftId||!autosaveEnabled.current)return;
    const timer=setTimeout(()=>{if(!autosaveEnabled.current||scopeRef.current!==scope)return;try{saveCreationDraft(scope,draftId,model);setAutosaved(true);}catch(failure){setError(`Autosave failed: ${message(failure)}`);}},700);
    return()=>clearTimeout(timer);
  },[scope,loadedScope,dirty,editable,draftId,model]);

  // Flush the latest authorized local draft when App Router navigation or a
  // wallet change unmounts this editor before the debounce interval finishes.
  // Explicit discard disables this synchronously, so discarded edits cannot return.
  useEffect(()=>{
    const flush=()=>{const snapshot=draftSnapshotRef.current;if(autosaveEnabled.current&&snapshot?.scope===scope&&snapshot.dirty){try{saveCreationDraft(snapshot.scope,snapshot.draftId,snapshot.model);}catch{/* A normal form action reports storage errors; traversal must not be interrupted. */}}};
    // popstate occurs after browser traversal and is not cancelable. Flush only;
    // do not rewind history or interfere with Next's ACTION_RESTORE handler.
    window.addEventListener("popstate",flush);
    return()=>{window.removeEventListener("popstate",flush);flush();};
  },[scope]);

  useEffect(()=>{
    if(!dirty||busy)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    const click=(event:MouseEvent)=>{const target=(event.target as Element|null)?.closest("a[href]") as HTMLAnchorElement|null;if(!target||target.target==="_blank"||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const url=new URL(target.href,location.href);if(url.origin!==location.origin||url.pathname===location.pathname&&url.search===location.search)return;event.preventDefault();event.stopPropagation();setLeaveHref(url.pathname+url.search+url.hash);setModal("leave");};
    window.addEventListener("beforeunload",unload);document.addEventListener("click",click,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",click,true);};
  },[dirty,busy]);

  useEffect(()=>{
    if(!launch?.txHash||launch.stage==="confirmed")return;
    const record=pending.pendingTransactions.find(item=>item.txHash===launch.txHash);
    if(record?.status==="finalized"){
      setLaunch(value=>value?{...value,stage:"confirmed",detail:"The transaction reached the configured on-chain confirmation target."}:null);
      setDirty(false);autosaveEnabled.current=false;
      const publishedScope=launch.scope??scope,publishedDraft=launch.draftId??draftId;
      if(publishedScope&&publishedDraft){try{removeCreationDraft(publishedScope,publishedDraft);}catch{/* Confirmation remains authoritative when optional local cleanup fails. */}}
      setDrafts(previous=>previous.filter(record=>record.id!==publishedDraft));setModal(previous=>previous==="drafts"?null:previous);
      setBase(cloneCreation(modelRef.current));
    }
  },[pending.pendingTransactions,launch?.txHash,launch?.stage,scope,draftId]);

  useEffect(()=>{
    if(!client||launch?.stage!=="confirmed"||!launch.txHash||launch.campaignId||!protocol.protocolData||!protocolHash)return;
    if(campaignTypeId){setLaunch(value=>value?{...value,campaignId:campaignTypeId}:null);return;}
    let cancelled=false;
    const codeHash=ccc.hexFrom(protocol.protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash);
    client.getTransaction(launch.txHash as ccc.Hex).then(response=>{
      const ids:string[]=[];
      for(const output of response?.transaction.outputs??[]){
        const script=output.type;if(!script||script.codeHash!==codeHash)continue;
        try{const args=ConnectedTypeID.decode(script.args);if(ccc.hexFrom(args.connected_key).toLowerCase()===protocolHash.toLowerCase())ids.push(ccc.hexFrom(args.type_id));}catch{/* Other output types do not identify this campaign. */}
      }
      if(!cancelled&&ids.length===1)setLaunch(value=>value?{...value,campaignId:ids[0]}:null);
    }).catch(()=>{/* The transaction link remains available when RPC details lag. */});
    return()=>{cancelled=true;};
  },[client,launch?.stage,launch?.txHash,launch?.campaignId,campaignTypeId,protocol.protocolData,protocolHash]);

  const change=useCallback((update:Partial<CreationModel>|((current:CreationModel)=>CreationModel))=>{
    if(!editable)return;setModel(current=>typeof update==="function"?update(current):{...current,...update});setDirty(true);setAutosaved(false);setError(null);setNotice(null);autosaveEnabled.current=true;
  },[editable]);
  const refreshLocal=()=>{if(scope){const store=readCreationStore(scope);setDrafts(store.drafts.filter(record=>campaignTypeId?record.id===`edit:${campaignTypeId}`:!record.id.startsWith("edit:")));setTemplates(store.templates);}};
  const save=()=>{if(!scope||!editable||scopeRef.current!==scope||accountRef.current.hash!==identityHash)return false;try{saveCreationDraft(scope,draftId,model,true);setBase(cloneCreation(model));setDirty(false);setAutosaved(true);setNotice("Draft saved on this device for this account.");refreshLocal();return true;}catch(failure){setError(message(failure));return false;}};
  const replace=()=>{
    if(!replacement||!editable)return;
    editorRef.current++;
    if(replacement.kind==="template"){
      const next=applyCreationTemplate(model,replacement.item.model);change(next);setNotice(`Applied template “${replacement.item.name}”. Dates and reviewers are unchanged.`);
    }else{
      const record=replacement.item;const restored=record.autosaved??record.saved;if(!restored)return;
      const resumed=cloneCreation(restored);resumed.quests=resumed.quests.map(quest=>quest.original?{...quest,requiredLocked:true,deletionBlockedReason:getCreationQuestDeletionReason(quest.original,undefined)}:quest);
      autosaveEnabled.current=false;setModel(resumed);setBase(cloneCreation(record.saved??resumed));setDraftId(record.id);setSubmissionAttempt(value=>value+1);setDirty(Boolean(record.saved&&signature(record.saved)!==signature(restored)));setAutosaved(true);setErrors({});setNotice("Draft resumed. Review its schedule before launch.");queueMicrotask(()=>{autosaveEnabled.current=true;});
    }
    setReplacement(null);setModal(null);
  };
  const selectReplacement=(value:typeof replacement)=>{setReplacement(value);setModal("replace");};
  const upload=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)||file.size>2*1024*1024){setError("Choose a PNG, JPEG, WebP or GIF image up to 2 MB.");return;}
    const originalScope=scope,generation=editorRef.current;const reader=new FileReader();reader.onload=()=>{if(originalScope===scopeRef.current&&generation===editorRef.current&&editableRef.current&&typeof reader.result==="string")change({cover:reader.result,coverDirty:true});};reader.readAsDataURL(file);
  };
  const changeZone=(timeZone:string)=>{
    try{const start=model.start?creationScheduleUnix(model,"start"):undefined,end=model.end?creationScheduleUnix(model,"end"):undefined;const startValue=start===undefined?"":creationDateInput(start,timeZone),endValue=end===undefined?"":creationDateInput(end,timeZone);change({timeZone,start:startValue,end:endValue,scheduleInstants:{start:start===undefined?undefined:{value:startValue,timeZone,unix:start},end:end===undefined?undefined:{value:endValue,timeZone,unix:end}}});}catch(failure){setError(message(failure));}
  };
  const addStaff=async()=>{
    if(!client||!editable)return;setStaffAdding(true);setError(null);const originalHash=identityHash,originalScope=scope,generation=editorRef.current;
    try{const hash=staffMethod==="hash"?staffInput.trim():(await ccc.Address.fromString(staffInput.trim(),client)).script.hash();if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error("Enter a complete CKB address or 32-byte lock hash.");if(model.staff.some(value=>value.toLowerCase()===hash.toLowerCase()))throw new Error("This reviewer is already assigned.");if(accountRef.current.hash!==originalHash||scopeRef.current!==originalScope||editorRef.current!==generation||!editableRef.current)throw new Error("The account or campaign draft changed.");change(current=>({...current,staff:[...current.staff,hash.toLowerCase()]}));setStaffInput("");}catch(failure){if(scopeRef.current===originalScope&&editorRef.current===generation)setError(message(failure));}finally{if(scopeRef.current===originalScope&&editorRef.current===generation)setStaffAdding(false);}
  };
  const startLaunch=async()=>{
    const nextErrors=validateCreation(model);setErrors(nextErrors);if(Object.keys(nextErrors).length){setTab(Object.keys(nextErrors).some(key=>key.startsWith("quest"))?"quests":"overview");setError("Complete the highlighted fields before publishing.");return;}
    if(!editable||!signer||!identityHash||!scope)return;
    // An explicit snapshot survives a rejected signature, reload or minimized dock.
    if(!save())return;
    const originalSigner=signer,originalHash=identityHash,operation=++operationRef.current;editorRef.current++;
    const currentOperation=()=>operationRef.current===operation&&scopeRef.current===scope;
    setLaunch({stage:"storage",detail:"Checking current Organizer access…",draftId,scope,minimized:false});setError(null);
    try{
      const txHash=await publishCreation({model:cloneCreation(model),signer,expectedSignerLockHash:identityHash,expectedProtocolHash:protocolHash,campaignTypeId,isCurrentAccount:()=>currentOperation()&&accountRef.current.signer===originalSigner&&accountRef.current.hash===originalHash,storeContent:input=>storeCampaignContent.mutateAsync(input),fetchContent:async reference=>(await fetchSubmission(reference))?.content??null,onStage:(stage,detail)=>{if(currentOperation())setLaunch(value=>value?{...value,stage,detail}:value);}});
      if(currentOperation())setLaunch(value=>value?{...value,txHash,stage:"confirming"}:value);
      try{localStorage.setItem(`${scope}:receipt`,JSON.stringify({txHash,campaignTypeId,draftId,title:model.title}));}catch{/* Global pending tracker also persists the transaction. */}
    }catch(failure){if(currentOperation()){setLaunch(value=>value?{...value,error:message(failure)}:value);setError(message(failure));}}
  };
  useEffect(()=>{if(!scope)return;try{const raw=localStorage.getItem(`${scope}:receipt`);if(!raw)return;const receipt=JSON.parse(raw);if(receipt.campaignTypeId!==campaignTypeId||!/^0x[0-9a-f]{64}$/i.test(receipt.txHash))return;const record=pending.pendingTransactions.find(item=>item.txHash===receipt.txHash);if(record?.status==="finalized"){if(typeof receipt.draftId==="string"){removeCreationDraft(scope,receipt.draftId);setDrafts(previous=>previous.filter(record=>record.id!==receipt.draftId));setSelection(previous=>previous===receipt.draftId?"":previous);setModal(previous=>previous==="drafts"?null:previous);}localStorage.removeItem(`${scope}:receipt`);return;}if(!record)pending.register(receipt.txHash,{label:"Campaign publishing",context:"revamp-creation"});setLaunch({stage:"confirming",detail:"Resumed tracking the published campaign transaction.",txHash:receipt.txHash,draftId:typeof receipt.draftId==="string"?receipt.draftId:undefined,scope,minimized:true});}catch{/* Optional receipt recovery. */}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scope,campaignTypeId]);

  const questUpdate=(quest:CreationQuest)=>change(current=>({...current,quests:current.quests.map(item=>item.id===quest.id?quest:item)}));
  const moveQuest=(index:number,delta:number)=>change(current=>{const quests=[...current.quests];[quests[index],quests[index+delta]]=[quests[index+delta],quests[index]];return{...current,quests};});
  const template=templates.find(item=>item.id===selection);
  const selectedDraft=drafts.find(item=>item.id===selection);
  const accessMessage=!signer?"Connect your wallet to create campaigns.":!identityHash?authorization.error??"Checking current Organizer access…":!allowed?(campaignTypeId?"Only the currently authorized Organizer who owns this campaign, or a platform admin, can edit it and assign reviewers.":"Only a currently authorized Organizer or platform admin can create campaigns."):null;

  return <RevampSiteShell><main id="revamp-main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/revamp">Campaigns</Link><span>/</span>{campaignTypeId?<Link href={`/revamp/campaign/${campaignTypeId}`}>Campaign</Link>:null}<span>{campaignTypeId?"Edit campaign":"Create campaign"}</span></nav>
    <div className={styles.heading}><div><div className={styles.titleRow}><h1>{campaignTypeId?"Edit campaign":"Create campaign"}</h1>{autosaved&&<span role="status">Autosaved</span>}</div><p>{campaignTypeId?"Update your campaign details, quests and reviewers.":"Set up your campaign, then add a quest before launch."}</p></div><div className={styles.headingActions}><RevampButton variant="secondary" disabled={!editable} onClick={()=>{refreshLocal();setSelection(drafts[0]?.id??"");setModal("drafts");}}>Drafts</RevampButton><DropdownMenu.Root><DropdownMenu.Trigger asChild><RevampButton variant="secondary" className={styles.templatesTrigger} disabled={!editable}>Templates <RevampIcon name="caret-down"/></RevampButton></DropdownMenu.Trigger><DropdownMenu.Portal container={portalContainer??undefined}><DropdownMenu.Content className={styles.menu} align="end"><DropdownMenu.Item disabled={Boolean(campaignTypeId)} onSelect={()=>{refreshLocal();setSelection(templates[0]?.id??"");setModal("templates");}}>Use campaign template</DropdownMenu.Item><DropdownMenu.Item onSelect={()=>{setTemplateName(model.title);setModal("save-template");}}>Save as template</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div></div>
    {error&&<RevampAlert tone="error">{error}</RevampAlert>}{notice&&(notice.startsWith("Applied template ")?<div className={styles.templateApplied} role="status"><strong>Template applied</strong><p>{notice}</p></div>:<RevampAlert tone="info">{notice}</RevampAlert>)}
    {submissionCheck.error&&<RevampAlert tone="error">{submissionCheck.error}<RevampButton variant="secondary" size="small" onClick={()=>setSubmissionAttempt(value=>value+1)}>Retry submission check</RevampButton></RevampAlert>}
    {authorization.error&&<RevampAlert tone="error">{authorization.error}<RevampButton variant="secondary" size="small" onClick={()=>setLoadAttempt(value=>value+1)}>Retry access check</RevampButton></RevampAlert>}
    {loadError&&<RevampAlert tone="error">{loadError}<RevampButton variant="secondary" size="small" onClick={()=>setLoadAttempt(value=>value+1)}>Retry loading</RevampButton></RevampAlert>}
    <div className={styles.columns}><div className={styles.editor} data-tab={tab}>
      <div className={styles.tabs} role="tablist" aria-label="Campaign setup">{(["overview","quests","permission"] as const).map(value=><button type="button" key={value} role="tab" id={`creation-tab-${value}`} aria-controls={`creation-panel-${value}`} aria-selected={tab===value} onClick={()=>setTab(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div>
      {loading?<div className={styles.panel} role="status">Loading campaign content…</div>:<div role="tabpanel" id={`creation-panel-${tab}`} aria-labelledby={`creation-tab-${tab}`} className={styles.form}>
      {tab==="overview"&&<>
        <section className={styles.panel}><h2>Campaign details</h2><fieldset className={styles.fields} disabled={!editable}>
          <CreationField label="Campaign title *" error={errors.title}><RevampInput aria-label="Campaign title" value={model.title} onChange={event=>change({title:event.target.value})} placeholder="Enter campaign title"/></CreationField>
          <CreationField label="One-sentence summary *" error={errors.summary}><RevampInput aria-label="Campaign summary" value={model.summary} onChange={event=>change({summary:event.target.value})} placeholder="A short introduction to your campaign"/></CreationField>
          <CreationField label="Full description" error={errors.description} hint="Markdown supported"><RevampTextarea aria-label="Full description" value={model.description} onChange={event=>change({description:event.target.value})} placeholder="Tell contributors about this campaign" className={styles.description}/></CreationField>
        </fieldset></section>
        <section className={`${styles.panel} ${styles.configPanel}`}><h2>Campaign Configurations</h2><fieldset className={styles.fields} disabled={!editable}>
          <div className={styles.upload}><div><strong>Campaign cover</strong><p>{model.cover?"Custom campaign cover":"Orbit · Default cover"}</p></div><div className={styles.uploadActions}>{model.cover&&<RevampButton variant="secondary" size="small" onClick={()=>change({cover:"",coverDirty:true})}>Remove</RevampButton>}<label className={styles.uploadButton} aria-disabled={!editable}>Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Upload campaign cover" onChange={upload} disabled={!editable}/></label></div></div>
          <div className={styles.threeColumns}>
            <CreationField label="Campaign time zone *"><CreationTimeZoneSelect value={model.timeZone} onChange={changeZone} disabled={!editable} dateValue={model.start}/></CreationField>
            <CreationField label="Start time *" error={errors.start}><CreationDateTimeField label="Start time" value={model.start} timeZone={model.timeZone} onChange={value=>change({start:value})} disabled={!editable} instant={model.scheduleInstants?.start?.value===model.start&&model.scheduleInstants.start.timeZone===model.timeZone?model.scheduleInstants.start.unix:undefined}/></CreationField>
            <CreationField label="End time *" error={errors.end}><CreationDateTimeField label="End time" value={model.end} timeZone={model.timeZone} onChange={value=>change({end:value})} disabled={!editable} instant={model.scheduleInstants?.end?.value===model.end&&model.scheduleInstants.end.timeZone===model.timeZone?model.scheduleInstants.end.unix:undefined}/></CreationField>
          </div>
          <div className={styles.metadataColumns}><CreationField label="Difficulty level *" error={errors.difficulty}><RevampSelect label="Campaign difficulty" value={String(model.difficulty)} options={creationDifficulties} onValueChange={value=>change({difficulty:Number(value)})} disabled={!editable}/></CreationField><CreationField label="Categories"><CreationCategories values={model.categories} disabled={!editable} onChange={categories=>change({categories})}/></CreationField></div>
        </fieldset></section>
        <section className={styles.panel}><h2>Rules and eligibility</h2><fieldset className={styles.fields} disabled={!editable}>
          <div className={styles.half}><CreationField label="Verification requirement"><RevampSelect label="Verification requirement" value={String(model.verification)} options={[{value:"0",label:"No verification needed"},{value:"1",label:"Telegram verified"},{value:"2",label:"KYC verified"},{value:"4",label:"DID verified"},{value:"8",label:"Manual verification"},{value:"16",label:"Twitter verified"},{value:"32",label:"Discord verified"},{value:"64",label:"Reddit verified"},...(![0,1,2,4,8,16,32,64].includes(model.verification)?[{value:String(model.verification),label:`Existing combined requirements (${model.verification})`}]:[])]} onValueChange={value=>change({verification:Number(value)})} disabled={!editable}/></CreationField></div>
          <CreationField label="Campaign rules"><div className={styles.rules}>{(model.rules.length?model.rules:[""]).map((rule,index)=><div className={styles.rule} key={index}><RevampInput aria-label={`Campaign rule ${index+1}`} value={rule} onChange={event=>change({rules:model.rules.length?model.rules.map((value,i)=>i===index?event.target.value:value):[event.target.value]})} placeholder="e.g. Must have participated in other Fiber campaigns."/>{model.rules.length>0&&<button type="button" className={styles.iconButton} aria-label={`Remove rule ${index+1}`} onClick={()=>change({rules:model.rules.filter((_value,i)=>i!==index)})}><CreationAsset name="close"/></button>}</div>)}<button type="button" className={styles.textButton} onClick={()=>change({rules:[...model.rules,""]})}><CreationAsset name="plus"/>Add rule</button></div></CreationField>
        </fieldset></section>
      </>}
      {tab==="quests"&&<>{model.quests.map((quest,index)=><CreationQuestEditor key={quest.id} quest={quest} index={index} total={model.quests.length} errors={errors} dirty={signature(quest)!==signature(base.quests.find(value=>value.id===quest.id))} disabled={!editable} onChange={questUpdate} onMove={delta=>moveQuest(index,delta)} onDelete={()=>{setDeleting(quest.id);setModal("delete");}}/>)}{errors.quests&&<p role="alert" className={styles.fieldError}>{errors.quests}</p>}<RevampButton variant="secondary" className={styles.addQuest} disabled={!editable} onClick={()=>change(current=>({...current,quests:[...current.quests,newCreationQuest(current.nextQuestId)],nextQuestId:current.nextQuestId+1}))}><CreationAsset name="plus"/>Add quest</RevampButton></>}
      {tab==="permission"&&<section className={styles.panel}><h2>Campaign permission</h2><p className={styles.panelSubtitle}>Add reviewers who can review this campaign’s submissions.</p><h3>Current reviewers</h3><div className={styles.reviewers}>{model.staff.length?model.staff.map(hash=><div className={styles.reviewer} key={hash}><div className={styles.reviewerIdentity}><code title={hash}>{hash.slice(0,14)}…{hash.slice(-8)}</code><button type="button" className={styles.iconButton} aria-label={`Copy reviewer ${hash}`} onClick={()=>{void (async()=>{try{if(!navigator.clipboard)throw new Error("Clipboard unavailable");await navigator.clipboard.writeText(hash);setNotice("Reviewer lock hash copied.");}catch{setError("Unable to copy the reviewer lock hash.");}})();}}><CreationAsset name="copy"/></button></div><button type="button" className={styles.iconButton} disabled={!editable} aria-label={`Remove reviewer ${hash}`} onClick={()=>change({staff:model.staff.filter(value=>value!==hash)})}><CreationAsset name="remove"/></button></div>):<p className={styles.caption}>No reviewers assigned. Platform admins retain review access.</p>}</div><fieldset className={styles.staffEntry} disabled={!editable}><CreationField label="Input method"><RevampSelect label="Reviewer input method" value={staffMethod} options={[{value:"address",label:"CKB address"},{value:"hash",label:"Lock hash"}]} onValueChange={setStaffMethod} disabled={!editable}/></CreationField><CreationField label={staffMethod==="address"?"CKB address":"Lock hash"} error={errors.staff}><RevampInput aria-label="Reviewer address or lock hash" value={staffInput} onChange={event=>setStaffInput(event.target.value)} placeholder={staffMethod==="address"?"Enter CKB address":"0x…"}/></CreationField><RevampButton variant="secondary" onClick={()=>void addStaff()} loading={staffAdding} disabled={!staffInput.trim()||!editable}>Invite as reviewer</RevampButton></fieldset></section>}
      </div>}
    </div><aside className={styles.preview}><h2>Campaign preview</h2><CreationPreview model={model} showProgress={tab==="permission"} underReview={Boolean((campaignTypeId||launch?.campaignId)&&!protocol.protocolData?.campaigns_approved.some(value=>ccc.hexFrom(value).toLowerCase()===(campaignTypeId||launch?.campaignId)?.toLowerCase()))}/><div className={styles.launchActions}>
      {accessMessage?<p className={styles.warning}>{accessMessage}</p>:blocked?<p className={styles.warning}>{Object.keys(validation).length} required field{Object.keys(validation).length===1?"":"s"} to complete before launch. Add campaign details and at least one quest.</p>:null}
      <div className={styles.draftLaunchButtons} data-editing={Boolean(campaignTypeId)}>
      {campaignTypeId?<>
        {!signer?<RevampButton onClick={()=>open()}>Connect wallet</RevampButton>:<RevampButton disabled={!editable||blocked} loading={busy} onClick={()=>void startLaunch()}>Save changes</RevampButton>}
        <RevampButton variant="secondary" asChild><Link href={`/revamp/campaign/${campaignTypeId}`}>Cancel</Link></RevampButton>
      </>:<>
        <RevampButton variant="secondary" aria-label="Save draft" disabled={!editable} onClick={save}><CreationAsset name="save"/>Save as draft</RevampButton>
        {!signer?<RevampButton onClick={()=>open()}>Connect wallet</RevampButton>:<RevampButton disabled={!editable||blocked} loading={busy} onClick={()=>void startLaunch()}>Launch campaign</RevampButton>}
      </>}
      </div>
      {!campaignTypeId&&<p className={styles.caption}>Launching requires a wallet signature. Public listing depends on platform approval.</p>}
    </div></aside></div>
    <CreationModal kind="compact" open={modal==="drafts"} title="Campaign drafts" description="Drafts are stored on this device for the current account and protocol. Resume one explicitly to continue." onClose={()=>setModal(null)}>
      <div className={styles.choiceList}>{drafts.length?drafts.map(record=><label key={record.id}><input type="radio" name="draft" checked={selection===record.id} onChange={()=>setSelection(record.id)}/><span><strong>{record.title}</strong><small>{new Date(record.updatedAt).toLocaleString()} · {record.saved?"Saved draft":"Autosaved draft"}</small></span></label>):<p className={styles.caption}>No drafts saved for this account yet.</p>}</div><div className={styles.modalActions}><RevampButton variant="secondary" onClick={()=>setModal(null)}>Continue current campaign</RevampButton><RevampButton disabled={!selectedDraft||!editable} onClick={()=>{if(selectedDraft)selectReplacement({kind:"draft",item:selectedDraft});}}>Resume draft</RevampButton></div>
    </CreationModal>
    <CreationModal open={modal==="templates"} title="Use campaign templates" description="A template replaces campaign details, rules, eligibility and quests. Set the schedule and reviewers separately." onClose={()=>setModal(null)}><div className={styles.savedTemplates}><h3>Saved templates</h3><div className={styles.choiceList}>{templates.length?templates.map(item=><label key={item.id}><input type="radio" name="template" checked={selection===item.id} onChange={()=>setSelection(item.id)}/><span><strong>{item.name}</strong><small>{item.model.quests.length} quest{item.model.quests.length===1?"":"s"} · {item.model.rules.length} rule{item.model.rules.length===1?"":"s"}</small></span></label>):<p className={styles.caption}>Save a campaign as a template to reuse it here.</p>}</div></div>{template&&<details className={styles.templateSummary}><summary>Preview preset values</summary><strong>{template.model.title||template.name}</strong><p>{template.model.summary}</p><small>{template.model.verification?`Verification requirements: ${template.model.verification}`:"No verification needed"}</small><strong className={styles.templateRulesHeading}>Campaign rules</strong>{template.model.rules.length?<ol>{template.model.rules.map((rule,index)=><li key={index}>{rule}</li>)}</ol>:<p>No campaign rules</p>}<strong className={styles.templateRulesHeading}>Quests</strong><ol>{template.model.quests.map(quest=><li key={quest.id}>{quest.title||"Untitled quest"}</li>)}</ol></details>}<div className={styles.modalActions}><RevampButton disabled={!template||!editable||Boolean(campaignTypeId)} onClick={()=>{if(template)selectReplacement({kind:"template",item:template});}}>Apply template</RevampButton></div></CreationModal>
    <CreationModal kind="save-template" open={modal==="save-template"} title="Save campaign template" description="Save details, rules, eligibility and quests. Dates and reviewer assignments are excluded." onClose={()=>setModal(null)}><CreationField label="Template name"><RevampInput aria-label="Template name" value={templateName} onChange={event=>setTemplateName(event.target.value)} placeholder="e.g. Community onboarding"/></CreationField><div className={styles.modalActions}><RevampButton disabled={!templateName.trim()||!editable} onClick={()=>{if(!scope)return;try{saveCreationTemplate(scope,templateName,model);refreshLocal();setModal(null);setNotice("Template saved on this device for this account.");}catch(failure){setError(message(failure));}}}>Save template</RevampButton></div></CreationModal>
    <CreationModal open={modal==="replace"} title={replacement?.kind==="template"?"Replace campaign with template?":"Resume this draft?"} description="The current form will be replaced. Your saved drafts remain available. Review the replacement before publishing." onClose={()=>{setModal(null);setReplacement(null);}}><div className={styles.modalActions}><RevampButton variant="secondary" onClick={()=>{setModal(null);setReplacement(null);}}>Cancel</RevampButton><RevampButton onClick={replace}>Confirm replacement</RevampButton></div></CreationModal>
    <CreationModal kind="compact" open={modal==="delete"} title={`Delete “${model.quests.find(quest=>quest.id===deleting)?.title||"Untitled quest"}”?`} description={`This permanently removes the quest and its ${model.quests.find(quest=>quest.id===deleting)?.subtasks.length??0} subtasks. Other quest IDs stay unchanged.`} onClose={()=>setModal(null)}><div className={styles.modalActions}><RevampButton variant="secondary" onClick={()=>setModal(null)}>Keep quest</RevampButton><RevampButton disabled={Boolean(model.quests.find(quest=>quest.id===deleting)?.deletionBlockedReason)} onClick={()=>{const target=model.quests.find(quest=>quest.id===deleting);if(target?.deletionBlockedReason){setError(target.deletionBlockedReason);return;}change({quests:model.quests.filter(quest=>quest.id!==deleting)});setModal(null);setDeleting(null);}}>Delete quest</RevampButton></div></CreationModal>
    <CreationModal kind="compact" open={modal==="leave"} title="Leave campaign setup?" description="Save your latest edits as a draft, discard edits back to the last saved draft, or keep editing." onClose={()=>setModal(null)}><div className={styles.modalActions}><RevampButton variant="secondary" onClick={()=>setModal(null)}>Keep editing</RevampButton><RevampButton variant="secondary" onClick={()=>{autosaveEnabled.current=false;try{if(scope)discardCreationChanges(scope,draftId);setDirty(false);setModal(null);router.push(leaveHref);}catch(failure){autosaveEnabled.current=true;setError(message(failure));}}}>Discard changes</RevampButton><RevampButton onClick={()=>{if(save()){autosaveEnabled.current=false;setModal(null);router.push(leaveHref);}}}>Save draft and leave</RevampButton></div></CreationModal>
    {launch&&<LaunchDock launch={launch} onMinimize={()=>setLaunch(value=>value?{...value,minimized:!value.minimized}:null)} onCheck={()=>void pending.refresh()} explorer={pending.explorerBaseUrl} editing={Boolean(campaignTypeId)} onContinue={()=>{if(scope){try{localStorage.removeItem(`${scope}:receipt`);}catch{}}setLaunch(null);setLoadAttempt(value=>value+1);}}/>}
  </main></RevampSiteShell>;
}
