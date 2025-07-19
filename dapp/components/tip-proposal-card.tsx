"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SocialInteractions } from "./social-interactions"
import { ThumbsUp, Users, Clock, Eye, ExternalLink, Plus, Wallet, Gift } from "lucide-react"

interface TipProposal {
  id: string
  contributionTitle: string
  contributionDescription: string
  contributionType: string
  contributionUrl?: string
  recipientName: string
  recipientAddress: string
  proposedBy: string
  justification: string
  communityTipAmount: number
  status: "pending" | "approved" | "completed" | "rejected"
  approvals: Array<{
    username: string
    timestamp: string
    avatar?: string
  }>
  requiredApprovals: number
  createdAt: string
  completedAt?: string
  likes: number
  isLiked: boolean
  comments: Array<{
    id: string
    author: string
    content: string
    timestamp: string
    likes: number
    isLiked: boolean
  }>
  additionalTips: Array<{
    id: string
    from: string
    amount: number
    message?: string
    timestamp: string
    status: "completed" | "pending"
  }>
  currentUserApproved?: boolean
  onApprove?: (proposalId: string) => void
  onLike?: (proposalId: string) => void
  onComment?: (proposalId: string, comment: string) => void
  onAdditionalTip?: (proposalId: string, tipData: { amount: number; message?: string }) => void
}

interface TipProposalCardProps {
  proposal: TipProposal
}

export function TipProposalCard({ proposal }: TipProposalCardProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [isAdditionalTipModalOpen, setIsAdditionalTipModalOpen] = useState(false)
  const [additionalTipAmount, setAdditionalTipAmount] = useState("")
  const [additionalTipMessage, setAdditionalTipMessage] = useState("")
  const [isSendingTip, setIsSendingTip] = useState(false)

  const handleApprove = async () => {
    if (proposal.currentUserApproved || proposal.status !== "pending") return

    setIsApproving(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsApproving(false)

    proposal.onApprove?.(proposal.id)
  }

  const handleAdditionalTip = async () => {
    if (!additionalTipAmount || Number.parseFloat(additionalTipAmount) <= 0) return

    setIsSendingTip(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsSendingTip(false)

    proposal.onAdditionalTip?.(proposal.id, {
      amount: Number.parseFloat(additionalTipAmount),
      message: additionalTipMessage || undefined,
    })

    setIsAdditionalTipModalOpen(false)
    setAdditionalTipAmount("")
    setAdditionalTipMessage("")
  }

  const getStatusBadge = () => {
    switch (proposal.status) {
      case "pending":
        return <Badge className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 whitespace-nowrap">⏳ Pending Approval</Badge>
      case "approved":
        return <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 whitespace-nowrap">✅ Approved</Badge>
      case "completed":
        return <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 whitespace-nowrap">🎉 Completed</Badge>
      case "rejected":
        return <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 whitespace-nowrap">❌ Rejected</Badge>
      default:
        return <Badge variant="outline" className="whitespace-nowrap">Unknown</Badge>
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "analysis":
        return "📊"
      case "tutorial":
        return "📚"
      case "proposal":
        return "📋"
      case "comment":
        return "💬"
      default:
        return "📝"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "analysis":
        return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
      case "tutorial":
        return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
      case "proposal":
        return "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200"
      case "comment":
        return "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200"
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
    }
  }

  const approvalsNeeded = proposal.requiredApprovals - proposal.approvals.length
  const progressPercentage = (proposal.approvals.length / proposal.requiredApprovals) * 100
  const totalAdditionalTips = proposal.additionalTips.reduce((sum, tip) => sum + tip.amount, 0)

  return (
    <Card className="border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
      <CardHeader className="pb-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="text-3xl">{getTypeIcon(proposal.contributionType)}</div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">{proposal.contributionTitle}</h3>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={`${getTypeColor(proposal.contributionType)} whitespace-nowrap`}>
                  {proposal.contributionType}
                </Badge>
                {proposal.contributionUrl && (
                  <a
                    href={proposal.contributionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <p className="text-muted-foreground mb-3">{proposal.contributionDescription}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-yellow-600 mb-1">{proposal.communityTipAmount} CKB</div>
            {getStatusBadge()}
          </div>
        </div>

        {/* Recipient & Proposer Info */}
        <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 flex items-center justify-center font-semibold">
              {proposal.recipientName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold">{proposal.recipientName}</div>
              <div className="text-sm text-muted-foreground font-mono">
                {proposal.recipientAddress.slice(0, 8)}...{proposal.recipientAddress.slice(-6)}
              </div>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>Proposed by {proposal.proposedBy}</div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(proposal.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Justification */}
        <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm font-medium mb-2">Justification:</div>
          <div className="text-sm text-muted-foreground">{proposal.justification}</div>
        </div>

        {/* Community Tip Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="w-4 h-4" />
              Community Approval Progress
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)} className="text-xs">
              <Eye className="w-3 h-3 mr-1" />
              {showDetails ? "Hide" : "Show"} Details
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {proposal.status === "pending" && approvalsNeeded > 0
                  ? `Needs ${approvalsNeeded} more approval${approvalsNeeded !== 1 ? "s" : ""}`
                  : proposal.status === "pending"
                    ? "Ready for execution"
                    : `${proposal.approvals.length}/${proposal.requiredApprovals} approvals`}
              </span>
              <span className="font-medium">
                {proposal.approvals.length}/{proposal.requiredApprovals}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Approvers */}
          {proposal.approvals.length > 0 && (
            <div className="space-y-2">
              {showDetails ? (
                <div className="space-y-2">
                  {proposal.approvals.map((approval, index) => (
                    <div key={index} className="flex items-center gap-2 bg-white dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 text-sm">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-green-200 to-blue-200">
                          {approval.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{approval.username}</span>
                      <div className="flex items-center gap-1 text-muted-foreground ml-auto">
                        <Clock className="w-3 h-3" />
                        <span className="text-xs">{approval.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Approved by:</span>
                  <div className="flex gap-1">
                    {proposal.approvals.slice(0, 5).map((approval, index) => (
                      <Avatar key={index} className="w-6 h-6">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-green-200 to-blue-200">
                          {approval.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {proposal.approvals.length > 5 && (
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                        +{proposal.approvals.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Additional Tips Section */}
        {proposal.additionalTips.length > 0 && (
          <div className="space-y-3">
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gift className="w-4 h-4 text-green-600" />
                Additional Tips ({totalAdditionalTips} CKB)
              </div>
            </div>
            <div className="space-y-2">
              {proposal.additionalTips.map((tip) => (
                <div
                  key={tip.id}
                  className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-sm bg-gradient-to-br from-green-200 to-emerald-200">
                      {tip.from.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{tip.from}</span>
                      <span className="text-green-600 font-semibold text-sm">{tip.amount} CKB</span>
                      <span className="text-xs text-muted-foreground">{tip.timestamp}</span>
                    </div>
                    {tip.message && <div className="text-sm text-muted-foreground italic">"{tip.message}"</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {proposal.status === "pending" && (
            <Button
              onClick={handleApprove}
              disabled={proposal.currentUserApproved || isApproving}
              size="sm"
              className={`${
                proposal.currentUserApproved
                  ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900"
                  : "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              }`}
              variant={proposal.currentUserApproved ? "outline" : "default"}
            >
              {isApproving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Approving...
                </>
              ) : proposal.currentUserApproved ? (
                <>
                  <ThumbsUp className="w-4 h-4 mr-2 fill-current" />
                  You Approved
                </>
              ) : (
                <>
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Approve Proposal
                </>
              )}
            </Button>
          )}

          <Button
            onClick={() => setIsAdditionalTipModalOpen(true)}
            size="sm"
            variant="outline"
            className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Personal Tip
          </Button>
        </div>

        {/* Completion Status */}
        {proposal.status === "completed" && (
          <div className="text-center p-4 bg-green-100 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-green-800 dark:text-green-200 font-medium">
              🎉 Community tip of {proposal.communityTipAmount} CKB sent to {proposal.recipientName}!
            </div>
            {totalAdditionalTips > 0 && (
              <div className="text-sm text-green-600 dark:text-green-300 mt-1">
                Plus {totalAdditionalTips} CKB in additional tips from the community
              </div>
            )}
            {proposal.completedAt && (
              <div className="text-sm text-green-600 dark:text-green-300 mt-1">
                Completed on {new Date(proposal.completedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {/* Social Interactions */}
        <Separator />
        <SocialInteractions
          proposalId={proposal.id}
          initialLikes={proposal.likes}
          initialComments={proposal.comments}
          isLiked={proposal.isLiked}
          onLike={proposal.onLike}
          onComment={proposal.onComment}
          onShare={() => {}}
        />
      </CardContent>

      {/* Additional Tip Modal */}
      <Dialog open={isAdditionalTipModalOpen} onOpenChange={setIsAdditionalTipModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-600" />
              Send Additional Tip
            </DialogTitle>
            <DialogDescription>Send a personal tip to {proposal.recipientName} for this contribution</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="text-sm text-green-800 dark:text-green-200">
                <div className="font-medium mb-1">Personal Tip</div>
                <div className="text-xs">
                  This tip will be sent directly from your wallet to {proposal.recipientName}. No approvals needed.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">
                Tip Amount (CKB) *
              </label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount in CKB"
                value={additionalTipAmount}
                onChange={(e) => setAdditionalTipAmount(e.target.value)}
                min="0.1"
                step="0.1"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium">
                Personal Message (Optional)
              </label>
              <Textarea
                id="message"
                placeholder="Add a personal note with your tip..."
                value={additionalTipMessage}
                onChange={(e) => setAdditionalTipMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span>Estimated network fee:</span>
                <span className="font-medium">~0.001 CKB</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAdditionalTipModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdditionalTip}
              disabled={isSendingTip || !additionalTipAmount || Number.parseFloat(additionalTipAmount) <= 0}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            >
              {isSendingTip ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  Send Tip
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
