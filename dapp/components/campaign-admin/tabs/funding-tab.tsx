"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, RefreshCw, Wallet, AlertTriangle, Info, Lock, Unlock } from "lucide-react"
import { useCampaignAdmin } from "@/lib/providers/campaign-admin-provider"
import { CampaignDataLike, UDTAssetLike } from "ssri-ckboost/types"
import { FundingDashboard } from "../funding/funding-dashboard"
import { UDTSelector } from "../quest/udt-selector"
import { udtRegistry, UDTToken } from "@/lib/services/udt-registry"
import { useMultipleUDTBalances } from "@/hooks/use-udt-balance"
import { debug } from "@/lib/utils/debug"
import { ccc } from "@ckb-ccc/connector-react"
import { cn } from "@/lib/utils"
import { FundingService } from "@/lib/services/funding-service"
import { deploymentManager } from "@/lib/ckb/deployment-manager"

interface FundingTabProps {
  campaignTypeId: ccc.Hex
}

interface LockedUDT {
  token: UDTToken
  amount: bigint
  scriptHash: string
}

export function FundingTab({ campaignTypeId }: FundingTabProps) {
  const { campaignAdminService, campaign: campaignInstance, isLoadingCampaign: isServiceLoading, error: adminError } = useCampaignAdmin(campaignTypeId)
  const signer = ccc.useSigner()
  
  const [campaignData, setCampaignData] = useState<CampaignDataLike | null>(null)
  const [lockedUDTs, setLockedUDTs] = useState<Map<string, bigint>>(new Map())
  const [lockedUDTsList, setLockedUDTsList] = useState<LockedUDT[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Fund dialog state
  const [isFundDialogOpen, setIsFundDialogOpen] = useState(false)
  const [fundingToken, setFundingToken] = useState<{ token?: UDTToken; amount: string }>({ amount: "" })
  const [isFunding, setIsFunding] = useState(false)
  
  // Unlock dialog state
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false)
  const [unlockingToken, setUnlockingToken] = useState<LockedUDT | null>(null)
  const [unlockAmount, setUnlockAmount] = useState("")
  const [isUnlocking, setIsUnlocking] = useState(false)

  // Get all tokens that might be needed for the campaign
  const requiredTokens = useMemo(() => {
    return campaignData?.quests?.reduce((tokens, quest) => {
      quest.rewards_on_completion?.forEach(reward => {
        reward.udt_assets?.forEach(asset => {
          const script = ccc.Script.from(asset.udt_script)
          const scriptHash = script.hash()
          const token = udtRegistry.getTokenByScriptHash(scriptHash)
          if (token && !tokens.some(t => t.symbol === token.symbol)) {
            tokens.push(token)
          }
        })
      })
      return tokens
    }, [] as UDTToken[]) || []
  }, [campaignData])

  const balances = useMultipleUDTBalances(requiredTokens, signer)

  const loadFundingData = useCallback(async () => {
    if (!campaignAdminService) {
      setError("Campaign admin service not available")
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      
      // Load campaign data and submissions
      const { campaignData: campaign } = await campaignAdminService.fetchCampaignSubmissions(campaignTypeId)
      setCampaignData(campaign)
      
      // Extract tokens from the loaded campaign
      const tokens: UDTToken[] = []
      campaign?.quests?.forEach(quest => {
        quest.rewards_on_completion?.forEach(reward => {
          reward.udt_assets?.forEach(asset => {
            const script = ccc.Script.from(asset.udt_script)
            const scriptHash = script.hash()
            const token = udtRegistry.getTokenByScriptHash(scriptHash)
            if (token && !tokens.some(t => t.symbol === token.symbol)) {
              tokens.push(token)
            }
          })
        })
      })
      
      // Try to load actual locked UDT amounts from campaign cells
      let actualLockedUDTs = new Map<string, bigint>()
      let actualLockedList: LockedUDT[] = []
      
      try {
        // Get code hashes
        const network = deploymentManager.getCurrentNetwork()
        const campaignTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType")
        const campaignLockCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignLock")
        
        if (campaignTypeCodeHash && campaignLockCodeHash && campaignInstance?.connectedProtocolCell) {
          // Create funding service to check funding status
          const fundingService = new FundingService(
            signer,
            campaignTypeCodeHash,
            campaignLockCodeHash,
            campaignInstance.connectedProtocolCell
          )
          
          // Get actual funding status
          const { fundedAssets } = await fundingService.getCampaignFundingStatus(campaignTypeId)
          
          // Convert funded assets to our format
          for (const [udtTypeHash, amount] of fundedAssets.entries()) {
            // Find matching token from our registry
            const token = tokens.find(t => {
              const script = ccc.Script.from({
                codeHash: t.script.codeHash,
                hashType: t.script.hashType,
                args: t.script.args
              })
              return script.hash() === udtTypeHash
            })
            
            if (token) {
              actualLockedUDTs.set(udtTypeHash, amount)
              actualLockedList.push({
                token,
                amount,
                scriptHash: udtTypeHash
              })
            }
          }
        }
      } catch (error) {
        debug.log("Could not load actual locked UDTs, using mock data:", error)
      }
      
      // If no actual locked UDTs found, use mock data for demo
      if (actualLockedList.length === 0) {
        tokens.forEach(token => {
          const script = ccc.Script.from({
            codeHash: token.script.codeHash,
            hashType: token.script.hashType,
            args: token.script.args
          })
          const scriptHash = script.hash()
          
          // Mock: Assume 1000 tokens locked for testing
          const amount = udtRegistry.parseAmount("1000", token)
          actualLockedUDTs.set(scriptHash, amount)
          actualLockedList.push({
            token,
            amount,
            scriptHash
          })
        })
      }
      
      setLockedUDTs(actualLockedUDTs)
      setLockedUDTsList(actualLockedList)
      
      debug.log("Loaded funding data", {
        campaign: campaign?.metadata?.title,
        lockedTokens: actualLockedList.length
      })
    } catch (error) {
      debug.error("Failed to load funding data", error)
      setError(error instanceof Error ? error.message : "Failed to load funding data")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [campaignAdminService, campaignTypeId])

  useEffect(() => {
    loadFundingData()
  }, [loadFundingData])

  const handleRefresh = () => {
    setIsRefreshing(true)
    loadFundingData()
    balances.refresh()
  }

  const handleFund = async () => {
    if (!fundingToken.token || !fundingToken.amount || !signer || !campaignInstance) {
      return
    }

    setIsFunding(true)
    try {
      debug.log("Funding campaign with:", {
        token: fundingToken.token.symbol,
        amount: fundingToken.amount
      })
      
      // Get the protocol cell from the campaign admin service
      const protocolCell = campaignInstance.connectedProtocolCell
      if (!protocolCell) {
        throw new Error("Protocol cell not available")
      }
      
      // Get code hashes from deployment manager
      const network = deploymentManager.getCurrentNetwork()
      const campaignTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType")
      const campaignLockCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignLock")
      
      if (!campaignTypeCodeHash) {
        throw new Error("Campaign type contract not deployed")
      }
      
      // Campaign lock might not be deployed yet, use a placeholder
      // In production, this should be a proper campaign lock contract
      const lockCodeHash = campaignLockCodeHash || "0x" + "00".repeat(32)
      
      // Create funding service
      const fundingService = new FundingService(
        signer,
        campaignTypeCodeHash,
        lockCodeHash as ccc.Hex,
        protocolCell
      )
      
      // Prepare UDT asset for funding
      const udtAsset: UDTAssetLike = {
        udt_script: {
          codeHash: fundingToken.token.script.codeHash,
          hashType: fundingToken.token.script.hashType,
          args: fundingToken.token.script.args
        },
        amount: udtRegistry.parseAmount(fundingToken.amount, fundingToken.token)
      }
      
      // Fund the campaign
      const txHash = await fundingService.fundCampaignWithUDT(
        campaignTypeId,
        [udtAsset]
      )
      
      debug.log("Campaign funded successfully:", txHash)
      alert(`Campaign funded successfully!\n\nTransaction: ${txHash}`)
      
      setIsFundDialogOpen(false)
      setFundingToken({ amount: "" })
      handleRefresh()
    } catch (error) {
      debug.error("Failed to fund campaign", error)
      alert(`Failed to fund campaign: ${error instanceof Error ? error.message : "Unknown error"}`)
      setError(error instanceof Error ? error.message : "Failed to fund campaign")
    } finally {
      setIsFunding(false)
    }
  }

  const handleUnlock = async () => {
    if (!unlockingToken || !unlockAmount) {
      return
    }

    setIsUnlocking(true)
    try {
      // TODO: Implement actual UDT unlocking from campaign
      debug.log("Unlocking from campaign:", {
        token: unlockingToken.token.symbol,
        amount: unlockAmount
      })
      
      // Mock success
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      setIsUnlockDialogOpen(false)
      setUnlockingToken(null)
      setUnlockAmount("")
      handleRefresh()
    } catch (error) {
      debug.error("Failed to unlock funds", error)
      setError(error instanceof Error ? error.message : "Failed to unlock funds")
    } finally {
      setIsUnlocking(false)
    }
  }

  if (isServiceLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading funding data...</span>
      </div>
    )
  }

  if (adminError || error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {adminError || error}
        </AlertDescription>
      </Alert>
    )
  }

  if (!campaignData) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          No campaign data available
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campaign Funding</h2>
          <p className="text-muted-foreground">
            Manage UDT tokens locked for quest rewards
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            onClick={() => setIsFundDialogOpen(true)}
            disabled={!signer}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Funds
          </Button>
        </div>
      </div>

      {/* Funding Dashboard */}
      <FundingDashboard
        campaign={campaignData}
        lockedUDTs={lockedUDTs}
      />

      {/* Locked Tokens Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Locked Tokens
          </CardTitle>
          <CardDescription>
            Manage UDT tokens locked in this campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lockedUDTsList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No tokens locked yet</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsFundDialogOpen(true)}
                disabled={!signer}
              >
                <Plus className="w-4 h-4 mr-2" />
                Lock Your First Token
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {lockedUDTsList.map((locked) => (
                <div
                  key={locked.scriptHash}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{locked.token.symbol}</span>
                      <span className="text-sm text-muted-foreground">
                        {locked.token.name}
                      </span>
                    </div>
                    <div className="font-mono text-sm">
                      {udtRegistry.formatAmount(locked.amount, locked.token)} {locked.token.symbol}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUnlockingToken(locked)
                      setIsUnlockDialogOpen(true)
                    }}
                    disabled={!signer}
                  >
                    <Unlock className="w-4 h-4 mr-2" />
                    Unlock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fund Dialog */}
      <Dialog open={isFundDialogOpen} onOpenChange={setIsFundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Funds to Campaign</DialogTitle>
            <DialogDescription>
              Lock UDT tokens to this campaign for quest rewards
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <UDTSelector
              value={fundingToken}
              onChange={setFundingToken}
              signer={signer}
              showBalance={true}
              label="Token to Lock"
              placeholder="Enter amount to lock"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFundDialogOpen(false)}
              disabled={isFunding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFund}
              disabled={isFunding || !fundingToken.token || !fundingToken.amount}
            >
              {isFunding ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Locking...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Lock Tokens
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Dialog */}
      <Dialog open={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Tokens</DialogTitle>
            <DialogDescription>
              Unlock UDT tokens from this campaign
            </DialogDescription>
          </DialogHeader>
          
          {unlockingToken && (
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Token</label>
                <div className="mt-1 p-3 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{unlockingToken.token.symbol}</span>
                    <span className="text-sm text-muted-foreground">
                      {unlockingToken.token.name}
                    </span>
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="text-muted-foreground">Available: </span>
                    <span className="font-mono">
                      {udtRegistry.formatAmount(unlockingToken.amount, unlockingToken.token)} {unlockingToken.token.symbol}
                    </span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Amount to Unlock</label>
                <input
                  type="text"
                  value={unlockAmount}
                  onChange={(e) => setUnlockAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="mt-1 w-full px-3 py-2 border rounded-lg font-mono"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUnlockDialogOpen(false)
                setUnlockingToken(null)
                setUnlockAmount("")
              }}
              disabled={isUnlocking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnlock}
              disabled={isUnlocking || !unlockAmount}
            >
              {isUnlocking ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Unlocking...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  Unlock
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}