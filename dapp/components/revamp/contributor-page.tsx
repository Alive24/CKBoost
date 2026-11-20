"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { contributorCapabilities } from "@/lib/revamp/contributor-data";
import { useContributorCampaign, useContributorSubmit } from "@/lib/revamp/contributor-hooks";
import { buildCampaignRewards } from "@/lib/revamp/campaign-rewards";
import { formatCampaignSchedule, getCampaignProgress } from "@/lib/revamp/campaign-discovery";
import { RevampSiteShell } from "./site-shell";
import { RevampButton } from "./ui";
import { CampaignHero } from "./contributor-header";
import { ContributorQuest } from "./contributor-quest";
import { ContributorRichText } from "./contributor-rich-text";
import { ContributorTransactionDock } from "./contributor-transaction";
import { FigmaIcon } from "./figma-icon";
import styles from "./contributor.module.css";

export function ContributorCampaignPage({campaignTypeId}:{campaignTypeId:string}) {
  const data=useContributorCampaign(campaignTypeId);
  const submission=useContributorSubmit(data.reload);
  const params=useSearchParams(), pathname=usePathname(), router=useRouter();
  const tab=params.get("tab")==="quests" ? "quests" : "overview";
  const [expanded,setExpanded]=useState<number|null>(null),[now,setNow]=useState(Date.now);
  useEffect(()=>{const interval=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(interval);},[]);
  const firstQuest=data.quests[0] ? Number(data.quests[0].quest_id) : null;
  useEffect(()=>{setExpanded(firstQuest);},[campaignTypeId,firstQuest]);
  function changeTab(next:string){const query=new URLSearchParams(params.toString());if(next==="overview")query.delete("tab");else query.set("tab","quests");const suffix=query.toString();router.push(`${pathname}${suffix?`?${suffix}`:""}`,{scroll:false});}
  const campaign=data.campaign;
  if(!/^0x[0-9a-f]{64}$/i.test(campaignTypeId)) return <RevampSiteShell><main id="revamp-main" className={styles.empty}><h1>Invalid campaign link</h1><Link href="/revamp">Return to campaigns</Link></main></RevampSiteShell>;
  if(data.loading || !campaign || !data.protocol) return <RevampSiteShell><main id="revamp-main" className={styles.empty}>{data.error?<><h1>Campaign unavailable</h1><p role="alert">{data.error}</p><RevampButton onClick={data.reload}>Retry</RevampButton><Link href="/revamp">Return to campaigns</Link></>:<p role="status">Loading campaign…</p>}</main></RevampSiteShell>;
  const capabilities=contributorCapabilities(campaign,data.protocol,data.identity,data.eligible,undefined,data.protocolCell);
  const rewards=buildCampaignRewards(campaign);
  const points=rewards.find(reward=>reward.kind==="points");
  const progress=getCampaignProgress(campaign,now);
  return <RevampSiteShell><main id="revamp-main">
    <CampaignHero campaign={campaign} now={now} platformApproved={capabilities.isApproved} actions={capabilities.canEditCampaign || capabilities.canReviewSubmissions ? <>
      {capabilities.canEditCampaign && <RevampButton asChild variant="secondary" size="small"><Link href={`/revamp/campaign/${campaignTypeId}/edit`}>Edit campaign</Link></RevampButton>}
      {capabilities.canReviewSubmissions && <RevampButton asChild variant="secondary" size="small"><Link href={`/revamp/campaign/${campaignTypeId}/review`}>Review submissions</Link></RevampButton>}
    </> : undefined}/>
    <div className={styles.layout}>
      <div className={styles.main}>
        <nav className={styles.tabs} aria-label="Campaign sections"><button className={`${styles.tab} ${tab==="overview"?styles.tabActive:""}`} aria-current={tab==="overview"?"page":undefined} onClick={()=>changeTab("overview")}>Overview</button><button className={`${styles.tab} ${tab==="quests"?styles.tabActive:""}`} aria-current={tab==="quests"?"page":undefined} onClick={()=>changeTab("quests")}>Quests ({campaign.quests.length})</button></nav>
        {tab==="overview" ? <section className={styles.overview} aria-label="Campaign overview">
          <details className={styles.overviewSection} open><summary><img src="/assets/revamp/contributor-overview-caret.svg" alt="" width="24" height="24"/>Description</summary><div className={styles.overviewBody}>
            {data.contentLoading?<p role="status">Loading campaign details…</p>:data.descriptionError?<><p role="alert">{data.descriptionError}</p><RevampButton variant="secondary" size="small" onClick={data.reload}>Retry content</RevampButton></>:<ContributorRichText content={data.description || campaign.shortDescription}/>}
          </div></details>
          <details className={styles.overviewSection} open><summary><img src="/assets/revamp/contributor-overview-caret.svg" alt="" width="24" height="24"/>Rules</summary><div className={styles.overviewBody}>
            {campaign.rules.length ? <ul className={styles.rules}>{campaign.rules.map((rule,index)=><li key={index}><CheckCircle size={24} aria-hidden="true"/><ContributorRichText content={rule}/></li>)}</ul> : <p className={styles.muted}>No additional rules.</p>}
          </div></details>
        </section> : data.contentLoading ? <p role="status" className={styles.muted}>Loading quest requirements…</p> : <div className={styles.quests}>
          {data.quests.length ? data.quests.map((quest,index)=><ContributorQuest key={`${data.identity?.lockHash ?? "visitor"}:${Number(quest.quest_id)}`} quest={quest} index={index} expanded={expanded===Number(quest.quest_id)} onToggle={()=>setExpanded(value=>value===Number(quest.quest_id)?null:Number(quest.quest_id))} data={data} submission={submission}/>) : <p className={styles.muted}>No quests are available in this campaign.</p>}
          {Object.keys(data.contentErrors).length>0 && <div className={styles.prerequisite} role="alert">Some quest requirements are unavailable. Those quests cannot be submitted until their content loads.<RevampButton variant="secondary" size="small" onClick={data.reload}>Retry requirements</RevampButton></div>}
        </div>}
      </div>
      <aside className={styles.summaryColumn} aria-label="Campaign details"><div className={styles.sidebar}>
        {points && <div className={styles.rewardTotal}><strong>{points.amount}</strong><span>Total points for this campaign</span></div>}
        {rewards.filter(reward=>reward.kind!=="points").map(reward=><div className={styles.points} key={reward.key}><FigmaIcon name={reward.kind==="ckb"?"ckb":"udt"} size={16}/>{reward.amount} {reward.label}</div>)}
        <div className={styles.stats}><div><strong>{campaign.quests.length}</strong><span className={styles.label}>Total Quests</span></div><div><strong>{data.stats && !data.stats.error ? data.stats.submissions : "—"}</strong><span className={styles.label}>Submissions</span></div><div><strong>{data.stats && !data.stats.error ? data.stats.participants : "—"}</strong><span className={styles.label}>Participants</span></div></div>
        {data.stats?.error && <p className={styles.muted}>Statistics unavailable. <button onClick={data.reload}>Retry</button></p>}
        <div><div className={`${styles.label} ${styles.progressLabels}`}><span>Campaign progress</span><span>{progress}%</span></div><div className={styles.track} role="progressbar" aria-label="Elapsed campaign time" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className={styles.fill} style={{width:`${progress}%`}}/></div></div>
        <div className={styles.campaignMetadata}><div className={styles.dates}><div><span className={styles.label}>Start time</span><strong>{formatCampaignSchedule(campaign.startDate)}</strong></div><div><span className={styles.label}>End time</span><strong>{formatCampaignSchedule(campaign.endDate)}</strong></div></div>
        <div className={styles.createdBy}><span className={styles.label}>Created by</span><strong>{campaign.endorserName || "Unknown organizer"}</strong></div>
        </div></div>{tab==="overview" && <RevampButton className={styles.continueButton} onClick={()=>changeTab("quests")}>Continue on quest</RevampButton>}
      </aside>
    </div>
    <ContributorTransactionDock submission={submission}/>
  </main></RevampSiteShell>;
}
