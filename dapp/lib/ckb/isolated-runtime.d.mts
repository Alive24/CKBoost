export interface IsolatedPublicScript {codeHash:string;hashType:"type";args:string}
export interface IsolatedRuntimeRecord {transactionHash:string;index:string;deployedAt:string;contractName:string;typeHash:string;dataHash:string;contractSize:number;isTypeId:true;typeScript?:IsolatedPublicScript;tag:string}
export interface IsolatedRuntimeConfig {
  schema:"ckboost-isolated-testnet-runtime/v1"|"ckboost-isolated-testnet-runtime/v2"|"ckboost-isolated-testnet-runtime/v3";network:"testnet";profileHash:string;rpcUrl:string;executorUrl:string;
  protocol:{typeScript:IsolatedPublicScript;typeHash:string;creationOutPoint:{txHash:string;index:"0x0"};initialDataHash:string};
  current:{testnet:Record<string,IsolatedRuntimeRecord|null>;mainnet:Record<string,null>};claimablePool:IsolatedRuntimeRecord;
  sources:{protocolManifest:Record<string,unknown>;protocolCodeManifest:Record<string,unknown>;campaignCodeManifest:Record<string,unknown>;profile:Record<string,unknown>;userCodeDeploymentManifest?:Record<string,unknown>;effectiveProfile?:Record<string,unknown>;parentProfileHash?:string;codeUpgradeManifests?:{protocolLock:Record<string,unknown>;campaignType:Record<string,unknown>}};
}
export const ISOLATED_QA_PINS:readonly {name:string;codeHash:string;txHash:string;index:string;dataHash:string;dataBytes:number}[];
export function canonical(value:unknown):string;
export function makeIsolatedRuntimeConfig(protocolManifest:unknown,protocolCodeManifest:unknown,campaignCodeManifest:unknown,explicitProfile?:unknown):IsolatedRuntimeConfig;
export function makeIndependentUserRuntimeConfig(baseV1:unknown,verifiedUserCodeDeployment:unknown):IsolatedRuntimeConfig;
export function makeUpgradedIsolatedRuntimeConfig(baseV2:unknown,protocolLockUpgrade:unknown,campaignTypeUpgrade:unknown):IsolatedRuntimeConfig;
export function validateIsolatedRuntimeConfig(value:unknown):IsolatedRuntimeConfig;
export function getIsolatedRuntime(environment?:Record<string,string|undefined>):IsolatedRuntimeConfig|null;
export function isolatedRuntimeEnvironment(value:unknown):Record<string,string>;
