import { isTestnetSetupEnabled } from "@/lib/revamp/testnet-setup-config";
import { IsolatedProfileLoadError, loadLocalIsolatedTestnetProfile } from "@/lib/revamp/testnet-protocol-profile-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function local(request: Request): boolean {
  try {
    const url = new URL(request.url), host = request.headers.get("host");
    if (!LOCAL.has(url.hostname.toLowerCase()) || url.username || url.password) return false;
    if (host) {
      const parsed = new URL(`http://${host}`);
      if (!LOCAL.has(parsed.hostname.toLowerCase()) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return false;
    }
    return true;
  } catch { return false; }
}
/** Returns public identities only. Loading does not prepare/sign/broadcast or activate a protocol. */
export async function GET(request: Request): Promise<Response> {
  if (!isTestnetSetupEnabled(process.env.CKBOOST_ENABLE_TESTNET_SETUP, process.env.NEXT_PUBLIC_CKB_NETWORK) || !local(request)) {
    return Response.json({ error: "Isolated Testnet profile not found." }, { status: 404, headers });
  }
  try { return Response.json(await loadLocalIsolatedTestnetProfile(), { headers }); }
  catch (cause) {
    if (cause instanceof IsolatedProfileLoadError) return Response.json({ error: cause.message }, { status: cause.reason === "invalid" ? 422 : 503, headers });
    return Response.json({ error: "The isolated public Testnet profile could not be loaded." }, { status: 503, headers });
  }
}
