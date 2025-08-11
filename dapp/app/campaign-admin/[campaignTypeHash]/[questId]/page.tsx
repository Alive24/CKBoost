"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ArrowLeft,
  Trophy,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Edit,
  Save,
  X,
  DollarSign,
  FileText,
  Star,
  Target
} from "lucide-react"
import Link from "next/link"
import { ccc } from "@ckb-ccc/core"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { fetchCampaignByTypeHash } from "@/lib/ckb/campaign-cells"
import { CampaignData } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"

export default function QuestManagementPage() {
  const params = useParams()
  const campaignTypeHash = params.campaignTypeHash as string
  const questId = params.questId as string
  const { signer, isAdmin } = useProtocol()
  const [campaign, setCampaign] = useState<any>(null)
  const [quest, setQuest] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("details")
  const [isEditing, setIsEditing] = useState(false)
  const [fundingAmount, setFundingAmount] = useState("")
  const [isFunding, setIsFunding] = useState(false)

  useEffect(() => {
    const fetchCampaignAndQuest = async () => {
      if (!signer || !campaignTypeHash) {
        debug.warn("No signer or campaign type hash available")
        setIsLoading(false)
        return
      }

      try {
        debug.log("Fetching campaign and quest:", { campaignTypeHash, questId })
        const campaignCell = await fetchCampaignByTypeHash(campaignTypeHash as ccc.Hex, signer)
        
        if (campaignCell) {
          const campaignData = CampaignData.decode(campaignCell.outputData)
          setCampaign({
            ...campaignData,
            typeHash: campaignTypeHash,
            cell: campaignCell
          })
          
          // Find the specific quest
          const questIndex = parseInt(questId) - 1
          if (campaignData.quests && campaignData.quests[questIndex]) {
            setQuest({
              ...campaignData.quests[questIndex],
              id: questId,
              campaignTypeHash
            })
          }
        }
      } catch (error) {
        debug.error("Failed to fetch campaign and quest:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCampaignAndQuest()
  }, [signer, campaignTypeHash, questId])

  const handleFundQuest = async () => {
    if (!fundingAmount || parseFloat(fundingAmount) <= 0) {
      alert("Please enter a valid funding amount")
      return
    }

    setIsFunding(true)
    try {
      // TODO: Implement actual blockchain funding transaction
      debug.log("Funding quest:", { questId, amount: fundingAmount })
      alert(`Funding ${fundingAmount} CKB to quest (blockchain transaction not implemented yet)`)
      setFundingAmount("")
    } catch (error) {
      debug.error("Failed to fund quest:", error)
      alert("Failed to fund quest")
    } finally {
      setIsFunding(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading quest details...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!quest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-2xl font-bold mb-2">Quest Not Found</h2>
                <p className="text-muted-foreground mb-6">
                  The quest you're looking for doesn't exist in this campaign.
                </p>
                <Link href={`/campaign-admin/${campaignTypeHash}`}>
                  <Button>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Campaign
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const questPoints = Number(quest.points) || 100
  const questDifficulty = quest.metadata?.difficulty ? Number(quest.metadata.difficulty) : "Medium"

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <Link href={`/campaign-admin/${campaignTypeHash}`}>
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaign Management
            </Button>
          </Link>

          {/* Quest Header */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {quest.metadata?.title || quest.title || `Quest ${questId}`}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Campaign: {campaign?.metadata?.title || "Untitled Campaign"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Quest
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => setIsEditing(false)} variant="outline">
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button className="bg-green-600 hover:bg-green-700">
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{questPoints}</div>
                  <p className="text-sm text-muted-foreground">Points</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{quest.sub_tasks?.length || 0}</div>
                  <p className="text-sm text-muted-foreground">Subtasks</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-sm text-muted-foreground">Completions</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-sm text-muted-foreground">Pending Reviews</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quest Management Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="subtasks">Subtasks</TabsTrigger>
              <TabsTrigger value="funding">Funding</TabsTrigger>
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Description</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {quest.metadata?.short_description || quest.metadata?.long_description || "No description available"}
                    </p>
                  </div>
                  
                  {quest.metadata?.requirements && (
                    <div>
                      <Label>Requirements</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {quest.metadata.requirements}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Difficulty</Label>
                      <p className="text-sm text-muted-foreground mt-1">{questDifficulty}</p>
                    </div>
                    <div>
                      <Label>Time Estimate</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {quest.metadata?.time_estimate ? `${Number(quest.metadata.time_estimate)} mins` : "Flexible"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subtasks" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Subtasks</CardTitle>
                  <CardDescription>
                    Manage the subtasks that make up this quest
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {quest.sub_tasks && quest.sub_tasks.length > 0 ? (
                    <div className="space-y-3">
                      {quest.sub_tasks.map((subtask: any, index: number) => (
                        <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium">{Number(subtask.id) || index + 1}</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{subtask.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {subtask.description}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline">Type: {subtask.type}</Badge>
                              {subtask.proof_required && (
                                <Badge variant="outline">Proof: {subtask.proof_required}</Badge>
                              )}
                            </div>
                          </div>
                          {isEditing && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline">
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">No subtasks defined for this quest</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="funding" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Funding</CardTitle>
                  <CardDescription>
                    Manage the reward pool for this quest
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Current Funding</span>
                      <span className="text-2xl font-bold">0 CKB</span>
                    </div>
                    <Progress value={0} className="h-2 mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Required: {questPoints * 10} CKB (estimated)
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label>Add Funding</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount in CKB"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(e.target.value)}
                        disabled={isFunding}
                      />
                      <Button 
                        onClick={handleFundQuest}
                        disabled={isFunding || !fundingAmount}
                      >
                        {isFunding ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Funding...
                          </>
                        ) : (
                          <>
                            <DollarSign className="w-4 h-4 mr-2" />
                            Fund Quest
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Funding History</h4>
                    <p className="text-sm text-muted-foreground">No funding transactions yet</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="submissions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Submissions</CardTitle>
                  <CardDescription>
                    Review and manage user submissions for this quest
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No submissions yet</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}