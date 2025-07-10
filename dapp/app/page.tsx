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
import { getDerivedStatus, useCampaigns } from "@/lib"


export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  // Use campaign provider
  const { campaigns, featuredCampaigns, isLoading, error } = useCampaigns()

  const hasActiveFilters = searchTerm !== "" || selectedDifficulties.length > 0 || selectedCategories.length > 0 || selectedStatuses.length > 0

  const filteredCampaigns = campaigns.filter((campaign) => {
    // If no filters are active, exclude featured campaigns from "All Campaigns" section
    if (!hasActiveFilters && featuredCampaigns.some(fc => fc.id === campaign.id)) {
      return false
    }

    const matchesSearch =
      campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.shortDescription.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDifficulty = selectedDifficulties.length === 0 || selectedDifficulties.includes(campaign.difficulty.toLowerCase())
    const matchesCategory =
      selectedCategories.length === 0 ||
      campaign.categories.some((cat) => selectedCategories.includes(cat.toLowerCase()))
    
    // Handle status filter with derived status
    const derivedStatus = getDerivedStatus(campaign)
    let matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(derivedStatus)

    return matchesSearch && matchesDifficulty && matchesCategory && matchesStatus
  })

  const allCategories = Array.from(new Set(campaigns.flatMap((c) => c.categories)))

  // Handle loading and error states
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading campaigns...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-red-500 text-xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold mb-2">Failed to Load Campaigns</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const scrollToAllCampaigns = () => {
    const allCampaignsSection = document.getElementById('all-campaigns')
    if (allCampaignsSection) {
      allCampaignsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleCategoryClick = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category))
    } else {
      setSelectedCategories([...selectedCategories, category])
    }
    // Scroll to filtered results after a brief delay to allow state update
    setTimeout(() => scrollToAllCampaigns(), 100)
  }

  const handleDifficultyClick = (difficulty: string) => {
    if (selectedDifficulties.includes(difficulty)) {
      setSelectedDifficulties(selectedDifficulties.filter(d => d !== difficulty))
    } else {
      setSelectedDifficulties([...selectedDifficulties, difficulty])
    }
    setTimeout(() => scrollToAllCampaigns(), 100)
  }

  const handleStatusClick = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status))
    } else {
      setSelectedStatuses([...selectedStatuses, status])
    }
    setTimeout(() => scrollToAllCampaigns(), 100)
  }

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
                {featuredCampaigns.length} featured
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
              {featuredCampaigns.map((campaign) => (
                <CampaignCard 
                  key={campaign.id} 
                  campaign={{...campaign, status: getDerivedStatus(campaign)}}
                  onCategoryClick={handleCategoryClick}
                  onDifficultyClick={handleDifficultyClick}
                  onStatusClick={handleStatusClick}
                  selectedCategories={selectedCategories}
                  selectedDifficulties={selectedDifficulties}
                  selectedStatuses={selectedStatuses}
                />
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
                      {["active", "ending-soon", "upcoming", "completed"].map((status) => (
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
          <div id="all-campaigns" className="mb-12">
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
                <CampaignCard 
                  key={campaign.id} 
                  campaign={{...campaign, status: getDerivedStatus(campaign)}}
                  onCategoryClick={handleCategoryClick}
                  onDifficultyClick={handleDifficultyClick}
                  onStatusClick={handleStatusClick}
                  selectedCategories={selectedCategories}
                  selectedDifficulties={selectedDifficulties}
                  selectedStatuses={selectedStatuses}
                />
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
