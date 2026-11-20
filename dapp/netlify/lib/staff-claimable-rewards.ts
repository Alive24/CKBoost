import { ccc } from "@ckb-ccc/shell";
import { decodeClaimablePoolData, encodeClaimablePoolData } from "ckb-claimable-pool-lock";
import type { CampaignDataLike } from "ssri-ckboost/types";

const MAX_AMOUNT = (1n << 128n) - 1n;
const MAX_POOL_ENTRIES = 100;
const hex = (value: ccc.HexLike): string => ccc.hexFrom(value).toLowerCase();
const hash32 = (value: ccc.HexLike): string => {
  const bytes = ccc.bytesFrom(value);
  if (bytes.length !== 32) throw new Error("Reward authorization requires a full 32-byte lock or code hash.");
  return hex(bytes);
};
const amount = (value: ccc.NumLike | undefined): bigint => {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Reward amounts must be exact integers.");
  const result = ccc.numFrom(value ?? 0);
  if (result < 0n || result > MAX_AMOUNT) throw new Error("Reward amount is outside the uint128 range.");
  return result;
};
const assetKey = (script?: ccc.ScriptLike): string => script ? `udt:${hex(ccc.Script.from(script).hash())}` : "ckb";
const add = (values: Map<string, bigint>, key: string, value: bigint): void => {
  const result = (values.get(key) ?? 0n) + value;
  if (result > MAX_AMOUNT) throw new Error("Combined reward amount exceeds uint128.");
  values.set(key, result);
};

export interface StaffClaimableRewardsOptions {
  /** Inputs must already be hydrated from the chain, not request metadata. */
  tx: Pick<ccc.Transaction, "inputs" | "outputs" | "outputsData">;
  nextCampaignData: Pick<CampaignDataLike, "quests">;
  questId: number;
  normalizedUserTypeIds: readonly string[];
  userLocks: ReadonlyMap<string, ccc.Script>;
  pointsCodeHash: string;
  protocolTypeHash: ccc.HexLike;
  claimablePoolLockCodeHash: string;
  /** Actual assigned staff/admin lock groups proved by the authorization step. */
  recyclerLockHashes: readonly string[];
}

/** Validate the current SDK's approval shape: newly created claimable pools.
 * Base Points come only from quest.points, matching the SDK/contract; the legacy
 * AssetList.points_amount field is not an additional mint. All CKB/UDT lists
 * are combined, including an explicitly configured UDT using the Points type.
 * This deliberately has no legacy direct-payment fallback and consumes no
 * existing claimable pools. Claim/recycle transactions use separate endpoints.
 */
export function validateStaffClaimableRewardOutputs({
  tx, nextCampaignData, questId, normalizedUserTypeIds, userLocks,
  pointsCodeHash, protocolTypeHash, claimablePoolLockCodeHash, recyclerLockHashes,
}: StaffClaimableRewardsOptions): void {
  const quest = nextCampaignData.quests.find(item => ccc.numFrom(item.quest_id) === BigInt(questId));
  if (!quest) throw new Error("Quest not found while validating claimable rewards.");
  if (tx.outputs.length !== tx.outputsData.length) throw new Error("Reward output data is not aligned with outputs.");
  const poolCodeHash = hash32(claimablePoolLockCodeHash as ccc.HexLike);
  const recyclers = new Set(recyclerLockHashes.map(value => hash32(value as ccc.HexLike)));
  const pointsScript = ccc.Script.from({codeHash: hash32(pointsCodeHash as ccc.HexLike), hashType: "type", args: hash32(protocolTypeHash)});
  const pointsKey = assetKey(pointsScript);
  const perUser = new Map<string, bigint>();
  const trackedTypes = new Set<string>([pointsKey]);
  add(perUser, pointsKey, amount(quest.points));
  for (const list of quest.rewards_on_completion ?? []) {
    if (list.nft_assets?.length) throw new Error("NFT rewards are not supported by the current claimable approval pipeline.");
    add(perUser, "ckb", amount(list.ckb_amount));
    for (const asset of list.udt_assets ?? []) {
      const value = amount(asset.amount);
      if (value === 0n) continue;
      const key = assetKey(asset.udt_script);
      trackedTypes.add(key);
      add(perUser, key, value);
    }
  }

  const expected = new Map<string, Map<string, bigint>>();
  const users = new Set<string>();
  for (const userTypeId of normalizedUserTypeIds) {
    const id = hash32(userTypeId as ccc.HexLike);
    if (users.has(id)) throw new Error("Duplicate approved user type ID.");
    users.add(id);
    const lock = userLocks.get(id);
    if (!lock) throw new Error("Approved user is missing an authoritative claimant lock.");
    const claimant = hash32(lock.hash());
    for (const [key, value] of perUser) {
      if (value === 0n) continue;
      let claimants = expected.get(key);
      if (!claimants) expected.set(key, claimants = new Map());
      add(claimants, claimant, value);
    }
  }
  if (users.size === 0) throw new Error("At least one approved user is required.");

  const actual = new Map<string, Map<string, bigint>>();
  let recycler: string | undefined;
  for (let index = 0; index < tx.outputs.length; index++) {
    const output = tx.outputs[index];
    if (hex(output.lock.codeHash) !== poolCodeHash) continue;
    if (output.lock.hashType !== "type") throw new Error("Claimable reward pool uses an incorrect lock hash type.");
    const outputRecycler = hash32(output.lock.args);
    if (!recyclers.has(outputRecycler) || (recycler !== undefined && recycler !== outputRecycler)) {
      throw new Error("All reward pools must use one currently authorized reviewer as recycler.");
    }
    recycler = outputRecycler;
    const key = assetKey(output.type);
    const expectedClaimants = expected.get(key);
    if (!expectedClaimants) throw new Error("Unexpected reward pool asset.");
    const data = tx.outputsData[index];
    const decoded = decodeClaimablePoolData(data);
    if (decoded.entries.length === 0 || decoded.entries.length > MAX_POOL_ENTRIES) throw new Error("Reward pools require between 1 and 100 claimants.");
    // Re-encoding checks the amount prefix, canonical codec length and positive
    // amounts, rather than trusting only the first 16 UDT amount bytes.
    if (hex(encodeClaimablePoolData(decoded.entries)) !== hex(data)) throw new Error("Claimable reward pool data or remaining amount is invalid.");
    const poolClaimants = new Set<string>();
    let observed = actual.get(key);
    if (!observed) actual.set(key, observed = new Map());
    for (const entry of decoded.entries) {
      const claimant = hash32(entry.claimantLockHash);
      if (poolClaimants.has(claimant)) throw new Error("Duplicate claimant in a reward pool.");
      poolClaimants.add(claimant);
      const value = amount(entry.amount);
      add(observed, claimant, value);
      if (!expectedClaimants.has(claimant) || observed.get(claimant)! > expectedClaimants.get(claimant)!) {
        throw new Error("Reward pool claimant or amount does not match approved submissions.");
      }
    }
    const occupiedCapacity = ccc.CellOutput.from({lock: output.lock, type: output.type}, data).capacity;
    const requiredCapacity = occupiedCapacity + (output.type ? 0n : decoded.remainingAmount);
    if (ccc.numFrom(output.capacity) !== requiredCapacity) throw new Error("Reward pool capacity does not match its occupied capacity and claimable amount.");
  }
  for (const [key, claimants] of expected) {
    for (const [claimant, value] of claimants) {
      if (actual.get(key)?.get(claimant) !== value) throw new Error("Claimable reward pools do not exactly match approved submissions.");
    }
  }

  // Reward tokens may have campaign-funded change. Preserve that existing
  // same-lock balance, but do not authorize extra direct credits/minted Points
  // alongside otherwise valid pools. Inspect the whole asset lock group.
  const inputBalances = new Map<string, bigint>();
  const outputBalances = new Map<string, bigint>();
  const tokenAmount = (data: ccc.HexLike): bigint => {
    const bytes = ccc.bytesFrom(data);
    if (bytes.length < 16) throw new Error("Reward token cell data is too short.");
    return ccc.numFromBytes(bytes.slice(0, 16));
  };
  for (const input of tx.inputs) {
    const output = input.cellOutput;
    if (!output) throw new Error("Reward validation requires hydrated inputs.");
    if (hex(output.lock.codeHash) === poolCodeHash) throw new Error("Approval cannot consume an existing claimable pool.");
    if (!output.type || !trackedTypes.has(assetKey(output.type))) continue;
    add(inputBalances, `${assetKey(output.type)}:${hex(output.lock.hash())}`, tokenAmount(input.outputData ?? "0x"));
  }
  for (let index = 0; index < tx.outputs.length; index++) {
    const output = tx.outputs[index];
    if (hex(output.lock.codeHash) === poolCodeHash || !output.type || !trackedTypes.has(assetKey(output.type))) continue;
    const key = `${assetKey(output.type)}:${hex(output.lock.hash())}`;
    add(outputBalances, key, tokenAmount(tx.outputsData[index]));
    if (outputBalances.get(key)! > (inputBalances.get(key) ?? 0n)) throw new Error("Direct reward token credits outside the validated pools are not allowed.");
  }
}
