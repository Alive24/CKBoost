"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, ExternalLink, Eye, Clock, RefreshCcw, AlertCircle } from "lucide-react"
import { useUser } from "@/lib/providers/user-provider"
import { useNostrFetch } from "@/hooks/use-nostr-fetch"
import { ccc } from "@ckb-ccc/core"
import { debug } from "@/lib/utils/debug"
import { NostrSubmissionData, isNostrSubmissionData } from "@/types/submission"

interface QuestSubmissionDisplayProps {
  quest: { quest_id?: number; metadata?: { title?: string } }
  questIndex: number
  campaignTypeId: ccc.Hex
}

export function QuestSubmissionDisplay({ 
  quest, 
  questIndex, 
  campaignTypeId 
}: QuestSubmissionDisplayProps) {
  const { currentUserTypeId, getUserSubmissions, refreshUserData } = useUser()
  const { fetchSubmission } = useNostrFetch()
  const [userSubmission, setUserSubmission] = useState<{ submission_timestamp?: number; submission_content?: string } | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [submissionContent, setSubmissionContent] = useState<string>("")
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Load user's submission for this quest
  const loadSubmission = async () => {
    if (!currentUserTypeId) return

    try {
      const submissions = await getUserSubmissions(currentUserTypeId)
      const questId = Number(quest.quest_id || questIndex + 1)
      
      // Find submission for this specific quest
      const submission = submissions.find((s: { campaign_type_id?: string; quest_id?: number }) => 
        s.campaign_type_id === campaignTypeId && 
        s.quest_id === questId
      )

      if (submission) {
        debug.log("Found submission for quest", {
          questId,
          hasNeventId: submission.submission_content?.startsWith('nevent1')
        })
        setUserSubmission({
          submission_timestamp: Number(submission.submission_timestamp),
          submission_content: submission.submission_content
        })
      } else {
        setUserSubmission(null)
      }
    } catch (err) {
      console.error("Failed to load submission:", err)
    }
  }

  useEffect(() => {
    loadSubmission()
  }, [currentUserTypeId, campaignTypeId, quest.quest_id, questIndex])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshUserData()
      await loadSubmission()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleViewSubmission = async () => {
    if (!userSubmission) return

    setIsViewDialogOpen(true)
    setIsLoadingContent(true)

    try {
      // Check if content is a nevent ID
      if (userSubmission.submission_content?.startsWith('nevent1')) {
        // Fetch from Nostr
        const nostrData = await fetchSubmission(userSubmission.submission_content)
        if (nostrData) {
          setSubmissionContent(nostrData.content)
        } else {
          setSubmissionContent("Failed to load content from Nostr. Event ID: " + userSubmission.submission_content)
        }
      } else {
        // It's direct content
        setSubmissionContent(userSubmission.submission_content || "No content available")
      }
    } catch (err) {
      console.error("Failed to load submission content:", err)
      setSubmissionContent("Error loading submission content")
    } finally {
      setIsLoadingContent(false)
    }
  }

  if (!userSubmission) {
    return (
      <div className="flex items-center gap-2 mt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4 mr-1" />
          )}
          Refresh Status
        </Button>
        <span className="text-sm text-muted-foreground">
          No submission found. Click refresh to check again.
        </span>
      </div>
    )
  }

  // Check if submission is accepted
  // Note: acceptance status would need to be fetched from the campaign cell
  const isAccepted = false // TODO: Implement acceptance checking from campaign cell

  return (
    <>
      <div className="flex items-center gap-2 mt-4">
        <Badge variant={isAccepted ? "default" : "secondary"} className="flex items-center gap-1">
          {isAccepted ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Accepted
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" />
              Pending Review
            </>
          )}
        </Badge>
        
        <Button
          size="sm"
          variant="outline"
          onClick={handleViewSubmission}
        >
          <Eye className="w-4 h-4 mr-1" />
          View Submission
        </Button>

        {/* Future: Add edit button */}
        {/* <Button
          size="sm"
          variant="outline"
          disabled
        >
          <Edit className="w-4 h-4 mr-1" />
          Edit
        </Button> */}
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your Submission</DialogTitle>
            <DialogDescription>
              Quest: {quest.metadata?.title || `Quest ${questIndex + 1}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Submission Status */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={isAccepted ? "default" : "secondary"}>
                {isAccepted ? "Accepted" : "Pending Review"}
              </Badge>
            </div>

            {/* Submission Timestamp */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium">Submitted</span>
              <span className="text-sm text-muted-foreground">
                {new Date(Number(userSubmission.submission_timestamp)).toLocaleString()}
              </span>
            </div>

            {/* Submission Content with Subtasks */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Submission Content</Label>
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    try {
                      const parsed = JSON.parse(submissionContent) as unknown;
                      if (isNostrSubmissionData(parsed)) {
                        // JSON format - render structured subtasks
                        return parsed.subtasks.map((subtask, index) => {
                          return (
                            <div key={index} className="border rounded-lg overflow-hidden">
                              <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                  {subtask.title || `Subtask ${index + 1}`}
                                </span>
                              </div>
                              <div className="p-4 bg-white dark:bg-gray-900">
                                {subtask.response ? (
                                  <div 
                                    className="prose prose-sm dark:prose-invert max-w-none"
                                    dangerouslySetInnerHTML={{ 
                                      __html: subtask.response
                                    }}
                                  />
                                ) : (
                                  <p className="text-gray-500 dark:text-gray-400 italic">Not provided</p>
                                )}
                              </div>
                            </div>
                          );
                        });
                      }
                      throw new Error("Invalid JSON format");
                    } catch {
                      // Invalid format - prompt to resubmit
                      return (
                        <div className="text-center py-8 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                          <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Invalid submission format detected.
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Please resubmit your quest response.
                          </p>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>

            {/* Storage Type */}
            {userSubmission.submission_content?.startsWith('nevent1') && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <ExternalLink className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-blue-800 dark:text-blue-200">
                  Content stored on Nostr network
                </span>
              </div>
            )}

            {/* Points Earned (if accepted) */}
            {isAccepted && (
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  Points Earned
                </span>
                <span className="text-lg font-bold text-green-800 dark:text-green-200">
                  +10
                </span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Add missing import
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"