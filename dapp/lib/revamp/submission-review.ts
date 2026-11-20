import type { QuestDataLike, UserDataLike, UserSubmissionRecordLike } from "ssri-ckboost/types";
import { buildQuestResponseEntries, parseSubmissionUserInfo, resolveSubmissionContent, type SubmissionFetcher } from "@/lib/utils/submission-export";
import { getQuestContentNeventId, mergeQuestContentPayload, parseQuestContentPayload } from "@/lib/utils/campaign-nostr-content";

export type ReviewStatus = "pending" | "approved";
export type ReviewSubmission = UserSubmissionRecordLike & {userTypeId: string};
export type ReviewRow = ReviewSubmission & {key: string; status: ReviewStatus};

export function unsupportedReviewRewardReason(quest: {rewards_on_completion?: readonly {nft_assets?: readonly unknown[]}[]}): string | null {
  return quest.rewards_on_completion?.some(reward => Boolean(reward.nft_assets?.length))
    ? "NFT reward approval is unavailable. Approval currently supports Points, CKB and UDT rewards only."
    : null;
}

export function normalizeReviewId(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (ArrayBuffer.isView(value)) {
    return `0x${Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  if (value instanceof ArrayBuffer) return normalizeReviewId(new Uint8Array(value));
  return "";
}

/** A response edit replaces the contributor's current response; it is not an
 * additional participant or submission in the review queue. */
export function buildReviewQueue(quests: readonly QuestDataLike[], submissions: ReadonlyMap<number, readonly ReviewSubmission[]>) {
  const byQuest = new Map<number, ReviewRow[]>();
  const participants = new Set<string>();
  let total = 0;
  let pending = 0;
  let approved = 0;
  for (const quest of quests) {
    const questId = Number(quest.quest_id);
    const accepted = new Set(quest.accepted_submission_user_type_ids.map(normalizeReviewId));
    const current = new Map<string, ReviewSubmission>();
    for (const submission of submissions.get(questId) ?? []) {
      const id = normalizeReviewId(submission.userTypeId);
      if (!id) continue;
      const previous = current.get(id);
      if (!previous || Number(submission.submission_timestamp) >= Number(previous.submission_timestamp)) current.set(id, {...submission, userTypeId: id});
    }
    const rows: ReviewRow[] = Array.from(current.values(), submission => ({
      ...submission, key: `${questId}:${submission.userTypeId}`,
      status: accepted.has(submission.userTypeId) ? "approved" : "pending",
    }));
    rows.sort((a, b) => Number(a.submission_timestamp) - Number(b.submission_timestamp) || a.userTypeId.localeCompare(b.userTypeId));
    byQuest.set(questId, rows);
    for (const row of rows) {
      participants.add(row.userTypeId);
      total++;
      if (row.status === "approved") approved++; else pending++;
    }
  }
  return {byQuest, totals: {participants: participants.size, submissions: total, pending, approved}};
}

export function getScopedReviewCounts(queue: ReturnType<typeof buildReviewQueue>, questFilter: string) {
  if (questFilter === "all") return {pending: queue.totals.pending, approved: queue.totals.approved};
  const rows = queue.byQuest.get(Number(questFilter)) ?? [];
  return {pending: rows.filter(row => row.status === "pending").length, approved: rows.filter(row => row.status === "approved").length};
}

export function reconcileReviewSelection(rows: readonly ReviewRow[], previousKey?: string | null): string | null {
  return rows.find(row => row.key === previousKey)?.key ?? rows[0]?.key ?? null;
}

/** Published campaigns can keep organizer-authored field definitions in a
 * Nostr event referenced by the chain stub. Never use contributor field labels
 * as a replacement when those organizer requirements cannot be loaded. */
export async function resolveReviewQuestContent(quest: QuestDataLike, fetchSubmission: SubmissionFetcher): Promise<QuestDataLike> {
  const reference = getQuestContentNeventId(quest);
  if (!reference) return quest;
  const fetched = await fetchSubmission(reference);
  if (!fetched) throw new Error("Quest requirements could not be loaded. Retry before reviewing or exporting.");
  let content = fetched.content;
  try {
    const wrapper: unknown = JSON.parse(content);
    if (wrapper && typeof wrapper === "object" && typeof (wrapper as {content?: unknown}).content === "string") content = (wrapper as {content: string}).content;
  } catch { /* The payload validator below reports malformed content. */ }
  const payload = parseQuestContentPayload(content);
  if (!payload || Number(payload.quest_id) !== Number(quest.quest_id) || !payload.sub_tasks.every(task => task && typeof task.title === "string" && typeof task.type === "string" && typeof task.description === "string" && typeof task.proof_required === "string" && ((task as {required_response?: unknown}).required_response === undefined || typeof (task as {required_response?: unknown}).required_response === "boolean"))) {
    throw new Error("Quest requirements are invalid or refer to a different quest. Reload the campaign before reviewing.");
  }
  return mergeQuestContentPayload(quest, content)!;
}

/** Prevent exported user evidence from becoming a spreadsheet formula. */
export function escapeReviewCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const markdownText = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]()#+.!<>|]/g, "\\$&");
function codeFence(value: string) {
  let longest = 2;
  for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${value}\n${fence}`;
}

/** Export the entire current selected quest, across both review statuses.
 * Nostr resolution reuses the existing fetch/cache path. Full response text is
 * retained; this format has no Excel continuation-row limit. */
export async function buildReviewExport(options: {
  format: "csv" | "markdown";
  campaignTitle: string;
  campaignTypeId: string;
  quest: QuestDataLike;
  rows: readonly ReviewRow[];
  userDetails: ReadonlyMap<string, UserDataLike>;
  fetchSubmission?: SubmissionFetcher;
}) {
  const {format, quest, rows, userDetails, fetchSubmission} = options;
  const fetchCache = new Map<string, ReturnType<SubmissionFetcher>>();
  const cachedFetch: SubmissionFetcher | undefined = fetchSubmission ? id => {
    if (!fetchCache.has(id)) fetchCache.set(id, fetchSubmission(id));
    return fetchCache.get(id)!;
  } : undefined;
  const prepared: Array<{row: ReviewRow; name: string; timestamp: string; responses: ReturnType<typeof buildQuestResponseEntries>; sources: string}> = [];
  // Keep export fetching bounded instead of opening every relay request at once.
  for (let index = 0; index < rows.length; index += 4) {
    prepared.push(...await Promise.all(rows.slice(index, index + 4).map(async row => {
      const user = parseSubmissionUserInfo(userDetails.get(row.userTypeId));
      const resolved = await resolveSubmissionContent(row.submission_content, cachedFetch);
      const timestamp = Number(row.submission_timestamp);
      return {row, name: user.name, timestamp: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "", responses: buildQuestResponseEntries(quest, resolved.resolvedContent), sources: resolved.events.map(event => event.error ? `${event.neventId} (${event.error})` : event.neventId).join("\n")};
    })));
  }
  const title = quest.metadata.title || `Quest ${quest.quest_id}`;
  const filename = `${options.campaignTitle || "campaign"}-quest-${quest.quest_id}-submissions`.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
  if (format === "csv") {
    const headers = ["Campaign", "Campaign type ID", "Quest", "User type ID", "Contributor", "Status", "Submitted at (UTC)", "Responses", "Nostr evidence"];
    const records = prepared.map(item => [options.campaignTitle, options.campaignTypeId, title, item.row.userTypeId, item.name, item.row.status === "approved" ? "Approved" : "Pending review", item.timestamp, item.responses.map(response => `${response.title}: ${response.response.trim() || "-"}`).join("\n\n"), item.sources]);
    return {filename: `${filename}.csv`, mimeType: "text/csv;charset=utf-8", content: "\ufeff" + [headers, ...records].map(row => row.map(escapeReviewCsvCell).join(",")).join("\r\n")};
  }
  const content = [`# ${markdownText(options.campaignTitle)} — ${markdownText(title)}`, `Campaign type ID: ${options.campaignTypeId}`, `${prepared.length} current submission${prepared.length === 1 ? "" : "s"}. Export includes Pending review and Approved.`, ...prepared.flatMap(item => [
    `## ${markdownText(item.name)}`, `User type ID: ${item.row.userTypeId}`, `Status: ${item.row.status === "approved" ? "Approved" : "Pending review"}`, `Submitted at (UTC): ${item.timestamp || "-"}`,
    ...item.responses.flatMap(response => [`### ${markdownText(response.title)}`, codeFence(response.response.trim() || "-")]),
    "### Nostr evidence", codeFence(item.sources || "No Nostr reference"),
  ])].join("\n\n");
  return {filename: `${filename}.md`, mimeType: "text/markdown;charset=utf-8", content};
}
