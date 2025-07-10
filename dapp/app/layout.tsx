import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/components/wallet-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { CampaignProvider } from '@/lib'

export const metadata: Metadata = {
  title: 'v0 App',
  description: 'Created with v0',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider>
            <CampaignProvider>
              {children}
            </CampaignProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
