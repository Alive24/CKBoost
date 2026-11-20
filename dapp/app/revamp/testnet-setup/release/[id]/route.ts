import { isTestnetSetupEnabled } from "@/lib/revamp/testnet-setup-config";
import { isTestnetCodeId } from "@/lib/revamp/testnet-code-releases";
import { loadReviewedTestnetRelease, ReviewedReleaseLoadError } from "@/lib/revamp/testnet-code-release-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function loopback(request: Request): boolean {
  try {
    const url = new URL(request.url), host = request.headers.get("host");
    if (!LOOPBACK.has(url.hostname.toLowerCase()) || url.username || url.password) return false;
    if (host) {
      const header = new URL(`http://${host}`);
      if (!LOOPBACK.has(header.hostname.toLowerCase()) || header.username || header.password || header.pathname !== "/" || header.search || header.hash) return false;
    }
    return true;
  } catch { return false; }
}
const missing = () => Response.json({ error: "Reviewed release not found." }, { status: 404, headers: noStore });

/** Explicit local-only read. It cannot prepare, sign, broadcast, or select an arbitrary file. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isTestnetSetupEnabled(process.env.CKBOOST_ENABLE_TESTNET_SETUP, process.env.NEXT_PUBLIC_CKB_NETWORK) || !loopback(request)) return missing();
  const { id } = await context.params;
  if (!isTestnetCodeId(id)) return missing();
  try {
    const release = await loadReviewedTestnetRelease(id);
    return new Response(new Uint8Array(release.bytes), { status: 200, headers: { ...noStore,
      "Content-Type": "application/octet-stream", "Content-Length": String(release.byteLength),
      "Content-Disposition": `attachment; filename="${release.fileName}"`,
    } });
  } catch (cause) {
    if (cause instanceof ReviewedReleaseLoadError) return Response.json({ error: cause.message }, { status: cause.reason === "unknown-release" ? 404 : cause.reason === "mismatch" ? 422 : 503, headers: noStore });
    return Response.json({ error: "The reviewed local release could not be loaded." }, { status: 503, headers: noStore });
  }
}
