"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Coins, Info, Wallet, Users } from "lucide-react"

interface TipButtonProps {
  recipientName: string
  recipientAddress: string
  contributionId: string
  currentUserAllowlisted?: boolean
  onTipInitiated?: (contributionId: string, tipData: any) => void
}

export function TipButton({
  recipientName,
  recipientAddress,
  contributionId,
  currentUserAllowlisted = false,
  onTipInitiated,
}: TipButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState("community")

  // Community tip form
  const [communityReason, setCommunityReason] = useState("")

  // Personal tip form
  const [personalAmount, setPersonalAmount] = useState("")
  const [personalMessage, setPersonalMessage] = useState("")

  const handleCommunityTip = async () => {
    if (!currentUserAllowlisted || !communityReason.trim()) return

    setIsProcessing(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsProcessing(false)
    setIsModalOpen(false)

    const tipData = {
      type: "community",
      reason: communityReason,
      amount: 50,
      requiredApprovals: 5,
    }

    onTipInitiated?.(contributionId, tipData)
    setCommunityReason("")
  }

  const handlePersonalTip = async () => {
    if (!personalAmount || Number.parseFloat(personalAmount) <= 0) return

    setIsProcessing(true)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsProcessing(false)
    setIsModalOpen(false)

    const tipData = {
      type: "personal",
      amount: Number.parseFloat(personalAmount),
      message: personalMessage,
    }

    onTipInitiated?.(contributionId, tipData)
    setPersonalAmount("")
    setPersonalMessage("")
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 hover:bg-yellow-50 hover:border-yellow-300 transition-colors"
      >
        <Coins className="w-4 h-4 text-yellow-600" />
        Tip CKB
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-600" />
              Tip {recipientName}
            </DialogTitle>
            <DialogDescription>Choose how you'd like to tip this valuable contribution</DialogDescription>
          </DialogHeader>

          {/* Recipient Info */}
          <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 flex items-center justify-center font-semibold">
                {recipientName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{recipientName}</div>
                <div className="text-sm text-muted-foreground font-mono">
                  {recipientAddress.slice(0, 8)}...{recipientAddress.slice(-6)}
                </div>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="community" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Community Tip
              </TabsTrigger>
              <TabsTrigger value="personal" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Personal Tip
              </TabsTrigger>
            </TabsList>

            <TabsContent value="community" className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <div className="font-medium mb-1">Community Tips (50 CKB)</div>
                    <ul className="space-y-1 text-xs">
                      <li>• Funded by community treasury</li>
                      <li>• Requires 5 community approvals</li>
                      <li>• Only allowlisted members can propose</li>
                      <li>• Must provide justification</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="reason">Why does this contribution deserve a community tip? *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Explain why this contribution adds value to the community and deserves recognition from the treasury..."
                    value={communityReason}
                    onChange={(e) => setCommunityReason(e.target.value)}
                    rows={4}
                    required
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Your Status:</span>
                    <Badge variant={currentUserAllowlisted ? "default" : "secondary"}>
                      {currentUserAllowlisted ? "✅ Allowlisted" : "❌ Not Allowlisted"}
                    </Badge>
                  </div>
                  <div className="text-sm font-semibold text-yellow-600">50 CKB</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="personal" className="space-y-4">
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-green-800">
                    <div className="font-medium mb-1">Personal Tips</div>
                    <ul className="space-y-1 text-xs">
                      <li>• Sent directly from your wallet</li>
                      <li>• Any amount you choose</li>
                      <li>• Instant transfer, no approvals needed</li>
                      <li>• Optional personal message</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">Tip Amount (CKB) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount in CKB"
                    value={personalAmount}
                    onChange={(e) => setPersonalAmount(e.target.value)}
                    min="0.1"
                    step="0.1"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Personal Message (Optional)</Label>
                  <Textarea
                    id="message"
                    placeholder="Add a personal note with your tip..."
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span>Estimated network fee:</span>
                    <span className="font-medium">~0.001 CKB</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>

            {activeTab === "community" ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        onClick={handleCommunityTip}
                        disabled={!currentUserAllowlisted || isProcessing || !communityReason.trim()}
                        className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                      >
                        {isProcessing ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Proposing...
                          </>
                        ) : (
                          <>
                            <Users className="w-4 h-4 mr-2" />
                            Propose Community Tip
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!currentUserAllowlisted && (
                    <TooltipContent>
                      <p>Only allowlisted community members can propose community tips</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                onClick={handlePersonalTip}
                disabled={isProcessing || !personalAmount || Number.parseFloat(personalAmount) <= 0}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4 mr-2" />
                    Send Personal Tip
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
