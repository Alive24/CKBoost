import {
  CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
  CKBOOST_QUEST_CLAIM_SCHEMA_ID,
} from "./config";

export type CkboostQuestClaimPayload = {
  approval_tx_hash: string;
  campaign_title: string;
  campaign_type_id: string;
  ckboost_user_type_id: string;
  completed_at: number;
  points_awarded: string;
  quest_id: number;
  quest_title: string;
  reward_claim_tx_hash: string;
};

export const ckboostQuestClaimSchema = {
  id: CKBOOST_QUEST_CLAIM_SCHEMA_ID,
  hash: CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
  parse: parseCkboostQuestClaimPayload,
} as const;

const HEX32_PATTERN = /^0x[0-9a-f]{64}$/;
const UINT128_PATTERN = /^(0|[1-9][0-9]{0,38})$/;
const UINT128_MAX = 340_282_366_920_938_463_463_374_607_431_768_211_455n;
const UINT32_MAX = 4_294_967_295;
const PAYLOAD_KEYS = [
  "approval_tx_hash",
  "campaign_title",
  "campaign_type_id",
  "ckboost_user_type_id",
  "completed_at",
  "points_awarded",
  "quest_id",
  "quest_title",
  "reward_claim_tx_hash",
];

function isDisplayText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

export function parseCkboostQuestClaimPayload(
  value: unknown,
): CkboostQuestClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("CKBoost quest claim payload must be an object.");
  }

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  const points =
    typeof payload.points_awarded === "string" &&
    UINT128_PATTERN.test(payload.points_awarded)
      ? BigInt(payload.points_awarded)
      : undefined;

  if (
    keys.length !== PAYLOAD_KEYS.length ||
    keys.some((key, index) => key !== PAYLOAD_KEYS[index]) ||
    typeof payload.campaign_type_id !== "string" ||
    !HEX32_PATTERN.test(payload.campaign_type_id) ||
    !isDisplayText(payload.campaign_title) ||
    typeof payload.quest_id !== "number" ||
    !Number.isInteger(payload.quest_id) ||
    payload.quest_id < 0 ||
    payload.quest_id > UINT32_MAX ||
    !isDisplayText(payload.quest_title) ||
    typeof payload.ckboost_user_type_id !== "string" ||
    !HEX32_PATTERN.test(payload.ckboost_user_type_id) ||
    typeof payload.completed_at !== "number" ||
    !Number.isSafeInteger(payload.completed_at) ||
    payload.completed_at <= 0 ||
    typeof payload.approval_tx_hash !== "string" ||
    !HEX32_PATTERN.test(payload.approval_tx_hash) ||
    typeof payload.reward_claim_tx_hash !== "string" ||
    !HEX32_PATTERN.test(payload.reward_claim_tx_hash) ||
    payload.approval_tx_hash === payload.reward_claim_tx_hash ||
    points === undefined ||
    points > UINT128_MAX
  ) {
    throw new TypeError(
      "CKBoost quest claim payload does not match ckboost.quest.v1.",
    );
  }

  return payload as CkboostQuestClaimPayload;
}
