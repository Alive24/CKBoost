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
  Twitter,
  MessageSquare,
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
    id: "twitter",
    name: "X (Twitter) Binding",
    description: "Connect your X (Twitter) account to your wallet",
    icon: Twitter,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active X (Twitter) account"],
    status: "available",
  },
  {
    id: "discord",
    name: "Discord Binding",
    description: "Connect your Discord account to your wallet",
    icon: MessageSquare,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active Discord account"],
    status: "available",
  },
  {
    id: "reddit",
    name: "Reddit Binding",
    description: "Connect your Reddit account to your wallet",
    icon: MessageCircle,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active Reddit account"],
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
  const [twitterUsername, setTwitterUsername] = useState("")
  const [discordUsername, setDiscordUsername] = useState("")
  const [redditUsername, setRedditUsername] = useState("")
  const [manualApplication, setManualApplication] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [justCompleted, setJustCompleted] = useState<string | null>(null)
  const [currentUserStatus, setCurrentUserStatus] = useState({
    telegram: true,
    twitter: false,
    discord: false,
    reddit: false,
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

  const handleTwitterVerification = async () => {
    setIsSubmitting(true)
    // Keep the card selected during the process
    setSelectedMethod("twitter")
    
    // Simulate OAuth flow and transaction signing
    await new Promise((resolve) => setTimeout(resolve, 3000))
    
    // Simulate successful binding
    setCurrentUserStatus(prev => ({ ...prev, twitter: true }))
    setJustCompleted("twitter")
    setIsSubmitting(false)
    
    // Keep the card selected to show success message
    // Auto-hide success message after 5 seconds
    setTimeout(() => {
      setJustCompleted(null)
      setSelectedMethod(null) // Clear selection after success message fades
    }, 5000)
  }

  const handleDiscordVerification = async () => {
    setIsSubmitting(true)
    // Keep the card selected during the process
    setSelectedMethod("discord")
    
    // Simulate OAuth flow and transaction signing
    await new Promise((resolve) => setTimeout(resolve, 3000))
    
    // Simulate successful binding
    setCurrentUserStatus(prev => ({ ...prev, discord: true }))
    setJustCompleted("discord")
    setIsSubmitting(false)
    
    // Keep the card selected to show success message
    // Auto-hide success message after 5 seconds
    setTimeout(() => {
      setJustCompleted(null)
      setSelectedMethod(null) // Clear selection after success message fades
    }, 5000)
  }

  const handleRedditVerification = async () => {
    setIsSubmitting(true)
    // Keep the card selected during the process
    setSelectedMethod("reddit")
    
    // Simulate OAuth flow and transaction signing
    await new Promise((resolve) => setTimeout(resolve, 3000))
    
    // Simulate successful binding
    setCurrentUserStatus(prev => ({ ...prev, reddit: true }))
    setJustCompleted("reddit")
    setIsSubmitting(false)
    
    // Keep the card selected to show success message
    // Auto-hide success message after 5 seconds
    setTimeout(() => {
      setJustCompleted(null)
      setSelectedMethod(null) // Clear selection after success message fades
    }, 5000)
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
        return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100"
      case "coming_soon":
        return "bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🛡️</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Identity Verification and Bindings
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

          {/* Verification Methods - Split into two groups */}
          <div className="space-y-8 mb-8">
            {/* Identity Verification Section */}
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Shield className="w-6 h-6 text-purple-600" />
                Identity Verification
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {VERIFICATION_METHODS.filter(method => ["telegram", "kyc", "did", "manual"].includes(method.id)).map((method) => {
                  const Icon = method.icon
                  const isSelected = selectedMethod === method.id || (isSubmitting && selectedMethod === method.id) || justCompleted === method.id
                  const isDisabled = method.status === "coming_soon"
                  const isCompleted = currentUserStatus[method.id as keyof typeof currentUserStatus]

                  return (
                    <Card
                      key={method.id}
                      className={`cursor-pointer transition-all ${
                        isCompleted 
                          ? (() => {
                              switch (method.id) {
                                case "telegram":
                                  return "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                case "kyc":
                                  return "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20"
                                case "did":
                                  return "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                                case "manual":
                                  return "ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/20"
                                default:
                                  return "ring-2 ring-green-500 bg-green-50 dark:bg-green-900/20"
                              }
                            })()
                          : isSelected 
                            ? (() => {
                                switch (method.id) {
                                  case "telegram":
                                    return "ring-2 ring-blue-500 border-blue-300"
                                  case "kyc":
                                    return "ring-2 ring-purple-500 border-purple-300"
                                  case "did":
                                    return "ring-2 ring-indigo-500 border-indigo-300"
                                  case "manual":
                                    return "ring-2 ring-orange-500 border-orange-300"
                                  default:
                                    return "ring-2 ring-purple-500 border-purple-300"
                                }
                              })()
                            : "hover:shadow-md"
                      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => !isDisabled && !isCompleted && !isSubmitting && justCompleted !== method.id && setSelectedMethod(isSelected ? null : method.id)}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5" />
                            {method.name}
                            {isCompleted && <CheckCircle className={`w-4 h-4 ${(() => {
                              switch (method.id) {
                                case "telegram":
                                  return "text-blue-600"
                                case "kyc":
                                  return "text-purple-600"
                                case "did":
                                  return "text-indigo-600"
                                case "manual":
                                  return "text-orange-600"
                                default:
                                  return "text-green-600"
                              }
                            })()}`} />}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getDifficultyColor(method.difficulty)}>{method.difficulty}</Badge>
                            {isCompleted ? (
                              <Badge className={(() => {
                                switch (method.id) {
                                  case "telegram":
                                    return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100"
                                  case "kyc":
                                    return "bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100"
                                  case "did":
                                    return "bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100"
                                  case "manual":
                                    return "bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100"
                                  default:
                                    return "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
                                }
                              })()}>
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
                        {/* Show completion message immediately after binding */}
                        {justCompleted === method.id && (
                          <div className="space-y-4 pt-4 border-t">
                            <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <AlertDescription className="text-green-800 dark:text-green-200">
                                ✅ {method.name} completed successfully! This verification is now active.
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
            </div>

            {/* Social Media Bindings Section */}
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-blue-600" />
                Social Media Bindings
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {VERIFICATION_METHODS.filter(method => ["twitter", "discord", "reddit"].includes(method.id)).map((method) => {
                  const Icon = method.icon
                  const isSelected = selectedMethod === method.id || (isSubmitting && selectedMethod === method.id) || justCompleted === method.id
                  const isDisabled = method.status === "coming_soon"
                  const isCompleted = currentUserStatus[method.id as keyof typeof currentUserStatus]

                  return (
                    <Card
                      key={method.id}
                      className={`cursor-pointer transition-all ${
                        isCompleted 
                          ? (() => {
                              switch (method.id) {
                                case "twitter":
                                  return "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                case "discord":
                                  return "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                                case "reddit":
                                  return "ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/20"
                                default:
                                  return "ring-2 ring-green-500 bg-green-50 dark:bg-green-900/20"
                              }
                            })()
                          : isSelected 
                            ? (() => {
                                switch (method.id) {
                                  case "twitter":
                                    return "ring-2 ring-blue-500 border-blue-300"
                                  case "discord":
                                    return "ring-2 ring-indigo-500 border-indigo-300"
                                  case "reddit":
                                    return "ring-2 ring-orange-500 border-orange-300"
                                  default:
                                    return "ring-2 ring-blue-500 border-blue-300"
                                }
                              })()
                            : "hover:shadow-md"
                      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => !isDisabled && !isCompleted && !isSubmitting && justCompleted !== method.id && setSelectedMethod(isSelected ? null : method.id)}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5" />
                            {method.name}
                            {isCompleted && <CheckCircle className={`w-4 h-4 ${(() => {
                              switch (method.id) {
                                case "twitter":
                                  return "text-blue-600"
                                case "discord":
                                  return "text-indigo-600"
                                case "reddit":
                                  return "text-orange-600"
                                default:
                                  return "text-green-600"
                              }
                            })()}`} />}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getDifficultyColor(method.difficulty)}>{method.difficulty}</Badge>
                            {isCompleted ? (
                              <Badge className={(() => {
                                switch (method.id) {
                                  case "twitter":
                                    return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100"
                                  case "discord":
                                    return "bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100"
                                  case "reddit":
                                    return "bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100"
                                  default:
                                    return "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
                                }
                              })()}>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Bound
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
                        {/* Show completion message immediately after binding */}
                        {justCompleted === method.id && (
                          <div className="space-y-4 pt-4 border-t">
                            <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <AlertDescription className="text-green-800 dark:text-green-200">
                                ✅ {method.name} completed successfully! This binding is now active.
                              </AlertDescription>
                            </Alert>
                          </div>
                        )}

                        {isSelected && !isCompleted && method.id === "twitter" && (
                          <div className="space-y-4 pt-4 border-t">
                            <Alert>
                              <Twitter className="h-4 w-4" />
                              <AlertDescription>
                                You'll be redirected to sign in to X (Twitter), then return here to sign a transaction that connects your account to your wallet.
                              </AlertDescription>
                            </Alert>
                            <Button
                              onClick={handleTwitterVerification}
                              disabled={isSubmitting}
                              className="w-full"
                            >
                              {isSubmitting ? "Connecting..." : "Connect X (Twitter) Account"}
                              <ExternalLink className="w-4 h-4 ml-2" />
                            </Button>
                          </div>
                        )}

                        {isSelected && !isCompleted && method.id === "discord" && (
                          <div className="space-y-4 pt-4 border-t">
                            <Alert>
                              <MessageSquare className="h-4 w-4" />
                              <AlertDescription>
                                You'll be redirected to sign in to Discord, then return here to sign a transaction that connects your account to your wallet.
                              </AlertDescription>
                            </Alert>
                            <Button
                              onClick={handleDiscordVerification}
                              disabled={isSubmitting}
                              className="w-full"
                            >
                              {isSubmitting ? "Connecting..." : "Connect Discord Account"}
                              <ExternalLink className="w-4 h-4 ml-2" />
                            </Button>
                          </div>
                        )}

                        {isSelected && !isCompleted && method.id === "reddit" && (
                          <div className="space-y-4 pt-4 border-t">
                            <Alert>
                              <MessageCircle className="h-4 w-4" />
                              <AlertDescription>
                                You'll be redirected to sign in to Reddit, then return here to sign a transaction that connects your account to your wallet.
                              </AlertDescription>
                            </Alert>
                            <Button
                              onClick={handleRedditVerification}
                              disabled={isSubmitting}
                              className="w-full"
                            >
                              {isSubmitting ? "Connecting..." : "Connect Reddit Account"}
                              <ExternalLink className="w-4 h-4 ml-2" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
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
