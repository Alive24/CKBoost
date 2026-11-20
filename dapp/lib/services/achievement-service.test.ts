import { ccc } from "@ckb-ccc/connector-react";
import { AchievementDataVec, ConnectedTypeID, type ProtocolDataLike } from "ssri-ckboost/types";
import { AchievementService } from "./achievement-service";
import { fetchProtocolCell } from "../ckb/protocol-cells";
import { injectProxyAuthenticationCell } from "../utils/api";

const mockClaimAchievement = jest.fn();
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: jest.requireActual("@ckb-ccc/core"), ssri: { ExecutorJsonRpc: jest.fn() } }));
jest.mock("ssri-ckboost", () => ({
  ckboost: { types: jest.requireActual("ssri-ckboost/types") },
  Achievement: jest.fn().mockImplementation(() => ({ claimAchievement: (...args: unknown[]) => mockClaimAchievement(...args) })),
  createScopedLogger: () => ({ info: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}), { virtual: true });
jest.mock("../../../packages/ssri-ckboost/dist/index.js", () => ({
  ckboost: { types: jest.requireActual("ssri-ckboost/types") },
  Achievement: jest.fn().mockImplementation(() => ({ claimAchievement: (...args: unknown[]) => mockClaimAchievement(...args) })),
  createScopedLogger: () => ({ info: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock("../ckb/deployment-manager", () => ({ deploymentManager: {
  getCurrentNetwork: () => "testnet",
  getContractCodeHash: () => `0x${"22".repeat(32)}`,
  getContractOutPoint: () => ({ txHash: `0x${"88".repeat(32)}`, index: 0 }),
} }));
jest.mock("../ckb/protocol-cells", () => ({ fetchProtocolCell: jest.fn() }));
jest.mock("../utils/api", () => ({ injectProxyAuthenticationCell: jest.fn() }));
jest.mock("../ckb/transaction-wrapper", () => ({ sendTransactionWithFeeRetry: jest.fn() }));
jest.mock("@/lib/pending-transactions", () => ({ registerPendingTransaction: jest.fn() }));

const hash = (byte: string) => `0x${byte.repeat(32)}` as ccc.Hex;
const lock = ccc.Script.from({ codeHash: hash("11"), hashType: "type", args: `0x${"12".repeat(20)}` });
const userCodeHash = hash("22"), achievementCodeHash = hash("33");
const protocolType = ccc.Script.from({ codeHash: hash("44"), hashType: "type", args: hash("45") });
const protocolHash = protocolType.hash(), foreignProtocolHash = hash("55");
const address = new ccc.Address(lock, "ckt");
const protocolData = { protocol_config: { script_code_hashes: { ckb_boost_user_type_code_hash: userCodeHash } } } as unknown as ProtocolDataLike;
const user = (id: string, protocol: ccc.Hex, txHash: ccc.Hex) => ccc.Cell.from({
  outPoint: { txHash, index: 0 }, cellOutput: { capacity: ccc.fixedPointFrom(200), lock, type: { codeHash: userCodeHash, hashType: "type", args: ccc.hexFrom(ConnectedTypeID.encode({ type_id: hash(id), connected_key: protocol })) } }, outputData: "0x01",
});

function fixture(options: { foreignOnly?: boolean; completedFor?: "current" | "foreign" } = {}) {
  const current = user("66", protocolHash, hash("67")), foreign = user("77", foreignProtocolHash, hash("78"));
  const users = options.foreignOnly ? [foreign] : [current, foreign];
  const receiver = options.completedFor === "current" ? current : foreign;
  const entries = [{ achievement_title: "First Submission", achievement_metadata: "", receiver_user_record_vec: options.completedFor ? [{ receiver_user_type_hash: receiver.cellOutput.type!.hash(), granted_at: 123n }] : [] }];
  const achievementCell = ccc.Cell.from({ outPoint: { txHash: hash("90"), index: 0 }, cellOutput: { capacity: ccc.fixedPointFrom(500), lock, type: { codeHash: achievementCodeHash, hashType: "type", args: ccc.hexFrom(ConnectedTypeID.encode({ type_id: hash("91"), connected_key: protocolHash })) } }, outputData: ccc.hexFrom(AchievementDataVec.encode(entries)) });
  const client = {
    addressPrefix: "ckt",
    findCells: jest.fn(async function* (query: { scriptType: string }) { if (query.scriptType === "type") yield achievementCell; else yield* users; }),
    // The foreign protocol's user is newer and would win an unscoped lookup.
    getTransaction: jest.fn(async (txHash: ccc.Hex) => ({ blockNumber: txHash === foreign.outPoint.txHash ? 200n : 100n })),
  } as unknown as ccc.Client;
  const signer = { client, sendTransaction: jest.fn(), signTransaction: jest.fn() } as unknown as ccc.Signer;
  const service = new AchievementService(client, achievementCodeHash, signer);
  jest.mocked(fetchProtocolCell).mockResolvedValue(ccc.Cell.from({ outPoint: { txHash: hash("92"), index: 0 }, cellOutput: { capacity: ccc.fixedPointFrom(700), lock, type: protocolType }, outputData: "0x" }));
  mockClaimAchievement.mockResolvedValue({ res: ccc.Transaction.from({}) });
  return { service, client, signer, current, foreign };
}

beforeEach(() => {
  jest.clearAllMocks(); mockClaimAchievement.mockReset().mockImplementation(async tx => ({ res: ccc.Transaction.from(tx) }));
  jest.mocked(fetchProtocolCell).mockReset().mockResolvedValue(ccc.Cell.from({ outPoint: { txHash: hash("99"), index: 0 }, cellOutput: { capacity: ccc.fixedPointFrom(500), lock, type: protocolType }, outputData: "0x" }));
  jest.mocked(injectProxyAuthenticationCell).mockReset();
});

it("preserves this protocol's achievement completion when the same wallet has a newer foreign UserCell", async () => {
  const { service, current } = fixture({ completedFor: "current" });
  const result = await service.getUserAchievements(address.toString(), protocolData, protocolHash);
  expect(result).toHaveLength(1); expect(result[0].completed).toBe(true); expect(result[0].grantedAt).toBe(123n);
  expect(ccc.hexFrom(result[0].record!.receiver_user_type_hash)).toBe(current.cellOutput.type!.hash());
});

it("does not report a foreign-only UserCell's achievement as completion in this protocol", async () => {
  const { service } = fixture({ foreignOnly: true, completedFor: "foreign" });
  const result = await service.getUserAchievements(address.toString(), protocolData, protocolHash);
  expect(result[0]).toMatchObject({ completed: false }); expect(result[0].record).toBeUndefined(); expect(result[0].grantedAt).toBeUndefined();
});

it("builds the receiver record for the current protocol user even when a foreign user is newer, stopping before any signing", async () => {
  const { service, signer, current, foreign } = fixture(); let draft: ccc.Transaction | undefined;
  jest.mocked(injectProxyAuthenticationCell).mockImplementation(async (_signer, tx) => { draft = tx; throw new Error("Test stops before authentication or signing"); });
  await expect(service.claimAchievements(["First Submission"], address.toString(), protocolHash, signer)).rejects.toThrow("Test stops before authentication or signing");
  expect(draft).toBeDefined();
  const receivers = AchievementDataVec.decode(draft!.outputsData[0])[0].receiver_user_record_vec;
  expect(receivers).toHaveLength(1); expect(ccc.hexFrom(receivers[0].receiver_user_type_hash)).toBe(current.cellOutput.type!.hash());
  expect(ccc.hexFrom(receivers[0].receiver_user_type_hash)).not.toBe(foreign.cellOutput.type!.hash());
  expect(signer.signTransaction).not.toHaveBeenCalled(); expect(signer.sendTransaction).not.toHaveBeenCalled();
});

it("rejects a foreign-only claim before protocol/transaction construction or wallet actions", async () => {
  const { service, signer } = fixture({ foreignOnly: true });
  await expect(service.claimAchievements(["First Submission"], address.toString(), protocolHash, signer)).rejects.toThrow("User cell not found");
  expect(fetchProtocolCell).not.toHaveBeenCalled(); expect(mockClaimAchievement).not.toHaveBeenCalled(); expect(injectProxyAuthenticationCell).not.toHaveBeenCalled();
  expect(signer.signTransaction).not.toHaveBeenCalled(); expect(signer.sendTransaction).not.toHaveBeenCalled();
});
