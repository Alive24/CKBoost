import { ccc } from "@ckb-ccc/connector-react";
import { makePendingCodeDeployment, TESTNET_CODE_RELEASES, TYPE_ID_CODE_HASH, getTestnetCodeCapacity, type PreparedCodeDeployment } from "../testnet-code-deployment";
import { probeTestnetCodeConfirmation, TESTNET_CONFIRMATION_ENDPOINTS } from "../testnet-code-confirmation";

jest.mock("@ckb-ccc/connector-react", () => ({ ccc: jest.requireActual("@ckb-ccc/core") }));

const hash = (value: string) => `0x${value.repeat(64)}` as ccc.Hex;
const quantity = (value: bigint) => `0x${value.toString(16)}`;
const rawScript = (script: ccc.Script) => ({ code_hash: script.codeHash, hash_type: script.hashType, args: script.args });
function fixture(id: "protocol-lock" | "user-type" = "protocol-lock") {
  const bytes = new Uint8Array(128); bytes[0] = 0x7f;
  const release = TESTNET_CODE_RELEASES[id] as { byteLength: number; dataHash: string };
  jest.replaceProperty(release, "byteLength", bytes.length); jest.replaceProperty(release, "dataHash", ccc.hashCkb(bytes));
  const lock = id === "user-type" ? ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" }) : ccc.Script.from({ codeHash: hash("a"), hashType: "type", args: `0x${"11".repeat(20)}` });
  const type = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: hash("b") });
  const capacity = getTestnetCodeCapacity(bytes.length, lock);
  const tx = ccc.Transaction.from({ inputs: [{ previousOutput: { txHash: hash("c"), index: 0 } }], outputs: [{ capacity, lock, type }], outputsData: [ccc.hexFrom(bytes)], witnesses: ["0x"] });
  tx.outputs[0].type!.args = ccc.hashTypeId(tx.inputs[0], 0);
  const txHash = tx.hash();
  const prepared: PreparedCodeDeployment = { id, tx, bodyHash: txHash, dataHash: ccc.hashCkb(bytes), typeScript: tx.outputs[0].type!, typeHash: tx.outputs[0].type!.hash(), capacity, fee: 1000n, walletLock: lock, walletAddress: new ccc.Address(lock, "ckt").toString(), byteLength: bytes.length };
  const receipt = makePendingCodeDeployment(prepared, txHash);
  const rawOutput = { capacity: quantity(capacity), lock: rawScript(lock), type: rawScript(tx.outputs[0].type!) };
  const rawTx = { hash: txHash, version: "0x0", cell_deps: [], header_deps: [], inputs: [{ since: "0x0", previous_output: { tx_hash: hash("c"), index: "0x0" } }], outputs: [rawOutput], outputs_data: [ccc.hexFrom(bytes)], witnesses: ["0x"] };
  const committed = { transaction: rawTx, tx_status: { status: "committed", block_hash: hash("d"), block_number: "0x123" } };
  const live = { status: "live", cell: { output: rawOutput, data: { content: ccc.hexFrom(bytes), hash: ccc.hashCkb(bytes) } } };
  return { receipt, committed, live, prepared, rawTx };
}

type RpcRequest = { jsonrpc: string; id: number; method: string; params: unknown[] };
function fetchMock(reply: (request: RpcRequest, endpoint: string) => unknown) {
  return jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(init!.body as string) as RpcRequest;
    return { ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: "2.0", id: request.id, result: reply(request, String(url)) }) } as Response;
  }) as jest.MockedFunction<typeof fetch>;
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe("fresh read-only Testnet code confirmation", () => {
  it("includes verified creation evidence for a newly deployed independent UserType", async () => {
    const { receipt, committed, live, prepared } = fixture("user-type");
    const fetcher = fetchMock(request => request.method === "get_transaction" ? committed : live);
    expect(await probeTestnetCodeConfirmation(receipt, { fetcher })).toMatchObject({ status: "confirmed", manifest: { contract: "user-type", creationEvidence: { transactionHash: receipt.txHash, blockNumber: "0x123", outputIndex: 0, firstInput: ccc.hexFrom(prepared.tx.inputs[0].toBytes()), typeIdArgs: prepared.typeScript.args } } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves raw rejected status with transaction:null and the actual lock validation reason", async () => {
    const { receipt } = fixture();
    const reason = "TransactionFailedToVerify Inputs[0].Lock ValidationFailure code -1 by-type-hash d23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac";
    const fetcher = fetchMock(() => ({ transaction: null, tx_status: { status: "rejected", reason } }));
    const result = await probeTestnetCodeConfirmation(receipt, { fetcher });
    expect(result).toMatchObject({ status: "rejected", reason, txHash: receipt.txHash });
    expect(result.attempts).toHaveLength(2);
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([...TESTNET_CONFIRMATION_ENDPOINTS]);
    expect(fetcher.mock.calls.every(([, init]) => JSON.parse(init!.body as string).method === "get_transaction")).toBe(true);
    expect(JSON.parse(JSON.stringify(result)).reason).toBe(reason);
  });

  it("confirms a matching committed transaction with two fresh calls and no long polling", async () => {
    const { receipt, committed, live, prepared } = fixture();
    const fetcher = fetchMock(request => request.method === "get_transaction" ? committed : live);
    const result = await probeTestnetCodeConfirmation(receipt, { fetcher });
    expect(result).toMatchObject({ status: "confirmed", blockNumber: "0x123", manifest: { transactionHash: receipt.txHash, typeHash: prepared.typeHash, dataHash: prepared.dataHash } });
    expect(fetcher.mock.calls).toHaveLength(2);
    const requests = fetcher.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(requests.map(request => request.method)).toEqual(["get_transaction", "get_live_cell"]);
    expect(requests[1].params).toEqual([{ tx_hash: receipt.txHash, index: "0x0" }, true, false]);
    expect(fetcher.mock.calls.every(([, init]) => init!.cache === "no-store" && init!.signal)).toBe(true);
  });

  it("resolves committed + blockHash through a fresh matching header when block_number is missing", async () => {
    const { receipt, committed, live } = fixture();
    delete (committed.tx_status as Partial<typeof committed.tx_status>).block_number;
    const fetcher = fetchMock(request => request.method === "get_transaction" ? committed : request.method === "get_header" ? { hash: hash("d"), number: "0x456" } : live);
    const result = await probeTestnetCodeConfirmation(receipt, { fetcher });
    expect(result).toMatchObject({ status: "confirmed", blockNumber: "0x456", manifest: { blockNumber: "0x456" } });
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init!.body as string).method)).toEqual(["get_transaction", "get_header", "get_live_cell"]);
  });

  it.each(["pending", "proposed", "sent"] as const)("returns %s immediately without fabricating confirmation", async status => {
    const { receipt } = fixture();
    const fetcher = fetchMock(() => ({ transaction: null, tx_status: { status } }));
    expect(await probeTestnetCodeConfirmation(receipt, { fetcher })).toMatchObject({ status: "pending", chainStatus: status });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses the other official endpoint when a node is behind, and can confirm instead of a stale rejection", async () => {
    const { receipt, committed, live } = fixture();
    const fetcher = fetchMock((request, endpoint) => endpoint === TESTNET_CONFIRMATION_ENDPOINTS[0] ? { transaction: null, tx_status: { status: "rejected", reason: "stale local mempool rejection" } } : request.method === "get_transaction" ? committed : live);
    expect(await probeTestnetCodeConfirmation(receipt, { fetcher })).toMatchObject({ status: "confirmed" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps not-found distinct from rejected and does not delete or alter the saved receipt", async () => {
    const { receipt } = fixture(), before = JSON.stringify(receipt);
    const result = await probeTestnetCodeConfirmation(receipt, { fetcher: fetchMock(() => null) });
    expect(result).toMatchObject({ status: "unknown", reason: "not-found" });
    expect(JSON.stringify(receipt)).toBe(before);
  });

  it.each(["owner", "type", "capacity", "data", "data-hash", "dead"])("blocks manifest export when the fresh live cell has a %s mismatch", async kind => {
    const { receipt, committed, live } = fixture();
    const changed = JSON.parse(JSON.stringify(live));
    if (kind === "owner") changed.cell.output.lock.args = `0x${"22".repeat(20)}`;
    if (kind === "type") changed.cell.output.type.args = hash("e");
    if (kind === "capacity") changed.cell.output.capacity = quantity(BigInt(live.cell.output.capacity) + 1n);
    if (kind === "data") { changed.cell.data.content = `0x${"ff".repeat(128)}`; changed.cell.data.hash = ccc.hashCkb(changed.cell.data.content); }
    if (kind === "data-hash") changed.cell.data.hash = hash("f");
    if (kind === "dead") { changed.status = "dead"; changed.cell = null; }
    const result = await probeTestnetCodeConfirmation(receipt, { fetcher: fetchMock(request => request.method === "get_transaction" ? committed : changed) });
    expect(result).toMatchObject({ status: "unknown", reason: "verification-failed" });
    expect(result).not.toHaveProperty("manifest");
  });

  it("blocks a mismatched committed body, even when the reported hash claims to match", async () => {
    const { receipt, committed, live } = fixture();
    committed.transaction.outputs_data = ["0x"];
    const result = await probeTestnetCodeConfirmation(receipt, { fetcher: fetchMock(request => request.method === "get_transaction" ? committed : live) });
    expect(result).toMatchObject({ status: "unknown", reason: "verification-failed" });
  });

  it("does not certify an existing Type ID update as a fresh code deployment from a modified receipt", async () => {
    const { receipt, committed, live, prepared } = fixture();
    prepared.tx.outputs[0].type!.args = hash("e");
    const alteredHash = prepared.tx.hash();
    const alteredReceipt = { ...receipt, txHash: alteredHash, typeScript: { ...receipt.typeScript, args: hash("e") } };
    committed.transaction.hash = alteredHash;
    committed.transaction.outputs[0].type.args = hash("e");
    live.cell.output.type.args = hash("e");
    expect(await probeTestnetCodeConfirmation(alteredReceipt, { fetcher: fetchMock(request => request.method === "get_transaction" ? committed : live) })).toMatchObject({ status: "unknown", reason: "verification-failed" });
  });

  it("does not discard a committed-but-unverified result in favor of another node's rejected status", async () => {
    const { receipt, committed } = fixture();
    const fetcher = fetchMock((request, endpoint) => endpoint === TESTNET_CONFIRMATION_ENDPOINTS[1] ? { transaction: null, tx_status: { status: "rejected", reason: "another node rejected" } } : request.method === "get_transaction" ? committed : { status: "unknown", cell: null });
    expect(await probeTestnetCodeConfirmation(receipt, { fetcher })).toMatchObject({ status: "unknown", reason: "verification-failed" });
  });

  it("requires matching block evidence and never turns missing block_number into a 60-second wait", async () => {
    const { receipt, committed } = fixture();
    delete (committed.tx_status as Partial<typeof committed.tx_status>).block_number;
    const fetcher = fetchMock(request => request.method === "get_transaction" ? committed : { hash: hash("e"), number: "0x123" });
    expect(await probeTestnetCodeConfirmation(receipt, { fetcher })).toMatchObject({ status: "unknown", reason: "missing-block-evidence" });
    expect(fetcher.mock.calls.some(([, init]) => JSON.parse(init!.body as string).method === "get_live_cell")).toBe(false);
  });

  it("bounds both endpoint attempts and ignores late responses after the deadline", async () => {
    jest.useFakeTimers();
    const { receipt, committed } = fixture();
    const resolves: ((response: Response) => void)[] = [];
    const fetcher = jest.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(resolve => resolves.push(resolve))) as jest.MockedFunction<typeof fetch>;
    const promise = probeTestnetCodeConfirmation(receipt, { fetcher, endpointTimeoutMs: 50 });
    await jest.advanceTimersByTimeAsync(50);
    resolves[0]({ ok: true, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result: committed }) } as Response);
    await jest.advanceTimersByTimeAsync(50);
    expect(await promise).toMatchObject({ status: "unknown", reason: "timeout" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, init]) => init!.signal!.aborted)).toBe(true);
  });

  it("stops after a scope change and sends no subsequent header/live request", async () => {
    const { receipt, committed } = fixture(); let current = true;
    const fetcher = fetchMock(() => { current = false; return committed; });
    expect(await probeTestnetCodeConfirmation(receipt, { fetcher, isCurrent: () => current })).toMatchObject({ status: "unknown", reason: "stale" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not send any RPC for an invalid receipt", async () => {
    const { receipt } = fixture(), fetcher = fetchMock(() => null);
    expect(await probeTestnetCodeConfirmation({ ...receipt, capacity: "1" }, { fetcher })).toMatchObject({ status: "unknown", reason: "invalid-receipt" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
