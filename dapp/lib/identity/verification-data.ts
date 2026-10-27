import { ccc } from "@ckb-ccc/core";

import type {
  DidVerificationData,
  TelegramVerificationData,
  VerificationData,
  VerificationDataEntries,
  VerificationSource,
} from "@/lib/types/identity";

const DID_CKB_PATTERN = /^did:ckb:[a-z2-7]{32}$/;
const VERIFICATION_SOURCES = new Set<VerificationSource>([
  "telegram",
  "twitter",
  "discord",
  "reddit",
  "kyc",
  "did",
  "manual",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const decodeStoredValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.entries)) return value.entries;

  let json: string | null = null;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      json = value.startsWith("0x")
        ? ccc.bytesTo(ccc.bytesFrom(value), "utf8")
        : value;
    } catch {
      return [];
    }
  } else if (value && typeof value === "object") {
    try {
      json = ccc.bytesTo(ccc.bytesFrom(value as ccc.BytesLike), "utf8");
    } catch {
      return [];
    }
  }

  if (!json?.trim()) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
};

const isVerificationEntry = (
  value: unknown,
): value is VerificationDataEntries => {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  return (
    typeof value.source === "string" &&
    VERIFICATION_SOURCES.has(value.source as VerificationSource)
  );
};

export const isDidCkb = (value: string): boolean => DID_CKB_PATTERN.test(value);

export function decodeVerificationEntries(
  value: unknown,
): VerificationDataEntries[] {
  const decoded = decodeStoredValue(value);
  if (!Array.isArray(decoded)) return [];
  return decoded.filter(isVerificationEntry);
}

export function upsertVerificationEntry(
  entries: VerificationDataEntries[],
  entry: VerificationDataEntries,
): VerificationDataEntries[] {
  return [...entries.filter(({ source }) => source !== entry.source), entry];
}

export function hasMatchingVerificationEntry(
  value: unknown,
  entry: VerificationDataEntries,
): boolean {
  return decodeVerificationEntries(value).some(
    (candidate) =>
      candidate.source === entry.source &&
      JSON.stringify(candidate.data) === JSON.stringify(entry.data),
  );
}

export function getVerificationEntry<T extends VerificationData>(
  value: unknown,
  source: VerificationSource,
): T | undefined {
  return decodeVerificationEntries(value).find(
    (entry) => entry.source === source,
  )?.data as T | undefined;
}

export function normalizeDidVerificationData(
  value: unknown,
): DidVerificationData | null {
  if (!isRecord(value) || typeof value.did !== "string") return null;
  const did = value.did.trim();
  if (!isDidCkb(did)) return null;

  if (
    value.displayName !== undefined &&
    typeof value.displayName !== "string"
  ) {
    return null;
  }
  const displayName = value.displayName?.trim();
  return displayName ? { did, displayName } : { did };
}

export function getDidVerificationData(
  value: unknown,
): DidVerificationData | undefined {
  const entry = getVerificationEntry<DidVerificationData>(value, "did");
  return entry ? (normalizeDidVerificationData(entry) ?? undefined) : undefined;
}

export function getTelegramVerificationData(
  value: unknown,
): TelegramVerificationData | undefined {
  const entry = getVerificationEntry<TelegramVerificationData>(
    value,
    "telegram",
  );
  if (
    !entry ||
    (typeof entry.id !== "string" && typeof entry.id !== "number")
  ) {
    return undefined;
  }
  return entry;
}

export function isTelegramBindingConsistent(
  value: unknown,
  chatId: unknown,
): boolean {
  const entry = getTelegramVerificationData(value);
  let normalizedChatId: bigint;
  try {
    normalizedChatId = BigInt(chatId as string | number | bigint);
  } catch {
    return false;
  }

  if (!entry) return normalizedChatId === 0n;
  try {
    return normalizedChatId > 0n && BigInt(entry.id) === normalizedChatId;
  } catch {
    return false;
  }
}

export function deriveVerificationFlags(value: unknown): number {
  const flags: Record<VerificationSource, number> = {
    telegram: 1,
    kyc: 2,
    did: 4,
    manual: 8,
    twitter: 16,
    discord: 32,
    reddit: 64,
  };
  return decodeVerificationEntries(value).reduce(
    (result, { source }) => result | flags[source],
    0,
  );
}
