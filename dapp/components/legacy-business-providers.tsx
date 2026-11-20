"use client";

import type { ReactNode } from "react";
import { CampaignProvider } from "@/lib/providers/campaign-provider";
import { ProtocolProvider } from "@/lib/providers/protocol-provider";
import { UserProvider } from "@/lib/providers/user-provider";
import { NostrProvider } from "@/lib/providers/nostr-provider";
import { CampaignAdminProvider } from "@/lib/providers/campaign-admin-provider";
import { StorageModalProvider } from "@/lib/providers/storage-modal-provider";
import { TippingProvider } from "@/lib/providers/tipping-provider";
import { QuestClaimIssuanceProvider } from "@/lib/providers/quest-claim-issuance-provider";

/** The existing context order is retained inside its own route-loaded module. */
export default function LegacyBusinessProviders({ children }: { children: ReactNode }) {
  return <QuestClaimIssuanceProvider><NostrProvider><ProtocolProvider><CampaignProvider><UserProvider><CampaignAdminProvider><StorageModalProvider><TippingProvider>{children}</TippingProvider></StorageModalProvider></CampaignAdminProvider></UserProvider></CampaignProvider></ProtocolProvider></NostrProvider></QuestClaimIssuanceProvider>;
}
