/** @jest-environment node */
import { ccc } from "@ckb-ccc/shell";
import { CampaignData, ConnectedTypeID, ProtocolData, type CampaignDataLike, type ProtocolDataLike } from "ssri-ckboost/types";
import { assertCanonicalProxySigningScope, authorizeStaffProxyTransaction } from "./staff-authorization";

const hash=(n:string)=>`0x${n.repeat(64)}` as ccc.Hex;
const wallet=(n:string)=>ccc.Script.from({codeHash:hash("1"),hashType:"type",args:hash(n)});
const proxyLock=wallet("2"),staffLock=wallet("3"),ownerLock=wallet("4"),strangerLock=wallet("5"),adminLock=wallet("6");
const proxy=proxyLock.hash(),staff=staffLock.hash(),owner=ownerLock.hash(),stranger=strangerLock.hash(),admin=adminLock.hash();
const script=ccc.Script.from({codeHash:hash("7"),hashType:"type",args:hash("8")}),protocolHash=script.hash();
const campaignCode=hash("9"),protocolLock=hash("a");
const connection=(type_id:ccc.Hex,connected_key=protocolHash)=>ccc.hexFrom(ConnectedTypeID.encode({type_id,connected_key}));
let value:ProtocolDataLike;
let campaign:CampaignDataLike;
let campaignCell:ccc.Cell;
let liveCell:ccc.Cell|undefined;
let reads:number;
const client={findCells:()=> (async function*(){reads++;if(liveCell)yield liveCell;})()} as unknown as ccc.Client;
let nextInput=0;
const input=(lock:ccc.Script,typed=false,data:ccc.Hex="0x")=>ccc.Cell.from({outPoint:{txHash:hash("b"),index:nextInput++},cellOutput:{capacity:100_000_000_000n,lock,type:typed?script:undefined},outputData:data});
function currentProtocol(){return ccc.Cell.from({outPoint:{txHash:hash("c"),index:0},cellOutput:{capacity:100_000_000_000n,type:script,lock:proxyLock},outputData:ccc.hexFrom(ProtocolData.encode(value))});}
function updateCampaign(){campaignCell.outputData=ccc.hexFrom(CampaignData.encode(campaign));}
async function authorize(cells:ccc.Cell[],overrides:Partial<Parameters<typeof authorizeStaffProxyTransaction>[0]>={}){
 const tx=ccc.Transaction.from({inputs:[campaignCell,...cells].map(cell=>ccc.CellInput.from({previousOutput:cell.outPoint,cellOutput:cell.cellOutput,outputData:cell.outputData}))});
 return authorizeStaffProxyTransaction({client,tx,campaignCell:tx.inputs[0],protocolTypeHash:protocolHash,protocolTypeScript:script,proxyLockHash:proxy,...overrides});
}
beforeEach(()=>{
 reads=0;nextInput=0;
 const hashes=Object.fromEntries(['protocol_type','protocol_lock','campaign_type','funding_lock','user_type','points_udt_type','tipping_type','achievement_type'].map(name=>[`ckb_boost_${name}_code_hash`,hash('0')]));
 value={campaigns_approved:[],tippings_approved:[],tipping_config:{approval_requirement_thresholds:[],expiration_duration:0},endorsers_whitelist:[{endorser_lock_hash:owner,endorser_name:'Organizer',endorser_description:'',website:'',social_links:[],verified:0}],last_updated:1,protocol_config:{admin_lock_hash_vec:[proxy,admin],streak_bonus_interval:0,streak_bonus_amount:0,achievement_type_hashes:[],script_code_hashes:{...hashes,ckb_boost_campaign_type_code_hash:campaignCode,ckb_boost_protocol_lock_code_hash:protocolLock,accepted_udt_type_scripts:[],accepted_dob_type_scripts:[]}}} as unknown as ProtocolDataLike;
 campaign={endorser_lock_hash:stranger,staff_lock_hash_vec:[staff],created_at:1,starting_time:1,ending_time:2,rules:[],metadata:{title:'Test',short_description:'',long_description:'',image_url:'',difficulty:1,categories:[],verification_requirements:[],last_updated:1,total_rewards:{points_amount:0,ckb_amount:0,nft_assets:[],udt_assets:[]}},status:0,quests:[],participants_count:0,total_completions:0};
 campaignCell=ccc.Cell.from({outPoint:{txHash:hash("d"),index:0},cellOutput:{capacity:100_000_000_000n,type:{codeHash:campaignCode,hashType:"type",args:connection(hash("e"))},lock:{codeHash:protocolLock,hashType:"type",args:connection(owner)}},outputData:ccc.hexFrom(CampaignData.encode(campaign))});
 liveCell=currentProtocol();
});

it('permits a separate current Admin, assigned INPUT Reviewer, or currently granted trusted owner, re-reading protocol each time',async()=>{
 await expect(authorize([input(proxyLock),input(staffLock)])).resolves.toEqual({actorLockHashes:[staff]});
 await expect(authorize([input(proxyLock),input(adminLock)])).resolves.toEqual({actorLockHashes:[admin]});
 await expect(authorize([input(proxyLock),input(ownerLock)])).resolves.toEqual({actorLockHashes:[owner]});
 expect(reads).toBe(3);
});
it('does not use metadata endorsement, another Organizer or output-only reviewer assignments as authority',async()=>{
 await expect(authorize([input(proxyLock),input(strangerLock)])).rejects.toThrow('own plain CKB input');
 value.endorsers_whitelist.push({...value.endorsers_whitelist[0],endorser_lock_hash:stranger});liveCell=currentProtocol();
 await expect(authorize([input(proxyLock),input(strangerLock)])).rejects.toThrow('own plain CKB input');
 campaign.staff_lock_hash_vec=[];updateCampaign();
 await expect(authorize([input(proxyLock),input(staffLock)])).rejects.toThrow('own plain CKB input');
});
it('rejects a revoked owner grant and a proxy without current platform admin status',async()=>{
 value.endorsers_whitelist=[];liveCell=currentProtocol();
 await expect(authorize([input(proxyLock),input(ownerLock)])).rejects.toThrow('own plain CKB input');
 value.protocol_config.admin_lock_hash_vec=[admin];liveCell=currentProtocol();
 await expect(authorize([input(proxyLock),input(staffLock)])).rejects.toThrow('not a current platform administrator');
});
it.each(['wrong type code','wrong lock code','other protocol','malformed lock'])('rejects %s even with an Admin input',async kind=>{
 if(kind==='wrong type code') campaignCell.cellOutput.type!.codeHash=hash('f');
 if(kind==='wrong lock code') campaignCell.cellOutput.lock.codeHash=hash('f');
 if(kind==='other protocol') campaignCell.cellOutput.lock.args=connection(owner,hash('f'));
 if(kind==='malformed lock') campaignCell.cellOutput.lock.args='0x';
 await expect(authorize([input(proxyLock),input(adminLock)])).rejects.toThrow('binding is invalid');
});
it('requires the actual hydrated input rather than an unattached ownership claim',async()=>{
 const unattached=ccc.CellInput.from({previousOutput:campaignCell.outPoint,cellOutput:campaignCell.cellOutput,outputData:campaignCell.outputData});
 await expect(authorize([input(proxyLock),input(staffLock)],{campaignCell:unattached})).rejects.toThrow('authoritative hydrated campaign input');
});
it('rejects proxy-only, typed and data-bearing apparent actors',async()=>{
 await expect(authorize([input(proxyLock)])).rejects.toThrow('own plain CKB input');
 await expect(authorize([input(proxyLock),input(staffLock,true)])).rejects.toThrow('own plain CKB input');
 await expect(authorize([input(proxyLock),input(staffLock,false,'0x01')])).rejects.toThrow('own plain CKB input');
});
it('rejects unavailable protocol state and another configured protocol',async()=>{
 liveCell=undefined;await expect(authorize([input(proxyLock),input(staffLock)])).rejects.toThrow('not connected');
 liveCell=currentProtocol();await expect(authorize([input(proxyLock),input(staffLock)],{protocolTypeHash:hash('f')})).rejects.toThrow('not connected');
});
it('never co-signs extra proxy-owned assets, data cells or duplicate authentication inputs',async()=>{
 await expect(authorize([input(proxyLock),input(staffLock),input(proxyLock,true,'0x01')])).rejects.toThrow('Only one plain empty proxy');
 await expect(authorize([input(proxyLock,false,'0x01'),input(staffLock)])).rejects.toThrow('Only one plain empty proxy');
 await expect(authorize([input(proxyLock),input(staffLock),input(proxyLock)])).rejects.toThrow('Only one plain empty proxy');
});
it('requires an actual authorized actor net debit, including typed cells under that same lock',async()=>{
 const cells=[campaignCell,input(proxyLock),input(staffLock)];
 const make=(capacity:bigint)=>ccc.Transaction.from({inputs:cells.map(cell=>({previousOutput:cell.outPoint,cellOutput:cell.cellOutput,outputData:cell.outputData})),outputs:[{capacity,lock:staffLock}],outputsData:['0x']});
 for(const capacity of [100_000_000_000n,100_000_000_001n]){
  const tx=make(capacity);await expect(authorize([], {tx,campaignCell:tx.inputs[0]})).rejects.toThrow('net capacity debit');
 }
 const tx=make(99_999_999_999n);await expect(authorize([],{tx,campaignCell:tx.inputs[0]})).resolves.toEqual({actorLockHashes:[staff]});
});
it('restricts the real proxy signer to its canonical group including related ACP groups',async()=>{
 const tx=ccc.Transaction.from({}),signer={getRelatedScripts:jest.fn().mockResolvedValue([{script:proxyLock}])};
 await expect(assertCanonicalProxySigningScope(signer,tx,proxy)).resolves.toBeUndefined();
 signer.getRelatedScripts.mockResolvedValue([{script:proxyLock},{script:staffLock}]);
 await expect(assertCanonicalProxySigningScope(signer,tx,proxy)).rejects.toThrow('canonical authentication lock group');
 signer.getRelatedScripts.mockResolvedValue([]);
 await expect(assertCanonicalProxySigningScope(signer,tx,proxy)).rejects.toThrow('canonical authentication lock group');
});
