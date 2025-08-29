/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Send, AlertCircle, Loader2, UserPlus, TestTube, ExternalLink, Database, Cloud } from "lucide-react"
import { MarkdownEditor } from "@/components/markdown-editor"
import { useUser } from "@/lib/providers/user-provider"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { useNostrStorage } from "@/hooks/use-nostr-storage"
import { ccc } from "@ckb-ccc/connector-react"
import { debug } from "@/lib/utils/debug"
import { useNostrFetch } from "@/hooks/use-nostr-fetch"
import { NostrStorageModal } from "@/components/nostr-storage-modal"
import { isNostrSubmissionData, QuestSubtask } from "@/types/submission"

interface QuestSubmissionFormProps {
  quest: {
    quest_id?: number
    sub_tasks?: QuestSubtask[]
  }
  questIndex: number
  campaignTypeId: ccc.Hex
  onSuccess?: () => void | Promise<void>
}

export function QuestSubmissionForm({ 
  quest, 
  questIndex,
  campaignTypeId,
  onSuccess 
}: QuestSubmissionFormProps) {
  const { currentUserTypeId, submitQuest, hasUserSubmittedQuest, getUserSubmissions, isLoading: userLoading } = useUser()
  const { userAddress } = useProtocol()
  const { storeSubmission, isConnected: nostrConnected } = useNostrStorage()
  const { fetchSubmission } = useNostrFetch()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [isLoadingSubmission, setIsLoadingSubmission] = useState(true)
  const [existingSubmission, setExistingSubmission] = useState<{
    submission_timestamp?: number | bigint
    submission_content?: string
  } | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [nostrFetchError, setNostrFetchError] = useState(false)
  const [showStorageModal, setShowStorageModal] = useState(false)
  const [pendingNeventId, setPendingNeventId] = useState<string | null>(null)
  const [pendingSubmissionData, setPendingSubmissionData] = useState<{
    campaignTypeId: ccc.Hex
    questId: number
    contentToStore: string
  } | null>(null)
  // Nostr event ID stored after successful submission (for debugging/tracking)
  const [subtaskResponses, setSubtaskResponses] = useState<Record<number, string>>({})
  const [userVerificationData, setUserVerificationData] = useState({
    name: "",
    email: "",
    twitter: "",
    discord: ""
  })

  // Check if user has already submitted this quest and load the submission
  const checkSubmission = async () => {
    setIsLoadingSubmission(true)
    
    if (currentUserTypeId) {
      try {
        // Check if submitted
        const submitted = await hasUserSubmittedQuest(
          currentUserTypeId,
          campaignTypeId,
          Number(quest.quest_id || questIndex + 1)
        )
        setHasSubmitted(submitted)
        setIsFirstTime(false)
        
        // If submitted, load the submission content
        if (submitted) {
          const submissions = await getUserSubmissions(currentUserTypeId)
          const questId = Number(quest.quest_id || questIndex + 1)
          
          const submission = submissions.find((s) => 
            s.campaign_type_id === campaignTypeId && 
            s.quest_id === questId
          )
          
          if (submission) {
            setExistingSubmission(submission)
            
            // Load content from Nostr if it's a nevent ID
            if (submission.submission_content?.startsWith('nevent1')) {
              try {
                const nostrData = await fetchSubmission(submission.submission_content)
                if (nostrData) {
                  // Parse the content and populate the form
                  const responses = parseSubmissionContent(nostrData.content)
                  setSubtaskResponses(responses)
                  setNostrFetchError(false)
                } else {
                  // Nostr fetch failed - mark error and prepare for resubmission
                  setNostrFetchError(true)
                  // Set empty responses to allow resubmission
                  const responses: Record<number, string> = {}
                  quest.sub_tasks?.forEach((_, index) => {
                    responses[index] = ""
                  })
                  setSubtaskResponses(responses)
                }
              } catch (err) {
                console.error("Failed to load content from Nostr:", err)
                // Mark as Nostr fetch error
                setNostrFetchError(true)
                // Set empty responses to allow resubmission
                const responses: Record<number, string> = {}
                quest.sub_tasks?.forEach((_, index) => {
                  responses[index] = ""
                })
                setSubtaskResponses(responses)
              }
            } else {
              // Direct content - parse it
              const content = submission.submission_content || ""
              const responses = parseSubmissionContent(content)
              setSubtaskResponses(responses)
            }
          }
        }
      } catch (err) {
        console.error("Failed to check/load submission:", err)
      }
    } else if (userAddress) {
      setIsFirstTime(true)
    }
    
    setIsLoadingSubmission(false)
  }

  useEffect(() => {
    checkSubmission()
  }, [currentUserTypeId, campaignTypeId, quest.quest_id, questIndex, hasUserSubmittedQuest, getUserSubmissions, userAddress, fetchSubmission])

  const handleSubtaskResponseChange = (subtaskIndex: number, value: string) => {
    setSubtaskResponses(prev => ({
      ...prev,
      [subtaskIndex]: value
    }))
  }

  // Parse submission content (JSON format only)
  const parseSubmissionContent = (content: string): Record<number, string> => {
    const responses: Record<number, string> = {}
    
    try {
      const parsed = JSON.parse(content) as unknown
      if (isNostrSubmissionData(parsed)) {
        parsed.subtasks.forEach((subtask, index) => {
          responses[index] = subtask.response || ""
        })
        return responses
      }
    } catch {
      // Invalid format - return empty responses to prompt resubmission
      quest.sub_tasks?.forEach((_, index) => {
        responses[index] = ""
      })
    }
    
    return responses
  }

  // Test data generator with varied content for different subtasks
  const fillTestData = () => {
    const testSubmissions = [
      // Technical implementation responses
      `<h2>Implementation Details</h2>
<p>I have successfully implemented the required feature using the following approach:</p>
<ul>
<li>Created a new React component with TypeScript</li>
<li>Integrated with the existing CKB blockchain infrastructure</li>
<li>Added comprehensive error handling and validation</li>
</ul>
<pre><code>const result = await submitTransaction({
  type: 'user_creation',
  data: userData
});</code></pre>
<p>The implementation includes unit tests with 95% coverage.</p>
<div style="background: #1a1a2e; padding: 20px; border-radius: 8px; margin: 10px 0;">
  <div style="color: #0f4c75; font-size: 18px; font-family: monospace; margin-bottom: 15px;">📊 Code Coverage Report</div>
  <div style="background: #333344; height: 20px; border-radius: 4px; overflow: hidden;">
    <div style="background: #4ade80; width: 94%; height: 100%; display: flex; align-items: center; justify-content: center;">
      <span style="color: white; font-size: 14px; font-weight: bold;">94%</span>
    </div>
  </div>
  <div style="margin-top: 15px; color: #a0a0a0; font-family: monospace; font-size: 12px;">
    <div>✓ Unit Tests: 156 passing</div>
    <div>✓ Integration: 42 passing</div>
    <div>✓ E2E: 18 passing</div>
    <div style="color: #4ade80; margin-top: 10px;">✅ All tests passing!</div>
  </div>
</div>`,
      
      // Research and analysis responses
      `<h2>Research Findings</h2>
<p>After conducting thorough research on the topic, I've identified the following key insights:</p>
<ol>
<li><strong>Market Analysis:</strong> The current market shows a 45% increase in user adoption</li>
<li><strong>Competitive Landscape:</strong> Our solution offers unique advantages in terms of:
   <ul>
   <li>Lower transaction costs (30% reduction)</li>
   <li>Faster processing times (2x improvement)</li>
   <li>Better user experience scores (8.5/10 vs 6.2/10 industry average)</li>
   </ul>
</li>
</ol>
<blockquote>
<p>"This innovative approach represents a paradigm shift in blockchain technology" - Industry Expert</p>
</blockquote>
<h3>Data Visualization</h3>
<div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 10px 0;">
  <h4 style="text-align: center; color: #1f2937; margin-bottom: 20px;">📈 User Adoption Trend</h4>
  <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 150px; border-bottom: 2px solid #e5e7eb; padding: 0 20px;">
    <div style="text-align: center;">
      <div style="background: #3782f7; width: 40px; height: 40px; margin: 0 auto;"></div>
      <div style="color: white; background: #3782f7; padding: 2px 8px; border-radius: 4px; margin: 5px 0;">25k</div>
      <div style="color: #6b7280; font-size: 12px; margin-top: 10px;">Q1 2024</div>
    </div>
    <div style="text-align: center;">
      <div style="background: #3782f7; width: 40px; height: 60px; margin: 0 auto;"></div>
      <div style="color: white; background: #3782f7; padding: 2px 8px; border-radius: 4px; margin: 5px 0;">35k</div>
      <div style="color: #6b7280; font-size: 12px; margin-top: 10px;">Q2 2024</div>
    </div>
    <div style="text-align: center;">
      <div style="background: #3782f7; width: 40px; height: 90px; margin: 0 auto;"></div>
      <div style="color: white; background: #3782f7; padding: 2px 8px; border-radius: 4px; margin: 5px 0;">48k</div>
      <div style="color: #6b7280; font-size: 12px; margin-top: 10px;">Q3 2024</div>
    </div>
    <div style="text-align: center;">
      <div style="background: #10b981; width: 40px; height: 120px; margin: 0 auto;"></div>
      <div style="color: white; background: #10b981; padding: 2px 8px; border-radius: 4px; margin: 5px 0;">65k</div>
      <div style="color: #6b7280; font-size: 12px; margin-top: 10px;">Q4 2024</div>
    </div>
  </div>
  <div style="text-align: right; color: #10b981; font-weight: bold; margin-top: 10px; font-size: 18px;">+45% Growth 📈</div>
</div>`,
      
      // Creative content responses
      `<h2>Creative Campaign Proposal</h2>
<p>🎨 <strong>Campaign Theme:</strong> "Build the Future Together"</p>
<h3>Visual Concept</h3>
<p>The campaign will feature vibrant, futuristic imagery that resonates with our tech-savvy audience.</p>
<ul>
<li>Primary Colors: #FF6B6B, #4ECDC4, #45B7D1</li>
<li>Typography: Modern, clean sans-serif</li>
<li>Imagery: Abstract geometric patterns representing blockchain networks</li>
</ul>
<h3>Content Strategy</h3>
<table>
<tr><th>Platform</th><th>Content Type</th><th>Frequency</th></tr>
<tr><td>Twitter</td><td>Short videos</td><td>Daily</td></tr>
<tr><td>Medium</td><td>Technical articles</td><td>Weekly</td></tr>
<tr><td>Discord</td><td>Community updates</td><td>Real-time</td></tr>
</table>
<p>Expected reach: 100K+ impressions in first month</p>
<h3>Visual Mockup</h3>
<div style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 50%, #45B7D1 100%); padding: 30px; border-radius: 12px; margin: 10px 0; text-align: center; color: white;">
  <h2 style="font-size: 32px; font-weight: bold; margin: 0;">CKBoost</h2>
  <p style="font-size: 16px; margin: 10px 0 30px;">Build the Future Together</p>
  
  <div style="display: flex; justify-content: center; align-items: center; margin: 30px 0;">
    <div style="width: 80px; height: 80px; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">
      🔗
    </div>
    <div style="width: 60px; height: 2px; background: white; opacity: 0.5;"></div>
    <div style="width: 50px; height: 50px; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; opacity: 0.7;">
      ⚡
    </div>
    <div style="width: 60px; height: 2px; background: white; opacity: 0.5;"></div>
    <div style="width: 50px; height: 50px; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; opacity: 0.7;">
      🚀
    </div>
  </div>
  
  <button style="background: rgba(255, 255, 255, 0.2); border: 2px solid white; color: white; padding: 10px 30px; border-radius: 20px; font-size: 14px; font-weight: bold; cursor: pointer;">
    Join Now
  </button>
</div>`,
      
      // Community engagement responses
      `<h2>Community Engagement Report</h2>
<p>I've been actively engaging with the community through various channels:</p>
<h3>Discord Activity</h3>
<ul>
<li>✅ Answered 50+ technical questions from community members</li>
<li>✅ Organized 3 virtual workshops on smart contract development</li>
<li>✅ Created comprehensive FAQ documentation</li>
</ul>
<h3>Social Media Presence</h3>
<p>Twitter engagement has increased by <strong>200%</strong> through consistent posting:</p>
<ul>
<li>Educational threads: 15 posts (avg. 500 likes)</li>
<li>Project updates: 10 posts (avg. 300 retweets)</li>
<li>Community highlights: 8 posts (avg. 100 comments)</li>
</ul>
<p>Links to posts: <a href="#">Thread 1</a> | <a href="#">Thread 2</a> | <a href="#">Thread 3</a></p>`,
      
      // Bug report/testing responses
      `<h2>Testing & Quality Assurance Report</h2>
<p>Comprehensive testing has been completed with the following results:</p>
<h3>Test Coverage</h3>
<pre><code>
✓ Unit Tests: 156 passing (2ms)
✓ Integration Tests: 42 passing (145ms)
✓ E2E Tests: 18 passing (1203ms)

Coverage Summary:
Statements   : 94.28% ( 198/210 )
Branches     : 88.46% ( 46/52 )
Functions    : 96.77% ( 30/31 )
Lines        : 93.84% ( 183/195 )
</code></pre>
<h3>Bugs Identified & Fixed</h3>
<ol>
<li>🐛 Fixed race condition in transaction submission</li>
<li>🐛 Resolved memory leak in WebSocket connection</li>
<li>🐛 Corrected validation logic for user inputs</li>
</ol>
<p>All critical issues have been resolved. System is production-ready.</p>`
    ];

    // Generate varied responses based on subtask index
    const newResponses: Record<number, string> = {};
    quest.sub_tasks?.forEach((subtask, index) => {
      // Use different test data for each subtask, cycling through if needed
      newResponses[index] = testSubmissions[index % testSubmissions.length];
    });

    setSubtaskResponses(newResponses);

    // Also fill in test user data if first time
    if (isFirstTime) {
      setUserVerificationData({
        name: "Test User " + Math.floor(Math.random() * 1000),
        email: `testuser${Math.floor(Math.random() * 1000)}@example.com`,
        twitter: "@testuser" + Math.floor(Math.random() * 1000),
        discord: "TestUser#" + Math.floor(Math.random() * 10000)
      });
    }
  }

  const handleSubmit = async () => {
    // Check if at least one subtask has a response
    const hasResponses = Object.values(subtaskResponses).some(response => response.trim() !== "")
    if (!hasResponses) {
      setError("Please provide a response for at least one subtask")
      return
    }

    // If first time user, ensure they provide at least a name
    if (isFirstTime && !userVerificationData.name) {
      setError("Please provide your name for profile creation")
      return
    }

    // Don't set isSubmitting here - it will be set in the modal flow
    // Just prepare the data and show the modal
    
    // Format submission as JSON structure
    const submissionData = {
      format: "json",
      version: "1.0",
      timestamp: Date.now(),
      subtasks: quest.sub_tasks?.map((subtask, index) => ({
        title: subtask.title || `Task ${index + 1}`,
        description: subtask.description,
        type: subtask.type,
        proof_required: subtask.proof_required,
        response: subtaskResponses[index] || ""
      })) || []
    }
    
    const submissionContent = JSON.stringify(submissionData)

    setError(null)

    // First, store the full content on Nostr using the React hook
    let nostrNeventId: string | undefined
    
    // When editing, always create a new Nostr event for the updated content
    // This ensures the latest content is stored on Nostr
    if (nostrConnected && userAddress) {
      try {
        setIsSubmitting(true)
        debug.log(isEditMode ? "Updating submission on Nostr..." : "Storing submission on Nostr...")
        const result = await storeSubmission.mutateAsync({
          campaignTypeId,
          questId: Number(quest.quest_id || questIndex + 1),
          userAddress,
          content: submissionContent,
          timestamp: Date.now()
        })
        nostrNeventId = result
        debug.log("✅ Successfully stored on Nostr!")
        debug.log("Stored nevent ID:", nostrNeventId)
        debug.log("Full nevent ID that will be submitted:", nostrNeventId)
        debug.log("Is this an edit?", isEditMode)
        
        // Store the submission data for later - use the nevent ID directly
        setPendingSubmissionData({
          campaignTypeId,
          questId: Number(quest.quest_id || questIndex + 1),
          contentToStore: nostrNeventId // Use the nevent ID directly
        })
        setPendingNeventId(nostrNeventId)
        debug.log("Pending data set with nevent ID:", nostrNeventId)
        
        // Show the modal after successful Nostr storage
        setShowStorageModal(true)
        setIsSubmitting(false)
        
        // Don't proceed with transaction yet - wait for verification
        return
      } catch (nostrError) {
        console.warn("Failed to store on Nostr, will store on-chain:", nostrError)
        setIsSubmitting(false)
        // Continue without Nostr storage
      }
    }

    // If no Nostr storage, prepare data and show modal for direct submission
    setPendingSubmissionData({
      campaignTypeId,
      questId: Number(quest.quest_id || questIndex + 1),
      contentToStore: submissionContent
    })
    setShowStorageModal(true)
  }

  // Separate function to finalize submission after verification
  const finalizeSubmission = async (campaignHash?: ccc.Hex, questIdParam?: number, content?: string) => {
    try {
      // Use pending data if available
      const finalCampaignHash = campaignHash || pendingSubmissionData?.campaignTypeId
      const finalQuestId = questIdParam || pendingSubmissionData?.questId
      const finalContent = content || pendingSubmissionData?.contentToStore

      debug.log("📍 finalizeSubmission called with:", {
        providedCampaignHash: campaignHash,
        providedQuestId: questIdParam,
        providedContent: content?.slice(0, 50),
        pendingData: pendingSubmissionData,
        pendingNeventId,
        finalContent: finalContent?.slice(0, 50),
        isNeventId: finalContent?.startsWith('nevent1')
      })

      if (!finalCampaignHash || !finalQuestId || !finalContent) {
        throw new Error("Missing submission data")
      }

      const txHash = await submitQuest(
        finalCampaignHash,
        finalQuestId,
        finalContent,
        isFirstTime ? userVerificationData : undefined
      )

      debug.log("Quest submitted successfully:", { 
        txHash, 
        questId: finalQuestId,
        usedNostr: !!pendingNeventId
      })
      
      setHasSubmitted(true)
      setIsEditMode(false)
      
      // Reload the submission to get the latest data
      const submissions = await getUserSubmissions(currentUserTypeId!)
      const submission = submissions.find((s) => 
        s.campaign_type_id === finalCampaignHash && 
        s.quest_id === finalQuestId
      )
      if (submission) {
        setExistingSubmission(submission)
      }

      // Clear pending data after successful submission
      setPendingSubmissionData(null)
      setPendingNeventId(null)
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        debug.log("Calling onSuccess callback after successful submission")
        await onSuccess()
      }
      
      // Return the txHash so the modal can display it
      return txHash
    } catch (err) {
      debug.error("Failed to finalize submission:", err)
      setError(err instanceof Error ? err.message : "Failed to submit quest")
      // Re-throw so the modal can handle the error
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!userAddress) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Please connect your wallet to submit this quest
        </AlertDescription>
      </Alert>
    )
  }

  // Show loading state while checking submission
  if (isLoadingSubmission) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading submission status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Check if submission is accepted
  // Note: acceptance status would need to be fetched from the campaign cell
  const isAccepted = false // TODO: Implement acceptance checking from campaign cell

  return (
    <div className="space-y-6">
      {/* User Profile Fields (for first-time users) */}
      {isFirstTime && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create Your Profile</CardTitle>
            <CardDescription>
              This is your first submission. Please provide your profile information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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
          </CardContent>
        </Card>
      )}

      {/* Show submission status if already submitted */}
      {hasSubmitted && existingSubmission && (
        <>
          {/* Show Nostr fetch error if content couldn't be loaded */}
          {nostrFetchError && (
            <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-900/20 mb-4">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <div className="flex items-center justify-between w-full">
                <div>
                  <AlertDescription className="text-orange-800 dark:text-orange-200 font-medium">
                    Unable to load your submission content from decentralized storage
                  </AlertDescription>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    Your submission is recorded on-chain, but the content needs to be resubmitted to restore access.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={() => {
                    setIsEditMode(true)
                    setNostrFetchError(false)
                  }}
                >
                  Resubmit Content
                </Button>
              </div>
            </Alert>
          )}
          
          {/* Regular submission status */}
          {!nostrFetchError && (
            <Alert className={isAccepted ? "border-green-200 bg-green-50 dark:bg-green-900/20" : "border-blue-200 bg-blue-50 dark:bg-blue-900/20"}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  {isAccepted ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800 dark:text-green-200">
                        Your submission has been accepted! You earned 10 points.
                      </AlertDescription>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800 dark:text-blue-200">
                        Your submission is pending review by the campaign admin.
                      </AlertDescription>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isAccepted ? "default" : "secondary"}>
                    {isAccepted ? "Accepted" : "Pending"}
                  </Badge>
                  {!isAccepted && !isEditMode && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditMode(true)}
                    >
                      Edit Submission
                    </Button>
                  )}
                </div>
              </div>
            </Alert>
          )}
        </>
      )}

      {/* Storage Debug Information */}
      {hasSubmitted && existingSubmission && existingSubmission.submission_content?.startsWith('nevent1') && (
        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Nostr Storage Information (Debug)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Storage Type:</span>
                <Badge variant="outline" className="font-mono">
                  Decentralized (Nostr)
                </Badge>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Event ID:</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded flex-1 overflow-x-auto">
                    {existingSubmission.submission_content}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigator.clipboard.writeText(existingSubmission.submission_content || '')}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Storage Status:</span>
                {nostrFetchError ? (
                  <Badge variant="destructive">Not Accessible</Badge>
                ) : (
                  <Badge variant="default" className="bg-green-600">Verified</Badge>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">View on External Tools:</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 dark:bg-green-900/20"
                    onClick={() => {
                      window.open(`https://njump.me/${existingSubmission.submission_content}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    njump.me ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(`https://nostrudel.ninja/#/n/${existingSubmission.submission_content}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Nostrudel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(`https://snort.social/e/${existingSubmission.submission_content}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Snort
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(`https://nostr.band/?q=${existingSubmission.submission_content}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    nostr.band
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  njump.me works best. Try others if needed.
                </p>
              </div>

              {nostrFetchError && (
                <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-900/20">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-sm text-orange-700 dark:text-orange-300">
                    The event could not be retrieved from Nostr relays. This may be due to:
                    <ul className="list-disc list-inside mt-1">
                      <li>Event not propagated to accessible relays</li>
                      <li>Relay connection issues</li>
                      <li>Event was deleted or expired</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subtasks Submission Form */}
      <Card>
        <CardHeader>
          <CardTitle>
            {hasSubmitted && !isEditMode ? "Your Submission" : 
             isEditMode && nostrFetchError ? "Resubmit Your Content" :
             isEditMode ? "Edit Your Submission" : 
             "Submit Your Responses"}
          </CardTitle>
          <CardDescription>
            {hasSubmitted && !isEditMode && !nostrFetchError && existingSubmission
              ? `Submitted on ${new Date(Number(existingSubmission.submission_timestamp)).toLocaleString()}`
              : nostrFetchError && isEditMode
              ? "Please re-enter your submission content. The original content could not be retrieved from storage."
              : "Provide your responses for each task below. You can use Markdown formatting."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {quest.sub_tasks?.map((subtask, subIndex) => (
              <div key={subIndex} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-semibold text-sm">{subIndex + 1}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold">
                          {subtask.title || `Task ${subIndex + 1}`}
                        </h4>
                        {subtask.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {subtask.description}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Task metadata badges */}
                    <div className="flex flex-wrap gap-2 mb-3 ml-11">
                      {subtask.type && (
                        <Badge variant="outline" className="text-xs">
                          Type: {subtask.type}
                        </Badge>
                      )}
                      {subtask.proof_required && (
                        <Badge variant="outline" className="text-xs">
                          Proof: {subtask.proof_required}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Response editor */}
                <div className="ml-11">
                  {hasSubmitted && !isEditMode && !nostrFetchError ? (
                    // Display mode - show the content as readonly
                    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {subtaskResponses[subIndex] ? (
                          <div dangerouslySetInnerHTML={{ __html: subtaskResponses[subIndex] }} />
                        ) : (
                          <p className="text-muted-foreground italic">No response provided</p>
                        )}
                      </div>
                    </div>
                  ) : hasSubmitted && !isEditMode && nostrFetchError ? (
                    // Display mode with fetch error - show error message
                    <div className="p-4 border border-orange-300 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                      <p className="text-orange-700 dark:text-orange-300 text-sm">
                        ⚠️ Content could not be loaded from storage. Click "Resubmit Content" above to restore your submission.
                      </p>
                    </div>
                  ) : (
                    // Edit mode - show the editor
                    <>
                      <MarkdownEditor
                        id={`subtask-editor-${subIndex}`}
                        placeholder={`Enter your response for ${subtask.title || 'this task'}...`}
                        value={subtaskResponses[subIndex] || ""}
                        onChange={(value) => handleSubtaskResponseChange(subIndex, value)}
                        height={250}
                      />
                      {subtask.proof_required && (
                        <p className="text-xs text-muted-foreground mt-2">
                          💡 Tip: Include links, screenshots, or other proof as required. You can use the link button to add URLs.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )) || (
              <div className="text-center py-8 text-muted-foreground">
                No subtasks defined for this quest
              </div>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit/Edit Buttons */}
            {(!hasSubmitted || isEditMode) && (
              <div className="flex justify-between pt-4 border-t">
                {/* Test Data Button (Development Only) */}
                {process.env.NODE_ENV === 'development' && !hasSubmitted && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={fillTestData}
                    className="border-dashed border-2"
                  >
                    <TestTube className="w-5 h-5 mr-2" />
                    Fill Test Data
                  </Button>
                )}
                
                {isEditMode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setIsEditMode(false)
                      // Reload original submission content
                      checkSubmission()
                    }}
                  >
                    Cancel Edit
                  </Button>
                )}
                
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting || 
                    userLoading || 
                    (isFirstTime && !userVerificationData.name) ||
                    Object.keys(subtaskResponses).length === 0
                  }
                  className={`${isFirstTime ? "bg-purple-600 hover:bg-purple-700" : isEditMode ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-600 hover:bg-blue-700"} ${process.env.NODE_ENV !== 'development' || isEditMode ? 'ml-auto' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      {isFirstTime ? "Creating Profile & Submitting..." : 
                       isEditMode && nostrFetchError ? "Resubmitting Content..." :
                       isEditMode ? "Updating Submission..." : 
                       "Submitting Quest..."}
                    </>
                  ) : (
                    <>
                      {isFirstTime ? <UserPlus className="w-5 h-5 mr-2" /> : <Send className="w-5 h-5 mr-2" />}
                      {isFirstTime ? "Create Profile & Submit Quest" : 
                       isEditMode && nostrFetchError ? "Resubmit Content" :
                       isEditMode ? "Update Submission" : 
                       "Submit All Responses"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Nostr Storage Verification Modal */}
      <NostrStorageModal
        isOpen={showStorageModal}
        onClose={() => {
          // Only clear data and close modal when user explicitly closes it
          setShowStorageModal(false)
          setPendingNeventId(null)
          setPendingSubmissionData(null)
          setIsSubmitting(false)
          // If submission was successful, reload the submission data
          if (hasSubmitted) {
            checkSubmission()
          }
        }}
        neventId={pendingNeventId}
        onConfirm={async () => {
          // Don't close the modal - let it stay open to show tx result
          const txHash = await finalizeSubmission()
          // Modal will handle showing success/error state
          // Return the txHash so modal can display success
          return txHash
        }}
        mode="verifying"
      />
    </div>
  )
}