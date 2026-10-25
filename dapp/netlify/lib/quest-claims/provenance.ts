import { ccc } from "@ckb-ccc/core";
import {
  decodeClaimablePoolData,
} from "../../../../contracts/contracts/claimable-pool-lock/ts/src/index";
import {
  CampaignData,
  ConnectedTypeID,
  type CampaignDataLike,
  type ConnectedTypeIDLike,
} from "ssri-ckboost/types";

import type { QuestClaimRequest } from "@/lib/vellum/quest-claims";
import {
  CLAIMABLE_POOL_LOCK_CODE_HASH,
  CKBOOST_CAMPAIGN_TYPE_CODE_HASH,
  CKBOOST_POINTS_UDT_CODE_HASH,
  CKBOOST_USER_TYPE_CODE_HASH,
} from "./config";
import { deriveApprovalChange, type ApprovalChange } from "./approval";
import { QuestClaimError } from "./errors";
import {
  assertPoolContinuation,
  findParentPoolInputIndex,
  type ClaimablePoolState,
} from "./pool-ancestry";
import {
  parseCkboostQuestClaimPayload,
  type CkboostQuestClaimPayload,
} from "./schema";

type ResolvedInput = {
  cellOutput: ccc.CellOutput;
  outputData: ccc.Hex;
  previousOutput: ccc.OutPoint;
};

type PoolInput = ResolvedInput & {
  approvalTxHash: ccc.Hex;
  claimedAmount: bigint;
};

export type QuestCompletionEvidence = {
  key: string;
  payload: CkboostQuestClaimPayload;
};

type TransactionCache = Map<ccc.Hex, ccc.ClientTransactionResponse>;

const MAX_POOL_ANCESTRY_DEPTH = 128;

const normalizeHex = (value: ccc.HexLike): ccc.Hex =>
  ccc.hexFrom(value).toLowerCase() as ccc.Hex;

async function committedTransaction(
  client: ccc.Client,
  txHash: ccc.HexLike,
  cache?: TransactionCache,
): Promise<ccc.ClientTransactionResponse> {
  const normalizedHash = normalizeHex(txHash);
  const cached = cache?.get(normalizedHash);
  if (cached) return cached;
  const response = await client.getTransaction(txHash);
  if (!response || response.status !== "committed") {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "A referenced approval transaction is not committed.",
    );
  }
  cache?.set(normalizedHash, response);
  return response;
}

async function resolveInputs(
  client: ccc.Client,
  transaction: ccc.Transaction,
  cache?: TransactionCache,
): Promise<ResolvedInput[]> {
  return Promise.all(
    transaction.inputs.map(async (input) => {
      const previousOutput = input.previousOutput;
      const previous = await committedTransaction(
        client,
        previousOutput.txHash,
        cache,
      );
      const outputIndex = Number(ccc.numFrom(previousOutput.index));
      const cellOutput = previous.transaction.outputs[outputIndex];
      const outputData = previous.transaction.outputsData[outputIndex];
      if (!cellOutput || outputData === undefined) {
        throw new QuestClaimError(
          "reward_provenance_invalid",
          400,
          "Reward transaction references a missing input cell.",
        );
      }
      return {
        cellOutput,
        outputData: ccc.hexFrom(outputData),
        previousOutput: previousOutput.clone(),
      };
    }),
  );
}

function poolState(outputData: ccc.HexLike): ClaimablePoolState {
  const decoded = decodeClaimablePoolData(outputData);
  return {
    entries: decoded.entries.map((entry) => ({
      amount: ccc.numFrom(entry.amount),
      claimantLockHash: normalizeHex(entry.claimantLockHash),
    })),
    remainingAmount: ccc.numFrom(decoded.remainingAmount),
  };
}

async function resolvePoolApprovalTxHash(
  client: ccc.Client,
  poolOutPoint: ccc.OutPoint,
  cache: TransactionCache,
): Promise<ccc.Hex> {
  let current = poolOutPoint.clone();
  const visited = new Set<string>();

  for (let depth = 0; depth < MAX_POOL_ANCESTRY_DEPTH; depth += 1) {
    const outPointKey = `${normalizeHex(current.txHash)}:${ccc.numFrom(current.index)}`;
    if (visited.has(outPointKey)) {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Claimable Points pool ancestry contains a cycle.",
      );
    }
    visited.add(outPointKey);

    const creator = await committedTransaction(client, current.txHash, cache);
    const outputIndex = Number(ccc.numFrom(current.index));
    const output = creator.transaction.outputs[outputIndex];
    const outputData = creator.transaction.outputsData[outputIndex];
    if (
      !output ||
      outputData === undefined ||
      normalizeHex(output.lock.codeHash) !== CLAIMABLE_POOL_LOCK_CODE_HASH ||
      output.lock.hashType !== "type"
    ) {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Claimable Points pool ancestry references an invalid output.",
      );
    }

    const inputs = await resolveInputs(client, creator.transaction, cache);
    let parentInputIndex: number | undefined;
    try {
      parentInputIndex = findParentPoolInputIndex({
        inputLockHashes: inputs.map(({ cellOutput }) =>
          normalizeHex(cellOutput.lock.hash()),
        ),
        outputIndex,
        outputLockHashes: creator.transaction.outputs.map(({ lock }) =>
          normalizeHex(lock.hash()),
        ),
        poolLockHash: normalizeHex(output.lock.hash()),
      });
    } catch {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Claimable Points pool ancestry is malformed.",
      );
    }
    if (parentInputIndex === undefined) {
      return normalizeHex(current.txHash);
    }

    const parent = inputs[parentInputIndex];
    if (!scriptEqual(parent.cellOutput.type, output.type)) {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Claimable Points pool ancestry changed the asset type.",
      );
    }
    try {
      assertPoolContinuation(
        poolState(parent.outputData),
        poolState(outputData),
      );
    } catch {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Claimable Points pool ancestry is not a valid claim transition.",
      );
    }
    current = parent.previousOutput.clone();
  }

  throw new QuestClaimError(
    "reward_provenance_invalid",
    400,
    "Claimable Points pool ancestry exceeds the supported depth.",
  );
}

function scriptEqual(
  left: ccc.ScriptLike | undefined,
  right: ccc.ScriptLike | undefined,
): boolean {
  return Boolean(
    left && right && ccc.Script.from(left).eq(ccc.Script.from(right)),
  );
}

function findCampaignTransition(
  transaction: ccc.Transaction,
  inputs: ResolvedInput[],
): {
  campaignTypeId: ccc.Hex;
  change: ApprovalChange;
  next: CampaignDataLike;
  protocolTypeHash: ccc.Hex;
} {
  const campaignInputs = inputs.filter(
    ({ cellOutput }) =>
      cellOutput.type &&
      cellOutput.type.hashType === "type" &&
      normalizeHex(cellOutput.type.codeHash) ===
        CKBOOST_CAMPAIGN_TYPE_CODE_HASH,
  );
  const outputIndexes = transaction.outputs
    .map((output, index) => ({ output, index }))
    .filter(
      ({ output }) =>
        output.type &&
        output.type.hashType === "type" &&
        normalizeHex(output.type.codeHash) === CKBOOST_CAMPAIGN_TYPE_CODE_HASH,
    );

  if (campaignInputs.length !== 1 || outputIndexes.length !== 1) {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Approval must contain one campaign state transition.",
    );
  }
  const campaignInput = campaignInputs[0];
  const campaignOutput = outputIndexes[0];
  if (!scriptEqual(campaignInput.cellOutput.type, campaignOutput.output.type)) {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Approval campaign identity changed.",
    );
  }

  let previous: CampaignDataLike;
  let next: CampaignDataLike;
  let connected: ConnectedTypeIDLike;
  try {
    previous = CampaignData.decode(
      campaignInput.outputData,
    ) as CampaignDataLike;
    next = CampaignData.decode(
      transaction.outputsData[campaignOutput.index],
    ) as CampaignDataLike;
    connected = ConnectedTypeID.decode(
      campaignInput.cellOutput.type!.args,
    ) as ConnectedTypeIDLike;
  } catch {
    throw new QuestClaimError(
      "approval_provenance_invalid",
      400,
      "Approval campaign data could not be decoded.",
    );
  }

  return {
    campaignTypeId: normalizeHex(connected.type_id),
    change: deriveApprovalChange(previous, next),
    next,
    protocolTypeHash: normalizeHex(connected.connected_key),
  };
}

async function resolveUserLock(
  client: ccc.Client,
  protocolTypeHash: ccc.Hex,
  userTypeId: ccc.Hex,
): Promise<ccc.Script> {
  const args = ccc.hexFrom(
    ConnectedTypeID.encode({
      type_id: userTypeId,
      connected_key: protocolTypeHash,
    }),
  );
  const matches: ccc.Script[] = [];
  for await (const cell of client.findCells({
    script: {
      codeHash: CKBOOST_USER_TYPE_CODE_HASH,
      hashType: "type",
      args,
    },
    scriptType: "type",
    scriptSearchMode: "exact",
  })) {
    matches.push(ccc.Script.from(cell.cellOutput.lock));
    if (matches.length > 1) break;
  }
  if (matches.length !== 1) {
    throw new QuestClaimError(
      "user_provenance_invalid",
      400,
      "Approved CKBoost user cell could not be resolved uniquely.",
    );
  }
  return matches[0];
}

function readUdtAmount(data: ccc.HexLike): bigint {
  const bytes = ccc.bytesFrom(data);
  return bytes.length < 16 ? 0n : ccc.numLeFromBytes(bytes.subarray(0, 16));
}

function assertPoolConservation(
  inputs: PoolInput[],
  transaction: ccc.Transaction,
): void {
  const groups = new Map<string, { claimed: bigint; remaining: bigint }>();
  for (const input of inputs) {
    const type = input.cellOutput.type!;
    const key = `${input.cellOutput.lock.hash()}:${type.hash()}`;
    const current = groups.get(key) ?? { claimed: 0n, remaining: 0n };
    current.claimed += input.claimedAmount;
    current.remaining += decodeClaimablePoolData(
      input.outputData,
    ).remainingAmount;
    groups.set(key, current);
  }

  for (let index = 0; index < transaction.outputs.length; index += 1) {
    const output = transaction.outputs[index];
    if (!output.type) continue;
    const key = `${output.lock.hash()}:${output.type.hash()}`;
    const group = groups.get(key);
    if (!group) continue;
    group.remaining -= decodeClaimablePoolData(
      transaction.outputsData[index],
    ).remainingAmount;
  }

  if (
    [...groups.values()].some(({ claimed, remaining }) => claimed !== remaining)
  ) {
    throw new QuestClaimError(
      "reward_provenance_invalid",
      400,
      "Reward transaction did not remove exactly the claimed pool entries.",
    );
  }
}

function assertPointsPayout(
  controller: ccc.Script,
  inputs: ResolvedInput[],
  transaction: ccc.Transaction,
  expectedByType: Map<string, { amount: bigint; script: ccc.Script }>,
): void {
  for (const { amount, script } of expectedByType.values()) {
    const inputAmount = inputs.reduce(
      (total, input) =>
        input.cellOutput.lock.eq(controller) &&
        scriptEqual(input.cellOutput.type, script)
          ? total + readUdtAmount(input.outputData)
          : total,
      0n,
    );
    const outputAmount = transaction.outputs.reduce((total, output, index) => {
      return output.lock.eq(controller) && scriptEqual(output.type, script)
        ? total + readUdtAmount(transaction.outputsData[index])
        : total;
    }, 0n);
    if (outputAmount - inputAmount !== amount) {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Reward transaction Points payout does not match claimed pool entries.",
      );
    }
  }
}

export async function reconstructQuestCompletions(
  client: ccc.Client,
  request: QuestClaimRequest,
  requiredConfirmations: number,
  trustedProtocolTypeHash: ccc.HexLike,
): Promise<QuestCompletionEvidence[]> {
  const expectedProtocolTypeHash = normalizeHex(trustedProtocolTypeHash);
  const { resolveDidCkb } = await import("@ckb-ccc/did-ckb");
  const subject = await resolveDidCkb({ client, did: request.subjectDid });
  if (!subject) {
    throw new QuestClaimError(
      "subject_not_active",
      400,
      "The selected did:ckb identity is not active on CKB Testnet.",
    );
  }
  const controller = subject.cell.cellOutput.lock;
  const controllerHash = normalizeHex(controller.hash());

  const reward = await client.getTransactionWithHeader(
    request.rewardClaimTxHash,
  );
  if (
    !reward ||
    ["sent", "pending", "proposed", "unknown"].includes(
      reward.transaction.status,
    )
  ) {
    throw new QuestClaimError(
      "reward_pending",
      202,
      "The reward transaction is not confirmed yet.",
      15,
    );
  }
  if (
    reward.transaction.status !== "committed" ||
    !reward.transaction.blockNumber
  ) {
    throw new QuestClaimError(
      "reward_not_committed",
      400,
      "The reward transaction was not committed.",
    );
  }

  const tip = await client.getTipHeader();
  const confirmations =
    ccc.numFrom(tip.number) - ccc.numFrom(reward.transaction.blockNumber) + 1n;
  if (confirmations < BigInt(requiredConfirmations)) {
    throw new QuestClaimError(
      "reward_pending",
      202,
      "The reward transaction is waiting for confirmations.",
      15,
    );
  }
  const header =
    reward.header ??
    (reward.transaction.blockHash
      ? await client.getHeaderByHash(reward.transaction.blockHash)
      : undefined);
  if (!header) {
    throw new QuestClaimError(
      "reward_provenance_unavailable",
      503,
      "The reward block header is unavailable.",
      15,
    );
  }
  const completedAt = Number(ccc.numFrom(header.timestamp) / 1_000n);
  if (!Number.isSafeInteger(completedAt) || completedAt <= 0) {
    throw new QuestClaimError(
      "reward_provenance_invalid",
      400,
      "The reward block timestamp is invalid.",
    );
  }

  const transaction = reward.transaction.transaction;
  const transactionCache: TransactionCache = new Map();
  const inputs = await resolveInputs(client, transaction, transactionCache);
  const poolInputs: PoolInput[] = [];
  for (const input of inputs) {
    if (
      normalizeHex(input.cellOutput.lock.codeHash) !==
        CLAIMABLE_POOL_LOCK_CODE_HASH ||
      input.cellOutput.lock.hashType !== "type"
    ) {
      continue;
    }
    let decoded;
    try {
      decoded = decodeClaimablePoolData(input.outputData);
    } catch {
      continue;
    }
    const claimedAmount = decoded.entries.reduce(
      (total, entry) =>
        normalizeHex(entry.claimantLockHash) === controllerHash
          ? total + ccc.numFrom(entry.amount)
          : total,
      0n,
    );
    if (claimedAmount > 0n) {
      poolInputs.push({
        ...input,
        approvalTxHash: await resolvePoolApprovalTxHash(
          client,
          input.previousOutput,
          transactionCache,
        ),
        claimedAmount,
      });
    }
  }
  if (poolInputs.length === 0) {
    throw new QuestClaimError(
      "subject_controller_mismatch",
      400,
      "The selected identity does not control a claimant in this reward transaction.",
    );
  }
  if (
    !inputs.some(
      ({ cellOutput }) =>
        normalizeHex(cellOutput.lock.hash()) === controllerHash,
    )
  ) {
    throw new QuestClaimError(
      "subject_controller_mismatch",
      400,
      "The selected identity did not authorize this reward transaction.",
    );
  }

  const poolsByApproval = new Map<ccc.Hex, PoolInput[]>();
  for (const pool of poolInputs) {
    const current = poolsByApproval.get(pool.approvalTxHash) ?? [];
    current.push(pool);
    poolsByApproval.set(pool.approvalTxHash, current);
  }

  const evidence: QuestCompletionEvidence[] = [];
  const expectedByType = new Map<
    string,
    { amount: bigint; script: ccc.Script }
  >();
  for (const [approvalTxHash, pools] of poolsByApproval) {
    const approval = await committedTransaction(
      client,
      approvalTxHash,
      transactionCache,
    );
    const approvalInputs = await resolveInputs(
      client,
      approval.transaction,
      transactionCache,
    );
    const transition = findCampaignTransition(
      approval.transaction,
      approvalInputs,
    );
    if (transition.protocolTypeHash !== expectedProtocolTypeHash) {
      throw new QuestClaimError(
        "approval_provenance_invalid",
        400,
        "Approval campaign does not belong to the configured CKBoost protocol.",
      );
    }
    const pointsScript = ccc.Script.from({
      codeHash: CKBOOST_POINTS_UDT_CODE_HASH,
      hashType: "type",
      args: transition.protocolTypeHash,
    });
    if (
      pools.some(
        ({ cellOutput }) => !scriptEqual(cellOutput.type, pointsScript),
      )
    ) {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Reward transaction did not consume a CKBoost Points pool.",
      );
    }

    const matchingUsers: ccc.Hex[] = [];
    for (const userTypeId of transition.change.addedUserTypeIds) {
      const lock = await resolveUserLock(
        client,
        transition.protocolTypeHash,
        normalizeHex(userTypeId),
      );
      if (normalizeHex(lock.hash()) === controllerHash) {
        matchingUsers.push(normalizeHex(userTypeId));
      }
    }
    if (matchingUsers.length === 0) {
      throw new QuestClaimError(
        "user_provenance_invalid",
        400,
        "No approved CKBoost user is controlled by the selected identity.",
      );
    }

    const points = ccc.numFrom(transition.change.quest.points);
    const claimedAmount = pools.reduce(
      (total, pool) => total + pool.claimedAmount,
      0n,
    );
    if (claimedAmount !== points * BigInt(matchingUsers.length)) {
      throw new QuestClaimError(
        "reward_provenance_invalid",
        400,
        "Claimed Points do not match the approved quest completions.",
      );
    }

    const typeKey = normalizeHex(pointsScript.hash());
    const expected = expectedByType.get(typeKey) ?? {
      amount: 0n,
      script: pointsScript,
    };
    expected.amount += claimedAmount;
    expectedByType.set(typeKey, expected);

    for (const userTypeId of matchingUsers) {
      const payload = parseCkboostQuestClaimPayload({
        campaign_type_id: transition.campaignTypeId,
        campaign_title: transition.next.metadata.title,
        quest_id: Number(transition.change.quest.quest_id),
        quest_title: transition.change.quest.metadata.title,
        ckboost_user_type_id: userTypeId,
        completed_at: completedAt,
        approval_tx_hash: approvalTxHash,
        reward_claim_tx_hash: normalizeHex(request.rewardClaimTxHash),
        points_awarded: points.toString(),
      });
      evidence.push({
        key: [
          payload.campaign_type_id,
          payload.quest_id,
          payload.ckboost_user_type_id,
        ].join(":"),
        payload,
      });
    }
  }

  assertPoolConservation(poolInputs, transaction);
  assertPointsPayout(controller, inputs, transaction, expectedByType);
  evidence.sort((left, right) => left.key.localeCompare(right.key));
  return evidence;
}
