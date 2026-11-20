import { ccc, mol } from "@ckb-ccc/core";
import { ConnectedTypeID, UserData } from "ssri-ckboost/types";

const mockHash = (byte: string) => `0x${byte.repeat(32)}` as ccc.Hex;
const mockProtocol = { codeHash: mockHash("12"), hashType: "type" as ccc.HashType, args: mockHash("34") };
let mockPointsCode = mockHash("56"), mockUserCode = mockHash("78");
let mockNetwork: "mainnet" | "testnet" = "testnet";
let mockIsolated: { protocol: { typeScript: typeof mockProtocol } } | null = null;
let mockCells: ccc.Cell[] = [];
const mockTxs = new Map<string, ccc.ClientTransactionResponse>();
const mockTransactions = jest.fn((_key?: unknown, _order?: unknown) => (async function* (): AsyncGenerator<{txHash: ccc.Hex}> {})());
const mockFindCells = jest.fn(() => (async function* () { yield* mockCells; })());
const mockGetTransaction = jest.fn(async (hash: ccc.HexLike) => mockTxs.get(ccc.hexFrom(hash)) ?? ccc.ClientTransactionResponse.from({ transaction: {}, status: "committed", blockNumber: 1n }));
const mockGetHeader = jest.fn(async () => ({ timestamp: BigInt(Date.now()) }));
const mockWarn = jest.fn();
const mockClient = () => ({ findTransactions: mockTransactions, findCells: mockFindCells, getTransaction: mockGetTransaction, getHeaderByNumber: mockGetHeader });

jest.mock("@ckb-ccc/shell", () => ({ ccc: { ...jest.requireActual("@ckb-ccc/core").ccc,
  ClientPublicTestnet: jest.fn(() => mockClient()), ClientPublicMainnet: jest.fn(() => mockClient()),
} }));
jest.mock("@/lib/ckb/deployment-manager", () => ({ deploymentManager: {
  getCurrentNetwork: () => mockNetwork,
  getContractCodeHash: (_network: string, name: string) => name === "ckboostPointsUdt" ? mockPointsCode : mockUserCode,
} }));
jest.mock("@/lib/ckb/isolated-runtime.mjs", () => ({ getIsolatedRuntime: () => mockIsolated }));
jest.mock("@/netlify/lib/streak-bonus", () => ({ readUdtAmount: (data: ccc.HexLike) => jest.requireActual("@ckb-ccc/core").ccc.numLeFromBytes(jest.requireActual("@ckb-ccc/core").ccc.bytesFrom(data).subarray(0, 16)) }));
jest.mock("@/netlify/lib/log", () => ({ createLogger: () => ({ warn: mockWarn, error: jest.fn() }) }));

const publicEnvKeys = ["NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH", "NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE", "NEXT_PUBLIC_PROTOCOL_TYPE_ARGS"] as const;
let previous: Record<string, string | undefined>;
beforeEach(() => {
  previous = Object.fromEntries(publicEnvKeys.map(key => [key, process.env[key]]));
  for (const key of publicEnvKeys) delete process.env[key];
  mockIsolated = null; mockCells = []; mockNetwork = "testnet"; mockPointsCode = mockHash("56"); mockUserCode = mockHash("78"); mockTxs.clear();
  jest.clearAllMocks(); mockTransactions.mockImplementation(() => (async function* () {})());
  jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-20T06:00:00Z"));
});
afterEach(() => {
  for (const key of publicEnvKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  jest.restoreAllMocks();
});
function setLegacyProtocol(script = mockProtocol) {
  process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH = script.codeHash;
  process.env.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE = script.hashType;
  process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS = script.args;
}
function loadHandler() {
  let handler!: typeof import("../functions/platform-stats").handler;
  jest.isolateModules(() => { handler = require("../functions/platform-stats").handler; });
  return handler;
}
async function invoke(handler = loadHandler()) {
  const result = await handler({ httpMethod: "GET" } as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], jest.fn());
  if (!result || typeof result.body !== "string") throw Error("Expected JSON handler result");
  return { statusCode: result.statusCode, data: JSON.parse(result.body) };
}
function userCell(protocolHash: ccc.Hex, suffix: string, count = 1, block = 1n, options: { args?: ccc.Hex; owner?: string; codeHash?: ccc.Hex; hashType?: ccc.HashType; submissionTimestamps?: readonly bigint[] } = {}) {
  const cell = ccc.Cell.from({ outPoint: { txHash: mockHash(suffix), index: 0 }, cellOutput: {
    capacity: 100000000000n,
    lock: { codeHash: mockHash(options.owner ?? "9a"), hashType: "type", args: "0x" },
    type: { codeHash: options.codeHash ?? mockUserCode, hashType: options.hashType ?? "type", args: options.args ?? ccc.hexFrom(ConnectedTypeID.encode({ type_id: mockHash(suffix), connected_key: protocolHash })) },
  }, outputData: UserData.encode({ verification_data: { telegram_personal_chat_id: 0, identity_verification_data: "0x" }, total_points_earned: 0, last_activity_timestamp: 1,
    submission_records: Array.from({ length: count }, (_, index) => ({ campaign_type_id: mockHash("ab"), quest_id: index, submission_timestamp: options.submissionTimestamps?.[index] ?? BigInt(Math.floor(Date.now() / 1000) - 60), submission_content: "Offline real-codec fixture" })), profile_data: [], last_bonus_streak_at: 0,
  }) });
  mockTxs.set(cell.outPoint.txHash, ccc.ClientTransactionResponse.from({ transaction: {}, status: "committed", blockNumber: block }));
  return cell;
}

it.each(["normal", "QA"])("filters authoritative user identity before owner/latest selection in %s mode", async mode => {
  if (mode === "QA") mockIsolated = { protocol: { typeScript: mockProtocol } }; else setLegacyProtocol();
  const ownHash = ccc.Script.from(mockProtocol).hash();
  const older = userCell(ownHash, "01", 1, 1n), latest = userCell(ownHash, "02", 3, 2n);
  const foreign = userCell(mockHash("de"), "03", 25, 999n); // Same owner, later other-protocol cell must not replace latest.
  const malformed = userCell(ownHash, "04", 25, 1000n, { args: "0x00" });
  const trailing = userCell(ownHash, "05", 25, 1001n, { args: `${latest.cellOutput.type!.args}00` });
  const wrongCode = userCell(ownHash, "06", 25, 1002n, { codeHash: mockHash("ef") });
  const wrongHashType = userCell(ownHash, "07", 25, 1003n, { hashType: "data1" });
  const otherOwner = userCell(ownHash, "08", 1, 3n, { owner: "8b" });
  mockCells = [older, latest, foreign, malformed, trailing, wrongCode, wrongHashType, otherOwner];
  const result = await invoke();
  expect(result).toMatchObject({ statusCode: 200, data: { newUsers: { total: 2 }, questSubmissions: { total: 4 }, pointsMinted: { total: "0" } } });
  expect(mockGetTransaction.mock.calls.map(([hash]) => hash)).toEqual([older.outPoint.txHash, latest.outPoint.txHash, otherOwner.outPoint.txHash]);
  expect(mockWarn).not.toHaveBeenCalled();
  expect(mockTransactions.mock.calls[0][0]).toMatchObject({ scriptSearchMode: "exact", scriptType: "type", script: { codeHash: mockPointsCode, args: ownHash } });
});

it.each(["normal", "QA"])("counts the real pending text2 millisecond timestamp in every current window in %s mode", async mode => {
  if (mode === "QA") mockIsolated = { protocol: { typeScript: mockProtocol } }; else setLegacyProtocol();
  jest.mocked(Date.now).mockReturnValue(Date.parse("2026-11-20T10:18:04.983Z"));
  // Actual public Account2 text2 submission timestamp. There is no accepted
  // campaign record in this fixture: submission metrics include pending rows.
  mockCells = [userCell(ccc.Script.from(mockProtocol).hash(), "31", 1, 1n, { submissionTimestamps: [1795165440403n] })];
  const result = await invoke();
  expect(result.statusCode).toBe(200);
  expect(result.data.questSubmissions).toEqual({ "1d": 1, "7d": 1, "30d": 1, "90d": 1, "365d": 1, total: 1 });
  expect(result.data.newUsers.total).toBe(1);
  expect(result.data.pointsMinted.total).toBe("0");
  expect(mockWarn).not.toHaveBeenCalled();
});

it("preserves legacy second records and time windows alongside milliseconds, excluding future and invalid times", async () => {
  setLegacyProtocol();
  const now = BigInt(Date.parse("2026-11-20T10:18:04.983Z"));
  jest.mocked(Date.now).mockReturnValue(Number(now));
  const old = now - 31n * 24n * 60n * 60n * 1000n;
  const timestamps = [1795165440403n, now / 1000n - 60n, old, old / 1000n,
    now + 60_000n, now / 1000n + 60n, 0n, (1n << 64n) - 1n];
  mockCells = [userCell(ccc.Script.from(mockProtocol).hash(), "32", timestamps.length, 1n, { submissionTimestamps: timestamps })];
  const result = await invoke();
  expect(result.statusCode).toBe(200);
  expect(result.data.questSubmissions).toEqual({ "1d": 2, "7d": 2, "30d": 2, "90d": 4, "365d": 4, total: 4 });
  expect(mockWarn).not.toHaveBeenCalled();
});

it("preserves exact protocol-scoped Points mint totals above Number precision", async () => {
  setLegacyProtocol();
  const own = ccc.Script.from({ codeHash: mockPointsCode, hashType: "type", args: ccc.Script.from(mockProtocol).hash() });
  const foreign = ccc.Script.from({ codeHash: mockPointsCode, hashType: "type", args: mockHash("de") });
  const amount = 9007199254740993123n, base = 900719925474099300000n;
  const lock = { codeHash: mockHash("9a"), hashType: "type" as const, args: "0x" };
  const tx = ccc.Transaction.from({ inputs: [{ previousOutput: { txHash: mockHash("a1"), index: 0 } }, { previousOutput: { txHash: mockHash("a2"), index: 0 } }],
    outputs: [{ capacity: 100000000000n, lock, type: own }, { capacity: 100000000000n, lock, type: foreign }],
    outputsData: [mol.Uint128.encode(base + amount), mol.Uint128.encode(2n ** 120n)],
  });
  for (const [index, type] of [own, foreign].entries()) jest.spyOn(tx.inputs[index], "getCell").mockResolvedValue(ccc.Cell.from({ outPoint: tx.inputs[index].previousOutput, cellOutput: { capacity: 100000000000n, lock, type }, outputData: mol.Uint128.encode(index ? 2n ** 119n : base) }));
  mockTxs.set(mockHash("b1"), ccc.ClientTransactionResponse.from({ transaction: tx, status: "committed", blockNumber: 5n }));
  mockTransactions.mockImplementation(() => (async function* () { yield { txHash: mockHash("b1") }; })());
  const result = await invoke();
  expect(result.statusCode).toBe(200);
  expect(result.data.pointsMinted).toEqual(Object.fromEntries(["1d", "7d", "30d", "90d", "365d", "total"].map(key => [key, amount.toString()])));
});

it("uses cache only while the complete scope is unchanged", async () => {
  setLegacyProtocol(); const handler = loadHandler(), ownHash = ccc.Script.from(mockProtocol).hash();
  mockCells = [userCell(ownHash, "11", 2)];
  expect((await invoke(handler)).data.questSubmissions.total).toBe(2);
  mockCells = [userCell(ownHash, "12", 20)];
  expect((await invoke(handler)).data.questSubmissions.total).toBe(2);
  expect(mockFindCells).toHaveBeenCalledTimes(1);
});

it.each(["network", "protocol code", "protocol hash type", "protocol args", "user code", "points code", "QA protocol"])("invalidates a warm cache when %s changes", async changed => {
  setLegacyProtocol(); const handler = loadHandler();
  mockCells = [userCell(ccc.Script.from(mockProtocol).hash(), "21", 1)];
  expect((await invoke(handler)).data.questSubmissions.total).toBe(1);
  const next = { ...mockProtocol };
  if (changed === "network") mockNetwork = "mainnet";
  if (changed === "protocol code") next.codeHash = mockHash("23");
  if (changed === "protocol hash type") next.hashType = "data1";
  if (changed === "protocol args" || changed === "QA protocol") next.args = mockHash("45");
  if (changed === "user code") mockUserCode = mockHash("89");
  if (changed === "points code") mockPointsCode = mockHash("67");
  if (changed === "QA protocol") mockIsolated = { protocol: { typeScript: next } }; else setLegacyProtocol(next);
  mockCells = [userCell(ccc.Script.from(next).hash(), "22", 3)];
  const second = await invoke(handler);
  expect(second).toMatchObject({ statusCode: 200, data: { questSubmissions: { total: 3 } } });
  expect(mockFindCells).toHaveBeenCalledTimes(2);
});

it("does not serve a previously cached response if normal-mode protocol configuration disappears", async () => {
  setLegacyProtocol(); const handler = loadHandler();
  expect((await invoke(handler)).statusCode).toBe(200);
  delete process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS;
  const result = await invoke(handler);
  expect(result.statusCode).toBe(500);
  expect(result.data.message).toContain("Protocol type environment variables missing");
  expect(mockFindCells).toHaveBeenCalledTimes(1);
});

it("retains the normal-mode protocol environment requirement before any query", async () => {
  const result = await invoke();
  expect(result.statusCode).toBe(500);
  expect(result.data.message).toContain("Protocol type environment variables missing");
  expect(mockTransactions).not.toHaveBeenCalled(); expect(mockFindCells).not.toHaveBeenCalled();
});
