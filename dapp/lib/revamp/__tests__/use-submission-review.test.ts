import { act, renderHook, waitFor } from "@testing-library/react";
import { ccc } from "@ckb-ccc/connector-react";
import { useSubmissionReview } from "../use-submission-review";
import { buildReviewQueue } from "../submission-review";
import { REVIEW_AUTH_TIMEOUT_MS, REVIEW_SCAN_TIMEOUT_MS } from "../review-request";

const mockFetch = jest.fn();
const mockDirectApprove = jest.fn();
const mockProxyApprove = jest.fn();
const mockProtocol = jest.fn();
const mockCampaign = jest.fn();
let mockServiceSigner: ccc.Signer;
jest.mock("@ckb-ccc/connector-react", () => ({ccc: {useSigner: jest.fn(), hexFrom: (value: unknown) => value, stringify: JSON.stringify}, ssri: {ExecutorJsonRpc: jest.fn()}}));
jest.mock("../../../../packages/ssri-ckboost/dist/index.js", () => ({Campaign: jest.fn()}));
jest.mock("../../../../packages/ssri-ckboost/dist/generated/index.js", () => ({
  CampaignData: {decode: (value: unknown) => value}, ProtocolData: {decode: (value: unknown) => value},
  UserData: {decode: (value: unknown) => value}, ConnectedTypeID: {encode: () => "0x00"},
}));
jest.mock("@/lib/services/protocol-service", () => ({ProtocolService: jest.fn().mockImplementation(() => ({getProtocolCell: () => mockProtocol()}))}));
jest.mock("@/lib/services/campaign-admin-service", () => ({CampaignAdminService: jest.fn().mockImplementation((serviceSigner: ccc.Signer) => {mockServiceSigner=serviceSigner;return {fetchCampaignSubmissions: mockFetch, approveCompletion: mockDirectApprove, approveCompletionViaProxy: mockProxyApprove};})}));
jest.mock("@/lib/ckb/campaign-cells", () => ({fetchCampaignByTypeId: (...args: unknown[]) => mockCampaign(...args)}));
jest.mock("@/lib/ckb/deployment-manager", () => ({deploymentManager: {getCurrentNetwork: () => "testnet", getContractOutPoint: () => ({txHash: "0x00", index: 0}), getContractCodeHash: () => `0x${"11".repeat(32)}`}}));
jest.mock("@/lib/providers/pending-transaction-provider", () => ({usePendingTransactions: () => ({confirmationTarget: 1, explorerBaseUrl: "https://explorer.test/transaction/"})}));

const id = `0x${"aa".repeat(32)}`;
const userId = `0x${"bb".repeat(32)}`;
const reviewer = `0x${"cc".repeat(32)}`;
const protocolHash = `0x${"22".repeat(32)}`;
const campaignHash = `0x${"33".repeat(32)}`;
const campaignCode = `0x${"11".repeat(32)}`;
const lockCode = `0x${"66".repeat(32)}`;
const otherOwner = `0x${"77".repeat(32)}`;
const connected = (typeId: string, protocol = protocolHash) => `0x4c0000000c0000002c000000${typeId.slice(2)}${protocol.slice(2)}`;
const record = {campaign_type_id: id, quest_id: 0, submission_timestamp: 1000, submission_content: "Reviewed proof"};
let protocol: any;
let campaign: any;
let currentHash: string;
let ownerHash: string;
let client: any;
let signer: NonNullable<ReturnType<typeof ccc.useSigner>>;
const currentRows = () => buildReviewQueue(campaign.quests, new Map([[0, [{...record, userTypeId: userId}]]])).byQuest.get(0)!;
const approvedCampaign = () => ({...campaign, quests: [{...campaign.quests[0], accepted_submission_user_type_ids: [userId]}]});
const receipt = (data = approvedCampaign()) => ({status: "committed", transaction: {outputs: [{type: {hash: () => campaignHash}}], outputsData: [data]}});
const load = async () => {
  const hook = renderHook(() => useSubmissionReview(id));
  await waitFor(() => expect(hook.result.current.access).toBe("allowed"));
  return hook;
};

describe("live review authority and transaction lifecycle", () => {
  afterEach(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    currentHash = reviewer;
    ownerHash = reviewer;
    protocol = {protocol_config: {admin_lock_hash_vec: [reviewer], script_code_hashes: {ckb_boost_campaign_type_code_hash: campaignCode, ckb_boost_protocol_lock_code_hash: lockCode, ckb_boost_user_type_code_hash: `0x${"44".repeat(32)}`}}, endorsers_whitelist: [], campaigns_approved: [id]};
    campaign = {starting_time: 1, ending_time: 2, endorser_lock_hash: `0x${"00".repeat(32)}`, staff_lock_hash_vec: [], quests: [{quest_id: 0, accepted_submission_user_type_ids: [], sub_tasks: [], metadata: {title: "Proof"}}]};
    mockProtocol.mockImplementation(async () => ({outputData: protocol, cellOutput: {type: {hash: () => protocolHash}, lock:{hashType:"type"}}}));
    mockCampaign.mockImplementation(async () => ({outPoint:{txHash:`0x${"55".repeat(32)}`,index:0n},outputData: campaign, cellOutput: {type: {codeHash:campaignCode,hashType:"type",args:connected(id),hash: () => campaignHash},lock:{codeHash:lockCode,hashType:"type",args:connected(ownerHash)}}}));
    mockFetch.mockImplementation(async () => ({campaignData: campaign, submissions: new Map([[0, [{...record, userTypeId: userId}]]]), userDetails: new Map(), stats: {totalSubmissions: 1, pendingReview: 1, approved: 0}}));
    mockDirectApprove.mockResolvedValue("0xtx"); mockProxyApprove.mockResolvedValue("0xtx");
    client = {findCellsByType: jest.fn(async function* () {yield {outputData: {submission_records: [record]}};}), waitTransaction: jest.fn(async () => receipt()), getTransactionWithHeader: jest.fn(async () => ({header: {timestamp: 123456}})), getTransactionNoCache: jest.fn(async () => ({status: "pending"}))};
    signer = {client,sendTransaction:jest.fn(async()=>"0xtx"), getRecommendedAddressObj: jest.fn(async () => ({script: {hash: () => currentHash}}))} as unknown as typeof signer;
    jest.mocked(ccc.useSigner).mockReturnValue(signer);
  });

  it("does not scan contributor cells for a connected wallet without review permission", async () => {
    protocol.protocol_config.admin_lock_hash_vec = [];
    const {result} = renderHook(() => useSubmissionReview(id));
    await waitFor(() => expect(result.current.access).toBe("denied"));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.dataset).toBeNull();
  });

  it("rechecks revoked membership before any wallet signing", async () => {
    const {result} = await load();
    protocol.protocol_config.admin_lock_hash_vec = [];
    await act(async () => result.current.approve(0, currentRows()));
    expect(result.current.approval?.phase).toBe("error");
    expect(result.current.access).toBe("denied");
    expect(mockDirectApprove).not.toHaveBeenCalled();
    expect(mockProxyApprove).not.toHaveBeenCalled();
  });
  it("blocks configured NFT rewards for direct admin approval before signing",async()=>{
    campaign.quests[0].rewards_on_completion=[{nft_assets:[{}],udt_assets:[],ckb_amount:0,points_amount:0}];
    const {result}=await load();await act(async()=>result.current.approve(0,currentRows()));
    expect(result.current.approval?.message).toContain("NFT reward approval is unavailable");expect(mockDirectApprove).not.toHaveBeenCalled();expect(mockProxyApprove).not.toHaveBeenCalled();expect(result.current.access).toBe("allowed");
  });

  it("rejects changed evidence and a wallet changing during the freshness check", async () => {
    const {result} = await load();
    client.findCellsByType.mockImplementationOnce(async function* () {yield {outputData: {submission_records: [{...record, submission_content: "Changed proof"}]}};});
    await act(async () => result.current.approve(0, currentRows()));
    expect(result.current.approval?.message).toContain("updated their response");
    client.findCellsByType.mockImplementationOnce(async function* () {currentHash = `0x${"dd".repeat(32)}`; yield {outputData: {submission_records: [record]}};});
    await act(async () => result.current.approve(0, currentRows()));
    expect(mockDirectApprove).not.toHaveBeenCalled();
  });

  it("keeps a broadcast transaction pending without promoting the response or signing duplicates", async () => {
    const {result} = await load();
    client.waitTransaction.mockRejectedValue(new Error("Timed out"));
    // A committed RPC status can still be below the configured confirmation target.
    client.getTransactionNoCache.mockResolvedValue({status: "committed"});
    await act(async () => result.current.approve(0, currentRows()));
    expect(result.current.approval?.phase).toBe("pending");
    expect(result.current.dataset?.campaignData.quests[0].accepted_submission_user_type_ids).toEqual([]);
    await act(async () => result.current.approve(0, currentRows()));
    expect(mockDirectApprove).toHaveBeenCalledTimes(1);
    client.waitTransaction.mockResolvedValue(receipt());
    await act(async () => result.current.checkConfirmation());
    expect(result.current.approval?.phase).toBe("confirmed");
    expect(result.current.dataset?.campaignData.quests[0].accepted_submission_user_type_ids).toEqual([userId]);
    expect(result.current.approvalTimes[`0:${userId}`]).toBe(123456);
  });

  it("routes an assigned reviewer through direct wallet approval and requires accepted IDs in the receipt", async () => {
    protocol.protocol_config.admin_lock_hash_vec = [];
    campaign.staff_lock_hash_vec = [reviewer];
    const {result} = await load();
    client.waitTransaction.mockResolvedValue(receipt(campaign));
    client.getTransactionNoCache.mockResolvedValue({status: "committed"});
    await act(async () => result.current.approve(0, currentRows()));
    expect(mockDirectApprove).toHaveBeenCalledTimes(1);
    expect(mockProxyApprove).not.toHaveBeenCalled();
    expect(result.current.approval?.phase).toBe("error");
    expect(result.current.dataset?.campaignData.quests[0].accepted_submission_user_type_ids).toEqual([]);
  });

  it("lets the currently granted verified owner review directly without an admin proxy", async () => {
    protocol.protocol_config.admin_lock_hash_vec=[];
    protocol.endorsers_whitelist=[{endorser_lock_hash:reviewer}];
    // Endorsement metadata is neither an ownership grant nor an extra restriction.
    campaign.endorser_lock_hash=otherOwner;
    const {result}=await load();
    await act(async()=>result.current.approve(0,currentRows()));
    expect(result.current.approval?.phase).toBe("confirmed");
    expect(mockDirectApprove).toHaveBeenCalledTimes(1);
    expect(mockProxyApprove).not.toHaveBeenCalled();
  });

  it("reports a direct reviewer failure without silently requesting proxy authority",async()=>{
    protocol.protocol_config.admin_lock_hash_vec=[];campaign.staff_lock_hash_vec=[reviewer];
    const {result}=await load();mockDirectApprove.mockRejectedValueOnce(new Error("Current reviewer input is no longer authorized"));
    await act(async()=>result.current.approve(0,currentRows()));
    expect(result.current.approval?.message).toBe("Current reviewer input is no longer authorized");
    expect(mockProxyApprove).not.toHaveBeenCalled();expect(client.waitTransaction).not.toHaveBeenCalled();
  });

  it("does not expose even the admin queue when the campaign lock belongs to another protocol",async()=>{
    const original=mockCampaign.getMockImplementation()!;
    mockCampaign.mockImplementation(async()=>{const cell=await original();cell.cellOutput.lock.args=connected(reviewer).replace(protocolHash.slice(2),"ff".repeat(32));return cell;});
    const {result}=renderHook(()=>useSubmissionReview(id));
    await waitFor(()=>expect(result.current.access).toBe("error"));
    expect(result.current.error).toContain("protocol binding is invalid");expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(["another-owner","ungranted-owner","metadata-only"])("does not scan for %s Organizer claims",async scenario=>{
    protocol.protocol_config.admin_lock_hash_vec=[];
    if(scenario!=="ungranted-owner") protocol.endorsers_whitelist=[{endorser_lock_hash:reviewer}];
    if(scenario!=="ungranted-owner") ownerHash=otherOwner;
    if(scenario==="metadata-only") campaign.endorser_lock_hash=reviewer;
    const {result}=renderHook(()=>useSubmissionReview(id));
    await waitFor(()=>expect(result.current.access).toBe("denied"));
    expect(mockFetch).not.toHaveBeenCalled();expect(mockDirectApprove).not.toHaveBeenCalled();expect(mockProxyApprove).not.toHaveBeenCalled();
  });

  it.each(["Organizer grant","reviewer assignment"])("checks revoked %s again at the actual wallet send",async role=>{
    protocol.protocol_config.admin_lock_hash_vec=[];
    if(role==="Organizer grant") protocol.endorsers_whitelist=[{endorser_lock_hash:reviewer}];
    else campaign.staff_lock_hash_vec=[reviewer];
    const {result}=await load();
    mockDirectApprove.mockImplementationOnce(async()=>{
      protocol.endorsers_whitelist=[];campaign.staff_lock_hash_vec=[];
      return mockServiceSigner.sendTransaction({} as ccc.TransactionLike);
    });
    await act(async()=>result.current.approve(0,currentRows()));
    expect(result.current.approval?.message).toContain("revoked before broadcast");
    expect(signer.sendTransaction).not.toHaveBeenCalled();expect(mockProxyApprove).not.toHaveBeenCalled();
  });

  it("allows retry after wallet cancellation without reporting a successful approval", async () => {
    const {result} = await load();
    mockDirectApprove.mockRejectedValueOnce(new Error("Wallet request cancelled"));
    await act(async () => result.current.approve(0, currentRows()));
    expect(result.current.approval).toMatchObject({phase: "error", message: "Wallet request cancelled"});
    expect(client.waitTransaction).not.toHaveBeenCalled();
    expect(result.current.dataset?.campaignData.quests[0].accepted_submission_user_type_ids).toEqual([]);
    await act(async () => result.current.approve(0, currentRows()));
    expect(result.current.approval?.phase).toBe("confirmed");
  });

  it("hides an old queue immediately when a different signer connects", async () => {
    const {result, rerender} = await load();
    const oldSigner = signer;
    signer = {...oldSigner, getRecommendedAddressObj: jest.fn(async () => ({script: {hash: () => `0x${"ee".repeat(32)}`}}))} as unknown as typeof signer;
    jest.mocked(ccc.useSigner).mockReturnValue(signer);
    rerender();
    expect(result.current.dataset).toBeNull();
    await waitFor(() => expect(result.current.access).toBe("denied"));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed account even when the connector keeps the same signer object",async()=>{
    const {result}=await load();const next=`0x${"dd".repeat(32)}`;protocol.protocol_config.admin_lock_hash_vec.push(next);currentHash=next;
    await act(async()=>result.current.approve(0,currentRows()));
    expect(result.current.dataset).toBeNull();expect(mockDirectApprove).not.toHaveBeenCalled();
    expect(result.current.approval?.message).toContain("account changed");
  });

  it("checks review permission again when SDK construction reaches the actual wallet send",async()=>{
    const {result}=await load();
    mockDirectApprove.mockImplementationOnce(async()=>{protocol.protocol_config.admin_lock_hash_vec=[];return await mockServiceSigner.sendTransaction({} as ccc.TransactionLike);});
    await act(async()=>result.current.approve(0,currentRows()));
    expect(result.current.approval?.message).toContain("revoked before broadcast");
    expect(signer.sendTransaction).not.toHaveBeenCalled();expect(result.current.access).toBe("denied");
  });

  it("does not let an older in-flight refresh roll back a confirmed approval",async()=>{
    const {result}=await load();let complete!: (value: unknown)=>void;
    const stale=new Promise(resolve=>{complete=resolve;});mockFetch.mockReturnValueOnce(stale);
    let refresh!:Promise<void>;act(()=>{refresh=result.current.refresh();});await waitFor(()=>expect(mockFetch).toHaveBeenCalledTimes(2));
    await act(async()=>result.current.approve(0,currentRows()));expect(result.current.approval?.phase).toBe("confirmed");
    await act(async()=>{complete({campaignData:campaign,submissions:new Map(),userDetails:new Map(),stats:{}});await refresh;});
    expect(result.current.dataset?.campaignData.quests[0].accepted_submission_user_type_ids).toEqual([userId]);
  });

  it("does not let an old account's late denial erase a newly authorized account's queue",async()=>{
    const {result,rerender}=await load();let complete!: (value: unknown)=>void;const slow=new Promise(resolve=>{complete=resolve;});mockProtocol.mockReturnValueOnce(slow);
    let approval!:Promise<void>;act(()=>{approval=result.current.approve(0,currentRows());});await waitFor(()=>expect(result.current.busy).toBe(true));
    const previous=signer;signer={...previous} as unknown as typeof signer;jest.mocked(ccc.useSigner).mockReturnValue(signer);rerender();
    await waitFor(()=>expect(result.current.dataset?.signer).toBe(signer));
    await act(async()=>{complete({outputData:{...protocol,protocol_config:{...protocol.protocol_config,admin_lock_hash_vec:[]}},cellOutput:{type:{hash:()=>protocolHash}}});await approval;});
    expect(result.current.access).toBe("allowed");expect(result.current.dataset?.signer).toBe(signer);expect(result.current.busy).toBe(false);
  });

  it("ends a hung permission read with Retry and ignores its late result after a successful retry", async () => {
    jest.useFakeTimers();
    let complete!: (value: unknown) => void;
    mockProtocol.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const { result } = renderHook(() => useSubmissionReview(id));
    await act(async () => { jest.advanceTimersByTime(REVIEW_AUTH_TIMEOUT_MS); });
    expect(result.current.access).toBe("error");
    expect(result.current.error).toMatch(/access check timed out.*Try again/);
    expect(mockFetch).not.toHaveBeenCalled();
    await act(async () => { await result.current.refresh(true); });
    expect(result.current.access).toBe("allowed");
    const retried = result.current.dataset;
    await act(async () => {
      complete({ outputData: { ...protocol, protocol_config: { ...protocol.protocol_config, admin_lock_hash_vec: [] } }, cellOutput: { type: { hash: () => protocolHash } } });
    });
    expect(result.current.dataset).toBe(retried);
    expect(result.current.access).toBe("allowed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("ends a hung initial contributor scan at 30 seconds and prevents the late old scope from overwriting the next wallet", async () => {
    jest.useFakeTimers();
    let complete!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const { result, rerender } = renderHook(() => useSubmissionReview(id));
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(REVIEW_SCAN_TIMEOUT_MS); });
    expect(result.current.access).toBe("error");
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toMatch(/scan timed out after 30 seconds.*Try again/);
    signer = { ...signer } as unknown as typeof signer;
    jest.mocked(ccc.useSigner).mockReturnValue(signer);
    await act(async () => { rerender(); });
    expect(result.current.access).toBe("allowed");
    const next = result.current.dataset;
    await act(async () => { complete({ campaignData: campaign, submissions: new Map(), userDetails: new Map(), stats: {} }); });
    expect(result.current.dataset).toBe(next);
    expect(result.current.dataset?.signer).toBe(signer);
    expect(result.current.error).toBeNull();
  });
});
