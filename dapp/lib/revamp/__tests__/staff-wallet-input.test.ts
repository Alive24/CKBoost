import {ccc} from "@ckb-ccc/connector-react";
import {CampaignAdminService} from "@/lib/services/campaign-admin-service";
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{hexFrom:(value:unknown)=>value}}));
jest.mock("../../../../packages/ssri-ckboost/dist/index.js",()=>({Campaign:class{},createScopedLogger:()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn(),log:jest.fn()})}));
jest.mock("../../../../packages/ssri-ckboost/dist/generated/index.js",()=>({CampaignData:{},ConnectedTypeID:{}}));
jest.mock("@/lib/ckb/user-cells",()=>({}));jest.mock("@/lib/ckb/campaign-cells",()=>({}));
jest.mock("@/lib/ckb/deployment-manager",()=>({deploymentManager:{}}));jest.mock("@/lib/services/udt-registry",()=>({udtRegistry:{}}));
jest.mock("@/lib/ckb/transaction-wrapper",()=>({}));jest.mock("@/lib/utils/api",()=>({}));jest.mock("@/lib/pending-transactions",()=>({}));jest.mock("@/lib/ckb/claimable-pool",()=>({}));

it("adds a genuinely empty staff wallet input when an existing own untyped input contains data",async()=>{
  const script={hash:()=>"0xstaff"};
  const nonempty={outPoint:{txHash:"0xnonempty",index:0},cellOutput:{lock:script},outputData:"0x01"};
  const plain={outPoint:{txHash:"0xplain",index:0},cellOutput:{lock:script,capacity:1000n},outputData:"0x"};
  const signer={client:{getCell:jest.fn(async()=>nonempty),findCells:jest.fn(async function*(){yield plain;})}} as unknown as ccc.Signer;
  const service=new CampaignAdminService(signer,"0x00","0x00","0x00",null);
  const draft={inputs:[{previousOutput:nonempty.outPoint}],addInput:jest.fn()};
  await (service as unknown as {ensureSignerPlainCkbInput:(tx:ccc.Transaction,lock:ccc.Script)=>Promise<void>}).ensureSignerPlainCkbInput(draft as unknown as ccc.Transaction,script as unknown as ccc.Script);
  expect(draft.addInput).toHaveBeenCalledWith(expect.objectContaining({previousOutput:plain.outPoint,outputData:"0x"}));
  expect(draft.addInput).toHaveBeenCalledTimes(1);
});
