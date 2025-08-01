"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Clock, Star, Users, ChevronDown, ChevronUp, Coins } from "lucide-react"
import Link from "next/link"
import type { Quest } from "@/lib"

interface QuestCardProps {
  quest: Quest
  campaignId: number
}

export function QuestCard({ quest, campaignId }: QuestCardProps) {
  const [showSubtasks, setShowSubtasks] = useState(false)

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-100 text-green-800"
      case "Medium":
        return "bg-yellow-100 text-yellow-800"
      case "Hard":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getSubtaskTypeIcon = (type: string) => {
    switch (type) {
      case "social":
        return "📱"
      case "technical":
        return "💻"
      case "onchain":
        return "⛓️"
      case "content":
        return "📝"
      case "research":
        return "🔍"
      default:
        return "📋"
    }
  }

  const completedSubtasks = quest.subtasks.filter((s) => s.completed).length
  const subtaskProgress = (completedSubtasks / quest.subtasks.length) * 100

  return (
    <Card className="transition-all duration-200 hover:shadow-md border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{quest.icon}</div>
            <div>
              <h3 className="font-semibold text-lg">{quest.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getDifficultyColor(quest.difficulty)}>
                  {quest.difficulty}
                </Badge>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="w-3 h-3" />
                  <span>{quest.completions} completed</span>
                </div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-yellow-600 font-semibold mb-1">
              <Star className="w-4 h-4 fill-current" />
              {quest.rewards.points.toString()}
            </div>
            <div className="space-y-1">
              {quest.rewards.tokens.map((token, index) => (
                <div key={index} className="flex items-center gap-1 text-green-600 font-semibold text-sm">
                  <Coins className="w-3 h-3" />
                  {token.amount.toString()} {token.symbol}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{quest.description}</p>

        {/* Subtask Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedSubtasks}/{quest.subtasks.length} subtasks
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowSubtasks(!showSubtasks)} className="text-xs">
              {showSubtasks ? (
                <>
                  Hide <ChevronUp className="w-3 h-3 ml-1" />
                </>
              ) : (
                <>
                  Show Details <ChevronDown className="w-3 h-3 ml-1" />
                </>
              )}
            </Button>
          </div>
          <Progress value={subtaskProgress} className="h-2" />
        </div>

        {/* Subtasks */}
        {showSubtasks && (
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
            <h4 className="font-medium text-sm">Subtasks:</h4>
            <div className="space-y-2">
              {quest.subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    subtask.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
                  }`}
                >
                  <div className="text-lg">{getSubtaskTypeIcon(subtask.type)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h5 className={`font-medium text-sm ${subtask.completed ? "line-through text-green-700" : ""}`}>
                        {subtask.title}
                      </h5>
                      {subtask.completed && (
                        <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
                          ✓ Done
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{subtask.description}</p>
                    <div className="text-xs text-blue-600 mt-1">
                      <span className="font-medium">Proof required:</span> {subtask.proofRequired}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            {quest.timeEstimate}
          </div>
          <Link href={`/quest/${quest.id}?campaign=${campaignId}`}>
            <Button size="sm">Start Quest</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
