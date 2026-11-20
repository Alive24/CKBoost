import { ccc } from "@ckb-ccc/core";
import { ConnectedTypeID, ProtocolData } from "ssri-ckboost/types";
import { TESTNET_PROTOCOL_DEPENDENCY_PINS } from "../testnet-protocol-pins";
import { TESTNET_CODE_RELEASES } from "../testnet-code-releases";
import { ISOLATED_QA_PINS, getIsolatedRuntime, isolatedRuntimeEnvironment, makeIndependentUserRuntimeConfig, makeIsolatedRuntimeConfig, makeUpgradedIsolatedRuntimeConfig, validateIsolatedRuntimeConfig } from "../../ckb/isolated-runtime.mjs";
import { PERMISSION_REVIEW_RELEASES, type PermissionReviewRelease } from "../../ckb/permissions-release-pins.mjs";
import { DeploymentManager } from "../../ckb/deployment-manager";
import { currentDeployment, getCurrentProtocolTypeScript } from "../../ckb/current-deployment";
import { getProtocolTypeScript } from "../../ckb/protocol-cells";
import { getClaimablePoolLockDeployment } from "../../ckb/claimable-pool";

jest.mock("ssri-ckboost/logging",()=>({createScopedLogger:()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn(),debug:jest.fn()})}));

const hash=(byte:string)=>`0x${byte.repeat(64/byte.length)}` as ccc.Hex;
const TYPE_ID="0x00000000000000000000000000000000000000000000000000545950455f4944" as ccc.Hex;
const owner=ccc.Script.from({codeHash:"0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",hashType:"type",args:"0x1270de01d042a23bfab1dc06375138b48ea03d006900"});
const plain=(s:ccc.Script)=>({codeHash:s.codeHash,hashType:s.hashType,args:s.args});
/** Explicitly synthetic manifests for offline consistency tests; never active config. */
function fixture(qaIdentity=false){
  const manifest=(id:"protocol-lock"|"campaign-type",byte:string)=>{const pin=TESTNET_CODE_RELEASES[id],isProtocol=id==="protocol-lock",args=qaIdentity?(isProtocol?"0x06661a546d171ae6f280f3f1363070c7d1e7ad7dc1032d566c7b16f804d57ab4":"0xfe4dcdc1378be473b33321f30db589d220a2947a0156aa41e809af6f1cae5027"):hash(byte),type=ccc.Script.from({codeHash:TYPE_ID,hashType:"type",args});return{schema:"ckboost-testnet-code-deployment/v1",network:"testnet",contract:id,hashType:"type",isTypeId:true,contractSize:pin.byteLength,dataHash:pin.dataHash,typeScript:plain(type),typeHash:type.hash(),transactionHash:qaIdentity?(isProtocol?"0xdb31514a0e178b3c5bd6f21d34a1cc20c0b7badbb3ebd6711c9bb2711a58a066":"0x72dc50dbe634b1746e2d6033009c751ff02ff6bceab7d601e9c36fbcfb1d4a3d"):hash(byte==="11"?"31":"32"),index:"0x0",lockScript:plain(owner),capacityShannons:ccc.CellOutput.from({lock:owner,type},new Uint8Array(pin.byteLength)).capacity.toString(),blockNumber:qaIdentity?(isProtocol?"0x160d049":"0x160d074"):"0x10"};};
  const protocolCode=manifest("protocol-lock","11"),campaignCode=manifest("campaign-type","22");
  const newRecord=(m:typeof protocolCode,name:string)=>({name,codeHash:m.typeHash,hashType:"type",outPoint:{txHash:m.transactionHash,index:"0x0"},dataHash:m.dataHash,dataBytes:m.contractSize,typeScript:m.typeScript,lockScript:m.lockScript,capacity:m.capacityShannons,blockNumber:m.blockNumber});
  const profile={schema:"ckboost-isolated-testnet-profile/v1",network:"testnet",executorUrl:"http://127.0.0.1:9091/",dependencies:[...TESTNET_PROTOCOL_DEPENDENCY_PINS.map(p=>({...p,outPoint:{...p.outPoint,index:"0x0"}})),newRecord(protocolCode,"ckboostProtocolLock"),newRecord(campaignCode,"ckboostCampaignType")]};
  const byName=(name:string)=>profile.dependencies.find(p=>p.name===name)!;
  const names={ckb_boost_protocol_type_code_hash:"ckboostProtocolType",ckb_boost_protocol_lock_code_hash:"ckboostProtocolLock",ckb_boost_campaign_type_code_hash:"ckboostCampaignType",ckb_boost_funding_lock_code_hash:"ckboostFundingLock",ckb_boost_user_type_code_hash:"ckboostUserType",ckb_boost_points_udt_type_code_hash:"ckboostPointsUdt",ckb_boost_tipping_type_code_hash:"ckboostTippingType",ckb_boost_achievement_type_code_hash:"ckboostAchievementType"};
  const scriptHashes=Object.fromEntries(Object.entries(names).map(([field,name])=>[field,byName(name).codeHash])) as Record<keyof typeof names,ccc.Hex>;
  const data={protocol_config:{admin_lock_hash_vec:[owner.hash()],script_code_hashes:{...scriptHashes,accepted_udt_type_scripts:[],accepted_dob_type_scripts:[]},streak_bonus_interval:0,streak_bonus_amount:0,achievement_type_hashes:[]},campaigns_approved:[],tippings_approved:[],endorsers_whitelist:[],last_updated:1795000000000n,tipping_config:{approval_requirement_thresholds:[100000000000n,500000000000n,1000000000000n],expiration_duration:2592000}};
  const type=ccc.Script.from({codeHash:byName("ckboostProtocolType").codeHash,hashType:"type",args:qaIdentity?"0x53a5053bed009ff6bcfe2762b5c186fdbbffa215cde85868c7becb501f0ef462":hash("44")});
  const lock=ccc.Script.from({codeHash:protocolCode.typeHash,hashType:"type",args:ccc.hexFrom(ConnectedTypeID.encode({type_id:owner.hash(),connected_key:type.hash()}))});
  const encoded=ccc.hexFrom(ProtocolData.encode(data));
  const protocol={schema:"ckboost-isolated-testnet-protocol-state/v1",network:"testnet",transactionHash:hash("55"),index:"0x0",blockNumber:"0x20",protocolTypeScript:plain(type),protocolTypeHash:type.hash(),protocolLockScript:plain(lock),dataHash:ccc.hashCkb(encoded),protocolDataHex:encoded,capacityShannons:ccc.CellOutput.from({lock,type},encoded).capacity.toString(),adminLockHashes:[owner.hash()],campaignsApproved:[],tippingsApproved:[],endorsersWhitelist:[],profile};
  return{protocol,protocolCode,campaignCode,profile,data};
}
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
/** A synthetic fresh deployment and input proof, exclusively for offline tests. */
const userDeployment=(qaIdentity=false)=>{
  const input=qaIdentity?ccc.CellInput.fromBytes("0x0000000000000000867546ef19cfbb05731bf8a1b2708c88a7774a6b2a725cf2ee086424a50588c201000000"):ccc.CellInput.from({previousOutput:{txHash:hash("66"),index:0},since:0});
  const typeIdArgs=ccc.hashTypeId(input,0),type=ccc.Script.from({codeHash:TYPE_ID,hashType:"type",args:typeIdArgs});
  const transactionHash=qaIdentity?"0x0e0a6d62210a17234b47d94c07a1596aa2f3d23c93922ab3a1209708f4c3e422" as ccc.Hex:hash("77"),blockNumber=qaIdentity?"0x160d700":"0x40";
  const pin=TESTNET_PROTOCOL_DEPENDENCY_PINS.find(row=>row.name==="ckboostUserType")!;
  return{schema:"ckboost-testnet-code-deployment/v1",network:"testnet",contract:"user-type",hashType:"type",isTypeId:true,contractSize:pin.dataBytes,dataHash:pin.dataHash as ccc.Hex,typeScript:plain(type),typeHash:type.hash(),transactionHash,index:"0x0",lockScript:plain(owner),capacityShannons:ccc.CellOutput.from({lock:owner,type},new Uint8Array(pin.dataBytes)).capacity.toString(),blockNumber,
    creationEvidence:{transactionHash,blockNumber,outputIndex:0,firstInput:ccc.hexFrom(input.toBytes()),typeIdArgs}};
};

/** Synthetic upgrade transaction metadata, with real QA ancestor identities and
 * the centrally reviewed byte pins. No fixture is signed, deployed or activated.
 */
function upgradeFixture(){
  const f=fixture(true),base=makeIndependentUserRuntimeConfig(makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),userDeployment(true));
  const manifest=(id:"protocol-lock"|"campaign-type",position:0|1)=>{
    const pin=PERMISSION_REVIEW_RELEASES[id] as PermissionReviewRelease;
    if(!pin)throw Error("Reviewed permission release pin is required for this fixture.");
    const old=id==="protocol-lock"?f.protocolCode:f.campaignCode,transactionHash=hash("99"),blockNumber="0x160d701",previous={transactionHash:old.transactionHash,index:"0x0",dataHash:old.dataHash as ccc.Hex,contractSize:old.contractSize,capacityShannons:old.capacityShannons};
    const consumedOutPoint={txHash:old.transactionHash,index:"0x0"},input=ccc.CellInput.from({previousOutput:consumedOutPoint,since:0});
    return{schema:"ckboost-testnet-code-upgrade/v1",network:"testnet",contract:id,hashType:"type",isTypeId:true,transactionHash,index:`0x${position}`,blockNumber,typeScript:copy(old.typeScript),typeHash:old.typeHash,lockScript:plain(owner),dataHash:pin.dataHash as ccc.Hex,contractSize:pin.byteLength,capacityShannons:ccc.CellOutput.from({lock:owner,type:old.typeScript},new Uint8Array(pin.byteLength)).capacity.toString(),previous,upgradeEvidence:{transactionHash,blockNumber,inputIndex:position as number,outputIndex:position as number,consumedInput:ccc.hexFrom(input.toBytes()),consumedOutPoint}};
  };
  return{base,protocolUpgrade:manifest("protocol-lock",0),campaignUpgrade:manifest("campaign-type",1)};
}

it("keeps all seven server/browser trust anchors identical to bootstrap and the reviewed code bytes",()=>{
  expect(ISOLATED_QA_PINS).toEqual(TESTNET_PROTOCOL_DEPENDENCY_PINS.map(p=>({name:p.name,codeHash:p.codeHash,txHash:p.outPoint.txHash,index:"0x0",dataHash:p.dataHash,dataBytes:p.dataBytes})));
  const f=fixture(),runtime=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile);
  expect(runtime.current.testnet.ckboostProtocolLock?.dataHash).toBe(TESTNET_CODE_RELEASES["protocol-lock"].dataHash);
  expect(runtime.current.testnet.ckboostCampaignType?.dataHash).toBe(TESTNET_CODE_RELEASES["campaign-type"].dataHash);
});
it("produces one immutable complete registry, exact protocol script and separate pool record",()=>{
  const f=fixture(),runtime=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile);
  expect(Object.keys(runtime.current.testnet)).toHaveLength(9);expect(runtime.current.testnet.ckboostUserLock).toBeNull();
  expect(runtime.current.testnet.ckboostProtocolLock?.typeHash).toBe(f.protocolCode.typeHash);
  expect(runtime.current.testnet.ckboostCampaignType?.typeHash).toBe(f.campaignCode.typeHash);
  expect(runtime.protocol.typeScript).toEqual(f.protocol.protocolTypeScript);expect(runtime.protocol.typeHash).toBe(f.protocol.protocolTypeHash);
  expect(runtime.claimablePool.typeHash).toBe(TESTNET_PROTOCOL_DEPENDENCY_PINS[6].codeHash);
  expect(Object.values(runtime.current.mainnet).every(value=>value===null)).toBe(true);expect(Object.isFrozen(runtime.current.testnet)).toBe(true);
  const env=isolatedRuntimeEnvironment(runtime);expect(getIsolatedRuntime(env)).toEqual(runtime);
  expect(env.CKBOOST_NEXT_DIST_DIR).toBe(`.next-isolated-${runtime.profileHash.slice(2,14)}`);
  expect(env).not.toHaveProperty("NETLIFY_API_AUTHENTICATOR_PRIVATE_KEY");
});
it("leaves normal mode unchanged even with absent or unrelated profile text",()=>{
  expect(getIsolatedRuntime({})).toBeNull();expect(getIsolatedRuntime({CKBOOST_ISOLATED_QA:"0",NEXT_PUBLIC_CKB_NETWORK:"mainnet",NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE:"invalid"})).toBeNull();
});
it.each(["missing","malformed","mainnet","args","rpc","executor","registry","flags"])("fails closed in isolated mode for %s instead of falling back to shared config",kind=>{
  const f=fixture(),env=isolatedRuntimeEnvironment(makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile));
  if(kind==="missing")delete env.NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE;
  if(kind==="malformed")env.NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE="{";
  if(kind==="mainnet")env.NEXT_PUBLIC_CKB_NETWORK="mainnet";
  if(kind==="args")env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS="0x";
  if(kind==="rpc")env.NEXT_PUBLIC_CKB_RPC_URL="https://mainnet.ckb.dev/";
  if(kind==="executor")env.NEXT_PUBLIC_SSRI_EXECUTOR_URL="http://127.0.0.1:9090/";
  if(kind==="registry")env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS=JSON.stringify({testnet:{},mainnet:{}});
  if(kind==="flags")env.NEXT_PUBLIC_CKBOOST_ISOLATED_QA="0";
  expect(()=>getIsolatedRuntime(env)).toThrow("Isolated QA");
});
it("rejects changed derived registry/pool/identity/hash and unreviewed source manifests",()=>{
  const f=fixture(),runtime=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile);
  for(const mutate of [(r:typeof runtime)=>{r.protocol.typeHash=hash("ab");},(r:typeof runtime)=>{r.current.testnet.ckboostCampaignType!.transactionHash=hash("ab");},(r:typeof runtime)=>{r.claimablePool.typeHash=hash("ab");},(r:typeof runtime)=>{r.profileHash=hash("ab");}]){const changed=copy(runtime);mutate(changed);expect(()=>validateIsolatedRuntimeConfig(changed)).toThrow("changed");}
  expect(()=>makeIsolatedRuntimeConfig(f.protocol,{...f.protocolCode,dataHash:hash("ab")},f.campaignCode,f.profile)).toThrow("reviewed code");
  expect(()=>makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,{...f.profile,dependencies:f.profile.dependencies.slice(1)})).toThrow("nine-code");
});
it("uses real Molecule data to reject foreign admin, inherited approval and stale code configuration",()=>{
  const f=fixture();for(const change of [(data:typeof f.data)=>{data.protocol_config.admin_lock_hash_vec=[hash("ab")];},(data:typeof f.data)=>{(data.campaigns_approved as ccc.Hex[]).push(hash("ab"));},(data:typeof f.data)=>{data.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash=hash("ab");}]){
    const data=fixture().data;change(data);const hex=ccc.hexFrom(ProtocolData.encode(data));
    expect(()=>makeIsolatedRuntimeConfig({...f.protocol,protocolDataHex:hex,dataHash:ccc.hashCkb(hex)},f.protocolCode,f.campaignCode,f.profile)).toThrow("admin/config");
  }
});
it("keeps initial creation evidence separate from runtime current-cell lookup identity",()=>{
  const f=fixture(),runtime=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile);
  expect(runtime.protocol.creationOutPoint.txHash).toBe(f.protocol.transactionHash);
  expect(runtime.protocol.typeScript.args).toBe(hash("44"));
  expect(runtime.protocol).not.toHaveProperty("currentOutPoint");
});
it("whitelists public source fields rather than exporting attached signer or credentials",()=>{
  const f=fixture();const runtime=makeIsolatedRuntimeConfig({...f.protocol,signer:{privateKey:"must-not-export"}},{...f.protocolCode,credentials:"must-not-export"},f.campaignCode,f.profile);
  expect(JSON.stringify(runtime)).not.toContain("must-not-export");expect(JSON.stringify(runtime)).not.toContain("privateKey");
});
it("derives a v2 fresh UserType deployment while preserving the full original initial protocol evidence",()=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),before=JSON.stringify(base);
  const runtime=makeIndependentUserRuntimeConfig(base,userDeployment());
  expect(runtime.schema).toBe("ckboost-isolated-testnet-runtime/v2");
  expect(runtime.current.testnet.ckboostUserType?.typeHash).toBe(userDeployment().typeHash);
  expect(runtime.current.testnet.ckboostUserType?.typeHash).not.toBe(base.current.testnet.ckboostUserType?.typeHash);
  expect(runtime.current.testnet.ckboostUserType?.typeHash).not.toBe("0xe72de4d0ec8b2ee9e1e5e1f523f5178170852a0d052f407a612078988b36eb86");
  expect(runtime.current.testnet.ckboostUserType?.transactionHash).toBe(userDeployment().transactionHash);
  expect(runtime.current.testnet.ckboostUserType?.dataHash).toBe(base.current.testnet.ckboostUserType?.dataHash);
  expect(runtime.current.testnet.ckboostUserType?.contractSize).toBe(361256);
  for(const name of Object.keys(base.current.testnet))if(name!=="ckboostUserType")expect(runtime.current.testnet[name]).toEqual(base.current.testnet[name]);
  expect(runtime.protocol).toEqual(base.protocol);expect(runtime.claimablePool).toEqual(base.claimablePool);expect(runtime.current.mainnet).toEqual(base.current.mainnet);
  expect(runtime.sources.protocolManifest).toEqual(base.sources.protocolManifest);
  expect(runtime.sources.profile).toEqual(base.sources.profile);
  expect(runtime.sources.protocolCodeManifest).toEqual(base.sources.protocolCodeManifest);expect(runtime.sources.campaignCodeManifest).toEqual(base.sources.campaignCodeManifest);
  const initial=ProtocolData.decode(runtime.sources.protocolManifest.protocolDataHex as ccc.Hex);
  expect(initial.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash).toBe(base.current.testnet.ckboostUserType?.typeHash);
  const effective=runtime.sources.effectiveProfile as typeof f.profile;
  expect(effective.schema).toBe("ckboost-isolated-testnet-profile/v2");expect(effective.dependencies).toHaveLength(9);
  expect(effective.dependencies.find(row=>row.name==="ckboostUserType")?.codeHash).toBe(runtime.current.testnet.ckboostUserType?.typeHash);
  expect(effective.dependencies.filter(row=>row.name!=="ckboostUserType")).toEqual(f.profile.dependencies.filter(row=>row.name!=="ckboostUserType"));
  expect(JSON.stringify(base)).toBe(before);expect(validateIsolatedRuntimeConfig(base)).toEqual(base);
  expect(validateIsolatedRuntimeConfig(runtime)).toEqual(runtime);expect(Object.isFrozen(runtime.sources.effectiveProfile)).toBe(true);
  expect(runtime.profileHash).not.toBe(base.profileHash);
});
it("keeps v2 environment derivation limited to effective registry, public profile and isolated output directory",()=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),runtime=makeIndependentUserRuntimeConfig(base,userDeployment());
  const original=isolatedRuntimeEnvironment(base),effective=isolatedRuntimeEnvironment(runtime);
  expect(Object.keys(effective)).toEqual(Object.keys(original));
  expect(Object.keys(effective).filter(key=>effective[key]!==original[key]).sort()).toEqual(["CKBOOST_NEXT_DIST_DIR","NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS","NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE"]);
  expect(effective.CKBOOST_NEXT_DIST_DIR).toBe(`.next-isolated-${runtime.profileHash.slice(2,14)}`);
  expect(effective.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS).toBe(original.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS);
  expect(getIsolatedRuntime(effective)).toEqual(runtime);
  effective.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS=original.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS;
  expect(()=>getIsolatedRuntime(effective)).toThrow("current registry disagrees");
});
it.each(["schema","network","typeScript","typeHash","transactionHash","index","dataHash","size","capacity","excessCapacity","lock"])("rejects an invalid fresh UserType %s",kind=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),reference=userDeployment();
  if(kind==="schema")reference.schema="ckboost-testnet-code-reference/v1";
  if(kind==="network")reference.network="mainnet";
  if(kind==="typeScript")reference.typeScript.args=hash("ab");
  if(kind==="typeHash")reference.typeHash=base.current.testnet.ckboostUserType!.typeHash as ccc.Hex;
  if(kind==="transactionHash")reference.transactionHash=base.current.testnet.ckboostUserType!.transactionHash as ccc.Hex;
  if(kind==="index")reference.index="0x1" as "0x0";
  if(kind==="dataHash")reference.dataHash=hash("ab");
  if(kind==="size")reference.contractSize+=1;
  if(kind==="capacity")reference.capacityShannons=(BigInt(reference.capacityShannons)-1n).toString();
  if(kind==="excessCapacity")reference.capacityShannons=(BigInt(reference.capacityShannons)+1n).toString();
  if(kind==="lock")reference.lockScript={...plain(owner),args:hash("ab")};
  expect(()=>makeIndependentUserRuntimeConfig(base,reference)).toThrow("Isolated QA");
});
it.each(["missing","input","typeIdArgs","transactionHash","blockNumber","outputIndex"])("rejects absent or inconsistent UserType creation evidence: %s",kind=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),deployment=userDeployment();
  if(kind==="missing")delete (deployment as {creationEvidence?:unknown}).creationEvidence;
  if(kind==="input")deployment.creationEvidence.firstInput=ccc.hexFrom(ccc.CellInput.from({previousOutput:{txHash:hash("99"),index:0},since:0}).toBytes());
  if(kind==="typeIdArgs")deployment.creationEvidence.typeIdArgs=hash("ab");
  if(kind==="transactionHash")deployment.creationEvidence.transactionHash=hash("ab");
  if(kind==="blockNumber")deployment.creationEvidence.blockNumber="0x41";
  if(kind==="outputIndex")deployment.creationEvidence.outputIndex=1;
  expect(()=>makeIndependentUserRuntimeConfig(base,deployment)).toThrow("Isolated QA");
});
it("rejects historical UserType and reused base dependencies even when presented as fresh deployments",()=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile);
  const historical=userDeployment();
  historical.typeScript.args="0x8130e14e12c814ea3bff27cde7a7282a04a0edbb29c8de83770eaa9e6d9c8128";
  historical.typeHash=ccc.Script.from(historical.typeScript).hash();
  expect(historical.typeHash).toBe("0xe72de4d0ec8b2ee9e1e5e1f523f5178170852a0d052f407a612078988b36eb86");
  expect(()=>makeIndependentUserRuntimeConfig(base,historical)).toThrow("fresh UserType identity/outpoint");
  const reusedIdentity={...userDeployment(),typeScript:f.protocolCode.typeScript,typeHash:f.protocolCode.typeHash};
  expect(()=>makeIndependentUserRuntimeConfig(base,reusedIdentity)).toThrow("fresh UserType identity/outpoint");
  const reusedOutpoint={...userDeployment(),transactionHash:f.protocolCode.transactionHash};
  expect(()=>makeIndependentUserRuntimeConfig(base,reusedOutpoint)).toThrow("fresh UserType identity/outpoint");
  const historicalOutpoint={...userDeployment(),transactionHash:"0x1f097814212de89ae12475fe33b6c9cfacecedc8bea16e04636bac08da42a21d"};
  expect(()=>makeIndependentUserRuntimeConfig(base,historicalOutpoint)).toThrow("fresh UserType identity/outpoint");
});
it("revalidates v1 sources before applying v2 and rejects forged effective fields",()=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),runtime=makeIndependentUserRuntimeConfig(base,userDeployment());
  const changedBase=copy(base);changedBase.sources.profile.dependencies=[];
  expect(()=>makeIndependentUserRuntimeConfig(changedBase,userDeployment())).toThrow("nine-code");
  expect(()=>makeIndependentUserRuntimeConfig(runtime,userDeployment())).toThrow("original v1");
  for(const mutate of [(r:typeof runtime)=>{r.current.testnet.ckboostUserType=base.current.testnet.ckboostUserType;},(r:typeof runtime)=>{r.sources.effectiveProfile!.dependencies=[];},(r:typeof runtime)=>{r.sources.profile=r.sources.effectiveProfile!;},(r:typeof runtime)=>{r.sources.userCodeDeploymentManifest!.typeHash=hash("ab");},(r:typeof runtime)=>{r.profileHash=base.profileHash;}]){
    const changed=copy(runtime);mutate(changed);expect(()=>validateIsolatedRuntimeConfig(changed)).toThrow("Isolated QA");
  }
});
it("exports public deployment facts without treating imported liveness metadata as verification",()=>{
  const f=fixture(),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile);
  const runtime=makeIndependentUserRuntimeConfig(base,{...userDeployment(),status:"live",verified:true,signer:{privateKey:"must-not-export"}});
  expect(runtime.sources.userCodeDeploymentManifest?.lockScript).toEqual(plain(owner));
  expect(runtime.sources.userCodeDeploymentManifest).not.toHaveProperty("status");expect(runtime.sources.userCodeDeploymentManifest).not.toHaveProperty("verified");
  expect(JSON.stringify(runtime)).not.toContain("must-not-export");
});
it("derives one v3 atomic QA upgrade while preserving v2 identities and every original creation source",()=>{
  const f=upgradeFixture(),before=JSON.stringify(f.base),runtime=makeUpgradedIsolatedRuntimeConfig(f.base,f.protocolUpgrade,f.campaignUpgrade);
  expect(runtime.schema).toBe("ckboost-isolated-testnet-runtime/v3");expect(runtime.sources.parentProfileHash).toBe(f.base.profileHash);
  for(const[key,manifest]of[["ckboostProtocolLock",f.protocolUpgrade],["ckboostCampaignType",f.campaignUpgrade]] as const){
    const old=f.base.current.testnet[key]!;
    expect(runtime.current.testnet[key]).toEqual({...old,transactionHash:manifest.transactionHash,index:manifest.index,dataHash:manifest.dataHash,contractSize:manifest.contractSize});
    expect(runtime.current.testnet[key]?.typeScript).toEqual(old.typeScript);expect(runtime.current.testnet[key]?.typeHash).toBe(old.typeHash);
  }
  for(const name of Object.keys(f.base.current.testnet))if(!["ckboostProtocolLock","ckboostCampaignType"].includes(name))expect(runtime.current.testnet[name]).toEqual(f.base.current.testnet[name]);
  expect(runtime.protocol).toEqual(f.base.protocol);expect(runtime.protocol.typeHash).toBe("0x4eacaf9b1a120d2bfd99f26fcedfdcfe6ef116484e9b478b0a104a872316e034");
  expect(runtime.current.testnet.ckboostUserType?.typeHash).toBe("0xecc4b989dc3bfc2f80e22226d14b4b04257e8f4bf3d8298f80619b798e12cb2c");
  expect(runtime.claimablePool).toEqual(f.base.claimablePool);expect(runtime.current.mainnet).toEqual(f.base.current.mainnet);
  for(const key of ["protocolManifest","protocolCodeManifest","campaignCodeManifest","profile","userCodeDeploymentManifest"] as const)expect(runtime.sources[key]).toEqual(f.base.sources[key]);
  expect(runtime.sources.effectiveProfile?.schema).toBe("ckboost-isolated-testnet-profile/v3");
  expect(runtime.sources.codeUpgradeManifests?.protocolLock).toEqual(f.protocolUpgrade);expect(runtime.sources.codeUpgradeManifests?.campaignType).toEqual(f.campaignUpgrade);
  expect(JSON.stringify(f.base)).toBe(before);expect(validateIsolatedRuntimeConfig(f.base)).toEqual(f.base);expect(validateIsolatedRuntimeConfig(runtime)).toEqual(runtime);
  expect(Object.isFrozen(runtime.sources.codeUpgradeManifests)).toBe(true);
});
it("rebuilds v3 public environment with only registry/profile/dist changes and exact browser/server scope",()=>{
  const f=upgradeFixture(),runtime=makeUpgradedIsolatedRuntimeConfig(f.base,f.protocolUpgrade,f.campaignUpgrade),original=isolatedRuntimeEnvironment(f.base),env=isolatedRuntimeEnvironment(runtime);
  expect(runtime.profileHash).not.toBe(f.base.profileHash);expect(getIsolatedRuntime(env)).toEqual(runtime);
  expect(Object.keys(env)).toEqual(Object.keys(original));
  expect(Object.keys(env).filter(key=>env[key]!==original[key]).sort()).toEqual(["CKBOOST_NEXT_DIST_DIR","NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS","NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE"]);
  expect(env.CKBOOST_NEXT_DIST_DIR).toBe(`.next-isolated-${runtime.profileHash.slice(2,14)}`);
  env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS=original.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS;
  expect(()=>getIsolatedRuntime(env)).toThrow("current registry disagrees");
});
it.each(["schema","contract","network","typeScript","typeHash","owner","size","dataHash","capacity","previousPoint","previousData","previousSize","previousCapacity","inputPoint","inputSince","inputIndex","outputIndex","manifestIndex","beforeUserBlock"])("rejects an altered QA upgrade %s",kind=>{
  const f=upgradeFixture(),manifest=f.protocolUpgrade;
  if(kind==="schema")manifest.schema="ckboost-testnet-code-deployment/v1";
  if(kind==="contract")manifest.contract="campaign-type";
  if(kind==="network")manifest.network="mainnet";
  if(kind==="typeScript")manifest.typeScript.args=hash("ab");
  if(kind==="typeHash")manifest.typeHash=hash("ab");
  if(kind==="owner")manifest.lockScript.args=hash("ab");
  if(kind==="size")manifest.contractSize+=1;
  if(kind==="dataHash")manifest.dataHash=hash("ab");
  if(kind==="capacity")manifest.capacityShannons="1";
  if(kind==="previousPoint")manifest.previous.transactionHash=hash("ab");
  if(kind==="previousData")manifest.previous.dataHash=hash("ab");
  if(kind==="previousSize")manifest.previous.contractSize+=1;
  if(kind==="previousCapacity")manifest.previous.capacityShannons=(BigInt(manifest.previous.capacityShannons)+1n).toString();
  if(kind==="inputPoint")manifest.upgradeEvidence.consumedInput=ccc.hexFrom(ccc.CellInput.from({previousOutput:{txHash:hash("ab"),index:0},since:0}).toBytes());
  if(kind==="inputSince")manifest.upgradeEvidence.consumedInput=ccc.hexFrom(ccc.CellInput.from({previousOutput:manifest.upgradeEvidence.consumedOutPoint,since:1}).toBytes());
  if(kind==="inputIndex")manifest.upgradeEvidence.inputIndex=1;
  if(kind==="outputIndex")manifest.upgradeEvidence.outputIndex=1;
  if(kind==="manifestIndex")manifest.index="0x1";
  if(kind==="beforeUserBlock"){manifest.blockNumber="0x160d700";manifest.upgradeEvidence.blockNumber=manifest.blockNumber;}
  expect(()=>makeUpgradedIsolatedRuntimeConfig(f.base,manifest,f.campaignUpgrade)).toThrow("Isolated QA");
});
it("requires fixed campaign input/output 1 and the same batch hash/block for both code upgrades",()=>{
  for(const change of ["index","inputIndex","outputIndex","transactionHash","blockNumber"]){
    const f=upgradeFixture(),manifest=f.campaignUpgrade;
    if(change==="index")manifest.index="0x0";
    if(change==="inputIndex")manifest.upgradeEvidence.inputIndex=0;
    if(change==="outputIndex")manifest.upgradeEvidence.outputIndex=0;
    if(change==="transactionHash"){manifest.transactionHash=hash("88");manifest.upgradeEvidence.transactionHash=manifest.transactionHash;}
    if(change==="blockNumber"){manifest.blockNumber="0x160d702";manifest.upgradeEvidence.blockNumber=manifest.blockNumber;}
    expect(()=>makeUpgradedIsolatedRuntimeConfig(f.base,f.protocolUpgrade,manifest)).toThrow("Isolated QA");
  }
  const f=upgradeFixture();expect(()=>makeUpgradedIsolatedRuntimeConfig(f.base,f.protocolUpgrade,undefined)).toThrow("Isolated QA");
});
it("rejects another valid v2 lineage and does not overwrite creation evidence to pass v3 validation",()=>{
  const f=upgradeFixture(),other=fixture(),otherV2=makeIndependentUserRuntimeConfig(makeIsolatedRuntimeConfig(other.protocol,other.protocolCode,other.campaignCode,other.profile),userDeployment());
  expect(()=>makeUpgradedIsolatedRuntimeConfig(otherV2,f.protocolUpgrade,f.campaignUpgrade)).toThrow("parent protocol");
  const runtime=makeUpgradedIsolatedRuntimeConfig(f.base,f.protocolUpgrade,f.campaignUpgrade);
  expect(()=>makeUpgradedIsolatedRuntimeConfig(runtime,f.protocolUpgrade,f.campaignUpgrade)).toThrow("original verified v2");
  for(const mutate of [(r:typeof runtime)=>{r.sources.parentProfileHash=hash("ab");},(r:typeof runtime)=>{r.sources.protocolCodeManifest.dataHash=f.protocolUpgrade.dataHash;},(r:typeof runtime)=>{r.sources.codeUpgradeManifests!.campaignType.index="0x0";},(r:typeof runtime)=>{r.current.testnet.ckboostCampaignType!.transactionHash=f.base.current.testnet.ckboostCampaignType!.transactionHash;},(r:typeof runtime)=>{r.sources.effectiveProfile!.schema="ckboost-isolated-testnet-profile/v2";}]){
    const changed=copy(runtime);mutate(changed);expect(()=>validateIsolatedRuntimeConfig(changed)).toThrow("Isolated QA");
  }
});
it("whitelists compact public upgrade evidence without exporting attached signer data or liveness claims",()=>{
  const f=upgradeFixture(),runtime=makeUpgradedIsolatedRuntimeConfig(f.base,{...f.protocolUpgrade,signer:{privateKey:"must-not-export"},live:true},f.campaignUpgrade);
  expect(JSON.stringify(runtime)).not.toContain("must-not-export");expect(runtime.sources.codeUpgradeManifests!.protocolLock).not.toHaveProperty("live");
  expect(JSON.stringify(runtime).length).toBeLessThan(200000);
});
it.each(["v1","v2","v3"])("uses one %s process profile across legacy/lean protocol and claim pool lookups without shared fallback",version=>{
  const f=fixture(version==="v3"),base=makeIsolatedRuntimeConfig(f.protocol,f.protocolCode,f.campaignCode,f.profile),upgrade=version==="v3"?upgradeFixture():null;
  const runtime=upgrade?makeUpgradedIsolatedRuntimeConfig(upgrade.base,upgrade.protocolUpgrade,upgrade.campaignUpgrade):version==="v2"?makeIndependentUserRuntimeConfig(base,userDeployment()):base,env=isolatedRuntimeEnvironment(runtime);
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,env);const full=new DeploymentManager();
    expect(full.getCurrentNetwork()).toBe("testnet");
    expect(full.getCurrentDeployment("testnet","ckboostProtocolLock")?.typeHash).toBe(f.protocolCode.typeHash);
    expect(currentDeployment.getCurrentDeployment("testnet","ckboostCampaignType")?.typeHash).toBe(f.campaignCode.typeHash);
    expect(full.getCurrentDeployment("testnet","ckboostCampaignType")?.transactionHash).toBe(runtime.current.testnet.ckboostCampaignType?.transactionHash);
    expect(currentDeployment.getCurrentDeployment("testnet","ckboostCampaignType")?.index).toBe(runtime.current.testnet.ckboostCampaignType?.index);
    expect(full.getCurrentDeployment("testnet","ckboostUserType")?.typeHash).toBe(runtime.current.testnet.ckboostUserType?.typeHash);
    expect(currentDeployment.getCurrentDeployment("testnet","ckboostUserType")?.typeHash).toBe(runtime.current.testnet.ckboostUserType?.typeHash);
    expect(full.getCurrentDeployment("testnet","ckboostUserLock")).toBeNull();
    expect(getCurrentProtocolTypeScript()).toEqual(f.protocol.protocolTypeScript);
    expect(getProtocolTypeScript()).toEqual(f.protocol.protocolTypeScript);
    expect(getClaimablePoolLockDeployment()?.typeHash).toBe(runtime.claimablePool.typeHash);
    expect(()=>full.getCurrentDeployment("mainnet","ckboostProtocolType")).toThrow("mainnet");
    expect(()=>currentDeployment.getCurrentDeployment("mainnet","ckboostProtocolType")).toThrow("mainnet");
    expect(()=>getClaimablePoolLockDeployment("mainnet")).toThrow("mainnet");
    expect(()=>full.addDeployment("testnet","ckboostProtocolType",full.getCurrentDeployment("testnet","ckboostProtocolType")!)).toThrow("immutable");
    delete process.env.NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE;
    expect(()=>getProtocolTypeScript()).toThrow("Isolated QA");
    expect(()=>getClaimablePoolLockDeployment()).toThrow("Isolated QA");
  }finally{
    for(const[key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    new DeploymentManager();
  }
});
