import { ccc } from "@ckb-ccc/connector-react";
import type { QuestDataLike } from "ssri-ckboost/types";
import { udtRegistry } from "@/lib/services/udt-registry";

export interface CampaignRewardSource {
  quests?: readonly Pick<QuestDataLike, "points" | "rewards_on_completion">[];
}

export interface CampaignReward {
  key: string;
  kind: "points" | "ckb" | "udt";
  label: string;
  amount: string;
}

function positiveAmount(value: ccc.NumLike | undefined): bigint {
  // An unsafe Number has already lost information. Never turn it into a
  // plausible-looking but incorrect blockchain balance.
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError("Reward amounts must be exact integers");
  }
  const amount = ccc.numFrom(value ?? 0);
  return amount > 0n ? amount : 0n;
}

function formatUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const integer = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return integer.toString();
  return `${integer}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

/** Per-contributor configured rewards, with exact sums and no chain requests.
 * Quest.points is the points source used by the campaign contract. Native CKB
 * and UDT amounts come from each quest's rewards_on_completion asset lists.
 */
export function buildCampaignRewards(campaign: CampaignRewardSource): CampaignReward[] {
  let points = 0n;
  let ckb = 0n;
  const tokens = new Map<string, { scriptHash: string; amount: bigint }>();

  for (const quest of campaign.quests ?? []) {
    points += positiveAmount(quest.points);
    for (const assets of quest.rewards_on_completion ?? []) {
      ckb += positiveAmount(assets.ckb_amount);
      for (const asset of assets.udt_assets ?? []) {
        const amount = positiveAmount(asset.amount);
        if (amount === 0n) continue;
        const script = ccc.Script.from(asset.udt_script);
        // Include every script field, rather than symbol or a shortened hash.
        const key = `udt:${script.codeHash.toLowerCase()}:${script.hashType}:${script.args.toLowerCase()}`;
        const existing = tokens.get(key);
        if (existing) existing.amount += amount;
        else tokens.set(key, { scriptHash: script.hash(), amount });
      }
    }
  }

  const rewards: CampaignReward[] = [];
  if (points > 0n) rewards.push({ key: "points", kind: "points", label: "Points", amount: points.toString() });
  if (ckb > 0n) rewards.push({ key: "ckb", kind: "ckb", label: "CKB", amount: formatUnits(ckb, 8) });

  for (const [key, { scriptHash, amount }] of tokens) {
    const token = udtRegistry.getTokenByScriptHash(scriptHash);
    const hasDecimals = token && Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 255;
    rewards.push({
      key,
      kind: "udt",
      label: hasDecimals ? token.symbol : `${token?.symbol || "UDT"} (base units)`,
      amount: hasDecimals ? formatUnits(amount, token.decimals) : amount.toString(),
    });
  }
  return rewards;
}
