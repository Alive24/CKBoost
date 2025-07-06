"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Calendar, Users, Trophy, Coins, Clock, Shield, MessageCircle, FileText, Fingerprint, User, CheckCircle, AlertTriangle } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

interface Campaign {
  id: number
  title: string
  description: string
  sponsor: string
  totalRewards: {
    points: number
    tokens: Array<{ symbol: string; amount: number }>
  }
  participants: number
  questsCount: number
  questsCompleted: number
  endDate: string
  status: string
  difficulty: string
  categories: string[]
  image: string
  verificationRequirements?: {
    telegram: boolean
    kyc: boolean
    did: boolean
    manualReview: boolean
    excludeManualReview?: boolean
  }
}

interface CampaignCardProps {
  campaign: Campaign
}

// Mock current user verification status - in real app, this would come from authentication
const CURRENT_USER_VERIFICATION = {
  telegram: true,
  kyc: false,
  did: false,
  manualReview: false,
}

// Helper function to check if user meets verification requirements based on new logic
const meetsVerificationRequirements = (requirements: any) => {
  if (!requirements) return true
  
  // Check if campaign refuses manual review
  const refusesManualReview = requirements.excludeManualReview || false
  
  // If user has KYC or DID, they meet identity verification requirements
  if (CURRENT_USER_VERIFICATION.kyc || CURRENT_USER_VERIFICATION.did) {
    // Check if they have all non-identity requirements (telegram if required)
    if (requirements.telegram && !CURRENT_USER_VERIFICATION.telegram) {
      return false
    }
    return true // KYC/DID satisfies identity verification
  }
  
  // If no KYC/DID, check other requirements
  if (requirements.telegram && !CURRENT_USER_VERIFICATION.telegram) {
    return false
  }
  
  if (requirements.manualReview && !refusesManualReview && !CURRENT_USER_VERIFICATION.manualReview) {
    return false
  }
  
  return true
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case "beginner":
      case "easy":
        return "bg-green-100 text-green-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-800"
      case "upcoming":
        return "bg-blue-100 text-blue-800"
      case "completed":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getDaysUntilEnd = (endDate: string) => {
    const end = new Date(endDate)
    const now = new Date()
    const diffTime = end.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const getProgressPercentage = () => {
    return campaign.questsCount > 0 ? (campaign.questsCompleted / campaign.questsCount) * 100 : 0
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative h-48 bg-gradient-to-r from-purple-100 to-blue-100">
        <Image src={campaign.image || "/placeholder.svg"} alt={campaign.title} fill className="object-cover" />
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
          <Badge className={getDifficultyColor(campaign.difficulty)}>{campaign.difficulty}</Badge>
        </div>
        <div className="absolute top-4 right-4">
          <Badge variant="outline" className="bg-white/90">
            <Clock className="w-3 h-3 mr-1" />
            {getDaysUntilEnd(campaign.endDate)}d left
          </Badge>
        </div>
      </div>

      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{campaign.title}</CardTitle>
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{campaign.description}</p>
            <div className="text-xs text-muted-foreground">Sponsored by {campaign.sponsor}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Categories */}
        <div className="flex flex-wrap gap-1">
          {campaign.categories.slice(0, 3).map((category) => (
            <Badge key={category} variant="outline" className="text-xs">
              {category}
            </Badge>
          ))}
          {campaign.categories.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{campaign.categories.length - 3}
            </Badge>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Quest Progress</span>
            <span>
              {campaign.questsCompleted}/{campaign.questsCount} completed
            </span>
          </div>
          <Progress value={getProgressPercentage()} className="h-2" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span>{campaign.participants} participants</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-600" />
            <span>Ends {new Date(campaign.endDate).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Rewards */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Trophy className="w-4 h-4 text-yellow-600" />
            <span>Total Rewards</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Trophy className="w-3 h-3 text-yellow-600" />
              <span>{campaign.totalRewards.points.toLocaleString()} pts</span>
            </div>
            {campaign.totalRewards.tokens.map((token, index) => (
              <div key={index} className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-green-600" />
                <span>
                  {token.amount} {token.symbol}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Verification Requirements */}
        {campaign.verificationRequirements && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>Verification Required</span>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {campaign.verificationRequirements.telegram && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs">
                    <MessageCircle className="w-3 h-3 text-blue-600" />
                    <span>Telegram</span>
                    {CURRENT_USER_VERIFICATION.telegram ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-red-600" />
                    )}
                  </div>
                )}
                {/* Identity Verification - KYC OR DID */}
                {(campaign.verificationRequirements.kyc || campaign.verificationRequirements.did) && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs">
                    <FileText className="w-3 h-3 text-purple-600" />
                    <span>Identity (KYC or DID)</span>
                    {(CURRENT_USER_VERIFICATION.kyc || CURRENT_USER_VERIFICATION.did) ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-red-600" />
                    )}
                  </div>
                )}
                {/* Manual Review - only if KYC/DID not available and not excluded */}
                {campaign.verificationRequirements.manualReview && 
                 !campaign.verificationRequirements.kyc && 
                 !campaign.verificationRequirements.did && 
                 !campaign.verificationRequirements.excludeManualReview && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs">
                    <User className="w-3 h-3 text-orange-600" />
                    <span>Manual Review</span>
                    {CURRENT_USER_VERIFICATION.manualReview ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-red-600" />
                    )}
                  </div>
                )}
              </div>
              
              {/* Verification Status */}
              {(() => {
                const isEligible = meetsVerificationRequirements(campaign.verificationRequirements)
                
                if (!isEligible) {
                  return (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      ⚠️ Complete required verifications to participate
                    </div>
                  )
                } else {
                  return (
                    <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                      ✅ You meet all verification requirements
                    </div>
                  )
                }
              })()}
              
              {/* Verification Logic Explanation */}
              {(campaign.verificationRequirements.kyc || campaign.verificationRequirements.did) && (
                <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  💡 Having either KYC or DID verification satisfies identity requirements
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <Link href={`/campaign/${campaign.id}`} className="block">
          <Button className="w-full">View Campaign</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
