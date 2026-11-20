"use client";
import { useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { readCreationAuthorization, type CreationAuthorizationSnapshot } from "./creation-authorization";
export const CREATION_ACCESS_TIMEOUT_MS=12_000;

export function useCreationAuthorization(campaignTypeId?:string,attempt=0) {
  const signer=ccc.useSigner();
  const {client}=ccc.useCcc();
  const current=useRef({signer,client,campaignTypeId,attempt});current.current={signer,client,campaignTypeId,attempt};
  const [state,setState]=useState<{signer:typeof signer;client:typeof client;campaignTypeId?:string;attempt:number;snapshot?:CreationAuthorizationSnapshot;error?:string}|null>(null);
  const matches=Boolean(state&&state.signer===signer&&state.client===client&&state.campaignTypeId===campaignTypeId&&state.attempt===attempt);
  useEffect(()=>{
    let cancelled=false,active=true;
    if(!signer)return;
    const matchesScope=()=>current.current.signer===signer&&current.current.client===client&&current.current.campaignTypeId===campaignTypeId&&current.current.attempt===attempt;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    const timed=new Promise<never>((_,reject)=>{deadline=setTimeout(()=>{active=false;reject(new Error("Organizer access check timed out. Retry the access check."));},CREATION_ACCESS_TIMEOUT_MS);});
    Promise.race([readCreationAuthorization(signer,campaignTypeId,()=>active&&!cancelled&&matchesScope()),timed])
      .then(snapshot=>{if(!cancelled&&matchesScope())setState({signer,client,campaignTypeId,attempt,snapshot});})
      .catch(error=>{if(!cancelled&&matchesScope())setState({signer,client,campaignTypeId,attempt,error:error instanceof Error?error.message:"Campaign access could not be checked."});})
      .finally(()=>{active=false;clearTimeout(deadline);});
    return()=>{cancelled=true;active=false;clearTimeout(deadline);};
  },[signer,client,campaignTypeId,attempt]);
  return {snapshot:matches?state?.snapshot:undefined,error:matches?state?.error:undefined,loading:Boolean(signer&&(!matches||(!state?.snapshot&&!state?.error)))};
}
