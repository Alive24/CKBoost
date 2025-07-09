"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { CampaignCard } from "@/components/campaign-card"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Star, X } from "lucide-react"
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

const NON_FEATURED_CAMPAIGNS = [
  {
    id: 5,
    title: "Bug Bounty Hunter",
    description: "Find and report bugs in CKB ecosystem projects. Earn rewards for discovering vulnerabilities.",
    sponsor: "Security Alliance",
    totalRewards: {
      points: 2800,
      tokens: [
        { symbol: "CKB", amount: 1200 },
        { symbol: "SEC", amount: 400 },
      ],
    },
    participants: 45,
    questsCount: 5,
    questsCompleted: 2,
    endDate: "2024-04-10",
    status: "active",
    difficulty: "Advanced",
    categories: ["Security", "Development"],
    image: "/placeholder.svg?height=200&width=400&text=Bug+Bounty",
  },
  {
    id: 6,
    title: "Social Media Ambassador",
    description: "Promote CKB ecosystem on social media platforms. Create engaging content and grow the community.",
    sponsor: "Marketing DAO",
    totalRewards: {
      points: 1800,
      tokens: [
        { symbol: "CKB", amount: 800 },
      ],
    },
    participants: 312,
    questsCount: 8,
    questsCompleted: 4,
    endDate: "2024-03-30",
    status: "active",
    difficulty: "Easy",
    categories: ["Social", "Marketing"],
    image: "/placeholder.svg?height=200&width=400&text=Ambassador",
  },
  {
    id: 7,
    title: "Developer Documentation Sprint",
    description: "Improve developer documentation for CKB tools and libraries. Make onboarding easier for new developers.",
    sponsor: "Dev Foundation",
    totalRewards: {
      points: 2200,
      tokens: [
        { symbol: "CKB", amount: 1000 },
        { symbol: "DOC", amount: 300 },
      ],
    },
    participants: 28,
    questsCount: 6,
    questsCompleted: 1,
    endDate: "2024-04-05",
    status: "active",
    difficulty: "Medium",
    categories: ["Documentation", "Development"],
    image: "/placeholder.svg?height=200&width=400&text=Documentation",
  },
]

const ALL_CAMPAIGNS = [...FEATURED_CAMPAIGNS, ...NON_FEATURED_CAMPAIGNS]


export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  const hasActiveFilters = searchTerm !== "" || selectedDifficulties.length > 0 || selectedCategories.length > 0 || selectedStatuses.length > 0

  const filteredCampaigns = ALL_CAMPAIGNS.filter((campaign) => {
    // If no filters are active, exclude featured campaigns from "All Campaigns" section
    if (!hasActiveFilters && FEATURED_CAMPAIGNS.some(fc => fc.id === campaign.id)) {
      return false
    }

    const matchesSearch =
      campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDifficulty = selectedDifficulties.length === 0 || selectedDifficulties.includes(campaign.difficulty.toLowerCase())
    const matchesCategory =
      selectedCategories.length === 0 ||
      campaign.categories.some((cat) => selectedCategories.includes(cat.toLowerCase()))
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(campaign.status)

    return matchesSearch && matchesDifficulty && matchesCategory && matchesStatus
  })

  const allCategories = Array.from(new Set(ALL_CAMPAIGNS.flatMap((c) => c.categories)))

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
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
                <Button size="lg" variant="outline" className="bg-transparent backdrop-blur-sm">
                  View Leaderboard
                </Button>
              </Link>
            </div>
          </div>


          {/* Featured Campaigns */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold">Featured Campaigns</h2>
              <Badge variant="outline" className="bg-white dark:bg-gray-800">
                {FEATURED_CAMPAIGNS.length} featured
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
              {FEATURED_CAMPAIGNS.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mb-8 space-y-4">
            <Card className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-200 dark:border-gray-700">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Search & Filter All Campaigns</h3>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search campaigns..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                  />
                </div>

                <div className="space-y-4">
                  {/* Difficulty Filter */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Difficulty:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedDifficulties([])}
                        className={`h-auto p-1 text-xs ${selectedDifficulties.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["beginner", "easy", "medium", "advanced"].map((level) => (
                        <Badge
                          key={level}
                          variant={selectedDifficulties.includes(level) ? "default" : "outline"}
                          className="cursor-pointer hover:bg-primary/10 border-gray-300 dark:border-gray-600"
                          onClick={() => {
                            if (selectedDifficulties.includes(level)) {
                              setSelectedDifficulties(selectedDifficulties.filter(d => d !== level))
                            } else {
                              setSelectedDifficulties([...selectedDifficulties, level])
                            }
                          }}
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Category Filter */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Category:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedCategories([])}
                        className={`h-auto p-1 text-xs ${selectedCategories.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {allCategories.map((category) => (
                        <Badge
                          key={category}
                          variant={selectedCategories.includes(category.toLowerCase()) ? "default" : "outline"}
                          className="cursor-pointer hover:bg-primary/10 border-gray-300 dark:border-gray-600"
                          onClick={() => {
                            const categoryLower = category.toLowerCase()
                            if (selectedCategories.includes(categoryLower)) {
                              setSelectedCategories(selectedCategories.filter(c => c !== categoryLower))
                            } else {
                              setSelectedCategories([...selectedCategories, categoryLower])
                            }
                          }}
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Status:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedStatuses([])}
                        className={`h-auto p-1 text-xs ${selectedStatuses.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["active", "upcoming", "completed"].map((status) => (
                        <Badge
                          key={status}
                          variant={selectedStatuses.includes(status) ? "default" : "outline"}
                          className="cursor-pointer hover:bg-primary/10 border-gray-300 dark:border-gray-600"
                          onClick={() => {
                            if (selectedStatuses.includes(status)) {
                              setSelectedStatuses(selectedStatuses.filter(s => s !== status))
                            } else {
                              setSelectedStatuses([...selectedStatuses, status])
                            }
                          }}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* All Campaigns */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {hasActiveFilters ? "Filtered Campaigns" : "Other Campaigns"}
              </h2>
              <Badge variant="outline" className="bg-white dark:bg-gray-800">
                {filteredCampaigns.length} campaigns
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
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
                    setSelectedDifficulties([])
                    setSelectedCategories([])
                    setSelectedStatuses([])
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
