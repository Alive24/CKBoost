import type { Handler } from "@netlify/functions";
import { AuthDataValidator } from "@telegram-auth/server";
import type { AuthDataMap, TelegramUserData } from "@telegram-auth/server";
import { ccc } from "@ckb-ccc/connector-react";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { statusCode: 500, body: "Missing TELEGRAM_BOT_TOKEN" };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const telegram = (body.telegram || {}) as Record<string, unknown>;
    const txLike = body.tx as unknown | undefined;

    // Build AuthDataMap for validator
    const dataMap: AuthDataMap = new Map<string, string | number>();
    const fill = (k: string) => {
      const v = telegram[k];
      if (typeof v === "string" || typeof v === "number") dataMap.set(k, v);
    };
    ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"].forEach(fill);

    // Use package's built-in TTL via options instead of manual auth_date checks
    const ttl = Number(process.env.TELEGRAM_AUTH_TTL_SEC || 600);
    const validator = new AuthDataValidator({ botToken, inValidateDataAfter: ttl });
    const user = await validator.validate<TelegramUserData & { auth_date?: number | string }>(dataMap);

    // Optional: if a tx is provided, compute tx hash and server-sign it
    let txHash: string | undefined;
    let serverSignature: string | undefined;
    if (txLike) {
      try {
        const client = new ccc.ClientPublicTestnet({ url: process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev" });
        const tx = ccc.Transaction.from(txLike as ccc.TransactionLike);
        txHash = tx.hashFull();
        const serverKey = process.env.TELEGRAM_AUTH_PRIVATE_KEY;
        if (serverKey) {
          const signer = new ccc.SignerCkbPrivateKey(client, serverKey as ccc.Hex);
          serverSignature = await signer.signMessageRaw(txHash);
        }
      } catch (e) {
        // Non-fatal: log and continue
        console.warn("Failed to process tx for server signature", e);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, user, txHash, serverSignature }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "invalid_telegram_auth" }),
    };
  }
};

export default handler;
