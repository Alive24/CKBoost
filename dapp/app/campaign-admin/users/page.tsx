"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Search,
  Filter,
  Users,
  Eye,
  UserPlus,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  MessageCircle,
  FileText,
  User,
  Fingerprint,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const ACTIVE_USERS = [
  {
    id: 1,
    pubkey: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqds6ed78yze6eyfyvd537z66ur620n96rtsfrf67g",
    displayName: "CKBMaster",
    email: "ckbmaster@ckboost.com",
    firstActivity: "2023-10-15",
    lastActive: "2024-02-28",
    status: "active",
    verified: true,
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
      { campaignId: 1, campaignName: "CKB Ecosystem Growth Initiative", questsCompleted: 3, pointsEarned: 650 },
      { campaignId: 2, campaignName: "DeFi Education Campaign", questsCompleted: 4, pointsEarned: 580 },
      { campaignId: 3, campaignName: "Community Builder Program", questsCompleted: 6, pointsEarned: 720 },
      { campaignId: 101, campaignName: "CKB Testnet Launch Campaign", questsCompleted: 5, pointsEarned: 500 },
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
      { campaignId: 1, campaignName: "CKB Ecosystem Growth Initiative", questsCompleted: 2, pointsEarned: 450 },
      { campaignId: 2, campaignName: "DeFi Education Campaign", questsCompleted: 6, pointsEarned: 780 },
      { campaignId: 4, campaignName: "NFT Creator Bootcamp", questsCompleted: 7, pointsEarned: 950 },
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
      { campaignId: 2, campaignName: "DeFi Education Campaign", questsCompleted: 5, pointsEarned: 650 },
      { campaignId: 3, campaignName: "Community Builder Program", questsCompleted: 7, pointsEarned: 1200 },
    ],
  },
]

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

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedVerification, setSelectedVerification] = useState("all")
  const [selectedRole, setSelectedRole] = useState("all")
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [newUserData, setNewUserData] = useState({
    pubkey: "",
    displayName: "",
    email: "",
    role: "user",
  })

  const allUsers = [...ACTIVE_USERS]

  const filteredUsers = allUsers.filter((user) => {
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

  const handleUserClick = (user: any) => {
    setSelectedUser(user)
    setIsUserDetailsOpen(true)
  }

  const handleAddUser = () => {
    console.log("Adding user:", newUserData)
    setIsAddUserOpen(false)
    setNewUserData({ pubkey: "", displayName: "", email: "", role: "user" })
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
        return <User className="w-4 h-4" />
      default:
        return <X className="w-4 h-4" />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-4xl">👥</div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  User Management
                </h1>
              </div>
              <p className="text-lg text-muted-foreground">Manage users, verification requests, and platform access</p>
            </div>

            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Add Staff User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Staff User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="pubkey">Public Key</Label>
                    <Input
                      id="pubkey"
                      placeholder="ckb1qyq..."
                      value={newUserData.pubkey}
                      onChange={(e) => setNewUserData({ ...newUserData, pubkey: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      placeholder="Enter display name"
                      value={newUserData.displayName}
                      onChange={(e) => setNewUserData({ ...newUserData, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@ckboost.com"
                      value={newUserData.email}
                      onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={newUserData.role}
                      onValueChange={(value) => setNewUserData({ ...newUserData, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="moderator">Moderator</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddUser} className="w-full">
                    Add User
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Pending Verifications */}
          {PENDING_VERIFICATIONS.length > 0 && (
            <Card className="mb-8 bg-yellow-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-800">
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
                        className="text-green-600 border-green-600 hover:bg-green-50"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerificationAction(verification.id, "reject")}
                        className="text-red-600 border-red-600 hover:bg-red-50"
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
          <div className="mb-8 space-y-4">
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
                  <SelectItem value="suspended">Suspended</SelectItem>
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
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
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
                        <div className="text-sm font-mono bg-gray-100 p-2 rounded">{selectedUser.pubkey}</div>
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
                      {selectedUser.verified ? (
                        <Alert className="bg-green-50 border-green-200">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-800">
                            Verified via {selectedUser.verificationMethod} on{" "}
                            {new Date(selectedUser.verificationDate).toLocaleDateString()}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="bg-yellow-50 border-yellow-200">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <AlertDescription className="text-yellow-800">
                            User is not verified. Consider requiring verification for high-value quests.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Linked Accounts */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Linked Accounts</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-2 p-3 border rounded-lg">
                          <MessageCircle className="w-4 h-4" />
                          <div>
                            <div className="text-sm font-medium">Telegram</div>
                            <div className="text-xs text-muted-foreground">
                              {selectedUser.linkedAccounts.telegram || "Not linked"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 border rounded-lg">
                          <FileText className="w-4 h-4" />
                          <div>
                            <div className="text-sm font-medium">KYC</div>
                            <div className="text-xs text-muted-foreground">
                              {selectedUser.linkedAccounts.kyc || "Not verified"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 border rounded-lg">
                          <Fingerprint className="w-4 h-4" />
                          <div>
                            <div className="text-sm font-medium">DID</div>
                            <div className="text-xs text-muted-foreground">
                              {selectedUser.linkedAccounts.did || "Not linked"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Activity Stats */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Activity Statistics</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 border rounded-lg">
                          <div className="text-2xl font-bold">{selectedUser.activities.questsCompleted}</div>
                          <div className="text-xs text-muted-foreground">Quests Completed</div>
                        </div>
                        <div className="text-center p-3 border rounded-lg">
                          <div className="text-2xl font-bold">{selectedUser.activities.completionRate}%</div>
                          <div className="text-xs text-muted-foreground">Completion Rate</div>
                        </div>
                        <div className="text-center p-3 border rounded-lg">
                          <div className="text-2xl font-bold">{selectedUser.activities.currentStreak}</div>
                          <div className="text-xs text-muted-foreground">Current Streak</div>
                        </div>
                        <div className="text-center p-3 border rounded-lg">
                          <div className="text-2xl font-bold">{selectedUser.activities.averagePointsPerQuest}</div>
                          <div className="text-xs text-muted-foreground">Avg Points/Quest</div>
                        </div>
                      </div>
                    </div>

                    {/* Campaign Participation */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Campaign Participation</Label>
                      <div className="space-y-2">
                        {selectedUser.campaignParticipation.map((campaign: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
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
        </div>
      </main>
    </div>
  )
}
