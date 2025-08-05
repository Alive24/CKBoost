"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { ccc } from "@ckb-ccc/connector-react";
import type {
  ProtocolDataLike,
  EndorserInfoLike,
  TippingProposalDataLike,
  CampaignDataLike,
  ProtocolData,
} from "ssri-ckboost/types";
import {
  ProtocolMetrics,
  ProtocolTransaction,
  ProtocolChanges,
} from "../types/protocol";
import { ProtocolService } from "../services/protocol-service";

// Types for protocol provider
interface ProtocolContextType {
  // Protocol data
  protocolData: ReturnType<typeof ProtocolData.decode> | null;
  metrics: ProtocolMetrics | null;
  transactions: ProtocolTransaction[];
  isLoading: boolean;
  error: string | null;

  // Protocol operations
  refreshProtocolData: () => Promise<void>;
  updateProtocol: (form: ProtocolDataLike) => Promise<ccc.Hex>;
  addEndorser: (form: EndorserInfoLike) => Promise<void>;
  editEndorser: (form: EndorserInfoLike) => Promise<void>;
  removeEndorser: (index: number) => Promise<void>;
  calculateChanges: (formData: unknown) => ProtocolChanges;

  // Helper getters
  getEndorser: (address: string) => EndorserInfoLike | undefined;
  getTippingProposal: (index: number) => TippingProposalDataLike | undefined;
  getApprovedCampaign: (id: string) => CampaignDataLike | undefined;

  // User-specific data
  userAddress: string | null;
  userBalance: string | null;
  isWalletConnected: boolean;
  isAdmin: boolean;
}

// Create context
const ProtocolContext = createContext<ProtocolContextType | undefined>(
  undefined
);

// Provider component
export function ProtocolProvider({ children }: { children: ReactNode }) {
  // Protocol data state
  const [protocolData, setProtocolData] = useState<ReturnType<
    typeof ProtocolData.decode
  > | null>(null);
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);
  const [transactions, setTransactions] = useState<ProtocolTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [protocolService, setProtocolService] =
    useState<ProtocolService | null>(null);

  // User state
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // CCC hooks
  const signer = ccc.useSigner();

  // Wallet connection state
  const isWalletConnected = !!signer;

  // Initialize protocol data
  useEffect(() => {
    const initializeProtocol = async () => {
      // If no signer, set loading to false and return
      if (!signer) {
        setIsLoading(false);
        setError("Please connect your wallet to view protocol data");
        setProtocolData(null);
        setMetrics(null);
        setTransactions([]);
        return;
      }

      try {
        const protocolService = new ProtocolService(signer);
        setProtocolService(protocolService);

        setIsLoading(true);
        setError(null);

        const [data, metricsData, transactionsData] = await Promise.all([
          protocolService.getProtocolData(),
          protocolService.getProtocolMetrics(),
          protocolService.getProtocolTransactions(),
        ]);

        setProtocolData(data);
        setMetrics(metricsData);
        setTransactions(transactionsData);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load protocol data";
        setError(errorMessage);
        console.error("Failed to initialize protocol data:", err);

        // For protocol cell not found errors or corrupted data, set data to null but keep the error
        // This allows the UI to show the deployment form
        if (
          errorMessage.includes("Protocol cell not found on blockchain") ||
          errorMessage.includes("No protocol cell exists") ||
          errorMessage.includes("Protocol cell data is corrupted") ||
          errorMessage.includes("incompatible")
        ) {
          setProtocolData(null);
          setMetrics(null);
          setTransactions([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeProtocol();
  }, [signer]);

  // Update user info when wallet connects
  useEffect(() => {
    if (!signer) {
      setUserAddress(null);
      setUserBalance(null);
      setIsAdmin(false);
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

        // Check if user is admin
        if (protocolData) {
          // Convert address to lock hash for admin check
          // This is a simplified check - in practice you'd need to derive the lock hash properly
          const userLockHash = addr; // Simplified - would need proper conversion
          const isUserAdmin =
            protocolData.protocol_config.admin_lock_hash_vec.some(
              (adminHash: ccc.HexLike) => {
                const hashHex =
                  typeof adminHash === "string"
                    ? adminHash
                    : ccc.hexFrom(new Uint8Array(adminHash));
                return hashHex
                  .toLowerCase()
                  .includes(userLockHash.toLowerCase());
              }
            );
          setIsAdmin(isUserAdmin);
        }
      } catch (err) {
        console.error("Failed to update user info:", err);
      }
    };

    updateUserInfo();
  }, [signer, protocolData]);

  const updateProtocol = async (form: ProtocolDataLike): Promise<ccc.Hex> => {
    if (!protocolService) {
      throw new Error("Protocol service not initialized");
    }
    return protocolService.updateProtocol(form);
  };

  // Protocol operations
  const refreshProtocolData = async (): Promise<void> => {
    try {
      if (!protocolService) {
        throw new Error("Protocol service not initialized");
      }

      setIsLoading(true);
      setError(null);

      const [data, metricsData, transactionsData] = await Promise.all([
        protocolService.getProtocolData(),
        protocolService.getProtocolMetrics(),
        protocolService.getProtocolTransactions(),
      ]);

      setProtocolData(data);
      setMetrics(metricsData);
      setTransactions(transactionsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh protocol data"
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const addEndorser = async (form: EndorserInfoLike): Promise<void> => {
    if (!signer) {
      throw new Error("Wallet connection required");
    }

    try {
      if (!protocolService) {
        throw new Error("Protocol service not initialized");
      }

      const currentProtocolData = protocolData;
      if (!currentProtocolData) {
        throw new Error("Protocol data not available");
      }

      const newProtocolData = {
        ...currentProtocolData,
        endorsers_whitelist: [...currentProtocolData.endorsers_whitelist, form],
      };

      setProtocolData(
        newProtocolData as ReturnType<typeof ProtocolData.decode>
      );
      // Refresh data after successful update
    } catch (err) {
      console.error("Failed to add endorser:", err);
      throw err;
    }
  };

  const editEndorser = async (form: EndorserInfoLike): Promise<void> => {
    if (!signer) {
      throw new Error("Wallet connection required");
    }

    try {
      const currentProtocolData = protocolData;
      if (!currentProtocolData) {
        throw new Error("Protocol data not available");
      }

      const newProtocolData = {
        ...currentProtocolData,
        endorsers_whitelist: currentProtocolData.endorsers_whitelist.map((e) =>
          e.endorser_lock_hash === form.endorser_lock_hash ? form : e
        ),
      };

      setProtocolData(
        newProtocolData as ReturnType<typeof ProtocolData.decode>
      );
      // Refresh data after successful update
    } catch (err) {
      console.error("Failed to edit endorser:", err);
      throw err;
    }
  };

  const removeEndorser = async (index: number): Promise<void> => {
    if (!signer) {
      throw new Error("Wallet connection required");
    }

    try {
      if (!protocolData) {
        throw new Error("Protocol data not available");
      }

      const newProtocolData = {
        ...protocolData,
        endorsers_whitelist: protocolData.endorsers_whitelist.filter(
          (e, i) => i !== index
        ),
      };

      // Refresh data after successful update
      await refreshProtocolData();

      setProtocolData(newProtocolData as ReturnType<typeof ProtocolData.decode>);

    } catch (err) {
      console.error("Failed to remove endorser:", err);
      throw err;
    }
  };


  const calculateChanges = (formData: unknown): ProtocolChanges => {
    if (!protocolData) {
      throw new Error("Protocol data not available");
    }

    return calculateChanges(formData);
  };

  // Helper functions
  const getEndorser = (address: string): EndorserInfoLike | undefined => {
    return protocolData?.endorsers_whitelist?.find(
      (e: EndorserInfoLike) => e.endorser_lock_hash === address
    );
  };

  const getTippingProposal = (index: number): TippingProposalDataLike | undefined => {
    return protocolData?.tipping_proposals?.[index] as TippingProposalDataLike | undefined;
  };

  const getApprovedCampaign = (id: string): CampaignDataLike | undefined => {
    return protocolData?.campaigns_approved?.find((c: CampaignDataLike) => c.status === id);
  };

  const value: ProtocolContextType = {
    // Protocol data
    protocolData,
    metrics,
    transactions,
    isLoading,
    error,

    // Protocol operations
    refreshProtocolData,
    updateProtocol,
    addEndorser,
    editEndorser,
    removeEndorser,
    calculateChanges,

    // Helper getters
    getEndorser,
    getTippingProposal,
    getApprovedCampaign,

    // User-specific data
    userAddress,
    userBalance,
    isWalletConnected,
    isAdmin,
  };

  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  );
}

// Hook to use protocol context
export function useProtocol() {
  const context = useContext(ProtocolContext);
  if (context === undefined) {
    throw new Error("useProtocol must be used within a ProtocolProvider");
  }
  return context;
}

// Helper hook for admin-specific operations
export function useProtocolAdmin() {
  const context = useProtocol();

  if (!context.isWalletConnected) {
    throw new Error("Wallet connection required for admin operations");
  }

  if (!context.isAdmin) {
    throw new Error("Admin privileges required for this operation");
  }

  return {
    updateProtocol: context.updateProtocol,
    addEndorser: context.addEndorser,
    editEndorser: context.editEndorser,
    removeEndorser: context.removeEndorser,
    refreshProtocolData: context.refreshProtocolData,
    protocolData: context.protocolData,
    metrics: context.metrics,
    isLoading: context.isLoading,
    error: context.error,
  };
}

// Helper hook for endorser-specific data
export function useEndorser(address?: string) {
  const { getEndorser, protocolData, isLoading } = useProtocol();

  const endorser = address ? getEndorser(address) : undefined;
  const allEndorsers = protocolData?.endorsers_whitelist || [];

  return {
    endorser,
    allEndorsers,
    isLoading,
    exists: !!endorser,
    totalEndorsers: allEndorsers.length,
  };
}

// Helper hook for tipping proposal data
export function useTippingProposals() {
  const { protocolData, isLoading } = useProtocol();

  const proposals = protocolData?.tipping_proposals || [];
  const pendingProposals = proposals.filter(
    (p) => !p.approval_transaction_hash && p.tipping_transaction_hash !== undefined
  );
  const completedProposals = proposals.filter(
    (p) => !!p.approval_transaction_hash && p.tipping_transaction_hash !== undefined
  );

  return {
    proposals,
    pendingProposals,
    completedProposals,
    isLoading,
    totalProposals: proposals.length,
    pendingCount: pendingProposals.length,
    completedCount: completedProposals.length,
  };
}
