import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";
import {
  writeClaim,
  type WriteClaimProps,
  type WriteClaimResult,
} from "@usevellum/sdk";
import { Wallet } from "ethers";

import {
  CKBOOST_ISSUER_DID,
  CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
  claimScripts,
  rpcUrl,
  type QuestClaimEnvironment,
} from "./config";
import type { CkboostQuestClaimPayload } from "./schema";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type PreparedQuestClaim = {
  claimId: ccc.Hex;
  outputIndex: number;
  signedTransaction: ccc.Hex;
  transactionHash: ccc.Hex;
};

type ClaimWriter = (
  props: WriteClaimProps<CkboostQuestClaimPayload>,
) => Promise<WriteClaimResult>;

export class EvmPrivateKeySigner extends ccc.SignerEvm {
  private readonly wallet: Wallet;

  constructor(client: ccc.Client, privateKey: ccc.HexLike) {
    super(client);
    this.wallet = new Wallet(ccc.hexFrom(privateKey));
  }

  async connect(): Promise<void> {}

  async isConnected(): Promise<boolean> {
    return true;
  }

  async getEvmAccount(): Promise<ccc.Hex> {
    return this.wallet.address.toLowerCase() as ccc.Hex;
  }

  async signMessageRaw(message: string | ccc.BytesLike): Promise<ccc.Hex> {
    const value =
      typeof message === "string" ? message : ccc.bytesFrom(message);
    return (await this.wallet.signMessage(value)) as ccc.Hex;
  }
}

export function issuerCredential(environment: QuestClaimEnvironment): ccc.Hex {
  const value = environment.CKBOOST_VELLUM_ISSUER_EVM_PRIVATE_KEY;
  if (!value || !PRIVATE_KEY_PATTERN.test(value)) {
    throw new Error("The CKBoost issuer credential is not configured.");
  }
  return value.toLowerCase() as ccc.Hex;
}

export async function createIssuerSigner(
  environment: QuestClaimEnvironment,
): Promise<EvmPrivateKeySigner> {
  const client = new ccc.ClientPublicTestnet({
    url: rpcUrl(environment),
    fallbacks: [],
    timeout: 10_000,
  });
  const signer = new EvmPrivateKeySigner(client, issuerCredential(environment));
  const issuer = await resolveDidCkb({ client, did: CKBOOST_ISSUER_DID });
  if (!issuer) {
    throw new Error("The CKBoost issuer DID is not active on CKB Testnet.");
  }

  const addresses = await signer.getAddressObjs();
  if (!addresses.some(({ script }) => script.eq(issuer.cell.cellOutput.lock))) {
    throw new Error(
      "The CKBoost issuer credential does not control the live issuer DID.",
    );
  }
  return signer;
}

export type QuestClaimIssuerDependencies = {
  createSigner: (
    environment: QuestClaimEnvironment,
  ) => Promise<EvmPrivateKeySigner>;
  writeClaim: ClaimWriter;
};

const defaultDependencies: QuestClaimIssuerDependencies = {
  createSigner: createIssuerSigner,
  writeClaim,
};

export async function prepareQuestClaim(
  subjectDid: string,
  payload: CkboostQuestClaimPayload,
  issuedAt: number,
  environment: QuestClaimEnvironment,
  dependencies: QuestClaimIssuerDependencies = defaultDependencies,
): Promise<PreparedQuestClaim> {
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    throw new TypeError(
      "Claim issuance time must be a positive Unix timestamp.",
    );
  }

  const signer = await dependencies.createSigner(environment);
  const built = await dependencies.writeClaim({
    issuerSigner: signer,
    scripts: claimScripts,
    input: {
      subject: { did: subjectDid },
      issuerDid: CKBOOST_ISSUER_DID,
      schemaHash: CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
      payload,
      issuedAt,
    },
  });

  const preparedHash = built.tx.hash();
  const signed = await signer.signOnlyTransaction(built.tx);
  if (signed.hash() !== preparedHash) {
    throw new Error("The issuer signer changed the prepared transaction.");
  }

  return {
    claimId: built.claimId,
    outputIndex: built.outputIndex,
    signedTransaction: ccc.hexFrom(signed.toBytes()),
    transactionHash: preparedHash,
  };
}

export async function broadcastPreparedQuestClaim(
  client: ccc.Client,
  signedTransaction: ccc.HexLike,
  expectedHash: ccc.HexLike,
): Promise<ccc.Hex> {
  const tx = ccc.Transaction.fromBytes(signedTransaction);
  const transactionHash = tx.hash();
  if (transactionHash !== ccc.hexFrom(expectedHash)) {
    throw new Error("Stored claim transaction hash does not match its bytes.");
  }
  return client.sendTransaction(tx);
}
