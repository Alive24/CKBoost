"use client"

import { useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  Clock,
  Star,
  Users,
  Trophy,
  CheckCircle,
  AlertCircle,
  Edit,
  Settings,
} from "lucide-react"
import Link from "next/link"

// Mock current user - in real app, this would come from authentication
const CURRENT_USER = {
  id: 1,
  ownedCampaignTypeHashes: [
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000000000000000000000000002"
  ]
}

// Import types and utilities
import type { QuestDataLike, QuestSubTaskDataLike } from "@/lib/types"
import { 
  getDifficultyString, 
  getTimeEstimateString,
  getQuestIcon,
  getQuestRewards
} from "@/lib/types"
import { ccc, mol } from "@ckb-ccc/core"

// Create mock quest data using schema types
const createMockSubtask = (
  id: number,
  title: string,
  type: string,
  description: string,
  proofRequired: string
): QuestSubTaskDataLike => ({
  id,
  title: ccc.hexFrom(ccc.bytesFrom(title, "utf8")),
  type: ccc.hexFrom(ccc.bytesFrom(type, "utf8")),
  description: ccc.hexFrom(ccc.bytesFrom(description, "utf8")),
  proof_required: ccc.hexFrom(ccc.bytesFrom(proofRequired, "utf8"))
})

const createMockQuest = (
id: number, p0: string, data: {
  title: string
  description: string
  points: number
  difficulty: number
  timeEstimate: number
  completions: number
  status: number
  subtasks: QuestSubTaskDataLike[]
  rewardAmounts: { symbol: string; amount: number} []
}): QuestDataLike => ({
  rewards_on_completion: [{
    ckb_amount: BigInt(0),
    nft_assets: [],
    udt_assets: data.rewardAmounts.map(reward => ({
      udt_script: {
        codeHash: "0x" + "00".repeat(32) as ccc.Hex,
        hashType: "type" as const,
        args: "0x" + "00".repeat(20) as ccc.Hex
      },
      amount: BigInt(reward.amount)
    })),
    points_amount: ccc.numFrom(data.points)
  }],
  completion_deadline: BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: data.status,
  sub_tasks: data.subtasks,
  points: data.points,
  completion_count: data.completions,
  quest_id: ccc.numFrom(id),
  metadata: {
    title: ccc.hexFrom(ccc.bytesFrom(data.title, "utf8")),
    short_description: ccc.hexFrom(ccc.bytesFrom(data.description, "utf8")),
    long_description: ccc.hexFrom(ccc.bytesFrom(data.description, "utf8")),
    requirements: ccc.hexFrom(ccc.bytesFrom("Complete all subtasks", "utf8")),
    difficulty: ccc.numFrom(data.difficulty),
    time_estimate: ccc.numFrom(data.timeEstimate)
  },
  accepted_submission_lock_hashes: []
})

// Mock quest data
const QUEST_DATA: Record<number, QuestDataLike> = {
  1: createMockQuest(1, "0x0000000000000000000000000000000000000000000000000000000000000001", {
    title: "Raid the CKB Announcement",
    description: "Like, retweet, and comment on the latest CKB announcement on X to help spread awareness about CKB's latest developments and engage with the community.",
    points: 50,
    difficulty: 1,
    timeEstimate: 2,
    completions: 45,
    status: 1,
    rewardAmounts: [{ symbol: "CKB", amount: 10 }],
    subtasks: [
      createMockSubtask(1, "Follow @NervosNetwork on X", "social", "Follow the official Nervos Network account on X (Twitter)", "Screenshot of follow confirmation"),
      createMockSubtask(2, "Like the announcement post", "social", "Like the latest CKB announcement post", "Link to the liked post"),
      createMockSubtask(3, "Retweet with comment", "social", "Retweet with your own meaningful comment about CKB", "Link to your retweet"),
      createMockSubtask(4, "Tag 2 friends", "social", "Tag 2 friends who might be interested in blockchain", "Screenshot showing tagged friends")
    ]
  }),
  2: createMockQuest(2, "0x0000000000000000000000000000000000000000000000000000000000000001", {
    title: "Deploy Smart Contract",
    description: "Deploy your first smart contract on the CKB testnet and verify its functionality. This quest will help you understand the CKB development environment.",
    points: 300,
    difficulty: 3,
    timeEstimate: 45,
    completions: 12,
    status: 1,
    rewardAmounts: [
      { symbol: "CKB", amount: 100 },
      { symbol: "SPORE", amount: 50 }
    ],
    subtasks: [
      createMockSubtask(1, "Set up development environment", "technical", "Install and configure CKB development tools", "Screenshot of successful setup"),
      createMockSubtask(2, "Write smart contract code", "technical", "Create a simple smart contract using CKB Script", "Code repository link"),
      createMockSubtask(3, "Deploy to testnet", "onchain", "Deploy your contract to CKB testnet", "Transaction hash of deployment"),
      createMockSubtask(4, "Verify deployment", "onchain", "Confirm contract is working correctly", "Screenshot of successful verification")
    ]
  })
}

// Additional mock data for display
const QUEST_METADATA: Record<number, {
  createdBy: string
  createdAt: string
  category: string
  campaignTitle: string
  totalParticipants: number
  successRate: number
}> = {
  1: {
    createdBy: "Nervos Foundation",
    createdAt: "2024-01-15",
    category: "Social Media",
    campaignTitle: "CKB Ecosystem Growth Initiative",
    totalParticipants: 156,
    successRate: 93
  },
  2: {
    createdBy: "Nervos Foundation",
    createdAt: "2024-01-14",
    category: "Development",
    campaignTitle: "CKB Ecosystem Growth Initiative",
    totalParticipants: 156,
    successRate: 87
  }
}

export default function QuestDetail() {
  const params = useParams()
  const searchParams = useSearchParams()
  const campaignTypeHash = params.campaignTypeHash as string
  const questId = Number.parseInt(params.questId as string)
  const quest = QUEST_DATA[questId]
  const metadata = QUEST_METADATA[questId]
  const redirectUrl = searchParams.get("redirect") || "/"

  const [proofSubmissions, setProofSubmissions] = useState<
    Record<string, { type: string; value: string; file?: File }>
  >({})

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  // Check if current user owns this quest's campaign
  const isOwner = campaignTypeHash && CURRENT_USER.ownedCampaignTypeHashes.includes(campaignTypeHash)

  const [subtasks, setSubtasks] = useState<Array<{ completed: boolean }>>(() => 
    quest?.sub_tasks?.map(() => ({ completed: false })) || []
  )

  const handleProofChange = (subtaskId: ccc.NumLike, type: string, value: string, file?: File) => {
    setProofSubmissions((prev) => ({
      ...prev,
      [subtaskId.toString()]: { type, value, file },
    }))
  }

  const handleSubtaskComplete = (index: number) => {
    setSubtasks((prev) => {
      const newSubtasks = [...prev]
      newSubtasks[index] = { ...newSubtasks[index], completed: true }
      return newSubtasks
    })
  }

  const handleQuestSubmit = async () => {
    setIsSubmitting(true)
    // Mock submission delay
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsSubmitting(false)
    setIsSubmitted(true)
  }

  if (!quest || !metadata) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Quest Not Found</h1>
            <Button onClick={() => window.location.href = redirectUrl}>Back to Campaigns</Button>
          </div>
        </main>
      </div>
    )
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-100 text-green-800"
      case "Medium":
        return "bg-yellow-100 text-yellow-800"
      case "Hard":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Development":
        return "bg-blue-100 text-blue-800"
      case "Social Media":
        return "bg-pink-100 text-pink-800"
      case "Content Creation":
        return "bg-purple-100 text-purple-800"
      case "Community":
        return "bg-green-100 text-green-800"
      case "Testing":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getSubtaskTypeEmoji = (type: string) => {
    switch (type) {
      case "social":
        return "📱"
      case "technical":
        return "⚙️"
      case "onchain":
        return "⛓️"
      case "file":
        return "📄"
      case "screenshot":
        return "📸"
      case "link":
        return "🔗"
      case "text":
        return "✍️"
      default:
        return "📋"
    }
  }

  const completedSubtasks = subtasks.filter((s) => s.completed).length
  const subtaskProgress = quest.sub_tasks.length > 0 ? (completedSubtasks / quest.sub_tasks.length) * 100 : 0
  const allSubtasksCompleted = completedSubtasks === quest.sub_tasks.length

  // Extract display values from schema
  const questTitle = mol.String.decode(quest.metadata.title)
  const questDescription = mol.String.decode(quest.metadata.short_description)
  const questDifficulty = getDifficultyString(quest.metadata.difficulty)
  const questTimeEstimate = getTimeEstimateString(quest.metadata.time_estimate)
  const questIcon = getQuestIcon(questTitle)
  const questRewards = getQuestRewards(quest)

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-3xl font-bold mb-4">Quest Submitted Successfully!</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Your quest completion has been submitted for verification. You'll receive your rewards once
              verified.
            </p>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-lg mb-8">
              <p className="text-blue-800 dark:text-blue-200 font-medium">What happens next?</p>
              <p className="text-blue-700 dark:text-blue-300 text-sm mt-2">
                Our team will review your submission within 24-48 hours. You'll receive a notification once
                your rewards are distributed.
              </p>
            </div>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => window.location.href = redirectUrl}>Back to Campaigns</Button>
              <Button variant="outline" onClick={() => window.location.href = "/dashboard"}>
                Go to Dashboard
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Button variant="ghost" onClick={() => window.location.href = redirectUrl} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-5xl">{questIcon}</div>
                <div>
                  <h1 className="text-3xl font-bold">{questTitle}</h1>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="outline" className={getCategoryColor(metadata.category)}>
                      {metadata.category}
                    </Badge>
                    <Badge className={getDifficultyColor(questDifficulty)}>
                      {questDifficulty}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {questTimeEstimate}
                    </div>
                  </div>
                </div>
              </div>

              {/* Campaign Admin Controls */}
              {isOwner && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-amber-900">Campaign Admin</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-amber-700">You own this campaign</p>
                    <div className="flex gap-2">
                      <Link href={`/campaign/${campaignTypeHash}/quest/${questId}/edit`}>
                        <Button size="sm" variant="outline" className="bg-white">
                          <Edit className="w-4 h-4 mr-1" />
                          Edit Quest
                        </Button>
                      </Link>
                      <Link href={`/campaign-admin/quests`}>
                        <Button size="sm" variant="outline" className="bg-white">
                          <Settings className="w-4 h-4 mr-1" />
                          Manage
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Quest Info */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <p className="text-lg mb-6">{questDescription}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl mb-2">🏆</div>
                  <p className="text-sm text-muted-foreground">Points Reward</p>
                  <p className="text-2xl font-bold text-purple-600">{questRewards.points.toString()}</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl mb-2">💰</div>
                  <p className="text-sm text-muted-foreground">Token Rewards</p>
                  <div className="space-y-1">
                    {questRewards.tokens.map((token, i) => (
                      <p key={i} className="text-lg font-bold text-green-600">
                        {token.amount.toString()} {token.symbol}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl mb-2">📊</div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{metadata.successRate}%</p>
                  <p className="text-xs text-muted-foreground">
                    {quest.completion_count.toString()} / {metadata.totalParticipants} completed
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Overview */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Your Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {completedSubtasks} / {quest.sub_tasks.length} tasks completed
                    </span>
                  </div>
                  <Progress value={subtaskProgress} className="h-2" />
                </div>

                {allSubtasksCompleted && (
                  <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-green-800 dark:text-green-200 font-medium">
                      All subtasks completed! You can now submit this quest.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Subtasks */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Tasks to Complete</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {quest.sub_tasks.map((subtask, index) => {
                const subtaskTitle = mol.String.decode(subtask.title)
                const subtaskType = mol.String.decode(subtask.type)
                const subtaskDescription = mol.String.decode(subtask.description)
                const subtaskProofRequired = mol.String.decode(subtask.proof_required)
                const isCompleted = subtasks[index]?.completed || false

                return (
                  <div
                    key={subtask.id.toString()}
                    className={`border rounded-lg p-4 transition-all ${
                      isCompleted ? "bg-green-50 dark:bg-green-900/20 border-green-200" : ""
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">{getSubtaskTypeEmoji(subtaskType)}</div>
                          <div className="flex-1">
                            <h4 className="font-semibold flex items-center gap-2">
                              {subtaskTitle}
                              {isCompleted && (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              )}
                            </h4>
                            {!isCompleted && (
                              <Badge variant="outline" className="mt-1">
                                Pending
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{subtaskDescription}</p>
                        <div className="text-xs text-blue-600">
                          <span className="font-medium">Proof required:</span> {subtaskProofRequired}
                        </div>

                        {/* Proof Submission */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Submit Proof:</Label>
                          <div className="flex gap-2">
                            {/* Simple proof submission UI - in real app would handle different proof types */}
                            <Input
                              type="text"
                              placeholder="Enter proof (link, text, etc.)"
                              onChange={(e) => handleProofChange(subtask.id, "text", e.target.value)}
                              disabled={isCompleted}
                            />
                            <Button
                              onClick={() => handleSubtaskComplete(index)}
                              disabled={
                                isCompleted || !proofSubmissions[subtask.id.toString()]?.value
                              }
                              size="sm"
                            >
                              {isCompleted ? "Completed" : "Submit"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Submit Quest */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 dark:text-blue-200">Before submitting:</p>
                    <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 mt-1">
                      <li>Make sure all subtasks are marked as completed</li>
                      <li>Double-check that all proof submissions are accurate</li>
                      <li>Submissions cannot be edited after submission</li>
                    </ul>
                  </div>
                </div>

                <Button
                  onClick={handleQuestSubmit}
                  disabled={!allSubtasksCompleted || isSubmitting}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Submitting Quest...
                    </>
                  ) : (
                    <>
                      <Trophy className="w-5 h-5 mr-2" />
                      Submit Quest for Rewards
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quest Metadata */}
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>
              Quest created by {metadata.createdBy} • Part of {metadata.campaignTitle} • Created on{" "}
              {new Date(metadata.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}