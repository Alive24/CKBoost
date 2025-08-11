"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Navigation } from "@/components/navigation"
import { ArrowLeft, CheckCircle, AlertCircle, ExternalLink } from "lucide-react"
import Link from "next/link"

export default function CreateTipProposalPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentUserAllowlisted] = useState(true)

  // Form state
  const [formData, setFormData] = useState({
    contributionTitle: "",
    contributionDescription: "",
    contributionType: "analysis",
    contributionUrl: "",
    recipientName: "",
    recipientAddress: "",
    justification: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentUserAllowlisted) {
      alert("Only allowlisted community members can create tip proposals")
      return
    }

    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))
    
    // In a real app, this would submit to the backend
    console.log("Creating tip proposal:", formData)
    
    setIsSubmitting(false)
    
    // Redirect to tipping page with success message
    router.push("/tipping?created=true")
  }

  const isFormValid = () => {
    return (
      formData.contributionTitle &&
      formData.contributionDescription &&
      formData.recipientName &&
      formData.recipientAddress &&
      formData.justification
    )
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "analysis":
        return "bg-blue-100 text-blue-800"
      case "tutorial":
        return "bg-green-100 text-green-800"
      case "proposal":
        return "bg-purple-100 text-purple-800"
      case "comment":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/tipping"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tipping
            </Link>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">💰</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Create Tip Proposal
              </h1>
            </div>
            
            <p className="text-lg text-muted-foreground">
              Propose a community tip for a valuable contribution. Community members will vote on your proposal.
            </p>
          </div>

          {/* Allowlist Status */}
          <div className="mb-6">
            {currentUserAllowlisted ? (
              <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-green-800">You're authorized to create proposals</div>
                  <div className="text-sm text-green-600">
                    You can create tip proposals that will be voted on by the community
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <div className="font-medium text-red-800">Authorization required</div>
                  <div className="text-sm text-red-600">
                    Only allowlisted community members can create tip proposals
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Create Proposal Form */}
          <Card>
            <CardHeader>
              <CardTitle>Proposal Details</CardTitle>
              <CardDescription>
                Provide details about the contribution you'd like to nominate for a community tip.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contributionTitle">Contribution Title *</Label>
                    <Input
                      id="contributionTitle"
                      value={formData.contributionTitle}
                      onChange={(e) => setFormData({ ...formData, contributionTitle: e.target.value })}
                      placeholder="Brief title of the contribution"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contributionType">Type *</Label>
                    <select
                      id="contributionType"
                      value={formData.contributionType}
                      onChange={(e) => setFormData({ ...formData, contributionType: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      required
                    >
                      <option value="analysis">Analysis</option>
                      <option value="tutorial">Tutorial</option>
                      <option value="proposal">Proposal</option>
                      <option value="comment">Comment</option>
                    </select>
                  </div>
                </div>

                {/* Type Preview */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Selected type:</span>
                  <Badge className={getTypeColor(formData.contributionType)}>
                    {formData.contributionType}
                  </Badge>
                </div>

                {/* Contribution Description */}
                <div className="space-y-2">
                  <Label htmlFor="contributionDescription">Contribution Description *</Label>
                  <Textarea
                    id="contributionDescription"
                    value={formData.contributionDescription}
                    onChange={(e) => setFormData({ ...formData, contributionDescription: e.target.value })}
                    placeholder="Detailed description of what the contributor did..."
                    rows={4}
                    required
                  />
                </div>

                {/* Contribution URL */}
                <div className="space-y-2">
                  <Label htmlFor="contributionUrl">Contribution URL (Optional)</Label>
                  <div className="relative">
                    <Input
                      id="contributionUrl"
                      type="url"
                      value={formData.contributionUrl}
                      onChange={(e) => setFormData({ ...formData, contributionUrl: e.target.value })}
                      placeholder="Link to the contribution (forum post, GitHub, etc.)"
                      className="pr-10"
                    />
                    {formData.contributionUrl && (
                      <ExternalLink className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Recipient Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipientName">Recipient Name *</Label>
                    <Input
                      id="recipientName"
                      value={formData.recipientName}
                      onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                      placeholder="Username of the contributor"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientAddress">Recipient Address *</Label>
                    <Input
                      id="recipientAddress"
                      value={formData.recipientAddress}
                      onChange={(e) => setFormData({ ...formData, recipientAddress: e.target.value })}
                      placeholder="ckb1..."
                      required
                    />
                  </div>
                </div>

                {/* Justification */}
                <div className="space-y-2">
                  <Label htmlFor="justification">Justification *</Label>
                  <Textarea
                    id="justification"
                    value={formData.justification}
                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                    placeholder="Explain why this contribution deserves a community tip from the treasury..."
                    rows={4}
                    required
                  />
                </div>

                {/* Tip Information */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">💰</div>
                    <div>
                      <div className="font-medium text-blue-800 mb-1">Community Tip: 50 CKB</div>
                      <div className="text-sm text-blue-600">
                        This proposal will request 50 CKB from the community treasury if approved by 5 community members.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/tipping")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!isFormValid() || !currentUserAllowlisted || isSubmitting}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating Proposal...
                      </>
                    ) : (
                      "Create Proposal"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>How Tip Proposals Work</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-xs">
                    1
                  </div>
                  <div>
                    <div className="font-medium">Submit Your Proposal</div>
                    <div className="text-muted-foreground">
                      Create a detailed proposal explaining the contribution and why it deserves recognition.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-xs">
                    2
                  </div>
                  <div>
                    <div className="font-medium">Community Voting</div>
                    <div className="text-muted-foreground">
                      Community members review and vote on your proposal. 5 approvals are needed.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-xs">
                    3
                  </div>
                  <div>
                    <div className="font-medium">Automatic Tip Distribution</div>
                    <div className="text-muted-foreground">
                      Once approved, 50 CKB is automatically sent from the community treasury to the recipient.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-xs">
                    4
                  </div>
                  <div>
                    <div className="font-medium">Additional Tips</div>
                    <div className="text-muted-foreground">
                      Community members can add personal tips to any proposal, approved or not.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 