"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { ccc } from "@ckb-ccc/core"
import { fetchCampaignsConnectedToProtocol, extractTypeIdFromCampaignCell } from "@/lib/ckb/campaign-cells"
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells"
import { ProtocolData, CampaignData } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { 
  Shield, 
  Plus, 
  Edit, 
  Eye, 
  Users, 
  Trophy, 
  CheckCircle,
  Clock,
  DollarSign,
  X,
  FileText,
  Star,
  TrendingUp,
  Zap,
  Search,
  Filter,
  MessageCircle,
  Fingerprint
} from "lucide-react"
import Link from "next/link"
import { ProtocolManagement } from "@/components/admin/protocol-management"
import { useProtocol } from "@/lib/providers/protocol-provider"

// Hub Admin configuration
const CURRENT_USER = {
  id: 1,
  name: "Hub Administrator",
  email: "admin@ckboost.com",
  address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2jk6pyw9vlnfakx7vp4t5lxg0lzvvsp3c5adflu",
  avatar: "HA",
  role: "platform_admin",
  permissions: ["review_campaigns", "manage_users", "review_tips", "manage_leaderboard"]
}

// Mock pending campaign applications
const PENDING_CAMPAIGNS = [
  {
    id: 1,
    title: "NFT Art Showcase Campaign",
    description: "Promote NFT creation and showcase on CKB blockchain",
    submitter: "NFT Creator DAO",
    submitterEmail: "contact@nftcreator.dao",
    category: "NFT",
    requestedBudget: 2000,
    duration: "60 days",
    questsPlanned: 8,
    submittedDate: "2024-01-20",
    status: "pending",
    documents: ["proposal.pdf", "budget.xlsx", "roadmap.md"]
  },
  {
    id: 2,
    title: "DeFi Liquidity Mining Education",
    description: "Educate users about liquidity mining concepts and DeFi protocols on CKB",
    submitter: "CKB DeFi Alliance",
    submitterEmail: "team@ckbdefi.org",
    category: "Education",
    requestedBudget: 4500,
    duration: "90 days",
    questsPlanned: 12,
    submittedDate: "2024-01-18",
    status: "under_review",
    documents: ["educational-plan.pdf", "timeline.pdf"]
  }
]

// Mock tip proposals for review
const TIP_PROPOSALS = [
  {
    id: 1,
    proposer: "CommunityLead",
    nominee: "CKBExpert",
    amount: 150,
    reason: "Outstanding contribution to developer documentation and community support over the past month",
    submittedDate: "2024-01-21",
    status: "pending",
    votes: { for: 8, against: 1 },
    evidence: ["GitHub contributions", "Discord help threads", "Documentation PRs"]
  },
  {
    id: 2,
    proposer: "DevContributor",
    nominee: "SmartContractGuru",
    amount: 200,
    reason: "Created comprehensive smart contract tutorial series and helped debug community contracts",
    submittedDate: "2024-01-19",
    status: "pending",
    votes: { for: 12, against: 0 },
    evidence: ["Tutorial videos", "Code reviews", "Community feedback"]
  }
]

// Mock leaderboard rewards to configure - Enhanced version
const LEADERBOARD_REWARDS = [
  {
    id: 1,
    period: "Monthly - February 2024",
    status: "upcoming",
    type: "monthly",
    startDate: "2024-02-01",
    endDate: "2024-02-29",
    totalPrize: {
      CKB: 1000,
      SPORE: 500,
      DEFI: 200
    },
    distributionModel: "tiered",
    tiers: [
      { 
        rank: "1st Place", 
        minRank: 1, 
        maxRank: 1, 
        rewards: { CKB: 400, SPORE: 200, DEFI: 80 },
        recipients: 1,
        percentage: 40
      },
      { 
        rank: "2nd Place", 
        minRank: 2, 
        maxRank: 2, 
        rewards: { CKB: 250, SPORE: 125, DEFI: 50 },
        recipients: 1,
        percentage: 25
      },
      { 
        rank: "3rd Place", 
        minRank: 3, 
        maxRank: 3, 
        rewards: { CKB: 150, SPORE: 75, DEFI: 30 },
        recipients: 1,
        percentage: 15
      },
      { 
        rank: "Top 10", 
        minRank: 4, 
        maxRank: 10, 
        rewards: { CKB: 25, SPORE: 12, DEFI: 5 },
        recipients: 7,
        percentage: 17.5
      },
      { 
        rank: "Top 50", 
        minRank: 11, 
        maxRank: 50, 
        rewards: { CKB: 4, SPORE: 2, DEFI: 1 },
        recipients: 40,
        percentage: 16
      }
    ],
    eligibilityRules: {
      minPoints: 100,
      minQuests: 3,
      verificationRequired: true,
      acceptableVerifications: ["telegram", "kyc", "did", "manual"], // Which verification methods are accepted
      excludeManualReview: false, // Some campaigns may refuse manual review
      excludeNewUsers: true, // Users joined less than 7 days ago
      excludeSuspended: true
    },
    autoDistribution: true,
    distributionDate: "2024-03-01",
    specialBonus: {
      enabled: true,
      type: "streak_bonus",
      description: "10% bonus for users with 7+ day streak",
      multiplier: 1.1,
      condition: "streak >= 7"
    }
  },
  {
    id: 2,
    period: "Q1 2024 Grand Championship",
    status: "active",
    type: "quarterly",
    startDate: "2024-01-01",
    endDate: "2024-03-31",
    totalPrize: {
      CKB: 5000,
      SPORE: 2500,
      DEFI: 1000,
      NFT: 50 // Special NFT rewards
    },
    distributionModel: "percentage",
    tiers: [
      { 
        rank: "Champion", 
        minRank: 1, 
        maxRank: 1, 
        rewards: { CKB: 1500, SPORE: 750, DEFI: 300, NFT: 1 },
        recipients: 1,
        percentage: 30
      },
      { 
        rank: "Elite", 
        minRank: 2, 
        maxRank: 5, 
        rewards: { CKB: 500, SPORE: 250, DEFI: 100, NFT: 1 },
        recipients: 4,
        percentage: 40
      },
      { 
        rank: "Advanced", 
        minRank: 6, 
        maxRank: 20, 
        rewards: { CKB: 100, SPORE: 50, DEFI: 20 },
        recipients: 15,
        percentage: 30
      }
    ],
    eligibilityRules: {
      minPoints: 500,
      minQuests: 10,
      verificationRequired: true,
      acceptableVerifications: ["kyc", "did"], // High-value campaign excludes telegram and manual review
      excludeManualReview: true, // This campaign refuses manual review
      excludeNewUsers: true,
      excludeSuspended: true,
      minCampaignsParticipated: 2
    },
    autoDistribution: false,
    distributionDate: "2024-04-05",
    specialBonus: {
      enabled: true,
      type: "community_bonus",
      description: "25% bonus for top community contributors",
      multiplier: 1.25,
      condition: "community_score >= 80"
    }
  },
  {
    id: 3,
    period: "Weekly Sprint - Week 8",
    status: "completed",
    type: "weekly",
    startDate: "2024-02-19",
    endDate: "2024-02-25",
    totalPrize: {
      CKB: 200,
      SPORE: 100
    },
    distributionModel: "fixed",
    tiers: [
      { 
        rank: "Winner", 
        minRank: 1, 
        maxRank: 1, 
        rewards: { CKB: 80, SPORE: 40 },
        recipients: 1,
        percentage: 40
      },
      { 
        rank: "Runner-up", 
        minRank: 2, 
        maxRank: 3, 
        rewards: { CKB: 40, SPORE: 20 },
        recipients: 2,
        percentage: 40
      },
      { 
        rank: "Participant", 
        minRank: 4, 
        maxRank: 10, 
        rewards: { CKB: 10, SPORE: 5 },
        recipients: 7,
        percentage: 35
      }
    ],
    eligibilityRules: {
      minPoints: 50,
      minQuests: 1,
      verificationRequired: true,
      acceptableVerifications: ["telegram", "kyc", "did"], // Weekly campaign accepts most but not manual review
      excludeManualReview: true, // Weekly campaigns typically want faster verification
      excludeNewUsers: false,
      excludeSuspended: true
    },
    autoDistribution: true,
    distributionDate: "2024-02-26",
    actualDistribution: {
      completed: true,
      date: "2024-02-26",
      totalRecipients: 10,
      totalDistributed: { CKB: 200, SPORE: 100 }
    }
  }
]

// Enhanced platform users with comprehensive data from admin/users/page.tsx
const PLATFORM_USERS = [
  {
    id: 1,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqds6ed78yze6eyfyvd537z66ur620n96rtsfrf67g",
    displayName: "CKBMaster",
    email: "ckbmaster@ckboost.com",
    firstActivity: "2023-10-15",
    lastActive: "2024-02-28",
    status: "active",
    verified: true,
    verificationStatus: {
      telegram: true,
      kyc: false,
      did: false,
      manualReview: false
    },
    verificationMethod: "telegram",
    verificationDate: "2023-10-16",
    role: "user",
    totalPoints: 2450,
    questsCompleted: 18,
    campaignsJoined: 4,
    tokensEarned: { CKB: 850, SPORE: 420, DEFI: 180 },
    currentRank: 1,
    sybilRisk: "low",
    linkedAccounts: {
      telegram: "@ckbmaster_verified",
      did: null,
      kyc: null,
    },
    activities: {
      questsStarted: 22,
      questsCompleted: 18,
      completionRate: 81.8,
      averagePointsPerQuest: 136,
      longestStreak: 12,
      currentStreak: 3,
    },
    campaignParticipation: [
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000001", campaignName: "CKB Ecosystem Growth Initiative", questsCompleted: 3, pointsEarned: 650 },
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000002", campaignName: "DeFi Education Campaign", questsCompleted: 4, pointsEarned: 580 },
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000003", campaignName: "Community Builder Program", questsCompleted: 6, pointsEarned: 720 },
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000065", campaignName: "CKB Testnet Launch Campaign", questsCompleted: 5, pointsEarned: 500 },
    ],
  },
  {
    id: 2,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvglkprurm00l7hrs3rfqmmzyy3ll7djdsujdm6",
    displayName: "BlockchainBee",
    email: "bee@ckboost.com",
    firstActivity: "2023-11-02",
    lastActive: "2024-02-27",
    status: "active",
    verified: true,
    verificationStatus: {
      telegram: false,
      kyc: true,
      did: false,
      manualReview: false
    },
    verificationMethod: "kyc",
    verificationDate: "2023-11-03",
    role: "user",
    totalPoints: 2180,
    questsCompleted: 15,
    campaignsJoined: 3,
    tokensEarned: { CKB: 720, SPORE: 380, DEFI: 150 },
    currentRank: 2,
    sybilRisk: "low",
    linkedAccounts: {
      telegram: null,
      did: null,
      kyc: "verified_2023_11_03",
    },
    activities: {
      questsStarted: 18,
      questsCompleted: 15,
      completionRate: 83.3,
      averagePointsPerQuest: 145,
      longestStreak: 8,
      currentStreak: 5,
    },
    campaignParticipation: [
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000001", campaignName: "CKB Ecosystem Growth Initiative", questsCompleted: 2, pointsEarned: 450 },
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000002", campaignName: "DeFi Education Campaign", questsCompleted: 6, pointsEarned: 780 },
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000004", campaignName: "NFT Creator Bootcamp", questsCompleted: 7, pointsEarned: 950 },
    ],
  },
  {
    id: 3,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdj4xq5uer6gr8ndxzuj0nwmf34rnk9ysa0ksk",
    displayName: "CryptoNinja",
    email: "ninja@ckboost.com",
    firstActivity: "2023-12-10",
    lastActive: "2024-02-26",
    status: "active",
    verified: false,
    verificationStatus: {
      telegram: false,
      kyc: false,
      did: false,
      manualReview: false
    },
    verificationMethod: null,
    verificationDate: null,
    role: "user",
    totalPoints: 1850,
    questsCompleted: 12,
    campaignsJoined: 2,
    tokensEarned: { CKB: 620, SPORE: 280, DEFI: 120 },
    currentRank: 5,
    sybilRisk: "medium",
    linkedAccounts: {
      telegram: null,
      did: null,
      kyc: null,
    },
    activities: {
      questsStarted: 16,
      questsCompleted: 12,
      completionRate: 75.0,
      averagePointsPerQuest: 154,
      longestStreak: 6,
      currentStreak: 0,
    },
    campaignParticipation: [
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000002", campaignName: "DeFi Education Campaign", questsCompleted: 5, pointsEarned: 650 },
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000003", campaignName: "Community Builder Program", questsCompleted: 7, pointsEarned: 1200 },
    ],
  },
  {
    id: 4,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq289vl7splj5lz7lq2hc0z0kw97mp9a0jtlq4vwy",
    displayName: "SuspiciousUser",
    email: "suspicious@ckboost.com",
    firstActivity: "2024-01-22",
    lastActive: "2024-02-28",
    status: "flagged",
    verified: false,
    verificationStatus: {
      telegram: false,
      kyc: false,
      did: false,
      manualReview: false
    },
    verificationMethod: null,
    verificationDate: null,
    role: "user",
    totalPoints: 150,
    questsCompleted: 2,
    campaignsJoined: 1,
    tokensEarned: { CKB: 50, SPORE: 25, DEFI: 10 },
    currentRank: 45,
    sybilRisk: "high",
    linkedAccounts: {
      telegram: null,
      did: null,
      kyc: null,
    },
    activities: {
      questsStarted: 8,
      questsCompleted: 2,
      completionRate: 25.0,
      averagePointsPerQuest: 75,
      longestStreak: 1,
      currentStreak: 0,
    },
    campaignParticipation: [
      { campaignTypeId: "0x0000000000000000000000000000000000000000000000000000000000000001", campaignName: "CKB Ecosystem Growth Initiative", questsCompleted: 2, pointsEarned: 150 },
    ],
  }
]

// Mock pending verification requests
const PENDING_VERIFICATIONS = [
  {
    id: 101,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq289vl7splj5lz7lq2hc0z0kw97mp9a0jtlq4vwy",
    displayName: "NewUser123",
    email: "newuser@ckboost.com",
    verificationMethod: "manual",
    submittedAt: "2024-02-25T14:30:00Z",
    application:
      "I'm a blockchain developer with 3 years of experience. I've contributed to several open-source projects and would like to participate in the CKB ecosystem. My GitHub: github.com/newuser123, Twitter: @newuser123_dev",
    status: "pending",
    sybilRisk: "low",
  },
  {
    id: 102,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwku7gvfmqc9vkqqufnzp08nqdkw7ll0u7fcwmvvp",
    displayName: "CommunityHelper",
    email: "helper@ckboost.com",
    verificationMethod: "telegram",
    submittedAt: "2024-02-27T09:15:00Z",
    telegramUsername: "@community_helper_official",
    status: "pending",
    sybilRisk: "low",
  },
]

export default function PlatformAdminDashboard() {
  const { protocolData, signer } = useProtocol()
  const [activeTab, setActiveTab] = useState("overview")
  const [isRewardDialogOpen, setIsRewardDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedVerification, setSelectedVerification] = useState("all")
  const [selectedRole, setSelectedRole] = useState("all")
  const [selectedUser, setSelectedUser] = useState<typeof PLATFORM_USERS[0] | null>(null)
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false)
  const [connectedCampaigns, setConnectedCampaigns] = useState<ccc.Cell[]>([])
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false)
  
  // Fetch campaigns connected to the protocol
  useEffect(() => {
    const fetchCampaigns = async () => {
      debug.group('Platform Admin - Fetch Campaigns')
      debug.log('Signer status:', { signerPresent: !!signer })
      
      if (!signer) {
        debug.warn('No signer available, skipping campaign fetch')
        debug.groupEnd()
        return
      }
      
      setIsLoadingCampaigns(true)
      try {
        // Get protocol cell to extract campaign code hash
        debug.log('Fetching protocol cell...')
        const protocolCell = await fetchProtocolCell(signer)
        
        if (!protocolCell) {
          debug.error("Protocol cell not found")
          debug.groupEnd()
          return
        }
        
        debug.log('Protocol cell found:', {
          typeHash: protocolCell.cellOutput.type?.hash(),
          dataLength: protocolCell.outputData.length
        })

        // Parse protocol data to get campaign code hash
        debug.log('Parsing protocol data...')
        const protocolDataParsed = ProtocolData.decode(protocolCell.outputData)
        const campaignCodeHash = protocolDataParsed.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
        
        debug.log('Extracted campaign code hash:', campaignCodeHash)
        
        // Get the protocol type hash (from the protocol cell's type script)
        const protocolTypeHash = protocolCell.cellOutput.type?.hash() || "0x"
        debug.log('Protocol type hash:', protocolTypeHash)
        
        // Fetch campaigns connected to this protocol
        debug.log('Fetching campaigns connected to protocol...')
        const campaigns = await fetchCampaignsConnectedToProtocol(
          signer,
          campaignCodeHash as ccc.Hex,
          protocolTypeHash as ccc.Hex
        )
        
        debug.log(`Received ${campaigns.length} connected campaigns`)
        setConnectedCampaigns(campaigns)
        
        // Log campaign details
        if (campaigns.length > 0) {
          debug.group('Campaign Details')
          campaigns.forEach((campaign, index) => {
            try {
              const campaignData = CampaignData.decode(campaign.outputData)
              debug.log(`Campaign ${index + 1}:`, {
                title: campaignData.metadata.title,
                typeHash: campaign.cellOutput.type?.hash(),
                categories: campaignData.metadata.categories
              })
            } catch (e) {
              debug.error(`Failed to parse campaign ${index + 1}:`, e)
            }
          })
          debug.groupEnd()
        }
      } catch (error) {
        debug.error("Failed to fetch campaigns:", error)
      } finally {
        setIsLoadingCampaigns(false)
        debug.groupEnd()
      }
    }

    fetchCampaigns()
  }, [signer])
  
  const [newReward, setNewReward] = useState({
    period: "",
    type: "monthly",
    totalPrize: {
      CKB: "",
      SPORE: "",
      DEFI: ""
    },
    distributionModel: "tiered",
    tiers: [
      { rank: "1st Place", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 40 },
      { rank: "2nd Place", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 25 },
      { rank: "3rd Place", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 15 },
      { rank: "Top 10", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 20 }
    ],
    eligibilityRules: {
      minPoints: 100,
      minQuests: 3,
      verificationRequired: true,
      acceptableVerifications: ["telegram", "kyc", "did", "manual"],
      excludeManualReview: false
    },
    autoDistribution: true
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "under_review":
        return "bg-blue-100 text-blue-800"
      case "approved":
        return "bg-green-100 text-green-800"
      case "rejected":
        return "bg-red-100 text-red-800"
      case "active":
        return "bg-green-100 text-green-800"
      case "upcoming":
        return "bg-purple-100 text-purple-800"
      case "flagged":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "NFT":
        return "bg-pink-100 text-pink-800"
      case "Education":
        return "bg-green-100 text-green-800"
      case "Community":
        return "bg-purple-100 text-purple-800"
      case "DeFi":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatDate = (dateString: string) => {
    // Use consistent date formatting to avoid hydration mismatch
    return formatDateConsistent(dateString)
  }

  const handleCreateReward = () => {
    console.log("Creating reward:", newReward)
    setIsRewardDialogOpen(false)
    setNewReward({
      period: "",
      type: "monthly",
      totalPrize: {
        CKB: "",
        SPORE: "",
        DEFI: ""
      },
      distributionModel: "tiered",
      tiers: [
        { rank: "1st Place", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 40 },
        { rank: "2nd Place", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 25 },
        { rank: "3rd Place", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 15 },
        { rank: "Top 10", rewards: { CKB: "", SPORE: "", DEFI: "" }, percentage: 20 }
      ],
      eligibilityRules: {
        minPoints: 100,
        minQuests: 3,
        verificationRequired: true,
        acceptableVerifications: ["telegram", "kyc", "did", "manual"],
        excludeManualReview: false
      },
      autoDistribution: true
    })
  }

  const totalPendingCampaigns = PENDING_CAMPAIGNS.filter(c => c.status === "pending").length
  const totalUsers = PLATFORM_USERS.length
  const totalActiveUsers = PLATFORM_USERS.filter(u => u.status === "active").length
  const totalPendingTips = TIP_PROPOSALS.filter(t => t.status === "pending").length
  const totalRewards = LEADERBOARD_REWARDS.reduce((sum, r) => sum + r.totalPrize.CKB, 0)

  // User management functions
  const filteredUsers = PLATFORM_USERS.filter((user) => {
    const matchesSearch =
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.pubkey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = selectedStatus === "all" || user.status === selectedStatus
    const matchesVerification =
      selectedVerification === "all" ||
      (selectedVerification === "verified" && user.verified) ||
      (selectedVerification === "unverified" && !user.verified)
    const matchesRole = selectedRole === "all" || user.role === selectedRole

    return matchesSearch && matchesStatus && matchesVerification && matchesRole
  })

  const handleUserClick = (user: typeof PLATFORM_USERS[0]) => {
    setSelectedUser(user)
    setIsUserDetailsOpen(true)
  }

  const handleVerificationAction = (verificationId: number, action: "approve" | "reject") => {
    console.log(`${action} verification ${verificationId}`)
  }

  const getSybilRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-green-100 text-green-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "high":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getVerificationIcon = (method: string | null) => {
    switch (method) {
      case "telegram":
        return <MessageCircle className="w-4 h-4" />
      case "kyc":
        return <FileText className="w-4 h-4" />
      case "did":
        return <Fingerprint className="w-4 h-4" />
      case "manual":
        return <Users className="w-4 h-4" />
      default:
        return <X className="w-4 h-4" />
    }
  }


  // Get user's verification status summary
  const getUserVerificationSummary = (user: typeof PLATFORM_USERS[0]) => {
    if (user.verificationStatus.kyc || user.verificationStatus.did) {
      return { status: "identity_verified", color: "bg-green-100 text-green-800", text: "Identity Verified" }
    }
    if (user.verificationStatus.telegram) {
      return { status: "social_verified", color: "bg-blue-100 text-blue-800", text: "Social Verified" }
    }
    if (user.verificationStatus.manualReview) {
      return { status: "manual_verified", color: "bg-purple-100 text-purple-800", text: "Manual Verified" }
    }
    return { status: "unverified", color: "bg-red-100 text-red-800", text: "Unverified" }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-purple-50 to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-8 h-8 text-red-600" />
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-purple-600 bg-clip-text text-transparent">
                    Platform Admin Dashboard
                  </h1>
                </div>
                <p className="text-lg text-muted-foreground">
                  Manage platform operations, review applications, and oversee community governance
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-red-100 text-red-800">
                    🛡️ Platform Administrator
                  </Badge>
                  <Link href="/campaign-admin">
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 cursor-pointer hover:bg-amber-200">
                      👑 Campaign Admin Access
                    </Badge>
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {protocolData && (
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gradient-to-br from-red-200 to-purple-200">
                        {CURRENT_USER.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm">
                      <div className="font-medium">{CURRENT_USER.name}</div>
                      <div className="text-muted-foreground">{CURRENT_USER.address}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Campaigns</p>
                    <p className="text-2xl font-bold">{totalPendingCampaigns}</p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-full">
                    <FileText className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold">{totalUsers}</p>
                    <p className="text-xs text-muted-foreground">{totalActiveUsers} active</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Tips</p>
                    <p className="text-2xl font-bold">{totalPendingTips}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Leaderboard Rewards</p>
                    <p className="text-2xl font-bold">{totalRewards}</p>
                    <p className="text-xs text-muted-foreground">CKB allocated</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <Trophy className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Platform Health</p>
                    <p className="text-2xl font-bold">98%</p>
                  </div>
                  <div className="p-3 bg-indigo-100 rounded-full">
                    <TrendingUp className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="campaigns">Campaign Reviews</TabsTrigger>
              <TabsTrigger value="users">User Management</TabsTrigger>
              <TabsTrigger value="tips">Tip Proposals</TabsTrigger>
              <TabsTrigger value="rewards">Leaderboard Rewards</TabsTrigger>
              <TabsTrigger value="protocol">Protocol Management</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Platform Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Platform Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 rounded-full">
                          <FileText className="w-4 h-4 text-yellow-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">New campaign application</p>
                          <p className="text-xs text-muted-foreground">
                            &quot;NFT Art Showcase Campaign&quot; submitted by NFT Creator DAO
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">1h ago</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-full">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Tip proposal approved</p>
                          <p className="text-xs text-muted-foreground">
                            150 CKB tip to CKBExpert for documentation contributions
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">3h ago</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">New user registered</p>
                          <p className="text-xs text-muted-foreground">
                            CryptoEnthusiast joined the platform
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">5h ago</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-full">
                          <Trophy className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Leaderboard updated</p>
                          <p className="text-xs text-muted-foreground">
                            January 2024 monthly rewards distributed
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">1d ago</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Platform Health Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Platform Health</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">User Satisfaction</span>
                        <span className="text-sm font-medium">94%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Campaign Success Rate</span>
                        <span className="text-sm font-medium">87%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Average Review Time</span>
                        <span className="text-sm font-medium">2.1 days</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Community Engagement</span>
                        <span className="text-sm font-medium">89%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Platform Uptime</span>
                        <span className="text-sm font-medium">99.8%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="campaigns" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Campaign Application Reviews</h2>
                <Badge className="bg-yellow-100 text-yellow-800">
                  {connectedCampaigns.length} Connected Campaigns
                </Badge>
              </div>
              
              {isLoadingCampaigns ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading campaigns from blockchain...</p>
                  </div>
                </div>
              ) : connectedCampaigns.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">No campaigns found</p>
                    <p className="text-sm text-muted-foreground">
                      Campaigns connected to this protocol will appear here once they are deployed.
                    </p>
                  </CardContent>
                </Card>
              ) : (
              <div className="grid gap-6">
                {connectedCampaigns.map((campaign, index) => {
                  try {
                    const campaignData = CampaignData.decode(campaign.outputData)
                    const campaignTypeId = extractTypeIdFromCampaignCell(campaign) || "0x"
                    
                    return (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-xl">{campaignData.metadata.title}</CardTitle>
                          <p className="text-muted-foreground mt-1">{campaignData.metadata.short_description}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <Badge className="bg-green-100 text-green-800">
                              Active
                            </Badge>
                            {campaignData.metadata.categories.map((category, catIndex) => (
                              <Badge key={catIndex} variant="outline" className={getCategoryColor(category)}>
                                {category}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground mb-1">Created by</div>
                          <div className="font-medium">{campaignData.endorser.endorser_name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            ID: {campaignTypeId.slice(0, 10)}...
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Created At</div>
                          <div className="font-semibold">
                            {campaignData.created_at ? 
                              formatDateConsistent(new Date(Number(campaignData.created_at))) : 
                              "Unknown"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Duration</div>
                          <div className="font-semibold">
                            {campaignData.ending_time && campaignData.starting_time ? 
                              `${Math.ceil((Number(campaignData.ending_time) - Number(campaignData.starting_time)) / (1000 * 60 * 60 * 24))} days` : 
                              "Ongoing"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Total Quests</div>
                          <div className="font-semibold">{campaignData.quests.length}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Participants</div>
                          <div className="font-semibold">{campaignData.participants_count || 0}</div>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="text-sm text-muted-foreground mb-2">Description</div>
                        <p className="text-sm">{campaignData.metadata.long_description}</p>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/campaign/${campaignTypeId}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            View Details
                          </Button>
                        </Link>
                        <Link href={`/campaign/${campaignTypeId}`}>
                          <Button 
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Review & Approve
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                    )
                  } catch (error) {
                    console.warn("Failed to parse campaign data:", error)
                    return null
                  }
                })}
              </div>
              )}
            </TabsContent>

                        <TabsContent value="users" className="space-y-6">
              {/* Pending Verifications */}
              {PENDING_VERIFICATIONS.length > 0 && (
                <Card className="bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                      <Clock className="w-5 h-5" />
                      Pending Verifications ({PENDING_VERIFICATIONS.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {PENDING_VERIFICATIONS.map((verification) => (
                      <div
                        key={verification.id}
                        className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback>{verification.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{verification.displayName}</div>
                            <div className="text-sm text-muted-foreground">{verification.email}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {getVerificationIcon(verification.verificationMethod)}
                              <span className="text-xs capitalize">{verification.verificationMethod} verification</span>
                              <Badge className={getSybilRiskColor(verification.sybilRisk)}>
                                {verification.sybilRisk} risk
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerificationAction(verification.id, "approve")}
                            className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-900"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerificationAction(verification.id, "reject")}
                            className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Search and Filters */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search users by name, pubkey, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-800"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters:</span>
                  </div>

                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedVerification} onValueChange={setSelectedVerification}>
                    <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Verification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="unverified">Unverified</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Users List */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Active Users ({filteredUsers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                        onClick={() => handleUserClick(user)}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback>{user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{user.displayName}</span>
                              {user.verified && <Shield className="w-4 h-4 text-green-600" />}
                              <Badge variant={user.role === "admin" ? "default" : "outline"}>{user.role}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              <span>Rank #{user.currentRank}</span>
                              <span>{user.totalPoints.toLocaleString()} points</span>
                              <span>{user.questsCompleted} quests completed</span>
                              <Badge className={getSybilRiskColor(user.sybilRisk)}>{user.sybilRisk} risk</Badge>
                              <Badge className={getUserVerificationSummary(user).color}>
                                {getUserVerificationSummary(user).text}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    ))}

                    {filteredUsers.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No users found matching your criteria</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* User Details Modal */}
              <Dialog open={isUserDetailsOpen} onOpenChange={setIsUserDetailsOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  {selectedUser && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>{selectedUser.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {selectedUser.displayName}
                          {selectedUser.verified && <Shield className="w-5 h-5 text-green-600" />}
                        </DialogTitle>
                      </DialogHeader>

                      <div className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium">Public Key</Label>
                            <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">{selectedUser.pubkey}</div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Email</Label>
                            <div className="text-sm">{selectedUser.email}</div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Role</Label>
                            <Badge variant={selectedUser.role === "admin" ? "default" : "outline"}>
                              {selectedUser.role}
                            </Badge>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Sybil Risk</Label>
                            <Badge className={getSybilRiskColor(selectedUser.sybilRisk)}>
                              {selectedUser.sybilRisk} risk
                            </Badge>
                          </div>
                        </div>

                        {/* Verification Status */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Verification Status</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(selectedUser.verificationStatus).map(([method, verified]) => (
                              <div key={method} className="flex items-center gap-2 p-3 border dark:border-gray-700 rounded-lg">
                                {getVerificationIcon(method)}
                                <div>
                                  <div className="text-sm font-medium capitalize">{method}</div>
                                  <div className={`text-xs ${verified ? 'text-green-600' : 'text-red-600'}`}>
                                    {verified ? 'Verified' : 'Not verified'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Activity Stats */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Activity Statistics</Label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">{selectedUser.activities.questsCompleted}</div>
                              <div className="text-xs text-muted-foreground">Quests Completed</div>
                            </div>
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">{selectedUser.activities.completionRate}%</div>
                              <div className="text-xs text-muted-foreground">Completion Rate</div>
                            </div>
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">{selectedUser.activities.currentStreak}</div>
                              <div className="text-xs text-muted-foreground">Current Streak</div>
                            </div>
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">{selectedUser.activities.averagePointsPerQuest}</div>
                              <div className="text-xs text-muted-foreground">Avg Points/Quest</div>
                            </div>
                          </div>
                        </div>

                        {/* Campaign Participation */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Campaign Participation</Label>
                          <div className="space-y-2">
                            {selectedUser.campaignParticipation.map((campaign, index) => (
                              <div key={index} className="flex items-center justify-between p-3 border dark:border-gray-700 rounded-lg">
                                <div>
                                  <div className="font-medium text-sm">{campaign.campaignName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {campaign.questsCompleted} quests completed
                                  </div>
                                </div>
                                <Badge variant="outline">{campaign.pointsEarned} points</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="tips" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Tip Proposal Reviews</h2>
                <Badge className="bg-green-100 text-green-800">
                  {totalPendingTips} Pending Review
                </Badge>
              </div>

              <div className="grid gap-6">
                {TIP_PROPOSALS.map((tip) => (
                  <Card key={tip.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">Tip Proposal: {tip.amount} CKB</CardTitle>
                            <Badge className={getStatusColor(tip.status)}>
                              {tip.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            <span className="font-medium">{tip.proposer}</span> → <span className="font-medium">{tip.nominee}</span>
                          </div>
                          <p className="text-muted-foreground">{tip.reason}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground mb-1">Community Votes</div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-800">
                              👍 {tip.votes.for}
                            </Badge>
                            <Badge className="bg-red-100 text-red-800">
                              👎 {tip.votes.against}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <div className="text-sm text-muted-foreground mb-2">Supporting Evidence</div>
                        <div className="flex gap-2">
                          {tip.evidence.map((evidence, index) => (
                            <Badge key={index} variant="outline" className="bg-blue-50 dark:bg-blue-900">
                              ✓ {evidence}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Submitted {formatDate(tip.submittedDate)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            Review Evidence
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button size="sm">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="rewards" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Leaderboard Reward Management</h2>
                <Dialog open={isRewardDialogOpen} onOpenChange={setIsRewardDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Create Reward Period
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Leaderboard Rewards</DialogTitle>
                      <DialogDescription>
                        Set up rewards for the next leaderboard period with multiple token types and flexible distribution.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="period">Period</Label>
                          <Input
                            id="period"
                            placeholder="e.g., Monthly - March 2024"
                            value={newReward.period}
                            onChange={(e) => setNewReward({ ...newReward, period: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="type">Type</Label>
                          <Select 
                            value={newReward.type} 
                            onValueChange={(value) => setNewReward({ ...newReward, type: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="quarterly">Quarterly</SelectItem>
                              <SelectItem value="special">Special Event</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">Total Prize Pool</Label>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="ckb">CKB</Label>
                            <Input
                              id="ckb"
                              type="number"
                              placeholder="1000"
                              value={newReward.totalPrize.CKB}
                              onChange={(e) => setNewReward({ 
                                ...newReward, 
                                totalPrize: { ...newReward.totalPrize, CKB: e.target.value }
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="spore">SPORE</Label>
                            <Input
                              id="spore"
                              type="number"
                              placeholder="500"
                              value={newReward.totalPrize.SPORE}
                              onChange={(e) => setNewReward({ 
                                ...newReward, 
                                totalPrize: { ...newReward.totalPrize, SPORE: e.target.value }
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="defi">DEFI</Label>
                            <Input
                              id="defi"
                              type="number"
                              placeholder="200"
                              value={newReward.totalPrize.DEFI}
                              onChange={(e) => setNewReward({ 
                                ...newReward, 
                                totalPrize: { ...newReward.totalPrize, DEFI: e.target.value }
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">Eligibility Rules</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="minPoints">Minimum Points</Label>
                            <Input
                              id="minPoints"
                              type="number"
                              placeholder="100"
                              value={newReward.eligibilityRules.minPoints}
                              onChange={(e) => setNewReward({ 
                                ...newReward, 
                                eligibilityRules: { ...newReward.eligibilityRules, minPoints: parseInt(e.target.value) || 0 }
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="minQuests">Minimum Quests</Label>
                            <Input
                              id="minQuests"
                              type="number"
                              placeholder="3"
                              value={newReward.eligibilityRules.minQuests}
                              onChange={(e) => setNewReward({ 
                                ...newReward, 
                                eligibilityRules: { ...newReward.eligibilityRules, minQuests: parseInt(e.target.value) || 0 }
                              })}
                            />
                          </div>
                        </div>
                        <div className="space-y-3 mt-3">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="verificationRequired"
                              checked={newReward.eligibilityRules.verificationRequired}
                              onChange={(e) => setNewReward({ 
                                ...newReward, 
                                eligibilityRules: { ...newReward.eligibilityRules, verificationRequired: e.target.checked }
                              })}
                            />
                            <Label htmlFor="verificationRequired" className="text-sm">
                              Require identity verification
                            </Label>
                          </div>

                          {newReward.eligibilityRules.verificationRequired && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-3">
                              <Label className="text-sm font-medium">Acceptable Verification Methods</Label>
                              <div className="grid grid-cols-2 gap-2">
                                {["telegram", "kyc", "did", "manual"].map((method) => (
                                  <div key={method} className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      id={`verification-${method}`}
                                      checked={newReward.eligibilityRules.acceptableVerifications.includes(method)}
                                      onChange={(e) => {
                                        const updatedMethods = e.target.checked
                                          ? [...newReward.eligibilityRules.acceptableVerifications, method]
                                          : newReward.eligibilityRules.acceptableVerifications.filter(m => m !== method)
                                        setNewReward({
                                          ...newReward,
                                          eligibilityRules: {
                                            ...newReward.eligibilityRules,
                                            acceptableVerifications: updatedMethods
                                          }
                                        })
                                      }}
                                    />
                                    <Label htmlFor={`verification-${method}`} className="text-sm capitalize flex items-center gap-1">
                                      {getVerificationIcon(method)}
                                      {method}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="excludeManualReview"
                                  checked={newReward.eligibilityRules.excludeManualReview}
                                  onChange={(e) => setNewReward({ 
                                    ...newReward, 
                                    eligibilityRules: { ...newReward.eligibilityRules, excludeManualReview: e.target.checked }
                                  })}
                                />
                                <Label htmlFor="excludeManualReview" className="text-sm text-orange-700">
                                  ⚠️ Exclude manual review (prefer KYC/DID for high-value rewards)
                                </Label>
                              </div>

                              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 p-2 rounded">
                                💡 Tip: KYC or DID verification automatically satisfies identity requirements
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="autoDistribution"
                          checked={newReward.autoDistribution}
                          onChange={(e) => setNewReward({ ...newReward, autoDistribution: e.target.checked })}
                        />
                        <Label htmlFor="autoDistribution" className="text-sm">
                          Enable automatic distribution
                        </Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsRewardDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateReward}>Create Rewards</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-6">
                {LEADERBOARD_REWARDS.map((reward) => (
                  <Card key={reward.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl">{reward.period}</CardTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getStatusColor(reward.status)}>
                              {reward.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Total Prize Pool: {reward.totalPrize.CKB} CKB
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          {reward.status === "upcoming" && (
                            <Button size="sm">
                              <Zap className="w-4 h-4 mr-1" />
                              Activate
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                                          <CardContent>
                        <div className="space-y-4">
                          {/* Reward Tiers */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {reward.tiers.map((tier, index) => (
                              <div key={index} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold">{tier.rank}</h4>
                                  <Badge variant="outline">{tier.percentage}%</Badge>
                                </div>
                                <div className="space-y-1">
                                  {Object.entries(tier.rewards).map(([token, amount]) => (
                                    <div key={token} className="flex justify-between text-sm">
                                      <span>{token}:</span>
                                      <span className="font-medium">{amount}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {tier.recipients} recipient{tier.recipients !== 1 ? 's' : ''}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Eligibility Rules */}
                          <div className="border-t pt-4">
                            <h4 className="font-semibold mb-2">Eligibility Requirements</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                              <div>
                                <span className="text-muted-foreground">Min Points:</span>
                                <span className="ml-1 font-medium">{reward.eligibilityRules.minPoints}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Min Quests:</span>
                                <span className="ml-1 font-medium">{reward.eligibilityRules.minQuests}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Verification:</span>
                                <span className="ml-1 font-medium">
                                  {reward.eligibilityRules.verificationRequired ? 'Required' : 'Optional'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Auto Distribution:</span>
                                <span className="ml-1 font-medium">
                                  {reward.autoDistribution ? 'Enabled' : 'Manual'}
                                </span>
                              </div>
                            </div>
                            
                            {reward.eligibilityRules.verificationRequired && (
                              <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg">
                                <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Accepted Verification Methods</h5>
                                <div className="flex flex-wrap gap-2">
                                  {reward.eligibilityRules.acceptableVerifications.map((method: string) => (
                                    <Badge key={method} variant="outline" className="bg-white dark:bg-gray-800">
                                      {getVerificationIcon(method)}
                                      <span className="ml-1 capitalize">{method}</span>
                                    </Badge>
                                  ))}
                                </div>
                                {reward.eligibilityRules.excludeManualReview && (
                                  <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                                    ⚠️ Manual review is excluded - KYC or DID verification preferred
                                  </div>
                                )}
                                <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                                  💡 Having KYC or DID verification satisfies identity requirements
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Special Bonus */}
                          {reward.specialBonus?.enabled && (
                            <div className="border-t pt-4">
                              <h4 className="font-semibold mb-2">Special Bonus</h4>
                              <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <Star className="w-4 h-4 text-yellow-600" />
                                  <span className="font-medium text-yellow-800 dark:text-yellow-200">
                                    {reward.specialBonus.multiplier}x Multiplier
                                  </span>
                                </div>
                                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                  {reward.specialBonus.description}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="protocol" className="space-y-6">
              <ProtocolManagement />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
} 