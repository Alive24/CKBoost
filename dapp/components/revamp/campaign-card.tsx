"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRevampCampaignCover } from "@/lib/revamp/use-campaign-cover";
import type { CampaignDisplay } from "@/lib/utils/campaign-utils";
import {
  discoveryStatusLabels,
  formatCampaignSchedule,
  getCampaignProgress,
  getDiscoveryStatus,
  type CampaignDiscoveryStatus,
} from "@/lib/revamp/campaign-discovery";
import { buildCampaignRewards } from "@/lib/revamp/campaign-rewards";
import { RevampButton, RevampTag } from "./ui";
import { FigmaIcon } from "./figma-icon";
import type { TagTone } from "./tokens";
import styles from "./campaign-card.module.css";

const DEFAULT_COVER = "/assets/revamp/campaign-cover.svg";

const statusTones: Record<CampaignDiscoveryStatus, TagTone> = {
  "ending-soon": "rose",
  active: "green",
  upcoming: "cyan",
  completed: "neutral",
};

const topicTones: Record<string, TagTone> = {
  development: "blue",
  education: "teal",
  fiber: "cyan",
  ai: "violet",
  agents: "magenta",
  hackathon: "amber",
};

/** Presentation alias only; this does not reinterpret any stored difficulty code. */
function difficultyPresentation(difficulty: string): { label: string; tone: TagTone } {
  switch (difficulty.toLowerCase()) {
    case "easy": return { label: "Easy", tone: "green" };
    case "medium":
    case "intermediate": return { label: "Intermediate", tone: "amber" };
    case "hard": return { label: "Hard", tone: "rose" };
    default: return {
      label: difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1) : "Unknown",
      tone: "neutral",
    };
  }
}

function CampaignArtwork({ source }: { source?: string | null }) {
  const { src, isLoading, ref } = useRevampCampaignCover(source);
  const [failed, setFailed] = useState(false);
  const isDefault = failed || !src || src === "/placeholder.svg";

  return <div ref={ref} className={styles.artwork} aria-busy={isLoading || undefined}>
    <img
      src={isDefault ? DEFAULT_COVER : src}
      alt=""
      loading="lazy"
      decoding="async"
      width={416}
      height={160}
      className={isDefault ? styles.defaultCover : styles.customCover}
      onError={() => { if (!isDefault) setFailed(true); }}
    />
    {isLoading && <div className={styles.coverLoading} aria-hidden="true" />}
  </div>;
}

export interface RevampCampaignCardProps {
  campaign: CampaignDisplay;
  /** Share one clock across all discovery cards, filters and sorting. */
  now: number;
  href?: string;
}

export function RevampCampaignCard({ campaign, now, href }: RevampCampaignCardProps) {
  const titleId = useId();
  const progressId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const status = getDiscoveryStatus(campaign, now);
  const progress = getCampaignProgress(campaign, now);
  const difficulty = difficultyPresentation(campaign.difficulty);
  const schedule = status === "upcoming" ? campaign.startDate : campaign.endDate;
  const scheduleLabel = useMemo(() => mounted ? formatCampaignSchedule(schedule) : "—", [mounted, schedule]);
  const source = campaign.metadata.image_url && campaign.metadata.image_url !== "/placeholder.svg"
    ? campaign.metadata.image_url
    : null;
  const rewards = useMemo(() => buildCampaignRewards(campaign), [campaign]);
  const campaignId = campaign.typeId || campaign.typeHash;
  const destination = href ?? (campaignId ? `/revamp/campaign/${campaignId}` : null);
  const action = status === "completed" ? "View results" : status === "upcoming" ? "View details" : "Join campaign";

  return <article className={styles.card} aria-labelledby={titleId} data-campaign-status={status}>
    <div className={styles.frame} aria-hidden="true" />
    <div className={styles.surface}>
      <div className={styles.cover}>
        <CampaignArtwork key={source ?? DEFAULT_COVER} source={source} />
        <RevampTag tone={statusTones[status]} pill className={styles.status}>
          {discoveryStatusLabels[status]}
        </RevampTag>
      </div>

      <div className={styles.content}>
        <div className={styles.summary}>
          <h3 className={styles.title} id={titleId}>{campaign.title}</h3>
          <p className={styles.description}>{campaign.shortDescription}</p>
        </div>

        <div className={styles.tags} aria-label="Campaign difficulty and topics">
          <RevampTag tone={difficulty.tone} className={styles.topicTag}>{difficulty.label}</RevampTag>
          {campaign.categories.map((category, index) => <RevampTag
            key={`${category}-${index}`}
            tone={topicTones[category.toLowerCase()] ?? "blue"}
            className={styles.topicTag}
          >{category}</RevampTag>)}
        </div>

        <div className={styles.progress}>
          <div className={styles.progressLabels}>
            <span id={progressId}>Campaign progress</span><span aria-hidden="true">{progress}%</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-labelledby={progressId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`${progress}% of scheduled campaign time elapsed`}
          ><span className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        </div>

        <div className={styles.details}>
          <div className={styles.detail}>
            <p className={styles.label}>{status === "upcoming" ? "Start time" : "End time"}</p>
            <time className={styles.schedule} dateTime={schedule} title={schedule}>
              {scheduleLabel}
            </time>
          </div>
          <div className={styles.detail}>
            <p className={styles.label}>Rewards</p>
            <div className={styles.rewards}>
              {rewards.map(reward => <span key={reward.key} className={styles.reward}>
                <span className={styles.rewardIcon}><FigmaIcon name={reward.kind === "points" ? "trophy" : reward.kind} size={16} /></span>
                <span>{reward.amount} {reward.label}</span>
              </span>)}
              {rewards.length === 0 && <span className={styles.noRewards}>No configured rewards</span>}
            </div>
          </div>
        </div>

        {destination
          ? <RevampButton asChild variant={status === "active" || status === "ending-soon" ? "primary" : "secondary"} className={styles.action}>
              <Link href={destination} prefetch={false} aria-label={`${action}: ${campaign.title}`}>{action}</Link>
            </RevampButton>
          : <RevampButton disabled className={styles.action}>Details unavailable</RevampButton>}
      </div>
    </div>
  </article>;
}
