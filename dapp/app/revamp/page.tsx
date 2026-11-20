import { Suspense } from "react";
import type { Metadata } from "next";
import { RevampHomePage, RevampHomeLoading } from "@/components/revamp/home-page";

export const metadata: Metadata = { title: "CKBoost · Explore campaigns (preview)" };

export default function RevampPreview() {
  return <Suspense fallback={<RevampHomeLoading />}><RevampHomePage /></Suspense>;
}
