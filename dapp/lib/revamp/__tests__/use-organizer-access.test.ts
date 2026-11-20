import { act, renderHook, waitFor } from "@testing-library/react";
import { ccc } from "@ckb-ccc/connector-react";
import { useDiscovery } from "../discovery-provider";
import { useOrganizerAccess } from "../use-organizer-access";

jest.mock("@ckb-ccc/connector-react", () => ({ccc: {
  useSigner: jest.fn(), hexFrom: (value: string) => value,
}}));
jest.mock("../discovery-provider", () => ({useDiscovery: jest.fn()}));

const admin = `0x${"a1".repeat(32)}`;
const visitor = `0x${"b2".repeat(32)}`;
type Signer = NonNullable<ReturnType<typeof ccc.useSigner>>;
type Address = {script: {hash: () => string}};
const address = (hash: string): Address => ({script: {hash: () => hash}});

function deferredAddress() {
  let resolve!: (value: Address) => void;
  const promise = new Promise<Address>(complete => {resolve = complete;});
  return {promise, resolve};
}

function signer(result: Promise<Address>): Signer {
  return {getRecommendedAddressObj: jest.fn().mockReturnValue(result)} as unknown as Signer;
}

function protocol(admins: string[] = [admin], isLoading = false,organizers:string[] = []) {
  const state = {
    protocolData: {protocol_config: {admin_lock_hash_vec: admins},endorsers_whitelist:organizers.map(endorser_lock_hash=>({endorser_lock_hash})),campaigns_approved:[]},
    endorserResolver: {has: () => true}, protocolLoading: isLoading,
  } as unknown as ReturnType<typeof useDiscovery>;
  jest.mocked(useDiscovery).mockReturnValue(state);
  return state;
}

describe("homepage creation access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    protocol();
    jest.mocked(ccc.useSigner).mockReturnValue(undefined);
  });

  it("denies disconnected users and requires a resolved current admin address", async () => {
    const {result, rerender} = renderHook(() => useOrganizerAccess());
    expect(result.current).toBe(false);
    const pending = deferredAddress();
    jest.mocked(ccc.useSigner).mockReturnValue(signer(pending.promise));
    rerender();
    expect(result.current).toBe(false);
    await act(async () => pending.resolve(address(admin.toUpperCase())));
    expect(result.current).toBe(true);
  });

  it("grants a currently whitelisted Organizer and ignores unrelated resolver display claims", async () => {
    const current = signer(Promise.resolve(address(visitor)));
    jest.mocked(ccc.useSigner).mockReturnValue(current);
    const {result,rerender} = renderHook(() => useOrganizerAccess());
    await waitFor(() => expect(current.getRecommendedAddressObj).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBe(false);
    protocol([],false,[visitor.toUpperCase()]);
    rerender();
    await waitFor(()=>expect(result.current).toBe(true));
    protocol([]);
    rerender();
    expect(result.current).toBe(false);
    await act(async()=>{});
  });

  it("hides an old account's grant immediately while the new account is unresolved", async () => {
    jest.mocked(ccc.useSigner).mockReturnValue(signer(Promise.resolve(address(admin))));
    const {result, rerender} = renderHook(() => useOrganizerAccess());
    await waitFor(() => expect(result.current).toBe(true));
    const next = deferredAddress();
    jest.mocked(ccc.useSigner).mockReturnValue(signer(next.promise));
    rerender();
    expect(result.current).toBe(false);
    await act(async () => next.resolve(address(visitor)));
    expect(result.current).toBe(false);
  });

  it("ignores a previous account's admin result when its promise resolves late", async () => {
    const old = deferredAddress();
    const current = deferredAddress();
    jest.mocked(ccc.useSigner).mockReturnValue(signer(old.promise));
    const {result, rerender} = renderHook(() => useOrganizerAccess());
    jest.mocked(ccc.useSigner).mockReturnValue(signer(current.promise));
    rerender();
    await act(async () => current.resolve(address(visitor)));
    await act(async () => old.resolve(address(admin)));
    expect(result.current).toBe(false);
  });

  it("invalidates an old grant on disconnect and on a changed protocol allowlist", async () => {
    const current = signer(Promise.resolve(address(admin)));
    jest.mocked(ccc.useSigner).mockReturnValue(current);
    const {result, rerender} = renderHook(() => useOrganizerAccess());
    await waitFor(() => expect(result.current).toBe(true));
    protocol([]);
    rerender();
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(false);
    protocol();
    rerender();
    await waitFor(() => expect(result.current).toBe(true));
    jest.mocked(ccc.useSigner).mockReturnValue(undefined);
    rerender();
    expect(result.current).toBe(false);
  });

  it("fails closed during protocol loading and after address resolution fails", async () => {
    const state = protocol();
    const current = signer(Promise.resolve(address(admin)));
    jest.mocked(ccc.useSigner).mockReturnValue(current);
    const {result, rerender} = renderHook(() => useOrganizerAccess());
    await waitFor(() => expect(result.current).toBe(true));
    jest.mocked(useDiscovery).mockReturnValue({...state, protocolLoading: true});
    rerender();
    expect(result.current).toBe(false);
    let rejectAddress!: (error: Error) => void;
    const failure = new Promise<Address>((_, reject) => {rejectAddress = reject;});
    jest.mocked(ccc.useSigner).mockReturnValue(signer(failure));
    jest.mocked(useDiscovery).mockReturnValue({...state, protocolLoading: false});
    rerender();
    await act(async () => rejectAddress(new Error("Wallet unavailable")));
    expect(result.current).toBe(false);
  });
});
