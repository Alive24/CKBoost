"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { ThumbsUp, Coins, Users, Clock } from "lucide-react"

interface Approval {
  username: string
  timestamp: string
  avatar?: string
}

interface TipVotingProps {
  recipientName: string
  recipientAddress: string
  contributionId: string
  initiatedBy: string
  approvals: Approval[]
  requiredApprovals: number
  currentUserApproved?: boolean
  onApprove?: (contributionId: string) => void
}

export function TipVoting({
  recipientName,
  recipientAddress,
  contributionId,
  initiatedBy,
  approvals,
  requiredApprovals,
  currentUserApproved = false,
  onApprove,
}: TipVotingProps) {
  const [isApproving, setIsApproving] = useState(false)

  const approvalsNeeded = requiredApprovals - approvals.length
  const progressPercentage = (approvals.length / requiredApprovals) * 100
  const isCompleted = approvals.length >= requiredApprovals

  const handleApprove = async () => {
    if (currentUserApproved || isCompleted) return

    setIsApproving(true)
    // Simulate approval process
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsApproving(false)

    onApprove?.(contributionId)
  }

  return (
    <Card className={`border-2 ${isCompleted ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}`}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className={`w-5 h-5 ${isCompleted ? "text-green-600" : "text-yellow-600"}`} />
              <span className="font-semibold">{isCompleted ? "🎉 Tip Approved!" : "⏳ Tip in Progress"}</span>
            </div>
            <Badge
              variant={isCompleted ? "default" : "secondary"}
              className="bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800"
            >
              50 CKB
            </Badge>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isCompleted
                  ? `Tip approved for ${recipientName}`
                  : `Needs ${approvalsNeeded} more approval${approvalsNeeded !== 1 ? "s" : ""}`}
              </span>
              <span className="font-medium">
                {approvals.length}/{requiredApprovals}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Recipient Info */}
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 flex items-center justify-center font-semibold text-sm">
              {recipientName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{recipientName}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {recipientAddress.slice(0, 8)}...{recipientAddress.slice(-6)}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Initiated by {initiatedBy}</div>
          </div>

          {/* Approvals List */}
          {approvals.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="w-4 h-4" />
                Approved by:
              </div>
              <div className="flex flex-wrap gap-2">
                {approvals.map((approval, index) => (
                  <div key={index} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border text-sm">
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="text-xs bg-gradient-to-br from-green-200 to-blue-200">
                        {approval.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{approval.username}</span>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span className="text-xs">{approval.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          {!isCompleted && (
            <div className="pt-2">
              <Button
                onClick={handleApprove}
                disabled={currentUserApproved || isApproving}
                size="sm"
                className={`w-full ${
                  currentUserApproved
                    ? "bg-green-100 text-green-800 hover:bg-green-100"
                    : "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                }`}
                variant={currentUserApproved ? "outline" : "default"}
              >
                {isApproving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Approving...
                  </>
                ) : currentUserApproved ? (
                  <>
                    <ThumbsUp className="w-4 h-4 mr-2 fill-current" />
                    You Approved
                  </>
                ) : (
                  <>
                    <ThumbsUp className="w-4 h-4 mr-2" />👍 Approve Tip
                  </>
                )}
              </Button>
            </div>
          )}

          {isCompleted && (
            <div className="text-center p-3 bg-green-100 rounded-lg border border-green-200">
              <div className="text-green-800 font-medium">🎉 Tip has been sent to {recipientName}!</div>
              <div className="text-sm text-green-600 mt-1">50 CKB tokens have been transferred</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
