import { ccc } from "@ckb-ccc/shell";
import { encodeClaimablePoolData, type ClaimablePoolEntry } from "ckb-claimable-pool-lock";
import type { CampaignDataLike, QuestDataLike } from "ssri-ckboost/types";
import { validateStaffClaimableRewardOutputs, type StaffClaimableRewardsOptions } from "./staff-claimable-rewards";

const hash = (digit: string) => `0x${digit.repeat(64)}` as ccc.Hex;
const lock = (digit: string) => ccc.Script.from({codeHash: hash("1"), hashType: "type", args: hash(digit)});
const reviewer = hash("a"), secondReviewer = hash("b"), poolCodeHash = hash("2"), pointsCodeHash = hash("3"), protocolHash = hash("4");
const userA = hash("5"), userB = hash("6");
const lockA = lock("7"), lockB = lock("8"), fundingLock = lock("9");
const points = ccc.Script.from({codeHash: pointsCodeHash, hashType: "type", args: protocolHash});
const token = ccc.Script.from({codeHash: hash("c"), hashType: "type", args: hash("d")});
const sameCodeOtherToken = ccc.Script.from({...token, args: hash("e")});
const assets = (ckb = 0n, tokens: Array<{udt_script: ccc.Script; amount: bigint}> = []) => ({points_amount: 0n, ckb_amount: ckb, nft_assets: [], udt_assets: tokens});
const baseQuest = (overrides: Partial<QuestDataLike> = {}): QuestDataLike => ({quest_id: 0, points: 10n, rewards_on_completion: [], ...overrides} as QuestDataLike);
type Tx = Pick<ccc.Transaction, "inputs" | "outputs" | "outputsData">;
const tx = (): Tx => ({inputs: [], outputs: [], outputsData: []});
function pool(transaction: Tx, entries: ClaimablePoolEntry[], type?: ccc.Script, recycler = reviewer) {
  const data = encodeClaimablePoolData(entries);
  const output = ccc.CellOutput.from({lock: {codeHash: poolCodeHash, hashType: "type", args: recycler}, type}, data);
  if (!type) output.capacity += entries.reduce((sum, entry) => sum + ccc.numFrom(entry.amount), 0n);
  transaction.outputs.push(output);
  transaction.outputsData.push(data);
}
const entries = (amount: bigint) => [{claimantLockHash: lockA.hash(), amount}, {claimantLockHash: lockB.hash(), amount}];
function options(transaction: Tx, quest = baseQuest()): StaffClaimableRewardsOptions {
  return {tx: transaction as ccc.Transaction, nextCampaignData: {quests: [quest]} as CampaignDataLike, questId: 0,
    normalizedUserTypeIds: [userA, userB], userLocks: new Map([[userA, lockA], [userB, lockB]]),
    pointsCodeHash, protocolTypeHash: protocolHash, claimablePoolLockCodeHash: poolCodeHash, recyclerLockHashes: [reviewer, secondReviewer]};
}
const validate = (transaction: Tx, quest = baseQuest(), overrides: Partial<StaffClaimableRewardsOptions> = {}) => validateStaffClaimableRewardOutputs({...options(transaction, quest), ...overrides});
function input(transaction: Tx, script: ccc.Script, amount: bigint, owner = fundingLock) {
  transaction.inputs.push(ccc.CellInput.from({previousOutput: {txHash: hash("f"), index: transaction.inputs.length},
    cellOutput: ccc.CellOutput.from({lock: owner, type: script}, ccc.numToBytes(amount, 16)), outputData: ccc.numToBytes(amount, 16)}));
}
function regularOutput(transaction: Tx, script: ccc.Script, amount: bigint, owner = fundingLock) {
  const data = ccc.hexFrom(ccc.numToBytes(amount, 16));
  transaction.outputs.push(ccc.CellOutput.from({lock: owner, type: script}, data));
  transaction.outputsData.push(data);
}

it("checks quest zero and exact bigint totals across every reward list, keeping complete token scripts distinct", () => {
  const large = 9_007_199_254_740_993n;
  const quest = baseQuest({points: large, rewards_on_completion: [
    {...assets(2n, [{udt_script: token, amount: large}, {udt_script: points, amount: 3n}]), points_amount: 999n},
    assets(5n, [{udt_script: token, amount: 4n}, {udt_script: sameCodeOtherToken, amount: 6n}]),
  ]});
  const transaction = tx();
  // SDK creates base Points and explicitly configured Points UDT rewards as
  // separate pools. Validation must aggregate their real shared type script.
  pool(transaction, entries(large), points);
  pool(transaction, entries(3n), points);
  pool(transaction, entries(large + 4n), token);
  pool(transaction, entries(6n), sameCodeOtherToken);
  pool(transaction, entries(7n));
  expect(() => validate(transaction, quest)).not.toThrow();
  const bad = {...quest, rewards_on_completion: [assets(7n, [{udt_script: token, amount: large + 4n}, {udt_script: token, amount: 6n}, {udt_script: points, amount: 3n}])]};
  expect(() => validate(transaction, bad)).toThrow("Unexpected reward pool asset");
});

it("combines different approved profiles sharing one actual claimant lock", () => {
  const transaction = tx(); pool(transaction, [{claimantLockHash: lockA.hash(), amount: 20n}], points);
  expect(() => validate(transaction, baseQuest(), {userLocks: new Map([[userA, lockA], [userB, lockA]])})).not.toThrow();
  expect(() => validate(transaction)).toThrow("amount does not match");
});

it("rejects missing pools, the old direct payout shape, unknown recipients and extra pools", () => {
  expect(() => validate(tx())).toThrow("exactly match");
  const direct = tx(); regularOutput(direct, points, 10n, lockA); regularOutput(direct, points, 10n, lockB);
  expect(() => validate(direct)).toThrow("exactly match");
  const stranger = tx(); pool(stranger, [{claimantLockHash: hash("f"), amount: 20n}], points);
  expect(() => validate(stranger)).toThrow("claimant or amount");
  const extra = tx(); pool(extra, entries(10n), points); pool(extra, entries(1n), token);
  expect(() => validate(extra)).toThrow("Unexpected reward pool asset");
  const over = tx(); pool(over, entries(10n), points); pool(over, entries(1n), points);
  expect(() => validate(over)).toThrow("claimant or amount");
});

it("uses one observed pool recycler belonging to the authoritative actor set", () => {
  const valid = tx(); pool(valid, entries(10n), points, secondReviewer);
  expect(() => validate(valid)).not.toThrow();
  expect(() => validate(valid, baseQuest(), {recyclerLockHashes: [reviewer]})).toThrow("authorized reviewer");
  const mixed = tx(); pool(mixed, [{claimantLockHash: lockA.hash(), amount: 10n}], points);
  pool(mixed, [{claimantLockHash: lockB.hash(), amount: 10n}], points, secondReviewer);
  expect(() => validate(mixed)).toThrow("one currently authorized reviewer");
  valid.outputs[0].lock.hashType = "data";
  expect(() => validate(valid)).toThrow("incorrect lock hash type");
});

it("rejects forged pool amount prefixes, malformed codec data, zero entries and duplicate claimants", () => {
  const prefix = tx(); pool(prefix, entries(10n), points);
  const bytes = ccc.bytesFrom(prefix.outputsData[0]); bytes[0] = 21;
  prefix.outputsData[0] = ccc.hexFrom(bytes);
  expect(() => validate(prefix)).toThrow("remaining amount");
  const malformed = tx(); pool(malformed, entries(10n), points); malformed.outputsData[0] = "0x00";
  expect(() => validate(malformed)).toThrow();
  const empty = tx(); pool(empty, [], points);
  expect(() => validate(empty)).toThrow("between 1 and 100");
  const duplicate = tx(); pool(duplicate, [{claimantLockHash: lockA.hash(), amount: 5n}, {claimantLockHash: lockA.hash(), amount: 5n}], points);
  expect(() => validate(duplicate)).toThrow("Duplicate claimant");
});

it.each([-1n, 1n])("rejects native CKB pool capacity differing from occupied capacity plus claimable amount by %s shannon", delta => {
  const transaction = tx(); pool(transaction, entries(3n)); transaction.outputs[0].capacity += delta;
  expect(() => validate(transaction, baseQuest({points: 0n, rewards_on_completion: [assets(3n)]}))).toThrow("pool capacity");
});

it("does not permit overfunded UDT pool capacity or extra direct Points alongside valid pools", () => {
  const overfunded = tx(); pool(overfunded, entries(10n), points); overfunded.outputs[0].capacity += 1n;
  expect(() => validate(overfunded)).toThrow("pool capacity");
  const direct = tx(); pool(direct, entries(10n), points); regularOutput(direct, points, 1n, lockA);
  expect(() => validate(direct)).toThrow("Direct reward token credits");
});

it("allows genuine same-type same-lock token change while rejecting split-output balance increases", () => {
  const transaction = tx(); pool(transaction, entries(10n), points); pool(transaction, entries(2n), token);
  input(transaction, token, 25n); regularOutput(transaction, token, 21n);
  const quest = baseQuest({rewards_on_completion: [assets(0n, [{udt_script: token, amount: 2n}])]});
  expect(() => validate(transaction, quest)).not.toThrow();
  regularOutput(transaction, token, 5n);
  expect(() => validate(transaction, quest)).toThrow("Direct reward token credits");
});

it("accepts the SDK's 100-entry chunks but rejects one oversized pool", () => {
  const userLocks = new Map<string, ccc.Script>();
  const claimants: ClaimablePoolEntry[] = [];
  for (let index = 1; index <= 101; index++) {
    const id = `0x${index.toString(16).padStart(64, "0")}` as ccc.Hex;
    const owner = ccc.Script.from({codeHash: hash("1"), hashType: "type", args: id});
    userLocks.set(id, owner); claimants.push({claimantLockHash: owner.hash(), amount: 10n});
  }
  const overrides = {normalizedUserTypeIds: [...userLocks.keys()], userLocks};
  const transaction = tx(); pool(transaction, claimants.slice(0, 100), points); pool(transaction, claimants.slice(100), points);
  expect(() => validate(transaction, baseQuest(), overrides)).not.toThrow();
  const oversized = tx(); pool(oversized, claimants, points);
  expect(() => validate(oversized, baseQuest(), overrides)).toThrow("between 1 and 100");
});

it("supports truly zero rewards but refuses configured NFT rewards rather than silently dropping them", () => {
  expect(() => validate(tx(), baseQuest({points: 0n}), {recyclerLockHashes: []})).not.toThrow();
  const nft = {...assets(), nft_assets: [token]};
  expect(() => validate(tx(), baseQuest({points: 0n, rewards_on_completion: [nft]}))).toThrow("NFT rewards are not supported");
  const unexpected = tx(); pool(unexpected, entries(1n), points);
  expect(() => validate(unexpected, baseQuest({points: 0n}))).toThrow("Unexpected reward pool asset");
});

it("rejects already-rounded Numbers and uint128 overflow when combining repeated token definitions", () => {
  expect(() => validate(tx(), baseQuest({points: Number.MAX_SAFE_INTEGER + 1}))).toThrow("exact integers");
  const max = (1n << 128n) - 1n;
  const rewards = [assets(0n, [{udt_script: token, amount: max}]), assets(0n, [{udt_script: token, amount: 1n}])];
  expect(() => validate(tx(), baseQuest({rewards_on_completion: rewards}))).toThrow("exceeds uint128");
});

it("requires actual resolved input cells before permitting token change", () => {
  const transaction = tx(); pool(transaction, entries(10n), points);
  transaction.inputs.push(ccc.CellInput.from({previousOutput: {txHash: hash("f"), index: 0}}));
  expect(() => validate(transaction)).toThrow("requires hydrated inputs");
});

it("rejects missing claimant identities, duplicate users and consumption of pre-existing claimable pools", () => {
  const transaction = tx(); pool(transaction, entries(10n), points);
  expect(() => validate(transaction, baseQuest(), {userLocks: new Map([[userA, lockA]])})).toThrow("authoritative claimant");
  expect(() => validate(transaction, baseQuest(), {normalizedUserTypeIds: [userA, userA]})).toThrow("Duplicate approved user");
  input(transaction, points, 20n, ccc.Script.from({codeHash: poolCodeHash, hashType: "type", args: reviewer}));
  expect(() => validate(transaction)).toThrow("consume an existing claimable pool");
});
