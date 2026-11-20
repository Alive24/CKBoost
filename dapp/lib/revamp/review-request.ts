import type { ccc } from "@ckb-ccc/connector-react";

export const REVIEW_AUTH_TIMEOUT_MS = 12_000;
export const REVIEW_SCAN_TIMEOUT_MS = 30_000;

/** An RPC cannot always be cancelled. Release the UI at the deadline and stop
 * the expired read at its next response/iterator step, before further requests. */
export async function withReviewDeadline<T>(
  run: (isActive: () => boolean) => Promise<T>,
  milliseconds: number,
  message: string,
  isCurrent: () => boolean = () => true,
): Promise<T> {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isActive = () => active && isCurrent();
  try {
    return await Promise.race([
      run(isActive),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          active = false;
          reject(new Error(message));
        }, milliseconds);
      }),
    ]);
  } finally {
    active = false;
    clearTimeout(timer);
  }
}

export function createReviewReadSigner(signer: ccc.Signer, isActive: () => boolean): ccc.Signer {
  const check = () => {
    if (!isActive()) throw new DOMException("This review read expired or its account changed.", "AbortError");
  };
  const wrap = (value: unknown): unknown => {
    if (value && typeof value === "object" && Symbol.asyncIterator in value) {
      return (async function* () {
        const iterator = (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
        try {
          while (true) {
            check();
            const next = await iterator.next();
            check();
            if (next.done) return;
            yield next.value;
          }
        } finally {
          await iterator.return?.();
        }
      })();
    }
    if (value && typeof (value as PromiseLike<unknown>).then === "function") {
      return Promise.resolve(value).then(result => { check(); return result; });
    }
    return value;
  };
  const read = (target: object, key: PropertyKey) => {
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? (...args: unknown[]) => { check(); return wrap(value.apply(target, args)); } : value;
  };
  const client = new Proxy(signer.client, { get: read });
  return new Proxy(signer, { get(target, key) { return key === "client" ? client : read(target, key); } });
}
