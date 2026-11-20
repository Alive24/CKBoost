/** @jest-environment node */
import { ccc } from "@ckb-ccc/shell";
import {
  CampaignData, ConnectedTypeID, ProtocolData, TransactionRecipe, UserData,
  type CampaignDataLike, type ProtocolDataLike,
} from "ssri-ckboost/types";
import { encodeClaimablePoolData, decodeClaimablePoolData } from "ckb-claimable-pool-lock";
import poolDeployments from "../../../contracts/contracts/claimable-pool-lock/deployments.json";
import { handler } from "../functions/staff-approve-submissions";

// Keep real CCC transactions/scripts and all authorization, pool and proxy-pair
// checks. Only RPC boundaries and the final private-key signer are substituted.
jest.mock("@ckb-ccc/shell", () => {
  const actual = jest.requireActual("@ckb-ccc/shell");
  return { ...actual, ccc: { ...actual.ccc,
    ClientPublicTestnet: jest.fn(() => mockClient),
    ClientPublicMainnet: jest.fn(() => mockClient),
    SignerCkbPrivateKey: jest.fn(() => ({
      getRecommendedAddressObj: async () => ({script: mockScripts.proxy}),
      getRelatedScripts: async () => [{script: mockScripts.proxy, cellDeps: []}],
      signTransaction: mockSign,
    })),
  }};
});
jest.mock("@/lib/ckb/deployment-manager", () => ({deploymentManager: {
  getCurrentNetwork: () => "testnet",
  getContractCodeHash: (_network: string, name: string) => mockCodes[name],
}}));
jest.mock("@/netlify/lib/utils", () => ({getProtocolTypeScript: () => mockScripts.protocol}));
jest.mock("@/netlify/lib/log", () => ({createLogger: () => ({
  info: (...args: unknown[]) => mockLogInfo(...args), error: (...args: unknown[]) => mockLogError(...args),
})}));

const hash = (digit: string) => `0x${digit.repeat(64)}` as ccc.Hex;
const CKB = 100_000_000n;
const TEST_KEY = "test-only-signer-is-mocked-no-private-key";
const mockCodes: Record<string, ccc.Hex> = {
  ckboostCampaignType: hash("1"), ckboostUserType: hash("2"), ckboostPointsUdt: hash("3"),
};
const wallet = (digit: string) => ccc.Script.from({codeHash: hash("4"), hashType: "type", args: hash(digit)});
const mockScripts = {
  proxy: wallet("5"), staff: wallet("6"), claimant: wallet("7"), campaign: wallet("8"), funding: wallet("9"),
  protocol: ccc.Script.from({codeHash: hash("a"), hashType: "type", args: hash("b")}),
  token: ccc.Script.from({codeHash: hash("c"), hashType: "type", args: hash("d")}),
};
const campaignId = hash("e"), userId = hash("f");
const protocolHash = mockScripts.protocol.hash();
// A campaign INPUT is protected by the actual configured protocol lock, not a
// synthetic native wallet lock. Ownership remains distinct from endorsement.
mockScripts.campaign = ccc.Script.from({codeHash:hash("8"),hashType:"type",
  args:ccc.hexFrom(ConnectedTypeID.encode({type_id:wallet("8").hash(),connected_key:protocolHash}))});
const poolCodeHash = poolDeployments.current.testnet.claimablePoolLock.typeHash as ccc.Hex;
const mockSign = jest.fn(async (tx: ccc.Transaction) => {
  // Preserve the raw transaction and every other lock group's witness. This is
  // deliberately a dummy signature, never a key or a broadcast-capable signer.
  tx.witnesses[2] = ccc.hexFrom(ccc.WitnessArgs.from({lock: new Uint8Array(65).fill(0x5a)}).toBytes());
  return tx;
});
const mockLogInfo = jest.fn(), mockLogError = jest.fn();
const mockCells = new Map<string, ccc.Cell>();
let mockProtocolCell: ccc.Cell;
let mockUserCell: ccc.Cell;
const outPointKey = (point: ccc.OutPointLike) => `${ccc.hexFrom(point.txHash)}:${ccc.numFrom(point.index)}`;
const mockClient = {
  getCell: jest.fn(async (point: ccc.OutPointLike) => mockCells.get(outPointKey(point))),
  findCells: jest.fn((query: {script: ccc.ScriptLike}) => (async function* () {
    const script = ccc.Script.from(query.script);
    if (script.eq(mockScripts.protocol)) yield mockProtocolCell;
    else if (script.eq(mockUserCell.cellOutput.type!)) yield mockUserCell;
    else throw new Error("Unexpected RPC cell search in integration fixture");
  })()),
};

function cell(index: number, output: ccc.CellOutputLike, data: ccc.HexLike = "0x") {
  return ccc.Cell.from({outPoint: {txHash: hash("0"), index}, cellOutput: output, outputData: data});
}
function campaign(): CampaignDataLike {
  const rewards = {points_amount: 0n, ckb_amount: 5n * CKB, udt_assets: [{udt_script: mockScripts.token, amount: 7n}], nft_assets: []};
  return {
    endorser_lock_hash: mockScripts.campaign.hash(), staff_lock_hash_vec: [mockScripts.staff.hash()],
    created_at: 1n, starting_time: 1n, ending_time: 2_000_000_000n, rules: [], status: 1,
    metadata: {title: "HTTP integration fixture", short_description: "Real codecs", long_description: "Test data only",
      total_rewards: rewards, verification_requirements: [], last_updated: 1n, categories: [], difficulty: 1, image_url: ""},
    quests: [{quest_id: 0, metadata: {title: "Quest zero", short_description: "Submit", long_description: "Evidence",
      requirements: "", difficulty: 1, time_estimate: 10}, rewards_on_completion: [rewards],
      accepted_submission_user_type_ids: [], completion_deadline: 2_000_000_000n, status: 1, sub_tasks: [], points: 10n, completion_count: 0}],
    participants_count: 0, total_completions: 0,
  };
}
function protocol(): ProtocolDataLike {
  return {
    campaigns_approved: [campaignId], tippings_approved: [], tipping_config: {approval_requirement_thresholds: [], expiration_duration: 0},
    endorsers_whitelist: [], last_updated: 1,
    protocol_config: {admin_lock_hash_vec: [mockScripts.proxy.hash()], streak_bonus_interval: 0, streak_bonus_amount: 0,
      achievement_type_hashes: [], script_code_hashes: {
        ckb_boost_protocol_type_code_hash: mockScripts.protocol.codeHash,
        ckb_boost_protocol_lock_code_hash: hash("8"), ckb_boost_campaign_type_code_hash: mockCodes.ckboostCampaignType,
        ckb_boost_funding_lock_code_hash: hash("9"), ckb_boost_user_type_code_hash: mockCodes.ckboostUserType,
        ckb_boost_points_udt_type_code_hash: mockCodes.ckboostPointsUdt,
        ckb_boost_tipping_type_code_hash: hash("a"), ckb_boost_achievement_type_code_hash: hash("b"),
        accepted_udt_type_scripts: [mockScripts.token], accepted_dob_type_scripts: [],
      }},
  };
}
function fixture() {
  const previous = campaign();
  const next = CampaignData.decode(CampaignData.encode(previous));
  next.quests[0].accepted_submission_user_type_ids = [userId];
  next.quests[0].completion_count = 1;
  next.total_completions = 1; next.participants_count = 1;
  const campaignType = ccc.Script.from({codeHash: mockCodes.ckboostCampaignType, hashType: "type",
    args: ccc.hexFrom(ConnectedTypeID.encode({type_id: campaignId, connected_key: protocolHash}))});
  const userType = ccc.Script.from({codeHash: mockCodes.ckboostUserType, hashType: "type",
    args: ccc.hexFrom(ConnectedTypeID.encode({type_id: userId, connected_key: protocolHash}))});
  mockProtocolCell = cell(10, {capacity: 10_000n * CKB, lock: mockScripts.proxy, type: mockScripts.protocol}, ProtocolData.encode(protocol()));
  mockUserCell = cell(11, {capacity: 1000n * CKB, lock: mockScripts.claimant, type: userType}, UserData.encode({
    verification_data: {telegram_personal_chat_id: 0, identity_verification_data: "0x"}, total_points_earned: 0, last_activity_timestamp: 1,
    submission_records: [{campaign_type_id: campaignId, quest_id: 0, submission_timestamp: 1, submission_content: "Synthetic evidence"}],
    profile_data: [], last_bonus_streak_at: 0,
  }));
  const inputs = [
    cell(0, {capacity: 3000n * CKB, lock: mockScripts.campaign, type: campaignType}, CampaignData.encode(previous)),
    cell(1, {capacity: 1000n * CKB, lock: mockScripts.staff}),
    cell(2, {capacity: 1000n * CKB, lock: mockScripts.proxy}),
    cell(3, {capacity: 250n * CKB, lock: mockScripts.funding, type: mockScripts.token}, ccc.numToBytes(50n, 16)),
  ];
  for (const input of inputs) mockCells.set(outPointKey(input.outPoint), input);
  const tx = ccc.Transaction.from({
    inputs: inputs.map(input => ({previousOutput: input.outPoint})),
    outputs: [inputs[0].cellOutput.clone()], outputsData: [CampaignData.encode(next)],
    witnesses: [ccc.WitnessArgs.from({outputType: TransactionRecipe.encode({method_path: ccc.bytesFrom("CKBoostCampaign.approve_completion", "utf8"),
      arguments: [{arg_type: 2, data: ccc.numToBytes(0, 4)}, {arg_type: 0, data: ccc.numToBytes(0, 4)},
        {arg_type: 0, data: ccc.bytesFrom(`0x01000000${userId.slice(2)}`)}], cell_deps: null, header_deps: null})}).toBytes(), "0x", "0x", "0x"],
  });
  const points = ccc.Script.from({codeHash: mockCodes.ckboostPointsUdt, hashType: "type", args: protocolHash});
  const poolIndexes: number[] = [];
  for (const [amount, type] of [[10n, points], [5n * CKB, undefined], [7n, mockScripts.token]] as const) {
    const data = encodeClaimablePoolData([{claimantLockHash: mockScripts.claimant.hash(), amount}]);
    const output = ccc.CellOutput.from({lock: {codeHash: poolCodeHash, hashType: "type", args: mockScripts.staff.hash()}, type}, data);
    if (!type) output.capacity += amount;
    poolIndexes.push(tx.outputs.length); tx.outputs.push(output); tx.outputsData.push(data);
  }
  tx.outputs.push(inputs[2].cellOutput.clone()); tx.outputsData.push("0x");
  tx.outputs.push(ccc.CellOutput.from({capacity: 250n * CKB, lock: mockScripts.funding, type: mockScripts.token}));
  tx.outputsData.push(ccc.hexFrom(ccc.numToBytes(43n, 16)));
  const poolCapacity = poolIndexes.reduce((sum, index) => sum + tx.outputs[index].capacity, 0n);
  const staffChangeIndex = tx.outputs.length;
  tx.outputs.push(ccc.CellOutput.from({capacity: inputs[1].cellOutput.capacity - poolCapacity - 10_000n, lock: mockScripts.staff}));
  tx.outputsData.push("0x");
  return {tx, poolIndexes, staffChangeIndex, proxyOutputIndex: 4, campaignData: next};
}

async function request(tx: ccc.Transaction) {
  return handler({httpMethod: "POST", body: JSON.stringify({txHex: ccc.hexFrom(tx.toBytes()), campaignTypeId: campaignId,
    questId: 0, userTypeIds: [userId]})} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], jest.fn());
}
beforeAll(() => { process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY = TEST_KEY; });
afterAll(() => { delete process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY; });
beforeEach(() => { jest.clearAllMocks(); mockCells.clear(); });

it("co-signs a normal net-spending Staff approval through the real HTTP handler and real proxy-pair check", async () => {
  const {tx, poolIndexes, proxyOutputIndex} = fixture();
  const raw = ccc.hexFrom(tx.toBytes());
  const response = await request(tx);
  expect(response).toMatchObject({statusCode: 200});
  const body = JSON.parse(response!.body ?? "{}");
  expect(body.success).toBe(true);
  expect(mockSign).toHaveBeenCalledTimes(1);
  expect(ccc.SignerCkbPrivateKey).toHaveBeenCalledWith(mockClient, TEST_KEY);
  expect(mockClient.getCell).toHaveBeenCalledTimes(4);
  expect(mockClient.findCells).toHaveBeenCalledTimes(2);
  expect(mockLogInfo).toHaveBeenCalledWith("proxy_admin_cell_verified", expect.any(Object));
  const signed = ccc.Transaction.fromBytes(body.txHex);
  const proposed = ccc.Transaction.fromBytes(raw);
  // Proxy checks must not reconstruct outputs, change capacity, or erase the
  // campaign recipe/another wallet's evidence when hydrating and signing.
  expect(signed.rawToBytes()).toEqual(proposed.rawToBytes());
  expect(signed.witnesses[0]).toBe(proposed.witnesses[0]);
  expect(signed.outputs[proxyOutputIndex].capacity).toBe(1000n * CKB);
  for (const index of poolIndexes) {
    expect(signed.outputsData[index]).toBe(proposed.outputsData[index]);
    expect(decodeClaimablePoolData(signed.outputsData[index]).entries[0].claimantLockHash).toBe(mockScripts.claimant.hash());
  }
});

it.each(["claimant", "recycler", "pool-capacity"] as const)("rejects a changed %s before signing", async bad => {
  const {tx, poolIndexes} = fixture();
  const index = poolIndexes[0];
  if (bad === "claimant") tx.outputsData[index] = encodeClaimablePoolData([{claimantLockHash: hash("a"), amount: 10n}]);
  if (bad === "recycler") tx.outputs[index].lock.args = hash("a");
  if (bad === "pool-capacity") tx.outputs[index].capacity += 1n;
  const response = await request(tx);
  expect(response).toMatchObject({statusCode: 400});
  expect(JSON.parse(response!.body ?? "{}").error).toBe("reward_validation_failed");
  expect(mockSign).not.toHaveBeenCalled();
});

it("rejects a Staff top-up that provides no net capacity debit before signing", async () => {
  const {tx, staffChangeIndex} = fixture(); tx.outputs[staffChangeIndex].capacity = 1001n * CKB;
  const response = await request(tx);
  expect(response).toMatchObject({statusCode: 403});
  expect(JSON.parse(response!.body ?? "{}").error).toBe("reviewer_authorization_failed");
  expect(mockSign).not.toHaveBeenCalled();
});

it("executes the real proxy-pair capacity rejection after valid reward proofs", async () => {
  const {tx, proxyOutputIndex} = fixture(); tx.outputs[proxyOutputIndex].capacity -= 1n;
  const response = await request(tx);
  expect(response).toMatchObject({statusCode: 400});
  expect(JSON.parse(response!.body ?? "{}").error).toBe("proxy_output_capacity_mismatch");
  expect(mockSign).not.toHaveBeenCalled();
});
