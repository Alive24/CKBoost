import { ccc } from "@ckb-ccc/connector-react";
import {
  decodeClaimablePoolData,
  type ClaimablePoolEntry,
} from "ckb-claimable-pool-lock";
import claimablePoolDeployments from "../../../contracts/contracts/claimable-pool-lock/deployments.json";
import { createScopedLogger } from "ssri-ckboost";
import { deploymentManager, type Network } from "./deployment-manager";
import { getIsolatedRuntime } from "./isolated-runtime.mjs";
import { sendTransactionWithFeeRetry } from "./transaction-wrapper";
import { udtRegistry } from "../services/udt-registry";

const log = createScopedLogger("ClaimablePool");

export type ClaimablePoolClaimCell = {
  cell: ccc.Cell;
  amount: bigint;
};

export type ClaimablePointsSummary = {
  claimantLockHash: ccc.Hex;
  totalAmount: bigint;
  cells: ClaimablePoolClaimCell[];
};

export type ClaimablePoolSummary = ClaimablePointsSummary;

export type ClaimablePoolAdminCell = {
  cell: ccc.Cell;
  outPointKey: string;
  recyclerLockHash: ccc.Hex;
  createdAt: number | null;
  blockNumber: bigint | null;
  entryCount: number;
  remainingAmount: bigint;
  isFullyClaimed: boolean;
  assetKind: "ckb" | "udt";
  typeHash: ccc.Hex | null;
  typeScript: ccc.Script | null;
};

export type ClaimableUdtPoolGroup = {
  typeHash: ccc.Hex;
  typeScript: ccc.Script;
  totalAmount: bigint;
  cells: ClaimablePoolClaimCell[];
};

type ClaimablePoolDeployment = {
  transactionHash: ccc.Hex;
  index: ccc.NumLike;
  typeHash?: ccc.Hex;
};

export function emptyClaimablePointsSummary(
  claimantLockHash: ccc.HexLike = `0x${"00".repeat(32)}`
): ClaimablePointsSummary {
  return {
    claimantLockHash: ccc.hexFrom(ccc.bytesFrom(claimantLockHash)),
    totalAmount: 0n,
    cells: [],
  };
}

export function getClaimablePoolLockDeployment(
  network: Network = deploymentManager.getCurrentNetwork()
): ClaimablePoolDeployment | null {
  const isolated = getIsolatedRuntime();
  if (isolated) {
    if (network !== "testnet") throw new Error("Isolated QA cannot read mainnet pool deployments.");
    return isolated.claimablePool as unknown as ClaimablePoolDeployment;
  }
  return (
    (claimablePoolDeployments as unknown as {
      current?: Record<string, { claimablePoolLock?: ClaimablePoolDeployment }>;
    }).current?.[network]?.claimablePoolLock ?? null
  );
}

export function getClaimablePoolLockCodeHash(
  network: Network = deploymentManager.getCurrentNetwork()
): ccc.Hex | null {
  return getClaimablePoolLockDeployment(network)?.typeHash ?? null;
}

export function getClaimablePoolLockOutPoint(
  network: Network = deploymentManager.getCurrentNetwork()
): { txHash: ccc.Hex; index: ccc.NumLike } | null {
  const deployment = getClaimablePoolLockDeployment(network);
  if (!deployment) return null;
  return {
    txHash: deployment.transactionHash,
    index: deployment.index,
  };
}

export function addClaimablePoolLockCellDep(tx: ccc.Transaction): void {
  const outPoint = getClaimablePoolLockOutPoint();
  if (!outPoint) {
    throw new Error(
      "Claimable Pool Lock contract not found in claimable-pool-lock/deployments.json"
    );
  }

  tx.addCellDeps({
    outPoint,
    depType: "code",
  });
}

export async function addClaimablePoolAssetCellDep(
  client: ccc.Client,
  tx: ccc.Transaction,
  typeScript: ccc.Script
): Promise<void> {
  const network = deploymentManager.getCurrentNetwork();
  const typeCodeHash = ccc.hexFrom(typeScript.codeHash).toLowerCase();
  const pointsUdtCodeHash = deploymentManager
    .getContractCodeHash(network, "ckboostPointsUdt")
    ?.toLowerCase();

  if (pointsUdtCodeHash && typeCodeHash === pointsUdtCodeHash) {
    const outPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostPointsUdt"
    );
    if (!outPoint) {
      throw new Error("Points UDT contract outPoint is not configured.");
    }
    tx.addCellDeps({ outPoint, depType: "code" });
    return;
  }

  const typeHash = ccc.hexFrom(typeScript.hash()).toLowerCase();
  const token = udtRegistry.getTokenByScriptHash(typeHash);
  if (token) {
    const contractCell = await client.findSingletonCellByType(
      token.contractScript
    );
    if (!contractCell) {
      throw new Error(`${token.symbol} contract cell was not found.`);
    }
    tx.addCellDeps({ outPoint: contractCell.outPoint, depType: "code" });
    return;
  }

  if (await addAlwaysSuccessCellDepIfMatched(client, tx, typeScript)) {
    return;
  }

  throw new Error(
    `No UDT cell dep is configured for claimable pool type ${typeHash}.`
  );
}

async function addAlwaysSuccessCellDepIfMatched(
  client: ccc.Client,
  tx: ccc.Transaction,
  typeScript: ccc.Script
): Promise<boolean> {
  const alwaysSuccess = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.AlwaysSuccess,
    "0x"
  );
  if (
    typeScript.codeHash !== alwaysSuccess.codeHash ||
    typeScript.hashType !== alwaysSuccess.hashType ||
    ccc.hexFrom(typeScript.args) !== ccc.hexFrom(alwaysSuccess.args)
  ) {
    return false;
  }

  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.AlwaysSuccess);
  return true;
}

export async function queryClaimablePointsPools(params: {
  client: ccc.Client;
  claimantLock: ccc.Script;
  protocolTypeHash: ccc.HexLike;
}): Promise<ClaimablePointsSummary> {
  const { client, claimantLock, protocolTypeHash } = params;
  const claimantLockHash = normalizeByte32Hex(claimantLock.hash());
  const network = deploymentManager.getCurrentNetwork();
  const claimablePoolLockCodeHash = getClaimablePoolLockCodeHash(network);
  const pointsUdtCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostPointsUdt"
  );

  if (!claimablePoolLockCodeHash || !pointsUdtCodeHash) {
    log.warn("Claimable pool query skipped because deployments are incomplete", {
      hasClaimablePoolLock: !!claimablePoolLockCodeHash,
      hasPointsUdt: !!pointsUdtCodeHash,
    });
    return emptyClaimablePointsSummary(claimantLockHash);
  }

  const pointsType = ccc.Script.from({
    codeHash: pointsUdtCodeHash,
    hashType: "type" as ccc.HashType,
    args: ccc.hexFrom(ccc.bytesFrom(protocolTypeHash)),
  });

  return queryClaimablePools({
    client,
    claimantLock,
    type: pointsType,
  });
}

export async function queryClaimableCkbPools(params: {
  client: ccc.Client;
  claimantLock: ccc.Script;
}): Promise<ClaimablePoolSummary> {
  return queryClaimablePools({
    client: params.client,
    claimantLock: params.claimantLock,
    type: null,
  });
}

export async function queryAllClaimablePoolCells(params: {
  client: ccc.Client;
  recyclerLockHash?: ccc.HexLike;
}): Promise<ClaimablePoolAdminCell[]> {
  const { client } = params;
  const network = deploymentManager.getCurrentNetwork();
  const claimablePoolLockCodeHash = getClaimablePoolLockCodeHash(network);
  const recyclerLockHash = params.recyclerLockHash
    ? normalizeByte32Hex(params.recyclerLockHash)
    : null;

  if (!claimablePoolLockCodeHash) {
    log.warn("Claimable pool query skipped because deployment is incomplete");
    return [];
  }

  const searchKey: Parameters<typeof client.findCells>[0] = {
    script: {
      codeHash: claimablePoolLockCodeHash,
      hashType: "type" as const,
      args: recyclerLockHash ?? "0x",
    },
    scriptType: "lock" as const,
    scriptSearchMode: recyclerLockHash ? "exact" : ("prefix" as const),
    withData: true,
  };
  const cells: ClaimablePoolAdminCell[] = [];

  for await (const cell of client.findCells(searchKey)) {
    try {
      const cellRecyclerLockHash = normalizeByte32Hex(cell.cellOutput.lock.args);
      const decoded = decodeClaimablePoolData(cell.outputData);
      const remainingAmount = decoded.entries.reduce(
        (total, entry) => total + ccc.numFrom(entry.amount),
        0n
      );
      const typeScript = cell.cellOutput.type
        ? ccc.Script.from(cell.cellOutput.type)
        : null;
      const creation = await resolvePoolCreationInfo(
        client,
        cell.outPoint.txHash
      );

      cells.push({
        cell,
        outPointKey: formatOutPointKey(cell.outPoint),
        recyclerLockHash: cellRecyclerLockHash,
        createdAt: creation.createdAt,
        blockNumber: creation.blockNumber,
        entryCount: decoded.entries.length,
        remainingAmount,
        isFullyClaimed: remainingAmount === 0n,
        assetKind: typeScript ? "udt" : "ckb",
        typeHash: typeScript ? ccc.hexFrom(typeScript.hash()) : null,
        typeScript,
      });
    } catch (error) {
      log.warn("Skipping invalid claimable pool cell", {
        outPoint: cell.outPoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return cells.sort((a, b) => {
    const aCreated = a.createdAt ?? 0;
    const bCreated = b.createdAt ?? 0;
    if (aCreated !== bCreated) return bCreated - aCreated;
    return a.outPointKey.localeCompare(b.outPointKey);
  });
}

export async function queryClaimableUdtPoolGroups(params: {
  client: ccc.Client;
  claimantLock: ccc.Script;
  excludeTypeHashes?: ccc.HexLike[];
}): Promise<ClaimableUdtPoolGroup[]> {
  const excluded = new Set(
    (params.excludeTypeHashes ?? []).map((hash) =>
      ccc.hexFrom(ccc.bytesFrom(hash)).toLowerCase()
    )
  );
  const summary = await queryClaimablePools({
    client: params.client,
    claimantLock: params.claimantLock,
  });
  const groups = new Map<ccc.Hex, ClaimableUdtPoolGroup>();

  for (const item of summary.cells) {
    if (!item.cell.cellOutput.type) {
      continue;
    }
    const typeScript = ccc.Script.from(item.cell.cellOutput.type);
    const typeHash = ccc.hexFrom(typeScript.hash()).toLowerCase() as ccc.Hex;
    if (excluded.has(typeHash)) {
      continue;
    }

    const existing = groups.get(typeHash);
    if (existing) {
      existing.totalAmount += item.amount;
      existing.cells.push(item);
    } else {
      groups.set(typeHash, {
        typeHash,
        typeScript,
        totalAmount: item.amount,
        cells: [item],
      });
    }
  }

  return Array.from(groups.values());
}

export async function queryClaimablePools(params: {
  client: ccc.Client;
  claimantLock: ccc.Script;
  type?: ccc.ScriptLike | null;
}): Promise<ClaimablePoolSummary> {
  const { client, claimantLock, type } = params;
  const claimantLockHash = normalizeByte32Hex(claimantLock.hash());
  const network = deploymentManager.getCurrentNetwork();
  const claimablePoolLockCodeHash = getClaimablePoolLockCodeHash(network);

  if (!claimablePoolLockCodeHash) {
    log.warn("Claimable pool query skipped because deployment is incomplete");
    return emptyClaimablePointsSummary(claimantLockHash);
  }

  const expectedType =
    type === undefined || type === null ? type : ccc.Script.from(type);
  const searchKey: Parameters<typeof client.findCells>[0] = {
    script: {
      codeHash: claimablePoolLockCodeHash,
      hashType: "type" as const,
      args: "0x",
    },
    scriptType: "lock" as const,
    scriptSearchMode: "prefix" as const,
    withData: true,
  };
  if (expectedType) {
    searchKey.filter = {
      script: expectedType,
    };
  }

  const cells: ClaimablePoolClaimCell[] = [];

  for await (const cell of client.findCells(searchKey)) {
    if (expectedType === null && cell.cellOutput.type) {
      continue;
    }
    if (
      expectedType &&
      (!cell.cellOutput.type ||
        ccc.hexFrom(ccc.Script.from(cell.cellOutput.type).hash()) !==
          ccc.hexFrom(expectedType.hash()))
    ) {
      continue;
    }

    try {
      const decoded = decodeClaimablePoolData(cell.outputData);
      const amount = sumClaimableEntriesForLock(
        decoded.entries,
        claimantLockHash
      );
      if (amount <= 0n) {
        continue;
      }

      cells.push({
        cell,
        amount,
      });
    } catch (error) {
      log.warn("Skipping invalid claimable pool cell", {
        outPoint: cell.outPoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    claimantLockHash,
    totalAmount: cells.reduce((total, item) => total + item.amount, 0n),
    cells,
  };
}

export async function recycleClaimablePoolCells(params: {
  signer: ccc.Signer;
  cells: ccc.Cell[];
  label?: string;
  addAssetCellDeps?: (
    tx: ccc.Transaction,
    typeScript: ccc.Script
  ) => void | Promise<void>;
}): Promise<ccc.Hex> {
  if (params.cells.length === 0) {
    throw new Error("At least one claimable pool cell is required");
  }

  const tx = ccc.Transaction.from({});
  const recyclerLock = (await params.signer.getRecommendedAddressObj()).script;
  const typedPools = new Map<ccc.Hex, ccc.Script>();
  for (const cell of params.cells) {
    const typeScript = cell.cellOutput.type
      ? ccc.Script.from(cell.cellOutput.type)
      : null;
    if (typeScript) {
      typedPools.set(
        ccc.hexFrom(typeScript.hash()).toLowerCase() as ccc.Hex,
        typeScript
      );
    }
    tx.addInput(cell);
    tx.addOutput(
      {
        capacity: cell.cellOutput.capacity,
        lock: recyclerLock,
        type: cell.cellOutput.type ?? undefined,
      },
      cell.outputData
    );
  }
  addClaimablePoolLockCellDep(tx);
  for (const typeScript of typedPools.values()) {
    await params.addAssetCellDeps?.(tx, typeScript);
  }

  return sendTransactionWithFeeRetry(params.signer, tx, {
    preserveOutputCapacityIndices: new Set(
      params.cells.map((_, index) => index)
    ),
    pendingMetadata: {
      label: params.label ?? "Recycle Claimable Pool",
      context: "ClaimablePool",
    },
  });
}

function normalizeByte32Hex(value: ccc.HexLike): ccc.Hex {
  const bytes = ccc.bytesFrom(value);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32 bytes, received ${bytes.length}`);
  }
  return ccc.hexFrom(bytes).toLowerCase() as ccc.Hex;
}

function formatOutPointKey(outPoint: ccc.OutPointLike): string {
  const outPointLike = ccc.OutPoint.from(outPoint);
  return `${outPointLike.txHash}:${Number(outPointLike.index)}`;
}

async function resolvePoolCreationInfo(
  client: ccc.Client,
  txHash: ccc.HexLike
): Promise<{ createdAt: number | null; blockNumber: bigint | null }> {
  try {
    const transactionWithHeader = await client.getTransactionWithHeader(txHash);
    const header = transactionWithHeader?.header;
    const transaction =
      transactionWithHeader?.transaction ??
      (await client.getTransaction(txHash));
    const blockNumber = transaction?.blockNumber
      ? ccc.numFrom(transaction.blockNumber)
      : header?.number
        ? ccc.numFrom(header.number)
        : null;
    const timestamp = header?.timestamp ? ccc.numFrom(header.timestamp) : null;

    return {
      createdAt: timestamp === null ? null : Number(timestamp),
      blockNumber,
    };
  } catch (error) {
    log.warn("Failed to resolve claimable pool creation time", {
      txHash: ccc.hexFrom(txHash),
      error: error instanceof Error ? error.message : String(error),
    });
    return { createdAt: null, blockNumber: null };
  }
}

function sumClaimableEntriesForLock(
  entries: ClaimablePoolEntry[],
  claimantLockHash: ccc.HexLike
): bigint {
  const normalizedClaimantLockHash = normalizeByte32Hex(claimantLockHash);
  return entries.reduce((total, entry) => {
    const entryLockHash = normalizeByte32Hex(entry.claimantLockHash);
    if (entryLockHash !== normalizedClaimantLockHash) {
      return total;
    }
    return total + ccc.numFrom(entry.amount);
  }, 0n);
}
