import { act, renderHook } from "@testing-library/react";
import { useDiscovery } from "../discovery-provider";
import { cellToCampaignDisplay, type CampaignDisplay } from "@/lib/utils/campaign-utils";
import { buildCampaignRewards } from "../campaign-rewards";
import { useHomeCampaigns } from "../use-home-campaigns";

jest.mock("@ckb-ccc/connector-react", () => ({ccc: {hexFrom: (value: string) => value}}));
jest.mock("../discovery-provider", () => ({useDiscovery: jest.fn()}));
jest.mock("@/lib/utils/campaign-utils", () => ({cellToCampaignDisplay: jest.fn()}));
jest.mock("../campaign-rewards", () => ({buildCampaignRewards: jest.fn()}));
// Resolve the workspace SDK's actual entry rather than evaluating its contract dependencies.
jest.mock("../../../../packages/ssri-ckboost/dist/logging/index.js", () => ({createScopedLogger: () => ({warn: jest.fn()})}));

const approved = `0x${"a1".repeat(32)}`;
const other = `0x${"b2".repeat(32)}`;
const display = (typeId: string): CampaignDisplay => ({
  typeId, startDate: "2026-01-01T00:00:00Z", endDate: "2026-12-31T00:00:00Z",
}) as CampaignDisplay;

function mockDiscovery(overrides: Record<string, unknown> = {}) {
  const state = {
    protocolData: {campaigns_approved: [approved]}, protocolCell: {},
    endorserResolver: {}, campaignCells: [{outputData: "0x01"}],
    protocolLoading: false, campaignLoading: false, protocolError: null,
    campaignError: null, pendingCount: 0,
    retry: jest.fn().mockResolvedValue(undefined), refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useDiscovery>;
  jest.mocked(useDiscovery).mockReturnValue(state);
  return state;
}

// Preserve the current discovery snapshot while changing one loading/error facet.
function mockProtocol(overrides: Record<string, unknown> = {}) {
  const current = jest.mocked(useDiscovery).getMockImplementation()?.();
  const {isLoading, error, ...rest} = overrides;
  return mockDiscovery({...current, ...rest,
    ...(isLoading !== undefined ? {protocolLoading: isLoading} : {}),
    ...(error !== undefined ? {protocolError: error} : {}),
  });
}
function mockCampaigns(overrides: Record<string, unknown> = {}) {
  const current = jest.mocked(useDiscovery).getMockImplementation()?.();
  const {campaigns, isLoading, error, ...rest} = overrides;
  return mockDiscovery({...current, ...rest,
    ...(campaigns !== undefined ? {campaignCells: campaigns} : {}),
    ...(isLoading !== undefined ? {campaignLoading: isLoading,
      pendingCount: isLoading ? (current?.protocolData?.campaigns_approved.length ?? 1) : 0} : {}),
    ...(error !== undefined ? {campaignError: error} : {}),
  });
}

describe("homepage discovery boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscovery();
    jest.mocked(cellToCampaignDisplay).mockReturnValue(display(approved));
    jest.mocked(buildCampaignRewards).mockReturnValue([]);
  });

  it("does not decode or expose cached campaigns while the protocol is unavailable", () => {
    mockProtocol({protocolData: null, protocolCell: null, isLoading: true});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(cellToCampaignDisplay).not.toHaveBeenCalled();
  });

  it("shows a real empty state for an approved protocol with no approved campaigns", () => {
    mockProtocol({protocolData: {campaigns_approved: []}});
    mockCampaigns({campaigns: []});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.missingCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it("treats missing protocol state as an error after loading settles instead of a public empty list", () => {
    mockProtocol({protocolCell: null, isLoading: false});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
  });

  it("keeps the loading grid while approved cells are still being fetched", () => {
    mockCampaigns({campaigns: [], isLoading: true});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.missingCount).toBe(0);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.hasError).toBe(false);
  });

  it("rechecks approval when protocol data changes while campaign cells are still cached", () => {
    mockCampaigns({campaigns: [{outputData: "0x01"}, {outputData: "0x02"}]});
    jest.mocked(cellToCampaignDisplay).mockImplementation(cell => display(cell.outputData === "0x01" ? approved : other));
    const {result, rerender} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns.map(item => item.typeId)).toEqual([approved]);
    mockProtocol({protocolData: {campaigns_approved: [other]}});
    rerender();
    expect(result.current.campaigns.map(item => item.typeId)).toEqual([other]);
  });

  it("distinguishes a campaign fetch failure from an intentionally empty allowlist", () => {
    mockCampaigns({campaigns: []});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.missingCount).toBe(1);
    expect(result.current.hasError).toBe(true);
  });

  it("waits for the campaign fetch before treating approved IDs as missing", () => {
    mockCampaigns({campaigns: [], isLoading: true});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
  });

  it("keeps valid partial results, but reports an error when every approved campaign is unavailable", () => {
    mockProtocol({protocolData: {campaigns_approved: [approved, other]}});
    const {result, rerender} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns.map(item => item.typeId)).toEqual([approved]);
    expect(result.current.missingCount).toBe(1);
    expect(result.current.hasError).toBe(false);
    mockCampaigns({campaigns: []});
    rerender();
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.missingCount).toBe(2);
    expect(result.current.hasError).toBe(true);
  });

  it("removes revoked cached cells after the protocol snapshot changes", () => {
    const {result, rerender} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toHaveLength(1);
    mockProtocol({protocolData: {campaigns_approved: []}});
    rerender();
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.hasError).toBe(false);
  });

  it("quarantines an unreadable schedule without dropping another valid approved campaign", () => {
    mockProtocol({protocolData: {campaigns_approved: [approved, other]}});
    mockCampaigns({campaigns: [{outputData: "0xffff"}, {outputData: "0x01"}]});
    jest.mocked(cellToCampaignDisplay)
      .mockReturnValueOnce({...display(other), endDate: "not-a-date"})
      .mockReturnValueOnce(display(approved));
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns.map(item => item.typeId)).toEqual([approved]);
    expect(result.current.missingCount).toBe(1);
    expect(result.current.hasError).toBe(false);
  });

  it("quarantines malformed reward data and gives the user a retryable error", () => {
    jest.mocked(buildCampaignRewards).mockImplementationOnce(() => {throw new RangeError("Bad amount");});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.missingCount).toBe(1);
    expect(result.current.hasError).toBe(true);
  });

  it("retries the existing campaign provider when the protocol is ready", async () => {
    const state = mockCampaigns({campaigns: []});
    const {result} = renderHook(() => useHomeCampaigns());
    await act(async () => result.current.retry());
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
});


describe("progressive discovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(cellToCampaignDisplay).mockReturnValue(display(approved));
    jest.mocked(buildCampaignRewards).mockReturnValue([]);
  });
  it("renders loaded cards while other approved cells are pending", () => {
    mockDiscovery({protocolData: {campaigns_approved: [approved, other]}, campaignLoading: true, pendingCount: 1});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current.campaigns).toHaveLength(1);
    expect(result.current).toMatchObject({isLoading: false, pendingCount: 1, missingCount: 0, hasError: false});
  });
  it("excludes pending lookups from the failure count while retaining valid cards", () => {
    mockDiscovery({protocolData: {campaigns_approved: [approved, other, `0x${"c3".repeat(32)}`]}, campaignLoading: true,
      pendingCount: 1, campaignError: new Error("One failed")});
    const {result} = renderHook(() => useHomeCampaigns());
    expect(result.current).toMatchObject({isLoading: false, pendingCount: 1, missingCount: 1, hasError: false});
  });
  it("does not leak a rejected retry promise into an event handler", async () => {
    const state = mockDiscovery({retry: jest.fn().mockRejectedValue(new Error("RPC still unavailable"))});
    const {result} = renderHook(() => useHomeCampaigns());
    await expect(result.current.retry()).resolves.toBeUndefined();
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
});
