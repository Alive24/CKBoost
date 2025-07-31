"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Plus, Trash2, Info, AlertTriangle, Calendar, Loader2, CheckCircle } from "lucide-react"
import Link from "next/link"
import { ccc } from "@ckb-ccc/connector-react"
import { CampaignService } from "@/lib/services/campaign-service"
import { useProtocol } from "@/lib/providers/protocol-provider"
import type { CampaignDataLike } from "ssri-ckboost/types"

export default function CreateCampaign() {
  // Get CCC signer and protocol data
  const signer = ccc.useSigner()
  const { protocolData, isLoading: protocolLoading, error: protocolError } = useProtocol()
  
  const [formData, setFormData] = useState({
    title: "",
    shortDescription: "",
    longDescription: "",
    category: "",
    difficulty: "",
    startDate: "",
    endDate: "",
    totalPoints: "",
    logo: "",
    selectedEndorser: "", // Selected endorser from protocol whitelist
  })

  const [tokenRewards, setTokenRewards] = useState([{ symbol: "CKB", amount: "" }])
  const [rules, setRules] = useState([""])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [availableEndorsers, setAvailableEndorsers] = useState<any[]>([])
  const [isWalletConnected, setIsWalletConnected] = useState(false)

  // Check wallet connection status
  useEffect(() => {
    setIsWalletConnected(!!signer)
  }, [signer])

  // Load available endorsers when protocol data is available
  useEffect(() => {
    if (protocolData?.endorsers_whitelist) {
      setAvailableEndorsers(protocolData.endorsers_whitelist)
    }
  }, [protocolData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Validate required fields
      if (!formData.title || !formData.shortDescription || !formData.longDescription || 
          !formData.category || !formData.difficulty || !formData.startDate || 
          !formData.endDate || !formData.totalPoints || !formData.selectedEndorser) {
        throw new Error("Please fill in all required fields")
      }

      if (!signer) {
        throw new Error("Please connect your wallet to create a campaign")
      }

      // Find selected endorser
      const selectedEndorser = availableEndorsers.find(
        endorser => endorser.endorser_lock_hash === formData.selectedEndorser
      )

      if (!selectedEndorser) {
        throw new Error("Please select a valid endorser from the list")
      }

      // Create campaign data using SSRI types
      const campaignData: Partial<CampaignDataLike> = {
        id: ccc.hexFrom(ccc.bytesFrom(crypto.randomUUID(), "utf8")),
        title: ccc.hexFrom(ccc.bytesFrom(formData.title, "utf8")),
        short_description: ccc.hexFrom(ccc.bytesFrom(formData.shortDescription, "utf8")),
        long_description: ccc.hexFrom(ccc.bytesFrom(formData.longDescription, "utf8")),
        creator: (await signer.getRecommendedAddressObj()).script,
        metadata: {
          funding_info: [],
          created_at: BigInt(Date.now()),
          starting_time: BigInt(new Date(formData.startDate).getTime()),
          ending_time: BigInt(new Date(formData.endDate).getTime()),
          verification_requirements: 0, // No special requirements for now
          last_updated: BigInt(Date.now()),
          categories: [ccc.hexFrom(ccc.bytesFrom(formData.category, "utf8"))],
          difficulty: formData.difficulty === "Easy" ? 1 : formData.difficulty === "Medium" ? 2 : 3,
          image_cid: ccc.hexFrom(ccc.bytesFrom(formData.logo, "utf8")),
          rules: rules.filter(rule => rule.trim()).map(rule => ccc.hexFrom(ccc.bytesFrom(rule, "utf8")))
        },
        status: 0, // Created status
        quests: [], // Empty for now
        participants_count: 0,
        total_completions: 0
      }

      // Create campaign using campaign service
      const campaignService = new CampaignService(signer)
      const txHash = await campaignService.createCampaign(
        campaignData,
        formData.selectedEndorser
      )

      console.log("Campaign created successfully:", txHash)
      setIsSubmitted(true)

      // Reset form after success
      setTimeout(() => {
        resetForm()
      }, 5000)

    } catch (error) {
      console.error("Failed to create campaign:", error)
      setSubmitError(error instanceof Error ? error.message : "Failed to create campaign")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      title: "",
      shortDescription: "",
      longDescription: "",
      category: "",
      difficulty: "",
      startDate: "",
      endDate: "",
      totalPoints: "",
      logo: "",
      selectedEndorser: "",
    })
    setTokenRewards([{ symbol: "CKB", amount: "" }])
    setRules([""])
    setIsSubmitted(false)
    setSubmitError(null)
  }

  const addTokenReward = () => {
    setTokenRewards([...tokenRewards, { symbol: "", amount: "" }])
  }

  const removeTokenReward = (index: number) => {
    setTokenRewards(tokenRewards.filter((_, i) => i !== index))
  }

  const updateTokenReward = (index: number, field: string, value: string) => {
    const newRewards = [...tokenRewards]
    newRewards[index] = { ...newRewards[index], [field]: value }
    setTokenRewards(newRewards)
  }

  const addRule = () => {
    setRules([...rules, ""])
  }

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index))
  }

  const updateRule = (index: number, value: string) => {
    const newRules = [...rules]
    newRules[index] = value
    setRules(newRules)
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Ecosystem":
        return "bg-blue-100 text-blue-800"
      case "Education":
        return "bg-green-100 text-green-800"
      case "Community":
        return "bg-purple-100 text-purple-800"
      case "Testing":
        return "bg-orange-100 text-orange-800"
      case "NFT":
        return "bg-pink-100 text-pink-800"
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
      case "Mixed":
        return "bg-gradient-to-r from-green-100 to-red-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  // Show success screen
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-3xl font-bold mb-4">Campaign Created Successfully!</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Your campaign has been created on the CKB blockchain! It will appear in the campaign list once the 
              transaction is confirmed. You can now create individual quests for your campaign.
            </p>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200 mb-6">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Campaign Created On-Chain</span>
              </div>
              <div className="text-sm text-green-700">
                Your campaign is now live on the CKB blockchain. You can manage it through the campaign admin dashboard.
              </div>
            </div>
            <div className="flex gap-4 justify-center">
              <Link href="/">
                <Button>View All Campaigns</Button>
              </Link>
              <Link href="/campaign-admin">
                <Button variant="outline">Go to Admin Dashboard</Button>
              </Link>
              <Button variant="outline" onClick={resetForm}>
                Create Another Campaign
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Show wallet connection requirement
  if (!isWalletConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-6">🔗</div>
            <h1 className="text-3xl font-bold mb-4">Wallet Connection Required</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Please connect your CKB wallet to create a campaign. Your wallet will be used to sign the campaign 
              creation transaction and manage campaign operations.
            </p>
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              Connect Wallet
            </Button>
          </div>
        </main>
      </div>
    )
  }

  // Show protocol loading state
  if (protocolLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Loading Protocol Data</h1>
            <p className="text-muted-foreground">
              Loading available endorsers and protocol information...
            </p>
          </div>
        </main>
      </div>
    )
  }

  // Show protocol error
  if (protocolError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-6">⚠️</div>
            <h1 className="text-3xl font-bold mb-4">Protocol Not Available</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Unable to load protocol data. Please ensure the CKBoost protocol is deployed and accessible.
            </p>
            <Alert className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {protocolError}
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" className="flex items-center gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Campaign Board
              </Button>
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🎯</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Create New Campaign
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Launch a sponsored campaign with multiple quests to engage the CKB community and drive ecosystem growth.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2">
              {/* Error Alert */}
              {submitError && (
                <Alert className="mb-6 border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {submitError}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Campaign Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">Campaign Title *</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          placeholder="e.g., CKB Ecosystem Growth Initiative"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="logo">Logo/Emoji *</Label>
                        <Input
                          id="logo"
                          value={formData.logo}
                          onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                          placeholder="🏛️"
                          maxLength={2}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="shortDescription">Short Description *</Label>
                      <Input
                        id="shortDescription"
                        value={formData.shortDescription}
                        onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                        placeholder="Brief one-line description for campaign cards"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="longDescription">Detailed Description *</Label>
                      <Textarea
                        id="longDescription"
                        value={formData.longDescription}
                        onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })}
                        placeholder="Describe the campaign's goals, target audience, and expected outcomes in detail"
                        rows={4}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">Category *</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) => setFormData({ ...formData, category: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ecosystem">Ecosystem</SelectItem>
                            <SelectItem value="Education">Education</SelectItem>
                            <SelectItem value="Community">Community</SelectItem>
                            <SelectItem value="Testing">Testing</SelectItem>
                            <SelectItem value="NFT">NFT</SelectItem>
                            <SelectItem value="DeFi">DeFi</SelectItem>
                            <SelectItem value="Gaming">Gaming</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="difficulty">Overall Difficulty *</Label>
                        <Select
                          value={formData.difficulty}
                          onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select difficulty" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Easy">Easy</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="Hard">Hard</SelectItem>
                            <SelectItem value="Mixed">Mixed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date *</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                          min={new Date().toISOString().split("T")[0]}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">End Date *</Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={formData.endDate}
                          onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                          min={formData.startDate || new Date().toISOString().split("T")[0]}
                          required
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>


                {/* Endorser Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Endorser</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="selectedEndorser">Select Endorser *</Label>
                      <Select
                        value={formData.selectedEndorser}
                        onValueChange={(value) => setFormData({ ...formData, selectedEndorser: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an endorsed partner" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableEndorsers.map((endorser, index) => (
                            <SelectItem key={index} value={endorser.endorser_lock_hash}>
                              {/* Convert hex to string for display */}
                              {endorser.endorser_name ? 
                                new TextDecoder().decode(new Uint8Array(Buffer.from(endorser.endorser_name.slice(2), 'hex'))) : 
                                `Endorser ${index + 1}`
                              }
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-sm text-muted-foreground">
                        Campaigns must be endorsed by an approved partner to ensure quality and legitimacy.
                        {availableEndorsers.length === 0 && (
                          <div className="text-orange-600 mt-1">
                            No endorsers currently available. Please ensure the protocol is properly configured.
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Rewards */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Rewards</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="totalPoints">Total Points Pool *</Label>
                      <Input
                        id="totalPoints"
                        type="number"
                        value={formData.totalPoints}
                        onChange={(e) => setFormData({ ...formData, totalPoints: e.target.value })}
                        placeholder="2500"
                        min="100"
                        max="50000"
                        required
                      />
                    </div>

                    <div className="space-y-4">
                      <Label>Token Rewards</Label>
                      {tokenRewards.map((reward, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select
                            value={reward.symbol}
                            onValueChange={(value) => updateTokenReward(index, "symbol", value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Token" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CKB">CKB</SelectItem>
                              <SelectItem value="SPORE">SPORE</SelectItem>
                              <SelectItem value="DeFi">DeFi</SelectItem>
                              <SelectItem value="COMM">COMM</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            value={reward.amount}
                            onChange={(e) => updateTokenReward(index, "amount", e.target.value)}
                            placeholder="Amount"
                            min="1"
                            required
                          />
                          {tokenRewards.length > 1 && (
                            <Button type="button" variant="outline" size="sm" onClick={() => removeTokenReward(index)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addTokenReward}
                        className="w-full bg-transparent"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Token Reward
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Campaign Rules */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Rules</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {rules.map((rule, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={rule}
                          onChange={(e) => updateRule(index, e.target.value)}
                          placeholder={`Rule ${index + 1} (e.g., Complete quests in any order)`}
                          required
                        />
                        {rules.length > 1 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => removeRule(index)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addRule} className="w-full bg-transparent">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Rule
                    </Button>
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSubmitting || availableEndorsers.length === 0}
                    size="lg"
                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating Campaign...
                      </>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4 mr-2" />
                        Create Campaign On-Chain
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Preview & Guidelines */}
            <div className="space-y-6">
              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{formData.logo || "❓"}</div>
                      <div>
                        <div className="font-semibold">{formData.title || "Campaign Title"}</div>
                        <div className="text-sm text-muted-foreground">
                          {availableEndorsers.find(e => e.endorser_lock_hash === formData.selectedEndorser) ?
                            `Endorsed by ${new TextDecoder().decode(new Uint8Array(Buffer.from(availableEndorsers.find(e => e.endorser_lock_hash === formData.selectedEndorser)!.endorser_name.slice(2), 'hex')))}` :
                            "Select an endorser"
                          }
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {formData.category && (
                            <Badge variant="outline" className={getCategoryColor(formData.category)}>
                              {formData.category}
                            </Badge>
                          )}
                          {formData.difficulty && (
                            <Badge variant="outline" className={getDifficultyColor(formData.difficulty)}>
                              {formData.difficulty}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {formData.shortDescription && <p className="text-sm text-muted-foreground">{formData.shortDescription}</p>}
                    <div className="space-y-1">
                      {formData.totalPoints && (
                        <div className="text-yellow-600 font-semibold">🏆 {formData.totalPoints} points</div>
                      )}
                      {tokenRewards
                        .filter((r) => r.symbol && r.amount)
                        .map((reward, index) => (
                          <div key={index} className="text-green-600 font-semibold text-sm">
                            💰 {reward.amount} {reward.symbol}
                          </div>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guidelines */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    Campaign Guidelines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground mb-1">Campaign Standards:</div>
                    <ul className="space-y-1 text-xs">
                      <li>• Clear objectives and success metrics</li>
                      <li>• Reasonable timeline and rewards</li>
                      <li>• Engaging and valuable quests</li>
                      <li>• Professional sponsor information</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium text-foreground mb-1">Review Process:</div>
                    <ul className="space-y-1 text-xs">
                      <li>• Campaigns reviewed within 48-72 hours</li>
                      <li>• Must align with community values</li>
                      <li>• Sponsor verification may be required</li>
                      <li>• Token rewards held in escrow</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium text-foreground mb-1">After Approval:</div>
                    <ul className="space-y-1 text-xs">
                      <li>• Create individual quests for your campaign</li>
                      <li>• Monitor participant progress</li>
                      <li>• Distribute rewards as quests are completed</li>
                      <li>• Engage with the community</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Warning */}
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-orange-800">
                      <div className="font-medium mb-1">Token Escrow</div>
                      <div className="text-xs">
                        Token rewards will be held in escrow until campaign completion. Ensure you have sufficient
                        tokens in your wallet before campaign approval.
                      </div>
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
