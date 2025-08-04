"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Filter,
  Plus,
  ChevronDown,
  ChevronRight,
  Target,
  Users,
  Coins,
  Calendar,
  Settings,
  Eye,
  Edit,
  Trash2,
} from "lucide-react"
import Link from "next/link"

const CAMPAIGNS_WITH_QUESTS = [
  {
    typeHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
    title: "CKB Ecosystem Growth Initiative",
    sponsor: "Nervos Foundation",
    status: "active",
    totalQuests: 4,
    activeQuests: 3,
    completedQuests: 12,
    totalFunding: { CKB: 500, SPORE: 200 },
    participants: 23,
    startDate: "2024-01-15",
    endDate: "2024-03-15",
    quests: [
      {
        id: 1,
        title: "Create CKB Tutorial Video",
        description: "Create an educational video about CKB basics",
        status: "active",
        difficulty: "Medium",
        participants: 8,
        completions: 3,
        rewards: { points: 200, tokens: [{ symbol: "CKB", amount: 100 }] },
        funding: { required: 800, current: 800 },
        deadline: "2024-03-15",
        subtasks: 3,
      },
      {
        id: 2,
        title: "Social Media Engagement",
        description: "Promote CKB on social media platforms",
        status: "active",
        difficulty: "Easy",
        participants: 12,
        completions: 7,
        rewards: { points: 100, tokens: [{ symbol: "CKB", amount: 50 }] },
        funding: { required: 600, current: 600 },
        deadline: "2024-03-10",
        subtasks: 2,
      },
      {
        id: 3,
        title: "Developer Workshop Attendance",
        description: "Attend and complete developer workshop",
        status: "draft",
        difficulty: "Hard",
        participants: 0,
        completions: 0,
        rewards: { points: 300, tokens: [{ symbol: "CKB", amount: 150 }] },
        funding: { required: 1200, current: 800 },
        deadline: "2024-03-20",
        subtasks: 4,
      },
      {
        id: 4,
        title: "Community Forum Participation",
        description: "Active participation in community discussions",
        status: "completed",
        difficulty: "Easy",
        participants: 15,
        completions: 15,
        rewards: { points: 75, tokens: [{ symbol: "CKB", amount: 25 }] },
        funding: { required: 375, current: 375 },
        deadline: "2024-02-28",
        subtasks: 1,
      },
    ],
  },
  {
    typeHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
    title: "DeFi Education Campaign",
    sponsor: "CKB DeFi Alliance",
    status: "active",
    totalQuests: 3,
    activeQuests: 2,
    completedQuests: 8,
    totalFunding: { CKB: 300, DEFI: 100 },
    participants: 15,
    startDate: "2024-01-20",
    endDate: "2024-04-20",
    quests: [
      {
        id: 5,
        title: "DeFi Protocol Analysis",
        description: "Research and analyze DeFi protocols on CKB",
        status: "active",
        difficulty: "Hard",
        participants: 5,
        completions: 2,
        rewards: {
          points: 250,
          tokens: [
            { symbol: "CKB", amount: 120 },
            { symbol: "DEFI", amount: 50 },
          ],
        },
        funding: { required: 850, current: 850 },
        deadline: "2024-04-15",
        subtasks: 5,
      },
      {
        id: 6,
        title: "DeFi Tutorial Creation",
        description: "Create beginner-friendly DeFi tutorials",
        status: "active",
        difficulty: "Medium",
        participants: 8,
        completions: 4,
        rewards: {
          points: 180,
          tokens: [
            { symbol: "CKB", amount: 80 },
            { symbol: "DEFI", amount: 30 },
          ],
        },
        funding: { required: 640, current: 640 },
        deadline: "2024-04-10",
        subtasks: 3,
      },
      {
        id: 7,
        title: "DeFi Community Q&A",
        description: "Host Q&A sessions about DeFi on CKB",
        status: "paused",
        difficulty: "Medium",
        participants: 3,
        completions: 0,
        rewards: {
          points: 150,
          tokens: [
            { symbol: "CKB", amount: 60 },
            { symbol: "DEFI", amount: 25 },
          ],
        },
        funding: { required: 450, current: 200 },
        deadline: "2024-04-05",
        subtasks: 2,
      },
    ],
  },
  {
    typeHash: "0x0000000000000000000000000000000000000000000000000000000000000003",
    title: "Community Builder Program",
    sponsor: "CKB Community DAO",
    status: "active",
    totalQuests: 5,
    activeQuests: 4,
    completedQuests: 18,
    totalFunding: { CKB: 600, COMM: 400 },
    participants: 31,
    startDate: "2024-02-01",
    endDate: "2024-05-01",
    quests: [
      {
        id: 8,
        title: "Community Engagement Challenge",
        description: "Engage with community members and newcomers",
        status: "active",
        difficulty: "Easy",
        participants: 18,
        completions: 12,
        rewards: {
          points: 120,
          tokens: [
            { symbol: "CKB", amount: 60 },
            { symbol: "COMM", amount: 80 },
          ],
        },
        funding: { required: 1680, current: 1680 },
        deadline: "2024-04-30",
        subtasks: 2,
      },
      {
        id: 9,
        title: "Event Organization",
        description: "Organize community events and meetups",
        status: "active",
        difficulty: "Hard",
        participants: 4,
        completions: 1,
        rewards: {
          points: 400,
          tokens: [
            { symbol: "CKB", amount: 200 },
            { symbol: "COMM", amount: 150 },
          ],
        },
        funding: { required: 1400, current: 1000 },
        deadline: "2024-04-25",
        subtasks: 6,
      },
      {
        id: 10,
        title: "Content Moderation",
        description: "Help moderate community channels and forums",
        status: "active",
        difficulty: "Medium",
        participants: 6,
        completions: 3,
        rewards: {
          points: 180,
          tokens: [
            { symbol: "CKB", amount: 90 },
            { symbol: "COMM", amount: 70 },
          ],
        },
        funding: { required: 960, current: 960 },
        deadline: "2024-04-20",
        subtasks: 3,
      },
      {
        id: 11,
        title: "Newcomer Mentoring",
        description: "Mentor new community members",
        status: "active",
        difficulty: "Medium",
        participants: 8,
        completions: 5,
        rewards: {
          points: 200,
          tokens: [
            { symbol: "CKB", amount: 100 },
            { symbol: "COMM", amount: 80 },
          ],
        },
        funding: { required: 1440, current: 1440 },
        deadline: "2024-04-28",
        subtasks: 4,
      },
      {
        id: 12,
        title: "Community Guidelines Update",
        description: "Help update and improve community guidelines",
        status: "completed",
        difficulty: "Medium",
        participants: 5,
        completions: 5,
        rewards: {
          points: 150,
          tokens: [
            { symbol: "CKB", amount: 75 },
            { symbol: "COMM", amount: 60 },
          ],
        },
        funding: { required: 675, current: 675 },
        deadline: "2024-03-15",
        subtasks: 3,
      },
    ],
  },
]

export default function AdminQuestManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [expandedCampaigns, setExpandedCampaigns] = useState<string[]>(["0x0000000000000000000000000000000000000000000000000000000000000001"])

  const toggleCampaign = (campaignTypeHash: string) => {
    setExpandedCampaigns((prev) =>
      prev.includes(campaignTypeHash) ? prev.filter((hash) => hash !== campaignTypeHash) : [...prev, campaignTypeHash],
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "draft":
        return "bg-gray-100 text-gray-800"
      case "paused":
        return "bg-yellow-100 text-yellow-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
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

  const getFundingStatus = (required: number, current: number) => {
    const percentage = (current / required) * 100
    if (percentage >= 100) return { status: "Fully Funded", color: "text-green-600" }
    if (percentage >= 75) return { status: "Well Funded", color: "text-blue-600" }
    if (percentage >= 50) return { status: "Partially Funded", color: "text-yellow-600" }
    return { status: "Needs Funding", color: "text-red-600" }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">⚙️</div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                    Quest Management
                  </h1>
                </div>
                <p className="text-lg text-muted-foreground">
                  Manage quests organized by campaigns, track funding, and monitor progress
                </p>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mb-8 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search campaigns and quests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white dark:bg-gray-800"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Campaign-Based Quest Management */}
          <div className="space-y-6">
            {CAMPAIGNS_WITH_QUESTS.map((campaign) => (
              <Card key={campaign.typeHash} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleCampaign(campaign.typeHash)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {expandedCampaigns.includes(campaign.typeHash) ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                        <div className="text-2xl">🎯</div>
                      </div>
                      <div>
                        <CardTitle className="text-xl">{campaign.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Sponsored by {campaign.sponsor} • {campaign.totalQuests} quests • {campaign.participants}{" "}
                          participants
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <div className="font-medium">{campaign.activeQuests} Active</div>
                        <div className="text-muted-foreground">{campaign.completedQuests} Completions</div>
                      </div>
                      <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                      <Link href={`/campaign/${campaign.typeHash}/create-quest`}>
                        <Button size="sm" className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          Add Quest
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>

                {expandedCampaigns.includes(campaign.typeHash) && (
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {/* Campaign Summary */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-blue-600" />
                          <div>
                            <div className="text-sm font-medium">Total Quests</div>
                            <div className="text-lg font-bold">{campaign.totalQuests}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-green-600" />
                          <div>
                            <div className="text-sm font-medium">Participants</div>
                            <div className="text-lg font-bold">{campaign.participants}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-600" />
                          <div>
                            <div className="text-sm font-medium">Total Funding</div>
                            <div className="text-sm font-bold">
                              {Object.entries(campaign.totalFunding).map(([symbol, amount]) => (
                                <div key={symbol}>
                                  {amount} {symbol}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-purple-600" />
                          <div>
                            <div className="text-sm font-medium">Duration</div>
                            <div className="text-sm font-bold">
                              {new Date(campaign.startDate).toLocaleDateString()} -{" "}
                              {new Date(campaign.endDate).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quests List */}
                      <div className="space-y-3">
                        {campaign.quests.map((quest) => {
                          const fundingStatus = getFundingStatus(quest.funding.required, quest.funding.current)

                          return (
                            <div key={quest.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h4 className="font-semibold text-lg">{quest.title}</h4>
                                    <Badge className={getStatusColor(quest.status)}>{quest.status}</Badge>
                                    <Badge variant="outline" className={getDifficultyColor(quest.difficulty)}>
                                      {quest.difficulty}
                                    </Badge>
                                  </div>
                                  <p className="text-muted-foreground mb-2">{quest.description}</p>
                                  <div className="flex items-center gap-6 text-sm">
                                    <div className="flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      <span>{quest.participants} participants</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Target className="w-4 h-4" />
                                      <span>{quest.completions} completions</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Settings className="w-4 h-4" />
                                      <span>{quest.subtasks} subtasks</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Calendar className="w-4 h-4" />
                                      <span>Due: {new Date(quest.deadline).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Link href={`/campaign/${campaign.typeHash}/quest/${quest.id}`}>
                                    <Button variant="outline" size="sm">
                                      <Eye className="w-4 h-4 mr-1" />
                                      View
                                    </Button>
                                  </Link>
                                  <Link href={`/admin/quests/${quest.id}/edit`}>
                                    <Button variant="outline" size="sm">
                                      <Edit className="w-4 h-4 mr-1" />
                                      Edit
                                    </Button>
                                  </Link>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 bg-transparent"
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t">
                                <div>
                                  <div className="text-sm font-medium mb-1">Rewards</div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-yellow-600 font-medium">{quest.rewards.points} points</span>
                                    {quest.rewards.tokens.map((token, index) => (
                                      <span key={index} className="text-green-600 font-medium">
                                        {token.amount} {token.symbol}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-sm font-medium mb-1">Funding Status</div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${fundingStatus.color}`}>
                                      {fundingStatus.status}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      ({quest.funding.current}/{quest.funding.required} tokens)
                                    </span>
                                    {quest.funding.current < quest.funding.required && (
                                      <Link href={`/admin/quests/${quest.id}/fund`}>
                                        <Button size="sm" variant="outline" className="ml-2 bg-transparent">
                                          Fund Quest
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
