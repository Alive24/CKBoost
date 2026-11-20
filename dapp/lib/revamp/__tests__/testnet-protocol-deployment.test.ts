import {ccc} from "@ckb-ccc/connector-react";
import {Protocol} from "ssri-ckboost/protocol";
import {ConnectedTypeID, ProtocolData, TransactionRecipe, type ProtocolDataLike} from "ssri-ckboost/types";
import {TESTNET_CODE_RELEASES, TYPE_ID_CODE_HASH} from "../testnet-code-deployment";
import {TESTNET_PROTOCOL_DEPENDENCY_PINS, assertPreparedTestnetProtocol, buildIsolatedTestnetProtocolData, prepareTestnetProtocolDeployment, validateIsolatedTestnetProfile, type IsolatedTestnetProfileInput} from "../testnet-protocol-deployment";

jest.mock("@ckb-ccc/connector-react",()=>({ccc:jest.requireActual("@ckb-ccc/core"),ssri:{ExecutorJsonRpc:jest.fn()}}));
const mockUpdate=jest.fn();
jest.mock("ssri-ckboost/protocol",()=>({Protocol:jest.fn().mockImplementation(()=>({updateProtocol:(...args:unknown[])=>mockUpdate(...args)}))}),{virtual:true});
jest.mock("../../../../packages/ssri-ckboost/dist/protocol",()=>({Protocol:jest.fn().mockImplementation(()=>({updateProtocol:(...args:unknown[])=>mockUpdate(...args)}))}));
const hash=(byte:number)=>`0x${byte.toString(16).padStart(2,"0").repeat(32)}` as ccc.Hex;
const lock=ccc.Script.from({codeHash:hash(0xab),hashType:"data1",args:`0x${"11".repeat(22)}`});
const address=new ccc.Address(lock,"ckt");
const method=ccc.hexFrom(ccc.bytesFrom("CKBoostProtocol.update_protocol","utf8"));
function recipe(index=0,patch:Record<string,unknown>={}) {const data=new Uint8Array(4);new DataView(data.buffer).setUint32(0,index,true);return ccc.hexFrom(TransactionRecipe.encode({method_path:method,arguments:[{arg_type:2,data:ccc.hexFrom(data)}],...patch}));}
function setup() {
  // Synthetic reviewed code identities exist only inside this isolated test.
  // No test calls a network, signer implementation, or actual faucet/deployment.
  const cells=new Map<string,ccc.Cell>(),transactions=new Map<string,{transaction:ccc.Transaction;status:"committed";blockNumber:bigint}>();
  const key=(point:ccc.OutPointLike)=>`${point.txHash}:${ccc.numFrom(point.index??0)}`;
  for(const [index,pin] of TESTNET_PROTOCOL_DEPENDENCY_PINS.entries()) {
    const data=ccc.hexFrom(new Uint8Array(64+index).fill(index+1));
    const type=ccc.Script.from({codeHash:TYPE_ID_CODE_HASH,hashType:"type",args:hash(index+1)});
    const mutable=pin as unknown as {codeHash:string;dataHash:string;dataBytes:number};
    jest.replaceProperty(mutable,"codeHash",type.hash());jest.replaceProperty(mutable,"dataHash",ccc.hashCkb(data));jest.replaceProperty(mutable,"dataBytes",64+index);
    cells.set(key(pin.outPoint),ccc.Cell.from({outPoint:pin.outPoint,cellOutput:ccc.CellOutput.from({lock,type},data),outputData:data}));
  }
  const newCode=(id:"protocol-lock"|"campaign-type",index:number)=>{
    const raw=ccc.hexFrom(new Uint8Array(100+index).fill(77+index));
    const release=TESTNET_CODE_RELEASES[id] as unknown as {byteLength:number;dataHash:string};jest.replaceProperty(release,"byteLength",100+index);jest.replaceProperty(release,"dataHash",ccc.hashCkb(raw));
    const input=ccc.CellInput.from({previousOutput:{txHash:hash(index+90),index:0}}),type=ccc.Script.from({codeHash:TYPE_ID_CODE_HASH,hashType:"type",args:ccc.hashTypeId(input,0)});
    const output=ccc.CellOutput.from({lock,type},raw),tx=ccc.Transaction.from({inputs:[input],outputs:[output],outputsData:[raw]});
    const point={txHash:tx.hash(),index:0};cells.set(key(point),ccc.Cell.from({outPoint:point,cellOutput:output,outputData:raw}));transactions.set(tx.hash(),{transaction:tx,status:"committed",blockNumber:123n});
    return {schema:"ckboost-testnet-code-deployment/v1",network:"testnet",contract:id,contractSize:100+index,dataHash:ccc.hashCkb(raw),typeHash:type.hash(),typeScript:{codeHash:type.codeHash,hashType:type.hashType,args:type.args},transactionHash:tx.hash(),index:"0x0",blockNumber:"0x7b",lockScript:{codeHash:lock.codeHash,hashType:lock.hashType,args:lock.args},capacityShannons:output.capacity.toString(),isTypeId:true,hashType:"type"};
  };
  const input:IsolatedTestnetProfileInput={schema:"ckboost-isolated-testnet-profile/v1",network:"testnet",executorUrl:"http://127.0.0.1:9091",dependencies:TESTNET_PROTOCOL_DEPENDENCY_PINS.map(pin=>({...pin,outPoint:{...pin.outPoint}})),newCode:{protocolLock:newCode("protocol-lock",1),campaignType:newCode("campaign-type",2)}};
  const funding=ccc.Cell.from({outPoint:{txHash:hash(0xf0),index:0},cellOutput:{capacity:ccc.fixedPointFrom(10000),lock},outputData:"0x"});cells.set(key(funding.outPoint),funding);
  const client={addressPrefix:"ckt",url:"https://testnet.ckb.dev/",findCells:jest.fn(async function*(_key:unknown){yield funding;}),getCellLive:jest.fn(async(point:ccc.OutPointLike)=>cells.get(key(point))),getTransaction:jest.fn(async(txHash:string)=>transactions.get(txHash)),sendTransaction:jest.fn()};
  const signer={client,getRecommendedAddressObj:jest.fn(async()=>address),prepareTransaction:jest.fn(async(tx:ccc.Transaction)=>tx),signTransaction:jest.fn(),sendTransaction:jest.fn()} as unknown as ccc.Signer;
  jest.spyOn(ccc.Transaction.prototype,"completeInputsAtLeastOne").mockImplementation(async function(this:ccc.Transaction){this.addInput(funding);return 1;});
  jest.spyOn(ccc.Transaction.prototype,"completeInputsByCapacity").mockResolvedValue(0);
  jest.spyOn(ccc.Transaction.prototype,"completeFeeBy").mockImplementation(async function(this:ccc.Transaction){this.outputs.push(ccc.CellOutput.from({lock,capacity:funding.cellOutput.capacity-this.getOutputsCapacity()-1000n}));this.outputsData.push("0x");return [0,true];});
  mockUpdate.mockImplementation(async(_signer:ccc.Signer,data:ProtocolDataLike,seed:ccc.Transaction)=>{
    const tx=seed.clone(),type=ccc.Script.from({codeHash:TESTNET_PROTOCOL_DEPENDENCY_PINS[0].codeHash,hashType:"type",args:ccc.hashTypeId(tx.inputs[0],0)});
    tx.outputs.push(ccc.CellOutput.from({lock,type},ProtocolData.encode(data)));tx.outputsData.push(ccc.hexFrom(ProtocolData.encode(data)));
    tx.witnesses=[ccc.hexFrom(ccc.WitnessArgs.encode({outputType:recipe()}))];return {res:tx};
  });
  return {input,cells,transactions,key,funding,client,signer};
}
afterEach(()=>{jest.restoreAllMocks();mockUpdate.mockReset();});

describe("isolated Testnet protocol unsigned bootstrap",()=>{
  it("rejects missing, changed, duplicate or mainnet profile records before reading the network",()=>{
    const {input}=setup();
    expect(validateIsolatedTestnetProfile(input).dependencies).toHaveLength(9);
    expect(()=>validateIsolatedTestnetProfile({...input,network:"mainnet"})).toThrow("Testnet");
    expect(()=>validateIsolatedTestnetProfile({...input,dependencies:input.dependencies.slice(1)})).toThrow("seven");
    expect(()=>validateIsolatedTestnetProfile({...input,dependencies:input.dependencies.map((value,index)=>index===0?{...(value as object),codeHash:hash(0xee)}:value)})).toThrow("Unreviewed");
    expect(()=>validateIsolatedTestnetProfile({...input,dependencies:[input.dependencies[0],...input.dependencies.slice(0,6)]})).toThrow("duplicate");
    expect(()=>validateIsolatedTestnetProfile({...input,newCode:{...input.newCode,protocolLock:null}})).toThrow("object");
    expect(()=>validateIsolatedTestnetProfile({...input,executorUrl:"https://attacker.example/"})).toThrow("local");
  });
  it("rejects invented/unpinned new deployment hashes or data before any network",()=>{
    const {input}=setup(),manifest=input.newCode.protocolLock as Record<string,unknown>;
    expect(()=>validateIsolatedTestnetProfile({...input,newCode:{...input.newCode,protocolLock:{...manifest,dataHash:hash(0xaa)}}})).toThrow("release");
    expect(()=>validateIsolatedTestnetProfile({...input,newCode:{...input.newCode,protocolLock:{...manifest,typeHash:hash(0xaa)}}})).toThrow("TypeID");
    expect(()=>validateIsolatedTestnetProfile({...input,newCode:{...input.newCode,protocolLock:{...manifest,index:"0x1"}}})).toThrow("index0");
  });
  it("builds exactly one current-wallet admin with independent code hashes and no approvals/Organizer grants",()=>{
    const {input}=setup(),profile=validateIsolatedTestnetProfile(input),data=ProtocolData.decode(ProtocolData.encode(buildIsolatedTestnetProtocolData(profile,lock.hash(),1795000000000)));
    expect(data.protocol_config.admin_lock_hash_vec).toEqual([lock.hash()]);expect(data.endorsers_whitelist).toEqual([]);expect(data.campaigns_approved).toEqual([]);expect(data.tippings_approved).toEqual([]);
    expect(data.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash).toBe(profile.dependencies[7].codeHash);
  });
  it("freshly verifies all9code cells, then prepares TypeID/owner/actual capacity/fee without signing or sending",async()=>{
    const {input,signer,client}=setup(),prepared=await prepareTestnetProtocolDeployment(signer,input);
    expect(client.getCellLive.mock.calls.length).toBeGreaterThanOrEqual(11);expect(client.getTransaction).toHaveBeenCalledTimes(2);
    expect(Protocol).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({args:"0x"}),expect.anything());
    expect(prepared.protocolOutputIndex).toBe(0);expect(prepared.typeScript.args).toBe(ccc.hashTypeId(prepared.tx.inputs[0],0));expect(prepared.tx.outputs[0].lock.hashType).toBe("type");
    expect(lock.hashType).toBe("data1"); // The funding lock hash type must never leak into protocol code binding.
    expect(ConnectedTypeID.decode(prepared.tx.outputs[0].lock.args)).toEqual({type_id:lock.hash(),connected_key:prepared.typeHash});
    expect(prepared.capacity).toBe(ccc.CellOutput.from({lock:prepared.tx.outputs[0].lock,type:prepared.typeScript},prepared.protocolDataHex).capacity);expect(prepared.fee).toBe(1000n);
    expect(signer.signTransaction).not.toHaveBeenCalled();expect(signer.sendTransaction).not.toHaveBeenCalled();expect(client.sendTransaction).not.toHaveBeenCalled();expect(()=>assertPreparedTestnetProtocol(prepared)).not.toThrow();
  });
  it("collects only the recommended complete lock and skips its typed code cells/related locks",async()=>{
    const {input,signer,client,funding}=setup();
    jest.mocked(ccc.Transaction.prototype.completeInputsAtLeastOne).mockRestore();
    const typed=ccc.Cell.from({outPoint:{txHash:hash(0xf2),index:0},cellOutput:{capacity:ccc.fixedPointFrom(10000),lock,type:{codeHash:hash(9),hashType:"type",args:"0x"}},outputData:"0x"});
    const related=ccc.Cell.from({outPoint:{txHash:hash(0xf3),index:0},cellOutput:{capacity:ccc.fixedPointFrom(10000),lock:{codeHash:lock.codeHash,hashType:lock.hashType,args:"0x1234"}},outputData:"0x"});
    const nonempty=ccc.Cell.from({outPoint:{txHash:hash(0xf4),index:0},cellOutput:{capacity:ccc.fixedPointFrom(10000),lock},outputData:"0x01"});
    client.findCells.mockImplementation(async function*(){yield typed;yield related;yield nonempty;yield funding;});
    const prepared=await prepareTestnetProtocolDeployment(signer,input);
    expect(prepared.tx.inputs[0].previousOutput.eq(funding.outPoint)).toBe(true);
    const query=client.findCells.mock.calls[0][0] as ccc.ClientIndexerSearchKeyLike;
    expect(ccc.Script.from(query.script).eq(lock)).toBe(true);expect(query).toMatchObject({scriptType:"lock",scriptSearchMode:"exact",withData:true,filter:{scriptLenRange:[0,1],outputDataLenRange:[0,1]}});
  });
  it.each(["spent","bytes","type"] as const)("rejects %s reusable code instead of falling back to a global deployment",async kind=>{
    const {input,signer,cells,key}=setup(),pin=TESTNET_PROTOCOL_DEPENDENCY_PINS[0],cell=cells.get(key(pin.outPoint))!;
    if(kind==="spent")cells.delete(key(pin.outPoint));else if(kind==="bytes")cell.outputData="0x";else cell.cellOutput.type=ccc.Script.from({codeHash:hash(22),hashType:"type",args:hash(33)});
    await expect(prepareTestnetProtocolDeployment(signer,input)).rejects.toThrow("Live code identity");expect(mockUpdate).not.toHaveBeenCalled();
  });
  it("rejects unconfirmed/upgrade-shaped new code receipts",async()=>{
    const {input,signer,transactions}=setup(),fresh=input.newCode.protocolLock as {transactionHash:ccc.Hex};
    transactions.get(fresh.transactionHash)!.transaction.inputs[0].since=1n;
    await expect(prepareTestnetProtocolDeployment(signer,input)).rejects.toThrow("independently confirmed");expect(mockUpdate).not.toHaveBeenCalled();
  });
  it("never consumes a typed or nonempty funding cell, before calling SSRI",async()=>{
    const {input,signer,funding}=setup();funding.cellOutput.type=ccc.Script.from({codeHash:hash(12),hashType:"type",args:"0x"});
    await expect(prepareTestnetProtocolDeployment(signer,input)).rejects.toThrow("Only live empty untyped");expect(mockUpdate).not.toHaveBeenCalled();
  });
  it("blocks wallet/scope changes before accepting old asynchronous reads",async()=>{
    const {input,signer,client}=setup();let active=true;
    client.getCellLive.mockImplementation(async()=>{active=false;return undefined;});
    await expect(prepareTestnetProtocolDeployment(signer,input,()=>active)).rejects.toThrow("changed");expect(mockUpdate).not.toHaveBeenCalled();
  });
  it.each(["method","input","index","deps","extra","lost"] as const)("rejects %s recipe corruption and never signs",async kind=>{
    const {input,signer}=setup(),normal=mockUpdate.getMockImplementation()!;
    mockUpdate.mockImplementation(async(...args:unknown[])=>{
      const value=await normal(...args) as {res:ccc.Transaction};
      let raw=recipe();
      if(kind==="method")raw=recipe(0,{method_path:ccc.hexFrom(ccc.bytesFrom("CKBoostCampaign.update_campaign","utf8"))});
      if(kind==="input")raw=recipe(0,{arguments:[{arg_type:1,data:"0x00000000"}]});
      if(kind==="index")raw=recipe(1);
      if(kind==="deps")raw=recipe(0,{cell_deps:[]});
      value.res.witnesses=[ccc.hexFrom(ccc.WitnessArgs.encode(kind==="lost"?{}:{outputType:raw}))];
      if(kind==="extra")value.res.witnesses.push(ccc.hexFrom(ccc.WitnessArgs.encode({outputType:raw})));
      return value;
    });
    await expect(prepareTestnetProtocolDeployment(signer,input)).rejects.toThrow(/recipe|Output data/);expect(signer.signTransaction).not.toHaveBeenCalled();
  });
  it.each(["recipe","input0","receiver","data","capacity","zero-fee"] as const)("rejects %s changes during fee preparation",async kind=>{
    const {input,signer,funding,cells,key}=setup();
    jest.spyOn(ccc.Transaction.prototype,"completeFeeBy").mockImplementation(async function(this:ccc.Transaction){
      if(kind==="recipe")this.witnesses=["0x"];
      if(kind==="input0"){
        const cell=ccc.Cell.from({outPoint:{txHash:hash(0xf1),index:0},cellOutput:funding.cellOutput,outputData:"0x"});cells.set(key(cell.outPoint),cell);this.inputs[0]=ccc.CellInput.from({previousOutput:cell.outPoint});
      }
      if(kind==="receiver"){this.outputs.push(ccc.CellOutput.from({lock:{codeHash:hash(0xaa),hashType:"type",args:"0x"},capacity:ccc.fixedPointFrom(61)}));this.outputsData.push("0x");}
      if(kind==="data")this.outputsData[0]="0x";
      if(kind==="capacity")this.outputs[0].capacity+=1n;
      if(kind==="zero-fee"){this.outputs.push(ccc.CellOutput.from({lock,capacity:funding.cellOutput.capacity-this.getOutputsCapacity()}));this.outputsData.push("0x");}
      return [0,false];
    });
    await expect(prepareTestnetProtocolDeployment(signer,input)).rejects.toThrow(/recipe|TypeID|Only empty|contents|fee/);
    expect(signer.signTransaction).not.toHaveBeenCalled();
  });
  it("rejects a committed upgrade-shaped code record even if its output bytes and type hash match",async()=>{
    const {input,signer,cells,transactions,key}=setup(),manifest=input.newCode.protocolLock as {transactionHash:ccc.Hex};
    const prior=manifest.transactionHash,record=transactions.get(prior)!,oldCell=cells.get(key({txHash:prior,index:0}))!;
    record.transaction.inputs[0].since=1n;const next=record.transaction.hash();manifest.transactionHash=next;
    cells.delete(key({txHash:prior,index:0}));cells.set(key({txHash:next,index:0}),ccc.Cell.from({outPoint:{txHash:next,index:0},cellOutput:oldCell.cellOutput,outputData:oldCell.outputData}));transactions.delete(prior);transactions.set(next,record);
    await expect(prepareTestnetProtocolDeployment(signer,input)).rejects.toThrow("not a fresh TypeID");expect(mockUpdate).not.toHaveBeenCalled();
  });
  it("detects raw body tampering before a future explicit signing boundary",async()=>{
    const {input,signer}=setup(),prepared=await prepareTestnetProtocolDeployment(signer,input);prepared.tx.outputs[1].capacity-=1n;
    expect(()=>assertPreparedTestnetProtocol(prepared)).toThrow("body changed");
  });
});
