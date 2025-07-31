"use client"

import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import {
  Trophy,
  Target,
  Users,
  Coins,
  TrendingUp,
  Calendar,
  CheckCircle,
  Star,
  Shield,
  Settings,
  UserCog,
  FileText,
} from "lucide-react"

const MOCK_USER_DATA = {
  displayName: "CKBMaster",
  pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqds6ed78yze6eyfyvd537z66ur620n96rtsfrf67g",
  verified: false,
  role: "admin", // Change to "user" to see regular user view
  totalPoints: 2450,
  currentRank: 1,
  questsCompleted: 18,
  questsInProgress: 3,
  campaignsJoined: 4,
  tokensEarned: {
    CKB: 850,
    SPORE: 420,
    DEFI: 180,
  },
  recentActivity: [
    { type: "quest_completed", title: "Deploy Smart Contract", points: 200, timestamp: "2024-02-28T10:30:00Z" },
    { type: "quest_started", title: "CKB Ecosystem Tutorial", points: 0, timestamp: "2024-02-27T15:45:00Z" },
    { type: "campaign_joined", title: "DeFi Education Campaign", points: 0, timestamp: "2024-02-26T09:20:00Z" },
    { type: "quest_completed", title: "Write Technical Blog Post", points: 150, timestamp: "2024-02-25T14:10:00Z" },
  ],
  activeQuests: [
    { id: 1, title: "CKB Ecosystem Tutorial", progress: 75, totalSteps: 4, currentStep: 3, points: 300 },
    { id: 2, title: "Community Engagement Challenge", progress: 40, totalSteps: 5, currentStep: 2, points: 250 },
    { id: 3, title: "DeFi Protocol Analysis", progress: 20, totalSteps: 3, currentStep: 1, points: 400 },
  ],
  upcomingDeadlines: [
    { questId: 1, title: "CKB Ecosystem Tutorial", deadline: "2024-03-05", daysLeft: 5 },
    { questId: 2, title: "Community Engagement Challenge", deadline: "2024-03-10", daysLeft: 10 },
  ],
}

export default function Dashboard() {
  const user = MOCK_USER_DATA
  const isAdmin = user.role === "admin"

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "quest_completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "quest_started":
        return <Target className="w-4 h-4 text-blue-600" />
      case "campaign_joined":
        return <Users className="w-4 h-4 text-purple-600" />
      default:
        return <Star className="w-4 h-4 text-gray-600" />
    }
  }

  const formatActivityText = (activity: any) => {
    switch (activity.type) {
      case "quest_completed":
        return `Completed "${activity.title}" (+${activity.points} points)`
      case "quest_started":
        return `Started "${activity.title}"`
      case "campaign_joined":
        return `Joined "${activity.title}"`
      default:
        return activity.title
    }
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
                  <div className="text-4xl">🎯</div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Welcome back, {user.displayName}!
                  </h1>
                </div>
                <p className="text-lg text-muted-foreground">Track your progress and manage your quest journey</p>
              </div>

              {/* Verification Status */}
              {!user.verified && (
                <Link href="/verify">
                  <Button className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white">
                    <Shield className="w-4 h-4" />
                    Verify Identity
                  </Button>
                </Link>
              )}
            </div>

            {/* Admin Quick Access */}
            {isAdmin && (
              <Card className="mb-6 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 dark:from-orange-900/20 dark:to-red-900/20 dark:border-orange-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                    <Settings className="w-5 h-5" />
                    Admin Quick Access
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Link href="/campaign-admin">
                      <Button variant="outline" className="w-full justify-start bg-transparent">
                        <UserCog className="w-4 h-4 mr-2" />
                        Admin Dashboard
                      </Button>
                    </Link>
                    <Link href="/campaign-admin/users">
                      <Button variant="outline" className="w-full justify-start bg-transparent">
                        <Users className="w-4 h-4 mr-2" />
                        User Management
                      </Button>
                    </Link>
                    <Link href="/campaign-admin/quests">
                      <Button variant="outline" className="w-full justify-start bg-transparent">
                        <Target className="w-4 h-4 mr-2" />
                        Quest Management
                      </Button>
                    </Link>
                    <Link href="/campaign-admin/tips">
                      <Button variant="outline" className="w-full justify-start bg-transparent">
                        <FileText className="w-4 h-4 mr-2" />
                        Tip Management
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Points</CardTitle>
                <Trophy className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{user.totalPoints.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Rank #{user.currentRank} globally</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Quests Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{user.questsCompleted}</div>
                <p className="text-xs text-muted-foreground">{user.questsInProgress} in progress</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
                <Users className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{user.campaignsJoined}</div>
                <p className="text-xs text-muted-foreground">Active campaigns</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tokens Earned</CardTitle>
                <Coins className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Object.values(user.tokensEarned).reduce((a, b) => a + b, 0)}</div>
                <p className="text-xs text-muted-foreground">Across {Object.keys(user.tokensEarned).length} tokens</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Active Quests */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-600" />
                    Active Quests ({user.activeQuests.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {user.activeQuests.map((quest) => (
                    <div key={quest.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{quest.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>
                              Step {quest.currentStep} of {quest.totalSteps}
                            </span>
                            <Badge variant="outline">{quest.points} points</Badge>
                          </div>
                        </div>
                        <Link href={`/quest/${quest.id}`}>
                          <Button size="sm">Continue</Button>
                        </Link>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progress</span>
                          <span>{quest.progress}%</span>
                        </div>
                        <Progress value={quest.progress} className="h-2" />
                      </div>
                    </div>
                  ))}

                  {user.activeQuests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No active quests</p>
                      <Link href="/">
                        <Button className="mt-4">Browse Campaigns</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Token Balances */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-green-600" />
                    Token Balances
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(user.tokensEarned).map(([symbol, amount]) => (
                    <div key={symbol} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                          {symbol.slice(0, 2)}
                        </div>
                        <span className="font-medium">{symbol}</span>
                      </div>
                      <span className="font-bold">{amount}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Upcoming Deadlines */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-orange-600" />
                    Upcoming Deadlines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user.upcomingDeadlines.map((deadline) => (
                    <div
                      key={deadline.questId}
                      className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-sm">{deadline.title}</div>
                        <div className="text-xs text-muted-foreground">
                          Due {new Date(deadline.deadline).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant={deadline.daysLeft <= 3 ? "destructive" : "secondary"}>
                        {deadline.daysLeft}d left
                      </Badge>
                    </div>
                  ))}

                  {user.upcomingDeadlines.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">No upcoming deadlines</div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3">
                      {getActivityIcon(activity.type)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{formatActivityText(activity)}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
