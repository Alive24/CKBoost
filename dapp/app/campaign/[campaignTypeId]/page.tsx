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
  Calendar, 
  Users, 
  Target,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  ArrowLeft,
  Play
} from "lucide-react"
import Link from "next/link"
import { ccc } from "@ckb-ccc/core"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { extractTypeIdFromCampaignCell, isCampaignApproved } from "@/lib/ckb/campaign-cells"
import { CampaignData, CampaignDataLike } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"
import { getDifficultyString } from "@/lib"
import { QuestSubmissionForm } from "@/components/quest-submission-form"
import { useUser } from "@/lib/providers/user-provider"

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignTypeId = params.campaignTypeId as ccc.Hex
  const { signer, protocolData, protocolCell } = useProtocol()
  const { currentUserTypeId, hasUserSubmittedQuest, isLoading: userLoading } = useUser()
  const [campaign, setCampaign] = useState<CampaignDataLike & { typeHash: ccc.Hex; cell: ccc.Cell } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedQuestIndex, setSelectedQuestIndex] = useState<number | null>(null)
  const [questSubmissionStatuses, setQuestSubmissionStatuses] = useState<Record<number, boolean>>({})

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

      try {
        setIsLoading(true) // Ensure loading state is set
        debug.log("Fetching campaign by type ID:", campaignTypeId)
        const campaignCodeHash = protocolData?.protocol_config?.script_code_hashes?.ckb_boost_campaign_type_code_hash
        if (!campaignCodeHash) {
          debug.error("Campaign code hash not found in protocol data")
          setCampaign(null)
          return
        }
        const { fetchCampaignByTypeId } = await import("@/lib/ckb/campaign-cells")
        const cell = await fetchCampaignByTypeId(campaignTypeId, campaignCodeHash, signer, protocolCell!)
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
  }, [signer, campaignTypeId, protocolData])

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
                    <div>
                      <CardTitle className="text-3xl">
                        {campaign.metadata?.title || "Untitled Campaign"}
                      </CardTitle>
                      <CardDescription className="text-lg mt-1">
                        {campaign.metadata?.short_description || "No description available"}
                      </CardDescription>
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
              <Card>
                <CardHeader>
                  <CardTitle>Reward Distribution</CardTitle>
                  <CardDescription>
                    How rewards are distributed among participants
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Total Points Pool</span>
                        <span className="text-2xl font-bold">
                          {totalPoints} Points
                        </span>
                      </div>
                      <Progress value={0} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">0% distributed</p>
                    </div>

                    {/* Show individual quest rewards */}
                    {campaign?.quests && campaign.quests.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Quest Rewards</h4>
                        <div className="space-y-2">
                          {campaign.quests.map((quest: typeof campaign.quests[0], index: number) => (
                            <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <span className="text-sm">{quest.metadata?.title || `Quest ${index + 1}`}</span>
                              <Badge variant="outline">
                                {Number(quest.points) || 100} points
                              </Badge>
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