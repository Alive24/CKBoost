import type { Handler } from "@netlify/functions";
import { ccc } from "@ckb-ccc/shell";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { readUdtAmount } from "@/netlify/lib/streak-bonus";
import { createLogger } from "@/netlify/lib/log";
import { getIsolatedProtocolScope } from "@/netlify/lib/isolated-protocol-scope";

type JsonResponse = {
  address: string;
  protocolTypeHash: string;
  pointsTypeScript: {
    codeHash: string;
    hashType: ccc.HashType;
    args: string;
  };
  transactions: Array<{
    txHash: string;
    blockNumber: string | null;
    txIndex: string | null;
    netPoints: string;
    outputs: Array<{ index: number; amount: string }>;
    inputs: Array<{ index: number; amount: string }>;
  }>;
};

const MAX_RESULTS = 100;
const DEFAULT_RESULTS = 20;

const logger = createLogger("reward-history");

const getClient = () => {
  const network = deploymentManager.getCurrentNetwork();
  const rpcUrl =
    process.env.NEXT_PUBLIC_CKB_RPC_URL ||
    process.env.CKB_RPC_URL ||
    (network === "mainnet"
      ? "https://mainnet.ckb.dev"
      : "https://testnet.ckb.dev");

  if (network === "mainnet") {
    return new ccc.ClientPublicMainnet({ url: rpcUrl });
  }
  return new ccc.ClientPublicTestnet({ url: rpcUrl });
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const address = event.queryStringParameters?.address?.trim();
  if (!address) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing address parameter" }),
    };
  }

  let limit = Number(event.queryStringParameters?.limit ?? DEFAULT_RESULTS);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = DEFAULT_RESULTS;
  }
  limit = Math.min(Math.floor(limit), MAX_RESULTS);

  const network = deploymentManager.getCurrentNetwork();
  const pointsCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostPointsUdt"
  );

  if (!pointsCodeHash) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Points UDT contract not configured in deployments.json",
      }),
    };
  }

  const client = getClient();

  // Resolve user lock script from address
  let addressObj: ccc.Address;
  try {
    addressObj = await ccc.Address.fromString(address, client);
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Invalid CKB address",
        details: (error as Error).message,
      }),
    };
  }
  const userLockScript = addressObj.script;

  // Determine protocol type hash (args for points UDT)
  const isolated = getIsolatedProtocolScope();
  const protocolTypeCodeHash =
    isolated?.codeHash ?? process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH?.trim();
  const protocolTypeHashType =
    isolated?.hashType ?? (process.env.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE?.trim() ||
      "type") as ccc.HashType;
  const protocolTypeArgs =
    isolated?.args ?? (process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS?.trim() || "");

  if (!protocolTypeCodeHash || !protocolTypeArgs) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error:
          "Protocol type environment variables missing. Ensure NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH and NEXT_PUBLIC_PROTOCOL_TYPE_ARGS are set.",
      }),
    };
  }

  let protocolTypeHash: string;
  try {
    const protocolTypeScript = ccc.Script.from({
      codeHash: protocolTypeCodeHash,
      hashType: protocolTypeHashType,
      args: protocolTypeArgs,
    });
    protocolTypeHash = protocolTypeScript.hash().toLowerCase();
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to construct protocol type script from environment",
        details: (error as Error).message,
      }),
    };
  }

  const pointsTypeScript = ccc.Script.from({
    codeHash: pointsCodeHash,
    hashType: "type" as ccc.HashType,
    args: protocolTypeHash,
  });

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

  try {
    for await (const tx of client.findTransactions(
      searchKey,
      "desc",
      pageSize
    )) {
      matches.push(tx);
      if (matches.length >= limit) {
        break;
      }
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to query transactions",
        details: (error as Error).message,
      }),
    };
  }

  const responseTransactions: JsonResponse["transactions"] = [];

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

      for (const cell of inputCells) {
        const index = Number(cell.cellIndex);
        const input = tx.inputs[index];
        if (!input) continue;
        try {
          const previous = await input.getCell(client);
          if (!previous) continue;
          const amount = readUdtAmount(previous.outputData);
          inputTotal += amount;
          inputs.push({ index, amount: amount.toString() });
        } catch (error) {
          logger.warn(
            `Failed to load input cell for tx ${match.txHash} index ${index}:`,
            error
          );
        }
      }

      const netPoints = outputTotal - inputTotal;
      if (netPoints <= 0n) {
        continue;
      }

      responseTransactions.push({
        txHash: match.txHash,
        blockNumber: match.blockNumber ? match.blockNumber.toString() : null,
        txIndex: match.txIndex ? match.txIndex.toString() : null,
        netPoints: netPoints.toString(),
        outputs,
        inputs,
      });
    } catch (error) {
      logger.warn(`Failed to process transaction ${match.txHash}`, error);
    }
  }

  const response: JsonResponse = {
    address,
    protocolTypeHash,
    pointsTypeScript: {
      codeHash: pointsTypeScript.codeHash,
      hashType: pointsTypeScript.hashType,
      args: pointsTypeScript.args,
    },
    transactions: responseTransactions,
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  };
};
