import type { ccc } from "@ckb-ccc/connector-react";
import { CampaignData, ProtocolData, type CampaignDataLike, type ProtocolDataLike } from "ssri-ckboost/types";
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { getCreationCapabilities, readCreationAuthorization } from "../creation-authorization";

jest.mock("@ckb-ccc/connector-react",()=>({ccc:{hexFrom:(value:string)=>value}}));
jest.mock("@/lib/ckb/protocol-cells",()=>({fetchProtocolCell:jest.fn()}));
jest.mock("@/lib/ckb/campaign-cells",()=>({fetchCampaignByTypeId:jest.fn()}));
const hash=(value:string)=>`0x${value.repeat(64)}`;
const admin=hash("a"),owner=hash("b"),other=hash("c"),staff=hash("d"),protocolHash=hash("e"),campaignId=hash("f");
const args=(id:string,protocol=protocolHash)=>`0x4c0000000c0000002c000000${id.slice(2)}${protocol.slice(2)}`;
const protocolCell={outputData:"fresh-protocol",cellOutput:{type:{hash:()=>protocolHash},lock:{hashType:"type"}}} as unknown as ccc.Cell;
const campaignCell={outputData:"fresh-campaign",cellOutput:{type:{codeHash:hash("1"),hashType:"type",args:args(campaignId)},lock:{codeHash:hash("2"),hashType:"type",args:args(owner)}}} as unknown as ccc.Cell;
const data={endorser_lock_hash:owner,staff_lock_hash_vec:[staff],starting_time:1,ending_time:2} as unknown as CampaignDataLike;
function protocol(organizers=[owner,other]):ProtocolDataLike{return {protocol_config:{admin_lock_hash_vec:[admin],script_code_hashes:{ckb_boost_campaign_type_code_hash:hash("1"),ckb_boost_protocol_lock_code_hash:hash("2")}},campaigns_approved:[],endorsers_whitelist:organizers.map(endorser_lock_hash=>({endorser_lock_hash}))} as unknown as ProtocolDataLike;}
const campaign={id:campaignId,cell:campaignCell,data};
describe("fresh Organizer creation authority",()=>{
  beforeAll(()=>{jest.spyOn(ProtocolData,"decode");jest.spyOn(CampaignData,"decode");});
  beforeEach(()=>{jest.clearAllMocks();jest.mocked(fetchProtocolCell).mockResolvedValue(protocolCell);jest.mocked(fetchCampaignByTypeId).mockResolvedValue(campaignCell);jest.mocked(ProtocolData.decode).mockReturnValue(protocol() as never);jest.mocked(CampaignData.decode).mockReturnValue(data as never);});
  it("grants create to a chain-whitelisted Organizer and editing only for its verified campaign",()=>{
    expect(getCreationCapabilities(owner,protocolCell,protocol(),campaign)).toMatchObject({canCreateCampaign:true,canEditCampaign:true,canManageStaff:true,canReviewSubmissions:true,roles:{organizer:true,owner:true}});
    expect(getCreationCapabilities(other,protocolCell,protocol(),campaign)).toMatchObject({canCreateCampaign:true,canEditCampaign:false,canManageStaff:false});
  });
  it("preserves admin override and assigned review without giving a reviewer campaign editing",()=>{
    expect(getCreationCapabilities(admin,protocolCell,protocol(),campaign)).toMatchObject({canCreateCampaign:true,canEditCampaign:true,canManageStaff:true,canReviewSubmissions:true});
    expect(getCreationCapabilities(staff,protocolCell,protocol(),campaign)).toMatchObject({canCreateCampaign:false,canEditCampaign:false,canManageStaff:false,canReviewSubmissions:true});
  });
  it("rejects owner claims that do not match the exact configured scripts and protocol",()=>{
    const wrong={...campaignCell,cellOutput:{...campaignCell.cellOutput,lock:{...campaignCell.cellOutput.lock,codeHash:hash("9")}}} as unknown as ccc.Cell;
    expect(getCreationCapabilities(owner,protocolCell,protocol(),{...campaign,cell:wrong}).canEditCampaign).toBe(false);
    const foreignOwner={...campaignCell,cellOutput:{...campaignCell.cellOutput,lock:{...campaignCell.cellOutput.lock,args:args(other)}}} as unknown as ccc.Cell;
    expect(getCreationCapabilities(owner,protocolCell,protocol(),{...campaign,cell:foreignOwner}).canEditCampaign).toBe(false);
    // Legacy Endorser metadata is distinct from the verified controlling lock.
    expect(getCreationCapabilities(owner,protocolCell,protocol(),{...campaign,data:{...data,endorser_lock_hash:other}}).canEditCampaign).toBe(true);
  });
  it("reads current chain membership instead of a prior local grant and preserves readonly ownership after revocation",async()=>{
    jest.mocked(ProtocolData.decode).mockReturnValue(protocol([]) as never);
    const signer={client:{},getRecommendedAddressObj:async()=>({script:{hash:()=>owner}})} as unknown as ccc.Signer;
    const snapshot=await readCreationAuthorization(signer,campaignId);
    expect(fetchProtocolCell).toHaveBeenCalledWith(signer.client);
    expect(ProtocolData.decode).toHaveBeenCalledWith("fresh-protocol");
    expect(snapshot.capabilities).toMatchObject({canCreateCampaign:false,canEditCampaign:false,roles:{owner:true,organizer:false}});
  });
  it("does not start a campaign lookup after its pending protocol check has expired",async()=>{
    let finish!:(value:ccc.Cell)=>void;let active=true;
    jest.mocked(fetchProtocolCell).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    const signer={client:{},getRecommendedAddressObj:async()=>({script:{hash:()=>owner}})} as unknown as ccc.Signer;
    const pending=readCreationAuthorization(signer,campaignId,()=>active);active=false;finish(protocolCell);
    await expect(pending).rejects.toMatchObject({name:"AbortError"});expect(fetchCampaignByTypeId).not.toHaveBeenCalled();
  });
});
