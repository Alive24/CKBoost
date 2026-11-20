"use client";
import { useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import type { CreationAuthorizationSnapshot } from "./creation-authorization";
import { createCreationCampaignService } from "./creation-service";
export const CREATION_SUBMISSION_CHECK_TIMEOUT_MS=12_000;
type Result=Awaited<ReturnType<ReturnType<typeof createCreationCampaignService>["fetchCampaignSubmissions"]>>;

export function useCreationSubmissionCheck(snapshot:CreationAuthorizationSnapshot|undefined,campaignId:string|undefined,enabled:boolean,attempt:number) {
  const current=useRef({snapshot,campaignId,enabled,attempt});current.current={snapshot,campaignId,enabled,attempt};
  const [state,setState]=useState<{snapshot:CreationAuthorizationSnapshot;campaignId:string;attempt:number;loading:boolean;result?:Result;error?:string}|null>(null);
  const matches=Boolean(state&&state.snapshot===snapshot&&state.campaignId===campaignId&&state.attempt===attempt);
  useEffect(()=>{
    if(!snapshot||!campaignId||!enabled)return;
    let cancelled=false,active=true,deadline:ReturnType<typeof setTimeout>|undefined;
    const matchesScope=()=>current.current.snapshot===snapshot&&current.current.campaignId===campaignId&&current.current.enabled&&current.current.attempt===attempt;
    setState({snapshot,campaignId,attempt,loading:true});
    const read=async()=>{
      const service=createCreationCampaignService(snapshot.signer,snapshot.protocolCell,snapshot.protocolData,null,()=>active&&!cancelled&&matchesScope());
      return service.fetchCampaignSubmissions(campaignId as ccc.Hex);
    };
    const timed=new Promise<never>((_,reject)=>{deadline=setTimeout(()=>{active=false;reject(new Error("Submission history check timed out. Retry the submission check."));},CREATION_SUBMISSION_CHECK_TIMEOUT_MS);});
    Promise.race([read(),timed]).then(result=>{if(!cancelled&&matchesScope())setState({snapshot,campaignId,attempt,loading:false,result});})
      .catch(error=>{if(!cancelled&&matchesScope())setState({snapshot,campaignId,attempt,loading:false,error:error instanceof Error?error.message:"Submission history could not be checked."});})
      .finally(()=>{active=false;clearTimeout(deadline);});
    return()=>{cancelled=true;active=false;clearTimeout(deadline);};
  },[snapshot,campaignId,enabled,attempt]);
  return {result:enabled&&matches?state?.result:undefined,error:enabled&&matches?state?.error:undefined,loading:Boolean(enabled&&(!matches||state?.loading))};
}
