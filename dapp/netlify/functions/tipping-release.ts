import type { Handler } from "@netlify/functions";
import { ccc } from "@ckb-ccc/shell";
import {
  ConnectedTypeID,
  ProtocolData,
  TippingData,
  type ConnectedTypeIDLike,
  type ProtocolDataLike,
  type TippingDataLike,
} from "ssri-ckboost/types";
import { deploymentManager, type Network } from "@/lib/ckb/deployment-manager";
import {
  ensureProxyAdminCellPair,
  ProxyAdminCellError,
} from "@/netlify/lib/proxy-admin";
import { createLogger } from "@/netlify/lib/log";
import { fetchProtocolCell } from "@/netlify/lib/utils";

const logger = createLogger("tipping-release");

type TippingReleaseRequestPayload = {
  txHex?: string;
  tippingTypeId?: string;
};

type TippingReleaseResponseSuccess = {
  success: true;
  txHex: string;
};

type TippingReleaseResponseError = {
  success: false;
  error: string;
  message?: string;
};

type TippingReleaseResponse =
  | TippingReleaseResponseSuccess
  | TippingReleaseResponseError;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return failWith(405, "method_not_allowed", "Only POST is supported.");
  }

  const signingKey = process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;
  if (!signingKey) {
    return failWith(
      500,
      "missing_proxy_key",
      "Server signing key is not configured."
    );
  }

  if (!event.body) {
    return failWith(400, "missing_body", "Request body is required.");
  }

  let payload: TippingReleaseRequestPayload;
  try {
    payload = JSON.parse(event.body) as TippingReleaseRequestPayload;
  } catch (error) {
    return failWith(
      400,
      "invalid_json",
      `Invalid JSON payload: ${(error as Error).message}`
    );
  }

  const txHex = payload.txHex?.trim();
  const tippingTypeId = payload.tippingTypeId?.trim();

  if (!txHex) {
    return failWith(400, "missing_tx", "The txHex field is required.");
  }

  const network = deploymentManager.getCurrentNetwork();
  const rpcUrl =
    process.env.NEXT_PUBLIC_CKB_RPC_URL ||
    process.env.CKB_RPC_URL ||
    (network === "mainnet"
      ? "https://mainnet.ckb.dev"
      : "https://testnet.ckb.dev");
  const client = createClient(network, rpcUrl);
  const signer = new ccc.SignerCkbPrivateKey(client, signingKey as ccc.HexLike);

  let tx: ccc.Transaction;
  try {
    tx = ccc.Transaction.fromBytes(txHex as ccc.HexLike);
  } catch (error) {
    return failWith(
      400,
      "invalid_transaction",
      `Failed to parse transaction: ${(error as Error).message}`
    );
  }

  try {
    await hydrateTransaction(tx, client);
  } catch (error) {
    return failWith(400, "hydrate_failed", (error as Error).message);
  }

  const tippingTypeCodeHash = deploymentManager.getContractCodeHash(
    network,
    "ckboostTippingType"
  );
  if (!tippingTypeCodeHash) {
    return failWith(
      500,
      "missing_tipping_code",
      "Tipping type contract is not configured."
    );
  }

  let tippingInput: ccc.CellInput;
  try {
    ({ tippingInput } = findTippingCells({
      tx,
      tippingTypeCodeHash,
    }));
  } catch (error) {
    return failWith(400, "tipping_cell_not_found", (error as Error).message);
  }

  if (!tippingInput.outputData) {
    return failWith(
      400,
      "tipping_input_missing_data",
      "Tipping input cell is missing output data."
    );
  }

  if (!tippingInput.cellOutput?.type?.args) {
    return failWith(
      400,
      "tipping_input_missing_args",
      "Tipping input cell is missing type arguments."
    );
  }

  const connectedType = decodeConnectedTypeId(
    tippingInput.cellOutput.type.args
  );

  if (
    tippingTypeId &&
    normalizeHex(connectedType.type_id) !== normalizeHex(tippingTypeId)
  ) {
    return failWith(
      400,
      "tipping_mismatch",
      "Tipping cell in transaction does not match requested tipping type."
    );
  }

  let tippingData: TippingDataLike;
  try {
    tippingData = TippingData.decode(
      tippingInput.outputData
    ) as TippingDataLike;
  } catch (error) {
    return failWith(
      400,
      "tipping_decode_failed",
      "Unable to decode tipping data."
    );
  }

  let protocolCell: ccc.Cell | null = null;
  try {
    protocolCell = await fetchProtocolCell(client);
  } catch (error) {
    return failWith(500, "protocol_fetch_failed", (error as Error).message);
  }

  if (!protocolCell) {
    return failWith(
      500,
      "protocol_missing",
      "Protocol cell could not be located."
    );
  }

  let protocolData: ProtocolDataLike;
  try {
    protocolData = ProtocolData.decode(
      protocolCell.outputData
    ) as ProtocolDataLike;
  } catch (error) {
    return failWith(
      400,
      "protocol_decode_failed",
      "Unable to decode protocol data."
    );
  }

  try {
    validateTippingValidity({ tippingData, protocolData });
  } catch (error) {
    return failWith(400, "tipping_not_valid", (error as Error).message);
  }

  try {
    ensureAdminInput({
      protocolData,
      tx,
    });
  } catch (error) {
    return failWith(400, "admin_input_missing", (error as Error).message);
  }

  try {
    await ensureProxyAdminCellPair({ tx, client, signer, logger });
  } catch (error) {
    if (error instanceof ProxyAdminCellError) {
      return failWith(400, error.code, error.message);
    }
    return failWith(
      400,
      "proxy_cell_validation_failed",
      (error as Error).message
    );
  }

  let signedTx: ccc.Transaction;
  try {
    signedTx = await signer.signTransaction(tx);
  } catch (error) {
    return failWith(
      500,
      "signing_failed",
      `Failed to sign transaction: ${(error as Error).message}`
    );
  }

  logger.info("tipping_release_success", {
    tippingTypeId: normalizeHex(connectedType.type_id),
  });

  return httpResponse(200, {
    success: true,
    txHex: ccc.hexFrom(signedTx.toBytes()),
  });
};

export default handler;

const httpResponse = (statusCode: number, body: TippingReleaseResponse) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const failWith = (statusCode: number, error: string, message: string) => {
  logger.error("tipping_release_failed", {
    error,
    message,
  });
  return httpResponse(statusCode, {
    success: false,
    error,
    message,
  });
};

const createClient = (network: Network, url: string): ccc.Client => {
  if (network === "mainnet") {
    return new ccc.ClientPublicMainnet({ url });
  }
  return new ccc.ClientPublicTestnet({ url });
};

const normalizeHex = (value: ccc.HexLike | string): string =>
  ccc.hexFrom(value as ccc.HexLike).toLowerCase();

const hydrateTransaction = async (
  tx: ccc.Transaction,
  client: ccc.Client
): Promise<void> => {
  for (let i = 0; i < tx.inputs.length; i += 1) {
    const previousOutput = tx.inputs[i].previousOutput;
    if (!previousOutput) {
      throw new Error("Input cell missing previous output reference.");
    }
    const resolved = await client.getCell(previousOutput);
    if (!resolved) {
      throw new Error("Unable to resolve input cell from blockchain.");
    }
    tx.inputs[i] = ccc.CellInput.from({
      previousOutput: resolved.outPoint,
      since: tx.inputs[i].since ?? "0x0",
      cellOutput: resolved.cellOutput,
      outputData: resolved.outputData,
    });
  }

  for (let i = 0; i < tx.outputs.length; i += 1) {
    const output = tx.outputs[i];
    if (output.type) {
      tx.outputs[i] = ccc.CellOutput.from(
        { lock: output.lock, type: output.type },
        tx.outputsData[i] as ccc.HexLike
      );
    }
  }
};

const findTippingCells = ({
  tx,
  tippingTypeCodeHash,
}: {
  tx: ccc.Transaction;
  tippingTypeCodeHash: string;
}) => {
  let tippingInputIndex = -1;
  for (let i = 0; i < tx.inputs.length; i += 1) {
    const type = tx.inputs[i].cellOutput?.type;
    if (
      type &&
      normalizeHex(type.codeHash) === normalizeHex(tippingTypeCodeHash)
    ) {
      if (tippingInputIndex !== -1) {
        throw new Error("Multiple tipping inputs detected.");
      }
      tippingInputIndex = i;
    }
  }
  if (tippingInputIndex === -1) {
    throw new Error("Tipping input cell not found.");
  }

  let tippingOutputIndex = -1;
  for (let i = 0; i < tx.outputs.length; i += 1) {
    const type = tx.outputs[i].type;
    if (
      type &&
      normalizeHex(type.codeHash) === normalizeHex(tippingTypeCodeHash)
    ) {
      if (tippingOutputIndex !== -1) {
        throw new Error("Multiple tipping outputs detected.");
      }
      tippingOutputIndex = i;
    }
  }
  if (tippingOutputIndex === -1) {
    throw new Error("Tipping output cell not found.");
  }

  const tippingInput = tx.inputs[tippingInputIndex];
  const tippingOutput = tx.outputs[tippingOutputIndex];
  const tippingOutputData = tx.outputsData[tippingOutputIndex];
  if (!tippingOutputData) {
    throw new Error("Tipping output data missing.");
  }

  return {
    tippingInput,
    tippingOutput,
    tippingOutputData: ccc.hexFrom(tippingOutputData as ccc.HexLike),
  };
};

const decodeConnectedTypeId = (
  args: string | undefined
): { type_id: ccc.HexLike; connected_key: ccc.HexLike } => {
  if (!args) {
    throw new Error("Tipping type arguments missing.");
  }
  const decoded = ConnectedTypeID.decode(
    ccc.bytesFrom(args)
  ) as ConnectedTypeIDLike;
  return {
    type_id: ccc.hexFrom(decoded.type_id),
    connected_key: ccc.hexFrom(decoded.connected_key),
  };
};

const validateTippingValidity = ({
  tippingData,
  protocolData,
}: {
  tippingData: TippingDataLike;
  protocolData: ProtocolDataLike;
}): void => {
  const creationTimestampMs = normalizeTimestampMs(
    tippingData.metadata?.creation_timestamp
  );
  if (creationTimestampMs === 0n) {
    throw new Error("Tipping is missing a creation timestamp.");
  }

  const expirationDurationMs =
    toBigInt(protocolData.tipping_config?.expiration_duration) * 1000n;
  if (expirationDurationMs === 0n) {
    return;
  }

  const expiresAt = creationTimestampMs + expirationDurationMs;
  const now = BigInt(Date.now());
  if (now > expiresAt) {
    throw new Error("Tipping proposal has expired.");
  }
};

const ensureAdminInput = ({
  protocolData,
  tx,
}: {
  protocolData: ProtocolDataLike;
  tx: ccc.Transaction;
}): void => {
  const admins =
    protocolData.protocol_config?.admin_lock_hash_vec?.map(normalizeHex) ?? [];
  if (admins.length === 0) {
    throw new Error("Protocol configuration has no admin lock hashes.");
  }
  const adminSet = new Set(admins);
  const hasAdminInput = tx.inputs.some((input) => {
    const lock = input.cellOutput?.lock;
    if (!lock) {
      return false;
    }
    return adminSet.has(normalizeHex(lock.hash()));
  });

  if (!hasAdminInput) {
    throw new Error("Transaction must include an admin input cell.");
  }
};

const normalizeTimestampMs = (value: ccc.NumLike | undefined): bigint => {
  const raw = toBigInt(value);
  if (raw === 0n) {
    return 0n;
  }
  return raw < 10_000_000_000n ? raw * 1000n : raw;
};

const toBigInt = (value: ccc.NumLike | undefined): bigint =>
  BigInt(value === undefined ? 0 : ccc.numFrom(value));
