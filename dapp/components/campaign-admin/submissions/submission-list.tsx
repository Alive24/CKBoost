"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Trophy, 
  CheckCircle, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  Eye,
  CheckSquare,
  Loader2,
  AlertCircle,
  ExternalLink,
  Coins
} from "lucide-react"
import { UserSubmissionRecordLike, UserDataLike, QuestDataLike, AssetListLike, UDTAssetLike } from "ssri-ckboost/types"
import { SubmissionCard } from "./submission-card"
import { ccc } from "@ckb-ccc/connector-react"
import { udtRegistry } from "@/lib/services/udt-registry"

interface SubmissionListProps {
  quests: QuestDataLike[]
  submissions: Map<number, Array<UserSubmissionRecordLike & { userTypeId: string }>>
  userDetails: Map<string, UserDataLike>
  onBatchApprove: (questId: number, userTypeIds: string[]) => Promise<void>
  filterStatus?: "all" | "pending" | "approved"
}

export function SubmissionList({ 
  quests, 
  submissions, 
  userDetails, 
  onBatchApprove,
  filterStatus = "all"
}: SubmissionListProps) {
  const [expandedQuests, setExpandedQuests] = useState<Set<number>>(new Set())
  const [selectedSubmissions, setSelectedSubmissions] = useState<Map<number, Set<string>>>(new Map())
  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean
    questId: number | null
    questTitle: string
    userCount: number
    totalPoints: number
    status: 'idle' | 'confirming' | 'success' | 'error'
    txHash?: string
    error?: string
  }>({
    open: false,
    questId: null,
    questTitle: '',
    userCount: 0,
    totalPoints: 0,
    status: 'idle'
  })

  function toggleQuestExpansion(questId: number) {
    const newExpanded = new Set(expandedQuests)
    if (newExpanded.has(questId)) {
      newExpanded.delete(questId)
    } else {
      newExpanded.add(questId)
    }
    setExpandedQuests(newExpanded)
  }

  function toggleSubmissionSelection(questId: number, userTypeId: string) {
    const newSelected = new Map(selectedSubmissions)
    if (!newSelected.has(questId)) {
      newSelected.set(questId, new Set())
    }
    const questSelections = newSelected.get(questId)!
    if (questSelections.has(userTypeId)) {
      questSelections.delete(userTypeId)
    } else {
      questSelections.add(userTypeId)
    }
    setSelectedSubmissions(newSelected)
  }

  function selectAllPending(questId: number, submissions: Array<UserSubmissionRecordLike & { userTypeId: string }>, approvedUserIds: string[]) {
    const newSelected = new Map(selectedSubmissions)
    const pendingUserIds = submissions
      .filter(sub => !approvedUserIds.includes(sub.userTypeId))
      .map(sub => sub.userTypeId)
    newSelected.set(questId, new Set(pendingUserIds))
    setSelectedSubmissions(newSelected)
  }

  function clearSelection(questId: number) {
    const newSelected = new Map(selectedSubmissions)
    newSelected.delete(questId)
    setSelectedSubmissions(newSelected)
  }

  async function handleBatchApprove(questId: number) {
    const selected = selectedSubmissions.get(questId)
    if (!selected || selected.size === 0) {
      alert("Please select submissions to approve")
      return
    }
    
    const quest = quests.find(q => Number(q.quest_id) === questId)
    const questTitle = quest?.metadata?.title || `Quest ${questId}`
    const pointsPerUser = Number(quest?.points || 0)
    const totalPoints = pointsPerUser * selected.size
    
    // Open confirmation dialog
    setApprovalDialog({
      open: true,
      questId,
      questTitle,
      userCount: selected.size,
      totalPoints,
      status: 'idle',
      txHash: undefined,
      error: undefined
    })
  }

  async function confirmApproval() {
    if (!approvalDialog.questId) return
    
    const selected = selectedSubmissions.get(approvalDialog.questId)
    if (!selected) return
    
    setApprovalDialog(prev => ({ ...prev, status: 'confirming' }))
    
    try {
      await onBatchApprove(approvalDialog.questId, Array.from(selected))
      
      // Success - show transaction hash (would need to be returned from onBatchApprove)
      setApprovalDialog(prev => ({ 
        ...prev, 
        status: 'success',
        // txHash would come from the actual transaction
        txHash: '0x...' // Placeholder - actual implementation would return this
      }))
      
      // Clear selection after successful approval
      clearSelection(approvalDialog.questId)
      
      // Close dialog after a delay
      setTimeout(() => {
        setApprovalDialog(prev => ({ ...prev, open: false }))
      }, 3000)
    } catch (error) {
      setApprovalDialog(prev => ({ 
        ...prev, 
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to approve submissions'
      }))
    }
  }

  return (
    <div className="space-y-4">
      {quests.map((quest, questIndex) => {
        const questId = Number(quest.quest_id || questIndex + 1)
        const questSubmissions = submissions.get(questId) || []
        const approvedCount = quest.accepted_submission_user_type_ids?.length || 0
        
        // Filter pending submissions
        const pendingSubmissions = questSubmissions.filter(sub => {
          const isApproved = quest.accepted_submission_user_type_ids?.includes(sub.userTypeId)
          return !isApproved
        })

        const isExpanded = expandedQuests.has(questId)

        return (
          <Card key={`quest-${questIndex}-${questId}`}>
            <CardHeader 
              className="cursor-pointer"
              onClick={() => toggleQuestExpansion(questId)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">
                      {quest.metadata?.title || `Quest ${questId}`}
                    </h3>
                    <Badge variant="outline">
                      <Trophy className="w-3 h-3 mr-1" />
                      {Number(quest.points || 0)} points
                    </Badge>
                    {/* Display UDT reward badges */}
                    {quest.rewards_on_completion && quest.rewards_on_completion.length > 0 && 
                      quest.rewards_on_completion[0]?.udt_assets?.map((udt: UDTAssetLike, idx: number) => {
                        const script = ccc.Script.from(udt.udt_script)
                        const scriptHash = script.hash()
                        const token = udtRegistry.getTokenByScriptHash(scriptHash)
                        
                        if (token) {
                          const formattedAmount = udtRegistry.formatAmount(Number(udt.amount), token)
                          return (
                            <Badge key={`udt-${idx}`} className="bg-yellow-100 text-yellow-800">
                              <Coins className="w-3 h-3 mr-1" />
                              {formattedAmount} {token.symbol}
                            </Badge>
                          )
                        } else {
                          return (
                            <Badge key={`udt-${idx}`} className="bg-yellow-100 text-yellow-800">
                              <Coins className="w-3 h-3 mr-1" />
                              UDT
                            </Badge>
                          )
                        }
                      })
                    }
                    {approvedCount > 0 && (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {approvedCount} approved
                      </Badge>
                    )}
                    {pendingSubmissions.length > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-800">
                        <Clock className="w-3 h-3 mr-1" />
                        {pendingSubmissions.length} pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {quest.metadata?.short_description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pendingSubmissions.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          const approvedUserIds = quest.accepted_submission_user_type_ids || []
                          selectAllPending(questId, questSubmissions, approvedUserIds.map(id => ccc.hexFrom(id)))
                        }}
                      >
                        <CheckSquare className="w-4 h-4 mr-1" />
                        Select All
                      </Button>
                      {selectedSubmissions.get(questId)?.size ? (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleBatchApprove(questId)
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve {selectedSubmissions.get(questId)?.size} ({Number(quest.points || 0) * (selectedSubmissions.get(questId)?.size || 0)} Points)
                        </Button>
                      ) : null}
                    </>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent>
                {questSubmissions.length > 0 ? (
                  <div className="space-y-3">
                    {/* Pending Submissions */}
                    {pendingSubmissions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                          Pending Submissions ({pendingSubmissions.length})
                        </h4>
                        <div className="space-y-2">
                          {pendingSubmissions.map((submission, index) => {
                            const userData = userDetails.get(submission.userTypeId)
                            const isSelected = selectedSubmissions.get(questId)?.has(submission.userTypeId) || false
                            return (
                              <SubmissionCard
                                key={`${submission.userTypeId}-${index}`}
                                submission={submission}
                                userData={userData}
                                questId={questId}
                                questPoints={Number(quest.points || 0)}
                                isPending={true}
                                isSelected={isSelected}
                                onSelectChange={(selected) => {
                                  if (selected) {
                                    toggleSubmissionSelection(questId, submission.userTypeId)
                                  } else {
                                    toggleSubmissionSelection(questId, submission.userTypeId)
                                  }
                                }}
                                quest={quest}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Approved Submissions */}
                    {quest.accepted_submission_user_type_ids && quest.accepted_submission_user_type_ids.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                          Approved Submissions ({quest.accepted_submission_user_type_ids.length})
                        </h4>
                        <div className="space-y-2">
                          {quest.accepted_submission_user_type_ids.map((userTypeId) => {
                            const submission = questSubmissions.find(s => s.userTypeId === ccc.hexFrom(userTypeId))
                            const userData = userDetails.get(ccc.hexFrom(userTypeId))
                            
                            if (!submission) {
                              // Show approved user even if we don't have their submission data
                              return (
                                <div key={ccc.hexFrom(userTypeId)} className="flex items-center justify-between p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                                  <div className="flex items-center gap-3">
                                    <Badge className="bg-green-100 text-green-800">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Approved
                                    </Badge>
                                    <code className="text-xs font-mono">
                                      {ccc.hexFrom(userTypeId).slice(0, 10)}...
                                    </code>
                                  </div>
                                  <Badge variant="outline">
                                    <Trophy className="w-3 h-3 mr-1" />
                                    {Number(quest.points || 0)} points minted
                                  </Badge>
                                </div>
                              )
                            }

                            return (
                              <SubmissionCard
                                key={ccc.hexFrom(userTypeId)}
                                submission={submission}
                                userData={userData}
                                questId={questId}
                                questPoints={Number(quest.points || 0)}
                                isPending={false}
                                quest={quest}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {questSubmissions.length === 0 && !quest.accepted_submission_user_type_ids?.length && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No submissions yet for this quest
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No submissions received yet
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Approval Confirmation Dialog */}
      <Dialog open={approvalDialog.open} onOpenChange={(open) => {
        if (!open && approvalDialog.status !== 'confirming') {
          setApprovalDialog(prev => ({ ...prev, open: false }))
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalDialog.status === 'success' ? 'Approval Successful!' : 'Confirm Quest Approval'}
            </DialogTitle>
            <DialogDescription>
              {approvalDialog.status === 'idle' && (
                <>
                  You are about to approve {approvalDialog.userCount} submission{approvalDialog.userCount !== 1 ? 's' : ''} for &quot;{approvalDialog.questTitle}&quot;
                </>
              )}
              {approvalDialog.status === 'confirming' && 'Processing approval transaction...'}
              {approvalDialog.status === 'success' && 'Submissions have been approved and Points have been minted.'}
              {approvalDialog.status === 'error' && 'Failed to approve submissions.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {approvalDialog.status === 'idle' && (
              <Alert>
                <Trophy className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div>Total Points to be minted: <strong>{approvalDialog.totalPoints}</strong></div>
                    <div className="text-xs text-muted-foreground">
                      {approvalDialog.userCount} user{approvalDialog.userCount !== 1 ? 's' : ''} × {approvalDialog.totalPoints / approvalDialog.userCount} points each
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {approvalDialog.status === 'confirming' && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {approvalDialog.status === 'success' && approvalDialog.txHash && (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-medium text-green-800 dark:text-green-400">
                      Successfully approved {approvalDialog.userCount} submission{approvalDialog.userCount !== 1 ? 's' : ''}
                    </div>
                    <div className="text-sm">
                      {approvalDialog.totalPoints} Points have been minted
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">Transaction:</span>
                      <code className="font-mono">{approvalDialog.txHash.slice(0, 10)}...</code>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {approvalDialog.status === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {approvalDialog.error || 'An unexpected error occurred'}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            {approvalDialog.status === 'idle' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setApprovalDialog(prev => ({ ...prev, open: false }))}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmApproval}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approve & Mint Points
                </Button>
              </>
            )}
            {approvalDialog.status === 'success' && (
              <Button
                onClick={() => setApprovalDialog(prev => ({ ...prev, open: false }))}
              >
                Close
              </Button>
            )}
            {approvalDialog.status === 'error' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setApprovalDialog(prev => ({ ...prev, open: false }))}
                >
                  Close
                </Button>
                <Button
                  onClick={confirmApproval}
                  variant="destructive"
                >
                  Retry
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}