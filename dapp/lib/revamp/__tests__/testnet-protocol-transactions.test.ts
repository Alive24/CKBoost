import { ccc } from "@ckb-ccc/connector-react";
import { cccA } from "@ckb-ccc/core/advanced";
import { ConnectedTypeID, ProtocolData, TransactionRecipe } from "ssri-ckboost/types";
import { TESTNET_CODE_RELEASES, TYPE_ID_CODE_HASH } from "../testnet-code-deployment";
import { TESTNET_PROTOCOL_DEPENDENCY_PINS, validateIsolatedTestnetProfile, buildIsolatedTestnetProtocolData, type PreparedTestnetProtocolDeployment, type IsolatedTestnetProfileInput } from "../testnet-protocol-deployment";
import {
  TESTNET_PROTOCOL_QA_OWNER, assertAuthorizedTestnetProtocol, signAndBroadcastTestnetProtocol,
  makePendingTestnetProtocolDeployment, parsePendingTestnetProtocolDeployments, parseSignedTestnetProtocolDiagnostics,
  probeTestnetProtocolConfirmation, CodeDeploymentRejectedError, CodeDeploymentPreflightError, CodeBroadcastStatusUnknownError,
  type SignedTestnetProtocolDiagnostic,
} from "../testnet-protocol-transactions";
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: jest.requireActual("@ckb-ccc/core"), ssri: { ExecutorJsonRpc: jest.fn() } }));
jest.mock("ssri-ckboost/protocol", () => ({ Protocol: jest.fn() }), { virtual: true });
jest.mock("../../../../packages/ssri-ckboost/dist/protocol", () => ({ Protocol: jest.fn() }));
const hash = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}` as ccc.Hex;
const owner = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
const key = (p: ccc.OutPointLike) => `${p.txHash}:${ccc.numFrom(p.index ?? 0)}`;
function setup() {
  // Independent synthetic code inventory: real Molecule/hash/TypeID relationships,
  // replaced public pins in this Jest scope only. No network or signing implementation.
  const cells = new Map<string, ccc.Cell>(), transactions = new Map<string, { transaction: ccc.Transaction; status: "committed"; blockNumber: bigint }>();
  for (const [index, pin] of TESTNET_PROTOCOL_DEPENDENCY_PINS.entries()) {
    const bytes = ccc.hexFrom(new Uint8Array(64 + index).fill(index + 1)), type = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: hash(index + 1) });
    const mutable = pin as unknown as { codeHash: string; dataHash: string; dataBytes: number };
    jest.replaceProperty(mutable, "codeHash", type.hash()); jest.replaceProperty(mutable, "dataHash", ccc.hashCkb(bytes)); jest.replaceProperty(mutable, "dataBytes", 64 + index);
    cells.set(key(pin.outPoint), ccc.Cell.from({ outPoint: pin.outPoint, cellOutput: ccc.CellOutput.from({ lock: owner, type }, bytes), outputData: bytes }));
  }
  const newCode = (id: "protocol-lock" | "campaign-type", index: number) => {
    const bytes = ccc.hexFrom(new Uint8Array(100 + index).fill(index + 20)), release = TESTNET_CODE_RELEASES[id] as { byteLength: number; dataHash: string };
    jest.replaceProperty(release, "byteLength", 100 + index); jest.replaceProperty(release, "dataHash", ccc.hashCkb(bytes));
    const input = ccc.CellInput.from({ previousOutput: { txHash: hash(90 + index), index: 0 } }), type = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: ccc.hashTypeId(input, 0) });
    const output = ccc.CellOutput.from({ lock: owner, type }, bytes), tx = ccc.Transaction.from({ inputs: [input], outputs: [output], outputsData: [bytes] });
    const point = { txHash: tx.hash(), index: 0 }; cells.set(key(point), ccc.Cell.from({ outPoint: point, cellOutput: output, outputData: bytes })); transactions.set(tx.hash(), { transaction: tx, status: "committed", blockNumber: 123n });
    return { schema: "ckboost-testnet-code-deployment/v1", network: "testnet", contract: id, contractSize: 100 + index, dataHash: ccc.hashCkb(bytes), typeHash: type.hash(), typeScript: { codeHash: type.codeHash, hashType: type.hashType, args: type.args }, transactionHash: tx.hash(), index: "0x0", blockNumber: "0x7b", lockScript: { codeHash: owner.codeHash, hashType: owner.hashType, args: owner.args }, capacityShannons: output.capacity.toString(), isTypeId: true, hashType: "type" };
  };
  const input: IsolatedTestnetProfileInput = { schema: "ckboost-isolated-testnet-profile/v1", network: "testnet", executorUrl: "http://127.0.0.1:9091/", dependencies: TESTNET_PROTOCOL_DEPENDENCY_PINS.map(p => ({ ...p, outPoint: { ...p.outPoint } })), newCode: { protocolLock: newCode("protocol-lock", 1), campaignType: newCode("campaign-type", 2) } };
  const profile = validateIsolatedTestnetProfile(input), funding = ccc.Cell.from({ outPoint: { txHash: hash(240), index: 1 }, cellOutput: { capacity: ccc.fixedPointFrom(10000), lock: owner }, outputData: "0x" }); cells.set(key(funding.outPoint), funding);
  const fundingInput = ccc.CellInput.from({ previousOutput: funding.outPoint, cellOutput: funding.cellOutput, outputData: "0x" });
  const type = ccc.Script.from({ codeHash: profile.dependencies[0].codeHash, hashType: "type", args: ccc.hashTypeId(fundingInput, 0) }), typeHash = type.hash();
  const data = ccc.hexFrom(ProtocolData.encode(buildIsolatedTestnetProtocolData(profile, owner.hash(), 1795000000000)));
  const lock = ccc.Script.from({ codeHash: profile.dependencies[7].codeHash, hashType: "type", args: ccc.hexFrom(ConnectedTypeID.encode({ type_id: owner.hash(), connected_key: typeHash })) });
  const output = ccc.CellOutput.from({ lock, type }, data), tx = ccc.Transaction.from({ inputs: [fundingInput], outputs: [output, { lock: owner, capacity: funding.cellOutput.capacity - output.capacity - 1000n }], outputsData: [data, "0x"], cellDeps: [profile.dependencies[0], profile.dependencies[7]].map(c => ({ outPoint: c.outPoint, depType: "code" })) });
  const recipe = ccc.hexFrom(TransactionRecipe.encode({ method_path: ccc.hexFrom(ccc.bytesFrom("CKBoostProtocol.update_protocol", "utf8")), arguments: [{ arg_type: 2, data: "0x00000000" }] }));
  tx.witnesses = [ccc.hexFrom(ccc.WitnessArgs.from({ lock: `0x${"00".repeat(85)}`, outputType: recipe }).toBytes())];
  const prepared: PreparedTestnetProtocolDeployment = { profile, profileHash: ccc.hashCkb(ccc.bytesFrom(JSON.stringify(profile), "utf8")), tx, bodyHash: tx.hash(), protocolOutputIndex: 0, typeScript: type, typeHash, protocolDataHex: data, dataHash: ccc.hashCkb(data), capacity: output.capacity, fee: 1000n, walletLock: owner.clone(), walletAddress: new ccc.Address(owner, "ckt").toString(), recipe, firstInput: ccc.hexFrom(fundingInput.toBytes()) };
  const client = new ccc.ClientPublicTestnet({ url: "https://testnet.ckbapp.dev/" });
  const live = jest.spyOn(client, "getCellLive").mockImplementation(async point => cells.get(key(point)));
  jest.spyOn(client, "getTransaction").mockImplementation(async h => { const value = transactions.get(String(h)); return value ? ccc.ClientTransactionResponse.from(value) : undefined; });
  const estimate = jest.spyOn(client, "estimateCycles").mockResolvedValue(12345n), send = jest.spyOn(client, "sendTransaction").mockImplementation(async t => ccc.Transaction.from(t).hash());
  const signer = { client, getRecommendedAddressObj: jest.fn(async () => new ccc.Address(owner, "ckt")), signTransaction: jest.fn(async (t: ccc.Transaction) => { const signed = t.clone(), witness = ccc.WitnessArgs.fromBytes(signed.witnesses[0]); witness.lock = "0x1234"; signed.witnesses[0] = ccc.hexFrom(witness.toBytes()); return signed; }) } as unknown as ccc.Signer;
  return { prepared, input, cells, funding, client, signer, live, estimate, send };
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it("records exactly the sole QA admin/empty memberships and strips arbitrary receipt/diagnostic fields", async () => {
  const { prepared, signer } = setup(); expect(owner.hash()).toBe(TESTNET_PROTOCOL_QA_OWNER); assertAuthorizedTestnetProtocol(prepared);
  const data = ProtocolData.decode(prepared.protocolDataHex); expect(data.protocol_config.admin_lock_hash_vec).toEqual([TESTNET_PROTOCOL_QA_OWNER]); expect(data.endorsers_whitelist).toEqual([]); expect(data.campaigns_approved).toEqual([]);
  const receipt = makePendingTestnetProtocolDeployment(prepared, prepared.bodyHash);
  expect(parsePendingTestnetProtocolDeployments(JSON.stringify([{ ...receipt, credentials: { privateKey: "never-restore" } }]))).toEqual([receipt]);
  let snapshot: SignedTestnetProtocolDiagnostic | undefined;
  await signAndBroadcastTestnetProtocol(signer, prepared, undefined, { onSignedDiagnostic: d => { snapshot = d; } });
  expect(parseSignedTestnetProtocolDiagnostics(JSON.stringify([{ ...snapshot, signer: { privateKey: "never-restore" } }]))).toEqual([snapshot]);
});

it("freshly checks nine code identities on both sides of signing, then persists receipt before one send", async () => {
  const { prepared, signer, live, estimate, send } = setup(), order: string[] = [];
  estimate.mockImplementation(async () => { order.push("verify"); return 12345n; }); send.mockImplementation(async tx => { order.push("send"); return ccc.Transaction.from(tx).hash(); });
  await expect(signAndBroadcastTestnetProtocol(signer, prepared, undefined, { onSignedDiagnostic: async () => { await Promise.resolve(); order.push("diagnostic"); }, onBeforeBroadcast: async receipt => { await Promise.resolve(); expect(receipt.txHash).toBe(prepared.bodyHash); order.push("receipt"); } })).resolves.toBe(prepared.bodyHash);
  expect(order).toEqual(["diagnostic", "verify", "receipt", "send"]); expect(live.mock.calls.length).toBe(20); expect(signer.signTransaction).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(1);
});

it.each(["owner", "fee", "data", "recipe", "first-input", "profile"])("rejects changed %s before signing", async kind => {
  const { prepared, signer, send } = setup();
  if (kind === "owner") prepared.walletLock = ccc.Script.from({ ...owner, args: "0x1234" });
  if (kind === "fee") prepared.fee = 100000001n;
  if (kind === "data") prepared.tx.outputsData[0] = "0x";
  if (kind === "recipe") prepared.tx.witnesses[0] = ccc.hexFrom(ccc.WitnessArgs.from({ lock: "0x" }).toBytes());
  if (kind === "first-input") prepared.tx.inputs[0].since = 1n;
  if (kind === "profile") prepared.profile.dependencies[7].codeHash = hash(99);
  await expect(signAndBroadcastTestnetProtocol(signer, prepared)).rejects.toThrow(); expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it.each(["spent-code", "changed-code", "typed-funding", "data-funding", "duplicate-funding"])("blocks %s instead of consuming existing state", async kind => {
  const { prepared, signer, cells, funding, send } = setup();
  if (kind === "spent-code") cells.delete(key(prepared.profile.dependencies[7].outPoint));
  if (kind === "changed-code") cells.get(key(prepared.profile.dependencies[0].outPoint))!.outputData = "0x";
  if (kind === "typed-funding") funding.cellOutput.type = prepared.typeScript.clone();
  if (kind === "data-funding") funding.outputData = "0x01";
  if (kind === "duplicate-funding") { prepared.tx.inputs.push(prepared.tx.inputs[0].clone()); prepared.bodyHash = prepared.tx.hash(); }
  await expect(signAndBroadcastTestnetProtocol(signer, prepared)).rejects.toThrow(); expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it("preserves the strict creation recipe through wallet signing and catches post-preflight witness mutation", async () => {
  const { prepared, signer, estimate, send } = setup();
  jest.mocked(signer.signTransaction).mockImplementation(async tx => { const signed = ccc.Transaction.from(tx).clone(); signed.witnesses = ["0x"]; return signed; });
  await expect(signAndBroadcastTestnetProtocol(signer, prepared)).rejects.toThrow("recipe"); expect(send).not.toHaveBeenCalled();
  jest.mocked(signer.signTransaction).mockImplementation(async tx => ccc.Transaction.from(tx).clone());
  estimate.mockImplementation(async tx => { ccc.Transaction.from(tx).witnesses.push("0xabcd"); return 12345n; });
  await expect(signAndBroadcastTestnetProtocol(signer, prepared)).rejects.toThrow("witnesses changed"); expect(send).not.toHaveBeenCalled();
});

it.each(["preflight-rejected", "preflight-offline", "broadcast-rejected", "broadcast-offline"])("classifies %s without repeated signing or sending", async scenario => {
  const { prepared, signer, estimate, send } = setup(), receipt = jest.fn();
  const isRejected = scenario.endsWith("rejected"), error = Object.assign(new Error(isRejected ? "TransactionFailedToVerify" : "RPC timeout"), isRejected ? { code: -302 } : {});
  (scenario.startsWith("preflight") ? estimate : send).mockRejectedValue(error);
  await expect(signAndBroadcastTestnetProtocol(signer, prepared, undefined, { onBeforeBroadcast: receipt })).rejects.toBeInstanceOf(isRejected ? CodeDeploymentRejectedError : scenario.startsWith("preflight") ? CodeDeploymentPreflightError : CodeBroadcastStatusUnknownError);
  expect(receipt).toHaveBeenCalledTimes(scenario.startsWith("preflight") ? 0 : 1); expect(send).toHaveBeenCalledTimes(scenario.startsWith("preflight") ? 0 : 1); expect(signer.signTransaction).toHaveBeenCalledTimes(1);
});

it("does not send if receipt storage fails or the scope changes during CCC's fee read", async () => {
  const { prepared, signer, client, send } = setup();
  await expect(signAndBroadcastTestnetProtocol(signer, prepared, undefined, { onBeforeBroadcast: () => { throw new Error("storage failed"); } })).rejects.toThrow("storage failed"); expect(send).not.toHaveBeenCalled();
  send.mockRestore(); const noCache = jest.spyOn(client, "sendTransactionNoCache").mockResolvedValue(prepared.bodyHash); let active = true;
  jest.spyOn(ccc.Transaction.prototype, "getFeeRate").mockImplementation(async () => { active = false; return 1000n; });
  await expect(signAndBroadcastTestnetProtocol(signer, prepared, () => active)).rejects.toThrow("changed"); expect(noCache).not.toHaveBeenCalled();
});

function confirmation(setupValue: ReturnType<typeof setup>, mode = "valid") {
  const tx = setupValue.prepared.tx;
  return jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { id, method } = JSON.parse(String(init?.body)); let result: unknown;
    if (method === "get_transaction") result = mode === "rejected" ? { transaction: null, tx_status: { status: "rejected", reason: "script -1" } } : mode === "pending" ? { transaction: null, tx_status: { status: "pending" } } : { transaction: cccA.JsonRpcTransformers.transactionFrom(tx), tx_status: { status: "committed", block_hash: hash(200) } };
    if (method === "get_header") result = { hash: mode === "bad-header" ? hash(201) : hash(200), number: "0x123" };
    if (method === "get_live_cell") result = mode === "spent" ? { status: "dead", cell: null } : { status: "live", cell: { output: cccA.JsonRpcTransformers.cellOutputFrom(tx.outputs[0]), data: { content: mode === "changed-data" ? "0x" : tx.outputsData[0], hash: ccc.hashCkb(tx.outputsData[0]) } } };
    return { ok: true, text: async () => JSON.stringify({ jsonrpc: "2.0", id, result }) } as Response;
  }) as jest.MockedFunction<typeof fetch>;
}
it("exports only committed fresh TypeID creation plus exact live initial state and profile identities", async () => {
  const fixture = setup(), receipt = makePendingTestnetProtocolDeployment(fixture.prepared, fixture.prepared.bodyHash), fetcher = confirmation(fixture);
  const result = await probeTestnetProtocolConfirmation(receipt, { fetcher });
  expect(result).toMatchObject({ status: "confirmed", blockNumber: "0x123", manifest: { schema: "ckboost-isolated-testnet-protocol-state/v1", protocolTypeHash: fixture.prepared.typeHash, dataHash: fixture.prepared.dataHash, adminLockHashes: [TESTNET_PROTOCOL_QA_OWNER], campaignsApproved: [], endorsersWhitelist: [] } });
  expect(fetcher.mock.calls.map(row => JSON.parse(String(row[1]?.body)).method)).toEqual(["get_transaction", "get_header", "get_live_cell"]); expect(() => JSON.stringify(result)).not.toThrow();
});
it.each(["spent", "changed-data", "bad-header"])("does not export a %s initial state", async mode => {
  const fixture = setup(), receipt = makePendingTestnetProtocolDeployment(fixture.prepared, fixture.prepared.bodyHash);
  expect(await probeTestnetProtocolConfirmation(receipt, { fetcher: confirmation(fixture, mode) })).toMatchObject({ status: "unknown", reason: "unverified-committed" });
});
it("retains null-body rejection and pending status without signature or resend", async () => {
  const fixture = setup(), receipt = makePendingTestnetProtocolDeployment(fixture.prepared, fixture.prepared.bodyHash);
  expect((await probeTestnetProtocolConfirmation(receipt, { fetcher: confirmation(fixture, "rejected") })).status).toBe("rejected");
  expect((await probeTestnetProtocolConfirmation(receipt, { fetcher: confirmation(fixture, "pending") })).status).toBe("pending");
  expect(fixture.signer.signTransaction).not.toHaveBeenCalled(); expect(fixture.send).not.toHaveBeenCalled();
});
it("bounds the entire endpoint and ignores late confirmation reads", async () => {
  const fixture = setup(), receipt = makePendingTestnetProtocolDeployment(fixture.prepared, fixture.prepared.bodyHash);
  jest.useFakeTimers(); const fetcher = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
  const pending = probeTestnetProtocolConfirmation(receipt, { fetcher, endpointTimeoutMs: 100 }); await jest.advanceTimersByTimeAsync(200);
  expect((await pending).status).toBe("unknown"); expect(fetcher).toHaveBeenCalledTimes(2); expect(fixture.send).not.toHaveBeenCalled();
});
