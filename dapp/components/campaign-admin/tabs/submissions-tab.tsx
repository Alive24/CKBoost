"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, CheckCircle, Trophy, Users, RefreshCw, AlertCircle } from "lucide-react"
import { useCampaignAdmin } from "@/lib/providers/campaign-admin-provider"
import { CampaignDataLike, UserSubmissionRecordLike, UserDataLike } from "ssri-ckboost/types"
import { SubmissionList } from "../submissions/submission-list"
import { SubmissionStatsCards } from "../submissions/submission-stats-cards"
import { debug } from "@/lib/utils/debug"
import { ccc } from "@ckb-ccc/connector-react"

interface SubmissionsTabProps {
  campaignTypeId: ccc.Hex
}

export function SubmissionsTab({ campaignTypeId }: SubmissionsTabProps) {
  const { campaignAdminService, campaign: campaignInstance, isLoadingCampaign: isServiceLoading, error: adminError } = useCampaignAdmin(campaignTypeId)
  const [submissions, setSubmissions] = useState<Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>>()
  const [userDetails, setUserDetails] = useState<Map<string, UserDataLike>>()
  const [campaignData, setCampaignData] = useState<CampaignDataLike | null>(null)
  const [stats, setStats] = useState<{
    totalSubmissions: number,
    pendingReview: number,
    approved: number
  }>()
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved">("all")

  const loadSubmissions = useCallback(async () => {
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
      setCampaignData(data.campaignData)
      setStats(data.stats)
      debug.log("Loaded submissions", data.stats)
      debug.log("Campaign quests:", data.campaignData?.quests?.map(q => ({ 
        id: q.quest_id, 
        title: q.metadata?.title 
      })))
    } catch (err) {
      console.error("Failed to load submissions:", err)
      setError("Failed to load submissions. Please try again.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [campaignAdminService, campaignTypeId])

  useEffect(() => {
    if (!isServiceLoading && campaignAdminService) {
      loadSubmissions()
    }
  }, [campaignTypeId, isServiceLoading, campaignAdminService, loadSubmissions])

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
      const quest = campaignData?.quests?.find(q => Number(q.quest_id) === questId)
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

  async function handleBatchApprove(questId: number, userTypeIds: string[]): Promise<void> {
    if (!campaignAdminService || !submissions) {
      throw new Error("Service not available")
    }

    // Points are handled automatically by the smart contract based on quest configuration

    if (userTypeIds.length === 0) {
      throw new Error("No submissions selected for approval")
    }

    // Check if campaign instance is available
    if (!campaignInstance) {
      if (isServiceLoading) {
        throw new Error("Campaign is still loading, please wait a moment and try again")
      }
      if (adminError) {
        throw new Error(`Campaign error: ${adminError}`)
      }
      throw new Error("Campaign instance not available")
    }

    try {
      const txHash = await campaignAdminService.approveCompletion(campaignTypeId, questId, userTypeIds as ccc.Hex[])
      
      // Store the transaction hash if needed
      if (txHash) {
        debug.log("Batch approval transaction:", txHash)
      }
      
      // Refresh submissions after batch approval
      await loadSubmissions()
    } catch (err) {
      console.error("Failed to batch approve submissions:", err)
      throw err // Re-throw to be handled by the dialog
    }
  }

  if (isServiceLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isServiceLoading ? "Loading campaign..." : "Loading submissions..."}
          </p>
        </div>
      </div>
    )
  }

  if (error || adminError) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error || adminError}</p>
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
      {campaignData?.quests && campaignData.quests.length > 0 ? (
        <SubmissionList
          quests={campaignData.quests}
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