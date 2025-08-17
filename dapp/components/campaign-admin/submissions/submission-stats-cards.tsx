"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Clock, CheckCircle, Trophy, Users } from "lucide-react"

interface SubmissionStatsCardsProps {
  stats?: {
    totalSubmissions: number
    pendingReview: number
    approved: number
  }
}

export function SubmissionStatsCards({ stats }: SubmissionStatsCardsProps) {
  if (!stats) {
    // Show loading skeleton
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 w-24 bg-muted rounded mb-2" />
                <div className="h-8 w-16 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Submissions</p>
              <p className="text-2xl font-bold">{stats.totalSubmissions}</p>
            </div>
            <Trophy className="w-8 h-8 text-primary" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending Review</p>
              <p className="text-2xl font-bold">{stats.pendingReview}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Approved</p>
              <p className="text-2xl font-bold">{stats.approved}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}