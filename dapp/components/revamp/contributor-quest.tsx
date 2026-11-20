"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import type { QuestDataLike } from "ssri-ckboost/types";
import { contributorCapabilities, contributorQuestState } from "@/lib/revamp/contributor-data";
import type { useContributorCampaign, useContributorSubmit } from "@/lib/revamp/contributor-hooks";
import { contributorDraftKey, contributorFieldKind, contributorTasks, MAX_CONTRIBUTOR_FILE_BYTES, parseContributorResponses, readContributorDraft, validateContributorResponses, type ContributorResponses } from "@/lib/revamp/contributor-model";
import { formatCampaignSchedule } from "@/lib/revamp/campaign-discovery";
import { unwrapStorageReference } from "@/lib/utils/campaign-nostr-content";
import { RevampButton, RevampInput, RevampTag } from "./ui";
import { FigmaIcon } from "./figma-icon";
import { SafeEvidenceValue } from "./submission-evidence";
import { ContributorRichText } from "./contributor-rich-text";
import { ContributorEvidencePanel } from "./contributor-evidence";
import { ContributorResponseTextarea } from "./contributor-response-input";
import styles from "./contributor.module.css";

export function ContributorQuest({quest,index,expanded,onToggle,data,submission}:{quest:QuestDataLike;index:number;expanded:boolean;onToggle:()=>void;data:ReturnType<typeof useContributorCampaign>;submission:ReturnType<typeof useContributorSubmit>}) {
  const {open}=ccc.useCcc();
  const campaign=data.campaign!, protocol=data.protocol!;
  const questId=Number(quest.quest_id);
  const tasks=contributorTasks(quest.sub_tasks);
  const state=contributorQuestState(campaign,data.identity,questId);
  const capabilities=contributorCapabilities(campaign,protocol,data.identity,data.eligible,questId,data.protocolCell);
  const [editing,setEditing]=useState(false), [responses,setResponses]=useState<ContributorResponses>({}), [name,setName]=useState("");
  const [errors,setErrors]=useState<Record<number,string>>({}), [message,setMessage]=useState<string|null>(null), [fileLoading,setFileLoading]=useState(false);
  const existing=data.evidence[questId];
  const evidenceError=data.evidenceErrors[questId];
  const contentError=data.contentErrors[questId];
  // User SDK writes submission_timestamp with Date.now() (milliseconds),
  // independently of campaign starting_time/ending_time's Unix seconds.
  const submittedTime=Number(state.submission?.submission_timestamp ?? 0);
  const submittedLabel=submittedTime>0 && Number.isFinite(new Date(submittedTime).getTime()) ? formatCampaignSchedule(submittedTime) : null;
  const key=data.identity ? contributorDraftKey(data.identity.protocolHash,data.identity.lockHash,campaign.typeId!,questId) : null;
  useEffect(()=>{
    setEditing(false);setResponses({});setErrors({});setMessage(null);
    if (!key || state.submission || state.accepted) return;
    try { const draft=readContributorDraft(localStorage.getItem(key),tasks.length); if (draft) {setResponses(draft);setMessage("Saved progress restored for this wallet.");} } catch { /* A form can be used when local storage is unavailable. */ }
  },[key,Boolean(state.submission),state.accepted]);
  const editable=Boolean(data.identity && data.eligible && capabilities.submissionsOpen && !state.accepted && !contentError && (state.submission ? editing && capabilities.canEditSubmission : editing && capabilities.canSubmitQuest));
  const shown=state.submission && !editable ? parseContributorResponses(existing ?? "",tasks.length) ?? {} : responses;
  const status=state.accepted ? "Approved" : state.submission ? "Under review" : editing || Object.values(responses).some(Boolean) ? "In progress" : "Not started";
  const reference=state.submission?.submission_content ? unwrapStorageReference(state.submission.submission_content) : "";
  const busy=submission.busy || fileLoading;
  const invalidResponses=Object.keys(validateContributorResponses(tasks,responses)).length>0;
  useEffect(()=>{if(!invalidResponses && message==="Complete all required fields.")setMessage(null);},[invalidResponses,message]);
  useEffect(()=>{if(!expanded){setEditing(false);setErrors({});}},[expanded]);
  useEffect(()=>{const remaining=validateContributorResponses(tasks,responses);setErrors(previous=>{const next=Object.fromEntries(Object.entries(previous).filter(([field])=>Boolean(remaining[Number(field)])));return Object.keys(next).length===Object.keys(previous).length?previous:next;});},[responses,tasks]);
  const cancel=()=>{setEditing(false);setErrors({});if(state.submission)setResponses({});setMessage(null);};
  function start() {
    setErrors({});setMessage(null);
    if (state.submission) {const parsed=parseContributorResponses(existing ?? "",tasks.length);if(!parsed){setMessage("Your existing evidence must load successfully before it can be edited.");return;}setResponses(parsed);}
    setEditing(true);
  }
  function saveProgress(){if(!key)return;try{localStorage.setItem(key,JSON.stringify({version:1,responses,updatedAt:Date.now()}));setMessage("Progress saved on this device for this wallet.");}catch{setMessage("Unable to save progress on this device. Your current responses remain in the form.");}}
  async function attachFile(file:File|undefined,field:number){
    if(!file)return;
    if(!file.size || file.size>MAX_CONTRIBUTOR_FILE_BYTES){setErrors(previous=>({...previous,[field]:"Choose a non-empty file up to 10 MB."}));return;}
    setFileLoading(true);
    try {const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Unable to read this file."));reader.readAsDataURL(file);});setResponses(previous=>({...previous,[field]:JSON.stringify({format:"ckboost-file",name:file.name,type:file.type || "application/octet-stream",size:file.size,data_url:dataUrl})}));setErrors(previous=>{const next={...previous};delete next[field];return next;});}
    catch{setErrors(previous=>({...previous,[field]:"Unable to read this file. Try again."}));}finally{setFileLoading(false);}
  }
  async function handleSubmit(event:FormEvent){
    event.preventDefault();
    const validation=validateContributorResponses(tasks,responses);
    if(Object.keys(validation).length)setMessage("Complete all required fields.");else if(!data.identity?.userTypeId && !name.trim())setMessage("Enter a display name to create your profile.");else setMessage(null);
    setErrors(validation);
    if(Object.keys(validation).length || !data.identity || !editable || (!data.identity.userTypeId && !name.trim()))return;
    if(key){try{localStorage.setItem(key,JSON.stringify({version:1,responses,updatedAt:Date.now()}));}catch{/* The submission remains usable if storage is full. */}}
    await submission.submit({campaign,identity:data.identity,quest,responses,editing:Boolean(state.submission),name});
  }
  return <article className={styles.quest} data-editing={editable || undefined} data-submitted={Boolean(state.submission) || undefined}>
    <button className={styles.questHeader} aria-expanded={expanded} aria-controls={`quest-${questId}-body`} onClick={onToggle}>
      <img className={`${styles.caret} ${expanded?styles.caretOpen:""}`} src="/assets/revamp/contributor-caret.svg" alt="" width="24" height="24" />
      <span className={styles.questHeading}><span className={styles.questLabel}>Quest #{index+1}</span><strong>{quest.metadata.title || `Quest ${index+1}`}</strong></span>
      <span className={styles.questMeta}><RevampTag pill tone={state.accepted?"green":state.submission?"amber":editing?"violet":"neutral"}>{status}</RevampTag><span className={styles.points}><FigmaIcon name="trophy" size={18}/>{ccc.numFrom(quest.points).toString()} points</span></span>
    </button>
    {expanded && <div id={`quest-${questId}-body`}>
      <div className={styles.questDescription}><ContributorRichText content={quest.metadata.short_description || quest.metadata.long_description || ""}/></div>
      {contentError && <div className={styles.prerequisite} role="alert">{contentError}<RevampButton variant="secondary" size="small" onClick={data.reload}>Retry quest content</RevampButton></div>}
      {state.submission && (data.evidenceLoading || evidenceError) && <div className={styles.prerequisite} role={evidenceError?"alert":"status"}>{evidenceError || "Loading your submitted responses…"}{evidenceError && <RevampButton variant="secondary" size="small" onClick={data.reload}>Retry evidence</RevampButton>}</div>}
      {state.submission && !editable && reference.startsWith("nevent1") && <ContributorEvidencePanel reference={reference} verified={!data.evidenceLoading && !evidenceError && typeof existing==="string"}/>}
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.fields}>{tasks.map((task,field)=>{
          const kind=contributorFieldKind(task), id=`quest-${questId}-response-${field}`;
          const typeLabel={text:"Text",link:"Link",social:"Social",file:"File"}[kind];
          return <section className={styles.field} key={field}><div className={styles.fieldHeader}><span className={styles.number}>{String(field+1).padStart(2,"0")}</span><div className={styles.fieldBody}>
            <div className={styles.fieldTitle}><label htmlFor={editable?id:undefined}>{task.title || `Task ${field+1}`}{editable && task.required_response===true && <span className={styles.required} aria-label="required">*</span>}</label><RevampTag className={styles.responseType}>{typeLabel}</RevampTag></div>
            {task.description && <div className={styles.fieldDescription}><ContributorRichText content={task.description}/></div>}{task.proof_required && <p className={styles.proof}>{task.proof_required}</p>}
            </div></div>{(editable || state.submission) && <div className={styles.fieldResponse}>
            {editable ? <>
              {kind==="text" ? <ContributorResponseTextarea compact={Boolean(state.submission)} id={id} value={responses[field] ?? ""} disabled={busy} aria-required={task.required_response===true} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field]?`${id}-error`:undefined} onChange={event=>setResponses(previous=>({...previous,[field]:event.target.value}))}/> : <RevampInput id={id} type={kind==="link"?"url":"text"} value={kind==="file" && (responses[field] ?? "").startsWith("{") ? "" : responses[field] ?? ""} disabled={busy} placeholder={kind==="social"?"@your_handle":"https://"} aria-required={task.required_response===true} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field]?`${id}-error`:undefined} onChange={event=>setResponses(previous=>({...previous,[field]:event.target.value}))}/>}
              {kind==="file" && <><div className={styles.file}><input aria-label={`Attach file for ${task.title || `Task ${field+1}`}`} type="file" disabled={busy} onChange={event=>void attachFile(event.target.files?.[0],field)}/><span className={styles.label}>File or public link · maximum 10 MB</span></div>{(responses[field] ?? "").startsWith("{") && <SafeEvidenceValue value={responses[field]}/>}</>}
            </> : state.submission && !data.evidenceLoading && !evidenceError ? <div className={styles.responseValue} data-multiline={kind==="text" || undefined}><SafeEvidenceValue value={shown[field] ?? ""} type={task.type}/></div> : null}
            {errors[field] && <p className={styles.error} id={`${id}-error`} role="alert">{errors[field]}</p>}
          </div>}</section>;
        })}</div>
        {!data.signer && capabilities.submissionsOpen && <div className={styles.prerequisite}>Connect your wallet to start this quest.</div>}
        {data.accountLoading && <p className={styles.prerequisite} role="status">Checking your current wallet profile and eligibility…</p>}
        {data.accountError && <div className={styles.prerequisite} role="alert">{data.accountError}<RevampButton variant="secondary" size="small" onClick={data.reload}>Retry profile</RevampButton></div>}
        {data.identity && !data.eligible && <p className={styles.prerequisite}>Complete {data.missing.length?data.missing.join(", "):"the campaign verification requirements"} on your <Link href="/profile">profile</Link> before contributing.</p>}
        {editable && !data.identity?.userTypeId && <div className={styles.prerequisite}><strong>Create your profile with this submission</strong><label htmlFor={`quest-${questId}-name`}>Display name *</label><RevampInput id={`quest-${questId}-name`} value={name} maxLength={80} disabled={busy} onChange={event=>setName(event.target.value)}/></div>}
        {!capabilities.submissionsOpen && <p className={styles.prerequisite}>This campaign is read-only. Responses can be submitted or edited only while the approved campaign is active.</p>}
        {message && message!=="Complete all required fields." && <p className={styles.message} role="status">{message}</p>}
        <div className={styles.questFooter} data-submitted={Boolean(state.submission) || undefined}>
        {submittedLabel && <p className={styles.submissionTime}>Last submitted on {submittedLabel}</p>}
        <div className={styles.questActions}>
          {editable ? <>{state.submission && <RevampButton variant="secondary" disabled={busy} onClick={cancel}>Cancel</RevampButton>}{!state.submission && <RevampButton variant="secondary" disabled={busy} onClick={saveProgress}>Save progress</RevampButton>}<span className={styles.submitWrap}><RevampButton className={styles.submitButton} type="submit" loading={busy} disabled={!editable} aria-disabled={invalidResponses || undefined} aria-describedby={invalidResponses?`quest-${questId}-submit-feedback`:undefined}>{submission.busy?"Submitting…":state.submission?"Save changes":"Submit quest"}</RevampButton>{invalidResponses && <span className={styles.requiredTooltip} data-visible={message==="Complete all required fields." || undefined} id={`quest-${questId}-submit-feedback`} role="tooltip">Complete all required fields.</span>}</span></> : !data.signer && capabilities.submissionsOpen ? <RevampButton onClick={open}>Connect wallet</RevampButton> : state.submission ? capabilities.canEditSubmission && !contentError && !evidenceError && !data.evidenceLoading && <RevampButton variant="secondary" disabled={submission.busy} onClick={start}>Edit submission</RevampButton> : capabilities.canSubmitQuest && !contentError && <RevampButton disabled={submission.busy} onClick={start}>Start quest</RevampButton>}
          {state.accepted && <p className={styles.approvedNote}>Approved on chain</p>}
        </div></div>
      </form>
    </div>}
  </article>;
}
