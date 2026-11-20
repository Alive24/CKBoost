import { ccc } from "@ckb-ccc/connector-react";
import type { Campaign } from "ssri-ckboost";
import type { ProtocolDataLike } from "ssri-ckboost/types";
import { CampaignAdminService } from "@/lib/services/campaign-admin-service";

/** Read-only scans can outlive the UI deadline. Guard every next iterator step
 * so an expired scan stops at the next yield instead of fetching more pages. */
function guardedReadSigner(signer:ccc.Signer,isCurrent:()=>boolean):ccc.Signer {
  const check=()=>{if(!isCurrent())throw new DOMException("The submission check expired or its account changed.","AbortError");};
  const wrap=(value:unknown):unknown=>{
    if(value&&typeof value==="object"&&Symbol.asyncIterator in value){
      return (async function*(){const iterator=(value as AsyncIterable<unknown>)[Symbol.asyncIterator]();try{while(true){check();const next=await iterator.next();check();if(next.done)return;yield next.value;}}finally{await iterator.return?.();}})();
    }
    if(value&&typeof(value as PromiseLike<unknown>).then==="function")return Promise.resolve(value).then(result=>{check();return result;});
    return value;
  };
  const client=new Proxy(signer.client,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=="function")return value;return(...args:unknown[])=>{check();return wrap(value.apply(target,args));};}});
  return new Proxy(signer,{get(target,key){if(key==="client")return client;const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
}

export function createCreationCampaignService(signer:ccc.Signer,protocolCell:ccc.Cell,protocolData:ProtocolDataLike,campaign:Campaign|null=null,isCurrent?:()=>boolean):CampaignAdminService {
  const protocolHash=protocolCell.cellOutput.type?.hash();
  if(!protocolHash)throw new Error("The current protocol type identity is unavailable.");
  return new CampaignAdminService(isCurrent?guardedReadSigner(signer,isCurrent):signer,
    ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash),protocolHash,
    ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),protocolCell,campaign);
}
