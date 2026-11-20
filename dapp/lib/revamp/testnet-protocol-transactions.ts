import { ccc } from "@ckb-ccc/connector-react";
import { cccA } from "@ckb-ccc/core/advanced";
import {
  assertPreparedTestnetProtocol, revalidateProfile, verifyProfile,
  type PreparedTestnetProtocolDeployment, type IsolatedTestnetProtocolProfile,
} from "./testnet-protocol-deployment";
import {
  assertTestnetDeploymentClient, deploymentReadDeadline, CodeDeploymentRejectedError,
  CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError, type DeploymentGuard,
} from "./testnet-code-deployment";

export { CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError };
export const TESTNET_PROTOCOL_QA_OWNER = "0xf3da4d6310b03c2c62f3ce5d6b1573da3432549b7e2faa78d84e4a6e7b245192";
export const TESTNET_PROTOCOL_MAX_FEE = 100000000n;
const OWNER = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
const ENDPOINTS = ["https://testnet.ckbapp.dev/", "https://testnet.ckb.dev/"] as const;
const HASH = /^0x[0-9a-f]{64}$/i;
type PublicScript = { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
const publicScript = (s: ccc.Script): PublicScript => ({ codeHash: s.codeHash, hashType: s.hashType, args: s.args });
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
function current(check: DeploymentGuard) { assert(check(), "The wallet, profile, network, or protocol operation changed. Prepare again."); }

export function assertAuthorizedTestnetProtocol(prepared: PreparedTestnetProtocolDeployment, tx = prepared.tx): void {
  assertPreparedTestnetProtocol(prepared, tx);
  assert(prepared.walletLock.eq(OWNER) && prepared.walletLock.hash() === TESTNET_PROTOCOL_QA_OWNER && prepared.walletAddress === new ccc.Address(OWNER, "ckt").toString(), "Only the fixed funded MetaMask wallet may create this QA protocol.");
  const profile = revalidateProfile(prepared.profile);
  for (const name of ["ckboostProtocolLock", "ckboostCampaignType"]) {
    const code = profile.dependencies.find(item => item.name === name);
    assert(code?.lockScript && ccc.Script.from(code.lockScript).eq(OWNER), "The new QA code deployments must be owned by the funded MetaMask wallet.");
  }
  assert(tx.inputs.length > 0 && tx.inputs.length <= 100 && tx.outputs.length >= 1 && tx.outputs.length <= 2, "Unexpected protocol creation input/output count.");
  assert(prepared.fee > 0n && prepared.fee <= TESTNET_PROTOCOL_MAX_FEE, "The protocol creation fee must be positive and no more than one tCKB.");
  for (let i = 1; i < tx.outputs.length; i++) assert(tx.outputs[i].capacity >= ccc.fixedPointFrom(tx.outputs[i].occupiedSize), "Protocol wallet change is below occupied capacity.");
}

async function wallet(signer: ccc.Signer, check: DeploymentGuard) {
  current(check); assertTestnetDeploymentClient(signer.client);
  const address = await deploymentReadDeadline(signer.getRecommendedAddressObj(), 12000); current(check);
  assert(address.script.eq(OWNER), "Connect the fixed funded MetaMask wallet before creating the QA protocol.");
}
async function plainInputs(prepared: PreparedTestnetProtocolDeployment, client: ccc.Client, check: DeploymentGuard) {
  const seen = new Set<string>(); let total = 0n;
  for (const input of prepared.tx.inputs) { const key = `${input.previousOutput.txHash}:${input.previousOutput.index}`; assert(!seen.has(key), "Duplicate protocol funding input."); seen.add(key); }
  for (let i = 0; i < prepared.tx.inputs.length; i += 4) {
    current(check); const capacities = await Promise.all(prepared.tx.inputs.slice(i, i + 4).map(async input => {
      const bytes = ccc.hexFrom(input.toBytes());
      const cell = await deploymentReadDeadline(client.getCellLive(input.previousOutput, true, false), 12000); current(check);
      assert(cell && cell.outPoint.eq(input.previousOutput) && cell.cellOutput.lock.eq(OWNER) && !cell.cellOutput.type && cell.outputData === "0x" && bytes === ccc.hexFrom(input.toBytes()), "Only live plain empty MetaMask capacity cells may create the new protocol. Existing code/protocol cells must not be consumed.");
      return cell.cellOutput.capacity;
    })); current(check); total += capacities.reduce((sum, n) => sum + n, 0n);
  }
  assert(total - prepared.tx.getOutputsCapacity() === prepared.fee, "Fresh funding capacity does not match the reviewed protocol creation fee.");
}
async function fresh(prepared: PreparedTestnetProtocolDeployment, signer: ccc.Signer, isCurrent: DeploymentGuard) {
  let active = true; const check = () => active && isCurrent();
  try { await deploymentReadDeadline((async () => {
    await wallet(signer, check); assertAuthorizedTestnetProtocol(prepared);
    await verifyProfile(prepared.profile, signer.client, check); await plainInputs(prepared, signer.client, check);
    await wallet(signer, check); assertAuthorizedTestnetProtocol(prepared);
  })(), 60000); } finally { active = false; }
}

export type PendingTestnetProtocolDeployment = {
  schema: "ckboost-testnet-protocol-pending/v1"; network: "testnet"; txHash: ccc.Hex; transaction: ccc.Hex;
  profile: IsolatedTestnetProtocolProfile; profileHash: ccc.Hex; walletLock: PublicScript; walletAddress: string;
  protocolOutputIndex: 0; typeScript: PublicScript; typeHash: ccc.Hex; protocolDataHex: ccc.Hex; dataHash: ccc.Hex;
  capacityShannons: string; preparedFeeShannons: string; recipe: ccc.Hex; firstInput: ccc.Hex;
};
export function makePendingTestnetProtocolDeployment(prepared: PreparedTestnetProtocolDeployment, hash: ccc.Hex): PendingTestnetProtocolDeployment {
  assertAuthorizedTestnetProtocol(prepared); assert(hash === prepared.bodyHash, "Unexpected protocol transaction hash.");
  return { schema: "ckboost-testnet-protocol-pending/v1", network: "testnet", txHash: hash, transaction: ccc.hexFrom(prepared.tx.toBytes()),
    profile: revalidateProfile(prepared.profile), profileHash: prepared.profileHash, walletLock: publicScript(prepared.walletLock), walletAddress: prepared.walletAddress,
    protocolOutputIndex: 0, typeScript: publicScript(prepared.typeScript), typeHash: prepared.typeHash, protocolDataHex: prepared.protocolDataHex, dataHash: prepared.dataHash,
    capacityShannons: prepared.capacity.toString(), preparedFeeShannons: prepared.fee.toString(), recipe: prepared.recipe, firstInput: prepared.firstInput };
}
function restored(value: PendingTestnetProtocolDeployment): PreparedTestnetProtocolDeployment {
  assert(value.schema === "ckboost-testnet-protocol-pending/v1" && value.network === "testnet" && HASH.test(value.txHash) && value.protocolOutputIndex === 0 && /^\d{1,20}$/.test(value.capacityShannons) && /^\d{1,18}$/.test(value.preparedFeeShannons), "Invalid public protocol receipt.");
  const tx = ccc.Transaction.fromBytes(value.transaction);
  assert(ccc.hexFrom(tx.toBytes()) === value.transaction, "Noncanonical saved protocol transaction.");
  const prepared = { tx, bodyHash: value.txHash, profile: revalidateProfile(value.profile), profileHash: value.profileHash, walletLock: ccc.Script.from(value.walletLock), walletAddress: value.walletAddress,
    protocolOutputIndex: 0, typeScript: ccc.Script.from(value.typeScript), typeHash: value.typeHash, protocolDataHex: value.protocolDataHex, dataHash: value.dataHash,
    capacity: BigInt(value.capacityShannons), fee: BigInt(value.preparedFeeShannons), recipe: value.recipe, firstInput: value.firstInput };
  assertAuthorizedTestnetProtocol(prepared); return prepared;
}
/** Offline validation and whitelist reconstruction only; no chain liveness is inferred. */
export function parsePendingTestnetProtocolDeployments(raw: string | null): PendingTestnetProtocolDeployment[] {
  if (!raw || raw.length > 512000) return [];
  try { const entries: unknown = JSON.parse(raw); if (!Array.isArray(entries) || entries.length > 4) return [];
    const seen = new Set<string>(); return entries.flatMap(value => { try { const prepared = restored(value as PendingTestnetProtocolDeployment); assert(!seen.has(prepared.bodyHash), "Duplicate receipt."); seen.add(prepared.bodyHash); return [makePendingTestnetProtocolDeployment(prepared, prepared.bodyHash)]; } catch { return []; } });
  } catch { return []; }
}
export type SignedTestnetProtocolDiagnostic = { schema: "ckboost-testnet-protocol-signed-diagnostic/v1"; network: "testnet"; receipt: PendingTestnetProtocolDeployment; signedTransaction: ccc.Hex; transactionHash: ccc.Hex; preparedBodyHash: ccc.Hex };
export function parseSignedTestnetProtocolDiagnostics(raw: string | null): SignedTestnetProtocolDiagnostic[] {
  if (!raw || raw.length > 1000000) return [];
  try { const entries: unknown = JSON.parse(raw); if (!Array.isArray(entries) || entries.length > 1) return [];
    return entries.flatMap(value => { try { const v = value as SignedTestnetProtocolDiagnostic, prepared = restored(v.receipt), tx = ccc.Transaction.fromBytes(v.signedTransaction); assertAuthorizedTestnetProtocol(prepared, tx);
      assert(v.schema === "ckboost-testnet-protocol-signed-diagnostic/v1" && v.network === "testnet" && ccc.hexFrom(tx.toBytes()) === v.signedTransaction && v.transactionHash === tx.hash() && v.preparedBodyHash === prepared.bodyHash, "Invalid protocol diagnostic.");
      return [{ schema: v.schema, network: "testnet" as const, receipt: makePendingTestnetProtocolDeployment(prepared, prepared.bodyHash), signedTransaction: ccc.hexFrom(tx.toBytes()), transactionHash: tx.hash(), preparedBodyHash: prepared.bodyHash }];
    } catch { return []; } });
  } catch { return []; }
}
function failure(error: unknown): { rejected: boolean; reason: string } {
  let rejected = false; const text: string[] = [], seen = new Set<unknown>();
  const visit = (v: unknown, depth: number) => { if (v == null || depth > 3 || seen.has(v)) return; seen.add(v); if (typeof v === "string") { text.push(v); return; } if (typeof v !== "object") return; const x = v as { code?: unknown; message?: unknown; data?: unknown; error?: unknown; cause?: unknown }; if (x.code === -302 || x.code === "-302") rejected = true; visit(x.message, depth + 1); visit(x.data, depth + 1); visit(x.error, depth + 1); visit(x.cause, depth + 1); };
  visit(error, 0); const reason = text.join(" — ").slice(0, 4000) || "Unknown RPC response"; return { reason, rejected: rejected || /TransactionFailedToVerify|TransactionScriptError|ValidationFailure/.test(reason) };
}
function broadcastClient(client: ccc.Client, check: DeploymentGuard): ccc.Client {
  return new Proxy(client, { get(target, key, receiver) { const value = Reflect.get(target, key, target);
    if (key === "sendTransactionNoCache") return (...args: unknown[]) => { current(check); assertTestnetDeploymentClient(target); return value.apply(target, args); };
    if (key === "sendTransaction") return value.bind(receiver); return typeof value === "function" ? value.bind(target) : value;
  } });
}
export type TestnetProtocolSigningOptions = { onSignedDiagnostic?: (snapshot: SignedTestnetProtocolDiagnostic) => void | Promise<void>; onBeforeBroadcast?: (receipt: PendingTestnetProtocolDeployment) => void | Promise<void> };
/** Creates a new protocol state only: one explicit signature and at most one send, never an old protocol update. */
export async function signAndBroadcastTestnetProtocol(signer: ccc.Signer, prepared: PreparedTestnetProtocolDeployment, isCurrent: DeploymentGuard = () => true, options: TestnetProtocolSigningOptions = {}): Promise<ccc.Hex> {
  await fresh(prepared, signer, isCurrent);
  const signed = ccc.Transaction.fromBytes((await signer.signTransaction(prepared.tx)).toBytes());
  assertAuthorizedTestnetProtocol(prepared, signed); const bytes = ccc.hexFrom(signed.toBytes());
  const snapshot: SignedTestnetProtocolDiagnostic = { schema: "ckboost-testnet-protocol-signed-diagnostic/v1", network: "testnet", receipt: makePendingTestnetProtocolDeployment(prepared, prepared.bodyHash), signedTransaction: bytes, transactionHash: signed.hash(), preparedBodyHash: prepared.bodyHash };
  await options.onSignedDiagnostic?.(snapshot);
  await fresh(prepared, signer, isCurrent); assertAuthorizedTestnetProtocol(prepared, signed);
  try { const cycles = await deploymentReadDeadline(signer.client.estimateCycles(signed), 20000); current(isCurrent); assert(cycles > 0n, "Invalid script cycle response."); }
  catch (cause) { current(isCurrent); const f = failure(cause); if (f.rejected) throw new CodeDeploymentRejectedError(prepared.bodyHash, "preflight", f.reason); throw new CodeDeploymentPreflightError(prepared.bodyHash, f.reason); }
  await wallet(signer, isCurrent); assertAuthorizedTestnetProtocol(prepared, signed); assert(ccc.hexFrom(signed.toBytes()) === bytes, "Signed protocol witnesses changed during script verification. Nothing was broadcast.");
  await options.onBeforeBroadcast?.(makePendingTestnetProtocolDeployment(prepared, prepared.bodyHash));
  await wallet(signer, isCurrent); assertAuthorizedTestnetProtocol(prepared, signed); assert(ccc.hexFrom(signed.toBytes()) === bytes, "Signed protocol bytes changed before broadcast.");
  try { const hash = await broadcastClient(signer.client, isCurrent).sendTransaction(signed); assert(hash.toLowerCase() === prepared.bodyHash, "Unexpected protocol broadcast hash."); return hash; }
  catch (cause) { const f = failure(cause); if (f.rejected) throw new CodeDeploymentRejectedError(prepared.bodyHash, "broadcast", f.reason); throw new CodeBroadcastStatusUnknownError(prepared.bodyHash, cause); }
}

export type ConfirmedTestnetProtocolManifest = {
  schema: "ckboost-isolated-testnet-protocol-state/v1"; network: "testnet"; transactionHash: ccc.Hex; index: "0x0"; blockNumber: string;
  protocolTypeScript: PublicScript; protocolTypeHash: ccc.Hex; protocolLockScript: PublicScript; dataHash: ccc.Hex; protocolDataHex: ccc.Hex;
  capacityShannons: string; adminLockHashes: string[]; campaignsApproved: never[]; tippingsApproved: never[]; endorsersWhitelist: never[];
  profile: IsolatedTestnetProtocolProfile; scope: string;
};
export type TestnetProtocolConfirmationResult = { txHash: string; checkedAt: string; attempts: { endpoint: string; status: string; message?: string }[] } & (
  { status: "confirmed"; endpoint: string; blockNumber: string; manifest: ConfirmedTestnetProtocolManifest } |
  { status: "pending"; endpoint: string; chainStatus: string; message: string } |
  { status: "rejected"; endpoint: string; reason: string; message: string } |
  { status: "unknown"; reason: string; message: string }
);
/** Historical raw TypeID creation and current live initial state are both required for this export. */
export async function probeTestnetProtocolConfirmation(receipt: PendingTestnetProtocolDeployment, options: { fetcher?: typeof fetch; isCurrent?: DeploymentGuard; endpointTimeoutMs?: number } = {}): Promise<TestnetProtocolConfirmationResult> {
  const attempts: TestnetProtocolConfirmationResult["attempts"] = [], evidence = () => ({ txHash: receipt.txHash, checkedAt: new Date().toISOString(), attempts });
  let prepared: PreparedTestnetProtocolDeployment;
  try { const parsed = parsePendingTestnetProtocolDeployments(JSON.stringify([receipt])); assert(parsed.length === 1, "Invalid receipt."); prepared = restored(parsed[0]); }
  catch { return { ...evidence(), status: "unknown", reason: "invalid-receipt", message: "The saved isolated protocol receipt is invalid. No request was made." }; }
  const check = options.isCurrent ?? (() => true), fetcher = options.fetcher ?? globalThis.fetch, timeout = options.endpointTimeoutMs ?? 6000;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 15000 || typeof fetcher !== "function") return { ...evidence(), status: "unknown", reason: "transport", message: "Confirmation transport is unavailable." };
  let pending: TestnetProtocolConfirmationResult | undefined, rejected: TestnetProtocolConfirmationResult | undefined, observedCommitted = false;
  for (const endpoint of ENDPOINTS) {
    if (!check()) return { ...evidence(), status: "unknown", reason: "stale", message: "The confirmation check changed. Keep the saved receipt." };
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined, active = true, id = 0;
    const ready = () => current(() => active && check());
    const rpc = async (method: "get_transaction" | "get_header" | "get_live_cell", params: unknown[]) => {
      ready(); const requestId = ++id;
      const response = await fetcher(endpoint, { method: "POST", cache: "no-store", redirect: "error", signal: abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) });
      ready(); assert(response.ok, "Public protocol confirmation read failed."); const text = await response.text(); ready(); assert(text.length <= 2500000, "Oversized confirmation response."); const json = JSON.parse(text);
      assert(json.id === requestId && json.jsonrpc === "2.0" && !json.error && "result" in json, "Invalid protocol confirmation RPC response."); return json.result;
    };
    const work = async (): Promise<TestnetProtocolConfirmationResult> => {
      const raw = await rpc("get_transaction", [receipt.txHash]), status = raw?.tx_status?.status;
      if (status === "rejected") { const reason = typeof raw.tx_status.reason === "string" ? raw.tx_status.reason.slice(0, 4096) : "The node explicitly rejected this protocol transaction."; return { ...evidence(), status: "rejected", endpoint, reason, message: "The node rejected this transaction. The receipt is retained; no automatic retry occurs." }; }
      if (["pending", "proposed", "sent"].includes(status)) return { ...evidence(), status: "pending", endpoint, chainStatus: status, message: "Protocol creation is not committed. Check the saved hash; do not create another protocol." };
      assert(status === "committed", "This node has not confirmed the transaction; absence does not prove it was never sent."); observedCommitted = true;
      assert(raw.transaction && typeof raw.transaction === "object", "Committed protocol body is missing.");
      const tx = ccc.Transaction.fromBytes(cccA.JsonRpcTransformers.transactionTo(raw.transaction).toBytes());
      assert(tx.hash() === receipt.txHash && (!raw.transaction.hash || raw.transaction.hash === receipt.txHash), "Committed protocol transaction hash mismatch."); assertAuthorizedTestnetProtocol(prepared, tx);
      let blockNumber = raw.tx_status.block_number;
      if (blockNumber == null) { const hash = raw.tx_status.block_hash; assert(typeof hash === "string" && HASH.test(hash), "Committed protocol block evidence is missing."); const header = await rpc("get_header", [hash]); assert(header?.hash === hash, "Committed protocol header hash mismatch."); blockNumber = header.number; }
      assert(typeof blockNumber === "string" && /^0x[0-9a-f]{1,16}$/i.test(blockNumber), "Invalid committed protocol block number.");
      const live = await rpc("get_live_cell", [{ tx_hash: receipt.txHash, index: "0x0" }, true, false]);
      assert(live?.status === "live" && live.cell?.output && live.cell?.data, "The initial protocol state is not currently live. Do not create another protocol.");
      const output = cccA.JsonRpcTransformers.cellOutputTo(live.cell.output), data = live.cell.data;
      assert(output.eq(tx.outputs[0]) && typeof data.content === "string" && data.content === prepared.protocolDataHex && typeof data.hash === "string" && data.hash === prepared.dataHash && ccc.hashCkb(data.content) === prepared.dataHash, "Live protocol data/owner/type/capacity does not match the reviewed initial state.");
      ready(); const manifest: ConfirmedTestnetProtocolManifest = { schema: "ckboost-isolated-testnet-protocol-state/v1", network: "testnet", transactionHash: prepared.bodyHash, index: "0x0", blockNumber,
        protocolTypeScript: publicScript(prepared.typeScript), protocolTypeHash: prepared.typeHash, protocolLockScript: publicScript(tx.outputs[0].lock), dataHash: prepared.dataHash, protocolDataHex: prepared.protocolDataHex, capacityShannons: prepared.capacity.toString(),
        adminLockHashes: [TESTNET_PROTOCOL_QA_OWNER], campaignsApproved: [], tippingsApproved: [], endorsersWhitelist: [], profile: revalidateProfile(prepared.profile), scope: "Fresh isolated Testnet initial protocol state only. No previous protocol was updated and no app, server, environment, or deployment registry was activated. Code identity records were freshly checked before submission; this confirmation checks the exact saved profile against the complete committed/live initial protocol state." };
      return { ...evidence(), status: "confirmed", endpoint, blockNumber, manifest };
    };
    try {
      const result = await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; abort.abort(); reject(new Error("Protocol confirmation deadline elapsed.")); }, timeout); })]);
      ready(); attempts.push({ endpoint, status: result.status });
      if (result.status === "confirmed") return { ...result, ...evidence() };
      if (result.status === "pending") pending = result;
      if (result.status === "rejected") rejected = result;
    } catch (cause) { attempts.push({ endpoint, status: "unknown", message: cause instanceof Error ? cause.message : "Public confirmation read failed." }); }
    finally { active = false; if (timer) clearTimeout(timer); abort.abort(); }
  }
  if (!check()) return { ...evidence(), status: "unknown", reason: "stale", message: "The confirmation check changed. Keep the saved receipt." };
  if (observedCommitted) return { ...evidence(), status: "unknown", reason: "unverified-committed", message: "A node reported committed, but initial live protocol state evidence was incomplete or inconsistent. Do not create another protocol." };
  return pending ?? rejected ?? { ...evidence(), status: "unknown", reason: "unverified", message: "No node established confirmation. Keep the saved hash; do not create another protocol." };
}
