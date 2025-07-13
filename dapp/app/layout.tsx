import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/components/wallet-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { CampaignProvider } from '@/lib'
import { ProtocolProvider } from '@/lib/providers/protocol-provider'

export const metadata: Metadata = {
  title: 'CKBoost',
  description: 'Decentralized campaign platform on CKB blockchain for community contribution rewards',
  generator: 'Next.js',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider>
            <CampaignProvider>
              <ProtocolProvider>
                {children}
              </ProtocolProvider>
            </CampaignProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
