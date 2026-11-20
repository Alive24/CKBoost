import { ccc } from "@ckb-ccc/connector-react";
import {
  TESTNET_FUNDING_AMOUNT, TESTNET_FUNDING_RECIPIENT_ADDRESS, TESTNET_FUNDING_SOURCE_LOCK_HASH,
  prepareTestnetFundingTransfer, assertPreparedTestnetFundingTransfer, signAndBroadcastTestnetFundingTransfer,
  makePendingFundingTransfer, parsePendingFundingTransfers, parseSignedFundingTransferDiagnostics, probeTestnetFundingTransfer,
  CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError, type SignedFundingTransferDiagnostic,
} from "../testnet-funding-transfer";
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: jest.requireActual("@ckb-ccc/core") }));
const hash = (s: string) => `0x${s.repeat(64)}` as ccc.Hex;
const source = ccc.Script.from({ codeHash: "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac", hashType: "type", args: "0x0001969980e5e09eb09f4e0d0650b0f593e02acd8aca" });
const fakeGenesis = `0x${"00".repeat(1048576)}` as ccc.Hex;
const genesisPoint = { txHash: "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f", index: 3 };
function setup() {
  const client = new ccc.ClientPublicTestnet({ url: "https://testnet.ckbapp.dev/" });
  const cell = (key: string, capacity: number, lock = source) => ccc.Cell.from({ outPoint: { txHash: hash(key), index: 0 }, cellOutput: { lock, capacity: ccc.fixedPointFrom(capacity) }, outputData: "0x" });
  const a = cell("a", 300000), b = cell("b", 210000), typed = cell("c", 900000), nonempty = cell("d", 900000), foreign = cell("e", 900000, { ...source, args: "0x1234" } as unknown as ccc.Script);
  typed.cellOutput.type = ccc.Script.from({ codeHash: hash("f"), hashType: "type", args: "0x" }); nonempty.outputData = "0x01";
  const cells = [typed, nonempty, foreign, a, b];
  const find = jest.spyOn(client, "findCells").mockImplementation(async function* () { for (const c of cells) yield c; });
  const genesis = ccc.Cell.from({ outPoint: genesisPoint, cellOutput: { lock: source, capacity: ccc.fixedPointFrom(2000000) }, outputData: fakeGenesis });
  const live = jest.spyOn(client, "getCellLive").mockImplementation(async point => ccc.OutPoint.from(point).eq(genesisPoint) ? genesis : cells.find(c => c.outPoint.eq(point)));
  // Synthetic data only: explicitly mock the genesis-hash boundary. Real CCC transaction codecs/hashes remain in use.
  const originalHash = ccc.hashCkb;
  jest.spyOn(ccc, "hashCkb").mockImplementation(value => value === fakeGenesis ? "0x9799bee251b975b82c45a02154ce28cec89c5853ecc14d12b7b8cccfc19e0af4" : originalHash(value));
  jest.spyOn(client, "getFeeRate").mockResolvedValue(1000n);
  const estimate = jest.spyOn(client, "estimateCycles").mockResolvedValue(12000n);
  const send = jest.spyOn(client, "sendTransaction").mockImplementation(async tx => ccc.Transaction.from(tx).hash());
  const signer = { client, getRecommendedAddressObj: jest.fn(async () => ccc.Address.fromScript(source, client)),
    prepareTransaction: jest.fn(async (tx: ccc.Transaction) => { await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.JoyId); await tx.prepareSighashAllWitness(source, 1000, client); return tx; }),
    signTransaction: jest.fn(async (tx: ccc.Transaction) => { const signed = tx.clone(); signed.witnesses[0] = ccc.hexFrom(ccc.WitnessArgs.from({ lock: "0x1234" }).toBytes()); return signed; }),
  } as unknown as ccc.Signer;
  return { client, signer, cells, a, b, genesis, find, live, estimate, send };
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it("validates the fixed address checksum and source hash and uses a filtered exact plain-cell collector before selection", async () => {
  const { signer, client, a, b, find, send } = setup();
  expect(source.hash()).toBe(TESTNET_FUNDING_SOURCE_LOCK_HASH);
  const recipient = await ccc.Address.fromString(TESTNET_FUNDING_RECIPIENT_ADDRESS, client);
  expect(recipient.script.codeHash).toBe((await client.getKnownScript(ccc.KnownScript.OmniLock)).codeHash);
  const prepared = await prepareTestnetFundingTransfer(signer);
  expect(prepared.amount).toBe(TESTNET_FUNDING_AMOUNT); expect(prepared.tx.inputs.map(i => i.previousOutput.txHash)).toEqual([a.outPoint.txHash, b.outPoint.txHash]);
  expect(find).toHaveBeenCalledWith(expect.objectContaining({ script: expect.objectContaining({ args: source.args }), scriptType: "lock", scriptSearchMode: "exact", withData: true, filter: { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] } }));
  expect(prepared.tx.outputs[0].capacity).toBe(TESTNET_FUNDING_AMOUNT); expect(prepared.tx.outputs[0].lock.eq(recipient.script)).toBe(true);
  expect(prepared.tx.outputs[1].lock.eq(source)).toBe(true); expect(prepared.fee).toBeGreaterThan(0n); expect(prepared.fee).toBeLessThan(100000000n);
  expect(prepared.tx.cellDeps.some(d => d.outPoint.eq(genesisPoint))).toBe(true);
  expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it("rejects another source wallet and an incorrect known recipient before collecting funding", async () => {
  const { signer, client, find } = setup();
  jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue(ccc.Address.fromScript({ ...source, args: "0x12" }, client));
  await expect(prepareTestnetFundingTransfer(signer)).rejects.toThrow("specified JoyID"); expect(find).not.toHaveBeenCalled();
  const original = client.getKnownScript.bind(client);
  jest.spyOn(client, "getKnownScript").mockImplementation(async known => known === ccc.KnownScript.OmniLock ? ccc.ScriptInfo.from({ codeHash: hash("f"), hashType: "type", cellDeps: [] }) : original(known));
  await expect(prepareTestnetFundingTransfer(signer)).rejects.toThrow("fixed recipient"); expect(find).not.toHaveBeenCalled();
});

it("requires the pinned live genesis data cell without changing any global known-script registry", async () => {
  const { signer, client, genesis, find } = setup();
  const before = await client.getKnownScript(ccc.KnownScript.JoyId); genesis.outputData = "0x01";
  await expect(prepareTestnetFundingTransfer(signer)).rejects.toThrow("genesis secp256k1"); expect(find).not.toHaveBeenCalled();
  expect((await client.getKnownScript(ccc.KnownScript.JoyId)).cellDeps).toEqual(before.cellDeps);
});

it.each(["amount", "recipient", "change", "fee", "raw", "dependency"])("rejects tampered %s before a wallet signature", async field => {
  const { signer, client, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  if (field === "amount") prepared.tx.outputs[0].capacity -= 1n;
  if (field === "recipient") prepared.recipientAddress = "ckt1invalid";
  if (field === "change") prepared.tx.outputs[1].lock = ccc.Script.from({ ...source, args: "0x1234" });
  if (field === "fee") prepared.fee = 0n;
  if (field === "raw") prepared.tx.headerDeps = Array.from({ length: 4096 }, () => hash("f"));
  if (field === "dependency") prepared.tx.cellDeps = prepared.tx.cellDeps.filter(d => !d.outPoint.eq(genesisPoint));
  prepared.bodyHash = prepared.tx.hash();
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared)).rejects.toThrow();
  expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(client.addressPrefix).toBe("ckt");
});

it("rejects spent, typed or data-bearing inputs and a stale scope before signing", async () => {
  const { signer, a, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  a.outputData = "0x01";
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared)).rejects.toThrow("Only live empty untyped");
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared, () => false)).rejects.toThrow("changed");
  expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it("awaits public diagnostic then verification then durable receipt before its sole send", async () => {
  const { signer, estimate, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  const order: string[] = []; let snapshot: SignedFundingTransferDiagnostic | undefined;
  estimate.mockImplementation(async () => { order.push("verify"); return 1234n; }); send.mockImplementation(async tx => { order.push("send"); return ccc.Transaction.from(tx).hash(); });
  const hash = await signAndBroadcastTestnetFundingTransfer(signer, prepared, undefined, {
    onSignedDiagnostic: async d => { await Promise.resolve(); snapshot = d; order.push("diagnostic"); },
    onBeforeBroadcast: async receipt => { await Promise.resolve(); expect(receipt.txHash).toBe(prepared.bodyHash); order.push("receipt"); },
  });
  expect(order).toEqual(["diagnostic", "verify", "receipt", "send"]); expect(hash).toBe(prepared.bodyHash); expect(signer.signTransaction).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(1);
  expect(parseSignedFundingTransferDiagnostics(JSON.stringify([{ ...snapshot, credentials: { privateKey: "must-not-restore" } }]))).toEqual([snapshot]);
  const receipt = makePendingFundingTransfer(prepared, hash);
  expect(parsePendingFundingTransfers(JSON.stringify([{ ...receipt, signer: { privateKey: "must-not-restore" } }]))).toEqual([receipt]);
  expect(parsePendingFundingTransfers(JSON.stringify([{ ...receipt, amountShannons: "1" }]))).toEqual([]);
});

it.each(["preflight-rejected", "preflight-offline", "broadcast-rejected", "broadcast-offline"])("classifies %s without retries or a false receipt", async scenario => {
  const { signer, estimate, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  const rejected = scenario.endsWith("rejected"), error = Object.assign(new Error(rejected ? "TransactionFailedToVerify" : "network timeout"), rejected ? { code: -302 } : {});
  if (scenario.startsWith("preflight")) estimate.mockRejectedValue(error); else send.mockRejectedValue(error);
  const before = jest.fn();
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared, undefined, { onBeforeBroadcast: before })).rejects.toBeInstanceOf(rejected ? CodeDeploymentRejectedError : scenario.startsWith("preflight") ? CodeDeploymentPreflightError : CodeBroadcastStatusUnknownError);
  expect(before).toHaveBeenCalledTimes(scenario.startsWith("preflight") ? 0 : 1); expect(send).toHaveBeenCalledTimes(scenario.startsWith("preflight") ? 0 : 1); expect(signer.signTransaction).toHaveBeenCalledTimes(1);
});

it("does not send after callback failure, preflight mutation, or a late scope switch", async () => {
  const { signer, estimate, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared, undefined, { onBeforeBroadcast: () => { throw new Error("receipt persistence failed"); } })).rejects.toThrow("receipt persistence failed");
  estimate.mockImplementation(async tx => { ccc.Transaction.from(tx).witnesses.push("0x1234"); return 12n; });
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared)).rejects.toThrow("changed during preflight");
  let active = true; estimate.mockImplementation(async () => { active = false; return 12n; });
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared, () => active)).rejects.toThrow("changed"); expect(send).not.toHaveBeenCalled();
});

function rpcTx(tx: ccc.Transaction) {
  const script = (s: ccc.Script) => ({ code_hash: s.codeHash, hash_type: s.hashType, args: s.args });
  return { hash: tx.hash(), version: "0x0", cell_deps: tx.cellDeps.map(d => ({ out_point: { tx_hash: d.outPoint.txHash, index: ccc.numToHex(d.outPoint.index) }, dep_type: d.depType === "depGroup" ? "dep_group" : "code" })), header_deps: tx.headerDeps, inputs: tx.inputs.map(i => ({ previous_output: { tx_hash: i.previousOutput.txHash, index: ccc.numToHex(i.previousOutput.index) }, since: ccc.numToHex(i.since) })), outputs: tx.outputs.map(o => ({ capacity: ccc.numToHex(o.capacity), lock: script(o.lock), type: o.type ? script(o.type) : null })), outputs_data: tx.outputsData, witnesses: tx.witnesses };
}
const response = (result: unknown) => ({ ok: true, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result }) }) as Response;
it("confirms the exact committed transfer without requiring its output to remain unspent", async () => {
  const { signer } = setup(), prepared = await prepareTestnetFundingTransfer(signer), receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  const fetcher = jest.fn(async () => response({ transaction: rpcTx(prepared.tx), tx_status: { status: "committed", block_number: "0x123" } })) as unknown as typeof fetch;
  const result = await probeTestnetFundingTransfer(receipt, { fetcher });
  expect(result).toMatchObject({ status: "confirmed", amountShannons: TESTNET_FUNDING_AMOUNT.toString(), blockNumber: "0x123" }); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).toContain(TESTNET_FUNDING_RECIPIENT_ADDRESS);
});
it("preserves transaction:null rejection and treats pending, unknown and malformed committed safely", async () => {
  const { signer } = setup(), prepared = await prepareTestnetFundingTransfer(signer), receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  const fetcher = (result: unknown) => jest.fn(async () => response(result)) as unknown as typeof fetch;
  expect((await probeTestnetFundingTransfer(receipt, { fetcher: fetcher({ transaction: null, tx_status: { status: "rejected", reason: "lock -1" } }) })).status).toBe("rejected");
  expect((await probeTestnetFundingTransfer(receipt, { fetcher: fetcher({ transaction: null, tx_status: { status: "pending" } }) })).status).toBe("pending");
  expect((await probeTestnetFundingTransfer(receipt, { fetcher: fetcher(null) })).status).toBe("unknown");
  const wrong = prepared.tx.clone(); wrong.outputs[0].capacity--;
  expect((await probeTestnetFundingTransfer(receipt, { fetcher: fetcher({ transaction: rpcTx(wrong), tx_status: { status: "committed", block_number: "0x123" } }) })).status).toBe("unknown");
});

it("uses verified matching header evidence when the official RPC omits block_number", async () => {
  const { signer } = setup(), prepared = await prepareTestnetFundingTransfer(signer), receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  const fetcher = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    return request.method === "get_transaction" ? response({ transaction: rpcTx(prepared.tx), tx_status: { status: "committed", block_hash: hash("f") } }) : ({ ok: true, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 2, result: { hash: hash("f"), number: "0x456" } }) } as Response);
  }) as jest.MockedFunction<typeof fetch>;
  expect(await probeTestnetFundingTransfer(receipt, { fetcher })).toMatchObject({ status: "confirmed", blockNumber: "0x456" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).method).toBe("get_header");
  fetcher.mockImplementation(async (_url, init) => JSON.parse(String(init?.body)).method === "get_transaction" ? response({ transaction: rpcTx(prepared.tx), tx_status: { status: "committed", block_hash: hash("f") } }) : ({ ok: true, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 2, result: { hash: hash("e"), number: "0x456" } }) } as Response));
  expect(await probeTestnetFundingTransfer(receipt, { fetcher })).toMatchObject({ status: "unknown", reason: "unverified-committed" });
});

it("bounds unresponsive confirmation reads and ignores late results without another signature or send", async () => {
  const { signer, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer), receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  jest.useFakeTimers(); let finish: (value: Response) => void = () => {};
  const fetcher = jest.fn(() => new Promise<Response>(resolve => { finish = resolve; })) as unknown as typeof fetch;
  const pending = probeTestnetFundingTransfer(receipt, { fetcher, endpointTimeoutMs: 100 });
  await jest.advanceTimersByTimeAsync(200); expect((await pending).status).toBe("unknown");
  finish(response({ transaction: rpcTx(prepared.tx), tx_status: { status: "committed", block_number: "0x123" } })); await Promise.resolve();
  expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it("does not sign after duplicate inputs or send a body changed by the signing wallet", async () => {
  const { signer, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  const normal = prepared.tx.clone(); prepared.tx.inputs.push(prepared.tx.inputs[0].clone()); prepared.bodyHash = prepared.tx.hash();
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared)).rejects.toThrow("Duplicate funding input"); expect(signer.signTransaction).not.toHaveBeenCalled();
  prepared.tx = normal; prepared.bodyHash = normal.hash();
  jest.mocked(signer.signTransaction).mockImplementation(async tx => { const changed = ccc.Transaction.from(tx).clone(); changed.outputs[0].capacity--; return changed; });
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared)).rejects.toThrow("exactly 500,000"); expect(send).not.toHaveBeenCalled();
});

it("rechecks scope at CCC's actual RPC send boundary after its asynchronous fee read", async () => {
  const { signer, client, send } = setup(), prepared = await prepareTestnetFundingTransfer(signer);
  send.mockRestore();
  const noCache = jest.spyOn(client, "sendTransactionNoCache").mockResolvedValue(prepared.bodyHash);
  let active = true;
  jest.spyOn(ccc.Transaction.prototype, "getFeeRate").mockImplementation(async () => { active = false; return 1000n; });
  await expect(signAndBroadcastTestnetFundingTransfer(signer, prepared, () => active)).rejects.toThrow("changed");
  expect(noCache).not.toHaveBeenCalled();
});
