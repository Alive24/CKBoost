import { ccc } from "@ckb-ccc/connector-react";
import { makeConfirmedCodeManifest, parsePendingCodeDeployments, type ConfirmedCodeManifest, type PendingCodeDeployment } from "./testnet-code-deployment";

export const TESTNET_CONFIRMATION_ENDPOINTS = ["https://testnet.ckbapp.dev/", "https://testnet.ckb.dev/"] as const;
export const TESTNET_CONFIRMATION_ENDPOINT_TIMEOUT_MS = 6000;

type UnknownReason = "invalid-receipt" | "not-found" | "rpc-error" | "timeout" | "invalid-response" | "missing-block-evidence" | "verification-failed" | "stale";
export type TestnetConfirmationAttempt = {
  endpoint: string;
  status: "confirmed" | "pending" | "rejected" | "unknown";
  chainStatus?: string;
  reason?: string;
  message?: string;
};
type Evidence = { txHash: string; checkedAt: string; attempts: TestnetConfirmationAttempt[] };
export type TestnetCodeConfirmationResult = Evidence & (
  | { status: "confirmed"; manifest: ConfirmedCodeManifest; endpoint: string; blockNumber: string }
  | { status: "pending"; chainStatus: "pending" | "proposed" | "sent"; endpoint: string; message: string }
  | { status: "rejected"; reason: string; endpoint: string; message: string }
  | { status: "unknown"; reason: UnknownReason; message: string }
);

type ProbeOptions = {
  /** Dependency injection for read-only tests; endpoint selection remains fixed. */
  fetcher?: typeof fetch;
  /** Absolute budget for an endpoint's entire transaction/header/live-cell sequence. */
  endpointTimeoutMs?: number;
  isCurrent?: () => boolean;
};
type EndpointResult =
  | { status: "confirmed"; manifest: ConfirmedCodeManifest; blockNumber: string }
  | { status: "pending"; chainStatus: "pending" | "proposed" | "sent"; message: string }
  | { status: "rejected"; reason: string; message: string }
  | { status: "unknown"; reason: UnknownReason; message: string; chainStatus?: string };

class ProbeError extends Error {
  constructor(public readonly reason: UnknownReason, message: string, public readonly chainStatus?: string) { super(message); }
}

const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProbeError("invalid-response", "The Testnet node returned an invalid response. Confirmation is not verified.");
  return value as RecordValue;
}
function hex(value: unknown): ccc.Hex {
  if (typeof value !== "string" || !HEX.test(value)) throw new ProbeError("invalid-response", "The Testnet response contains invalid transaction bytes.");
  return value as ccc.Hex;
}
function quantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(value)) throw new ProbeError("invalid-response", "The Testnet response contains an invalid chain quantity.");
  return BigInt(value);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ProbeError("invalid-response", "The Testnet response is missing transaction fields.");
  return value;
}
function script(value: unknown): ccc.Script {
  const v = record(value);
  if (typeof v.code_hash !== "string" || !HASH.test(v.code_hash) || !["data", "type", "data1", "data2"].includes(v.hash_type as string)) {
    throw new ProbeError("invalid-response", "The Testnet response contains an invalid script.");
  }
  return ccc.Script.from({ codeHash: v.code_hash as ccc.Hex, hashType: v.hash_type as ccc.HashType, args: hex(v.args) });
}
function output(value: unknown): ccc.CellOutput {
  const v = record(value);
  return ccc.CellOutput.from({ capacity: quantity(v.capacity), lock: script(v.lock), type: v.type == null ? undefined : script(v.type) });
}
function transaction(value: unknown): ccc.Transaction {
  const v = record(value);
  return ccc.Transaction.from({
    version: quantity(v.version),
    cellDeps: array(v.cell_deps).map(value => {
      const dep = record(value), point = record(dep.out_point);
      if (dep.dep_type !== "code" && dep.dep_type !== "dep_group") throw new ProbeError("invalid-response", "Invalid transaction dependency type.");
      return { outPoint: { txHash: hex(point.tx_hash), index: quantity(point.index) }, depType: dep.dep_type === "dep_group" ? "depGroup" : "code" };
    }),
    headerDeps: array(v.header_deps).map(hex),
    inputs: array(v.inputs).map(value => { const input = record(value), point = record(input.previous_output); return { since: quantity(input.since), previousOutput: { txHash: hex(point.tx_hash), index: quantity(point.index) } }; }),
    outputs: array(v.outputs).map(output), outputsData: array(v.outputs_data).map(hex), witnesses: array(v.witnesses).map(hex),
  });
}

async function probeEndpoint(receipt: PendingCodeDeployment, endpoint: string, fetcher: typeof fetch, timeoutMs: number, isCurrent: () => boolean): Promise<EndpointResult> {
  const controller = new AbortController();
  let expired = false;
  let observedCommitted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const assertActive = () => {
    if (!isCurrent()) throw new ProbeError("stale", "The confirmation check changed or was closed. Check the saved transaction again; do not redeploy.");
    if (expired) throw new ProbeError("timeout", "The Testnet confirmation read timed out. Transaction status remains unverified; do not redeploy.");
  };
  let rpcId = 0;
  async function rpc(method: "get_transaction" | "get_header" | "get_live_cell", params: unknown[]): Promise<unknown> {
    assertActive();
    const id = ++rpcId;
    const response = await fetcher(endpoint, {
      method: "POST", cache: "no-store", redirect: "error", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: controller.signal,
    });
    assertActive();
    if (!response.ok) throw new ProbeError("rpc-error", `The Testnet node returned HTTP ${response.status}. No confirmation was established.`);
    const text = await response.text();
    assertActive();
    if (text.length > 2500000) throw new ProbeError("invalid-response", "The Testnet response is unexpectedly large.");
    let json: RecordValue;
    try { json = record(JSON.parse(text)); } catch { throw new ProbeError("invalid-response", "The Testnet node returned invalid JSON."); }
    if (json.id !== id || json.jsonrpc !== "2.0" || json.error || !("result" in json)) throw new ProbeError("rpc-error", "The Testnet RPC did not return a matching successful response.");
    return json.result;
  }
  const work = (async (): Promise<EndpointResult> => {
    // Raw status is required: CCC 1.12 discards rejected responses with transaction:null.
    const raw = await rpc("get_transaction", [receipt.txHash]);
    if (raw === null) return { status: "unknown", reason: "not-found", message: "This node has not found the transaction. This does not prove it was never broadcast; check the saved hash again." };
    const result = record(raw), status = record(result.tx_status);
    if (status.status === "rejected") {
      const reason = typeof status.reason === "string" && status.reason.trim() ? status.reason.slice(0, 4096) : "The Testnet node explicitly reported the transaction as rejected.";
      return { status: "rejected", reason, message: "The Testnet node reports rejection. No deployment is confirmed. The saved receipt is retained; no automatic signing or retry will occur." };
    }
    if (status.status === "pending" || status.status === "proposed" || status.status === "sent") {
      return { status: "pending", chainStatus: status.status, message: "The transaction is visible to this node but is not committed. Check confirmation again; do not deploy it again." };
    }
    if (status.status !== "committed") return { status: "unknown", reason: "invalid-response", message: "The node did not provide a recognized transaction status." };
    observedCommitted = true;
    try {
      const tx = transaction(result.transaction);
      const declaredHash = record(result.transaction).hash;
      if (tx.hash().toLowerCase() !== receipt.txHash.toLowerCase() ||
        (declaredHash !== undefined && (typeof declaredHash !== "string" || declaredHash.toLowerCase() !== receipt.txHash.toLowerCase()))) {
        throw new ProbeError("verification-failed", "The committed transaction body does not match the saved transaction hash.", "committed");
      }
      if (!tx.inputs[0] || ccc.hashTypeId(tx.inputs[0], 0).toLowerCase() !== receipt.typeScript.args.toLowerCase()) {
        throw new ProbeError("verification-failed", "The committed output is not the fresh Type ID creation described by this tool. Manifest export is blocked.", "committed");
      }
      let blockNumber: bigint;
      if (status.block_number != null) blockNumber = quantity(status.block_number);
      else {
        if (typeof status.block_hash !== "string" || !HASH.test(status.block_hash)) throw new ProbeError("missing-block-evidence", "The transaction is reported committed, but no block number or block hash is available. Confirmation remains unverified.", "committed");
        const header = record(await rpc("get_header", [status.block_hash]));
        if (typeof header.hash !== "string" || header.hash.toLowerCase() !== status.block_hash.toLowerCase()) throw new ProbeError("missing-block-evidence", "The returned block header does not match the committed transaction's block hash.", "committed");
        blockNumber = quantity(header.number);
      }
      assertActive();
      const live = record(await rpc("get_live_cell", [{ tx_hash: receipt.txHash, index: "0x0" }, true, false]));
      if (live.status !== "live" || !live.cell) throw new ProbeError("verification-failed", "The transaction is committed but its code output is not currently live. Manifest export remains blocked.", "committed");
      const data = record(record(live.cell).data);
      const cell = ccc.Cell.from({ outPoint: { txHash: receipt.txHash, index: 0 }, cellOutput: output(record(live.cell).output), outputData: hex(data.content) });
      if (typeof data.hash !== "string" || data.hash.toLowerCase() !== ccc.hashCkb(cell.outputData).toLowerCase() ||
        !tx.outputs[0] || !tx.outputs[0].lock.eq(cell.cellOutput.lock) || !tx.outputs[0].type?.eq(cell.cellOutput.type!) ||
        tx.outputs[0].capacity !== cell.cellOutput.capacity || tx.outputsData[0] !== cell.outputData) {
        throw new ProbeError("verification-failed", "The fresh live code output is inconsistent with the committed transaction or binary data hash.", "committed");
      }
      const manifest = makeConfirmedCodeManifest(receipt, blockNumber, cell, tx.inputs[0]);
      assertActive();
      return { status: "confirmed", manifest, blockNumber: `0x${blockNumber.toString(16)}` };
    } catch (cause) {
      if (cause instanceof ProbeError) throw new ProbeError(cause.reason, cause.message, "committed");
      throw new ProbeError("verification-failed", "The committed code cell does not match the saved owner, Type ID, capacity, or reviewed binary. Manifest export is blocked.", "committed");
    }
  })();
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; controller.abort(); reject(new ProbeError("timeout", "The Testnet confirmation read timed out. Transaction status remains unverified; check the saved hash again.")); }, timeoutMs);
    })]);
  } catch (cause) {
    if (cause instanceof ProbeError) return { status: "unknown", reason: cause.reason, message: cause.message, chainStatus: cause.chainStatus ?? (observedCommitted ? "committed" : undefined) };
    return { status: "unknown", reason: "rpc-error", message: "The Testnet confirmation RPC is unavailable. This is not proof of transaction failure; check the saved hash again.", chainStatus: observedCommitted ? "committed" : undefined };
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}

/** One read-only check, at most two bounded HTTPS attempts. Never signs, sends, deletes, or retries a deployment. */
export async function probeTestnetCodeConfirmation(receipt: PendingCodeDeployment, options: ProbeOptions = {}): Promise<TestnetCodeConfirmationResult> {
  const attempts: TestnetConfirmationAttempt[] = [];
  const evidence = () => ({ txHash: receipt.txHash, checkedAt: new Date().toISOString(), attempts });
  if (parsePendingCodeDeployments(JSON.stringify([receipt])).length !== 1) return { ...evidence(), status: "unknown", reason: "invalid-receipt", message: "The saved public deployment receipt is invalid. No confirmation request was made." };
  const fetcher = options.fetcher ?? globalThis.fetch;
  const isCurrent = options.isCurrent ?? (() => true);
  const timeoutMs = options.endpointTimeoutMs ?? TESTNET_CONFIRMATION_ENDPOINT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15000 || typeof fetcher !== "function") return { ...evidence(), status: "unknown", reason: "rpc-error", message: "The bounded Testnet confirmation transport is unavailable." };
  const results: { endpoint: string; result: EndpointResult }[] = [];
  for (const endpoint of TESTNET_CONFIRMATION_ENDPOINTS) {
    if (!isCurrent()) return { ...evidence(), status: "unknown", reason: "stale", message: "This confirmation check is no longer current. The saved receipt is retained." };
    const result = await probeEndpoint(receipt, endpoint, fetcher, timeoutMs, isCurrent);
    attempts.push({ endpoint, status: result.status, ...(result.status === "pending" ? { chainStatus: result.chainStatus } : {}),
      ...(result.status === "rejected" ? { chainStatus: "rejected", reason: result.reason, message: result.message } : {}),
      ...(result.status === "unknown" ? { reason: result.reason, message: result.message, chainStatus: result.chainStatus } : {}) });
    results.push({ endpoint, result });
    if (!isCurrent() || (result.status === "unknown" && result.reason === "stale")) return { ...evidence(), status: "unknown", reason: "stale", message: "This confirmation check is no longer current. The saved receipt is retained." };
    if (result.status === "confirmed") return { ...evidence(), ...result, endpoint };
  }
  // A committed-but-unverified response must not be hidden by another node's stale rejection.
  const unverified = results.find(({ result }) => result.status === "unknown" && result.chainStatus === "committed");
  if (unverified?.result.status === "unknown") return { ...evidence(), ...unverified.result };
  const pending = results.find(({ result }) => result.status === "pending");
  if (pending?.result.status === "pending") return { ...evidence(), ...pending.result, endpoint: pending.endpoint };
  const rejected = results.find(({ result }) => result.status === "rejected");
  if (rejected?.result.status === "rejected") return { ...evidence(), ...rejected.result, endpoint: rejected.endpoint };
  const unknown = results[results.length - 1]?.result;
  return unknown?.status === "unknown" ? { ...evidence(), ...unknown } : { ...evidence(), status: "unknown", reason: "rpc-error", message: "No Testnet node established confirmation. The saved receipt is retained." };
}
