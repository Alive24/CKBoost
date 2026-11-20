import {ccc} from '@ckb-ccc/core';
import {CampaignData, ConnectedTypeID, ProtocolData, type CampaignDataLike, type ProtocolDataLike} from '../generated';
import {assertCampaignSettingsAuthority, assertCampaignReviewAuthority} from './authorization';
import {Campaign} from './index';
import {Protocol} from '../protocol';
jest.mock('../logging/index.js',()=>({createScopedLogger:()=>({info:jest.fn(),error:jest.fn(),warn:jest.fn()})}));
jest.mock('ckb-claimable-pool-lock',()=>({encodeClaimablePoolData:jest.fn()}), {virtual:true});

const hex=(value:string)=>`0x${value.repeat(64)}` as ccc.Hex;
const lock=(value:string)=>ccc.Script.from({codeHash:hex(value),hashType:'type',args:'0x'});
const owner=lock('1').hash(),admin=lock('2').hash(),other=lock('3').hash(),staff=lock('4').hash();
const campaignCode=hex('a'),protocolLockCode=hex('b');
function data(ownerHash=owner):CampaignDataLike{return {endorser_lock_hash:ownerHash,staff_lock_hash_vec:[staff],created_at:1,starting_time:1,ending_time:2,rules:[],metadata:{title:'Campaign',short_description:'Summary',long_description:'Description',image_url:'',difficulty:1,categories:[],verification_requirements:[],last_updated:1,total_rewards:{points_amount:0,ckb_amount:0,nft_assets:[],udt_assets:[]}},status:0,quests:[],participants_count:0,total_completions:0};}
function protocol(organizers:ccc.Hex[]=[owner]):ccc.Cell{
 const hashes=Object.fromEntries(['protocol_type','protocol_lock','campaign_type','funding_lock','user_type','points_udt_type','tipping_type','achievement_type'].map(name=>[`ckb_boost_${name}_code_hash`,hex('0')]));
 const value={campaigns_approved:[],tippings_approved:[],tipping_config:{approval_requirement_thresholds:[],expiration_duration:0},endorsers_whitelist:organizers.map(hash=>({endorser_lock_hash:hash,endorser_name:'Organizer',endorser_description:'',website:'',social_links:[],verified:0})),last_updated:1,protocol_config:{admin_lock_hash_vec:[admin],streak_bonus_interval:0,streak_bonus_amount:0,achievement_type_hashes:[],script_code_hashes:{...hashes,ckb_boost_campaign_type_code_hash:campaignCode,ckb_boost_protocol_lock_code_hash:protocolLockCode,accepted_udt_type_scripts:[],accepted_dob_type_scripts:[]}}} as unknown as ProtocolDataLike;
 return ccc.Cell.from({outPoint:{txHash:hex('5'),index:0},cellOutput:{capacity:100000000000n,lock:lock('b'),type:{codeHash:hex('c'),hashType:'type',args:hex('d')}},outputData:ccc.hexFrom(ProtocolData.encode(value))});
}
function existing(p:ccc.Cell,ownerHash=owner):ccc.Cell{
 const hash=p.cellOutput.type!.hash();
 return ccc.Cell.from({outPoint:{txHash:hex('6'),index:0},cellOutput:{capacity:100000000000n,lock:{codeHash:protocolLockCode,hashType:'type',args:ccc.hexFrom(ConnectedTypeID.encode({type_id:ownerHash,connected_key:hash}))},type:{codeHash:campaignCode,hashType:'type',args:ccc.hexFrom(ConnectedTypeID.encode({type_id:hex('7'),connected_key:hash}))}},outputData:ccc.hexFrom(CampaignData.encode(data(ownerHash)))});
}
const options=(p:ccc.Cell,signerLockHash:ccc.Hex,cell?:ccc.Cell)=>({protocolCell:p,campaignScript:cell?.cellOutput.type??ccc.Script.from({codeHash:campaignCode,hashType:'type',args:'0x'}),signerLockHash,campaignData:data(),existingCampaignCell:cell});

describe('SDK shared settings authorization',()=>{
 it('permits a whitelisted Organizer despite verified=0 and denies an ungranted visitor',()=>{
  const p=protocol();expect(assertCampaignSettingsAuthority(options(p,owner)).ownerLockHash).toBe(owner);
  expect(()=>assertCampaignSettingsAuthority(options(p,other))).toThrow('authorized Organizer');
 });
 it('limits settings and staff writes to the currently granted owner, with admin override',()=>{
  const p=protocol([owner,other]),cell=existing(p);
  expect(()=>assertCampaignSettingsAuthority(options(p,owner,cell))).not.toThrow();
  expect(()=>assertCampaignSettingsAuthority(options(p,admin,cell))).not.toThrow();
  expect(()=>assertCampaignSettingsAuthority(options(p,other,cell))).toThrow('this campaign');
  expect(()=>assertCampaignSettingsAuthority(options(p,staff,cell))).toThrow('this campaign');
  expect(()=>assertCampaignSettingsAuthority(options(protocol([]),owner,cell))).toThrow('this campaign');
 });
 it('rejects spoofed owners and mismatched lock/protocol scripts',()=>{
  const p=protocol(),cell=existing(p);const changed={...options(p,admin,cell),campaignData:data(other)};
  expect(()=>assertCampaignSettingsAuthority(changed)).toThrow('ownership');
  const bad=ccc.Cell.from(cell);bad.cellOutput.lock=lock('f');
  expect(()=>assertCampaignSettingsAuthority(options(p,owner,bad))).toThrow('ownership');
 });
 it('preserves differing legacy endorsement metadata while trusting the lock owner',()=>{
  const p=protocol([owner,other]),cell=existing(p);cell.outputData=ccc.hexFrom(CampaignData.encode(data(other)));
  expect(assertCampaignSettingsAuthority({...options(p,owner,cell),campaignData:data(other)}).ownerLockHash).toBe(owner);
  expect(()=>assertCampaignSettingsAuthority({...options(p,admin,cell),campaignData:data(other)})).not.toThrow();
  expect(()=>assertCampaignSettingsAuthority({...options(p,other,cell),campaignData:data(other)})).toThrow('this campaign');
 });
 it('keeps review state out of settings updates while allowing configured reward changes',()=>{
  const p=protocol(),cell=existing(p);const original=data();original.quests=[{quest_id:0,metadata:{title:'Quest',short_description:'',long_description:'',requirements:'',difficulty:0,time_estimate:0},points:0,rewards_on_completion:[],accepted_submission_user_type_ids:[],completion_deadline:0,status:0,completion_count:0,sub_tasks:[]}];
  cell.outputData=ccc.hexFrom(CampaignData.encode(original));
  const changed=CampaignData.decode(cell.outputData);changed.quests[0].accepted_submission_user_type_ids=[other];
  expect(()=>assertCampaignSettingsAuthority({...options(p,owner,cell),campaignData:changed})).toThrow('approveCompletion');
  const rewards=CampaignData.decode(cell.outputData);rewards.quests[0].points=100n;
  expect(()=>assertCampaignSettingsAuthority({...options(p,owner,cell),campaignData:rewards})).not.toThrow();
  const removed=CampaignData.decode(cell.outputData);removed.quests=[];
  expect(()=>assertCampaignSettingsAuthority({...options(p,owner,cell),campaignData:removed})).not.toThrow();
  const used=CampaignData.decode(cell.outputData);used.quests[0].accepted_submission_user_type_ids=[other];cell.outputData=ccc.hexFrom(CampaignData.encode(used));
  expect(()=>assertCampaignSettingsAuthority({...options(p,owner,cell),campaignData:removed})).toThrow('cannot be removed');
 });
 it('requires zero campaign totals at creation',()=>{const p=protocol();expect(()=>assertCampaignSettingsAuthority({...options(p,owner),campaignData:{...data(),participants_count:1}})).toThrow('zero submission totals');});
 it('executes the SDK updateCampaign guard before SSRI or wallet work',async()=>{
  const p=protocol(),cell=existing(p),runScript=jest.fn();
  const signer={client:{findCellsByType:async function*(){yield cell;}},getRecommendedAddressObj:async()=>({script:lock('4')})} as unknown as ccc.Signer;
  const sdk=new Campaign({txHash:hex('8'),index:0},cell.cellOutput.type!,p,{executor:{runScript} as never});
  await expect(sdk.updateCampaign(signer,data())).rejects.toThrow('authorized Organizer');
  expect(runScript).not.toHaveBeenCalled();
 });
 it('does not let a desired OUTPUT admin self-authorize an Organizer grant',async()=>{
  const p=protocol(),value=ProtocolData.decode(p.outputData);value.protocol_config.admin_lock_hash_vec=[other];
  const runScript=jest.fn(),sdk=new Protocol({txHash:hex('8'),index:0},p.cellOutput.type!,{executor:{runScript} as never});
  const signer={client:{findCellsByType:async function*(){yield p;}},getRecommendedAddressObj:async()=>({script:lock('3')})} as unknown as ccc.Signer;
  await expect(sdk.updateProtocol(signer,value)).rejects.toThrow('existing platform admin');
  expect(runScript).not.toHaveBeenCalled();
 });
 it('blocks NFT reward approval before entering the unsupported SDK builder',async()=>{
  const p=protocol(),cell=existing(p),runScript=jest.fn(),sdk=new Campaign({txHash:hex('8'),index:0},cell.cellOutput.type!,p,{executor:{runScript} as never});
  const value=data();value.quests=[{quest_id:0,metadata:{title:'Quest',short_description:'',long_description:'',requirements:'',difficulty:0,time_estimate:0},points:0,rewards_on_completion:[{points_amount:0,ckb_amount:0,nft_assets:[lock('9')],udt_assets:[]}],accepted_submission_user_type_ids:[],completion_deadline:0,status:0,completion_count:0,sub_tasks:[]}];
  await expect(sdk.approveCompletion({} as ccc.Signer,value,0,[other],[other],hex('9'))).rejects.toThrow('NFT reward approval is unavailable');expect(runScript).not.toHaveBeenCalled();
 });
});

describe('SDK review authority from the current campaign INPUT',()=>{
 const review=(p:ccc.Cell,cell:ccc.Cell,signerLockHash:ccc.Hex)=>({protocolCell:p,campaignScript:cell.cellOutput.type!,campaignCell:cell,signerLockHash});
 it('permits Admin, currently granted lock owner Organizer and assigned reviewer, with no settings grant for reviewer',()=>{
  const p=protocol(),cell=existing(p);
  expect(assertCampaignReviewAuthority(review(p,cell,admin))).toMatchObject({admin:true});
  expect(assertCampaignReviewAuthority(review(p,cell,owner))).toMatchObject({admin:false,organizer:true,owner:true});
  expect(assertCampaignReviewAuthority(review(p,cell,staff))).toMatchObject({staff:true,organizer:false,owner:false});
  expect(()=>assertCampaignSettingsAuthority(options(p,staff,cell))).toThrow('this campaign');
 });
 it('rejects another Organizer, revoked owner and removed INPUT reviewer',()=>{
  const p=protocol([owner,other]),cell=existing(p);
  expect(()=>assertCampaignReviewAuthority(review(p,cell,other))).toThrow('assigned input reviewer');
  expect(()=>assertCampaignReviewAuthority(review(protocol([]),cell,owner))).toThrow('assigned input reviewer');
  const withoutStaff=data();withoutStaff.staff_lock_hash_vec=[];cell.outputData=ccc.hexFrom(CampaignData.encode(withoutStaff));
  expect(()=>assertCampaignReviewAuthority(review(p,cell,staff))).toThrow('assigned input reviewer');
 });
 it('derives ownership from the trusted lock, ignoring legacy endorser metadata',()=>{
  const p=protocol([owner,other]),cell=existing(p);cell.outputData=ccc.hexFrom(CampaignData.encode(data(other)));
  expect(assertCampaignReviewAuthority(review(p,cell,owner)).owner).toBe(true);
  expect(()=>assertCampaignReviewAuthority(review(p,cell,other))).toThrow('authorized Organizer owner');
 });
 it.each(['type code','lock code','protocol relation','malformed args'])('rejects %s even for an admin',kind=>{
  const p=protocol(),cell=existing(p),script=ccc.Script.from(cell.cellOutput.type!);
  if(kind==='type code') cell.cellOutput.type!.codeHash=hex('f');
  if(kind==='lock code') cell.cellOutput.lock.codeHash=hex('f');
  if(kind==='protocol relation') cell.cellOutput.lock.args=ccc.hexFrom(ConnectedTypeID.encode({type_id:owner,connected_key:hex('f')}));
  if(kind==='malformed args') cell.cellOutput.lock.args='0x';
  expect(()=>assertCampaignReviewAuthority({...review(p,cell,admin),campaignScript:script})).toThrow();
 });
 async function enter(signerDigit:string,overrides:{p?:ccc.Cell;desired?:CampaignDataLike;currentProtocol?:ccc.Cell}={}) {
  const p=overrides.p??protocol(),cell=existing(p),runScript=jest.fn().mockRejectedValue(new Error('Reached SSRI'));
  const signer={client:{findCellsByType:async function*(query:ccc.ScriptLike){yield ccc.Script.from(query).eq(p.cellOutput.type!)?(overrides.currentProtocol??p):cell;}},getRecommendedAddressObj:async()=>({script:lock(signerDigit)})} as unknown as ccc.Signer;
  const sdk=new Campaign({txHash:hex('8'),index:0},cell.cellOutput.type!,p,{executor:{runScript} as never});
  // Attach the rejection handler immediately; no signer or RPC is invoked.
  const error=await sdk.approveCompletion(signer,overrides.desired??CampaignData.decode(cell.outputData),0,[other],[other],hex('9')).then(()=>null,(failure:Error)=>failure);
  return {error,runScript};
 }
 it.each(['1','2','4'])('checks fresh inputs then allows role wallet %s to reach the direct SSRI builder',async digit=>{
  const result=await enter(digit);expect(result.error?.message).toContain('Reached SSRI');expect(result.runScript).toHaveBeenCalledTimes(1);
 });
 it('rejects OUTPUT-only self-assignment before SSRI',async()=>{
  const desired=data();desired.staff_lock_hash_vec=[other];
  const result=await enter('3',{p:protocol([owner,other]),desired});
  expect(result.error?.message).toContain('assigned input reviewer');expect(result.runScript).not.toHaveBeenCalled();
 });
 it('rejects changed desired data and a stale retained protocol before SSRI',async()=>{
  const desired=data();desired.metadata.short_description='Changed outside review';
  const changed=await enter('1',{desired});expect(changed.error?.message).toContain('review data changed');expect(changed.runScript).not.toHaveBeenCalled();
  const p=protocol(),current=ccc.Cell.from({outPoint:{txHash:hex('f'),index:0},cellOutput:p.cellOutput,outputData:p.outputData});
  const stale=await enter('1',{p,currentProtocol:current});expect(stale.error?.message).toContain('Protocol changed');expect(stale.runScript).not.toHaveBeenCalled();
 });
});
