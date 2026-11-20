"use client";
import { useMemo, useState } from "react";
import { useCampaignCoverImage } from "@/hooks/use-campaign-cover-image";
import { creationScheduleUnix, type CreationModel } from "@/lib/revamp/creation-model";
import { buildCampaignRewards } from "@/lib/revamp/campaign-rewards";
import { discoveryStatusLabels, formatCampaignSchedule, getDiscoveryStatus, getCampaignProgress, type CampaignDiscoveryStatus } from "@/lib/revamp/campaign-discovery";
import { RevampTag } from "./ui";
import { FigmaIcon } from "./figma-icon";
import styles from "./creation-workspace.module.css";

export function CreationPreview({model,compact=false,underReview=false,showProgress=false}:{model:CreationModel;compact?:boolean;underReview?:boolean;showProgress?:boolean}) {
  const {src}=useCampaignCoverImage(model.cover);
  const [failed,setFailed]=useState<string|null>(null);
  const image=src&&failed!==src&&src!=="/placeholder.svg"?src:null;
  const rewards=useMemo(()=>buildCampaignRewards({quests:model.quests.map(quest=>({points:/^\d+$/.test(quest.points)?BigInt(quest.points):0n,rewards_on_completion:quest.original?.rewards_on_completion??quest.rewardAssets??[]}))}),[model.quests]);
  let status:CampaignDiscoveryStatus="upcoming",schedule="Choose a campaign schedule",progress=0;
  try{const start=creationScheduleUnix(model,"start")*1000,end=creationScheduleUnix(model,"end")*1000;status=getDiscoveryStatus({startDate:start,endDate:end});progress=getCampaignProgress({startDate:start,endDate:end});schedule=formatCampaignSchedule(status==="upcoming"?start:end);}catch{/* An incomplete draft starts with the designed upcoming preview. */}
  return <article className={styles.previewCard} aria-label="Live campaign preview">
    <div className={styles.previewSurface}>
    <div className={styles.cover}>{image?<img src={image} alt="Campaign cover" onError={()=>setFailed(image)}/>:<span className={styles.defaultCover} aria-label="Orbit default cover" role="img"/>}<RevampTag tone={underReview?"amber":status==="active"?"green":status==="ending-soon"?"rose":status==="completed"?"neutral":"cyan"} pill className={styles.previewStatus}>{underReview?"Under review":discoveryStatusLabels[status]}</RevampTag></div>
    <div className={styles.previewContent}>
      <div className={styles.previewIntro}><h3>{model.title.trim()||"Campaign title"}</h3>
      <p className={styles.previewSummary}>{model.summary.trim()||"Your campaign summary will appear here."}</p>
      </div>
      <div className={styles.tags}><RevampTag tone={model.difficulty===1?"green":model.difficulty===3?"rose":"amber"}>{["Unknown","Easy","Intermediate","Hard"][model.difficulty]??`Level ${model.difficulty}`}</RevampTag>{model.categories.map((category,index)=><RevampTag key={category} tone={index%2?"teal":"cyan"}>{category}</RevampTag>)}</div>
      {!compact&&<><div className={styles.previewDetails}><div className={styles.previewSchedule}><span>{status==="upcoming"?"Start time":"End time"}</span><p>{schedule}</p></div>
      <div className={styles.previewReward}><span>Rewards</span><div className={styles.rewardAmounts}>{rewards.length?rewards.map(reward=><strong key={reward.key}><FigmaIcon name={reward.kind==="points"?"trophy":reward.kind} size={16}/>{reward.amount} {reward.label}</strong>):<strong><FigmaIcon name="trophy" size={16}/>0 Points</strong>}</div></div></div>{showProgress&&<div className={styles.previewProgress} aria-label={`Campaign schedule progress ${progress}%`}><span>{progress}%</span><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{width:`${progress}%`}}/></div></div>}</>}
    </div>
    </div>
  </article>;
}
