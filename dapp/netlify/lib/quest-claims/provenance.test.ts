jest.mock("@ckb-ccc/did-ckb", () => ({ resolveDidCkb: jest.fn() }));

import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";
import { encodeClaimablePoolData } from "ckb-claimable-pool-lock";
import {
  CampaignData,
  ConnectedTypeID,
  type CampaignDataLike,
  type QuestDataLike,
} from "ssri-ckboost/types";

import { deriveApprovalChange } from "./approval";
import {
  CLAIMABLE_POOL_LOCK_CODE_HASH,
  CKBOOST_CAMPAIGN_TYPE_CODE_HASH,
  CKBOOST_POINTS_UDT_CODE_HASH,
} from "./config";
import { reconstructQuestCompletions } from "./provenance";

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

describe("reconstructQuestCompletions", () => {
  test("rejects an otherwise valid campaign from a foreign protocol instance", async () => {
    const hash = (byte: string) => `0x${byte.repeat(64)}` as ccc.Hex;
    const controller = ccc.Script.from({
      codeHash: hash("a"),
      hashType: "type",
      args: "0x01",
    });
    const foreignProtocolTypeHash = hash("b");
    const trustedProtocolTypeHash = hash("c");
    const campaignTypeId = hash("d");
    const userTypeId = hash("e");
    const campaignType = ccc.Script.from({
      codeHash: CKBOOST_CAMPAIGN_TYPE_CODE_HASH,
      hashType: "type",
      args: ccc.hexFrom(
        ConnectedTypeID.encode({
          connected_key: foreignProtocolTypeHash,
          type_id: campaignTypeId,
        }),
      ),
    });
    const pointsType = ccc.Script.from({
      codeHash: CKBOOST_POINTS_UDT_CODE_HASH,
      hashType: "type",
      args: foreignProtocolTypeHash,
    });
    const poolLock = ccc.Script.from({
      codeHash: CLAIMABLE_POOL_LOCK_CODE_HASH,
      hashType: "type",
      args: "0x",
    });
    const previousCampaign = campaign([quest()]);
    const nextCampaign = campaign(
      [
        quest({
          accepted_submission_user_type_ids: [userTypeId],
          completion_count: 1,
        }),
      ],
      { participants_count: 1, total_completions: 1 },
    );
    const campaignOriginHash = hash("1");
    const approvalTxHash = hash("2");
    const controllerInputHash = hash("3");
    const rewardTxHash = hash("4");
    const campaignOrigin = ccc.Transaction.from({
      outputs: [
        {
          capacity: 1_000n * 10n ** 8n,
          lock: controller,
          type: campaignType,
        },
      ],
      outputsData: [ccc.hexFrom(CampaignData.encode(previousCampaign))],
    });
    const approval = ccc.Transaction.from({
      inputs: [{ previousOutput: { txHash: campaignOriginHash, index: 0 } }],
      outputs: [
        {
          capacity: 1_000n * 10n ** 8n,
          lock: controller,
          type: campaignType,
        },
        {
          capacity: 200n * 10n ** 8n,
          lock: poolLock,
          type: pointsType,
        },
      ],
      outputsData: [
        ccc.hexFrom(CampaignData.encode(nextCampaign)),
        encodeClaimablePoolData([
          { amount: 100n, claimantLockHash: controller.hash() },
        ]),
      ],
    });
    const controllerInput = ccc.Transaction.from({
      outputs: [{ capacity: 100n * 10n ** 8n, lock: controller }],
      outputsData: ["0x"],
    });
    const reward = ccc.Transaction.from({
      inputs: [
        { previousOutput: { txHash: approvalTxHash, index: 1 } },
        { previousOutput: { txHash: controllerInputHash, index: 0 } },
      ],
      outputs: [],
      outputsData: [],
    });
    const transactions = new Map<ccc.Hex, ccc.ClientTransactionResponse>([
      [
        campaignOriginHash,
        {
          status: "committed",
          transaction: campaignOrigin,
        } as ccc.ClientTransactionResponse,
      ],
      [
        approvalTxHash,
        {
          status: "committed",
          transaction: approval,
        } as ccc.ClientTransactionResponse,
      ],
      [
        controllerInputHash,
        {
          status: "committed",
          transaction: controllerInput,
        } as ccc.ClientTransactionResponse,
      ],
    ]);
    const client = {
      getTipHeader: jest.fn(async () => ({ number: 105n })),
      getTransaction: jest.fn(async (txHash: ccc.HexLike) =>
        transactions.get(ccc.hexFrom(txHash)),
      ),
      getTransactionWithHeader: jest.fn(async () => ({
        header: { timestamp: 2_000_000_000_000n },
        transaction: {
          blockNumber: 100n,
          status: "committed",
          transaction: reward,
        },
      })),
    } as unknown as ccc.Client;
    jest.mocked(resolveDidCkb).mockResolvedValue({
      cell: { cellOutput: { lock: controller } },
    } as Awaited<ReturnType<typeof resolveDidCkb>>);

    await expect(
      reconstructQuestCompletions(
        client,
        { rewardClaimTxHash: rewardTxHash, subjectDid: "did:ckb:test" },
        6,
        trustedProtocolTypeHash,
      ),
    ).rejects.toMatchObject({
      code: "approval_provenance_invalid",
      message: "Approval campaign does not belong to the configured CKBoost protocol.",
    });
    expect(client.findCells).toBeUndefined();
  });
});
