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
  requiredAmount: bigint;
  availableCompletions: number;
  shortage: bigint;
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
    const tokenRequirements = new Map<string, bigint>();
    const tokenQuests = new Map<string, QuestDataLike[]>();
    
    // Aggregate UDT requirements across all quests
    campaign.quests?.forEach((quest, index) => {
      quest.rewards_on_completion?.forEach(reward => {
        reward.udt_assets?.forEach(asset => {
          const script = ccc.Script.from(asset.udt_script);
          const scriptHash = script.hash();
          
          const initialQuota = initialQuotas[index] ? initialQuotas[index] : 0n;
          
            // Limited completions - calculate exact requirement
            tokenRequirements.set(
              scriptHash,
              BigInt((Number(asset.amount) * Number(initialQuota)))
            );

          
          // Track which quests use this token
          const quests = tokenQuests.get(scriptHash) || [];
          quests.push(quest);
          tokenQuests.set(scriptHash, quests);
        });
      });
    });
    
    // Calculate status for each token
    const statuses: FundingStatus[] = [];
    
    tokenRequirements.forEach((required, scriptHash) => {
      const locked = lockedUDTs.get(scriptHash) || 0n;
      const tokenInfo = udtRegistry.getTokenByScriptHash(scriptHash);
      
      if (!tokenInfo) {
        return; // Skip unknown tokens
      }
      
      const shortage = required > locked ? required - locked : 0n;
      const quests = tokenQuests.get(scriptHash) || [];
      
      // Calculate available completions for unlimited quests
      let availableCompletions = 0;
      if (required === 0n) {
        // Has unlimited quests - calculate based on locked amount
        const avgRewardPerCompletion = quests.reduce((sum, quest) => {
          const rewards = quest.rewards_on_completion?.[0]?.udt_assets || [];
          const tokenReward = rewards.find(r => 
            ccc.Script.from(r.udt_script).hash() === scriptHash
          );
          return sum + (BigInt(Number(tokenReward?.amount)) || 0n);
        }, 0n) / BigInt(Math.max(quests.length, 1));
        
        if (avgRewardPerCompletion > 0n) {
          availableCompletions = Number(locked / avgRewardPerCompletion);
        }
      } else if (locked >= required) {
        availableCompletions = -1; // Fully funded
      }
      
      const status: "funded" | "underfunded" | "critical" = 
        shortage === 0n ? "funded" :
        locked === 0n ? "critical" :
        "underfunded";
      
      statuses.push({
        token: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        lockedAmount: locked,
        requiredAmount: required,
        availableCompletions,
        shortage,
        status
      });
    });
    
    return statuses;
  };
  
  const fundingStatuses = calculateFundingStatus();
  const totalQuests = campaign.quests?.length || 0;
  const fundedQuests = campaign.quests?.filter(quest => {
    // Check if all UDT rewards for this quest are funded
    const hasUDTRewards = quest.rewards_on_completion?.some(r => 
      r.udt_assets && r.udt_assets.length > 0
    );
    
    if (!hasUDTRewards) return true; // No UDT rewards = considered funded
    
    return quest.rewards_on_completion?.every(reward =>
      reward.udt_assets?.every((asset, index) => {
        const scriptHash = ccc.Script.from(asset.udt_script).hash();
        const locked = lockedUDTs.get(scriptHash) || 0n;
        const required = BigInt(Number(asset.amount) * Number(initialQuotas[index]));
        return locked >= required;
      })
    );
  }).length || 0;
  
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
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Locked:</span>
                      <div className="font-mono font-semibold">
                        {udtRegistry.formatAmount(status.lockedAmount, 
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
                            Number(status.lockedAmount * 100n / status.requiredAmount)
                          ))}%
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(100, Number(status.lockedAmount * 100n / status.requiredAmount))}
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