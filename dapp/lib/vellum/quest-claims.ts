export const QUEST_CLAIM_API_PATH = "/api/vellum-quest-claim";

export type QuestClaimRequest = {
  rewardClaimTxHash: string;
  subjectDid: string;
};

export type QuestClaimOutPoint = {
  campaignTypeId: string;
  ckboostUserTypeId: string;
  claimId: string;
  outputIndex: number;
  questId: number;
  transactionHash: string;
};

export type QuestClaimResponse =
  | {
      success: true;
      complete: boolean;
      claims: QuestClaimOutPoint[];
      retryAfterSeconds?: number;
      status: "confirmed" | "pending";
    }
  | {
      success: false;
      error: string;
      message: string;
      retryAfterSeconds?: number;
    };

export function shouldRetryQuestClaimResponse(
  statusCode: number,
  response: QuestClaimResponse,
): boolean {
  if (response.success && !response.complete) return true;
  if (
    !response.success &&
    response.error === "invalid_response" &&
    statusCode >= 200 &&
    statusCode < 300
  ) {
    return true;
  }
  return (
    statusCode === 202 ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

const TX_HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const DID_CKB_PATTERN = /^did:ckb:[a-z2-7]{32}$/;
const REQUEST_KEYS = ["rewardClaimTxHash", "subjectDid"];

export function parseQuestClaimRequest(value: unknown): QuestClaimRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Quest claim request must be an object.");
  }

  const request = value as Record<string, unknown>;
  const keys = Object.keys(request).sort();
  if (
    keys.length !== REQUEST_KEYS.length ||
    keys.some((key, index) => key !== REQUEST_KEYS[index]) ||
    typeof request.rewardClaimTxHash !== "string" ||
    !TX_HASH_PATTERN.test(request.rewardClaimTxHash) ||
    typeof request.subjectDid !== "string" ||
    !DID_CKB_PATTERN.test(request.subjectDid)
  ) {
    throw new TypeError("Quest claim request is invalid.");
  }

  return request as QuestClaimRequest;
}
