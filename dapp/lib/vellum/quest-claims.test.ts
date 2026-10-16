import {
  parseQuestClaimRequest,
  shouldRetryQuestClaimResponse,
  type QuestClaimRequest,
} from "./quest-claims";

const request: QuestClaimRequest = {
  rewardClaimTxHash: `0x${"11".repeat(32)}`,
  subjectDid: "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2",
};

describe("parseQuestClaimRequest", () => {
  test("accepts the exact DID and reward transaction request", () => {
    expect(parseQuestClaimRequest(request)).toEqual(request);
  });

  test("rejects malformed or non-canonical requests", () => {
    expect(() =>
      parseQuestClaimRequest({
        ...request,
        rewardClaimTxHash: `0x${"AA".repeat(32)}`,
      }),
    ).toThrow();
    expect(() =>
      parseQuestClaimRequest({ ...request, subjectDid: "did:example:subject" }),
    ).toThrow();
    expect(() =>
      parseQuestClaimRequest({ ...request, campaignId: "trusted" }),
    ).toThrow();
  });
});

describe("shouldRetryQuestClaimResponse", () => {
  test("retries pending and temporarily invalid successful responses", () => {
    expect(
      shouldRetryQuestClaimResponse(200, {
        success: true,
        complete: false,
        claims: [],
        status: "pending",
      }),
    ).toBe(true);
    expect(
      shouldRetryQuestClaimResponse(200, {
        success: false,
        error: "invalid_response",
        message: "Invalid response",
      }),
    ).toBe(true);
  });

  test("does not retry a terminal binding conflict", () => {
    expect(
      shouldRetryQuestClaimResponse(409, {
        success: false,
        error: "completion_already_bound",
        message: "Already bound",
      }),
    ).toBe(false);
  });
});
