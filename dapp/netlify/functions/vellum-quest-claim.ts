import {
  parseQuestClaimRequest,
  type QuestClaimRequest,
  type QuestClaimResponse,
} from "@/lib/vellum/quest-claims";
import { QuestClaimError } from "@/netlify/lib/quest-claims/errors";
import { issueQuestClaimsFromEnvironment } from "@/netlify/lib/quest-claims/runtime";

const logPrefix = "[vellum-quest-claim]";

function response(statusCode: number, body: QuestClaimResponse): Response {
  const retryAfterSeconds = body.retryAfterSeconds;
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...(retryAfterSeconds
        ? { "Retry-After": String(retryAfterSeconds) }
        : {}),
    },
  });
}

async function vellumQuestClaim(incomingRequest: Request): Promise<Response> {
  if (incomingRequest.method !== "POST") {
    return response(405, {
      success: false,
      error: "method_not_allowed",
      message: "Only POST is supported.",
    });
  }

  const body = await incomingRequest.text();
  if (!body) {
    return response(400, {
      success: false,
      error: "missing_body",
      message: "Request body is required.",
    });
  }

  let claimRequest: QuestClaimRequest;
  try {
    claimRequest = parseQuestClaimRequest(JSON.parse(body));
  } catch {
    return response(400, {
      success: false,
      error: "invalid_request",
      message: "Quest claim request is invalid.",
    });
  }

  try {
    const result = await issueQuestClaimsFromEnvironment(claimRequest);
    console.info(logPrefix, "quest_claim_processed", {
      complete: result.complete,
      claimCount: result.claims.length,
      rewardClaimTxHash: claimRequest.rewardClaimTxHash,
    });
    return response(result.complete ? 200 : 202, result);
  } catch (error) {
    if (error instanceof QuestClaimError) {
      console.warn(logPrefix, "quest_claim_rejected", {
        code: error.code,
        rewardClaimTxHash: claimRequest.rewardClaimTxHash,
      });
      return response(error.statusCode, {
        success: false,
        error: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }

    console.error(logPrefix, "quest_claim_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      rewardClaimTxHash: claimRequest.rewardClaimTxHash,
    });
    return response(500, {
      success: false,
      error: "issuer_unavailable",
      message: "The CKBoost Claim Cell issuer is unavailable.",
      retryAfterSeconds: 30,
    });
  }
}

export default vellumQuestClaim;
