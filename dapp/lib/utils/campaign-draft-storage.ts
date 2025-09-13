// Utilities for autosaving campaign creation drafts with versioning in localStorage
// Keeps up to 10 versions and deduplicates unchanged snapshots.

export type DraftFundingEntry = { scriptHash: string; amount: string };

export interface CampaignCreateDraftPayload {
  // Keep this shape loose to avoid tight coupling with UI types
  campaignData: Record<string, unknown>;
  // Quests as plain objects (QuestDataLike-compatible shape)
  quests: Array<Record<string, unknown>>;
  // Map cannot be serialized directly, so we store entries
  initialFunding: DraftFundingEntry[]; // [ { scriptHash, amount (decimal string) } ]
  ckbInitialFunding: string; // decimal string
}

interface DraftVersionEntry {
  savedAt: number; // ms epoch
  data: CampaignCreateDraftPayload;
  signature: string; // stable signature used for change detection
}

const CREATE_DRAFT_CURRENT_KEY = "ckboost_campaign_create_current";
const CREATE_DRAFT_HISTORY_KEY = "ckboost_campaign_create_history";

// Build a canonical object with ordered keys to stabilize JSON.stringify order
function canonicalizeDraft(payload: CampaignCreateDraftPayload): unknown {
  const canonicalQuests = (payload.quests || []).map((q) => {
    const obj = q as Record<string, unknown>;
    return {
      // Typical quest fields in explicit order if present
      quest_id: obj["quest_id"] ?? null,
      metadata: obj["metadata"] ?? null,
      points: obj["points"] ?? null,
      rewards_on_completion: Array.isArray(obj["rewards_on_completion"]) ? (obj["rewards_on_completion"] as unknown[]) : [],
      accepted_submission_user_type_ids: Array.isArray(obj["accepted_submission_user_type_ids"]) ? (obj["accepted_submission_user_type_ids"] as unknown[]) : [],
      completion_deadline: obj["completion_deadline"] ?? null,
      status: obj["status"] ?? null,
      sub_tasks: Array.isArray(obj["sub_tasks"]) ? (obj["sub_tasks"] as unknown[]) : [],
      completion_count: (obj["completion_count"] as unknown) ?? 0,
    };
  });

  const canonicalFunding = [...(payload.initialFunding || [])]
    .map((e) => ({ scriptHash: e.scriptHash, amount: String(e.amount) }))
    .sort((a, b) => a.scriptHash.localeCompare(b.scriptHash));

  const cd = (payload.campaignData || {}) as Record<string, unknown>;
  // Order key fields commonly used in the form; include rest as-is to avoid data loss
  const rest: Record<string, unknown> = { ...cd };
  const title = typeof cd["title"] === "string" ? (cd["title"] as string) : "";
  const shortDescription = typeof cd["shortDescription"] === "string" ? (cd["shortDescription"] as string) : "";
  const longDescription = typeof cd["longDescription"] === "string" ? (cd["longDescription"] as string) : "";
  const categories = Array.isArray(cd["categories"]) ? (cd["categories"] as unknown[]) : [];
  const startDate = typeof cd["startDate"] === "string" ? (cd["startDate"] as string) : "";
  const endDate = typeof cd["endDate"] === "string" ? (cd["endDate"] as string) : "";
  const difficulty = typeof cd["difficulty"] === "number" ? (cd["difficulty"] as number) : 0;
  const verificationLevel = typeof cd["verificationLevel"] === "string" ? (cd["verificationLevel"] as string) : "none";
  const rules = Array.isArray(cd["rules"]) ? (cd["rules"] as unknown[]) : [];

  // remove known fields from rest so they don't get duplicated
  delete rest["title"];
  delete rest["shortDescription"];
  delete rest["longDescription"];
  delete rest["categories"];
  delete rest["startDate"];
  delete rest["endDate"];
  delete rest["difficulty"];
  delete rest["verificationLevel"];
  delete rest["rules"];

  return {
    campaignData: {
      title,
      shortDescription,
      longDescription,
      categories,
      startDate,
      endDate,
      difficulty,
      verificationLevel,
      rules,
      // Preserve any extra fields while keeping canonical order above
      ...rest,
    },
    quests: canonicalQuests,
    initialFunding: canonicalFunding,
    ckbInitialFunding: String(payload.ckbInitialFunding ?? "0"),
  };
}

function deepCoerce(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((v) => deepCoerce(v));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = deepCoerce(obj[k]);
    return out;
  }
  return value;
}

function buildSignature(payload: CampaignCreateDraftPayload): string {
  // Stable signature for change detection
  const canonical = canonicalizeDraft(payload);
  return JSON.stringify(deepCoerce(canonical));
}

export function loadCreateDraft(): CampaignCreateDraftPayload | null {
  try {
    const raw = localStorage.getItem(CREATE_DRAFT_CURRENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape guard
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "campaignData" in parsed &&
      "quests" in parsed &&
      "initialFunding" in parsed &&
      "ckbInitialFunding" in parsed
    ) {
      return parsed as CampaignCreateDraftPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function getCreateDraftHistory(): DraftVersionEntry[] {
  try {
    const raw = localStorage.getItem(CREATE_DRAFT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DraftVersionEntry[];
    return [];
  } catch {
    return [];
  }
}

export function saveCreateDraft(payload: CampaignCreateDraftPayload): {
  saved: boolean;
  skipped: boolean;
  versions: number;
} {
  try {
    const signature = buildSignature(payload);
    const versions = getCreateDraftHistory();
    const last = versions[versions.length - 1];

    // Skip if unchanged
    if (last && last.signature === signature) {
      // Still refresh the current pointer for quick resume (BigInt-safe)
      const currentSafe = deepCoerce(canonicalizeDraft(payload)) as CampaignCreateDraftPayload;
      localStorage.setItem(CREATE_DRAFT_CURRENT_KEY, JSON.stringify(currentSafe));
      return { saved: false, skipped: true, versions: versions.length };
    }

    // Append new version (store BigInt-safe copy)
    const safePayload = deepCoerce(canonicalizeDraft(payload)) as CampaignCreateDraftPayload;
    const entry: DraftVersionEntry = {
      savedAt: Date.now(),
      data: safePayload,
      signature,
    };
    versions.push(entry);

    // Trim to last 10
    while (versions.length > 10) versions.shift();

    localStorage.setItem(CREATE_DRAFT_CURRENT_KEY, JSON.stringify(safePayload));
    localStorage.setItem(CREATE_DRAFT_HISTORY_KEY, JSON.stringify(versions));
    return { saved: true, skipped: false, versions: versions.length };
  } catch (e) {
    console.error("Failed to save draft:", e);
    return { saved: false, skipped: true, versions: getCreateDraftHistory().length };
  }
}

export function clearCreateDraft(): void {
  try {
    localStorage.removeItem(CREATE_DRAFT_CURRENT_KEY);
    localStorage.removeItem(CREATE_DRAFT_HISTORY_KEY);
  } catch (e) {
    console.error("Failed to clear draft:", e);
  }
}
