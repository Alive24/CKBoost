import type { ccc } from "@ckb-ccc/connector-react";
import type { ProtocolDataLike } from "ssri-ckboost/types";
import { CampaignAdminService } from "@/lib/services/campaign-admin-service";
import { createCreationCampaignService } from "../creation-service";
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{hexFrom:(value:string)=>value}}));
jest.mock("@/lib/services/campaign-admin-service",()=>({CampaignAdminService:jest.fn()}));
const cell={cellOutput:{type:{hash:()=>"protocol"}}} as unknown as ccc.Cell;
const protocol={protocol_config:{script_code_hashes:{ckb_boost_user_type_code_hash:"user",ckb_boost_campaign_type_code_hash:"campaign"}}} as unknown as ProtocolDataLike;
describe("creation service construction and expired read scans",()=>{
  beforeEach(()=>jest.clearAllMocks());
  it("reuses exact fresh protocol parameters for a normal write service",()=>{
    const signer={client:{}} as unknown as ccc.Signer;createCreationCampaignService(signer,cell,protocol);
    expect(CampaignAdminService).toHaveBeenCalledWith(signer,"user","protocol","campaign",cell,null);
  });
  it("stops an expired iterator before requesting the next page",async()=>{
    let active=true,pages=0;
    const client={findCells:async function*(){pages++;yield"first page";pages++;yield"second page";}};
    createCreationCampaignService({client} as unknown as ccc.Signer,cell,protocol,null,()=>active);
    const guarded=jest.mocked(CampaignAdminService).mock.calls[0][0].client as unknown as {findCells:()=>AsyncGenerator<string>};
    const iterator=guarded.findCells();expect((await iterator.next()).value).toBe("first page");active=false;
    await expect(iterator.next()).rejects.toMatchObject({name:"AbortError"});expect(pages).toBe(1);
  });
});
