import { ccc } from "@ckb-ccc/connector-react";
import { TESTNET_CODE_RELEASES, validateTestnetRelease, type TestnetCodeId } from "./testnet-code-releases";
export { isTestnetSetupEnabled } from "./testnet-setup-config";
export { TESTNET_CODE_RELEASES, validateTestnetRelease } from "./testnet-code-releases";
export type { TestnetCodeId } from "./testnet-code-releases";
export const TYPE_ID_CODE_HASH = "0x00000000000000000000000000000000000000000000000000545950455f4944";
const ZERO_ARGS = `0x${"00".repeat(32)}` as ccc.Hex;
export type DeploymentGuard = () => boolean;
export const TESTNET_JOYID_CODE_HASH = "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac";
export const TESTNET_JOYID_RAW_LIMIT = 128 * 1024;
const INDEPENDENT_USER_CODE_OWNER = "0xf3da4d6310b03c2c62f3ce5d6b1573da3432549b7e2faa78d84e4a6e7b245192";
function assertCodeOwner(id: TestnetCodeId, lock: ccc.Script): void {
  if (id === "user-type" && lock.hash() !== INDEPENDENT_USER_CODE_OWNER) {
    throw new Error("Connect the specified deployment Admin wallet to create the independent UserType code cell.");
  }
}

/** The currently deployed Testnet JoyID binary has a 128-KiB raw transaction parser limit. */
export function assertTestnetJoyIdRawSize(tx: ccc.Transaction, walletLock: ccc.Script): void {
  if (walletLock.codeHash !== TESTNET_JOYID_CODE_HASH || walletLock.hashType !== "type") return;
  const rawBytes = tx.rawToBytes().length;
  if (rawBytes > TESTNET_JOYID_RAW_LIMIT) {
    throw new Error(`The currently deployed Testnet JoyID lock cannot handle this deployment: the raw transaction is ${rawBytes.toLocaleString("en-US")} bytes, exceeding its 128 KiB (131,072-byte) limit. Switch to a deployment wallet that supports this transaction size before preparing or signing. No wallet signature was requested.`);
  }
}

export function assertTestnetDeploymentClient(client: Pick<ccc.Client, "addressPrefix" | "url">): void {
  let url: URL;
  try { url = new URL(client.url); } catch { throw new Error("A public CKB Testnet client is required."); }
  if (client.addressPrefix !== "ckt" || !["https:", "wss:"].includes(url.protocol) ||
    !["testnet.ckb.dev", "testnet.ckbapp.dev"].includes(url.hostname) || url.port) {
    throw new Error("This tool only supports the public CKB Testnet. Switch the connected CCC client to Testnet.");
  }
}

export function getTestnetCodeCapacity(byteLength: number, lock: ccc.ScriptLike): bigint {
  if (!Number.isSafeInteger(byteLength) || byteLength < 64 || byteLength > 512000) throw new Error("Invalid code byte length.");
  const output = ccc.CellOutput.from({ lock, type: { codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: ZERO_ARGS } });
  return ccc.fixedPointFrom(output.occupiedSize + byteLength);
}

function ensureCurrent(isCurrent: DeploymentGuard): void {
  if (!isCurrent()) throw new Error("The wallet, network, file, or operation changed. Prepare the deployment again.");
}

/** A deadline never starts another request; expired work must check isCurrent before continuing. */
export async function deploymentReadDeadline<T>(work: Promise<T>, timeoutMs = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("The Testnet read timed out. Retry this read; it does not request a wallet signature.")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export type PreparedCodeDeployment = {
  id: TestnetCodeId;
  tx: ccc.Transaction;
  bodyHash: ccc.Hex;
  dataHash: ccc.Hex;
  typeScript: ccc.Script;
  typeHash: ccc.Hex;
  capacity: bigint;
  fee: bigint;
  walletLock: ccc.Script;
  walletAddress: string;
  byteLength: number;
};

async function assertWallet(signer: ccc.Signer, lock: ccc.Script, isCurrent: DeploymentGuard): Promise<void> {
  ensureCurrent(isCurrent);
  assertTestnetDeploymentClient(signer.client);
  const address = await signer.getRecommendedAddressObj();
  ensureCurrent(isCurrent);
  if (!address.script.eq(lock)) throw new Error("The connected wallet changed. Prepare the deployment again.");
}

/** Reject typed/data inputs: a fresh deployment must never consume an existing code/protocol cell. */
async function assertPlainWalletInputs(tx: ccc.Transaction, signer: ccc.Signer, lock: ccc.Script, isCurrent: DeploymentGuard): Promise<void> {
  const seen = new Set<string>();
  for (const input of tx.inputs) {
    ensureCurrent(isCurrent);
    const key = `${input.previousOutput.txHash}:${input.previousOutput.index}`;
    if (seen.has(key)) throw new Error("Duplicate capacity input.");
    seen.add(key);
    const cell = await deploymentReadDeadline(signer.client.getCellLive(input.previousOutput), 12000);
    ensureCurrent(isCurrent);
    if (!cell || cell.cellOutput.type || cell.outputData !== "0x" || !cell.cellOutput.lock.eq(lock)) {
      throw new Error("Only live, empty, untyped capacity cells owned by the connected wallet may fund this new deployment.");
    }
  }
  if (!tx.inputs.length) throw new Error("No wallet capacity input was selected.");
}

export async function prepareTestnetCodeDeployment(
  signer: ccc.Signer, id: TestnetCodeId, bytes: Uint8Array, isCurrent: DeploymentGuard = () => true,
): Promise<PreparedCodeDeployment> {
  ensureCurrent(isCurrent);
  assertTestnetDeploymentClient(signer.client);
  const release = validateTestnetRelease(id, bytes);
  const address = await signer.getRecommendedAddressObj();
  ensureCurrent(isCurrent);
  const walletLock = address.script.clone();
  assertCodeOwner(id, walletLock);
  const typeScript = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: ZERO_ARGS });
  const capacity = getTestnetCodeCapacity(bytes.byteLength, walletLock);
  const tx = ccc.Transaction.from({
    outputs: [{ capacity, lock: walletLock, type: typeScript }], outputsData: [ccc.hexFrom(bytes)],
  });
  // The reviewed binary alone already exceeds this lock's limit. Stop before input collection/RPC.
  assertTestnetJoyIdRawSize(tx, walletLock);
  await tx.completeInputsAtLeastOne(signer);
  await assertWallet(signer, walletLock, isCurrent);
  // Input 0 and output 0 are now fixed. Capacity/fee completion only appends inputs/change.
  tx.outputs[0].type!.args = ccc.hashTypeId(tx.inputs[0], 0);
  const expectedType = tx.outputs[0].type!.clone();
  await tx.completeInputsByCapacity(signer);
  await assertWallet(signer, walletLock, isCurrent);
  const prepared = await signer.prepareTransaction(tx);
  ensureCurrent(isCurrent);
  if (prepared !== tx) tx.copy(prepared);
  await tx.completeFeeBy(signer);
  await assertWallet(signer, walletLock, isCurrent);
  await assertPlainWalletInputs(tx, signer, walletLock, isCurrent);
  assertFreshCodeOutput(tx, expectedType, walletLock, release.dataHash, capacity);
  const fee = await tx.getFee(signer.client);
  ensureCurrent(isCurrent);
  if (fee <= 0n) throw new Error("The prepared transaction does not include a positive network fee.");
  assertTestnetJoyIdRawSize(tx, walletLock);
  return { id, tx, bodyHash: tx.hash(), ...release, typeScript: expectedType, typeHash: expectedType.hash(),
    capacity, fee, walletLock, walletAddress: address.toString(), byteLength: bytes.byteLength };
}

function assertFreshCodeOutput(tx: ccc.Transaction, expectedType: ccc.Script, lock: ccc.Script, dataHash: ccc.Hex, capacity: bigint): void {
  if (!tx.outputs[0]?.type?.eq(expectedType) || !tx.outputs[0].lock.eq(lock) || tx.outputs[0].capacity !== capacity ||
    ccc.hashCkb(tx.outputsData[0]) !== dataHash || expectedType.args !== ccc.hashTypeId(tx.inputs[0], 0)) {
    throw new Error("The new code cell changed during transaction preparation. Prepare again.");
  }
  for (let i = 1; i < tx.outputs.length; i++) {
    if (tx.outputs[i].type || !tx.outputs[i].lock.eq(lock) || (tx.outputsData[i] ?? "0x") !== "0x") {
      throw new Error("Unexpected output: only the new code cell and empty wallet change are allowed.");
    }
  }
}

/** Called only by the explicit Deploy button; preparation never signs or broadcasts. */
export class CodeBroadcastStatusUnknownError extends Error {
  constructor(public readonly txHash: ccc.Hex, cause: unknown) {
    super(`The RPC did not confirm broadcast status: ${cause instanceof Error ? cause.message : "unknown response"}. Check transaction ${txHash} before preparing another deployment.`);
    this.name = "CodeBroadcastStatusUnknownError";
  }
}

/** Public on-chain bytes only. Never serialize the signer, wallet connection, or RPC request object. */
export type SignedCodeDeploymentDiagnostic = {
  schema: "ckboost-testnet-code-signed-diagnostic/v1";
  network: "testnet";
  contract: TestnetCodeId;
  signedTransaction: ccc.Hex;
  transactionHash: ccc.Hex;
  preparedBodyHash: ccc.Hex;
  release: { dataHash: ccc.Hex; byteLength: number };
  walletLock: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
  typeScript: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
};

function publicScript(script: ccc.Script): SignedCodeDeploymentDiagnostic["walletLock"] {
  return { codeHash: script.codeHash, hashType: script.hashType, args: script.args };
}

/** Offline restore validates the bytes and rebuilds a whitelist; it cannot prove current input liveness. */
export function parseSignedCodeDeploymentDiagnostics(raw: string | null): SignedCodeDeploymentDiagnostic[] {
  if (!raw || raw.length > 2 * 1024 * 1024) return [];
  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > 2) return [];
    const restored: SignedCodeDeploymentDiagnostic[] = [];
    const seen = new Set<TestnetCodeId>();
    for (const entry of entries) {
      try {
        if (!entry || typeof entry !== "object") continue;
        const value = entry as SignedCodeDeploymentDiagnostic;
        if (value.schema !== "ckboost-testnet-code-signed-diagnostic/v1" || value.network !== "testnet" ||
          !Object.prototype.hasOwnProperty.call(TESTNET_CODE_RELEASES, value.contract) || seen.has(value.contract) ||
          typeof value.signedTransaction !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value.signedTransaction) ||
          !/^0x[0-9a-fA-F]{64}$/.test(value.transactionHash) || !/^0x[0-9a-fA-F]{64}$/.test(value.preparedBodyHash)) continue;
        const release = TESTNET_CODE_RELEASES[value.contract];
        if (value.release?.byteLength !== release.byteLength || value.release?.dataHash !== release.dataHash) continue;
        const tx = ccc.Transaction.fromBytes(value.signedTransaction);
        const hex = ccc.hexFrom(tx.toBytes());
        if (hex !== value.signedTransaction.toLowerCase() || tx.hash() !== value.transactionHash.toLowerCase() ||
          tx.hash() !== value.preparedBodyHash.toLowerCase() || !tx.inputs.length || tx.inputs.length > 100 ||
          tx.outputsData.length !== tx.outputs.length) continue;
        const walletLock = ccc.Script.from(value.walletLock), typeScript = ccc.Script.from(value.typeScript);
        assertCodeOwner(value.contract, walletLock);
        if (typeScript.codeHash !== TYPE_ID_CODE_HASH || typeScript.hashType !== "type" ||
          !/^0x[0-9a-f]{64}$/.test(typeScript.args) || ccc.bytesFrom(tx.outputsData[0]).length !== release.byteLength) continue;
        assertFreshCodeOutput(tx, typeScript, walletLock, release.dataHash, getTestnetCodeCapacity(release.byteLength, walletLock));
        restored.push({ schema: value.schema, network: "testnet", contract: value.contract,
          signedTransaction: hex, transactionHash: tx.hash(), preparedBodyHash: tx.hash(),
          release: { dataHash: release.dataHash, byteLength: release.byteLength },
          walletLock: publicScript(walletLock), typeScript: publicScript(typeScript) });
        seen.add(value.contract);
      } catch { /* A malformed entry must never restore arbitrary wallet/account objects. */ }
    }
    return restored;
  } catch { return []; }
}

export class CodeDeploymentRejectedError extends Error {
  constructor(public readonly txHash: ccc.Hex, public readonly stage: "preflight" | "broadcast", reason: string) {
    super(`The Testnet node rejected this transaction during ${stage}: ${reason}. This transaction is not awaiting confirmation. Keep the signed diagnostic for inspection; do not repeat the wallet request automatically.`);
    this.name = "CodeDeploymentRejectedError";
  }
}

/** A failed read-only preflight never submits a transaction and is not an ambiguous broadcast. */
export class CodeDeploymentPreflightError extends Error {
  constructor(public readonly txHash: ccc.Hex, reason: string) {
    super(`Read-only Testnet script verification did not complete: ${reason}. Nothing was broadcast. The signed diagnostic is available for inspection.`);
    this.name = "CodeDeploymentPreflightError";
  }
}

function nodeFailure(cause: unknown): { rejected: boolean; reason: string } {
  const texts: string[] = [];
  let rejected = false;
  const visited = new Set<unknown>();
  const inspect = (value: unknown, depth: number) => {
    if (!value || depth > 3 || visited.has(value)) return;
    visited.add(value);
    if (typeof value === "string") { texts.push(value); return; }
    if (typeof value !== "object") return;
    const error = value as { code?: unknown; message?: unknown; data?: unknown; cause?: unknown; error?: unknown };
    if (error.code === -302 || error.code === "-302") rejected = true;
    for (const field of [error.message, error.data]) if (typeof field === "string") texts.push(field);
    inspect(error.cause, depth + 1); inspect(error.error, depth + 1);
    if (error.data && typeof error.data === "object") inspect(error.data, depth + 1);
  };
  inspect(cause, 0);
  const reason = texts.join(" — ").slice(0, 4000) || "Unknown RPC response";
  return { rejected: rejected || /TransactionFailedToVerify|TransactionScriptError|ValidationFailure/.test(reason), reason };
}

export type CodeDeploymentSigningOptions = {
  /** Awaited before any preflight or send. Throwing prevents submission. Persist only this whitelist. */
  onSignedDiagnostic?: (snapshot: SignedCodeDeploymentDiagnostic) => void | Promise<void>;
};

export async function signAndBroadcastTestnetCode(
  signer: ccc.Signer, prepared: PreparedCodeDeployment, isCurrent: DeploymentGuard = () => true,
  options: CodeDeploymentSigningOptions = {},
): Promise<ccc.Hex> {
  assertCodeOwner(prepared.id, prepared.walletLock);
  await assertWallet(signer, prepared.walletLock, isCurrent);
  if (prepared.tx.hash() !== prepared.bodyHash) throw new Error("The prepared transaction changed. Prepare it again.");
  // Also reject an oversized proposal prepared before this compatibility guard was installed.
  assertTestnetJoyIdRawSize(prepared.tx, prepared.walletLock);
  assertFreshCodeOutput(prepared.tx, prepared.typeScript, prepared.walletLock, prepared.dataHash, prepared.capacity);
  await assertPlainWalletInputs(prepared.tx, signer, prepared.walletLock, isCurrent);
  await assertWallet(signer, prepared.walletLock, isCurrent);
  const signed = ccc.Transaction.fromBytes((await signer.signTransaction(prepared.tx)).toBytes());
  // Never automatically retry a wallet request or broadcast after an account/scope change.
  await assertWallet(signer, prepared.walletLock, isCurrent);
  if (signed.hash() !== prepared.bodyHash) throw new Error("The wallet changed the transaction body. Nothing was broadcast. Prepare it again.");
  const signedBytes = ccc.hexFrom(signed.toBytes());
  const snapshot: SignedCodeDeploymentDiagnostic = {
    schema: "ckboost-testnet-code-signed-diagnostic/v1", network: "testnet", contract: prepared.id,
    signedTransaction: signedBytes, transactionHash: signed.hash(), preparedBodyHash: prepared.bodyHash,
    release: { dataHash: prepared.dataHash, byteLength: prepared.byteLength },
    walletLock: publicScript(prepared.walletLock), typeScript: publicScript(prepared.typeScript),
  };
  await options.onSignedDiagnostic?.(snapshot);
  await assertWallet(signer, prepared.walletLock, isCurrent);
  try {
    // estimate_cycles executes lock/type scripts, including signature verification, without broadcasting.
    // It does not prove every pool/consensus rule; submission can still fail after this read succeeds.
    const cycles = await deploymentReadDeadline(signer.client.estimateCycles(signed), 20000);
    ensureCurrent(isCurrent);
    if (cycles <= 0n) throw new Error("The node returned an invalid execution cycle count.");
  } catch (cause) {
    ensureCurrent(isCurrent);
    const failure = nodeFailure(cause);
    if (failure.rejected) throw new CodeDeploymentRejectedError(signed.hash(), "preflight", failure.reason);
    throw new CodeDeploymentPreflightError(signed.hash(), failure.reason);
  }
  await assertWallet(signer, prepared.walletLock, isCurrent);
  if (signed.hash() !== prepared.bodyHash || ccc.hexFrom(signed.toBytes()) !== signedBytes) {
    throw new Error("The signed transaction changed during script verification. Nothing was broadcast.");
  }
  try {
    const txHash = await signer.client.sendTransaction(signed);
    if (txHash.toLowerCase() !== signed.hash().toLowerCase()) throw new Error("The RPC returned an unexpected transaction hash.");
    return txHash;
  }
  catch (cause) {
    const failure = nodeFailure(cause);
    if (failure.rejected) throw new CodeDeploymentRejectedError(signed.hash(), "broadcast", failure.reason);
    throw new CodeBroadcastStatusUnknownError(signed.hash(), cause);
  }
}

export type PendingCodeDeployment = {
  schema: "ckboost-testnet-code-pending/v1"; id: TestnetCodeId; txHash: ccc.Hex;
  typeScript: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
  walletLock: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
  walletAddress: string; capacity: string; fee: string;
};

export function makePendingCodeDeployment(prepared: PreparedCodeDeployment, txHash: ccc.Hex): PendingCodeDeployment {
  return {
    schema: "ckboost-testnet-code-pending/v1", id: prepared.id, txHash,
    typeScript: { codeHash: prepared.typeScript.codeHash, hashType: prepared.typeScript.hashType, args: prepared.typeScript.args },
    walletLock: { codeHash: prepared.walletLock.codeHash, hashType: prepared.walletLock.hashType, args: prepared.walletLock.args },
    walletAddress: prepared.walletAddress, capacity: prepared.capacity.toString(), fee: prepared.fee.toString(),
  };
}

/** Persist public receipts only, so reloading never encourages an accidental second deployment. */
export function parsePendingCodeDeployments(raw: string | null): PendingCodeDeployment[] {
  if (!raw || raw.length > 32000) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 16) return [];
    return values.filter((value): value is PendingCodeDeployment => {
      try {
        if (!value || typeof value !== "object") return false;
        const v = value as PendingCodeDeployment;
        if (v.schema !== "ckboost-testnet-code-pending/v1" || !Object.prototype.hasOwnProperty.call(TESTNET_CODE_RELEASES, v.id) ||
          !/^0x[0-9a-fA-F]{64}$/.test(v.txHash) || v.typeScript?.codeHash !== TYPE_ID_CODE_HASH ||
          v.typeScript.hashType !== "type" || !/^0x[0-9a-fA-F]{64}$/.test(v.typeScript.args) ||
          typeof v.walletAddress !== "string" || !v.walletAddress.startsWith("ckt1") || v.walletAddress.length > 1024 ||
          !/^\d{1,24}$/.test(v.capacity) || !/^\d{1,24}$/.test(v.fee) || BigInt(v.fee) <= 0n) return false;
        const lock = ccc.Script.from(v.walletLock);
        assertCodeOwner(v.id, lock);
        return BigInt(v.capacity) === getTestnetCodeCapacity(TESTNET_CODE_RELEASES[v.id].byteLength, lock);
      } catch { return false; }
    });
  } catch { return []; }
}

export type ConfirmedCodeManifest = ReturnType<typeof makeConfirmedCodeManifest>;
export function makeConfirmedCodeManifest(receipt: PendingCodeDeployment, blockNumber: bigint, confirmedCell: ccc.Cell, creationInput?: ccc.CellInput) {
  if (parsePendingCodeDeployments(JSON.stringify([receipt])).length !== 1) throw new Error("Invalid public deployment receipt.");
  const prepared = {
    ...receipt, typeScript: ccc.Script.from(receipt.typeScript), walletLock: ccc.Script.from(receipt.walletLock),
    capacity: BigInt(receipt.capacity), fee: BigInt(receipt.fee), ...TESTNET_CODE_RELEASES[receipt.id],
  };
  const { txHash } = receipt;
  if (prepared.id === "user-type" && (!creationInput || ccc.hashTypeId(creationInput, 0) !== prepared.typeScript.args)) {
    throw new Error("The independent UserType manifest requires its verified fresh Type ID creation input.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash) || blockNumber < 0n ||
    confirmedCell.outPoint.txHash.toLowerCase() !== txHash.toLowerCase() || confirmedCell.outPoint.index !== 0n ||
    !confirmedCell.cellOutput.type?.eq(prepared.typeScript) || !confirmedCell.cellOutput.lock.eq(prepared.walletLock) ||
    confirmedCell.cellOutput.capacity !== prepared.capacity || ccc.hashCkb(confirmedCell.outputData) !== prepared.dataHash) {
    throw new Error("The confirmed on-chain code cell does not match the reviewed transaction. Manifest export is blocked.");
  }
  return {
    schema: "ckboost-testnet-code-deployment/v1", network: "testnet", contract: prepared.id,
    fileName: TESTNET_CODE_RELEASES[prepared.id].fileName, contractName: TESTNET_CODE_RELEASES[prepared.id].fileName, contractSize: prepared.byteLength,
    transactionHash: txHash, index: "0x0", blockNumber: `0x${blockNumber.toString(16)}`,
    typeScript: { codeHash: prepared.typeScript.codeHash, hashType: prepared.typeScript.hashType, args: prepared.typeScript.args },
    typeHash: prepared.typeScript.hash(), dataHash: prepared.dataHash, hashType: "type", isTypeId: true,
    capacityShannons: prepared.capacity.toString(), preparedFeeShannons: prepared.fee.toString(),
    feeEvidence: "Fee estimated by transaction preparation; not independently reconstructed from confirmed inputs when restoring this receipt.",
    deployerAddress: new ccc.Address(prepared.walletLock, "ckt").toString(),
    lockScript: { codeHash: prepared.walletLock.codeHash, hashType: prepared.walletLock.hashType, args: prepared.walletLock.args },
    ...(prepared.id === "user-type" && creationInput ? { creationEvidence: {
      transactionHash: txHash, blockNumber: `0x${blockNumber.toString(16)}`, outputIndex: 0,
      firstInput: ccc.hexFrom(creationInput.toBytes()), typeIdArgs: prepared.typeScript.args,
    } } : {}),
    scope: "New code cell only. No previous code/protocol cell was consumed. This is not an isolated protocol deployment manifest.",
  };
}
