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
  const { signer, protocolData } = useProtocol();
  const [userService, setUserService] = useState<UserService | null>(null);
  const [userInstance] = useState<ckboost.User | null>(null);
  const [currentUserData, setCurrentUserData] = useState<ReturnType<typeof ckboost.types.UserData.decode> | null>(null);
  const [currentUserTypeId, setCurrentUserTypeId] = useState<ccc.Hex | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize user service when signer and protocol data are available
  useEffect(() => {
    async function initializeUserService() {
      if (!signer || !protocolData) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Get user type code hash and protocol type hash from protocol data
        const userTypeCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash;
        
        // Get the protocol type hash (this is the type hash of the protocol cell)
        // The protocol cell should have a type script, and we need its hash
        // For ConnectedTypeID, we need the protocol's type script hash
        const protocolTypeArgs = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x";
        const protocolTypeHash = ccc.Script.from({
          codeHash: protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash,
          hashType: "type",
          args: protocolTypeArgs // The protocol's type_id from env
        }).hash();
        
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
  }, [signer, protocolData]);

  // Helper function to load current user data
  const loadCurrentUserData = async (service: UserService) => {
    if (!signer || !protocolData) return;
    
    try {
      console.log("[UserProvider] Starting to load user data...");
      const startTime = Date.now();
      
      const lockScript = (await signer.getRecommendedAddressObj()).script;
      const userTypeCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash;
      
      console.log("[UserProvider] Lock script hash:", lockScript.hash().slice(0, 10) + "...");
      console.log("[UserProvider] User type code hash:", userTypeCodeHash.slice(0, 10) + "...");
      
      // Import the new function for getting latest user cell
      const { getLatestUserCellByLock } = await import("../ckb/user-cells");
      
      // Get the latest user cell (handles multiple cells properly)
      const userCell = await getLatestUserCellByLock(lockScript, userTypeCodeHash, signer);
      
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
          
          setCurrentUserTypeId(typeId);
          setCurrentUserData(userData);
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

    try {
      setIsLoading(true);
      setError(null);
      
      // Use the unified method that handles both create and update
      const result = await userService.submitQuestWithAutoCreate(
        campaignTypeId,
        questId,
        submissionContent,
        userVerificationData
      );
      const txHash = result.txHash;
      
      // After submission, fetch the updated user data
      if (signer) {
        const lockScript = (await signer.getRecommendedAddressObj()).script;
        const lockHash = lockScript.hash();
        
        // getUserByLockHash is a private method, we need to use type assertion
        const userData = await (userService as unknown as {
          getUserByLockHash: (lockHash: ccc.Hex) => Promise<{
            cell: ccc.Cell;
            typeId: ccc.Hex | null;
            userData: ReturnType<typeof ckboost.types.UserData.decode> | null;
          } | null>
        }).getUserByLockHash(lockHash);
        if (userData) {
          setCurrentUserData(userData.userData);
          setCurrentUserTypeId(userData.typeId);
        }
      }
      
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
    const userCell = await fetchUserByTypeId(userTypeId, protocolData?.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash || "0x", signer!);
    if (!userCell) return null;
    return parseUserData(userCell);
  };

  const hasUserSubmittedQuest = async (
    userTypeId: ccc.Hex,
    campaignTypeId: ccc.Hex,
    questId: number
  ) => {
    if (!userService) {
      return false;
    }
    // Check if user has submitted by looking at their submission records
    const submissions = await userService.getUserSubmissionsWithContent(userTypeId);
    
    // Debug logging
    console.log("Checking submissions for quest", { 
      userTypeId: userTypeId.slice(0, 10) + "...",
      campaignTypeId: campaignTypeId,
      questId,
      totalSubmissions: submissions.length
    });
    
    const found = submissions.some(s => {
      // Normalize both campaign type IDs for comparison
      // Remove 0x prefix if present and compare
      const cleanSubmissionId = s.campaignTypeId.replace(/^0x/i, '').toLowerCase();
      const cleanCampaignId = campaignTypeId.replace(/^0x/i, '').toLowerCase();
      
      const isMatch = cleanSubmissionId === cleanCampaignId && s.questId === questId;
      
      console.log("Comparing submission:", {
        submissionCampaign: s.campaignTypeId,
        targetCampaign: campaignTypeId,
        cleanSubmission: cleanSubmissionId.slice(0, 10) + "...",
        cleanTarget: cleanCampaignId.slice(0, 10) + "...",
        submissionQuest: s.questId,
        targetQuest: questId,
        campaignMatch: cleanSubmissionId === cleanCampaignId,
        questMatch: s.questId === questId,
        overallMatch: isMatch
      });
      
      return isMatch;
    });
    
    console.log("Final result: user has submitted =", found);
    return found;
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