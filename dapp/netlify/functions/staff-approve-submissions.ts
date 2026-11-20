import type { Handler } from "@netlify/functions";
import { ccc } from "@ckb-ccc/shell";
import {
  CampaignData,
  ConnectedTypeID,
  type CampaignDataLike,
  type QuestDataLike,
  type ConnectedTypeIDLike,
} from "ssri-ckboost/types";
import {
  deploymentManager,
  type Network,
} from "@/lib/ckb/deployment-manager";
import {
  ensureProxyAdminCellPair,
  ProxyAdminCellError,
} from "@/netlify/lib/proxy-admin";
import { createLogger } from "@/netlify/lib/log";
import claimablePoolDeployments from "../../../contracts/contracts/claimable-pool-lock/deployments.json";
import { getIsolatedRuntime } from "@/lib/ckb/isolated-runtime.mjs";
import { validateStaffClaimableRewardOutputs } from "@/netlify/lib/staff-claimable-rewards";
import { getProtocolTypeScript } from "@/netlify/lib/utils";
import { assertCanonicalProxySigningScope, authorizeStaffProxyTransaction } from "@/netlify/lib/staff-authorization";
import type {
  StaffApprovalRequestPayload,
  StaffApprovalResponse,
} from "@/netlify/lib/staff-approval";

const logger = createLogger("staff-approve-submissions");

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return failWith(405, "method_not_allowed", "Only POST is supported.", {
      method: event.httpMethod,
    });
  }

  const signingKey = process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;
  if (!signingKey) {
    return failWith(
      500,
      "missing_proxy_key",
      "Server signing key is not configured."
    );
  }

  if (!event.body) {
    return failWith(400, "missing_body", "Request body is required.");
  }

  let payload: StaffApprovalRequestPayload;
  try {
    payload = JSON.parse(event.body) as StaffApprovalRequestPayload;
  } catch (error) {
    return failWith(
      400,
      "invalid_json",
      `Invalid JSON payload: ${(error as Error).message}`
    );
  }

  const txHex = payload.txHex?.trim();
  const questId = Number(payload.questId);
  const campaignTypeId = payload.campaignTypeId?.trim();
  const userTypeIds = Array.isArray(payload.userTypeIds)
    ? payload.userTypeIds.map((id) => id?.toString()?.trim())
    : [];

  if (!txHex) {
    return failWith(400, "missing_tx", "The txHex field is required.");
  }

  if (!campaignTypeId) {
    return failWith(
      400,
      "missing_campaign",
      "The campaignTypeId field is required."
    );
  }

  if (!Number.isInteger(questId) || questId < 0) {
    return failWith(
      400,
      "invalid_quest",
      "The questId field must be a positive integer.",
      { questId: payload.questId }
    );
  }

  if (userTypeIds.length === 0 || userTypeIds.some((id) => !id)) {
    return failWith(
      400,
      "invalid_user_ids",
      "At least one userTypeId must be provided.",
      { userTypeIds }
    );
  }

  const normalizedUserTypeIds = Array.from(
    new Set(userTypeIds.map((id) => normalizeHex(id)))
  );
  if (normalizedUserTypeIds.length !== userTypeIds.length) {
    return failWith(
      400,
      "duplicate_user_ids",
      "Duplicate userTypeIds are not allowed.",
      { userTypeIds }
    );
  }

  const network = deploymentManager.getCurrentNetwork();
  const rpcUrl =
    process.env.NEXT_PUBLIC_CKB_RPC_URL ||
    process.env.CKB_RPC_URL ||
    (network === "mainnet"
      ? "https://mainnet.ckb.dev"
      : "https://testnet.ckb.dev");
  const client = createClient(network, rpcUrl);
  const signer = new ccc.SignerCkbPrivateKey(client, signingKey as ccc.HexLike);

  let tx: ccc.Transaction;
  try {
    tx = ccc.Transaction.fromBytes(txHex as ccc.Hex);
  } catch (error) {
    return failWith(
      400,
      "invalid_transaction",
      `Failed to parse transaction: ${(error as Error).message}`
    );
  }

  try {
    await hydrateTransaction(tx, client);
  } catch (error) {
    return failWith(400, "hydrate_failed", (error as Error).message);
  }

  const campaignTypeCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostCampaignType"
  );
  if (!campaignTypeCodeHash) {
    return failWith(
      500,
      "missing_campaign_code",
      "Campaign type contract is not configured."
    );
  }

  const userTypeCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostUserType"
  );
  if (!userTypeCodeHash) {
    return failWith(
      500,
      "missing_user_code",
      "User type contract is not configured."
    );
  }

  const pointsCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostPointsUdt"
  );
  if (!pointsCodeHash) {
    return failWith(
      500,
      "missing_points_code",
      "Points UDT contract is not configured."
    );
  }

  const { campaignInput, campaignOutput, campaignOutputData } = (() => {
    try {
      return findCampaignCells({
        tx,
        campaignTypeCodeHash,
      });
    } catch (error) {
      throw new Error(
        `Failed to locate campaign cells: ${(error as Error).message}`
      );
    }
  })();

  if (!campaignInput.outputData) {
    return failWith(
      400,
      "campaign_input_missing_data",
      "Campaign input cell is missing output data."
    );
  }

  if (!campaignInput.cellOutput?.type) {
    return failWith(
      400,
      "campaign_input_missing_type",
      "Campaign input cell is missing type information."
    );
  }

  if (!campaignInput.cellOutput.type.args) {
    return failWith(
      400,
      "campaign_input_missing_args",
      "Campaign input cell is missing type args."
    );
  }

  let previousCampaignData: CampaignDataLike;
  let nextCampaignData: CampaignDataLike;
  try {
    previousCampaignData = CampaignData.decode(
      campaignInput.outputData
    ) as CampaignDataLike;
    nextCampaignData = CampaignData.decode(
      campaignOutputData
    ) as CampaignDataLike;
  } catch (error) {
    return failWith(
      400,
      "campaign_decode_failed",
      "Unable to decode campaign data."
    );
  }

  const expectedCampaignTypeId = normalizeHex(campaignTypeId);
  const connectedType = decodeConnectedTypeId(
    campaignInput.cellOutput.type.args
  );
  const protocolTypeHash = normalizeHex(connectedType.connected_key);
  if (normalizeHex(connectedType.type_id) !== expectedCampaignTypeId) {
    return failWith(
      400,
      "campaign_mismatch",
      "Campaign cell in transaction does not match requested campaign type.",
      { expectedCampaignTypeId, connectedTypeId: connectedType.type_id }
    );
  }

  let approvalActorLockHashes: string[] = [];
  try {
    const proxyLockHash = (await signer.getRecommendedAddressObj()).script.hash();
    const authority = await authorizeStaffProxyTransaction({
      client,
      tx,
      campaignCell: campaignInput,
      protocolTypeHash,
      protocolTypeScript: getProtocolTypeScript(),
      proxyLockHash,
    });
    approvalActorLockHashes = authority.actorLockHashes;
    await assertCanonicalProxySigningScope(signer, tx, proxyLockHash);
  } catch (error) {
    return failWith(403, "reviewer_authorization_failed", (error as Error).message);
  }

  try {
    validateQuestChanges({
      previousCampaignData,
      nextCampaignData,
      questId,
      userTypeIds: normalizedUserTypeIds,
    });
  } catch (error) {
    const details =
      error instanceof QuestValidationError ? error.details : undefined;
    return failWith(
      400,
      "quest_validation_failed",
      (error as Error).message,
      {
        questId,
        userCount: normalizedUserTypeIds.length,
        ...(details ?? {}),
      }
    );
  }

  const userLocks = new Map<string, ccc.Script>();
  try {
    for (const userTypeId of normalizedUserTypeIds) {
      const lock = await getUserLockScript({
        client,
        userTypeCodeHash,
        protocolTypeHash,
        userTypeId,
      });
      userLocks.set(userTypeId, lock);
    }
  } catch (error) {
    return failWith(
      400,
      "user_lock_resolution_failed",
      (error as Error).message,
      { questId, userTypeIds: normalizedUserTypeIds }
    );
  }

  const claimablePoolLockCodeHash = getIsolatedRuntime()?.claimablePool.typeHash ?? (claimablePoolDeployments as unknown as {
    current?: Record<string, {claimablePoolLock?: {typeHash?: string}}>;
  }).current?.[network]?.claimablePoolLock?.typeHash;
  if (!claimablePoolLockCodeHash) {
    return failWith(500, "missing_claimable_pool_code", "Claimable pool lock is not configured.");
  }
  try {
    validateStaffClaimableRewardOutputs({
      tx,
      nextCampaignData,
      questId,
      normalizedUserTypeIds,
      userLocks,
      pointsCodeHash,
      protocolTypeHash,
      claimablePoolLockCodeHash,
      recyclerLockHashes: approvalActorLockHashes,
    });
  } catch (error) {
    return failWith(
      400,
      "reward_validation_failed",
      (error as Error).message,
      { questId, userCount: normalizedUserTypeIds.length }
    );
  }

  try {
    await ensureProxyAdminCellPair({ tx, client, signer, logger });
  } catch (error) {
    if (error instanceof ProxyAdminCellError) {
      return failWith(400, error.code, error.message, {
        questId,
        userCount: normalizedUserTypeIds.length,
      });
    }
    return failWith(
      400,
      "proxy_cell_validation_failed",
      (error as Error).message,
      { questId }
    );
  }

  let signedTx: ccc.Transaction;
  try {
    signedTx = await signer.signTransaction(tx);
  } catch (error) {
    return failWith(
      500,
      "signing_failed",
      `Failed to sign transaction: ${(error as Error).message}`
    );
  }

  logger.info("staff_approval_success", {
    questId,
    userCount: normalizedUserTypeIds.length,
  });

  return httpResponse(200, {
    success: true,
    txHex: ccc.hexFrom(signedTx.toBytes()),
  });
};

export default handler;

const httpResponse = (statusCode: number, body: StaffApprovalResponse) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const failWith = (
  statusCode: number,
  error: string,
  message: string,
  context?: Record<string, unknown>
) => {
  logger.error("staff_approval_failed", {
    error,
    message,
    ...(context ?? {}),
  });
  return httpResponse(statusCode, {
    success: false,
    error,
    message,
  });
};

const createClient = (network: Network, url: string): ccc.Client => {
  if (network === "mainnet") {
    return new ccc.ClientPublicMainnet({ url });
  }
  return new ccc.ClientPublicTestnet({ url });
};

const normalizeHex = (value: ccc.HexLike | string): string =>
  ccc.hexFrom(value as ccc.HexLike).toLowerCase();

const hydrateTransaction = async (
  tx: ccc.Transaction,
  client: ccc.Client
): Promise<void> => {
  for (let i = 0; i < tx.inputs.length; i += 1) {
    const previousOutput = tx.inputs[i].previousOutput;
    if (!previousOutput) {
      throw new Error("Input cell missing previous output reference.");
    }
    const resolved = await client.getCell(previousOutput);
    if (!resolved) {
      throw new Error("Unable to resolve input cell from blockchain.");
    }
    tx.inputs[i] = ccc.CellInput.from({
      previousOutput: resolved.outPoint,
      since: tx.inputs[i].since ?? "0x0",
      cellOutput: resolved.cellOutput,
      outputData: resolved.outputData,
    });
  }

  // Keep the proposed outputs intact. Rebuilding typed outputs here used to
  // erase capacity floors and silently normalize malformed reward pools before
  // validation. The caller's exact outputs must pass validation as supplied.
};

const findCampaignCells = ({
  tx,
  campaignTypeCodeHash,
}: {
  tx: ccc.Transaction;
  campaignTypeCodeHash: string;
}) => {
  let campaignInputIndex = -1;
  let campaignOutputIndex = -1;

  for (let i = 0; i < tx.inputs.length; i += 1) {
    const type = tx.inputs[i].cellOutput?.type;
    if (
      type &&
      normalizeHex(type.codeHash) === normalizeHex(campaignTypeCodeHash)
    ) {
      if (campaignInputIndex !== -1) {
        throw new Error("Multiple campaign inputs detected.");
      }
      campaignInputIndex = i;
    }
  }

  if (campaignInputIndex === -1) {
    throw new Error("Campaign input cell not found.");
  }

  for (let i = 0; i < tx.outputs.length; i += 1) {
    const type = tx.outputs[i].type;
    if (
      type &&
      normalizeHex(type.codeHash) === normalizeHex(campaignTypeCodeHash)
    ) {
      if (campaignOutputIndex !== -1) {
        throw new Error("Multiple campaign outputs detected.");
      }
      campaignOutputIndex = i;
    }
  }

  if (campaignOutputIndex === -1) {
    throw new Error("Campaign output cell not found.");
  }

  const campaignInput = tx.inputs[campaignInputIndex];
  const campaignOutput = tx.outputs[campaignOutputIndex];
  const outputData = tx.outputsData[campaignOutputIndex];
  if (!outputData) {
    throw new Error("Campaign output data missing.");
  }

  return {
    campaignInput,
    campaignOutput,
    campaignOutputData: ccc.hexFrom(outputData as ccc.HexLike),
  };
};

const decodeConnectedTypeId = (
  args: string | undefined
): { type_id: ccc.HexLike; connected_key: ccc.HexLike } => {
  if (!args) {
    throw new Error("Campaign type arguments missing.");
  }
  const decoded = ConnectedTypeID.decode(
    ccc.bytesFrom(args)
  ) as ConnectedTypeIDLike;
  return {
    type_id: ccc.hexFrom(decoded.type_id),
    connected_key: ccc.hexFrom(decoded.connected_key),
  };
};

const validateQuestChanges = ({
  previousCampaignData,
  nextCampaignData,
  questId,
  userTypeIds,
}: {
  previousCampaignData: CampaignDataLike;
  nextCampaignData: CampaignDataLike;
  questId: number;
  userTypeIds: string[];
}): void => {
  const previousQuest = previousCampaignData.quests.find(
    (quest) => Number(quest.quest_id) === questId
  );
  const nextQuest = nextCampaignData.quests.find(
    (quest) => Number(quest.quest_id) === questId
  );
  if (!previousQuest || !nextQuest) {
    throw new Error("Quest not found in campaign data.");
  }

  const previousApproved =
    previousQuest.accepted_submission_user_type_ids?.map(normalizeHex) ?? [];
  const nextApproved =
    nextQuest.accepted_submission_user_type_ids?.map(normalizeHex) ?? [];

  const expectedSet = new Set([...previousApproved, ...userTypeIds]);
  const nextSet = new Set(nextApproved);

  if (nextSet.size !== expectedSet.size) {
    throw new QuestValidationError(
      "Quest approvals include unexpected user type IDs or duplicates.",
      { questId, expectedSet: Array.from(expectedSet), nextSet: Array.from(nextSet) }
    );
  }

  for (const id of previousApproved) {
    if (!nextSet.has(id)) {
      throw new QuestValidationError(
        "Previously approved submissions were modified.",
        { questId, id }
      );
    }
  }

  for (const id of userTypeIds) {
    if (!nextSet.has(id)) {
      throw new QuestValidationError(
        "Missing newly approved submission in campaign data.",
        { questId, id }
      );
    }
  }

  const addedCount = userTypeIds.length;
  const prevQuestCompletions = toBigInt(previousQuest.completion_count);
  const nextQuestCompletions = toBigInt(nextQuest.completion_count);
  if (nextQuestCompletions !== prevQuestCompletions + BigInt(addedCount)) {
    throw new QuestValidationError(
      "Quest completion count does not match newly approved submissions.",
      {
        questId,
        prevQuestCompletions: prevQuestCompletions.toString(),
        nextQuestCompletions: nextQuestCompletions.toString(),
        addedCount,
      }
    );
  }

  const prevTotalCompletions = toBigInt(
    previousCampaignData.total_completions
  );
  const nextTotalCompletions = toBigInt(nextCampaignData.total_completions);
  if (nextTotalCompletions !== prevTotalCompletions + BigInt(addedCount)) {
    throw new QuestValidationError(
      "Campaign completion count does not match newly approved submissions.",
      {
        prevTotalCompletions: prevTotalCompletions.toString(),
        nextTotalCompletions: nextTotalCompletions.toString(),
        addedCount,
      }
    );
  }

  const previousParticipants = collectParticipantSet(previousCampaignData);
  const nextParticipants = collectParticipantSet(nextCampaignData);
  const expectedParticipantSet = new Set(previousParticipants);
  for (const id of userTypeIds) {
    expectedParticipantSet.add(id);
  }

  if (nextParticipants.size !== expectedParticipantSet.size) {
    throw new QuestValidationError("Participant set mismatch detected.", {
      prevParticipants: previousParticipants.size,
      nextParticipants: nextParticipants.size,
      expectedParticipants: expectedParticipantSet.size,
      expectedParticipantSample: Array.from(expectedParticipantSet).slice(0, 10),
    });
  }

  const expectedParticipantsCount = BigInt(expectedParticipantSet.size);
  const nextParticipantsCount = toBigInt(nextCampaignData.participants_count);
  if (nextParticipantsCount !== expectedParticipantsCount) {
    throw new QuestValidationError(
      "participants_count field does not match participant set size.",
      {
        recordedCount: nextParticipantsCount.toString(),
        expectedCount: expectedParticipantsCount.toString(),
      }
    );
  }

  const expectedCampaign = cloneCampaignData(previousCampaignData);
  const questIndex = expectedCampaign.quests.findIndex(
    (quest) => Number(quest.quest_id) === questId
  );
  if (questIndex === -1) {
    throw new QuestValidationError("Quest not found while building expected.", {
      questId,
    });
  }

  const expectedQuest = expectedCampaign.quests[questIndex];
  const expectedAccepted = new Set(
    (previousQuest.accepted_submission_user_type_ids || []).map(normalizeHex)
  );
  const orderedAccepted: string[] = Array.from(expectedAccepted.values());
  for (const id of userTypeIds) {
    if (!expectedAccepted.has(id)) {
      expectedAccepted.add(id);
      orderedAccepted.push(id);
    }
  }

  const actualAcceptedOrder =
    nextQuest.accepted_submission_user_type_ids?.map(normalizeHex) || [];
  if (
    actualAcceptedOrder.length !== orderedAccepted.length ||
    actualAcceptedOrder.some((id, idx) => id !== orderedAccepted[idx])
  ) {
    throw new QuestValidationError("Quest approvals order mismatch.", {
      expectedOrder: orderedAccepted,
      actualOrder: actualAcceptedOrder,
    });
  }

  expectedQuest.accepted_submission_user_type_ids = orderedAccepted.map(
    (id) => id as ccc.HexLike
  );
  expectedQuest.completion_count =
    prevQuestCompletions + BigInt(addedCount);

  expectedCampaign.total_completions =
    prevTotalCompletions + BigInt(addedCount);
  expectedCampaign.participants_count = expectedParticipantsCount;

  const diffDetails = describeCampaignDiff(
    expectedCampaign,
    nextCampaignData
  );
  if (diffDetails.length > 0) {
    throw new QuestValidationError(
      "Campaign data outside approved submissions was modified.",
      { diffs: diffDetails.slice(0, 5) }
    );
  }
};

const cloneCampaignData = (
  data: CampaignDataLike
): CampaignDataLike =>
  CampaignData.decode(CampaignData.encode(data)) as CampaignDataLike;

const toBigInt = (value: ccc.NumLike | undefined): bigint =>
  BigInt(value === undefined ? 0 : ccc.numFrom(value));

const collectParticipantSet = (campaign: CampaignDataLike): Set<string> => {
  const participants = new Set<string>();
  for (const quest of campaign.quests || []) {
    for (const id of quest.accepted_submission_user_type_ids || []) {
      participants.add(normalizeHex(id));
    }
  }
  return participants;
};

const describeCampaignDiff = (
  expected: CampaignDataLike,
  actual: CampaignDataLike
): Array<{ path: string; expected: unknown; actual: unknown }> => {
  const diffs: Array<{ path: string; expected: unknown; actual: unknown }> = [];
  const compare = (path: string, exp: unknown, act: unknown) => {
    const normalizedExpected = normalizeForDiff(exp);
    const normalizedActual = normalizeForDiff(act);
    if (
      JSON.stringify(normalizedExpected) !==
      JSON.stringify(normalizedActual)
    ) {
      diffs.push({
        path,
        expected: normalizedExpected,
        actual: normalizedActual,
      });
    }
  };

  compare("endorser_lock_hash", expected.endorser_lock_hash, actual.endorser_lock_hash);
  compare("staff_lock_hash_vec", expected.staff_lock_hash_vec, actual.staff_lock_hash_vec);
  compare("created_at", expected.created_at, actual.created_at);
  compare("starting_time", expected.starting_time, actual.starting_time);
  compare("ending_time", expected.ending_time, actual.ending_time);
  compare("rules", expected.rules, actual.rules);
  compare("metadata", expected.metadata, actual.metadata);
  compare("status", expected.status, actual.status);
  compare("total_completions", expected.total_completions, actual.total_completions);
  compare("participants_count", expected.participants_count, actual.participants_count);

  const expectedQuests = expected.quests || [];
  const actualQuests = actual.quests || [];
  if (expectedQuests.length !== actualQuests.length) {
    diffs.push({
      path: "quests.length",
      expected: expectedQuests.length,
      actual: actualQuests.length,
    });
  }

  const maxLength = Math.max(expectedQuests.length, actualQuests.length);
  for (let i = 0; i < maxLength; i += 1) {
    compareQuest(`quests[${i}]`, expectedQuests[i], actualQuests[i], compare);
  }

  return diffs;
};

const compareQuest = (
  path: string,
  expected: QuestDataLike | undefined,
  actual: QuestDataLike | undefined,
  compare: (path: string, exp: unknown, act: unknown) => void
) => {
  if (!expected && !actual) {
    return;
  }

  compare(`${path}.quest_id`, expected?.quest_id, actual?.quest_id);
  compare(`${path}.metadata`, expected?.metadata, actual?.metadata);
  compare(
    `${path}.rewards_on_completion`,
    expected?.rewards_on_completion,
    actual?.rewards_on_completion
  );
  compare(
    `${path}.accepted_submission_user_type_ids`,
    expected?.accepted_submission_user_type_ids,
    actual?.accepted_submission_user_type_ids
  );
  compare(
    `${path}.completion_deadline`,
    expected?.completion_deadline,
    actual?.completion_deadline
  );
  compare(`${path}.status`, expected?.status, actual?.status);
  compare(`${path}.sub_tasks`, expected?.sub_tasks, actual?.sub_tasks);
  compare(`${path}.points`, expected?.points, actual?.points);
  compare(
    `${path}.completion_count`,
    expected?.completion_count,
    actual?.completion_count
  );
};

const normalizeForDiff = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForDiff(item));
  }
  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(
      value as Record<string, unknown>
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, normalizeForDiff(val)]);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
};

class QuestValidationError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

const getUserLockScript = async ({
  client,
  userTypeCodeHash,
  protocolTypeHash,
  userTypeId,
}: {
  client: ccc.Client;
  userTypeCodeHash: string;
  protocolTypeHash: ccc.HexLike;
  userTypeId: string;
}): Promise<ccc.Script> => {
  const encodedArgs = ConnectedTypeID.encode({
    type_id: userTypeId as ccc.HexLike,
    connected_key: protocolTypeHash,
  });
  const searchKey = {
    script: {
      codeHash: userTypeCodeHash,
      hashType: "type" as const,
      args: ccc.hexFrom(encodedArgs),
    },
    scriptType: "type" as const,
    scriptSearchMode: "exact" as const,
  };

  for await (const cell of client.findCells(searchKey)) {
    return ccc.Script.from(cell.cellOutput.lock);
  }

  throw new Error(`User cell not found for user type ID ${userTypeId}.`);
};
