import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trophy, Edit, Trash2, Coins } from "lucide-react"
import type { QuestDataLike, QuestSubTaskDataLike } from "ssri-ckboost/types"
import { udtRegistry } from "@/lib/services/udt-registry"
import { ccc } from "@ckb-ccc/connector-react"

interface QuestCardProps {
  quest: QuestDataLike
  index: number
  onEdit: () => void
  onDelete: () => void
  showActions?: boolean
}

export function QuestCard({ quest, index, onEdit, onDelete, showActions = true }: QuestCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {quest.metadata?.title || `Quest ${index + 1}`}
            </CardTitle>
            <CardDescription className="mt-1">
              {quest.metadata?.short_description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800">
              <Trophy className="w-3 h-3 mr-1" />
              {Number(quest.points)} points
            </Badge>
            {showActions && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {quest.metadata?.long_description && (
          <p className="text-sm text-muted-foreground mb-4">
            {quest.metadata.long_description}
          </p>
        )}
        {quest.metadata?.requirements && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-1">Requirements:</p>
            <p className="text-sm text-muted-foreground">{quest.metadata.requirements}</p>
          </div>
        )}
        {quest.sub_tasks && quest.sub_tasks.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Subtasks ({quest.sub_tasks.length}):</p>
            <div className="space-y-2">
              {quest.sub_tasks.map((subtask: QuestSubTaskDataLike, subIndex: number) => (
                <div key={subIndex} className="flex items-start gap-2 text-sm">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
                    {subIndex + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{subtask.title}</p>
                    <p className="text-muted-foreground text-xs">{subtask.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {quest.rewards_on_completion.some(r => r.udt_assets && r.udt_assets.length > 0) && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              UDT Rewards:
            </p>
            <div className="space-y-1">
              {quest.rewards_on_completion[0]?.udt_assets?.map((udt, idx) => {
                const script = ccc.Script.from(udt.udt_script)
                const scriptHash = script.hash()
                const token = udtRegistry.getTokenByScriptHash(scriptHash)
                
                if (token) {
                  const formattedAmount = udtRegistry.formatAmount(Number(udt.amount), token)
                  return (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary" className="font-mono">
                        {formattedAmount} {token.symbol}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({token.name})
                      </span>
                    </div>
                  )
                } else {
                  // Fallback for unknown tokens
                  return (
                    <div key={idx} className="text-xs text-muted-foreground">
                      • {udt.amount.toString()} tokens (Unknown UDT)
                    </div>
                  )
                }
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}