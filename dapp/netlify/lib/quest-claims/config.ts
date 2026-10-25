import { ccc } from "@ckb-ccc/core";
import type { ClaimScriptConfigLike } from "@usevellum/sdk";

export const CKBOOST_QUEST_CLAIM_SCHEMA_ID = "ckboost.quest.v1";
export const CKBOOST_QUEST_CLAIM_SCHEMA_HASH =
  "0x6f0fe424320c73627ac544d6666841623c2b15b88ffc93818dc9f78752dd8fae";
export const CKBOOST_ISSUER_DID = "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2";

export const CLAIMABLE_POOL_LOCK_CODE_HASH =
  "0x458cacb13a3c40e6d046468e7fe3f5c2c93f0581062e269dc9ffec4858346cb6";
export const CKBOOST_CAMPAIGN_TYPE_CODE_HASH =
  "0x0bf18a83f13ec240d84b322ee8b1827b811137024749c7d5fbf4d6bdeed81778";
export const CKBOOST_POINTS_UDT_CODE_HASH =
  "0xfcb4b762e3222b603771811b8abe6b054a480a0f5d8011fd9fff266d72189a5e";
export const CKBOOST_USER_TYPE_CODE_HASH =
  "0xe78893f4703d27e6dc9a8a6495ab86f2e14d51f83c0eb21de0ae5e4437027fe6";

const CLAIM_DEPLOYMENT_TX =
  "0xaf693346282063a5d51f79d180fc807cdba1b8ac9d7af30085ff0aa190e2686c";

function scriptInfo(codeHash: ccc.Hex, index: number): ccc.ScriptInfoLike {
  return {
    codeHash,
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: { txHash: CLAIM_DEPLOYMENT_TX, index },
          depType: "code",
        },
      },
    ],
  };
}

export const claimScripts = {
  claimType: scriptInfo(
    "0xfb2757e524b3f83161d8b85b8b3e00186e2019ff04f5dfe833c5a72731e13157",
    0,
  ),
  didLock: scriptInfo(
    "0xe1562cc57b4bd91619ada2f7e74d63805ea7038a7b6de0b18a529d51aa883d2d",
    1,
  ),
} satisfies ClaimScriptConfigLike;

export type QuestClaimEnvironment = {
  CKBOOST_VELLUM_MIN_CONFIRMATIONS?: string;
  CKBOOST_VELLUM_ISSUER_EVM_PRIVATE_KEY?: string;
  NEXT_PUBLIC_CKB_RPC_URL?: string;
  NEXT_PUBLIC_PROTOCOL_TYPE_ARGS?: string;
  NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH?: string;
  NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE?: string;
  [key: string]: string | undefined;
};

const DEFAULT_CKB_RPC_URL = "https://testnet.ckb.dev";
const CODE_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SCRIPT_ARGS_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const HASH_TYPES = new Set<ccc.HashType>([
  "data",
  "data1",
  "data2",
  "type",
]);

function isHashType(value: string): value is ccc.HashType {
  return HASH_TYPES.has(value as ccc.HashType);
}

export function trustedProtocolTypeHash(
  environment: QuestClaimEnvironment,
): ccc.Hex {
  const codeHash = environment.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH?.trim();
  const hashType = environment.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE?.trim();
  const args = environment.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS?.trim();
  if (
    !codeHash ||
    !CODE_HASH_PATTERN.test(codeHash) ||
    !hashType ||
    !isHashType(hashType) ||
    !args ||
    !SCRIPT_ARGS_PATTERN.test(args)
  ) {
    throw new Error(
      "The trusted CKBoost protocol Type Script configuration is invalid.",
    );
  }
  return ccc.Script.from({
    args,
    codeHash,
    hashType,
  }).hash();
}

export function rpcUrl(environment: QuestClaimEnvironment): string {
  const value =
    environment.NEXT_PUBLIC_CKB_RPC_URL ?? DEFAULT_CKB_RPC_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The CKB RPC URL is invalid.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("The CKB RPC URL is invalid.");
  }
  return url.toString();
}

export function requiredRewardConfirmations(
  environment: QuestClaimEnvironment,
): number {
  const value = Number(environment.CKBOOST_VELLUM_MIN_CONFIRMATIONS ?? 6);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(
      "CKBOOST_VELLUM_MIN_CONFIRMATIONS must be between 1 and 100.",
    );
  }
  return value;
}
