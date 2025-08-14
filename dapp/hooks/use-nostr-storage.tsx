"use client";

import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { NSecSigner } from '@nostrify/nostrify';
import { NostrEvent } from '@nostrify/types';
import { nip19, generateSecretKey, getPublicKey, getEventHash } from 'nostr-tools';

// Custom kind for CKBoost quest submissions
const CKBOOST_SUBMISSION_KIND = 30078;

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
        throw new Error('Nostr not initialized');
      }

      // Generate ephemeral key for anonymous submission
      const secretKey = generateSecretKey();
      const pubkey = getPublicKey(secretKey);

      // Create the event
      const event: NostrEvent = {
        kind: CKBOOST_SUBMISSION_KIND,
        content: submission.content,
        tags: [
          ['d', `ckboost-submission-${submission.campaignTypeId}-${submission.questId}`],
          ['campaign', submission.campaignTypeId],
          ['quest', submission.questId.toString()],
          ['user', submission.userAddress],
          ['client', 'ckboost-dapp'],
          ['timestamp', (submission.timestamp || Date.now()).toString()],
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey,
        id: '',
        sig: ''
      };

      // Generate event hash - nostr-tools expects a slightly different type
      event.id = getEventHash(event as Parameters<typeof getEventHash>[0]);

      // Sign the event
      const signer = new NSecSigner(secretKey);
      const signedEvent = await signer.signEvent(event);

      // Publish event to relays
      console.log('Publishing event to Nostr relays...');
      console.log('Event ID:', signedEvent.id);
      console.log('Event kind:', signedEvent.kind);
      await nostr.event(signedEvent);
      console.log('Event sent to relays');

      // Verify the event was stored and is retrievable
      console.log('Verifying event storage...');
      let verified = false;
      let retries = 0;
      const maxRetries = 3;
      
      while (!verified && retries < maxRetries) {
        // Wait a bit for propagation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const verification = await nostr.query([{
            ids: [signedEvent.id],
            kinds: [CKBOOST_SUBMISSION_KIND],
          }]);
          
          if (verification.length > 0) {
            console.log(`✅ Event verified on Nostr! Found ${verification.length} copy/copies`);
            console.log('Event stored successfully with ID:', signedEvent.id);
            verified = true;
          } else {
            console.log(`⏳ Verification attempt ${retries + 1} failed, retrying...`);
            retries++;
          }
        } catch (err) {
          console.error('Verification error:', err);
          retries++;
        }
      }
      
      if (!verified) {
        throw new Error('Failed to verify event storage on Nostr. The submission was published but could not be retrieved. Please try again.');
      }

      // Return nevent ID for storage on-chain with updated reliable relays
      const neventId = nip19.neventEncode({
        id: signedEvent.id,
        relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'],
      });
      
      console.log(`Published and verified submission on Nostr: ${neventId}`);
      
      return neventId;
    },
  });

  /**
   * Retrieve submission from Nostr
   */
  const retrieveSubmission = useCallback(
    async (neventId: string) => {
      if (!nostr) {
        throw new Error('Nostr not initialized');
      }

      // Decode nevent to get event ID
      const decoded = nip19.decode(neventId);
      if (decoded.type !== 'nevent') {
        throw new Error('Invalid nevent ID');
      }
      
      // Query for the event
      const events = await nostr.query([{
        ids: [decoded.data.id],
        kinds: [CKBOOST_SUBMISSION_KIND],
      }]);

      if (events.length === 0) {
        throw new Error('Submission not found on Nostr');
      }

      const event = events[0];

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
      queryKey: ['nostr-submission', neventId],
      queryFn: () => retrieveSubmission(neventId!),
      enabled: !!neventId && !!nostr,
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
      if (!nostr) {
        throw new Error('Nostr not initialized');
      }

      // Decode all nevent IDs to get event IDs
      const eventIds: string[] = [];
      
      for (const neventId of neventIds) {
        try {
          const decoded = nip19.decode(neventId);
          if (decoded.type === 'nevent') {
            eventIds.push(decoded.data.id);
          }
        } catch (error) {
          console.warn(`Invalid nevent ID: ${neventId}`, error);
        }
      }

      if (eventIds.length === 0) {
        return [];
      }

      // Query all events at once
      const events = await nostr.query([{
        ids: eventIds,
        kinds: [CKBOOST_SUBMISSION_KIND],
      }]);

      // Map events back to results
      return neventIds.map(neventId => {
        try {
          const decoded = nip19.decode(neventId);
          if (decoded.type !== 'nevent') return null;
          
          const event = events.find((e: NostrEvent) => e.id === decoded.data.id);
          
          if (!event) return null;

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
      });
    },
    [nostr]
  );

  return {
    isConnected: !!nostr,
    storeSubmission,
    retrieveSubmission,
    checkSubmissionExists,
    useSubmission,
    retrieveMultipleSubmissions,
  };
}

/**
 * Hook to check if content is a Nostr reference
 */
export function useIsNostrReference() {
  return useCallback((content: string): boolean => {
    return content.startsWith('nevent1');
  }, []);
}