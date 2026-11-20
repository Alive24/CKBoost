import { Suspense } from "react";
import { ContributorCampaignPage } from "@/components/revamp/contributor-page";

export default async function CampaignPage({params}:{params:Promise<{campaignTypeId:string}>}) {
  const {campaignTypeId}=await params;
  return <Suspense fallback={<p role="status">Loading campaign…</p>}><ContributorCampaignPage campaignTypeId={campaignTypeId}/></Suspense>;
}
