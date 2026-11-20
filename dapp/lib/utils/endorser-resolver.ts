import { ccc } from "@ckb-ccc/connector-react";
import type { EndorserInfoLike } from "ssri-ckboost/types";
import { createScopedLogger } from "ssri-ckboost/logging";

const log = createScopedLogger("EndorserResolver");

export type ResolvedEndorser = {
  lockHash: string;
  name: string;
  description: string;
  website: string | null;
  socialLinks: string[];
  verified: boolean;
  raw: EndorserInfoLike;
};

export type EndorserResolver = {
  resolve: (
    lockHash: string | null | undefined
  ) => ResolvedEndorser | undefined;
  list: () => ResolvedEndorser[];
  has: (lockHash: string | null | undefined) => boolean;
};

const EMPTY_RESOLVER: EndorserResolver = {
  resolve: () => undefined,
  list: () => [],
  has: () => false,
};

export const normalizeEndorserLockHash = (
  value: unknown
): string | null => {
  if (!value) {
    return null;
  }

  try {
    if (typeof value === "string") {
      return value.trim().toLowerCase();
    }

    if (value instanceof Uint8Array) {
      return ccc.hexFrom(value).toLowerCase();
    }

    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      const bytes = new Uint8Array(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
      );
      return ccc.hexFrom(bytes).toLowerCase();
    }

    if (value instanceof ArrayBuffer) {
      return ccc.hexFrom(new Uint8Array(value)).toLowerCase();
    }

    return ccc.hexFrom(ccc.bytesFrom(value as ccc.BytesLike)).toLowerCase();
  } catch (error) {
    log.warn("Failed to normalise endorser lock hash", { value, error });
    return null;
  }
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "bigint") return value > 0n;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 0;
    }
  }
  try {
    const numeric = ccc.numFrom(value as ccc.NumLike);
    if (typeof numeric === "number") return numeric > 0;
    if (typeof numeric === "bigint") return numeric > 0n;
  } catch {
    // ignore
  }
  return false;
};

export const createEndorserResolver = (
  endorsers: readonly EndorserInfoLike[] | null | undefined
): EndorserResolver => {
  if (!endorsers || endorsers.length === 0) {
    return EMPTY_RESOLVER;
  }

  const map = new Map<string, ResolvedEndorser>();

  endorsers.forEach((endorser, index) => {
    const lockHash = normalizeEndorserLockHash(endorser.endorser_lock_hash);
    if (!lockHash) {
      log.warn("Skipping endorser with invalid lock hash", { index });
      return;
    }

    if (map.has(lockHash)) {
      log.warn("Duplicate endorser lock hash detected", {
        lockHash,
        index,
      });
    }

    const name =
      typeof endorser.endorser_name === "string"
        ? endorser.endorser_name.trim() || "Unnamed Endorser"
        : "Unnamed Endorser";

    const description =
      typeof endorser.endorser_description === "string"
        ? endorser.endorser_description.trim()
        : "";

    const website =
      typeof (endorser as { website?: unknown }).website === "string"
        ? ((endorser as { website?: string }).website ?? "").trim() || null
        : null;

    const socialLinks =
      Array.isArray(
        (endorser as { social_links?: unknown }).social_links
      ) &&
      (endorser as { social_links: unknown[] }).social_links.every(
        (link) => typeof link === "string"
      )
        ? ((endorser as { social_links: string[] }).social_links || []).map(
            (link) => link.trim()
          )
        : [];

    const verified = toBoolean((endorser as { verified?: unknown }).verified);

    map.set(lockHash, {
      lockHash,
      name,
      description,
      website,
      socialLinks,
      verified,
      raw: endorser,
    });
  });

  return {
    resolve: (lockHash: string | null | undefined) => {
      if (!lockHash) return undefined;
      return map.get(lockHash.trim().toLowerCase());
    },
    list: () => Array.from(map.values()),
    has: (lockHash: string | null | undefined) => {
      if (!lockHash) return false;
      return map.has(lockHash.trim().toLowerCase());
    },
  };
};
