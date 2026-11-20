import { notFound } from "next/navigation";
import { TestnetSetupWorkspace } from "@/components/revamp/testnet-setup-workspace";
import { isTestnetSetupEnabled } from "@/lib/revamp/testnet-setup-config";

export const dynamic = "force-dynamic";

export default function TestnetSetupPage() {
  if (!isTestnetSetupEnabled(process.env.CKBOOST_ENABLE_TESTNET_SETUP, process.env.NEXT_PUBLIC_CKB_NETWORK)) notFound();
  return <TestnetSetupWorkspace />;
}
