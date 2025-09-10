"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle } from "lucide-react"
import React from "react"

export type VerificationMethod = {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  difficulty: string
  timeEstimate: string
  requirements: string[]
  status: string
}

export function VerificationMethodCard({
  method,
  isSelected,
  isCompleted,
  isDisabled,
  isSubmitting,
  justCompletedId,
  onToggle,
  completedDetails,
  getDifficultyColor,
  getStatusColor,
  children,
}: {
  method: VerificationMethod
  isSelected: boolean
  isCompleted: boolean
  isDisabled: boolean
  isSubmitting: boolean
  justCompletedId?: string | null
  onToggle: () => void
  completedDetails?: React.ReactNode
  getDifficultyColor: (difficulty: string) => string
  getStatusColor: (status: string) => string
  children?: React.ReactNode
}) {
  const Icon = method.icon

  const completedRing = () => {
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
  }

  const selectedRing = () => {
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
  }

  const checkColor = () => {
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
  }

  return (
    <Card
      className={`cursor-pointer transition-all ${
        isCompleted ? completedRing() : isSelected ? selectedRing() : "hover:shadow-md"
      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
      onClick={() => {
        if (isDisabled || isCompleted || isSubmitting || justCompletedId === method.id) return
        onToggle()
      }}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {method.name}
            {isCompleted && <CheckCircle className={`w-4 h-4 ${checkColor()}`} />}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getDifficultyColor(method.difficulty)}>
              {method.difficulty}
            </Badge>
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
              })()}
              >
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

        {isCompleted && completedDetails}

        <div className="text-sm">
          <div className="font-medium mb-1">Time Estimate: {method.timeEstimate}</div>
          <div className="font-medium mb-2">Requirements:</div>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            {method.requirements.map((req, index) => (
              <li key={index}>{req}</li>
            ))}
          </ul>
        </div>

        {justCompletedId === method.id && (
          <div className="space-y-4 pt-4 border-t">
            <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                ✅ {method.name} completed successfully! This verification is now active.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {isSelected && !isCompleted && (
          <div className="space-y-4 pt-4 border-t">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

