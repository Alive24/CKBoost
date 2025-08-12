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
import { DeploymentManager, deploymentManager } from "../ckb/deployment-manager";
import { fetchProtocolCell } from "../ckb/protocol-cells";
import { fetchCampaignByTypeHash } from "../ckb/campaign-cells";
import { ProtocolData } from "ssri-ckboost/types";
import { debug } from "../utils/debug";

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

        // First, fetch the protocol cell to get approved campaigns
        try {
          const protocolCell = await fetchProtocolCell(signer);
          
          if (protocolCell) {
            const protocolData = ProtocolData.decode(protocolCell.outputData);
            debug.log("Found approved campaigns:", protocolData.campaigns_approved);
            
            // Fetch each approved campaign
            const approvedCampaignCells: ccc.Cell[] = [];
            
            for (const campaignTypeHash of protocolData.campaigns_approved || []) {
              try {
                debug.log("Fetching campaign with type hash:", campaignTypeHash);
                const campaignCell = await fetchCampaignByTypeHash(campaignTypeHash as ccc.Hex, signer);
                
                if (campaignCell) {
                  approvedCampaignCells.push(campaignCell);
                  debug.log("Loaded campaign:", campaignTypeHash);
                } else {
                  debug.warn("Campaign not found:", campaignTypeHash);
                }
              } catch (error) {
                debug.error(`Failed to fetch campaign ${campaignTypeHash}:`, error);
              }
            }
            
            debug.log(`Loaded ${approvedCampaignCells.length} approved campaigns`);
            setCampaigns(approvedCampaignCells);
          } else {
            debug.warn("Protocol cell not found");
            // Fallback to mock data or empty
            const allCampaigns = await CampaignService.getAllCampaigns(signer);
            setCampaigns(allCampaigns);
          }
        } catch (protocolError) {
          debug.error("Failed to fetch protocol data:", protocolError);
          // Fallback to campaign service
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
  }, [signer]);

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

      // Fetch approved campaigns from protocol
      try {
        const protocolCell = await fetchProtocolCell(signer);
        
        if (protocolCell) {
          const protocolData = ProtocolData.decode(protocolCell.outputData);
          
          const approvedCampaignCells: ccc.Cell[] = [];
          
          for (const campaignTypeHash of protocolData.campaigns_approved || []) {
            try {
              const campaignCell = await fetchCampaignByTypeHash(campaignTypeHash as ccc.Hex, signer);
              
              if (campaignCell) {
                approvedCampaignCells.push(campaignCell);
              }
            } catch (error) {
              debug.error(`Failed to fetch campaign ${campaignTypeHash}:`, error);
            }
          }
          
          setCampaigns(approvedCampaignCells);
        } else {
          // Fallback to campaign service
          const allCampaigns = await CampaignService.getAllCampaigns(signer);
          setCampaigns(allCampaigns);
        }
      } catch (protocolError) {
        debug.error("Failed to fetch protocol data:", protocolError);
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

  const network = DeploymentManager.getCurrentNetwork();
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
