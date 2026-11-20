import { contributorCapabilities, type ContributorIdentity, type ContributorProtocol } from "../contributor-data";
import type { CampaignDisplay } from "@/lib/utils/campaign-utils";
import type { ccc } from "@ckb-ccc/connector-react";
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{hexFrom:(value:unknown)=>value}}));
jest.mock("ssri-ckboost/types",()=>({CampaignData:{decode:jest.fn()},ProtocolData:{decode:jest.fn()},ConnectedTypeID:{decode:()=>({connected_key:`0x${"a".repeat(64)}`})}}));
jest.mock("@/lib/ckb/campaign-cells",()=>({fetchCampaignByTypeId:jest.fn()}));
jest.mock("@/lib/ckb/protocol-cells",()=>({fetchProtocolCell:jest.fn()}));
jest.mock("@/lib/ckb/user-cells",()=>({extractTypeIdFromUserCell:jest.fn(),getLatestUserCellByLock:jest.fn(),parseUserData:jest.fn()}));
jest.mock("@/lib/services/user-service",()=>({UserService:jest.fn()}));
jest.mock("@/lib/utils/campaign-utils",()=>({cellToCampaignDisplay:jest.fn()}));
jest.mock("@/lib/utils/endorser-resolver",()=>({createEndorserResolver:jest.fn()}));
const hash=(letter:string)=>`0x${letter.repeat(64)}`;
const connected=(owner:string)=>`0x4c0000000c0000002c000000${owner.slice(2)}${hash("9").slice(2)}`;
function fixture(accepted:string[],records:unknown[]=[]){
  const campaign={typeId:hash("c"),cell:{cellOutput:{lock:{args:"0x"}}},staff_lock_hash_vec:[],endorser_lock_hash:hash("e"),startDate:new Date(Date.now()-1000).toISOString(),endDate:new Date(Date.now()+72*3600_000).toISOString(),quests:[{quest_id:1,accepted_submission_user_type_ids:accepted}]} as unknown as CampaignDisplay;
  const protocol={protocol_config:{admin_lock_hash_vec:[]},campaigns_approved:[hash("c")],endorsers_whitelist:[]} as unknown as ContributorProtocol;
  const identity={lockHash:hash("a"),userTypeId:hash("b"),user:{submission_records:records}} as unknown as ContributorIdentity;
  return{campaign,protocol,identity};
}
describe("contributor capabilities from authoritative campaign acceptance",()=>{
  it("shows management for the active Organizer's authoritative owner lock despite distinct legacy endorsement metadata",()=>{
    const {campaign,protocol,identity}=fixture([]);
    campaign.cell={cellOutput:{type:{codeHash:hash("e"),hashType:"type",args:connected(campaign.typeId!)},lock:{codeHash:hash("f"),hashType:"type",args:connected(identity.lockHash)}}} as unknown as ccc.Cell;
    protocol.protocol_config.script_code_hashes={ckb_boost_campaign_type_code_hash:hash("e"),ckb_boost_protocol_lock_code_hash:hash("f")} as unknown as ContributorProtocol["protocol_config"]["script_code_hashes"];
    protocol.endorsers_whitelist=[{endorser_lock_hash:identity.lockHash}] as unknown as ContributorProtocol["endorsers_whitelist"];
    const cell={cellOutput:{type:{hash:()=>hash("9")},lock:{hashType:"type"}}} as unknown as ccc.Cell;
    expect(contributorCapabilities(campaign,protocol,identity,true,undefined,cell)).toMatchObject({canEditCampaign:true,canManageStaff:true,canReviewSubmissions:true,roles:{owner:true,organizer:true}});
    campaign.cell.cellOutput.lock.args=connected(hash("d")) as ccc.Hex;
    expect(contributorCapabilities(campaign,protocol,identity,true,undefined,cell)).toMatchObject({canEditCampaign:false,canReviewSubmissions:false});
    campaign.cell.cellOutput.lock.args=connected(identity.lockHash) as ccc.Hex;
    protocol.endorsers_whitelist=[];
    expect(contributorCapabilities(campaign,protocol,identity,true,undefined,cell)).toMatchObject({canEditCampaign:false,canReviewSubmissions:false,roles:{owner:true,organizer:false}});
  });
  it("blocks a new response when the accepted ID exists but the user record is absent",()=>{
    const {campaign,protocol,identity}=fixture([hash("b")]);
    expect(contributorCapabilities(campaign,protocol,identity,true,1)).toMatchObject({canSubmitQuest:false,canEditSubmission:false,canDeleteSubmission:false});
  });
  it("allows only the wallet's own pending response while keeping owner management rights unchanged",()=>{
    const {campaign,protocol,identity}=fixture([],[{campaign_type_id:hash("c"),quest_id:1,submission_content:"pending proof"}]);
    expect(contributorCapabilities(campaign,protocol,identity,true,1)).toMatchObject({canSubmitQuest:false,canEditSubmission:true,canEditCampaign:false,canManageStaff:false,roles:{admin:false}});
    campaign.quests[0].accepted_submission_user_type_ids=[hash("b")];
    expect(contributorCapabilities(campaign,protocol,identity,true,1).canEditSubmission).toBe(false);
  });
  it("does not confuse another campaign/quest record or another accepted user with the current quest",()=>{
    const {campaign,protocol,identity}=fixture([hash("f")],[{campaign_type_id:hash("d"),quest_id:1},{campaign_type_id:hash("c"),quest_id:2}]);
    expect(contributorCapabilities(campaign,protocol,identity,true,1)).toMatchObject({canSubmitQuest:true,canEditSubmission:false});
  });
  it("keeps legacy Quest0 pending edits scoped and blocks them once its accepted ID appears",()=>{
    const {campaign,protocol,identity}=fixture([],[{campaign_type_id:hash("c"),quest_id:0,submission_content:"Quest0 proof"}]);
    campaign.quests[0].quest_id=0;
    expect(contributorCapabilities(campaign,protocol,identity,true,0)).toMatchObject({canSubmitQuest:false,canEditSubmission:true});
    expect(contributorCapabilities(campaign,protocol,identity,true,1).canEditSubmission).toBe(false);
    campaign.quests[0].accepted_submission_user_type_ids=[hash("b")];
    expect(contributorCapabilities(campaign,protocol,identity,true,0)).toMatchObject({canSubmitQuest:false,canEditSubmission:false});
    identity.user!.submission_records=[];
    expect(contributorCapabilities(campaign,protocol,identity,true,0).canSubmitQuest).toBe(false);
  });
});
