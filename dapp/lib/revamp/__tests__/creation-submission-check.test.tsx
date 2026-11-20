import { act, renderHook, waitFor } from "@testing-library/react";
import type { CreationAuthorizationSnapshot } from "../creation-authorization";
import { createCreationCampaignService } from "../creation-service";
import { CREATION_SUBMISSION_CHECK_TIMEOUT_MS, useCreationSubmissionCheck } from "../creation-submission-check";
jest.mock("../creation-service",()=>({createCreationCampaignService:jest.fn()}));
const scan=jest.fn();
const snapshot={signer:{},protocolCell:{},protocolData:{}} as unknown as CreationAuthorizationSnapshot;
const id=`0x${"ab".repeat(32)}`;
const result={submissions:new Map(),campaignData:{quests:[]}};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
describe("fresh creation submission checks",()=>{
  beforeEach(()=>{jest.clearAllMocks();scan.mockReset();jest.mocked(createCreationCampaignService).mockImplementation(()=>({fetchCampaignSubmissions:scan}) as unknown as ReturnType<typeof createCreationCampaignService>);});
  afterEach(()=>jest.useRealTimers());
  it("uses the successful fresh snapshot directly without waiting on a global provider",async()=>{
    scan.mockResolvedValue(result);
    const view=renderHook(()=>useCreationSubmissionCheck(snapshot,id,true,0));
    await waitFor(()=>expect(view.result.current.result).toBe(result));
    expect(createCreationCampaignService).toHaveBeenCalledWith(snapshot.signer,snapshot.protocolCell,snapshot.protocolData,null,expect.any(Function));expect(scan).toHaveBeenCalledWith(id);
  });
  it("exposes a retryable deadline and ignores late scan results after retry",async()=>{
    jest.useFakeTimers();const old=deferred<typeof result>();scan.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result);
    const view=renderHook(({attempt})=>useCreationSubmissionCheck(snapshot,id,true,attempt),{initialProps:{attempt:0}});
    const oldGuard=jest.mocked(createCreationCampaignService).mock.calls[0][4]!;
    await act(async()=>{jest.advanceTimersByTime(CREATION_SUBMISSION_CHECK_TIMEOUT_MS);await Promise.resolve();});
    expect(view.result.current.loading).toBe(false);expect(view.result.current.error).toMatch(/timed out.*Retry/);expect(oldGuard()).toBe(false);
    await act(async()=>{view.rerender({attempt:1});await Promise.resolve();});expect(view.result.current.result).toBe(result);
    await act(async()=>{old.resolve({submissions:new Map([[1,[]]]),campaignData:{quests:[]}});await Promise.resolve();});
    expect(view.result.current.result).toBe(result);expect(view.result.current.error).toBeUndefined();
  });
  it("does not start a scan until a current authorized edit scope is enabled",()=>{
    renderHook(()=>useCreationSubmissionCheck(snapshot,id,false,0));expect(scan).not.toHaveBeenCalled();expect(createCreationCampaignService).not.toHaveBeenCalled();
  });
});
