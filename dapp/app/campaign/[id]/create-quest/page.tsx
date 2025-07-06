"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Plus, Trash2, Info, CheckCircle } from "lucide-react"
import Link from "next/link"

// Mock campaign data
const CAMPAIGN_DATA = {
  1: {
    id: 1,
    title: "CKB Ecosystem Growth Initiative",
    sponsor: "Nervos Foundation",
    description: "Help expand the CKB ecosystem through social engagement, development, and community building activities",
    endDate: "2024-03-15",
    status: "active",
  },
  2: {
    id: 2,
    title: "DeFi Education Campaign",
    sponsor: "CKB DeFi Alliance",
    description: "Learn and teach about DeFi concepts on CKB through tutorials and content creation",
    endDate: "2024-04-20",
    status: "active",
  },
  3: {
    id: 3,
    title: "Community Builder Program",
    sponsor: "CKB Community DAO",
    description: "Build and strengthen the CKB community through engagement and outreach",
    endDate: "2024-05-01",
    status: "active",
  },
}

// Mock current user - in real app, this would come from authentication
const CURRENT_USER = {
  id: 1,
  ownedCampaigns: [1, 2] // Campaign IDs owned by current user
}

export default function CreateQuestInCampaign() {
  const params = useParams()
  const router = useRouter()
  const campaignId = Number.parseInt(params.id as string)
  const campaign = CAMPAIGN_DATA[campaignId as keyof typeof CAMPAIGN_DATA]
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const [questData, setQuestData] = useState({
    title: "",
    description: "",
    difficulty: "",
    category: "",
    deadline: "",
    maxParticipants: "",
    pointReward: "",
    tokenRewards: [{ symbol: "CKB", amount: "" }],
    subtasks: [{ title: "", description: "", type: "text", proofRequired: "", proofTypes: ["text"] }],
    requirements: "",
    deliverables: "",
    evaluationCriteria: "",
    icon: "🎯",
    timeEstimate: "",
  })

  // Check if current user owns this campaign
  const isOwner = CURRENT_USER.ownedCampaigns.includes(campaignId)

  const addTokenReward = () => {
    setQuestData(prev => ({
      ...prev,
      tokenRewards: [...prev.tokenRewards, { symbol: "", amount: "" }]
    }))
  }

  const removeTokenReward = (index: number) => {
    setQuestData(prev => ({
      ...prev,
      tokenRewards: prev.tokenRewards.filter((_, i) => i !== index)
    }))
  }

  const updateTokenReward = (index: number, field: string, value: string) => {
    setQuestData(prev => ({
      ...prev,
      tokenRewards: prev.tokenRewards.map((reward, i) => 
        i === index ? { ...reward, [field]: value } : reward
      )
    }))
  }

  const addSubtask = () => {
    setQuestData(prev => ({
      ...prev,
      subtasks: [...prev.subtasks, { title: "", description: "", type: "text", proofRequired: "", proofTypes: ["text"] }]
    }))
  }

  const removeSubtask = (index: number) => {
    setQuestData(prev => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index)
    }))
  }

  const updateSubtask = (index: number, field: string, value: string | string[]) => {
    setQuestData(prev => ({
      ...prev,
      subtasks: prev.subtasks.map((subtask, i) => 
        i === index ? { ...subtask, [field]: value } : subtask
      )
    }))
  }

  const handleSave = async (status: "draft" | "active") => {
    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))
    
    console.log("Saving quest:", { ...questData, status, campaignId })
    setIsSubmitted(true)
    setIsSubmitting(false)
    
    // Reset after delay
    setTimeout(() => {
      router.push(`/campaign/${campaignId}`)
    }, 2000)
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy": return "bg-green-100 text-green-800"
      case "Medium": return "bg-yellow-100 text-yellow-800"
      case "Hard": return "bg-red-100 text-red-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "development": return "bg-blue-100 text-blue-800"
      case "content": return "bg-purple-100 text-purple-800"
      case "community": return "bg-green-100 text-green-800"
      case "social": return "bg-pink-100 text-pink-800"
      case "testing": return "bg-orange-100 text-orange-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Campaign Not Found</h1>
            <Button onClick={() => router.push("/")}>Back to Campaigns</Button>
          </div>
        </main>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-muted-foreground mb-4">You don't have permission to create quests for this campaign.</p>
            <Button onClick={() => router.push(`/campaign/${campaignId}`)}>Back to Campaign</Button>
          </div>
        </main>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-3xl font-bold mb-4">Quest Created Successfully!</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Your quest has been added to the campaign and is now available for participants.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => router.push(`/campaign/${campaignId}`)}>
                View Campaign
              </Button>
              <Button variant="outline" onClick={() => router.push("/admin")}>
                Go to Admin Dashboard
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Button 
              variant="ghost" 
              onClick={() => router.push(`/campaign/${campaignId}`)}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaign
            </Button>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🎯</div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Create New Quest
                </h1>
                <p className="text-lg text-muted-foreground">
                  Add a new quest to "{campaign.title}"
                </p>
              </div>
            </div>

            {/* Campaign Info */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-blue-900">{campaign.title}</h3>
                    <p className="text-sm text-blue-700">Sponsored by {campaign.sponsor}</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">
                    {campaign.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Quest Title *</Label>
                    <Input
                      id="title"
                      placeholder="Enter quest title"
                      value={questData.title}
                      onChange={(e) => setQuestData(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="icon">Icon/Emoji</Label>
                    <Input
                      id="icon"
                      placeholder="🎯"
                      value={questData.icon}
                      onChange={(e) => setQuestData(prev => ({ ...prev, icon: e.target.value }))}
                      maxLength={2}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what participants need to do"
                    value={questData.description}
                    onChange={(e) => setQuestData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select value={questData.category} onValueChange={(value) => setQuestData(prev => ({ ...prev, category: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="development">Development</SelectItem>
                        <SelectItem value="content">Content Creation</SelectItem>
                        <SelectItem value="community">Community</SelectItem>
                        <SelectItem value="social">Social Media</SelectItem>
                        <SelectItem value="testing">Testing</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Select value={questData.difficulty} onValueChange={(value) => setQuestData(prev => ({ ...prev, difficulty: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="timeEstimate">Time Estimate</Label>
                    <Input
                      id="timeEstimate"
                      placeholder="e.g., 30 mins"
                      value={questData.timeEstimate}
                      onChange={(e) => setQuestData(prev => ({ ...prev, timeEstimate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="deadline">Deadline (Optional)</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={questData.deadline}
                      onChange={(e) => setQuestData(prev => ({ ...prev, deadline: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxParticipants">Max Participants (Optional)</Label>
                    <Input
                      id="maxParticipants"
                      type="number"
                      placeholder="Leave empty for unlimited"
                      value={questData.maxParticipants}
                      onChange={(e) => setQuestData(prev => ({ ...prev, maxParticipants: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rewards */}
            <Card>
              <CardHeader>
                <CardTitle>Rewards</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="pointReward">Point Reward</Label>
                  <Input
                    id="pointReward"
                    type="number"
                    placeholder="100"
                    value={questData.pointReward}
                    onChange={(e) => setQuestData(prev => ({ ...prev, pointReward: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Token Rewards</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addTokenReward}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Token
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {questData.tokenRewards.map((reward, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder="Symbol (e.g., CKB)"
                          value={reward.symbol}
                          onChange={(e) => updateTokenReward(index, "symbol", e.target.value)}
                        />
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={reward.amount}
                          onChange={(e) => updateTokenReward(index, "amount", e.target.value)}
                        />
                        {questData.tokenRewards.length > 1 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => removeTokenReward(index)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subtasks */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Subtasks</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addSubtask}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Subtask
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {questData.subtasks.map((subtask, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Subtask {index + 1}</h4>
                          {questData.subtasks.length > 1 && (
                            <Button type="button" variant="outline" size="sm" onClick={() => removeSubtask(index)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            placeholder="Subtask title"
                            value={subtask.title}
                            onChange={(e) => updateSubtask(index, "title", e.target.value)}
                          />
                          <Select value={subtask.type} onValueChange={(value) => updateSubtask(index, "type", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text Submission</SelectItem>
                              <SelectItem value="link">Link Submission</SelectItem>
                              <SelectItem value="file">File Upload</SelectItem>
                              <SelectItem value="screenshot">Screenshot</SelectItem>
                              <SelectItem value="social">Social Media</SelectItem>
                              <SelectItem value="onchain">On-chain Action</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Textarea
                          placeholder="Subtask description"
                          value={subtask.description}
                          onChange={(e) => updateSubtask(index, "description", e.target.value)}
                          rows={2}
                        />

                        <Input
                          placeholder="Proof required (e.g., Screenshot of completion)"
                          value={subtask.proofRequired}
                          onChange={(e) => updateSubtask(index, "proofRequired", e.target.value)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Additional Details */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="requirements">Requirements</Label>
                  <Textarea
                    id="requirements"
                    placeholder="What participants need to have or know before starting"
                    value={questData.requirements}
                    onChange={(e) => setQuestData(prev => ({ ...prev, requirements: e.target.value }))}
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="deliverables">Expected Deliverables</Label>
                  <Textarea
                    id="deliverables"
                    placeholder="What participants should submit or achieve"
                    value={questData.deliverables}
                    onChange={(e) => setQuestData(prev => ({ ...prev, deliverables: e.target.value }))}
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="evaluationCriteria">Evaluation Criteria</Label>
                  <Textarea
                    id="evaluationCriteria"
                    placeholder="How submissions will be evaluated"
                    value={questData.evaluationCriteria}
                    onChange={(e) => setQuestData(prev => ({ ...prev, evaluationCriteria: e.target.value }))}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-2xl">{questData.icon}</div>
                    <div>
                      <h3 className="font-semibold">{questData.title || "Quest Title"}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {questData.category && (
                          <Badge variant="outline" className={getCategoryColor(questData.category)}>
                            {questData.category}
                          </Badge>
                        )}
                        {questData.difficulty && (
                          <Badge variant="outline" className={getDifficultyColor(questData.difficulty)}>
                            {questData.difficulty}
                          </Badge>
                        )}
                        {questData.timeEstimate && (
                          <span className="text-sm text-muted-foreground">
                            ⏱️ {questData.timeEstimate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {questData.description || "Quest description will appear here"}
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    {questData.pointReward && (
                      <span className="text-purple-600 font-semibold">
                        🏆 {questData.pointReward} points
                      </span>
                    )}
                    {questData.tokenRewards.filter(r => r.symbol && r.amount).length > 0 && (
                      <div className="flex items-center gap-2">
                        {questData.tokenRewards.filter(r => r.symbol && r.amount).map((reward, i) => (
                          <span key={i} className="text-green-600 font-semibold">
                            💰 {reward.amount} {reward.symbol}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Button
                onClick={() => handleSave("draft")}
                variant="outline"
                disabled={isSubmitting || !questData.title}
              >
                {isSubmitting ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                onClick={() => handleSave("active")}
                disabled={isSubmitting || !questData.title}
              >
                {isSubmitting ? "Publishing..." : "Publish Quest"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push(`/campaign/${campaignId}`)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
