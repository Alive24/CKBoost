import { handler } from "../functions/staff-approve-submissions";
import { ensureProxyAdminCellPair } from "@/netlify/lib/proxy-admin";

const mockHash=(n:string)=>`0x${n.repeat(64)}`;
const mockProxy=mockHash("1"),mockStaff=mockHash("2"),mockCampaignId=mockHash("3"),mockProtocolHash=mockHash("4"),mockCampaignCode=mockHash("5");
const mockSign=jest.fn();
const mockRelated=jest.fn();
const mockProtocolScript={codeHash:mockHash("6"),hashType:"type",args:mockHash("7")};
const mockCampaign={staff_lock_hash_vec:[mockStaff],quests:[],metadata:{}};
const mockLock=(hash:string)=>({hash:()=>hash});
const mockConnected=(id:string)=>`0x4c0000000c0000002c000000${id.slice(2)}${mockProtocolHash.slice(2)}`;
const mockCampaignLock={...mockLock(mockHash("a")),codeHash:mockHash("a"),hashType:"type",args:mockConnected(mockHash("a"))};
const mockTx={
  inputs:[{previousOutput:{txHash:"campaign",index:0}},{previousOutput:{txHash:"proxy",index:0}}],
  outputs:[{type:{codeHash:mockCampaignCode},lock:mockLock(mockHash("a"))}] as {type?:{codeHash:string};lock:{hash:()=>string};capacity?:bigint}[],outputsData:["campaign-next"],
};
const mockCells:Record<string,unknown>={
  campaign:{outPoint:{txHash:"campaign",index:0},cellOutput:{type:{codeHash:mockCampaignCode,hashType:"type",args:mockConnected(mockCampaignId)},lock:mockCampaignLock},outputData:"campaign-before"},
  proxy:{outPoint:{txHash:"proxy",index:0},cellOutput:{lock:mockLock(mockProxy)},outputData:"0x"},
  staff:{outPoint:{txHash:"staff",index:0},cellOutput:{capacity:100n,lock:mockLock(mockStaff)},outputData:"0x"},
  proxyAsset:{outPoint:{txHash:"proxyAsset",index:0},cellOutput:{type:{codeHash:mockHash("8")},lock:mockLock(mockProxy)},outputData:"0x01"},
};
const mockClient={
  getCell:jest.fn(async(outPoint:{txHash:string})=>mockCells[outPoint.txHash]),
  findCells:jest.fn(()=> (async function*(){yield {cellOutput:{type:{...mockProtocolScript,hash:()=>mockProtocolHash,eq:()=>true},lock:{hashType:"type"}},outputData:"protocol"};})()),
};
jest.mock("@ckb-ccc/shell",()=>({ccc:{
  hexFrom:(value:string)=>value,bytesFrom:(value:string)=>value,numFrom:(value:bigint)=>BigInt(value),
  SignerCkbPrivateKey:jest.fn(()=>({getRecommendedAddressObj:async()=>({script:mockLock(mockProxy)}),getRelatedScripts:mockRelated,signTransaction:mockSign})),
  ClientPublicTestnet:jest.fn(()=>mockClient),ClientPublicMainnet:jest.fn(()=>mockClient),
  Transaction:{fromBytes:()=>({...mockTx,inputs:mockTx.inputs.map(input=>({...input}))})},
  CellInput:{from:(value:unknown)=>value},CellOutput:{from:(value:unknown)=>value},Script:{from:(value:unknown)=>value},
}}));
jest.mock("../../../packages/ssri-ckboost/dist/generated/index.js",()=>({
  CampaignData:{decode:()=>mockCampaign},
  ConnectedTypeID:{decode:()=>({type_id:mockCampaignId,connected_key:mockProtocolHash}),encode:()=>mockConnected(mockCampaignId)},
  ProtocolData:{decode:()=>({endorsers_whitelist:[],protocol_config:{admin_lock_hash_vec:[mockProxy],script_code_hashes:{ckb_boost_campaign_type_code_hash:mockCampaignCode,ckb_boost_protocol_lock_code_hash:mockHash("a")}}})},
}));
jest.mock("@/lib/ckb/deployment-manager",()=>({deploymentManager:{getCurrentNetwork:()=>"testnet",getContractCodeHash:(network:string,name:string)=>name==="ckboostCampaignType"?mockCampaignCode:mockHash("8")}}));
jest.mock("@/netlify/lib/utils",()=>({getProtocolTypeScript:()=>mockProtocolScript}));
jest.mock("@/netlify/lib/streak-bonus",()=>({readUdtAmount:jest.fn()}));
jest.mock("@/netlify/lib/log",()=>({createLogger:()=>({info:jest.fn(),error:jest.fn()})}));
jest.mock("@/netlify/lib/proxy-admin",()=>({ensureProxyAdminCellPair:jest.fn(),ProxyAdminCellError:class extends Error{}}));

beforeEach(()=>{
  jest.clearAllMocks();
  mockRelated.mockResolvedValue([{script:mockLock(mockProxy),cellDeps:[]}]);
  mockTx.inputs=[{previousOutput:{txHash:"campaign",index:0}},{previousOutput:{txHash:"proxy",index:0}}];
  mockTx.outputs=[{type:{codeHash:mockCampaignCode},lock:mockLock(mockHash("a"))}];
  mockTx.outputsData=["campaign-next"];
});

it("rejects a proxy-only request in the actual HTTP handler before co-signing or adding proxy authority",async()=>{
  const previous=process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;
  process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY="test-only-key";
  try {
    const response=await handler({httpMethod:"POST",body:JSON.stringify({txHex:"0x00",campaignTypeId:mockCampaignId,questId:0,userTypeIds:[mockHash("9")]})} as Parameters<typeof handler>[0],{} as Parameters<typeof handler>[1],jest.fn());
    expect(response).toMatchObject({statusCode:403});
    expect(JSON.parse(response!.body ?? "{}")).toMatchObject({success:false,error:"reviewer_authorization_failed"});
    expect(mockClient.getCell).toHaveBeenCalledTimes(2);
    expect(mockClient.findCells).toHaveBeenCalledTimes(1);
    expect(ensureProxyAdminCellPair).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  } finally {
    if(previous===undefined)delete process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;else process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY=previous;
  }
});

it("rejects an assigned reviewer's attempt to attach a proxy-owned typed asset before signing",async()=>{
  const previous=process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;
  process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY="test-only-key";
  mockTx.inputs.push({previousOutput:{txHash:"staff",index:0}},{previousOutput:{txHash:"proxyAsset",index:0}});
  try {
    const response=await handler({httpMethod:"POST",body:JSON.stringify({txHex:"0x00",campaignTypeId:mockCampaignId,questId:0,userTypeIds:[mockHash("9")]})} as Parameters<typeof handler>[0],{} as Parameters<typeof handler>[1],jest.fn());
    expect(response).toMatchObject({statusCode:403});
    expect(JSON.parse(response!.body ?? "{}").message).toContain("Only one plain empty proxy");
    expect(mockClient.getCell).toHaveBeenCalledTimes(4);
    expect(ensureProxyAdminCellPair).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  } finally {
    if(previous===undefined)delete process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;else process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY=previous;
  }
});

it("rejects a server-controlled AnyoneCanPay lock posing as a separately assigned reviewer",async()=>{
  const previous=process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;
  process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY="test-only-key";
  mockTx.inputs.push({previousOutput:{txHash:"staff",index:0}});
  mockRelated.mockResolvedValue([{script:mockLock(mockProxy),cellDeps:[]},{script:mockLock(mockStaff),cellDeps:[]}]);
  try {
    const response=await handler({httpMethod:"POST",body:JSON.stringify({txHex:"0x00",campaignTypeId:mockCampaignId,questId:0,userTypeIds:[mockHash("9")]})} as Parameters<typeof handler>[0],{} as Parameters<typeof handler>[1],jest.fn());
    expect(response).toMatchObject({statusCode:403});
    expect(JSON.parse(response!.body ?? "{}").message).toContain("canonical authentication lock group");
    expect(mockRelated).toHaveBeenCalledTimes(1);
    expect(ensureProxyAdminCellPair).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  } finally {
    if(previous===undefined)delete process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;else process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY=previous;
  }
});

it("rejects an unrelated-key ACP reviewer's unsigned top-up transaction",async()=>{
  const previous=process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;
  process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY="test-only-key";
  mockTx.inputs.push({previousOutput:{txHash:"staff",index:0}});
  mockTx.outputs.push({lock:mockLock(mockStaff),capacity:101n});
  mockTx.outputsData.push("0x");
  try {
    const response=await handler({httpMethod:"POST",body:JSON.stringify({txHex:"0x00",campaignTypeId:mockCampaignId,questId:0,userTypeIds:[mockHash("9")]})} as Parameters<typeof handler>[0],{} as Parameters<typeof handler>[1],jest.fn());
    expect(response).toMatchObject({statusCode:403});
    expect(JSON.parse(response!.body ?? "{}").message).toContain("net capacity debit");
    expect(mockSign).not.toHaveBeenCalled();
  } finally {
    if(previous===undefined)delete process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY;else process.env.NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY=previous;
  }
});
