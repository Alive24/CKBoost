/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { 
  Plus, 
  Edit, 
  Eye, 
  Users, 
  Trophy, 
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
  Target,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Sparkles
} from "lucide-react"
import Link from "next/link"
import { ccc } from "@ckb-ccc/core"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { useCampaign } from "@/lib/providers/campaign-provider"
import type { ProtocolDataLike } from "ssri-ckboost/types"
import { extractTypeIdFromCampaignCell, isCampaignApproved } from "@/lib/ckb/campaign-cells"
import { CampaignData, CampaignDataLike } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"
import { getDifficultyString } from "@/lib"
import { CampaignService } from "@/lib/services/campaign-service"
import { Campaign } from "ssri-ckboost"
import { deploymentManager, DeploymentManager } from "@/lib/ckb/deployment-manager"

// Type for simplified campaign form data
interface CampaignFormData {
  title: string
  shortDescription: string
  longDescription: string
  categories: string[]
  difficulty: number
  startDate: string
  endDate: string
  totalPoints: string
  logo: string
  rules: string[]
}

export default function CampaignManagementPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const campaignTypeId = params.campaignTypeId as string
  const isCreateMode = campaignTypeId === 'new'
  const { signer, protocolData, protocolCell, isAdmin, updateProtocol, refreshProtocolData } = useProtocol()
  
  // Get the initial tab from URL search params (e.g., ?tab=quests)
  const initialTab = searchParams.get('tab') || 'overview'
  const [activeTab, setActiveTab] = useState(initialTab)
  
  const [campaign, setCampaign] = useState<CampaignDataLike & { 
    typeHash: ccc.Hex
    cell: ccc.Cell
    isConnected: boolean
    isApproved: boolean
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingQuest, setIsAddingQuest] = useState(false)
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(null)
  const [expandedQuest, setExpandedQuest] = useState<number | null>(null)
  const [editingCampaign, setEditingCampaign] = useState(false)
  
  // Form state for campaign editing/creation
  const [campaignForm, setCampaignForm] = useState<CampaignFormData>({
    title: "",
    shortDescription: "",
    longDescription: "",
    categories: [] as string[],
    difficulty: 1,
    startDate: "",
    endDate: "",
    totalPoints: "1000",
    logo: "🚀",
    rules: [""] as string[]
  })

  // Local quests state for create mode
  const [localQuests, setLocalQuests] = useState<Array<{
    title: string
    shortDescription: string
    longDescription: string
    points: number
    difficulty: number
    timeEstimate: number
    requirements: string
    subtasks: Array<{
      title: string
      description: string
      type: string
      proof_required: string
    }>
  }>>([])

  // Start in edit mode for creation
  useEffect(() => {
    if (isCreateMode) {
      setEditingCampaign(true)
    }
  }, [isCreateMode])
  
  // Form state for quest editing
  const [questForm, setQuestForm] = useState({
    title: "",
    shortDescription: "",
    longDescription: "",
    points: 100,
    difficulty: 1,
    timeEstimate: 30,
    requirements: "",
    subtasks: [] as { title: string; description: string; type: string; proof_required: string }[]
  })
  
  // State for approval process
  const [isApproving, setIsApproving] = useState(false)
  
  // Handle campaign approval
  const handleApproveCampaign = async () => {
    if (!signer || !protocolData || !campaignTypeId || !updateProtocol || isCreateMode) {
      debug.error("Missing required data for campaign approval")
      alert("Please ensure your wallet is connected and you have admin privileges.")
      return
    }

    setIsApproving(true)
    try {
      debug.log("Approving campaign:", campaignTypeId)
      
      // Ensure the type hash is properly formatted as ccc.Hex (0x + 64 hex chars)
      const formattedTypeId = campaignTypeId.startsWith('0x') 
        ? campaignTypeId as ccc.Hex
        : `0x${campaignTypeId}` as ccc.Hex
      
      // Extract type_id from the campaign cell for optimized storage
      let identifierToStore: ccc.Hex = formattedTypeId // Default to type_id for forward compatibility
      
      // Try to get the campaign cell from state to extract its type_id
      if (campaign && campaign.cell && campaign.cell.cellOutput.type && campaign.cell.cellOutput.type.args) {
        try {
          const typeId = extractTypeIdFromCampaignCell(campaign.cell)
          if (typeId) {
            identifierToStore = typeId
            debug.log("Using type_id for optimized storage:", typeId)
          } else {
            debug.log("Could not extract type_id, falling back to type_hash")
          }
        } catch (error) {
          debug.warn("Failed to extract type_id:", error)
        }
      }
      
      // Check if already approved (check both type_id and type_hash for compatibility)
      const isAlreadyApproved = protocolData.campaigns_approved?.some((identifier: ccc.Hex) => {
        // Check if it matches the type_hash
        if (identifier.toLowerCase() === formattedTypeId.toLowerCase()) {
          return true
        }
        // Also check if it matches the type_id we're about to store
        if (identifier.toLowerCase() === identifierToStore.toLowerCase()) {
          return true
        }
        return false
      })
      
      if (isAlreadyApproved) {
        alert("This campaign is already approved.")
        setIsApproving(false)
        return
      }
      
      // Add the campaign identifier (type_id or type_hash) to the campaigns_approved list
      const updatedCampaignsApproved = [
        ...(protocolData.campaigns_approved || []), 
        identifierToStore
      ] as ccc.Hex[]
      
      // Create updated protocol data with the new campaign approval
      const updatedProtocolData: ProtocolDataLike = {
        ...protocolData,
        campaigns_approved: updatedCampaignsApproved,
        // Ensure tipping_proposals is properly typed
        tipping_proposals: protocolData.tipping_proposals.map(proposal => ({
          ...proposal,
          tipping_transaction_hash: proposal.tipping_transaction_hash || null
        }))
      } as ProtocolDataLike
      
      debug.log("Updating protocol with approved campaign:", {
        typeHash: formattedTypeId,
        storedIdentifier: identifierToStore,
        isTypeId: identifierToStore !== formattedTypeId,
        totalApproved: updatedCampaignsApproved.length
      })
      
      // Call the blockchain transaction to update protocol data
      const txHash = await updateProtocol(updatedProtocolData)
      
      debug.log("Transaction submitted:", txHash)
      alert(`Campaign approved successfully! Transaction: ${txHash}`)
      
      // Refresh protocol data to get the updated state
      await refreshProtocolData()
      
      // Refresh campaign data to update isApproved status
      if (campaign) {
        setCampaign({
          ...campaign,
          isApproved: true
        })
      }
    } catch (error) {
      debug.error("Failed to approve campaign:", error)
      alert(`Failed to approve campaign: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsApproving(false)
    }
  }

  // Fetch campaign data (only in edit mode)
  useEffect(() => {
    const fetchCampaign = async () => {
      if (!signer) {
        debug.warn("No signer available")
        setIsLoading(false)
        return
      }

      // Skip fetching if in create mode
      if (isCreateMode) {
        setIsLoading(false)
        return
      }

      if (!campaignTypeId) {
        debug.warn("No campaign type hash available")
        setIsLoading(false)
        return
      }

      try {
        debug.warn("Campaign fetching by type hash is no longer supported")
        debug.log("Campaign type ID requested:", campaignTypeId)
        // Type hash based fetching has been removed to improve performance
        // Campaigns should be fetched by type ID using ConnectedTypeID
        setCampaign(null) // Set to null since we can't fetch by type hash anymore
        
        // Clear the form since we can't fetch the campaign
        setCampaignForm({
          title: "",
          shortDescription: "",
          longDescription: "",
          categories: [],
          difficulty: 1,
          startDate: new Date().toISOString().slice(0, 16),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
          totalPoints: "1000",
          logo: "🚀",
          rules: [""]
        })
      } catch (error) {
        debug.error("Failed to fetch campaign:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCampaign()
  }, [signer, campaignTypeId, protocolData, isCreateMode])

  // Update URL when tab changes
  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeTab !== 'overview') {
      url.searchParams.set('tab', activeTab)
    } else {
      url.searchParams.delete('tab')
    }
    window.history.replaceState({}, '', url.toString())
  }, [activeTab])

  const fillTestData = () => {
    const randomNum = Math.floor(Math.random() * 1000)
    const testData: CampaignFormData = {
      title: `Learn CKB Development ${randomNum}`,
      shortDescription: `Master the basics of CKB blockchain development through hands-on tasks ${randomNum}`,
      longDescription: "This comprehensive campaign will guide you through the fundamentals of CKB blockchain development. You'll learn about the Cell model, write smart contracts in Rust, understand the UTXO model, and build your first dApp. Perfect for developers looking to expand their blockchain skills.",
      categories: ["Education", "Development"],
      difficulty: 2,
      startDate: new Date().toISOString().slice(0, 16),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16), // 30 days from now
      totalPoints: "5000",
      logo: "🎓",
      rules: [
        "Complete quests in any order",
        "Submit proof of completion for each task",
        "Points are awarded upon verification",
        "Collaboration is encouraged"
      ]
    }
    setCampaignForm(testData)
    
    // Test quests for reference (would be added via the Quest dialog)
    /* const testQuests = [
      {
        title: "Setup Development Environment",
        shortDescription: "Install and configure CKB development tools",
        longDescription: "Set up your local development environment with CKB node, SDK, and development tools",
        points: 500,
        difficulty: 1,
        timeEstimate: 60,
        requirements: "Basic command line knowledge",
        subtasks: [
          {
            title: "Install CKB Node",
            description: "Download and install CKB node for your operating system",
            type: "technical",
            proof_required: "Screenshot of running node"
          },
          {
            title: "Install CKB SDK",
            description: "Install the CKB SDK and verify installation",
            type: "technical",
            proof_required: "Screenshot of SDK version output"
          }
        ]
      },
      {
        title: "Write Your First Smart Contract",
        shortDescription: "Create a simple smart contract in Rust",
        longDescription: "Learn the basics of smart contract development on CKB by writing a simple contract",
        points: 1000,
        difficulty: 2,
        timeEstimate: 120,
        requirements: "Rust programming knowledge, completed environment setup",
        subtasks: [
          {
            title: "Create Contract Project",
            description: "Initialize a new Rust project for your smart contract",
            type: "technical",
            proof_required: "GitHub repository link"
          },
          {
            title: "Implement Contract Logic",
            description: "Write the main contract logic following CKB patterns",
            type: "technical",
            proof_required: "Code snippet of main function"
          }
        ]
      }
    ] */
    
    // Note: In create mode, quests would need to be stored separately
    // until the campaign is created on the blockchain
    // For now, we can show a message about adding quests after filling test data
    alert("Test campaign data filled! You can now add test quests from the Quests tab.")
  }

  const handleSaveCampaign = async () => {
    setIsSaving(true)
    let submitError: string | null = null
    
    debug.log("=== CAMPAIGN SUBMISSION STARTED ===")
    debug.log("Form data:", campaignForm)
    debug.log("Local quests:", localQuests)

    try {
      // Validate required fields
      if (
        !campaignForm.title ||
        !campaignForm.shortDescription ||
        !campaignForm.longDescription ||
        !campaignForm.categories.length ||
        !campaignForm.difficulty ||
        !campaignForm.startDate ||
        !campaignForm.endDate
      ) {
        throw new Error("Please fill in all required fields")
      }

      if (!signer) {
        throw new Error("Please connect your wallet to update the campaign")
      }

      // For now, campaigns are already created on-chain
      // This will be an update operation when the service is ready
      if (isCreateMode) {
        // Build campaign data structure
        const campaignData: CampaignDataLike = {
          metadata: {
            title: campaignForm.title,
            long_description: campaignForm.longDescription,
            short_description: campaignForm.shortDescription,
            image_url: "",
            categories: campaignForm.categories,
            difficulty: campaignForm.difficulty,
            endorser_info: {
              endorser_name: "",
              endorser_description: "",
              endorser_lock_hash: await signer.getRecommendedAddressObj().then(addr => addr.script.hash()), // Campaign admin's lock hash
              website: "",
              social_links: [],
              verified: 0
            },
            total_rewards: {
              points_amount: 0n,
              ckb_amount: 0n,
              nft_assets: [],
              udt_assets: []
            },
            verification_requirements: [],
            last_updated: BigInt(Date.now())
          },
          endorser: {
            endorser_name: "",
            endorser_description: "",
            endorser_lock_hash: await signer.getRecommendedAddressObj().then(addr => addr.script.hash()),
            website: "",
            social_links: [],
            verified: 0
          },
          created_at: BigInt(Date.now()),
          rules: [],
          status: 0, // Created (new campaigns must start with status 0)
          starting_time: BigInt(new Date(campaignForm.startDate).getTime() / 1000),
          ending_time: BigInt(new Date(campaignForm.endDate).getTime() / 1000),
          participants_count: 0,
          total_completions: 0,
          quests: localQuests.map((quest, index) => ({
            quest_id: index + 1,
            metadata: {
              title: quest.title,
              long_description: quest.longDescription,
              short_description: quest.shortDescription,
              image_url: "",
              difficulty: quest.difficulty,
              time_estimate: quest.timeEstimate,
              requirements: quest.requirements || "",
              tips: [],
              resources: []
            },
            points: BigInt(quest.points),
            rewards_on_completion: [],
            accepted_submission_user_type_ids: [],
            completion_deadline: BigInt(new Date(campaignForm.endDate).getTime() / 1000),
            status: 0, // Created (new quests must start with status 0)
            sub_tasks: quest.subtasks.map((st, stIndex) => ({
              id: stIndex + 1,
              title: st.title,
              description: st.description,
              type: st.type,
              proof_required: st.proof_required
            })),
            completion_count: 0
          }))
        }

        debug.log("=== FINAL CAMPAIGN DATA ===")
        debug.log(JSON.stringify(
          campaignData,
          (_key, value) => {
            // Convert BigInt to string for logging
            if (typeof value === "bigint") {
              return value.toString() + "n"
            }
            // Convert Uint8Array to readable string for logging
            if (value instanceof Uint8Array || (value && typeof value === 'object' && '0' in value && '1' in value)) {
              const bytes = value instanceof Uint8Array ? value : new Uint8Array(Object.values(value))
              return `[Uint8Array: 0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}]`
            }
            return value
          },
          2
        ))

        // Create a Campaign service instance to send the transaction
        if (!signer) {
          throw new Error("No signer available")
        }
        
        // Use the protocol cell from the hook
        if (!protocolCell) {
          throw new Error("Protocol cell not found. Please ensure the protocol is deployed.")
        }
        
        // Get deployment info for the campaign contract
        const network = DeploymentManager.getCurrentNetwork()
        const deployment = deploymentManager.getCurrentDeployment(network, "ckboostCampaignType")
        const outPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType")
        
        if (!deployment || !outPoint) {
          throw new Error("Campaign type contract not found in deployments.json")
        }
        
        // Create executor for SSRI operations
        const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
        const { ssri } = await import("@ckb-ccc/ssri")
        const executor = new ssri.ExecutorJsonRpc(executorUrl)
        
        // Create Campaign SSRI instance
        const campaignScript = ccc.Script.from({
          codeHash: deployment.typeHash as ccc.Hex, // Use typeHash, not codeHash
          hashType: "type" as const,
          args: "0x" // Empty args for new campaign
        })
        
        const campaignInstance = new Campaign(
          outPoint,
          campaignScript,
          protocolCell,
          { executor } // Pass the executor instance
        )
        
        // Create campaign service and send the transaction
        const campaignService = new CampaignService(signer, campaignInstance, protocolCell)
        const txHash = await campaignService.updateCampaign(campaignData)
        
        debug.log("Campaign created successfully with transaction hash:", txHash)
        
        alert(`Campaign created successfully!\n\nCampaign: ${campaignForm.title}\nQuests: ${localQuests.length}\n\nTransaction: ${txHash}`)
        
        // Redirect to campaign admin dashboard after successful creation
        router.push('/campaign-admin')
      } else {
        // Update existing campaign
        debug.log("Updating campaign with form data:", campaignForm)
        alert("Campaign update functionality will be available soon")
      }

      debug.log("=== CAMPAIGN SAVE COMPLETED SUCCESSFULLY ===")
      
    } catch (error) {
      debug.error("=== CAMPAIGN SAVE FAILED ===")
      debug.error("Error:", error)
      submitError = error instanceof Error ? error.message : "Failed to save campaign"
      alert(submitError)
    } finally {
      setIsSaving(false)
      if (!submitError) {
        setEditingCampaign(false)
      }
    }
  }

  const handleAddQuest = () => {
    // Always add quest to local state - no blockchain transaction here
    setLocalQuests([...localQuests, questForm])
    debug.log("Added quest to local state:", questForm)
    
    // Reset form for next quest
    setQuestForm({
      title: "",
      shortDescription: "",
      longDescription: "",
      points: 100,
      difficulty: 1,
      timeEstimate: 30,
      requirements: "",
      subtasks: []
    })
    
    // Close the dialog after adding
    setIsAddingQuest(false)
    
    // Note: The actual blockchain update happens when saving the entire campaign
  }

  const handleEditQuest = (questIndex: number) => {
    if (!campaign || !campaign.quests || !campaign.quests[questIndex]) return
    
    const quest = campaign.quests[questIndex]
    setQuestForm({
      title: quest.metadata.title || "",
      shortDescription: quest.metadata.short_description || "",
      longDescription: quest.metadata.long_description || "",
      points: Number(quest.points) || 100,
      difficulty: Number(quest.metadata.difficulty) || 1,
      timeEstimate: Number(quest.metadata.time_estimate) || 30,
      requirements: quest.metadata.requirements || "",
      subtasks: quest.sub_tasks?.map(st => ({
        title: st.title || "",
        description: st.description || "",
        type: st.type || "",
        proof_required: st.proof_required || ""
      })) || []
    })
    setEditingQuestIndex(questIndex)
  }

  const handleSaveEditedQuest = () => {
    if (editingQuestIndex === null) return
    
    // Update quest in local state - no blockchain transaction here
    const updatedQuests = [...localQuests]
    updatedQuests[editingQuestIndex] = questForm
    setLocalQuests(updatedQuests)
    
    debug.log("Updated quest in local state at index:", editingQuestIndex, questForm)
    
    // Reset form and close edit mode
    setEditingQuestIndex(null)
    setIsAddingQuest(false)
    setQuestForm({
      title: "",
      shortDescription: "",
      longDescription: "",
      points: 100,
      difficulty: 1,
      timeEstimate: 30,
      requirements: "",
      subtasks: []
    })
    
    // Note: The actual blockchain update happens when saving the entire campaign
  }

  const handleDeleteQuest = (questIndex: number) => {
    if (confirm("Are you sure you want to delete this quest?")) {
      // Remove quest from local state - no blockchain transaction here
      const updatedQuests = localQuests.filter((_, index) => index !== questIndex)
      setLocalQuests(updatedQuests)
      
      debug.log("Deleted quest from local state at index:", questIndex)
      
      // Note: The actual blockchain update happens when saving the entire campaign
    }
  }

  const handleConnectToProtocol = async () => {
    try {
      // TODO: Implement connection to protocol
      debug.log("Connecting campaign to protocol")
      alert("Protocol connection functionality will be implemented")
    } catch (error) {
      debug.error("Failed to connect to protocol:", error)
      alert("Failed to connect to protocol")
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
              <p className="text-muted-foreground">Loading campaign management...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!isCreateMode && !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-2xl font-bold mb-2">Campaign Not Found</h2>
                <p className="text-muted-foreground mb-6">
                  The campaign you're trying to manage doesn't exist or you don't have permission to manage it.
                </p>
                <Link href="/campaign-admin">
                  <Button>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const totalPoints = isCreateMode 
    ? localQuests.reduce((sum, quest) => sum + quest.points, 0)
    : (campaign?.quests?.reduce((sum, quest) => {
        return sum + Number(quest.points || 100)
      }, 0) || 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Link href="/campaign-admin">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">
                  {isCreateMode ? 'Create New Campaign' : 'Manage Campaign'}
                </h1>
                <p className="text-muted-foreground">
                  {isCreateMode ? 'Set up a new campaign for your protocol' : campaign?.metadata.title}
                </p>
                {!isCreateMode && campaign && (
                  <div className="flex items-center gap-2 mt-3">
                    {campaign.isApproved ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Approved
                    </Badge>
                  ) : campaign.isConnected ? (
                    <Badge className="bg-yellow-100 text-yellow-800">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending Approval
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-800">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Not Connected
                    </Badge>
                  )}
                    <Badge variant="outline">
                      {campaign.quests?.length || 0} Quests
                    </Badge>
                    <Badge variant="outline">
                      {totalPoints} Total Points
                    </Badge>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {!isCreateMode && campaign && !campaign.isConnected && (
                  <Button 
                    onClick={handleConnectToProtocol}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Connect to Protocol
                  </Button>
                )}
                {!isCreateMode && (
                  <Link href={`/campaign/${campaignTypeId}`}>
                    <Button variant="outline">
                      <Eye className="w-4 h-4 mr-2" />
                      View Public Page
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={isCreateMode ? "grid w-full grid-cols-2" : "grid w-full grid-cols-4"}>
              <TabsTrigger value="overview">
                {isCreateMode ? "Campaign Details" : "Overview"}
              </TabsTrigger>
              <TabsTrigger value="quests">Quests</TabsTrigger>
              {!isCreateMode && (
                <>
                  <TabsTrigger value="submissions">Submissions</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </>
              )}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Campaign Details</CardTitle>
                    <div className="flex gap-2">
                      {isCreateMode && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={fillTestData}
                        >
                          <Sparkles className="w-4 h-4 mr-1" />
                          Fill Test Data
                        </Button>
                      )}
                      {!editingCampaign && !isCreateMode && (
                        <>
                          {/* Show approval button for platform admins if campaign is connected but not approved */}
                          {isAdmin && campaign?.isConnected && !campaign?.isApproved && (
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={handleApproveCampaign}
                              disabled={isApproving}
                            >
                              {isApproving ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                  Approving...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve Campaign
                                </>
                              )}
                            </Button>
                          )}
                          {/* Show approved badge if campaign is already approved */}
                          {campaign?.isApproved && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Approved
                            </Badge>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingCampaign(true)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit Campaign
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {editingCampaign || isCreateMode ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={campaignForm.title}
                          onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })}
                          placeholder="Enter campaign title"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="shortDescription">Short Description</Label>
                        <Input
                          id="shortDescription"
                          value={campaignForm.shortDescription}
                          onChange={(e) => setCampaignForm({ ...campaignForm, shortDescription: e.target.value })}
                          placeholder="Brief description for campaign cards"
                          maxLength={100}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="longDescription">Long Description</Label>
                        <Textarea
                          id="longDescription"
                          value={campaignForm.longDescription}
                          onChange={(e) => setCampaignForm({ ...campaignForm, longDescription: e.target.value })}
                          placeholder="Detailed description of your campaign"
                          className="h-32"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="category">Category</Label>
                          <select
                            id="category"
                            className="w-full p-2 border rounded-md"
                            value={campaignForm.categories[0] || ""}
                            onChange={(e) => setCampaignForm({ ...campaignForm, categories: [e.target.value] })}
                          >
                            <option value="">Select category</option>
                            <option value="DeFi">DeFi</option>
                            <option value="Gaming">Gaming</option>
                            <option value="Social">Social</option>
                            <option value="Education">Education</option>
                            <option value="Infrastructure">Infrastructure</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="difficulty">Difficulty</Label>
                          <select
                            id="difficulty"
                            className="w-full p-2 border rounded-md"
                            value={campaignForm.difficulty}
                            onChange={(e) => setCampaignForm({ ...campaignForm, difficulty: parseInt(e.target.value) })}
                          >
                            <option value={1}>Easy</option>
                            <option value={2}>Medium</option>
                            <option value={3}>Hard</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="startDate">Start Date</Label>
                          <Input
                            id="startDate"
                            type="datetime-local"
                            value={campaignForm.startDate}
                            onChange={(e) => setCampaignForm({ ...campaignForm, startDate: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="endDate">End Date</Label>
                          <Input
                            id="endDate"
                            type="datetime-local"
                            value={campaignForm.endDate}
                            onChange={(e) => setCampaignForm({ ...campaignForm, endDate: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        {!isCreateMode && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingCampaign(false)
                              // Reset form to original campaign data
                              if (campaign) {
                                setCampaignForm({
                                  title: campaign.metadata?.title || "",
                                  shortDescription: campaign.metadata?.short_description || "",
                                  longDescription: campaign.metadata?.long_description || "",
                                  categories: campaign.metadata?.categories || [],
                                  difficulty: Number(campaign.metadata?.difficulty) || 1,
                                  startDate: new Date(Number(campaign.starting_time) * 1000).toISOString().slice(0, 16),
                                  endDate: new Date(Number(campaign.ending_time) * 1000).toISOString().slice(0, 16),
                                  totalPoints: "1000",
                                  logo: "🚀",
                                  rules: campaign?.rules || [""]
                                })
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button
                          onClick={handleSaveCampaign}
                          disabled={isSaving}
                        >
                          {isSaving ? (isCreateMode ? "Creating Campaign..." : "Saving...") : (isCreateMode ? "Create Campaign" : "Save Changes")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Title</Label>
                        <p className="text-lg font-medium">{campaign?.metadata?.title}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Short Description</Label>
                        <p>{campaign?.metadata?.short_description}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Long Description</Label>
                        <p className="whitespace-pre-wrap">{campaign?.metadata?.long_description || "No detailed description"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Categories</Label>
                          <div className="flex gap-2 mt-1">
                            {campaign?.metadata?.categories?.map((cat, i) => (
                              <Badge key={i} variant="outline">{cat}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Difficulty</Label>
                          <p>{getDifficultyString(campaign?.metadata?.difficulty || 1)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Start Date</Label>
                          <p>{formatDateConsistent(new Date(Number(campaign?.starting_time) * 1000))}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">End Date</Label>
                          <p>{formatDateConsistent(new Date(Number(campaign?.ending_time) * 1000))}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Campaign Stats - Only show in edit mode */}
              {!isCreateMode && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Quests</p>
                        <p className="text-2xl font-bold">{isCreateMode ? localQuests.length : (campaign?.quests?.length || 0)}</p>
                      </div>
                      <Target className="w-8 h-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Points</p>
                        <p className="text-2xl font-bold">{totalPoints}</p>
                      </div>
                      <Trophy className="w-8 h-8 text-yellow-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Participants</p>
                        <p className="text-2xl font-bold">0</p>
                      </div>
                      <Users className="w-8 h-8 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Submissions</p>
                        <p className="text-2xl font-bold">0</p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
                </div>
              )}
            </TabsContent>

            {/* Quests Tab */}
            <TabsContent value="quests" className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Campaign Quests</h2>
                <Button onClick={() => setIsAddingQuest(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Quest
                </Button>
                <Dialog open={isAddingQuest || editingQuestIndex !== null} onOpenChange={(open) => {
                  if (!open) {
                    setIsAddingQuest(false)
                    setEditingQuestIndex(null)
                    // Reset form
                    setQuestForm({
                      title: "",
                      shortDescription: "",
                      longDescription: "",
                      points: 100,
                      difficulty: 1,
                      timeEstimate: 30,
                      requirements: "",
                      subtasks: []
                    })
                  }
                }}>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingQuestIndex !== null ? "Edit Quest" : "Add New Quest"}</DialogTitle>
                      <DialogDescription>
                        {editingQuestIndex !== null 
                          ? "Update the quest details and requirements."
                          : "Create a new quest for your campaign. Quests are tasks that participants complete to earn points."}
                      </DialogDescription>
                      {isCreateMode && editingQuestIndex === null && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            const questRandom = Math.floor(Math.random() * 1000)
                            setQuestForm({
                              title: `Write Your First Smart Contract ${questRandom}`,
                              shortDescription: `Create a simple smart contract in Rust ${questRandom}`,
                              longDescription: "Learn the basics of smart contract development on CKB by writing a simple contract that demonstrates basic functionality",
                              points: 1000,
                              difficulty: 2,
                              timeEstimate: 120,
                              requirements: "Rust programming knowledge, completed environment setup",
                              subtasks: [
                                {
                                  title: "Create Contract Project",
                                  description: "Initialize a new Rust project for your smart contract",
                                  type: "technical",
                                  proof_required: "GitHub repository link"
                                },
                                {
                                  title: "Implement Contract Logic",
                                  description: "Write the main contract logic following CKB patterns",
                                  type: "technical",
                                  proof_required: "Code snippet of main function"
                                }
                              ]
                            })
                          }}
                        >
                          <Sparkles className="w-4 h-4 mr-1" />
                          Fill Test Quest
                        </Button>
                      )}
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="questTitle">Quest Title</Label>
                        <Input
                          id="questTitle"
                          value={questForm.title}
                          onChange={(e) => setQuestForm({ ...questForm, title: e.target.value })}
                          placeholder="Enter quest title"
                        />
                      </div>
                      <div>
                        <Label htmlFor="questShortDesc">Short Description</Label>
                        <Input
                          id="questShortDesc"
                          value={questForm.shortDescription}
                          onChange={(e) => setQuestForm({ ...questForm, shortDescription: e.target.value })}
                          placeholder="Brief description of the quest"
                        />
                      </div>
                      <div>
                        <Label htmlFor="questLongDesc">Detailed Description</Label>
                        <Textarea
                          id="questLongDesc"
                          rows={4}
                          value={questForm.longDescription}
                          onChange={(e) => setQuestForm({ ...questForm, longDescription: e.target.value })}
                          placeholder="Detailed instructions and requirements"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="questPoints">Points</Label>
                          <Input
                            id="questPoints"
                            type="number"
                            value={questForm.points}
                            onChange={(e) => setQuestForm({ ...questForm, points: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="questDifficulty">Difficulty</Label>
                          <select
                            id="questDifficulty"
                            className="w-full p-2 border rounded-md"
                            value={questForm.difficulty}
                            onChange={(e) => setQuestForm({ ...questForm, difficulty: parseInt(e.target.value) })}
                          >
                            <option value={1}>Easy</option>
                            <option value={2}>Medium</option>
                            <option value={3}>Hard</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="questTime">Time (mins)</Label>
                          <Input
                            id="questTime"
                            type="number"
                            value={questForm.timeEstimate}
                            onChange={(e) => setQuestForm({ ...questForm, timeEstimate: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="questRequirements">Requirements</Label>
                        <Textarea
                          id="questRequirements"
                          rows={3}
                          value={questForm.requirements}
                          onChange={(e) => setQuestForm({ ...questForm, requirements: e.target.value })}
                          placeholder="What participants need to complete this quest"
                        />
                      </div>
                      
                      {/* Subtasks Management */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>Subtasks</Label>
                          <div className="flex gap-2">
                            {isCreateMode && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const subtaskRandom = Math.floor(Math.random() * 1000)
                                  setQuestForm({
                                    ...questForm,
                                    subtasks: [
                                      ...questForm.subtasks,
                                      {
                                        title: `Sample Subtask ${subtaskRandom}`,
                                        description: `Complete this technical task to progress ${subtaskRandom}`,
                                        type: "technical",
                                        proof_required: "Screenshot or link to completed work"
                                      }
                                    ]
                                  })
                                }}
                              >
                                <Sparkles className="w-4 h-4 mr-1" />
                                Test Subtask
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setQuestForm({
                                  ...questForm,
                                  subtasks: [
                                    ...questForm.subtasks,
                                    {
                                      title: "",
                                      description: "",
                                      type: "technical",
                                      proof_required: ""
                                    }
                                  ]
                                })
                              }}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add Subtask
                            </Button>
                          </div>
                        </div>
                        
                        {questForm.subtasks.length === 0 ? (
                          <div className="text-center py-4 border rounded-lg text-sm text-muted-foreground">
                            No subtasks added yet. Add subtasks to break down the quest into steps.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {questForm.subtasks.map((subtask, index) => (
                              <Card key={index} className="p-4">
                                <div className="space-y-3">
                                  <div className="flex items-start justify-between">
                                    <h4 className="font-medium">Subtask {index + 1}</h4>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setQuestForm({
                                          ...questForm,
                                          subtasks: questForm.subtasks.filter((_, i) => i !== index)
                                        })
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label>Title</Label>
                                      <Input
                                        value={subtask.title}
                                        onChange={(e) => {
                                          const newSubtasks = [...questForm.subtasks]
                                          newSubtasks[index] = { ...subtask, title: e.target.value }
                                          setQuestForm({ ...questForm, subtasks: newSubtasks })
                                        }}
                                        placeholder="e.g., Setup environment"
                                      />
                                    </div>
                                    
                                    <div>
                                      <Label>Type</Label>
                                      <select
                                        className="w-full p-2 border rounded-md"
                                        value={subtask.type}
                                        onChange={(e) => {
                                          const newSubtasks = [...questForm.subtasks]
                                          newSubtasks[index] = { ...subtask, type: e.target.value }
                                          setQuestForm({ ...questForm, subtasks: newSubtasks })
                                        }}
                                      >
                                        <option value="technical">Technical</option>
                                        <option value="social">Social</option>
                                        <option value="content">Content</option>
                                        <option value="research">Research</option>
                                        <option value="onchain">On-chain</option>
                                      </select>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <Label>Description</Label>
                                    <Textarea
                                      rows={2}
                                      value={subtask.description}
                                      onChange={(e) => {
                                        const newSubtasks = [...questForm.subtasks]
                                        newSubtasks[index] = { ...subtask, description: e.target.value }
                                        setQuestForm({ ...questForm, subtasks: newSubtasks })
                                      }}
                                      placeholder="Detailed instructions..."
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label>Proof Required</Label>
                                    <Input
                                      value={subtask.proof_required}
                                      onChange={(e) => {
                                        const newSubtasks = [...questForm.subtasks]
                                        newSubtasks[index] = { ...subtask, proof_required: e.target.value }
                                        setQuestForm({ ...questForm, subtasks: newSubtasks })
                                      }}
                                      placeholder="e.g., Screenshot, GitHub link"
                                    />
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setIsAddingQuest(false)
                        setEditingQuestIndex(null)
                        setQuestForm({
                          title: "",
                          shortDescription: "",
                          longDescription: "",
                          points: 100,
                          difficulty: 1,
                          timeEstimate: 30,
                          requirements: "",
                          subtasks: []
                        })
                      }}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={editingQuestIndex !== null ? handleSaveEditedQuest : handleAddQuest}
                      >
                        {editingQuestIndex !== null ? "Save Quest" : "Add Quest"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Quest List */}
              <div className="space-y-4">
                {isCreateMode && localQuests.length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="text-center space-y-4">
                        <Target className="w-12 h-12 mx-auto text-muted-foreground" />
                        <div>
                          <h3 className="font-semibold text-lg">No Quests Yet</h3>
                          <p className="text-muted-foreground mt-2">
                            Add quests to define the tasks participants will complete in your campaign
                          </p>
                        </div>
                        <Button 
                          onClick={() => setIsAddingQuest(true)}
                          className="mt-4"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Your First Quest
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : isCreateMode && localQuests.length > 0 ? (
                  localQuests.map((quest, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">
                              {quest.title || `Quest ${index + 1}`}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {quest.shortDescription}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-800">
                              <Trophy className="w-3 h-3 mr-1" />
                              {quest.points} points
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Load quest into form for editing
                                setQuestForm(quest)
                                setEditingQuestIndex(index)
                                setIsAddingQuest(true)
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Remove quest from local state
                                setLocalQuests(localQuests.filter((_, i) => i !== index))
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {quest.longDescription && (
                          <p className="text-sm text-muted-foreground mb-4">
                            {quest.longDescription}
                          </p>
                        )}
                        {quest.requirements && (
                          <div className="mb-4">
                            <p className="text-sm font-medium mb-1">Requirements:</p>
                            <p className="text-sm text-muted-foreground">{quest.requirements}</p>
                          </div>
                        )}
                        {quest.subtasks && quest.subtasks.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Subtasks ({quest.subtasks.length}):</p>
                            <div className="space-y-2">
                              {quest.subtasks.map((subtask, subIndex) => (
                                <div key={subIndex} className="flex items-start gap-2 text-sm">
                                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
                                    {subIndex + 1}
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium">{subtask.title}</p>
                                    <p className="text-muted-foreground text-xs">{subtask.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : campaign?.quests && campaign.quests.length > 0 ? (
                  campaign.quests.map((quest, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">
                              {quest.metadata.title || `Quest ${index + 1}`}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {quest.metadata.short_description}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-800">
                              <Trophy className="w-3 h-3 mr-1" />
                              {Number(quest.points)} points
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedQuest(expandedQuest === index ? null : index)}
                            >
                              {expandedQuest === index ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {expandedQuest === index && (
                        <CardContent>
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm text-muted-foreground">Description</Label>
                              <p className="whitespace-pre-wrap">
                                {quest.metadata.long_description || quest.metadata.short_description}
                              </p>
                            </div>
                            {quest.metadata.requirements && (
                              <div>
                                <Label className="text-sm text-muted-foreground">Requirements</Label>
                                <p>{quest.metadata.requirements}</p>
                              </div>
                            )}
                            <div className="flex items-center gap-4 text-sm">
                              {quest.metadata.difficulty && (
                                <Badge variant="outline">
                                  Difficulty: {getDifficultyString(quest.metadata.difficulty)}
                                </Badge>
                              )}
                              {quest.metadata.time_estimate && (
                                <Badge variant="outline">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {Number(quest.metadata.time_estimate)} mins
                                </Badge>
                              )}
                            </div>
                            
                            {/* Subtasks */}
                            {quest.sub_tasks && quest.sub_tasks.length > 0 && (
                              <div>
                                <Label className="text-sm text-muted-foreground mb-2">Subtasks</Label>
                                <div className="space-y-2">
                                  {quest.sub_tasks.map((subtask, subIndex) => (
                                    <div key={subIndex} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                        {subIndex + 1}
                                      </div>
                                      <div className="flex-1">
                                        <p className="font-medium text-sm">{subtask.title}</p>
                                        {subtask.description && (
                                          <p className="text-xs text-muted-foreground mt-1">{subtask.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div className="flex justify-end gap-2 pt-4 border-t">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleEditQuest(index)}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit Quest
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteQuest(index)}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-12">
                      <div className="text-center">
                        <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="text-lg font-semibold mb-2">No Quests Yet</h3>
                        <p className="text-muted-foreground mb-4">
                          Add quests to define the tasks participants need to complete.
                        </p>
                        <Button onClick={() => setIsAddingQuest(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Add Your First Quest
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Submissions Tab */}
            <TabsContent value="submissions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Submissions</CardTitle>
                  <CardDescription>
                    Review and approve quest completions from participants
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No Submissions Yet</h3>
                    <p className="text-muted-foreground">
                      Submissions will appear here once participants start completing quests.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Settings</CardTitle>
                  <CardDescription>
                    Manage advanced settings and permissions for your campaign
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-3">Connection Status</h3>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Protocol Connection</p>
                          <p className="text-sm text-muted-foreground">
                            {campaign?.isConnected 
                              ? "This campaign is connected to the current protocol"
                              : "Connect this campaign to make it discoverable"}
                          </p>
                        </div>
                        {campaign?.isConnected ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Button onClick={handleConnectToProtocol}>
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Approval Status</h3>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Platform Approval</p>
                          <p className="text-sm text-muted-foreground">
                            {campaign?.isApproved 
                              ? "This campaign has been approved by platform administrators"
                              : campaign?.isConnected 
                                ? "Waiting for platform administrator approval"
                                : "Connect to protocol first to request approval"}
                          </p>
                        </div>
                        {campaign?.isApproved ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approved
                          </Badge>
                        ) : campaign?.isConnected ? (
                          <Badge className="bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800">
                            Not Connected
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Campaign Type Hash</h3>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-mono">
                          {campaignTypeId}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(campaignTypeId)
                            alert("Type hash copied to clipboard!")
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Danger Zone</h3>
                    <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20">
                      <p className="text-sm text-muted-foreground mb-4">
                        Once you delete a campaign, there is no going back. Please be certain.
                      </p>
                      <Button variant="destructive" disabled>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Campaign (Coming Soon)
                      </Button>
                    </div>
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