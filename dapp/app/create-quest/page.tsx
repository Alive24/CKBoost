"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Users, Trophy, Calendar, Target } from "lucide-react"
import Link from "next/link"

// Mock campaigns owned by current user
const OWNED_CAMPAIGNS = [
  {
    id: 1,
    title: "CKB Ecosystem Growth Initiative",
    description: "Help expand the CKB ecosystem through social engagement and development",
    status: "active",
    startDate: "2024-01-15",
    endDate: "2024-03-15",
    participants: 156,
    questsCount: 6,
    category: "Ecosystem",
    sponsor: "Nervos Foundation",
  },
  {
    id: 2,
    title: "DeFi Education Campaign",
    description: "Learn and teach about DeFi concepts on CKB",
    status: "draft",
    startDate: "2024-04-01",
    endDate: "2024-06-01",
    participants: 0,
    questsCount: 3,
    category: "Education",
    sponsor: "CKB DeFi Alliance",
  },
  {
    id: 3,
    title: "Community Builder Program",
    description: "Build and strengthen the CKB community through engagement",
    status: "active",
    startDate: "2024-02-01",
    endDate: "2024-05-01",
    participants: 89,
    questsCount: 8,
    category: "Community",
    sponsor: "CKB Community DAO",
  },
]

export default function CreateQuest() {
  const router = useRouter()
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "draft":
        return "bg-yellow-100 text-yellow-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Ecosystem":
        return "bg-blue-100 text-blue-800"
      case "Education":
        return "bg-green-100 text-green-800"
      case "Community":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const handleCampaignSelect = (campaignId: number) => {
    router.push(`/campaign/${campaignId}/create-quest`)
  }

  const handleCreateCampaign = () => {
    router.push("/create-campaign")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" className="flex items-center gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🎯</div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Create New Quest
                </h1>
                <p className="text-lg text-muted-foreground mt-2">
                  Select a campaign to add your quest to, or create a new campaign
                </p>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <Card className="mb-8 border-blue-200 bg-blue-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-2">Quest Creation Policy</h3>
                  <p className="text-blue-800 text-sm mb-3">
                    All quests must be associated with a campaign to ensure proper organization, rewards distribution, and community engagement. 
                    This helps maintain quality standards and provides better context for participants.
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      Campaign Required
                    </Badge>
                    <Badge variant="outline" className="bg-green-100 text-green-800">
                      Better Organization
                    </Badge>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800">
                      Quality Control
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Selection */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Select a Campaign</h2>
              <Button onClick={handleCreateCampaign} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create New Campaign
              </Button>
            </div>

            {OWNED_CAMPAIGNS.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="text-6xl mb-4">🏗️</div>
                  <h3 className="text-xl font-semibold mb-2">No Campaigns Found</h3>
                  <p className="text-muted-foreground mb-6">
                    You don't have any campaigns yet. Create your first campaign to start adding quests.
                  </p>
                  <Button onClick={handleCreateCampaign} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create Your First Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {OWNED_CAMPAIGNS.map((campaign) => (
                  <Card 
                    key={campaign.id} 
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedCampaign === campaign.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedCampaign(campaign.id)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{campaign.title}</h3>
                            <Badge className={getStatusColor(campaign.status)}>
                              {campaign.status}
                            </Badge>
                            <Badge variant="outline" className={getCategoryColor(campaign.category)}>
                              {campaign.category}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mb-3">{campaign.description}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {campaign.participants} participants
                            </div>
                            <div className="flex items-center gap-1">
                              <Trophy className="w-4 h-4" />
                              {campaign.questsCount} quests
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Sponsored by {campaign.sponsor}
                          </div>
                        </div>
                        <div className="ml-4">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCampaignSelect(campaign.id)
                            }}
                            className="flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Add Quest
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Alternative Actions */}
          <div className="mt-12 text-center space-y-4">
            <div className="text-sm text-muted-foreground">
              Don't see the campaign you're looking for?
            </div>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" onClick={handleCreateCampaign}>
                Create New Campaign
              </Button>
              <Link href="/admin">
                <Button variant="outline">
                  Go to Admin Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
