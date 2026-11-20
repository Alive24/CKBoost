import type { NostrEvent } from "@nostrify/types";
import {
  CKBOOST_EVENT_KIND, decodeNevent, fetchEventFromRelays, isValidCkboostEvent, mergeRelayLists,
  type NostrRelayClient,
} from "@/lib/nostr/relay-core";

const MAX_ACTIVE = 2;
const MAX_ENTRIES = 32;
const MAX_MEMORY_BYTES = 24 * 1024 * 1024;
const MAX_CONTENT_LENGTH = 12 * 1024 * 1024;
const FAILURE_AGE = 30_000;
const DATABASE = "ckboost-revamp-cover-events-v1";
const STORE = "events";
const DISK_AGE = 30 * 24 * 60 * 60 * 1000;

export interface CoverReference { key: string; source: string; eventId?: string; relays?: string[] }
interface CoverValue { src: string; bytes: number; objectUrl: boolean }
interface Entry {
  key: string; refs: number; touched: number; controller: AbortController;
  promise: Promise<CoverValue>; value?: CoverValue; failedAt?: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
}
const entries = new Map<string, Entry>();
const queue: Array<() => void> = [];
let active = 0;
let database: Promise<IDBDatabase | null> | undefined;

export function coverReference(raw?: string | null): CoverReference | null {
  const source = raw?.trim();
  if (!source || source === "/placeholder.svg") return null;
  if (source.startsWith("nevent1")) {
    const parsed = decodeNevent(source);
    return parsed ? {key: `event:${parsed.id}`, source, eventId: parsed.id, relays: parsed.relays} : null;
  }
  return safeImageSource(source) ? {key: source, source} : null;
}

function safeImageSource(source: string): boolean {
  if (source.startsWith("/") && !source.startsWith("//")) return true;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(source)) return source.length <= MAX_CONTENT_LENGTH;
  try { return ["http:", "https:"].includes(new URL(source).protocol); } catch { return false; }
}
const cancelled = () => new DOMException("Cover is no longer needed", "AbortError");
function check(signal: AbortSignal) { if (signal.aborted) throw cancelled(); }

// A bounded queue also bounds expensive signature checks/base64 conversion.
function scheduled<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      if (signal.aborted) { reject(cancelled()); pump(); return; }
      active++;
      work().then(resolve, reject).finally(() => { active--; pump(); });
    };
    queue.push(start); pump();
  });
}
function pump() { while (active < MAX_ACTIVE && queue.length) queue.shift()!(); }

// IndexedDB reads one event asynchronously. Unlike the legacy general Nostr
// localStorage cache, a cover never JSON-parses/rewrites/verifies all other events.
function openDatabase(): Promise<IDBDatabase | null> {
  if (database) return database;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  database = new Promise(resolve => {
    let done = false;
    const finish = (db: IDBDatabase | null) => { if (!done) { done = true; clearTimeout(timer); resolve(db); } else db?.close(); };
    const timer = setTimeout(() => finish(null), 250);
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, {keyPath: "id"});
        store.createIndex("cachedAt", "cachedAt");
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  return database;
}
async function readEvent(eventId: string, signal: AbortSignal): Promise<NostrEvent | null> {
  const db = await openDatabase(); check(signal);
  if (!db) return null;
  return new Promise(resolve => {
    let done = false;
    const finish = (event: NostrEvent | null) => { if (!done) { done = true; clearTimeout(timer); resolve(event); } };
    const timer = setTimeout(() => finish(null), 200);
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(eventId);
      request.onerror = () => finish(null);
      request.onsuccess = () => {
        if (done || signal.aborted) { finish(null); return; }
        const cached = request.result as {event?: NostrEvent; cachedAt?: number} | undefined;
        const event = cached?.event;
        finish(event && typeof event.content === "string" && typeof cached?.cachedAt === "number" && cached.cachedAt > Date.now() - DISK_AGE &&
          event.content.length <= MAX_CONTENT_LENGTH && isValidCkboostEvent(event, eventId) ? event : null);
      };
    } catch { finish(null); }
  });
}
async function cacheEvent(event: NostrEvent): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    store.put({id: event.id, event, cachedAt: Date.now()});
    // Key-only traversal bounds persisted entries without reading image bodies.
    let count = 0;
    const cursor = store.index("cachedAt").openKeyCursor(null, "prev");
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if (++count > MAX_ENTRIES) store.delete(item.primaryKey);
      item.continue();
    };
    tx.onerror = () => {}; // Cache quota/private-mode failures do not fail covers.
  } catch { /* Optional persistent cache. */ }
}

function combinedSignal(left: AbortSignal | undefined, right: AbortSignal): AbortSignal {
  if (!left) return right;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (left.aborted || right.aborted) controller.abort();
  else {
    left.addEventListener("abort", abort, {once: true}); right.addEventListener("abort", abort, {once: true});
    controller.signal.addEventListener("abort", () => {
      left.removeEventListener("abort", abort); right.removeEventListener("abort", abort);
    }, {once: true});
  }
  return controller.signal;
}
async function resolveCover(reference: CoverReference, nostr: NostrRelayClient | undefined, relays: string[], signal: AbortSignal): Promise<CoverValue> {
  check(signal);
  let content = reference.source;
  if (reference.eventId) {
    let event = await readEvent(reference.eventId, signal); check(signal);
    if (!event) {
      if (!nostr) throw new Error("Cover relay pool is unavailable");
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, {once: true});
      const scoped: NostrRelayClient = {
        event: nostr.event.bind(nostr),
        query: (filters, options) => nostr.query(filters, {...options, signal: combinedSignal(options?.signal, controller.signal)}),
        ...(nostr.req ? {req: (filters, options) => nostr.req!(filters, {...options, signal: combinedSignal(options?.signal, controller.signal)})} : {}),
      };
      try {
        const fetched = await fetchEventFromRelays({nostr: scoped, eventId: reference.eventId,
          relays: mergeRelayLists(reference.relays ?? [], relays), kind: CKBOOST_EVENT_KIND});
        check(signal);
        event = fetched.event;
        if (!event || event.content.length > MAX_CONTENT_LENGTH) throw new Error("Cover event is unavailable or too large");
        // The relay helper validates ID/hash/signature before returning an event.
        void cacheEvent(event);
      } finally {
        controller.abort(); // Stop losing relay requests after the first valid event.
        signal.removeEventListener("abort", abort);
      }
    }
    content = event.content;
    if (content.trimStart().startsWith("{")) {
      const parsed = JSON.parse(content) as {content?: unknown};
      if (typeof parsed.content !== "string") throw new Error("Cover content is missing");
      content = parsed.content;
    }
  }
  check(signal);
  if (!safeImageSource(content)) throw new Error("Cover source is not a supported image");
  if (!content.startsWith("data:")) return {src: content, bytes: 0, objectUrl: false};
  // Decode base64 with the browser's Blob pipeline, not giant strings in every
  // img attribute. One shared object URL lets identical cards reuse decoding.
  const response = await fetch(content, {signal});
  let blob = await response.blob(); check(signal);
  // Large uploaded raster covers need card-sized decode/texture budgets rather
  // than retaining the original multi-megapixel image for each visible card.
  // Animated/vector sources and browsers without these APIs retain the original.
  if (blob.size > 256 * 1024 && /image\/(png|jpe?g|webp|avif)$/i.test(blob.type) &&
      typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(blob); check(signal);
      if (bitmap.width > 832 || bitmap.height > 320) {
        // Match the card's centered object-fit:cover crop, without stretching a
        // portrait image or retaining thousands of pixels outside that crop.
        const canvas = new OffscreenCanvas(832, 320);
        const context = canvas.getContext("2d");
        if (context) {
          const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
          const width = canvas.width / scale, height = canvas.height / scale;
          context.drawImage(bitmap, (bitmap.width - width) / 2, (bitmap.height - height) / 2, width, height,
            0, 0, canvas.width, canvas.height);
          const thumbnail = await canvas.convertToBlob({type: "image/webp", quality: .86}); check(signal);
          if (thumbnail.size < blob.size) blob = thumbnail;
        }
      }
    } catch (error) { check(signal); /* Optional browser thumbnail optimization. */ }
    finally { bitmap?.close(); }
  }
  check(signal);
  const src = URL.createObjectURL(blob);
  return {src, bytes: blob.size, objectUrl: true};
}

function remove(entry: Entry) {
  if (entries.get(entry.key) !== entry) return;
  if (entry.value?.objectUrl) URL.revokeObjectURL(entry.value.src);
  entries.delete(entry.key);
}
function trim() {
  let bytes = [...entries.values()].reduce((sum, item) => sum + (item.value?.bytes ?? 0), 0);
  const oldest = [...entries.values()].filter(item => item.refs === 0 && (item.value || item.failedAt))
    .sort((a, b) => a.touched - b.touched);
  for (const entry of oldest) {
    if (entries.size <= MAX_ENTRIES && bytes <= MAX_MEMORY_BYTES) break;
    bytes -= entry.value?.bytes ?? 0; remove(entry);
  }
}

export function acquireCampaignCover(reference: CoverReference, nostr: NostrRelayClient | undefined, relays: string[]) {
  let entry = entries.get(reference.key);
  if (entry?.failedAt && Date.now() - entry.failedAt >= FAILURE_AGE) { remove(entry); entry = undefined; }
  if (!entry) {
    const controller = new AbortController();
    entry = {key: reference.key, refs: 0, touched: Date.now(), controller, promise: null!};
    const created = entry;
    entry.promise = scheduled(controller.signal, () => resolveCover(reference, nostr, relays, controller.signal))
      .then(value => {
        if (controller.signal.aborted && value.objectUrl) URL.revokeObjectURL(value.src);
        check(controller.signal); created.value = value; trim(); return value;
      })
      .catch(error => {
        if (controller.signal.aborted) remove(created);
        else { created.failedAt = Date.now(); trim(); }
        throw error;
      });
    entries.set(reference.key, entry);
  }
  clearTimeout(entry.releaseTimer); entry.refs++; entry.touched = Date.now();
  const acquired = entry;
  let released = false;
  return {promise: entry.promise, release: () => {
    if (released) return; released = true; acquired.refs--;
    // The next StrictMode effect/another card can retain the shared work first.
    acquired.releaseTimer = setTimeout(() => {
      if (acquired.refs) return;
      if (!acquired.value && !acquired.failedAt) { acquired.controller.abort(); remove(acquired); }
      trim();
    }, 0);
  }};
}

/** Release inactive object URLs when navigating away; mounted cards stay valid. */
export function clearInactiveCampaignCovers() {
  for (const entry of entries.values()) if (!entry.refs) { entry.controller.abort(); remove(entry); }
}
