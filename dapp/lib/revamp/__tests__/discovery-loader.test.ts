import {
  DiscoveryTimeoutError,
  coalesceDiscoveryRead,
  loadDiscoveryCampaigns,
  runDiscoveryRequest,
  shouldRetryDiscovery,
  type DiscoveryCampaignSnapshot,
} from "../discovery-loader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("public discovery loader", () => {
  it("resolves the measured sixteen-activity cold list from one batch instead of sixteen exact reads", async () => {
    const ids = Array.from({length: 16}, (_, index) => `full-id-${index}`);
    const fetchCampaign = jest.fn(async (id: string) => `exact-${id}`);
    const fetchBatch = jest.fn(async (requested: readonly string[], accept: (record: {id: string; cell: string}) => void) => {
      requested.forEach(id => accept({id, cell: `batch-${id}`}));
    });
    const result = await loadDiscoveryCampaigns({ids, fetchCampaign, fetchBatch});
    expect(result.records).toHaveLength(16);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchCampaign).not.toHaveBeenCalled();
  });

  it("uses exact fallback for uncovered IDs after batch failure while retaining completed records", async () => {
    const fetchCampaign = jest.fn(async (id: string) => `exact-${id}`);
    const result = await loadDiscoveryCampaigns({ids: ["a", "b", "c"], fetchCampaign,
      fetchBatch: async (_ids, accept) => {
        accept({id: "a", cell: "batch-a"}); accept({id: "unapproved", cell: "hidden"});
        throw new Error("page budget/transport failure");
      },
    });
    expect(fetchCampaign.mock.calls.map(([id]) => id)).toEqual(["b", "c"]);
    expect(result.records).toEqual([{id: "a", cell: "batch-a"}, {id: "b", cell: "exact-b"}, {id: "c", cell: "exact-c"}]);
  });

  it("keeps approved stale cards during refresh, skips fresh ones, and removes a stale card only if its read fails", async () => {
    const waiting = deferred<string>();
    const states: DiscoveryCampaignSnapshot<string>[] = [];
    const fetchCampaign = jest.fn((id: string) => id === "b" ? waiting.promise : Promise.resolve("fresh-a"));
    const result = loadDiscoveryCampaigns({ids: ["a", "b"], initialRecords: [{id: "a", cell: "cached-a"}, {id: "b", cell: "cached-b"}, {id: "removed", cell: "private"}], freshIds: ["a"], fetchCampaign, onProgress: state => states.push(state)});
    expect(states[0]).toEqual({records: [{id: "a", cell: "cached-a"}, {id: "b", cell: "cached-b"}], pendingCount: 0, errors: {}});
    expect(fetchCampaign.mock.calls.map(([id]) => id)).toEqual(["b"]);
    waiting.resolve("updated-b");
    expect((await result).records).toEqual([{id: "a", cell: "cached-a"}, {id: "b", cell: "updated-b"}]);
    const failed = await loadDiscoveryCampaigns({ids: ["b"], initialRecords: [{id: "b", cell: "cached-b"}], fetchCampaign: async () => {throw Error("unavailable");}});
    expect(failed).toEqual({records: [], pendingCount: 0, errors: {b: "unavailable"}});
  });

  it("bounds reads to four and publishes fast results before the entire list settles", async () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const waiting = Object.fromEntries(ids.map(id => [id, deferred<string>()]));
    let active = 0;
    let maximum = 0;
    const snapshots: DiscoveryCampaignSnapshot<string>[] = [];
    const fetchCampaign = jest.fn(async (id: string) => {
      active++;
      maximum = Math.max(maximum, active);
      const result = await waiting[id].promise;
      active--;
      return result;
    });
    const result = loadDiscoveryCampaigns({ ids, fetchCampaign, onProgress: state => snapshots.push(state) });
    expect(fetchCampaign).toHaveBeenCalledTimes(4);
    waiting.b.resolve("cell-b");
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(snapshots.some(state => state.records.some(record => record.id === "b") && state.pendingCount > 0)).toBe(true);
    for (const id of ids) waiting[id].resolve(`cell-${id}`);
    expect((await result).records.map(record => record.id)).toEqual(ids);
    expect(maximum).toBe(4);
    expect(snapshots[0].records).toEqual([]);
  });

  it("keeps partial errors separate from empty data and deduplicates full IDs", async () => {
    const fetchCampaign = jest.fn(async (id: string) => {
      if (id === "0xbb") throw new Error("unavailable");
      return id;
    });
    const result = await loadDiscoveryCampaigns({ ids: ["0xAA", "0xaa", "0xbb"], fetchCampaign });
    expect(fetchCampaign).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ records: [{id: "0xaa", cell: "0xaa"}], errors: {"0xbb": "unavailable"}, pendingCount: 0 });
    expect(await loadDiscoveryCampaigns({ ids: [], fetchCampaign })).toEqual({records: [], errors: {}, pendingCount: 0});
  });

  it("stops publishing and does not dispatch new IDs after cancellation", async () => {
    const controller = new AbortController();
    const current = deferred<string>();
    const fetchCampaign = jest.fn(() => current.promise);
    const onProgress = jest.fn();
    const result = loadDiscoveryCampaigns({ ids: ["a", "b", "c", "d", "e"], fetchCampaign, signal: controller.signal, onProgress });
    controller.abort();
    current.resolve("old cell");
    await expect(result).rejects.toMatchObject({name: "AbortError"});
    expect(fetchCampaign).toHaveBeenCalledTimes(4);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("keeps timed-out physical requests inside the shared four-request limit", async () => {
    jest.useFakeTimers();
    try {
      const client = {};
      const underlying = Array.from({length: 4}, () => deferred<number>());
      const started = jest.fn();
      const initial = underlying.map(item => runDiscoveryRequest(client, () => {
        started();
        return item.promise;
      }, {timeoutMs: 10}).catch(error => error));
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10);
      expect((await Promise.all(initial)).every(error => error instanceof DiscoveryTimeoutError)).toBe(true);

      const replacement = runDiscoveryRequest(client, async () => { started(); return 99; }, {timeoutMs: 100});
      await Promise.resolve();
      expect(started).toHaveBeenCalledTimes(4);
      underlying[0].resolve(0);
      await expect(replacement).resolves.toBe(99);
      expect(started).toHaveBeenCalledTimes(5);
      underlying.slice(1).forEach(item => item.resolve(0));
    } finally { jest.useRealTimers(); }
  });

  it("cancels queued reads without starting them and does not auto-retry timeout failures", async () => {
    const client = {};
    const current = deferred<number>();
    const active = Array.from({length: 4}, () => runDiscoveryRequest(client, () => current.promise));
    const controller = new AbortController();
    const read = jest.fn(async () => 2);
    const queued = runDiscoveryRequest(client, read, {signal: controller.signal});
    controller.abort();
    await expect(queued).rejects.toMatchObject({name: "AbortError"});
    current.resolve(1);
    await Promise.all(active);
    expect(read).not.toHaveBeenCalled();
    expect(shouldRetryDiscovery(0, new DiscoveryTimeoutError())).toBe(false);
    expect(shouldRetryDiscovery(0, new Error("transient"))).toBe(true);
    expect(shouldRetryDiscovery(1, new Error("transient"))).toBe(false);
  });

  it("coalesces a physical read across a cancelled observer and its replacement", async () => {
    const client = {};
    const current = deferred<number>();
    const read = jest.fn(() => current.promise);
    const controller = new AbortController();
    const first = runDiscoveryRequest(client, () => coalesceDiscoveryRead(client, "same-full-key", read), {signal: controller.signal});
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    await expect(first).rejects.toMatchObject({name: "AbortError"});
    const replacement = runDiscoveryRequest(client, () => coalesceDiscoveryRead(client, "same-full-key", read));
    await Promise.resolve(); await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    current.resolve(42);
    await expect(replacement).resolves.toBe(42);
  });
});
