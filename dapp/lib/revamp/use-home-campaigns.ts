"use client";

import { useMemo } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { useDiscovery } from "./discovery-provider";
import { cellToCampaignDisplay, type CampaignDisplay } from "@/lib/utils/campaign-utils";
import { createScopedLogger } from "ssri-ckboost/logging";
import { selectApprovedCampaigns } from "./approved-campaigns";
import { getDiscoveryStatus } from "./campaign-discovery";
import { buildCampaignRewards } from "./campaign-rewards";

const log = createScopedLogger("RevampHome");

export function useHomeCampaigns() {
  const discovery = useDiscovery();
  const ready = Boolean(discovery.protocolData && discovery.protocolCell);
  const approvedIds = useMemo(() => (discovery.protocolData?.campaigns_approved ?? [])
    .map(id => ccc.hexFrom(id).toLowerCase()), [discovery.protocolData]);

  const campaigns = useMemo(() => {
    if (!ready) return [];
    const decoded: CampaignDisplay[] = [];
    for (const cell of discovery.campaignCells) {
      try {
        const campaign = cellToCampaignDisplay(cell, { endorserResolver: discovery.endorserResolver });
        // Quarantine malformed schedules/rewards rather than breaking the grid.
        getDiscoveryStatus(campaign);
        buildCampaignRewards(campaign);
        decoded.push(campaign);
      } catch (error) {
        log.warn("Skipping an unreadable campaign", error);
      }
    }
    return selectApprovedCampaigns(decoded, approvedIds);
  }, [ready, discovery.campaignCells, discovery.endorserResolver, approvedIds]);

  const pendingCount = ready ? Math.max(0, discovery.pendingCount) : 0;
  // Completed cards remain usable while other approved IDs are fetched.
  const isLoading = discovery.protocolLoading ||
    (ready && campaigns.length === 0 && discovery.campaignLoading);
  const missingCount = Math.max(0, new Set(approvedIds).size - campaigns.length - pendingCount);
  const hasError = Boolean(discovery.protocolError ||
    (!isLoading && !ready) ||
    (!isLoading && campaigns.length === 0 && (discovery.campaignError || missingCount > 0)));

  async function retry() {
    try {
      await discovery.retry();
    } catch (error) {
      // The provider retains the error for the retry UI. Do not leak an
      // unhandled rejection from an onClick={() => void retry()} caller.
      log.warn("Discovery retry failed", error);
    }
  }

  return { campaigns, isLoading, hasError, missingCount, pendingCount, retry };
}
