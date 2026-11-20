import { ccc } from "@ckb-ccc/connector-react";
import { cccA } from "@ckb-ccc/core/advanced";
import { assertOriginalQaCode, assertPermissionUpgradeBody, makePermissionUpgradeManifests, PERMISSION_UPGRADE_IDS, QA_UPGRADE_TARGETS, UPGRADE_MAX_FEE, UPGRADE_OWNER } from "./testnet-permission-upgrade";

type Raw = Record<string, any>;
export type PermissionUpgradeConfirmation = { status: "confirmed"; transactionHash: ccc.Hex; manifests: ReturnType<typeof makePermissionUpgradeManifests>; feeShannons: string; rawEvidence: Raw } | { status: "pending" | "rejected" | "unknown"; transactionHash: string; message: string };
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function canonicalTransaction(raw: Raw, hash: string) {
  assert(raw?.tx_status?.status === "committed" && raw.transaction, "A committed transaction body is required.");
  const tx = ccc.Transaction.fromBytes(cccA.JsonRpcTransformers.transactionTo(JSON.parse(JSON.stringify(raw.transaction))).toBytes());
  assert(tx.outputs.every((output, index) => output.capacity === BigInt(raw.transaction.outputs[index].capacity)) && tx.hash() === hash && (!raw.transaction.hash || raw.transaction.hash === hash), "The committed raw transaction body/hash was not preserved.");
  return tx;
}
function liveCell(tx: ccc.Transaction, index: number, result: Raw) {
  assert(result?.status === "live" && result.cell?.output && result.cell?.data, "An upgraded code output is not currently live.");
  const raw = result.cell.output, data = result.cell.data;
  const cell = ccc.Cell.from({ outPoint: { txHash: tx.hash(), index }, cellOutput: { capacity: raw.capacity, lock: { codeHash: raw.lock.code_hash, hashType: raw.lock.hash_type, args: raw.lock.args }, type: { codeHash: raw.type?.code_hash, hashType: raw.type?.hash_type, args: raw.type?.args } }, outputData: data.content });
  assert(cell.cellOutput.type?.eq(tx.outputs[index].type!) && cell.cellOutput.lock.eq(tx.outputs[index].lock) && cell.cellOutput.capacity === tx.outputs[index].capacity && cell.outputData === tx.outputsData[index] && ccc.hashCkb(cell.outputData) === data.hash, "The live upgraded code differs from its actual committed output.");
  return cell;
}
/** Pure confirmation over the complete actual transaction, both prior code
 * transactions, every ordinary funding input and current live code outputs. */
export function verifyPermissionUpgradeEvidence(transactionHash: ccc.Hex, evidence: { transaction: Raw; previousTransactions: Record<string, Raw>; codeLives: Raw[]; blockNumber?: string }) {
  const tx = canonicalTransaction(evidence.transaction, transactionHash); assertPermissionUpgradeBody(tx);
  const block = BigInt(evidence.transaction.tx_status.block_number ?? evidence.blockNumber ?? "-1"); assert(block > 0n, "Committed block evidence is missing.");
  let inputCapacity = 0n;
  tx.inputs.forEach((input, index) => {
    const previous = evidence.previousTransactions[input.previousOutput.txHash];
    const parent = canonicalTransaction(previous, input.previousOutput.txHash), slot = Number(input.previousOutput.index);
    assert(parent.outputs[slot] && typeof parent.outputsData[slot] === "string", "Actual previous output is missing.");
    const cell = ccc.Cell.from({ outPoint: input.previousOutput, cellOutput: parent.outputs[slot], outputData: parent.outputsData[slot] });
    if (index < 2) assertOriginalQaCode(PERMISSION_UPGRADE_IDS[index], cell);
    else assert(!cell.cellOutput.type && cell.outputData === "0x" && cell.cellOutput.lock.eq(UPGRADE_OWNER), "The actual funding input is not ordinary Account 1 capacity.");
    inputCapacity += cell.cellOutput.capacity;
  });
  assert(evidence.codeLives.length === 2, "Both upgraded code outputs must be verified.");
  evidence.codeLives.forEach((live, index) => liveCell(tx, index, live));
  const fee = inputCapacity - tx.outputs.reduce((sum, output) => sum + output.capacity, 0n);
  assert(fee > 0n && fee <= UPGRADE_MAX_FEE, "The actual fee is outside the reviewed limit.");
  return { status: "confirmed" as const, transactionHash, manifests: makePermissionUpgradeManifests(tx, block), feeShannons: fee.toString(), rawEvidence: evidence };
}
/** Fixed official HTTPS reads only. Each round has one shared 30-second budget.
 * No method in this module requests a signature or broadcasts a transaction. */
export async function probePermissionUpgrade(transactionHash: string, options: { fetcher?: typeof fetch; endpoint?: "https://testnet.ckbapp.dev/" | "https://testnet.ckb.dev/"; isCurrent?: () => boolean } = {}): Promise<PermissionUpgradeConfirmation> {
  assert(/^0x[0-9a-f]{64}$/.test(transactionHash), "A complete transaction hash is required.");
  const endpoint = options.endpoint ?? "https://testnet.ckbapp.dev/";
  assert(["https://testnet.ckbapp.dev/", "https://testnet.ckb.dev/"].includes(endpoint), "Only official Testnet reads are allowed.");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000), fetcher = options.fetcher ?? fetch;
  let id = 0;
  async function rpc(method: "get_transaction" | "get_live_cell" | "get_header", params: unknown[]) {
    assert(options.isCurrent?.() !== false, "The confirmation operation changed.");
    const requestId = ++id;
    const response = await fetcher(endpoint, { method: "POST", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal: controller.signal });
    assert(response.ok, "The official Testnet read failed.");
    const text = await response.text(); assert(text.length < 4000000, "Unexpectedly large Testnet response.");
    const value = JSON.parse(text); assert(value.jsonrpc === "2.0" && value.id === requestId && !value.error && "result" in value, "Invalid matching Testnet RPC response.");
    assert(options.isCurrent?.() !== false, "The confirmation operation changed.");
    return value.result;
  }
  try {
    const transaction = await rpc("get_transaction", [transactionHash]);
    const status = transaction?.tx_status?.status;
    if (status === "rejected") return { status: "rejected", transactionHash, message: String(transaction.tx_status.reason ?? "The node rejected this transaction.") };
    if (["pending", "proposed", "sent"].includes(status)) return { status: "pending", transactionHash, message: "The transaction is visible but not committed. Check again; do not sign another copy." };
    if (status !== "committed") return { status: "unknown", transactionHash, message: "This node has not established confirmation. Keep the saved hash and check again." };
    const tx = canonicalTransaction(transaction, transactionHash); assertPermissionUpgradeBody(tx);
    const previousHashes = [...new Set(tx.inputs.map(input => input.previousOutput.txHash))];
    const previousTransactions: Record<string, Raw> = {};
    for (let index = 0; index < previousHashes.length; index += 4) await Promise.all(previousHashes.slice(index, index + 4).map(async hash => { previousTransactions[hash] = await rpc("get_transaction", [hash]); }));
    const codeLives = await Promise.all([0, 1].map(index => rpc("get_live_cell", [{ tx_hash: transactionHash, index: ccc.numToHex(index) }, true, false])));
    let blockNumber = transaction.tx_status.block_number;
    if (!blockNumber) { const header = await rpc("get_header", [transaction.tx_status.block_hash]); assert(header?.hash === transaction.tx_status.block_hash, "Committed header evidence mismatched."); blockNumber = header.number; }
    return verifyPermissionUpgradeEvidence(transactionHash as ccc.Hex, { transaction, previousTransactions, codeLives, blockNumber });
  } catch (cause) { return { status: "unknown", transactionHash, message: cause instanceof Error ? cause.message : "Confirmation unavailable; no retry signature was requested." }; }
  finally { clearTimeout(timer); controller.abort(); }
}
/** Discover by the exact two QA TypeID scripts, then confirm one atomic batch.
 * This does not infer deployment from matching public binary content. */
export function permissionUpgradeTargets() { return PERMISSION_UPGRADE_IDS.map(id => QA_UPGRADE_TARGETS[id].typeScript); }
