"use client";

import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNostr, DEFAULT_NOSTR_RELAYS } from "@/lib/providers/nostr-provider";
import { NSecSigner } from "@nostrify/nostrify";
import { NostrEvent } from "@nostrify/types";
import {
  generateSecretKey,
  getPublicKey,
  getEventHash,
} from "nostr-tools";
import { createScopedLogger } from "ssri-ckboost/logging";
import {
  CKBOOST_EVENT_KIND,
  DEFAULT_RELAY_QUORUM,
  DEFAULT_SOCIAL_RELAY_QUORUM,
  encodeVerifiedNevent,
  fetchEventFromRelays,
  type RelayAttemptResult,
  type StoredSubmissionEvent,
} from "@/lib/nostr/relay-core";
import { publishEventToConfiguredRelays } from "@/lib/nostr/browser-publish";
import { cacheNostrEvent } from "@/lib/nostr/event-cache";
import { enqueueUnverifiedRelayRepairs } from "@/lib/nostr/relay-repair-queue";
import { fetchNeventWithCache } from "@/lib/nostr/browser-fetch";

const log = createScopedLogger("useNostrStorage");

// Custom kind for CKBoost quest submissions
const CKBOOST_SUBMISSION_KIND = CKBOOST_EVENT_KIND;
const requiredRelayCopies = (() => {
  const configured = Number(process.env.NEXT_PUBLIC_NOSTR_MIN_RELAY_COPIES);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_RELAY_QUORUM;
})();
const requiredSocialRelayCopies = (() => {
  const configured = Number(
    process.env.NEXT_PUBLIC_NOSTR_SOCIAL_MIN_RELAY_COPIES,
  );
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_SOCIAL_RELAY_QUORUM;
})();

type SigningKeys = {
  secretKey: Uint8Array;
  pubkey: string;
};

const resolveSigningKeys = async (seed?: string): Promise<SigningKeys> => {
  let secretKey: Uint8Array;

  if (seed) {
    // Generate deterministic key from seed using SHA-256
    const encoder = new TextEncoder();
    const seedBytes = encoder.encode(seed);
    const hashBuffer = await crypto.subtle.digest("SHA-256", seedBytes);
    secretKey = new Uint8Array(hashBuffer);
  } else {
    // Generate random key if no seed provided
    secretKey = generateSecretKey();
  }

  return { secretKey, pubkey: getPublicKey(secretKey) };
};

interface SignedEventInput {
  content: string;
  tags?: string[][];
  kind?: number;
  createdAt?: number;
  seed?: string;
}

const createSignedEvent = async ({
  content,
  tags = [],
  kind = CKBOOST_SUBMISSION_KIND,
  createdAt,
  seed,
}: SignedEventInput) => {
  const signingKeys = await resolveSigningKeys(seed);
  const event: NostrEvent = {
    kind,
    content,
    tags,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    pubkey: signingKeys.pubkey,
    id: "",
    sig: "",
  };

  event.id = getEventHash(event as Parameters<typeof getEventHash>[0]);

  const signer = new NSecSigner(signingKeys.secretKey);
  const signedEvent = await signer.signEvent(event);

  return { signedEvent, signingKeys };
};

const persistLocalRelayState = ({
  event,
  verifiedRelays,
  attempts,
}: {
  event: NostrEvent;
  verifiedRelays: string[];
  attempts: RelayAttemptResult[];
}): string => {
  const neventId = encodeVerifiedNevent(event.id, verifiedRelays);
  cacheNostrEvent({ event, neventId, verifiedRelays });
  enqueueUnverifiedRelayRepairs({ event, neventId, attempts });
  return neventId;
};

/**
 * React hook for Nostr storage operations using @nostrify/react
 * Provides methods to store and retrieve quest submissions on Nostr
 */
export function useNostrStorage() {
  const { nostr } = useNostr();

  /**
   * Store submission on Nostr
   */
  const storeSubmission = useMutation({
    mutationFn: async (submission: {
      campaignTypeId: string;
      questId: number;
      userAddress: string;
      content: string;
      timestamp?: number;
    }) => {
      if (!nostr) {
        throw new Error("Nostr not initialized");
      }

      const submissionTimestamp = submission.timestamp || Date.now();

      const { signedEvent } = await createSignedEvent({
        content: submission.content,
        tags: [
          [
            "d",
            `ckboost-submission-${submission.campaignTypeId}-${submission.questId}`,
          ],
          ["campaign", submission.campaignTypeId],
          ["quest", submission.questId.toString()],
          ["user", submission.userAddress],
          ["client", "ckboost-dapp"],
          ["timestamp", submissionTimestamp.toString()],
        ],
      });

      // Publish event to relays
      log.info("Publishing event to Nostr relays...");
      log.info("Event ID:", signedEvent.id);
      log.info("Event kind:", signedEvent.kind);

      const { verifiedRelays, attempts } =
        await publishEventToConfiguredRelays({
          nostr,
          event: signedEvent,
          configuredRelays: DEFAULT_NOSTR_RELAYS,
          requiredCopies: requiredRelayCopies,
        });

      const neventId = persistLocalRelayState({
        event: signedEvent,
        verifiedRelays,
        attempts,
      });

      log.info("Published and verified submission on Nostr", {
        eventId: signedEvent.id,
        verifiedRelayCount: verifiedRelays.length,
      });

      return {
        neventId,
        event: signedEvent,
        verifiedRelays,
        attempts,
      } satisfies StoredSubmissionEvent;
    },
  });

  /**
   * Store campaign content on Nostr with verification
   */
  const storeCampaignContent = useMutation({
    mutationFn: async (payload: {
      campaignTypeId: string;
      contentType: "cover_image" | "long_description" | "quest_content";
      content: string;
      metadata?: Record<string, string>;
    }) => {
      if (!nostr) {
        throw new Error("Nostr not initialized");
      }

      const timestamp = Date.now();

      const tags: string[][] = [
        [
          "d",
          `ckboost-campaign-${payload.campaignTypeId}-${payload.contentType}-${timestamp}`,
        ],
        ["campaign", payload.campaignTypeId],
        ["type", payload.contentType],
        ["client", "ckboost-dapp"],
        ["timestamp", timestamp.toString()],
      ];

      if (payload.metadata) {
        for (const [key, value] of Object.entries(payload.metadata)) {
          tags.push([`meta-${key}`, value]);
        }
      }

      const { signedEvent } = await createSignedEvent({
        content: payload.content,
        tags,
      });

      log.info("Publishing event to Nostr relays...");
      log.info("Event ID:", signedEvent.id);
      log.info("Event kind:", signedEvent.kind);

      const { verifiedRelays, attempts } =
        await publishEventToConfiguredRelays({
          nostr,
          event: signedEvent,
          configuredRelays: DEFAULT_NOSTR_RELAYS,
          requiredCopies: requiredRelayCopies,
        });

      return persistLocalRelayState({
        event: signedEvent,
        verifiedRelays,
        attempts,
      });
    },
  });

  const storeAchievementMetadata = useMutation({
    mutationFn: async (payload: {
      achievementId: string;
      title: string;
      content: string;
      metadata?: Record<string, string>;
    }) => {
      if (!nostr) {
        throw new Error("Nostr not initialized");
      }

      const timestamp = Date.now();

      const tags: string[][] = [
        ["d", `ckboost-achievement-${payload.achievementId}-${timestamp}`],
        ["achievement_id", payload.achievementId],
        ["title", payload.title],
        ["type", "achievement_metadata"],
        ["client", "ckboost-dapp"],
        ["timestamp", timestamp.toString()],
      ];

      if (payload.metadata) {
        for (const [key, value] of Object.entries(payload.metadata)) {
          tags.push([`meta-${key}`, value]);
        }
      }

      const { signedEvent } = await createSignedEvent({
        content: payload.content,
        tags,
      });

      const { verifiedRelays, attempts } =
        await publishEventToConfiguredRelays({
          nostr,
          event: signedEvent,
          configuredRelays: DEFAULT_NOSTR_RELAYS,
          requiredCopies: requiredRelayCopies,
        });

      return persistLocalRelayState({
        event: signedEvent,
        verifiedRelays,
        attempts,
      });
    },
  });

  const storeEvent = useMutation({
    mutationFn: async (payload: {
      content: string;
      tags?: string[][];
      metadata?: Record<string, string>;
      kind?: number;
      createdAt?: number;
      seed?: string;
    }) => {
      if (!nostr) {
        throw new Error("Nostr not initialized");
      }

      const tags: string[][] = payload.tags ? [...payload.tags] : [];
      if (payload.metadata) {
        for (const [key, value] of Object.entries(payload.metadata)) {
          tags.push([`meta-${key}`, value]);
        }
      }

      const { signedEvent, signingKeys } = await createSignedEvent({
        content: payload.content,
        tags,
        kind: payload.kind,
        createdAt: payload.createdAt,
        seed: payload.seed,
      });

      log.info("Publishing event to Nostr relays...", {
        kind: signedEvent.kind,
        author: signingKeys.pubkey,
      });

      const { verifiedRelays, attempts } =
        await publishEventToConfiguredRelays({
          nostr,
          event: signedEvent,
          configuredRelays: DEFAULT_NOSTR_RELAYS,
          requiredCopies: requiredSocialRelayCopies,
        });

      const neventId = persistLocalRelayState({
        event: signedEvent,
        verifiedRelays,
        attempts,
      });

      return {
        neventId,
        author: signingKeys.pubkey,
        relays: verifiedRelays,
        attempts,
      };
    },
  });

  /**
   * Retrieve submission from Nostr
   */
  const retrieveSubmission = useCallback(
    async (neventId: string) => {
      const result = await fetchNeventWithCache({
        nostr,
        neventId,
        configuredRelays: DEFAULT_NOSTR_RELAYS,
      });
      const event = result.event;

      // Extract metadata from tags
      const metadata: Record<string, string> = {};
      for (const tag of event.tags) {
        if (tag.length >= 2) {
          metadata[tag[0]] = tag[1];
        }
      }

      return {
        content: event.content,
        metadata,
        event,
      };
    },
    [nostr]
  );

  /**
   * Check if submission exists
   */
  const checkSubmissionExists = useCallback(
    async (neventId: string): Promise<boolean> => {
      try {
        await retrieveSubmission(neventId);
        return true;
      } catch {
        return false;
      }
    },
    [retrieveSubmission]
  );

  /**
   * Use React Query to fetch submission with caching
   */
  const useSubmission = (neventId: string | undefined) => {
    return useQuery({
      queryKey: ["nostr-submission", neventId],
      queryFn: () => retrieveSubmission(neventId!),
      enabled: !!neventId,
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      retry: 3,
    });
  };

  /**
   * Batch retrieve multiple submissions
   */
  const retrieveMultipleSubmissions = useCallback(
    async (neventIds: string[]) => {
      return Promise.all(
        neventIds.map(async (neventId) => {
          try {
            const result = await fetchNeventWithCache({
              nostr,
              neventId,
              configuredRelays: DEFAULT_NOSTR_RELAYS,
            });
            const event = result.event;

            const metadata: Record<string, string> = {};
            for (const tag of event.tags) {
              if (tag.length >= 2) {
                metadata[tag[0]] = tag[1];
              }
            }

            return {
              neventId,
              content: event.content,
              metadata,
              event,
            };
          } catch {
            return null;
          }
        })
      );
    },
    [nostr]
  );

  /**
   * Fetch a replaceable event by its "d" tag parameter
   */
  const fetchReplaceableEvent = useCallback(
    async (dTag: string, kind: number = 30078): Promise<NostrEvent | null> => {
      if (!nostr) {
        throw new Error("Nostr not initialized");
      }

      try {
        const events = await nostr.query([
          {
            kinds: [kind],
            "#d": [dTag],
            limit: 1,
          },
        ]);

        if (events.length === 0) {
          return null;
        }

        // For replaceable events, return the latest one (they should be sorted by created_at)
        return events.sort((a, b) => b.created_at - a.created_at)[0];
      } catch (error) {
        log.error("Failed to fetch replaceable event", { dTag, kind, error });
        throw error;
      }
    },
    [nostr]
  );

  /**
   * Fetch an event by its eventId
   */
  const fetchEventById = useCallback(
    async (eventId: string, kind?: number): Promise<NostrEvent | null> => {
      if (!nostr) {
        throw new Error("Nostr not initialized");
      }

      try {
        const result = await fetchEventFromRelays({
          nostr,
          eventId,
          relays: DEFAULT_NOSTR_RELAYS,
          kind: kind ?? CKBOOST_SUBMISSION_KIND,
        });
        return result.event;
      } catch (error) {
        log.error("Failed to fetch event by ID", { eventId, kind, error });
        throw error;
      }
    },
    [nostr]
  );

  return {
    isConnected: !!nostr,
    requiredRelayCopies,
    storeSubmission,
    storeCampaignContent,
    storeAchievementMetadata,
    storeEvent,
    retrieveSubmission,
    checkSubmissionExists,
    useSubmission,
    retrieveMultipleSubmissions,
    fetchReplaceableEvent,
    fetchEventById,
  };
}

/**
 * Hook to check if content is a Nostr reference
 */
export function useIsNostrReference() {
  return useCallback((content: string): boolean => {
    return content.startsWith("nevent1");
  }, []);
}
