import type { ccc } from "@ckb-ccc/core";

import type {
  QuestClaimOutPoint,
  QuestClaimRequest,
  QuestClaimResponse,
} from "@/lib/vellum/quest-claims";
import {
  requiredRewardConfirmations,
  type QuestClaimEnvironment,
} from "./config";
import { QuestClaimError } from "./errors";
import type { PreparedQuestClaim } from "./issuer";
import type { QuestCompletionEvidence } from "./provenance";
import {
  type ClaimIssuanceRecord,
  type IssuerLeaseRecord,
  type QuestClaimStore,
  type StoredValue,
} from "./store";

const PREPARATION_LEASE_SECONDS = 3 * 60;
const SUBMITTED_LEASE_SECONDS = 10 * 60;
const REBROADCAST_AFTER_SECONDS = 60;
const RETRY_AFTER_SECONDS = 15;

export type QuestClaimServiceDependencies = {
  broadcast: (
    client: ccc.Client,
    signedTransaction: ccc.HexLike,
    expectedHash: ccc.HexLike,
  ) => Promise<ccc.Hex>;
  client: ccc.Client;
  now: () => number;
  prepare: (
    subjectDid: string,
    payload: QuestCompletionEvidence["payload"],
    issuedAt: number,
    environment: QuestClaimEnvironment,
  ) => Promise<PreparedQuestClaim>;
  reconstruct: (
    client: ccc.Client,
    request: QuestClaimRequest,
    requiredConfirmations: number,
  ) => Promise<QuestCompletionEvidence[]>;
  store: QuestClaimStore;
  token: () => string;
};

type QuestClaimSuccessResponse = Extract<QuestClaimResponse, { success: true }>;

function pending(claims: QuestClaimOutPoint[]): QuestClaimSuccessResponse {
  return {
    success: true,
    complete: false,
    claims,
    retryAfterSeconds: RETRY_AFTER_SECONDS,
    status: "pending",
  };
}

function outPoint(record: ClaimIssuanceRecord): QuestClaimOutPoint | undefined {
  if (
    !record.claimId ||
    !record.transactionHash ||
    !Number.isInteger(record.outputIndex) ||
    record.outputIndex! < 0
  ) {
    return undefined;
  }
  return {
    campaignTypeId: record.payload.campaign_type_id,
    ckboostUserTypeId: record.payload.ckboost_user_type_id,
    claimId: record.claimId,
    outputIndex: record.outputIndex!,
    questId: record.payload.quest_id,
    transactionHash: record.transactionHash,
  };
}

async function acquireIssuerLease(
  dependencies: QuestClaimServiceDependencies,
  now: number,
): Promise<StoredValue<IssuerLeaseRecord> | undefined> {
  const replacement: IssuerLeaseRecord = {
    expiresAt: now + PREPARATION_LEASE_SECONDS,
    token: dependencies.token(),
    updatedAt: now,
    version: 1,
  };
  const current = await dependencies.store.getLease();
  if (!current) {
    if (!(await dependencies.store.createLease(replacement))) return undefined;
    const created = await dependencies.store.getLease();
    return created?.value.token === replacement.token ? created : undefined;
  }

  if (current.value.transactionHash) {
    const transaction = await dependencies.client.getTransaction(
      current.value.transactionHash,
    );
    if (
      !transaction ||
      !["committed", "rejected"].includes(transaction.status)
    ) {
      return undefined;
    }
  } else if (current.value.expiresAt > now) {
    return undefined;
  }

  if (!(await dependencies.store.updateLease(current.etag, replacement))) {
    return undefined;
  }
  const updated = await dependencies.store.getLease();
  return updated?.value.token === replacement.token ? updated : undefined;
}

async function expireLease(
  dependencies: QuestClaimServiceDependencies,
  lease: StoredValue<IssuerLeaseRecord>,
  now: number,
): Promise<void> {
  await dependencies.store.updateLease(lease.etag, {
    ...lease.value,
    expiresAt: now,
    updatedAt: now,
  });
}

async function bindTransactionToLease(
  dependencies: QuestClaimServiceDependencies,
  lease: StoredValue<IssuerLeaseRecord>,
  transactionHash: string,
  now: number,
): Promise<StoredValue<IssuerLeaseRecord> | undefined> {
  if (lease.value.transactionHash) {
    return lease.value.transactionHash === transactionHash ? lease : undefined;
  }

  const bound: IssuerLeaseRecord = {
    ...lease.value,
    expiresAt: now + SUBMITTED_LEASE_SECONDS,
    transactionHash,
    updatedAt: now,
  };
  if (await dependencies.store.updateLease(lease.etag, bound)) {
    const updated = await dependencies.store.getLease();
    return updated?.value.token === lease.value.token &&
      updated.value.transactionHash === transactionHash
      ? updated
      : undefined;
  }

  const current = await dependencies.store.getLease();
  return current?.value.token === lease.value.token &&
    current.value.transactionHash === transactionHash
    ? current
    : undefined;
}

async function attachPreparedLease(
  dependencies: QuestClaimServiceDependencies,
  stored: StoredValue<ClaimIssuanceRecord>,
  now: number,
): Promise<StoredValue<ClaimIssuanceRecord> | undefined> {
  const transactionHash = stored.value.transactionHash;
  if (!transactionHash) {
    throw new Error("Persisted quest claim transaction is incomplete.");
  }

  const currentLease = await dependencies.store.getLease();
  if (currentLease?.value.transactionHash === transactionHash) {
    return stored;
  }
  if (currentLease?.value.token === stored.value.leaseToken) {
    return (await bindTransactionToLease(
      dependencies,
      currentLease,
      transactionHash,
      now,
    ))
      ? stored
      : undefined;
  }

  const lease = await acquireIssuerLease(dependencies, now);
  if (!lease) return undefined;

  const adopted: ClaimIssuanceRecord = {
    ...stored.value,
    leaseToken: lease.value.token,
    updatedAt: now,
  };
  if (
    !(await dependencies.store.updateClaim(
      stored.value.completionKey,
      stored.etag,
      adopted,
    ))
  ) {
    await expireLease(dependencies, lease, now);
    return undefined;
  }

  const updated = await dependencies.store.getClaim(stored.value.completionKey);
  if (!updated) {
    await expireLease(dependencies, lease, now);
    throw new Error("Prepared quest claim transaction could not be read.");
  }
  if (
    !(await bindTransactionToLease(dependencies, lease, transactionHash, now))
  ) {
    return undefined;
  }
  return updated;
}

function assertSameSubject(
  record: ClaimIssuanceRecord,
  subjectDid: string,
): void {
  if (record.subjectDid !== subjectDid) {
    throw new QuestClaimError(
      "completion_already_bound",
      409,
      "This completion is already bound to another did:ckb identity.",
    );
  }
}

async function refreshPreparedRecord(
  dependencies: QuestClaimServiceDependencies,
  stored: StoredValue<ClaimIssuanceRecord>,
  now: number,
): Promise<StoredValue<ClaimIssuanceRecord>> {
  let current = stored;
  let record = current.value;
  if (record.status === "preparing" || record.status === "confirmed") {
    return current;
  }
  if (!record.transactionHash || !record.signedTransaction) {
    throw new Error("Persisted quest claim transaction is incomplete.");
  }
  let transaction = await dependencies.client.getTransaction(
    record.transactionHash,
  );
  if (transaction?.status === "unknown") transaction = undefined;
  if (transaction?.status === "rejected") {
    throw new QuestClaimError(
      "claim_transaction_rejected",
      500,
      "The persisted Claim Cell transaction was rejected and requires operator review.",
    );
  }
  if (transaction?.status === "committed") {
    const confirmed: ClaimIssuanceRecord = {
      ...record,
      status: "confirmed",
      updatedAt: now,
    };
    await dependencies.store.updateClaim(
      record.completionKey,
      current.etag,
      confirmed,
    );
    return (
      (await dependencies.store.getClaim(record.completionKey)) ?? {
        etag: current.etag,
        value: confirmed,
      }
    );
  }

  const shouldRebroadcast =
    record.status === "submitted" &&
    !transaction &&
    record.updatedAt + REBROADCAST_AFTER_SECONDS <= now;
  if (record.status === "prepared" || shouldRebroadcast) {
    const attached = await attachPreparedLease(dependencies, current, now);
    if (!attached) return current;
    current = attached;
    record = current.value;
  }
  if (!record.transactionHash || !record.signedTransaction) {
    throw new Error("Persisted quest claim transaction is incomplete.");
  }

  if (!transaction && (record.status === "prepared" || shouldRebroadcast)) {
    try {
      const broadcastHash = await dependencies.broadcast(
        dependencies.client,
        record.signedTransaction,
        record.transactionHash,
      );
      if (broadcastHash !== record.transactionHash) {
        throw new Error("Broadcast Claim Cell transaction hash changed.");
      }
    } catch (error) {
      transaction = await dependencies.client.getTransaction(
        record.transactionHash,
      );
      if (!transaction) throw error;
    }

    const submitted: ClaimIssuanceRecord = {
      ...record,
      status: "submitted",
      updatedAt: now,
    };
    await dependencies.store.updateClaim(
      record.completionKey,
      current.etag,
      submitted,
    );
    return (
      (await dependencies.store.getClaim(record.completionKey)) ?? {
        etag: current.etag,
        value: submitted,
      }
    );
  }

  return current;
}

async function beginPreparation(
  dependencies: QuestClaimServiceDependencies,
  environment: QuestClaimEnvironment,
  evidence: QuestCompletionEvidence,
  subjectDid: string,
  stored: StoredValue<ClaimIssuanceRecord>,
  lease: StoredValue<IssuerLeaseRecord>,
  now: number,
): Promise<StoredValue<ClaimIssuanceRecord>> {
  let current = stored;
  try {
    const prepared = await dependencies.prepare(
      subjectDid,
      evidence.payload,
      now,
      environment,
    );
    const preparedRecord: ClaimIssuanceRecord = {
      ...current.value,
      claimId: prepared.claimId,
      expiresAt: undefined,
      outputIndex: prepared.outputIndex,
      signedTransaction: prepared.signedTransaction,
      status: "prepared",
      transactionHash: prepared.transactionHash,
      updatedAt: now,
    };
    if (
      !(await dependencies.store.updateClaim(
        evidence.key,
        current.etag,
        preparedRecord,
      ))
    ) {
      throw new Error("Quest claim reservation changed during preparation.");
    }
    const persisted = await dependencies.store.getClaim(evidence.key);
    if (!persisted) {
      throw new Error("Prepared quest claim transaction could not be read.");
    }
    current = persisted;

    if (
      !(await bindTransactionToLease(
        dependencies,
        lease,
        prepared.transactionHash,
        now,
      ))
    ) {
      throw new Error("Issuer lease changed during claim preparation.");
    }

    return refreshPreparedRecord(dependencies, current, now);
  } catch (error) {
    if (current.value.status === "preparing") {
      await dependencies.store.updateClaim(evidence.key, current.etag, {
        ...current.value,
        expiresAt: now,
        updatedAt: now,
      });
      await expireLease(dependencies, lease, now);
    }
    throw error;
  }
}

export async function issueQuestClaims(
  request: QuestClaimRequest,
  environment: QuestClaimEnvironment,
  dependencies: QuestClaimServiceDependencies,
): Promise<QuestClaimSuccessResponse> {
  const now = dependencies.now();
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new Error("Quest claim service clock is invalid.");
  }
  const evidence = await dependencies.reconstruct(
    dependencies.client,
    request,
    requiredRewardConfirmations(environment),
  );
  if (evidence.length === 0) {
    throw new QuestClaimError(
      "reward_provenance_invalid",
      400,
      "The reward transaction contains no quest completions.",
    );
  }

  const claims: QuestClaimOutPoint[] = [];
  for (const completion of evidence) {
    let stored = await dependencies.store.getClaim(completion.key);
    if (stored) {
      assertSameSubject(stored.value, request.subjectDid);
      stored = await refreshPreparedRecord(dependencies, stored, now);
      const existing = outPoint(stored.value);
      if (existing) claims.push(existing);
      if (stored.value.status === "confirmed") continue;
      if (
        stored.value.status !== "preparing" ||
        (stored.value.expiresAt ?? 0) > now
      ) {
        return pending(claims);
      }
    }

    const lease = await acquireIssuerLease(dependencies, now);
    if (!lease) return pending(claims);

    if (!stored) {
      const preparing: ClaimIssuanceRecord = {
        completionKey: completion.key,
        expiresAt: now + PREPARATION_LEASE_SECONDS,
        leaseToken: lease.value.token,
        payload: completion.payload,
        status: "preparing",
        subjectDid: request.subjectDid,
        updatedAt: now,
        version: 1,
      };
      if (!(await dependencies.store.createClaim(preparing))) {
        await expireLease(dependencies, lease, now);
        return pending(claims);
      }
      stored = await dependencies.store.getClaim(completion.key);
      if (!stored) {
        await expireLease(dependencies, lease, now);
        throw new Error("Quest claim reservation could not be read.");
      }
    } else {
      const takeover: ClaimIssuanceRecord = {
        ...stored.value,
        expiresAt: now + PREPARATION_LEASE_SECONDS,
        leaseToken: lease.value.token,
        status: "preparing",
        updatedAt: now,
      };
      if (
        !(await dependencies.store.updateClaim(
          completion.key,
          stored.etag,
          takeover,
        ))
      ) {
        await expireLease(dependencies, lease, now);
        return pending(claims);
      }
      stored = await dependencies.store.getClaim(completion.key);
      if (!stored) throw new Error("Quest claim reservation disappeared.");
    }

    const prepared = await beginPreparation(
      dependencies,
      environment,
      completion,
      request.subjectDid,
      stored,
      lease,
      now,
    );
    const submitted = outPoint(prepared.value);
    if (submitted) claims.push(submitted);
    return pending(claims);
  }

  return {
    success: true,
    complete: true,
    claims,
    status: "confirmed",
  };
}
