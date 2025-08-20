import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Trophy, Target, CheckCircle } from "lucide-react"
import type { QuestDataLike } from "ssri-ckboost/types"

interface CampaignStatsProps {
  quests: QuestDataLike[]
  participantCount?: number
  completionCount?: number
}

export function CampaignStats({ quests, participantCount = 0, completionCount = 0 }: CampaignStatsProps) {
  const totalPoints = quests.reduce((sum, quest) => sum + Number(quest.points), 0)
  const totalSubtasks = quests.reduce((sum, quest) => sum + (quest.sub_tasks?.length || 0), 0)
  
  const stats = [
    {
      title: "Total Quests",
      value: quests.length,
      icon: Target,
      description: `${totalSubtasks} subtasks total`,
      color: "text-blue-600"
    },
    {
      title: "Total Points",
      value: totalPoints.toLocaleString(),
      icon: Trophy,
      description: "Points available",
      color: "text-green-600"
    },
    {
      title: "Participants",
      value: participantCount,
      icon: Users,
      description: "Active participants",
      color: "text-purple-600"
    },
    {
      title: "Completions",
      value: completionCount,
      icon: CheckCircle,
      description: "Quest completions",
      color: "text-orange-600"
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}