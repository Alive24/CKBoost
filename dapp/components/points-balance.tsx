"use client"

import React, { useState, useEffect } from "react"
import { ccc } from "@ckb-ccc/connector-react"
import { Trophy, Coins } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { fetchUserPointsBalance, formatPointsBalance } from "@/lib/ckb/points-balance"
import { debug } from "@/lib/utils/debug"

export function PointsBalance() {
  const { protocolCell } = useProtocol()
  const signer = ccc.useSigner()
  const { client } = ccc.useCcc()
  const [balance, setBalance] = useState<bigint | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadBalance = async () => {
      if (!signer || !client || !protocolCell) {
        setBalance(null)
        return
      }

      try {
        setIsLoading(true)
        
        // Get user's lock script
        const userLockScript = (await signer.getRecommendedAddressObj()).script
        
        // Get protocol type hash from the protocol cell
        const protocolTypeHash = protocolCell.cellOutput.type?.hash()
        if (!protocolTypeHash) {
          debug.warn("Protocol type hash not found")
          setBalance(BigInt(0))
          return
        }

        // Fetch Points balance
        const pointsBalance = await fetchUserPointsBalance(
          client,
          userLockScript,
          protocolTypeHash
        )
        
        setBalance(pointsBalance)
      } catch (error) {
        debug.error("Failed to load Points balance:", error)
        setBalance(BigInt(0))
      } finally {
        setIsLoading(false)
      }
    }

    loadBalance()
    
    // Refresh balance every 30 seconds
    const interval = setInterval(loadBalance, 30000)
    return () => clearInterval(interval)
  }, [signer, client, protocolCell])

  // Don't show anything if wallet not connected
  if (!signer) {
    return null
  }

  // Show loading state
  if (isLoading && balance === null) {
    return (
      <Badge variant="secondary" className="bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800">
        <div className="animate-pulse flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" />
          <span className="text-xs">Loading...</span>
        </div>
      </Badge>
    )
  }

  // Show balance
  return (
    <Badge 
      variant="secondary" 
      className="bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800"
    >
      <div className="flex items-center gap-1.5">
        <Coins className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        <span className="font-semibold text-purple-700 dark:text-purple-300">
          {balance !== null ? formatPointsBalance(balance) : "0"}
        </span>
        <span className="text-xs text-purple-600 dark:text-purple-400">Points</span>
      </div>
    </Badge>
  )
}