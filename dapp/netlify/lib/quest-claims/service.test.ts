import type { ccc } from "@ckb-ccc/core";

import type { QuestClaimRequest } from "@/lib/vellum/quest-claims";
import type { PreparedQuestClaim } from "./issuer";
import type { QuestCompletionEvidence } from "./provenance";
import {
  issueQuestClaims,
  type QuestClaimServiceDependencies,
} from "./service";
import { MemoryQuestClaimStore } from "./memory-store";
import type { IssuerLeaseRecord } from "./store";

const TX_HASH = `0x${"44".repeat(32)}`;
const UNRELATED_TX_HASH = `0x${"aa".repeat(32)}`;
const CLAIM_TX_HASH = `0x${"55".repeat(32)}`;
const SUBJECT = "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2";
const OTHER_SUBJECT = "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMPLETION: QuestCompletionEvidence = {
  key: `${`0x${"11".repeat(32)}`}:7:${`0x${"22".repeat(32)}`}`,
  payload: {
    campaign_type_id: `0x${"11".repeat(32)}`,
    campaign_title: "Build on CKB",
    quest_id: 7,
    quest_title: "Ship an integration",
    ckboost_user_type_id: `0x${"22".repeat(32)}`,
    completed_at: 2_000_000_000,
    approval_tx_hash: `0x${"33".repeat(32)}`,
    reward_claim_tx_hash: TX_HASH,
    points_awarded: "250",
  },
};
const PREPARED: PreparedQuestClaim = {
  claimId: `0x${"66".repeat(32)}`,
  outputIndex: 2,
  signedTransaction: "0x1234" as ccc.Hex,
  transactionHash: CLAIM_TX_HASH as ccc.Hex,
};

const SECOND_COMPLETION: QuestCompletionEvidence = {
  key: `${`0x${"11".repeat(32)}`}:7:${`0x${"77".repeat(32)}`}`,
  payload: {
    ...COMPLETION.payload,
    ckboost_user_type_id: `0x${"77".repeat(32)}`,
  },
};
const SECOND_PREPARED: PreparedQuestClaim = {
  claimId: `0x${"88".repeat(32)}`,
  outputIndex: 3,
  signedTransaction: "0x5678" as ccc.Hex,
  transactionHash: `0x${"99".repeat(32)}` as ccc.Hex,
};

const UNRELATED_COMPLETION: QuestCompletionEvidence = {
  key: `${`0x${"bb".repeat(32)}`}:8:${`0x${"cc".repeat(32)}`}`,
  payload: {
    ...COMPLETION.payload,
    campaign_type_id: `0x${"bb".repeat(32)}`,
    quest_id: 8,
    ckboost_user_type_id: `0x${"cc".repeat(32)}`,
    reward_claim_tx_hash: UNRELATED_TX_HASH,
  },
};

function request(
  subjectDid = SUBJECT,
  rewardClaimTxHash = TX_HASH,
): QuestClaimRequest {
  return { rewardClaimTxHash, subjectDid };
}

function fixture(store = new MemoryQuestClaimStore()) {
  let transactionStatus: "committed" | "pending" | undefined;
  let now = 2_000_000_100;
  const prepare = jest.fn(async () => PREPARED);
  const broadcast = jest.fn(
    async (
      _client: ccc.Client,
      _signedTransaction: ccc.HexLike,
      _expectedHash: ccc.HexLike,
    ) => {
      const claim = await store.getClaim(COMPLETION.key);
      const lease = await store.getLease();
      expect(["prepared", "submitted"]).toContain(claim?.value.status);
      expect(claim?.value.signedTransaction).toBe(PREPARED.signedTransaction);
      expect(lease?.value.completionKey).toBe(COMPLETION.key);
      expect(lease?.value.transactionHash).toBe(CLAIM_TX_HASH);
      return CLAIM_TX_HASH as ccc.Hex;
    },
  );
  const reconstruct = jest.fn(async () => [COMPLETION]);
  const client = {
    getTransaction: jest.fn(async () =>
      transactionStatus ? { status: transactionStatus } : undefined,
    ),
  } as unknown as ccc.Client;
  const dependencies: QuestClaimServiceDependencies = {
    broadcast,
    client,
    now: () => now,
    prepare,
    reconstruct,
    store,
    token: () => "reservation-token",
  };
  return {
    advance: (seconds: number) => {
      now += seconds;
    },
    broadcast,
    dependencies,
    prepare,
    store,
    setTransactionStatus: (status: typeof transactionStatus) => {
      transactionStatus = status;
    },
  };
}

describe("issueQuestClaims", () => {
  test("persists before broadcast and confirms without signing twice", async () => {
    const setup = fixture();
    const first = await issueQuestClaims(request(), {}, setup.dependencies);
    expect(first).toMatchObject({ complete: false, status: "pending" });
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(1);

    const retry = await issueQuestClaims(request(), {}, setup.dependencies);
    expect(retry).toMatchObject({ complete: false, status: "pending" });
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(1);

    setup.setTransactionStatus("committed");
    const confirmed = await issueQuestClaims(request(), {}, setup.dependencies);
    expect(confirmed).toMatchObject({
      complete: true,
      status: "confirmed",
      claims: [
        {
          transactionHash: CLAIM_TX_HASH,
          outputIndex: 2,
        },
      ],
    });
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(1);
  });

  test("does not let a retry bind the completion to another DID", async () => {
    const setup = fixture();
    await issueQuestClaims(request(), {}, setup.dependencies);

    await expect(
      issueQuestClaims(request(OTHER_SUBJECT), {}, setup.dependencies),
    ).rejects.toMatchObject({ code: "completion_already_bound" });
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(1);
  });

  test("allows concurrent retries to prepare and broadcast only once", async () => {
    const setup = fixture();

    const results = await Promise.all([
      issueQuestClaims(request(), {}, setup.dependencies),
      issueQuestClaims(request(), {}, setup.dependencies),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ complete: false, status: "pending" }),
      expect.objectContaining({ complete: false, status: "pending" }),
    ]);
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(1);
  });

  test("retries the persisted transaction bytes after broadcast failure", async () => {
    const setup = fixture();
    setup.broadcast.mockRejectedValueOnce(new Error("RPC unavailable"));

    await expect(
      issueQuestClaims(request(), {}, setup.dependencies),
    ).rejects.toThrow("RPC unavailable");
    expect(setup.prepare).toHaveBeenCalledTimes(1);

    await expect(
      issueQuestClaims(request(), {}, setup.dependencies),
    ).resolves.toMatchObject({
      complete: false,
      status: "pending",
    });
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(2);
  });

  test("lets an unrelated request recover a missing bound transaction", async () => {
    const setup = fixture();
    setup.broadcast.mockRejectedValueOnce(new Error("RPC unavailable"));
    setup.dependencies.reconstruct = jest.fn(async (_client, claimRequest) =>
      claimRequest.rewardClaimTxHash === UNRELATED_TX_HASH
        ? [UNRELATED_COMPLETION]
        : [COMPLETION],
    );

    await expect(
      issueQuestClaims(request(), {}, setup.dependencies),
    ).rejects.toThrow("RPC unavailable");
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect((await setup.store.getLease())?.value).toMatchObject({
      completionKey: COMPLETION.key,
      transactionHash: CLAIM_TX_HASH,
    });

    setup.advance(60 * 60);
    await expect(
      issueQuestClaims(
        request(SUBJECT, UNRELATED_TX_HASH),
        {},
        setup.dependencies,
      ),
    ).resolves.toMatchObject({ complete: false, status: "pending" });

    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(2);
    expect(setup.broadcast.mock.calls[1]?.[1]).toBe(
      PREPARED.signedTransaction,
    );
    expect(await setup.store.getClaim(UNRELATED_COMPLETION.key)).toBeNull();
  });

  test("rebroadcasts the same submitted transaction after it remains unavailable", async () => {
    const setup = fixture();
    await issueQuestClaims(request(), {}, setup.dependencies);
    setup.advance(61);

    await expect(
      issueQuestClaims(request(), {}, setup.dependencies),
    ).resolves.toMatchObject({ complete: false, status: "pending" });
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(2);
    expect(setup.broadcast.mock.calls[1]?.[1]).toBe(PREPARED.signedTransaction);
  });

  test("serializes multiple completions without signing either twice", async () => {
    const statuses = new Map<string, "committed" | "pending">();
    const store = new MemoryQuestClaimStore();
    const prepare = jest.fn(async (_subject, payload) =>
      payload.ckboost_user_type_id ===
      SECOND_COMPLETION.payload.ckboost_user_type_id
        ? SECOND_PREPARED
        : PREPARED,
    );
    const broadcast = jest.fn(
      async (_client, _signedTransaction, expectedHash) =>
        expectedHash as ccc.Hex,
    );
    const dependencies: QuestClaimServiceDependencies = {
      broadcast,
      client: {
        getTransaction: jest.fn(async (transactionHash: ccc.HexLike) => {
          const status = statuses.get(String(transactionHash));
          return status ? { status } : undefined;
        }),
      } as unknown as ccc.Client,
      now: () => 2_000_000_100,
      prepare,
      reconstruct: jest.fn(async () => [COMPLETION, SECOND_COMPLETION]),
      store,
      token: (() => {
        let index = 0;
        return () => `reservation-token-${(index += 1)}`;
      })(),
    };

    await issueQuestClaims(request(), {}, dependencies);
    statuses.set(PREPARED.transactionHash, "committed");
    const second = await issueQuestClaims(request(), {}, dependencies);
    expect(second).toMatchObject({ complete: false, status: "pending" });
    expect(second.claims).toHaveLength(2);

    statuses.set(SECOND_PREPARED.transactionHash, "committed");
    const complete = await issueQuestClaims(request(), {}, dependencies);
    expect(complete).toMatchObject({ complete: true, status: "confirmed" });
    expect(complete.claims).toHaveLength(2);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  test("does not broadcast until a persisted transaction owns the issuer lease", async () => {
    class BlockingLeaseStore extends MemoryQuestClaimStore {
      blockTransactionBinding = true;

      override updateLease(
        etag: string,
        record: IssuerLeaseRecord,
      ): Promise<boolean> {
        if (this.blockTransactionBinding && record.transactionHash) {
          return Promise.resolve(false);
        }
        return super.updateLease(etag, record);
      }
    }

    const store = new BlockingLeaseStore();
    const setup = fixture(store);
    await expect(
      issueQuestClaims(request(), {}, setup.dependencies),
    ).rejects.toThrow("Issuer lease changed");
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).not.toHaveBeenCalled();
    expect((await store.getClaim(COMPLETION.key))?.value.status).toBe(
      "prepared",
    );

    store.blockTransactionBinding = false;
    await issueQuestClaims(request(), {}, setup.dependencies);
    expect(setup.prepare).toHaveBeenCalledTimes(1);
    expect(setup.broadcast).toHaveBeenCalledTimes(1);
  });
});
