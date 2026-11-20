import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";
import { getDiscoveryReadClient } from "../discovery-read-client";
import { readDiscoveryCampaignBatch, readDiscoveryCampaignExact, readDiscoveryProtocol } from "../discovery-cells";
import { DiscoveryProvider, useDiscovery } from "../discovery-provider";
import { DiscoveryTimeoutError } from "../discovery-loader";

jest.mock("@ckb-ccc/connector-react", () => ({ccc: { useCcc: jest.fn(), hexFrom: (value: string) => value }}));
// next/jest resolves the workspace SDK alias to its built entry.
jest.mock("../../../../packages/ssri-ckboost/dist/generated/index.js", () => ({ProtocolData: {decode: jest.fn()}}));
jest.mock("../discovery-read-client", () => ({getDiscoveryReadClient: jest.fn()}));
jest.mock("../discovery-cells", () => ({readDiscoveryProtocol: jest.fn(), readDiscoveryCampaignBatch: jest.fn(), readDiscoveryCampaignExact: jest.fn()}));
jest.mock("@/lib/ckb/current-deployment", () => ({
  currentDeployment: {getCurrentNetwork: () => "testnet"},
  getCurrentProtocolTypeScript: () => ({codeHash: "0xprotocol", hashType: "type", args: "0xargs"}),
}));
jest.mock("@/lib/utils/endorser-resolver", () => ({createEndorserResolver: () => ({has: () => false, resolve: () => undefined, list: () => []})}));

const rpcClient = {};
const protocolCell = (version = "v1") => ({outPoint: {txHash: version, index: 0n}, outputData: version, cellOutput: {type: {hash: () => `0x${"f".repeat(64)}`}}}) as unknown as ccc.Cell;
const campaignCell = (id: string) => ({outPoint: {txHash: id, index: 0n}}) as unknown as ccc.Cell;
// Only decoded fields consumed by this context are relevant to these fixtures.
const data = (ids: string[]) => ({ campaigns_approved: ids, endorsers_whitelist: [], protocol_config: {script_code_hashes: {ckb_boost_campaign_type_code_hash: "0xcampaign"}} }) as unknown as ReturnType<typeof ProtocolData.decode>;

function Probe({id = "state"}: {id?: string}) {
  const discovery = useDiscovery();
  return <>
    <pre data-testid={id}>{JSON.stringify({
      cells: discovery.campaignCells.map(cell => cell.outPoint.txHash),
      pending: discovery.pendingCount,
      loading: discovery.protocolLoading || discovery.campaignLoading,
      protocolError: Boolean(discovery.protocolError),
      campaignError: Boolean(discovery.campaignError),
    })}</pre>
    <button onClick={() => void discovery.refresh().catch(() => undefined)}>Refresh {id}</button>
    <button onClick={() => void discovery.retry().catch(() => undefined)}>Retry {id}</button>
  </>;
}

const snapshot = (id = "state") => JSON.parse(screen.getByTestId(id).textContent!);
function tree(queryClient: QueryClient, twice = false) {
  return <QueryClientProvider client={queryClient}>
    <DiscoveryProvider><Probe /></DiscoveryProvider>
    {twice && <DiscoveryProvider><Probe id="second" /></DiscoveryProvider>}
  </QueryClientProvider>;
}

describe("lean discovery provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ccc.useCcc).mockReturnValue({client: rpcClient} as ReturnType<typeof ccc.useCcc>);
    jest.mocked(getDiscoveryReadClient).mockReturnValue(rpcClient as ccc.Client);
    jest.mocked(readDiscoveryProtocol).mockResolvedValue(protocolCell());
    jest.mocked(readDiscoveryCampaignBatch).mockResolvedValue(undefined);
    jest.mocked(ProtocolData.decode).mockReturnValue(data(["0xaa", "0xbb"]) as ReturnType<typeof ProtocolData.decode>);
    jest.mocked(readDiscoveryCampaignExact).mockImplementation(async (_client, _scope, id) => campaignCell(id));
  });

  it("shares one protocol read and campaign queries across consumers and a warm remount", async () => {
    const queryClient = new QueryClient();
    const view = render(tree(queryClient, true));
    await waitFor(() => expect(snapshot().cells).toEqual(["0xaa", "0xbb"]));
    expect(snapshot("second").cells).toEqual(["0xaa", "0xbb"]);
    expect(readDiscoveryProtocol).toHaveBeenCalledTimes(1);
    expect(readDiscoveryCampaignExact).toHaveBeenCalledTimes(2);
    expect(ccc.useCcc).not.toHaveBeenCalled();
    view.unmount();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().loading).toBe(false));
    expect(readDiscoveryProtocol).toHaveBeenCalledTimes(1);
    expect(readDiscoveryCampaignExact).toHaveBeenCalledTimes(2);
    queryClient.clear();
  });

  it("uses one supported batch for sixteen approved cells with no per-card exact RPC", async () => {
    const ids = Array.from({length: 16}, (_, index) => `approved-${index}`);
    jest.mocked(ProtocolData.decode).mockReturnValue(data(ids));
    jest.mocked(readDiscoveryCampaignBatch).mockImplementation(async ({ids, onRecord}) => {ids.forEach(id => onRecord({id, cell: campaignCell(id)}));});
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(16));
    expect(readDiscoveryProtocol).toHaveBeenCalledTimes(1);
    expect(readDiscoveryCampaignBatch).toHaveBeenCalledTimes(1);
    expect(readDiscoveryCampaignExact).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it("reuses fresh individual cells when only the protocol outpoint changes", async () => {
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(2));
    jest.mocked(readDiscoveryProtocol).mockResolvedValue(protocolCell("v2"));
    fireEvent.click(screen.getByRole("button", {name: "Refresh state"}));
    await waitFor(() => expect(queryClient.getQueryCache().findAll({queryKey: ["revamp-discovery", "campaigns"]}).some(query => query.queryKey.includes("v2:0") && query.state.status === "success" && query.state.fetchStatus === "idle")).toBe(true));
    expect(snapshot().cells).toEqual(["0xaa", "0xbb"]);
    expect(readDiscoveryProtocol).toHaveBeenCalledTimes(2);
    expect(readDiscoveryCampaignBatch).toHaveBeenCalledTimes(1);
    expect(readDiscoveryCampaignExact).toHaveBeenCalledTimes(2);
    queryClient.clear();
  });

  it("keeps stale cached cards visible throughout a remount refresh", async () => {
    const queryClient = new QueryClient();
    const view = render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(2));
    view.unmount();
    for (const query of queryClient.getQueryCache().getAll()) query.setState({dataUpdatedAt: Date.now() - 61_000});
    let finish!: () => void;
    jest.mocked(readDiscoveryCampaignBatch).mockImplementation(({ids, onRecord}) => new Promise(resolve => {
      finish = () => {ids.forEach(id => onRecord({id, cell: campaignCell(`${id}-updated`)})); resolve();};
    }));
    render(tree(queryClient));
    await waitFor(() => expect(readDiscoveryCampaignBatch).toHaveBeenCalledTimes(2));
    expect(snapshot().cells).toEqual(["0xaa", "0xbb"]);
    expect(snapshot().pending).toBe(0);
    finish();
    await waitFor(() => expect(snapshot().cells).toEqual(["0xaa-updated", "0xbb-updated"]));
    queryClient.clear();
  });

  it("reuses fresh individual cells after an unrelated protocol update without retaining a removed approval", async () => {
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(2));
    jest.mocked(readDiscoveryProtocol).mockResolvedValue(protocolCell("v2"));
    jest.mocked(ProtocolData.decode).mockReturnValue(data(["0xaa"]));
    fireEvent.click(screen.getByRole("button", {name: "Refresh state"}));
    await waitFor(() => expect(snapshot().cells).toEqual(["0xaa"]));
    expect(readDiscoveryCampaignExact).toHaveBeenCalledTimes(2);
    expect(readDiscoveryCampaignBatch).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  it("keeps stale cached cards visible while a remount refresh is still waiting", async () => {
    const queryClient = new QueryClient();
    const view = render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(2));
    view.unmount();
    queryClient.getQueryCache().getAll().forEach(query => {
      if (query.queryKey[1] === "campaign" || query.queryKey[1] === "campaigns") query.setState({dataUpdatedAt: 1});
    });
    let finish!: () => void;
    jest.mocked(readDiscoveryCampaignBatch).mockImplementation(({ids, onRecord}) => new Promise(resolve => {
      finish = () => {ids.forEach(id => onRecord({id, cell: campaignCell(`${id}-new`)})); resolve();};
    }));
    render(tree(queryClient));
    await waitFor(() => expect(readDiscoveryCampaignBatch).toHaveBeenCalledTimes(2));
    expect(snapshot()).toMatchObject({cells: ["0xaa", "0xbb"], pending: 0});
    finish();
    await waitFor(() => expect(snapshot().cells).toEqual(["0xaa-new", "0xbb-new"]));
    queryClient.clear();
  });

  it("publishes fast approved campaigns while another campaign is still pending", async () => {
    let finish!: (cell: ccc.Cell) => void;
    jest.mocked(readDiscoveryCampaignExact).mockImplementation((_client, _scope, id) => id === "0xbb"
      ? new Promise(resolve => {finish = resolve;}) : Promise.resolve(campaignCell(id)));
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toEqual(["0xaa"]));
    expect(snapshot()).toMatchObject({pending: 1, loading: true, campaignError: false});
    finish(campaignCell("0xbb"));
    await waitFor(() => expect(snapshot()).toMatchObject({cells: ["0xaa", "0xbb"], pending: 0, loading: false}));
    queryClient.clear();
  });

  it("drops removed approved IDs immediately when a new protocol outpoint arrives", async () => {
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(2));
    let finish!: (cell: ccc.Cell) => void;
    jest.mocked(readDiscoveryProtocol).mockResolvedValue(protocolCell("v2"));
    jest.mocked(ProtocolData.decode).mockReturnValue(data(["0xcc"]) as ReturnType<typeof ProtocolData.decode>);
    jest.mocked(readDiscoveryCampaignExact).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    fireEvent.click(screen.getByRole("button", {name: "Refresh state"}));
    await waitFor(() => expect(readDiscoveryCampaignExact).toHaveBeenLastCalledWith(rpcClient, expect.objectContaining({campaignCodeHash: "0xcampaign"}), "0xcc", expect.any(AbortSignal)));
    expect(snapshot().cells).toEqual([]);
    finish(campaignCell("0xcc"));
    await waitFor(() => expect(snapshot().cells).toEqual(["0xcc"]));
    queryClient.clear();
  });

  it("retries missing IDs without rereading successful fresh campaign cells", async () => {
    let missing = true;
    jest.mocked(readDiscoveryCampaignExact).mockImplementation(async (_client, _scope, id) =>
      id === "0xbb" && missing ? undefined : campaignCell(id));
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot()).toMatchObject({cells: ["0xaa"], pending: 0, campaignError: true}));
    missing = false;
    fireEvent.click(screen.getByRole("button", {name: "Retry state"}));
    await waitFor(() => expect(snapshot()).toMatchObject({cells: ["0xaa", "0xbb"], campaignError: false}));
    expect(readDiscoveryProtocol).toHaveBeenCalledTimes(1);
    expect(jest.mocked(readDiscoveryCampaignExact).mock.calls.filter(([_client, _scope, id]) => id === "0xaa")).toHaveLength(1);
    expect(jest.mocked(readDiscoveryCampaignExact).mock.calls.filter(([_client, _scope, id]) => id === "0xbb")).toHaveLength(2);
    queryClient.clear();
  });

  it("refreshes campaign data on request even when approval membership is unchanged", async () => {
    const queryClient = new QueryClient();
    render(tree(queryClient));
    await waitFor(() => expect(snapshot().cells).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", {name: "Refresh state"}));
    await waitFor(() => expect(readDiscoveryCampaignExact).toHaveBeenCalledTimes(4));
    expect(readDiscoveryProtocol).toHaveBeenCalledTimes(2);
    queryClient.clear();
  });

  it("distinguishes a legitimate empty list, a partial failure and a protocol timeout", async () => {
    jest.mocked(ProtocolData.decode).mockReturnValue(data([]) as ReturnType<typeof ProtocolData.decode>);
    const emptyClient = new QueryClient();
    const empty = render(tree(emptyClient));
    await waitFor(() => expect(snapshot().loading).toBe(false));
    expect(snapshot()).toMatchObject({cells: [], pending: 0, protocolError: false, campaignError: false});
    expect(readDiscoveryCampaignExact).not.toHaveBeenCalled();
    empty.unmount(); emptyClient.clear();

    jest.mocked(ProtocolData.decode).mockReturnValue(data(["0xaa", "0xbb"]) as ReturnType<typeof ProtocolData.decode>);
    jest.mocked(readDiscoveryCampaignExact).mockImplementation(async (_client, _scope, id) => id === "0xaa" ? campaignCell(id) : undefined);
    const partialClient = new QueryClient();
    const partial = render(tree(partialClient));
    await waitFor(() => expect(snapshot()).toMatchObject({cells: ["0xaa"], pending: 0, campaignError: true}));
    expect(snapshot().protocolError).toBe(false);
    partial.unmount(); partialClient.clear();

    jest.mocked(readDiscoveryProtocol).mockRejectedValue(new DiscoveryTimeoutError());
    const failedClient = new QueryClient();
    render(tree(failedClient));
    await waitFor(() => expect(snapshot()).toMatchObject({loading: false, protocolError: true, campaignError: false}));
    failedClient.clear();
  });
});
