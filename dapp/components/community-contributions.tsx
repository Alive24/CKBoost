"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TipButton } from "./tip-button"
import { TipProposalCard } from "./tip-proposal-card"
import { SocialInteractions } from "./social-interactions"
import { Clock } from "lucide-react"

interface Contribution {
  id: string
  author: string
  authorAddress: string
  content: string
  type: "comment" | "proposal" | "tutorial"
  timestamp: string
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
}

interface TipProposal {
  id: string
  type: "community" | "personal"
  contributionId: string
  recipientName: string
  recipientAddress: string
  initiatedBy: string
  amount: number
  reason?: string
  message?: string
  status: "pending" | "approved" | "completed" | "rejected"
  approvals: Array<{
    username: string
    timestamp: string
  }>
  requiredApprovals?: number
  createdAt: string
  completedAt?: string
}

const MOCK_CONTRIBUTIONS: Contribution[] = [
  {
    id: "contrib-1",
    author: "CKBExpert",
    authorAddress: "ckb1qyqd5eyygtdmwdr7ge736zw6z0ju6wsw7rshn8fcx7",
    content:
      "Great analysis on the latest CKB upgrade! The technical breakdown of the new consensus mechanism really helps the community understand the improvements. I particularly appreciate how you explained the impact on transaction throughput and security.",
    type: "comment",
    timestamp: "2 hours ago",
    likes: 24,
    isLiked: false,
    comments: [
      {
        id: "comment-1",
        author: "TechReviewer",
        content: "Absolutely agree! This kind of detailed analysis is exactly what our community needs.",
        timestamp: "1 hour ago",
        likes: 3,
        isLiked: false,
      },
      {
        id: "comment-2",
        author: "DevMaster",
        content: "Thanks for breaking this down so clearly. The diagrams really helped!",
        timestamp: "45 minutes ago",
        likes: 1,
        isLiked: true,
      },
    ],
  },
  {
    id: "contrib-2",
    author: "SmartContractGuru",
    authorAddress: "ckb1qyqf4kxy7t5n8cjvs6h9p2w3e4r5t6y7u8i9o0p1q2",
    content:
      "Just published a comprehensive tutorial on building dApps with CKB Script. Covers everything from basic cell model concepts to advanced scripting patterns. Hope this helps newcomers get started!",
    type: "tutorial",
    timestamp: "4 hours ago",
    likes: 42,
    isLiked: true,
    comments: [
      {
        id: "comment-3",
        author: "NewbieDev",
        content: "This tutorial is amazing! Finally understand how the cell model works.",
        timestamp: "3 hours ago",
        likes: 5,
        isLiked: false,
      },
    ],
  },
  {
    id: "contrib-3",
    author: "DAOContributor",
    authorAddress: "ckb1qyqg5fxy8t6n9ckvs7h0p3w4e5r6t7y8u9i0o1p2q3",
    content:
      "Proposal: Implement cross-chain bridge improvements for better interoperability. This would significantly enhance CKB's ecosystem connectivity and user experience. I've outlined the technical specifications and implementation timeline.",
    type: "proposal",
    timestamp: "6 hours ago",
    likes: 18,
    isLiked: false,
    comments: [],
  },
]

const MOCK_TIP_PROPOSALS: TipProposal[] = [
  {
    id: "tip-1",
    type: "community",
    contributionId: "contrib-1",
    recipientName: "CKBExpert",
    recipientAddress: "ckb1qyqd5eyygtdmwdr7ge736zw6z0ju6wsw7rshn8fcx7",
    initiatedBy: "DevMaster",
    amount: 50,
    reason:
      "This technical analysis provides exceptional value to our community. The detailed breakdown of the consensus mechanism upgrade helps both developers and users understand the improvements. The clear explanations and visual aids make complex concepts accessible to everyone.",
    status: "pending",
    approvals: [
      { username: "DevMaster", timestamp: "1h ago" },
      { username: "CryptoAnalyst", timestamp: "45m ago" },
    ],
    requiredApprovals: 5,
    createdAt: "2024-01-16T10:30:00Z",
  },
  {
    id: "tip-2",
    type: "personal",
    contributionId: "contrib-2",
    recipientName: "SmartContractGuru",
    recipientAddress: "ckb1qyqf4kxy7t5n8cjvs6h9p2w3e4r5t6y7u8i9o0p1q2",
    initiatedBy: "TechEnthusiast",
    amount: 25,
    message:
      "Thank you for this incredible tutorial! It saved me hours of research and helped me finally understand CKB scripting. Keep up the amazing work! 🚀",
    status: "completed",
    approvals: [],
    createdAt: "2024-01-16T08:15:00Z",
    completedAt: "2024-01-16T08:16:00Z",
  },
  {
    id: "tip-3",
    type: "community",
    contributionId: "contrib-3",
    recipientName: "DAOContributor",
    recipientAddress: "ckb1qyqg5fxy8t6n9ckvs7h0p3w4e5r6t7y8u9i0o1p2q3",
    initiatedBy: "BridgeBuilder",
    amount: 50,
    reason:
      "This cross-chain bridge proposal addresses a critical need in our ecosystem. The technical specifications are thorough and the implementation timeline is realistic. This kind of forward-thinking proposal deserves community recognition.",
    status: "approved",
    approvals: [
      { username: "BridgeBuilder", timestamp: "5h ago" },
      { username: "TechReviewer", timestamp: "4h ago" },
      { username: "CommunityMod", timestamp: "4h ago" },
      { username: "DevExpert", timestamp: "3h ago" },
      { username: "SecurityAuditor", timestamp: "3h ago" },
    ],
    requiredApprovals: 5,
    createdAt: "2024-01-15T14:00:00Z",
  },
]

export function CommunityContributions() {
  const [contributions, setContributions] = useState(MOCK_CONTRIBUTIONS)
  const [tipProposals, setTipProposals] = useState(MOCK_TIP_PROPOSALS)
  const [currentUserAllowlisted] = useState(true)

  const handleTipInitiated = (contributionId: string, tipData: any) => {
    const contribution = contributions.find((c) => c.id === contributionId)
    if (!contribution) return

    const newProposal: TipProposal = {
      id: `tip-${Date.now()}`,
      type: tipData.type,
      contributionId,
      recipientName: contribution.author,
      recipientAddress: contribution.authorAddress,
      initiatedBy: "CurrentUser",
      amount: tipData.amount,
      reason: tipData.reason,
      message: tipData.message,
      status: tipData.type === "personal" ? "completed" : "pending",
      approvals: tipData.type === "community" ? [{ username: "CurrentUser", timestamp: "now" }] : [],
      requiredApprovals: tipData.requiredApprovals,
      createdAt: new Date().toISOString(),
      completedAt: tipData.type === "personal" ? new Date().toISOString() : undefined,
    }

    setTipProposals((prev) => [newProposal, ...prev])
  }

  const handleApprove = (proposalId: string) => {
    setTipProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              approvals: [...proposal.approvals, { username: "CurrentUser", timestamp: "now" }],
            }
          : proposal,
      ),
    )
  }

  const handleLike = (contributionId: string) => {
    setContributions((prev) =>
      prev.map((contrib) =>
        contrib.id === contributionId
          ? {
              ...contrib,
              isLiked: !contrib.isLiked,
              likes: contrib.isLiked ? contrib.likes - 1 : contrib.likes + 1,
            }
          : contrib,
      ),
    )
  }

  const handleComment = (contributionId: string, comment: string) => {
    // Handle comment submission
    console.log(`New comment on ${contributionId}: ${comment}`)
  }

  const handleShare = (contributionId: string) => {
    // Handle share action
    console.log(`Shared contribution: ${contributionId}`)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "comment":
        return "💬"
      case "proposal":
        return "📋"
      case "tutorial":
        return "📚"
      default:
        return "📝"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "comment":
        return "bg-blue-100 text-blue-800"
      case "proposal":
        return "bg-purple-100 text-purple-800"
      case "tutorial":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="text-3xl">🤝</div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Community Contributions
        </h2>
      </div>

      {contributions.map((contribution) => {
        const contributionTips = tipProposals.filter((tip) => tip.contributionId === contribution.id)

        return (
          <div key={contribution.id} className="space-y-3">
            {/* Main Contribution Card */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 flex items-center justify-center font-semibold">
                      {contribution.author.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold">{contribution.author}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {contribution.timestamp}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getTypeColor(contribution.type)}>
                      {getTypeIcon(contribution.type)} {contribution.type}
                    </Badge>
                    <TipButton
                      recipientName={contribution.author}
                      recipientAddress={contribution.authorAddress}
                      contributionId={contribution.id}
                      currentUserAllowlisted={currentUserAllowlisted}
                      onTipInitiated={handleTipInitiated}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground leading-relaxed">{contribution.content}</p>

                <SocialInteractions
                  proposalId={contribution.id}
                  initialLikes={contribution.likes}
                  initialComments={contribution.comments}
                  isLiked={contribution.isLiked}
                  onLike={handleLike}
                  onComment={handleComment}
                  onShare={handleShare}
                />
              </CardContent>
            </Card>

            {/* Tip Proposals for this Contribution */}
            {contributionTips.map((proposal) => (
              <TipProposalCard
                key={proposal.id}
                proposal={{
                  ...proposal,
                  currentUserApproved: proposal.approvals.some((a) => a.username === "CurrentUser"),
                  onApprove: handleApprove,
                }}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
