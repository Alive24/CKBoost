// React hook for managing verification state and operations
import { useState, useEffect, useCallback } from "react";
import { useUser } from "../providers/user-provider";
import { useProtocol } from "../providers/protocol-provider";
import { createScopedLogger } from "ssri-ckboost";
import type { VerificationStatus } from "../types/identity";

export type { VerificationStatus } from "../types/identity";


const log = createScopedLogger("useVerification");

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
      
      log.log("Loaded verification status", {
        verificationFlags: status.verification_flags.toString(2),
        telegram: status.telegram,
        twitter: status.twitter,
        discord: status.discord,
      });
    } catch (error) {
      log.error("Failed to load verification status", error);
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
