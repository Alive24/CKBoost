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


export const useVerification = () => {
  const { userService } = useUser();
  const { protocolCell } = useProtocol();
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
  // Load verification status on mount and when user service changes
  useEffect(() => {
    loadVerificationStatus();
  }, [loadVerificationStatus]);

  return {
    verificationStatus,
    isLoading,
    // Actions
    loadVerificationStatus,
    checkCampaignEligibility,
  };
};
