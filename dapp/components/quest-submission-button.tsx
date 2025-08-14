"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, Play, Send, Upload, AlertCircle, Loader2, UserPlus } from "lucide-react"
import { useUser } from "@/lib/providers/user-provider"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { ccc } from "@ckb-ccc/core"
import { ckboost } from "ssri-ckboost"
import { debug } from "@/lib/utils/debug"

interface QuestSubmissionButtonProps {
  quest: any // Quest type from the campaign
  questIndex: number
  campaign: any
  campaignTypeHash: ccc.Hex
}

export function QuestSubmissionButton({ 
  quest, 
  questIndex, 
  campaign,
  campaignTypeHash 
}: QuestSubmissionButtonProps) {
  const { currentUserTypeId, submitQuest, hasUserSubmittedQuest, isLoading: userLoading } = useUser()
  const { userAddress } = useProtocol()
  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false)
  const [submissionContent, setSubmissionContent] = useState("")
  const [submissionUrl, setSubmissionUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [userVerificationData, setUserVerificationData] = useState({
    name: "",
    email: "",
    twitter: "",
    discord: ""
  })

  // Check if user has already submitted this quest
  useEffect(() => {
    async function checkSubmission() {
      console.log("Checking submission status for quest", {
        hasUserTypeId: !!currentUserTypeId,
        userTypeId: currentUserTypeId?.slice(0, 10) + "..." || "none",
        campaignTypeHash: campaignTypeHash.slice(0, 10) + "...",
        questId: Number(quest.quest_id || questIndex + 1)
      });
      
      if (currentUserTypeId) {
        const submitted = await hasUserSubmittedQuest(
          currentUserTypeId,
          campaignTypeHash,
          Number(quest.quest_id || questIndex + 1)
        )
        console.log("Submission check result:", submitted);
        setHasSubmitted(submitted)
        setIsFirstTime(false)
      } else if (userAddress) {
        // User is connected but doesn't have a cell yet
        console.log("User connected but no user cell found");
        setIsFirstTime(true)
      }
    }
    checkSubmission()
  }, [currentUserTypeId, campaignTypeHash, quest.quest_id, questIndex, hasUserSubmittedQuest, userAddress])

  const handleSubmit = async () => {
    if (!submissionContent && !submissionUrl) {
      setError("Please provide submission content or URL")
      return
    }

    // If first time user, ensure they provide at least a name
    if (isFirstTime && !userVerificationData.name) {
      setError("Please provide your name for profile creation")
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Combine content and URL for submission
      const fullSubmissionContent = submissionUrl 
        ? `${submissionContent}\n\nProof URL: ${submissionUrl}`
        : submissionContent

      // Submit quest - this will create user cell if needed
      const txHash = await submitQuest(
        campaignTypeHash,
        Number(quest.quest_id || questIndex + 1),
        fullSubmissionContent,
        isFirstTime ? userVerificationData : undefined
      )

      debug.log("Quest submitted successfully:", { txHash, questId: quest.quest_id })
      
      setHasSubmitted(true)
      setIsSubmissionDialogOpen(false)
      setSubmissionContent("")
      setSubmissionUrl("")
    } catch (err) {
      debug.error("Failed to submit quest:", err)
      setError(err instanceof Error ? err.message : "Failed to submit quest")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Button text changes based on user state
  const getButtonText = () => {
    if (!userAddress) return "Connect Wallet First"
    if (hasSubmitted) return "Quest Submitted"
    if (isFirstTime) return "Submit & Create Profile"
    return "Submit Quest"
  }

  const getButtonIcon = () => {
    if (!userAddress) return <AlertCircle className="w-5 h-5 mr-2" />
    if (hasSubmitted) return <CheckCircle className="w-5 h-5 mr-2" />
    if (isFirstTime) return <UserPlus className="w-5 h-5 mr-2" />
    return <Send className="w-5 h-5 mr-2" />
  }

  return (
    <>
      <div className="space-y-2">
        <Button 
          size="lg" 
          className={hasSubmitted ? "bg-green-100 text-green-800" : isFirstTime ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}
          onClick={() => setIsSubmissionDialogOpen(true)}
          disabled={userLoading || !userAddress || hasSubmitted}
        >
          {getButtonIcon()}
          {getButtonText()}
        </Button>
        {hasSubmitted && (
          <p className="text-sm text-muted-foreground">
            Your submission is pending review by the campaign admin
          </p>
        )}
      </div>

      <Dialog open={isSubmissionDialogOpen} onOpenChange={setIsSubmissionDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isFirstTime ? "Create Profile & Submit Quest" : "Submit Quest Completion"}
            </DialogTitle>
            <DialogDescription>
              {isFirstTime 
                ? "Create your profile and submit your first quest completion"
                : "Provide evidence of your quest completion. Include any relevant links, screenshots, or descriptions."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Quest Info */}
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium mb-1">
                {quest.metadata?.title || `Quest ${questIndex + 1}`}
              </h4>
              <p className="text-sm text-muted-foreground">
                {quest.metadata?.short_description}
              </p>
            </div>

            {/* User Profile Fields (for first-time users) */}
            {isFirstTime && (
              <div className="space-y-4 p-4 border rounded-lg">
                <h4 className="font-medium text-sm">Your Profile Information</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="user-name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="user-name"
                    placeholder="Your display name"
                    value={userVerificationData.name}
                    onChange={(e) => setUserVerificationData({
                      ...userVerificationData,
                      name: e.target.value
                    })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="user-twitter">Twitter (Optional)</Label>
                    <Input
                      id="user-twitter"
                      placeholder="@yourhandle"
                      value={userVerificationData.twitter}
                      onChange={(e) => setUserVerificationData({
                        ...userVerificationData,
                        twitter: e.target.value
                      })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-discord">Discord (Optional)</Label>
                    <Input
                      id="user-discord"
                      placeholder="username#1234"
                      value={userVerificationData.discord}
                      onChange={(e) => setUserVerificationData({
                        ...userVerificationData,
                        discord: e.target.value
                      })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submission Content */}
            <div className="space-y-2">
              <Label htmlFor="submission-content">
                Submission Description
              </Label>
              <Textarea
                id="submission-content"
                placeholder="Describe how you completed the quest..."
                value={submissionContent}
                onChange={(e) => setSubmissionContent(e.target.value)}
                rows={4}
              />
            </div>

            {/* Proof URL */}
            <div className="space-y-2">
              <Label htmlFor="proof-url">
                Proof URL (Optional)
              </Label>
              <Input
                id="proof-url"
                type="url"
                placeholder="https://example.com/proof"
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Link to tweet, screenshot, transaction, or other proof
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submission Requirements */}
            {quest.metadata?.requirements && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h5 className="text-sm font-medium mb-1">Requirements</h5>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {quest.metadata.requirements}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSubmissionDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || (!submissionContent && !submissionUrl) || (isFirstTime && !userVerificationData.name)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isFirstTime ? "Creating Profile & Submitting..." : "Submitting..."}
                </>
              ) : (
                <>
                  {isFirstTime ? <UserPlus className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  {isFirstTime ? "Create Profile & Submit" : "Submit Quest"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}