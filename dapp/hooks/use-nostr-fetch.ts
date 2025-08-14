"use client";

import { useState, useCallback } from 'react';
import { useNostr } from '@/lib/providers/nostr-provider';
import { NostrEvent, NostrFilter } from '@nostrify/types';
import { nip19 } from 'nostr-tools';

// Custom kind for CKBoost quest submissions
const CKBOOST_SUBMISSION_KIND = 30078;

interface ParsedSubmission {
  campaignTypeHash: string;
  questId: number;
  userAddress: string;
  content: string;
  timestamp: number;
  eventId: string;
  author: string;
  relays: string[];
  created_at: number;
}

export function useNostrFetch() {
  const { nostr } = useNostr();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseNeventId = (neventId: string): { id: string; relays?: string[] } | null => {
    try {
      const decoded = nip19.decode(neventId);
      if (decoded.type === 'nevent') {
        return {
          id: decoded.data.id,
          relays: decoded.data.relays,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to decode nevent:', error);
      return null;
    }
  };

  const extractMetadata = (event: NostrEvent): Record<string, string> => {
    const metadata: Record<string, string> = {};
    for (const tag of event.tags) {
      if (tag.length >= 2) {
        metadata[tag[0]] = tag[1];
      }
    }
    return metadata;
  };

  const fetchSubmission = useCallback(async (neventId: string): Promise<ParsedSubmission | null> => {
    if (!nostr) {
      setError('Nostr pool not initialized');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Parse the nevent ID
      const parsed = parseNeventId(neventId);
      if (!parsed) {
        throw new Error('Invalid nevent ID format');
      }

      // Create filter for the specific event
      const filter: NostrFilter = {
        ids: [parsed.id],
        kinds: [CKBOOST_SUBMISSION_KIND],
      };

      // Query the pool for the event
      const events: NostrEvent[] = [];
      
      // Use the pool to query for events with timeout
      const timeoutPromise = new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000)
      );
      
      const fetchPromise = (async () => {
        try {
          console.log('Querying Nostr relays for event:', parsed.id);
          for await (const msg of nostr.req([filter])) {
            console.log('Received message type:', msg[0]);
            if (msg[0] === 'EVENT') {
              const event = msg[2];
              console.log('Found event:', event.id);
              events.push(event);
              break; // We only need one event
            }
            if (msg[0] === 'EOSE') {
              console.log('End of stored events reached');
              break; // End of stored events
            }
          }
        } catch (err) {
          console.error('Error in Nostr query:', err);
          throw err;
        }
      })();
      
      // Wait for either fetch to complete or timeout
      try {
        await Promise.race([fetchPromise, timeoutPromise]);
      } catch (err) {
        console.error('Failed to fetch from relays:', err);
        // Try without timeout as fallback
        if (err instanceof Error && err.message.includes('timeout')) {
          console.log('Retrying without timeout...');
          // Give it one more try with longer timeout
          await Promise.race([
            fetchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Final timeout')), 5000))
          ]).catch(() => {});
        }
      }

      if (events.length === 0) {
        throw new Error('Event not found on any relay');
      }

      const event = events[0];
      const metadata = extractMetadata(event);

      // Parse the submission data
      let submissionContent;
      try {
        // Check if content is already JSON
        submissionContent = JSON.parse(event.content);
      } catch {
        // If not JSON, use content directly and build from metadata
        submissionContent = {
          campaignTypeHash: metadata.campaign || '',
          questId: parseInt(metadata.quest || '0'),
          userAddress: metadata.user || '',
          content: event.content,
          timestamp: parseInt(metadata.timestamp || '0')
        };
      }

      const submission: ParsedSubmission = {
        campaignTypeHash: submissionContent.campaignTypeHash || metadata.campaign || '',
        questId: submissionContent.questId || parseInt(metadata.quest || '0'),
        userAddress: submissionContent.userAddress || metadata.user || '',
        content: submissionContent.content || event.content,
        timestamp: submissionContent.timestamp || parseInt(metadata.timestamp || '0'),
        eventId: event.id,
        author: event.pubkey,
        relays: parsed.relays || [],
        created_at: event.created_at
      };

      return submission;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch submission';
      setError(errorMessage);
      console.error('Error fetching submission:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [nostr]);

  return {
    fetchSubmission,
    isLoading,
    error
  };
}