"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Plus, Trash2, Info, AlertTriangle, Calendar, Loader2, CheckCircle, Save, X } from "lucide-react"
import Link from "next/link"
import { ccc, ScriptLike } from "@ckb-ccc/connector-react"
import type { CampaignDataLike, EndorserInfoLike, UDTAssetLike } from "ssri-ckboost/types"
// import { useCampaignDraft } from "@/lib/hooks/use-campaign-draft"

// Simplified form data interface
export interface SimplifiedCampaignFormData {
  title: string
  shortDescription: string
  longDescription: string
  categories: string[]
  difficulty: string
  startDate: string
  endDate: string
  totalPoints: string
  logo: string
  rules: string[]
}

interface CampaignFormProps {
  mode: 'create' | 'edit' | 'inline'  // Added 'inline' mode for embedded editing
  campaignTypeHash?: string
  initialData?: CampaignDataLike
  onSubmit: (data: SimplifiedCampaignFormData | CampaignDataLike) => Promise<void>
  onCancel?: () => void
  currentWalletEndorser?: EndorserInfoLike | null
  simplified?: boolean  // If true, returns SimplifiedCampaignFormData
  submitLabel?: string
  className?: string
}

export function CampaignForm({ 
  mode, 
  campaignTypeHash, 
  initialData, 
  onSubmit,
  currentWalletEndorser
}: CampaignFormProps) {
  // Draft functionality temporarily disabled
  // const { draft, saveDraft, deleteDraft, autoSave } = useCampaignDraft(campaignTypeHash)
  
  // Form state - initialize from draft or initial data
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
  const [ckbReward, setCkbReward] = useState<string>("0")
  const [nftRewards, setNftRewards] = useState<ScriptLike[]>([])
  const [udtRewards, setUdtRewards] = useState<Array<{ amount: string; udt_script: ScriptLike }>>([])
  const [rules, setRules] = useState([""])
  
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
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showDraftSaved, setShowDraftSaved] = useState(false)

  // Initialize form from initial data
  useEffect(() => {
    if (initialData) {
      // Load from existing campaign data for editing
      // TODO: Convert CampaignDataLike back to form data
      // This would involve decoding the hex strings back to regular strings
    }
  }, [initialData])

  // Save draft functionality temporarily disabled
  const saveCurrentDraft = useCallback(() => {
    // TODO: Implement draft saving with CampaignDataLike
    console.log('Draft saving temporarily disabled')
  }, [formData, ckbReward, nftRewards, udtRewards, rules, quests])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentWalletEndorser) {
      setSubmitError("You must be an authorized endorser to create campaigns")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Build campaign data from form
      // TODO: Implement proper conversion from form data to CampaignDataLike
      const partialCampaignData = {} as Partial<CampaignDataLike>
      
      // Complete the campaign data
      const campaignData: CampaignDataLike = {
        endorser: currentWalletEndorser,
        created_at: ccc.numFrom(Date.now()),
        starting_time: ccc.numFrom(new Date(formData.startDate).getTime()),
        ending_time: ccc.numFrom(new Date(formData.endDate).getTime()),
        status: 0,
        participants_count: 0,
        total_completions: 0,
        ...partialCampaignData
      } as CampaignDataLike

      await onSubmit(campaignData)
      
      // Draft deletion temporarily disabled
      // deleteDraft()
    } catch (error) {
      console.error("Failed to submit campaign:", error)
      setSubmitError(error instanceof Error ? error.message : "Failed to submit campaign")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Rule management functions
  const addRule = () => setRules([...rules, ""])
  const removeRule = (index: number) => setRules(rules.filter((_, i) => i !== index))
  const updateRule = (index: number, value: string) => {
    const newRules = [...rules]
    newRules[index] = value
    setRules(newRules)
  }

  // NFT reward functions
  const addNftReward = () => {
    setNftRewards([...nftRewards, { 
      codeHash: "0x" + "00".repeat(32), 
      hashType: "type", 
      args: "0x00"
    }])
  }

  const removeNftReward = (index: number) => {
    setNftRewards(nftRewards.filter((_, i) => i !== index))
  }

  const updateNftReward = (index: number, field: keyof ScriptLike, value: string) => {
    const newRewards = [...nftRewards]
    if (field === 'args' && value === '') {
      newRewards[index] = { ...newRewards[index], args: '0x00' }
    } else if (field === 'codeHash' && value === '') {
      newRewards[index] = { ...newRewards[index], codeHash: '0x' + '00'.repeat(32) }
    } else {
      newRewards[index] = { ...newRewards[index], [field]: value }
    }
    setNftRewards(newRewards)
  }

  // UDT reward functions
  const addUdtReward = () => {
    setUdtRewards([...udtRewards, { 
      amount: "0",
      udt_script: {
        codeHash: "0x" + "00".repeat(32),
        hashType: "type",
        args: "0x00"
      }
    }])
  }

  const removeUdtReward = (index: number) => {
    setUdtRewards(udtRewards.filter((_, i) => i !== index))
  }

  const updateUdtReward = (index: number, field: string, value: string) => {
    const newRewards = [...udtRewards]
    if (field === 'amount') {
      newRewards[index] = { ...newRewards[index], amount: value }
    } else if (field.startsWith('udt_script.')) {
      const scriptField = field.replace('udt_script.', '') as keyof ScriptLike
      if (scriptField === 'args' && value === '') {
        newRewards[index] = { 
          ...newRewards[index], 
          udt_script: { ...newRewards[index].udt_script, args: '0x00' }
        }
      } else if (scriptField === 'codeHash' && value === '') {
        newRewards[index] = { 
          ...newRewards[index], 
          udt_script: { ...newRewards[index].udt_script, codeHash: '0x' + '00'.repeat(32) }
        }
      } else {
        newRewards[index] = { 
          ...newRewards[index], 
          udt_script: { ...newRewards[index].udt_script, [scriptField]: value }
        }
      }
    }
    setUdtRewards(newRewards)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Draft Save Indicator */}
            {showDraftSaved && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Draft saved successfully
                </AlertDescription>
              </Alert>
            )}

            {/* Form Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {mode === 'create' ? 'Create New Campaign' : 'Edit Campaign'}
              </h1>
              <Button
                type="button"
                variant="outline"
                onClick={saveCurrentDraft}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                Save Draft
              </Button>
            </div>

            {/* Error Display */}
            {submitError && (
              <Alert className="bg-red-50 border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{submitError}</AlertDescription>
              </Alert>
            )}

            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Campaign Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Enter an eye-catching campaign title"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="shortDescription">Short Description</Label>
                  <Input
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                    placeholder="Brief description for campaign cards (max 100 chars)"
                    maxLength={100}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="longDescription">Long Description</Label>
                  <Textarea
                    id="longDescription"
                    value={formData.longDescription}
                    onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })}
                    placeholder="Detailed description of your campaign, objectives, and rewards..."
                    className="h-32"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DeFi">DeFi</SelectItem>
                        <SelectItem value="Gaming">Gaming</SelectItem>
                        <SelectItem value="Social">Social</SelectItem>
                        <SelectItem value="Education">Education</SelectItem>
                        <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Select
                      value={formData.difficulty}
                      onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
                    >
                      <SelectTrigger id="difficulty">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="datetime-local"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="logo">Campaign Logo (Emoji or Symbol)</Label>
                  <Input
                    id="logo"
                    value={formData.logo}
                    onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                    placeholder="e.g., 🚀, 🎮, 💰"
                    maxLength={4}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Rewards Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Rewards Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Total Points */}
                <div>
                  <Label htmlFor="totalPoints">Total Campaign Points</Label>
                  <Input
                    id="totalPoints"
                    type="number"
                    value={formData.totalPoints}
                    onChange={(e) => setFormData({ ...formData, totalPoints: e.target.value })}
                    placeholder="e.g., 10000"
                    min="0"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Total points available for distribution across all quests
                  </p>
                </div>

                {/* CKB Rewards */}
                <div>
                  <Label htmlFor="ckbReward">CKB Rewards (optional)</Label>
                  <Input
                    id="ckbReward"
                    type="number"
                    value={ckbReward}
                    onChange={(e) => setCkbReward(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Amount in CKB</p>
                </div>

                {/* NFT Rewards */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>NFT Rewards (optional)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addNftReward}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add NFT
                    </Button>
                  </div>
                  {nftRewards.map((nft, index) => (
                    <Card key={index} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">NFT {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeNftReward(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          placeholder="Code Hash (0x...)"
                          value={ccc.hexFrom(nft.codeHash)}
                          onChange={(e) => updateNftReward(index, 'codeHash', e.target.value)}
                        />
                        <Input
                          placeholder="Args (0x...)"
                          value={ccc.hexFrom(nft.args)}
                          onChange={(e) => updateNftReward(index, 'args', e.target.value)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>

                {/* UDT Rewards */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Token Rewards (optional)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addUdtReward}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Token
                    </Button>
                  </div>
                  {udtRewards.map((udt, index) => (
                    <Card key={index} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Token {index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeUdtReward(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={udt.amount}
                          onChange={(e) => updateUdtReward(index, 'amount', e.target.value)}
                        />
                        <Input
                          placeholder="Token Code Hash (0x...)"
                          value={ccc.hexFrom(udt.udt_script.codeHash)}
                          onChange={(e) => updateUdtReward(index, 'udt_script.codeHash', e.target.value)}
                        />
                        <Input
                          placeholder="Token Args (0x...)"
                          value={ccc.hexFrom(udt.udt_script.args)}
                          onChange={(e) => updateUdtReward(index, 'udt_script.args', e.target.value)}
                        />
                      </div>
                    </Card>
                  ))}
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
            <div className="flex justify-end gap-4">
              {lastSaved && (
                <p className="text-sm text-muted-foreground flex items-center">
                  Last saved: {lastSaved.toLocaleTimeString()}
                </p>
              )}
              <Button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                disabled={isSubmitting || !currentWalletEndorser}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {mode === 'create' ? 'Creating Campaign...' : 'Updating Campaign...'}
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    {mode === 'create' ? 'Create Campaign On-Chain' : 'Update Campaign'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Sidebar */}
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
                        {formData.category || "Category"} • {formData.difficulty || "Difficulty"}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm">{formData.shortDescription || "Short description..."}</p>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="font-medium">Points:</span> {formData.totalPoints || "0"}
                    </div>
                    <div>
                      <span className="font-medium">Quests:</span> {quests.length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Guidelines */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  Campaign Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3 text-muted-foreground">
                <div>
                  <div className="font-medium text-foreground mb-1">Requirements:</div>
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
      </form>

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