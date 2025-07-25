"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TipProposalCard } from "./tip-proposal-card"
import { Plus, Search } from "lucide-react"
import Link from "next/link"

interface TipProposal {
  id: string
  contributionTitle: string
  contributionDescription: string
  contributionType: "comment" | "proposal" | "tutorial" | "analysis"
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
}

const MOCK_PROPOSALS: TipProposal[] = [
  {
    id: "proposal-1",
    contributionTitle: "Comprehensive CKB Consensus Mechanism Analysis",
    contributionDescription:
      "Detailed technical breakdown of the latest CKB upgrade, explaining the new consensus mechanism improvements, transaction throughput enhancements, and security implications for the ecosystem.",
    contributionType: "analysis",
    contributionUrl: "https://forum.nervos.org/t/ckb-consensus-analysis/123",
    recipientName: "CKBExpert",
    recipientAddress: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqds6ed78yze6eyfyvd537z66ur620n96rtsfrf67g",
    proposedBy: "DevMaster",
    justification:
      "This analysis provides exceptional value to our community by making complex technical concepts accessible to both developers and users. The detailed explanations and visual aids help everyone understand the upgrade's impact on the ecosystem.",
    communityTipAmount: 50,
    status: "pending",
    approvals: [
      { username: "DevMaster", timestamp: "1h ago" },
      { username: "CryptoAnalyst", timestamp: "45m ago" },
      { username: "TechReviewer", timestamp: "30m ago" },
    ],
    requiredApprovals: 5,
    createdAt: "2024-01-16T10:30:00Z",
    likes: 12,
    isLiked: false,
    comments: [
      {
        id: "comment-1",
        author: "BlockchainDev",
        content: "Absolutely agree with this proposal. The analysis really helped me understand the upgrade.",
        timestamp: "30m ago",
        likes: 3,
        isLiked: false,
      },
      {
        id: "comment-2",
        author: "CommunityMod",
        content: "High-quality content like this deserves recognition. Supporting this proposal!",
        timestamp: "20m ago",
        likes: 5,
        isLiked: true,
      },
    ],
    additionalTips: [
      {
        id: "tip-1",
        from: "TechEnthusiast",
        amount: 15,
        message: "Thanks for the clear explanation! This saved me hours of research.",
        timestamp: "25m ago",
        status: "completed",
      },
      {
        id: "tip-2",
        from: "NewbieDev",
        amount: 5,
        message: "Finally understand consensus mechanisms thanks to this!",
        timestamp: "15m ago",
        status: "completed",
      },
    ],
  },
  {
    id: "proposal-2",
    contributionTitle: "Complete dApp Development Tutorial Series",
    contributionDescription:
      "Comprehensive tutorial series covering CKB Script development from basics to advanced patterns. Includes practical examples, code samples, and best practices for building production-ready dApps.",
    contributionType: "tutorial",
    contributionUrl: "https://github.com/ckb-tutorials/dapp-series",
    recipientName: "SmartContractGuru",
    recipientAddress: "ckb1qyqf4kxy7t5n8cjvs6h9p2w3e4r5t6y7u8i9o0p1q2",
    proposedBy: "EducationLead",
    justification:
      "This tutorial series fills a critical gap in our educational resources. It provides step-by-step guidance for developers wanting to build on CKB, with practical examples that can be immediately applied.",
    communityTipAmount: 50,
    status: "approved",
    approvals: [
      { username: "EducationLead", timestamp: "2h ago" },
      { username: "DevExpert", timestamp: "1h 45m ago" },
      { username: "CommunityMod", timestamp: "1h 30m ago" },
      { username: "TechReviewer", timestamp: "1h 15m ago" },
      { username: "SecurityAuditor", timestamp: "1h ago" },
    ],
    requiredApprovals: 5,
    createdAt: "2024-01-16T08:00:00Z",
    likes: 28,
    isLiked: true,
    comments: [
      {
        id: "comment-3",
        author: "JuniorDev",
        content: "This tutorial series is incredible! Best CKB learning resource I've found.",
        timestamp: "1h ago",
        likes: 8,
        isLiked: false,
      },
    ],
    additionalTips: [
      {
        id: "tip-3",
        from: "StartupFounder",
        amount: 100,
        message: "This tutorial helped our team build our first CKB dApp. Huge thanks! 🚀",
        timestamp: "1h 30m ago",
        status: "completed",
      },
      {
        id: "tip-4",
        from: "IndieHacker",
        amount: 25,
        message: "Saved me weeks of learning. Worth every CKB!",
        timestamp: "45m ago",
        status: "completed",
      },
      {
        id: "tip-5",
        from: "CryptoBuilder",
        amount: 50,
        timestamp: "30m ago",
        status: "completed",
      },
    ],
  },
  {
    id: "proposal-3",
    contributionTitle: "Cross-Chain Bridge Security Proposal",
    contributionDescription:
      "Detailed proposal for implementing enhanced security measures in cross-chain bridges, including multi-signature validation, time-locked transactions, and emergency pause mechanisms.",
    contributionType: "proposal",
    contributionUrl: "https://forum.nervos.org/t/bridge-security-proposal/456",
    recipientName: "SecurityExpert",
    recipientAddress: "ckb1qyqg5fxy8t6n9ckvs7h0p3w4e5r6t7y8u9i0o1p2q3",
    proposedBy: "BridgeBuilder",
    justification:
      "This security proposal addresses critical vulnerabilities in cross-chain infrastructure. The proposed solutions are well-researched and could prevent significant losses in the ecosystem.",
    communityTipAmount: 50,
    status: "completed",
    approvals: [
      { username: "BridgeBuilder", timestamp: "1 day ago" },
      { username: "SecurityAuditor", timestamp: "23h ago" },
      { username: "TechLead", timestamp: "22h ago" },
      { username: "CommunityMod", timestamp: "21h ago" },
      { username: "DevExpert", timestamp: "20h ago" },
    ],
    requiredApprovals: 5,
    createdAt: "2024-01-15T14:00:00Z",
    completedAt: "2024-01-15T18:00:00Z",
    likes: 35,
    isLiked: false,
    comments: [
      {
        id: "comment-4",
        author: "SecurityResearcher",
        content: "Excellent proposal! These security measures are essential for bridge safety.",
        timestamp: "20h ago",
        likes: 12,
        isLiked: true,
      },
      {
        id: "comment-5",
        author: "BridgeUser",
        content: "As someone who uses bridges daily, I really appreciate this focus on security.",
        timestamp: "18h ago",
        likes: 6,
        isLiked: false,
      },
    ],
    additionalTips: [
      {
        id: "tip-6",
        from: "DeFiProtocol",
        amount: 200,
        message: "Critical work for ecosystem security. Thank you for this thorough analysis!",
        timestamp: "19h ago",
        status: "completed",
      },
    ],
  },
]

export function TipProposals() {
  const [proposals, setProposals] = useState(MOCK_PROPOSALS)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredProposals = proposals.filter(
    (proposal) =>
      proposal.contributionTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.proposedBy.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleApprove = (proposalId: string) => {
    setProposals((prev) =>
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

  const handleLike = (proposalId: string) => {
    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              isLiked: !proposal.isLiked,
              likes: proposal.isLiked ? proposal.likes - 1 : proposal.likes + 1,
            }
          : proposal,
      ),
    )
  }

  const handleComment = (proposalId: string, comment: string) => {
    const newComment = {
      id: `comment-${Date.now()}`,
      author: "CurrentUser",
      content: comment,
      timestamp: "now",
      likes: 0,
      isLiked: false,
    }

    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              comments: [newComment, ...proposal.comments],
            }
          : proposal,
      ),
    )
  }

  const handleAdditionalTip = (proposalId: string, tipData: { amount: number; message?: string }) => {
    const newTip = {
      id: `tip-${Date.now()}`,
      from: "CurrentUser",
      amount: tipData.amount,
      message: tipData.message,
      timestamp: "now",
      status: "completed" as const,
    }

    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              additionalTips: [newTip, ...proposal.additionalTips],
            }
          : proposal,
      ),
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search proposals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Link href="/create-tip-proposal">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Proposal
          </Button>
        </Link>
      </div>

      {/* Proposals List */}
      <div className="space-y-6">
        {filteredProposals.map((proposal) => (
          <TipProposalCard
            key={proposal.id}
            proposal={{
              ...proposal,
              currentUserApproved: proposal.approvals.some((a) => a.username === "CurrentUser"),
              onApprove: handleApprove,
              onLike: handleLike,
              onComment: handleComment,
              onAdditionalTip: handleAdditionalTip,
            }}
          />
        ))}
      </div>

      {filteredProposals.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">💰</div>
          <h3 className="text-xl font-semibold mb-2">No proposals found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? "Try adjusting your search terms" : "Be the first to create a tip proposal!"}
          </p>
        </div>
      )}
    </div>
  )
}
