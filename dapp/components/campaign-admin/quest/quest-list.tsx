import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Target, Plus } from "lucide-react"
import type { QuestDataLike } from "ssri-ckboost/types"
import { QuestCard } from "./quest-card"

interface QuestListProps {
  quests: QuestDataLike[]
  onEditQuest: (index: number) => void
  onDeleteQuest: (index: number) => void
  onAddQuest: () => void
  isCreateMode: boolean
}

export function QuestList({ 
  quests, 
  onEditQuest, 
  onDeleteQuest, 
  onAddQuest,
  isCreateMode 
}: QuestListProps) {
  if (isCreateMode && quests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center space-y-4">
            <Target className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-lg">No Quests Yet</h3>
              <p className="text-muted-foreground mt-2">
                Add quests to define the tasks participants will complete in your campaign
              </p>
            </div>
            <Button onClick={onAddQuest} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Quest
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {quests.map((quest, index) => (
        <QuestCard
          key={index}
          quest={quest}
          index={index}
          onEdit={() => onEditQuest(index)}
          onDelete={() => onDeleteQuest(index)}
          showActions={isCreateMode}
        />
      ))}
    </div>
  )
}