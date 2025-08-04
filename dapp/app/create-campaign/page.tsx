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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Plus, Trash2, Info, AlertTriangle, Calendar, Loader2, CheckCircle } from "lucide-react"
import Link from "next/link"
import { ccc, ScriptLike } from "@ckb-ccc/connector-react"
import { CampaignService } from "@/lib/services/campaign-service"
import { useProtocol } from "@/lib/providers/protocol-provider"
import type { 
  AssetListLike, 
  CampaignDataLike, 
  EndorserInfoLike, 
  UDTAssetLike,
  QuestDataLike,
  QuestSubTaskDataLike,
  QuestMetadataLike,
} from "ssri-ckboost/types"
import { useCampaign } from "@/lib/providers/campaign-provider"

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
  })

  // Separate state for different reward types
  const [ckbReward, setCkbReward] = useState<ccc.Num>(0n)
  const [nftRewards, setNftRewards] = useState<ScriptLike[]>([])
  const [udtRewards, setUdtRewards] = useState<UDTAssetLike[]>([])
  const [rules, setRules] = useState([""])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [availableEndorsers, setAvailableEndorsers] = useState<EndorserInfoLike[]>([])
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [currentWalletEndorser, setCurrentWalletEndorser] = useState<EndorserInfoLike | null>(null)
  const [endorserCheckComplete, setEndorserCheckComplete] = useState(false)
  
  // Quest state
  const [quests, setQuests] = useState<Array<{
    title: string
    description: string
    points: number
    subtasks: Array<{
      title: string
      type: string
      description: string
      proofRequired: string
    }>
  }>>([])
  const [showQuestForm, setShowQuestForm] = useState(false)

  const { campaign, campaignService, isLoading, error } = useCampaign()

  // Check wallet connection status
  useEffect(() => {
    setIsWalletConnected(!!signer)
  }, [signer])

  // Load available endorsers and check if current wallet is an endorser
  useEffect(() => {
    if (protocolData?.endorsers_whitelist) {
      setAvailableEndorsers(protocolData.endorsers_whitelist as EndorserInfoLike[])
      
      // Check if connected wallet is an endorser
      if (signer) {
        const checkEndorserStatus = async () => {
          try {
            const addressObj = await signer.getRecommendedAddressObj()
            const lockScript = addressObj.script
            const lockHash = lockScript.hash()
            
            // Find if current wallet is in endorsers list
            const endorser = protocolData.endorsers_whitelist.find(e => {
              const endorserLockHash = typeof e.endorser_lock_hash === 'string' 
                ? e.endorser_lock_hash 
                : ccc.hexFrom(e.endorser_lock_hash);
              
              // Compare without considering case and 0x prefix
              const normalizedEndorserHash = endorserLockHash.toLowerCase().replace(/^0x/, '');
              const normalizedWalletHash = lockHash.toLowerCase().replace(/^0x/, '');
              
              return normalizedEndorserHash === normalizedWalletHash;
            })
            
            setCurrentWalletEndorser(endorser || null)
          } catch (error) {
            console.error("Error checking endorser status:", error)
            setCurrentWalletEndorser(null)
          }
        }
        
        checkEndorserStatus()
      } else {
        setCurrentWalletEndorser(null)
      }
    }
  }, [protocolData, signer])

  // Give the endorser check a moment to complete
  useEffect(() => {
    if (isWalletConnected && protocolData && !protocolLoading) {
      const timer = setTimeout(() => {
        setEndorserCheckComplete(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isWalletConnected, protocolData, protocolLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    console.log("=== CAMPAIGN SUBMISSION STARTED ===")
    console.log("Form data:", formData)
    console.log("CKB Reward:", ckbReward.toString())
    console.log("NFT Rewards:", nftRewards)
    console.log("UDT Rewards:", udtRewards)
    console.log("Rules:", rules)

    try {
      // Validate required fields
      if (!formData.title || !formData.shortDescription || !formData.longDescription || 
          !formData.category || !formData.difficulty || !formData.startDate || 
          !formData.endDate || !formData.totalPoints) {
        throw new Error("Please fill in all required fields")
      }

      if (!signer) {
        throw new Error("Please connect your wallet to create a campaign")
      }

      if (!currentWalletEndorser) {
        throw new Error("Your wallet is not registered as an endorser. Only approved endorsers can create campaigns.")
      }

      if (!campaignService) {
        throw new Error("Campaign service not available. Please ensure your wallet is connected.")
      }

      console.log("=== BUILDING CAMPAIGN DATA ===")
      console.log("Current wallet endorser:", currentWalletEndorser)

      // Log string values (strings are sent as-is, encoding happens in the ssri-ckboost library)
      console.log("String values to be sent:")
      console.log("Title:", formData.title)
      console.log("Short desc:", formData.shortDescription)
      console.log("Long desc:", formData.longDescription)
      console.log("Category:", formData.category)
      console.log("Logo:", formData.logo)
      console.log("Rules:", rules.filter(rule => rule.trim()))

      const campaignData: CampaignDataLike = {
        endorser: {
          ...currentWalletEndorser,
          endorser_name: ccc.hexFrom(ccc.bytesFrom(currentWalletEndorser.endorser_name, "utf8")),
          endorser_description: ccc.hexFrom(ccc.bytesFrom(currentWalletEndorser.endorser_description, "utf8")),
          website: ccc.hexFrom(ccc.bytesFrom(currentWalletEndorser.website || "", "utf8")),
          social_links: currentWalletEndorser.social_links.map(link => ccc.hexFrom(ccc.bytesFrom(link, "utf8"))),
        },
        created_at: ccc.numFrom(Date.now()),
        starting_time: ccc.numFrom(new Date(formData.startDate).getTime()),
        ending_time: ccc.numFrom(new Date(formData.endDate).getTime()),
        rules: rules.filter(rule => rule.trim()).map(rule => ccc.hexFrom(ccc.bytesFrom(rule, "utf8"))),
        metadata: {
          verification_requirements: [], // No special requirements for now
          last_updated: ccc.numFrom(Date.now()),
          categories: [ccc.hexFrom(ccc.bytesFrom(formData.category, "utf8"))],
          difficulty: formData.difficulty === "Easy" ? 1 : formData.difficulty === "Medium" ? 2 : 3,
          title: ccc.hexFrom(ccc.bytesFrom(formData.title, "utf8")),
          endorser_info: {
            ...currentWalletEndorser,
            endorser_name: ccc.hexFrom(ccc.bytesFrom(currentWalletEndorser.endorser_name, "utf8")),
            endorser_description: ccc.hexFrom(ccc.bytesFrom(currentWalletEndorser.endorser_description, "utf8")),
            website: ccc.hexFrom(ccc.bytesFrom(currentWalletEndorser.website || "", "utf8")),
            social_links: currentWalletEndorser.social_links.map(link => ccc.hexFrom(ccc.bytesFrom(link, "utf8"))),
          },
          image_url: ccc.hexFrom(ccc.bytesFrom(formData.logo, "utf8")),
          short_description: ccc.hexFrom(ccc.bytesFrom(formData.shortDescription, "utf8")),
          long_description: ccc.hexFrom(ccc.bytesFrom(formData.longDescription, "utf8")),
          total_rewards: {
            points_amount: ccc.numFrom(formData.totalPoints || "0"),
            ckb_amount: ckbReward,
            nft_assets: nftRewards,
            udt_assets: udtRewards
          }
        },
        status: 0, // Created status
        participants_count: 0,
        total_completions: 0,
        quests: []
      }

      console.log("=== FINAL CAMPAIGN DATA ===")
      console.log(JSON.stringify(campaignData, (key, value) => {
        // Convert BigInt to string for logging
        if (typeof value === 'bigint') {
          return value.toString() + 'n'
        }
        return value
      }, 2))
      
      // Additional debugging - check data types
      console.log("=== DATA TYPE CHECKS ===")
      console.log("title type:", typeof campaignData.metadata.title)
      console.log("title value:", campaignData.metadata.title)
      console.log("short_description type:", typeof campaignData.metadata.short_description)
      console.log("short_description value:", campaignData.metadata.short_description)
      console.log("rules[0] type:", typeof campaignData.rules[0])
      console.log("rules[0] value:", campaignData.rules[0])

      // Create campaign using campaign service
      console.log("Calling campaignService.updateCampaign...")
      const txHash = await campaignService.updateCampaign(
        campaignData,
      ) 

      console.log("=== CAMPAIGN CREATED SUCCESSFULLY ===")
      console.log("Transaction hash:", txHash)
      setIsSubmitted(true)

      // Reset form after success
      setTimeout(() => {
        resetForm()
      }, 5000)

    } catch (error) {
      console.error("=== CAMPAIGN CREATION FAILED ===")
      console.error("Error:", error)
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace')
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
    })
    setCkbReward(0n)
    setNftRewards([])
    setUdtRewards([])
    setRules([""])
    setIsSubmitted(false)
    setSubmitError(null)
  }

  // NFT reward functions
  const addNftReward = () => {
    setNftRewards([...nftRewards, { 
      codeHash: "0x" + "00".repeat(32), 
      hashType: "type", 
      args: "0x00" // Empty args should still be valid hex
    }])
  }

  const removeNftReward = (index: number) => {
    setNftRewards(nftRewards.filter((_, i) => i !== index))
  }

  const updateNftReward = (index: number, field: keyof ScriptLike, value: string) => {
    const newRewards = [...nftRewards]
    // Handle empty args - convert to minimal valid hex
    if (field === 'args' && value === '') {
      newRewards[index] = { ...newRewards[index], args: '0x00' }
    } else if (field === 'codeHash' && value === '') {
      // For codeHash, use zero hash if empty
      newRewards[index] = { ...newRewards[index], codeHash: '0x' + '00'.repeat(32) }
    } else {
      newRewards[index] = { ...newRewards[index], [field]: value }
    }
    setNftRewards(newRewards)
  }

  // UDT reward functions
  const addUdtReward = () => {
    setUdtRewards([...udtRewards, { 
      amount: 0n,
      udt_script: {
        codeHash: "0x" + "00".repeat(32),
        hashType: "type",
        args: "0x00" // Empty args should still be valid hex
      }
    }])
  }

  const removeUdtReward = (index: number) => {
    setUdtRewards(udtRewards.filter((_, i) => i !== index))
  }

  const updateUdtReward = (index: number, field: string, value: string) => {
    const newRewards = [...udtRewards]
    if (field === 'amount') {
      newRewards[index] = { ...newRewards[index], amount: BigInt(value || 0) }
    } else if (field === 'codeHash') {
      // Handle empty codeHash
      const codeHashValue = value === '' ? '0x' + '00'.repeat(32) : value
      newRewards[index] = { 
        ...newRewards[index], 
        udt_script: { ...newRewards[index].udt_script, codeHash: codeHashValue }
      }
    } else if (field === 'args') {
      // Handle empty args - convert to minimal valid hex
      const argsValue = value === '' ? '0x00' : value
      newRewards[index] = { 
        ...newRewards[index], 
        udt_script: { ...newRewards[index].udt_script, args: argsValue }
      }
    }
    setUdtRewards(newRewards)
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
  
  // Show error if wallet is connected but not an endorser
  if (isWalletConnected && protocolData && !protocolLoading && endorserCheckComplete && !currentWalletEndorser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-6">🔒</div>
            <h1 className="text-3xl font-bold mb-4">Not Authorized</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Your wallet is not registered as an endorser. Only approved endorsers can create campaigns.
            </p>
            <Alert className="mb-6 border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                To become an endorser, please contact the CKBoost protocol administrators.
              </AlertDescription>
            </Alert>
            <div className="flex gap-4 justify-center">
              <Link href="/">
                <Button variant="outline">View Campaigns</Button>
              </Link>
              <Link href="/platform-admin">
                <Button>Apply for Endorser Status</Button>
              </Link>
            </div>
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

                    {/* CKB Rewards */}
                    <div className="space-y-2">
                      <Label htmlFor="ckbReward">CKB Reward (Optional)</Label>
                      <Input
                        id="ckbReward"
                        type="number"
                        value={ckbReward === 0n ? "" : (Number(ckbReward) / 100000000).toString()}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "") {
                            setCkbReward(0n);
                          } else {
                            const ckbAmount = parseFloat(value);
                            if (!isNaN(ckbAmount) && ckbAmount >= 0) {
                              setCkbReward(BigInt(Math.floor(ckbAmount * 100000000)));
                            }
                          }
                        }}
                        placeholder="Amount in CKB (e.g., 1000)"
                        min="0"
                        step="1"
                      />
                      <p className="text-sm text-muted-foreground">
                        Total CKB funding target for the campaign
                      </p>
                    </div>

                    {/* NFT Rewards */}
                    <div className="space-y-4">
                      <div>
                        <Label>NFT Rewards (Optional)</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Add NFT assets to be managed by the campaign. Leave args empty to create a new connected type hash.
                        </p>
                      </div>
                      {nftRewards.map((nft, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={typeof nft.codeHash === 'string' ? nft.codeHash : ccc.hexFrom(nft.codeHash)}
                              onChange={(e) => updateNftReward(index, "codeHash", e.target.value)}
                              placeholder="NFT Type Script Code Hash (0x...)"
                            />
                            <Input
                              value={typeof nft.args === 'string' ? nft.args : ccc.hexFrom(nft.args)}
                              onChange={(e) => updateNftReward(index, "args", e.target.value)}
                              placeholder="NFT Args (0x...)"
                              className="w-48"
                            />
                            {nftRewards.length > 0 && (
                              <Button type="button" variant="outline" size="sm" onClick={() => removeNftReward(index)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addNftReward}
                        className="w-full bg-transparent"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add NFT Reward
                      </Button>
                    </div>

                    {/* UDT Rewards */}
                    <div className="space-y-4">
                      <div>
                        <Label>UDT (Token) Rewards (Optional)</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Add User Defined Tokens to be managed by the campaign. Leave args empty to create a new connected type hash.
                        </p>
                      </div>
                      {udtRewards.map((udt, index) => (
                        <div key={index} className="space-y-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={udt.amount === 0n ? "" : udt.amount.toString()}
                                onChange={(e) => updateUdtReward(index, "amount", e.target.value)}
                                placeholder="Amount"
                                min="1"
                                className="w-32"
                              />
                              <Input
                                value={typeof udt.udt_script.codeHash === 'string' ? udt.udt_script.codeHash : ccc.hexFrom(udt.udt_script.codeHash)}
                                onChange={(e) => updateUdtReward(index, "codeHash", e.target.value)}
                                placeholder="UDT Type Script Code Hash (0x...)"
                              />
                              <Input
                                value={typeof udt.udt_script.args === 'string' ? udt.udt_script.args : ccc.hexFrom(udt.udt_script.args)}
                                onChange={(e) => updateUdtReward(index, "args", e.target.value)}
                                placeholder="UDT Args (0x...)"
                                className="w-48"
                              />
                              {udtRewards.length > 0 && (
                                <Button type="button" variant="outline" size="sm" onClick={() => removeUdtReward(index)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addUdtReward}
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

                {/* Campaign Quests */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Quests</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {quests.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        No quests added yet. Add quests to define tasks for participants.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {quests.map((quest, index) => (
                          <div key={index} className="border rounded-lg p-4 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold">{quest.title}</h4>
                                <p className="text-sm text-muted-foreground">{quest.description}</p>
                                <p className="text-sm mt-1">
                                  <span className="font-medium">Points:</span> {quest.points}
                                </p>
                                <p className="text-sm">
                                  <span className="font-medium">Subtasks:</span> {quest.subtasks.length}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setQuests(quests.filter((_, i) => i !== index))
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowQuestForm(true)}
                      className="w-full bg-transparent"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Quest
                    </Button>
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !currentWalletEndorser}
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
                          {currentWalletEndorser ? (() => {
                            let displayName = "Unknown Endorser";
                            if (currentWalletEndorser.endorser_name) {
                              const nameValue = currentWalletEndorser.endorser_name as any;
                              if (typeof nameValue === 'string') {
                                // Check if it's a hex string that needs decoding
                                if (nameValue.startsWith('0x')) {
                                  try {
                                    displayName = new TextDecoder().decode(
                                      new Uint8Array(Buffer.from(nameValue.slice(2), 'hex'))
                                    );
                                  } catch {
                                    displayName = nameValue;
                                  }
                                } else {
                                  displayName = nameValue;
                                }
                              } else {
                                // Try to convert to string if it's not already
                                try {
                                  displayName = String(nameValue);
                                } catch {
                                  displayName = "Unknown Endorser";
                                }
                              }
                            }
                            
                            return `Endorsed by ${displayName}`;
                          })() : "Endorsed by your wallet"}
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
                      {ckbReward > 0n && (
                        <div className="text-green-600 font-semibold text-sm">
                          💰 {(Number(ckbReward) / 100000000).toFixed(2)} CKB
                        </div>
                      )}
                      {nftRewards
                        .filter((nft) => nft.codeHash !== "0x" + "00".repeat(32))
                        .map((nft, index) => {
                          const argsStr = typeof nft.args === 'string' ? nft.args : ccc.hexFrom(nft.args);
                          return (
                            <div key={`nft-${index}`} className="text-purple-600 font-semibold text-sm">
                              🎨 NFT {argsStr.length > 10 ? argsStr.slice(0, 10) + "..." : argsStr}
                            </div>
                          );
                        })}
                      {udtRewards
                        .filter((udt) => {
                          const amount = typeof udt.amount === 'bigint' ? udt.amount : ccc.numFrom(udt.amount);
                          return amount > 0n;
                        })
                        .map((udt, index) => {
                          const amount = typeof udt.amount === 'bigint' ? udt.amount : ccc.numFrom(udt.amount);
                          return (
                            <div key={`udt-${index}`} className="text-blue-600 font-semibold text-sm">
                              🪙 {amount.toString()} UDT
                            </div>
                          );
                        })}
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

      {/* Quest Creation Dialog */}
      <Dialog open={showQuestForm} onOpenChange={setShowQuestForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Quest</DialogTitle>
          </DialogHeader>
          <QuestCreationForm
            onSave={(quest) => {
              setQuests([...quests, quest])
              setShowQuestForm(false)
            }}
            onCancel={() => setShowQuestForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Quest Creation Form Component
function QuestCreationForm({ 
  onSave, 
  onCancel 
}: { 
  onSave: (quest: {
    title: string
    description: string
    points: number
    subtasks: Array<{
      title: string
      type: string
      description: string
      proofRequired: string
    }>
  }) => void
  onCancel: () => void
}) {
  const [questData, setQuestData] = useState({
    title: "",
    description: "",
    points: 0,
  })
  const [subtasks, setSubtasks] = useState<Array<{
    title: string
    type: string
    description: string
    proofRequired: string
  }>>([])

  const addSubtask = () => {
    setSubtasks([...subtasks, {
      title: "",
      type: "social",
      description: "",
      proofRequired: ""
    }])
  }

  const updateSubtask = (index: number, field: string, value: string) => {
    const newSubtasks = [...subtasks]
    newSubtasks[index] = { ...newSubtasks[index], [field]: value }
    setSubtasks(newSubtasks)
  }

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...questData,
      subtasks
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="quest-title">Quest Title</Label>
        <Input
          id="quest-title"
          value={questData.title}
          onChange={(e) => setQuestData({ ...questData, title: e.target.value })}
          placeholder="e.g., Complete Social Media Tasks"
          required
        />
      </div>

      <div>
        <Label htmlFor="quest-description">Quest Description</Label>
        <Textarea
          id="quest-description"
          value={questData.description}
          onChange={(e) => setQuestData({ ...questData, description: e.target.value })}
          placeholder="Describe what participants need to do..."
          className="h-20"
          required
        />
      </div>

      <div>
        <Label htmlFor="quest-points">Points Reward</Label>
        <Input
          id="quest-points"
          type="number"
          value={questData.points}
          onChange={(e) => setQuestData({ ...questData, points: parseInt(e.target.value) || 0 })}
          placeholder="100"
          min="0"
          required
        />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label>Subtasks</Label>
          <Button type="button" variant="outline" size="sm" onClick={addSubtask}>
            <Plus className="w-4 h-4 mr-1" />
            Add Subtask
          </Button>
        </div>

        {subtasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
            No subtasks yet. Add subtasks to break down the quest into steps.
          </p>
        ) : (
          <div className="space-y-3">
            {subtasks.map((subtask, index) => (
              <Card key={index}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium">Subtask {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSubtask(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={subtask.title}
                        onChange={(e) => updateSubtask(index, "title", e.target.value)}
                        placeholder="e.g., Follow on Twitter"
                        required
                      />
                    </div>

                    <div>
                      <Label>Type</Label>
                      <Select
                        value={subtask.type}
                        onValueChange={(value) => updateSubtask(index, "type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="social">Social</SelectItem>
                          <SelectItem value="technical">Technical</SelectItem>
                          <SelectItem value="onchain">On-chain</SelectItem>
                          <SelectItem value="content">Content</SelectItem>
                          <SelectItem value="research">Research</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={subtask.description}
                      onChange={(e) => updateSubtask(index, "description", e.target.value)}
                      placeholder="Detailed instructions..."
                      className="h-16"
                      required
                    />
                  </div>

                  <div>
                    <Label>Proof Required</Label>
                    <Input
                      value={subtask.proofRequired}
                      onChange={(e) => updateSubtask(index, "proofRequired", e.target.value)}
                      placeholder="e.g., Screenshot of follow confirmation"
                      required
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          Create Quest
        </Button>
      </DialogFooter>
    </form>
  )
}
