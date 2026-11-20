import type { ccc } from "@ckb-ccc/connector-react";
import type { ContributorProtocol } from "../contributor-data";
import { loadContributorStats } from "../contributor-stats";
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{hexFrom:(value:unknown)=>value}}));
jest.mock("@/lib/ckb/user-cells",()=>({isUserCellConnectedToProtocol:(cell:{protocol:string},protocol:string)=>cell.protocol===protocol,extractTypeIdFromUserCell:(cell:{id:string})=>cell.id,parseUserData:(cell:{records:unknown[]})=>({submission_records:cell.records})}));
const hash=(letter:string)=>`0x${letter.repeat(64)}`;
const record=(campaign:string,quest:number)=>({campaign_type_id:campaign,quest_id:quest});
function client(cells:unknown[]){return{async*findCells(){for(const cell of cells)yield cell;}} as unknown as ccc.Client;}
const protocolCell={cellOutput:{type:{hash:()=>hash("a")}}} as unknown as ccc.Cell;
const protocol={protocol_config:{script_code_hashes:{ckb_boost_user_type_code_hash:hash("e")}}} as unknown as ContributorProtocol;
describe("campaign contributor totals",()=>{
  it("counts distinct contributors and current per-quest responses without inflating edits",async()=>{
    const counts=await loadContributorStats(client([
      {id:hash("b"),protocol:hash("a"),records:[record(hash("c"),1),record(hash("c"),1)]},
      {id:hash("b"),protocol:hash("a"),records:[record(hash("c"),1)]},
      {id:hash("d"),protocol:hash("a"),records:[record(hash("c"),1),record(hash("c"),2),record(hash("c"),99),record(hash("f"),1)]},
      {id:hash("f"),protocol:hash("f"),records:[record(hash("c"),1)]},
    ]),protocolCell,protocol,hash("c"),[1,2],()=>false);
    expect(counts).toEqual({participants:2,submissions:3});
  });
  it("does not publish partial totals after the campaign request is cancelled",async()=>{
    await expect(loadContributorStats(client([{id:hash("b"),protocol:hash("a"),records:[]}]),protocolCell,protocol,hash("c"),[1],()=>true)).rejects.toThrow("cancelled");
  });
});
