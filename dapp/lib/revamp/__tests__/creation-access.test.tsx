import { act, renderHook, waitFor } from "@testing-library/react";
import { readCreationAuthorization, type CreationAuthorizationSnapshot } from "../creation-authorization";
import { CREATION_ACCESS_TIMEOUT_MS, useCreationAuthorization } from "../creation-access";
const mockSignerA={},mockSignerB={};let mockSigner:object|undefined=mockSignerA;
const mockClient={};
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{useSigner:()=>mockSigner,useCcc:()=>({client:mockClient})}}));
jest.mock("../creation-authorization",()=>({readCreationAuthorization:jest.fn()}));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
const snapshot=(hash:string)=>({lockHash:hash,capabilities:{canCreateCampaign:true}}) as unknown as CreationAuthorizationSnapshot;
describe("fresh creation access lifecycle",()=>{
  beforeEach(()=>{jest.mocked(readCreationAuthorization).mockReset();mockSigner=mockSignerA;});
  afterEach(()=>jest.useRealTimers());
  it("never exposes an old wallet's late authority snapshot after switching signers",async()=>{
    const old=deferred<CreationAuthorizationSnapshot>(),next=deferred<CreationAuthorizationSnapshot>();
    jest.mocked(readCreationAuthorization).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view=renderHook(()=>useCreationAuthorization());mockSigner=mockSignerB;view.rerender();
    expect(view.result.current.snapshot).toBeUndefined();
    await act(async()=>{old.resolve(snapshot("old-wallet"));await Promise.resolve();});
    expect(view.result.current.snapshot).toBeUndefined();
    await act(async()=>{next.resolve(snapshot("new-wallet"));await Promise.resolve();});
    expect(view.result.current.snapshot?.lockHash).toBe("new-wallet");
  });
  it("hides the previous snapshot while an explicit fresh check is pending or disconnected",async()=>{
    const next=deferred<CreationAuthorizationSnapshot>();jest.mocked(readCreationAuthorization).mockResolvedValueOnce(snapshot("current")).mockReturnValueOnce(next.promise);
    const view=renderHook(({attempt})=>useCreationAuthorization(undefined,attempt),{initialProps:{attempt:0}});
    await waitFor(()=>expect(view.result.current.snapshot?.lockHash).toBe("current"));
    view.rerender({attempt:1});expect(view.result.current.snapshot).toBeUndefined();expect(view.result.current.loading).toBe(true);
    mockSigner=undefined;view.rerender({attempt:1});expect(view.result.current.snapshot).toBeUndefined();expect(view.result.current.loading).toBe(false);
    await act(async()=>{next.resolve(snapshot("stale"));await Promise.resolve();});expect(view.result.current.snapshot).toBeUndefined();
  });
  it("ends a hung check at the deadline, invalidates cooperative reads and lets retry win over a late result",async()=>{
    jest.useFakeTimers();const old=deferred<CreationAuthorizationSnapshot>();
    jest.mocked(readCreationAuthorization).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot("retried"));
    const view=renderHook(({attempt})=>useCreationAuthorization(undefined,attempt),{initialProps:{attempt:0}});
    const oldGuard=jest.mocked(readCreationAuthorization).mock.calls[0][2]!;expect(oldGuard()).toBe(true);
    await act(async()=>{jest.advanceTimersByTime(CREATION_ACCESS_TIMEOUT_MS);await Promise.resolve();});
    expect(view.result.current.loading).toBe(false);expect(view.result.current.error).toMatch(/timed out.*Retry/);expect(oldGuard()).toBe(false);
    await act(async()=>{view.rerender({attempt:1});await Promise.resolve();});
    expect(view.result.current.snapshot?.lockHash).toBe("retried");
    await act(async()=>{old.resolve(snapshot("expired"));await Promise.resolve();});
    expect(view.result.current.snapshot?.lockHash).toBe("retried");expect(view.result.current.error).toBeUndefined();
  });
});
