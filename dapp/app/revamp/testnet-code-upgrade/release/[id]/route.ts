import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { isTestnetSetupEnabled } from "@/lib/revamp/testnet-setup-config";
import { PERMISSION_UPGRADE_IDS, validatePermissionRelease } from "@/lib/revamp/testnet-permission-release";
import { PERMISSION_REVIEW_RELEASES, type PermissionReviewCodeId } from "@/lib/ckb/permissions-release-pins.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const missing = () => Response.json({ error: "Not found." }, { status: 404, headers });
  const loopback = (value: string) => { try { const url = new URL(value); return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.username && !url.password; } catch { return false; } };
  if (!isTestnetSetupEnabled(process.env.CKBOOST_ENABLE_TESTNET_SETUP, process.env.NEXT_PUBLIC_CKB_NETWORK) || !loopback(request.url) || !loopback(`http://${request.headers.get("host") ?? ""}`)) return missing();
  const { id } = await context.params;
  if (!PERMISSION_UPGRADE_IDS.includes(id as PermissionReviewCodeId)) return missing();
  const pin = PERMISSION_REVIEW_RELEASES[id as PermissionReviewCodeId]; if (!pin) return missing();
  try {
    const directory = await realpath(path.resolve(process.cwd(), "../../testnet-release/permissions-v2"));
    const file = await realpath(path.join(directory, pin.fileName));
    if (path.dirname(file) !== directory) return missing();
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== pin.byteLength) throw new Error("Release file size mismatch.");
      bytes = new Uint8Array(await handle.readFile());
    } finally { await handle.close(); }
    validatePermissionRelease(id as PermissionReviewCodeId, bytes);
    return new Response(bytes, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="${pin.fileName}"` } });
  } catch { return Response.json({ error: "The exact reviewed release is not available." }, { status: 503, headers }); }
}
