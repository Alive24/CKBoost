import type { CampaignDataLike, QuestDataLike } from "ssri-ckboost/types";

import { deriveApprovalChange } from "./approval";

const USER_A = `0x${"11".repeat(32)}`;
const USER_B = `0x${"22".repeat(32)}`;

function quest(overrides: Partial<QuestDataLike> = {}): QuestDataLike {
  return {
    quest_id: 1,
    metadata: {
      title: "Ship an integration",
      short_description: "Ship it",
      long_description: "Ship a complete integration",
      requirements: "Working code",
      difficulty: 1,
      time_estimate: 60,
    },
    rewards_on_completion: [],
    accepted_submission_user_type_ids: [],
    completion_deadline: 0,
    status: 1,
    sub_tasks: [],
    points: 100,
    completion_count: 0,
    ...overrides,
  };
}

function campaign(
  quests: QuestDataLike[],
  overrides: Partial<CampaignDataLike> = {},
): CampaignDataLike {
  return {
    endorser_lock_hash: `0x${"33".repeat(32)}`,
    staff_lock_hash_vec: [],
    created_at: 1,
    starting_time: 1,
    ending_time: 2,
    rules: [],
    metadata: {
      title: "Build on CKB",
      short_description: "Build",
      long_description: "Build on CKB",
      total_rewards: {
        points_amount: 100,
        ckb_amount: 0,
        nft_assets: [],
        udt_assets: [],
      },
      verification_requirements: [],
      last_updated: 1,
      categories: [],
      difficulty: 1,
      image_url: "",
    },
    status: 1,
    quests,
    participants_count: 0,
    total_completions: 0,
    ...overrides,
  };
}

describe("deriveApprovalChange", () => {
  test("extracts the one append-only quest approval", () => {
    const previous = campaign([quest()]);
    const next = campaign(
      [
        quest({
          accepted_submission_user_type_ids: [USER_A],
          completion_count: 1,
        }),
      ],
      { participants_count: 1, total_completions: 1 },
    );

    expect(deriveApprovalChange(previous, next).addedUserTypeIds).toEqual([
      USER_A,
    ]);
  });

  test("rejects reordered history and unrelated quest changes", () => {
    const previous = campaign(
      [
        quest({
          accepted_submission_user_type_ids: [USER_A],
          completion_count: 1,
        }),
      ],
      { participants_count: 1, total_completions: 1 },
    );
    const reordered = campaign(
      [
        quest({
          accepted_submission_user_type_ids: [USER_B, USER_A],
          completion_count: 2,
        }),
      ],
      { participants_count: 2, total_completions: 2 },
    );
    expect(() => deriveApprovalChange(previous, reordered)).toThrow(
      "reordered",
    );

    const renamed = campaign(
      [
        quest({
          metadata: {
            ...quest().metadata,
            title: "Changed after approval",
          },
          accepted_submission_user_type_ids: [USER_A, USER_B],
          completion_count: 2,
        }),
      ],
      { participants_count: 2, total_completions: 2 },
    );
    expect(() => deriveApprovalChange(previous, renamed)).toThrow(
      "unexpected quest field metadata",
    );
  });

  test("rejects completion counters that do not match additions", () => {
    const previous = campaign([quest()]);
    const next = campaign(
      [
        quest({
          accepted_submission_user_type_ids: [USER_A],
          completion_count: 2,
        }),
      ],
      { participants_count: 1, total_completions: 1 },
    );
    expect(() => deriveApprovalChange(previous, next)).toThrow(
      "completion count",
    );
  });
});
