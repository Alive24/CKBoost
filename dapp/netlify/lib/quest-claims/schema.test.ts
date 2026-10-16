import {
  parseCkboostQuestClaimPayload,
  type CkboostQuestClaimPayload,
} from "./schema";

const payload: CkboostQuestClaimPayload = {
  campaign_type_id: `0x${"11".repeat(32)}`,
  campaign_title: "Build on CKB",
  quest_id: 7,
  quest_title: "Ship an integration",
  ckboost_user_type_id: `0x${"22".repeat(32)}`,
  completed_at: 2_000_000_000,
  approval_tx_hash: `0x${"33".repeat(32)}`,
  reward_claim_tx_hash: `0x${"44".repeat(32)}`,
  points_awarded: "250",
};

describe("ckboost.quest.v1 payload", () => {
  test("accepts canonical completion evidence", () => {
    expect(parseCkboostQuestClaimPayload(payload)).toEqual(payload);
  });

  test("rejects extra properties and non-canonical values", () => {
    expect(() =>
      parseCkboostQuestClaimPayload({ ...payload, issuerKey: "secret" }),
    ).toThrow();
    expect(() =>
      parseCkboostQuestClaimPayload({ ...payload, points_awarded: "0250" }),
    ).toThrow();
    expect(() =>
      parseCkboostQuestClaimPayload({
        ...payload,
        reward_claim_tx_hash: payload.approval_tx_hash,
      }),
    ).toThrow();
  });
});
