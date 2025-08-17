"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Trophy, 
  CheckCircle, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  Eye,
  CheckSquare
} from "lucide-react"
import { QuestLike, UserSubmissionRecordLike, UserDataLike } from "ssri-ckboost/types"
import { SubmissionCard } from "./submission-card"
import { formatDateConsistent } from "@/lib/utils/debug"

interface SubmissionListProps {
  quests: QuestLike[]
  submissions: Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>
  userDetails: Map<string, UserDataLike>
  onBatchApprove: (questId: number, userTypeIds: string[]) => Promise<void>
  filterStatus?: "all" | "pending" | "approved"
}

export function SubmissionList({ 
  quests, 
  submissions, 
  userDetails, 
  onBatchApprove,
  filterStatus = "all"
}: SubmissionListProps) {
  const [expandedQuests, setExpandedQuests] = useState<Set<number>>(new Set())
  const [selectedSubmissions, setSelectedSubmissions] = useState<Map<number, Set<string>>>(new Map())

  function toggleQuestExpansion(questId: number) {
    const newExpanded = new Set(expandedQuests)
    if (newExpanded.has(questId)) {
      newExpanded.delete(questId)
    } else {
      newExpanded.add(questId)
    }
    setExpandedQuests(newExpanded)
  }

  function toggleSubmissionSelection(questId: number, userTypeId: string) {
    const newSelected = new Map(selectedSubmissions)
    if (!newSelected.has(questId)) {
      newSelected.set(questId, new Set())
    }
    const questSelections = newSelected.get(questId)!
    if (questSelections.has(userTypeId)) {
      questSelections.delete(userTypeId)
    } else {
      questSelections.add(userTypeId)
    }
    setSelectedSubmissions(newSelected)
  }

  function selectAllPending(questId: number, submissions: Array<UserSubmissionRecordLike & { userTypeId: string }>, approvedUserIds: string[]) {
    const newSelected = new Map(selectedSubmissions)
    const pendingUserIds = submissions
      .filter(sub => !approvedUserIds.includes(sub.userTypeId))
      .map(sub => sub.userTypeId)
    newSelected.set(questId, new Set(pendingUserIds))
    setSelectedSubmissions(newSelected)
  }

  function clearSelection(questId: number) {
    const newSelected = new Map(selectedSubmissions)
    newSelected.delete(questId)
    setSelectedSubmissions(newSelected)
  }

  async function handleBatchApprove(questId: number) {
    const selected = selectedSubmissions.get(questId)
    if (!selected || selected.size === 0) {
      alert("Please select submissions to approve")
      return
    }
    
    if (!confirm(`Approve ${selected.size} selected submissions for this quest?`)) {
      return
    }
    
    await onBatchApprove(questId, Array.from(selected))
    clearSelection(questId)
  }

  return (
    <div className="space-y-4">
      {quests.map((quest, questIndex) => {
        const questId = Number(quest.quest_id || questIndex + 1)
        const questSubmissions = submissions.get(questId) || []
        const approvedCount = quest.accepted_submission_user_type_ids?.length || 0
        
        // Filter pending submissions
        const pendingSubmissions = questSubmissions.filter(sub => {
          const isApproved = quest.accepted_submission_user_type_ids?.includes(sub.userTypeId)
          return !isApproved
        })

        const isExpanded = expandedQuests.has(questId)

        return (
          <Card key={questId}>
            <CardHeader 
              className="cursor-pointer"
              onClick={() => toggleQuestExpansion(questId)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">
                      {quest.metadata?.title || `Quest ${questId}`}
                    </h3>
                    <Badge variant="outline">
                      <Trophy className="w-3 h-3 mr-1" />
                      {Number(quest.points || 0)} points
                    </Badge>
                    {approvedCount > 0 && (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {approvedCount} approved
                      </Badge>
                    )}
                    {pendingSubmissions.length > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-800">
                        <Clock className="w-3 h-3 mr-1" />
                        {pendingSubmissions.length} pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {quest.metadata?.short_description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pendingSubmissions.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          const approvedUserIds = quest.accepted_submission_user_type_ids || []
                          selectAllPending(questId, questSubmissions, approvedUserIds)
                        }}
                      >
                        <CheckSquare className="w-4 h-4 mr-1" />
                        Select All
                      </Button>
                      {selectedSubmissions.get(questId)?.size ? (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleBatchApprove(questId)
                          }}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve Selected ({selectedSubmissions.get(questId)?.size})
                        </Button>
                      ) : null}
                    </>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent>
                {questSubmissions.length > 0 ? (
                  <div className="space-y-3">
                    {/* Pending Submissions */}
                    {pendingSubmissions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                          Pending Submissions ({pendingSubmissions.length})
                        </h4>
                        <div className="space-y-2">
                          {pendingSubmissions.map((submission, index) => {
                            const userData = userDetails.get(submission.userTypeId)
                            const isSelected = selectedSubmissions.get(questId)?.has(submission.userTypeId) || false
                            return (
                              <SubmissionCard
                                key={`${submission.userTypeId}-${index}`}
                                submission={submission}
                                userData={userData}
                                questId={questId}
                                questPoints={Number(quest.points || 0)}
                                isPending={true}
                                isSelected={isSelected}
                                onSelectChange={(selected) => {
                                  if (selected) {
                                    toggleSubmissionSelection(questId, submission.userTypeId)
                                  } else {
                                    toggleSubmissionSelection(questId, submission.userTypeId)
                                  }
                                }}
                                quest={quest}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Approved Submissions */}
                    {quest.accepted_submission_user_type_ids && quest.accepted_submission_user_type_ids.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                          Approved Submissions ({quest.accepted_submission_user_type_ids.length})
                        </h4>
                        <div className="space-y-2">
                          {quest.accepted_submission_user_type_ids.map((userTypeId) => {
                            const submission = questSubmissions.find(s => s.userTypeId === userTypeId)
                            const userData = userDetails.get(userTypeId)
                            
                            if (!submission) {
                              // Show approved user even if we don't have their submission data
                              return (
                                <div key={userTypeId} className="flex items-center justify-between p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                                  <div className="flex items-center gap-3">
                                    <Badge className="bg-green-100 text-green-800">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Approved
                                    </Badge>
                                    <code className="text-xs font-mono">
                                      {userTypeId.slice(0, 10)}...
                                    </code>
                                  </div>
                                  <Badge variant="outline">
                                    <Trophy className="w-3 h-3 mr-1" />
                                    {Number(quest.points || 0)} points minted
                                  </Badge>
                                </div>
                              )
                            }

                            return (
                              <SubmissionCard
                                key={userTypeId}
                                submission={submission}
                                userData={userData}
                                questId={questId}
                                questPoints={Number(quest.points || 0)}
                                isPending={false}
                                quest={quest}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {questSubmissions.length === 0 && !quest.accepted_submission_user_type_ids?.length && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No submissions yet for this quest
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No submissions received yet
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}