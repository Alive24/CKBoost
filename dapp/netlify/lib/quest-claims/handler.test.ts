/** @jest-environment node */

import vellumQuestClaim from "@/netlify/functions/vellum-quest-claim";
import { QuestClaimError } from "./errors";
import { issueQuestClaimsFromEnvironment } from "./runtime";

jest.mock("./runtime", () => ({ issueQuestClaimsFromEnvironment: jest.fn() }));

const TX_HASH = `0x${"44".repeat(32)}`;
const SUBJECT = "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2";

function request(method: string, body?: string): Request {
  return new Request("https://ckboost.example/api/vellum-quest-claim", {
    method,
    body,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("vellum quest claim handler", () => {
  beforeAll(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("passes a validated request to the issuance service", async () => {
    jest.mocked(issueQuestClaimsFromEnvironment).mockResolvedValue({
      success: true,
      complete: true,
      claims: [],
      status: "confirmed",
    });
    const incomingRequest = request(
      "POST",
      JSON.stringify({ rewardClaimTxHash: TX_HASH, subjectDid: SUBJECT }),
    );

    const result = await vellumQuestClaim(incomingRequest);

    expect(issueQuestClaimsFromEnvironment).toHaveBeenCalledWith({
      rewardClaimTxHash: TX_HASH,
      subjectDid: SUBJECT,
    });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({
      complete: true,
      success: true,
    });
  });

  test("rejects unsupported methods before calling the service", async () => {
    const result = await vellumQuestClaim(request("GET"));

    expect(result.status).toBe(405);
    expect(issueQuestClaimsFromEnvironment).not.toHaveBeenCalled();
  });

  test("rejects malformed requests before calling the service", async () => {
    const result = await vellumQuestClaim(request("POST", "{}"));

    expect(result.status).toBe(400);
    expect(issueQuestClaimsFromEnvironment).not.toHaveBeenCalled();
  });

  test("preserves retry guidance from a service error", async () => {
    jest
      .mocked(issueQuestClaimsFromEnvironment)
      .mockRejectedValue(
        new QuestClaimError(
          "reward_pending",
          202,
          "The reward transaction is not confirmed yet.",
          15,
        ),
      );

    const result = await vellumQuestClaim(
      request(
        "POST",
        JSON.stringify({ rewardClaimTxHash: TX_HASH, subjectDid: SUBJECT }),
      ),
    );

    expect(result.status).toBe(202);
    expect(result.headers.get("Retry-After")).toBe("15");
    await expect(result.json()).resolves.toMatchObject({
      error: "reward_pending",
      retryAfterSeconds: 15,
      success: false,
    });
  });
});
