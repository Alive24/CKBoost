import type { CampaignDataLike, QuestDataLike } from "ssri-ckboost/types";

import { QuestClaimError } from "./errors";

export type ApprovalChange = {
  addedUserTypeIds: string[];
  quest: QuestDataLike;
};

function normalizeHex(value: unknown): string {
  if (typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    return value.toLowerCase();
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  throw new QuestClaimError(
    "approval_provenance_invalid",
    400,
    "Approval contains an invalid user identifier.",
  );
}

function normalized(value: unknown): unknown {
  if (typeof value === "bigint" || typeof value === "number") {
    return value.toString();
  }
  if (value instanceof Uint8Array) return normalizeHex(value);
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  }
  return value;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function num(value: unknown): bigint {
  try {
    return BigInt((value ?? 0) as string | number | bigint);
  } catch {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Approval contains an invalid completion count.",
    );
  }
}

function accepted(quest: QuestDataLike): string[] {
  return (quest.accepted_submission_user_type_ids ?? []).map(normalizeHex);
}

function assertQuestStaticFields(
  previous: QuestDataLike,
  next: QuestDataLike,
): void {
  for (const key of [
    "quest_id",
    "metadata",
    "rewards_on_completion",
    "completion_deadline",
    "status",
    "sub_tasks",
    "points",
  ] as const) {
    if (!equal(previous[key], next[key])) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        `Approval changed unexpected quest field ${key}.`,
      );
    }
  }
}

export function deriveApprovalChange(
  previous: CampaignDataLike,
  next: CampaignDataLike,
): ApprovalChange {
  for (const key of [
    "endorser_lock_hash",
    "staff_lock_hash_vec",
    "created_at",
    "starting_time",
    "ending_time",
    "rules",
    "metadata",
    "status",
  ] as const) {
    if (!equal(previous[key], next[key])) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        `Approval changed unexpected campaign field ${key}.`,
      );
    }
  }

  if (previous.quests.length !== next.quests.length) {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Approval changed the campaign quest list.",
    );
  }

  let change: ApprovalChange | undefined;
  for (let index = 0; index < previous.quests.length; index += 1) {
    const previousQuest = previous.quests[index];
    const nextQuest = next.quests[index];
    assertQuestStaticFields(previousQuest, nextQuest);

    const before = accepted(previousQuest);
    const after = accepted(nextQuest);
    if (after.length < before.length) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        "Approval removed a previously accepted submission.",
      );
    }
    if (before.some((id, acceptedIndex) => id !== after[acceptedIndex])) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        "Approval reordered previously accepted submissions.",
      );
    }

    const additions = after.slice(before.length);
    if (new Set(after).size !== after.length) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        "Approval contains duplicate user identifiers.",
      );
    }
    if (
      num(nextQuest.completion_count) - num(previousQuest.completion_count) !==
      BigInt(additions.length)
    ) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        "Approval completion count does not match accepted submissions.",
      );
    }

    if (additions.length > 0) {
      if (change) {
        throw new QuestClaimError(
          "approval_provenance_invalid",
          400,
          "Approval changed more than one quest.",
        );
      }
      change = { addedUserTypeIds: additions, quest: nextQuest };
    }
  }

  if (!change) {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Approval did not add a quest completion.",
    );
  }

  if (
    num(next.total_completions) - num(previous.total_completions) !==
    BigInt(change.addedUserTypeIds.length)
  ) {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Campaign completion count does not match the approval.",
    );
  }

  const participants = new Set(next.quests.flatMap((quest) => accepted(quest)));
  if (num(next.participants_count) !== BigInt(participants.size)) {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Campaign participant count does not match accepted submissions.",
    );
  }

  return change;
}
