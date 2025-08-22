"use client"

import React, { createContext, useContext, useMemo } from "react"
import { ccc } from "@ckb-ccc/connector-react"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { FundingService } from "@/lib/services/funding-service"
import { deploymentManager } from "@/lib/ckb/deployment-manager"
import { debug } from "@/lib/utils/debug"

interface FundingContextType {
  fundingService: FundingService | null
  isLoading: boolean
}

const FundingContext = createContext<FundingContextType>({
  fundingService: null,
  isLoading: true
})

export function FundingProvider({ children }: { children: React.ReactNode }) {
  const signer = ccc.useSigner()
  const { protocolCell } = useProtocol()
  
  const fundingService = useMemo(() => {
    if (!signer || !protocolCell) {
      return null
    }

    // Get code hashes from deployment manager
    const network = deploymentManager.getCurrentNetwork()
    const campaignTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType")
    const campaignLockCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignLock")
    
    if (!campaignTypeCodeHash) {
      debug.warn("Campaign type contract not deployed")
      return null
    }
    
    // Campaign lock might not be deployed yet, use a placeholder
    const lockCodeHash = campaignLockCodeHash || "0x" + "00".repeat(32)
    
    return new FundingService(
      signer,
      campaignTypeCodeHash,
      lockCodeHash as ccc.Hex,
      protocolCell
    )
  }, [signer, protocolCell])

  const isLoading = !signer || !protocolCell

  return (
    <FundingContext.Provider value={{ fundingService, isLoading }}>
      {children}
    </FundingContext.Provider>
  )
}

export function useFunding() {
  const context = useContext(FundingContext)
  if (!context) {
    throw new Error("useFunding must be used within FundingProvider")
  }
  return context
}