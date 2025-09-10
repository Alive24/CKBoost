"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, Clock, Shield } from "lucide-react"

type Status = {
  telegram: boolean
  twitter: boolean
  discord: boolean
  reddit: boolean
  kyc: boolean
  did: boolean
  manualReview: boolean
}

export function StatusAlert({ currentUserStatus }: { currentUserStatus: Status }) {
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
  }

  if (verificationCount > 0) {
    return (
      <Alert className="bg-yellow-50 border-yellow-200">
        <Clock className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-yellow-800">
          You have completed {verificationCount} of {totalVerifications} verification methods. Complete more to access additional campaigns.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="bg-blue-50 border-blue-200">
      <Shield className="h-4 w-4 text-blue-600" />
      <AlertDescription className="text-blue-800">
        Complete identity verification to access all platform features and prevent reward farming.
      </AlertDescription>
    </Alert>
  )
}

