/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { ccc } from "@ckb-ccc/core"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { fetchCampaignsConnectedToProtocol } from "@/lib/ckb/campaign-cells"
import { fetchProtocolCell } from "@/lib/ckb/protocol-cells"
import { ProtocolData, CampaignData } from "ssri-ckboost/types"
import { debug, formatDateConsistent } from "@/lib/utils/debug"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { 
  Settings, 
  Plus, 
  Edit, 
  Eye, 
  Users, 
  Trophy, 
  Calendar, 
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  UserPlus,
  Crown,
  Shield,
  Trash2
} from "lucide-react"
import Link from "next/link"

// Campaign admin configuration
const CURRENT_USER = {
  id: 1,
  name: "Campaign Administrator",
  email: "admin@ckboost.com",
  address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2jk6pyw9vlnfakx7vp4t5lxg0lzvvsp3c5adflu",
  avatar: "CA",
  role: "campaign_admin", // or "platform_admin" or "both"
  permissions: ["manage_campaigns", "review_quests", "manage_staff"]
}

// Mock staff members for campaigns
const CAMPAIGN_STAFF = [
  {
    id: 1,
    name: "Review Manager",
    email: "reviewer@ckboost.com",
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvglkprurm00l7hrs3rfqmmzyy3ll7djdsujdm6",
    avatar: "RM",
    role: "reviewer",
    campaignTypeHashes: ["0x0000000000000000000000000000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000000000000000000000000000002"],
    addedDate: "2024-01-10",
    permissions: ["review_quest_submissions"]
  },
  {
    id: 2,
    name: "Community Manager",
    email: "community@ckboost.com", 
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdj4xq5uer6gr8ndxzuj0nwmf34rnk9ysa0ksk",
    avatar: "CM",
    role: "moderator",
    campaignTypeHashes: ["0x0000000000000000000000000000000000000000000000000000000000000001"],
    addedDate: "2024-01-12",
    permissions: ["review_quest_submissions", "manage_participants"]
  }
]

// Mock campaigns owned by current user
const OWNED_CAMPAIGNS = [
  {
    typeHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
    title: "CKB Ecosystem Growth Initiative",
    description: "Help expand the CKB ecosystem through social engagement and development",
    status: "active",
    startDate: "2024-01-15",
    endDate: "2024-03-15",
    totalBudget: 5000,
    spentBudget: 1250,
    participants: 156,
    questsCount: 6,
    activeQuests: 4,
    completedQuests: 89,
    pendingReviews: 12,
    category: "Ecosystem",
    difficulty: "Mixed",
    staffCount: 2,
    totalRewards: {
      points: 2500,
      tokens: [
        { symbol: "CKB", amount: 1000 },
        { symbol: "SPORE", amount: 500 },
      ],
    },
  },
  {
    typeHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
    title: "DeFi Education Campaign",
    description: "Learn and teach about DeFi concepts on CKB",
    status: "draft",
    startDate: "2024-04-01",
    endDate: "2024-06-01",
    totalBudget: 3000,
    spentBudget: 0,
    participants: 0,
    questsCount: 3,
    activeQuests: 0,
    completedQuests: 0,
    pendingReviews: 0,
    category: "Education",
    difficulty: "Medium",
    staffCount: 1,
    totalRewards: {
      points: 1500,
      tokens: [
        { symbol: "CKB", amount: 500 },
      ],
    },
  },
]

export default function CampaignAdminDashboard() {
  const { signer } = useProtocol()
  const [activeTab, setActiveTab] = useState("overview")
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [staffForm, setStaffForm] = useState({
    email: "",
    campaignTypeHash: "",
    role: "reviewer"
  })
  const [connectedCampaigns, setConnectedCampaigns] = useState<ccc.Cell[]>([])
  const [pendingReviews, setPendingReviews] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch campaigns connected to the protocol
  useEffect(() => {
    const fetchCampaigns = async () => {
      debug.group('Campaign Admin - Fetch Campaigns')
      debug.log('Signer status:', { signerPresent: !!signer })
      
      if (!signer) {
        debug.warn('No signer available, skipping campaign fetch')
        debug.groupEnd()
        return
      }
      
      setIsLoading(true)
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
        const protocolData = ProtocolData.decode(protocolCell.outputData)
        const campaignCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
        
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
        
        // Process campaigns to extract pending reviews
        const reviews: any[] = []
        for (const campaign of campaigns) {
          try {
            const campaignData = CampaignData.decode(campaign.outputData)
            debug.log('Processing campaign:', {
              title: campaignData.metadata.title,
              questCount: campaignData.quests.length
            })
            
            // Check for pending quest submissions that need review
            // This is a placeholder - actual implementation would check user submissions
            if (campaignData.quests && campaignData.quests.length > 0) {
              // Add mock review data for now - replace with actual submission data
              reviews.push({
                campaignTitle: campaignData.metadata.title,
                campaignTypeHash: campaign.cellOutput.type?.hash(),
                questCount: campaignData.quests.length,
                // Add more review data as needed
              })
            }
          } catch (error) {
            debug.warn("Failed to parse campaign data:", error)
          }
        }
        
        debug.log(`Processed ${reviews.length} pending reviews`)
        setPendingReviews(reviews)
      } catch (error) {
        debug.error("Failed to fetch campaigns:", error)
      } finally {
        setIsLoading(false)
        debug.groupEnd()
      }
    }

    fetchCampaigns()
  }, [signer])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "draft":
        return "bg-yellow-100 text-yellow-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      case "paused":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
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
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "reviewer":
        return "bg-blue-100 text-blue-800"
      case "moderator":
        return "bg-purple-100 text-purple-800"
      case "admin":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatDate = (dateString: string) => {
    // Use consistent date formatting to avoid hydration mismatch
    return formatDateConsistent(dateString)
  }

  const handleAddStaff = () => {
    console.log("Adding staff:", staffForm)
    setIsAddStaffOpen(false)
    setStaffForm({ email: "", campaignTypeHash: "", role: "reviewer" })
  }

  const totalActiveCampaigns = OWNED_CAMPAIGNS.filter(c => c.status === "active").length
  const totalParticipants = OWNED_CAMPAIGNS.reduce((sum, c) => sum + c.participants, 0)
  const totalBudget = OWNED_CAMPAIGNS.reduce((sum, c) => sum + c.totalBudget, 0)
  const totalSpent = OWNED_CAMPAIGNS.reduce((sum, c) => sum + c.spentBudget, 0)
  const totalPendingReviews = OWNED_CAMPAIGNS.reduce((sum, c) => sum + c.pendingReviews, 0)
  const totalStaff = CAMPAIGN_STAFF.length

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
        <div className="mb-8">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <Crown className="w-8 h-8 text-amber-600" />
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Campaign Admin Dashboard
                  </h1>
                </div>
                <p className="text-base text-muted-foreground mb-3">
                  Manage your campaigns, quests, staff, and review submissions
                </p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-800">
                    👑 Campaign Administrator
                  </Badge>
                  {CURRENT_USER.role === "both" && (
                    <Link href="/platform-admin">
                      <Badge variant="outline" className="bg-red-100 text-red-800 cursor-pointer hover:bg-red-200">
                        🛡️ Platform Admin Access
                      </Badge>
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gradient-to-br from-purple-200 to-blue-200">
                      {CURRENT_USER.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm max-w-48">
                    <div className="font-medium">{CURRENT_USER.name}</div>
                    <div className="text-muted-foreground truncate" title={CURRENT_USER.address}>
                      {CURRENT_USER.address.slice(0, 12)}...{CURRENT_USER.address.slice(-8)}
                    </div>
                  </div>
                </div>
                <Link href="/campaign-admin/create-campaign">
                  <Button className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create Campaign
                  </Button>
                </Link>
              </div>
            </div>
        </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Campaigns</p>
                    <p className="text-2xl font-bold">{totalActiveCampaigns}</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Settings className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

          <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Participants</p>
                    <p className="text-2xl font-bold">{totalParticipants}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                </div>
            </CardContent>
          </Card>

          <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Budget Used</p>
                    <p className="text-2xl font-bold">{((totalSpent / totalBudget) * 100).toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">{totalSpent} / {totalBudget} CKB</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <DollarSign className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
            </CardContent>
          </Card>

          <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Reviews</p>
                    <p className="text-2xl font-bold">{totalPendingReviews}</p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-full">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
            </CardContent>
          </Card>

          <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Staff Members</p>
                    <p className="text-2xl font-bold">{totalStaff}</p>
                  </div>
                  <div className="p-3 bg-indigo-100 rounded-full">
                    <UserPlus className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
            </CardContent>
          </Card>
        </div>

          {/* Main Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="campaigns">My Campaigns</TabsTrigger>
              <TabsTrigger value="staff">Staff Management</TabsTrigger>
              <TabsTrigger value="reviews">Pending Reviews</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-full">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Quest completed</p>
                          <p className="text-xs text-muted-foreground">
                            "Deploy Smart Contract" was completed by CKBMaster
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">2h ago</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">New participant</p>
                          <p className="text-xs text-muted-foreground">
                            BlockchainDev joined "CKB Ecosystem Growth Initiative"
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">4h ago</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-full">
                          <UserPlus className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Staff member added</p>
                          <p className="text-xs text-muted-foreground">
                            Community Manager was added to review team
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">6h ago</span>
                      </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-full">
                          <AlertCircle className="w-4 h-4 text-orange-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Review needed</p>
                          <p className="text-xs text-muted-foreground">
                            "Raid the CKB Announcement" submission from CryptoNinja
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">8h ago</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Performance Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Quest Completion Rate</span>
                          <span className="text-sm font-medium">84%</span>
                        </div>
                        <Progress value={84} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Participant Engagement</span>
                          <span className="text-sm font-medium">92%</span>
                        </div>
                        <Progress value={92} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Budget Utilization</span>
                          <span className="text-sm font-medium">25%</span>
                        </div>
                        <Progress value={25} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Review Efficiency</span>
                          <span className="text-sm font-medium">96%</span>
                        </div>
                        <Progress value={96} className="h-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="campaigns" className="space-y-6">
              <div className="grid gap-6">
                {OWNED_CAMPAIGNS.map((campaign) => (
                  <Card key={campaign.typeHash}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl">{campaign.title}</CardTitle>
                          <p className="text-muted-foreground mt-1">{campaign.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                          <Badge variant="outline" className={getCategoryColor(campaign.category)}>
                            {campaign.category}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                            <Users className="w-4 h-4" />
                            <span className="font-semibold">{campaign.participants}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Participants</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                            <Trophy className="w-4 h-4" />
                            <span className="font-semibold">{campaign.questsCount}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Total Quests</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-purple-600 mb-1">
                            <CheckCircle className="w-4 h-4" />
                            <span className="font-semibold">{campaign.completedQuests}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Completions</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-orange-600 mb-1">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-semibold">{campaign.pendingReviews}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Pending Reviews</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-indigo-600 mb-1">
                            <UserPlus className="w-4 h-4" />
                            <span className="font-semibold">{campaign.staffCount}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Staff Members</p>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span>Budget Used</span>
                          <span>{campaign.spentBudget} / {campaign.totalBudget} CKB</span>
                        </div>
                        <Progress value={(campaign.spentBudget / campaign.totalBudget) * 100} className="h-2" />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/campaign/${campaign.typeHash}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Link href={`/campaign/${campaign.typeHash}/create-quest`}>
                            <Button variant="outline" size="sm">
                              <Plus className="w-4 h-4 mr-1" />
                              Add Quest
                            </Button>
                          </Link>
                          <Button variant="outline" size="sm">
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </div>
                  </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="staff" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Staff Management</h2>
                <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4" />
                      Add Staff Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Staff Member</DialogTitle>
                      <DialogDescription>
                        Add a new team member to help manage campaigns and review quest submissions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="staff@ckboost.com"
                          value={staffForm.email}
                          onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="campaign">Campaign Access</Label>
                        <select
                          id="campaign"
                          className="w-full p-2 border rounded-md"
                          value={staffForm.campaignTypeHash}
                          onChange={(e) => setStaffForm({ ...staffForm, campaignTypeHash: e.target.value })}
                        >
                          <option value="">Select campaign</option>
                          {OWNED_CAMPAIGNS.map((campaign) => (
                            <option key={campaign.typeHash} value={campaign.typeHash}>
                              {campaign.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <select
                          id="role"
                          className="w-full p-2 border rounded-md"
                          value={staffForm.role}
                          onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                        >
                          <option value="reviewer">Reviewer</option>
                          <option value="moderator">Moderator</option>
                        </select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddStaffOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddStaff}>Add Staff Member</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {CAMPAIGN_STAFF.map((staff) => (
                  <Card key={staff.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-12 h-12">
                            <AvatarFallback className="bg-gradient-to-br from-blue-200 to-purple-200">
                              {staff.avatar}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-semibold">{staff.name}</div>
                            <div className="text-sm text-muted-foreground">{staff.email}</div>
                            <div className="text-xs text-muted-foreground">{staff.address}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={getRoleColor(staff.role)}>
                                {staff.role}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Added {formatDate(staff.addedDate)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium mb-1">
                            Access to {staff.campaignTypeHashes.length} campaign{staff.campaignTypeHashes.length !== 1 ? 's' : ''}
                          </div>
                          <div className="text-xs text-muted-foreground mb-3">
                            {staff.permissions.join(", ")}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
              </div>
            </CardContent>
          </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="reviews" className="space-y-6">
          <Card>
            <CardHeader>
                  <CardTitle>Campaign Application Reviews</CardTitle>
            </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">Loading campaigns...</p>
                      </div>
                    </div>
                  ) : connectedCampaigns.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No campaigns found connected to this protocol.</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Campaigns will appear here once they are deployed and connected to your protocol.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {connectedCampaigns.map((campaign, index) => {
                        try {
                          const campaignData = CampaignData.decode(campaign.outputData)
                          const campaignTypeHash = campaign.cellOutput.type?.hash() || "0x"
                          
                          return (
                            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-gradient-to-br from-blue-200 to-purple-200">
                                  {campaignData.metadata.title.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{campaignData.metadata.title}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {campaignData.metadata.short_description}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Type Hash: {campaignTypeHash.slice(0, 10)}...{campaignTypeHash.slice(-8)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Link href={`/campaign/${campaignTypeHash}`}>
                                      <Button variant="outline" size="sm">
                                        <Eye className="w-4 h-4 mr-1" />
                                        View Campaign
                                      </Button>
                                    </Link>
                                    <Link href={`/campaign-admin/${campaignTypeHash}`}>
                                      <Button size="sm">
                                        <Settings className="w-4 h-4 mr-1" />
                                        Manage
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="outline">
                                    {campaignData.quests.length} Quests
                                  </Badge>
                                  {campaignData.metadata.categories.map((category, catIndex) => (
                                    <Badge key={catIndex} variant="outline" className="bg-blue-100 text-blue-800">
                                      {category}
                                    </Badge>
                                  ))}
                                  <span className="text-xs text-muted-foreground">
                                    Created by: {campaignData.endorser.endorser_name || "Unknown"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        } catch (error) {
                          console.warn("Failed to parse campaign data for display:", error)
                          return null
                        }
                      })}
                    </div>
                  )}
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
