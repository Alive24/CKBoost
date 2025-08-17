"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { ccc, ssri } from "@ckb-ccc/connector-react";
import { CampaignService } from "../services/campaign-service";
import { Campaign } from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { fetchCampaignByTypeId, extractTypeIdFromCampaignCell } from "../ckb/campaign-cells";
import { debug } from "../utils/debug";
import { useProtocol } from "./protocol-provider";

// Types for campaign provider
interface CampaignContextType {
  campaigns: ccc.Cell[];
  featuredCampaigns: ccc.Cell[];
  isLoading: boolean;
  error: string | null;

  // Campaign operations
  getCampaignByTypeHash: (typeHash: ccc.Hex) => ccc.Cell | undefined;
  refreshCampaigns: () => Promise<void>;

  // User-specific data
  userAddress: string | null;
  userBalance: string | null;
  isWalletConnected: boolean;
}

// Create context
const CampaignContext = createContext<CampaignContextType | undefined>(
  undefined
);

// Provider component
export function CampaignProvider({ children }: { children: ReactNode }) {
  // Campaign data state
  const [campaigns, setCampaigns] = useState<ccc.Cell[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User state
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);

  // Get protocol data from context
  const { protocolCell, protocolData } = useProtocol();

  // CCC hooks
  const signer = ccc.useSigner();

  // Wallet connection state
  const isWalletConnected = !!signer;

  // Initialize campaigns data
  useEffect(() => {
    const initializeCampaigns = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!signer) {
          debug.warn("No signer available, skipping campaign load");
          setIsLoading(false);
          return;
        }

        // Use protocol data from context instead of fetching again
        if (protocolCell && protocolData) {
          debug.log("Found approved campaigns:", protocolData.campaigns_approved);
          
          // Get campaign code hash from protocol config
          const campaignCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash;
          
          // Fetch each approved campaign
          const approvedCampaignCells: ccc.Cell[] = [];
          
          for (const identifier of protocolData.campaigns_approved || []) {
            try {
              debug.log("Fetching campaign with identifier:", identifier);
              
              // Only fetch by type_id (type hash method has been removed)
              const campaignCell = await fetchCampaignByTypeId(
                identifier as ccc.Hex,
                campaignCodeHash as ccc.Hex,
                signer,
                protocolCell
              );
              
              if (campaignCell) {
                approvedCampaignCells.push(campaignCell);
                debug.log("Loaded campaign by type ID:", identifier);
              } else {
                debug.warn("Campaign not found with type ID:", identifier);
                // Note: Old campaigns using type hash won't be loaded anymore
              }
            } catch (error) {
              debug.error(`Failed to fetch campaign ${identifier}:`, error);
            }
          }
          
          debug.log(`Loaded ${approvedCampaignCells.length} approved campaigns`);
          setCampaigns(approvedCampaignCells);
        } else {
          debug.warn("Protocol data not available yet");
          // Fallback to mock data or empty
          const allCampaigns = await CampaignService.getAllCampaigns(signer);
          setCampaigns(allCampaigns);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load campaigns"
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeCampaigns();
  }, [signer, protocolCell, protocolData]);

  // Update user info when wallet connects
  useEffect(() => {
    if (!signer) {
      setUserAddress(null);
      setUserBalance(null);
      return;
    }

    const updateUserInfo = async () => {
      try {
        // Get user address
        const addr = await signer.getRecommendedAddress();
        setUserAddress(addr);

        // Get user balance
        const balance = await signer.getBalance();
        setUserBalance(ccc.fixedPointToString(balance));
      } catch (err) {
        console.error("Failed to update user info:", err);
      }
    };

    updateUserInfo();
  }, [signer]);

  // Helper functions
  const getCampaignByTypeHash = (typeHash: ccc.Hex): ccc.Cell | undefined => {
    return campaigns.find((c) => c.cellOutput.type?.codeHash === typeHash);
  };

  const refreshCampaigns = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      if (!signer) {
        debug.warn("No signer available, skipping campaign refresh");
        setIsLoading(false);
        return;
      }

      // Use protocol data from context
      if (protocolCell && protocolData) {
        const campaignCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash;
        
        const approvedCampaignCells: ccc.Cell[] = [];
        
        for (const identifier of protocolData.campaigns_approved || []) {
          try {
            // Only fetch by type_id (type hash method has been removed)
            const campaignCell = await fetchCampaignByTypeId(
              identifier as ccc.Hex,
              campaignCodeHash as ccc.Hex,
              signer,
              protocolCell
            );
            
            if (campaignCell) {
              approvedCampaignCells.push(campaignCell);
            }
          } catch (error) {
            debug.error(`Failed to fetch campaign ${identifier}:`, error);
          }
        }
        
        setCampaigns(approvedCampaignCells);
      } else {
        // Fallback to campaign service
        const allCampaigns = await CampaignService.getAllCampaigns(signer);
        setCampaigns(allCampaigns);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh campaigns"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Featured campaigns (first 4)
  const featuredCampaigns = campaigns.slice(0, 4);

  const value: CampaignContextType = {
    campaigns,
    featuredCampaigns,
    isLoading,
    error,
    getCampaignByTypeHash,
    refreshCampaigns,
    userAddress,
    userBalance,
    isWalletConnected,
  };

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
}

// Hook to use campaign context
export function useCampaigns() {
  const context = useContext(CampaignContext);
  if (context === undefined) {
    throw new Error("useCampaigns must be used within a CampaignProvider");
  }
  return context;
}

// Helper hook for campaign-specific data
export function useCampaign(protocolCell: ccc.Cell | null, typeHash?: ccc.Hex) {
  const executorUrl =
  process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
  const executor = new ssri.ExecutorJsonRpc(executorUrl);
  const signer = ccc.useSigner();
  const { getCampaignByTypeHash, isLoading } = useCampaigns();

  // Return early if signer or protocolCell is not available
  if (!signer || !protocolCell) {
    return {
      campaign: null,
      campaignService: null,
      campaignCell: undefined,
      isLoading: !protocolCell, // Loading if protocol cell is not yet available
      error: !signer ? "Wallet not connected" : null
    };
  }

  const network = deploymentManager.getCurrentNetwork();
  const outPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType");
  if (!outPoint) {
    throw new Error("Campaign type contract code cell not found. Make sure the protocol contract is deployed and deployment information is available.");
  }
  const deployment = deploymentManager.getCurrentDeployment(network, "ckboostCampaignType");
  
  let campaignCell: ccc.Cell | undefined
  let campaign: Campaign;
  let campaignService: CampaignService;
  let campaignTypeScript: ccc.Script;

  // If no type hash, creating a new campaign
  if (!typeHash) {
    campaignTypeScript = ccc.Script.from({
      codeHash: deployment?.typeHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
      hashType: "type" as const,
      args: "0x", // Empty args - SSRI will calculate and fill the Connected Type ID
    });
    campaign = new Campaign(outPoint, campaignTypeScript, protocolCell,{
      executor: executor,
    });
    campaignService = new CampaignService(signer, campaign, protocolCell);
  } else {
    campaignCell = getCampaignByTypeHash(typeHash);
    if (!campaignCell?.outPoint) {
      throw new Error("Campaign not found");
    }
    if (!campaignCell?.cellOutput.type) {
      throw new Error("Campaign type not found");
    }
    campaign = new Campaign(
      campaignCell?.outPoint,
      campaignCell?.cellOutput.type,
      protocolCell,
      {
        executor: executor,
      }
    )
  }
  campaignService = new CampaignService(signer, campaign, protocolCell);
  return {
    campaign,
    campaignService,
    campaignCell,
    isLoading,
    error: null
  };
}
