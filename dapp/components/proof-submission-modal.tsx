"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Star, ExternalLink } from "lucide-react"
import type { QuestDataLike } from "@/lib/types"

interface ProofSubmissionModalProps {
  quest: QuestDataLike | null
  isOpen: boolean
  onClose: () => void
}

export function ProofSubmissionModal({ quest, isOpen, onClose }: ProofSubmissionModalProps) {
  const [proofUrl, setProofUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proofUrl.trim()) return

    setIsSubmitting(true)
    // Simulate submission delay
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsSubmitted(true)
    setIsSubmitting(false)

    // Reset form after a delay and close modal
    setTimeout(() => {
      setProofUrl("")
      setNotes("")
      setIsSubmitted(false)
      onClose()
    }, 2000)
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Campaign":
        return "bg-purple-100 text-purple-800"
      case "Engagement":
        return "bg-blue-100 text-blue-800"
      case "On-Chain":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getProofPlaceholder = (type: string) => {
    switch (type) {
      case "Campaign":
        return "https://x.com/your-username/status/..."
      case "Engagement":
        return "https://forum.nervos.org/t/your-reply/..."
      case "On-Chain":
        return "https://explorer.nervos.org/transaction/0x..."
      default:
        return "https://example.com/proof"
    }
  }

  if (!quest) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {/* <span className="text-2xl">{quest.icon}</span> */}
            Submit Proof
          </DialogTitle>
          <DialogDescription>Complete the quest and submit proof of your participation</DialogDescription>
        </DialogHeader>

        {!isSubmitted ? (
          <>
            {/* Quest Details */}
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">{quest.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{quest.description}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getTypeColor(quest.type)}>
                    {quest.type}
                  </Badge>
                  <div className="flex items-center gap-1 text-yellow-600 font-semibold text-sm">
                    <Star className="w-3 h-3 fill-current" />
                    {quest.points} points
                  </div>
                </div>
              </div>

              {/* Submission Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="proof-url">Proof URL *</Label>
                  <Input
                    id="proof-url"
                    type="url"
                    placeholder={getProofPlaceholder(quest.type)}
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Provide a link that proves you completed this quest</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional context or notes about your submission..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !proofUrl.trim()}>
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Submit Proof
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold mb-2">Proof Submitted!</h3>
            <p className="text-muted-foreground mb-4">
              Your submission is being reviewed. You'll earn {quest.points} points once approved.
            </p>
            <div className="text-sm text-muted-foreground">This modal will close automatically...</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
