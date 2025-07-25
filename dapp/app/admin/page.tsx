"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
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
    campaignIds: [1, 2],
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
    campaignIds: [1],
    addedDate: "2024-01-12",
    permissions: ["review_quest_submissions", "manage_participants"]
  }
]

// Mock campaigns owned by current user
const OWNED_CAMPAIGNS = [
  {
    id: 1,
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
    id: 2,
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
  const [activeTab, setActiveTab] = useState("overview")
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [staffForm, setStaffForm] = useState({
    email: "",
    campaignId: "",
    role: "reviewer"
  })

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
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const handleAddStaff = () => {
    console.log("Adding staff:", staffForm)
    setIsAddStaffOpen(false)
    setStaffForm({ email: "", campaignId: "", role: "reviewer" })
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
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-8 h-8 text-amber-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Campaign Admin Dashboard
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
                  Manage your campaigns, quests, staff, and review submissions
                </p>
                <div className="flex items-center gap-2 mt-2">
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
                  <div className="text-sm">
                    <div className="font-medium">{CURRENT_USER.name}</div>
                    <div className="text-muted-foreground">{CURRENT_USER.address}</div>
                  </div>
                </div>
                <Link href="/create-campaign">
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
                  <Card key={campaign.id}>
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
                          <Link href={`/campaign/${campaign.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Link href={`/campaign/${campaign.id}/create-quest`}>
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
                          value={staffForm.campaignId}
                          onChange={(e) => setStaffForm({ ...staffForm, campaignId: e.target.value })}
                        >
                          <option value="">Select campaign</option>
                          {OWNED_CAMPAIGNS.map((campaign) => (
                            <option key={campaign.id} value={campaign.id}>
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
                            Access to {staff.campaignIds.length} campaign{staff.campaignIds.length !== 1 ? 's' : ''}
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
                  <CardTitle>Pending Quest Reviews</CardTitle>
            </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Mock pending reviews */}
                    <div className="flex items-center gap-4 p-4 border rounded-lg">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-gradient-to-br from-green-200 to-blue-200">
                          CN
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">CryptoNinja</p>
                            <p className="text-sm text-muted-foreground">
                              Submitted "Raid the CKB Announcement"
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              Review
              </Button>
                            <Button size="sm">
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
              </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">Social Media</Badge>
                          <Badge variant="outline" className="bg-blue-100 text-blue-800">
                            CKB Ecosystem Growth Initiative
                          </Badge>
                          <span className="text-xs text-muted-foreground">2h ago</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 border rounded-lg">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-gradient-to-br from-purple-200 to-pink-200">
                          BD
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">BlockchainDev</p>
                            <p className="text-sm text-muted-foreground">
                              Submitted "Deploy Smart Contract"
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              Review
              </Button>
                            <Button size="sm">
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
              </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">Development</Badge>
                          <Badge variant="outline" className="bg-blue-100 text-blue-800">
                            CKB Ecosystem Growth Initiative
                          </Badge>
                          <span className="text-xs text-muted-foreground">4h ago</span>
                          <div className="ml-auto">
                            <Badge variant="outline" className="bg-purple-100 text-purple-800">
                              Assigned to Review Manager
                            </Badge>
                          </div>
                        </div>
                      </div>
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
