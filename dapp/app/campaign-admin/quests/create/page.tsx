"use client"

import type React from "react"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Trash2, AlertCircle, Coins, Target, Users } from "lucide-react"
import Link from "next/link"

const CAMPAIGNS = [
  { id: 1, name: "CKB Ecosystem Growth Initiative", adminPubkey: "ckb1qyq...abc123" },
  { id: 2, name: "DeFi Education Campaign", adminPubkey: "ckb1qyq...def456" },
  { id: 3, name: "Community Builder Program", adminPubkey: "ckb1qyq...ghi789" },
  { id: 4, name: "NFT Creator Bootcamp", adminPubkey: "ckb1qyq...jkl012" },
]

const PROOF_TYPES = [
  { value: "text", label: "Text Response" },
  { value: "url", label: "URL/Link" },
  { value: "image", label: "Image Upload" },
  { value: "file", label: "File Upload" },
  { value: "transaction", label: "Transaction Hash" },
  { value: "social", label: "Social Media Post" },
]

interface Subtask {
  id: string
  title: string
  description: string
  proofType: string
  proofDescription: string
}

interface TokenReward {
  symbol: string
  amount: number
}

export default function CreateQuest() {
  const [selectedCampaign, setSelectedCampaign] = useState("")
  const [questTitle, setQuestTitle] = useState("")
  const [questDescription, setQuestDescription] = useState("")
  const [pointReward, setPointReward] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [timeEstimate, setTimeEstimate] = useState("")
  const [deadline, setDeadline] = useState("")
  const [estimatedParticipants, setEstimatedParticipants] = useState("")
  const [tokenRewards, setTokenRewards] = useState<TokenReward[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [fundImmediately, setFundImmediately] = useState(false)

  const addTokenReward = () => {
    setTokenRewards([...tokenRewards, { symbol: "", amount: 0 }])
  }

  const updateTokenReward = (index: number, field: keyof TokenReward, value: string | number) => {
    const updated = [...tokenRewards]
    updated[index] = { ...updated[index], [field]: value }
    setTokenRewards(updated)
  }

  const removeTokenReward = (index: number) => {
    setTokenRewards(tokenRewards.filter((_, i) => i !== index))
  }

  const addSubtask = () => {
    setSubtasks([
      ...subtasks,
      {
        id: Date.now().toString(),
        title: "",
        description: "",
        proofType: "text",
        proofDescription: "",
      },
    ])
  }

  const updateSubtask = (index: number, field: keyof Subtask, value: string) => {
    const updated = [...subtasks]
    updated[index] = { ...updated[index], [field]: value }
    setSubtasks(updated)
  }

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index))
  }

  const calculateTotalFunding = () => {
    const participants = Number.parseInt(estimatedParticipants) || 0
    return tokenRewards.map((token) => ({
      ...token,
      totalRequired: token.amount * participants,
    }))
  }

  const selectedCampaignData = CAMPAIGNS.find((c) => c.id.toString() === selectedCampaign)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle quest creation
    console.log("Creating quest...")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/campaign-admin/quests">
              <Button variant="ghost" className="flex items-center gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Quest Management
              </Button>
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🎯</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Create New Quest
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Design a quest with subtasks, rewards, and funding requirements
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Campaign *</label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGNS.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id.toString()}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCampaignData && (
                    <p className="text-xs text-muted-foreground mt-1">Admin: {selectedCampaignData.adminPubkey}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Quest Title *</label>
                  <Input
                    value={questTitle}
                    onChange={(e) => setQuestTitle(e.target.value)}
                    placeholder="Enter quest title"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description *</label>
                  <Textarea
                    value={questDescription}
                    onChange={(e) => setQuestDescription(e.target.value)}
                    placeholder="Describe what participants need to do"
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Difficulty *</label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
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
                    <label className="block text-sm font-medium mb-2">Time Estimate</label>
                    <Input
                      value={timeEstimate}
                      onChange={(e) => setTimeEstimate(e.target.value)}
                      placeholder="e.g., 30 mins"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Deadline</label>
                    <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rewards Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  Rewards Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Point Reward *</label>
                    <Input
                      type="number"
                      value={pointReward}
                      onChange={(e) => setPointReward(e.target.value)}
                      placeholder="Enter points"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Estimated Participants</label>
                    <Input
                      type="number"
                      value={estimatedParticipants}
                      onChange={(e) => setEstimatedParticipants(e.target.value)}
                      placeholder="For funding calculation"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium">Token Rewards</label>
                    <Button type="button" onClick={addTokenReward} size="sm" variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Token
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {tokenRewards.map((token, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Input
                          placeholder="Token symbol (e.g., CKB)"
                          value={token.symbol}
                          onChange={(e) => updateTokenReward(index, "symbol", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Amount per completion"
                          value={token.amount}
                          onChange={(e) => updateTokenReward(index, "amount", Number.parseInt(e.target.value) || 0)}
                          className="flex-1"
                        />
                        <Button type="button" onClick={() => removeTokenReward(index)} size="sm" variant="outline">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {tokenRewards.length > 0 && estimatedParticipants && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <h4 className="font-medium mb-2">Funding Requirements</h4>
                      <div className="space-y-1 text-sm">
                        {calculateTotalFunding().map((token, index) => (
                          <div key={index} className="flex justify-between">
                            <span>{token.symbol}:</span>
                            <span className="font-medium">{token.totalRequired.toLocaleString()} tokens</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Subtasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Subtasks
                  </div>
                  <Button type="button" onClick={addSubtask} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Subtask
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {subtasks.map((subtask, index) => (
                  <div key={subtask.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Subtask {index + 1}</Badge>
                      <Button type="button" onClick={() => removeSubtask(index)} size="sm" variant="outline">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Title *</label>
                        <Input
                          value={subtask.title}
                          onChange={(e) => updateSubtask(index, "title", e.target.value)}
                          placeholder="Subtask title"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Proof Type *</label>
                        <Select
                          value={subtask.proofType}
                          onValueChange={(value) => updateSubtask(index, "proofType", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROOF_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <Textarea
                        value={subtask.description}
                        onChange={(e) => updateSubtask(index, "description", e.target.value)}
                        placeholder="Describe what needs to be done"
                        rows={2}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Proof Instructions</label>
                      <Input
                        value={subtask.proofDescription}
                        onChange={(e) => updateSubtask(index, "proofDescription", e.target.value)}
                        placeholder="What proof should participants provide?"
                      />
                    </div>
                  </div>
                ))}

                {subtasks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No subtasks added yet</p>
                    <p className="text-sm">Add subtasks to break down the quest into manageable steps</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Funding Options */}
            {tokenRewards.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Funding Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-yellow-800">Token Funding Required</h4>
                        <p className="text-sm text-yellow-700 mt-1">
                          This quest requires token rewards. You can fund it immediately after creation or fund it
                          later.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="fundImmediately"
                      checked={fundImmediately}
                      onChange={(e) => setFundImmediately(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="fundImmediately" className="text-sm font-medium">
                      Fund quest immediately after creation
                    </label>
                  </div>

                  {fundImmediately && (
                    <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                      You will be redirected to the funding interface after quest creation.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Submit */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Link href="/campaign-admin/quests">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              >
                Create Quest
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
