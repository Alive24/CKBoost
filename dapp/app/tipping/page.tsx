import { Navigation } from "@/components/navigation"
import { TipProposals } from "@/components/tip-proposals"
import { WalletConnect } from "@/components/wallet-connect"

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-4xl">💰</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Community Tipping Proposals
            </h1>
          </div>
          <p className="text-lg text-muted-foreground mb-6">
            Discover and support valuable community contributions through tip proposals. Vote on community-funded
            tips or add your own personal tips to show appreciation.
          </p>
        </div>

        <TipProposals />
      </main>
    </div>
  )
}
