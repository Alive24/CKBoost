"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Shield,
  CheckCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageCircle,
  FileText,
  User,
  Fingerprint,
} from "lucide-react"

const VERIFICATION_METHODS = [
  {
    id: "telegram",
    name: "Telegram Verification",
    description: "Link your Telegram account for identity verification",
    icon: MessageCircle,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active Telegram account", "Join verification bot"],
    status: "available",
  },
  {
    id: "kyc",
    name: "KYC Verification",
    description: "Complete Know Your Customer verification with ID documents",
    icon: FileText,
    difficulty: "Medium",
    timeEstimate: "10-30 minutes",
    requirements: ["Government-issued ID", "Proof of address", "Selfie verification"],
    status: "available",
  },
  {
    id: "did",
    name: "DID Verification",
    description: "Use Decentralized Identity for privacy-preserving verification",
    icon: Fingerprint,
    difficulty: "Advanced",
    timeEstimate: "5-15 minutes",
    requirements: ["DID wallet", "Verifiable credentials", "Technical knowledge"],
    status: "coming_soon",
  },
  {
    id: "manual",
    name: "Manual Review",
    description: "Submit application for human verification review",
    icon: User,
    difficulty: "Variable",
    timeEstimate: "1-3 days",
    requirements: ["Detailed application", "Supporting evidence", "Admin review"],
    status: "available",
  },
]

export default function VerifyIdentity() {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  const [telegramUsername, setTelegramUsername] = useState("")
  const [manualApplication, setManualApplication] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentUserStatus] = useState({
    telegram: true,
    kyc: false,
    did: false,
    manualReview: false,
  })

  const handleTelegramVerification = async () => {
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsSubmitting(false)
    // In real app, would redirect to Telegram bot
    window.open(`https://t.me/ckboost_verify_bot?start=${telegramUsername}`, "_blank")
  }

  const handleManualSubmission = async () => {
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsSubmitting(false)
    console.log("Manual verification submitted:", manualApplication)
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-100 text-green-800"
      case "Medium":
        return "bg-yellow-100 text-yellow-800"
      case "Advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-blue-100 text-blue-800"
      case "coming_soon":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🛡️</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Identity Verification
              </h1>
            </div>
            <p className="text-lg text-muted-foreground mb-6">
              Verify your identity to prevent sybil attacks and ensure fair reward distribution
            </p>

            {/* Current Status */}
            {(() => {
              const verificationCount = Object.values(currentUserStatus).filter(Boolean).length
              const totalVerifications = Object.values(currentUserStatus).length
              
              if (verificationCount === totalVerifications) {
                return (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      All identity verifications complete! You can participate in all quests and campaigns.
                    </AlertDescription>
                  </Alert>
                )
              } else if (verificationCount > 0) {
                return (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      You have completed {verificationCount} of {totalVerifications} verification methods. Complete more to access additional campaigns.
                    </AlertDescription>
                  </Alert>
                )
              } else {
                return (
                  <Alert className="bg-blue-50 border-blue-200">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      Complete identity verification to access all platform features and prevent reward farming.
                    </AlertDescription>
                  </Alert>
                )
              }
            })()}
          </div>

          {/* Why Verification Matters */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                Why Identity Verification Matters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Prevents Sybil Attacks</h4>
                  <p className="text-sm text-muted-foreground">
                    Stops users from creating multiple accounts to farm rewards unfairly
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Fair Reward Distribution</h4>
                  <p className="text-sm text-muted-foreground">
                    Ensures legitimate users get their fair share of quest rewards
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Community Trust</h4>
                  <p className="text-sm text-muted-foreground">
                    Builds confidence in the platform's integrity and fairness
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Enhanced Features</h4>
                  <p className="text-sm text-muted-foreground">Access to higher-value quests and exclusive campaigns</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Verification Methods */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {VERIFICATION_METHODS.map((method) => {
              const Icon = method.icon
              const isSelected = selectedMethod === method.id
              const isDisabled = method.status === "coming_soon"
              const isCompleted = currentUserStatus[method.id as keyof typeof currentUserStatus]

              return (
                <Card
                  key={method.id}
                  className={`cursor-pointer transition-all ${
                    isSelected ? "ring-2 ring-purple-500 bg-purple-50" : "hover:shadow-md"
                  } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""} ${
                    isCompleted ? "ring-2 ring-green-500 bg-green-50" : ""
                  }`}
                  onClick={() => !isDisabled && !isCompleted && setSelectedMethod(isSelected ? null : method.id)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        {method.name}
                        {isCompleted && <CheckCircle className="w-4 h-4 text-green-600" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getDifficultyColor(method.difficulty)}>{method.difficulty}</Badge>
                        {isCompleted ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge className={getStatusColor(method.status)}>
                            {method.status === "coming_soon" ? "Coming Soon" : "Available"}
                          </Badge>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{method.description}</p>

                    <div className="text-sm">
                      <div className="font-medium mb-1">Time Estimate: {method.timeEstimate}</div>
                      <div className="font-medium mb-2">Requirements:</div>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {method.requirements.map((req, index) => (
                          <li key={index}>{req}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Method-specific forms */}
                    {isCompleted && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert className="bg-green-50 border-green-200">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-800">
                            ✅ {method.name} completed successfully! This verification is active.
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                    
                    {isSelected && !isCompleted && method.id === "telegram" && (
                      <div className="space-y-4 pt-4 border-t">
                        <div>
                          <Label htmlFor="telegram">Telegram Username</Label>
                          <Input
                            id="telegram"
                            placeholder="@yourusername"
                            value={telegramUsername}
                            onChange={(e) => setTelegramUsername(e.target.value)}
                          />
                        </div>
                        <Button
                          onClick={handleTelegramVerification}
                          disabled={!telegramUsername || isSubmitting}
                          className="w-full"
                        >
                          {isSubmitting ? "Connecting..." : "Start Telegram Verification"}
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    )}

                    {isSelected && !isCompleted && method.id === "kyc" && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert>
                          <FileText className="h-4 w-4" />
                          <AlertDescription>
                            KYC verification will redirect you to our secure partner for document verification.
                          </AlertDescription>
                        </Alert>
                        <Button className="w-full">
                          Start KYC Verification
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    )}

                    {isSelected && !isCompleted && method.id === "manual" && (
                      <div className="space-y-4 pt-4 border-t">
                        <div>
                          <Label htmlFor="application">Verification Application</Label>
                          <Textarea
                            id="application"
                            placeholder="Please explain why you should be verified. Include any relevant information about your identity, social media profiles, or community involvement..."
                            value={manualApplication}
                            onChange={(e) => setManualApplication(e.target.value)}
                            rows={4}
                          />
                        </div>
                        <Button
                          onClick={handleManualSubmission}
                          disabled={!manualApplication.trim() || isSubmitting}
                          className="w-full"
                        >
                          {isSubmitting ? "Submitting..." : "Submit for Manual Review"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle>Verification Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Privacy Protection</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Your verification data is encrypted and secure</li>
                    <li>• We only store necessary verification status</li>
                    <li>• Personal documents are processed by trusted partners</li>
                    <li>• You can request data deletion at any time</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Verification Benefits</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Access to all quest types and campaigns</li>
                    <li>• Higher reward multipliers for verified users</li>
                    <li>• Priority in limited-slot campaigns</li>
                    <li>• Verified badge on leaderboards</li>
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Need Help?</h4>
                <p className="text-sm text-muted-foreground">
                  If you have questions about the verification process or encounter any issues, please contact our
                  support team or join our community Discord for assistance.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
