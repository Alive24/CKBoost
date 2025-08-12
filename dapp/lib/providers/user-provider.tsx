"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/core";
import { ckboost } from "ssri-ckboost";
import { UserService } from "../services/user-service";
import { useProtocol } from "./protocol-provider";
import { useCcc } from "@ckb-ccc/connector-react";

interface UserContextType {
  userService: UserService | null;
  userInstance: ckboost.User | null;
  currentUserData: ReturnType<typeof ckboost.types.UserData.decode> | null;
  currentUserTypeId: ccc.Hex | null;
  submitQuest: (
    campaignTypeHash: ccc.Hex,
    questId: number,
    submissionContent: string
  ) => Promise<ccc.Hex>;
  getUserSubmissions: (userTypeId: ccc.Hex) => Promise<ReturnType<typeof ckboost.types.UserSubmissionRecord.decode>[]>;
  getUserData: (userTypeId: ccc.Hex) => Promise<ReturnType<typeof ckboost.types.UserData.decode> | null>;
  hasUserSubmittedQuest: (
    userTypeId: ccc.Hex,
    campaignTypeHash: ccc.Hex,
    questId: number
  ) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
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
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { signer, protocolData, userAddress } = useProtocol();
  const [userService, setUserService] = useState<UserService | null>(null);
  const [userInstance, setUserInstance] = useState<ckboost.User | null>(null);
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

        // Get user type code hash from protocol data
        const userTypeCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash;
        
        // Create user service
        const service = new UserService(signer, userTypeCodeHash);
        setUserService(service);

        // TODO: Initialize user instance with the code cell
        // This would require fetching the user type code cell outpoint
        // For now, we'll initialize it when needed

        // Try to fetch current user's data if they have a user cell
        if (userAddress) {
          const lockHash = ccc.Script.from({
            codeHash: userAddress.slice(0, 66) as ccc.Hex,
            hashType: "type",
            args: userAddress.slice(66) as ccc.Hex
          }).hash();

          const userData = await service.getUserByLockHash(lockHash);
          if (userData) {
            setCurrentUserData(userData.userData);
            setCurrentUserTypeId(userData.typeId);
          }
        }
      } catch (err) {
        console.error("Failed to initialize user service:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    initializeUserService();
  }, [signer, protocolData, userAddress]);

  const submitQuest = async (
    campaignTypeHash: ccc.Hex,
    questId: number,
    submissionContent: string
  ): Promise<ccc.Hex> => {
    if (!userService || !currentUserTypeId) {
      throw new Error("User service not initialized or user not found");
    }

    try {
      setIsLoading(true);
      setError(null);
      const txHash = await userService.submitQuest(
        campaignTypeHash,
        questId,
        submissionContent,
        currentUserTypeId
      );
      
      // Refresh user data after submission
      const updatedData = await userService.getUserData(currentUserTypeId);
      setCurrentUserData(updatedData);
      
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
    return userService.getUserSubmissions(userTypeId);
  };

  const getUserData = async (userTypeId: ccc.Hex) => {
    if (!userService) {
      return null;
    }
    return userService.getUserData(userTypeId);
  };

  const hasUserSubmittedQuest = async (
    userTypeId: ccc.Hex,
    campaignTypeHash: ccc.Hex,
    questId: number
  ) => {
    if (!userService) {
      return false;
    }
    return userService.hasUserSubmittedQuest(userTypeId, campaignTypeHash, questId);
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
      }}
    >
      {children}
    </UserContext.Provider>
  );
}