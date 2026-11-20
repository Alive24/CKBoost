"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CampaignDisplay } from "@/lib/utils/campaign-utils";
import { formatCampaignSchedule, getDiscoveryStatus } from "@/lib/revamp/campaign-discovery";
import { RevampTag } from "./ui";
import type { TagTone } from "./tokens";
import styles from "./contributor.module.css";

const topicTones:Record<string,TagTone>={development:"blue",education:"teal",fiber:"cyan",ai:"violet",agents:"magenta",hackathon:"amber"};

export function CampaignHero({ campaign, now, platformApproved, actions, banner }: {
  campaign: Pick<CampaignDisplay, "title" | "shortDescription" | "categories" | "difficulty" | "startDate" | "endDate" | "endorserName">;
  now: number;
  platformApproved: boolean;
  actions?: ReactNode;
  banner?: ReactNode;
}) {
  const status = getDiscoveryStatus(campaign, now);
  const open = platformApproved && (status === "active" || status === "ending-soon");
  const difficulty=campaign.difficulty.toLowerCase();
  const difficultyTone:TagTone=difficulty==="hard"?"rose":difficulty==="medium" || difficulty==="intermediate"?"amber":difficulty==="easy"?"green":"neutral";
  const difficultyLabel=difficulty==="medium" || difficulty==="intermediate"?"Intermediate":difficulty==="easy"?"Easy":difficulty==="hard"?"Hard":campaign.difficulty;
  const label = !platformApproved ? "Under review" : {active:"Active", "ending-soon":"Ending soon", upcoming:"Upcoming", completed:"Completed"}[status];
  return <header className={styles.hero}>
    <div className={styles.stars} aria-hidden="true"><img src="/assets/revamp/starlight.svg" alt="" /></div>
    <div className={styles.heroInner}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/revamp">Campaigns</Link><span aria-hidden="true">›</span><span>{campaign.title}</span></nav>
      <img className={styles.rabbit} src="/assets/revamp/contributor-logo.svg" alt="" />
      <div className={styles.intro}>
        <RevampTag pill tone={!platformApproved ? "amber" : status === "ending-soon" ? "rose" : status === "upcoming" ? "cyan" : open ? "green" : "violet"}>{label}</RevampTag>
        <div className={styles.introCopy}><h1>{campaign.title}</h1><p className={styles.shortDescription}>{campaign.shortDescription}</p></div>
        <div className={styles.tags}>{campaign.difficulty && <RevampTag tone={difficultyTone} className={styles.topicTag}>{difficultyLabel}</RevampTag>}{campaign.categories.map((category,index) => <RevampTag key={`${category}:${index}`} tone={topicTones[category.toLowerCase()] ?? "blue"} className={styles.topicTag}>{category}</RevampTag>)}</div>
      </div>
      <div className={`${styles.banner} ${banner ? styles.bannerCustom : open ? styles.bannerOpen : styles.bannerClosed}`} role="status">
        {banner ?? <>
        <strong>{open ? "Quest submissions are open" : !platformApproved ? "This campaign is under review" : status === "upcoming" ? "Quest submissions have not opened" : "Quest submissions are closed"}</strong>
        <span>{open ? `Submit each quest separately by ${formatCampaignSchedule(campaign.endDate)}.` : !platformApproved ? "Contributions open after platform approval and the campaign start time." : status === "upcoming" ? `Opens ${formatCampaignSchedule(campaign.startDate)}.` : `The campaign ended ${formatCampaignSchedule(campaign.endDate)}.`}</span>
        </>}
      </div>
      {actions && <div className={styles.management}>{actions}</div>}
    </div>
  </header>;
}
