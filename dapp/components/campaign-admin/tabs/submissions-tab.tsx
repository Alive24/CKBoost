"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, CheckCircle, Trophy, Users, RefreshCw, AlertCircle } from "lucide-react"
import { useCampaignAdmin } from "@/lib/providers/campaign-admin-provider"
import { CampaignDataLike, UserSubmissionRecordLike, UserDataLike } from "ssri-ckboost/types"
import { SubmissionList } from "../submissions/submission-list"
import { SubmissionStatsCards } from "../submissions/submission-stats-cards"
import { debug } from "@/lib/utils/debug"
import { ccc } from "@ckb-ccc/core"

interface SubmissionsTabProps {
  campaign: CampaignDataLike & { 
    typeHash: ccc.Hex
  }
  campaignTypeId: ccc.Hex
}

export function SubmissionsTab({ campaign, campaignTypeId }: SubmissionsTabProps) {
  const { campaignAdminService, isLoading: isServiceLoading } = useCampaignAdmin()
  const [submissions, setSubmissions] = useState<Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>>()
  const [userDetails, setUserDetails] = useState<Map<string, UserDataLike>>()
  const [stats, setStats] = useState<{
    totalSubmissions: number,
    pendingReview: number,
    approved: number
  }>()
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved">("all")

  useEffect(() => {
    if (!isServiceLoading && campaignAdminService) {
      loadSubmissions()
    }
  }, [campaignTypeId, isServiceLoading])

  async function loadSubmissions() {
    if (!campaignAdminService) {
      setError("Campaign admin service not available")
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const data = await campaignAdminService.fetchCampaignSubmissions(campaignTypeId)
      setSubmissions(data.submissions)
      setUserDetails(data.userDetails)
      setStats(data.stats)
      debug.log("Loaded submissions", data.stats)
    } catch (err) {
      console.error("Failed to load submissions:", err)
      setError("Failed to load submissions. Please try again.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true)
    await loadSubmissions()
  }


  function getFilteredSubmissions() {
    if (!submissions || filterStatus === "all") {
      return submissions || new Map()
    }

    const filtered = new Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>()
    
    for (const [questId, questSubmissions] of submissions) {
      const quest = campaign.quests?.find(q => Number(q.quest_id) === questId)
      const approvedUserIds = quest?.accepted_submission_user_type_ids || []
      
      const filteredSubmissions = questSubmissions.filter(submission => {
        const isApproved = approvedUserIds.includes(submission.userTypeId)
        if (filterStatus === "approved") {
          return isApproved
        } else if (filterStatus === "pending") {
          return !isApproved
        }
        return true
      })
      
      if (filteredSubmissions.length > 0) {
        filtered.set(questId, filteredSubmissions)
      }
    }
    
    return filtered
  }

  async function handleBatchApprove(questId: number, userTypeIds: string[]) {
    if (!campaignAdminService || !submissions) return

    const quest = campaign.quests?.find(q => Number(q.quest_id) === questId)
    const pointsAmount = quest ? Number(quest.points) : undefined

    if (userTypeIds.length === 0) {
      alert("No submissions selected for approval")
      return
    }

    try {
      const approvals = userTypeIds.map(userTypeId => ({
        userTypeId: userTypeId as ccc.Hex,
        questId,
        pointsAmount
      }))

      await campaignAdminService.batchApproveSubmissions(campaignTypeId, approvals)
      
      // Refresh submissions after batch approval
      await loadSubmissions()
    } catch (err) {
      console.error("Failed to batch approve submissions:", err)
      alert("Failed to batch approve submissions. Please try again.")
    }
  }

  if (isServiceLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading submissions...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Quest Submissions</h2>
          <p className="text-muted-foreground">
            Review and approve quest completions to mint Points rewards
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <SubmissionStatsCards stats={stats} />

      {/* Filter Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium mr-2">Filter:</span>
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
            >
              All
            </Button>
            <Button
              variant={filterStatus === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("pending")}
            >
              <Clock className="w-3 h-3 mr-1" />
              Pending ({stats?.pendingReview || 0})
            </Button>
            <Button
              variant={filterStatus === "approved" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("approved")}
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Approved ({stats?.approved || 0})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stage 2 Notice */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Points Minting Active
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Approved submissions will mint Points tokens. UDT distribution will be available in Stage 2.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">Stage 1</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Submissions by Quest */}
      {campaign.quests && campaign.quests.length > 0 ? (
        <SubmissionList
          quests={campaign.quests}
          submissions={getFilteredSubmissions()}
          userDetails={userDetails || new Map()}
          onBatchApprove={handleBatchApprove}
          filterStatus={filterStatus}
        />
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No quests have been created yet. Create quests first to receive submissions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}