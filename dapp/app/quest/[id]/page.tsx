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
  ExternalLink,
  Users,
  Trophy,
  CheckCircle,
  AlertCircle,
  Upload,
  Camera,
  LinkIcon,
  Edit,
  Settings,
} from "lucide-react"
import Link from "next/link"

// Mock current user - in real app, this would come from authentication
const CURRENT_USER = {
  id: 1,
  ownedCampaigns: [1, 2] // Campaign IDs owned by current user
}

// Type definitions
interface TokenReward {
  symbol: string
  amount: number
}

interface Subtask {
  id: number
  title: string
  type: string
  completed: boolean
  description: string
  proofRequired: string
  proofTypes: string[]
}

interface Quest {
  id: number
  title: string
  description: string
  points: number
  difficulty: string
  timeEstimate: string
  icon: string
  status: string
  createdBy: string
  createdAt: string
  category: string
  campaignId: number
  campaignTitle: string
  completions: number
  totalParticipants: number
  successRate: number
  rewards: {
    points: number
    tokens: TokenReward[]
  }
  subtasks: Subtask[]
}

// Mock quest data - in real app, this would come from API
const QUEST_DATA: Record<number, Quest> = {
  1: {
    id: 1,
    title: "Raid the CKB Announcement",
    description:
      "Like, retweet, and comment on the latest CKB announcement on X to help spread awareness about CKB's latest developments and engage with the community.",
    points: 50,
    difficulty: "Easy",
    timeEstimate: "2 mins",
    icon: "📢",
    status: "available",
    createdBy: "Nervos Foundation",
    createdAt: "2024-01-15",
    category: "Social Media",
    campaignId: 1,
    campaignTitle: "CKB Ecosystem Growth Initiative",
    completions: 45,
    totalParticipants: 156,
    successRate: 93,
    rewards: {
      points: 50,
      tokens: [{ symbol: "CKB", amount: 10 }],
    },
    subtasks: [
      {
        id: 1,
        title: "Follow @NervosNetwork on X",
        type: "social",
        completed: false,
        description: "Follow the official Nervos Network account on X (Twitter)",
        proofRequired: "Screenshot of follow confirmation",
        proofTypes: ["screenshot"],
      },
      {
        id: 2,
        title: "Like the announcement post",
        type: "social",
        completed: false,
        description: "Like the latest CKB announcement post",
        proofRequired: "Link to the liked post",
        proofTypes: ["link"],
      },
      {
        id: 3,
        title: "Retweet with comment",
        type: "social",
        completed: false,
        description: "Retweet with your own meaningful comment about CKB",
        proofRequired: "Link to your retweet",
        proofTypes: ["link"],
      },
      {
        id: 4,
        title: "Tag 2 friends",
        type: "social",
        completed: false,
        description: "Tag 2 friends who might be interested in blockchain",
        proofRequired: "Screenshot showing tagged friends",
        proofTypes: ["screenshot"],
      },
    ],
  },
  2: {
    id: 2,
    title: "Deploy Smart Contract",
    description:
      "Deploy your first smart contract on the CKB testnet and verify its functionality. This quest will help you understand the CKB development environment.",
    points: 300,
    difficulty: "Hard",
    timeEstimate: "45 mins",
    icon: "🚀",
    status: "available",
    createdBy: "Nervos Foundation",
    createdAt: "2024-01-14",
    category: "Development",
    campaignId: 1,
    campaignTitle: "CKB Ecosystem Growth Initiative",
    completions: 12,
    totalParticipants: 156,
    successRate: 87,
    rewards: {
      points: 300,
      tokens: [
        { symbol: "CKB", amount: 100 },
        { symbol: "SPORE", amount: 50 },
      ],
    },
    subtasks: [
      {
        id: 1,
        title: "Set up development environment",
        type: "technical",
        completed: false,
        description: "Install and configure CKB development tools",
        proofRequired: "Screenshot of successful setup",
        proofTypes: ["screenshot"],
      },
      {
        id: 2,
        title: "Write smart contract code",
        type: "technical",
        completed: false,
        description: "Create a simple smart contract using CKB Script",
        proofRequired: "Code repository link",
        proofTypes: ["link", "file"],
      },
      {
        id: 3,
        title: "Deploy to testnet",
        type: "onchain",
        completed: false,
        description: "Deploy your contract to CKB testnet",
        proofRequired: "Transaction hash of deployment",
        proofTypes: ["text"],
      },
      {
        id: 4,
        title: "Verify deployment",
        type: "onchain",
        completed: false,
        description: "Confirm contract is working correctly",
        proofRequired: "Screenshot of successful verification",
        proofTypes: ["screenshot", "link"],
      },
    ],
  },
}

export default function QuestDetail() {
  const params = useParams()
  const searchParams = useSearchParams()
  const questId = Number.parseInt(params.id as string)
  const campaignId = searchParams.get("campaign")
  const quest = QUEST_DATA[questId]
  
  // Check if current user owns this quest's campaign
  const isOwner = quest ? CURRENT_USER.ownedCampaigns.includes(quest.campaignId) : false

  const [subtasks, setSubtasks] = useState(quest?.subtasks || [])
  const [proofs, setProofs] = useState<Record<number, { type: string; content: string; file?: File }>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  if (!quest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❓</div>
            <h1 className="text-2xl font-bold mb-2">Quest Not Found</h1>
            <p className="text-muted-foreground mb-4">The quest you're looking for doesn't exist.</p>
            <Link href={campaignId ? `/campaign/${campaignId}` : "/"}>
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to {campaignId ? "Campaign" : "Campaigns"}
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const handleSubtaskComplete = (subtaskId: number) => {
    setSubtasks((prev: Subtask[]) =>
      prev.map((subtask: Subtask) => (subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask)),
    )
  }

  const handleProofChange = (subtaskId: number, type: string, content: string, file?: File) => {
    setProofs((prev) => ({
      ...prev,
      [subtaskId]: { type, content, file },
    }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsSubmitted(true)
    setIsSubmitting(false)

    setTimeout(() => {
      setIsSubmitted(false)
    }, 3000)
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

  const getSubtaskTypeIcon = (type: string) => {
    switch (type) {
      case "social":
        return "📱"
      case "technical":
        return "💻"
      case "onchain":
        return "⛓️"
      case "content":
        return "📝"
      case "research":
        return "🔍"
      default:
        return "📋"
    }
  }

  const getProofTypeIcon = (type: string) => {
    switch (type) {
      case "screenshot":
        return <Camera className="w-4 h-4" />
      case "link":
        return <LinkIcon className="w-4 h-4" />
      case "file":
        return <Upload className="w-4 h-4" />
      case "text":
        return <ExternalLink className="w-4 h-4" />
      default:
        return <Upload className="w-4 h-4" />
    }
  }

  const completedSubtasks = subtasks.filter((s: Subtask) => s.completed).length
  const subtaskProgress = (completedSubtasks / subtasks.length) * 100
  const allSubtasksCompleted = completedSubtasks === subtasks.length

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Link href={campaignId ? `/campaign/${campaignId}` : "/"}>
              <Button variant="ghost" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to {campaignId ? "Campaign" : "Campaigns"}
              </Button>
            </Link>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quest Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">{quest.icon}</div>
                      <div>
                        <h1 className="text-3xl font-bold mb-2">{quest.title}</h1>
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="outline" className={getDifficultyColor(quest.difficulty)}>
                            {quest.difficulty}
                          </Badge>
                          <Badge variant="outline">{quest.category}</Badge>
                          {quest.campaignTitle && (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800">
                              {quest.campaignTitle}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {quest.timeEstimate}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {quest.completions} completed
                          </div>
                          <div className="flex items-center gap-1">
                            <Trophy className="w-4 h-4" />
                            {quest.successRate}% success rate
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-yellow-600 font-bold text-2xl mb-2">
                        <Star className="w-6 h-6 fill-current" />
                        {quest.rewards.points}
                      </div>
                      <div className="space-y-1">
                        {quest.rewards.tokens.map((token: TokenReward, index: number) => (
                          <div key={index} className="flex items-center gap-1 text-green-600 font-semibold text-sm">
                            <Trophy className="w-3 h-3" />
                            {token.amount} {token.symbol}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-lg text-muted-foreground leading-relaxed">{quest.description}</p>
                </CardContent>
              </Card>

              {/* Campaign Admin Controls */}
              {isOwner && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-800">
                      <Settings className="w-5 h-5" />
                      Campaign Admin Controls
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Link href={`/quest/${questId}/edit`}>
                        <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800">
                          <Edit className="w-4 h-4 mr-1" />
                          Edit Quest
                        </Button>
                      </Link>
                      <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800">
                        <Users className="w-4 h-4 mr-1" />
                        View Submissions ({quest.completions})
                      </Button>
                      <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800">
                        <Trophy className="w-4 h-4 mr-1" />
                        Manage Rewards
                      </Button>
                      <Link href="/admin">
                        <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800">
                          <Settings className="w-4 h-4 mr-1" />
                          Admin Dashboard
                        </Button>
                      </Link>
                    </div>
                    <p className="text-sm text-amber-700 mt-2">
                      As the campaign owner, you can edit this quest, review submissions, and manage rewards.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Quest Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Your Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {completedSubtasks}/{subtasks.length} subtasks completed
                    </span>
                    <span className="font-medium">{subtaskProgress.toFixed(0)}%</span>
                  </div>
                  <Progress value={subtaskProgress} className="h-3" />
                </CardContent>
              </Card>

              {/* Subtasks */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Quest Subtasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subtasks.map((subtask: Subtask) => (
                    <div
                      key={subtask.id}
                      className={`p-4 rounded-lg border ${
                        subtask.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-xl">{getSubtaskTypeIcon(subtask.type)}</div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{subtask.title}</h4>
                            {subtask.completed && (
                              <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
                                ✓ Completed
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{subtask.description}</p>
                          <div className="text-xs text-blue-600">
                            <span className="font-medium">Proof required:</span> {subtask.proofRequired}
                          </div>

                          {/* Proof Submission */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Submit Proof:</Label>
                            <div className="flex gap-2">
                              {subtask.proofTypes.map((proofType: string) => (
                                <div key={proofType} className="flex-1">
                                  {proofType === "screenshot" || proofType === "file" ? (
                                    <div className="space-y-2">
                                      <Input
                                        type="file"
                                        accept={proofType === "screenshot" ? "image/*" : "*/*"}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0]
                                          if (file) {
                                            handleProofChange(subtask.id, proofType, file.name, file)
                                          }
                                        }}
                                        className="text-xs"
                                      />
                                    </div>
                                  ) : proofType === "link" ? (
                                    <Input
                                      type="url"
                                      placeholder="https://..."
                                      value={proofs[subtask.id]?.content || ""}
                                      onChange={(e) => handleProofChange(subtask.id, proofType, e.target.value)}
                                      className="text-sm"
                                    />
                                  ) : (
                                    <Input
                                      type="text"
                                      placeholder="Enter proof text..."
                                      value={proofs[subtask.id]?.content || ""}
                                      onChange={(e) => handleProofChange(subtask.id, proofType, e.target.value)}
                                      className="text-sm"
                                    />
                                  )}
                                </div>
                              ))}
                              <Button
                                size="sm"
                                variant={subtask.completed ? "outline" : "default"}
                                onClick={() => handleSubtaskComplete(subtask.id)}
                                disabled={!proofs[subtask.id]?.content}
                              >
                                {subtask.completed ? "✓" : "Mark Complete"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Submit Quest */}
              <Card>
                <CardContent className="p-6">
                  {!isSubmitted ? (
                    <div className="text-center space-y-4">
                      <div className="text-lg font-semibold">
                        {allSubtasksCompleted ? "Ready to Submit!" : "Complete all subtasks to submit"}
                      </div>
                      <Button
                        onClick={handleSubmit}
                        disabled={!allSubtasksCompleted || isSubmitting}
                        size="lg"
                        className="w-full"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Submitting Quest...
                          </>
                        ) : (
                          <>
                            <Trophy className="w-4 h-4 mr-2" />
                            Submit Quest for Review
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="text-4xl mb-3">🎉</div>
                      <h3 className="font-semibold mb-2">Quest Submitted!</h3>
                      <p className="text-sm text-muted-foreground">
                        Your submission is being reviewed. You'll earn {quest.rewards.points} points once approved.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quest Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Quest Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created by</span>
                    <span className="font-medium">{quest.createdBy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created on</span>
                    <span className="font-medium">{quest.createdAt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completions</span>
                    <span className="font-medium">{quest.completions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className="font-medium text-green-600">{quest.successRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Participants</span>
                    <span className="font-medium">{quest.totalParticipants}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Completions */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Completions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { user: "CKBMaster", time: "2h ago" },
                      { user: "BlockchainDev", time: "4h ago" },
                      { user: "CryptoNinja", time: "6h ago" },
                    ].map((completion, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-gradient-to-br from-green-200 to-blue-200 text-sm">
                            {completion.user.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{completion.user}</div>
                          <div className="text-xs text-muted-foreground">{completion.time}</div>
                        </div>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
