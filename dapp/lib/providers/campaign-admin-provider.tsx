"use client"

import React, { createContext, useContext, useMemo } from "react"
import { ccc } from "@ckb-ccc/connector-react"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { CampaignAdminService } from "@/lib/services/campaign-admin-service"
import { deploymentManager } from "@/lib/ckb/deployment-manager"

interface CampaignAdminContextType {
  campaignAdminService: CampaignAdminService | null
  isLoading: boolean
}

const CampaignAdminContext = createContext<CampaignAdminContextType>({
  campaignAdminService: null,
  isLoading: true
})

export function CampaignAdminProvider({ children }: { children: React.ReactNode }) {
  const signer = ccc.useSigner()
  const { protocolCell } = useProtocol()
  
  const campaignAdminService = useMemo(() => {
    if (!signer || !protocolCell) {
      return null
    }

    // Get code hashes from deployment manager
    const network = deploymentManager.getCurrentNetwork()
    const userTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostUserType")
    const campaignTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType")
    
    if (!userTypeCodeHash || !campaignTypeCodeHash) {
      console.warn("Required contracts not deployed")
      return null
    }

    // Extract protocol type hash from protocol cell
    const protocolTypeHash = protocolCell.cellOutput.type?.hash()
    if (!protocolTypeHash) {
      console.warn("Protocol type hash not found")
      return null
    }

    return new CampaignAdminService(
      signer,
      userTypeCodeHash,
      protocolTypeHash,
      campaignTypeCodeHash,
      protocolCell
    )
  }, [signer, protocolCell])

  const isLoading = !signer || !protocolCell

  return (
    <CampaignAdminContext.Provider value={{ campaignAdminService, isLoading }}>
      {children}
    </CampaignAdminContext.Provider>
  )
}

export function useCampaignAdmin() {
  const context = useContext(CampaignAdminContext)
  if (!context) {
    throw new Error("useCampaignAdmin must be used within CampaignAdminProvider")
  }
  return context
}