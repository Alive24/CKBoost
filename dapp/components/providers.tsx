'use client'

import { WalletProvider } from '@/components/wallet-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { CampaignProvider } from '@/lib'
import { ProtocolProvider } from '@/lib/providers/protocol-provider'
import { UserProvider } from '@/lib/providers/user-provider'
import { NostrProvider } from '@/lib/providers/nostr-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      },
    },
  }))

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <NostrProvider>
            <CampaignProvider>
              <ProtocolProvider>
                <UserProvider>
                  {children}
                </UserProvider>
              </ProtocolProvider>
            </CampaignProvider>
          </NostrProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}