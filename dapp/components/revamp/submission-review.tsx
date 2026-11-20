"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ccc } from "@ckb-ccc/connector-react";
import type { CampaignDataLike, QuestDataLike, UserDataLike } from "ssri-ckboost/types";
import { useNostrFetch } from "@/hooks/use-nostr-fetch";
import { parseSubmissionUserInfo, resolveSubmissionContent, type ResolvedSubmissionContent } from "@/lib/utils/submission-export";
import { buildReviewExport, buildReviewQueue, getScopedReviewCounts, reconcileReviewSelection, resolveReviewQuestContent, unsupportedReviewRewardReason, type ReviewRow, type ReviewStatus } from "@/lib/revamp/submission-review";
import { formatCampaignSchedule } from "@/lib/revamp/campaign-discovery";
import { cellToCampaignDisplay } from "@/lib/utils/campaign-utils";
import { useSubmissionReview, type ReviewApprovalState } from "@/lib/revamp/use-submission-review";
import { RevampButton, RevampIcon, RevampSelect, RevampTag } from "./ui";
import { useRevampTheme } from "./theme";
import { RevampSiteShell } from "./site-shell";
import { FigmaIcon } from "./figma-icon";
import { CampaignHero } from "./contributor-header";
import { SubmissionNostrEvidence, SubmissionResponseFields } from "./submission-evidence";
import styles from "./submission-review.module.css";

const timeLabel = (value: unknown) => {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? formatCampaignSchedule(ms) : "-";
};
const offsetOf = (value: unknown) => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const offset = new Intl.DateTimeFormat("en-US", {timeZoneName: "longOffset"}).formatToParts(ms).find(part => part.type === "timeZoneName")?.value.replace(/^GMT/, "UTC");
  return offset === "UTC" ? "UTC+00:00" : offset ?? null;
};
const shorten = (id: string) => id.length > 24 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;
const readName = (id: string, user?: UserDataLike) => {
  const name = parseSubmissionUserInfo(user).name;
  return name && name !== "Anonymous" ? name : shorten(id);
};

function ReviewEvidence({row, quest, index, user, busy, approvedAt, onApprove}: {
  row: ReviewRow; quest: QuestDataLike; index: number; user?: UserDataLike;
  busy: boolean; approvedAt?: number; onApprove: () => void;
}) {
  const {fetchSubmission} = useNostrFetch();
  const [resolved, setResolved] = useState<ResolvedSubmissionContent | null>(null);
  const [resolvedQuest, setResolvedQuest] = useState<QuestDataLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setResolved(null); setResolvedQuest(null); setError(null);
    Promise.all([resolveSubmissionContent(row.submission_content, fetchSubmission), resolveReviewQuestContent(quest, fetchSubmission)]).then(([result, requirements]) => {
      if (cancelled) return;
      setResolved(result); setResolvedQuest(requirements);
      if (result.events.some(event => event.error)) setError("Some Nostr evidence could not be loaded. Retry before approving.");
    }).catch(failure => {if (!cancelled) setError(failure instanceof Error ? failure.message : "Unable to load evidence.");})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [row.key, row.submission_timestamp, row.submission_content, quest, fetchSubmission, retry]);

  return <div className={styles.evidence} aria-label="Selected submission details">
    <div className={styles.detailHeading}>
      <div className={styles.detailTitle}><h3 title={row.userTypeId}>{readName(row.userTypeId, user)}</h3><RevampTag pill tone={row.status === "pending" ? "amber" : "green"}>{row.status === "pending" ? "Pending review" : "Approved"}</RevampTag></div>
      <p>Quest {index + 1} · Submitted {timeLabel(row.submission_timestamp)}</p>
    </div>
    {loading ? <div className={styles.evidenceLoading} role="status">Loading submitted evidence…</div> : <>
      {resolvedQuest && <SubmissionResponseFields quest={resolvedQuest} content={resolved?.resolvedContent ?? ""} heading={<div className={styles.responseHeading}><span>Quest {index + 1}</span><strong>{resolvedQuest.metadata.title}</strong><span className={styles.points}><FigmaIcon name="trophy" size={20} />{String(quest.points)} points</span></div>} />}
      <SubmissionNostrEvidence events={resolved?.events ?? []} loading={loading} error={error} onRetry={() => setRetry(value => value + 1)} />
    </>}
    <div className={styles.detailActions}>{row.status === "pending"
      ? <RevampButton variant="secondary" disabled={busy || loading || Boolean(error) || Boolean(unsupportedReviewRewardReason(quest))} aria-describedby={unsupportedReviewRewardReason(quest) ? `review-quest-${Number(quest.quest_id)}-unsupported` : undefined} onClick={onApprove}>Approve</RevampButton>
      : <p className={styles.approvedNote}>Approved on-chain{approvedAt ? ` · ${timeLabel(approvedAt)}` : " · Approval time unavailable"}</p>}
    </div>
  </div>;
}

function ApprovalProgress({approval, explorerBaseUrl, onCheck}: {approval: ReviewApprovalState; explorerBaseUrl: string; onCheck: () => void}) {
  const title = {
    checking: "Checking current review access and responses…", signing: "Confirm approval in your wallet",
    confirming: "Approval broadcast · Waiting for confirmation", pending: "Approval is still awaiting confirmation",
    confirmed: "Approval confirmed", error: "Approval was not completed",
  }[approval.phase];
  return <section className={styles.transaction} role={approval.phase === "error" ? "alert" : "status"}>
    <div><strong>{title}</strong>{approval.message && <p>{approval.message}</p>}</div>
    {approval.txHash && <a href={`${explorerBaseUrl}${approval.txHash}`} target="_blank" rel="noopener noreferrer">{shorten(approval.txHash)} ↗</a>}
    {approval.phase === "pending" && <RevampButton size="small" variant="secondary" onClick={onCheck}>Check confirmation</RevampButton>}
  </section>;
}

export function SubmissionReviewPage({campaignTypeId}: {campaignTypeId: string}) {
  const {open} = ccc.useCcc();
  const review = useSubmissionReview(campaignTypeId);
  const data = review.dataset;
  return <RevampSiteShell><main id="revamp-main" className={styles.main}>
    {!data || review.access !== "allowed" ? <div className={styles.accessState}>
      <Link href={`/revamp/campaign/${campaignTypeId}`}>← Back to campaign</Link>
      <h1>{review.access === "disconnected" ? "Connect your wallet to review submissions" : review.access === "denied" ? "Review access required" : review.access === "error" ? "Unable to load submissions" : "Checking campaign review access…"}</h1>
      <p>{review.access === "denied" ? "Only platform administrators, this campaign's current authorized Organizer owner, or currently assigned reviewers can review its submissions." : review.error ?? "Review access is checked for the currently connected wallet."}</p>
      {review.access === "disconnected" ? <RevampButton onClick={() => open()}>Connect wallet</RevampButton> : review.access === "error" ? <RevampButton onClick={() => void review.refresh(true)}>Try again</RevampButton> : null}
    </div> : <SubmissionReviewWorkspace key={`${campaignTypeId}:${data.context.lockHash}`} campaignTypeId={campaignTypeId} review={review} campaign={data.campaignData} />}
  </main></RevampSiteShell>;
}

export function SubmissionReviewWorkspace({campaignTypeId, review, campaign}: {
  campaignTypeId: string;
  review: ReturnType<typeof useSubmissionReview>;
  campaign: CampaignDataLike;
}) {
  const data = review.dataset!;
  const {portalContainer} = useRevampTheme();
  const {fetchSubmission} = useNostrFetch();
  const [questFilter, setQuestFilter] = useState("all");
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Record<number, string | null>>({});
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const heroCampaign = useMemo(() => cellToCampaignDisplay(data.context.campaignCell), [data.context.campaignCell]);
  const queue = useMemo(() => buildReviewQueue(campaign.quests, data.submissions), [campaign.quests, data.submissions]);
  const visibleQuests = campaign.quests.filter(quest => questFilter === "all" || String(Number(quest.quest_id)) === questFilter);
  const questSignature = visibleQuests.map(quest => String(quest.quest_id)).join(",");
  const counts = getScopedReviewCounts(queue, questFilter);
  const busy = review.busy || (review.approval ? ["checking", "signing", "confirming", "pending"].includes(review.approval.phase) : false);

  useEffect(() => {const interval = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(interval);}, []);

  useEffect(() => {
    setExpanded(visibleQuests.length === 1 ? new Set([Number(visibleQuests[0].quest_id)]) : new Set());
  // IDs and filter define the expansion default; refreshing response data does not collapse a card.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questSignature, questFilter]);
  useEffect(() => {
    setSelected(previous => Object.fromEntries(visibleQuests.map(quest => {
      const id = Number(quest.quest_id);
      const rows = (queue.byQuest.get(id) ?? []).filter(row => row.status === status);
      return [id, reconcileReviewSelection(rows, previous[id])];
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, questSignature, status]);

  const exportQuest = useCallback(async (quest: QuestDataLike, format: "csv" | "markdown") => {
    const questId = Number(quest.quest_id);
    setExporting(questId); setExportError(null);
    try {
      const requirements = await resolveReviewQuestContent(quest, fetchSubmission);
      const output = await buildReviewExport({format, campaignTitle: campaign.metadata.title, campaignTypeId, quest: requirements, rows: queue.byQuest.get(questId) ?? [], userDetails: data.userDetails, fetchSubmission});
      const url = URL.createObjectURL(new Blob([output.content], {type: output.mimeType}));
      const link = document.createElement("a"); link.href = url; link.download = output.filename;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {setExportError(failure instanceof Error ? failure.message : "Export failed.");}
    finally {setExporting(null);}
  }, [campaign.metadata.title, campaignTypeId, queue, data.userDetails, fetchSubmission]);

  const isApproved = data.context.capabilities.isApproved;
  return <>
    <CampaignHero campaign={heroCampaign} now={now} platformApproved={isApproved} banner={<><strong>Campaign results</strong><span>{queue.totals.participants} participants · {queue.totals.submissions} submissions</span></>} />
    <section className={styles.workspace} aria-label="Campaign submission review">
      <nav className={styles.tabs} aria-label="Campaign pages"><Link href={`/revamp/campaign/${campaignTypeId}`}>Overview</Link><Link href={`/revamp/campaign/${campaignTypeId}?tab=quests`}>Quests ({campaign.quests.length})</Link><Link href={`/revamp/campaign/${campaignTypeId}/review`} aria-current="page">Submissions</Link></nav>
      <div className={styles.toolbar}>
        <div className={styles.questSelect}><RevampSelect label="Quest" value={questFilter} onValueChange={value => {setQuestFilter(value); setSelected({});}} options={[{value: "all", label: "All quests"}, ...campaign.quests.map((quest, index) => ({value: String(Number(quest.quest_id)), label: `Quest ${index + 1}: ${quest.metadata.title}`}))]} /></div>
        <RevampButton variant="secondary" className={status === "pending" ? styles.activeFilter : undefined} aria-pressed={status === "pending"} onClick={() => {setStatus("pending"); setSelected({});}}>Pending review ({counts.pending})</RevampButton>
        <RevampButton variant="secondary" className={status === "approved" ? styles.activeFilter : undefined} aria-pressed={status === "approved"} onClick={() => {setStatus("approved"); setSelected({});}}>Approved ({counts.approved})</RevampButton>
        <RevampButton variant="secondary" className={styles.refresh} loading={review.refreshing} disabled={busy} onClick={() => void review.refresh()}>Refresh</RevampButton>
      </div>
      {review.error && <p role="alert" className={styles.error}>{review.error}</p>}
      {exportError && <p role="alert" className={styles.error}>{exportError}</p>}
      {review.approval && <ApprovalProgress approval={review.approval} explorerBaseUrl={review.explorerBaseUrl} onCheck={() => void review.checkConfirmation()} />}
      <div className={styles.questCards}>{visibleQuests.map(quest => {
        const questId = Number(quest.quest_id);
        const index = campaign.quests.indexOf(quest);
        const allRows = queue.byQuest.get(questId) ?? [];
        const pendingRows = allRows.filter(row => row.status === "pending");
        const rows = allRows.filter(row => row.status === status);
        const currentRow = rows.find(row => row.key === selected[questId]) ?? rows[0];
        const isExpanded = expanded.has(questId);
        const unsupported = unsupportedReviewRewardReason(quest);
        const offsets = rows.map(row => offsetOf(row.submission_timestamp));
        const sharedOffset = offsets.length && offsets.every(value => value && value === offsets[0]) ? offsets[0] : null;
        return <article className={styles.questCard} key={questId}>
          <div className={styles.questHeader}>
            <button className={styles.questSummary} aria-expanded={isExpanded} aria-controls={`review-quest-${questId}`} onClick={() => setExpanded(previous => {const next = new Set(previous); if (next.has(questId)) next.delete(questId); else next.add(questId); return next;})}>
              <span className={styles.disclosure} aria-hidden="true" style={{"--review-icon": `url('/assets/revamp/review-${isExpanded ? "collapse" : "expand"}.svg')`} as CSSProperties} />
              <span><strong>Quest {index + 1} · {quest.metadata.title}</strong><small>{pendingRows.length} pending · {allRows.length - pendingRows.length} approved</small></span>
            </button>
            {isExpanded && <div className={styles.questActions}>
              <DropdownMenu.Root><DropdownMenu.Trigger asChild><RevampButton variant="secondary" disabled={exporting !== null} className={styles.exportButton}><span aria-hidden className={styles.exportIcon} />{exporting === questId ? "Exporting…" : `Export Quest ${index + 1}`}<RevampIcon name="caret-down" /></RevampButton></DropdownMenu.Trigger>
                <DropdownMenu.Portal container={portalContainer ?? undefined}><DropdownMenu.Content className={styles.exportMenu} sideOffset={4} align="end"><DropdownMenu.Item onSelect={() => void exportQuest(quest, "csv")}>CSV</DropdownMenu.Item><DropdownMenu.Item onSelect={() => void exportQuest(quest, "markdown")}>Markdown</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
              </DropdownMenu.Root>
              {status === "pending" && pendingRows.length > 0 && <RevampButton disabled={busy || Boolean(unsupported)} aria-describedby={unsupported ? `review-quest-${questId}-unsupported` : undefined} className={styles.batchButton} onClick={() => void review.approve(questId, pendingRows)}>Approve {pendingRows.length} submission{pendingRows.length === 1 ? "" : "s"}</RevampButton>}
            </div>}
          </div>
          {isExpanded && unsupported && <p className={styles.error} id={`review-quest-${questId}-unsupported`}>{unsupported}</p>}
          {isExpanded && <div id={`review-quest-${questId}`} className={styles.split}>
            <div className={styles.queue}>
              <div className={styles.tableHeading}><span>Contributor</span><span>Submitted at{sharedOffset ? ` (${sharedOffset})` : ""}</span></div>
              {rows.length ? <ul className={styles.rowList}>{rows.map(row => <li key={row.key}><button className={`${styles.submissionRow} ${currentRow?.key === row.key ? styles.selectedRow : ""}`} aria-pressed={currentRow?.key === row.key} onClick={() => setSelected(previous => ({...previous, [questId]: row.key}))}>
                <code title={row.userTypeId}>{readName(row.userTypeId, data.userDetails.get(row.userTypeId))}</code><span>{sharedOffset ? timeLabel(row.submission_timestamp).replace(/ \(UTC[^)]+\)$/, "") : timeLabel(row.submission_timestamp)}</span>
              </button></li>)}</ul> : <div className={styles.empty}><strong>{status === "pending" ? "No pending submissions" : "No approved submissions"}</strong>{status === "pending" && <button onClick={() => {setStatus("approved"); setSelected({});}}>View approved submissions</button>}</div>}
            </div>
            {currentRow ? <ReviewEvidence key={`${currentRow.key}:${String(currentRow.submission_timestamp)}`} row={currentRow} quest={quest} index={index} user={data.userDetails.get(currentRow.userTypeId)} busy={busy} approvedAt={review.approvalTimes[currentRow.key]} onApprove={() => void review.approve(questId, [currentRow])} /> : <div className={styles.emptyDetail}><p>{status === "pending" ? "Select another quest or view approved submissions." : "No approved response is available for this quest."}</p></div>}
          </div>}
        </article>;
      })}</div>
      {!visibleQuests.length && <div className={styles.empty}>This campaign has no quests to review.</div>}
    </section>
  </>;
}
