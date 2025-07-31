"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Calendar, Users, Trophy, Coins, Clock, Shield, MessageCircle, FileText, Fingerprint, User, CheckCircle, AlertTriangle, X, MessageSquare } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

import { Campaign, getDaysUntilEnd } from "@/lib"

interface CampaignCardProps {
  campaign: Campaign
  onCategoryClick?: (category: string) => void
  onDifficultyClick?: (difficulty: string) => void
  onStatusClick?: (status: string) => void
  selectedCategories?: string[]
  selectedDifficulties?: string[]
  selectedStatuses?: string[]
}

// Mock current user verification status - in real app, this would come from authentication
const CURRENT_USER_VERIFICATION = {
  telegram: true,
  kyc: false,
  did: false,
  manualReview: false,
  twitter: false,
  discord: true,
  reddit: false,
}

// Helper function to check if user meets verification requirements based on new logic
const meetsVerificationRequirements = (requirements: any) => {
  if (!requirements) return true
  
  // Check if campaign refuses manual review
  const refusesManualReview = requirements.excludeManualReview || false
  
  // Check each requirement individually
  if (requirements.telegram && !CURRENT_USER_VERIFICATION.telegram) {
    return false
  }
  
  if (requirements.twitter && !CURRENT_USER_VERIFICATION.twitter) {
    return false
  }
  
  if (requirements.discord && !CURRENT_USER_VERIFICATION.discord) {
    return false
  }
  
  if (requirements.reddit && !CURRENT_USER_VERIFICATION.reddit) {
    return false
  }
  
  // For identity verification (KYC or DID), user needs to have at least one if either is required
  if (requirements.kyc || requirements.did) {
    const hasIdentityVerification = CURRENT_USER_VERIFICATION.kyc || CURRENT_USER_VERIFICATION.did
    if (!hasIdentityVerification) {
      return false
    }
  }
  
  // Manual review requirement (only if KYC/DID not available and not excluded)
  if (requirements.manualReview && !refusesManualReview && 
      !requirements.kyc && !requirements.did && 
      !CURRENT_USER_VERIFICATION.manualReview) {
    return false
  }
  
  return true
}

export function CampaignCard({ campaign, onCategoryClick, onDifficultyClick, onStatusClick, selectedCategories = [], selectedDifficulties = [], selectedStatuses = [] }: CampaignCardProps) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case "beginner":
      case "easy":
        return "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
      case "medium":
        return "bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100"
      case "advanced":
        return "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100"
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
      case "ending-soon":
        return "bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-100"
      case "upcoming":
        return "bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100"
      case "completed":
        return "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
    }
  }


  const getProgressPercentage = () => {
    return campaign.questsCount > 0 ? (campaign.questsCompleted / campaign.questsCount) * 100 : 0
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
      <div className="relative h-48 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20">
        <Image src={campaign.image || "/placeholder.svg"} alt={campaign.title} fill className="object-cover" />
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge 
            className={`${getStatusColor(campaign.status)} ${onStatusClick ? 'cursor-pointer hover:opacity-80' : ''} ${selectedStatuses.includes(campaign.status) ? 'ring-2 ring-white ring-offset-2' : ''}`}
            onClick={onStatusClick ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              onStatusClick(campaign.status)
            } : undefined}
          >
            {campaign.status}
          </Badge>
          <Badge 
            className={`${getDifficultyColor(campaign.difficulty)} ${onDifficultyClick ? 'cursor-pointer hover:opacity-80' : ''} ${selectedDifficulties.includes(campaign.difficulty.toLowerCase()) ? 'ring-2 ring-white ring-offset-2' : ''}`}
            onClick={onDifficultyClick ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              onDifficultyClick(campaign.difficulty.toLowerCase())
            } : undefined}
          >
            {campaign.difficulty}
          </Badge>
        </div>
        <div className="absolute top-4 right-4">
          <Badge variant="outline" className="bg-white/90 dark:bg-gray-800 dark:text-gray-200">
            <Clock className="w-3 h-3 mr-1" />
            {getDaysUntilEnd(campaign.endDate)}d left
          </Badge>
        </div>
      </div>

      <CardHeader className="flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{campaign.title}</CardTitle>
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{campaign.shortDescription}</p>
            <div className="text-xs text-muted-foreground">Endorsed by {campaign.endorserName}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between">
        {/* Main content */}
        <div className="space-y-4">
          {/* Categories */}
          <div className="flex flex-wrap gap-1">
            {campaign.categories.slice(0, 3).map((category) => {
              const isSelected = selectedCategories.includes(category.toLowerCase())
              return (
                <Badge 
                  key={category} 
                  variant={isSelected ? "default" : "outline"}
                  className={`text-xs ${onCategoryClick ? 'cursor-pointer hover:bg-primary/10' : ''} border-gray-300 dark:border-gray-600`}
                  onClick={onCategoryClick ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onCategoryClick(category.toLowerCase())
                  } : undefined}
                >
                  {category}
                </Badge>
              )
            })}
            {campaign.categories.length > 3 && (
              <Badge variant="outline" className="text-xs border-gray-300 dark:border-gray-600">
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

          {/* No Verification Message */}
          {campaign.verificationRequirements && 
           !campaign.verificationRequirements.telegram && 
           !campaign.verificationRequirements.kyc && 
           !campaign.verificationRequirements.did && 
           !campaign.verificationRequirements.manualReview &&
           !campaign.verificationRequirements.twitter &&
           !campaign.verificationRequirements.discord &&
           !campaign.verificationRequirements.reddit && (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800 dark:text-blue-200">
                  <div className="font-medium mb-1">No Verification Required!</div>
                  <div>You can start completing tasks immediately and collect rewards after verifying your Telegram account.</div>
                </div>
              </div>
            </div>
          )}

          {/* Verification Requirements */}
          {campaign.verificationRequirements && (
            <div className="space-y-2">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {/* Telegram */}
                  {campaign.verificationRequirements.telegram && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      CURRENT_USER_VERIFICATION.telegram 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    }`}>
                      <div className="w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                      <span>Requires Telegram</span>
                      {CURRENT_USER_VERIFICATION.telegram ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      )}
                    </div>
                  )}
                  
                  {/* Twitter/X */}
                  {campaign.verificationRequirements.twitter && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      CURRENT_USER_VERIFICATION.twitter 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    }`}>
                      <X className={`w-3 h-3 ${
                        CURRENT_USER_VERIFICATION.twitter ? "text-green-600" : "text-black dark:text-white"
                      }`} />
                      <span>Requires X</span>
                      {CURRENT_USER_VERIFICATION.twitter ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      )}
                    </div>
                  )}
                  
                  {/* Discord */}
                  {campaign.verificationRequirements.discord && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      CURRENT_USER_VERIFICATION.discord 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    }`}>
                      <div className="w-3 h-3 rounded bg-indigo-500 flex items-center justify-center">
                        <div className="w-2 h-1 bg-white rounded"></div>
                      </div>
                      <span>Requires Discord</span>
                      {CURRENT_USER_VERIFICATION.discord ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      )}
                    </div>
                  )}
                  
                  {/* Reddit */}
                  {campaign.verificationRequirements.reddit && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      CURRENT_USER_VERIFICATION.reddit 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    }`}>
                      <div className="w-3 h-3 rounded-full bg-orange-500 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      </div>
                      <span>Requires Reddit</span>
                      {CURRENT_USER_VERIFICATION.reddit ? (
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
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      CURRENT_USER_VERIFICATION.manualReview 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    }`}>
                      <User className={`w-3 h-3 ${
                        CURRENT_USER_VERIFICATION.manualReview ? "text-green-600" : "text-orange-600"
                      }`} />
                      <span>Requires Manual Review</span>
                      {CURRENT_USER_VERIFICATION.manualReview ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      )}
                    </div>
                  )}
                  
                  {/* Identity Verification - KYC OR DID - Show last since it's longer */}
                  {(campaign.verificationRequirements.kyc || campaign.verificationRequirements.did) && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      (CURRENT_USER_VERIFICATION.kyc || CURRENT_USER_VERIFICATION.did) 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    }`}>
                      <Shield className={`w-3 h-3 ${
                        (CURRENT_USER_VERIFICATION.kyc || CURRENT_USER_VERIFICATION.did) ? "text-green-600" : "text-purple-600"
                      }`} />
                      <span>Requires Identity (KYC or DID)</span>
                      {(CURRENT_USER_VERIFICATION.kyc || CURRENT_USER_VERIFICATION.did) ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      )}
                    </div>
                  )}
                </div>
                
                {/* Verification Status - only show if there are actual requirements */}
                {(() => {
                  // Check if there are any actual verification requirements
                  const hasRequirements = campaign.verificationRequirements.telegram || 
                    campaign.verificationRequirements.kyc || campaign.verificationRequirements.did || 
                    campaign.verificationRequirements.manualReview || campaign.verificationRequirements.twitter ||
                    campaign.verificationRequirements.discord || campaign.verificationRequirements.reddit
                  
                  if (!hasRequirements) {
                    return null // Don't show verification status for campaigns with no requirements
                  }
                  
                  const isEligible = meetsVerificationRequirements(campaign.verificationRequirements)
                  
                  if (!isEligible) {
                    return (
                      <div className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/40 p-2 rounded">
                        ⚠️ Complete required verifications to participate
                      </div>
                    )
                  } else {
                    return (
                      <div className="text-xs text-green-600 dark:text-green-300 bg-green-50 dark:bg-green-900/40 p-2 rounded">
                        ✅ You meet all verification requirements
                      </div>
                    )
                  }
                })()}
                
                {/* Verification Logic Explanation */}
                {(campaign.verificationRequirements.kyc || campaign.verificationRequirements.did) && (
                  <div className="text-xs text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 p-2 rounded">
                    💡 Having either KYC or DID verification satisfies identity requirements
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Button - Always at bottom */}
        <div className="mt-4 pt-4">
          <Link href={`/campaign/${campaign.id}`} className="block">
            <Button className="w-full">View Campaign</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
