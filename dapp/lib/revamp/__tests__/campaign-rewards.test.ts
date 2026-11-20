import type { ccc } from "@ckb-ccc/connector-react";
import type { AssetListLike } from "ssri-ckboost/types";
import { udtRegistry, type UDTToken } from "@/lib/services/udt-registry";
import { buildCampaignRewards, type CampaignRewardSource } from "../campaign-rewards";

// The adapter's contract is script identity and amounts, independent of CKB
// hashing internals. Deliberately use a deterministic full-identity hash here.
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: {
  numFrom: (value: string | number | bigint) => BigInt(value),
  Script: { from: (script: {codeHash: string; hashType: string; args: string}) => ({
    codeHash: script.codeHash.toLowerCase(),
    hashType: script.hashType,
    args: script.args.toLowerCase(),
    hash: () => `${script.codeHash}:${script.hashType}:${script.args}`.toLowerCase(),
  }) },
} }));
jest.mock("@/lib/services/udt-registry", () => ({ udtRegistry: { getTokenByScriptHash: jest.fn() } }));

const script = (suffix = "01", hashType: ccc.HashType = "type"): ccc.ScriptLike => ({
  codeHash: `0x${"a1".repeat(32)}`,
  hashType,
  args: `0x${"bb".repeat(31)}${suffix}`,
});
const assets = (ckb = 0n, udts: AssetListLike["udt_assets"] = []): AssetListLike => ({
  points_amount: 0n, ckb_amount: ckb, nft_assets: [], udt_assets: udts,
});
const campaign = (...quests: NonNullable<CampaignRewardSource["quests"]>): CampaignRewardSource => ({quests});
const token = (symbol: string, decimals: number) => ({symbol, decimals}) as UDTToken;

describe("campaign reward display", () => {
  beforeEach(() => jest.mocked(udtRegistry.getTokenByScriptHash).mockReset());

  it("keeps points and shannons exact above Number.MAX_SAFE_INTEGER", () => {
    const result = buildCampaignRewards(campaign(
      {points: 9007199254740993n, rewards_on_completion: [assets(9007199254740993n)]},
      {points: 7n, rewards_on_completion: [assets(7n)]},
    ));
    expect(result).toEqual([
      {key: "points", kind: "points", label: "Points", amount: "9007199254741000"},
      {key: "ckb", kind: "ckb", label: "CKB", amount: "90071992.54741"},
    ]);
  });

  it("aggregates the same UDT across quests and asset lists using registry decimals", () => {
    jest.mocked(udtRegistry.getTokenByScriptHash).mockReturnValue(token("TOKEN", 18));
    const result = buildCampaignRewards(campaign(
      {points: 0n, rewards_on_completion: [assets(0n, [{udt_script: script(), amount: 9007199254740993n}])]},
      {points: 0n, rewards_on_completion: [assets(0n, [{udt_script: script(), amount: 7n}])]},
    ));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({kind: "udt", label: "TOKEN", amount: "0.009007199254741"});
  });

  it("does not merge different scripts with the same registered symbol", () => {
    jest.mocked(udtRegistry.getTokenByScriptHash).mockReturnValue(token("SAME", 2));
    const result = buildCampaignRewards(campaign({points: 0n, rewards_on_completion: [assets(0n, [
      {udt_script: script("01"), amount: 100n},
      {udt_script: script("02"), amount: 250n},
      {udt_script: script("01", "data"), amount: 300n},
    ])]}));
    expect(result.map(reward => reward.amount)).toEqual(["1", "2.5", "3"]);
    expect(new Set(result.map(reward => reward.key)).size).toBe(3);
  });

  it("labels unknown UDT amounts as base units without guessing decimals", () => {
    const result = buildCampaignRewards(campaign({points: 0n, rewards_on_completion: [assets(0n, [
      {udt_script: script(), amount: 123456789n},
    ])]}));
    expect(result[0]).toMatchObject({label: "UDT (base units)", amount: "123456789"});
  });

  it("preserves known zero-decimal tokens and fractional leading zeros", () => {
    jest.mocked(udtRegistry.getTokenByScriptHash)
      .mockReturnValueOnce(token("WHOLE", 0))
      .mockReturnValueOnce(token("SMALL", 8));
    const result = buildCampaignRewards(campaign({points: 0n, rewards_on_completion: [assets(1n, [
      {udt_script: script("01"), amount: 12n},
      {udt_script: script("02"), amount: 1n},
    ])]}));
    expect(result.map(reward => [reward.label, reward.amount])).toEqual([
      ["CKB", "0.00000001"], ["WHOLE", "12"], ["SMALL", "0.00000001"],
    ]);
  });

  it("omits unconfigured and zero rewards and uses quest.points rather than asset-list points", () => {
    expect(buildCampaignRewards({})).toEqual([]);
    expect(buildCampaignRewards(campaign({points: 0n, rewards_on_completion: [{
      ...assets(0n, [{udt_script: script(), amount: 0n}]), points_amount: 999n,
    }]}))).toEqual([]);
    expect(udtRegistry.getTokenByScriptHash).not.toHaveBeenCalled();
  });

  it("rejects already-rounded numeric input instead of displaying an incorrect balance", () => {
    expect(() => buildCampaignRewards(campaign({points: Number.MAX_SAFE_INTEGER + 1, rewards_on_completion: []})))
      .toThrow("Reward amounts must be exact integers");
  });
});
