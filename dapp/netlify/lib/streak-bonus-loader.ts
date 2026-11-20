import { ccc } from "@ckb-ccc/shell";
import type { Network } from "@/lib/ckb/deployment-manager";
import { createLogger } from "@/netlify/lib/log";
import {
  evaluateStreakBonus,
  readUdtAmount,
  type BonusStreakCalculation,
  type RewardTransaction,
} from "@/netlify/lib/streak-bonus";
import { UserData } from "ssri-ckboost/types";
import { getIsolatedProtocolScope } from "@/netlify/lib/isolated-protocol-scope";

const log = createLogger("streak-bonus-loader");

export type StreakBonusLoadParams = {
  client: ccc.Client;
  pointsTypeScript: ccc.Script;
  userLockScript: ccc.Script;
  userTypeCodeHash: string;
  limit: number;
  rpcUrl: string;
  address: string;
  protocolTypeHash: string;
  network: Network;
};

export const loadStreakBonusCalculation = async (
  params: StreakBonusLoadParams
): Promise<BonusStreakCalculation> => {
  const transactions = await fetchRewardTransactions({
    client: params.client,
    pointsTypeScript: params.pointsTypeScript,
    userLockScript: params.userLockScript,
    userTypeCodeHash: params.userTypeCodeHash,
    limit: params.limit,
  });

  return evaluateStreakBonus({
    client: params.client,
    rpcUrl: params.rpcUrl,
    address: params.address,
    protocolTypeHash: params.protocolTypeHash,
    network: params.network,
    userLockScript: params.userLockScript,
    transactions,
  });
};

const fetchRewardTransactions = async ({
  client,
  pointsTypeScript,
  userLockScript,
  userTypeCodeHash,
  limit,
}: {
  client: ccc.Client;
  pointsTypeScript: ccc.Script;
  userLockScript: ccc.Script;
  userTypeCodeHash: string;
  limit: number;
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
          log.warn(
            `Failed to load input cell for tx ${match.txHash} index ${index}:`,
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
        for (const [inputIndex, cached] of inputCellCache.entries()) {
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
          log.warn(
            `Failed to decode user data for streak detection in tx ${match.txHash}`,
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
      log.warn(`Failed to process transaction ${match.txHash}`, error);
    }
  }

  return responseTransactions;
};

export const resolveProtocolTypeScriptFromEnv = ():
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

export const createPublicClient = (network: Network, url: string): ccc.Client => {
  if (network === "mainnet") {
    return new ccc.ClientPublicMainnet({ url });
  }
  return new ccc.ClientPublicTestnet({ url });
};

