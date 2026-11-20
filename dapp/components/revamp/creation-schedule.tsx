"use client";
import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { creationUnixTime } from "@/lib/revamp/creation-content";
import { formatCampaignSchedule } from "@/lib/revamp/campaign-discovery";
import { RevampButton, RevampIcon, RevampInput } from "./ui";
import { useRevampTheme } from "./theme";
import styles from "./creation-workspace.module.css";

export function CreationTimeZoneSelect({value,disabled,onChange,dateValue}:{value:string;disabled:boolean;onChange:(value:string)=>void;dateValue?:string}) {
  const {portalContainer}=useRevampTheme();
  const [open,setOpen]=useState(false),[search,setSearch]=useState("");
  const zones=useMemo(()=>{
    let supported:string[]=[];
    try{supported=Intl.supportedValuesOf("timeZone");}catch{supported=["Asia/Shanghai","Asia/Tokyo","Asia/Kolkata","Europe/London","Europe/Berlin","America/New_York","America/Los_Angeles","Australia/Sydney"];}
    return [...new Set([value,"UTC",...supported])].sort();
  },[value]);
  let offset=value;
  try{const unix=dateValue?creationUnixTime(dateValue,value):Date.now()/1000;const raw=new Intl.DateTimeFormat("en",{timeZone:value,timeZoneName:"longOffset"}).formatToParts(unix*1000).find(part=>part.type==="timeZoneName")?.value;offset=raw?.replace("GMT","UTC")??value;if(offset==="UTC")offset="UTC+00:00";}catch{/* Keep the named zone visible while a date is incomplete. */}
  const matches=zones.filter(zone=>zone.toLowerCase().replaceAll("_"," ").includes(search.trim().toLowerCase().replaceAll("_"," ")));
  return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next)setSearch("");}}><Popover.Trigger asChild><RevampButton variant="secondary" className={styles.zoneTrigger} disabled={disabled} aria-label="Campaign time zone" title={value}>{offset}<RevampIcon name="caret-down"/></RevampButton></Popover.Trigger><Popover.Portal container={portalContainer??undefined}><Popover.Content className={styles.zonePopover} align="start" sideOffset={4}>
    <RevampInput aria-label="Search named time zones" placeholder="Search named time zones" value={search} onChange={event=>setSearch(event.target.value)}/>
    <div className={styles.zoneList} role="listbox" aria-label="Named time zones">{matches.length?matches.map(zone=><button type="button" role="option" aria-selected={zone===value} key={zone} onClick={()=>{onChange(zone);setOpen(false);}}>{zone}</button>):<p className={styles.caption}>No matching time zones.</p>}</div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}

export function CreationScheduledTime({value,timeZone,instant}:{value:string;timeZone:string;instant?:number}) {
  if(!value)return null;
  try{return <small className={styles.scheduleHint}>{formatCampaignSchedule((instant??creationUnixTime(value,timeZone))*1000,timeZone)} · {timeZone}</small>;}catch{return null;}
}

/** Keep the native, keyboard-accessible datetime control and existing local
 * value contract; its visible label uses the campaign's selected time zone. */
export function CreationDateTimeField({label,value,timeZone,instant,disabled,onChange}:{label:string;value:string;timeZone:string;instant?:number;disabled:boolean;onChange:(value:string)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  let display="Choose date and time";
  try{if(value)display=formatCampaignSchedule((instant??creationUnixTime(value,timeZone))*1000,timeZone);}catch{display=value||display;}
  return <div className={styles.dateTimeField} data-disabled={disabled}>
    <span className={styles.calendarIcon} aria-hidden="true">{Array.from({length:9},(_,index)=><i key={index}/>)}</span>
    <span className={styles.dateTimeLabel} aria-hidden="true">{display}</span><span className={styles.visuallyHidden}>{value?`${display} · ${timeZone}`:""}</span>
    <input ref={input} aria-label={label} type="datetime-local" value={value} disabled={disabled} title={display} onChange={event=>onChange(event.target.value)} onClick={()=>{try{input.current?.showPicker?.();}catch{/* Native editing remains available if the browser cannot open a picker. */}}}/>
  </div>;
}
