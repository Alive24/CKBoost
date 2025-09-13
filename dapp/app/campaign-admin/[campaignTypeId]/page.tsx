/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Plus, 
  Eye, 
  Users, 
  Trophy, 
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
  Target
} from "lucide-react"
import Link from "next/link"
import { useProtocol } from "@/lib/providers/protocol-provider"
import type { QuestDataLike, CampaignDataLike, UDTAssetLike, ProtocolDataLike } from "ssri-ckboost/types"
import { CampaignData } from "ssri-ckboost/types"
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells"
import { debug } from "@/lib/utils/debug"
import { CampaignAdminService } from "@/lib/services/campaign-admin-service"
import { ccc } from "@ckb-ccc/connector-react"
import { Campaign } from "ssri-ckboost"
import { ssri } from "@ckb-ccc/connector-react"
import { deploymentManager } from "@/lib/ckb/deployment-manager"
import { SubmissionsTab } from "@/components/campaign-admin/tabs/submissions-tab"
import {
  loadCreateDraft,
  saveCreateDraft,
  clearCreateDraft,
  type DraftFundingEntry,
} from "@/lib/utils/campaign-draft-storage"
import { FundingTab } from "@/components/campaign-admin/tabs/funding-tab"

// Import new components
import { QuestDialog, QuestList } from "@/components/campaign-admin/quest"
import { CampaignForm, CampaignStats } from "@/components/campaign-admin/campaign"
import { InitialFunding } from "@/components/campaign-admin/funding/initial-funding"
import { udtRegistry } from "@/lib/services/udt-registry"

// Type for simplified campaign form data
interface CampaignFormData {
  title: string
  shortDescription: string
  longDescription: string
  categories: string[]
  startDate: string
  endDate: string
  difficulty: number
  verificationLevel: string
  rules: string[]
}

export default function CampaignAdminPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { 
    protocolCell,
    protocolData,
    isLoading: protocolLoading, 
    signer,
    updateProtocol,
    isAdmin 
  } = useProtocol()
  
  const campaignTypeId = params.campaignTypeId as string
  const mode = searchParams.get('mode')
  const isCreateMode = campaignTypeId === 'new' || mode === 'create'

  // State Management
  const [campaign, setCampaign] = useState<CampaignDataLike | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("details")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [localQuests, setLocalQuests] = useState<QuestDataLike[]>([])
  const [initialFunding, setInitialFunding] = useState<Map<string, bigint>>(new Map())
  const [ckbInitialFunding, setCkbInitialFunding] = useState<bigint>(0n)
  
  // Autosave draft (create mode only)
  // Load any saved draft for create mode on mount
  useEffect(() => {
    if (!isCreateMode) return;
    try {
      const saved = loadCreateDraft();
      if (saved) {
        // Restore campaignData (only known fields)
        const cd = saved.campaignData; // Record<string, unknown>
        setCampaignData((prev) => ({
          title: typeof cd["title"] === "string" ? (cd["title"] as string) : prev.title,
          shortDescription: typeof cd["shortDescription"] === "string" ? (cd["shortDescription"] as string) : prev.shortDescription,
          longDescription: typeof cd["longDescription"] === "string" ? (cd["longDescription"] as string) : prev.longDescription,
          categories: Array.isArray(cd["categories"]) ? (cd["categories"] as string[]) : prev.categories,
          startDate: typeof cd["startDate"] === "string" ? (cd["startDate"] as string) : prev.startDate,
          endDate: typeof cd["endDate"] === "string" ? (cd["endDate"] as string) : prev.endDate,
          difficulty: typeof cd["difficulty"] === "number" ? (cd["difficulty"] as number) : prev.difficulty,
          verificationLevel: typeof cd["verificationLevel"] === "string" ? (cd["verificationLevel"] as string) : prev.verificationLevel,
          rules: Array.isArray(cd["rules"]) ? (cd["rules"] as string[]) : prev.rules,
        }));
        // Restore quests
        setLocalQuests((saved.quests || []) as QuestDataLike[]);
        // Restore funding
        const entries = (saved.initialFunding || []) as DraftFundingEntry[];
        const map = new Map<string, bigint>();
        for (const e of entries) map.set(e.scriptHash, BigInt(e.amount));
        setInitialFunding(map);
        setCkbInitialFunding(BigInt(saved.ckbInitialFunding || "0"));
      }
    } catch (e) {
      console.error("Failed to load saved campaign draft:", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateMode]);

  // Campaign form data
  const [campaignData, setCampaignData] = useState<CampaignFormData>({
    title: "",
    shortDescription: "",
    longDescription: "",
    categories: [],
    startDate: "",
    endDate: "",
    difficulty: 0,
    verificationLevel: "none",
    rules: [""]
  })

  // Keep latest values in refs for interval to read, without re-creating interval
  const campaignDataRef = useRef(campaignData);
  const questsRef = useRef(localQuests);
  const fundingRef = useRef(initialFunding);
  const ckbFundingRef = useRef(ckbInitialFunding);

  useEffect(() => { campaignDataRef.current = campaignData; }, [campaignData]);
  useEffect(() => { questsRef.current = localQuests; }, [localQuests]);
  useEffect(() => { fundingRef.current = initialFunding; }, [initialFunding]);
  useEffect(() => { ckbFundingRef.current = ckbInitialFunding; }, [ckbInitialFunding]);

  // Autosave every 60s if there are changes (dedup handled in save util)
  useEffect(() => {
    if (!isCreateMode) return;
    const id = setInterval(() => {
      try {
        const entries: DraftFundingEntry[] = Array.from(
          fundingRef.current.entries()
        ).map(([scriptHash, amount]) => ({ scriptHash, amount: amount.toString() }));

        saveCreateDraft({
          campaignData: campaignDataRef.current as unknown as Record<string, unknown>,
          quests: questsRef.current as unknown as Array<Record<string, unknown>>,
          initialFunding: entries,
          ckbInitialFunding: ckbFundingRef.current.toString(),
        });
      } catch (e) {
        console.error("Autosave draft failed:", e);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [isCreateMode]);

  // Quest form management
  const [isAddingQuest, setIsAddingQuest] = useState(false)
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(null)
  const [questForm, setQuestForm] = useState<QuestDataLike & { initial_quota: number }>({
    quest_id: 1,
    metadata: {
      title: "",
      short_description: "",
      long_description: "",
      requirements: "",
      difficulty: 1,
      time_estimate: 30
    },
    points: 100,
    rewards_on_completion: [],
    accepted_submission_user_type_ids: [],
    completion_deadline: BigInt(Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60)),
    status: 0,
    sub_tasks: [],
    completion_count: 0,
    initial_quota: 10
  })

  // Helper functions
  const getVerificationBitmask = (level: string): number => {
    const verificationMap: Record<string, number> = {
      none: 0,
      telegram: 1,
      kyc: 2,
      did: 4,
      manual: 8,
      twitter: 16,
      discord: 32,
      reddit: 64
    }
    return verificationMap[level] || 0
  }

  const getVerificationLevelFromBitmask = (bitmask: number[]): string => {
    if (!bitmask || bitmask.length === 0 || bitmask[0] === 0) return "none"
    const value = Number(bitmask[0])
    if (value & 1) return "telegram"
    if (value & 16) return "twitter"
    if (value & 32) return "discord"
    if (value & 8) return "manual"
    return "none"
  }

  // Load campaign data
  useEffect(() => {
    const loadCampaign = async () => {
      if (isCreateMode) {
        setIsLoading(false)
        return
      }

      if (!campaignTypeId || protocolLoading || campaignTypeId === 'new') {
        return
      }

      try {
        setIsLoading(true)
        debug.log("Loading campaign with typeId:", campaignTypeId)
        
        const campaignCodeHash = protocolData?.protocol_config?.script_code_hashes?.ckb_boost_campaign_type_code_hash
        if (!campaignCodeHash) {
          debug.error("Campaign code hash not found in protocol data")
          return
        }

        if (!signer) {
          debug.error("Signer not found")
          return
        }

        const campaignCell = await fetchCampaignByTypeId(
          campaignTypeId as ccc.Hex,
          campaignCodeHash as ccc.Hex,
          signer.client,
          protocolCell!
        )
        if (!campaignCell) {
          debug.error("Campaign cell not found")
          alert("Campaign not found")
          router.push("/campaign-admin")
          return
        }

        // Parse campaign data directly from the cell
        const campaignData = CampaignData.decode(campaignCell.outputData)
        
        if (campaignData) {
          setCampaign(campaignData)
          
          // Populate form data
          setCampaignData({
            title: campaignData.metadata?.title || "",
            shortDescription: campaignData.metadata?.short_description || "",
            longDescription: campaignData.metadata?.long_description || "",
            categories: campaignData.metadata?.categories || [],
            startDate: campaignData.starting_time ? 
              new Date(Number(campaignData.starting_time) * 1000).toISOString().slice(0, 16) : "",
            endDate: campaignData.ending_time ? 
              new Date(Number(campaignData.ending_time) * 1000).toISOString().slice(0, 16) : "",
            difficulty: Number(campaignData.metadata?.difficulty) || 0,
            verificationLevel: getVerificationLevelFromBitmask(
              campaignData.metadata?.verification_requirements || []
            ),
            rules: campaignData?.rules || [""]
          })
          
          // Also populate local quests if they exist
          if (campaignData.quests && campaignData.quests.length > 0) {
            setLocalQuests(campaignData.quests)
          }
          
          debug.log("Campaign loaded successfully")
        }
      } catch (error) {
        debug.error("Failed to load campaign:", error)
        alert("Failed to load campaign")
      } finally {
        setIsLoading(false)
      }
    }

    loadCampaign()
  }, [campaignTypeId, isCreateMode, protocolLoading, protocolCell, protocolData, signer, router])

  // Fill test data function
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
      verificationLevel: "none",
      rules: [
        "Complete quests in any order",
        "Submit proof of completion for each task",
        "Points are awarded upon verification",
        "Collaboration is encouraged"
      ]
    }
    setCampaignData(testData)
  }

  // Campaign save handler
  const handleSaveCampaign = async () => {
    if (!signer || !protocolCell) {
      alert("Please connect your wallet first")
      return
    }

    try {
      setIsSaving(true)
      
      // Create properly typed quest array
      // When there are no quests, we need to ensure the array is properly initialized
      const validatedQuests: QuestDataLike[] = localQuests.length > 0 
        ? localQuests.map(quest => ({
            quest_id: quest.quest_id,
            metadata: quest.metadata,
            points: quest.points,
            rewards_on_completion: quest.rewards_on_completion || [],
            accepted_submission_user_type_ids: quest.accepted_submission_user_type_ids || [],
            completion_deadline: quest.completion_deadline,
            status: quest.status,
            sub_tasks: quest.sub_tasks || [],
            completion_count: quest.completion_count,
          }))
        : [] // Explicitly return empty array

      // Build campaign data - ensure all arrays and nested structures are properly typed
      const updatedCampaign: CampaignDataLike = {
        endorser: campaign?.endorser || {
          endorser_lock_hash: ("0x" + "00".repeat(32)) as ccc.Hex,
          endorser_name: "",
          endorser_description: "",
          website: "",
          social_links: [] as string[],
          verified: 0 as ccc.NumLike
        },
        created_at: campaign?.created_at || BigInt(Math.floor(Date.now() / 1000)),
        starting_time: campaignData.startDate ? 
          BigInt(Math.floor(new Date(campaignData.startDate).getTime() / 1000)) : BigInt(Math.floor(Date.now() / 1000)),
        ending_time: campaignData.endDate ? 
          BigInt(Math.floor(new Date(campaignData.endDate).getTime() / 1000)) : 
          BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60),
        rules: (campaignData.rules.filter(r => r.trim() !== "") || []) as string[],
        metadata: {
          title: (campaignData.title || "") as string,
          endorser_info: campaign?.metadata?.endorser_info || campaign?.endorser || {
            endorser_lock_hash: ("0x" + "00".repeat(32)) as ccc.Hex,
            endorser_name: "",
            endorser_description: "",
            website: "",
            social_links: [] as string[],
            verified: 0 as ccc.NumLike
          },
          short_description: (campaignData.shortDescription || "") as string,
          long_description: (campaignData.longDescription || "") as string,
          total_rewards: campaign?.metadata?.total_rewards || {
            points_amount: BigInt(0) as ccc.NumLike,
            ckb_amount: BigInt(0) as ccc.NumLike,
            nft_assets: [] as ccc.ScriptLike[],
            udt_assets: [] as UDTAssetLike[]
          },
          verification_requirements: [getVerificationBitmask(campaignData.verificationLevel)] as ccc.NumLike[],
          last_updated: BigInt(Math.floor(Date.now() / 1000)),
          categories: (campaignData.categories || []) as string[],
          difficulty: (Number(campaignData.difficulty) || 0) as ccc.NumLike,
          image_url: (campaign?.metadata?.image_url || "") as string
        },
        status: (Number(campaign?.status) || 0) as ccc.NumLike,
        quests: validatedQuests,
        participants_count: (Number(campaign?.participants_count) || 0) as ccc.NumLike,
        total_completions: (Number(campaign?.total_completions) || 0) as ccc.NumLike
      }

      // Get necessary code hashes from protocol data
      const userCodeHash = protocolData?.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash
      const campaignCodeHash = protocolData?.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
      const protocolTypeHash = protocolCell.cellOutput.type?.hash()
      
      if (!userCodeHash || !campaignCodeHash || !protocolTypeHash) {
        throw new Error("Missing required protocol configuration")
      }

      // Get campaign outpoint from deployment
      const network = deploymentManager.getCurrentNetwork()
      const campaignOutPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType")
      if (!campaignOutPoint) {
        throw new Error("Campaign type contract not found in deployments")
      }

      // Create Campaign SSRI instance for new or existing campaigns
      let campaignInstance: Campaign | null = null
      
      if (isCreateMode) {
        // For new campaigns, create with empty args (SSRI will calculate ConnectedTypeID)
        const campaignTypeScript = ccc.Script.from({
          codeHash: campaignCodeHash,
          hashType: "type" as const,
          args: "0x", // Empty args - SSRI will calculate and fill the Connected Type ID
        })
        
        const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
        const executor = new ssri.ExecutorJsonRpc(executorUrl)
        
        campaignInstance = new Campaign(
          campaignOutPoint,
          campaignTypeScript,
          protocolCell,
          { executor }
        )
      } else {
        // For existing campaigns, we need to fetch the cell first to get its type script
        if (!signer) {
          debug.error("Signer not found")
          return
        }
        const existingCampaignCell = await fetchCampaignByTypeId(
          campaignTypeId as ccc.Hex,
          campaignCodeHash as ccc.Hex,
          signer.client,
          protocolCell
        )
        
        if (!existingCampaignCell || !existingCampaignCell.cellOutput.type) {
          throw new Error("Existing campaign cell not found or missing type script")
        }
        
        const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
        const executor = new ssri.ExecutorJsonRpc(executorUrl)
        
        campaignInstance = new Campaign(
          campaignOutPoint,
          existingCampaignCell.cellOutput.type,
          protocolCell,
          { executor }
        )
      }

      const adminService = new CampaignAdminService(
        signer,
        userCodeHash as ccc.Hex,
        protocolTypeHash as ccc.Hex,
        campaignCodeHash as ccc.Hex,
        protocolCell,
        campaignInstance
      )
      
      if (isCreateMode) {
        // For creating new campaigns, we need to use updateCampaign with no campaignTypeId
        debug.log("Creating campaign with initial funding:", {
          campaign: campaignData.title,
          fundingTokens: initialFunding.size,
          totalFunding: Array.from(initialFunding.entries()).map(([scriptHash, amount]) => ({
            scriptHash: scriptHash.slice(0, 10) + "...",
            amount: amount.toString()
          }))
        })
        
        // Convert initialFunding Map to array format for updateCampaign
        const udtFunding = initialFunding.size > 0 
          ? Array.from(initialFunding.entries()).map(([scriptHash, amount]) => ({
              scriptHash,
              amount
            }))
          : undefined
        
        // Create the campaign with initial funding in the same transaction
        const txHash = await adminService.updateCampaign(
          updatedCampaign,
          undefined, // no campaignTypeId for new campaigns
          undefined, // no existing transaction
          udtFunding, // pass the UDT funding array
          ckbInitialFunding // pass CKB funding (shannons)
        )
        debug.log("Campaign created with funding in single transaction, txHash:", txHash)
        
        // Clear local draft after successful on-chain creation
        try { clearCreateDraft() } catch {}
        
        // Show success message with funding info if applicable
        if (initialFunding.size > 0) {
          const fundingInfo = Array.from(initialFunding.entries())
            .map(([scriptHash, amount]) => {
              const token = udtRegistry.getTokenByScriptHash(scriptHash)
              return token ? `${udtRegistry.formatAmount(Number(amount), token)}` : `${amount.toString()} tokens`
            })
            .join(", ")
          
          alert(`Campaign created successfully with initial funding!\n\nTransaction: ${txHash}\n\nFunded with: ${fundingInfo}`)
        } else {
          alert("Campaign created successfully! Transaction: " + txHash)
        }
        
        router.push("/campaign-admin")
      } else {
        // For updating existing campaigns, don't pass campaignTypeId
        // The campaign instance already has the campaign loaded
        const txHash = await adminService.updateCampaign(updatedCampaign)
        debug.log("Campaign updated successfully with txHash:", txHash)
        alert("Campaign updated successfully! Transaction: " + txHash)
        await refreshCampaign()
      }
    } catch (error) {
      debug.error("Failed to save campaign:", error)
      alert(`Failed to save campaign: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

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
      
      // Add the campaign to approved list in protocol
      const updatedProtocol: ProtocolDataLike = {
        campaigns_approved: [
          ...(protocolData.campaigns_approved || []),
          formattedTypeId
        ],
        tipping_proposals: protocolData.tipping_proposals?.map(p => ({
          ...p,
          tipping_transaction_hash: p.tipping_transaction_hash ?? null
        })) || [],
        tipping_config: protocolData.tipping_config,
        endorsers_whitelist: protocolData.endorsers_whitelist || [],
        last_updated: Math.floor(Date.now() / 1000),
        protocol_config: protocolData.protocol_config
      }
      
      await updateProtocol(updatedProtocol)
      debug.log("Campaign approved successfully")
      alert("Campaign approved successfully!")
      
      // Refresh to show the approved status
      await refreshCampaign()
    } catch (error) {
      debug.error("Failed to approve campaign:", error)
      alert(`Failed to approve campaign: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsApproving(false)
    }
  }

  // Refresh campaign data
  const refreshCampaign = async () => {
    if (!campaignTypeId || isCreateMode) return
    
    try {
      setIsRefreshing(true)
      const campaignCodeHash = protocolData?.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
      if (!campaignCodeHash) {
        debug.error("Campaign code hash not found in protocol data")
        return
      }

      if (!signer) {
        debug.error("Signer not found")
        return
      }

      const campaignCell = await fetchCampaignByTypeId(
        campaignTypeId as ccc.Hex,
        campaignCodeHash as ccc.Hex,
        signer.client,
        protocolCell!
      )
      if (!campaignCell) {
        debug.error("Campaign cell not found during refresh")
        return
      }

      // Parse campaign data directly from the cell
      const campaignData = CampaignData.decode(campaignCell.outputData)
      
      if (campaignData) {
        setCampaign(campaignData)
        setLocalQuests(campaignData.quests || [])
      }
    } catch (error) {
      debug.error("Failed to refresh campaign:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Quest handlers
  const handleAddQuest = () => {
    const newQuest: QuestDataLike = {
      ...questForm,
      quest_id: localQuests.length + 1
    }
    setLocalQuests([...localQuests, newQuest])
    debug.log("Added quest to local state:", newQuest)
    
    // Reset form for next quest
    setQuestForm({
      quest_id: localQuests.length + 2,
      metadata: {
        title: "",
        short_description: "",
        long_description: "",
        requirements: "",
        difficulty: 1,
        time_estimate: 30
      },
      points: 100,
      rewards_on_completion: [],
      accepted_submission_user_type_ids: [],
      completion_deadline: BigInt(Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60)),
      status: 0,
      sub_tasks: [],
      completion_count: 0,
      initial_quota: 10
    })
    setIsAddingQuest(false)
  }

  const handleEditQuest = (questIndex: number) => {
    const quest = localQuests[questIndex]
    if (!quest) return
    
    setQuestForm({
      ...quest,
      initial_quota: 10
    })
    setEditingQuestIndex(questIndex)
    setIsAddingQuest(true)
  }

  const handleSaveEditedQuest = () => {
    if (editingQuestIndex === null) return
    
    const updatedQuests = [...localQuests]
    updatedQuests[editingQuestIndex] = questForm
    setLocalQuests(updatedQuests)
    
    debug.log("Updated quest in local state at index:", editingQuestIndex, questForm)
    
    // Reset form and close edit mode
    setEditingQuestIndex(null)
    setIsAddingQuest(false)
    setQuestForm({
      quest_id: localQuests.length + 1,
      metadata: {
        title: "",
        short_description: "",
        long_description: "",
        requirements: "",
        difficulty: 1,
        time_estimate: 30
      },
      points: 100,
      rewards_on_completion: [],
      accepted_submission_user_type_ids: [],
      completion_deadline: BigInt(Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60)),
      status: 0,
      sub_tasks: [],
      completion_count: 0,
      initial_quota: 10
    })
  }

  const handleDeleteQuest = (questIndex: number) => {
    if (confirm("Are you sure you want to delete this quest?")) {
      const updatedQuests = localQuests.filter((_, index) => index !== questIndex)
      setLocalQuests(updatedQuests)
      debug.log("Deleted quest from local state at index:", questIndex)
    }
  }


  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading campaign...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Error state
  if (!isCreateMode && !campaign && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
                <div>
                  <h3 className="font-semibold text-lg">Campaign Not Found</h3>
                  <p className="text-muted-foreground mt-2">
                    The campaign you're looking for doesn't exist or has been removed.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/campaign-admin">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Campaigns
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // Statistics calculations moved to CampaignStats component

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaign-admin">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Campaigns
                </Link>
              </Button>
              <h1 className="text-3xl font-bold">
                {isCreateMode ? "Create New Campaign" : (campaign?.metadata?.title || "Campaign Admin")}
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              {!isCreateMode && (
                <>
                  <Badge variant="secondary">
                    {campaign?.status === 0 ? "Draft" : 
                     campaign?.status === 1 ? "Active" : 
                     campaign?.status === 2 ? "Completed" : "Cancelled"}
                  </Badge>
                  
                  {/* Show Approve Campaign button for admins if not approved */}
                  {isAdmin && campaignTypeId && !protocolData?.campaigns_approved?.includes(campaignTypeId as ccc.Hex) && (
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
                  {campaignTypeId && protocolData?.campaigns_approved?.includes(campaignTypeId as ccc.Hex) && (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Approved
                    </Badge>
                  )}
                  
                  <Button 
                    onClick={refreshCampaign}
                    disabled={isRefreshing}
                    size="sm"
                    variant="outline"
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                </>
              )}
              
              {isCreateMode && (
                <Button 
                  onClick={fillTestData}
                  variant="outline"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Fill Test Data
                </Button>
              )}
              
              <Button 
                onClick={handleSaveCampaign}
                disabled={isSaving || !signer}
              >
                {isSaving ? "Saving..." : (isCreateMode ? "Create Campaign" : "Save Changes")}
              </Button>
            </div>
          </div>

          {/* Campaign Stats */}
          <CampaignStats 
            quests={isCreateMode ? localQuests : (campaign?.quests || [])}
            participantCount={campaign?.participants_count ? Number(campaign.participants_count) : 0}
            completionCount={campaign?.total_completions ? Number(campaign.total_completions) : 0}
          />
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="details">Campaign Details</TabsTrigger>
            <TabsTrigger value="quests">
              Quests {localQuests.length > 0 && `(${localQuests.length})`}
            </TabsTrigger>
            {isCreateMode && (
              <TabsTrigger value="funding">
                Initial Funding {initialFunding.size > 0 && `(${initialFunding.size})`}
              </TabsTrigger>
            )}
            {!isCreateMode && (
              <>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
                <TabsTrigger value="funding">Funding</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Campaign Details Tab */}
          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Information</CardTitle>
              </CardHeader>
              <CardContent>
                <CampaignForm 
                  campaignData={campaignData}
                  onChange={setCampaignData}
                  isCreateMode={isCreateMode}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quests Tab */}
          <TabsContent value="quests">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Campaign Quests</h2>
                <Button 
                  onClick={() => setIsAddingQuest(true)}
                  disabled={!isCreateMode && !campaign}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Quest
                </Button>
              </div>

              <QuestList 
                quests={isCreateMode ? localQuests : (campaign?.quests || [])}
                onEditQuest={handleEditQuest}
                onDeleteQuest={handleDeleteQuest}
                onAddQuest={() => setIsAddingQuest(true)}
                isCreateMode={isCreateMode}
              />
            </div>
          </TabsContent>

          {/* Initial Funding Tab (Create Mode) */}
          {isCreateMode && (
            <TabsContent value="funding">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">Initial Campaign Funding</h2>
                  <p className="text-muted-foreground mt-1">
                    Lock UDT tokens to your campaign for quest rewards
                  </p>
                </div>
                
                <InitialFunding
                  quests={localQuests}
                  signer={signer}
                  onFundingChange={setInitialFunding}
                  onCKBFundingChange={setCkbInitialFunding}
                  initialQuota={localQuests.map((q: QuestDataLike & { initial_quota?: number }) => q.initial_quota || 10)}
                />
              </div>
            </TabsContent>
          )}

          {/* Submissions Tab */}
          {!isCreateMode && (
            <TabsContent value="submissions">
              <SubmissionsTab campaignTypeId={campaignTypeId as ccc.Hex} />
            </TabsContent>
          )}

          {/* Funding Tab */}
          {!isCreateMode && (
            <TabsContent value="funding">
              <FundingTab 
              campaignTypeId={campaignTypeId as ccc.Hex } 
              initialQuotas={localQuests.map((q: QuestDataLike & { initial_quota?: number }) => q.initial_quota || 10)}
              />
            </TabsContent>
          )}

          {/* Analytics Tab */}
          {!isCreateMode && (
            <TabsContent value="analytics">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Analytics</CardTitle>
                </CardHeader>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Analytics dashboard coming soon</p>
                    <p className="text-sm mt-2">
                      Track participant progress, completion rates, and engagement metrics
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Quest Dialog */}
      <QuestDialog 
        open={isAddingQuest}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingQuest(false)
            setEditingQuestIndex(null)
            // Reset form
            setQuestForm({
              quest_id: localQuests.length + 1,
              metadata: {
                title: "",
                short_description: "",
                long_description: "",
                requirements: "",
                difficulty: 1,
                time_estimate: 30
              },
              points: 100,
              rewards_on_completion: [],
              accepted_submission_user_type_ids: [],
              completion_deadline: BigInt(Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60)),
              status: 0,
              sub_tasks: [],
              completion_count: 0,
              initial_quota: 10
            })
          }
        }}
        questForm={questForm}
        onQuestFormChange={setQuestForm}
        onSave={editingQuestIndex !== null ? handleSaveEditedQuest : handleAddQuest}
        editMode={editingQuestIndex !== null}
        localQuestsLength={localQuests.length}
      />
    </div>
  )
}
