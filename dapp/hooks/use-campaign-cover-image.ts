"use client";

import { useEffect, useState } from "react";
import { useNostrFetch } from "@/hooks/use-nostr-fetch";
import { createScopedLogger } from "ssri-ckboost/logging";

const log = createScopedLogger("useCampaignCoverImage");

const COVER_IMAGE_CACHE = new Map<string, string>();

const isNeventReference = (value?: string | null): value is string =>
  Boolean(value && value.startsWith("nevent1"));

export function useCampaignCoverImage(rawSource?: string | null) {
  const { fetchSubmission } = useNostrFetch();
  const [resolvedSource, setResolvedSource] = useState<string | null>(() => {
    if (!rawSource) return null;
    if (isNeventReference(rawSource)) {
      return COVER_IMAGE_CACHE.get(rawSource) ?? null;
    }
    return rawSource;
  });
  const [isLoading, setIsLoading] = useState(
    Boolean(
      rawSource &&
        isNeventReference(rawSource) &&
        !COVER_IMAGE_CACHE.has(rawSource)
    )
  );

  useEffect(() => {
    if (!rawSource) {
      setResolvedSource(null);
      setIsLoading(false);
      return;
    }

    if (!isNeventReference(rawSource)) {
      setResolvedSource(rawSource);
      setIsLoading(false);
      return;
    }

    const cached = COVER_IMAGE_CACHE.get(rawSource);
    if (cached) {
      setResolvedSource(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetchSubmission(rawSource)
      .then((result) => {
        if (cancelled) return;
        if (result?.content) {
          COVER_IMAGE_CACHE.set(rawSource, result.content);
          setResolvedSource(result.content);
        } else {
          log.warn("Cover image content missing for nevent", {
            neventId: rawSource,
          });
          setResolvedSource(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          log.error("Failed to fetch cover image via Nostr", {
            error,
            neventId: rawSource,
          });
          setResolvedSource(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rawSource, fetchSubmission]);

  return {
    src: resolvedSource,
    isLoading,
  };
}
