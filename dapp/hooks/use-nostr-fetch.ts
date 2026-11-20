"use client";

import { useState, useCallback } from "react";
import { DEFAULT_NOSTR_RELAYS, useNostr } from "@/lib/providers/nostr-provider";
import { NostrEvent, NostrFilter } from "@nostrify/types";
import { createScopedLogger } from "ssri-ckboost/logging";
import { Comment } from "@/components/social-interactions";
import { NPool } from "@nostrify/nostrify";
import {
  DEFAULT_FETCH_ROUNDS,
  DEFAULT_RELAY_TIMEOUT_MS,
  isValidCkboostEvent,
  mergeRelayLists,
} from "@/lib/nostr/relay-core";
import {
  fetchNeventWithCache,
  NostrEventFetchError,
  toSafeNostrFetchDiagnostic,
  type NostrFetchErrorCode,
} from "@/lib/nostr/browser-fetch";
export type { NostrFetchErrorCode } from "@/lib/nostr/browser-fetch";
const log = createScopedLogger("useNostrFetch");

// Custom kind for CKBoost quest submissions
const CKBOOST_SUBMISSION_KIND = 30078;

export interface ParsedSubmission {
  campaignTypeId: string;
  questId: number;
  userAddress: string;
  content: string;
  timestamp: number;
  eventId: string;
  author: string;
  relays: string[];
  created_at: number;
  metadata: Record<string, string>;
  event?: NostrEvent;
  source?: "local" | "relay";
  sourceRelay?: string;
}

interface FetchFilterOptions {
  relays?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type NostrComment = {
  neventId: string;
  senderAddress: string;
};

export function useNostrFetch() {
  const { nostr } = useNostr();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<NostrFetchErrorCode | null>(null);

  const extractMetadata = (event: NostrEvent): Record<string, string> => {
    const metadata: Record<string, string> = {};
    for (const tag of event.tags) {
      if (tag.length >= 2) {
        metadata[tag[0]] = tag[1];
      }
    }
    return metadata;
  };

  const fetchEventsByFilter = useCallback(
    async (
      filter: NostrFilter,
      options: FetchFilterOptions = {}
    ): Promise<NostrEvent[]> => {
      if (!nostr) {
        throw new Error("Nostr pool not initialized");
      }

      const timeoutMs =
        options.timeoutMs === undefined ? 10000 : options.timeoutMs;

      let controller: AbortController | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let signal: AbortSignal | undefined = options.signal;

      if (!signal) {
        controller = new AbortController();
        signal = controller.signal;
        if (timeoutMs > 0) {
          timeout = setTimeout(() => controller?.abort(), timeoutMs);
        }
      }

      const streamWithReq = async (): Promise<NostrEvent[]> => {
        log.info("Streaming Nostr events via req", {
          filter,
          relays: options.relays,
        });
        const streamController = new AbortController();
        const streamSignal = streamController.signal;
        let streamTimeout: NodeJS.Timeout | null = null;
        if (timeoutMs > 0) {
          streamTimeout = setTimeout(() => streamController.abort(), timeoutMs);
        }

        const events: NostrEvent[] = [];

        try {
          for await (const msg of nostr.req([filter], {
            relays: options.relays,
            signal: streamSignal,
          })) {
            if (msg[0] === "EVENT" && msg[2]) {
              events.push(msg[2] as NostrEvent);
              if (filter.limit && events.length >= filter.limit) {
                break;
              }
            }
            if (msg[0] === "EOSE") {
              break;
            }
          }
        } catch (streamErr) {
          if (!streamSignal.aborted) {
            log.warn("Streaming fetch failed", streamErr);
          }
        } finally {
          if (streamTimeout) {
            clearTimeout(streamTimeout);
          }
        }

        log.info("Streamed Nostr events", {
          count: events.length,
          filter,
        });

        return events;
      };

      try {
        log.info("Executing Nostr filter", {
          filter,
          relays: options.relays,
          timeoutMs,
        });
        const events = await nostr.query([filter], {
          relays: options.relays,
          signal,
        });
        log.info("Nostr filter returned events", {
          count: events.length,
          filter,
        });

        if (events.length > 0 || filter.limit === 0) {
          return events;
        }

        log.info(
          "Nostr query returned empty result, falling back to streaming",
          {
            filter,
          }
        );
        return await streamWithReq();
      } catch (err) {
        if (signal?.aborted) {
          throw new Error("Nostr filter query aborted or timed out");
        }
        log.warn("Nostr query failed, attempting streaming fallback", err);
        return await streamWithReq();
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    },
    [nostr]
  );

  const fetchSubmission = useCallback(
    async (neventId: string): Promise<ParsedSubmission | null> => {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        const fetched = await fetchNeventWithCache({
          nostr,
          neventId,
          configuredRelays: DEFAULT_NOSTR_RELAYS,
        });
        const event = fetched.event;

        const metadata = extractMetadata(event);

        // Parse the submission data
        let submissionContent;
        try {
          // Check if content is already JSON
          submissionContent = JSON.parse(event.content);
        } catch {
          // If not JSON, use content directly and build from metadata
          submissionContent = {
            campaignTypeId: metadata.campaign || "",
            questId: parseInt(metadata.quest || "0"),
            userAddress: metadata.user || "",
            content: event.content,
            timestamp: parseInt(metadata.timestamp || "0"),
          };
        }

        const submission: ParsedSubmission = {
          campaignTypeId:
            submissionContent.campaignTypeId || metadata.campaign || "",
          questId: submissionContent.questId || parseInt(metadata.quest || "0"),
          userAddress: submissionContent.userAddress || metadata.user || "",
          content: submissionContent.content || event.content,
          timestamp:
            submissionContent.timestamp || parseInt(metadata.timestamp || "0"),
          eventId: event.id,
          author: event.pubkey,
          relays: fetched.advertisedRelays,
          created_at: event.created_at,
          metadata,
          event,
          source: fetched.source,
          sourceRelay: fetched.relay,
        };

        return submission;
      } catch (err) {
        setErrorCode(
          err instanceof NostrEventFetchError
            ? err.code
            : "relay_unavailable"
        );
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch submission";
        setError(errorMessage);
        if (err instanceof NostrEventFetchError) {
          log.warn(
            "Unable to fetch Nostr submission",
            toSafeNostrFetchDiagnostic(err),
          );
        } else {
          log.error("Unexpected error fetching submission:", err);
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [nostr]
  );

  const fetchEventWithNeventId = useCallback(
    async (neventId: string): Promise<NostrEvent | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchNeventWithCache({
          nostr,
          neventId,
          configuredRelays: DEFAULT_NOSTR_RELAYS,
        });
        return result.event;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to fetch event with neventId";
        setError(errorMessage);
        log.error("Error fetching event with neventId:", err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [nostr]
  );

  const fetchCommentsWithNostrCommentList = useCallback(
    async (nostrCommentList: NostrComment[]): Promise<Comment[] | null> => {
      if (!nostr) {
        setError("Nostr pool not initialized");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const comments = await Promise.all(
          nostrCommentList.map(async (nostrComment) => {
            const commentEvent = await fetchEventWithNeventId(
              nostrComment.neventId
            );
            if (!commentEvent) {
              throw new Error("Comment not found");
            }
            const comment: Comment = {
              neventId: nostrComment.neventId,
              eventId: commentEvent.id,
              author: nostrComment.senderAddress,
              content: commentEvent.content,
              timestamp: commentEvent.created_at.toString(),
              likes: 0,
              isLiked: false,
              link: `https://njump.me/${nostrComment.neventId}`,
              isTip: false,
              tipAmount: "0",
              tipTxHash: "",
            };

            return comment;
          })
        );

        return comments;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch submission";
        setError(errorMessage);
        log.error("Error fetching submission:", err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [nostr]
  );

  const delay = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  async function fetchReplaceableEvent(
    author: string,
    dTag: string
  ): Promise<NostrEvent | null> {
    if (!nostr) return null;
    const relayOrder = mergeRelayLists(DEFAULT_NOSTR_RELAYS);

    for (let attempt = 1; attempt <= DEFAULT_FETCH_ROUNDS; attempt++) {
      log.info(
        `Fetching event attempt ${attempt}/${DEFAULT_FETCH_ROUNDS} via ${relayOrder.length} relay(s)`
      );

      const requests = relayOrder.map(async (relayUrl) => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          DEFAULT_RELAY_TIMEOUT_MS
        );

        try {
          const events = await nostr.query(
            [
              {
                authors: [author],
                "#d": [dTag],
                kinds: [CKBOOST_SUBMISSION_KIND],
              },
            ],
            { relays: [relayUrl], signal: controller.signal }
          );

          const event = events
            .filter(
              (candidate) =>
                candidate.pubkey === author &&
                candidate.tags.some(
                  (tag) => tag[0] === "d" && tag[1] === dTag
                ) &&
                isValidCkboostEvent(
                  candidate,
                  candidate.id,
                  CKBOOST_SUBMISSION_KIND
                )
            )
            .sort((a, b) => b.created_at - a.created_at)[0];
          return event || null;
        } catch {
          log.warn("Replaceable event relay query failed", {
            relay: relayUrl,
            status: controller.signal.aborted ? "timeout" : "failed",
          });
          return null;
        } finally {
          clearTimeout(timeout);
        }
      });

      const result = await Promise.any(
        requests.map(async (request) => {
          const event = await request;
          if (!event) throw new Error("Event not found on relay");
          return event;
        })
      ).catch(() => null);

      if (result) return result;
      await Promise.all(requests);

      if (attempt < DEFAULT_FETCH_ROUNDS) {
        await delay(250);
      }
    }

    return null;
  }

  return {
    fetchSubmission,
    fetchEventsByFilter,
    fetchCommentsWithNostrCommentList,
    fetchEventWithNeventId,
    fetchReplaceableEvent,
    isLoading,
    error,
    errorCode,
  };
}
