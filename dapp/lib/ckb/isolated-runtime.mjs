import { ccc } from "@ckb-ccc/core";
import { ConnectedTypeID, ProtocolData } from "../../../packages/ssri-ckboost/dist/generated/ckboost.js";
import { PERMISSION_REVIEW_RELEASES } from "./permissions-release-pins.mjs";

// Public immutable trust anchors. A regression test compares these with the
// bootstrap module's seven source pins and the two reviewed release pins.
export const ISOLATED_QA_PINS = [
  {name:"ckboostProtocolType",codeHash:"0x53769be2ed1d09a9da7c1d71488347449bb76f1212068f7e366939d0d5fd59fa",txHash:"0x131dd30a2a21722c39229421668bebc661b65bffccded3c8de95f66a633aae83",index:"0x0",dataHash:"0x898cf68d889645a7aae925623273a2490e1506dd1fa37a62732f07270fdb4bfc",dataBytes:301816},
  {name:"ckboostUserType",codeHash:"0xe78893f4703d27e6dc9a8a6495ab86f2e14d51f83c0eb21de0ae5e4437027fe6",txHash:"0xb4ce620861a60767fb15d43d53f7059d090df7538bcb806f2bc5d776c4fe1534",index:"0x0",dataHash:"0x76dbd826aa15708eee36d857fde53b92eb7904bfd0e6fe0ccf6d16c263bc4382",dataBytes:361256},
  {name:"ckboostPointsUdt",codeHash:"0xfcb4b762e3222b603771811b8abe6b054a480a0f5d8011fd9fff266d72189a5e",txHash:"0xd006b31cfd6a5360f607ac067590a88b10847ecea84ccde11788493b7eeb3e3f",index:"0x0",dataHash:"0xb61c56ff5d0b9d036f0db63d67ec9cf9d8cb62a20d9de1830659b92261bb150b",dataBytes:138784},
  {name:"ckboostFundingLock",codeHash:"0x4098902247983e930aca2dc7425600e356ea9a06e25a39d74d4bd796fe395268",txHash:"0x6fe46c5219a39e101c992de818424f197839683deecb3ec33a2f1cf7460c8b06",index:"0x0",dataHash:"0xb6352f08723a2824c583cf15f52e9ae716c6b1400f51bf010110cf77ff399896",dataBytes:284264},
  {name:"ckboostTippingType",codeHash:"0x6bc4f9266a2b146d235f9004859e7cb13a58fc688687bdd41567b0e97779fc01",txHash:"0xb1e6c2e04be8f1ae54062e14c17b9dea3264e9ddae45825735647f4f803e97e7",index:"0x0",dataHash:"0x6ab025c16d61a4b9405a4d3cabd115c3725b6a24faa94695b1345924bd58b225",dataBytes:383744},
  {name:"ckboostAchievementType",codeHash:"0x7130876c4a85364fc964fd5677632b6c174d10bcd3bc9ab8323d66f709c99f98",txHash:"0x0991236377af51673670f90acc65de6ba82d1bc98ca7c755f498e34bfabfac7e",index:"0x0",dataHash:"0xf50e78e33b54910a69a637464d9ffdb8d759d614d47fbde1f67776b7906507e9",dataBytes:315872},
  {name:"claimablePoolLock",codeHash:"0x458cacb13a3c40e6d046468e7fe3f5c2c93f0581062e269dc9ffec4858346cb6",txHash:"0x96194f05b7c341fbe0d865129f8f3a2f50c62981afd9fac698d58237d710d6c0",index:"0x0",dataHash:"0x07aace477ec2a6a11c108037be54bb3ecc2cd003b5db6a5e1a4adf3a5c403fb1",dataBytes:56600},
];
const RELEASES={"protocol-lock":{name:"ckboostProtocolLock",fileName:"ckboost-protocol-lock",bytes:183336,dataHash:"0xc05104a58335932de04ddc8aaaf95f252394b1012580f3a118527400ced856c7"},"campaign-type":{name:"ckboostCampaignType",fileName:"ckboost-campaign-type",bytes:255480,dataHash:"0x8f47dc10346658617399a196e994aba09d1e7ed06bdb01111ac783510b17a62b"}};
RELEASES["user-type"]={name:"ckboostUserType",fileName:"ckboost-user-type",bytes:361256,dataHash:"0x76dbd826aa15708eee36d857fde53b92eb7904bfd0e6fe0ccf6d16c263bc4382"};
const TYPE_ID="0x00000000000000000000000000000000000000000000000000545950455f4944";
const OWNER={codeHash:"0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",hashType:"type",args:"0x1270de01d042a23bfab1dc06375138b48ea03d006900"};
// Historical code identities are excluded from the fresh QA deployment path.
const HISTORICAL_USER_TYPE="0xe72de4d0ec8b2ee9e1e5e1f523f5178170852a0d052f407a612078988b36eb86";
const HISTORICAL_USER_TRANSACTION="0x1f097814212de89ae12475fe33b6c9cfacecedc8bea16e04636bac08da42a21d";
const QA_UPGRADE_ANCESTORS={protocolTypeHash:"0x4eacaf9b1a120d2bfd99f26fcedfdcfe6ef116484e9b478b0a104a872316e034",userTypeHash:"0xecc4b989dc3bfc2f80e22226d14b4b04257e8f4bf3d8298f80619b798e12cb2c",protocolLock:{typeHash:"0xe91b5a78463c293318331c21d372e031eb9ffad87b379fbe0563222fcdd28815",transactionHash:"0xdb31514a0e178b3c5bd6f21d34a1cc20c0b7badbb3ebd6711c9bb2711a58a066"},campaignType:{typeHash:"0x9004d12f500e558df19c14e08907e014dbfc50ae249500bb5c389f883a1487d2",transactionHash:"0x72dc50dbe634b1746e2d6033009c751ff02ff6bceab7d601e9c36fbcfb1d4a3d"}};
const RPC="https://testnet.ckbapp.dev/",EXECUTOR="http://127.0.0.1:9091/";
const HASH=/^0x[0-9a-f]{64}$/i;
const fail=message=>{throw new Error(`Isolated QA configuration: ${message}`);};
const check=(value,message)=>{if(!value)fail(message);};
const object=value=>{check(value&&typeof value==="object"&&!Array.isArray(value),"expected a public object");return value;};
const hash=value=>{check(typeof value==="string"&&HASH.test(value)&&!/^0x0{64}$/i.test(value),"invalid nonzero hash");return value.toLowerCase();};
const uint=value=>{check((typeof value==="string"&&/^(?:0x[0-9a-f]+|\d+)$/i.test(value))||typeof value==="bigint"||(typeof value==="number"&&Number.isSafeInteger(value)),"invalid unsigned quantity");const n=BigInt(value);check(n>=0n&&n<=0xffffffffffffffffn,"quantity outside uint64");return n;};
const point=value=>{const v=object(value),index=uint(v.index);check(index<=0xffffffffn,"output index outside uint32");return{txHash:hash(v.txHash),index:`0x${index.toString(16)}`};};
const script=value=>{const v=object(value);check(v.hashType==="type"&&typeof v.args==="string"&&/^0x(?:[0-9a-f]{2})*$/i.test(v.args)&&v.args.length<=1026,"invalid typed script");return{codeHash:hash(v.codeHash),hashType:"type",args:v.args.toLowerCase()};};
const scriptHash=value=>ccc.Script.from(value).hash();
const ownerHash=()=>scriptHash(OWNER);
const same=(a,b)=>canonical(a)===canonical(b);
export function canonical(value){if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;return JSON.stringify(value);}
function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function normalizeCode(value,id){
  const v=object(value),pin=RELEASES[id];check(v.schema==="ckboost-testnet-code-deployment/v1"&&v.network==="testnet"&&v.contract===id&&v.hashType==="type"&&v.isTypeId===true,"a confirmed code manifest is required");
  const typeScript=script(v.typeScript),lockScript=script(v.lockScript),capacity=uint(v.capacityShannons);
  check(typeScript.codeHash===TYPE_ID&&/^0x[0-9a-f]{64}$/.test(typeScript.args)&&!/^0x0{64}$/.test(typeScript.args)&&scriptHash(typeScript)===hash(v.typeHash),"code TypeID mismatch");
  check(same(lockScript,OWNER)&&v.contractSize===pin.bytes&&hash(v.dataHash)===pin.dataHash&&uint(v.index)===0n,"wrong reviewed code, owner or output index");
  check(capacity>=ccc.CellOutput.from({lock:lockScript,type:typeScript},new Uint8Array(pin.bytes)).capacity,"code below occupied capacity");
  return{schema:v.schema,network:"testnet",contract:id,hashType:"type",isTypeId:true,contractSize:pin.bytes,dataHash:pin.dataHash,typeScript,typeHash:scriptHash(typeScript),transactionHash:hash(v.transactionHash),index:"0x0",lockScript,capacityShannons:capacity.toString(),blockNumber:`0x${uint(v.blockNumber).toString(16)}`};
}
function profileCode(manifest,id){const pin=RELEASES[id];return{name:pin.name,codeHash:manifest.typeHash,hashType:"type",outPoint:{txHash:manifest.transactionHash,index:"0x0"},dataHash:pin.dataHash,dataBytes:pin.bytes,typeScript:manifest.typeScript,lockScript:manifest.lockScript,capacity:manifest.capacityShannons,blockNumber:manifest.blockNumber};}
function normalizeUserCodeDeployment(value,base){
  const v=object(value),code=normalizeCode(v,"user-type"),original=ISOLATED_QA_PINS.find(row=>row.name==="ckboostUserType");
  check(code.dataHash===original.dataHash&&code.contractSize===original.dataBytes,"wrong reviewed UserType bytes");
  check(code.typeHash!==HISTORICAL_USER_TYPE&&code.transactionHash!==HISTORICAL_USER_TRANSACTION&&base.sources.profile.dependencies.every(row=>row.codeHash!==code.typeHash&&!same(row.outPoint,{txHash:code.transactionHash,index:code.index})),"fresh UserType identity/outpoint must differ from existing dependencies");
  check(code.capacityShannons==="36138400000000"&&BigInt(code.capacityShannons)===ccc.CellOutput.from({lock:code.lockScript,type:code.typeScript},new Uint8Array(code.contractSize)).capacity,"fresh UserType occupied capacity mismatch");
  const evidence=object(v.creationEvidence);
  check(hash(evidence.transactionHash)===code.transactionHash&&`0x${uint(evidence.blockNumber).toString(16)}`===code.blockNumber&&uint(evidence.outputIndex)===0n,"independent UserType creation location mismatch");
  check(typeof evidence.firstInput==="string"&&/^0x[0-9a-f]{88}$/i.test(evidence.firstInput),"invalid UserType creation input");
  const firstInput=evidence.firstInput.toLowerCase(),typeIdArgs=ccc.hashTypeId(ccc.CellInput.fromBytes(firstInput),0);
  check(typeIdArgs===code.typeScript.args&&hash(evidence.typeIdArgs)===typeIdArgs,"independent UserType creation input/TypeID mismatch");
  const creationEvidence={transactionHash:code.transactionHash,blockNumber:code.blockNumber,outputIndex:0,firstInput,typeIdArgs};
  return{...code,creationEvidence};
}
function profileUserCode(manifest){return{name:"ckboostUserType",codeHash:manifest.typeHash,hashType:"type",outPoint:{txHash:manifest.transactionHash,index:manifest.index},dataHash:manifest.dataHash,dataBytes:manifest.contractSize,typeScript:manifest.typeScript,lockScript:manifest.lockScript,capacity:manifest.capacityShannons,blockNumber:manifest.blockNumber};}
function normalizeCodeUpgrade(value,id,position,base){
  const pin=PERMISSION_REVIEW_RELEASES[id];check(pin,"reviewed QA code-upgrade release pins are not configured");
  const v=object(value),old=base.sources.effectiveProfile.dependencies.find(row=>row.name===RELEASES[id].name);
  check(v.schema==="ckboost-testnet-code-upgrade/v1"&&v.network==="testnet"&&v.contract===id&&v.hashType==="type"&&v.isTypeId===true,"a verified QA code-upgrade manifest is required");
  const typeScript=script(v.typeScript),lockScript=script(v.lockScript),typeHash=scriptHash(typeScript),transactionHash=hash(v.transactionHash),index=uint(v.index),block=uint(v.blockNumber),capacity=uint(v.capacityShannons);
  check(index===BigInt(position)&&same(typeScript,old.typeScript)&&typeHash===hash(v.typeHash)&&typeHash===old.codeHash&&same(lockScript,old.lockScript)&&same(lockScript,OWNER),"QA code upgrade must preserve its exact TypeID and owner at the fixed batch output index");
  check(Number.isSafeInteger(pin.byteLength)&&pin.byteLength>0&&v.contractSize===pin.byteLength&&hash(v.dataHash)===pin.dataHash&&pin.dataHash!==old.dataHash,"wrong reviewed upgraded QA code bytes");
  check(capacity>=ccc.CellOutput.from({lock:lockScript,type:typeScript},new Uint8Array(pin.byteLength)).capacity,"upgraded QA code below occupied capacity");
  const previous=object(v.previous),previousOutPoint=point({txHash:previous.transactionHash,index:previous.index});
  check(same(previousOutPoint,old.outPoint)&&uint(previous.index)===0n&&hash(previous.dataHash)===old.dataHash&&previous.contractSize===old.dataBytes&&uint(previous.capacityShannons).toString()===old.capacity,"code upgrade previous identity/data/capacity disagrees with its v2 parent");
  check(block>uint(old.blockNumber)&&block>uint(base.sources.userCodeDeploymentManifest.blockNumber),"code upgrade must follow both original code creation and the fresh v2 UserType deployment");
  check(transactionHash!==previousOutPoint.txHash,"code upgrade cannot reuse its previous transaction");
  const evidence=object(v.upgradeEvidence);
  check(hash(evidence.transactionHash)===transactionHash&&uint(evidence.blockNumber)===block&&uint(evidence.inputIndex)===BigInt(position)&&uint(evidence.outputIndex)===BigInt(position)&&same(point(evidence.consumedOutPoint),previousOutPoint),"code upgrade evidence has the wrong transaction, consumed outpoint or fixed batch index");
  check(typeof evidence.consumedInput==="string"&&/^0x[0-9a-f]{88}$/i.test(evidence.consumedInput),"invalid consumed code input bytes");
  const consumedInput=evidence.consumedInput.toLowerCase(),input=ccc.CellInput.fromBytes(consumedInput);
  check(ccc.hexFrom(input.toBytes())===consumedInput&&input.since===0n&&same(point(input.previousOutput),previousOutPoint),"code upgrade does not consume the original v2 code outpoint with since zero");
  const blockNumber=`0x${block.toString(16)}`;
  return{schema:v.schema,network:"testnet",contract:id,hashType:"type",isTypeId:true,typeScript,typeHash,lockScript,transactionHash,index:`0x${index.toString(16)}`,blockNumber,dataHash:pin.dataHash,contractSize:pin.byteLength,capacityShannons:capacity.toString(),previous:{transactionHash:previousOutPoint.txHash,index:previousOutPoint.index,dataHash:old.dataHash,contractSize:old.dataBytes,capacityShannons:old.capacity},upgradeEvidence:{transactionHash,blockNumber,inputIndex:position,outputIndex:position,consumedInput,consumedOutPoint:previousOutPoint}};
}
function profileUpgradedCode(manifest,id){return{name:RELEASES[id].name,codeHash:manifest.typeHash,hashType:"type",outPoint:{txHash:manifest.transactionHash,index:manifest.index},dataHash:manifest.dataHash,dataBytes:manifest.contractSize,typeScript:manifest.typeScript,lockScript:manifest.lockScript,capacity:manifest.capacityShannons,blockNumber:manifest.blockNumber};}
function normalizeProfile(value,codes){
  const v=object(value);check(v.schema==="ckboost-isolated-testnet-profile/v1"&&v.network==="testnet"&&Array.isArray(v.dependencies)&&v.dependencies.length===9,"a complete nine-code Testnet profile is required");
  const url=new URL(v.executorUrl);check(url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)&&url.port==="9091"&&url.pathname==="/"&&!url.search&&!url.hash&&!url.username&&!url.password,"only local executor9091 is allowed");
  const expected=[...ISOLATED_QA_PINS.map(pin=>({name:pin.name,codeHash:pin.codeHash,hashType:"type",outPoint:{txHash:pin.txHash,index:pin.index},dataHash:pin.dataHash,dataBytes:pin.dataBytes})),profileCode(codes.protocolLock,"protocol-lock"),profileCode(codes.campaignType,"campaign-type")];
  for(const item of expected){const matches=v.dependencies.filter(row=>object(row).name===item.name);check(matches.length===1,`missing/duplicate code ${item.name}`);const row=matches[0];check(hash(row.codeHash)===item.codeHash&&row.hashType==="type"&&same(point(row.outPoint),item.outPoint)&&hash(row.dataHash)===item.dataHash&&row.dataBytes===item.dataBytes,`unreviewed code ${item.name}`);if(item.typeScript)check(same(script(row.typeScript),item.typeScript)&&same(script(row.lockScript),item.lockScript)&&uint(row.capacity).toString()===item.capacity&&`0x${uint(row.blockNumber).toString(16)}`===item.blockNumber,"new code profile/manifest mismatch");}
  check(new Set(expected.map(item=>item.codeHash)).size===9&&new Set(expected.map(item=>canonical(item.outPoint))).size===9,"code identities must be distinct");
  return{schema:v.schema,network:"testnet",executorUrl:EXECUTOR,dependencies:expected};
}
const CONFIG_NAMES={ckb_boost_protocol_type_code_hash:"ckboostProtocolType",ckb_boost_protocol_lock_code_hash:"ckboostProtocolLock",ckb_boost_campaign_type_code_hash:"ckboostCampaignType",ckb_boost_funding_lock_code_hash:"ckboostFundingLock",ckb_boost_user_type_code_hash:"ckboostUserType",ckb_boost_points_udt_type_code_hash:"ckboostPointsUdt",ckb_boost_tipping_type_code_hash:"ckboostTippingType",ckb_boost_achievement_type_code_hash:"ckboostAchievementType"};
function normalizeProtocol(value,profile){
  const v=object(value);check(v.schema==="ckboost-isolated-testnet-protocol-state/v1"&&v.network==="testnet"&&v.index==="0x0","a confirmed initial protocol-state manifest is required");
  const typeScript=script(v.protocolTypeScript),typeHash=scriptHash(typeScript),lockScript=script(v.protocolLockScript),byName=name=>profile.dependencies.find(item=>item.name===name);
  check(typeScript.codeHash===byName("ckboostProtocolType").codeHash&&/^0x[0-9a-f]{64}$/.test(typeScript.args)&&!/^0x0{64}$/.test(typeScript.args)&&typeHash===hash(v.protocolTypeHash),"protocol state type identity mismatch");
  const expectedLock={codeHash:byName("ckboostProtocolLock").codeHash,hashType:"type",args:ccc.hexFrom(ConnectedTypeID.encode({type_id:ownerHash(),connected_key:typeHash}))};check(same(lockScript,expectedLock),"protocol owner/connection mismatch");
  check(typeof v.protocolDataHex==="string"&&/^0x(?:[0-9a-f]{2})+$/i.test(v.protocolDataHex)&&v.protocolDataHex.length<65536,"invalid protocol data");const data=ProtocolData.decode(v.protocolDataHex),dataHash=ccc.hashCkb(v.protocolDataHex);check(dataHash===hash(v.dataHash)&&ccc.hexFrom(ProtocolData.encode(data))===v.protocolDataHex,"protocol data hash/encoding mismatch");
  const expected={protocol_config:{admin_lock_hash_vec:[ownerHash()],script_code_hashes:{...Object.fromEntries(Object.entries(CONFIG_NAMES).map(([field,name])=>[field,byName(name).codeHash])),accepted_udt_type_scripts:[],accepted_dob_type_scripts:[]},streak_bonus_interval:0,streak_bonus_amount:0,achievement_type_hashes:[]},campaigns_approved:[],tippings_approved:[],endorsers_whitelist:[],last_updated:data.last_updated,tipping_config:{approval_requirement_thresholds:[100000000000n,500000000000n,1000000000000n],expiration_duration:2592000}};
  check(ccc.hexFrom(ProtocolData.encode(expected))===v.protocolDataHex&&same(v.adminLockHashes,[ownerHash()])&&same(v.campaignsApproved,[])&&same(v.tippingsApproved,[])&&same(v.endorsersWhitelist,[]),"initial admin/config/memberships mismatch");
  const capacity=uint(v.capacityShannons);check(capacity===ccc.CellOutput.from({lock:lockScript,type:typeScript},v.protocolDataHex).capacity,"protocol occupied capacity mismatch");
  return{schema:v.schema,network:"testnet",transactionHash:hash(v.transactionHash),index:"0x0",blockNumber:`0x${uint(v.blockNumber).toString(16)}`,protocolTypeScript:typeScript,protocolTypeHash:typeHash,protocolLockScript:lockScript,dataHash,protocolDataHex:v.protocolDataHex,capacityShannons:capacity.toString(),adminLockHashes:[ownerHash()],campaignsApproved:[],tippingsApproved:[],endorsersWhitelist:[],profile};
}
function record(code){return{transactionHash:code.outPoint.txHash,index:code.outPoint.index,deployedAt:"0",contractName:code.name,typeHash:code.codeHash,dataHash:code.dataHash,contractSize:code.dataBytes,isTypeId:true,...(code.typeScript?{typeScript:code.typeScript}:{}),tag:"isolated-qa-public-code"};}
/** Offline consistency only. The caller must supply independently confirmed manifests. */
export function makeIsolatedRuntimeConfig(protocolManifest,protocolCodeManifest,campaignCodeManifest,explicitProfile){
  const codes={protocolLock:normalizeCode(protocolCodeManifest,"protocol-lock"),campaignType:normalizeCode(campaignCodeManifest,"campaign-type")};
  const profile=normalizeProfile(explicitProfile??object(protocolManifest).profile,codes),embeddedProfile=normalizeProfile(object(protocolManifest).profile,codes);check(same(profile,embeddedProfile),"protocol manifest/profile disagree");
  const protocol=normalizeProtocol(protocolManifest,profile),sources={protocolManifest:protocol,protocolCodeManifest:codes.protocolLock,campaignCodeManifest:codes.campaignType,profile};
  const currentTestnet=Object.fromEntries(profile.dependencies.filter(item=>item.name!=="claimablePoolLock").map(item=>[item.name,record(item)]));currentTestnet.ckboostUserLock=null;
  const current={testnet:currentTestnet,mainnet:Object.fromEntries(Object.keys(currentTestnet).map(name=>[name,null]))},claimablePool=record(profile.dependencies.find(item=>item.name==="claimablePoolLock"));
  const profileHash=ccc.hashCkb(ccc.bytesFrom(canonical(sources),"utf8"));
  return freeze({schema:"ckboost-isolated-testnet-runtime/v1",network:"testnet",profileHash,rpcUrl:RPC,executorUrl:EXECUTOR,protocol:{typeScript:protocol.protocolTypeScript,typeHash:protocol.protocolTypeHash,creationOutPoint:{txHash:protocol.transactionHash,index:"0x0"},initialDataHash:protocol.dataHash},current,claimablePool,sources});
}
/** Preserve initial protocol evidence while selecting fresh, QA-owned UserType code.
 * Offline consistency only: callers must check the referenced cell and protocol
 * configuration independently before activation. Creation evidence checks the
 * TypeID derivation; this offline module does not assert transaction inclusion,
 * current code liveness, or protocol configuration activation.
 */
export function makeIndependentUserRuntimeConfig(baseV1,verifiedUserCodeDeployment){
  check(object(baseV1).schema==="ckboost-isolated-testnet-runtime/v1","independent UserType requires the original v1 runtime");
  const base=validateIsolatedRuntimeConfig(baseV1),userCodeDeploymentManifest=normalizeUserCodeDeployment(verifiedUserCodeDeployment,base),userCode=profileUserCode(userCodeDeploymentManifest);
  const effectiveProfile={...base.sources.profile,schema:"ckboost-isolated-testnet-profile/v2",dependencies:base.sources.profile.dependencies.map(row=>row.name==="ckboostUserType"?userCode:row)};
  check(new Set(effectiveProfile.dependencies.map(row=>row.codeHash)).size===9&&new Set(effectiveProfile.dependencies.map(row=>canonical(row.outPoint))).size===9,"effective code identities must be distinct");
  const sources={...base.sources,userCodeDeploymentManifest,effectiveProfile},profileHash=ccc.hashCkb(ccc.bytesFrom(canonical(sources),"utf8"));
  return freeze({...base,schema:"ckboost-isolated-testnet-runtime/v2",profileHash,current:{...base.current,testnet:{...base.current.testnet,ckboostUserType:record(userCode)}},sources});
}
/** One atomic upgrade of the two original QA TypeID code cells. This performs
 * offline source consistency only; full transaction inclusion, code liveness,
 * binary verification and signing authority must be confirmed externally.
 */
export function makeUpgradedIsolatedRuntimeConfig(baseV2,protocolLockUpgrade,campaignTypeUpgrade){
  check(object(baseV2).schema==="ckboost-isolated-testnet-runtime/v2","QA code upgrades require the original verified v2 runtime");
  const base=validateIsolatedRuntimeConfig(baseV2),pins=QA_UPGRADE_ANCESTORS;
  check(base.protocol.typeHash===pins.protocolTypeHash&&base.current.testnet.ckboostUserType.typeHash===pins.userTypeHash,"QA code upgrade parent protocol or fresh UserType identity changed");
  for(const[key,name]of[["protocolLock","ckboostProtocolLock"],["campaignType","ckboostCampaignType"]]){const previous=base.current.testnet[name];check(previous.typeHash===pins[key].typeHash&&previous.transactionHash===pins[key].transactionHash&&uint(previous.index)===0n,"code upgrades are restricted to the two original QA code identities/outpoints");}
  const codeUpgradeManifests={protocolLock:normalizeCodeUpgrade(protocolLockUpgrade,"protocol-lock",0,base),campaignType:normalizeCodeUpgrade(campaignTypeUpgrade,"campaign-type",1,base)};
  check(codeUpgradeManifests.protocolLock.transactionHash===codeUpgradeManifests.campaignType.transactionHash&&codeUpgradeManifests.protocolLock.blockNumber===codeUpgradeManifests.campaignType.blockNumber,"both QA code upgrades must belong to the same atomic batch transaction/block");
  const upgraded=[profileUpgradedCode(codeUpgradeManifests.protocolLock,"protocol-lock"),profileUpgradedCode(codeUpgradeManifests.campaignType,"campaign-type")];
  const effectiveProfile={...base.sources.effectiveProfile,schema:"ckboost-isolated-testnet-profile/v3",dependencies:base.sources.effectiveProfile.dependencies.map(row=>upgraded.find(code=>code.name===row.name)??row)};
  check(new Set(effectiveProfile.dependencies.map(row=>row.codeHash)).size===9&&new Set(effectiveProfile.dependencies.map(row=>canonical(row.outPoint))).size===9,"upgraded code identities/outpoints must remain distinct");
  const sources={...base.sources,parentProfileHash:base.profileHash,codeUpgradeManifests,effectiveProfile},profileHash=ccc.hashCkb(ccc.bytesFrom(canonical(sources),"utf8"));
  return freeze({...base,schema:"ckboost-isolated-testnet-runtime/v3",profileHash,current:{...base.current,testnet:{...base.current.testnet,...Object.fromEntries(upgraded.map(row=>[row.name,record(row)]))}},sources});
}
export function validateIsolatedRuntimeConfig(value){
  const v=object(value);check(["ckboost-isolated-testnet-runtime/v1","ckboost-isolated-testnet-runtime/v2","ckboost-isolated-testnet-runtime/v3"].includes(v.schema)&&v.network==="testnet","wrong runtime schema/network");
  const source=object(v.sources),base=makeIsolatedRuntimeConfig(source.protocolManifest,source.protocolCodeManifest,source.campaignCodeManifest,source.profile);
  const v2=v.schema==="ckboost-isolated-testnet-runtime/v1"?null:makeIndependentUserRuntimeConfig(base,source.userCodeDeploymentManifest);
  const upgrades=v.schema==="ckboost-isolated-testnet-runtime/v3"?object(source.codeUpgradeManifests):null;
  const expected=upgrades?makeUpgradedIsolatedRuntimeConfig(v2,upgrades.protocolLock,upgrades.campaignType):v2??base;
  check(same(v,expected),"runtime derived fields or profile hash changed");return expected;
}
/** Opt-in only. Missing/invalid data in QA mode never falls back to shared data. */
export function getIsolatedRuntime(env){
  // Keep public reads static so Next inlines the same profile into browser
  // code; aliasing process.env would silently lose NEXT_PUBLIC values.
  env??={CKBOOST_ISOLATED_QA:typeof window==="undefined"?process.env.CKBOOST_ISOLATED_QA:undefined,
    NEXT_PUBLIC_CKBOOST_ISOLATED_QA:process.env.NEXT_PUBLIC_CKBOOST_ISOLATED_QA,
    NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE:process.env.NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE,
    NEXT_PUBLIC_CKB_NETWORK:process.env.NEXT_PUBLIC_CKB_NETWORK,
    NEXT_PUBLIC_PROTOCOL_TYPE_ARGS:process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS,
    NEXT_PUBLIC_SSRI_EXECUTOR_URL:process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL,
    NEXT_PUBLIC_CKB_RPC_URL:process.env.NEXT_PUBLIC_CKB_RPC_URL,
    NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS:process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS};
  const server=env.CKBOOST_ISOLATED_QA,client=env.NEXT_PUBLIC_CKBOOST_ISOLATED_QA;
  if(server!=="1"&&client!=="1")return null;
  check((server==null||server==="1")&&(client==null||client==="1"),"mode flags disagree");
  check(env.NEXT_PUBLIC_CKB_NETWORK==="testnet","QA requires explicit testnet network");
  const raw=env.NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE;check(typeof raw==="string"&&raw.length>0&&raw.length<=200000,"missing/bounded public runtime profile");
  let value;try{value=JSON.parse(raw);}catch{fail("public runtime profile is not JSON");}const config=validateIsolatedRuntimeConfig(value);
  check(env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS===config.protocol.typeScript.args,"protocol args do not match runtime profile");
  check(env.NEXT_PUBLIC_SSRI_EXECUTOR_URL===config.executorUrl,"executor does not match runtime profile");
  check(env.NEXT_PUBLIC_CKB_RPC_URL===config.rpcUrl,"RPC does not match runtime profile");
  if(env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS){let current;try{current=JSON.parse(env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS);}catch{fail("current registry is not JSON");}check(same(current,config.current),"current registry disagrees with runtime profile");}
  return config;
}
export function isolatedRuntimeEnvironment(value){const config=validateIsolatedRuntimeConfig(value);return{CKBOOST_ISOLATED_QA:"1",NEXT_PUBLIC_CKBOOST_ISOLATED_QA:"1",NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE:JSON.stringify(config),NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS:JSON.stringify(config.current),NEXT_PUBLIC_CKB_NETWORK:"testnet",NEXT_PUBLIC_PROTOCOL_TYPE_ARGS:config.protocol.typeScript.args,NEXT_PUBLIC_CKB_RPC_URL:config.rpcUrl,NEXT_PUBLIC_CKB_INDEXER_URL:config.rpcUrl,NEXT_PUBLIC_SSRI_EXECUTOR_URL:config.executorUrl,CKBOOST_NEXT_DIST_DIR:`.next-isolated-${config.profileHash.slice(2,14)}`};}
