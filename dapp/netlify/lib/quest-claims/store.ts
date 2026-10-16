import { createHash } from "node:crypto";

import { getStore, type Store } from "@netlify/blobs";

import type { CkboostQuestClaimPayload } from "./schema";

export type ClaimIssuanceRecord = {
  claimId?: string;
  completionKey: string;
  expiresAt?: number;
  leaseToken: string;
  outputIndex?: number;
  payload: CkboostQuestClaimPayload;
  signedTransaction?: string;
  status: "confirmed" | "prepared" | "preparing" | "submitted";
  subjectDid: string;
  transactionHash?: string;
  updatedAt: number;
  version: 1;
};

export type IssuerLeaseRecord = {
  expiresAt: number;
  token: string;
  transactionHash?: string;
  updatedAt: number;
  version: 1;
};

export type StoredValue<T> = {
  etag: string;
  value: T;
};

export interface QuestClaimStore {
  createClaim(record: ClaimIssuanceRecord): Promise<boolean>;
  createLease(record: IssuerLeaseRecord): Promise<boolean>;
  getClaim(
    completionKey: string,
  ): Promise<StoredValue<ClaimIssuanceRecord> | null>;
  getLease(): Promise<StoredValue<IssuerLeaseRecord> | null>;
  updateClaim(
    completionKey: string,
    etag: string,
    record: ClaimIssuanceRecord,
  ): Promise<boolean>;
  updateLease(etag: string, record: IssuerLeaseRecord): Promise<boolean>;
}

const STORE_NAME = "ckboost-vellum-quest-claims";
const ISSUER_LEASE_KEY = "coordination/issuer";

function completionPath(completionKey: string): string {
  const digest = createHash("sha256")
    .update(completionKey, "utf8")
    .digest("hex");
  return `completions/${digest}`;
}

async function read<T>(
  store: Store,
  key: string,
): Promise<StoredValue<T> | null> {
  const result = await store.getWithMetadata(key, {
    consistency: "strong",
    type: "json",
  });
  if (!result) return null;
  if (!result.etag) {
    throw new Error("Quest claim coordination record is missing an ETag.");
  }
  return { etag: result.etag, value: result.data as T };
}

export class NetlifyQuestClaimStore implements QuestClaimStore {
  private readonly store: Store;

  constructor(
    store: Store = getStore({ name: STORE_NAME, consistency: "strong" }),
  ) {
    this.store = store;
  }

  getClaim(
    completionKey: string,
  ): Promise<StoredValue<ClaimIssuanceRecord> | null> {
    return read(this.store, completionPath(completionKey));
  }

  getLease(): Promise<StoredValue<IssuerLeaseRecord> | null> {
    return read(this.store, ISSUER_LEASE_KEY);
  }

  async createClaim(record: ClaimIssuanceRecord): Promise<boolean> {
    const result = await this.store.setJSON(
      completionPath(record.completionKey),
      record,
      {
        onlyIfNew: true,
      },
    );
    return result.modified;
  }

  async updateClaim(
    completionKey: string,
    etag: string,
    record: ClaimIssuanceRecord,
  ): Promise<boolean> {
    const result = await this.store.setJSON(
      completionPath(completionKey),
      record,
      {
        onlyIfMatch: etag,
      },
    );
    return result.modified;
  }

  async createLease(record: IssuerLeaseRecord): Promise<boolean> {
    const result = await this.store.setJSON(ISSUER_LEASE_KEY, record, {
      onlyIfNew: true,
    });
    return result.modified;
  }

  async updateLease(etag: string, record: IssuerLeaseRecord): Promise<boolean> {
    const result = await this.store.setJSON(ISSUER_LEASE_KEY, record, {
      onlyIfMatch: etag,
    });
    return result.modified;
  }
}
