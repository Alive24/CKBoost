import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Wallet, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  Lock,
  Users,
  Trophy
} from "lucide-react";
import { ccc } from "@ckb-ccc/connector-react";
import type { QuestDataLike, CampaignDataLike } from "ssri-ckboost/types";
import { udtRegistry } from "@/lib/services/udt-registry";
import { cn } from "@/lib/utils";

interface FundingStatus {
  token: string;
  tokenName: string;
  lockedAmount: bigint;
  distributedAmount: bigint;
  totalFunded: bigint; // locked + distributed
  requiredAmount: bigint;
  availableCompletions: number;
  shortage: bigint; // max(required - totalFunded, 0)
  status: "funded" | "underfunded" | "critical";
}

interface FundingDashboardProps {
  campaign: CampaignDataLike;
  initialQuotas: ccc.NumLike[];
  lockedUDTs: Map<string, bigint>; // UDT script hash -> amount
  className?: string;
}

export function FundingDashboard({
  campaign,
  initialQuotas,
  lockedUDTs,
  className
}: FundingDashboardProps) {
  // Calculate funding requirements per UDT token
  const calculateFundingStatus = (): FundingStatus[] => {
    const tokenRequirements = new Map<string, bigint>()
    const tokenQuests = new Map<string, QuestDataLike[]>()
    const tokenDistributed = new Map<string, bigint>()

    // Aggregate UDT requirements across all quests and reward lists
    campaign.quests?.forEach((quest, qIndex) => {
      const quota = ccc.numFrom(initialQuotas[qIndex] ?? 0)
      if (quota <= 0n) return
      quest.rewards_on_completion?.forEach(reward => {
        reward.udt_assets?.forEach(asset => {
          const script = ccc.Script.from(asset.udt_script)
          const scriptHash = script.hash()
          const perCompletion = ccc.numFrom(asset.amount)
          const addRequired = perCompletion * quota
          const prev = tokenRequirements.get(scriptHash) || 0n
          tokenRequirements.set(scriptHash, prev + addRequired)

          // Track which quests use this token
          const quests = tokenQuests.get(scriptHash) || []
          quests.push(quest)
          tokenQuests.set(scriptHash, quests)

          // Distributed so far = perCompletion * completion_count
          const completions = BigInt(Number(quest.completion_count || 0))
          const addDistributed = perCompletion * completions
          const prevDist = tokenDistributed.get(scriptHash) || 0n
          tokenDistributed.set(scriptHash, prevDist + addDistributed)
        })
      })
    })

    // Calculate status for each token
    const statuses: FundingStatus[] = []

    tokenRequirements.forEach((required, scriptHash) => {
      const locked = lockedUDTs.get(scriptHash) || 0n
      const distributed = tokenDistributed.get(scriptHash) || 0n
      const totalFunded = locked + distributed
      const tokenInfo = udtRegistry.getTokenByScriptHash(scriptHash)
      if (!tokenInfo) return

      const shortage = required > totalFunded ? required - totalFunded : 0n
      const quests = tokenQuests.get(scriptHash) || []

      // Calculate available completions when requirement is 0 (unlimited)
      let availableCompletions = 0
      if (required === 0n) {
        const totalPerCompletion = quests.reduce((sum, quest) => {
          const amt = (quest.rewards_on_completion || []).reduce((acc, r) => {
            const found = (r.udt_assets || []).find(a => ccc.Script.from(a.udt_script).hash() === scriptHash)
            return acc + (found ? ccc.numFrom(found.amount) : 0n)
          }, 0n)
          return sum + amt
        }, 0n)
        const avgRewardPerCompletion = quests.length > 0 ? totalPerCompletion / BigInt(quests.length) : 0n
        if (avgRewardPerCompletion > 0n) {
          availableCompletions = Number(locked / avgRewardPerCompletion)
        }
      } else if (locked >= required) {
        availableCompletions = -1
      }

      const status: "funded" | "underfunded" | "critical" =
        shortage === 0n ? "funded" : totalFunded === 0n ? "critical" : "underfunded"

      statuses.push({
        token: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        lockedAmount: locked,
        distributedAmount: distributed,
        totalFunded,
        requiredAmount: required,
        availableCompletions,
        shortage,
        status,
      })
    })

    return statuses
  }
  
  const fundingStatuses = calculateFundingStatus();
  const totalQuests = campaign.quests?.length || 0;
  const fundedQuests = campaign.quests?.filter((quest, qIndex) => {
    // If no UDT rewards, consider funded
    const hasUDT = quest.rewards_on_completion?.some(r => r.udt_assets && r.udt_assets.length > 0)
    if (!hasUDT) return true

    const quota = ccc.numFrom(initialQuotas[qIndex] ?? 0)
    // If quota is 0, treat as funded (nothing required)
    if (quota === 0n) return true

    // All UDT assets for this quest must be fully funded
    return quest.rewards_on_completion?.every(reward =>
      (reward.udt_assets || []).every(asset => {
        const scriptHash = ccc.Script.from(asset.udt_script).hash()
        const locked = lockedUDTs.get(scriptHash) || 0n
        const perCompletion = ccc.numFrom(asset.amount)
        const distributed = perCompletion * BigInt(Number(quest.completion_count || 0))
        const required = perCompletion * quota
        return (locked + distributed) >= required
      })
    )
  }).length || 0
  
  const overallStatus = 
    fundedQuests === totalQuests ? "funded" :
    fundedQuests === 0 ? "critical" :
    "partial";
  
  return (
    <div className={cn("space-y-6", className)}>
      {/* Overall Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Funding Overview
            </CardTitle>
            <Badge 
              variant={
                overallStatus === "funded" ? "default" :
                overallStatus === "critical" ? "destructive" :
                "secondary"
              }
            >
              {overallStatus === "funded" ? "Fully Funded" :
               overallStatus === "critical" ? "Not Funded" :
               `${fundedQuests}/${totalQuests} Quests Funded`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Quest Funding Progress</span>
                <span>{Math.round((fundedQuests / Math.max(totalQuests, 1)) * 100)}%</span>
              </div>
              <Progress 
                value={(fundedQuests / Math.max(totalQuests, 1)) * 100} 
                className="h-2"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center">
                <Trophy className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-2xl font-bold">{totalQuests}</div>
                <div className="text-xs text-muted-foreground">Total Quests</div>
              </div>
              <div className="text-center">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold">{fundedQuests}</div>
                <div className="text-xs text-muted-foreground">Funded</div>
              </div>
              <div className="text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-500" />
                <div className="text-2xl font-bold">{totalQuests - fundedQuests}</div>
                <div className="text-xs text-muted-foreground">Underfunded</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Token-specific funding status */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">UDT Token Status</h3>
        
        {fundingStatuses.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No UDT rewards configured for this campaign</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          fundingStatuses.map(status => (
            <Card key={status.token} className={cn(
              "border-l-4",
              status.status === "funded" && "border-l-green-500",
              status.status === "underfunded" && "border-l-orange-500",
              status.status === "critical" && "border-l-red-500"
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="font-semibold">{status.token}</h4>
                      <p className="text-sm text-muted-foreground">{status.tokenName}</p>
                    </div>
                  </div>
                  <Badge 
                    variant={
                      status.status === "funded" ? "default" :
                      status.status === "critical" ? "destructive" :
                      "secondary"
                    }
                  >
                    {status.status === "funded" ? "Funded" :
                     status.status === "critical" ? "Not Funded" :
                     "Underfunded"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Locked:</span>
                      <div className="font-mono font-semibold">
                        {udtRegistry.formatAmount(status.lockedAmount, 
                          udtRegistry.getTokenBySymbol(status.token)!
                        )} {status.token}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Distributed:</span>
                      <div className="font-mono font-semibold">
                        {udtRegistry.formatAmount(status.distributedAmount, 
                          udtRegistry.getTokenBySymbol(status.token)!
                        )} {status.token}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Required:</span>
                      <div className="font-mono font-semibold">
                        {status.requiredAmount > 0n 
                          ? `${udtRegistry.formatAmount(status.requiredAmount,
                              udtRegistry.getTokenBySymbol(status.token)!
                            )} ${status.token}`
                          : "Unlimited"
                        }
                      </div>
                    </div>
                  </div>
                  
                  {status.requiredAmount > 0n && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Funding Progress</span>
                        <span>
                          {Math.min(100, Math.round(
                            Number(status.totalFunded * 100n / status.requiredAmount)
                          ))}%
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(100, Number(status.totalFunded * 100n / status.requiredAmount))}
                        className="h-2"
                      />
                    </div>
                  )}
                  
                  {status.shortage > 0n && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Need {udtRegistry.formatAmount(status.shortage,
                          udtRegistry.getTokenBySymbol(status.token)!
                        )} more {status.token} to fully fund all quests
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {status.availableCompletions > 0 && status.requiredAmount === 0n && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4" />
                      <span>
                        Approximately {status.availableCompletions} completions available
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      {/* Warning for underfunded campaigns */}
      {overallStatus !== "funded" && fundingStatuses.some(s => s.status !== "funded") && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This campaign has insufficient UDT funding. Users may not be able to claim rewards 
            for some quests. Please add more funds to ensure all rewards can be distributed.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
