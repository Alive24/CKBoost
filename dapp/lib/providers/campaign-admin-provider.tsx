"use client"

import React, { createContext, useContext, useMemo } from "react"
import { ccc, ssri } from "@ckb-ccc/connector-react"
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
    
    if (!userTypeCodeHash || !campaignTypeCodeHash ) {
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

export function useCampaignAdmin(campaignTypeId?: ccc.Hex | string) {
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
        // Get the service's properties through proper getters
        const service = context.campaignAdminService
        
        if (!service) {
          throw new Error("Campaign admin service not available")
        }
        
        const signer = service.getSigner()
        const protocolCell = service.getProtocolCell()
        const campaignTypeCodeHash = service.getCampaignTypeCodeHash()
        
        if (!signer || !protocolCell) {
          throw new Error("Required dependencies not available")
        }
        
        // Fetch the campaign cell
        const { fetchCampaignByTypeId } = await import("@/lib/ckb/campaign-cells")
        const campaignCell = await fetchCampaignByTypeId(
          campaignTypeId as ccc.Hex,
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
        const network = deploymentManager.getCurrentNetwork();
        const campaignContractOutPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType");
        if (!campaignContractOutPoint) {
          setError("Campaign type contract code cell not found. Make sure the protocol contract is deployed and deployment information is available.");
          return;
        }
        const campaignInstance = new Campaign(
          campaignContractOutPoint,
          campaignTypeScript,
          protocolCell,
          { executor }
        )
        
        // Update the service with the campaign instance
        service.setCampaign(campaignInstance)
        
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