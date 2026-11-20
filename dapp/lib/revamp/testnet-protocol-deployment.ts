import {ccc, ssri} from "@ckb-ccc/connector-react";
import {Protocol} from "ssri-ckboost/protocol";
import {ConnectedTypeID, ProtocolData, TransactionRecipe, type ProtocolDataLike} from "ssri-ckboost/types";
import {assertTestnetDeploymentClient, deploymentReadDeadline, TESTNET_CODE_RELEASES, TYPE_ID_CODE_HASH, type DeploymentGuard} from "./testnet-code-deployment";

import {TESTNET_PROTOCOL_DEPENDENCY_PINS, type ProtocolDependencyName} from "./testnet-protocol-pins";
export {TESTNET_PROTOCOL_DEPENDENCY_PINS} from "./testnet-protocol-pins";
export type {ProtocolDependencyName} from "./testnet-protocol-pins";

export interface TestnetProtocolCode {
  name: ProtocolDependencyName | "ckboostProtocolLock" | "ckboostCampaignType";
  codeHash: ccc.Hex;
  hashType: "type";
  outPoint: {txHash: ccc.Hex; index: string};
  dataHash: ccc.Hex;
  dataBytes: number;
  typeScript?: {codeHash: ccc.Hex; hashType: "type"; args: ccc.Hex};
  lockScript?: {codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex};
  capacity?: string;
  blockNumber?: string;
}
export interface IsolatedTestnetProtocolProfile {
  schema: "ckboost-isolated-testnet-profile/v1";
  network: "testnet";
  executorUrl: string;
  dependencies: readonly TestnetProtocolCode[];
}
export interface IsolatedTestnetProfileInput {
  schema: "ckboost-isolated-testnet-profile/v1";
  network: "testnet";
  executorUrl: string;
  dependencies: readonly unknown[];
  newCode: {protocolLock: unknown; campaignType: unknown};
}
const H32=/^0x[0-9a-f]{64}$/i;
const HEX=/^0x(?:[0-9a-f]{2})*$/i;
const U64=0xffffffffffffffffn;
const METHOD=ccc.hexFrom(ccc.bytesFrom("CKBoostProtocol.update_protocol","utf8"));
function assert(value: unknown, message: string): asserts value {if(!value)throw new Error(message);}
function object(value:unknown):Record<string,unknown>{assert(value&&typeof value==="object"&&!Array.isArray(value),"Expected a public deployment object.");return value as Record<string,unknown>;}
function hash(value:unknown):ccc.Hex {assert(typeof value==="string"&&H32.test(value)&&!/^0x0{64}$/i.test(value),"A nonzero32-byte hash is required.");return value.toLowerCase() as ccc.Hex;}
function uint(value:unknown,max=U64):bigint {assert((typeof value==="string"&&/^(?:0x[0-9a-f]+|\d+)$/i.test(value))||typeof value==="bigint"||(typeof value==="number"&&Number.isSafeInteger(value)),"Invalid unsigned integer.");const n=BigInt(value as string|number|bigint);assert(n>=0n&&n<=max,"Unsigned integer outside its range.");return n;}
function script(value:unknown):ccc.Script {const v=object(value);hash(v.codeHash);assert(typeof v.args==="string"&&HEX.test(v.args)&&v.args.length<=16386,"Invalid script args.");assert(["type","data","data1","data2"].includes(String(v.hashType)),"Invalid script hash type.");const result=ccc.Script.from(v as unknown as ccc.ScriptLike);result.toBytes();return result;}
function publicScript(value:ccc.Script):{codeHash:ccc.Hex;hashType:ccc.HashType;args:ccc.Hex}{return {codeHash:value.codeHash,hashType:value.hashType,args:value.args};}
function outPoint(value:unknown):{txHash:ccc.Hex;index:string}{const v=object(value);return {txHash:hash(v.txHash),index:`0x${uint(v.index,0xffffffffn).toString(16)}`};}
function samePoint(a:ccc.OutPointLike,b:ccc.OutPointLike):boolean{return ccc.OutPoint.from(a).eq(ccc.OutPoint.from(b));}
function checkCurrent(isCurrent:DeploymentGuard):void{assert(isCurrent(),"Wallet, profile or operation changed. Prepare the isolated protocol again.");}
function executorUrl(value:unknown):string {assert(typeof value==="string","A local compatibility executor URL is required.");const url=new URL(value);assert(url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)&&url.port==="9091"&&url.pathname==="/"&&!url.username&&!url.password&&!url.search&&!url.hash,"Use the local SSRI compatibility bridge on9091.");return url.toString();}
function profileHash(profile:IsolatedTestnetProtocolProfile):ccc.Hex{return ccc.hashCkb(ccc.bytesFrom(JSON.stringify(profile),"utf8"));}

function normalizeNewCode(value:unknown,id:"protocol-lock"|"campaign-type"):TestnetProtocolCode {
  const v=object(value),pin=TESTNET_CODE_RELEASES[id];
  assert(v.schema==="ckboost-testnet-code-deployment/v1"&&v.network==="testnet"&&v.contract===id&&v.isTypeId===true&&v.hashType==="type","A confirmed Testnet code manifest is required.");
  assert(v.contractSize===pin.byteLength&&hash(v.dataHash)===pin.dataHash,"The new code must match the reviewed release bytes.");
  const type=script(v.typeScript);assert(type.codeHash===TYPE_ID_CODE_HASH&&type.hashType==="type"&&ccc.bytesFrom(type.args).length===32&&!/^0x0{64}$/i.test(type.args),"New code needs a real TypeID script.");
  assert(type.hash()===hash(v.typeHash),"New code TypeID script hash does not match its code hash.");
  const index=uint(v.index,0xffffffffn);assert(index===0n,"The reviewed code workbench creates its code output at index0.");
  const lock=script(v.lockScript),capacity=uint(v.capacityShannons);
  assert(capacity>=ccc.CellOutput.from({lock,type},new Uint8Array(pin.byteLength)).capacity,"New code capacity is below occupied capacity.");
  const blockNumber=uint(v.blockNumber);
  return {name:id==="protocol-lock"?"ckboostProtocolLock":"ckboostCampaignType",codeHash:type.hash(),hashType:"type",outPoint:{txHash:hash(v.transactionHash),index:"0x0"},dataHash:pin.dataHash,dataBytes:pin.byteLength,typeScript:publicScript(type) as TestnetProtocolCode["typeScript"],lockScript:publicScript(lock),capacity:capacity.toString(),blockNumber:`0x${blockNumber.toString(16)}`};
}

/** Reject incomplete/fake records before any network request. No singleton/env writes. */
export function validateIsolatedTestnetProfile(value:unknown):IsolatedTestnetProtocolProfile {
  const v=object(value);
  assert(v.schema==="ckboost-isolated-testnet-profile/v1"&&v.network==="testnet","An explicit isolated Testnet profile is required.");
  assert(Array.isArray(v.dependencies)&&v.dependencies.length===7,"All seven pinned reusable code dependencies are required.");
  const dependencies:TestnetProtocolCode[]=TESTNET_PROTOCOL_DEPENDENCY_PINS.map(pin=>{
    const matches=(v.dependencies as unknown[]).map(object).filter(item=>item.name===pin.name);
    assert(matches.length===1,`Missing or duplicate dependency: ${pin.name}.`);
    const item=matches[0],point=outPoint(item.outPoint);
    assert(hash(item.codeHash)===pin.codeHash&&item.hashType==="type"&&hash(item.dataHash)===pin.dataHash&&item.dataBytes===pin.dataBytes&&samePoint(point,pin.outPoint),`Unreviewed dependency identity: ${pin.name}.`);
    return {name:pin.name,codeHash:pin.codeHash,hashType:"type",outPoint:point,dataHash:pin.dataHash,dataBytes:pin.dataBytes};
  });
  const fresh=object(v.newCode);
  dependencies.push(normalizeNewCode(fresh.protocolLock,"protocol-lock"),normalizeNewCode(fresh.campaignType,"campaign-type"));
  assert(new Set(dependencies.map(item=>item.codeHash)).size===9,"Code script identities must be distinct.");
  assert(new Set(dependencies.map(item=>`${item.outPoint.txHash}:${item.outPoint.index}`)).size===9,"Code outpoints must be distinct.");
  return {schema:"ckboost-isolated-testnet-profile/v1",network:"testnet",executorUrl:executorUrl(v.executorUrl),dependencies};
}
function code(profile:IsolatedTestnetProtocolProfile,name:TestnetProtocolCode["name"]):TestnetProtocolCode {const result=profile.dependencies.find(item=>item.name===name);assert(result,`Missing code: ${name}.`);return result;}
/** Public normalized profile is revalidated through its original manifest data. */
export function revalidateProfile(profile:IsolatedTestnetProtocolProfile):IsolatedTestnetProtocolProfile {
  const manifest=(name:"ckboostProtocolLock"|"ckboostCampaignType",id:"protocol-lock"|"campaign-type")=>{const item=code(profile,name);return {schema:"ckboost-testnet-code-deployment/v1",network:"testnet",contract:id,isTypeId:true,hashType:item.hashType,contractSize:item.dataBytes,dataHash:item.dataHash,typeScript:item.typeScript,typeHash:item.codeHash,transactionHash:item.outPoint.txHash,index:item.outPoint.index,lockScript:item.lockScript,capacityShannons:item.capacity,blockNumber:item.blockNumber};};
  return validateIsolatedTestnetProfile({...profile,dependencies:profile.dependencies.filter(item=>TESTNET_PROTOCOL_DEPENDENCY_PINS.some(pin=>pin.name===item.name)),newCode:{protocolLock:manifest("ckboostProtocolLock","protocol-lock"),campaignType:manifest("ckboostCampaignType","campaign-type")}});
}

export function buildIsolatedTestnetProtocolData(profile:IsolatedTestnetProtocolProfile,adminLockHash:ccc.HexLike,now=Date.now()):ProtocolDataLike {
  const checked=revalidateProfile(profile),admin=hash(ccc.hexFrom(adminLockHash));
  assert(Number.isSafeInteger(now)&&now>=0,"Invalid protocol creation timestamp.");
  return {protocol_config:{admin_lock_hash_vec:[admin],script_code_hashes:{
    ckb_boost_protocol_type_code_hash:code(checked,"ckboostProtocolType").codeHash,
    ckb_boost_protocol_lock_code_hash:code(checked,"ckboostProtocolLock").codeHash,
    ckb_boost_campaign_type_code_hash:code(checked,"ckboostCampaignType").codeHash,
    ckb_boost_funding_lock_code_hash:code(checked,"ckboostFundingLock").codeHash,
    ckb_boost_user_type_code_hash:code(checked,"ckboostUserType").codeHash,
    ckb_boost_points_udt_type_code_hash:code(checked,"ckboostPointsUdt").codeHash,
    ckb_boost_tipping_type_code_hash:code(checked,"ckboostTippingType").codeHash,
    ckb_boost_achievement_type_code_hash:code(checked,"ckboostAchievementType").codeHash,
    accepted_udt_type_scripts:[],accepted_dob_type_scripts:[]},streak_bonus_interval:0,streak_bonus_amount:0,achievement_type_hashes:[]},
    campaigns_approved:[],tippings_approved:[],endorsers_whitelist:[],last_updated:BigInt(now),
    tipping_config:{approval_requirement_thresholds:[100000000000n,500000000000n,1000000000000n],expiration_duration:2592000}};
}

async function liveCode(client:ccc.Client,item:TestnetProtocolCode,isCurrent:DeploymentGuard):Promise<void> {
  checkCurrent(isCurrent);
  const cell=await deploymentReadDeadline(client.getCellLive(item.outPoint,true,false),12000);checkCurrent(isCurrent);
  assert(cell&&samePoint(cell.outPoint,item.outPoint)&&cell.cellOutput.type?.hash()===item.codeHash&&cell.cellOutput.type.codeHash===TYPE_ID_CODE_HASH&&cell.cellOutput.type.hashType==="type"&&ccc.bytesFrom(cell.cellOutput.type.args).length===32&&ccc.bytesFrom(cell.outputData).length===item.dataBytes&&ccc.hashCkb(cell.outputData)===item.dataHash,`Live code identity mismatch: ${item.name}.`);
  if(item.typeScript){
    assert(cell.cellOutput.type.eq(item.typeScript)&&cell.cellOutput.lock.eq(item.lockScript!)&&cell.cellOutput.capacity===BigInt(item.capacity!),"New code cell differs from its confirmed manifest.");
    const result=await deploymentReadDeadline(client.getTransaction(item.outPoint.txHash),12000);checkCurrent(isCurrent);
    assert(result?.status==="committed"&&result.blockNumber!==undefined&&result.blockNumber===BigInt(item.blockNumber!)&&result.transaction.hash()===item.outPoint.txHash,"New code deployment is not independently confirmed.");
    const index=Number(BigInt(item.outPoint.index));
    assert(result.transaction.inputs.length>0&&ccc.hashTypeId(result.transaction.inputs[0],index)===cell.cellOutput.type.args,"New code record is not a fresh TypeID creation.");
    assert(result.transaction.outputs[index]?.eq(cell.cellOutput)&&result.transaction.outputsData[index]===cell.outputData,"New code transaction output does not match its live cell.");
  }
}
export async function verifyProfile(profile:IsolatedTestnetProtocolProfile,client:ccc.Client,isCurrent:DeploymentGuard):Promise<void> {
  profile=revalidateProfile(profile);
  assertTestnetDeploymentClient(client);
  for(let i=0;i<profile.dependencies.length;i+=3)await Promise.all(profile.dependencies.slice(i,i+3).map(item=>liveCode(client,item,isCurrent)));
  checkCurrent(isCurrent);
}
async function wallet(signer:ccc.Signer,expected:ccc.Script|undefined,isCurrent:DeploymentGuard):Promise<ccc.Script> {
  checkCurrent(isCurrent);assertTestnetDeploymentClient(signer.client);
  const address=await deploymentReadDeadline(signer.getRecommendedAddressObj(),12000);checkCurrent(isCurrent);
  const current=address.script.clone();assert(!expected||current.eq(expected),"Connected wallet changed. Prepare again.");return current;
}
function readonlySigner(signer:ccc.Signer,fundingLock:ccc.Script,isCurrent:DeploymentGuard):ccc.Signer {
  const forbidden=new Set(["sendTransaction","sendTransactionNoCache","signTransaction","signOnlyTransaction","signMessage","signMessageRaw"]);
  const guardResult=(value:unknown):unknown=>{
    if(value&&typeof value==="object"&&Symbol.asyncIterator in value)return(async function*(){const iterator=(value as AsyncIterable<unknown>)[Symbol.asyncIterator]();try{while(true){checkCurrent(isCurrent);const next=await iterator.next();checkCurrent(isCurrent);if(next.done)return;yield next.value;}}finally{await iterator.return?.();}})();
    if(value&&typeof(value as PromiseLike<unknown>).then==="function")return Promise.resolve(value).then(result=>{checkCurrent(isCurrent);return result;});
    return value;
  };
  const wrap=(target:object)=>new Proxy(target,{get(object,key){if(forbidden.has(String(key)))return()=>{throw new Error("Unsigned preparation cannot sign or broadcast.");};const value=Reflect.get(object,key,object);if(typeof value!=="function")return value;return(...args:unknown[])=>{checkCurrent(isCurrent);return guardResult(value.apply(object,args));};}});
  const client=wrap(signer.client);
  return new Proxy(signer,{get(target,key){if(key==="client")return client;
    if(key==="findCells")return()=>guardResult((async function*(){
      // All callers here collect CKB capacity only. Do not traverse a signer's
      // related Omni/PW locks or yield existing typed code/protocol cells.
      const source=(client as ccc.Client).findCells({script:fundingLock,scriptType:"lock",scriptSearchMode:"exact",withData:true,filter:{scriptLenRange:[0,1],outputDataLenRange:[0,1]}});
      for await(const cell of source){checkCurrent(isCurrent);if(!cell.cellOutput.type&&cell.outputData==="0x"&&cell.cellOutput.lock.eq(fundingLock))yield cell;}
    })());if(forbidden.has(String(key)))return()=>{throw new Error("Unsigned preparation cannot sign or broadcast.");};const value=Reflect.get(target,key,target);return typeof value==="function"?(...args:unknown[])=>{checkCurrent(isCurrent);return guardResult(value.apply(target,args));}:value;}});
}
async function plainInputs(tx:ccc.Transaction,signer:ccc.Signer,lock:ccc.Script,isCurrent:DeploymentGuard):Promise<bigint> {
  assert(tx.inputs.length>0&&tx.inputs.length<=100,"A bounded set of plain wallet inputs is required.");let total=0n;const seen=new Set<string>();
  for(const input of tx.inputs){checkCurrent(isCurrent);const key=ccc.hexFrom(input.toBytes());assert(!seen.has(`${input.previousOutput.txHash}:${input.previousOutput.index}`),"Duplicate funding input.");seen.add(`${input.previousOutput.txHash}:${input.previousOutput.index}`);const cell=await deploymentReadDeadline(signer.client.getCellLive(input.previousOutput,true,false),12000);checkCurrent(isCurrent);assert(cell&&samePoint(cell.outPoint,input.previousOutput)&&!cell.cellOutput.type&&cell.outputData==="0x"&&cell.cellOutput.lock.eq(lock),"Only live empty untyped inputs owned by this wallet may fund a fresh protocol.");assert(key===ccc.hexFrom(input.toBytes()),"Funding input changed during verification.");total+=cell.cellOutput.capacity;}
  return total;
}
function witnessAt(tx:ccc.Transaction,index:number):ccc.WitnessArgs|undefined {const raw=tx.witnesses[index];return raw&&raw!=="0x"?ccc.WitnessArgs.fromBytes(raw):undefined;}
function recipeAt(tx:ccc.Transaction,index:number):ccc.Hex {
  const raw=witnessAt(tx,index)?.outputType;assert(raw&&raw!=="0x","Protocol output recipe is missing.");
  const decoded=TransactionRecipe.decode(raw);assert(ccc.hexFrom(TransactionRecipe.encode(decoded))===raw&&ccc.hexFrom(decoded.method_path)===METHOD&&decoded.arguments.length===1&&decoded.cell_deps==null&&decoded.header_deps==null,"Unexpected protocol creation recipe.");
  const argument=decoded.arguments[0],reference=ccc.bytesFrom(argument.data);
  assert(argument.arg_type===2&&reference.length===4&&new DataView(reference.buffer,reference.byteOffset,reference.byteLength).getUint32(0,true)===index,"Protocol recipe must reference its exact Output data index.");
  for(let i=0;i<tx.witnesses.length;i++)if(i!==index){let other;try{other=witnessAt(tx,i);}catch{continue;}assert(!other?.outputType||other.outputType==="0x","Additional protocol recipes are not allowed.");}
  return raw;
}

export interface PreparedTestnetProtocolDeployment {
  profile:IsolatedTestnetProtocolProfile; profileHash:ccc.Hex; tx:ccc.Transaction; bodyHash:ccc.Hex;
  protocolOutputIndex:number; typeScript:ccc.Script; typeHash:ccc.Hex; protocolDataHex:ccc.Hex; dataHash:ccc.Hex;
  capacity:bigint; fee:bigint; walletLock:ccc.Script; walletAddress:string; recipe:ccc.Hex; firstInput:ccc.Hex;
}
export function assertPreparedTestnetProtocol(prepared:PreparedTestnetProtocolDeployment,tx=prepared.tx):void {
  const profile=revalidateProfile(prepared.profile),index=prepared.protocolOutputIndex;
  assert(profileHash(profile)===prepared.profileHash&&index===0,"Isolated profile/output position changed.");
  assert(tx.inputs.length>0,"Protocol funding input is missing.");
  const output=tx.outputs[index];assert(output&&output.type?.eq(prepared.typeScript)&&prepared.typeHash===prepared.typeScript.hash()&&output.type.codeHash===code(profile,"ckboostProtocolType").codeHash&&output.type.hashType==="type"&&output.type.args===ccc.hashTypeId(tx.inputs[0],index)&&ccc.hexFrom(tx.inputs[0].toBytes())===prepared.firstInput,"Protocol TypeID/first input changed.");
  const expectedLock=ccc.Script.from({codeHash:code(profile,"ckboostProtocolLock").codeHash,hashType:code(profile,"ckboostProtocolLock").hashType,args:ccc.hexFrom(ConnectedTypeID.encode({type_id:prepared.walletLock.hash(),connected_key:prepared.typeHash}))});
  const data=ProtocolData.decode(prepared.protocolDataHex);
  const rebuilt=buildIsolatedTestnetProtocolData(profile,prepared.walletLock.hash(),Number(data.last_updated));
  assert(ccc.hexFrom(ProtocolData.encode(rebuilt))===prepared.protocolDataHex&&ccc.hashCkb(prepared.protocolDataHex)===prepared.dataHash&&output.lock.eq(expectedLock)&&tx.outputsData[index]===prepared.protocolDataHex&&output.capacity===prepared.capacity&&output.capacity===ccc.CellOutput.from({lock:expectedLock,type:output.type},prepared.protocolDataHex).capacity,"Protocol contents/owner/capacity changed.");
  assert(tx.outputs.length===tx.outputsData.length,"Output data vector changed.");
  for(let i=0;i<tx.outputs.length;i++)if(i!==index)assert(!tx.outputs[i].type&&tx.outputsData[i]==="0x"&&tx.outputs[i].lock.eq(prepared.walletLock),"Only empty change to the connected wallet is allowed.");
  assert(tx.hash()===prepared.bodyHash,"Prepared protocol body changed.");
  assert(recipeAt(tx,index)===prepared.recipe,"Protocol recipe changed during wallet preparation.");
  assert(tx.cellDeps.some(dep=>dep.depType==="code"&&samePoint(dep.outPoint,code(profile,"ckboostProtocolType").outPoint))&&tx.cellDeps.some(dep=>dep.depType==="code"&&samePoint(dep.outPoint,code(profile,"ckboostProtocolLock").outPoint)),"Protocol code dependencies are missing.");
}

/** Read-only build. It neither calls a wallet signature nor broadcasts or changes config. */
export async function prepareTestnetProtocolDeployment(signer:ccc.Signer,input:IsolatedTestnetProfileInput,isCurrent:DeploymentGuard=()=>true):Promise<PreparedTestnetProtocolDeployment> {
  let active=true;const current=()=>active&&isCurrent();
  const run=async()=>{
    const profile=validateIsolatedTestnetProfile(input),expectedProfileHash=profileHash(profile),lock=await wallet(signer,undefined,current);
    await verifyProfile(profile,signer.client,current);await wallet(signer,lock,current);
    const safeSigner=readonlySigner(signer,lock,current),seed=ccc.Transaction.from({});
    await seed.completeInputsAtLeastOne(safeSigner);await plainInputs(seed,signer,lock,current);
    assert(seed.outputs.length===0&&seed.outputsData.length===0,"Fresh protocol seed cannot contain outputs.");
    const firstInput=ccc.hexFrom(seed.inputs[0].toBytes()),data=buildIsolatedTestnetProtocolData(profile,lock.hash()),protocolDataHex=ccc.hexFrom(ProtocolData.encode(data));
    const protocolCode=code(profile,"ckboostProtocolType");
    const sdk=new Protocol(protocolCode.outPoint,{codeHash:protocolCode.codeHash,hashType:protocolCode.hashType,args:"0x"},{executor:new ssri.ExecutorJsonRpc(profile.executorUrl)});
    const result=await sdk.updateProtocol(safeSigner,data,seed);checkCurrent(current);
    const tx=ccc.Transaction.fromBytes(result.res.toBytes());
    assert(tx.inputs.length===seed.inputs.length&&tx.inputs.every((value,index)=>ccc.hexFrom(value.toBytes())===ccc.hexFrom(seed.inputs[index].toBytes()))&&tx.outputs.length===1&&tx.outputsData.length===1,"SSRI changed the fresh seed or added unexpected outputs.");
    const protocolOutputIndex=tx.outputs.findIndex(output=>output.type?.codeHash===protocolCode.codeHash);
    assert(protocolOutputIndex===0&&tx.outputs[0].type?.hashType==="type"&&tx.outputs[0].type.args===ccc.hashTypeId(tx.inputs[0],0)&&tx.outputsData[0]===protocolDataHex,"SSRI protocol TypeID/output data mismatch.");
    const typeScript=tx.outputs[0].type!.clone(),typeHash=typeScript.hash();
    const newLock=code(profile,"ckboostProtocolLock");
    tx.outputs[0]=ccc.CellOutput.from({lock:{codeHash:newLock.codeHash,hashType:newLock.hashType,args:ccc.hexFrom(ConnectedTypeID.encode({type_id:lock.hash(),connected_key:typeHash}))},type:typeScript},protocolDataHex);
    tx.addCellDeps({outPoint:protocolCode.outPoint,depType:"code"},{outPoint:newLock.outPoint,depType:"code"});
    const capacity=tx.outputs[0].capacity,recipe=recipeAt(tx,protocolOutputIndex);
    await tx.completeInputsByCapacity(safeSigner);await wallet(signer,lock,current);
    const walletPrepared=await safeSigner.prepareTransaction(tx);if(walletPrepared!==tx)tx.copy(walletPrepared);
    await tx.completeFeeBy(safeSigner);await wallet(signer,lock,current);
    const total=await plainInputs(tx,signer,lock,current),fee=total-tx.getOutputsCapacity();assert(fee>0n,"The prepared protocol must include a positive network fee.");
    const prepared={profile,profileHash:expectedProfileHash,tx,bodyHash:tx.hash(),protocolOutputIndex,typeScript,typeHash,protocolDataHex,dataHash:ccc.hashCkb(protocolDataHex),capacity,fee,walletLock:lock,walletAddress:new ccc.Address(lock,"ckt").toString(),recipe,firstInput};
    assertPreparedTestnetProtocol(prepared);checkCurrent(current);return prepared;
  };
  try{return await deploymentReadDeadline(run(),120000);}finally{active=false;}
}
