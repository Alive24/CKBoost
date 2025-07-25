"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy, Medal, Award, Crown, Star, Clock, Gift, Info } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const LEADERBOARD_DATA = [
  {
    rank: 1,
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqds6ed78yze6eyfyvd537z66ur620n96rtsfrf67g",
    displayName: "CKBMaster",
    points: 2450,
    questsCompleted: 18,
    tokensEarned: { CKB: 850, SPORE: 420, DEFI: 180 },
    badge: "Legend",
    streak: 12,
    joinDate: "2023-10-15",
  },
  {
    rank: 2,
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvglkprurm00l7hrs3rfqmmzyy3ll7djdsujdm6",
    displayName: "BlockchainBee",
    points: 2180,
    questsCompleted: 15,
    tokensEarned: { CKB: 720, SPORE: 380, DEFI: 150 },
    badge: "Expert",
    streak: 8,
    joinDate: "2023-11-02",
  },
  {
    rank: 3,
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0pvz74lmr3u3qmg83ppm9f0wdk358fzel4a8x",
    displayName: "QuestHunter",
    points: 1950,
    questsCompleted: 14,
    tokensEarned: { CKB: 650, SPORE: 320, DEFI: 120 },
    badge: "Expert",
    streak: 6,
    joinDate: "2023-11-20",
  },
  {
    rank: 4,
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq289vl7splj5lz7lq2hc0z0kw97mp9a0jtlq4vwy",
    displayName: "CryptoNinja",
    points: 1720,
    questsCompleted: 12,
    tokensEarned: { CKB: 580, SPORE: 280, DEFI: 100 },
    badge: "Advanced",
    streak: 4,
    joinDate: "2023-12-01",
  },
  {
    rank: 5,
    address: "ckb1qyqi1j1mrqrqrqrqrqrqrqrqrqrqrqrqrqrqrqrqrqr",
    displayName: "TokenCollector",
    points: 1580,
    questsCompleted: 11,
    tokensEarned: { CKB: 520, SPORE: 250, DEFI: 85 },
    badge: "Advanced",
    streak: 3,
    joinDate: "2023-12-10",
  },
  {
    rank: 6,
    address: "ckb1qyqj2k2nsrsrsrsrsrsrsrsrsrsrsrsrsrsrsrsrsrsr",
    displayName: "DeFiExplorer",
    points: 1420,
    questsCompleted: 10,
    tokensEarned: { CKB: 480, SPORE: 220, DEFI: 70 },
    badge: "Intermediate",
    streak: 2,
    joinDate: "2023-12-15",
  },
  {
    rank: 7,
    address: "ckb1qyqk3l3oststststststststststststststststst",
    displayName: "NFTCreator",
    points: 1280,
    questsCompleted: 9,
    tokensEarned: { CKB: 420, SPORE: 190, DEFI: 55 },
    badge: "Intermediate",
    streak: 1,
    joinDate: "2024-01-05",
  },
  {
    rank: 8,
    address: "ckb1qyql4m4ptututututututututututututututututut",
    displayName: "CommunityBuilder",
    points: 1150,
    questsCompleted: 8,
    tokensEarned: { CKB: 380, SPORE: 160, DEFI: 40 },
    badge: "Intermediate",
    streak: 0,
    joinDate: "2024-01-12",
  },
  {
    rank: 9,
    address: "ckb1qyqm5n5quvuvuvuvuvuvuvuvuvuvuvuvuvuvuvuvuvuv",
    displayName: "TechEnthusiast",
    points: 1020,
    questsCompleted: 7,
    tokensEarned: { CKB: 340, SPORE: 130, DEFI: 25 },
    badge: "Beginner",
    streak: 0,
    joinDate: "2024-01-20",
  },
  {
    rank: 10,
    address: "ckb1qyqn6o6rvwvwvwvwvwvwvwvwvwvwvwvwvwvwvwvwvwvw",
    displayName: "NewcomerAce",
    points: 890,
    questsCompleted: 6,
    tokensEarned: { CKB: 300, SPORE: 100, DEFI: 15 },
    badge: "Beginner",
    streak: 0,
    joinDate: "2024-02-01",
  },
]

const UPCOMING_REWARDS = [
  {
    period: "March 2024",
    endDate: "2024-03-31",
    totalPool: {
      CKB: 10000,
      SPORE: 5000,
      DEFI: 2000,
    },
    positions: [
      { rank: "1st", rewards: { CKB: 3000, SPORE: 1500, DEFI: 600 } },
      { rank: "2nd", rewards: { CKB: 2000, SPORE: 1000, DEFI: 400 } },
      { rank: "3rd", rewards: { CKB: 1500, SPORE: 750, DEFI: 300 } },
      { rank: "4th-10th", rewards: { CKB: 500, SPORE: 250, DEFI: 100 } },
      { rank: "11th-50th", rewards: { CKB: 100, SPORE: 50, DEFI: 20 } },
    ],
    daysLeft: 28,
  },
  {
    period: "Q1 2024 Grand Prize",
    endDate: "2024-03-31",
    totalPool: {
      CKB: 25000,
      SPORE: 12000,
      DEFI: 5000,
    },
    positions: [
      { rank: "1st", rewards: { CKB: 10000, SPORE: 5000, DEFI: 2000 } },
      { rank: "2nd", rewards: { CKB: 7500, SPORE: 3500, DEFI: 1500 } },
      { rank: "3rd", rewards: { CKB: 5000, SPORE: 2500, DEFI: 1000 } },
      { rank: "Top 10", rewards: { CKB: 250, SPORE: 100, DEFI: 50 } },
    ],
    daysLeft: 28,
    special: true,
  },
]

export default function Leaderboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("all")
  const [currentUser] = useState({
    address: "ckb1qyq...7x8n",
    rank: 18,
    points: 485,
  })

  const getBadgeIcon = (badge: string) => {
    switch (badge) {
      case "Legend":
        return <Crown className="w-4 h-4 text-yellow-500" />
      case "Expert":
        return <Trophy className="w-4 h-4 text-orange-500" />
      case "Advanced":
        return <Medal className="w-4 h-4 text-purple-500" />
      case "Intermediate":
        return <Award className="w-4 h-4 text-blue-500" />
      default:
        return <Star className="w-4 h-4 text-green-500" />
    }
  }

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case "Legend":
        return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800"
      case "Expert":
        return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800"
      case "Advanced":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800"
      case "Intermediate":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800"
      default:
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800"
    }
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />
    if (rank === 2) return <Trophy className="w-5 h-5 text-gray-400" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return <span className="text-lg font-bold text-muted-foreground">#{rank}</span>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🏆</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Leaderboard
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Compete with the community and climb the ranks to earn exclusive rewards!
            </p>
          </div>

          {/* Period Filter */}
          <div className="mb-8">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Time Period:</span>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-48 bg-white dark:bg-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Leaderboard */}
            <div className="lg:col-span-2 space-y-6">
              {/* Current User Position */}
              <Card className="border-2 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-purple-600" />
                    Your Position
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold text-purple-600">#{currentUser.rank}</div>
                      <div>
                        <div className="font-medium">{currentUser.address}</div>
                        <div className="text-sm text-muted-foreground">{currentUser.points} points</div>
                      </div>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100">Your Rank</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Top Rankings */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Performers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {LEADERBOARD_DATA.map((user) => (
                    <div
                      key={user.rank}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        user.rank <= 3 
                          ? "bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 dark:from-yellow-900/20 dark:to-orange-900/20 dark:border-yellow-800" 
                          : "bg-white dark:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10">{getRankIcon(user.rank)}</div>
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-gradient-to-r from-purple-500 to-blue-500 text-white">
                            {user.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold">{user.displayName}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.address.slice(0, 12)}...{user.address.slice(-6)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="font-bold text-lg">{user.points.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">{user.questsCompleted} quests</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-green-600 font-medium">{user.tokensEarned.CKB} CKB</div>
                          <div className="text-purple-600">{user.tokensEarned.SPORE} SPORE</div>
                        </div>
                        <Badge variant="outline" className={getBadgeColor(user.badge)}>
                          {getBadgeIcon(user.badge)}
                          {user.badge}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Upcoming Rewards */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-green-600" />
                    Upcoming Rewards
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {UPCOMING_REWARDS.map((reward, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        reward.special 
                          ? "bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 dark:from-yellow-900/20 dark:to-orange-900/20 dark:border-yellow-800" 
                          : "bg-gray-50 dark:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{reward.period}</h4>
                        {reward.special && <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100">Special</Badge>}
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{reward.daysLeft} days left</span>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Prize Pool:</div>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span>CKB:</span>
                            <span className="font-medium">{reward.totalPool.CKB.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>SPORE:</span>
                            <span className="font-medium">{reward.totalPool.SPORE.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>DEFI:</span>
                            <span className="font-medium">{reward.totalPool.DEFI.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-muted-foreground">
                          Top rewards: {reward.positions[0].rewards.CKB.toLocaleString()} CKB for 1st place
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Rules & Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-600" />
                    Rules & Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Point System</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Quest completion: 50-500 points</li>
                      <li>• Difficulty bonus: Easy +0%, Medium +25%, Hard +50%</li>
                      <li>• First completion bonus: +20%</li>
                      <li>• Streak bonus: +5% per consecutive day</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Ranking Criteria</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Primary: Total points earned</li>
                      <li>• Tiebreaker 1: Number of quests completed</li>
                      <li>• Tiebreaker 2: Account registration date</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Badge System</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Newcomer: 0-199 points</li>
                      <li>• Beginner: 200-499 points</li>
                      <li>• Intermediate: 500-999 points</li>
                      <li>• Advanced: 1000-1999 points</li>
                      <li>• Expert: 2000-2999 points</li>
                      <li>• Legend: 3000+ points</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Token Distribution</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Rewards distributed monthly</li>
                      <li>• Minimum 100 points to qualify</li>
                      <li>• Anti-sybil verification required</li>
                      <li>• Wallet must be connected during reward period</li>
                    </ul>
                  </div>

                  <div className="pt-3 border-t">
                    <div className="text-xs text-muted-foreground">
                      Rankings update every 24 hours. Disputes can be submitted through the admin panel.
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Badge Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-600" />
                    Your Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Current Badge</span>
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                          <Award className="w-3 h-3 mr-1" />
                          Intermediate
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">515 points needed for Advanced badge</div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full"
                          style={{ width: "48.5%" }}
                        />
                      </div>
                    </div>

                    <div className="text-center pt-2">
                      <Button variant="outline" size="sm" className="w-full bg-transparent">
                        View All Achievements
                      </Button>
                    </div>
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
