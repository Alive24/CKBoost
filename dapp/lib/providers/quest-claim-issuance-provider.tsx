"use client";

import React from "react";

import { useToast } from "@/components/ui/use-toast";
import {
  QUEST_CLAIM_API_PATH,
  shouldRetryQuestClaimResponse,
  type QuestClaimResponse,
} from "@/lib/vellum/quest-claims";
import {
  setQuestClaimQueueRegistrar,
  type QuestClaimQueueRegistration,
} from "@/lib/vellum/quest-claim-queue";

const STORAGE_KEY = "ckboost:vellum-quest-claims";
const POLL_INTERVAL_MS = 10_000;
const TX_HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const DID_CKB_PATTERN = /^did:ckb:[a-z2-7]{32}$/;

type QueueRecord = QuestClaimQueueRegistration & {
  attempts: number;
  createdAt: number;
  lastError?: string;
  nextAttemptAt: number;
  status: "confirmed" | "failed" | "issuing" | "waiting";
};

function readQueue(): QueueRecord[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as QueueRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (record) =>
          record &&
          record.status !== "confirmed" &&
          record.status !== "failed" &&
          typeof record.subjectDid === "string" &&
          DID_CKB_PATTERN.test(record.subjectDid) &&
          typeof record.rewardClaimTxHash === "string" &&
          TX_HASH_PATTERN.test(record.rewardClaimTxHash),
      )
      .map((record) => ({
        ...record,
        attempts: Number.isInteger(record.attempts) ? record.attempts : 0,
        createdAt: record.createdAt || Date.now(),
        nextAttemptAt: Date.now(),
        status: "waiting" as const,
      }));
  } catch {
    return [];
  }
}

function writeQueue(records: QueueRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // The in-memory queue continues to retry when storage is unavailable.
  }
}

async function responseBody(response: Response): Promise<QuestClaimResponse> {
  try {
    return (await response.json()) as QuestClaimResponse;
  } catch {
    return {
      success: false,
      error: "invalid_response",
      message: "The Claim Cell issuer returned an invalid response.",
    };
  }
}

export function QuestClaimIssuanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const [records, setRecords] = React.useState<QueueRecord[]>([]);
  const recordsRef = React.useRef<QueueRecord[]>([]);
  const hydrated = React.useRef(false);
  const processing = React.useRef(false);

  React.useEffect(() => {
    const initial = readQueue();
    recordsRef.current = initial;
    setRecords(initial);
    hydrated.current = true;
  }, []);

  const updateRecords = React.useCallback(
    (update: (current: QueueRecord[]) => QueueRecord[]) => {
      const next = update(recordsRef.current);
      recordsRef.current = next;
      if (hydrated.current) writeQueue(next);
      setRecords(next);
    },
    [],
  );

  const register = React.useCallback(
    ({ rewardClaimTxHash, subjectDid }: QuestClaimQueueRegistration) => {
      const normalized = rewardClaimTxHash.toLowerCase();
      updateRecords((current) => {
        const existing = current.find(
          (record) => record.rewardClaimTxHash.toLowerCase() === normalized,
        );
        if (existing?.status === "confirmed") return current;
        const next: QueueRecord = {
          attempts: existing?.attempts ?? 0,
          createdAt: existing?.createdAt ?? Date.now(),
          nextAttemptAt: Date.now(),
          rewardClaimTxHash: normalized,
          status: "waiting",
          subjectDid,
        };
        return [
          next,
          ...current.filter(
            (record) => record.rewardClaimTxHash.toLowerCase() !== normalized,
          ),
        ];
      });
    },
    [updateRecords],
  );

  React.useEffect(() => {
    setQuestClaimQueueRegistrar(register);
    return () => setQuestClaimQueueRegistrar(null);
  }, [register]);

  const processNext = React.useCallback(async () => {
    if (processing.current) return;
    const now = Date.now();
    const candidate = recordsRef.current.find(
      (record) => record.status === "waiting" && record.nextAttemptAt <= now,
    );
    if (!candidate) return;

    processing.current = true;
    updateRecords((current) =>
      current.map((record) =>
        record.rewardClaimTxHash === candidate.rewardClaimTxHash
          ? { ...record, status: "issuing" }
          : record,
      ),
    );

    try {
      const response = await fetch(QUEST_CLAIM_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewardClaimTxHash: candidate.rewardClaimTxHash,
          subjectDid: candidate.subjectDid,
        }),
      });
      const body = await responseBody(response);
      if (body.success && body.complete) {
        updateRecords((current) =>
          current.filter(
            (record) =>
              record.rewardClaimTxHash !== candidate.rewardClaimTxHash,
          ),
        );
        toast({
          title: "Portable quest claim confirmed",
          description: `${body.claims.length} Claim Cell${body.claims.length === 1 ? "" : "s"} issued.`,
        });
        return;
      }

      const retryable = shouldRetryQuestClaimResponse(response.status, body);
      const message = body.success
        ? "Claim Cell issuance is pending."
        : body.message;
      if (!retryable) {
        updateRecords((current) =>
          current.filter(
            (record) =>
              record.rewardClaimTxHash !== candidate.rewardClaimTxHash,
          ),
        );
        toast({
          title: "Portable quest claim failed",
          description: message,
          variant: "destructive",
        });
        return;
      }

      const requestedDelay = body.retryAfterSeconds ?? 15;
      const retryAfter = Number.isFinite(requestedDelay)
        ? Math.min(300, Math.max(5, requestedDelay))
        : 15;
      updateRecords((current) =>
        current.map((record) =>
          record.rewardClaimTxHash === candidate.rewardClaimTxHash
            ? {
                ...record,
                attempts: record.attempts + 1,
                lastError: message,
                nextAttemptAt: Date.now() + retryAfter * 1_000,
                status: "waiting",
              }
            : record,
        ),
      );
    } catch (error) {
      updateRecords((current) =>
        current.map((record) =>
          record.rewardClaimTxHash === candidate.rewardClaimTxHash
            ? {
                ...record,
                attempts: record.attempts + 1,
                lastError:
                  error instanceof Error ? error.message : "Network error",
                nextAttemptAt: Date.now() + 15_000,
                status: "waiting",
              }
            : record,
        ),
      );
    } finally {
      processing.current = false;
    }
  }, [toast, updateRecords]);

  React.useEffect(() => {
    void processNext();
    const interval = window.setInterval(() => {
      void processNext();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [processNext, records]);

  return <>{children}</>;
}
