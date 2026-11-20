import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";
import { readHeaderPointsBalance, useHeaderAccount, type HeaderAccountScope } from "../use-header-account";

jest.mock("@ckb-ccc/connector-react", () => ({ccc: {
  useSigner: jest.fn(), useCcc: jest.fn(), hexFrom: (value: string) => value,
  bytesFrom: (value: string) => Uint8Array.from(Buffer.from(value.slice(2), "hex")),
  numLeFromBytes: (bytes: Uint8Array) => Array.from(bytes).reduceRight((sum, byte) => sum * 256n + BigInt(byte), 0n),
}}));
jest.mock("ssri-ckboost/types", () => ({ProtocolData: {decode: (raw: string) => JSON.parse(raw)}}));

const hash = (letter: string) => `0x${letter.repeat(64)}` as ccc.Hex;
const protocolHash = hash("a"), pointsCodeHash = hash("b"), ownerA = hash("c"), ownerB = hash("d");
const clients: QueryClient[] = [];
type Signer = NonNullable<ReturnType<typeof ccc.useSigner>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => {resolve = complete;});
  return {promise, resolve};
}
function wallet(lockHash = ownerA, name = "walletaaaa") {
  const address = {script: {hash: () => lockHash}, toString: () => `ckt1${name}`};
  const signer = {getRecommendedAddressObj: jest.fn(async () => address)} as unknown as Signer;
  return {signer, address};
}
function protocol(hashValue = protocolHash): ccc.Cell {
  return {cellOutput: {type: {hash: () => hashValue}}, outputData: JSON.stringify({protocol_config: {script_code_hashes: {ckb_boost_points_udt_type_code_hash: pointsCodeHash}}})} as unknown as ccc.Cell;
}
function points(value: bigint, lockHash = ownerA, protocolValue = protocolHash): ccc.Cell {
  const bytes = value.toString(16).padStart(32, "0").match(/../g)!.reverse().join("");
  return {cellOutput: {lock: {hash: () => lockHash}, type: {codeHash: pointsCodeHash, hashType: "type", args: protocolValue}}, outputData: `0x${bytes}`} as unknown as ccc.Cell;
}
function client(cells: readonly ccc.Cell[] = []) {
  return {findCells: jest.fn(async function* () {for (const cell of cells) yield cell;})} as unknown as ccc.Client;
}
function connected(signer: Signer | undefined, rpc: ccc.Client) {
  jest.mocked(ccc.useSigner).mockReturnValue(signer);
  jest.mocked(ccc.useCcc).mockReturnValue({client: rpc} as ReturnType<typeof ccc.useCcc>);
}
function mount(scope: HeaderAccountScope = {protocolCell: protocol()}) {
  const queries = new QueryClient({defaultOptions: {queries: {retry: false}}});
  clients.push(queries);
  return renderHook(input => useHeaderAccount(input), {initialProps: scope, wrapper: ({children}: {children: ReactNode}) => <QueryClientProvider client={queries}>{children}</QueryClientProvider>});
}
beforeEach(() => {jest.clearAllMocks();jest.spyOn(ProtocolData,"decode").mockImplementation(raw=>JSON.parse(String(raw)));});
afterEach(() => {clients.splice(0).forEach(query => query.clear());});

describe("lean header account", () => {
  it("does not query Points while disconnected or while protocol loading; a completed empty lookup is a real zero", async () => {
    const rpc = client(); connected(undefined, rpc);
    const {result, rerender} = mount();
    expect(result.current).toMatchObject({address: null, points: null, pointsStatus: "disconnected"});
    expect(rpc.findCells).not.toHaveBeenCalled();
    connected(wallet().signer, rpc);
    rerender({protocolCell: protocol(), protocolLoading: true});
    await waitFor(() => expect(result.current.address).toBe("ckt1walletaaaa"));
    expect(rpc.findCells).not.toHaveBeenCalled();
    const cell = protocol(); rerender({protocolCell: cell});
    await waitFor(() => expect(result.current.pointsStatus).toBe("ready"));
    expect(result.current.points).toBe(0n);
    expect(result.current.displayAddress).toBe("ckt1...aaaa");
    expect(rpc.findCells).toHaveBeenCalledWith(expect.objectContaining({script: {codeHash: pointsCodeHash, hashType: "type", args: protocolHash}, scriptType: "type", scriptSearchMode: "exact", filter: {script: expect.any(Object)}}));
  });

  it("clears a previous wallet immediately and ignores its late balance result", async () => {
    const oldBalance = deferred<void>(), first = wallet(), second = wallet(ownerB, "walletbbbb");
    const rpc = client();
    jest.mocked(rpc.findCells).mockImplementation((search: unknown) => (async function* () {
      const lock = (search as {filter: {script: {hash: () => string}}}).filter.script.hash();
      if (lock === ownerA) {await oldBalance.promise; yield points(100n);} else yield points(7n, ownerB);
    })());
    connected(first.signer, rpc);
    const {result, rerender} = mount();
    await waitFor(() => expect(rpc.findCells).toHaveBeenCalled());
    connected(second.signer, rpc); rerender({protocolCell: protocol()});
    expect(result.current.address).toBeNull(); expect(result.current.points).toBeNull();
    await waitFor(() => expect(result.current.points).toBe(7n));
    await act(async () => oldBalance.resolve());
    expect(result.current.address).toBe("ckt1walletbbbb"); expect(result.current.points).toBe(7n);
    connected(undefined, rpc); rerender({protocolCell: protocol()});
    expect(result.current).toMatchObject({isConnected: false, address: null, lockHash: null, points: null});
  });

  it("does not resurrect a previous wallet's late address resolution", async () => {
    const old = deferred<ReturnType<typeof wallet>["address"]>(), currentWallet = wallet(ownerB, "walletbbbb"), rpc = client([points(9n, ownerB)]);
    const oldSigner = {getRecommendedAddressObj: jest.fn(() => old.promise)} as unknown as Signer;
    connected(oldSigner, rpc); const {result, rerender} = mount();
    connected(currentWallet.signer, rpc); rerender({protocolCell: protocol()});
    await waitFor(() => expect(result.current.points).toBe(9n));
    await act(async () => old.resolve(wallet().address));
    expect(result.current.address).toBe("ckt1walletbbbb"); expect(result.current.points).toBe(9n);
  });

  it("scopes cached results by protocol and client instead of showing the preceding network balance", async () => {
    const account = wallet(), changedProtocol = hash("e"), gate = deferred<void>();
    const rpc = client([points(10n)]); connected(account.signer, rpc);
    const {result, rerender} = mount(); await waitFor(() => expect(result.current.points).toBe(10n));
    jest.mocked(rpc.findCells).mockImplementation(() => (async function* () {await gate.promise; yield points(20n, ownerA, changedProtocol);})());
    rerender({protocolCell: protocol(changedProtocol)}); expect(result.current.points).toBeNull();
    await act(async () => gate.resolve()); await waitFor(() => expect(result.current.points).toBe(20n));
    const nextClient = client([points(30n, ownerA, changedProtocol)]); connected(account.signer, nextClient);
    rerender({protocolCell: protocol(changedProtocol)}); expect(result.current.points).toBeNull();
    await waitFor(() => expect(result.current.points).toBe(30n));
  });

  it("returns unknown on an RPC failure and can refresh without fabricating zero", async () => {
    const rpc = client(), account = wallet();
    jest.mocked(rpc.findCells).mockImplementation(() => (async function* () {throw new Error("RPC unavailable");})());
    connected(account.signer, rpc); const {result} = mount();
    await waitFor(() => expect(result.current.pointsStatus).toBe("error"));
    expect(result.current.points).toBeNull(); expect(result.current.address).toBe("ckt1walletaaaa");
    jest.mocked(rpc.findCells).mockImplementation(() => (async function* () {yield points(2n);})());
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.points).toBe(2n));
  });

  it("does not query when the wallet or authoritative protocol data is unavailable", async () => {
    const rpc = client(), broken = {getRecommendedAddressObj: jest.fn(async () => {throw new Error("Wallet unavailable");})} as unknown as Signer;
    connected(broken, rpc); const unavailable = mount();
    await waitFor(() => expect(unavailable.result.current.pointsStatus).toBe("error"));
    expect(unavailable.result.current.points).toBeNull(); expect(rpc.findCells).not.toHaveBeenCalled();
    unavailable.unmount(); connected(wallet().signer, rpc);
    const noProtocol = mount({protocolCell: null});
    await waitFor(() => expect(noProtocol.result.current.pointsStatus).toBe("unavailable"));
    expect(noProtocol.result.current.points).toBeNull(); expect(rpc.findCells).not.toHaveBeenCalled();
  });
});

describe("targeted Points live-cell read", () => {
  it("adds Uint128 balances exactly and excludes another wallet/protocol/token", async () => {
    const large = 2n ** 90n;
    const wrongToken = points(9n); wrongToken.cellOutput.type!.codeHash = hash("f");
    const rpc = client([points(large), points(11n), points(9n, ownerB), points(9n, ownerA, hash("e")), wrongToken]);
    expect(await readHeaderPointsBalance(rpc, wallet().address.script as ccc.Script, protocolHash, pointsCodeHash)).toBe(large + 11n);
  });
  it("rejects a malformed matching token amount instead of returning zero", async () => {
    const broken = points(1n); broken.outputData = "0x01";
    await expect(readHeaderPointsBalance(client([broken]), wallet().address.script as ccc.Script, protocolHash, pointsCodeHash)).rejects.toThrow("could not be read");
  });
});
