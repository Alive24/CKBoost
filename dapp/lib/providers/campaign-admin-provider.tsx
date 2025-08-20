"use client"

import React, { createContext, useContext, useMemo } from "react"
import { ccc } from "@ckb-ccc/connector-react"
import { ssri } from "@ckb-ccc/ssri"
import { useProtocol } from "@/lib/providers/protocol-provider"
import { CampaignAdminService } from "@/lib/services/campaign-admin-service"
import { deploymentManager } from "@/lib/ckb/deployment-manager"
import { Campaign } from "ssri-ckboost"

interface CampaignAdminContextType {
  campaignAdminService: CampaignAdminService | null
  campaignInstance: Campaign | null
  isLoading: boolean
}

const CampaignAdminContext = createContext<CampaignAdminContextType>({
  campaignAdminService: null,
  campaignInstance: null,
  isLoading: true
})

export function CampaignAdminProvider({ children }: { children: React.ReactNode }) {
  const signer = ccc.useSigner()
  const { protocolCell } = useProtocol()
  
  // Create executor directly since there's no useExecutor hook
  const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
  const executor = useMemo(() => new ssri.ExecutorJsonRpc(executorUrl), [executorUrl])
  
  const { campaignAdminService, campaignInstance } = useMemo(() => {
    if (!signer || !protocolCell || !executor) {
      return { campaignAdminService: null, campaignInstance: null }
    }

    // Get code hashes and deployment info from deployment manager
    const network = deploymentManager.getCurrentNetwork()
    const userTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostUserType")
    const campaignTypeCodeHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType")
    const campaignOutPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType")
    
    if (!userTypeCodeHash || !campaignTypeCodeHash || !campaignOutPoint) {
      console.warn("Required contracts not deployed")
      return { campaignAdminService: null, campaignInstance: null }
    }

    // Extract protocol type hash from protocol cell
    const protocolTypeHash = protocolCell.cellOutput.type?.hash()
    if (!protocolTypeHash) {
      console.warn("Protocol type hash not found")
      return { campaignAdminService: null, campaignInstance: null }
    }

    // Create CampaignAdminService without a specific Campaign instance
    // Campaign instances will be created per-campaign using useCampaignAdmin hook
    const service = new CampaignAdminService(
      signer,
      userTypeCodeHash,
      protocolTypeHash,
      campaignTypeCodeHash,
      protocolCell,
      campaignOutPoint,
      null // No generic campaign instance
    )
    
    return { campaignAdminService: service, campaignInstance: null }
  }, [signer, protocolCell, executor])

  const isLoading = !signer || !protocolCell || !executor

  return (
    <CampaignAdminContext.Provider value={{ campaignAdminService, campaignInstance, isLoading }}>
      {children}
    </CampaignAdminContext.Provider>
  )
}

export function useCampaignAdmin(campaignTypeId?: ccc.Hex) {
  const context = useContext(CampaignAdminContext)
  if (!context) {
    throw new Error("useCampaignAdmin must be used within CampaignAdminProvider")
  }
  
  // If a campaignTypeId is provided, create a Campaign instance for that specific campaign
  const [campaign, setCampaign] = React.useState<Campaign | null>(null)
  const [isLoadingCampaign, setIsLoadingCampaign] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  React.useEffect(() => {
    if (!campaignTypeId || !context.campaignAdminService || campaignTypeId === 'new') {
      setCampaign(null)
      return
    }
    
    const loadCampaign = async () => {
      setIsLoadingCampaign(true)
      setError(null)
      
      try {
        // Get the service's internal properties we need
        const service = context.campaignAdminService
        
        // Access the private properties through a proper interface
        interface ServiceInternals {
          signer: ccc.Signer
          protocolCell: ccc.Cell | null
          campaignTypeCodeHash: ccc.Hex
          campaignOutPoint: ccc.OutPointLike
          campaign: Campaign | null
        }
        
        const serviceInternals = service as unknown as ServiceInternals
        const signer = serviceInternals.signer
        const protocolCell = serviceInternals.protocolCell
        const campaignTypeCodeHash = serviceInternals.campaignTypeCodeHash
        const campaignOutPoint = serviceInternals.campaignOutPoint
        
        if (!signer || !protocolCell) {
          throw new Error("Required dependencies not available")
        }
        
        // Fetch the campaign cell
        const { fetchCampaignByTypeId } = await import("@/lib/ckb/campaign-cells")
        const campaignCell = await fetchCampaignByTypeId(
          campaignTypeId,
          campaignTypeCodeHash,
          signer,
          protocolCell
        )
        
        if (!campaignCell) {
          throw new Error("Campaign not found")
        }
        
        // Extract the type script from the campaign cell
        const campaignTypeScript = campaignCell.cellOutput.type
        if (!campaignTypeScript) {
          throw new Error("Campaign cell missing type script")
        }
        
        // Create Campaign SSRI instance
        const executor = new ssri.ExecutorJsonRpc(
          process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
        )
        
        const campaignInstance = new Campaign(
          campaignOutPoint,
          campaignTypeScript,
          protocolCell,
          { executor }
        )
        
        // Update the service with the campaign instance
        serviceInternals.campaign = campaignInstance
        
        setCampaign(campaignInstance)
      } catch (err) {
        console.error("Failed to load campaign:", err)
        setError(err instanceof Error ? err.message : "Failed to load campaign")
        setCampaign(null)
      } finally {
        setIsLoadingCampaign(false)
      }
    }
    
    loadCampaign()
  }, [campaignTypeId, context.campaignAdminService])
  
  return {
    ...context,
    campaign,
    isLoadingCampaign: context.isLoading || isLoadingCampaign,
    error
  }
}