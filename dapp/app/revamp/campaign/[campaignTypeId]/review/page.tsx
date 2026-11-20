import { SubmissionReviewPage } from "@/components/revamp/submission-review";

export default async function ReviewPage({params}: {params: Promise<{campaignTypeId: string}>}) {
  const {campaignTypeId} = await params;
  return <SubmissionReviewPage campaignTypeId={campaignTypeId} />;
}
