"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Coins, Search, CheckCircle, XCircle, Eye } from "lucide-react"

const MOCK_TIPS = [
  {
    id: 1,
    recipient: "CKBExpert",
    recipientAddress: "ckb1qyqd5eyygtdmwdr7ge736zw6z0ju6wsw7rshn8fcx7",
    initiatedBy: "DevMaster",
    amount: 50,
    status: "pending",
    approvals: 2,
    requiredApprovals: 5,
    contributionType: "comment",
    contributionTitle: "Great analysis on CKB upgrade",
    createdAt: "2024-01-16T10:30:00Z",
    approvers: ["DevMaster", "CryptoAnalyst"],
  },
  {
    id: 2,
    recipient: "SmartContractGuru",
    recipientAddress: "ckb1qyqf4kxy7t5n8cjvs6h9p2w3e4r5t6y7u8i9o0p1q2",
    initiatedBy: "TechReviewer",
    amount: 50,
    status: "approved",
    approvals: 5,
    requiredApprovals: 5,
    contributionType: "tutorial",
    contributionTitle: "Comprehensive dApp building tutorial",
    createdAt: "2024-01-15T14:20:00Z",
    approvers: ["TechReviewer", "CommunityMod", "DevExpert", "SecurityAuditor", "BlockchainBeast"],
    completedAt: "2024-01-15T18:45:00Z",
  },
  {
    id: 3,
    recipient: "DAOContributor",
    recipientAddress: "ckb1qyqg5fxy8t6n9ckvs7h0p3w4e5r6t7y8u9i0o1p2q3",
    initiatedBy: "BridgeBuilder",
    amount: 50,
    status: "rejected",
    approvals: 1,
    requiredApprovals: 5,
    contributionType: "proposal",
    contributionTitle: "Cross-chain bridge improvements",
    createdAt: "2024-01-14T09:15:00Z",
    approvers: ["BridgeBuilder"],
    rejectedAt: "2024-01-16T12:00:00Z",
    rejectionReason: "Insufficient community support",
  },
  {
    id: 4,
    recipient: "CommunityHelper",
    recipientAddress: "ckb1qyqh6gxy9t7n0ckvs8h1p4w5e6r7t8y9u0i1o2p3q4",
    initiatedBy: "ModeratorOne",
    amount: 50,
    status: "pending",
    approvals: 4,
    requiredApprovals: 5,
    contributionType: "engagement",
    contributionTitle: "Helpful community support responses",
    createdAt: "2024-01-16T08:00:00Z",
    approvers: ["ModeratorOne", "CKBMaster", "NervosNinja", "TechExpert"],
  },
]

export default function TipManagement() {
  const [tips, setTips] = useState(MOCK_TIPS)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTip, setSelectedTip] = useState<any>(null)
  const [isTipModalOpen, setIsTipModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredTips = tips.filter((tip) => {
    const matchesSearch =
      tip.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tip.initiatedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tip.contributionTitle.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || tip.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleApproveTip = (tipId: number) => {
    setTips(
      tips.map((tip) =>
        tip.id === tipId
          ? {
              ...tip,
              status: "approved",
              approvals: tip.requiredApprovals,
              completedAt: new Date().toISOString(),
              approvers: [...tip.approvers, "Admin"],
            }
          : tip,
      ),
    )
  }

  const handleRejectTip = (tipId: number) => {
    setTips(
      tips.map((tip) =>
        tip.id === tipId
          ? {
              ...tip,
              status: "rejected",
              rejectedAt: new Date().toISOString(),
              rejectionReason: "Rejected by admin",
            }
          : tip,
      ),
    )
  }

  const handleViewTip = (tip: any) => {
    setSelectedTip(tip)
    setIsTipModalOpen(true)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getContributionIcon = (type: string) => {
    switch (type) {
      case "comment":
        return "💬"
      case "tutorial":
        return "📚"
      case "proposal":
        return "📋"
      case "engagement":
        return "🤝"
      default:
        return "📝"
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + " " + new Date(dateString).toLocaleTimeString()
  }

  const pendingTips = tips.filter((t) => t.status === "pending")
  const approvedTips = tips.filter((t) => t.status === "approved")
  const rejectedTips = tips.filter((t) => t.status === "rejected")
  const totalCKBDistributed = approvedTips.reduce((sum, tip) => sum + tip.amount, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Coins className="text-3xl text-yellow-600" />
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Tip Management
                </h1>
              </div>
              <p className="text-muted-foreground">Review and manage community tips</p>
            </div>
          </div>
        </div>

        {/* Tip Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600">{pendingTips.length}</div>
              <div className="text-sm text-muted-foreground">Pending Tips</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{approvedTips.length}</div>
              <div className="text-sm text-muted-foreground">Approved Tips</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{rejectedTips.length}</div>
              <div className="text-sm text-muted-foreground">Rejected Tips</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">{totalCKBDistributed}</div>
              <div className="text-sm text-muted-foreground">CKB Distributed</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by recipient, initiator, or contribution..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("pending")}
                >
                  Pending
                </Button>
                <Button
                  variant={statusFilter === "approved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("approved")}
                >
                  Approved
                </Button>
                <Button
                  variant={statusFilter === "rejected" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("rejected")}
                >
                  Rejected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Tips ({filteredTips.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tip Details</TableHead>
                  <TableHead>Contribution</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTips.map((tip) => (
                  <TableRow key={tip.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tip.recipient}</span>
                          <span className="text-muted-foreground">←</span>
                          <span className="text-sm text-muted-foreground">{tip.initiatedBy}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">{tip.amount} CKB</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{getContributionIcon(tip.contributionType)}</span>
                        <div>
                          <div className="text-sm font-medium">{tip.contributionTitle}</div>
                          <div className="text-xs text-muted-foreground capitalize">{tip.contributionType}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>
                          {tip.approvals}/{tip.requiredApprovals} approvals
                        </div>
                        <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full"
                            style={{ width: `${(tip.approvals / tip.requiredApprovals) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(tip.status)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDate(tip.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleViewTip(tip)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        {tip.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleApproveTip(tip.id)}>
                              <CheckCircle className="w-3 h-3 text-green-600" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectTip(tip.id)}>
                              <XCircle className="w-3 h-3 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Tip Detail Modal */}
        <Dialog open={isTipModalOpen} onOpenChange={setIsTipModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Tip Details</DialogTitle>
              <DialogDescription>Detailed information about this community tip</DialogDescription>
            </DialogHeader>

            {selectedTip && (
              <div className="space-y-4">
                {/* Tip Overview */}
                <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 flex items-center justify-center font-semibold">
                        {selectedTip.recipient.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">{selectedTip.recipient}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {selectedTip.recipientAddress.slice(0, 8)}...{selectedTip.recipientAddress.slice(-6)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-yellow-600">{selectedTip.amount} CKB</div>
                      <div className="text-sm text-muted-foreground">Tip Amount</div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Initiated by <span className="font-medium">{selectedTip.initiatedBy}</span>
                  </div>
                </div>

                {/* Contribution Details */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{getContributionIcon(selectedTip.contributionType)}</span>
                    <div className="font-medium">{selectedTip.contributionTitle}</div>
                  </div>
                  <div className="text-sm text-muted-foreground capitalize">{selectedTip.contributionType}</div>
                </div>

                {/* Approval Progress */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Approval Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {selectedTip.approvals}/{selectedTip.requiredApprovals}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${(selectedTip.approvals / selectedTip.requiredApprovals) * 100}%` }}
                    ></div>
                  </div>

                  {/* Approvers List */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Approved by:</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTip.approvers.map((approver: string, index: number) => (
                        <Badge key={index} variant="outline" className="bg-green-50 text-green-800">
                          {approver}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status and Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Status</div>
                    <div>{getStatusBadge(selectedTip.status)}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Created</div>
                    <div className="text-sm text-muted-foreground">{formatDate(selectedTip.createdAt)}</div>
                  </div>
                  {selectedTip.completedAt && (
                    <>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Completed</div>
                        <div className="text-sm text-muted-foreground">{formatDate(selectedTip.completedAt)}</div>
                      </div>
                    </>
                  )}
                  {selectedTip.rejectedAt && (
                    <>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Rejected</div>
                        <div className="text-sm text-muted-foreground">{formatDate(selectedTip.rejectedAt)}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Reason</div>
                        <div className="text-sm text-muted-foreground">{selectedTip.rejectionReason}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Admin Actions */}
                {selectedTip.status === "pending" && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      onClick={() => {
                        handleApproveTip(selectedTip.id)
                        setIsTipModalOpen(false)
                      }}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Tip
                    </Button>
                    <Button
                      onClick={() => {
                        handleRejectTip(selectedTip.id)
                        setIsTipModalOpen(false)
                      }}
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject Tip
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTipModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
