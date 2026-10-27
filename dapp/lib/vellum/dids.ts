import { ccc } from "@ckb-ccc/core";
import { listDidCkbsByLock } from "@ckb-ccc/did-ckb";

export type ControllerLock = {
  args: string;
  codeHash: string;
  hashType: "data" | "data1" | "data2" | "type";
};

export type ControlledDid = {
  did: string;
  displayName?: string;
};

export function displayNameFromDocument(document: unknown): string | undefined {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return undefined;
  }
  const services = (document as Record<string, unknown>).services;
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    return undefined;
  }
  const profile = (services as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return undefined;
  }
  const entry = profile as Record<string, unknown>;
  if (entry.type !== "VellumProfile" || typeof entry.displayName !== "string") {
    return undefined;
  }
  const displayName = entry.displayName.trim();
  return displayName || undefined;
}

export async function listControlledDids(
  lock: ControllerLock,
): Promise<ControlledDid[]> {
  const network = process.env.NEXT_PUBLIC_CKB_NETWORK ?? "testnet";
  if (network !== "testnet") {
    throw new Error("Portable quest claims are available on CKB Testnet only.");
  }
  const client = new ccc.ClientPublicTestnet({
    url: process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev",
    fallbacks: [],
    timeout: 10_000,
  });
  const records = await listDidCkbsByLock({
    client,
    lock: ccc.Script.from(lock),
  });
  return records
    .map(({ data, did }) => ({
      did,
      displayName: displayNameFromDocument(data.value.document),
    }))
    .sort((left, right) => left.did.localeCompare(right.did));
}

export function formatDid(did: string): string {
  const prefix = "did:ckb:";
  const identifier = did.startsWith(prefix) ? did.slice(prefix.length) : did;
  if (identifier.length <= 18) return did;
  return `${did.startsWith(prefix) ? prefix : ""}${identifier.slice(0, 8)}…${identifier.slice(-6)}`;
}
