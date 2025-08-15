"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/core";
import { ckboost } from "ssri-ckboost";
import { UserService } from "../services/user-service";
import { useProtocol } from "./protocol-provider";
import { fetchUserByTypeId, parseUserData, extractTypeIdFromUserCell } from "../ckb/user-cells";

interface UserContextType {
  userService: UserService | null;
  userInstance: ckboost.User | null;
  currentUserData: ReturnType<typeof ckboost.types.UserData.decode> | null;
  currentUserTypeId: ccc.Hex | null;
  currentUserSubmissions: Map<string, boolean>; // Map of "campaignTypeId:questId" -> submitted
  submitQuest: (
    campaignTypeId: ccc.Hex,
    questId: number,
    submissionContent: string,
    userVerificationData?: {
      name?: string;
      email?: string;
      twitter?: string;
      discord?: string;
    }
  ) => Promise<ccc.Hex>;
  getUserSubmissions: (userTypeId: ccc.Hex) => Promise<ReturnType<typeof ckboost.types.UserSubmissionRecord.decode>[]>;
  getUserData: (userTypeId: ccc.Hex) => Promise<ReturnType<typeof ckboost.types.UserData.decode> | null>;
  hasUserSubmittedQuest: (
    userTypeId: ccc.Hex,
    campaignTypeId: ccc.Hex,
    questId: number
  ) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  refreshUserData: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  userService: null,
  userInstance: null,
  currentUserData: null,
  currentUserTypeId: null,
  currentUserSubmissions: new Map(),
  submitQuest: async () => {
    throw new Error("UserProvider not initialized");
  },
  getUserSubmissions: async () => [],
  getUserData: async () => null,
  hasUserSubmittedQuest: async () => false,
  isLoading: false,
  error: null,
  refreshUserData: async () => {},
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { signer, protocolData, protocolCell } = useProtocol();
  const [userService, setUserService] = useState<UserService | null>(null);
  const [userInstance] = useState<ckboost.User | null>(null);
  const [currentUserData, setCurrentUserData] = useState<ReturnType<typeof ckboost.types.UserData.decode> | null>(null);
  const [currentUserTypeId, setCurrentUserTypeId] = useState<ccc.Hex | null>(null);
  const [currentUserSubmissions, setCurrentUserSubmissions] = useState<Map<string, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize user service when signer, protocol data, and protocol cell are available
  useEffect(() => {
    async function initializeUserService() {
      if (!signer || !protocolData || !protocolCell) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Get user type code hash from protocol data
        const userTypeCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash;
        
        // Get the protocol type hash from the actual protocol cell
        // This is the hash that user cells need to reference in their ConnectedTypeID
        if (!protocolCell || !protocolCell.cellOutput.type) {
          throw new Error("Protocol cell or its type script not found");
        }
        const protocolTypeHash = protocolCell.cellOutput.type.hash();
        
        console.log("[UserProvider] Protocol type hash from actual cell:", protocolTypeHash);
        
        // Create user service with both hashes
        const service = new UserService(signer, userTypeCodeHash, protocolTypeHash);
        setUserService(service);

        // Load current user data
        await loadCurrentUserData(service);
      } catch (err) {
        console.error("Failed to initialize user service:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    initializeUserService();
  }, [signer, protocolData, protocolCell]);

  // Helper function to load current user data
  const loadCurrentUserData = async (service: UserService) => {
    if (!signer || !protocolData) return;
    
    try {
      console.log("[UserProvider] Starting to load user data...");
      const startTime = Date.now();
      
      const lockScript = (await signer.getRecommendedAddressObj()).script;
      const userTypeCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash;
      
      // Get protocol type hash from the service (it should already be initialized)
      const protocolTypeHash = service.getProtocolTypeHash();
      
      console.log("[UserProvider] Lock script hash:", lockScript.hash().slice(0, 10) + "...");
      console.log("[UserProvider] User type code hash:", userTypeCodeHash.slice(0, 10) + "...");
      console.log("[UserProvider] Protocol type hash:", protocolTypeHash.slice(0, 10) + "...");
      
      // Import the new function for getting latest user cell
      const { getLatestUserCellByLock } = await import("../ckb/user-cells");
      
      // Get the latest user cell connected to the current protocol
      const userCell = await getLatestUserCellByLock(lockScript, userTypeCodeHash, signer, protocolTypeHash);
      
      if (userCell) {
        console.log("[UserProvider] Found user cell:", {
          cellOutPoint: userCell.outPoint,
          typeArgs: userCell.cellOutput.type?.args?.slice(0, 20) + "...",
          timeElapsed: `${Date.now() - startTime}ms`
        });
        
        // Extract type ID and parse user data
        const typeId = extractTypeIdFromUserCell(userCell);
        const userData = parseUserData(userCell);
        
        if (typeId && userData) {
          console.log("[UserProvider] Successfully loaded user data:", {
            typeId: typeId.slice(0, 10) + "...",
            submissions: userData.submission_records.length,
            totalPoints: userData.total_points_earned,
            totalTime: `${Date.now() - startTime}ms`
          });
          
          // Build the submissions map for quick lookup
          const submissionsMap = new Map<string, boolean>();
          userData.submission_records.forEach(record => {
            // Convert campaign_type_id to hex string if it's bytes
            let campaignTypeId: string;
            if (typeof record.campaign_type_id === 'string') {
              campaignTypeId = record.campaign_type_id;
            } else if (record.campaign_type_id && typeof record.campaign_type_id === 'object' && ArrayBuffer.isView(record.campaign_type_id)) {
              campaignTypeId = ccc.hexFrom(record.campaign_type_id);
            } else {
              try {
                campaignTypeId = ccc.hexFrom(ccc.bytesFrom(record.campaign_type_id));
              } catch {
                campaignTypeId = "0x";
              }
            }
            
            const key = `${campaignTypeId}:${record.quest_id}`;
            submissionsMap.set(key, true);
          });
          
          console.log("[UserProvider] Built submissions map with", submissionsMap.size, "entries");
          
          setCurrentUserTypeId(typeId);
          setCurrentUserData(userData);
          setCurrentUserSubmissions(submissionsMap);
        }
      } else {
        console.log(`[UserProvider] No user cell found for wallet (searched for ${Date.now() - startTime}ms)`);
      }
    } catch (err) {
      console.error("[UserProvider] Failed to load user data:", err);
    }
  };

  const submitQuest = async (
    campaignTypeId: ccc.Hex,
    questId: number,
    submissionContent: string,
    userVerificationData?: {
      name?: string;
      email?: string;
      twitter?: string;
      discord?: string;
    }
  ): Promise<ccc.Hex> => {
    if (!userService) {
      throw new Error("User service not initialized");
    }
    
    if (!protocolCell) {
      throw new Error("Protocol cell not loaded");
    }

    try {
      setIsLoading(true);
      setError(null);
      
      // Use the unified method that handles both create and update
      const result = await userService.submitQuestWithAutoCreate(
        campaignTypeId,
        questId,
        submissionContent,
        protocolCell,
        userVerificationData
      );
      const txHash = result.txHash;
      
      // After submission, wait a bit for transaction to be confirmed then refresh user data
      // The transaction needs time to be confirmed on the blockchain
      console.log("[UserProvider] Transaction submitted, waiting for confirmation before refreshing user data...");
      
      // Wait 3 seconds for transaction confirmation
      setTimeout(async () => {
        console.log("[UserProvider] Refreshing user data after transaction...");
        await refreshUserData();
      }, 3000);
      
      return txHash;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to submit quest";
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const getUserSubmissions = async (userTypeId: ccc.Hex) => {
    if (!userService) {
      return [];
    }
    // Get submissions with content from Nostr if applicable
    const submissions = await userService.getUserSubmissionsWithContent(userTypeId);
    return submissions.map(s => ({
      campaign_type_id: s.campaignTypeId as ccc.Hex,
      quest_id: s.questId,
      submission_timestamp: BigInt(s.timestamp),
      submission_content: s.submissionContent
    }));
  };

  const getUserData = async (userTypeId: ccc.Hex) => {
    if (!userService) {
      return null;
    }
    // Fetch user cell and parse data
    const userCell = await fetchUserByTypeId(
      userTypeId, 
      protocolData?.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash || "0x", 
      signer!,
      userService?.getProtocolTypeHash()  // Pass protocol type hash to ensure we get the right cell
    );
    if (!userCell) return null;
    return parseUserData(userCell);
  };

  const hasUserSubmittedQuest = async (
    userTypeId: ccc.Hex,
    campaignTypeId: ccc.Hex,
    questId: number
  ) => {
    // Use the cached submissions map for instant lookup
    const key = `${campaignTypeId}:${questId}`;
    const hasSubmitted = currentUserSubmissions.has(key);
    
    console.log("[UserProvider] Checking submission status:", {
      campaignTypeId: campaignTypeId.slice(0, 10) + "...",
      questId,
      key,
      hasSubmitted,
      cachedEntries: currentUserSubmissions.size
    });
    
    return hasSubmitted;
  };

  // Add refresh function to manually reload user data
  const refreshUserData = async () => {
    if (userService) {
      await loadCurrentUserData(userService);
    }
  };

  return (
    <UserContext.Provider
      value={{
        userService,
        userInstance,
        currentUserData,
        currentUserTypeId,
        currentUserSubmissions,
        submitQuest,
        getUserSubmissions,
        getUserData,
        hasUserSubmittedQuest,
        isLoading,
        error,
        refreshUserData,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}