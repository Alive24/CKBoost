import { ccc } from "@ckb-ccc/core";
import { getIsolatedProtocolScope } from "../lib/isolated-protocol-scope";
import { resolveProtocolTypeScriptFromEnv } from "../lib/streak-bonus-loader";
import { handler as rewardHistory } from "../functions/reward-history";

const mockHash=(byte:string)=>`0x${byte.repeat(32)}` as ccc.Hex;
const mockProtocol={codeHash:mockHash("12"),hashType:"type" as const,args:mockHash("34")};
let mockRuntime:{protocol:{typeScript:typeof mockProtocol}}|null=null;
let mockInvalid=false;
const mockFindTransactions=jest.fn((_key:unknown,..._rest:unknown[])=>(async function*(){})());
jest.mock("@/lib/ckb/isolated-runtime.mjs",()=>({getIsolatedRuntime:()=>{if(mockInvalid)throw Error("Isolated QA configuration: invalid profile");return mockRuntime;}}));
jest.mock("@/lib/ckb/deployment-manager",()=>({deploymentManager:{getCurrentNetwork:()=>"testnet",getContractCodeHash:()=>mockHash("56")}}));
jest.mock("@ckb-ccc/shell",()=>({ccc:{...jest.requireActual("@ckb-ccc/core").ccc,
  ClientPublicTestnet:jest.fn(()=>({addressPrefix:"ckt",findTransactions:mockFindTransactions})),
}}));
jest.mock("@/netlify/lib/streak-bonus",()=>({readUdtAmount:jest.fn(),evaluateStreakBonus:jest.fn()}));
jest.mock("@/netlify/lib/log",()=>({createLogger:()=>({warn:jest.fn(),error:jest.fn()})}));
const envKeys=["NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH","NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE","NEXT_PUBLIC_PROTOCOL_TYPE_ARGS"] as const;
let previous:Record<string,string|undefined>;
beforeEach(()=>{previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));for(const key of envKeys)delete process.env[key];mockRuntime=null;mockInvalid=false;jest.clearAllMocks();});
afterEach(()=>{for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
const invokeHistory=()=>rewardHistory({httpMethod:"GET",queryStringParameters:{address:new ccc.Address(ccc.Script.from({codeHash:mockHash("9a"),hashType:"type",args:"0x"}),"ckt").toString()}} as unknown as Parameters<typeof rewardHistory>[0],{} as Parameters<typeof rewardHistory>[1],jest.fn());

it("uses validated exact QA identity even if legacy raw values are absent or belong to a different protocol",async()=>{
  mockRuntime={protocol:{typeScript:mockProtocol}};
  process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=mockHash("ab");process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=mockHash("cd");
  expect(getIsolatedProtocolScope()).toEqual(mockProtocol);
  const streak=resolveProtocolTypeScriptFromEnv();expect("script" in streak&&streak.script.hash()).toBe(ccc.Script.from(mockProtocol).hash());
  const response=await invokeHistory();expect(response).toMatchObject({statusCode:200});
  expect(JSON.parse(response!.body??"{}")).toMatchObject({protocolTypeHash:ccc.Script.from(mockProtocol).hash(),transactions:[]});
  expect(mockFindTransactions.mock.calls[0][0]).toMatchObject({scriptSearchMode:"exact",script:{args:ccc.Script.from(mockProtocol).hash()}});
});
it("retains normal legacy missing-env errors and explicit script hashType/args semantics",async()=>{
  expect(getIsolatedProtocolScope()).toBeNull();expect(resolveProtocolTypeScriptFromEnv()).toMatchObject({error:expect.stringContaining("environment variables missing")});
  const missing=await invokeHistory();expect(missing).toMatchObject({statusCode:500});expect(mockFindTransactions).not.toHaveBeenCalled();
  process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=mockHash("ab");process.env.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE="data1";process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS="0x1234";
  const expected=ccc.Script.from({codeHash:mockHash("ab"),hashType:"data1",args:"0x1234"}).hash();
  const streak=resolveProtocolTypeScriptFromEnv();expect("script" in streak&&streak.script.hash()).toBe(expected);
  const valid=await invokeHistory();expect(valid).toMatchObject({statusCode:200});expect(JSON.parse(valid!.body??"{}").protocolTypeHash).toBe(expected);
});
it("fails closed for invalid QA configuration instead of falling back to apparently valid legacy env",()=>{
  mockInvalid=true;process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=mockHash("ab");process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=mockHash("cd");
  expect(()=>getIsolatedProtocolScope()).toThrow("Isolated QA");expect(resolveProtocolTypeScriptFromEnv()).toMatchObject({error:expect.stringContaining("Isolated QA")});
  expect(mockFindTransactions).not.toHaveBeenCalled();
});
