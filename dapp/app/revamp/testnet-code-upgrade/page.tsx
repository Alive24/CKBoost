import { notFound } from "next/navigation";
import { isTestnetSetupEnabled } from "@/lib/revamp/testnet-setup-config";
import { TestnetPermissionUpgradeWorkspace } from "@/components/revamp/testnet-permission-upgrade-workspace";
export const dynamic = "force-dynamic";
export default function PermissionUpgradePage() {
  if (!isTestnetSetupEnabled(process.env.CKBOOST_ENABLE_TESTNET_SETUP, process.env.NEXT_PUBLIC_CKB_NETWORK)) notFound();
  return <TestnetPermissionUpgradeWorkspace/>;
}
