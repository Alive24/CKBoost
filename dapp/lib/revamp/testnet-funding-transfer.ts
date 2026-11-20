import { ccc } from "@ckb-ccc/connector-react";
import {
  assertTestnetDeploymentClient, deploymentReadDeadline, TESTNET_JOYID_CODE_HASH, TESTNET_JOYID_RAW_LIMIT,
  CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError, type DeploymentGuard,
} from "./testnet-code-deployment";

export { CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError };
export const TESTNET_FUNDING_SOURCE_LOCK_HASH = "0x88921683e396d7a23eaa26b6a08159c43bf7936ab58c85758d14fda72af221cf";
export const TESTNET_FUNDING_RECIPIENT_ADDRESS = "ckt1qrejnmlar3r452tcg57gvq8patctcgy8acync0hxfnyka35ywafvkqgjwr0qr5zz5gal4vwuqcm4zw9536sr6qrfqq9s2rlz";
export const TESTNET_FUNDING_AMOUNT = 50000000000000n;
export const TESTNET_FUNDING_MAX_FEE = 100000000n; // One tCKB ceiling; the exact smaller fee is shown before signing.
const RECIPIENT = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
const SECP_DATA = { txHash: "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f" as ccc.Hex, index: 3 };
const SECP_DATA_HASH = "0x9799bee251b975b82c45a02154ce28cec89c5853ecc14d12b7b8cccfc19e0af4";
const ENDPOINTS = ["https://testnet.ckbapp.dev/", "https://testnet.ckb.dev/"] as const;
const HASH = /^0x[0-9a-f]{64}$/i;
type PublicScript = { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
const publicScript = (s: ccc.Script): PublicScript => ({ codeHash: s.codeHash, hashType: s.hashType, args: s.args });
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function current(check: DeploymentGuard) { assert(check(), "The wallet, network, or transfer operation changed. Prepare the fixed transfer again."); }
function source(lock: ccc.Script) { assert(lock.hash() === TESTNET_FUNDING_SOURCE_LOCK_HASH && lock.codeHash === TESTNET_JOYID_CODE_HASH && lock.hashType === "type", "Connect the specified JoyID funding wallet. No other source wallet is authorized for this transfer."); }
function size(tx: ccc.Transaction) { assert(tx.rawToBytes().length <= TESTNET_JOYID_RAW_LIMIT, "The funding transaction exceeds the current Testnet JoyID lock's 128 KiB raw transaction limit. Nothing was signed or submitted by this check."); }
async function wallet(signer: ccc.Signer, expected: ccc.Script | undefined, check: DeploymentGuard): Promise<ccc.Script> {
  current(check); assertTestnetDeploymentClient(signer.client);
  const address = await deploymentReadDeadline(signer.getRecommendedAddressObj(), 12000); current(check);
  const lock = address.script.clone(); source(lock); assert(!expected || lock.eq(expected), "The funding wallet changed. Prepare again."); return lock;
}
async function recipient(client: ccc.Client, check: DeploymentGuard): Promise<ccc.Script> {
  current(check); assertTestnetDeploymentClient(client);
  const address = await ccc.Address.fromString(TESTNET_FUNDING_RECIPIENT_ADDRESS, client);
  const known = await client.getKnownScript(ccc.KnownScript.OmniLock); current(check);
  assert(address.toString() === TESTNET_FUNDING_RECIPIENT_ADDRESS && address.script.eq(RECIPIENT) && address.script.codeHash === known.codeHash && address.script.hashType === known.hashType, "The fixed recipient is not the expected public Testnet OmniLock address.");
  return address.script.clone();
}
async function verifySecpData(client: ccc.Client, check: DeploymentGuard) {
  current(check); const cell = await deploymentReadDeadline(client.getCellLive(SECP_DATA, true, false), 12000); current(check);
  assert(cell && ccc.OutPoint.from(SECP_DATA).eq(cell.outPoint) && ccc.bytesFrom(cell.outputData).length === 1048576 && ccc.hashCkb(cell.outputData) === SECP_DATA_HASH, "The required public Testnet genesis secp256k1 data cell is unavailable or does not match its trusted hash.");
}
/** CKB collectors are restricted before yielding; they never select a code/protocol/token cell or a related lock. */
function capacitySigner(signer: ccc.Signer, lock: ccc.Script, check: DeploymentGuard): ccc.Signer {
  const blocked = new Set(["signTransaction", "signOnlyTransaction", "signMessage", "signMessageRaw", "sendTransaction", "sendTransactionNoCache"]);
  return new Proxy(signer, { get(target, key) {
    if (blocked.has(String(key))) return () => { throw new Error("Unsigned transfer preparation cannot sign or send."); };
    if (key === "findCells") return async function* () {
      let candidates = 0;
      const iterator = target.client.findCells({ script: lock, scriptType: "lock", scriptSearchMode: "exact", withData: true, filter: { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] } })[Symbol.asyncIterator]();
      try { while (true) {
        current(check); const next = await deploymentReadDeadline(iterator.next(), 12000); current(check); if (next.done) return;
        assert(++candidates <= 2000, "Funding cell scan exceeded its safe bound."); const cell = next.value;
        if (!cell.cellOutput.type && cell.outputData === "0x" && cell.cellOutput.lock.eq(lock)) yield cell;
      } } finally { void Promise.resolve(iterator.return?.(undefined)).catch(() => {}); }
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? async (...args: unknown[]) => { current(check); const result = await value.apply(target, args); current(check); return result; } : value;
  } });
}
async function plainInputs(tx: ccc.Transaction, signer: ccc.Signer, lock: ccc.Script, check: DeploymentGuard): Promise<bigint> {
  assert(tx.inputs.length > 0 && tx.inputs.length <= 100, "A bounded set of ordinary funding inputs is required.");
  const seen = new Set<string>(); let total = 0n;
  for (const input of tx.inputs) { const key = `${input.previousOutput.txHash}:${input.previousOutput.index}`; assert(!seen.has(key), "Duplicate funding input."); seen.add(key); }
  for (let offset = 0; offset < tx.inputs.length; offset += 4) {
    current(check); const capacities = await Promise.all(tx.inputs.slice(offset, offset + 4).map(async input => {
      current(check); const before = ccc.hexFrom(input.toBytes());
      const cell = await deploymentReadDeadline(signer.client.getCellLive(input.previousOutput, true, false), 12000); current(check);
      assert(cell && cell.outPoint.eq(input.previousOutput) && !cell.cellOutput.type && cell.outputData === "0x" && cell.cellOutput.lock.eq(lock) && before === ccc.hexFrom(input.toBytes()), "Only live empty untyped capacity cells under the exact authorized JoyID lock may fund this transfer.");
      return cell.cellOutput.capacity;
    })); current(check); total += capacities.reduce((sum, capacity) => sum + capacity, 0n);
  }
  return total;
}
function outputs(tx: ccc.Transaction, lock: ccc.Script) {
  source(lock); size(tx);
  assert(!lock.eq(RECIPIENT) && tx.outputs.length >= 1 && tx.outputs.length <= 2 && tx.outputsData.length === tx.outputs.length, "Unexpected transfer output structure.");
  assert(tx.outputs[0].lock.eq(RECIPIENT) && !tx.outputs[0].type && tx.outputsData[0] === "0x" && tx.outputs[0].capacity === TESTNET_FUNDING_AMOUNT, "The recipient must receive exactly 500,000 tCKB in one empty untyped output.");
  for (let i = 1; i < tx.outputs.length; i++) assert(tx.outputs[i].lock.eq(lock) && !tx.outputs[i].type && tx.outputsData[i] === "0x" && tx.outputs[i].capacity >= ccc.fixedPointFrom(tx.outputs[i].occupiedSize), "Only ordinary change to the authorized source wallet is allowed.");
  assert(tx.cellDeps.some(dep => dep.depType === "code" && dep.outPoint.eq(SECP_DATA)), "The verified genesis secp256k1 data dependency is missing.");
}

export type PreparedTestnetFundingTransfer = {
  tx: ccc.Transaction; bodyHash: ccc.Hex; sourceLock: ccc.Script; sourceAddress: string;
  recipientLock: ccc.Script; recipientAddress: string; amount: bigint; fee: bigint;
};
export function assertPreparedTestnetFundingTransfer(prepared: PreparedTestnetFundingTransfer, tx = prepared.tx) {
  outputs(tx, prepared.sourceLock);
  assert(prepared.recipientAddress === TESTNET_FUNDING_RECIPIENT_ADDRESS && prepared.recipientLock.eq(RECIPIENT) && prepared.amount === TESTNET_FUNDING_AMOUNT && prepared.sourceAddress === new ccc.Address(prepared.sourceLock, "ckt").toString() && prepared.fee > 0n && prepared.fee <= TESTNET_FUNDING_MAX_FEE && tx.hash() === prepared.bodyHash, "The fixed transfer details or prepared raw body changed.");
}
/** Reads only. No configurable amount/address and no signature/broadcast API is invoked. */
export async function prepareTestnetFundingTransfer(signer: ccc.Signer, isCurrent: DeploymentGuard = () => true): Promise<PreparedTestnetFundingTransfer> {
  let active = true; const check = () => active && isCurrent();
  const run = async () => {
    const to = await recipient(signer.client, check), lock = await wallet(signer, undefined, check);
    assert(!to.eq(lock), "The source and recipient must differ."); await verifySecpData(signer.client, check);
    const safe = capacitySigner(signer, lock, check), tx = ccc.Transaction.from({ outputs: [{ lock: to, capacity: TESTNET_FUNDING_AMOUNT }], outputsData: ["0x"], cellDeps: [{ outPoint: SECP_DATA, depType: "code" }] });
    await tx.completeInputsByCapacity(safe); size(tx); await wallet(signer, lock, check);
    const ready = await safe.prepareTransaction(tx); if (ready !== tx) tx.copy(ready);
    await tx.completeFeeBy(safe); await wallet(signer, lock, check); outputs(tx, lock);
    const fee = (await plainInputs(tx, signer, lock, check)) - tx.getOutputsCapacity();
    const prepared = { tx, bodyHash: tx.hash(), sourceLock: lock, sourceAddress: new ccc.Address(lock, "ckt").toString(), recipientLock: to, recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amount: TESTNET_FUNDING_AMOUNT, fee };
    assertPreparedTestnetFundingTransfer(prepared); current(check); return prepared;
  };
  try { return await deploymentReadDeadline(run(), 60000); } finally { active = false; }
}

export type PendingFundingTransfer = { schema: "ckboost-testnet-funding-transfer-pending/v1"; network: "testnet"; txHash: ccc.Hex; sourceLock: PublicScript; recipientLock: PublicScript; recipientAddress: string; amountShannons: string; preparedFeeShannons: string };
export function makePendingFundingTransfer(prepared: PreparedTestnetFundingTransfer, txHash: ccc.Hex): PendingFundingTransfer {
  assertPreparedTestnetFundingTransfer(prepared); assert(txHash === prepared.bodyHash, "Unexpected funding transaction hash.");
  return { schema: "ckboost-testnet-funding-transfer-pending/v1", network: "testnet", txHash, sourceLock: publicScript(prepared.sourceLock), recipientLock: publicScript(RECIPIENT), recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString(), preparedFeeShannons: prepared.fee.toString() };
}
export function parsePendingFundingTransfers(raw: string | null): PendingFundingTransfer[] {
  if (!raw || raw.length > 32000) return [];
  try { const rows: unknown = JSON.parse(raw); if (!Array.isArray(rows) || rows.length > 16) return [];
    const found = new Set<string>(); return rows.flatMap(value => { try {
      const v = value as PendingFundingTransfer, lock = ccc.Script.from(v.sourceLock); source(lock);
      assert(v.schema === "ckboost-testnet-funding-transfer-pending/v1" && v.network === "testnet" && HASH.test(v.txHash) && !found.has(v.txHash) && v.recipientAddress === TESTNET_FUNDING_RECIPIENT_ADDRESS && ccc.Script.from(v.recipientLock).eq(RECIPIENT) && v.amountShannons === TESTNET_FUNDING_AMOUNT.toString() && /^\d{1,18}$/.test(v.preparedFeeShannons) && BigInt(v.preparedFeeShannons) > 0n && BigInt(v.preparedFeeShannons) <= TESTNET_FUNDING_MAX_FEE, "Invalid fixed transfer receipt.");
      found.add(v.txHash); return [{ schema: v.schema, network: "testnet" as const, txHash: v.txHash.toLowerCase() as ccc.Hex, sourceLock: publicScript(lock), recipientLock: publicScript(RECIPIENT), recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString(), preparedFeeShannons: v.preparedFeeShannons }];
    } catch { return []; } });
  } catch { return []; }
}
export type SignedFundingTransferDiagnostic = { schema: "ckboost-testnet-funding-signed-diagnostic/v1"; network: "testnet"; signedTransaction: ccc.Hex; transactionHash: ccc.Hex; preparedBodyHash: ccc.Hex; sourceLock: PublicScript; recipientLock: PublicScript; recipientAddress: string; amountShannons: string };
export function parseSignedFundingTransferDiagnostics(raw: string | null): SignedFundingTransferDiagnostic[] {
  if (!raw || raw.length > 512000) return [];
  try { const rows: unknown = JSON.parse(raw); if (!Array.isArray(rows) || rows.length > 1) return [];
    return rows.flatMap(value => { try { const v = value as SignedFundingTransferDiagnostic, tx = ccc.Transaction.fromBytes(v.signedTransaction), lock = ccc.Script.from(v.sourceLock); outputs(tx, lock);
      assert(v.schema === "ckboost-testnet-funding-signed-diagnostic/v1" && v.network === "testnet" && HASH.test(v.transactionHash) && tx.hash() === v.transactionHash && tx.hash() === v.preparedBodyHash && ccc.hexFrom(tx.toBytes()) === v.signedTransaction && tx.inputs.length > 0 && tx.inputs.length <= 100 && ccc.Script.from(v.recipientLock).eq(RECIPIENT) && v.recipientAddress === TESTNET_FUNDING_RECIPIENT_ADDRESS && v.amountShannons === TESTNET_FUNDING_AMOUNT.toString(), "Invalid signed funding diagnostic.");
      return [{ schema: v.schema, network: "testnet" as const, signedTransaction: ccc.hexFrom(tx.toBytes()), transactionHash: tx.hash(), preparedBodyHash: tx.hash(), sourceLock: publicScript(lock), recipientLock: publicScript(RECIPIENT), recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString() }];
    } catch { return []; } });
  } catch { return []; }
}
function failure(cause: unknown): { rejected: boolean; reason: string } {
  const seen = new Set<unknown>(), text: string[] = []; let rejected = false;
  const visit = (v: unknown, depth: number) => { if (v == null || depth > 3 || seen.has(v)) return; seen.add(v); if (typeof v === "string") { text.push(v); return; } if (typeof v !== "object") return; const x = v as { message?: unknown; data?: unknown; code?: unknown; cause?: unknown; error?: unknown }; if (x.code === -302 || x.code === "-302") rejected = true; visit(x.message, depth + 1); visit(x.data, depth + 1); visit(x.cause, depth + 1); visit(x.error, depth + 1); };
  visit(cause, 0); const reason = text.join(" — ").slice(0, 4000) || "Unknown RPC response"; return { reason, rejected: rejected || /TransactionFailedToVerify|TransactionScriptError|ValidationFailure/.test(reason) };
}
export type FundingTransferSigningOptions = { onSignedDiagnostic?: (value: SignedFundingTransferDiagnostic) => void | Promise<void>; onBeforeBroadcast?: (receipt: PendingFundingTransfer) => void | Promise<void> };
function broadcastClient(client: ccc.Client, check: DeploymentGuard): ccc.Client {
  return new Proxy(client, { get(target, key, receiver) {
    const value = Reflect.get(target, key, target);
    // CCC's outer send performs asynchronous fee reads. Recheck at its actual RPC send boundary as well.
    if (key === "sendTransactionNoCache") return (...args: unknown[]) => { current(check); assertTestnetDeploymentClient(target); return value.apply(target, args); };
    if (key === "sendTransaction") return value.bind(receiver);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
/** Called only by an explicit UI action: one signature, read-only verification, then at most one send. */
export async function signAndBroadcastTestnetFundingTransfer(signer: ccc.Signer, prepared: PreparedTestnetFundingTransfer, isCurrent: DeploymentGuard = () => true, options: FundingTransferSigningOptions = {}): Promise<ccc.Hex> {
  await wallet(signer, prepared.sourceLock, isCurrent); await recipient(signer.client, isCurrent); assertPreparedTestnetFundingTransfer(prepared);
  let validationActive = true;
  try { await deploymentReadDeadline((async () => {
    const check = () => validationActive && isCurrent(); await verifySecpData(signer.client, check);
    const total = await plainInputs(prepared.tx, signer, prepared.sourceLock, check);
    assert(total - prepared.tx.getOutputsCapacity() === prepared.fee, "Live funding capacities no longer match the reviewed fee.");
  })(), 45000); } finally { validationActive = false; }
  await wallet(signer, prepared.sourceLock, isCurrent); assertPreparedTestnetFundingTransfer(prepared);
  const signed = ccc.Transaction.fromBytes((await signer.signTransaction(prepared.tx)).toBytes()); assertPreparedTestnetFundingTransfer(prepared, signed);
  const bytes = ccc.hexFrom(signed.toBytes());
  const snapshot: SignedFundingTransferDiagnostic = { schema: "ckboost-testnet-funding-signed-diagnostic/v1", network: "testnet", signedTransaction: bytes, transactionHash: signed.hash(), preparedBodyHash: prepared.bodyHash, sourceLock: publicScript(prepared.sourceLock), recipientLock: publicScript(RECIPIENT), recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString() };
  await options.onSignedDiagnostic?.(snapshot); await wallet(signer, prepared.sourceLock, isCurrent);
  try { const cycles = await deploymentReadDeadline(signer.client.estimateCycles(signed), 20000); current(isCurrent); assert(cycles > 0n, "Invalid script cycle result."); }
  catch (cause) { current(isCurrent); const f = failure(cause); if (f.rejected) throw new CodeDeploymentRejectedError(prepared.bodyHash, "preflight", f.reason); throw new CodeDeploymentPreflightError(prepared.bodyHash, f.reason); }
  await wallet(signer, prepared.sourceLock, isCurrent); assertPreparedTestnetFundingTransfer(prepared, signed);
  assert(ccc.hexFrom(signed.toBytes()) === bytes, "The signed funding transaction changed during preflight. Nothing was broadcast.");
  await options.onBeforeBroadcast?.(makePendingFundingTransfer(prepared, signed.hash()));
  await wallet(signer, prepared.sourceLock, isCurrent); assertPreparedTestnetFundingTransfer(prepared, signed);
  assert(ccc.hexFrom(signed.toBytes()) === bytes, "The signed funding transaction changed before broadcast.");
  try { const hash = await broadcastClient(signer.client, isCurrent).sendTransaction(signed); assert(hash.toLowerCase() === prepared.bodyHash, "RPC returned an unexpected transaction hash."); return hash; }
  catch (cause) { const f = failure(cause); if (f.rejected) throw new CodeDeploymentRejectedError(prepared.bodyHash, "broadcast", f.reason); throw new CodeBroadcastStatusUnknownError(prepared.bodyHash, cause); }
}

export type FundingTransferConfirmation = { txHash: string; checkedAt: string; attempts: { endpoint: string; status: string; message?: string }[] } & (
  { status: "confirmed"; endpoint: string; blockNumber: string; recipientAddress: string; amountShannons: string } |
  { status: "pending"; endpoint: string; message: string; chainStatus: string } |
  { status: "rejected"; endpoint: string; reason: string; message: string } |
  { status: "unknown"; reason: string; message: string }
);
/** Two bounded public HTTPS reads. A spent recipient output remains a valid historical confirmed transfer. */
export async function probeTestnetFundingTransfer(receipt: PendingFundingTransfer, options: { fetcher?: typeof fetch; isCurrent?: DeploymentGuard; endpointTimeoutMs?: number } = {}): Promise<FundingTransferConfirmation> {
  const attempts: FundingTransferConfirmation["attempts"] = [], evidence = () => ({ txHash: receipt.txHash, checkedAt: new Date().toISOString(), attempts });
  if (parsePendingFundingTransfers(JSON.stringify([receipt])).length !== 1) return { ...evidence(), status: "unknown", reason: "invalid-receipt", message: "Invalid fixed transfer receipt. No request was made." };
  const check = options.isCurrent ?? (() => true), fetcher = options.fetcher ?? globalThis.fetch, timeout = options.endpointTimeoutMs ?? 6000;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 15000 || typeof fetcher !== "function") return { ...evidence(), status: "unknown", reason: "transport", message: "Confirmation transport is unavailable." };
  let pending: FundingTransferConfirmation | undefined, rejected: FundingTransferConfirmation | undefined, observedCommitted = false;
  for (const endpoint of ENDPOINTS) {
    if (!check()) return { ...evidence(), status: "unknown", reason: "stale", message: "The transfer check changed. Keep the saved receipt." };
    const abort = new AbortController(), began = Date.now(); let timer: ReturnType<typeof setTimeout> | undefined, active = true;
    try {
      const work = (async () => {
        const response = await fetcher(endpoint, { method: "POST", cache: "no-store", redirect: "error", headers: { "content-type": "application/json" }, signal: abort.signal, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "get_transaction", params: [receipt.txHash] }) });
        current(() => active && check()); assert(response.ok, "The public Testnet read failed."); const text = await response.text(); current(() => active && check()); assert(text.length <= 2000000, "Oversized public response.");
        const json = JSON.parse(text); assert(json.id === 1 && json.jsonrpc === "2.0" && !json.error, "Invalid RPC response."); return json.result;
      })();
      const raw = await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; abort.abort(); reject(new Error("Confirmation read timed out.")); }, timeout); })]);
      current(check); const status = raw?.tx_status?.status;
      if (status === "committed") {
        observedCommitted = true; const body = raw.transaction;
        assert(body && Array.isArray(body.inputs) && Array.isArray(body.outputs) && Array.isArray(body.outputs_data), "Committed transaction is missing its body.");
        const script = (s: { code_hash: string; hash_type: ccc.HashType; args: string }) => ({ codeHash: s.code_hash, hashType: s.hash_type, args: s.args });
        const tx = ccc.Transaction.from({ version: body.version, cellDeps: body.cell_deps.map((d: { out_point: { tx_hash: string; index: string }; dep_type: string }) => ({ outPoint: { txHash: d.out_point.tx_hash, index: d.out_point.index }, depType: d.dep_type === "dep_group" ? "depGroup" : "code" })), headerDeps: body.header_deps, inputs: body.inputs.map((i: { previous_output: { tx_hash: string; index: string }; since: string }) => ({ previousOutput: { txHash: i.previous_output.tx_hash, index: i.previous_output.index }, since: i.since })), outputs: body.outputs.map((o: { capacity: string; lock: Parameters<typeof script>[0]; type?: Parameters<typeof script>[0] }) => ({ capacity: o.capacity, lock: script(o.lock), type: o.type ? script(o.type) : undefined })), outputsData: body.outputs_data, witnesses: body.witnesses });
        assert(tx.hash() === receipt.txHash && (!body.hash || body.hash === receipt.txHash), "Committed transaction hash does not match the saved receipt."); outputs(tx, ccc.Script.from(receipt.sourceLock));
        let blockNumber = raw.tx_status.block_number;
        if (blockNumber == null) {
          const blockHash = raw.tx_status.block_hash; assert(typeof blockHash === "string" && HASH.test(blockHash), "Committed transaction has no block evidence.");
          const header = await deploymentReadDeadline((async () => {
            const response = await fetcher(endpoint, { method: "POST", cache: "no-store", redirect: "error", headers: { "content-type": "application/json" }, signal: abort.signal, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "get_header", params: [blockHash] }) });
            current(() => active && check()); assert(response.ok, "Block evidence read failed."); const text = await response.text(); current(() => active && check()); assert(text.length <= 1000000, "Oversized block response.");
            const json = JSON.parse(text); assert(json.id === 2 && json.jsonrpc === "2.0" && !json.error && json.result?.hash === blockHash, "Block header hash does not match the committed transaction."); return json.result;
          })(), Math.max(1, timeout - (Date.now() - began)));
          blockNumber = header.number;
        }
        current(() => active && check()); assert(typeof blockNumber === "string" && /^0x[0-9a-f]{1,16}$/i.test(blockNumber), "Committed transaction has no valid block-number evidence.");
        attempts.push({ endpoint, status: "confirmed" }); return { ...evidence(), status: "confirmed", endpoint, blockNumber, recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString() };
      }
      if (["pending", "proposed", "sent"].includes(status)) { attempts.push({ endpoint, status: "pending" }); pending = { ...evidence(), status: "pending", endpoint, chainStatus: status, message: "The fixed transfer is visible but not committed. Check the saved hash; do not transfer again." }; }
      else if (status === "rejected") { const reason = typeof raw.tx_status.reason === "string" ? raw.tx_status.reason.slice(0, 4096) : "The node explicitly rejected this transfer."; attempts.push({ endpoint, status: "rejected" }); rejected = { ...evidence(), status: "rejected", endpoint, reason, message: "The node rejected this transaction. The receipt is retained; no automatic transfer retry will occur." }; }
      else attempts.push({ endpoint, status: "unknown", message: "Transaction not found or unrecognized status." });
    } catch (cause) { attempts.push({ endpoint, status: "unknown", message: cause instanceof Error ? cause.message : "Public read failed." }); }
    finally { active = false; if (timer) clearTimeout(timer); abort.abort(); }
  }
  if (!check()) return { ...evidence(), status: "unknown", reason: "stale", message: "The transfer check changed. Keep the saved receipt." };
  if (observedCommitted) return { ...evidence(), status: "unknown", reason: "unverified-committed", message: "A node reported committed but its full fixed transfer evidence was invalid. Do not transfer again." };
  return pending ?? rejected ?? { ...evidence(), status: "unknown", reason: "unverified", message: "No node established transfer confirmation. Keep the saved hash and do not repeat the transfer." };
}
