"use client";

import { WalletProvider } from "@/components/wallet-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { CampaignProvider } from "@/lib";
import { ProtocolProvider } from "@/lib/providers/protocol-provider";
import { UserProvider } from "@/lib/providers/user-provider";
import { NostrProvider } from "@/lib/providers/nostr-provider";
import { CampaignAdminProvider } from "@/lib/providers/campaign-admin-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { StorageModalProvider } from "@/lib/providers/storage-modal-provider";
import { TippingProvider } from "@/lib/providers/tipping-provider";
import { PendingTransactionProvider } from "@/lib/providers/pending-transaction-provider";
import { QuestClaimIssuanceProvider } from "@/lib/providers/quest-claim-issuance-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <PendingTransactionProvider>
            <QuestClaimIssuanceProvider>
              <NostrProvider>
                <ProtocolProvider>
                  <CampaignProvider>
                    <UserProvider>
                      <CampaignAdminProvider>
                        <StorageModalProvider>
                          <TippingProvider>{children}</TippingProvider>
                        </StorageModalProvider>
                      </CampaignAdminProvider>
                    </UserProvider>
                  </CampaignProvider>
                </ProtocolProvider>
              </NostrProvider>
            </QuestClaimIssuanceProvider>
          </PendingTransactionProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
