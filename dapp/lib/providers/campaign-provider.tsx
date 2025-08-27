"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { ccc, ssri } from "@ckb-ccc/connector-react";
import { CampaignService } from "../services/campaign-service";
import { Campaign } from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { fetchCampaignByTypeId } from "../ckb/campaign-cells";
import { debug } from "../utils/debug";
import { formatSSRIError } from "../utils/ssri-error-handler";
import { useProtocol } from "./protocol-provider";

// Types for campaign provider
interface CampaignContextType {
  campaigns: ccc.Cell[];
  featuredCampaigns: ccc.Cell[];
  isLoading: boolean;
  error: string | null;

  // Campaign operations
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
        const errorMessage = formatSSRIError({
          operation: "loading campaigns",
          context: { protocolAvailable: !!protocolData },
          originalError: err
        });
        setError(errorMessage);
        debug.error("Failed to load campaigns:", err);
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
export function useCampaign(protocolCell: ccc.Cell | null, campaignTypeId?: ccc.Hex) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignService, setCampaignService] = useState<CampaignService | null>(null);
  const [campaignCell, setCampaignCell] = useState<ccc.Cell | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signer = ccc.useSigner();
  
  const executor = useMemo(() => {
    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    return new ssri.ExecutorJsonRpc(executorUrl);
  }, []);

  useEffect(() => {
    // Reset states when dependencies change
    setCampaign(null);
    setCampaignService(null);
    setCampaignCell(undefined);
    setError(null);

    // Return early if basic requirements not met
    if (!signer || !protocolCell) {
      setIsLoading(false);
      setError(!signer ? "Wallet not connected" : null);
      return;
    }

    const network = deploymentManager.getCurrentNetwork();
    const outPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType");
    if (!outPoint) {
      setError("Campaign type contract code cell not found. Make sure the protocol contract is deployed and deployment information is available.");
      setIsLoading(false);
      return;
    }
    const deployment = deploymentManager.getCurrentDeployment(network, "ckboostCampaignType");

    // If no campaignTypeId, creating a new campaign
    if (!campaignTypeId) {
      try {
        const campaignTypeScript = ccc.Script.from({
          codeHash: deployment?.typeHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
          hashType: "type" as const,
          args: "0x", // Empty args - SSRI will calculate and fill the Connected Type ID
        });

        const newCampaign = new Campaign(outPoint, campaignTypeScript, protocolCell, {
          executor: executor,
        });
        const newCampaignService = new CampaignService(signer, newCampaign, protocolCell);

        setCampaign(newCampaign);
        setCampaignService(newCampaignService);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create campaign instance");
        setIsLoading(false);
      }
    } else {
      // For existing campaigns, fetch the campaign cell asynchronously using campaignTypeId
      setIsLoading(true);
      
      const fetchExistingCampaign = async () => {
        try {
          // Fetch campaign cell by type_id (using existing utility)
          const campaignCodeHash = deployment?.typeHash;
          if (!campaignCodeHash) {
            throw new Error("Campaign type code hash not found in deployment");
          }

          const fetchedCampaignCell = await fetchCampaignByTypeId(
            campaignTypeId, // This is the type_id from ConnectedTypeID, not typeHash
            campaignCodeHash as ccc.Hex,
            signer,
            protocolCell
          );

          if (!fetchedCampaignCell) {
            throw new Error("Campaign not found with the provided campaignTypeId");
          }

          // Extract the campaign's type script (which contains ConnectedTypeID args)
          const campaignTypeScript = fetchedCampaignCell.cellOutput.type;
          if (!campaignTypeScript) {
            throw new Error("Campaign cell missing type script");
          }

          // Create Campaign SSRI instance with the actual campaign's type script
          const existingCampaign = new Campaign(
            outPoint, 
            campaignTypeScript, // Use fetched campaign's type script with proper ConnectedTypeID args
            protocolCell,
            { executor: executor }
          );

          const existingCampaignService = new CampaignService(signer, existingCampaign, protocolCell);

          setCampaignCell(fetchedCampaignCell);
          setCampaign(existingCampaign);
          setCampaignService(existingCampaignService);
          setIsLoading(false);
        } catch (err) {
          debug.error("Failed to fetch existing campaign:", err);
          setError(err instanceof Error ? err.message : "Failed to fetch campaign");
          setIsLoading(false);
        }
      };

      fetchExistingCampaign();
    }
  }, [signer, protocolCell, campaignTypeId, executor]);

  return {
    campaign,
    campaignService,
    campaignCell,
    isLoading,
    error
  };
}
