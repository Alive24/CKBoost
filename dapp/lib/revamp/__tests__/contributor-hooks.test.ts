import { act,renderHook,waitFor } from "@testing-library/react";
import { useContributorSubmit } from "../contributor-hooks";

const hash=(letter:string)=>`0x${letter.repeat(64)}`;
let mockSigner: ReturnType<typeof wallet>;
const mockPublish=jest.fn(),mockRefresh=jest.fn(),mockCapabilities=jest.fn(),mockSubmit=jest.fn(),mockQuestState=jest.fn();
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{useSigner:()=>mockSigner,hexFrom:(value:unknown)=>value,stringify:(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==="bigint"?item.toString():item)}}));
jest.mock("@/lib/providers/protocol-provider",()=>({useProtocol:jest.fn()}));
jest.mock("@/lib/providers/nostr-provider",()=>({useNostr:jest.fn(),DEFAULT_NOSTR_RELAYS:[]}));
jest.mock("@/lib/providers/pending-transaction-provider",()=>({usePendingTransactions:()=>({confirmationTarget:2})}));
jest.mock("@/lib/nostr/browser-fetch",()=>({fetchNeventWithCache:jest.fn()}));
jest.mock("@/lib/ckb/campaign-cells",()=>({fetchCampaignByTypeId:jest.fn()}));
jest.mock("../contributor-stats",()=>({loadContributorStats:jest.fn()}));
jest.mock("@/hooks/use-nostr-storage",()=>({useNostrStorage:()=>({storeSubmission:{mutateAsync:mockPublish}})}));
jest.mock("../contributor-data",()=>({refreshContributorFacts:(...args:unknown[])=>mockRefresh(...args),contributorCapabilities:(...args:unknown[])=>mockCapabilities(...args),contributorQuestState:(...args:unknown[])=>mockQuestState(...args)}));
jest.mock("@/lib/services/user-service",()=>({UserService:class{constructor(private signer:unknown){} submitQuestWithAutoCreate(...args:unknown[]){return mockSubmit(this.signer,...args);}}}));

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function wallet(){
  const client={sendTransaction:jest.fn(async(_tx?:unknown)=>hash("e")),waitTransaction:jest.fn(async()=>({status:"committed"}))};
  return {client,getRecommendedAddressObj:jest.fn(async()=>({script:{hash:()=>hash("a")}})),signTransaction:jest.fn(async(tx:unknown)=>tx),async sendTransaction(this:{signTransaction:(tx:unknown)=>Promise<unknown>;client:typeof client},tx:unknown){return this.client.sendTransaction(await this.signTransaction(tx));}};
}
const quest={quest_id:1,metadata:{title:"Quest",difficulty:1n},sub_tasks:[{title:"Evidence",type:"Text",required_response:true}],points:5n};
const campaign={typeId:hash("c"),quests:[quest]};
function facts(){return{campaign,identity:{signer:mockSigner,lockHash:hash("a"),protocolHash:hash("b"),address:"ckt1wallet",userTypeId:hash("d")},eligibility:{eligible:true},protocol:{protocol_config:{script_code_hashes:{ckb_boost_user_type_code_hash:hash("f")}}},protocolCell:{}};}
function input(){return{campaign,identity:facts().identity,quest,responses:{0:"Completed proof"},editing:false,name:""} as unknown as Parameters<ReturnType<typeof useContributorSubmit>["submit"]>[0];}
beforeEach(()=>{
  jest.clearAllMocks();mockSigner=wallet();
  mockRefresh.mockImplementation(async()=>facts());mockCapabilities.mockReturnValue({canSubmitQuest:true,canEditSubmission:true});
  mockPublish.mockResolvedValue({neventId:"nevent1verified",verifiedRelays:["wss://one","wss://two"]});
  mockSubmit.mockImplementation(async(signer:{sendTransaction:(tx:unknown)=>Promise<string>})=>({txHash:await signer.sendTransaction({})}));
  mockQuestState.mockReturnValue({submission:{submission_content:"original response",submission_timestamp:1n}});
});

describe("contributor submission boundaries",()=>{
  it("publishes verified evidence before wallet sending, and confirms only after the real confirmation target",async()=>{
    const confirmed=jest.fn(),commit=deferred<{status:string}>();mockSigner.client.waitTransaction.mockReturnValue(commit.promise);
    const {result}=renderHook(()=>useContributorSubmit(confirmed));
    let operation!:Promise<void>;act(()=>{operation=result.current.submit(input());});
    await waitFor(()=>expect(result.current.transaction?.stage).toBe("submitted"));
    expect(confirmed).not.toHaveBeenCalled();expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockSigner.client.waitTransaction).toHaveBeenCalledWith(hash("e"),2,300000,2000);
    await act(async()=>{commit.resolve({status:"committed"});await operation;});
    expect(result.current.transaction?.stage).toBe("confirmed");expect(confirmed).toHaveBeenCalledTimes(1);
  });
  it("rejects a changed wallet while relay publication is pending",async()=>{
    const publication=deferred<{neventId:string;verifiedRelays:string[]}>();mockPublish.mockReturnValue(publication.promise);
    const {result,rerender}=renderHook(()=>useContributorSubmit(jest.fn()));let operation!:Promise<void>;
    act(()=>{operation=result.current.submit(input());});await waitFor(()=>expect(mockPublish).toHaveBeenCalled());
    mockSigner=wallet();rerender();
    await act(async()=>{publication.resolve({neventId:"nevent1verified",verifiedRelays:["one","two"]});await operation;});
    expect(mockSubmit).not.toHaveBeenCalled();expect(result.current.transaction?.error).toMatch(/wallet changed/i);
  });
  it("rechecks accepted/eligibility/lifecycle facts after publication before opening the wallet",async()=>{
    mockCapabilities.mockReturnValueOnce({canSubmitQuest:true}).mockReturnValue({canSubmitQuest:false});
    const {result}=renderHook(()=>useContributorSubmit(jest.fn()));await act(async()=>{await result.current.submit(input());});
    expect(mockPublish).toHaveBeenCalledTimes(1);expect(mockSubmit).not.toHaveBeenCalled();expect(result.current.transaction?.stage).toBe("error");
  });
  it("prevents broadcast when permission changes during wallet signing",async()=>{
    const signature=deferred<unknown>();mockSigner.signTransaction.mockReturnValue(signature.promise);
    const {result}=renderHook(()=>useContributorSubmit(jest.fn()));let operation!:Promise<void>;
    act(()=>{operation=result.current.submit(input());});await waitFor(()=>expect(mockSigner.signTransaction).toHaveBeenCalled());
    mockCapabilities.mockReturnValue({canSubmitQuest:false});
    await act(async()=>{signature.resolve({});await operation;});
    expect(mockSigner.client.sendTransaction).not.toHaveBeenCalled();expect(result.current.transaction?.stage).toBe("error");
  });
  it("retries confirmation of the same hash without publishing or sending a second transaction",async()=>{
    mockSigner.client.waitTransaction.mockRejectedValueOnce(new Error("Confirmation timeout"));
    const confirmed=jest.fn(),{result}=renderHook(()=>useContributorSubmit(confirmed));
    await act(async()=>{await result.current.submit(input());});
    expect(result.current.transaction).toMatchObject({stage:"error",txHash:hash("e")});
    await act(async()=>{await result.current.submit(input());});
    expect(mockSubmit).toHaveBeenCalledTimes(1);expect(mockPublish).toHaveBeenCalledTimes(1);
    await act(async()=>{await result.current.retry();});
    expect(result.current.transaction?.stage).toBe("confirmed");expect(mockSubmit).toHaveBeenCalledTimes(1);expect(mockPublish).toHaveBeenCalledTimes(1);expect(confirmed).toHaveBeenCalledTimes(1);
  });
  it("never sends on a relay quorum failure or missing required evidence",async()=>{
    const {result}=renderHook(()=>useContributorSubmit(jest.fn()));
    await act(async()=>{await result.current.submit({...input(),responses:{0:" "}});});
    expect(mockPublish).not.toHaveBeenCalled();expect(mockSubmit).not.toHaveBeenCalled();
    mockPublish.mockRejectedValueOnce(new Error("Required relay copies unavailable"));
    await act(async()=>{await result.current.submit(input());});
    expect(mockSubmit).not.toHaveBeenCalled();expect(result.current.transaction?.error).toMatch(/relay copies/);
  });
  it("does not overwrite a pending response changed by another session",async()=>{
    mockQuestState.mockReturnValueOnce({submission:{submission_content:"original response",submission_timestamp:1n}}).mockReturnValue({submission:{submission_content:"updated response",submission_timestamp:2n}});
    const {result}=renderHook(()=>useContributorSubmit(jest.fn()));
    await act(async()=>{await result.current.submit({...input(),editing:true});});
    expect(mockPublish).not.toHaveBeenCalled();expect(mockSubmit).not.toHaveBeenCalled();expect(result.current.transaction?.error).toMatch(/saved response changed/i);
  });
});
