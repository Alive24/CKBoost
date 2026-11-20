/**
 * Netlify function: validates and signs streak bonus transactions server-side.
 */
import type { Handler } from "@netlify/functions";
import { ccc } from "@ckb-ccc/shell";
import { deploymentManager, type Network } from "@/lib/ckb/deployment-manager";
import {
  evaluateStreakBonus,
  readUdtAmount,
  type RewardTransaction,
  type StreakBonusValidateResponse,
} from "@/netlify/lib/streak-bonus";
import { decodeUserData, normalizeUserData } from "@/netlify/lib/user-data";
import { UserData } from "ssri-ckboost/types";
import { createLogger } from "@/netlify/lib/log";
import {
  ensureProxyAdminCellPair,
  ProxyAdminCellError,
} from "@/netlify/lib/proxy-admin";
import { ensureFieldRestrictions } from "@/netlify/lib/utils";
import { getIsolatedProtocolScope } from "@/netlify/lib/isolated-protocol-scope";

const MAX_RESULTS = 100;
const DEFAULT_RESULTS = 20;
const logger = createLogger("streakBonus-validate");

type RequestPayload = {
  txHex?: string;
  userAddress?: string;
  limit?: number;
};

/**
 * POST /streakBonus-validate
 *
 * Body: { userAddress, txHex, limit? }
 * Validates the provided unsigned transaction and returns a signed hex if eligible.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const signingKey = process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;

  if (!signingKey) {
    return httpError(
      500,
      "missing_signing_key",
      "Server signing key not configured."
    );
  }

  if (!event.body) {
    return httpError(400, "missing_body", "Missing request body.");
  }

  let payload: RequestPayload;
  try {
    payload = JSON.parse(event.body) as RequestPayload;
  } catch (error) {
    return httpError(
      400,
      "invalid_json",
      `Invalid JSON payload: ${(error as Error).message}`
    );
  }

  const txHex = payload.txHex?.trim();
  const userAddress = payload.userAddress?.trim();
  if (!txHex) {
    return httpError(400, "missing_tx_hex", "Expected 'txHex'.");
  }
  if (!userAddress) {
    return httpError(400, "missing_user_address", "Expected 'userAddress'.");
  }

  const limit = sanitizeLimit(payload.limit);

  const network = deploymentManager.getCurrentNetwork();
  const rpcUrl =
    process.env.NEXT_PUBLIC_CKB_RPC_URL ||
    process.env.CKB_RPC_URL ||
    (network === "mainnet"
      ? "https://mainnet.ckb.dev"
      : "https://testnet.ckb.dev");
  const client = createClient(network, rpcUrl);
  const signer = new ccc.SignerCkbPrivateKey(client, signingKey as ccc.Hex);
  let addressObj: ccc.Address;
  try {
    addressObj = await ccc.Address.fromString(userAddress, client);
  } catch (error) {
    return httpError(
      400,
      "invalid_address",
      `Invalid CKB address: ${(error as Error).message}`
    );
  }

  const userLockScript = addressObj.script;

  const pointsCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostPointsUdt"
  );

  if (!pointsCodeHash) {
    return httpError(
      500,
      "missing_points_contract",
      "Points UDT contract not configured in deployments.json."
    );
  }

  const protocolTypeScript = resolveProtocolTypeScriptFromEnv();
  if ("error" in protocolTypeScript) {
    return httpError(
      500,
      "protocol_config_error",
      protocolTypeScript.error as string
    );
  }

  const userTypeCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostUserType"
  );

  if (!userTypeCodeHash) {
    return httpError(
      500,
      "missing_user_contract",
      "User type contract not configured in deployments.json."
    );
  }

  const pointsTypeScript = ccc.Script.from({
    codeHash: pointsCodeHash,
    hashType: "type" as ccc.HashType,
    args: protocolTypeScript.script.hash(),
  });

  let transactions: RewardTransaction[];
  try {
    transactions = await fetchRewardTransactions({
      client,
      pointsTypeScript,
      userLockScript,
      userTypeCodeHash,
      limit,
      logPrefix: "streakBonus-validate",
    });
  } catch (error) {
    return httpError(500, "transaction_query_failed", (error as Error).message);
  }

  let calculation: Awaited<ReturnType<typeof evaluateStreakBonus>>;
  try {
    calculation = await evaluateStreakBonus({
      client,
      rpcUrl,
      address: userAddress,
      protocolTypeHash: protocolTypeScript.script.hash().toLowerCase(),
      network,
      userLockScript,
      transactions,
    });
  } catch (error) {
    return httpError(
      500,
      "streak_bonus_evaluation_failed",
      (error as Error).message
    );
  }

  if (!calculation.eligible) {
    return httpError(
      400,
      "bonus_streak_not_eligible",
      calculation.reason ?? "Bonus streak currently not eligible."
    );
  }

  if (!calculation.updatedLastBonusTimestamp) {
    return httpError(
      500,
      "missing_updated_timestamp",
      "Streak bonus calculation did not produce an updated timestamp."
    );
  }

  let tx: ccc.Transaction;
  try {
    tx = ccc.Transaction.fromBytes(txHex as ccc.Hex);
  } catch (error) {
    return httpError(
      400,
      "invalid_transaction",
      `Failed to parse transaction bytes: ${(error as Error).message}`
    );
  }

  try {
    await hydrateInputs(tx, client);
    hydrateOutputs(tx);
    validateStreakBonusTransaction({
      tx,
      calculation,
      userLockScript,
      pointsTypeScript,
      network,
    });
  } catch (error) {
    return httpError(
      400,
      "transaction_validation_failed",
      (error as Error).message
    );
  }

  try {
    await ensureProxyAdminCellPair({ tx, client, signer, logger });
  } catch (error) {
    if (error instanceof ProxyAdminCellError) {
      logger.error("proxy_cell_validation_failed", {
        code: error.code,
        details: error.details,
      });
      return httpError(400, error.code, error.message);
    }
    throw error;
  }

  let signedTx: ccc.Transaction;
  try {
    signedTx = await signer.signTransaction(tx);
  } catch (error) {
    return httpError(
      500,
      "signing_failed",
      `Failed to sign transaction: ${(error as Error).message}`
    );
  }

  const signedHex = ccc.hexFrom(signedTx.toBytes());

  const response: StreakBonusValidateResponse = {
    success: true,
    txHex: signedHex,
    bonusStreak: calculation,
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  };
};

export default handler;

/** Helper for returning consistent error payloads to the client. */
const httpError = (
  statusCode: number,
  error: string,
  message?: string
): { statusCode: number; headers: Record<string, string>; body: string } => {
  const payload: StreakBonusValidateResponse = {
    success: false,
    error,
    message,
  };
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
};

/** Clamp incoming limit values to reasonable bounds for cell queries. */
const sanitizeLimit = (rawLimit: number | undefined): number => {
  const numeric = Number(rawLimit ?? DEFAULT_RESULTS);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_RESULTS;
  }
  return Math.min(MAX_RESULTS, Math.floor(numeric));
};

/** Wrap public client instantiation so tests can stub this if needed. */
const createClient = (network: Network, url: string): ccc.Client => {
  if (network === "mainnet") {
    return new ccc.ClientPublicMainnet({ url });
  }
  return new ccc.ClientPublicTestnet({ url });
};

/** Build the protocol type script from the same env variables the dapp uses. */
const resolveProtocolTypeScriptFromEnv = ():
  | { script: ccc.Script }
  | { error: string } => {
  try {
    const isolated = getIsolatedProtocolScope();
    if (isolated) return { script: ccc.Script.from(isolated) };
  } catch (error) {
    return { error: (error as Error).message };
  }
  const protocolTypeCodeHash =
    process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH?.trim();
  const protocolTypeHashType =
    (process.env.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE?.trim() ||
      "type") as ccc.HashType;
  const protocolTypeArgs =
    process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS?.trim() || "";

  if (!protocolTypeCodeHash || !protocolTypeArgs) {
    return {
      error:
        "Protocol type environment variables missing. Ensure NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH and NEXT_PUBLIC_PROTOCOL_TYPE_ARGS are set.",
    };
  }

  try {
    const script = ccc.Script.from({
      codeHash: protocolTypeCodeHash,
      hashType: protocolTypeHashType,
      args: protocolTypeArgs,
    });
    return { script };
  } catch (error) {
    return {
      error: `Failed to construct protocol type script from environment: ${
        (error as Error).message
      }`,
    };
  }
};

const fetchRewardTransactions = async ({
  client,
  pointsTypeScript,
  userLockScript,
  userTypeCodeHash,
  limit,
  logPrefix,
}: {
  client: ccc.Client;
  pointsTypeScript: ccc.Script;
  userLockScript: ccc.Script;
  userTypeCodeHash: string;
  limit: number;
  logPrefix: string;
}): Promise<RewardTransaction[]> => {
  const searchKey = {
    script: pointsTypeScript,
    scriptType: "type" as const,
    scriptSearchMode: "exact" as const,
    filter: {
      script: userLockScript,
    },
    groupByTransaction: true as const,
  };

  const pageSize = Math.min(limit, 50);
  const matches: Array<{
    txHash: string;
    blockNumber: bigint | null;
    txIndex: bigint | null;
    cells: Array<{ isInput: boolean; cellIndex: bigint }>;
  }> = [];

  for await (const tx of client.findTransactions(searchKey, "desc", pageSize)) {
    matches.push(tx);
    if (matches.length >= limit) {
      break;
    }
  }

  const responseTransactions: RewardTransaction[] = [];

  const lowerUserTypeHash = userTypeCodeHash.toLowerCase();
  const expectedUserLockHash = userLockScript.hash().toLowerCase();

  const scriptEquals = (
    scriptA: ccc.Script | undefined,
    scriptB: ccc.Script
  ) => {
    if (!scriptA) return false;
    try {
      return scriptA.hash().toLowerCase() === scriptB.hash().toLowerCase();
    } catch {
      return false;
    }
  };

  for (const match of matches) {
    try {
      const txResponse = await client.getTransaction(match.txHash);
      if (!txResponse) {
        continue;
      }
      const tx = txResponse.transaction;

      const outputCells = match.cells.filter((cell) => !cell.isInput);
      const inputCells = match.cells.filter((cell) => cell.isInput);

      let outputTotal = 0n;
      const outputs = outputCells.map((cell) => {
        const index = Number(cell.cellIndex);
        const data = tx.outputsData[index];
        const amount = readUdtAmount(data);
        outputTotal += amount;
        return { index, amount: amount.toString() };
      });

      let inputTotal = 0n;
      const inputs: Array<{ index: number; amount: string }> = [];
      const inputCellCache = new Map<number, ccc.Cell>();

      for (const cell of inputCells) {
        const index = Number(cell.cellIndex);
        const input = tx.inputs[index];
        if (!input) continue;
        try {
          const previous = await input.getCell(client);
          if (!previous) continue;
          inputCellCache.set(index, previous);
          const amount = readUdtAmount(previous.outputData);
          inputTotal += amount;
          inputs.push({ index, amount: amount.toString() });
        } catch (error) {
          logger.warn(
            `[${logPrefix}] Failed to load input cell for tx ${match.txHash} index ${index}:`,
            error
          );
        }
      }

      const netPoints = outputTotal - inputTotal;
      if (netPoints <= 0n) {
        continue;
      }

      let isStreakBonus = false;

      for (const cell of outputCells) {
        const index = Number(cell.cellIndex);
        const output = tx.outputs[index];
        if (!output?.type) continue;
        if (output.type.codeHash.toLowerCase() !== lowerUserTypeHash) continue;
        if (!scriptEquals(output.lock, userLockScript)) continue;

        const outputDataHex = tx.outputsData[index];
        if (!outputDataHex) break;

        let previousUserDataHex: ccc.HexLike | undefined;
        for (const cached of inputCellCache.values()) {
          const inputType = cached.cellOutput.type;
          if (!inputType) continue;
          if (inputType.codeHash.toLowerCase() !== lowerUserTypeHash) continue;
          if (
            cached.cellOutput.lock.hash().toLowerCase() !== expectedUserLockHash
          )
            continue;
          previousUserDataHex = cached.outputData;
          break;
        }

        if (!previousUserDataHex) {
          break;
        }

        try {
          const previousUserData = UserData.decode(previousUserDataHex);
          const nextUserData = UserData.decode(outputDataHex as ccc.HexLike);
          const prevLast = ccc.numFrom(
            previousUserData.last_bonus_streak_at ?? 0n
          );
          const nextLast = ccc.numFrom(nextUserData.last_bonus_streak_at ?? 0n);
          if (nextLast > prevLast) {
            isStreakBonus = true;
            break;
          }
        } catch (error) {
          logger.warn(
            `[${logPrefix}] Failed to decode user data for streak detection in tx ${match.txHash}`,
            error
          );
        }
      }

      responseTransactions.push({
        txHash: match.txHash,
        blockNumber: match.blockNumber ? match.blockNumber.toString() : null,
        txIndex: match.txIndex ? match.txIndex.toString() : null,
        netPoints: netPoints.toString(),
        outputs,
        inputs,
        isStreakBonus,
      });
    } catch (error) {
      logger.warn(
        `[${logPrefix}] Failed to process transaction ${match.txHash}`,
        error
      );
    }
  }

  return responseTransactions;
};

const hydrateInputs = async (tx: ccc.Transaction, client: ccc.Client) => {
  for (let i = 0; i < tx.inputs.length; i += 1) {
    const original = tx.inputs[i];
    const previous = await client.getCell(original.previousOutput);
    if (!previous) {
      throw new Error(
        `Input cell not found for outPoint ${JSON.stringify(
          original.previousOutput
        )}`
      );
    }

    tx.inputs[i] = ccc.CellInput.from({
      previousOutput: previous.outPoint,
      since: original.since ?? "0x0",
      cellOutput: previous.cellOutput,
      outputData: previous.outputData,
    });
  }
};

const hydrateOutputs = (tx: ccc.Transaction) => {
  for (let i = 0; i < tx.outputs.length; i += 1) {
    const out = tx.outputs[i];
    if (out.type) {
      tx.outputs[i] = ccc.CellOutput.from(
        { lock: out.lock, type: out.type },
        tx.outputsData[i] as ccc.HexLike
      );
    }
  }
};

const scriptEquals = (a: ccc.Script | undefined, b: ccc.Script): boolean => {
  if (!a) return false;
  try {
    return (
      ccc.hexFrom(a.hash()).toLowerCase() ===
      ccc.hexFrom(b.hash()).toLowerCase()
    );
  } catch {
    return false;
  }
};

const validateStreakBonusTransaction = ({
  tx,
  calculation,
  userLockScript,
  pointsTypeScript,
  network,
}: {
  tx: ccc.Transaction;
  calculation: Awaited<ReturnType<typeof evaluateStreakBonus>>;
  userLockScript: ccc.Script;
  pointsTypeScript: ccc.Script;
  network: Network;
}) => {
  const userTypeCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostUserType"
  );

  if (!userTypeCodeHash) {
    throw new Error("User type contract not configured.");
  }

  const userInputIndex = tx.inputs.findIndex((input) => {
    const cell = input.cellOutput;
    if (!cell?.type) return false;
    return (
      cell.type.codeHash === userTypeCodeHash &&
      scriptEquals(cell.lock, userLockScript)
    );
  });

  if (userInputIndex === -1) {
    throw new Error("User cell input not found in transaction.");
  }

  const userOutputIndex = tx.outputs.findIndex((output) => {
    if (!output.type) return false;
    return (
      output.type.codeHash === userTypeCodeHash &&
      scriptEquals(output.lock, userLockScript)
    );
  });

  if (userOutputIndex === -1) {
    throw new Error("User cell output not found in transaction.");
  }

  const pointsInputIndex = tx.inputs.findIndex((input) =>
    scriptEquals(input.cellOutput?.type, pointsTypeScript)
  );

  if (pointsInputIndex === -1) {
    throw new Error("Points UDT input not found in transaction.");
  }

  const pointsOutputIndex = tx.outputs.findIndex(
    (output) =>
      scriptEquals(output.type, pointsTypeScript) &&
      scriptEquals(output.lock, userLockScript)
  );

  if (pointsOutputIndex === -1) {
    throw new Error("Points UDT output not found in transaction.");
  }

  const inputUserData = decodeUserData(
    tx.inputs[userInputIndex].outputData as ccc.HexLike
  );
  const outputUserData = decodeUserData(
    tx.outputsData[userOutputIndex] as ccc.HexLike
  );

  const previousLastBonus = ccc.numFrom(
    inputUserData.last_bonus_streak_at ?? 0n
  );
  const expectedLastBonus = BigInt(calculation.lastBonusTimestamp);
  if (previousLastBonus !== expectedLastBonus) {
    throw new Error(
      `User cell last_bonus_streak_at mismatch. Expected ${expectedLastBonus}, received ${previousLastBonus}.`
    );
  }

  const updatedLastBonus = ccc.numFrom(
    outputUserData.last_bonus_streak_at ?? 0n
  );
  const expectedUpdated = BigInt(calculation.updatedLastBonusTimestamp!);
  if (updatedLastBonus !== expectedUpdated) {
    throw new Error(
      `User cell last_bonus_streak_at not updated correctly. Expected ${expectedUpdated}, received ${updatedLastBonus}.`
    );
  }

  const inputTotalPoints = ccc.numFrom(inputUserData.total_points_earned);
  const outputTotalPoints = ccc.numFrom(outputUserData.total_points_earned);
  const bonusAmount = BigInt(calculation.bonusAmount);
  if (outputTotalPoints - inputTotalPoints !== bonusAmount) {
    throw new Error(
      "User cell total_points_earned does not reflect streak bonus amount."
    );
  }

  const pointsInputAmount = readUdtAmount(
    tx.inputs[pointsInputIndex].outputData
  );
  const pointsOutputAmount = readUdtAmount(tx.outputsData[pointsOutputIndex]);
  if (pointsOutputAmount - pointsInputAmount !== bonusAmount) {
    throw new Error(
      "Points UDT output amount does not match streak bonus amount."
    );
  }

  const normalizedPrevious = normalizeUserData(inputUserData);
  const normalizedNext = normalizeUserData(outputUserData);

  ensureFieldRestrictions({
    previous: normalizedPrevious,
    next: normalizedNext,
    mode: "whitelist",
    fields: [
      "last_activity_timestamp",
      "last_bonus_streak_at",
      "total_points_earned",
    ],
  });
};
