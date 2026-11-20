"use client";
import { useState } from "react";
import type { CreationErrors, CreationQuest, CreationSubtask } from "@/lib/revamp/creation-model";
import { RevampButton, RevampInput, RevampSelect, RevampTag } from "./ui";
import styles from "./creation-workspace.module.css";

export function CreationAsset({name}:{name:"collapse"|"trash"|"plus"|"close"|"copy"|"remove"|"check"|"save"}) {
  if(name==="copy") return <span className={styles.copyIcon} aria-hidden="true">{Array.from({length:8},(_,index)=><i key={index}/>)}</span>;
  return <img src={`/assets/revamp/creation-${name}.svg`} alt="" className={styles.asset} />;
}
export function CreationField({label,error,hint,children}:{label:string;error?:string;hint?:string;children:React.ReactNode}) {
  return <div className={styles.field}><div className={styles.fieldLabel}><span>{label.endsWith(" *")?<>{label.slice(0,-2)} <span className={styles.required}>*</span></>:label}</span>{hint&&<small>{hint}</small>}</div>{children}{error&&<p className={styles.fieldError} role="alert">{error}</p>}</div>;
}
const difficulties=[{value:"1",label:"Easy"},{value:"2",label:"Intermediate"},{value:"3",label:"Hard"}];
export {difficulties as creationDifficulties};

export function CreationQuestEditor({quest,index,total,errors,dirty,disabled,onChange,onDelete,onMove}:{
  quest:CreationQuest;index:number;total:number;errors:CreationErrors;dirty:boolean;disabled:boolean;
  onChange:(quest:CreationQuest)=>void;onDelete:()=>void;onMove:(delta:number)=>void;
}) {
  const [collapsed,setCollapsed]=useState(false);
  const [deleted,setDeleted]=useState<{task:CreationSubtask;index:number}|null>(null);
  const key=`quest.${quest.id}`;
  const set=(patch:Partial<CreationQuest>)=>onChange({...quest,...patch});
  const taskSet=(id:number,patch:Partial<CreationSubtask>)=>set({subtasks:quest.subtasks.map(task=>task.id===id?{...task,...patch}:task)});
  const locked=Boolean(quest.original&&quest.requiredLocked);
  return <section className={styles.panel} aria-label={`Quest ${index+1} editor`}>
    <div className={styles.questHeading}>
      <button type="button" className={styles.collapse} onClick={()=>setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={`${collapsed?"Expand":"Collapse"} quest ${index+1}`}><CreationAsset name="collapse"/></button>
      <h2><button type="button" className={styles.questTitle} onClick={()=>setCollapsed(!collapsed)} aria-expanded={!collapsed}>Quest #{index+1}</button></h2>{dirty&&<RevampTag tone="amber">Unsaved changes</RevampTag>}{collapsed&&Object.keys(errors).some(name=>name.startsWith(`${key}.`))&&<RevampTag tone="rose">Complete required fields</RevampTag>}
      <div className={styles.questActions}><button type="button" className={styles.textButton} disabled={disabled||index===0} onClick={()=>onMove(-1)} aria-label={`Move quest ${index+1} up`}>↑</button><button type="button" className={styles.textButton} disabled={disabled||index===total-1} onClick={()=>onMove(1)} aria-label={`Move quest ${index+1} down`}>↓</button>
      <RevampButton variant="secondary" size="small" onClick={onDelete} disabled={disabled||Boolean(quest.deletionBlockedReason)} aria-describedby={quest.deletionBlockedReason?`quest-${quest.id}-delete-reason`:undefined}><CreationAsset name="trash"/>Delete quest</RevampButton></div>
    </div>
    {quest.deletionBlockedReason&&<p id={`quest-${quest.id}-delete-reason`} className={styles.caption}>{quest.deletionBlockedReason}</p>}
    {!collapsed&&<fieldset className={styles.questFields} disabled={disabled}>
      {errors[`${key}.rewards`]&&<p className={styles.fieldError} role="alert">{errors[`${key}.rewards`]}</p>}
      <CreationField label="Quest title *" error={errors[`${key}.title`]}><RevampInput aria-label={`Quest ${index+1} title`} value={quest.title} onChange={event=>set({title:event.target.value})} placeholder="Enter quest title"/></CreationField>
      <CreationField label="Short description"><RevampInput aria-label={`Quest ${index+1} description`} value={quest.description} onChange={event=>set({description:event.target.value})} placeholder="Describe what contributors will do"/></CreationField>
      <div className={styles.threeColumns}>
        <CreationField label="Points" error={errors[`${key}.points`]}><RevampInput aria-label={`Quest ${index+1} points`} inputMode="numeric" value={quest.points} onChange={event=>set({points:event.target.value})}/></CreationField>
        <CreationField label="Difficulty"><RevampSelect label={`Quest ${index+1} difficulty`} value={String(quest.difficulty)} options={difficulties} onValueChange={value=>set({difficulty:Number(value)})}/></CreationField>
        <CreationField label="Estimated time (minutes)" error={errors[`${key}.minutes`]}><RevampInput aria-label={`Quest ${index+1} estimated time`} inputMode="numeric" value={quest.minutes} onChange={event=>set({minutes:event.target.value})}/></CreationField>
      </div>
      <div className={styles.subtaskPanel}>
        <h3>Subtasks ({quest.subtasks.length})</h3>
        {locked&&<p className={styles.caption}>Response requirements stay locked while submissions are checked, or after the first submission.</p>}
        {quest.subtasks.map((task,taskIndex)=><div className={styles.subtask} key={task.id}>
          <div className={styles.twoColumns}>
            <CreationField label="Subtask title *" error={errors[`${key}.subtask.${task.id}.title`]}><RevampInput aria-label={`Quest ${index+1} subtask ${taskIndex+1} title`} value={task.title} onChange={event=>taskSet(task.id,{title:event.target.value})} placeholder="e.g. Share your project"/></CreationField>
            <CreationField label="Response type"><RevampSelect label={`Quest ${index+1} subtask ${taskIndex+1} response type`} value={task.type} options={[{value:"text",label:"Text response"},{value:"url",label:"Link"},{value:"image",label:"Image link"},{value:"file",label:"File link"},...(!["text","url","image","file"].includes(task.type)?[{value:task.type,label:task.type}]:[])]} onValueChange={type=>taskSet(task.id,{type})}/></CreationField>
          </div>
          <CreationField label="Evidence instructions" error={errors[`${key}.subtask.${task.id}.description`]}><RevampInput aria-label={`Quest ${index+1} subtask ${taskIndex+1} instructions`} value={task.description} onChange={event=>taskSet(task.id,{description:event.target.value})} placeholder="Explain what contributors should submit"/></CreationField>
          <div className={styles.inlineBetween}><label className={styles.checkbox}><input type="checkbox" checked={task.required===true} disabled={locked} onChange={event=>taskSet(task.id,{required:event.target.checked})}/><span>Required response</span></label><RevampButton variant="secondary" size="small" aria-label={`Delete subtask ${taskIndex+1} from quest ${index+1}`} disabled={locked} onClick={()=>{setDeleted({task,index:taskIndex});set({subtasks:quest.subtasks.filter(item=>item.id!==task.id)});}}><CreationAsset name="trash"/>Delete subtask<span className={styles.deleteLabelSpacer} aria-hidden="true"/></RevampButton></div>
        </div>)}
        {deleted&&<p className={styles.undo} role="status">Subtask removed. <button type="button" className={styles.textButton} disabled={disabled||locked} onClick={()=>{const subtasks=[...quest.subtasks];subtasks.splice(deleted.index,0,deleted.task);set({subtasks});setDeleted(null);}}>Undo</button></p>}
        <button type="button" className={styles.textButton} disabled={disabled||locked||quest.nextSubtaskId>255} onClick={()=>set({subtasks:[...quest.subtasks,{id:quest.nextSubtaskId,title:"",type:"text",description:"",evidence:"",required:true}],nextSubtaskId:quest.nextSubtaskId+1})}><CreationAsset name="plus"/>Add subtask</button>
      </div>
    </fieldset>}
  </section>;
}
