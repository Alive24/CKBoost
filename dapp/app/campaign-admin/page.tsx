/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { ccc } from "@ckb-ccc/core"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { fetchCampaignsOwnedByUser, extractTypeIdFromCampaignCell, isCampaignApproved } from "@/lib/ckb/campaign-cells"
import { CampaignData, CampaignDataLike, ConnectedTypeID } from "ssri-ckboost/types"
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


export default function CampaignAdminDashboard() {
  const { signer, protocolCell, protocolData } = useProtocol()
  const [activeTab, setActiveTab] = useState("overview")
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [staffForm, setStaffForm] = useState({
    email: "",
    campaignTypeId: "",
    role: "reviewer"
  })
  const [ownedCampaigns, setOwnedCampaigns] = useState<(CampaignDataLike & { 
    typeId: ccc.Hex
    status: string
    isConnected: boolean
    isApproved: boolean
    totalPoints: number
    participants: number  // computed from submissions
    completedQuests: number  // computed from submissions
    pendingReviews: number  // computed from submissions
  })[]>([])
  const [pendingReviews, setPendingReviews] = useState<{
    campaignTitle: string
    campaignTypeId: string
    questCount: number
  }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch campaigns owned by the current user
  useEffect(() => {
    const fetchCampaigns = async () => {
      debug.group('Campaign Admin - Fetch User Campaigns')
      debug.log('Signer status:', { signerPresent: !!signer })
      debug.log('Protocol status:', { 
        protocolCell: !!protocolCell, 
        protocolData: !!protocolData 
      })
      
      // Wait for signer to be available
      if (!signer) {
        debug.warn('No signer available, waiting...')
        debug.groupEnd()
        // Keep loading state true while waiting for signer
        return
      }
      
      // Wait for protocol to be loaded
      if (!protocolCell || !protocolData) {
        debug.log('Waiting for protocol to load...', {
          protocolCell: !!protocolCell,
          protocolData: !!protocolData
        })
        debug.groupEnd()
        // Keep loading state true while waiting for protocol
        return
      }
      
      setIsLoading(true)
      try {
        // Protocol is now loaded, we can proceed
        debug.log('Protocol loaded, fetching campaigns...')
        debug.log('Protocol cell found:', {
          typeHash: protocolCell.cellOutput.type?.hash(),
          dataLength: protocolCell.outputData.length
        })
        const campaignCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
        const protocolTypeHash = protocolCell.cellOutput.type?.hash() || "0x"
        
        debug.log('Extracted data:', {
          campaignCodeHash,
          protocolTypeHash,
          approvedCampaigns: protocolData.campaigns_approved?.length || 0
        })
        
        // Fetch campaigns owned by the current user
        debug.log('Fetching campaigns owned by user...')
        const userCampaigns = await fetchCampaignsOwnedByUser(
          signer,
          campaignCodeHash as ccc.Hex
        )
        
        debug.log(`Found ${userCampaigns.length} campaigns owned by user`)
        
        // Process campaigns and check their connection status
        const processedCampaigns: typeof ownedCampaigns = []
        const reviews: typeof pendingReviews = []
        
        for (const campaign of userCampaigns) {
          try {
            const campaignData = CampaignData.decode(campaign.outputData)
            
            // Check if campaign is connected to the protocol
            const isConnected = campaign.cellOutput.type?.args && (() => {
              try {
                const argsBytes = ccc.bytesFrom(campaign.cellOutput.type!.args)
                const connectedTypeId = ConnectedTypeID.decode(argsBytes)
                return connectedTypeId.connected_key === protocolTypeHash
              } catch {
                return false
              }
            })()
            
            // Extract type_id for comparison
            const campaignTypeId = extractTypeIdFromCampaignCell(campaign)
            
            // Check if campaign is approved using helper function
            const isApproved = isCampaignApproved(
              campaignTypeId,
              protocolData.campaigns_approved as ccc.Hex[] | undefined
            )
            
            // Skip campaigns that are not connected to the protocol
            if (!isConnected) {
              debug.log('Skipping campaign - not connected to protocol')
              continue
            }
            
            // Calculate campaign status
            const now = Date.now()
            const startTime = Number(campaignData.starting_time) * 1000
            const endTime = Number(campaignData.ending_time) * 1000
            const status = !isApproved ? "under-review" : 
                          now < startTime ? "draft" : 
                          now > endTime ? "completed" : "active"
            
            // Calculate total points
            const totalPoints = campaignData.quests?.reduce((sum: number, quest) => {
              return sum + Number(quest.points || 100)
            }, 0) || 0
            
            // Process campaign for display (only connected campaigns)
            const campaignInfo: typeof ownedCampaigns[0] = {
              ...campaignData,
              typeId: (campaignTypeId || "0x") as ccc.Hex,
              status,
              isConnected: true, // Always true since we only process connected campaigns
              isApproved,
              totalPoints,
              participants: 0, // Would need submission data to calculate
              completedQuests: 0, // Would need submission data
              pendingReviews: 0 // Would need submission data
            }
            
            processedCampaigns.push(campaignInfo)
            
            // Check for pending reviews (placeholder - would need submission data)
            if (status === "active" && campaignData.quests && campaignData.quests.length > 0) {
              // This would check actual submission data
              reviews.push({
                campaignTitle: campaignData.metadata.title,
                campaignTypeId: campaignTypeId || "0x",
                questCount: campaignData.quests.length,
              })
            }
            
            debug.log('Processed campaign:', {
              title: campaignInfo.metadata.title,
              status: campaignInfo.status,
              isApproved: campaignInfo.isApproved
            })
            
          } catch (error) {
            debug.warn("Failed to parse campaign data:", error)
          }
        }
        
        debug.log(`Processed ${processedCampaigns.length} campaigns`)
        setOwnedCampaigns(processedCampaigns)
        setPendingReviews(reviews)
        
      } catch (error) {
        debug.error("Failed to fetch campaigns:", error)
      } finally {
        setIsLoading(false)
        debug.groupEnd()
      }
    }

    fetchCampaigns()
  }, [signer, protocolCell, protocolData])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "draft":
        return "bg-blue-100 text-blue-800"
      case "completed":
        return "bg-purple-100 text-purple-800"
      case "under-review":
        return "bg-yellow-100 text-yellow-800"
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

  // Commented out - can be used later for staff management
  // const getRoleColor = (role: string) => {
  //   switch (role) {
  //     case "reviewer":
  //       return "bg-blue-100 text-blue-800"
  //     case "moderator":
  //       return "bg-purple-100 text-purple-800"
  //     case "admin":
  //       return "bg-red-100 text-red-800"
  //     default:
  //       return "bg-gray-100 text-gray-800"
  //   }
  // }

  const formatDate = (dateString: string) => {
    // Use consistent date formatting to avoid hydration mismatch
    return formatDateConsistent(dateString)
  }

  const handleAddStaff = () => {
    console.log("Adding staff:", staffForm)
    setIsAddStaffOpen(false)
    setStaffForm({ email: "", campaignTypeId: "", role: "reviewer" })
  }

  // Calculate stats from real campaigns or use mock data as fallback
  const campaignsToShow =  ownedCampaigns
  const totalActiveCampaigns = campaignsToShow.filter(c => c.status === "active").length
  const totalParticipants = campaignsToShow.reduce((sum, c) => sum + (c.participants || 0), 0)
  const totalPendingReviews = campaignsToShow.reduce((sum, c) => sum + (c.pendingReviews || 0), 0)
  const totalStaff = 0

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
                <Link href="/campaign-admin/new">
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
              {isLoading || !protocolCell || !protocolData ? (
                // Loading state
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">
                      {!signer ? "Waiting for wallet connection..." : 
                       !protocolCell || !protocolData ? "Loading protocol data..." : 
                       "Loading campaigns..."}
                    </p>
                  </div>
                </div>
              ) : campaignsToShow.length === 0 ? (
                // Empty state
                <Card>
                  <CardContent className="py-16">
                    <div className="text-center">
                      <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-xl font-semibold mb-2">No Campaigns Yet</h3>
                      <p className="text-muted-foreground mb-6">
                        You haven't created any campaigns yet. Get started by creating your first campaign!
                      </p>
                      <Link href="/campaign-admin/create-campaign">
                        <Button size="lg" className="flex items-center gap-2 mx-auto">
                          <Plus className="w-5 h-5" />
                          Create Your First Campaign
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Campaign Status Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Approved Campaigns</p>
                        <p className="text-2xl font-bold">
                          {campaignsToShow.filter(c => c.isApproved).length}
                        </p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Approval</p>
                        <p className="text-2xl font-bold">
                          {campaignsToShow.filter(c => !c.isApproved).length}
                        </p>
                      </div>
                      <Clock className="w-8 h-8 text-yellow-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="grid gap-6">
                {campaignsToShow.map((campaign) => (
                  <Card key={campaign.typeId}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl">{campaign.metadata?.title || "Untitled"}</CardTitle>
                          <p className="text-muted-foreground mt-1">{campaign.metadata?.short_description || "No description"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                          {campaign.isApproved ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Approved
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending Approval
                            </Badge>
                          )}
                          <Badge variant="outline" className={getCategoryColor(campaign.metadata?.categories?.[0] || "General")}>
                            {campaign.metadata?.categories?.[0] || "General"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                            <Users className="w-4 h-4" />
                            <span className="font-semibold">{campaign.participants || 0}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Participants</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                            <Trophy className="w-4 h-4" />
                            <span className="font-semibold">{campaign.quests?.length || 0}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Total Quests</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-purple-600 mb-1">
                            <CheckCircle className="w-4 h-4" />
                            <span className="font-semibold">{campaign.completedQuests || 0}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Completions</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-orange-600 mb-1">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-semibold">{campaign.pendingReviews || 0}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Pending Reviews</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-indigo-600 mb-1">
                            <UserPlus className="w-4 h-4" />
                            <span className="font-semibold">{0}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Staff Members</p>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span>Budget Used</span>
                          <span>{Number(campaign.metadata?.total_rewards.points_amount || 0)} / {Number(campaign.metadata?.total_rewards.points_amount || 0)} CKB</span>
                        </div>
                        <Progress value={((Number(campaign.metadata?.total_rewards.points_amount || 0)) / (Number(campaign.metadata?.total_rewards.points_amount || 1))) * 100} className="h-2" />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(new Date(Number(campaign.starting_time) * 1000).toISOString())} - {formatDate(new Date(Number(campaign.ending_time) * 1000).toISOString())}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/campaign/${campaign.typeId}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Link href={`/campaign-admin/${campaign.typeId}?tab=quests`}>
                            <Button variant="outline" size="sm">
                              <Plus className="w-4 h-4 mr-1" />
                              Add Quest
                            </Button>
                          </Link>
                          <Link href={`/campaign-admin/${campaign.typeId}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4 mr-1" />
                              Manage
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
                </>
              )}
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
                          value={staffForm.campaignTypeId}
                          onChange={(e) => setStaffForm({ ...staffForm, campaignTypeId: e.target.value })}
                        >
                          <option value="">Select campaign</option>
                          {ownedCampaigns.map((campaign) => (
                            <option key={campaign.typeId} value={campaign.typeId}>
                              {campaign.metadata?.title}
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
                {ownedCampaigns.map((staff) => (
                  <Card key={staff.typeId}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-12 h-12">
                            <AvatarFallback className="bg-gradient-to-br from-blue-200 to-purple-200">
                              {staff.metadata?.endorser_info.endorser_name}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-semibold">{staff.metadata?.endorser_info.endorser_name}</div>
                            <div className="text-sm text-muted-foreground">{staff.metadata?.endorser_info.endorser_description}</div>
                            <div className="text-xs text-muted-foreground">{staff.metadata?.endorser_info.website}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">
                                Added {formatDate(new Date(Number(staff.created_at) * 1000).toISOString())}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
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
                  {isLoading || !protocolCell || !protocolData ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">
                          {!signer ? "Waiting for wallet connection..." : 
                           !protocolCell || !protocolData ? "Loading protocol data..." : 
                           "Loading campaigns..."}
                        </p>
                      </div>
                    </div>
                  ) : ownedCampaigns.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No campaigns found connected to this protocol.</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Campaigns will appear here once they are deployed and connected to your protocol.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {ownedCampaigns.map((campaign, index) => {
                        try {
                          // Campaign is already processed with all needed fields
                          const campaignTypeId = campaign.typeId || "0x"
                          
                          return (
                            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-gradient-to-br from-blue-200 to-purple-200">
                                  {(campaign.metadata?.title || "CA").substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{campaign.metadata?.title || "Untitled"}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {campaign.metadata?.short_description || "No description"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Type ID: {campaignTypeId.slice(0, 10)}...{campaignTypeId.slice(-8)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Link href={`/campaign/${campaignTypeId}`}>
                                      <Button variant="outline" size="sm">
                                        <Eye className="w-4 h-4 mr-1" />
                                        View Campaign
                                      </Button>
                                    </Link>
                                    <Link href={`/campaign-admin/${campaignTypeId}`}>
                                      <Button size="sm">
                                        <Settings className="w-4 h-4 mr-1" />
                                        Manage
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="outline">
                                    {campaign.quests?.length || 0} Quests
                                  </Badge>
                                  {campaign.metadata?.categories?.map((category: string, catIndex: number) => (
                                    <Badge key={catIndex} variant="outline" className="bg-blue-100 text-blue-800">
                                      {category}
                                    </Badge>
                                  ))}
                                  <span className="text-xs text-muted-foreground">
                                    Created by: {campaign.endorser?.endorser_name || "Unknown"}
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
