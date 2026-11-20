import {fetchEventFromRelays, encodeVerifiedNevent, type NostrRelayClient} from "@/lib/nostr/relay-core";
import {acquireCampaignCover, clearInactiveCampaignCovers, coverReference} from "../campaign-cover-cache";

jest.mock("@/lib/nostr/relay-core", () => ({...jest.requireActual("@/lib/nostr/relay-core"), fetchEventFromRelays: jest.fn()}));
const nostr = {event: jest.fn(), query: jest.fn()} as NostrRelayClient;
const reference = (number: number, relay = "wss://relay.damus.io") => coverReference(encodeVerifiedNevent(number.toString(16).padStart(64, "0"), [relay]))!;
const result = (content = "https://example.com/cover.png") => ({event: {content}, attempts: []}) as unknown as Awaited<ReturnType<typeof fetchEventFromRelays>>;
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const relays = ["wss://relay.damus.io"];

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.runOnlyPendingTimers(); clearInactiveCampaignCovers(); jest.useRealTimers(); });

it("deduplicates one event across different nevent relay hints and reuses its resolved cover", async () => {
  let finish!: (value: ReturnType<typeof result>) => void;
  jest.mocked(fetchEventFromRelays).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const readStorage = jest.spyOn(Storage.prototype, "getItem");
  const first = acquireCampaignCover(reference(1), nostr, relays);
  const second = acquireCampaignCover(reference(1, "wss://nos.lol"), nostr, relays);
  await tick(); expect(fetchEventFromRelays).toHaveBeenCalledTimes(1);
  finish(result());
  await expect(first.promise).resolves.toMatchObject({src: "https://example.com/cover.png"});
  await expect(second.promise).resolves.toMatchObject({src: "https://example.com/cover.png"});
  first.release(); second.release(); jest.runOnlyPendingTimers();
  const returning = acquireCampaignCover(reference(1), nostr, relays);
  await returning.promise;
  expect(fetchEventFromRelays).toHaveBeenCalledTimes(1);
  expect(readStorage).not.toHaveBeenCalled();
  readStorage.mockRestore(); returning.release();
});

it("bounds in-flight work and never starts relay work for an offscreen queued cover", async () => {
  const finishes: Array<(value: ReturnType<typeof result>) => void> = [];
  jest.mocked(fetchEventFromRelays).mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
  const first = acquireCampaignCover(reference(2), nostr, relays);
  const second = acquireCampaignCover(reference(3), nostr, relays);
  const queued = acquireCampaignCover(reference(4), nostr, relays);
  const stopped = queued.promise.catch(error => error);
  await tick(); expect(fetchEventFromRelays).toHaveBeenCalledTimes(2);
  queued.release(); jest.runOnlyPendingTimers();
  finishes[0](result()); finishes[1](result());
  await Promise.all([first.promise, second.promise]);
  expect((await stopped).name).toBe("AbortError");
  expect(fetchEventFromRelays).toHaveBeenCalledTimes(2);
  first.release(); second.release();
});

it("caches a failed lookup briefly instead of repeating it on every card remount", async () => {
  jest.mocked(fetchEventFromRelays).mockResolvedValueOnce({event: null, attempts: []});
  const first = acquireCampaignCover(reference(5), nostr, relays);
  await expect(first.promise).rejects.toThrow("unavailable"); first.release(); jest.runOnlyPendingTimers();
  const same = acquireCampaignCover(reference(5), nostr, relays);
  await expect(same.promise).rejects.toThrow("unavailable"); same.release();
  expect(fetchEventFromRelays).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(30_001);
  jest.mocked(fetchEventFromRelays).mockResolvedValueOnce(result());
  const retry = acquireCampaignCover(reference(5), nostr, relays);
  await expect(retry.promise).resolves.toMatchObject({src: "https://example.com/cover.png"});
  expect(fetchEventFromRelays).toHaveBeenCalledTimes(2); retry.release();
});

it("shares one Blob URL for data-image covers and revokes it after inactive cache cleanup", async () => {
  const originalFetch = global.fetch;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const blob = new Blob([new Uint8Array([1, 2, 3])], {type: "image/png"});
  global.fetch = jest.fn(async () => ({blob: async () => blob})) as unknown as typeof fetch;
  URL.createObjectURL = jest.fn(() => "blob:shared-cover"); URL.revokeObjectURL = jest.fn();
  jest.mocked(fetchEventFromRelays).mockResolvedValueOnce(result("data:image/png;base64,AQID"));
  try {
    const first = acquireCampaignCover(reference(6), nostr, relays), second = acquireCampaignCover(reference(6), nostr, relays);
    await expect(first.promise).resolves.toMatchObject({src: "blob:shared-cover", bytes: 3}); await second.promise;
    expect(global.fetch).toHaveBeenCalledTimes(1); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    first.release(); second.release(); jest.runOnlyPendingTimers(); clearInactiveCampaignCovers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:shared-cover");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});

it("cancels losing relay requests after obtaining the first verified event", async () => {
  let receivedSignal: AbortSignal | undefined;
  nostr.query = jest.fn(async (_filters, options) => { receivedSignal = options?.signal; return []; });
  jest.mocked(fetchEventFromRelays).mockImplementationOnce(async options => {
    await options.nostr.query([], {}); expect(receivedSignal?.aborted).toBe(false); return result();
  });
  const request = acquireCampaignCover(reference(7), nostr, relays);
  await request.promise;
  expect(receivedSignal?.aborted).toBe(true); request.release();
});

it("downsizes large raster images to the actual centered card crop and closes the source bitmap", async () => {
  const originalFetch = global.fetch, originalBitmap = global.createImageBitmap, originalCanvas = global.OffscreenCanvas;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const source = new Blob([new Uint8Array(300 * 1024)], {type: "image/png"});
  const thumbnail = new Blob([new Uint8Array([1])], {type: "image/webp"});
  const bitmap = {width: 4000, height: 2000, close: jest.fn()};
  const drawImage = jest.fn(), convert = jest.fn(async () => thumbnail);
  global.fetch = jest.fn(async () => ({blob: async () => source})) as unknown as typeof fetch;
  global.createImageBitmap = jest.fn(async () => bitmap) as unknown as typeof createImageBitmap;
  global.OffscreenCanvas = jest.fn((width, height) => ({width, height, getContext: () => ({drawImage}), convertToBlob: convert})) as unknown as typeof OffscreenCanvas;
  URL.createObjectURL = jest.fn(() => "blob:thumbnail"); URL.revokeObjectURL = jest.fn();
  jest.mocked(fetchEventFromRelays).mockResolvedValueOnce(result("data:image/png;base64,AQID"));
  try {
    const request = acquireCampaignCover(reference(8), nostr, relays);
    await expect(request.promise).resolves.toMatchObject({src: "blob:thumbnail", bytes: 1});
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, expect.any(Number), 4000, expect.any(Number), 0, 0, 832, 320);
    expect(URL.createObjectURL).toHaveBeenCalledWith(thumbnail); expect(bitmap.close).toHaveBeenCalledTimes(1);
    request.release(); jest.runOnlyPendingTimers(); clearInactiveCampaignCovers();
  } finally {
    global.fetch = originalFetch; global.createImageBitmap = originalBitmap; global.OffscreenCanvas = originalCanvas;
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
});

it("evicts inactive Blob URLs instead of allowing unlimited cover cache growth", async () => {
  const originalFetch = global.fetch, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const blob = new Blob([new Uint8Array([1])], {type: "image/png"});
  let next = 0;
  global.fetch = jest.fn(async () => ({blob: async () => blob})) as unknown as typeof fetch;
  URL.createObjectURL = jest.fn(() => `blob:cover-${++next}`); URL.revokeObjectURL = jest.fn();
  jest.mocked(fetchEventFromRelays).mockResolvedValue(result("data:image/png;base64,AQID"));
  try {
    for (let index = 20; index < 60; index++) {
      const request = acquireCampaignCover(reference(index), nostr, relays);
      await request.promise; request.release(); jest.runOnlyPendingTimers();
    }
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cover-1");
    clearInactiveCampaignCovers(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(40);
  } finally {global.fetch = originalFetch; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;}
});

it("does not use unsafe or legacy-placeholder sources as image requests", () => {
  for (const source of ["/placeholder.svg", "javascript:alert(1)", "data:text/html;base64,AQID", "nevent1invalid"]) expect(coverReference(source)).toBeNull();
  expect(coverReference("https://example.com/cover.png")?.source).toBe("https://example.com/cover.png");
});
