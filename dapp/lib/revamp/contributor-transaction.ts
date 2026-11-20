import type { ccc } from "@ckb-ccc/connector-react";

/** Preserve the wallet's send implementation (including multisig checks), while
 * observing its actual client broadcast. No signer/client object is mutated. */
export function createContributorSigner(signer:ccc.Signer,check:()=>Promise<unknown>,onBroadcast:()=>void):ccc.Signer {
  const client=new Proxy(signer.client,{get(target,key){
    const value=Reflect.get(target,key,target);
    if(key==="sendTransaction")return async(...args:Parameters<ccc.Client["sendTransaction"]>)=>{await check();onBroadcast();return target.sendTransaction(...args);};
    return typeof value==="function"?value.bind(target):value;
  }});
  return new Proxy(signer,{get(target,key,receiver){
    if(key==="client")return client;
    if(key==="sendTransaction")return async(...args:Parameters<ccc.Signer["sendTransaction"]>)=>{await check();return target.sendTransaction.apply(receiver,args);};
    const value=Reflect.get(target,key,target);
    return typeof value==="function"?value.bind(target):value;
  }});
}
