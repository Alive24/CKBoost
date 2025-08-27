"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, AlertTriangle, Info, Coins, Calculator } from "lucide-react"
import { UDTSelector } from "../quest/udt-selector"
import { udtRegistry, UDTToken } from "@/lib/services/udt-registry"
import { ccc } from "@ckb-ccc/connector-react"
import { QuestDataLike } from "ssri-ckboost/types"
import { cn } from "@/lib/utils"

interface InitialFundingProps {
  quests: QuestDataLike[]
  initialQuota: ccc.NumLike[]
  signer: ccc.Signer | undefined
  onFundingChange?: (funding: Map<string, bigint>) => void
}

interface FundingItem {
  token?: UDTToken
  amount: string
  scriptHash?: string
}

export function InitialFunding({ quests, initialQuota, signer, onFundingChange }: InitialFundingProps) {
  const [fundingItems, setFundingItems] = useState<FundingItem[]>([])
  const [showCalculator, setShowCalculator] = useState(false)

  // Calculate required UDT for all quests
  const requiredFunding = useMemo(() => {
    const fundingMap = new Map<string, { token: UDTToken; required: bigint; quests: number[] }>()
    
    quests.forEach((quest, questIndex) => {
      quest.rewards_on_completion?.forEach(reward => {
        reward.udt_assets?.forEach(asset => {
          const script = ccc.Script.from(asset.udt_script)
          const scriptHash = script.hash()
          const token = udtRegistry.getTokenByScriptHash(scriptHash)
          
          if (token) {
            const existing = fundingMap.get(scriptHash)
            // Use the quest's initial_quota if available, otherwise use value from initialQuota array, default to 10
            const quotaValue = initialQuota[questIndex] ?? (quest as QuestDataLike & { initial_quota?: number }).initial_quota ?? 10
            const quota = Math.max(1, Math.floor(Number(quotaValue) || 10)) // Ensure positive integer, default to 10
            const requiredAmount = Number(asset.amount) * quota
            
            if (existing) {
              existing.required += BigInt(requiredAmount)
              existing.quests.push(questIndex + 1)
            } else {
              fundingMap.set(scriptHash, {
                token,
                required: BigInt(requiredAmount),
                quests: [questIndex + 1]
              })
            }
          }
        })
      })
    })
    
    return fundingMap
  }, [initialQuota, quests])

  // Calculate total funding provided
  const providedFunding = useMemo(() => {
    const fundingMap = new Map<string, bigint>()
    
    fundingItems.forEach(item => {
      if (item.token && item.amount && item.scriptHash) {
        const amountNumber = Number(item.amount);
        const amountNumberFixed = Number(amountNumber.toFixed(item.token.decimals));
        const amount = BigInt(amountNumberFixed * 10 ** item.token.decimals);
        const existing = fundingMap.get(item.scriptHash) || BigInt(0)
        fundingMap.set(item.scriptHash, existing + amount)
      }
    })
    
    return fundingMap
  }, [fundingItems])

  // Notify parent of funding changes
  useEffect(() => {
    onFundingChange?.(providedFunding)
  }, [providedFunding, onFundingChange])

  const handleAddFunding = () => {
    setFundingItems([...fundingItems, { amount: "" }])
  }

  const handleRemoveFunding = (index: number) => {
    setFundingItems(fundingItems.filter((_, i) => i !== index))
  }

  const handleFundingChange = (index: number, value: { token?: UDTToken; amount: string }) => {
    const newItems = [...fundingItems]
    const scriptHash = value.token ? ccc.Script.from({
      codeHash: value.token.script.codeHash,
      hashType: value.token.script.hashType,
      args: value.token.script.args
    }).hash() : undefined
    
    // If amount is provided and token is selected, validate against required amount
    if (value.token && value.amount && scriptHash) {
      const required = requiredFunding.get(scriptHash)
      if (required) {
        try {
          const inputAmount = ccc.udtBalanceFrom(value.amount)
          
          // Calculate total provided for this token from other items
          const otherProvided = fundingItems.reduce((sum, item, i) => {
            if (i !== index && item.scriptHash === scriptHash && item.amount) {
              return sum + ccc.udtBalanceFrom(item.amount)
            }
            return sum
          }, BigInt(0))
          
          // Cap the amount to not exceed required
          const maxAllowed = required.required > otherProvided 
            ? required.required - otherProvided 
            : BigInt(0)
          
          if (inputAmount > maxAllowed) {
            // Set to max allowed amount
            value.amount = udtRegistry.formatAmount(maxAllowed, value.token)
          }
        } catch {
          // Invalid amount format, let it be handled by the selector
        }
      }
    }
    
    newItems[index] = { ...value, scriptHash }
    setFundingItems(newItems)
  }

  const handleAutoFill = () => {
    const items: FundingItem[] = []
    
    requiredFunding.forEach((data, scriptHash) => {
      items.push({
        token: data.token,
        amount: udtRegistry.formatAmount(data.required, data.token),
        scriptHash
      })
    })
    
    setFundingItems(items)
  }

  // Check if funding is sufficient
  const fundingStatus = useMemo(() => {
    const status = new Map<string, {
      token: UDTToken
      required: bigint
      provided: bigint
      sufficient: boolean
      percentage: number
    }>()
    
    requiredFunding.forEach((data, scriptHash) => {
      const provided = providedFunding.get(scriptHash) || BigInt(0)
      const percentage = data.required > 0 
        ? Number((provided * BigInt(100)) / data.required)
        : 100
        
      status.set(scriptHash, {
        token: data.token,
        required: data.required,
        provided,
        sufficient: provided >= data.required,
        percentage: Math.min(percentage, 100)
      })
    })
    
    return status
  }, [requiredFunding, providedFunding])

  const allFunded = Array.from(fundingStatus.values()).every(s => s.sufficient)
  const hasQuests = quests.length > 0
  const hasUDTRewards = requiredFunding.size > 0

  if (!hasQuests) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Info className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>Add quests first to see funding requirements</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!hasUDTRewards) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Coins className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No UDT rewards configured in quests</p>
            <p className="text-sm mt-1">Add UDT rewards to quests to enable funding</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Funding Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Funding Requirements
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCalculator(!showCalculator)}
            >
              {showCalculator ? "Hide" : "Show"} Details
            </Button>
          </CardTitle>
          <CardDescription>
            Based on quest rewards and initial quota
          </CardDescription>
        </CardHeader>
        {showCalculator && (
          <CardContent>
            <div className="space-y-3">
              {Array.from(requiredFunding.entries()).map(([scriptHash, data]) => (
                <div key={scriptHash} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{data.token.symbol}</span>
                      <span className="text-sm text-muted-foreground">
                        {data.token.name}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Required for quests: {data.quests.join(", ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">
                      {udtRegistry.formatAmount(data.required, data.token)} {data.token.symbol}
                    </div>
                    {fundingStatus.get(scriptHash)?.sufficient ? (
                      <Badge variant="default" className="mt-1">Funded</Badge>
                    ) : (
                      <Badge variant="destructive" className="mt-1">Needs Funding</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Initial Funding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Initial Campaign Funding
          </CardTitle>
          <CardDescription>
            Lock UDT tokens to the campaign for quest rewards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!allFunded && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Campaign needs funding for UDT rewards. You can fund it now or add funds later.
                <br className="mb-1" />
                <span className="text-sm">Note: You can only fund up to the required amount. Additional funding can be added after campaign creation.</span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFunding}
              disabled={!signer}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Funding
            </Button>
            
            {requiredFunding.size > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoFill}
                disabled={!signer}
              >
                <Calculator className="w-4 h-4 mr-2" />
                Auto-fill Required
              </Button>
            )}
          </div>

          {fundingItems.length > 0 && (
            <div className="space-y-3">
              {fundingItems.map((item, index) => (
                <Card key={index} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Funding #{index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFunding(index)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    
                    <UDTSelector
                      value={item}
                      onChange={(value) => handleFundingChange(index, value)}
                      signer={signer}
                      showBalance={true}
                      label="Token and Amount"
                      placeholder="Enter amount to lock"
                    />
                    
                    {item.scriptHash && fundingStatus.has(item.scriptHash) && (
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">
                          Required: {udtRegistry.formatAmount(
                            fundingStatus.get(item.scriptHash)!.required,
                            fundingStatus.get(item.scriptHash)!.token
                          )} {fundingStatus.get(item.scriptHash)!.token.symbol}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Remaining to fund: {udtRegistry.formatAmount(
                            fundingStatus.get(item.scriptHash)!.required - fundingStatus.get(item.scriptHash)!.provided,
                            fundingStatus.get(item.scriptHash)!.token
                          )} {fundingStatus.get(item.scriptHash)!.token.symbol}
                        </div>
                      </div>
                    )}
                    
                    {item.token && item.scriptHash && !requiredFunding.has(item.scriptHash) && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          This token is not required by any quest. Please select a token that has rewards configured.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Funding Status Summary */}
          {fundingItems.length > 0 && (
            <Card className={cn(
              "p-4",
              allFunded ? "bg-green-50 dark:bg-green-950/20" : "bg-yellow-50 dark:bg-yellow-950/20"
            )}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Funding Status</span>
                  {allFunded ? (
                    <Badge variant="default">Fully Funded</Badge>
                  ) : (
                    <Badge variant="secondary">Partially Funded</Badge>
                  )}
                </div>
                
                {Array.from(fundingStatus.entries()).map(([scriptHash, status]) => (
                  <div key={scriptHash} className="flex items-center justify-between text-sm">
                    <span>{status.token.symbol}:</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-mono",
                        status.sufficient ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"
                      )}>
                        {udtRegistry.formatAmount(status.provided, status.token)} / 
                        {udtRegistry.formatAmount(status.required, status.token)}
                      </span>
                      <Badge variant={status.sufficient ? "default" : "outline"} className="text-xs">
                        {status.percentage}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}