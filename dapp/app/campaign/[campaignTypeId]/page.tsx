/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Trophy, 
  Users, 
  Target,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  ArrowLeft,
  Play,
  Settings,
  Coins
} from "lucide-react"
import Link from "next/link"
import { ccc } from "@ckb-ccc/connector-react"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { isCampaignApproved } from "@/lib/ckb/campaign-cells"
import { CampaignData, CampaignDataLike } from "ssri-ckboost/types"
import type { AssetListLike, UDTAssetLike } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"
import { getDifficultyString } from "@/lib"
import { udtRegistry } from "@/lib/services/udt-registry"
import { QuestSubmissionForm } from "@/components/quest-submission-form"
import { useUser } from "@/lib/providers/user-provider"

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignTypeId = params.campaignTypeId as ccc.Hex
  const { signer, protocolData, protocolCell, isAdmin, isEndorser } = useProtocol()
  const { currentUserTypeId, hasUserSubmittedQuest, isLoading: userLoading, refreshUserData } = useUser()
  const [campaign, setCampaign] = useState<CampaignDataLike & { typeHash: ccc.Hex; cell: ccc.Cell } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedQuestIndex, setSelectedQuestIndex] = useState<number | null>(null)
  const [questSubmissionStatuses, setQuestSubmissionStatuses] = useState<Record<number, boolean>>({})
  const [isOwner, setIsOwner] = useState(false)
  const [fundingData, setFundingData] = useState<Map<ccc.Hex, bigint>>(new Map())
  const [isLoadingFunding, setIsLoadingFunding] = useState(true)

  // Fetch UDT funding data for the campaign
  useEffect(() => {
    const fetchFundingData = async () => {
      if (!signer || !campaignTypeId || !protocolData) {
        return
      }
      
      try {
        setIsLoadingFunding(true)
        const protocolCellTypeHash = protocolCell?.cellOutput.type?.hash() || ccc.hexFrom("0x")
        const { fetchUDTCellsByCampaignLock, groupUDTCellsByType, calculateUDTBalance } = await import("@/lib/ckb/udt-cells")
        
        const campaignLockCodeHash = protocolData?.protocol_config?.script_code_hashes?.ckb_boost_campaign_lock_code_hash || 
          ccc.hexFrom("0x")
        const campaignTypeCodeHash = protocolData?.protocol_config?.script_code_hashes?.ckb_boost_campaign_type_code_hash || 
          ccc.hexFrom("0x")
        const udtCells = await fetchUDTCellsByCampaignLock(
          campaignTypeId,
          campaignLockCodeHash,
          campaignTypeCodeHash,
          protocolCellTypeHash,
          signer
        )
        
        const groupedCells = groupUDTCellsByType(udtCells)
        const fundingMap = new Map<ccc.Hex, bigint>()
        
        for (const [typeHash, cells] of groupedCells) {
          const balance = calculateUDTBalance(cells)
          fundingMap.set(typeHash as ccc.Hex, balance)
        }
        
        setFundingData(fundingMap)
        debug.log("Fetched funding data:", fundingMap)
      } catch (error) {
        debug.error("Failed to fetch funding data:", error)
      } finally {
        setIsLoadingFunding(false)
      }
    }
    
    fetchFundingData()
  }, [signer, campaignTypeId, protocolData, protocolCell])

  // Check if current user owns this campaign
  useEffect(() => {
    const checkOwnership = async () => {
      if (!signer || !campaign?.cell) {
        setIsOwner(false)
        return
      }
      
      try {
        // Get the user's lock script
        const userLockScript = (await signer.getRecommendedAddressObj()).script
        const userLockHash = userLockScript.hash()
        
        // Get the campaign's lock hash
        const campaignLockHash = campaign.cell.cellOutput.lock.hash()
        
        // Check if they match
        setIsOwner(userLockHash === campaignLockHash)
      } catch (error) {
        debug.error("Failed to check campaign ownership:", error)
        setIsOwner(false)
      }
    }
    
    checkOwnership()
  }, [signer, campaign])

  useEffect(() => {
    const fetchCampaign = async () => {
      // Keep loading state while waiting for signer
      if (!signer) {
        debug.warn("Waiting for signer to connect...")
        // Don't set loading to false here - wait for signer
        return
      }

      if (!campaignTypeId) {
        debug.warn("No campaign type ID provided")
        setIsLoading(false)
        return
      }

      // Wait for both protocolData AND protocolCell to be loaded
      if (!protocolData || !protocolCell) {
        debug.log("Waiting for protocol data and cell to load...")
        // Don't set loading to false here - keep loading state
        return
      }

      try {
        setIsLoading(true) // Ensure loading state is set
        debug.log("Fetching campaign by type ID:", campaignTypeId)
        const campaignCodeHash = protocolData.protocol_config?.script_code_hashes?.ckb_boost_campaign_type_code_hash
        if (!campaignCodeHash) {
          debug.error("Campaign code hash not found in protocol data")
          setCampaign(null)
          setIsLoading(false)
          return
        }
        const { fetchCampaignByTypeId } = await import("@/lib/ckb/campaign-cells")
        const cell = await fetchCampaignByTypeId(campaignTypeId, campaignCodeHash, signer.client, protocolCell)
        if (cell) {
          const campaignData = CampaignData.decode(cell.outputData) as CampaignDataLike
          setCampaign({ ...campaignData, typeHash: cell.cellOutput.type?.hash() || "0x", cell })
        } else {
          setCampaign(null)
        }
      } catch (error) {
        debug.error("Failed to fetch campaign:", error)
        setCampaign(null) // Set to null on error
      } finally {
        setIsLoading(false)
      }
    }

    fetchCampaign()
  }, [signer, campaignTypeId, protocolData, protocolCell])

  // Check submission statuses for all quests
  useEffect(() => {
    async function checkSubmissionStatuses() {
      if (!currentUserTypeId || !campaign?.quests) return

      const statuses: Record<number, boolean> = {}
      for (let i = 0; i < campaign.quests.length; i++) {
        const quest = campaign.quests[i]
        const questId = Number(quest.quest_id || i + 1)
        const submitted = await hasUserSubmittedQuest(
          currentUserTypeId,
          campaignTypeId,
          questId
        )
        statuses[questId] = submitted
      }
      setQuestSubmissionStatuses(statuses)
    }

    checkSubmissionStatuses()
  }, [currentUserTypeId, campaign, campaignTypeId, hasUserSubmittedQuest])


  // Show loading state while waiting for signer, campaign data, or user data
  if (isLoading || userLoading || (!signer && !campaign)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">
                {!signer ? "Connecting to wallet..." : 
                 userLoading ? "Loading user data..." : 
                 "Loading campaign details..."}
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Only show "not found" if we've finished loading and there's no campaign
  if (!campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h2 className="text-2xl font-bold mb-2">Campaign Not Found</h2>
                  <p className="text-muted-foreground mb-6">
                    The campaign you're looking for doesn't exist or has been removed.
                  </p>
                  <Link href="/">
                    <Button>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Campaigns
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

  const getStatusColor = (status: string | undefined) => {
    const statusStr = String(status || "").toLowerCase()
    switch (statusStr) {
      case "active":
        return "bg-green-100 text-green-800"
      case "upcoming":
        return "bg-blue-100 text-blue-800"
      case "completed":
        return "bg-gray-100 text-gray-800"
      case "under-review":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getDifficultyColor = (difficulty: string | undefined) => {
    const difficultyStr = String(difficulty || "").toLowerCase()
    switch (difficultyStr) {
      case "beginner":
      case "easy":
        return "bg-green-100 text-green-800"
      case "intermediate":
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
      case "hard":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  // Convert BigInt timestamps to numbers (blockchain stores in seconds, JS needs milliseconds)
  const startTimestamp = typeof campaign.starting_time === 'bigint' 
    ? Number(campaign.starting_time) * 1000
    : Number(campaign.starting_time) * 1000
  const endTimestamp = typeof campaign.ending_time === 'bigint'
    ? Number(campaign.ending_time) * 1000
    : Number(campaign.ending_time) * 1000
    
  // Check if campaign is approved using helper function
  const isApproved = isCampaignApproved(
    campaignTypeId,
    protocolData?.campaigns_approved as ccc.Hex[] | undefined
  )
  
  // Debug logging for approval status
  debug.log('Campaign approval check:', {
    isApproved,
    campaignTypeId,
    campaigns_approved: protocolData?.campaigns_approved,
    protocolDataExists: !!protocolData
  })

  // Calculate campaign status based on dates and approval
  const now = new Date()
  const startDate = new Date(startTimestamp)
  const endDate = new Date(endTimestamp)
  const status = !isApproved ? "under-review" : now < startDate ? "upcoming" : now > endDate ? "completed" : "active"

  // Calculate progress (only if approved)
  const totalDuration = endDate.getTime() - startDate.getTime()
  const elapsed = Math.max(0, Math.min(now.getTime() - startDate.getTime(), totalDuration))
  const progress = isApproved && totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0

  // Calculate total points distributed
  const totalPoints = campaign.quests?.reduce((sum: number, quest: typeof campaign.quests[0]) => {
    const points = quest.points || 100
    return sum + Number(points)
  }, 0) || 0
  
  // Debug quest structure
  if (campaign?.quests && campaign.quests.length > 0) {
    debug.log('Quest structure:', {
      firstQuest: campaign.quests[0],
      questKeys: Object.keys(campaign.quests[0] || {}),
      totalQuests: campaign.quests.length
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <Link href="/">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaigns
            </Button>
          </Link>

          {/* Campaign Header */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="w-16 h-16">
                      <AvatarFallback className="bg-gradient-to-br from-purple-200 to-blue-200 text-lg font-bold">
                        {campaign.metadata?.title?.substring(0, 2).toUpperCase() || "C"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-3xl">
                            {campaign.metadata?.title || "Untitled Campaign"}
                          </CardTitle>
                          <CardDescription className="text-lg mt-1">
                            {campaign.metadata?.short_description || "No description available"}
                          </CardDescription>
                        </div>
                        {/* Management Button for Campaign Owner and Admins */}
                        {(isOwner || isAdmin) && (
                          <Link href={`/campaign-admin/${campaignTypeId}`}>
                            <Button>
                              <Settings className="w-4 h-4 mr-2" />
                              Manage Campaign
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getStatusColor(status)}>
                      {status}
                    </Badge>
                    {campaign.metadata?.categories?.map((category: string, index: number) => (
                      <Badge key={index} variant="outline">
                        {category}
                      </Badge>
                    ))}
                    {campaign.metadata?.difficulty && (
                      <Badge className={getDifficultyColor(getDifficultyString(campaign.metadata.difficulty))}>
                        {getDifficultyString(campaign.metadata.difficulty)}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  {/* Show status badge based on approval */}
                  {!isApproved && (
                    <Badge className="bg-yellow-100 text-yellow-800 px-4 py-2 text-lg">
                      <Clock className="w-5 h-5 mr-2" />
                      Under Review
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Campaign Progress - only show if approved */}
              {isApproved ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Campaign Progress</span>
                    <span className="font-medium">{progress.toFixed(0)}%</span>
                  </div>
                  <Progress value={progress} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Started: {formatDateConsistent(startDate)}</span>
                    <span>Ends: {formatDateConsistent(endDate)}</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">This campaign is under review</span>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                    Campaign will be available once approved by platform administrators.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campaign Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Quests</p>
                    <p className="text-2xl font-bold">{campaign.quests?.length || 0}</p>
                  </div>
                  <Target className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Points</p>
                    <p className="text-2xl font-bold">{totalPoints}</p>
                  </div>
                  <Trophy className="w-8 h-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Participants</p>
                    <p className="text-2xl font-bold">0</p>
                  </div>
                  <Users className="w-8 h-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Created By</p>
                    <p className="text-sm font-medium truncate">
                      {campaign.endorser?.endorser_name || "Unknown"}
                    </p>
                  </div>
                  <Star className="w-8 h-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="quests">Quests</TabsTrigger>
              <TabsTrigger value="rewards">Rewards</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {campaign.metadata?.long_description || campaign.metadata?.short_description || "No detailed description available."}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Campaign Rules</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {campaign.rules?.map((rule: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                        <span>{rule}</span>
                      </li>
                    )) || <li className="text-muted-foreground">No specific rules defined</li>}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="quests" className="space-y-6">
              {selectedQuestIndex === null ? (
                // Quest List View
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Quests</CardTitle>
                    <CardDescription>
                      Review quest requirements and subtasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {campaign?.quests?.map((quest: typeof campaign.quests[0], index: number) => (
                      <div key={index} className="border rounded-lg">
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-semibold text-lg mb-2">
                                {quest.metadata?.title || `Quest ${Number(quest.quest_id) || index + 1}`}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {quest.metadata?.short_description || quest.metadata?.long_description || ""}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge className="bg-green-100 text-green-800">
                                <Trophy className="w-3 h-3 mr-1" />
                                {Number(quest.points) || 100} points
                              </Badge>
                              {/* Display UDT rewards if any */}
                              {quest.rewards_on_completion && quest.rewards_on_completion.length > 0 && 
                                quest.rewards_on_completion.flatMap((rewardList: AssetListLike, idx: number) => {
                                  const badges = []
                                  if (rewardList.udt_assets && rewardList.udt_assets.length > 0) {
                                    rewardList.udt_assets.forEach((udtAsset: UDTAssetLike, udtIdx: number) => {
                                      // Get token info from registry
                                      const script = ccc.Script.from(udtAsset.udt_script)
                                      const scriptHash = script.hash()
                                      const token = udtRegistry.getTokenByScriptHash(scriptHash)
                                      
                                      const displayAmount = Number(udtAsset.amount) / (10 ** 8)
                                      const symbol = token?.symbol || 'UDT'
                                      
                                      badges.push(
                                        <Badge key={`udt-${idx}-${udtIdx}`} className="bg-yellow-100 text-yellow-800">
                                          <Coins className="w-3 h-3 mr-1" />
                                          {displayAmount} {symbol}
                                        </Badge>
                                      )
                                    })
                                  }
                                  if (rewardList.ckb_amount && Number(rewardList.ckb_amount) > 0) {
                                    badges.push(
                                      <Badge key={`ckb-${idx}`} className="bg-blue-100 text-blue-800">
                                        <Coins className="w-3 h-3 mr-1" />
                                        {Number(rewardList.ckb_amount) / (10 ** 8)} CKB
                                      </Badge>
                                    )
                                  }
                                  return badges
                                })
                              }
                              {quest.metadata?.time_estimate && (
                                <Badge variant="outline">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {Number(quest.metadata.time_estimate)} mins
                                </Badge>
                              )}
                              {quest.metadata?.difficulty && (
                                <Badge variant="outline">
                                  Difficulty: {Number(quest.metadata.difficulty)}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Quest Requirements */}
                          {(quest.metadata?.requirements) && (
                            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                              <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">Requirements</h4>
                              <p className="text-sm text-blue-800 dark:text-blue-200">
                                {quest.metadata?.requirements}
                              </p>
                            </div>
                          )}

                          {/* Subtasks */}
                          {quest.sub_tasks && quest.sub_tasks.length > 0 && (
                            <div className="border-t pt-3">
                              <h4 className="font-medium text-sm mb-3">Subtasks ({quest.sub_tasks.length})</h4>
                              <div className="space-y-2">
                                {quest.sub_tasks.map((subtask: typeof quest.sub_tasks[0], subIndex: number) => (
                                  <div key={subIndex} className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <div className="flex-shrink-0 mt-0.5">
                                      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                                        <span className="text-xs font-medium text-gray-600">{Number(subtask.id) || subIndex + 1}</span>
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">
                                        {subtask.title || `Subtask ${Number(subtask.id) || subIndex + 1}`}
                                      </p>
                                      {subtask.description && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {subtask.description}
                                        </p>
                                      )}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {subtask.type && (
                                          <Badge variant="outline" className="text-xs">
                                            Type: {subtask.type}
                                          </Badge>
                                        )}
                                        {subtask.proof_required && (
                                          <Badge variant="outline" className="text-xs">
                                            Proof: {subtask.proof_required}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Quest Actions */}
                          <div className="flex items-center justify-between mt-4 pt-3 border-t">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {questSubmissionStatuses[Number(quest.quest_id || index + 1)] ? (
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Submitted
                                </Badge>
                              ) : (
                                <>
                                  <Users className="w-4 h-4" />
                                  <span>0 participants</span>
                                </>
                              )}
                            </div>
                            {isApproved ? (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setSelectedQuestIndex(index)}
                              >
                                {questSubmissionStatuses[Number(quest.quest_id || index + 1)] ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    View Submission
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    Start Quest
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Available after approval
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )) || (
                      <div className="text-center py-8">
                        <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No quests available yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              ) : (
              // Quest Detail View
              <div className="space-y-6">
                {/* Back to Quest List */}
                <Button 
                  variant="ghost" 
                  className="mb-4"
                  onClick={() => setSelectedQuestIndex(null)}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Quest List
                </Button>
                
                {campaign?.quests && selectedQuestIndex !== null && campaign.quests[selectedQuestIndex] && (() => {
                  const quest = campaign.quests[selectedQuestIndex]
                  return (
                    <>
                      {/* Quest Header */}
                      <Card>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-2xl">
                                {quest.metadata?.title || `Quest ${selectedQuestIndex + 1}`}
                              </CardTitle>
                              <CardDescription className="mt-2">
                                {quest.metadata?.short_description || ""}
                              </CardDescription>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Badge className="bg-green-100 text-green-800">
                                <Trophy className="w-4 h-4 mr-1" />
                                {Number(quest.points) || 100} points
                              </Badge>
                              {/* Display UDT rewards if any */}
                              {quest.rewards_on_completion && quest.rewards_on_completion.length > 0 && 
                                quest.rewards_on_completion.flatMap((rewardList: AssetListLike, idx: number) => {
                                  const badges = []
                                  if (rewardList.udt_assets && rewardList.udt_assets.length > 0) {
                                    rewardList.udt_assets.forEach((udtAsset: UDTAssetLike, udtIdx: number) => {
                                      const script = ccc.Script.from(udtAsset.udt_script)
                                      const scriptHash = script.hash()
                                      const token = udtRegistry.getTokenByScriptHash(scriptHash)
                                      
                                      const displayAmount = Number(udtAsset.amount) / (10 ** 8)
                                      const symbol = token?.symbol || 'UDT'
                                      
                                      badges.push(
                                        <Badge key={`udt2-${idx}-${udtIdx}`} className="bg-yellow-100 text-yellow-800">
                                          <Coins className="w-4 h-4 mr-1" />
                                          {displayAmount} {symbol}
                                        </Badge>
                                      )
                                    })
                                  }
                                  if (rewardList.ckb_amount && Number(rewardList.ckb_amount) > 0) {
                                    badges.push(
                                      <Badge key={`ckb2-${idx}`} className="bg-blue-100 text-blue-800">
                                        <Coins className="w-4 h-4 mr-1" />
                                        {Number(rewardList.ckb_amount) / (10 ** 8)} CKB
                                      </Badge>
                                    )
                                  }
                                  return badges
                                })
                              }
                              {quest.metadata?.difficulty && (
                                <Badge variant="outline">
                                  Difficulty: {getDifficultyString(quest.metadata.difficulty)}
                                </Badge>
                              )}
                              {quest.metadata?.time_estimate && (
                                <Badge variant="outline">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {Number(quest.metadata.time_estimate)} mins
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {/* Quest Description */}
                            {quest.metadata?.long_description && (
                              <div>
                                <h3 className="font-semibold mb-2">Description</h3>
                                <p className="text-muted-foreground whitespace-pre-wrap">
                                  {quest.metadata.long_description}
                                </p>
                              </div>
                            )}
                            
                            {/* Requirements */}
                            {quest.metadata?.requirements && (
                              <div>
                                <h3 className="font-semibold mb-2">Requirements</h3>
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                  <p className="text-sm">{quest.metadata.requirements}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Quest Submission Form */}
                      <QuestSubmissionForm
                        quest={{
                          quest_id: Number(quest.quest_id),
                          sub_tasks: quest.sub_tasks
                        }}
                        questIndex={selectedQuestIndex}
                        campaignTypeId={campaignTypeId}
                        onSuccess={async () => {
                          // Refresh user data after successful submission
                          console.log("[CampaignPage] Quest submitted successfully, refreshing data...")
                          
                          // Wait a bit for transaction to be confirmed
                          setTimeout(async () => {
                            await refreshUserData()
                            
                            // Also refresh the submission statuses
                            if (currentUserTypeId && campaign?.quests) {
                              const statuses: Record<number, boolean> = {}
                              for (let i = 0; i < campaign.quests.length; i++) {
                                const quest = campaign.quests[i]
                                const questId = Number(quest.quest_id || i + 1)
                                const submitted = await hasUserSubmittedQuest(
                                  currentUserTypeId,
                                  campaignTypeId,
                                  questId
                                )
                                statuses[questId] = submitted
                              }
                              setQuestSubmissionStatuses(statuses)
                            }
                          }, 3000)
                        }}
                      />
                      
                      {/* Navigation between quests */}
                      <div className="flex justify-between">
                        <Button 
                          variant="outline"
                          disabled={selectedQuestIndex === 0}
                          onClick={() => setSelectedQuestIndex(prev => prev !== null ? prev - 1 : 0)}
                        >
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Previous Quest
                        </Button>
                        <Button 
                          variant="outline"
                          disabled={!campaign?.quests || selectedQuestIndex >= campaign.quests.length - 1}
                          onClick={() => setSelectedQuestIndex(prev => prev !== null ? prev + 1 : 0)}
                        >
                          Next Quest
                          <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                        </Button>
                      </div>
                    </>
                  )
                })()}
              </div>
              )}
            </TabsContent>

            <TabsContent value="rewards" className="space-y-6">
              {/* Total Points Rewarded */}
              <Card>
                <CardHeader>
                  <CardTitle>Total Points Rewarded</CardTitle>
                  <CardDescription>
                    Points that have been distributed to participants
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      {(() => {
                        // Calculate actual points distributed based on completion_count
                        let totalDistributed = 0
                        campaign?.quests?.forEach((quest: typeof campaign.quests[0]) => {
                          const completions = Number(quest.completion_count || 0)
                          const questPoints = Number(quest.points || 0)
                          totalDistributed += completions * questPoints
                        })
                        
                        const distributionPercentage = totalPoints > 0 
                          ? Math.min(100, (totalDistributed / Number(totalPoints)) * 100)
                          : 0
                        
                        return (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">Total Points Pool</span>
                              <span className="text-2xl font-bold">
                                {totalPoints} Points
                              </span>
                            </div>
                            <Progress value={distributionPercentage} className="h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {totalDistributed.toLocaleString()} points distributed ({distributionPercentage.toFixed(1)}%)
                            </p>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Available UDT Rewards */}
              <Card>
                <CardHeader>
                  <CardTitle>Available UDT Rewards</CardTitle>
                  <CardDescription>
                    Token rewards remaining in the campaign funding pool
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {isLoadingFunding ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                      </div>
                    ) : (() => {
                      // Calculate total UDT rewards needed, distributed, and available
                      const udtRewardsSummary = new Map<string, { 
                        totalPerQuest: number,  // Total rewards per quest completion
                        totalDistributed: number,  // Already distributed based on completion_count
                        totalFunded: number,  // Total amount in funding pool (simulated for now)
                        available: number,  // Remaining available
                        tokenInfo: ReturnType<typeof udtRegistry.getTokenByScriptHash>,
                        averagePerQuest: number,
                        questCount: number
                      }>()
                      
                      // Calculate UDT rewards distributed and needed
                      campaign?.quests?.forEach((quest: typeof campaign.quests[0]) => {
                        const completions = Number(quest.completion_count || 0)
                        
                        quest.rewards_on_completion?.forEach((rewardList: AssetListLike) => {
                          rewardList.udt_assets?.forEach((udtAsset: UDTAssetLike) => {
                            const script = ccc.Script.from(udtAsset.udt_script)
                            const scriptHash = script.hash()
                            const token = udtRegistry.getTokenByScriptHash(scriptHash)
                            const symbol = token?.symbol || 'UDT'
                            
                            const amountPerCompletion = Number(udtAsset.amount)
                            const amountDistributed = amountPerCompletion * completions
                            
                            const current = udtRewardsSummary.get(symbol) || {
                              totalPerQuest: 0,
                              totalDistributed: 0,
                              totalFunded: 0,  // TODO: Get from funding cell
                              available: 0,
                              tokenInfo: token,
                              averagePerQuest: 0,
                              questCount: 0
                            }
                            
                            current.totalPerQuest += amountPerCompletion
                            current.totalDistributed += amountDistributed
                            current.questCount += 1
                            current.averagePerQuest = current.totalPerQuest / current.questCount
                            udtRewardsSummary.set(symbol, current)
                          })
                        })
                      })
                      
                      // Use actual funding amounts from campaign lock cells
                      udtRewardsSummary.forEach((value) => {
                        // Find the funding for this token by matching script hash
                        let actualAvailableInPool = 0n
                        
                        // Match funding data by script hash - this is what's currently in the pool
                        if (value.tokenInfo && value.tokenInfo.script) {
                          const tokenScript = ccc.Script.from(value.tokenInfo.script)
                          const tokenScriptHash = tokenScript.hash()
                          actualAvailableInPool = fundingData.get(tokenScriptHash) || 0n
                        }
                        
                        // Available is what's currently in the funding pool
                        value.available = Number(actualAvailableInPool)
                        
                        // Total funded = available (in pool) + distributed (already given out)
                        value.totalFunded = value.available + value.totalDistributed
                      })
                      
                      if (udtRewardsSummary.size === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            No UDT rewards configured for this campaign
                          </div>
                        )
                      }
                      
                      return Array.from(udtRewardsSummary.entries()).map(([symbol, info]) => {
                        const formattedAvailable = info.tokenInfo 
                          ? udtRegistry.formatAmount(info.available, info.tokenInfo)
                          : `${info.available / (10 ** 8)}`
                        
                        const formattedDistributed = info.tokenInfo
                          ? udtRegistry.formatAmount(info.totalDistributed, info.tokenInfo)
                          : `${info.totalDistributed / (10 ** 8)}`
                          
                        const formattedTotal = info.tokenInfo
                          ? udtRegistry.formatAmount(info.totalFunded, info.tokenInfo)
                          : `${info.totalFunded / (10 ** 8)}`
                        
                        const formattedAverage = info.tokenInfo
                          ? udtRegistry.formatAmount(info.averagePerQuest, info.tokenInfo)
                          : `${info.averagePerQuest / (10 ** 8)}`
                        
                        // Calculate how many more quest completions can be funded
                        const completionQuota = info.averagePerQuest > 0 
                          ? Math.floor(info.available / info.averagePerQuest)
                          : 0
                        
                        // Calculate usage percentage based on what's been distributed vs total funded
                        const usagePercentage = info.totalFunded > 0
                          ? Math.min(100, (info.totalDistributed / info.totalFunded) * 100)
                          : 0
                        
                        return (
                          <div key={symbol} className="p-4 border rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Coins className="w-5 h-5 text-yellow-600" />
                                <span className="font-medium text-lg">{symbol}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground mb-1">Available in Pool</p>
                                <span className="text-2xl font-bold">
                                  {formattedAvailable} {symbol}
                                </span>
                              </div>
                            </div>
                            
                            <Progress value={usagePercentage} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {formattedDistributed} {symbol} distributed of {formattedTotal} {symbol} total ({usagePercentage.toFixed(1)}%)
                            </p>
                            
                            <div className="grid grid-cols-2 gap-4 pt-2">
                              <div>
                                <p className="text-xs text-muted-foreground">Average per Quest</p>
                                <p className="font-medium">{formattedAverage} {symbol}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Available Completions (Estimated)</p>
                                <p className="font-medium">{completionQuota.toLocaleString()} quests</p>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </CardContent>
              </Card>
              
              {/* Quest Rewards Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Quest Rewards Breakdown</CardTitle>
                  <CardDescription>
                    Individual rewards for each quest in the campaign
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">

                    {/* Show individual quest rewards */}
                    {campaign?.quests && campaign.quests.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Quest Rewards</h4>
                        <div className="space-y-2">
                          {campaign.quests.map((quest: typeof campaign.quests[0], index: number) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
                              <div className="flex-1">
                                <span className="text-sm font-medium">{quest.metadata?.title || `Quest ${index + 1}`}</span>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {Number(quest.completion_count || 0)} completions
                                </p>
                              </div>
                              <div className="flex gap-2 items-center">
                                <Badge variant="outline">
                                  {Number(quest.points) || 100} points
                                </Badge>
                                {/* Display UDT rewards inline */}
                                {quest.rewards_on_completion && quest.rewards_on_completion.length > 0 && 
                                  quest.rewards_on_completion.flatMap((rl: AssetListLike, rlIdx: number) => 
                                    (rl.udt_assets || []).map((udtAsset: UDTAssetLike, udtIdx: number) => {
                                      const script = ccc.Script.from(udtAsset.udt_script)
                                      const scriptHash = script.hash()
                                      const token = udtRegistry.getTokenByScriptHash(scriptHash)
                                      const formattedAmount = token
                                        ? udtRegistry.formatAmount(Number(udtAsset.amount), token)
                                        : `${Number(udtAsset.amount) / (10 ** 8)}`
                                      return (
                                        <Badge key={`reward-${rlIdx}-${udtIdx}`} className="bg-yellow-100 text-yellow-800">
                                          <Coins className="w-3 h-3 mr-1" />
                                          {formattedAmount} {token?.symbol || 'UDT'}
                                        </Badge>
                                      )
                                    })
                                  )
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="font-medium">Distribution Rules</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {campaign.rules?.map((rule: string, index: number) => (
                          <li key={index}>• {rule}</li>
                        )) || (
                          <>
                            <li>• Complete quests to earn points</li>
                            <li>• Points are awarded upon quest completion</li>
                            <li>• Check individual quest requirements</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}