import type { Handler } from "@netlify/functions";
import { AuthDataValidator } from "@telegram-auth/server";
import type { AuthDataMap, TelegramUserData } from "@telegram-auth/server";
import { ccc } from "@ckb-ccc/connector-react";

// Types for safer payload handling
type Hex = string;

type HashType = "data" | "type" | "data1";

// The JSON stored in the authenticator output's data
interface TelegramAuthCellData {
  kind: "ckboost/telegram_auth";
  chat_id: string; // string to avoid bigint JSON issues
  username: string;
  auth: Record<string, string | number | undefined>;
  wallet_lock_hash?: string;
  user_type_id?: string;
  timestamp?: number;
}

export const handler: Handler = async (event) => {
  const reqId = Math.random().toString(36).slice(2, 8);
  const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production';
  const log = (...args: any[]) => console.log(`[telegram-authenticate][${reqId}]`, ...args);
  const mask = (val?: string | number | null) => {
    if (val === undefined || val === null) return val;
    const s = String(val);
    if (s.length <= 8) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  };

  log("request", {
    method: event.httpMethod,
    path: (event as any).path,
    query: (event as any).rawQuery || event.queryStringParameters,
  });
  // Support GET to expose authenticator lock script (public info)
  if (event.httpMethod === "GET") {
    try {
      const serverKey = process.env.TELEGRAM_AUTH_PRIVATE_KEY as Hex | undefined;
      const rpcUrl = process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev";
      if (!serverKey) {
        log("config_error_get", { hasServerKey: !!serverKey });
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ success: false, error: "missing_private_key" }),
        };
      }
      const client = new ccc.ClientPublicTestnet({ url: rpcUrl });
      const signer = new ccc.SignerCkbPrivateKey(client, serverKey as ccc.Hex);
      const addrObj = await signer.getRecommendedAddressObj();
      const script = addrObj.script;
      const address = await signer.getRecommendedAddress();
      log("authenticator_info", { addressPreview: address.slice(0, 10) + "..." });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          address,
          script: {
            codeHash: script.codeHash,
            hashType: script.hashType,
            args: script.args,
          } as ScriptJson,
        }),
      };
    } catch (e) {
      log("get_error", { message: (e as Error)?.message });
      return { statusCode: 500, body: JSON.stringify({ success: false, error: "internal_error" }) };
    }
  }

  if (event.httpMethod !== "POST") {
    log("method_not_allowed");
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      log("config_error", { botTokenPresent: !!botToken });
      return { statusCode: 500, body: "Missing TELEGRAM_BOT_TOKEN" };
    }

    let body: any = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      log("body_parse_error", { message: (e as Error)?.message });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "invalid_json" }),
      };
    }
    const txLike = body.tx as TransactionLikeJson | undefined;

    if (!txLike) {
      log("missing_tx_like");
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "missing_tx" }) };
    }

    // Derive authenticator lock to locate the data cell
    const serverKey = process.env.TELEGRAM_AUTH_PRIVATE_KEY as Hex | undefined;
    const rpcUrl = process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev";
    if (!serverKey) {
      log("config_error_post", { hasServerKey: !!serverKey });
      return { statusCode: 500, body: JSON.stringify({ success: false, error: "missing_private_key" }) };
    }
    const client = new ccc.ClientPublicTestnet({ url: rpcUrl });
    const serverSigner = new ccc.SignerCkbPrivateKey(client, serverKey as ccc.Hex);
    const addrObj = await serverSigner.getRecommendedAddressObj();
    const authScript = addrObj.script;

    // Find the output locked by authenticator and parse its data
    const outputIndex = txLike.outputs.findIndex((o) =>
      o.lock.codeHash === authScript.codeHash &&
      o.lock.hashType === authScript.hashType &&
      o.lock.args.toLowerCase() === authScript.args.toLowerCase()
    );
    if (outputIndex === -1) {
      log("auth_output_not_found");
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "auth_output_missing" }) };
    }
    const rawData = txLike.outputsData[outputIndex] as Hex | undefined;
    if (!rawData || rawData === "0x") {
      log("auth_output_empty_data", { outputIndex });
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "auth_output_empty_data" }) };
    }

    // Decode JSON from hex
    let cellData: TelegramAuthCellData;
    try {
      const bytes = ccc.bytesFrom(rawData);
      const s = Buffer.from(bytes).toString("utf8");
      cellData = JSON.parse(s) as TelegramAuthCellData;
    } catch (e) {
      log("auth_output_data_parse_error", { message: (e as Error)?.message });
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "invalid_auth_output_data" }) };
    }

    if (cellData.kind !== "ckboost/telegram_auth" || !cellData.auth) {
      log("auth_output_data_invalid_kind", { kind: cellData.kind });
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "invalid_auth_output_kind" }) };
    }

    // Build AuthDataMap for validator from embedded data
    const telegram = cellData.auth;
    const keys = Object.keys(telegram || {});
    const auth_date_raw = telegram["auth_date"] as string | number | undefined;
    const auth_date_num = auth_date_raw !== undefined ? Number(auth_date_raw) : undefined;
    const now = Math.floor(Date.now() / 1000);
    const disableTtl = process.env.TELEGRAM_AUTH_DISABLE_TTL === 'true';
    const ttl = disableTtl ? Number.MAX_SAFE_INTEGER : Number(process.env.TELEGRAM_AUTH_TTL_SEC || 600);
    const dataAge = auth_date_num !== undefined ? now - auth_date_num : undefined;
    log("incoming_tx_payload", {
      has_auth_output: true,
      outputIndex,
      fields: keys,
      has_id: keys.includes("id"),
      has_username: keys.includes("username"),
      has_first_name: keys.includes("first_name"),
      has_hash: keys.includes("hash"),
      hash_preview: mask(telegram["hash"] as string | undefined),
      auth_date: auth_date_num,
      now,
      dataAge,
      ttl,
      disableTtl,
    });

    const dataMap: AuthDataMap = new Map<string, string | number>();
    const fill = (k: string) => {
      const v = telegram[k];
      if (typeof v === "string" || typeof v === "number") dataMap.set(k, v);
    };
    ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"].forEach(fill);

    const validator = new AuthDataValidator({ botToken, inValidateDataAfter: ttl });
    let user: TelegramUserData & { auth_date?: number | string };
    try {
      user = await validator.validate<TelegramUserData & { auth_date?: number | string }>(dataMap);
    } catch (e) {
      const err = e as Error;
      log("validator_error", {
        message: err?.message,
        type: err?.name,
        dataMapKeys: Array.from(dataMap.keys()),
        hasHash: dataMap.has("hash"),
        hasAuthDate: dataMap.has("auth_date"),
        authDate: auth_date_num,
        dataAge,
        ttl,
      });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "invalid_telegram_auth",
          ...(isDev ? { message: err?.message } : {}),
        }),
      };
    }

    // Compute tx hash and sign with authenticator key (attestation)
    let txHash: string | undefined;
    let serverSignature: string | undefined;
    try {
      const tx = ccc.Transaction.from(txLike as ccc.TransactionLike);
      txHash = tx.hashFull();
      serverSignature = await serverSigner.signMessageRaw(txHash);
    } catch (e) {
      log("signing_error", { message: (e as Error)?.message });
      // Still return validation success if signing fails
    }

    log("validated_success", {
      user_id: (user as unknown as { id?: number | string })?.id,
      username: (user as unknown as { username?: string })?.username,
      has_photo_url: !!(user as unknown as { photo_url?: string })?.photo_url,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, txHash, serverSignature }),
    };
  } catch (err) {
    const e = err as Error;
    log("unhandled_error", { message: e?.message, stack: e?.stack?.split('\n').slice(0, 3).join(' | ') });
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "invalid_telegram_auth" }),
    };
  }
};

export default handler;
