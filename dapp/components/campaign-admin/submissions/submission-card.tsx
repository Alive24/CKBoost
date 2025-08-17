"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  CheckCircle, 
  Eye, 
  Trophy,
  User,
  Mail,
  Twitter,
  MessageSquare,
  Clock,
  ExternalLink
} from "lucide-react"
import { UserSubmissionRecordLike, UserDataLike } from "ssri-ckboost/types"
import { SubmissionReviewModal } from "./submission-review-modal"
import { formatDateConsistent } from "@/lib/utils/debug"
import { ccc } from "@ckb-ccc/core"

interface SubmissionCardProps {
  submission: UserSubmissionRecordLike & { userTypeId: string }
  userData?: UserDataLike
  questId: number
  questPoints: number
  isPending: boolean
  isSelected?: boolean
  onSelectChange?: (selected: boolean) => void
  quest?: {
    sub_tasks?: Array<{
      title?: string
      description?: string
      type?: string
      proof_required?: string
    }>
  }
}

export function SubmissionCard({ 
  submission, 
  userData, 
  questId,
  questPoints,
  isPending,
  isSelected = false,
  onSelectChange,
  quest
}: SubmissionCardProps) {
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)

  // Parse user verification data
  let userInfo = {
    name: "Anonymous",
    email: "",
    twitter: "",
    discord: ""
  }

  if (userData?.verification_data?.identity_verification_data) {
    try {
      const identityData = userData.verification_data.identity_verification_data
      let jsonStr: string
      
      if (typeof identityData === 'string') {
        jsonStr = identityData
      } else if (ArrayBuffer.isView(identityData)) {
        jsonStr = new TextDecoder().decode(identityData as Uint8Array)
      } else {
        jsonStr = "{}"
      }
      
      // Trim whitespace and check if it's valid JSON
      jsonStr = jsonStr.trim()
      if (jsonStr && jsonStr !== "" && (jsonStr.startsWith('{') || jsonStr.startsWith('['))) {
        userInfo = JSON.parse(jsonStr)
      }
    } catch (err) {
      console.error("Failed to parse user identity data:", err)
    }
  }

  const submissionTime = submission.submission_timestamp 
    ? new Date(Number(submission.submission_timestamp))
    : null

  return (
    <>
      <div className={`flex items-center justify-between p-3 border rounded-lg ${
        isPending ? 'bg-background' : 'bg-green-50/50 dark:bg-green-950/20'
      } ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-center gap-3 flex-1">
          {/* Selection Checkbox for pending submissions */}
          {isPending && onSelectChange && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelectChange}
              aria-label="Select for approval"
            />
          )}
          
          {/* Status Badge */}
          {!isPending && (
            <Badge className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Approved
            </Badge>
          )}

          {/* User Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{userInfo.name}</span>
              {userInfo.twitter && (
                <a 
                  href={`https://twitter.com/${userInfo.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Twitter className="w-3 h-3" />
                </a>
              )}
              {userInfo.discord && (
                <span className="text-xs text-muted-foreground">
                  <MessageSquare className="w-3 h-3 inline mr-1" />
                  {userInfo.discord}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1">
              <code className="text-xs font-mono text-muted-foreground">
                {submission.userTypeId.slice(0, 10)}...
              </code>
              {submissionTime && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateConsistent(submissionTime)}
                </span>
              )}
              {userData && (
                <span className="text-xs text-muted-foreground">
                  Total Points: {Number(userData.total_points_earned || 0)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isPending && (
            <Badge variant="outline">
              <Trophy className="w-3 h-3 mr-1" />
              {questPoints} points minted
            </Badge>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReviewModalOpen(true)}
          >
            <Eye className="w-4 h-4 mr-1" />
            View Details
          </Button>
        </div>
      </div>

      {/* Review Modal */}
      <SubmissionReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        submission={submission}
        userData={userData}
        userInfo={userInfo}
        questId={questId}
        questPoints={questPoints}
        isApproved={!isPending}
        quest={quest}
      />
    </>
  )
}