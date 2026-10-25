import type {
  ClaimIssuanceRecord,
  IssuerLeaseRecord,
  QuestClaimStore,
  StoredValue,
} from "./store";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryQuestClaimStore implements QuestClaimStore {
  private claimVersion = 0;
  private readonly claims = new Map<string, StoredValue<ClaimIssuanceRecord>>();
  private lease: StoredValue<IssuerLeaseRecord> | null = null;
  private leaseVersion = 0;

  async getClaim(
    completionKey: string,
  ): Promise<StoredValue<ClaimIssuanceRecord> | null> {
    return this.claims.get(completionKey) ?? null;
  }

  async getLease(): Promise<StoredValue<IssuerLeaseRecord> | null> {
    return this.lease;
  }

  async createClaim(record: ClaimIssuanceRecord): Promise<boolean> {
    if (this.claims.has(record.completionKey)) return false;
    this.claimVersion += 1;
    this.claims.set(record.completionKey, {
      etag: String(this.claimVersion),
      value: clone(record),
    });
    return true;
  }

  async updateClaim(
    completionKey: string,
    etag: string,
    record: ClaimIssuanceRecord,
  ): Promise<boolean> {
    const current = this.claims.get(completionKey);
    if (!current || current.etag !== etag) return false;
    this.claimVersion += 1;
    this.claims.set(completionKey, {
      etag: String(this.claimVersion),
      value: clone(record),
    });
    return true;
  }

  async createLease(record: IssuerLeaseRecord): Promise<boolean> {
    if (this.lease) return false;
    this.leaseVersion += 1;
    this.lease = {
      etag: String(this.leaseVersion),
      value: clone(record),
    };
    return true;
  }

  async updateLease(etag: string, record: IssuerLeaseRecord): Promise<boolean> {
    if (!this.lease || this.lease.etag !== etag) return false;
    this.leaseVersion += 1;
    this.lease = {
      etag: String(this.leaseVersion),
      value: clone(record),
    };
    return true;
  }
}
