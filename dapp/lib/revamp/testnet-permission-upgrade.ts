import { ccc } from "@ckb-ccc/connector-react";
import { PERMISSION_REVIEW_RELEASES, type PermissionReviewCodeId } from "../ckb/permissions-release-pins.mjs";
import { PERMISSION_UPGRADE_IDS, validatePermissionRelease } from "./testnet-permission-release";
export { PERMISSION_UPGRADE_IDS, validatePermissionRelease } from "./testnet-permission-release";

export const UPGRADE_OWNER = Object.freeze({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type" as const, args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
export const REVIEWER_ACCOUNT4 = Object.freeze({ codeHash: UPGRADE_OWNER.codeHash, hashType: "type" as const, args: "0x129146fd95deca3f4cc48a6bb23259bb7614cd7f8100" });
export const REVIEWER_TEST_CAPACITY = 1000n * 100_000_000n;
export const UPGRADE_MAX_FEE = 100_000_000n;
const TYPE_ID = "0x00000000000000000000000000000000000000000000000000545950455f4944";
export const QA_UPGRADE_TARGETS = Object.freeze({
  "protocol-lock": Object.freeze({ transactionHash: "0xdb31514a0e178b3c5bd6f21d34a1cc20c0b7badbb3ebd6711c9bb2711a58a066", index: "0x0", typeHash: "0xe91b5a78463c293318331c21d372e031eb9ffad87b379fbe0563222fcdd28815", typeScript: { codeHash: TYPE_ID, hashType: "type" as const, args: "0x06661a546d171ae6f280f3f1363070c7d1e7ad7dc1032d566c7b16f804d57ab4" }, dataHash: "0xc05104a58335932de04ddc8aaaf95f252394b1012580f3a118527400ced856c7", byteLength: 183336, capacityShannons: "18346400000000" }),
  "campaign-type": Object.freeze({ transactionHash: "0x72dc50dbe634b1746e2d6033009c751ff02ff6bceab7d601e9c36fbcfb1d4a3d", index: "0x0", typeHash: "0x9004d12f500e558df19c14e08907e014dbfc50ae249500bb5c389f883a1487d2", typeScript: { codeHash: TYPE_ID, hashType: "type" as const, args: "0xfe4dcdc1378be473b33321f30db589d220a2947a0156aa41e809af6f1cae5027" }, dataHash: "0x8f47dc10346658617399a196e994aba09d1e7ed06bdb01111ac783510b17a62b", byteLength: 255480, capacityShannons: "25560800000000" }),
});
export type UpgradeGuard = () => boolean;
export type UpgradeBytes = Record<PermissionReviewCodeId, Uint8Array>;
export type PreparedPermissionUpgrade = { tx: ccc.Transaction; bodyHash: ccc.Hex; fee: bigint; additionalCodeCapacity: bigint; networkLimitBytes: number };
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const current = (guard: UpgradeGuard) => assert(guard(), "The wallet or operation changed. Prepare again; no automatic wallet retry is performed.");
/** CCC's browser default uses the official WebSocket endpoint. Wallet RPC
 * calls retain that transport; fetch-only reads use its exact HTTPS peer. */
export function getPermissionUpgradeReadEndpoint(client: Pick<ccc.Client, "url" | "addressPrefix">): "https://testnet.ckb.dev/" | "https://testnet.ckbapp.dev/" {
  const url = new URL(client.url);
  const clean = client.addressPrefix === "ckt" && !url.port && !url.username && !url.password && !url.search && !url.hash;
  const https = url.protocol === "https:" && ["testnet.ckbapp.dev", "testnet.ckb.dev"].includes(url.hostname) && url.pathname === "/";
  const websocket = url.protocol === "wss:" && url.hostname === "testnet.ckb.dev" && url.pathname === "/ws";
  assert(clean && (https || websocket), "Only the fixed public CKB Testnet endpoints are supported.");
  return url.hostname === "testnet.ckbapp.dev" ? "https://testnet.ckbapp.dev/" : "https://testnet.ckb.dev/";
}
export function assertUpgradeNetwork(client: Pick<ccc.Client, "url" | "addressPrefix">) {
  getPermissionUpgradeReadEndpoint(client);
}
function capacity(id: PermissionReviewCodeId) {
  const pin = PERMISSION_REVIEW_RELEASES[id]; assert(pin, "Unpinned release.");
  const required = ccc.CellOutput.from({ lock: UPGRADE_OWNER, type: QA_UPGRADE_TARGETS[id].typeScript }, new Uint8Array(pin.byteLength)).capacity;
  return required > BigInt(QA_UPGRADE_TARGETS[id].capacityShannons) ? required : BigInt(QA_UPGRADE_TARGETS[id].capacityShannons);
}
function samePoint(a: ccc.OutPoint, target: { transactionHash: string; index: string }) { return a.txHash === target.transactionHash && a.index === BigInt(target.index); }
async function deadline<T>(promise: Promise<T>, timeoutMs = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("The Testnet read timed out. Retry the read, not the wallet signature.")), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
async function owner(signer: ccc.Signer, guard: UpgradeGuard) {
  current(guard); assertUpgradeNetwork(signer.client);
  const address = await deadline(signer.getRecommendedAddressObj()); current(guard);
  assert(address.script.eq(UPGRADE_OWNER), "Connect Account 1, the owner of these two dedicated QA code cells (CKB address ending 2rlz).");
  return address;
}
export function assertOriginalQaCode(id: PermissionReviewCodeId, cell: ccc.Cell) {
  const target = QA_UPGRADE_TARGETS[id];
  assert(samePoint(cell.outPoint, target) && cell.cellOutput.lock.eq(UPGRADE_OWNER) && cell.cellOutput.type?.eq(target.typeScript) && cell.cellOutput.type.hash() === target.typeHash && cell.cellOutput.capacity === BigInt(target.capacityShannons) && ccc.bytesFrom(cell.outputData).length === target.byteLength && ccc.hashCkb(cell.outputData) === target.dataHash, "The input is not the original dedicated QA code cell. Shared/online contracts and already-upgraded cells cannot be selected.");
}
/** Pure body guard. It deliberately allows exactly two QA code inputs/outputs,
 * one fixed Account 4 funding output, and ordinary Account 1 capacity/change. */
export function assertPermissionUpgradeBody(tx: ccc.Transaction) {
  assert(tx.inputs.length >= 3 && tx.inputs.length <= 40 && tx.outputs.length >= 3 && tx.outputs.length <= 4 && tx.outputsData.length === tx.outputs.length, "Unexpected upgrade input/output shape.");
  const seen = new Set<string>();
  for (const input of tx.inputs) { const key = `${input.previousOutput.txHash}:${input.previousOutput.index}`; assert(!seen.has(key) && input.since === 0n, "Duplicate or timelocked upgrade input."); seen.add(key); }
  PERMISSION_UPGRADE_IDS.forEach((id, index) => {
    const target = QA_UPGRADE_TARGETS[id], output = tx.outputs[index];
    assert(samePoint(tx.inputs[index].previousOutput, target), "The two original QA code inputs must remain in their fixed positions.");
    assert(output.type?.eq(target.typeScript) && output.type.hash() === target.typeHash && output.lock.eq(UPGRADE_OWNER) && output.capacity === capacity(id), "A code TypeID, owner, output position or capacity changed.");
    validatePermissionRelease(id, ccc.bytesFrom(tx.outputsData[index]));
  });
  const funding = tx.outputs[2];
  assert(!funding.type && funding.lock.eq(REVIEWER_ACCOUNT4) && funding.capacity === REVIEWER_TEST_CAPACITY && tx.outputsData[2] === "0x", "Only the fixed 1,000 tCKB Account 4 test funding is allowed.");
  if (tx.outputs[3]) assert(!tx.outputs[3].type && tx.outputs[3].lock.eq(UPGRADE_OWNER) && tx.outputsData[3] === "0x", "Only empty Account 1 change may follow the fixed outputs.");
  assert(tx.headerDeps.length === 0, "Unexpected header dependency.");
  assert(!tx.cellDeps.some(dep => PERMISSION_UPGRADE_IDS.some(id => samePoint(dep.outPoint, QA_UPGRADE_TARGETS[id]))), "An upgraded code cell cannot also remain a code dependency of this transaction.");
}
async function inputs(signer: ccc.Signer, tx: ccc.Transaction, guard: UpgradeGuard) {
  assertPermissionUpgradeBody(tx);
  const cells: ccc.Cell[] = [];
  for (let index = 0; index < tx.inputs.length; index++) {
    current(guard);
    const cell = await deadline(signer.client.getCellLive(tx.inputs[index].previousOutput)); current(guard);
    assert(cell, "An upgrade input is no longer live. Check the saved transaction; do not sign another copy.");
    if (index < 2) assertOriginalQaCode(PERMISSION_UPGRADE_IDS[index], cell);
    else assert(!cell.cellOutput.type && cell.outputData === "0x" && cell.cellOutput.lock.eq(UPGRADE_OWNER), "Funding inputs must be empty, untyped Account 1 cells. Protocol, campaign and UserCells are forbidden.");
    cells.push(cell);
  }
  const fee = cells.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) - tx.outputs.reduce((sum, output) => sum + output.capacity, 0n);
  assert(fee > 0n && fee <= UPGRADE_MAX_FEE, "The fee must be positive and at most 1 tCKB.");
  return fee;
}
async function consensusLimit(client: ccc.Client) {
  const endpoint = getPermissionUpgradeReadEndpoint(client);
  const response = await fetch(endpoint, { method: "POST", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "get_consensus", params: [] }), signal: AbortSignal.timeout(12000) });
  assert(response.ok, "Could not read the Testnet transaction size limit.");
  const result = await response.json();
  assert(result?.id === 1 && !result.error && /^0x[0-9a-f]+$/i.test(result?.result?.max_block_bytes), "Invalid Testnet consensus response.");
  const bytes = Number(BigInt(result.result.max_block_bytes));
  assert(Number.isSafeInteger(bytes) && bytes > 0, "Invalid size limit.");
  return Math.min(bytes, 500000);
}
/** Read/prepare only. Code cells are explicitly selected, never searched by a
 * shared code hash or taken from the active site's protocol configuration. */
export async function preparePermissionUpgrade(signer: ccc.Signer, binaries: UpgradeBytes, guard: UpgradeGuard = () => true): Promise<PreparedPermissionUpgrade> {
  const address = await owner(signer, guard);
  PERMISSION_UPGRADE_IDS.forEach(id => validatePermissionRelease(id, binaries[id]));
  const old = await Promise.all(PERMISSION_UPGRADE_IDS.map(async id => { const target = QA_UPGRADE_TARGETS[id]; const cell = await deadline(signer.client.getCellLive({ txHash: target.transactionHash, index: target.index })); current(guard); assert(cell, "A QA code cell is no longer live; check whether the upgrade already committed."); assertOriginalQaCode(id, cell); return cell; }));
  const tx = ccc.Transaction.from({ inputs: old.map(cell => ({ previousOutput: cell.outPoint })), outputs: [...PERMISSION_UPGRADE_IDS.map(id => ({ capacity: capacity(id), lock: address.script, type: QA_UPGRADE_TARGETS[id].typeScript })), { capacity: REVIEWER_TEST_CAPACITY, lock: REVIEWER_ACCOUNT4 }], outputsData: [...PERMISSION_UPGRADE_IDS.map(id => ccc.hexFrom(binaries[id])), "0x"] });
  await tx.completeInputsByCapacity(signer); await owner(signer, guard);
  const prepared = await signer.prepareTransaction(tx); current(guard); if (prepared !== tx) tx.copy(prepared);
  await tx.completeFeeBy(signer); await owner(signer, guard);
  const fee = await inputs(signer, tx, guard), networkLimitBytes = await consensusLimit(signer.client); current(guard);
  assert(tx.toBytes().length + 4096 < networkLimitBytes, "The combined upgrade exceeds the verified Testnet size limit. Nothing was signed.");
  return { tx, bodyHash: tx.hash(), fee, networkLimitBytes, additionalCodeCapacity: PERMISSION_UPGRADE_IDS.reduce((sum, id) => sum + capacity(id) - BigInt(QA_UPGRADE_TARGETS[id].capacityShannons), 0n) };
}
export type PermissionUpgradeDiagnostic = { schema: "ckboost-testnet-permission-upgrade-signed/v1"; network: "testnet"; transactionHash: ccc.Hex; signedTransaction: ccc.Hex; feeShannons: string };
/** Signing is only invoked by the explicit Upgrade button. No automatic retry. */
export async function signPermissionUpgrade(signer: ccc.Signer, prepared: PreparedPermissionUpgrade, onSigned: (diagnostic: PermissionUpgradeDiagnostic) => void | Promise<void>, guard: UpgradeGuard = () => true, onBroadcastAttempt?: (hash: ccc.Hex) => void | Promise<void>): Promise<ccc.Hex> {
  await owner(signer, guard); assert(prepared.tx.hash() === prepared.bodyHash, "Prepared transaction changed.");
  const fee = await inputs(signer, prepared.tx, guard); assert(fee === prepared.fee, "Prepared fee changed.");
  const signed = ccc.Transaction.fromBytes((await signer.signTransaction(prepared.tx)).toBytes());
  await owner(signer, guard); assert(signed.hash() === prepared.bodyHash, "The wallet changed the transaction body. Nothing was broadcast.");
  assertPermissionUpgradeBody(signed); assert(signed.toBytes().length < prepared.networkLimitBytes, "Signed transaction exceeds the size limit.");
  await onSigned({ schema: "ckboost-testnet-permission-upgrade-signed/v1", network: "testnet", transactionHash: signed.hash(), signedTransaction: ccc.hexFrom(signed.toBytes()), feeShannons: fee.toString() });
  await owner(signer, guard);
  const cycles = await deadline(signer.client.estimateCycles(signed), 20000); current(guard);
  assert(cycles > 0n, "Read-only script verification did not return valid cycles. Nothing was broadcast.");
  await inputs(signer, signed, guard); await owner(signer, guard);
  await onBroadcastAttempt?.(signed.hash()); current(guard);
  const sent = await signer.client.sendTransaction(signed);
  assert(sent === signed.hash(), "Unexpected RPC transaction hash. Check the saved diagnostic before doing anything else.");
  return sent;
}
export function makePermissionUpgradeManifests(tx: ccc.Transaction, blockNumber: bigint) {
  assertPermissionUpgradeBody(tx);
  assert(blockNumber > 0n, "Committed block evidence required.");
  return PERMISSION_UPGRADE_IDS.map((id, index) => {
    const prior = QA_UPGRADE_TARGETS[id], pin = PERMISSION_REVIEW_RELEASES[id]!;
    return { schema: "ckboost-testnet-code-upgrade/v1", network: "testnet", contract: id, hashType: "type", isTypeId: true, transactionHash: tx.hash(), index: ccc.numToHex(index), blockNumber: ccc.numToHex(blockNumber), typeScript: { ...prior.typeScript }, typeHash: prior.typeHash, lockScript: { ...UPGRADE_OWNER }, contractSize: pin.byteLength, dataHash: pin.dataHash, capacityShannons: tx.outputs[index].capacity.toString(), previous: { transactionHash: prior.transactionHash, index: prior.index, dataHash: prior.dataHash, contractSize: prior.byteLength, capacityShannons: prior.capacityShannons }, upgradeEvidence: { transactionHash: tx.hash(), blockNumber: ccc.numToHex(blockNumber), inputIndex: index, outputIndex: index, consumedInput: ccc.hexFrom(tx.inputs[index].toBytes()), consumedOutPoint: { txHash: prior.transactionHash, index: prior.index } } };
  });
}
