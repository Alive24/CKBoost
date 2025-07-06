"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Plus, Trash2, Save, CheckCircle } from "lucide-react"
import Link from "next/link"

// Mock quest data - same as in the quest detail page
const QUEST_DATA = {
  1: {
    id: 1,
    title: "Raid the CKB Announcement",
    description: "Like, retweet, and comment on the latest CKB announcement on X to help spread awareness about CKB's latest developments and engage with the community.",
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
    description: "Deploy your first smart contract on the CKB testnet and verify its functionality. This quest will help you understand the CKB development environment.",
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

// Mock current user
const CURRENT_USER = {
  id: 1,
  ownedCampaigns: [1, 2]
}

export default function EditQuest() {
  const params = useParams()
  const router = useRouter()
  const questId = Number.parseInt(params.id as string)
  const originalQuest = QUEST_DATA[questId as keyof typeof QUEST_DATA]
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  
  const [questData, setQuestData] = useState({
    title: "",
    description: "",
    difficulty: "",
    category: "",
    icon: "",
    timeEstimate: "",
    pointReward: "",
    tokenRewards: [{ symbol: "CKB", amount: "" }],
    subtasks: [{ title: "", description: "", type: "text", proofRequired: "", proofTypes: ["text"] }],
    status: "available"
  })

  // Load quest data when component mounts
  useEffect(() => {
    if (originalQuest) {
      setQuestData({
        title: originalQuest.title,
        description: originalQuest.description,
        difficulty: originalQuest.difficulty,
        category: originalQuest.category,
        icon: originalQuest.icon,
        timeEstimate: originalQuest.timeEstimate,
        pointReward: originalQuest.rewards.points.toString(),
        tokenRewards: originalQuest.rewards.tokens.map(token => ({
          symbol: token.symbol,
          amount: token.amount.toString()
        })),
        subtasks: originalQuest.subtasks.map(subtask => ({
          title: subtask.title,
          description: subtask.description,
          type: subtask.type,
          proofRequired: subtask.proofRequired,
          proofTypes: subtask.proofTypes
        })),
        status: originalQuest.status
      })
    }
  }, [originalQuest])

  // Check if current user owns this quest's campaign
  const isOwner = originalQuest ? CURRENT_USER.ownedCampaigns.includes(originalQuest.campaignId) : false

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

  const handleSave = async () => {
    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))
    
    console.log("Updating quest:", { ...questData, questId })
    setIsSubmitted(true)
    setIsSubmitting(false)
    
    // Reset after delay
    setTimeout(() => {
      router.push(`/quest/${questId}`)
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
      case "Development": return "bg-blue-100 text-blue-800"
      case "Social Media": return "bg-pink-100 text-pink-800"
      case "Content Creation": return "bg-purple-100 text-purple-800"
      case "Community": return "bg-green-100 text-green-800"
      case "Testing": return "bg-orange-100 text-orange-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  if (!originalQuest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Quest Not Found</h1>
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
            <p className="text-muted-foreground mb-4">You don't have permission to edit this quest.</p>
            <Button onClick={() => router.push(`/quest/${questId}`)}>Back to Quest</Button>
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
            <div className="text-6xl mb-6">✅</div>
            <h1 className="text-3xl font-bold mb-4">Quest Updated Successfully!</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Your changes have been saved and the quest has been updated.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => router.push(`/quest/${questId}`)}>
                View Quest
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
              onClick={() => router.push(`/quest/${questId}`)}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Quest
            </Button>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">✏️</div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Edit Quest
                </h1>
                <p className="text-lg text-muted-foreground">
                  Modify "{originalQuest.title}"
                </p>
              </div>
            </div>

            {/* Campaign Info */}
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-amber-900">{originalQuest.campaignTitle}</h3>
                    <p className="text-sm text-amber-700">Campaign Admin Mode</p>
                  </div>
                  <Badge className="bg-amber-100 text-amber-800">
                    Editing Quest
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
                        <SelectItem value="Development">Development</SelectItem>
                        <SelectItem value="Social Media">Social Media</SelectItem>
                        <SelectItem value="Content Creation">Content Creation</SelectItem>
                        <SelectItem value="Community">Community</SelectItem>
                        <SelectItem value="Testing">Testing</SelectItem>
                        <SelectItem value="Education">Education</SelectItem>
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
                              <SelectItem value="technical">Technical</SelectItem>
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
                onClick={handleSave}
                disabled={isSubmitting || !questData.title}
              >
                {isSubmitting ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push(`/quest/${questId}`)}
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