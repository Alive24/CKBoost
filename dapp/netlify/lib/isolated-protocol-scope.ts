import { getIsolatedRuntime } from "@/lib/ckb/isolated-runtime.mjs";

/** QA uses its complete validated identity. Null preserves each legacy
 * caller's original environment parsing and error response. Invalid QA
 * configuration throws; it never substitutes legacy protocol settings. */
export function getIsolatedProtocolScope(): {codeHash:`0x${string}`;hashType:"type";args:`0x${string}`} | null {
  const isolated = getIsolatedRuntime();
  return isolated ? isolated.protocol.typeScript as {codeHash:`0x${string}`;hashType:"type";args:`0x${string}`} : null;
}
