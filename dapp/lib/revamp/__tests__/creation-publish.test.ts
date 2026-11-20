import type { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData, CampaignData, type CampaignDataLike, type QuestDataLike } from "ssri-ckboost/types";
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { CampaignAdminService } from "@/lib/services/campaign-admin-service";
import { registerPendingTransaction } from "@/lib/pending-transactions";
import { newCreationModel, newCreationQuest, type CreationModel } from "../creation-model";
import { buildCreationQuest, publishCreation, type CreationStorageInput } from "../creation-publish";

jest.mock("@ckb-ccc/connector-react",()=>({ccc:{hexFrom:(value:string)=>value,Script:{from:(script:unknown)=>script}},ssri:{ExecutorJsonRpc:jest.fn()}}));
jest.mock("ssri-ckboost",()=>({Campaign:jest.fn()}),{virtual:true});
// next/jest resolves this workspace package through tsconfig's dist alias.
jest.mock("../../../../packages/ssri-ckboost/dist",()=>({Campaign:jest.fn()}));
jest.mock("@/lib/ckb/protocol-cells",()=>({fetchProtocolCell:jest.fn()}));
jest.mock("@/lib/ckb/campaign-cells",()=>({fetchCampaignByTypeId:jest.fn()}));
jest.mock("@/lib/ckb/deployment-manager",()=>({deploymentManager:{getCurrentNetwork:()=>"testnet",getContractOutPoint:()=>({txHash:"code",index:0}),getContractCodeHash:()=>`0x${"2".repeat(64)}`}}));
jest.mock("@/lib/services/campaign-admin-service",()=>({CampaignAdminService:jest.fn()}));
jest.mock("@/lib/pending-transactions",()=>({registerPendingTransaction:jest.fn()}));

const hash=(value:string)=>`0x${value.repeat(64)}`;
const decodeCampaignFixture=CampaignData.decode;
const admin=hash("a"),campaignId=hash("b"),txHash=hash("c");
const update=jest.fn(),scan=jest.fn();
const protocolCell={outputData:"protocol",cellOutput:{type:{hash:()=>hash("d")},lock:{hashType:"type"}},outPoint:{txHash:hash("e"),index:0n}};
const campaignCell={outputData:"campaign",cellOutput:{type:{codeHash:hash("2"),hashType:"type",args:`0x4c0000000c0000002c000000${campaignId.slice(2)}${hash("d").slice(2)}`},lock:{codeHash:hash("6"),hashType:"type",args:`0x4c0000000c0000002c000000${hash("5").slice(2)}${hash("d").slice(2)}`}},outPoint:{txHash:hash("1"),index:0n}};
const signer={client:{},getRecommendedAddressObj:jest.fn(async()=>({script:{hash:()=>admin}}))} as unknown as ccc.Signer;
function protocol(admins=[admin],organizers:string[]=[]) {return {protocol_config:{admin_lock_hash_vec:admins,script_code_hashes:{ckb_boost_campaign_type_code_hash:hash("2"),ckb_boost_user_type_code_hash:hash("3"),ckb_boost_protocol_lock_code_hash:hash("6")}},campaigns_approved:[campaignId],endorsers_whitelist:organizers.map(endorser_lock_hash=>({endorser_lock_hash}))};}
function model():CreationModel {const value=newCreationModel("UTC");Object.assign(value,{title:"Build CKB",summary:"Learn by doing",description:"<p>Instructions</p>",start:"2026-11-18T09:00",end:"2026-12-18T09:00"});value.quests[0].title="Create a transaction";value.quests[0].points="9007199254740993";return value;}
function oldQuest():QuestDataLike {return {quest_id:1,metadata:{title:"Existing",short_description:"Short",long_description:"nevent1old",requirements:"",difficulty:2,time_estimate:30},points:7n,rewards_on_completion:[{points_amount:0,ckb_amount:100000001n,udt_assets:[],nft_assets:[]}],accepted_submission_user_type_ids:[hash("4")],completion_deadline:1797584400n,status:2,completion_count:13,sub_tasks:[]};}
function oldCampaign():CampaignDataLike {return {endorser_lock_hash:hash("5"),staff_lock_hash_vec:[],created_at:100n,starting_time:100n,ending_time:200n,rules:[],metadata:{title:"Existing",short_description:"Summary",long_description:"nevent1description",total_rewards:{points_amount:3,ckb_amount:55n,udt_assets:[],nft_assets:[]},verification_requirements:[0],last_updated:200n,categories:[],difficulty:2,image_url:""},status:1,quests:[oldQuest()],participants_count:12,total_completions:13};}
function options(value=model()) {return {model:value,signer,expectedSignerLockHash:admin,isCurrentAccount:()=>true,storeContent:jest.fn(async(_input:CreationStorageInput)=>"nevent1verified"),fetchContent:jest.fn(async()=>JSON.stringify({format:"ckboost-campaign-quest-content",version:1,quest_id:1,metadata:{...oldQuest().metadata,long_description:"<p>Original rich details</p>",requirements:"Keep this evidence policy"},sub_tasks:[]})),onStage:jest.fn()};}

describe("organizer publication boundaries",()=>{
  beforeAll(()=>{Object.defineProperty(crypto,"randomUUID",{configurable:true,value:()=>"test-draft-id"});jest.spyOn(ProtocolData,"decode");jest.spyOn(CampaignData,"decode");});
  beforeEach(()=>{
    jest.clearAllMocks();
    jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue({script:{hash:()=>admin}} as never);
    jest.mocked(ProtocolData.decode).mockReturnValue(protocol() as never);
    jest.mocked(CampaignData.decode).mockReturnValue(oldCampaign() as never);
    jest.mocked(fetchProtocolCell).mockResolvedValue(protocolCell as unknown as ccc.Cell);
    jest.mocked(fetchCampaignByTypeId).mockResolvedValue(campaignCell as unknown as ccc.Cell);
    jest.mocked(CampaignAdminService).mockImplementation(()=>({updateCampaign:update,fetchCampaignSubmissions:scan}) as unknown as CampaignAdminService);
    update.mockResolvedValue(txHash);scan.mockResolvedValue({submissions:new Map()});
  });
  it("publishes verified v1 required-response content, preserves exact points, and waits for real confirmation",async()=>{
    const input=options();input.model.quests[0].subtasks=[{id:1,title:"Project",type:"url",description:"Share your repository",evidence:"",required:true}];
    expect(await publishCreation(input)).toBe(txHash);
    const questCall=input.storeContent.mock.calls.find(call=>call[0].contentType==="quest_content")!;
    const payload=JSON.parse(questCall[0].content);
    expect(payload).toMatchObject({format:"ckboost-campaign-quest-content",version:1,sub_tasks:[{required_response:true}]});
    const sent=update.mock.calls[0][0] as CampaignDataLike;
    expect(sent.quests[0]).toMatchObject({quest_id:1,points:9007199254740993n,sub_tasks:[],completion_count:0});
    expect(update.mock.calls[0].slice(1)).toEqual([undefined,undefined]);
    expect(input.onStage.mock.calls.map(call=>call[0])).toEqual(["storage","wallet","broadcast","confirming"]);
    expect(registerPendingTransaction).toHaveBeenCalledWith(txHash,expect.objectContaining({context:"revamp-creation"}));
  });
  it("does no Nostr or wallet work for a disconnected/switched identity or non-admin",async()=>{
    const switched={...options(),isCurrentAccount:()=>false};
    await expect(publishCreation(switched)).rejects.toThrow("account changed");
    expect(switched.storeContent).not.toHaveBeenCalled();
    jest.mocked(ProtocolData.decode).mockReturnValue(protocol([]) as never);
    const denied=options();await expect(publishCreation(denied)).rejects.toThrow("platform admin");
    expect(denied.storeContent).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  });
  it("checks fresh admin membership again after storage and never sends if revoked",async()=>{
    jest.mocked(ProtocolData.decode).mockReturnValueOnce(protocol() as never).mockReturnValueOnce(protocol([]) as never);
    const input=options();await expect(publishCreation(input)).rejects.toThrow("platform admin");
    expect(input.storeContent).toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  });
  it("stops after Nostr verification failure and never requests a wallet signature",async()=>{
    const input=options();input.storeContent.mockRejectedValueOnce(new Error("Relay quorum unavailable"));
    await expect(publishCreation(input)).rejects.toThrow("Relay quorum");
    expect(update).not.toHaveBeenCalled();expect(input.onStage).not.toHaveBeenCalledWith("wallet",expect.anything());
  });
  it("never reports broadcast or confirmation when the wallet rejects",async()=>{
    update.mockRejectedValueOnce(new Error("Signature rejected"));const input=options();
    await expect(publishCreation(input)).rejects.toThrow("Signature rejected");
    expect(input.onStage.mock.calls.map(call=>call[0])).toEqual(["storage","wallet"]);
    expect(registerPendingTransaction).not.toHaveBeenCalled();
  });
  it("preserves fresh chain counters, acceptance, token assets, owner and rich quest details on edit",async()=>{
    const value=model(),current=oldCampaign();value.original=current;value.sourceOutPoint=`${campaignCell.outPoint.txHash}:0`;
    value.quests[0].original={...oldQuest(),metadata:{...oldQuest().metadata,long_description:"<p>Original rich details</p>",requirements:"Keep this evidence policy"}};
    const input={...options(value),campaignTypeId:campaignId};await publishCreation(input);
    const sent=update.mock.calls[0][0] as CampaignDataLike;
    expect(sent).toMatchObject({endorser_lock_hash:current.endorser_lock_hash,created_at:100n,status:1,participants_count:12,total_completions:13});
    expect(sent.metadata.total_rewards).toEqual(current.metadata.total_rewards);
    expect(sent.quests[0]).toMatchObject({quest_id:1,rewards_on_completion:oldQuest().rewards_on_completion,accepted_submission_user_type_ids:oldQuest().accepted_submission_user_type_ids,completion_count:13,status:2});
    const stored=JSON.parse(input.storeContent.mock.calls[0][0].content);
    expect(stored.metadata).toMatchObject({long_description:"<p>Original rich details</p>",requirements:"Keep this evidence policy"});
    expect(buildCreationQuest(value,0,current.quests[0]).quest_id).toBe(1);
  });
  it("fails closed when required-response settings have submissions or their scan fails",async()=>{
    const value=model();value.original=oldCampaign();value.quests[0].original=oldQuest();value.quests[0].subtasks=[{id:1,title:"Link",type:"url",description:"Share URL",evidence:"",required:true}];
    const input={...options(value),campaignTypeId:campaignId};await expect(publishCreation(input)).rejects.toThrow("requirements are locked");
    expect(input.storeContent).not.toHaveBeenCalled();expect(scan).toHaveBeenCalledTimes(1);
    scan.mockRejectedValueOnce(new Error("Submission history unavailable"));
    await expect(publishCreation({...options(value),campaignTypeId:campaignId})).rejects.toThrow("Submission history unavailable");expect(update).not.toHaveBeenCalled();
  });
  it("rechecks response locks after Nostr work, even if the campaign outpoint did not change",async()=>{
    const current=oldCampaign();current.quests[0].accepted_submission_user_type_ids=[];
    jest.mocked(CampaignData.decode).mockReturnValue(current as never);
    const value=model();value.original=current;value.quests[0].original=current.quests[0];value.quests[0].subtasks=[{id:1,title:"Link",type:"url",description:"Share URL",evidence:"",required:true}];
    scan.mockResolvedValueOnce({submissions:new Map()}).mockResolvedValueOnce({submissions:new Map([[1,[{userTypeId:hash("9")}]]])});
    const input={...options(value),campaignTypeId:campaignId};await expect(publishCreation(input)).rejects.toThrow("requirements are locked");
    expect(scan).toHaveBeenCalledTimes(2);expect(input.storeContent).toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  });
  it("rejects concurrent campaign revisions and deletion that would orphan accepted submissions",async()=>{
    const value=model();value.original=oldCampaign();value.sourceOutPoint="older-cell";
    await expect(publishCreation({...options(value),campaignTypeId:campaignId})).rejects.toThrow("changed on-chain");
    value.sourceOutPoint=undefined;value.quests[0].id=2;
    await expect(publishCreation({...options(value),campaignTypeId:campaignId})).rejects.toThrow("accepted submissions");expect(update).not.toHaveBeenCalled();
  });
  it("allows deleting an unused published quest without renumbering other IDs or blocking configured rewards",async()=>{
    const current=oldCampaign();current.quests=[1,3,9].map(id=>({...oldQuest(),quest_id:id,accepted_submission_user_type_ids:[],completion_count:0}));
    current.quests[1].rewards_on_completion=[{points_amount:0n,ckb_amount:9007199254740993n,nft_assets:[{codeHash:hash("8"),hashType:"type",args:"0x0405"}],udt_assets:[{udt_script:{codeHash:hash("7"),hashType:"type",args:"0x0102"},amount:9007199254740999n}]}];
    jest.mocked(CampaignData.decode).mockReturnValue(current as never);
    const value=model();value.original=current;value.nextQuestId=10;value.quests=current.quests.slice(1).map(quest=>({...newCreationQuest(Number(quest.quest_id)),title:`Keep ${Number(quest.quest_id)}`,original:quest}));
    await publishCreation({...options(value),campaignTypeId:campaignId});
    const sent=update.mock.calls[0][0] as CampaignDataLike;
    expect(sent.quests.map(quest=>Number(quest.quest_id))).toEqual([3,9]);
    expect(sent.quests[0].rewards_on_completion).toEqual(current.quests[1].rewards_on_completion);
    const encodedRoundTrip=decodeCampaignFixture(CampaignData.encode(sent));
    expect(encodedRoundTrip.quests[0].rewards_on_completion).toEqual(current.quests[1].rewards_on_completion);
    expect(scan).toHaveBeenCalledTimes(2);
  });
  it("blocks deletion if a pending response arrives during content verification",async()=>{
    const current=oldCampaign();current.quests[0].accepted_submission_user_type_ids=[];current.quests[0].completion_count=0;
    jest.mocked(CampaignData.decode).mockReturnValue(current as never);
    const value=model();value.original=current;value.quests[0].id=2;
    scan.mockResolvedValueOnce({submissions:new Map()}).mockResolvedValueOnce({submissions:new Map([[1,[{userTypeId:hash("9")}]]])});
    await expect(publishCreation({...options(value),campaignTypeId:campaignId})).rejects.toThrow("submitted response");
    expect(update).not.toHaveBeenCalled();
  });
  it("lets an authorized Organizer create, but clearly blocks its old-lock edit before Nostr or signing",async()=>{
    const owner=hash("5");jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue({script:{hash:()=>owner}} as never);
    jest.mocked(ProtocolData.decode).mockReturnValue(protocol([], [owner]) as never);
    const create={...options(),expectedSignerLockHash:owner};await publishCreation(create);
    expect((update.mock.calls[0][0] as CampaignDataLike).endorser_lock_hash).toBe(owner);
    update.mockClear();const value=model();value.original=oldCampaign();value.quests[0].original=oldQuest();
    const edit={...options(value),expectedSignerLockHash:owner,campaignTypeId:campaignId};
    const previous=process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES;
    delete process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES;
    try{await expect(publishCreation(edit)).rejects.toThrow("Organizer access is confirmed");expect(edit.storeContent).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();}finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES;else process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES=previous;}
  });
  it("accepts an explicitly upgraded input lock, but rejects another Organizer's campaign",async()=>{
    const owner=hash("5");jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue({script:{hash:()=>owner}} as never);
    jest.mocked(ProtocolData.decode).mockReturnValue(protocol([], [owner,hash("7")]) as never);
    const previous=process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES;process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES=hash("6");
    const value=model();value.original=oldCampaign();value.quests[0].original=oldQuest();
    try{
      await publishCreation({...options(value),expectedSignerLockHash:owner,campaignTypeId:campaignId});expect(update).toHaveBeenCalledTimes(1);update.mockClear();
      jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue({script:{hash:()=>hash("7")}} as never);
      await expect(publishCreation({...options(value),expectedSignerLockHash:hash("7"),campaignTypeId:campaignId})).rejects.toThrow("owns this campaign");expect(update).not.toHaveBeenCalled();
    }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES;else process.env.NEXT_PUBLIC_CKBOOST_ORGANIZER_AUTH_LOCK_HASHES=previous;}
  });
});
