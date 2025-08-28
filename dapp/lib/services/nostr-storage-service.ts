import { NSecSigner } from '@nostrify/nostrify';
import { NostrEvent } from '@nostrify/types';
import { nip19, getEventHash, generateSecretKey, getPublicKey } from 'nostr-tools';

// Default public Nostr relays (free to use)
const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.nostr.band",
  "wss://purplerelay.com", 
  "wss://relay.nostr.net",
  "wss://relay.damus.io",
];

// Custom kind for CKBoost quest submissions (parameterized replaceable event)
const CKBOOST_SUBMISSION_KIND = 30078;

export class NostrStorageService {
  private relays: string[];

  constructor(relays: string[] = DEFAULT_NOSTR_RELAYS) {
    this.relays = relays;
  }

  /**
   * Store quest submission data on Nostr
   * This is FREE and doesn't require any authentication
   */
  async storeSubmission(submission: {
    campaignTypeId: string;
    questId: number;
    userAddress: string;
    content: string; // HTML content with base64 images or URLs
    timestamp: number;
  }): Promise<string> {
    // Generate a random private key for anonymous submission
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    
    // Create the event manually
    const event: NostrEvent = {
      kind: CKBOOST_SUBMISSION_KIND,
      content: submission.content,
      tags: [
        ["d", `ckboost-submission-${submission.campaignTypeId}-${submission.questId}`], // Unique identifier
        ["campaign", submission.campaignTypeId],
        ["quest", submission.questId.toString()],
        ["user", submission.userAddress],
        ["client", "ckboost-dapp"],
        ["timestamp", submission.timestamp.toString()],
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey,
      id: '',
      sig: ''
    };

    // Generate event hash - nostr-tools expects a slightly different type
    event.id = getEventHash(event as Parameters<typeof getEventHash>[0]);
    
    // Sign using NSecSigner from nostrify
    const signer = new NSecSigner(secretKey);
    const signedEvent = await signer.signEvent(event);

    // Store the event and get nevent ID using nostr-tools nip19
    const neventId = nip19.neventEncode({
      id: signedEvent.id,
      relays: this.relays.slice(0, 3),
    });
    
    console.log(`Storing submission with nevent ID: ${neventId}`);
    
    // Note: Actual relay publishing would be handled by the React hook
    // This service just prepares the event
    
    return neventId;
  }

  /**
   * Parse a nevent ID to get the event data
   */
  parseNeventId(neventId: string): { 
    id: string; 
    relays?: string[];
  } | null {
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
  }

  /**
   * Create an event filter for retrieving submissions
   */
  createSubmissionFilter(eventId: string) {
    return {
      ids: [eventId],
      kinds: [CKBOOST_SUBMISSION_KIND],
    };
  }

  /**
   * Extract metadata from a Nostr event
   */
  extractMetadata(event: NostrEvent): Record<string, string> {
    const metadata: Record<string, string> = {};
    for (const tag of event.tags) {
      if (tag.length >= 2) {
        metadata[tag[0]] = tag[1];
      }
    }
    return metadata;
  }

  /**
   * Check if content is a Nostr reference
   */
  isNostrReference(content: string): boolean {
    return content.startsWith('nevent1');
  }

  /**
   * Get relay recommendations
   */
  getRelays(): string[] {
    return this.relays;
  }

  /**
   * Fetch a submission from Nostr using nevent ID
   * Returns the parsed submission data
   */
  async fetchSubmission(neventId: string): Promise<{
    id: string;
    content: string;
    author: string;
    created_at: number;
    relays: string[];
  } | null> {
    // Parse the nevent ID
    const parsed = this.parseNeventId(neventId);
    if (!parsed) {
      throw new Error('Invalid nevent ID format');
    }

    // Use the relays from nevent or default relays
    const relays = parsed.relays?.length ? parsed.relays : this.relays;
    
    // Try to fetch from multiple relays
    const fetchPromises = relays.map(relay => this.fetchFromRelay(relay, parsed.id));
    
    try {
      // Race all relay connections - return first successful response
      const result = await Promise.race(fetchPromises);
      if (result) {
        return {
          ...result,
          relays: relays
        };
      }
    } catch (error) {
      console.error('Failed to fetch from any relay:', error);
    }
    
    return null;
  }

  /**
   * Fetch event from a specific relay
   */
  private async fetchFromRelay(relayUrl: string, eventId: string): Promise<{
    id: string;
    content: string;
    author: string;
    created_at: number;
  } | null> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl);
      let timeout: NodeJS.Timeout;
      
      ws.onopen = () => {
        // Send REQ subscription to fetch the specific event
        const subscriptionId = Math.random().toString(36).substring(7);
        const request = JSON.stringify([
          "REQ",
          subscriptionId,
          {
            ids: [eventId],
            kinds: [CKBOOST_SUBMISSION_KIND]
          }
        ]);
        ws.send(request);
        
        // Set timeout for response
        timeout = setTimeout(() => {
          ws.close();
          resolve(null);
        }, 5000); // 5 second timeout
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle EVENT message
          if (message[0] === "EVENT" && message[2]) {
            clearTimeout(timeout);
            const nostrEvent = message[2];
            
            // Extract the submission data from tags
            const metadata = this.extractMetadata(nostrEvent);
            
            // Build the content JSON from event content and tags
            const submissionData = {
              campaignTypeId: metadata.campaign || '',
              questId: parseInt(metadata.quest || '0'),
              userAddress: metadata.user || '',
              content: nostrEvent.content,
              timestamp: parseInt(metadata.timestamp || '0')
            };
            
            ws.close();
            resolve({
              id: nostrEvent.id,
              content: JSON.stringify(submissionData),
              author: nostrEvent.pubkey,
              created_at: nostrEvent.created_at
            });
          }
          
          // Handle EOSE (End of Stored Events)
          if (message[0] === "EOSE") {
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        } catch (error) {
          console.error('Error parsing message from relay:', error);
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error(`WebSocket error for ${relayUrl}:`, error);
        reject(error);
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
      };
    });
  }
}