// Discriminated union for verification payloads.
// Every variant has a `source` field which acts as the discriminator.

export type VerificationSource =
  | "telegram"
  | "twitter"
  | "discord"
  | "reddit"
  | "kyc"
  | "did"
  | "manual";

interface VerificationDataEntries {
  source: VerificationSource;
  data: VerificationData;
}

// Telegram
export interface TelegramVerificationData{
  // Canonical fields
  id: string | number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  authDate?: string | number;
  hash: string;
}

// Twitter
export interface TwitterVerificationData {
  username: string;
  userId?: string;
  proofUrl?: string;
}

// Discord
export interface DiscordVerificationData {
  username: string;
  userId?: string;
  proofUrl?: string;
}

// Reddit
export interface RedditVerificationData {
  username: string;
  userId?: string;
  proofUrl?: string;
}

// KYC
export interface KycVerificationData {
  provider: string; // e.g. "sumsub", "persona"
  sessionId?: string;
  referenceId?: string;
  status?: "pending" | "approved" | "rejected";
}

// DID
export interface DidVerificationData {
  did: string;
  credentialJWT?: string;
  issuer?: string;
  verifiedAt?: number; // epoch seconds
}

// Manual review
export interface ManualVerificationData {
  applicationText: string;
  attachments?: string[]; // URLs or ids
}

// Union of all verification data types
export type VerificationData =
  | TelegramVerificationData
  | TwitterVerificationData
  | DiscordVerificationData
  | RedditVerificationData
  | KycVerificationData
  | DidVerificationData
  | ManualVerificationData;

