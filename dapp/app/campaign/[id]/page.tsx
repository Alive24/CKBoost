"use client"
import { useParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { QuestCard } from "@/components/quest-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Calendar, Users, Trophy, CheckCircle, Clock, Coins, ExternalLink, Edit, Plus, Settings, Shield, MessageCircle, FileText, Fingerprint, User, AlertTriangle } from "lucide-react"
import Link from "next/link"

// Mock current user - in real app, this would come from authentication
const CURRENT_USER = {
  id: 1,
  address: "0x1234...abcd",
  // In real app, this would be determined by checking if user created the campaign
  ownedCampaigns: [1, 2], // Campaign IDs owned by current user
  verificationStatus: {
    telegram: true,
    kyc: false,
    did: false,
    manualReview: false,
  }
}

// Type definitions
interface TokenReward {
  symbol: string
  amount: number
}

interface Subtask {
  id: number
  title: string
  type: string
  completed: boolean
  description: string
  proofRequired: string
}

interface Quest {
  id: number
  title: string
  description: string
  points: number
  difficulty: string
  timeEstimate: string
  icon: string
  completions: number
  rewards: {
    points: number
    tokens: TokenReward[]
  }
  subtasks: Subtask[]
}

interface Campaign {
  id: number
  title: string
  description: string
  sponsor: {
    name: string
    logo: string
    verified: boolean
    description: string
    website: string
    social: {
      twitter: string
      github: string
    }
  }
  status: string
  startDate: string
  endDate: string
  totalRewards: {
    points: number
    tokens: TokenReward[]
  }
  participants: number
  questsCount: number
  completedQuests: number
  category: string
  difficulty: string
  rules: string[]
  quests: Quest[]
  verificationRequirements: {
    telegram: boolean
    kyc: boolean
    did: boolean
    manualReview: boolean
    excludeManualReview?: boolean
  }
}

// Mock campaign data - in real app, this would come from API
const CAMPAIGN_DATA: Record<number, Campaign> = {
  1: {
    id: 1,
    title: "CKB Ecosystem Growth Initiative",
    description:
      "Help expand the CKB ecosystem through social engagement, development, and community building. This comprehensive campaign includes multiple quest types designed to onboard new users, increase developer adoption, and strengthen community bonds.",
    sponsor: {
      name: "Nervos Foundation",
      logo: "🏛️",
      verified: true,
      description: "The official foundation supporting the Nervos Network ecosystem",
      website: "https://nervos.org",
      social: {
        twitter: "@NervosNetwork",
        github: "nervosnetwork",
      },
    },
    status: "active",
    startDate: "2024-01-15",
    endDate: "2024-03-15",
    totalRewards: {
      points: 2500,
      tokens: [
        { symbol: "CKB", amount: 1000 },
        { symbol: "SPORE", amount: 500 },
      ],
    },
    participants: 156,
    questsCount: 6,
    completedQuests: 89,
    category: "Ecosystem",
    difficulty: "Mixed",
    rules: [
      "Complete quests in any order",
      "Each quest can only be completed once per participant",
      "Rewards are distributed weekly",
      "Campaign ends on March 15, 2024",
    ],
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: false,
      manualReview: false,
      excludeManualReview: false, // Basic campaign accepts all verification types
    },
    quests: [
      {
        id: 1,
        title: "Raid the CKB Announcement",
        description: "Like, retweet, and comment on the latest CKB announcement on X to help spread awareness",
        points: 50,
        difficulty: "Easy",
        timeEstimate: "2 mins",
        icon: "📢",
        completions: 45,
        rewards: {
          points: 50,
          tokens: [{ symbol: "CKB", amount: 10 }],
        },
        subtasks: [
          {
            id: 1,
            title: "Follow @NervosNetwork on X",
            type: "social",
            completed: false,
            description: "Follow the official Nervos Network account",
            proofRequired: "Screenshot of follow confirmation",
          },
          {
            id: 2,
            title: "Like the announcement post",
            type: "social",
            completed: false,
            description: "Like the latest CKB announcement post",
            proofRequired: "Link to the liked post",
          },
          {
            id: 3,
            title: "Retweet with comment",
            type: "social",
            completed: false,
            description: "Retweet with your own meaningful comment about CKB",
            proofRequired: "Link to your retweet",
          },
          {
            id: 4,
            title: "Tag 2 friends",
            type: "social",
            completed: false,
            description: "Tag 2 friends who might be interested in blockchain",
            proofRequired: "Screenshot showing tagged friends",
          },
        ],
      },
      {
        id: 2,
        title: "Deploy Smart Contract",
        description: "Deploy your first smart contract on the CKB testnet and verify its functionality",
        points: 300,
        difficulty: "Hard",
        timeEstimate: "45 mins",
        icon: "🚀",
        completions: 12,
        rewards: {
          points: 300,
          tokens: [
            { symbol: "CKB", amount: 100 },
            { symbol: "SPORE", amount: 50 },
          ],
        },
        subtasks: [
          {
            id: 1,
            title: "Set up development environment",
            type: "technical",
            completed: false,
            description: "Install and configure CKB development tools",
            proofRequired: "Screenshot of successful setup",
          },
          {
            id: 2,
            title: "Write smart contract code",
            type: "technical",
            completed: false,
            description: "Create a simple smart contract using CKB Script",
            proofRequired: "Code repository link",
          },
          {
            id: 3,
            title: "Deploy to testnet",
            type: "onchain",
            completed: false,
            description: "Deploy your contract to CKB testnet",
            proofRequired: "Transaction hash of deployment",
          },
          {
            id: 4,
            title: "Verify deployment",
            type: "onchain",
            completed: false,
            description: "Confirm contract is working correctly",
            proofRequired: "Screenshot of successful verification",
          },
        ],
      },
    ],
  },
  2: {
    id: 2,
    title: "DeFi Education Campaign",
    description:
      "Learn and teach about DeFi concepts on CKB through tutorials and content creation. This campaign requires KYC verification due to high-value rewards and regulatory compliance.",
    sponsor: {
      name: "DeFi Alliance",
      logo: "🏦",
      verified: true,
      description: "Leading DeFi education platform for CKB ecosystem",
      website: "https://defialliance.org",
      social: {
        twitter: "@CKBDeFi",
        github: "ckb-defi",
      },
    },
    status: "active",
    startDate: "2024-02-01",
    endDate: "2024-04-01",
    totalRewards: {
      points: 3500,
      tokens: [
        { symbol: "CKB", amount: 1500 },
        { symbol: "DEFI", amount: 750 },
      ],
    },
    participants: 89,
    questsCount: 4,
    completedQuests: 45,
    category: "Education",
    difficulty: "Advanced",
    rules: [
      "Must complete KYC verification before participating",
      "Educational content must be original and high-quality",
      "Plagiarism will result in disqualification",
      "Rewards distributed monthly",
    ],
    verificationRequirements: {
      telegram: false,
      kyc: true,
      did: false,
      manualReview: false,
      excludeManualReview: true, // High-value DeFi campaign excludes manual review
    },
    quests: [
      {
        id: 3,
        title: "Create DeFi Tutorial",
        description: "Create a comprehensive tutorial about DeFi concepts on CKB",
        points: 200,
        difficulty: "Medium",
        timeEstimate: "3 hours",
        icon: "📚",
        completions: 15,
        rewards: {
          points: 200,
          tokens: [{ symbol: "CKB", amount: 100 }],
        },
        subtasks: [
          {
            id: 1,
            title: "Research DeFi protocols",
            type: "research",
            completed: false,
            description: "Research existing DeFi protocols on CKB",
            proofRequired: "List of protocols with descriptions",
          },
          {
            id: 2,
            title: "Create tutorial content",
            type: "content",
            completed: false,
            description: "Write comprehensive tutorial",
            proofRequired: "Tutorial document or video",
          },
        ],
      },
    ],
  },
  3: {
    id: 3,
    title: "Community Builder Program",
    description:
      "Build and strengthen the CKB community through engagement and outreach. This campaign requires multiple verification methods for maximum security.",
    sponsor: {
      name: "CKB Community DAO",
      logo: "🤝",
      verified: true,
      description: "Decentralized community building organization",
      website: "https://ckbcommunity.org",
      social: {
        twitter: "@CKBCommunity",
        github: "ckb-community",
      },
    },
    status: "active",
    startDate: "2024-01-01",
    endDate: "2024-06-01",
    totalRewards: {
      points: 4000,
      tokens: [
        { symbol: "CKB", amount: 2000 },
        { symbol: "COMM", amount: 1000 },
      ],
    },
    participants: 234,
    questsCount: 8,
    completedQuests: 120,
    category: "Community",
    difficulty: "Mixed",
    rules: [
      "Must complete Telegram and DID verification",
      "Community engagement must be genuine and helpful",
      "Spam or bot-like behavior will result in disqualification",
      "Manual review required for high-value rewards",
    ],
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: true,
      manualReview: true,
      excludeManualReview: false, // Community campaign accepts manual review
    },
    quests: [
      {
        id: 4,
        title: "Community Engagement Challenge",
        description: "Engage with community members and help newcomers",
        points: 150,
        difficulty: "Easy",
        timeEstimate: "2 hours",
        icon: "💬",
        completions: 50,
        rewards: {
          points: 150,
          tokens: [{ symbol: "COMM", amount: 50 }],
        },
        subtasks: [
          {
            id: 1,
            title: "Help newcomers",
            type: "community",
            completed: false,
            description: "Provide helpful answers to newcomer questions",
            proofRequired: "Screenshots of helpful interactions",
          },
        ],
      },
    ],
  },
}

// Helper function to check if user meets verification requirements based on new logic
const meetsVerificationRequirements = (requirements: any) => {
  if (!requirements) return true
  
  // Check if campaign refuses manual review
  const refusesManualReview = requirements.excludeManualReview || false
  
  // If user has KYC or DID, they meet identity verification requirements
  if (CURRENT_USER.verificationStatus.kyc || CURRENT_USER.verificationStatus.did) {
    // Check if they have all non-identity requirements (telegram if required)
    if (requirements.telegram && !CURRENT_USER.verificationStatus.telegram) {
      return false
    }
    return true // KYC/DID satisfies identity verification
  }
  
  // If no KYC/DID, check other requirements
  if (requirements.telegram && !CURRENT_USER.verificationStatus.telegram) {
    return false
  }
  
  if (requirements.manualReview && !refusesManualReview && !CURRENT_USER.verificationStatus.manualReview) {
    return false
  }
  
  return true
}

export default function CampaignDetail() {
  const params = useParams()
  const campaignId = Number.parseInt(params.id as string)
  const campaign = CAMPAIGN_DATA[campaignId]
  
  // Check if current user owns this campaign
  const isOwner = CURRENT_USER.ownedCampaigns.includes(campaignId)

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❓</div>
            <h1 className="text-2xl font-bold mb-2">Campaign Not Found</h1>
            <p className="text-muted-foreground mb-4">The campaign you're looking for doesn't exist.</p>
            <Link href="/">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Campaigns
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const isActive = campaign.status === "active"
  const progressPercentage = (campaign.completedQuests / (campaign.questsCount * campaign.participants)) * 100

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  const getDaysRemaining = () => {
    if (!isActive) return null
    const endDate = new Date(campaign.endDate)
    const today = new Date()
    const diffTime = endDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const daysRemaining = getDaysRemaining()

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Link href="/">
              <Button variant="ghost" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Campaigns
              </Button>
            </Link>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Campaign Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="text-4xl">{campaign.sponsor.logo}</div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h1 className="text-3xl font-bold">{campaign.title}</h1>
                          {campaign.sponsor.verified && <CheckCircle className="w-5 h-5 text-blue-500 fill-current" />}
                          {isOwner && (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800">
                              👑 Campaign Owner
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground mb-3">
                          Sponsored by <span className="font-medium">{campaign.sponsor.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                          <Badge variant={isActive ? "default" : "secondary"}>
                            {isActive ? "🔥 Active Campaign" : "📚 Ended Campaign"}
                          </Badge>
                          <Badge variant="outline">{campaign.category}</Badge>
                          <Badge variant="outline">{campaign.difficulty}</Badge>
                        </div>
                        {isOwner && (
                          <div className="flex items-center gap-2">
                            <Link href={`/campaign/${campaignId}/create-quest`}>
                              <Button size="sm" className="flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                Add Quest
                              </Button>
                            </Link>
                            <Button variant="outline" size="sm" className="flex items-center gap-2">
                              <Edit className="w-4 h-4" />
                              Edit Campaign
                            </Button>
                            <Link href="/admin">
                              <Button variant="outline" size="sm" className="flex items-center gap-2">
                                <Settings className="w-4 h-4" />
                                Manage
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-yellow-600 font-bold text-2xl mb-2">
                        <Trophy className="w-6 h-6" />
                        {campaign.totalRewards.points.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">total points</div>
                      <div className="space-y-1">
                        {campaign.totalRewards.tokens.map((token: TokenReward, index: number) => (
                          <div key={index} className="flex items-center gap-1 text-green-600 font-semibold">
                            <Coins className="w-4 h-4" />
                            {token.amount} {token.symbol}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-lg text-muted-foreground leading-relaxed">{campaign.description}</p>
                </CardContent>
              </Card>

              {/* Campaign Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5" />
                    Campaign Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{campaign.participants}</div>
                      <div className="text-sm text-muted-foreground">Participants</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{campaign.completedQuests}</div>
                      <div className="text-sm text-muted-foreground">Completions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{campaign.questsCount}</div>
                      <div className="text-sm text-muted-foreground">Total Quests</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Overall Progress</span>
                      <span className="font-medium">{progressPercentage.toFixed(1)}%</span>
                    </div>
                    <Progress value={progressPercentage} className="h-3" />
                  </div>
                </CardContent>
              </Card>

              {/* Verification Requirements */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Identity Verification Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Complete the following verification steps to participate in this campaign and receive rewards:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Telegram Verification */}
                    {campaign.verificationRequirements.telegram && (
                      <div className="flex items-center gap-3 p-3 border rounded-lg">
                        <MessageCircle className="w-5 h-5 text-blue-600" />
                        <div className="flex-1">
                          <div className="font-medium">Telegram Verification</div>
                          <div className="text-sm text-muted-foreground">Link your Telegram account</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {CURRENT_USER.verificationStatus.telegram ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <Badge className="bg-red-100 text-red-800">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Required
                              </Badge>
                              <Link href="/verify">
                                <Button size="sm" variant="outline" className="text-xs">
                                  Verify Now
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* KYC Verification */}
                    {campaign.verificationRequirements.kyc && (
                      <div className="flex items-center gap-3 p-3 border rounded-lg">
                        <FileText className="w-5 h-5 text-purple-600" />
                        <div className="flex-1">
                          <div className="font-medium">KYC Verification</div>
                          <div className="text-sm text-muted-foreground">Complete identity verification</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {CURRENT_USER.verificationStatus.kyc ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <Badge className="bg-red-100 text-red-800">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Required
                              </Badge>
                              <Link href="/verify">
                                <Button size="sm" variant="outline" className="text-xs">
                                  Verify Now
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DID Verification */}
                    {campaign.verificationRequirements.did && (
                      <div className="flex items-center gap-3 p-3 border rounded-lg">
                        <Fingerprint className="w-5 h-5 text-indigo-600" />
                        <div className="flex-1">
                          <div className="font-medium">DID Verification</div>
                          <div className="text-sm text-muted-foreground">Decentralized identity verification</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {CURRENT_USER.verificationStatus.did ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <Badge className="bg-red-100 text-red-800">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Required
                              </Badge>
                              <Link href="/verify">
                                <Button size="sm" variant="outline" className="text-xs">
                                  Verify Now
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Manual Review */}
                    {campaign.verificationRequirements.manualReview && (
                      <div className="flex items-center gap-3 p-3 border rounded-lg">
                        <User className="w-5 h-5 text-orange-600" />
                        <div className="flex-1">
                          <div className="font-medium">Manual Review</div>
                          <div className="text-sm text-muted-foreground">Human verification review</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {CURRENT_USER.verificationStatus.manualReview ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <Badge className="bg-red-100 text-red-800">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Required
                              </Badge>
                              <Link href="/verify">
                                <Button size="sm" variant="outline" className="text-xs">
                                  Apply Now
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* No verification required */}
                  {!campaign.verificationRequirements.telegram && 
                   !campaign.verificationRequirements.kyc && 
                   !campaign.verificationRequirements.did && 
                   !campaign.verificationRequirements.manualReview && (
                    <div className="text-center py-4">
                      <div className="text-green-600 mb-2">
                        <CheckCircle className="w-8 h-8 mx-auto" />
                      </div>
                      <div className="font-medium text-green-800">No Verification Required</div>
                      <div className="text-sm text-muted-foreground">
                        This campaign is open to all users without identity verification
                      </div>
                    </div>
                  )}

                  {/* Verification Status Summary */}
                  {(campaign.verificationRequirements.telegram || 
                    campaign.verificationRequirements.kyc || 
                    campaign.verificationRequirements.did || 
                    campaign.verificationRequirements.manualReview) && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-gray-600" />
                        <span className="font-medium text-gray-800">Verification Status</span>
                      </div>
                      {(() => {
                        const isEligible = meetsVerificationRequirements(campaign.verificationRequirements)
                        
                        return (
                          <div className="text-sm space-y-2">
                            {isEligible ? (
                              <div className="text-green-800">
                                ✅ You meet all verification requirements and can participate in this campaign
                              </div>
                            ) : (
                              <div className="text-red-800">
                                ⚠️ You need to complete the required verifications to participate
                              </div>
                            )}
                            
                            {/* Verification Logic Explanation */}
                            {(campaign.verificationRequirements.kyc || campaign.verificationRequirements.did) && (
                              <div className="text-blue-700 bg-blue-50 p-2 rounded text-xs">
                                💡 Having either KYC or DID verification satisfies identity requirements
                              </div>
                            )}
                            
                            {campaign.verificationRequirements.excludeManualReview && (
                              <div className="text-orange-700 bg-orange-50 p-2 rounded text-xs">
                                ⚠️ This campaign excludes manual review - KYC or DID verification is preferred
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Campaign Rules */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Campaign Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {campaign.rules.map((rule: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Quests */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <span>🎯</span> Campaign Quests
                </h2>
                {campaign.quests.map((quest: Quest) => (
                  <QuestCard key={quest.id} quest={quest} campaignId={campaign.id} />
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Campaign Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Start Date</div>
                    <div className="font-semibold">{formatDate(campaign.startDate)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">End Date</div>
                    <div className="font-semibold">{formatDate(campaign.endDate)}</div>
                  </div>
                  {isActive && daysRemaining !== null && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 text-green-800">
                        <Clock className="w-4 h-4" />
                        <span className="font-semibold">{daysRemaining} days remaining</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sponsor Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Sponsor
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{campaign.sponsor.logo}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{campaign.sponsor.name}</div>
                        {campaign.sponsor.verified && <CheckCircle className="w-4 h-4 text-blue-500 fill-current" />}
                      </div>
                      <div className="text-sm text-muted-foreground">{campaign.sponsor.description}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <a
                      href={campaign.sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {campaign.sponsor.website}
                    </a>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>🐦</span>
                      {campaign.sponsor.social.twitter}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>💻</span>
                      {campaign.sponsor.social.github}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Participants */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Participants</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { user: "CKBMaster", completions: 3, time: "2h ago" },
                      { user: "BlockchainDev", completions: 2, time: "4h ago" },
                      { user: "CryptoNinja", completions: 1, time: "6h ago" },
                      { user: "DeFiExplorer", completions: 4, time: "8h ago" },
                    ].map((participant, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-gradient-to-br from-purple-200 to-blue-200 text-sm">
                            {participant.user.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{participant.user}</div>
                          <div className="text-xs text-muted-foreground">
                            {participant.completions} quest{participant.completions !== 1 ? "s" : ""} •{" "}
                            {participant.time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
