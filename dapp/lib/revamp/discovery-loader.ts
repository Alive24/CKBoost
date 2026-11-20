export const DISCOVERY_CONCURRENCY = 4;
export const DISCOVERY_TIMEOUT_MS = 12_000;
export const DISCOVERY_FRESHNESS_MS = 60_000;

export class DiscoveryTimeoutError extends Error {
  constructor() {
    super("The discovery request timed out. Please try again.");
    this.name = "DiscoveryTimeoutError";
  }
}

export class DiscoveryCampaignUnavailableError extends Error {
  constructor() {
    super("An approved campaign could not be loaded.");
    this.name = "DiscoveryCampaignUnavailableError";
  }
}

export function discoveryAbortError(): Error {
  const error = new Error("Discovery request cancelled");
  error.name = "AbortError";
  return error;
}

interface RequestPool {
  active: number;
  jobs: Array<{ start: () => void; isSettled: () => boolean }>;
}

const pools = new WeakMap<object, RequestPool>();
const flights = new WeakMap<object, Map<string, Promise<unknown>>>();

/** Query observers may cancel while the uncancellable CCC transport continues.
 * Reuse that physical read on a rapid remount instead of issuing it twice.
 */
export function coalesceDiscoveryRead<T>(client: object, key: string, read: () => Promise<T>): Promise<T> {
  let current = flights.get(client);
  if (!current) {
    current = new Map();
    flights.set(client, current);
  }
  const existing = current.get(key);
  if (existing) return existing as Promise<T>;
  const promise = Promise.resolve().then(read);
  current.set(key, promise);
  const clear = () => { if (current.get(key) === promise) current.delete(key); };
  void promise.then(clear, clear);
  return promise;
}

function drain(pool: RequestPool) {
  while (pool.active < DISCOVERY_CONCURRENCY && pool.jobs.length) {
    const job = pool.jobs.shift()!;
    if (!job.isSettled()) job.start();
  }
}

/** CCC reads do not expose transport cancellation. Keep their pool slot occupied
 * until the actual read settles, even if the UI deadline expires. This bounds
 * physical requests across retries and protocol changes, not just UI promises.
 */
export function runDiscoveryRequest<T>(
  client: object,
  read: () => Promise<T>,
  { signal, timeoutMs = DISCOVERY_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  if (signal?.aborted) return Promise.reject(discoveryAbortError());
  let pool = pools.get(client);
  if (!pool) {
    pool = { active: 0, jobs: [] };
    pools.set(client, pool);
  }
  const requestPool = pool;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve(value as T);
    };
    const cancel = () => finish(discoveryAbortError());
    timer = setTimeout(() => finish(new DiscoveryTimeoutError()), timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    requestPool.jobs.push({
      isSettled: () => settled,
      start: () => {
        requestPool.active++;
        Promise.resolve().then(() => settled ? undefined as T : read()).then(
          value => finish(null, value),
          error => finish(error),
        ).finally(() => {
          requestPool.active--;
          drain(requestPool);
        });
      },
    });
    drain(requestPool);
  });
}

/** Timed-out reads are not retried automatically while their transport may
 * still be alive. Other failures get at most one bounded retry in useQuery.
 */
export function shouldRetryDiscovery(failureCount: number, error: Error): boolean {
  return failureCount < 1 && !(error instanceof DiscoveryTimeoutError) &&
    !(error instanceof DiscoveryCampaignUnavailableError) && error.name !== "AbortError";
}

export interface DiscoveryCampaignSnapshot<T> {
  records: Array<{ id: string; cell: T }>;
  errors: Record<string, string>;
  pendingCount: number;
}

/** Public IDs come from one authoritative protocol snapshot. Every publish is
 * immutable, so subscribers can render fast cells before slow ones finish.
 */
export async function loadDiscoveryCampaigns<T>({
  ids,
  fetchCampaign,
  fetchBatch,
  initialRecords = [],
  freshIds = [],
  signal,
  onProgress,
}: {
  ids: readonly string[];
  fetchCampaign: (id: string) => Promise<T>;
  fetchBatch?: (ids: readonly string[], onRecord: (record: {id: string; cell: T}) => void) => Promise<void>;
  /** Already visible approved cards survive while their new reads are pending. */
  initialRecords?: readonly {id: string; cell: T}[];
  /** Fresh individual query-cache entries require no batch or exact request. */
  freshIds?: readonly string[];
  signal?: AbortSignal;
  onProgress?: (snapshot: DiscoveryCampaignSnapshot<T>) => void;
}): Promise<DiscoveryCampaignSnapshot<T>> {
  const approvedIds = [...new Set(ids.map(id => id.toLowerCase()))];
  const approved = new Set(approvedIds);
  const cells = new Map(initialRecords.filter(record => approved.has(record.id.toLowerCase())).map(record => [record.id.toLowerCase(), record.cell]));
  const settled = new Set(freshIds.map(id => id.toLowerCase()).filter(id => cells.has(id)));
  const errors: Record<string, string> = {};
  let next = 0;
  const snapshot = (): DiscoveryCampaignSnapshot<T> => ({
    records: approvedIds.filter(id => cells.has(id)).map(id => ({ id, cell: cells.get(id)! })),
    errors: { ...errors },
    pendingCount: approvedIds.filter(id => !settled.has(id) && !cells.has(id)).length,
  });
  const publish = () => { if (!signal?.aborted) onProgress?.(snapshot()); };
  if (signal?.aborted) throw discoveryAbortError();
  publish();

  const accept = ({id: rawId, cell}: {id: string; cell: T}) => {
    const id = rawId.toLowerCase();
    if (signal?.aborted || !approved.has(id)) return;
    cells.set(id, cell);
    settled.add(id);
    publish();
  };
  const staleIds = approvedIds.filter(id => !settled.has(id));
  if (fetchBatch && staleIds.length) {
    try { await fetchBatch(staleIds, accept); }
    catch { /* Batch is an accelerator. Exact lookups resolve uncovered IDs. */ }
  }
  if (signal?.aborted) throw discoveryAbortError();
  const remainingIds = staleIds.filter(id => !settled.has(id));

  async function worker() {
    while (!signal?.aborted && next < remainingIds.length) {
      const id = remainingIds[next++];
      try {
        const cell = await fetchCampaign(id);
        if (!signal?.aborted) cells.set(id, cell);
      } catch (error) {
        if (!signal?.aborted) {
          cells.delete(id);
          errors[id] = error instanceof Error ? error.message : String(error);
        }
      } finally {
        settled.add(id);
        publish();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DISCOVERY_CONCURRENCY, remainingIds.length) }, worker));
  if (signal?.aborted) throw discoveryAbortError();
  return snapshot();
}
