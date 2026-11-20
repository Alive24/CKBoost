import { ccc } from "@ckb-ccc/connector-react";
import { injectProxyAuthenticationCell } from "@/lib/utils/api";

jest.mock("@ckb-ccc/connector-react",()=>({ccc:{Address:{fromString:jest.fn()},hexFrom:(value:unknown)=>value,CellOutput:{from:(value:unknown)=>value}}}));
jest.mock("../../../../packages/ssri-ckboost/dist/index.js",()=>({createScopedLogger:()=>({log:jest.fn()})}));
const proxyLock={args:"proxy"};
const candidate=(hash:string,data:string,type?:object)=>({outPoint:{txHash:hash,index:0},cellOutput:{capacity:1000n,lock:proxyLock,type},outputData:data});
const tx=()=>({addInput:jest.fn(),addOutput:jest.fn(),toBytes:()=>"0x"});

describe("proxy authentication input collection",()=>{
  beforeEach(()=>{jest.clearAllMocks();jest.mocked(ccc.Address.fromString).mockResolvedValue({script:proxyLock} as unknown as ccc.Address);});
  it("requests cell data and skips typed and nonempty-data proxy assets",async()=>{
    const cells=[candidate("nonempty","0x01"),candidate("typed","0x",{}),candidate("plain","0x")];
    const find=jest.fn(async function*(){yield* cells;});const signer={client:{findCellsByLock:find}} as unknown as ccc.Signer;const draft=tx();
    await injectProxyAuthenticationCell(signer,draft as unknown as ccc.Transaction);
    expect(find).toHaveBeenCalledWith(proxyLock,null,true);
    expect(draft.addInput).toHaveBeenCalledWith(cells[2]);expect(draft.addInput).toHaveBeenCalledTimes(1);
    expect(draft.addOutput).toHaveBeenCalledWith({capacity:1000n,lock:proxyLock});
  });
  it("fails before adding any input if only proxy assets or nonempty cells exist",async()=>{
    const signer={client:{findCellsByLock:async function*(){yield candidate("nonempty","0x01");yield candidate("typed","0x",{});}}} as unknown as ccc.Signer;const draft=tx();
    await expect(injectProxyAuthenticationCell(signer,draft as unknown as ccc.Transaction)).rejects.toThrow("not found");expect(draft.addInput).not.toHaveBeenCalled();
  });
});
