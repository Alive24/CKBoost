"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Coins, AlertCircle, CheckCircle, ExternalLink, Clock } from "lucide-react"
import Link from "next/link"

// Mock quest data
const QUEST_DATA: Record<number, any> = {
  1: {
    id: 1,
    title: "Create CKB Tutorial Video",
    campaignName: "CKB Ecosystem Growth Initiative",
    status: "active",
    participants: 12,
    rewards: {
      points: 200,
      tokens: [
        { symbol: "CKB", amount: 100, funded: 800, required: 1200 },
        { symbol: "SPORE", amount: 50, funded: 300, required: 600 },
      ],
    },
    adminPubkey: "ckb1qyq...abc123",
    escrowAddress: "ckb1qyq...escrow456",
    fundingHistory: [
      {
        id: 1,
        token: "CKB",
        amount: 500,
        txHash: "0x1234...abcd",
        timestamp: "2024-01-22T10:30:00Z",
        status: "confirmed",
      },
      {
        id: 2,
        token: "CKB",
        amount: 300,
        txHash: "0x5678...efgh",
        timestamp: "2024-01-25T14:15:00Z",
        status: "confirmed",
      },
      {
        id: 3,
        token: "SPORE",
        amount: 300,
        txHash: "0x9abc...ijkl",
        timestamp: "2024-01-26T09:45:00Z",
        status: "confirmed",
      },
    ],
  },
}

export default function FundQuest() {
  const params = useParams()
  const questId = Number.parseInt(params.id as string)
  const quest = QUEST_DATA[questId]

  const [fundingAmounts, setFundingAmounts] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!quest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❓</div>
            <h1 className="text-2xl font-bold mb-2">Quest Not Found</h1>
            <p className="text-muted-foreground mb-4">The quest you're looking for doesn't exist.</p>
            <Link href="/admin/quests">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Quest Management
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const getFundingProgress = (funded: number, required: number) => {
    return required > 0 ? (funded / required) * 100 : 0
  }

  const getRemainingAmount = (token: any) => {
    return Math.max(0, token.required - token.funded)
  }

  const handleFundingAmountChange = (symbol: string, amount: string) => {
    setFundingAmounts((prev) => ({ ...prev, [symbol]: amount }))
  }

  const handleFundToken = async (token: any) => {
    const amount = Number.parseInt(fundingAmounts[token.symbol] || "0")
    if (amount <= 0) return

    setIsSubmitting(true)
    try {
      // Simulate funding transaction
      await new Promise((resolve) => setTimeout(resolve, 2000))
      console.log(`Funding ${amount} ${token.symbol} for quest ${questId}`)
      // Reset amount after successful funding
      setFundingAmounts((prev) => ({ ...prev, [token.symbol]: "" }))
    } catch (error) {
      console.error("Funding failed:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFullyFunded = quest.rewards.tokens.every((token: any) => token.funded >= token.required)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/admin/quests">
              <Button variant="ghost" className="flex items-center gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Quest Management
              </Button>
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">💰</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Fund Quest
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">Manage token funding for quest rewards and escrow</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Funding Interface */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quest Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl">{quest.title}</h2>
                      <p className="text-sm text-muted-foreground font-normal">{quest.campaignName}</p>
                    </div>
                    <Badge className={isFullyFunded ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                      {isFullyFunded ? "Fully Funded" : "Needs Funding"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className="ml-2 font-medium">{quest.status}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Participants:</span>
                      <span className="ml-2 font-medium">{quest.participants}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Admin:</span>
                      <span className="ml-2 font-medium">{quest.adminPubkey}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Escrow:</span>
                      <span className="ml-2 font-medium">{quest.escrowAddress}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Token Funding */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="w-5 h-5" />
                    Token Funding
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {quest.rewards.tokens.map((token: any, index: number) => {
                    const progress = getFundingProgress(token.funded, token.required)
                    const remaining = getRemainingAmount(token)
                    const isTokenFullyFunded = token.funded >= token.required

                    return (
                      <div key={index} className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl font-bold text-green-600">{token.symbol}</div>
                            <div>
                              <div className="font-medium">{token.amount} per completion</div>
                              <div className="text-sm text-muted-foreground">
                                {token.funded.toLocaleString()} / {token.required.toLocaleString()} funded
                              </div>
                            </div>
                          </div>
                          {isTokenFullyFunded && <CheckCircle className="w-6 h-6 text-green-600" />}
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Funding Progress</span>
                            <span className="font-medium">{progress.toFixed(1)}%</span>
                          </div>
                          <Progress value={progress} className="h-3" />
                        </div>

                        {!isTokenFullyFunded && (
                          <div className="flex items-center gap-3">
                            <Input
                              type="number"
                              placeholder={`Amount to fund (max: ${remaining})`}
                              value={fundingAmounts[token.symbol] || ""}
                              onChange={(e) => handleFundingAmountChange(token.symbol, e.target.value)}
                              max={remaining}
                              className="flex-1"
                            />
                            <Button
                              onClick={() => handleFundToken(token)}
                              disabled={
                                !fundingAmounts[token.symbol] ||
                                Number.parseInt(fundingAmounts[token.symbol]) <= 0 ||
                                isSubmitting
                              }
                              className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                            >
                              {isSubmitting ? "Funding..." : "Fund"}
                            </Button>
                          </div>
                        )}

                        {remaining > 0 && (
                          <div className="text-sm text-muted-foreground">
                            Remaining needed:{" "}
                            <span className="font-medium text-red-600">
                              {remaining.toLocaleString()} {token.symbol}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Funding Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Funding Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                      1
                    </div>
                    <div>
                      <div className="font-medium">Connect Your Wallet</div>
                      <div className="text-muted-foreground">
                        Ensure your wallet is connected and has sufficient tokens
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <div>
                      <div className="font-medium">Enter Funding Amount</div>
                      <div className="text-muted-foreground">
                        Specify how many tokens to transfer to the quest escrow
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                      3
                    </div>
                    <div>
                      <div className="font-medium">Confirm Transaction</div>
                      <div className="text-muted-foreground">
                        Approve the transaction in your wallet to complete funding
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Funding Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Funding Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {quest.rewards.tokens.map((token: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{token.symbol}:</span>
                        <span className="font-medium">{((token.funded / token.required) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t">
                    <div className="flex justify-between font-medium">
                      <span>Overall:</span>
                      <span className={isFullyFunded ? "text-green-600" : "text-yellow-600"}>
                        {isFullyFunded ? "Complete" : "Partial"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Funding History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Funding</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {quest.fundingHistory.slice(0, 3).map((funding: any) => (
                    <div key={funding.id} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">
                          {funding.amount} {funding.token}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(funding.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          {funding.status}
                        </Badge>
                        <a
                          href={`https://explorer.nervos.org/transaction/${funding.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}

                  {quest.fundingHistory.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">No funding history yet</div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link href={`/quest/${quest.id}`}>
                    <Button variant="outline" className="w-full justify-start bg-transparent">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Quest Details
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full justify-start bg-transparent" disabled>
                    <Coins className="w-4 h-4 mr-2" />
                    Withdraw Unused Funds
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
