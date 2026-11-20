// Campaign utility functions
// These work with UI representations of campaigns

import { ccc } from "@ckb-ccc/connector-react";
import type { CampaignDataLike, ConnectedTypeIDLike } from "ssri-ckboost/types";
import { CampaignData, ConnectedTypeID } from "ssri-ckboost/types";
import { createScopedLogger } from "ssri-ckboost/logging";
import type { EndorserResolver, ResolvedEndorser } from "./endorser-resolver";
import { normalizeEndorserLockHash } from "./endorser-resolver";

const log = createScopedLogger("CampaignUtils");
import {
  decodeVerificationRequirements,
  getDifficultyString,
  getCampaignStatus,
  calculateCampaignTotalRewards,
} from "../types/index";

/**
 * Calculate days until campaign end date
 * @param endDate - Campaign end date string
 * @returns Number of days remaining (0 if expired)
 */
export function getDaysUntilEnd(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

// Type for UI-enriched campaign data
export type CampaignDisplay = CampaignDataLike & {
  // Additional computed/UI-specific fields only
  id: string; // Generated from typeHash
  typeHash: string; // From cell
  typeId: string | null; // From ConnectedTypeID args if available
  status: string; // Computed from dates
  isExpired: boolean; // Convenience flag when the campaign has ended
  startDate: string; // ISO string conversion
  endDate: string; // ISO string conversion
  createdAt: string; // ISO string conversion
  questsCount: number; // Computed from quests array
  questsCompleted: number; // From user records (future)
  totalRewards: {
    points: ccc.Num;
    tokens: Array<{
      symbol: string;
      amount: ccc.Num;
    }>;
  }; // Computed from quests
  verificationRequirements: Record<string, boolean>; // Decoded from bitmask
  difficulty: string; // Converted to string
  cell: ccc.Cell; // Original cell reference

  // Convenience accessors for nested fields
  title: string;
  shortDescription: string;
  categories: string[];
  endorserName: string;
  endorserLockHash: string | null;
  endorser: ResolvedEndorser | null;
  image: string;
};

/**
 * Convert Cell with CampaignData to UI display format
 * @param cell - Cell containing campaign data
 * @returns Campaign data with additional UI fields
 */
export function cellToCampaignDisplay(
  cell: ccc.Cell,
  options: { endorserResolver?: EndorserResolver } = {}
): CampaignDisplay {
  // Decode the campaign data from the cell
  const campaignData = CampaignData.decode(cell.outputData) as CampaignDataLike;

  // Extract metadata
  const metadata = campaignData.metadata;

  // Get type hash from the cell's type script
  const typeHash = cell.cellOutput.type?.hash() || "";

  // Try to extract type ID from ConnectedTypeID args
  let typeId: string | null = null;
  try {
    if (cell.cellOutput.type?.args) {
      const argsBytes = ccc.bytesFrom(cell.cellOutput.type.args);
      const connectedTypeId = ConnectedTypeID.decode(
        argsBytes
      ) as ConnectedTypeIDLike;
      typeId = ccc.hexFrom(connectedTypeId.type_id);
    }
  } catch (error) {
    // If decoding fails, type ID remains null
    log.log("Failed to extract type ID from campaign cell:", error);
  }

  const toTimestampMs = (value: ccc.NumLike | undefined) =>
    Number(value || 0) * 1000;

  // Convert timestamps to ISO date strings
  const startTimestampMs = toTimestampMs(campaignData.starting_time);
  const endTimestampMs = toTimestampMs(campaignData.ending_time);
  const createdTimestampMs = toTimestampMs(campaignData.created_at);

  const startDate = new Date(startTimestampMs).toISOString();
  const endDate = new Date(endTimestampMs).toISOString();
  const createdAt = new Date(createdTimestampMs).toISOString();

  // Calculate quest metrics
  const questsCount = campaignData.quests?.length || 0;
  const questsCompleted = 0; // This would come from user submission records

  // Get verification requirements
  const verificationBitmask = metadata.verification_requirements?.[0] || 0;
  const verificationRequirements =
    decodeVerificationRequirements(verificationBitmask);

  // Calculate total rewards
  const totalRewards = calculateCampaignTotalRewards(campaignData);

  // Get difficulty string
  const difficulty = getDifficultyString(metadata.difficulty || 1);

  // Get status based on dates and campaign status
  const status = getCampaignStatus(
    campaignData.starting_time,
    campaignData.ending_time
  );
  const isExpired = endTimestampMs > 0 && Date.now() >= endTimestampMs;

  const normalizedEndorserLockHash = normalizeEndorserLockHash(
    campaignData.endorser_lock_hash
  );
  const resolvedEndorser =
    options.endorserResolver?.resolve(normalizedEndorserLockHash) ?? null;
  const endorserName =
    resolvedEndorser?.name ??
    normalizedEndorserLockHash ??
    ccc.hexFrom(campaignData.endorser_lock_hash) ??
    "Unknown Endorser";

  return {
    // Spread the original campaign data
    ...campaignData,

    // Add computed/UI-specific fields
    id: typeId ? typeId.slice(0, 8) : typeHash.slice(0, 8), // Use first 8 chars of type ID (or type hash as fallback) as ID
    typeHash,
    typeId,
    status,
    isExpired,
    startDate,
    endDate,
    createdAt,
    questsCount,
    questsCompleted,
    totalRewards,
    verificationRequirements,
    difficulty: difficulty.toLowerCase(),
    cell,

    // Convenience accessors for commonly used nested fields
    title: metadata.title || "Untitled Campaign",
    shortDescription: metadata.short_description || "",
    categories: metadata.categories || [],
    endorserName,
    endorserLockHash: normalizedEndorserLockHash,
    endorser: resolvedEndorser,
    image: metadata.image_url || "/placeholder.svg",
  };
}

/**
 * Get derived status based on end date and current status
 * @param campaign - Campaign object with endDate and status
 * @returns Derived status string
 */
export function getDerivedStatus(campaign: {
  endDate: string;
  status: string;
}): string {
  const daysLeft = getDaysUntilEnd(campaign.endDate);
  if (daysLeft <= 0) return "completed";
  if (daysLeft <= 30) return "ending-soon";
  return campaign.status;
}

/**
 * Check if campaign is ending soon
 * @param campaign - Campaign object with endDate and status
 * @returns Boolean indicating if campaign is ending soon
 */
export function isEndingSoon(campaign: {
  endDate: string;
  status: string;
}): boolean {
  return getDerivedStatus(campaign) === "ending-soon";
}

/**
 * Format date for display
 * @param dateString - Date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
