"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SubmissionContentViewer } from "@/components/submission-content-viewer"
import { 
  CheckCircle, 
  Trophy,
  User,
  Mail,
  Twitter,
  MessageSquare,
  Clock,
  ExternalLink,
  AlertCircle,
  Copy
} from "lucide-react"
import { UserSubmissionRecordLike, UserDataLike } from "ssri-ckboost/types"
import { useNostrFetch } from "@/hooks/use-nostr-fetch"
import { formatDateConsistent, debug } from "@/lib/utils/debug"
import { NostrSubmissionData, isNostrSubmissionData, QuestSubtask } from "@/types/submission"

interface SubmissionReviewModalProps {
  isOpen: boolean
  onClose: () => void
  submission: UserSubmissionRecordLike & { userTypeId: string }
  userData?: UserDataLike
  userInfo: {
    name: string
    email?: string
    twitter?: string
    discord?: string
  }
  questId: number
  questPoints: number
  isApproved: boolean
  quest?: {
    sub_tasks?: QuestSubtask[]
  }
}

export function SubmissionReviewModal({
  isOpen,
  onClose,
  submission,
  userData,
  userInfo,
  questId,
  questPoints,
  isApproved,
  quest
}: SubmissionReviewModalProps) {
  const { fetchSubmission } = useNostrFetch()
  const [submissionContent, setSubmissionContent] = useState<string>("")
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && submission.submission_content) {
      loadSubmissionContent()
    }
  }, [isOpen, submission.submission_content])

  async function loadSubmissionContent() {
    setIsLoadingContent(true)
    setContentError(null)

    try {
      const content = submission.submission_content
      
      if (!content) {
        setSubmissionContent("No submission content available")
        return
      }

      // Convert content to string if it's bytes
      let contentStr: string
      if (typeof content === 'string') {
        contentStr = content
      } else if (ArrayBuffer.isView(content)) {
        contentStr = new TextDecoder().decode(content as Uint8Array)
      } else {
        contentStr = String(content)
      }

      // Check if it's a nevent ID
      if (contentStr.startsWith('nevent1')) {
        debug.log("Fetching Nostr content for", contentStr)
        const nostrData = await fetchSubmission(contentStr)
        if (nostrData) {
          setSubmissionContent(nostrData.content)
        } else {
          setContentError("Failed to fetch content from Nostr")
          setSubmissionContent(`Nostr Event ID: ${contentStr}`)
        }
      } else {
        // Direct content
        setSubmissionContent(contentStr)
      }
    } catch (err) {
      console.error("Failed to load submission content:", err)
      setContentError("Error loading submission content")
      setSubmissionContent("Failed to load content")
    } finally {
      setIsLoadingContent(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    // Could add a toast notification here
  }

  const submissionTime = submission.submission_timestamp 
    ? new Date(Number(submission.submission_timestamp))
    : null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Submission</DialogTitle>
          <DialogDescription>
            Quest #{questId} - {questPoints} points
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            {isApproved ? (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Approved - {questPoints} points minted
              </Badge>
            ) : (
              <Badge className="bg-yellow-100 text-yellow-800">
                <Clock className="w-3 h-3 mr-1" />
                Pending Review
              </Badge>
            )}
          </div>

          {/* User Information */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              User Information
            </h3>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <p className="font-medium">{userInfo.name}</p>
              </div>
              
              {userInfo.email && (
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {userInfo.email}
                  </p>
                </div>
              )}
              
              {userInfo.twitter && (
                <div>
                  <span className="text-muted-foreground">Twitter:</span>
                  <p className="font-medium">
                    <a 
                      href={`https://twitter.com/${userInfo.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 flex items-center gap-1"
                    >
                      <Twitter className="w-3 h-3" />
                      {userInfo.twitter}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
              )}
              
              {userInfo.discord && (
                <div>
                  <span className="text-muted-foreground">Discord:</span>
                  <p className="font-medium flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {userInfo.discord}
                  </p>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">User Type ID:</span>
                <p className="font-mono text-xs flex items-center gap-1">
                  {submission.userTypeId.slice(0, 10)}...
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => copyToClipboard(submission.userTypeId)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </p>
              </div>

              {userData && (
                <div>
                  <span className="text-muted-foreground">Total Points:</span>
                  <p className="font-medium flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    {Number(userData.total_points_earned || 0)}
                  </p>
                </div>
              )}

              {submissionTime && (
                <div>
                  <span className="text-muted-foreground">Submitted:</span>
                  <p className="font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDateConsistent(submissionTime)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Submission Content */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-medium">Submission Content</h3>
            
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading content...</p>
                </div>
              </div>
            ) : contentError ? (
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{contentError}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  try {
                    const parsed = JSON.parse(submissionContent) as unknown;
                    if (isNostrSubmissionData(parsed)) {
                      // Use quest data as primary source, map with user responses
                      return quest?.sub_tasks?.map((questSubtask, index) => {
                        const userSubtask = parsed.subtasks[index];
                        
                        return (
                          <div key={index} className="border rounded-lg overflow-hidden">
                            <div className="bg-muted px-4 py-3 border-b space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">
                                  {questSubtask.title || `Subtask ${index + 1}`}
                                </span>
                                {questSubtask.type && (
                                  <Badge variant="outline" className="text-xs">
                                    {questSubtask.type}
                                  </Badge>
                                )}
                              </div>
                              <div className="space-y-1">
                                {questSubtask.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {questSubtask.description}
                                  </p>
                                )}
                                {questSubtask.proof_required && (
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium">Required proof:</span> {questSubtask.proof_required}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="p-4 bg-background">
                              <div className="text-sm font-medium text-muted-foreground mb-2">User Response:</div>
                              <SubmissionContentViewer content={userSubtask?.response || "Not provided"} />
                            </div>
                          </div>
                        );
                      }) || [];
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
                          User needs to resubmit their quest response.
                        </p>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {submission.submission_content?.startsWith('nevent1') && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-3 h-3" />
                Content fetched from Nostr event
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}