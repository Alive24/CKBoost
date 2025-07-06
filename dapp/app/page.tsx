"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { CampaignCard } from "@/components/campaign-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, Filter, Trophy, Users, Coins, TrendingUp, Star, Shield, CheckCircle, AlertTriangle, MessageCircle, FileText, Fingerprint, User } from "lucide-react"
import Link from "next/link"

const FEATURED_CAMPAIGNS = [
  {
    id: 1,
    title: "CKB Ecosystem Growth Initiative",
    description: "Help grow the CKB ecosystem through content creation, development, and community engagement",
    sponsor: "Nervos Foundation",
    totalRewards: {
      points: 5000,
      tokens: [
        { symbol: "CKB", amount: 2000 },
        { symbol: "SPORE", amount: 1000 },
      ],
    },
    participants: 156,
    questsCount: 8,
    questsCompleted: 3,
    endDate: "2024-03-15",
    status: "active",
    difficulty: "Medium",
    categories: ["Development", "Content", "Community"],
    image: "/placeholder.svg?height=200&width=400&text=CKB+Ecosystem",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: false,
      manualReview: false,
    },
  },
  {
    id: 2,
    title: "DeFi Education Campaign",
    description: "Learn and teach others about DeFi protocols, yield farming, and decentralized finance concepts",
    sponsor: "DeFi Alliance",
    totalRewards: {
      points: 3500,
      tokens: [
        { symbol: "CKB", amount: 1500 },
        { symbol: "DEFI", amount: 500 },
      ],
    },
    participants: 89,
    questsCount: 6,
    questsCompleted: 2,
    endDate: "2024-04-20",
    status: "active",
    difficulty: "Beginner",
    categories: ["Education", "DeFi", "Finance"],
    image: "/placeholder.svg?height=200&width=400&text=DeFi+Education",
    verificationRequirements: {
      telegram: false,
      kyc: true,
      did: false,
      manualReview: false,
      excludeManualReview: true, // High-value campaign excludes manual review
    },
  },
  {
    id: 3,
    title: "Community Builder Program",
    description: "Build and engage communities around blockchain projects through events and social activities",
    sponsor: "Community DAO",
    totalRewards: {
      points: 4200,
      tokens: [
        { symbol: "CKB", amount: 1800 },
        { symbol: "COMM", amount: 800 },
      ],
    },
    participants: 234,
    questsCount: 10,
    questsCompleted: 5,
    endDate: "2024-05-01",
    status: "active",
    difficulty: "Easy",
    categories: ["Community", "Social", "Events"],
    image: "/placeholder.svg?height=200&width=400&text=Community+Builder",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: true,
      manualReview: true,
      excludeManualReview: false, // Community campaign accepts manual review
    },
  },
  {
    id: 4,
    title: "NFT Creator Bootcamp",
    description: "Create, mint, and promote NFT collections while learning about digital art and blockchain",
    sponsor: "NFT Studios",
    totalRewards: {
      points: 6000,
      tokens: [
        { symbol: "CKB", amount: 2500 },
        { symbol: "SPORE", amount: 1500 },
      ],
    },
    participants: 67,
    questsCount: 12,
    questsCompleted: 0,
    endDate: "2024-06-15",
    status: "active",
    difficulty: "Advanced",
    categories: ["NFT", "Art", "Creative"],
    image: "/placeholder.svg?height=200&width=400&text=NFT+Bootcamp",
  },
]

const PLATFORM_STATS = {
  totalUsers: 1247,
  activeCampaigns: 12,
  totalRewards: 45000,
  questsCompleted: 3456,
}

// Mock current user verification status - in real app, this would come from authentication
const CURRENT_USER_VERIFICATION = {
  telegram: true,
  kyc: false,
  did: false,
  manualReview: false,
}

export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  const filteredCampaigns = FEATURED_CAMPAIGNS.filter((campaign) => {
    const matchesSearch =
      campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDifficulty = selectedDifficulty === "all" || campaign.difficulty.toLowerCase() === selectedDifficulty
    const matchesCategory =
      selectedCategory === "all" ||
      campaign.categories.some((cat) => cat.toLowerCase() === selectedCategory.toLowerCase())
    const matchesStatus = selectedStatus === "all" || campaign.status === selectedStatus

    return matchesSearch && matchesDifficulty && matchesCategory && matchesStatus
  })

  const allCategories = Array.from(new Set(FEATURED_CAMPAIGNS.flatMap((c) => c.categories)))

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="text-6xl">🚀</div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                CKBoost
              </h1>
            </div>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Join campaigns, complete quests, and earn rewards while contributing to the CKB ecosystem. Build your
              reputation and grow with the community.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  View My Progress
                </Button>
              </Link>
              <Link href="/leaderboard">
                <Button size="lg" variant="outline" className="bg-transparent">
                  View Leaderboard
                </Button>
              </Link>
            </div>
          </div>


          {/* Search and Filters */}
          <div className="mb-8 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search campaigns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>

              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                <SelectTrigger className="w-40 bg-white">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-40 bg-white">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {allCategories.map((category) => (
                    <SelectItem key={category} value={category.toLowerCase()}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-40 bg-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Featured Campaigns */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold">Featured Campaigns</h2>
              <Badge variant="outline" className="bg-white">
                {filteredCampaigns.length} campaigns
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>

            {filteredCampaigns.length === 0 && (
              <div className="text-center py-12">
                <Star className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">No campaigns found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your search terms or filters to find campaigns that match your interests.
                </p>
                <Button
                  onClick={() => {
                    setSearchTerm("")
                    setSelectedDifficulty("all")
                    setSelectedCategory("all")
                    setSelectedStatus("all")
                  }}
                  variant="outline"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
