"use client";

import { WalletProvider } from "@/components/wallet-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { NostrProvider } from "@/lib/providers/nostr-provider";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { DiscoveryProvider } from "@/lib/revamp/discovery-provider";
import { PendingTransactionProvider } from "@/lib/providers/pending-transaction-provider";

const LegacyBusinessProviders = dynamic(() => import("./legacy-business-providers"));
const RevampBusinessProviders = dynamic(() => import("./revamp/business-providers"));

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDiscovery = pathname === "/revamp";
  const isDesignSystem = pathname === "/revamp/design-system" || pathname.startsWith("/revamp/design-system/");
  const isTestnetSetup = pathname === "/revamp/testnet-setup" || pathname.startsWith("/revamp/testnet-setup/");
  const isRevampBusiness = pathname.startsWith("/revamp/") && !isDesignSystem && !isTestnetSetup;
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
            {isDiscovery ? (
              <NostrProvider><DiscoveryProvider>{children}</DiscoveryProvider></NostrProvider>
            ) : isDesignSystem || isTestnetSetup ? children : isRevampBusiness ? (
              <RevampBusinessProviders>{children}</RevampBusinessProviders>
            ) : (
              <LegacyBusinessProviders>{children}</LegacyBusinessProviders>
            )}
          </PendingTransactionProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
