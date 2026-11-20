import { CreationWorkspace } from "@/components/revamp/creation-workspace";
export default async function EditCampaignPage({params}:{params:Promise<{campaignTypeId:string}>}){const {campaignTypeId}=await params;return <CreationWorkspace campaignTypeId={campaignTypeId}/>;}
