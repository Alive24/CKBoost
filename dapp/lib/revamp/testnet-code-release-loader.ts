import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { TESTNET_CODE_RELEASES, isTestnetCodeId, validateTestnetRelease } from "./testnet-code-releases";

export class ReviewedReleaseLoadError extends Error {
  constructor(public readonly reason: "unknown-release" | "unavailable" | "mismatch", message: string) {
    super(message); this.name = "ReviewedReleaseLoadError";
  }
}

/** Node-only loader. Neither an input path nor a file name is accepted from a request. */
export async function loadReviewedTestnetRelease(id: string): Promise<{ bytes: Uint8Array; fileName: string; byteLength: number; dataHash: string }> {
  if (!isTestnetCodeId(id)) throw new ReviewedReleaseLoadError("unknown-release", "Reviewed release not found.");
  const release = TESTNET_CODE_RELEASES[id];
  const file = resolve(process.cwd(), "../../testnet-release", release.fileName);
  let handle: Awaited<ReturnType<typeof open>>;
  try { handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch { throw new ReviewedReleaseLoadError("unavailable", "The reviewed local release file is unavailable. Use the reviewed binary file selector instead."); }
  let bytes: Uint8Array;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== release.byteLength) throw new ReviewedReleaseLoadError("mismatch", "The local release does not match the reviewed byte size. Loading was blocked.");
    bytes = await handle.readFile();
  } catch (cause) {
    if (cause instanceof ReviewedReleaseLoadError) throw cause;
    throw new ReviewedReleaseLoadError("unavailable", "The reviewed local release file could not be read. Use the reviewed binary file selector instead.");
  } finally { await handle.close(); }
  try { validateTestnetRelease(id, bytes); }
  catch { throw new ReviewedReleaseLoadError("mismatch", "The local file failed reviewed ELF, byte-size, or data-hash verification. Loading was blocked."); }
  return { bytes: new Uint8Array(bytes), fileName: release.fileName, byteLength: bytes.byteLength, dataHash: release.dataHash };
}
