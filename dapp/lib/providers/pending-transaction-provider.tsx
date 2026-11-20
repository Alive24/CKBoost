"use client";

import React from "react";
import {
  PendingTransactionMetadata,
  setPendingTransactionRegistrar,
} from "@/lib/pending-transactions";
import { createScopedLogger } from "ssri-ckboost/logging";

const STORAGE_KEY = "ckboost:pending-transactions";
const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev";
const DEFAULT_POLL_INTERVAL = Number(
  process.env.NEXT_PUBLIC_PENDING_TX_POLL_INTERVAL_MS || 5000
);
const NETWORK =
  process.env.NEXT_PUBLIC_CKB_NETWORK === "testnet" ? "testnet" : "mainnet";
const EXPLORER_BASE_URL =
  NETWORK === "testnet"
    ? "https://pudge.explorer.nervos.org/transaction/"
    : "https://explorer.nervos.org/transaction/";
const CONFIRMATION_TARGET = Number(
  process.env.NEXT_PUBLIC_PENDING_TX_CONFIRMATIONS || 6
);
const RECENT_LIMIT = 10;

const log = createScopedLogger("PendingTransactionProvider");

export type TransactionLifecycleStatus =
  | "waiting"
  | "rpc_seen"
  | "confirming"
  | "finalized";

export type PendingTransactionRecord = {
  txHash: string;
  createdAt: number;
  metadata?: PendingTransactionMetadata;
  lastCheckedAt?: number;
  lastError?: string | null;
  checkAttempts: number;
  status: TransactionLifecycleStatus;
  confirmations: number;
  blockNumber?: number;
  rpcSeenAt?: number;
  finalizedAt?: number;
};

type PendingTransactionContextValue = {
  pendingTransactions: PendingTransactionRecord[];
  pendingCount: number;
  activeCount: number;
  hasTrackedTransactions: boolean;
  confirmationTarget: number;
  register: (txHash: string, metadata?: PendingTransactionMetadata) => void;
  remove: (txHash: string) => void;
  refresh: () => Promise<void>;
  explorerBaseUrl: string;
  rpcUrl: string;
};

const PendingTransactionContext = React.createContext<
  PendingTransactionContextValue | undefined
>(undefined);

export const usePendingTransactions = () => {
  const ctx = React.useContext(PendingTransactionContext);
  if (!ctx) {
    throw new Error(
      "usePendingTransactions must be used within PendingTransactionProvider"
    );
  }
  return ctx;
};

function readFromStorage(): PendingTransactionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingTransactionRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.txHash)
      .map((item) => ({
        txHash: item.txHash,
        createdAt: item.createdAt || Date.now(),
        metadata: item.metadata,
        lastCheckedAt: item.lastCheckedAt,
        lastError: item.lastError || null,
        checkAttempts: item.checkAttempts || 0,
        status:
          item.status === "rpc_seen" ||
          item.status === "confirming" ||
          item.status === "finalized"
            ? item.status
            : "waiting",
        confirmations: item.confirmations || 0,
        blockNumber: item.blockNumber,
        rpcSeenAt: item.rpcSeenAt,
        finalizedAt: item.finalizedAt,
      }));
  } catch (error) {
    log.warn("Failed to read pending transactions from storage", error);
    return [];
  }
}

function writeToStorage(records: PendingTransactionRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    log.warn("Failed to persist pending transactions", error);
  }
}

type QueryResult = {
  found: boolean;
  rpcStatus?: string;
  blockNumber?: number;
};

function hexToNumber(hex?: string | null): number | undefined {
  if (!hex) return undefined;
  try {
    return Number(BigInt(hex));
  } catch (_) {
    return undefined;
  }
}

async function queryTransaction(
  txHash: string,
  rpcUrl: string
): Promise<QueryResult> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method: "get_transaction",
        params: [txHash],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC returned ${response.status}`);
    }

    const payload = await response.json();

    if (payload.error) {
      throw new Error(payload.error.message || "RPC error");
    }

    if (!payload.result || !payload.result.transaction) {
      return { found: false };
    }

    const rpcStatus = payload.result.tx_status?.status as string | undefined;
    const blockNumber = hexToNumber(payload.result.tx_status?.block_number);

    return {
      found: true,
      rpcStatus,
      blockNumber,
    };
  } catch (error) {
    log.warn("RPC get_transaction failed", { txHash, error });
    throw error;
  }
}

async function getTipBlockNumber(rpcUrl: string): Promise<number | undefined> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method: "get_tip_block_number",
        params: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC returned ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || "RPC error");
    }

    return hexToNumber(payload.result);
  } catch (error) {
    log.warn("Failed to query get_tip_block_number", error);
    return undefined;
  }
}

export function PendingTransactionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pendingTransactions, setPendingTransactions] = React.useState<
    PendingTransactionRecord[]
  >([]);
  const hasHydrated = React.useRef(false);
  const pendingRef = React.useRef<PendingTransactionRecord[]>([]);
  const isPollingRef = React.useRef(false);

  const rpcUrl = DEFAULT_RPC_URL;
  const pollInterval = Number.isFinite(DEFAULT_POLL_INTERVAL)
    ? Math.max(1000, DEFAULT_POLL_INTERVAL)
    : 5000;

  React.useEffect(() => {
    const initial = readFromStorage();
    if (initial.length > 0) {
      setPendingTransactions(initial);
    }
    hasHydrated.current = true;
  }, []);

  React.useEffect(() => {
    pendingRef.current = pendingTransactions;
    if (!hasHydrated.current) return;
    writeToStorage(pendingTransactions);
  }, [pendingTransactions]);

  const registerTx = React.useCallback(
    (txHash: string, metadata?: PendingTransactionMetadata) => {
      if (!txHash) return;
      setPendingTransactions((current) => {
        const normalized = txHash.toLowerCase();
        const filtered = current.filter(
          (tx) => tx.txHash.toLowerCase() !== normalized
        );
        const next: PendingTransactionRecord = {
          txHash,
          createdAt: Date.now(),
          metadata,
          checkAttempts: 0,
          status: "waiting",
          confirmations: 0,
          lastError: null,
        };
        const merged = [next, ...filtered];
        return merged.slice(0, RECENT_LIMIT);
      });
    },
    []
  );

  const removeTx = React.useCallback((txHash: string) => {
    if (!txHash) return;
    setPendingTransactions((current) =>
      current.filter((tx) => tx.txHash !== txHash)
    );
  }, []);

  const pollPendingTransactions = React.useCallback(
    async (force = false) => {
      if (isPollingRef.current) return;
      const snapshot = pendingRef.current;
      if (snapshot.length === 0) return;

      const now = Date.now();
      const candidates = force
        ? snapshot
        : snapshot.filter((tx) => tx.status !== "finalized");

      if (candidates.length === 0) return;

      const needsCheck = force
        ? candidates
        : candidates.filter((tx) => {
            if (!tx.lastCheckedAt) return true;
            return now - tx.lastCheckedAt >= pollInterval;
          });

      if (needsCheck.length === 0) return;

      isPollingRef.current = true;

      try {
        const results = await Promise.all(
          needsCheck.map(async (tx) => {
            try {
              const outcome = await queryTransaction(tx.txHash, rpcUrl);
              return {
                txHash: tx.txHash,
                ...outcome,
                error: null as string | null,
              };
            } catch (error) {
              return {
                txHash: tx.txHash,
                found: false,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          })
        );

        const needsTip = results.some(
          (entry) => entry.found && typeof entry.blockNumber === "number"
        );

        let tipBlockNumber: number | undefined;
        if (needsTip) {
          tipBlockNumber = await getTipBlockNumber(rpcUrl);
        }

        const lookup = new Map(
          results.map((entry) => [
            entry.txHash,
            {
              ...entry,
              tipBlockNumber,
            },
          ])
        );

        setPendingTransactions((current) =>
          current.map((tx) => {
            const match = lookup.get(tx.txHash);
            if (!match) return tx;

            const next: PendingTransactionRecord = {
              ...tx,
              lastCheckedAt: now,
              checkAttempts: tx.checkAttempts + 1,
            };

            if (match.error) {
              next.lastError = match.error;
              return next;
            }

            if (!match.found) {
              next.lastError = null;
              next.status = "waiting";
              return next;
            }

            next.lastError = null;
            next.rpcSeenAt = next.rpcSeenAt ?? now;

            const rpcStatus = match.rpcStatus;
            let status: TransactionLifecycleStatus = "rpc_seen";
            let confirmations = next.confirmations || 0;

            if (
              typeof match.blockNumber === "number" &&
              typeof match.tipBlockNumber === "number"
            ) {
              next.blockNumber = match.blockNumber;
              confirmations = Math.max(
                0,
                match.tipBlockNumber - match.blockNumber + 1
              );
              next.confirmations = confirmations;
              if (confirmations >= CONFIRMATION_TARGET) {
                status = "finalized";
                next.finalizedAt = next.finalizedAt ?? now;
              } else if (confirmations > 0) {
                status = "confirming";
              } else {
                status = "rpc_seen";
              }
            } else if (rpcStatus === "committed") {
              status = "confirming";
            } else if (rpcStatus === "pending" || rpcStatus === "proposed") {
              status = "rpc_seen";
            }

            next.status = status;
            return next;
          })
        );
      } finally {
        isPollingRef.current = false;
      }
    },
    [pollInterval, rpcUrl]
  );

  const hasActiveTransactions = React.useMemo(
    () => pendingTransactions.some((tx) => tx.status !== "finalized"),
    [pendingTransactions]
  );

  React.useEffect(() => {
    if (!hasActiveTransactions) return;
    pollPendingTransactions();
    const id = window.setInterval(() => {
      pollPendingTransactions();
    }, pollInterval);
    return () => window.clearInterval(id);
  }, [hasActiveTransactions, pollInterval, pollPendingTransactions]);

  React.useEffect(() => {
    setPendingTransactionRegistrar(registerTx);
    return () => setPendingTransactionRegistrar(null);
  }, [registerTx]);

  const refresh = React.useCallback(async () => {
    await pollPendingTransactions(true);
  }, [pollPendingTransactions]);

  const activeCount = pendingTransactions.filter(
    (tx) => tx.status !== "finalized"
  ).length;
  const hasTrackedTransactions = pendingTransactions.length > 0;

  const value = React.useMemo<PendingTransactionContextValue>(
    () => ({
      pendingTransactions,
      pendingCount: activeCount,
      activeCount,
      hasTrackedTransactions,
      confirmationTarget: CONFIRMATION_TARGET,
      register: registerTx,
      remove: removeTx,
      refresh,
      explorerBaseUrl: EXPLORER_BASE_URL,
      rpcUrl,
    }),
    [
      pendingTransactions,
      activeCount,
      hasTrackedTransactions,
      registerTx,
      removeTx,
      refresh,
      rpcUrl,
    ]
  );

  return (
    <PendingTransactionContext.Provider value={value}>
      {children}
    </PendingTransactionContext.Provider>
  );
}
