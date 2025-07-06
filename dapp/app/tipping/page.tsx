import { Navigation } from "@/components/navigation"
import { TipProposals } from "@/components/tip-proposals"
import { WalletConnect } from "@/components/wallet-connect"

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="lg:w-2/3">
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
          </div>

          {/* Sidebar */}
          <div className="lg:w-1/3">
            <div className="sticky top-8 space-y-6">
              {/* Tipping Stats */}
              <div className="bg-white rounded-xl p-6 shadow-sm border">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <span>💰</span> Your Tipping Activity
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proposals Created</span>
                    <span className="font-semibold">2</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proposals Approved</span>
                    <span className="font-semibold">5</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Additional Tips Sent</span>
                    <span className="font-semibold">3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CKB Tipped</span>
                    <span className="font-semibold text-green-600">125 CKB</span>
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div className="bg-white rounded-xl p-6 shadow-sm border">
                <h3 className="font-semibold mb-4">How Community Tipping Works</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 font-semibold">1.</span>
                    <span>Create a tip proposal for valuable contributions</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 font-semibold">2.</span>
                    <span>Community votes on proposals (5 approvals needed)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 font-semibold">3.</span>
                    <span>Approved proposals receive 50 CKB from treasury</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 font-semibold">4.</span>
                    <span>Anyone can add personal tips to any proposal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
