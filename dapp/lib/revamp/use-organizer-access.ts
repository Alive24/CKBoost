"use client";

import { useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { useDiscovery } from "./discovery-provider";
import { getCampaignCapabilities } from "./campaign-permissions";

/** A previous account's provider role must never authorize the current account. */
export function useOrganizerAccess() {
  const signer = ccc.useSigner();
  const { protocolData, protocolLoading } = useDiscovery();
  const [resolved, setResolved] = useState<{
    signer: typeof signer;
    protocolData: typeof protocolData;
    allowed: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!signer || !protocolData || protocolLoading) return;
    signer.getRecommendedAddressObj().then(address => {
      const hash = address.script.hash().toLowerCase();
      const allowed = getCampaignCapabilities({signerLockHash:hash,protocol:{
        adminLockHashes:protocolData.protocol_config.admin_lock_hash_vec.map(value=>ccc.hexFrom(value)),
        endorserLockHashes:protocolData.endorsers_whitelist.map(value=>ccc.hexFrom(value.endorser_lock_hash)),
        approvedCampaignTypeIds:protocolData.campaigns_approved.map(value=>ccc.hexFrom(value)),
      }}).canCreateCampaign;
      if (!cancelled) setResolved({ signer, protocolData, allowed });
    }).catch(() => {
      if (!cancelled) setResolved({ signer, protocolData, allowed: false });
    });
    return () => { cancelled = true; };
  }, [signer, protocolData, protocolLoading]);

  return Boolean(signer && !protocolLoading && resolved?.signer === signer &&
    resolved.protocolData === protocolData && resolved.allowed);
}
