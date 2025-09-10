// React hook for managing verification state and operations
import { useState, useEffect, useCallback } from "react";
import { useUser } from "../providers/user-provider";
import { useProtocol } from "../providers/protocol-provider";
import { debug } from "../utils/debug";

export interface VerificationStatus {
  telegram: boolean;
  twitter: boolean;
  discord: boolean;
  reddit: boolean;
  kyc: boolean;
  did: boolean;
  manual_review: boolean;
  verification_flags: number;
  telegram_data?: {
    username: string;
    chat_id: string;
    verified_at: number;
  };
}

export interface TelegramVerificationFlow {
  verificationCode?: string;
  botUrl?: string;
  instructions?: string;
  isPolling: boolean;
  error?: string;
}
export type TransactionLikeJson = any

export const useVerification = () => {
  const { userService } = useUser();
  const { protocolCell } = useProtocol();
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [telegramFlow, setTelegramFlow] = useState<TelegramVerificationFlow>({
    isPolling: false,
  });

  // Load verification status
  const loadVerificationStatus = useCallback(async () => {
    if (!userService) return;

    try {
      setIsLoading(true);
      const status = await userService.getUserVerificationStatus();
      setVerificationStatus(status);
      
      debug.log("Loaded verification status", {
        verificationFlags: status.verification_flags.toString(2),
        telegram: status.telegram,
        twitter: status.twitter,
        discord: status.discord,
      });
    } catch (error) {
      debug.error("Failed to load verification status", error);
    } finally {
      setIsLoading(false);
    }
  }, [userService]);

  // Initialize Telegram verification flow
  const initializeTelegramVerification = useCallback(async (telegramUsername: string, walletAddress?: string) => {
    // For initial verification, we only need the wallet address
    // The actual on-chain update will happen after verification is complete
    if (!walletAddress) {
      throw new Error("Please connect your wallet first");
    }

    try {
      setIsLoading(true);
      setTelegramFlow(prev => ({ ...prev, error: undefined }));
      
      // Call Netlify function to initialize verification
      // Use environment variable for local dev, or relative path for production
      const baseUrl = process.env.NEXT_PUBLIC_NETLIFY_DEV_URL || '';
      
      const response = await fetch(`${baseUrl}/.netlify/functions/verification-api/telegram/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          telegramUsername,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to initialize verification");
      }

      const result = await response.json();
      
      setTelegramFlow({
        verificationCode: result.data.verificationCode,
        botUrl: result.data.botUrl,
        instructions: result.data.instructions,
        isPolling: false,
        error: undefined,
      });

      debug.log("Telegram verification initialized", {
        walletAddress: walletAddress.slice(0, 10) + "...",
        verificationCode: result.data.verificationCode,
        botUrl: result.data.botUrl,
      });

      return result.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize verification";
      setTelegramFlow(prev => ({ ...prev, error: errorMessage }));
      debug.error("Failed to initialize Telegram verification", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Complete Telegram verification on-chain
  const completeTelegramVerification = useCallback(async (verificationData: {
    chatId: string;
    username: string;
    firstName: string;
    lastName?: string;
    authData?: Record<string, unknown>;
    serverSignature?: string;
  }) => {
    if (!userService || !protocolCell) {
      throw new Error("Required services not available");
    }

    try {
      const txHash = await userService.updateTelegramVerification(
        BigInt(verificationData.chatId),
        verificationData.username,
        protocolCell,
        verificationData.authData,
        verificationData.serverSignature
      );

      debug.log("Telegram verification completed on-chain", {
        txHash: txHash.slice(0, 10) + "...",
        username: verificationData.username,
      });

      return txHash;
    } catch (error) {
      debug.error("Failed to complete Telegram verification on-chain", error);
      throw error;
    }
  }, [userService, protocolCell]);

  const prepareTelegramVerificationTx = useCallback(async (verificationData: {
    chatId: string;
    username: string;
    authData?: Record<string, unknown>;
  }): Promise<TransactionLikeJson | null> => {
    if (!userService || !protocolCell) return null;
    return await userService.prepareTelegramVerificationTx(
      BigInt(verificationData.chatId),
      verificationData.username,
      protocolCell,
      verificationData.authData
    );
  }, [userService, protocolCell]);

  // Start polling for Telegram verification completion
  const startTelegramPolling = useCallback(async (walletAddress: string) => {
    if (!walletAddress || telegramFlow.isPolling) return;

    setTelegramFlow(prev => ({ ...prev, isPolling: true }));

    const pollInterval = setInterval(async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_NETLIFY_DEV_URL || '';
        
        const response = await fetch(`${baseUrl}/.netlify/functions/verification-api/telegram/status/${encodeURIComponent(walletAddress)}`);
        
        if (!response.ok) {
          throw new Error("Failed to check verification status");
        }

        const result = await response.json();
        
        if (result.success && result.data.verified) {
          // Verification completed!
          debug.log("Telegram verification completed", result.data);
          
          // Complete the verification on-chain
          await completeTelegramVerification(result.data);
          
          // Stop polling
          clearInterval(pollInterval);
          setTelegramFlow(prev => ({ ...prev, isPolling: false }));
          
          // Reload verification status
          await loadVerificationStatus();
        }
      } catch (error) {
        debug.error("Error polling verification status", error);
      }
    }, 3000); // Poll every 3 seconds

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setTelegramFlow(prev => ({ ...prev, isPolling: false }));
    }, 10 * 60 * 1000);

  }, [telegramFlow.isPolling, loadVerificationStatus, completeTelegramVerification]);

  // Check campaign eligibility
  const checkCampaignEligibility = useCallback(async (
    campaignVerificationRequirements: number[]
  ) => {
    if (!userService) {
      return {
        eligible: false,
        userVerificationFlags: 0,
        requiredFlags: campaignVerificationRequirements,
        missingVerifications: [],
      };
    }

    return await userService.checkCampaignEligibility(campaignVerificationRequirements);
  }, [userService]);

  // Clear telegram flow error
  const clearTelegramError = useCallback(() => {
    setTelegramFlow(prev => ({ ...prev, error: undefined }));
  }, []);

  // Load verification status on mount and when user service changes
  useEffect(() => {
    loadVerificationStatus();
  }, [loadVerificationStatus]);

  return {
    verificationStatus,
    isLoading,
    telegramFlow,
    
    // Actions
    loadVerificationStatus,
    initializeTelegramVerification,
    startTelegramPolling,
    completeTelegramVerification,
    prepareTelegramVerificationTx,
    checkCampaignEligibility,
    clearTelegramError,
  };
};
