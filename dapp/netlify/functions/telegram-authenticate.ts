import type { Handler } from "@netlify/functions";
import { AuthDataValidator } from "@telegram-auth/server";
import type { TelegramUserData } from "@telegram-auth/server";
import { urlStrToAuthDataMap } from "@telegram-auth/server/utils";
import { ccc } from "@ckb-ccc/shell";
import { ccc as didCcc } from "@ckb-ccc/core";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import type {
  DidVerificationData,
  TelegramVerificationData,
  VerificationDataEntries,
} from "@/lib/types/identity";
import {
  hasMatchingVerificationEntry,
  isTelegramBindingConsistent,
} from "@/lib/identity/verification-data";
import { bytesFrom } from "../../../../ccc/packages/core/src/bytes/index";
import { stringify } from "../../../../ccc/packages/core/src/utils/index";
import { createLogger } from "@/netlify/lib/log";
import {
  ensureProxyAdminCellPair,
  ProxyAdminCellError,
} from "@/netlify/lib/proxy-admin";
import {
  decodeUserData,
  findUserCellInput,
  findUserCellOutput,
  normalizeUserData,
} from "@/netlify/lib/user-data";
import { ensureFieldRestrictions } from "@/netlify/lib/utils";
import { validateDidVerification } from "@/netlify/lib/did-verification";

const validatorLogger = createLogger("telegram-authenticate:validate");

// Types for safer payload handling
type Hex = string;

export const handler: Handler = async (event) => {
  const reqId = Math.random().toString(36).slice(2, 8);
  const isDev =
    process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV !== "production";
  const logger = createLogger(`telegram-authenticate:${reqId}`);
  const mask = (val?: string | number | null) => {
    if (val === undefined || val === null) return val;
    const s = String(val);
    if (s.length <= 8) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  };

  logger.info("request", {
    method: event.httpMethod,
    path: event.path,
    query: event.rawQuery || event.queryStringParameters,
  });

  logger.log("JSON Body", event.body);

  if (event.httpMethod !== "POST") {
    logger.warn("method_not_allowed");
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    let tx;
    try {
      tx = ccc.Transaction.fromBytes(event.body as ccc.Hex);
    } catch (e) {
      logger.error("body_parse_error", { message: (e as Error)?.message });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "invalid_json" }),
      };
    }

    if (!tx) {
      logger.error("missing_tx");
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "missing_tx" }),
      };
    }

    // Derive authenticator lock to locate the data cell
    const serverKey = process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY as
      | Hex
      | undefined;
    const rpcUrl =
      process.env.NEXT_PUBLIC_CKB_RPC_URL || "https://testnet.ckb.dev";
    if (!serverKey) {
      logger.error("config_error_post", { hasServerKey: !!serverKey });
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: "missing_private_key" }),
      };
    }
    const client = new ccc.ClientPublicTestnet({ url: rpcUrl });
    const didClient = new didCcc.ClientPublicTestnet({
      url: rpcUrl,
      fallbacks: [],
      timeout: 10_000,
    });
    const serverSigner = new ccc.SignerCkbPrivateKey(
      client,
      serverKey as ccc.Hex
    );

    const network = deploymentManager.getCurrentNetwork();
    const userCellCodeHash = deploymentManager.getContractCodeHash(
      network,
      "ckboostUserType"
    );

    if (!userCellCodeHash) {
      logger.error("user_type_code_hash_missing");
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: "user_type_code_hash_missing",
        }),
      };
    }
    // Find the user cell and parse its data
    const userCellOutput = findUserCellOutput({
      tx,
      userTypeCodeHash: userCellCodeHash,
    });

    if (!userCellOutput) {
      logger.error("auth_output_not_found");
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "auth_output_missing" }),
      };
    }
    const userCellOutputIndex = userCellOutput.index;
    const rawData = userCellOutput.outputData as ccc.Hex | undefined;
    if (!rawData || rawData === "0x") {
      logger.error("auth_output_empty_data", { userCellOutputIndex });
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "auth_output_empty_data",
        }),
      };
    }

    // Decode JSON from hex
    let userData;
    let userVerificationDataArray: VerificationDataEntries[];
    try {
      userData = decodeUserData(rawData);
      const userVerificationDataArrayHex =
        userData.verification_data.identity_verification_data;
      const bytes = ccc.bytesFrom(userVerificationDataArrayHex);
      const s = Buffer.from(bytes).toString("utf8");
      logger.log("user_verification_data_array_string", s);
      if (!s || !s.trim()) {
        userVerificationDataArray = [];
      } else {
        const parsed = JSON.parse(s) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error("Identity verification data must be an array");
        }
        userVerificationDataArray = parsed as VerificationDataEntries[];
      }
      logger.log(
        "user_verification_data_array",
        JSON.stringify(userVerificationDataArray)
      );
    } catch (e) {
      logger.error("auth_output_data_parse_error", {
        message: (e as Error)?.message,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "invalid_auth_output_data",
        }),
      };
    }

    const expectedUserLockHash = userCellOutput.cellOutput.lock.hash();
    const userCellInput = await findUserCellInput({
      tx,
      client,
      userTypeCodeHash: userCellCodeHash,
      expectedLockHash: expectedUserLockHash,
    });
    let previousIdentityData: unknown;

    if (userCellInput) {
      try {
        const previousUserData = decodeUserData(userCellInput.outputData);
        previousIdentityData =
          previousUserData.verification_data.identity_verification_data;
        const normalizedPrevious = normalizeUserData(previousUserData);
        const normalizedNext = normalizeUserData(userData);
        ensureFieldRestrictions({
          previous: normalizedPrevious,
          next: normalizedNext,
          mode: "whitelist",
          fields: [
            "verification_data",
            "last_activity_timestamp",
            "profile_data",
          ],
        });
      } catch (error) {
        const err = error as Error;
        logger.error("user_data_invariant_violation", {
          message: err.message,
        });
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: "user_data_invariant_violation",
            message: err.message,
          }),
        };
      }
    } else {
      //TODO: Additional check for new user cell creation
    }

    let invalidated = false;
    try {
      if (
        !isTelegramBindingConsistent(
          userVerificationDataArray,
          userData.verification_data.telegram_personal_chat_id
        )
      ) {
        throw new Error(
          "Telegram verification does not match the bound chat ID"
        );
      }
      const seenSources = new Set<string>();
      for (const verificationData of userVerificationDataArray) {
        if (
          !verificationData ||
          typeof verificationData.source !== "string" ||
          !verificationData.data ||
          typeof verificationData.data !== "object"
        ) {
          throw new Error("Malformed identity verification entry");
        }
        if (seenSources.has(verificationData.source)) {
          throw new Error(
            `Duplicate verification source: ${verificationData.source}`
          );
        }
        seenSources.add(verificationData.source);
        logger.info("validating verification data", {
          source: verificationData.source,
        });
        switch (verificationData.source) {
          case "telegram": {
            if (
              previousIdentityData &&
              hasMatchingVerificationEntry(
                previousIdentityData,
                verificationData
              )
            ) {
              break;
            }
            const telegramVerificationData =
              verificationData.data as TelegramVerificationData;
            const url = `https://feature-identity-verification--ckboost.netlify.app/identity?id=${telegramVerificationData.id}&first_name=${telegramVerificationData.first_name}&username=${telegramVerificationData.username}&photo_url=${telegramVerificationData.photo_url}&auth_date=${telegramVerificationData.auth_date}&hash=${telegramVerificationData.hash}`;
            await validateTelegramAuth(url);
            break;
          }
          case "did":
            await validateDidVerification({
              client: didClient,
              userLock: userCellOutput.cellOutput.lock,
              data: verificationData.data as DidVerificationData,
            });
            break;
          default:
            throw new Error(
              `Unsupported verification source: ${verificationData.source}`
            );
        }
      }
    } catch (e) {
      const err = e as Error;
      logger.error("validator_router_error", {
        message: err?.message,
        type: err?.name,
      });
      invalidated = true;
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "validator_router_error",
          message: err?.message,
        }),
      };
    }
    logger.info("invalidated", invalidated);
    if (invalidated) {
      throw new Error("invalidated_error");
    } else {
      logger.info("validated_success");
      let proxyAuthenticatedTx: ccc.Transaction | undefined;

      try {
        await ensureProxyAdminCellPair({
          tx,
          client,
          signer: serverSigner,
          logger,
        });
      } catch (error) {
        if (error instanceof ProxyAdminCellError) {
          logger.error("proxy_cell_validation_failed", {
            code: error.code,
            details: error.details,
          });
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              success: false,
              error: error.code,
            }),
          };
        }
        throw error;
      }

      // Compute tx hash and sign with authenticator key (attestation)
      try {
        logger.info(
          "Before signing for proxy authentication",
          ccc.stringify(tx)
        );
        proxyAuthenticatedTx = await serverSigner.signTransaction(tx);
        logger.log(
          "proxy_authenticated_tx",
          ccc.stringify(proxyAuthenticatedTx)
        );
      } catch (e) {
        logger.error("signing_error", { message: (e as Error)?.message });
        // Still return validation success if signing fails
      }

      if (!proxyAuthenticatedTx) {
        throw new Error("signing_error_no_tx");
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          txHex: ccc.hexFrom(proxyAuthenticatedTx?.toBytes()),
        }),
      };
    }
  } catch (err) {
    const e = err as Error;
    logger.error("unhandled_error", {
      message: e?.message,
      stack: e?.stack?.split("\n").slice(0, 3).join(" | "),
    });
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "authentication_error" }),
    };
  }
};

async function validateTelegramAuth(url: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  const validator = new AuthDataValidator({
    botToken,
    // inValidateDataAfter: ttl,
  });
  let user: TelegramUserData & { auth_date?: number | string };
  validatorLogger.info("url", url);
  const data = urlStrToAuthDataMap(url);
  try {
    user = await validator.validate(data);
    validatorLogger.info("validated user", user);
  } catch (e) {
    const err = e as Error;
    validatorLogger.error("validateTelegramAuth", {
      message: err?.message,
      type: err?.name,
      dataMapKeys: Array.from(data.keys()),
      hasHash: data.has("hash"),
      hasAuthDate: data.has("auth_date"),
      authDate: data.get("auth_date"),
      dataAge: data.get("data_age"),
      ttl: data.get("ttl"),
    });
    throw err;
  }
}

export default handler;
