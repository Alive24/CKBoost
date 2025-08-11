"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Target,
  Plus,
  Edit,
  Trash2,
  Eye,
  Users,
  Trophy,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Settings
} from "lucide-react"
import Link from "next/link"
import { ccc } from "@ckb-ccc/core"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { fetchCampaignByTypeHash } from "@/lib/ckb/campaign-cells"
import { CampaignData } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"

export default function CampaignQuestsManagementPage() {
  const params = useParams()
  const campaignTypeHash = params.campaignTypeHash as string
  const { signer } = useProtocol()
  const [campaign, setCampaign] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("quests")

  useEffect(() => {
    const fetchCampaign = async () => {
      if (!signer || !campaignTypeHash) {
        debug.warn("No signer or campaign type hash available")
        setIsLoading(false)
        return
      }

      try {
        debug.log("Fetching campaign for quest management:", campaignTypeHash)
        const campaignCell = await fetchCampaignByTypeHash(campaignTypeHash as ccc.Hex, signer)
        
        if (campaignCell) {
          const campaignData = CampaignData.decode(campaignCell.outputData)
          setCampaign({
            ...campaignData,
            typeHash: campaignTypeHash,
            cell: campaignCell
          })
        } else {
          debug.warn("Campaign not found")
        }
      } catch (error) {
        debug.error("Failed to fetch campaign:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCampaign()
  }, [signer, campaignTypeHash])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading campaign quests...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h2 className="text-2xl font-bold mb-2">Campaign Not Found</h2>
                  <p className="text-muted-foreground mb-6">
                    The campaign you're trying to manage doesn't exist.
                  </p>
                  <Link href="/campaign-admin">
                    <Button>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Admin Dashboard
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  const getQuestStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-800"
      case "draft":
        return "bg-yellow-100 text-yellow-800"
      case "completed":
        return "bg-gray-100 text-gray-800"
      case "paused":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getQuestDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case "easy":
        return "bg-green-100 text-green-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "hard":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <Link href="/campaign-admin">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin Dashboard
            </Button>
          </Link>

          {/* Campaign Header */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Settings className="w-6 h-6" />
                    Quest Management
                  </CardTitle>
                  <CardDescription className="text-lg mt-2">
                    {campaign.metadata?.title || "Untitled Campaign"}
                  </CardDescription>
                  <p className="text-sm text-muted-foreground mt-1">
                    Type Hash: {campaignTypeHash.slice(0, 10)}...{campaignTypeHash.slice(-8)}
                  </p>
                </div>
                <Link href={`/campaign/${campaignTypeHash}/create-quest`}>
                  <Button className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create New Quest
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{campaign.quests?.length || 0}</div>
                  <p className="text-sm text-muted-foreground">Total Quests</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {campaign.quests?.filter((q: any) => q.status === "active").length || 0}
                  </div>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-sm text-muted-foreground">Completions</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-sm text-muted-foreground">Pending Reviews</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quests List */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Quests</CardTitle>
              <CardDescription>
                Manage and monitor all quests in this campaign
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campaign.quests && campaign.quests.length > 0 ? (
                <div className="space-y-4">
                  {campaign.quests.map((quest: any, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg">
                              {quest.title || `Quest ${index + 1}`}
                            </h3>
                            <Badge className={getQuestStatusColor(quest.status || "draft")}>
                              {quest.status || "draft"}
                            </Badge>
                            {quest.difficulty && (
                              <Badge className={getQuestDifficultyColor(quest.difficulty)}>
                                {quest.difficulty}
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-3">
                            {quest.description || "No description available"}
                          </p>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <Trophy className="w-4 h-4 text-yellow-600" />
                              <span>{quest.points || 100} points</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4 text-blue-600" />
                              <span>0 participants</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span>0 completed</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <AlertCircle className="w-4 h-4 text-orange-600" />
                              <span>0 pending</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <Link href={`/campaign-admin/${campaignTypeHash}/${index + 1}`}>
                            <Button size="sm">
                              <Settings className="w-4 h-4 mr-1" />
                              Manage Quest
                            </Button>
                          </Link>
                        </div>
                      </div>
                      
                      {/* Quest Submissions */}
                      {quest.submissions && quest.submissions.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-medium mb-2">Recent Submissions</h4>
                          <div className="space-y-2">
                            {quest.submissions.slice(0, 3).map((submission: any, subIndex: number) => (
                              <div key={subIndex} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{submission.user}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {submission.status}
                                  </Badge>
                                </div>
                                <span className="text-muted-foreground">
                                  {formatDateConsistent(submission.date)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Quests Yet</h3>
                  <p className="text-muted-foreground mb-6">
                    This campaign doesn't have any quests. Create your first quest to get started.
                  </p>
                  <Link href={`/campaign/${campaignTypeHash}/create-quest`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Quest
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}