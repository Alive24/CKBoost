"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, AlertTriangle, Info, Coins, Calculator } from "lucide-react"
import { UDTSelector } from "../quest/udt-selector"
import { udtRegistry, UDTToken } from "@/lib/services/udt-registry"
import { ccc } from "@ckb-ccc/connector-react"
import { QuestDataLike } from "ssri-ckboost/types"
import { cn } from "@/lib/utils"
import { debug } from "@/lib/utils/debug"

interface InitialFundingProps {
  quests: QuestDataLike[]
  initialQuota: ccc.NumLike[]
  signer: ccc.Signer | undefined
  onFundingChange?: (funding: Map<string, bigint>) => void
  onCKBFundingChange?: (ckb: bigint) => void
}

interface FundingItem {
  token?: UDTToken
  amount: string
  scriptHash?: string
}

export function InitialFunding({ quests, initialQuota, signer, onFundingChange, onCKBFundingChange }: InitialFundingProps) {
  const [fundingItems, setFundingItems] = useState<FundingItem[]>([])
  // Funding Requirements are expanded by default (no collapse)

  // Calculate required CKB for all quests (based on initial quotas)
  const ckbRequired = useMemo(() => {
    try {
      return quests.reduce((sum, quest, questIndex) => {
        const quotaValue = initialQuota[questIndex] ?? (quest as QuestDataLike & { initial_quota?: number }).initial_quota ?? 10
        const quota = ccc.numFrom(quotaValue ?? 10)
        if (quota <= 0n) return sum
        const perCompletion = (quest.rewards_on_completion || []).reduce((acc, reward) => acc + ccc.numFrom(reward?.ckb_amount || 0), 0n)
        if (perCompletion <= 0n) return sum
        return sum + perCompletion * quota
      }, 0n)
    } catch {
      return 0n
    }
  }, [quests, initialQuota])

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
      if (!item.token || !item.amount) return
      if (item.token.symbol === 'CKB') return // exclude CKB from UDT map
      if (!item.scriptHash) return
      const s = item.amount.trim()
      if (!/^\d*(?:\.\d*)?$/.test(s)) return
      const [ints, fracs = ""] = s.split('.')
      const decs = item.token.decimals
      const fracPadded = (fracs + "0".repeat(decs)).slice(0, decs)
      try {
        const base = 10n ** BigInt(decs)
        const intPart = ints ? BigInt(ints) : 0n
        const fracPart = fracPadded ? BigInt(fracPadded) : 0n
        const amount = intPart * base + fracPart
        const existing = fundingMap.get(item.scriptHash) || 0n
        fundingMap.set(item.scriptHash, existing + amount)
      } catch {}
    })
    return fundingMap
  }, [fundingItems])

  // Notify parent of funding changes (UDT map)
  useEffect(() => {
    onFundingChange?.(providedFunding)
  }, [providedFunding, onFundingChange])

  // Calculate provided CKB from items and notify parent
  useEffect(() => {
    let providedCkb = 0n
    fundingItems.forEach(item => {
      if (!item.token || item.token.symbol !== 'CKB') return
      const s = (item.amount || '').trim()
      if (!/^\d*(?:\.\d*)?$/.test(s)) return
      const [ints, fracs = ""] = s.split('.')
      const fracPadded = (fracs + "0".repeat(8)).slice(0, 8)
      try {
        const base = 10n ** 8n
        const intPart = ints ? BigInt(ints) : 0n
        const fracPart = fracPadded ? BigInt(fracPadded) : 0n
        providedCkb += intPart * base + fracPart
      } catch {}
    })
    onCKBFundingChange?.(providedCkb)
  }, [fundingItems, onCKBFundingChange])

  const handleAddFunding = () => {
    setFundingItems([...fundingItems, { amount: "" }])
  }

  const handleRemoveFunding = (index: number) => {
    setFundingItems(fundingItems.filter((_, i) => i !== index))
  }

  const handleFundingChange = (index: number, value: { token?: UDTToken; amount: string }) => {
    const newItems = [...fundingItems]
    const scriptHash = value.token
      ? (value.token.symbol === 'CKB'
          ? 'CKB'
          : ccc.Script.from({
              codeHash: value.token.script.codeHash,
              hashType: value.token.script.hashType,
              args: value.token.script.args
            }).hash())
      : undefined
    
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
      } else if (value.token.symbol === 'CKB') {
        // Cap CKB to required CKB
        try {
          const s = value.amount.trim()
          if (/^\d*(?:\.\d*)?$/.test(s)) {
            const [ints, fracs = ""] = s.split('.')
            const fracPadded = (fracs + "0".repeat(8)).slice(0, 8)
            const base = 10n ** 8n
            const intPart = ints ? BigInt(ints) : 0n
            const fracPart = fracPadded ? BigInt(fracPadded) : 0n
            const inputAmount = intPart * base + fracPart
            const otherProvided = fundingItems.reduce((sum, item, i) => {
              if (i !== index && item.token?.symbol === 'CKB' && item.amount) {
                const t = (item.amount || '').trim()
                if (!/^\d*(?:\.\d*)?$/.test(t)) return sum
                const [ii, ff = ""] = t.split('.')
                const fp = (ff + "0".repeat(8)).slice(0, 8)
                try {
                  const ip = ii ? BigInt(ii) : 0n
                  const fpn = fp ? BigInt(fp) : 0n
                  return sum + ip * base + fpn
                } catch { return sum }
              }
              return sum
            }, 0n)
            const maxAllowed = ckbRequired > otherProvided ? ckbRequired - otherProvided : 0n
            if (inputAmount > maxAllowed) {
              const intsNew = (maxAllowed / base).toString()
              const fracNew = (maxAllowed % base).toString().padStart(8, '0').replace(/0+$/, '')
              value.amount = fracNew ? `${intsNew}.${fracNew}` : intsNew
            }
          }
        } catch {}
      }
    }
    
    newItems[index] = { ...value, scriptHash }
    setFundingItems(newItems)
  }

  const handleAutoFill = () => {
    debug.log('[InitialFunding] Auto-fill clicked', { udtRequiredCount: requiredFunding.size, ckbRequired: ckbRequired.toString() })
    const items: FundingItem[] = []

    // UDTs
    requiredFunding.forEach((data, scriptHash) => {
      items.push({
        token: data.token,
        amount: udtRegistry.formatAmount(data.required, data.token),
        scriptHash
      })
    })

    // CKB
    if (ckbRequired > 0n) {
      const net = (process.env.NEXT_PUBLIC_CKB_NETWORK === 'testnet' ? 'testnet' : 'mainnet') as 'testnet' | 'mainnet'
      const ckbToken: UDTToken = {
        network: net,
        symbol: 'CKB',
        name: 'CKB (native)',
        decimals: 8,
        script: { codeHash: '0x' as ccc.Hex, hashType: 'type' as ccc.HashType, args: '0x' as ccc.Hex },
        contractScript: { codeHash: '0x', hashType: 'type', args: '0x' }
      }
      // format decimal from shannons
      const base = 10n ** 8n
      const ints = ckbRequired / base
      const fr = ckbRequired % base
      const dec = fr === 0n ? ints.toString() : `${ints.toString()}.${fr.toString().padStart(8,'0').replace(/0+$/, '')}`
      items.push({ token: ckbToken, amount: dec, scriptHash: 'CKB' })
    }

    debug.log('[InitialFunding] Auto-fill prepared items', items.map(i => ({ token: i.token?.symbol, amount: i.amount })))
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
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Funding Requirements
          </CardTitle>
          <CardDescription>Required token amounts by quest initial quotas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
              {ckbRequired > 0n && (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">CKB</span>
                      <span className="text-sm text-muted-foreground">
                        CKB (native)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Required pool balance for CKB rewards (initial quota)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">
                      {Number(ckbRequired) / (10 ** 8)} CKB
                    </div>
                    <Badge variant="secondary" className="mt-1">CKB pool funding after creation</Badge>
                  </div>
                </div>
              )}
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
      </Card>

      {/* Initial Funding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Initial Campaign Funding
          </CardTitle>
          <CardDescription>Provide initial CKB and UDT funding for rewards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CKB is now funded via the unified selector above (CKB included) */}
          {!allFunded && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Campaign needs funding for CKB and UDT rewards. You can fund it now or add funds later.
                <br className="mb-1" />
                <span className="text-sm">Note: You can only fund up to the required amount. Additional funding can be added after campaign creation.</span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end">
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
                      includeCKB={true}
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
                    {item.token?.symbol === 'CKB' && ckbRequired > 0n && (
                      <div className="space-y-1">
                        {(() => {
                          let providedCkb = 0n
                          const base = 10n ** 8n
                          fundingItems.forEach(it => {
                            if (it.token?.symbol !== 'CKB' || !it.amount) return
                            const t = it.amount.trim()
                            if (!/^\\d*(?:\\.\\d*)?$/.test(t)) return
                            const [ii, ff = ""] = t.split('.')
                            const fp = (ff + "0".repeat(8)).slice(0, 8)
                            try {
                              const ip = ii ? BigInt(ii) : 0n
                              const fpn = fp ? BigInt(fp) : 0n
                              providedCkb += ip * base + fpn
                            } catch {}
                          })
                          const remaining = ckbRequired > providedCkb ? ckbRequired - providedCkb : 0n
                          return (
                            <>
                              <div className="text-sm text-muted-foreground">Required: {Number(ckbRequired) / (10 ** 8)} CKB</div>
                              <div className="text-sm text-muted-foreground">Remaining to fund: {Number(remaining) / (10 ** 8)} CKB</div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                    
                    {item.token && item.scriptHash && item.token.symbol !== 'CKB' && !requiredFunding.has(item.scriptHash) && (
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
                
                {ckbRequired > 0n && (
                  <div className="flex items-center justify-between text-sm">
                    <span>CKB:</span>
                    <div className="flex items-center gap-2">
                      {(() => {
                        // compute provided CKB again for display
                        let providedCkb = 0n
                        fundingItems.forEach(it => {
                          if (it.token?.symbol !== 'CKB' || !it.amount) return
                          const t = it.amount.trim()
                          if (!/^\d*(?:\.\d*)?$/.test(t)) return
                          const [ii, ff = ""] = t.split('.')
                          const fp = (ff + "0".repeat(8)).slice(0, 8)
                          try {
                            const base = 10n ** 8n
                            const ip = ii ? BigInt(ii) : 0n
                            const fpn = fp ? BigInt(fp) : 0n
                            providedCkb += ip * base + fpn
                          } catch {}
                        })
                        const pct = ckbRequired > 0n ? Number((providedCkb * 100n) / ckbRequired) : 100
                        return (
                          <>
                            <span className={cn(
                              "font-mono",
                              providedCkb >= ckbRequired ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"
                            )}>
                              {Number(providedCkb) / (10 ** 8)} / {Number(ckbRequired) / (10 ** 8)}
                            </span>
                            <Badge variant={providedCkb >= ckbRequired ? "default" : "outline"} className="text-xs">{Math.min(100, pct)}%</Badge>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )}
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
