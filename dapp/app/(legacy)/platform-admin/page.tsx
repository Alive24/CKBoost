"use client";

import { useState, useEffect, useMemo, JSX } from "react";import { ccc } from "@ckb-ccc/connector-react";
import {
  fetchCampaignsConnectedToProtocol,
  extractTypeIdFromCampaignCell,
  isCampaignApproved,
} from "@/lib/ckb/campaign-cells";
import {
  parseUserData,
  extractTypeIdFromUserCell,
  isUserCellConnectedToProtocol,
} from "@/lib/ckb/user-cells";
import {
  CampaignData,
  EndorserInfoLike,
  type CampaignDataLike,
} from "ssri-ckboost/types";
import {
  createScopedLogger,
  createTimer,
  formatDateConsistent,
} from "ssri-ckboost";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/ui/page-loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shield,
  Plus,
  Edit,
  Eye,
  Users,
  Trophy,
  CheckCircle,
  Clock,
  DollarSign,
  X,
  FileText,
  Star,
  Zap,
  Search,
  Filter,
  MessageCircle,
  Fingerprint,
} from "lucide-react";
import Link from "next/link";
import { ProtocolManagement } from "@/components/admin/protocol-management";
import { AchievementsManagement } from "@/components/admin/achievements-management";
import { useProtocol } from "@/lib/providers/protocol-provider";
import {
  useTippingsData,
  type TippingInfo,
} from "@/lib/providers/tipping-provider";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { udtRegistry } from "@/lib/services/udt-registry";

const log = createScopedLogger("PlatformAdminPage");

// Hub Admin configuration
const CURRENT_USER = {
  id: 1,
  name: "Hub Administrator",
  email: "admin@ckboost.com",
  address:
    "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2jk6pyw9vlnfakx7vp4t5lxg0lzvvsp3c5adflu",
  avatar: "HA",
  role: "platform_admin",
  permissions: [
    "review_campaigns",
    "manage_users",
    "review_tips",
    "manage_leaderboard",
  ],
};

// Mock leaderboard rewards to configure - Enhanced version
const LEADERBOARD_REWARDS = [
  {
    id: 1,
    period: "Monthly - February 2024",
    status: "upcoming",
    type: "monthly",
    startDate: "2024-02-01",
    endDate: "2024-02-29",
    totalPrize: {
      CKB: 1000,
      SPORE: 500,
      DEFI: 200,
    },
    distributionModel: "tiered",
    tiers: [
      {
        rank: "1st Place",
        minRank: 1,
        maxRank: 1,
        rewards: { CKB: 400, SPORE: 200, DEFI: 80 },
        recipients: 1,
        percentage: 40,
      },
      {
        rank: "2nd Place",
        minRank: 2,
        maxRank: 2,
        rewards: { CKB: 250, SPORE: 125, DEFI: 50 },
        recipients: 1,
        percentage: 25,
      },
      {
        rank: "3rd Place",
        minRank: 3,
        maxRank: 3,
        rewards: { CKB: 150, SPORE: 75, DEFI: 30 },
        recipients: 1,
        percentage: 15,
      },
      {
        rank: "Top 10",
        minRank: 4,
        maxRank: 10,
        rewards: { CKB: 25, SPORE: 12, DEFI: 5 },
        recipients: 7,
        percentage: 17.5,
      },
      {
        rank: "Top 50",
        minRank: 11,
        maxRank: 50,
        rewards: { CKB: 4, SPORE: 2, DEFI: 1 },
        recipients: 40,
        percentage: 16,
      },
    ],
    eligibilityRules: {
      minPoints: 100,
      minQuests: 3,
      verificationRequired: true,
      acceptableVerifications: ["telegram", "kyc", "did", "manual"], // Which verification methods are accepted
      excludeManualReview: false, // Some campaigns may refuse manual review
      excludeNewUsers: true, // Users joined less than 7 days ago
      excludeSuspended: true,
    },
    autoDistribution: true,
    distributionDate: "2024-03-01",
    specialBonus: {
      enabled: true,
      type: "streak_bonus",
      description: "10% bonus for users with 7+ day streak",
      multiplier: 1.1,
      condition: "streak >= 7",
    },
  },
  {
    id: 2,
    period: "Q1 2024 Grand Championship",
    status: "active",
    type: "quarterly",
    startDate: "2024-01-01",
    endDate: "2024-03-31",
    totalPrize: {
      CKB: 5000,
      SPORE: 2500,
      DEFI: 1000,
      NFT: 50, // Special NFT rewards
    },
    distributionModel: "percentage",
    tiers: [
      {
        rank: "Champion",
        minRank: 1,
        maxRank: 1,
        rewards: { CKB: 1500, SPORE: 750, DEFI: 300, NFT: 1 },
        recipients: 1,
        percentage: 30,
      },
      {
        rank: "Elite",
        minRank: 2,
        maxRank: 5,
        rewards: { CKB: 500, SPORE: 250, DEFI: 100, NFT: 1 },
        recipients: 4,
        percentage: 40,
      },
      {
        rank: "Advanced",
        minRank: 6,
        maxRank: 20,
        rewards: { CKB: 100, SPORE: 50, DEFI: 20 },
        recipients: 15,
        percentage: 30,
      },
    ],
    eligibilityRules: {
      minPoints: 500,
      minQuests: 10,
      verificationRequired: true,
      acceptableVerifications: ["kyc", "did"], // High-value campaign excludes telegram and manual review
      excludeManualReview: true, // This campaign refuses manual review
      excludeNewUsers: true,
      excludeSuspended: true,
      minCampaignsParticipated: 2,
    },
    autoDistribution: false,
    distributionDate: "2024-04-05",
    specialBonus: {
      enabled: true,
      type: "community_bonus",
      description: "25% bonus for top community contributors",
      multiplier: 1.25,
      condition: "community_score >= 80",
    },
  },
  {
    id: 3,
    period: "Weekly Sprint - Week 8",
    status: "completed",
    type: "weekly",
    startDate: "2024-02-19",
    endDate: "2024-02-25",
    totalPrize: {
      CKB: 200,
      SPORE: 100,
    },
    distributionModel: "fixed",
    tiers: [
      {
        rank: "Winner",
        minRank: 1,
        maxRank: 1,
        rewards: { CKB: 80, SPORE: 40 },
        recipients: 1,
        percentage: 40,
      },
      {
        rank: "Runner-up",
        minRank: 2,
        maxRank: 3,
        rewards: { CKB: 40, SPORE: 20 },
        recipients: 2,
        percentage: 40,
      },
      {
        rank: "Participant",
        minRank: 4,
        maxRank: 10,
        rewards: { CKB: 10, SPORE: 5 },
        recipients: 7,
        percentage: 35,
      },
    ],
    eligibilityRules: {
      minPoints: 50,
      minQuests: 1,
      verificationRequired: true,
      acceptableVerifications: ["telegram", "kyc", "did"], // Weekly campaign accepts most but not manual review
      excludeManualReview: true, // Weekly campaigns typically want faster verification
      excludeNewUsers: false,
      excludeSuspended: true,
    },
    autoDistribution: true,
    distributionDate: "2024-02-26",
    actualDistribution: {
      completed: true,
      date: "2024-02-26",
      totalRecipients: 10,
      totalDistributed: { CKB: 200, SPORE: 100 },
    },
  },
];

type VerificationStatus = {
  telegram: boolean;
  kyc: boolean;
  did: boolean;
  manualReview: boolean;
};

type LinkedAccounts = {
  telegram: string | null;
  did: string | null;
  kyc: string | null;
};

type CampaignParticipation = {
  campaignTypeId: string;
  campaignName: string;
  questsCompleted: number;
  pointsEarned: bigint | null;
};

type UserActivities = {
  questsCompleted: number;
  completionRate: number;
  currentStreak: number | null;
  averagePointsPerQuest: number | null;
};

type UserSummary = {
  id: string;
  lockHash: string;
  address: string | null;
  typeId: string | null;
  displayName: string;
  email: string;
  status: "active" | "inactive";
  verified: boolean;
  verificationStatus: VerificationStatus;
  verificationMethod: string | null;
  role: "admin" | "user";
  totalPoints: bigint;
  questsCompleted: number;
  campaignsJoined: number;
  currentRank: number;
  sybilRisk: "low" | "medium" | "high" | "unknown";
  linkedAccounts: LinkedAccounts;
  activities: UserActivities;
  campaignParticipation: CampaignParticipation[];
  firstActivity: number | null;
  lastActive: number | null;
  pubkey: string;
};

type PendingVerification = {
  id: string;
  displayName: string;
  email: string;
  verificationMethod: string | null;
  submittedAt: string | null;
  sybilRisk: UserSummary["sybilRisk"];
};

type StatsWindowKey = "1d" | "7d" | "30d" | "90d" | "365d" | "total";

type CampaignActivity = {
  cell: ccc.Cell;
  data: CampaignDataLike;
  createdAt: number | null;
};

type TippingActivity = {
  proposal: TippingInfo;
  timestamp: number | null;
};

type PlatformStatsResponse = {
  lastUpdated: string;
  pointsMinted: Record<StatsWindowKey, string>;
  questSubmissions: Record<StatsWindowKey, number>;
  newUsers: Record<StatsWindowKey, number>;
};

type FundingTotals = {
  campaigns: {
    ckb: bigint;
    udts: Array<{
      scriptHash: string;
      symbol: string;
      amount: bigint;
      formatted: string;
    }>;
    campaignCount: number;
  };
  tipping: {
    ckb: bigint;
    udts: Array<{
      scriptHash: string;
      symbol: string;
      amount: bigint;
      formatted: string;
    }>;
    cellCount: number;
  };
};

const STAT_WINDOWS: Array<{ key: StatsWindowKey; label: string }> = [
  { key: "1d", label: "24 Hours" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "365d", label: "1 Year" },
  { key: "total", label: "Total" },
];

const shortenIdentifier = (value: string, head = 8, tail = 6): string => {
  if (!value || value.length <= head + tail) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const formatBigInt = (value: bigint | null | undefined): string => {
  if (value === null || value === undefined) {
    return "0";
  }
  try {
    return value.toLocaleString();
  } catch {
    return value.toString();
  }
};

export default function PlatformAdminDashboard() {
  const {
    protocolData,
    protocolCell,
    signer,
    isAdmin,
    isLoading: protocolLoading,
  } = useProtocol();
  const {
    tippings: tippingProposals,
    isLoading: tippingLoading,
    error: tippingError,
  } = useTippingsData();
  const { client } = ccc.useCcc();
  const [activeTab, setActiveTab] = useState("overview");
  const [isRewardDialogOpen, setIsRewardDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedVerification, setSelectedVerification] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [connectedCampaigns, setConnectedCampaigns] = useState<ccc.Cell[]>([]);
  const [allCampaignCells, setAllCampaignCells] = useState<ccc.Cell[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [platformStats, setPlatformStats] =
    useState<PlatformStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [fundingTotals, setFundingTotals] = useState<FundingTotals>({
    campaigns: { ckb: 0n, udts: [], campaignCount: 0 },
    tipping: { ckb: 0n, udts: [], cellCount: 0 },
  });
  const [fundingLoading, setFundingLoading] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const pageLoading =
    protocolLoading ||
    isLoadingCampaigns ||
    usersLoading ||
    statsLoading ||
    fundingLoading ||
    tippingLoading;

  const approvalThresholds = useMemo(() => {
    const thresholds =
      protocolData?.tipping_config?.approval_requirement_thresholds;
    if (!thresholds) {
      return [];
    }
    try {
      return thresholds.map((threshold) => BigInt(ccc.numFrom(threshold)));
    } catch {
      return [];
    }
  }, [protocolData]);

  // Fetch campaigns connected to the protocol
  useEffect(() => {
    if (!signer) {
      log.warn("No signer available, skipping campaign fetch");
      setIsLoadingCampaigns(false);
      return;
    }

    if (protocolLoading) {
      log.log("Protocol context loading, waiting before fetching campaigns");
      setIsLoadingCampaigns(true);
      return;
    }

    if (!protocolCell || !protocolData) {
      // Protocol context is still warming up; try again when it changes.
      log.log("Protocol context not ready yet, deferring campaign fetch");
      setIsLoadingCampaigns(false);
      return;
    }

    let isCancelled = false;

    const fetchCampaigns = async () => {
      log.log("Platform Admin - Fetch Campaigns");
      log.log("Signer status:", { signerPresent: !!signer });

      setIsLoadingCampaigns(true);
      try {
        log.log("Using protocol cell from context...");
        log.log("Protocol cell found:", {
          typeHash: protocolCell.cellOutput.type?.hash(),
          dataLength: protocolCell.outputData.length,
        });

        // Get campaign code hash from protocol data
        log.log("Using protocol data from context...");
        const campaignCodeHash =
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_campaign_type_code_hash;

        log.log("Extracted campaign code hash:", campaignCodeHash);

        // Get the protocol type hash (from the protocol cell's type script)
        const protocolTypeHash = protocolCell.cellOutput.type?.hash() || "0x";
        log.log("Protocol type hash:", protocolTypeHash);

        // Fetch campaigns connected to this protocol
        log.log("Fetching campaigns connected to protocol...");
        const campaigns = await fetchCampaignsConnectedToProtocol(
          signer.client,
          campaignCodeHash as ccc.Hex,
          protocolTypeHash as ccc.Hex
        );

        if (isCancelled) {
          log.warn("Component unmounted before campaign fetch completed");
          return;
        }

        log.log(`Received ${campaigns.length} connected campaigns`);

        setAllCampaignCells(campaigns);

        // Filter out approved campaigns - only show pending review campaigns
        const approvedCampaignIds = protocolData.campaigns_approved || [];
        const pendingCampaigns = campaigns.filter((campaign) => {
          const campaignTypeId = extractTypeIdFromCampaignCell(campaign);
          return !isCampaignApproved(campaignTypeId, approvedCampaignIds);
        });

        log.log(
          `Filtered to ${pendingCampaigns.length} pending review campaigns`
        );
        setConnectedCampaigns(pendingCampaigns);

        // Log campaign details
        if (campaigns.length > 0) {
          log.log("Campaign Details");
          campaigns.forEach((campaign, index) => {
            try {
              const campaignData = CampaignData.decode(campaign.outputData);
              log.log(`Campaign ${index + 1}:`, {
                title: campaignData.metadata.title,
                typeHash: campaign.cellOutput.type?.hash(),
                categories: campaignData.metadata.categories,
              });
            } catch (e) {
              log.error(`Failed to parse campaign ${index + 1}:`, e);
            }
          });
        }
      } catch (error) {
        if (!isCancelled) {
          log.error("Failed to fetch campaigns:", error);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCampaigns(false);
        }
      }
    };

    fetchCampaigns();

    return () => {
      isCancelled = true;
    };
  }, [signer, protocolCell, protocolData, protocolLoading]);

  useEffect(() => {
    if (!client || !protocolData || !protocolCell) {
      return;
    }

    let cancelled = false;

    const loadUsers = async () => {
      setUsersLoading(true);
      setUsersError(null);

      try {
        const userTypeCodeHash =
          protocolData.protocol_config.script_code_hashes
            .ckb_boost_user_type_code_hash;
        const protocolTypeHash = protocolCell.cellOutput.type?.hash();

        if (!userTypeCodeHash || !protocolTypeHash) {
          if (!cancelled) {
            setUsers([]);
          }
          return;
        }

        const searchKey = {
          script: {
            codeHash: userTypeCodeHash,
            hashType: "type" as const,
            args: "",
          },
          scriptType: "type" as const,
          scriptSearchMode: "prefix" as const,
          withData: true,
        };

        const latestByLock = new Map<
          string,
          { cell: ccc.Cell; blockNumber: bigint }
        >();

        for await (const cell of client.findCells(searchKey)) {
          if (!cell.outputData || cell.outputData === "0x") {
            continue;
          }

          if (!isUserCellConnectedToProtocol(cell, protocolTypeHash)) {
            continue;
          }

          let blockNumber = 0n;
          try {
            const txInfo = await client.getTransaction(cell.outPoint.txHash);
            if (txInfo?.blockNumber) {
              blockNumber = BigInt(txInfo.blockNumber);
            }
          } catch (error) {
            log.warn("Failed to resolve transaction for user cell", error);
          }

          const lockHash = cell.cellOutput.lock.hash().toLowerCase();
          const existing = latestByLock.get(lockHash);
          if (!existing || blockNumber >= existing.blockNumber) {
            latestByLock.set(lockHash, { cell, blockNumber });
          }
        }

        const campaignNameLookup = new Map<string, string>();
        connectedCampaigns.forEach((campaign) => {
          try {
            const data = CampaignData.decode(campaign.outputData);
            const campaignTypeId =
              extractTypeIdFromCampaignCell(campaign)?.toLowerCase();
            if (campaignTypeId) {
              campaignNameLookup.set(campaignTypeId, data.metadata.title);
            }
          } catch (error) {
            log.warn("Failed to decode campaign data for user mapping", error);
          }
        });

        const summaries: UserSummary[] = [];

        for (const { cell } of latestByLock.values()) {
          const userData = parseUserData(cell);
          if (!userData) {
            continue;
          }

          const lockScript = cell.cellOutput.lock;
          const lockHash = lockScript.hash().toLowerCase();

          let address: string | null = null;
          try {
            const addr = await ccc.Address.fromScript(lockScript, client);
            address = addr.toString();
          } catch (error) {
            log.warn("Failed to derive address from user lock script", error);
          }

          const typeId = extractTypeIdFromUserCell(cell);

          const totalPointsRaw = ccc.numFrom(
            userData.total_points_earned ?? 0n
          );
          const totalPoints =
            typeof totalPointsRaw === "bigint"
              ? totalPointsRaw
              : BigInt(totalPointsRaw);

          const questsCompleted = userData.submission_records.length;

          const lastActivityRaw = ccc.numFrom(
            userData.last_activity_timestamp ?? 0n
          );
          const lastActivitySeconds =
            typeof lastActivityRaw === "bigint"
              ? Number(lastActivityRaw)
              : Number(lastActivityRaw);
          const lastActive =
            Number.isFinite(lastActivitySeconds) && lastActivitySeconds > 0
              ? lastActivitySeconds * 1000
              : null;
          const status =
            lastActive && Date.now() - lastActive > 1000 * 60 * 60 * 24 * 30
              ? "inactive"
              : "active";

          const telegramIdValue = ccc.numFrom(
            userData.verification_data.telegram_personal_chat_id ?? 0
          );
          const hasTelegram =
            (typeof telegramIdValue === "bigint" && telegramIdValue > 0n) ||
            (typeof telegramIdValue === "number" && telegramIdValue > 0);

          const identityData =
            userData.verification_data.identity_verification_data;
          const identityHex =
            typeof identityData === "string"
              ? identityData
              : identityData
              ? ccc.hexFrom(identityData)
              : "0x";
          const hasIdentity =
            identityHex !== "0x" && identityHex.trim().length > 2;

          const verificationStatus: VerificationStatus = {
            telegram: hasTelegram,
            kyc: hasIdentity,
            did: false,
            manualReview: false,
          };

          const verificationMethod = hasIdentity
            ? "kyc"
            : hasTelegram
            ? "telegram"
            : null;

          const linkedAccounts: LinkedAccounts = {
            telegram: hasTelegram ? "linked" : null,
            did: null,
            kyc: hasIdentity ? "verified" : null,
          };

          const sybilRisk: UserSummary["sybilRisk"] = hasIdentity
            ? "low"
            : hasTelegram
            ? "medium"
            : "unknown";

          const completionRate = questsCompleted > 0 ? 100 : 0;
          const averagePointsPerQuest =
            questsCompleted > 0
              ? Number(totalPoints / BigInt(questsCompleted))
              : null;

          const participationMap = new Map<
            string,
            { questsCompleted: number }
          >();
          userData.submission_records.forEach((record) => {
            let campaignTypeId: string;
            if (typeof record.campaign_type_id === "string") {
              campaignTypeId = record.campaign_type_id.toLowerCase();
            } else {
              campaignTypeId = ccc
                .hexFrom(record.campaign_type_id as ccc.BytesLike)
                .toLowerCase();
            }

            const current = participationMap.get(campaignTypeId);
            if (current) {
              current.questsCompleted += 1;
            } else {
              participationMap.set(campaignTypeId, { questsCompleted: 1 });
            }
          });

          const campaignParticipation: CampaignParticipation[] = Array.from(
            participationMap.entries()
          ).map(([campaignTypeId, info]) => ({
            campaignTypeId,
            campaignName:
              campaignNameLookup.get(campaignTypeId) ??
              shortenIdentifier(campaignTypeId),
            questsCompleted: info.questsCompleted,
            pointsEarned: null,
          }));

          const adminLockHashes =
            protocolData.protocol_config.admin_lock_hash_vec.map((hash) =>
              typeof hash === "string"
                ? hash.toLowerCase()
                : ccc.hexFrom(hash as ccc.BytesLike).toLowerCase()
            );

          const displayName = address
            ? shortenIdentifier(address, 12, 6)
            : typeId
            ? shortenIdentifier(typeId)
            : shortenIdentifier(lockHash);

          summaries.push({
            id: lockHash,
            lockHash,
            address,
            typeId,
            displayName,
            email: address ?? "",
            status,
            verified: verificationStatus.telegram || verificationStatus.kyc,
            verificationStatus,
            verificationMethod,
            role: adminLockHashes.includes(lockHash) ? "admin" : "user",
            totalPoints,
            questsCompleted,
            campaignsJoined: campaignParticipation.length,
            currentRank: 0,
            sybilRisk,
            linkedAccounts,
            activities: {
              questsCompleted,
              completionRate,
              currentStreak: null,
              averagePointsPerQuest,
            },
            campaignParticipation,
            firstActivity: null,
            lastActive,
            pubkey: address ?? lockHash,
          });
        }

        summaries.sort((a, b) => {
          if (a.totalPoints === b.totalPoints) {
            return a.displayName.localeCompare(b.displayName);
          }
          return a.totalPoints > b.totalPoints ? -1 : 1;
        });

        summaries.forEach((user, index) => {
          user.currentRank = index + 1;
        });

        if (!cancelled) {
          setUsers(summaries);
        }
      } catch (error) {
        log.error("Failed to load platform users", error);
        if (!cancelled) {
          setUsersError(
            error instanceof Error ? error.message : "Failed to load users"
          );
          setUsers([]);
        }
      } finally {
        if (!cancelled) {
          setUsersLoading(false);
        }
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [client, protocolData, protocolCell, allCampaignCells]);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError(null);

      try {
        const response = await fetch("/.netlify/functions/platform-stats");
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load platform stats");
        }
        const payload = (await response.json()) as PlatformStatsResponse;
        if (!cancelled) {
          setPlatformStats(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setStatsError(
            error instanceof Error ? error.message : "Unable to load stats"
          );
          setPlatformStats(null);
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    };

    void fetchStats();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!signer || !protocolCell || !protocolData) {
      return;
    }

    let cancelled = false;

    const loadFunding = async () => {
      setFundingLoading(true);
      setFundingError(null);

      try {
        const network = deploymentManager.getCurrentNetwork();
        const fundingLockCodeHash = deploymentManager.getContractCodeHash(
          network,
          "ckboostFundingLock"
        );

        if (!fundingLockCodeHash) {
          throw new Error("Funding lock contract not configured");
        }

        const aggregateCells = async (
          scriptArgs: string | undefined | null
        ) => {
          if (!scriptArgs) {
            return {
              ckb: 0n,
              udts: new Map<string, bigint>(),
              cellCount: 0,
            };
          }
          const script = ccc.Script.from({
            codeHash: fundingLockCodeHash,
            hashType: "type" as const,
            args: scriptArgs,
          });

          const udtTotals = new Map<string, bigint>();
          let ckbTotal = 0n;
          let cellCount = 0;

          const collector = signer.client.findCells({
            script,
            scriptType: "lock" as const,
            scriptSearchMode: "exact" as const,
            withData: true,
          });

          for await (const cell of collector) {
            try {
              cellCount += 1;
              const capacityRaw = ccc.numFrom(cell.cellOutput.capacity);
              const capacity =
                typeof capacityRaw === "bigint"
                  ? capacityRaw
                  : BigInt(capacityRaw);
              ckbTotal += capacity;

              if (cell.cellOutput.type) {
                const typeHash = cell.cellOutput.type.hash();
                const current = udtTotals.get(typeHash) ?? 0n;
                const amount = readUdtAmount(cell.outputData);
                udtTotals.set(typeHash, current + amount);
              }
            } catch (error) {
              log.warn("Failed to aggregate funding cell", error);
            }
          }

          return { ckb: ckbTotal, udts: udtTotals, cellCount };
        };
        const campaignTypeHashes = new Set<string>();
        allCampaignCells.forEach((cell) => {
          const typeHash = cell.cellOutput.type?.hash();
          if (typeHash) {
            campaignTypeHashes.add(typeHash);
          }
        });

        const campaignTotals = {
          ckb: 0n,
          udts: new Map<string, bigint>(),
          campaignCount: campaignTypeHashes.size,
        };

        for (const typeHash of campaignTypeHashes) {
          const summary = await aggregateCells(typeHash);
          campaignTotals.ckb += summary.ckb;
          summary.udts.forEach((amount, hash) => {
            const current = campaignTotals.udts.get(hash) ?? 0n;
            campaignTotals.udts.set(hash, current + amount);
          });
        }

        const protocolTypeHash = protocolCell.cellOutput.type?.hash();
        const tippingTotals = await aggregateCells(protocolTypeHash);

        const normalizeUdts = (
          udtMap: Map<string, bigint>
        ): Array<{
          scriptHash: string;
          symbol: string;
          amount: bigint;
          formatted: string;
        }> => {
          return Array.from(udtMap.entries()).map(([hash, amount]) => {
            const token = udtRegistry.getTokenByScriptHash(hash);
            const symbol = token?.symbol ?? hash.slice(0, 8);
            const formatted = token
              ? udtRegistry.formatAmount(amount, token)
              : formatBigInt(amount);
            return { scriptHash: hash, symbol, amount, formatted };
          });
        };

        if (!cancelled) {
          setFundingTotals({
            campaigns: {
              ckb: campaignTotals.ckb,
              udts: normalizeUdts(campaignTotals.udts),
              campaignCount: campaignTotals.campaignCount,
            },
            tipping: {
              ckb: tippingTotals.ckb,
              udts: normalizeUdts(tippingTotals.udts),
              cellCount: tippingTotals.cellCount,
            },
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFundingError(
            error instanceof Error ? error.message : "Failed to load funding"
          );
        }
      } finally {
        if (!cancelled) {
          setFundingLoading(false);
        }
      }
    };

    void loadFunding();

    return () => {
      cancelled = true;
    };
  }, [signer, protocolCell, protocolData, allCampaignCells]);

  const [newReward, setNewReward] = useState({
    period: "",
    type: "monthly",
    totalPrize: {
      CKB: "",
      SPORE: "",
      DEFI: "",
    },
    distributionModel: "tiered",
    tiers: [
      {
        rank: "1st Place",
        rewards: { CKB: "", SPORE: "", DEFI: "" },
        percentage: 40,
      },
      {
        rank: "2nd Place",
        rewards: { CKB: "", SPORE: "", DEFI: "" },
        percentage: 25,
      },
      {
        rank: "3rd Place",
        rewards: { CKB: "", SPORE: "", DEFI: "" },
        percentage: 15,
      },
      {
        rank: "Top 10",
        rewards: { CKB: "", SPORE: "", DEFI: "" },
        percentage: 20,
      },
    ],
    eligibilityRules: {
      minPoints: 100,
      minQuests: 3,
      verificationRequired: true,
      acceptableVerifications: ["telegram", "kyc", "did", "manual"],
      excludeManualReview: false,
    },
    autoDistribution: true,
  });

  const getStatusColor = (status: string) => {
    const value = status?.toLowerCase?.() ?? "";
    switch (value) {
      case "pending":
      case "created":
        return "bg-yellow-100 text-yellow-800";
      case "under_review":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "active":
        return "bg-green-100 text-green-800";
      case "upcoming":
        return "bg-purple-100 text-purple-800";
      case "granted":
        return "bg-green-100 text-green-800";
      case "flagged":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "NFT":
        return "bg-pink-100 text-pink-800";
      case "Education":
        return "bg-green-100 text-green-800";
      case "Community":
        return "bg-purple-100 text-purple-800";
      case "DeFi":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (value: string | number | bigint | Date) => {
    if (value === undefined || value === null) {
      return "—";
    }

    if (value instanceof Date) {
      return formatDateConsistent(value);
    }

    if (typeof value === "bigint") {
      return formatDateConsistent(new Date(Number(value)));
    }

    if (typeof value === "number") {
      return formatDateConsistent(new Date(value));
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "—";
      }

      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric) && /^\d+$/.test(trimmed)) {
        return formatDateConsistent(new Date(numeric));
      }

      return formatDateConsistent(trimmed);
    }

    return formatDateConsistent(String(value));
  };

  const SHANNON_FACTOR = 10n ** 8n;

  const formatCkbAmount = (
    shannons: ccc.NumLike | undefined | null
  ): string => {
    try {
      const value = shannons ? BigInt(ccc.numFrom(shannons)) : 0n;
      const integer = value / SHANNON_FACTOR;
      const fractional = value % SHANNON_FACTOR;
      if (fractional === 0n) {
        return integer.toString();
      }
      const fractionalStr = fractional
        .toString()
        .padStart(8, "0")
        .replace(/0+$/, "");
      return `${integer}.${fractionalStr}`;
    } catch {
      return "0";
    }
  };

  const formatPointsAmount = (
    points: ccc.NumLike | undefined | null
  ): string => {
    try {
      const value = points ? BigInt(ccc.numFrom(points)) : 0n;
      return value.toString();
    } catch {
      return "0";
    }
  };

  const formatCkbFromShannons = (value: bigint): string => {
    const integer = value / SHANNON_FACTOR;
    const fractional = value % SHANNON_FACTOR;
    if (fractional === 0n) {
      return integer.toLocaleString();
    }
    const fractionalStr = fractional
      .toString()
      .padStart(8, "0")
      .replace(/0+$/, "");
    return `${integer.toLocaleString()}.${fractionalStr}`;
  };

  const formatRelativeTime = (timestamp: number | null | undefined) => {
    if (!timestamp || Number.isNaN(timestamp)) {
      return "—";
    }
    const diff = Date.now() - timestamp;
    if (diff <= 0) return "just now";
    const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
      [60 * 1000, "minute"],
      [60 * 60 * 1000, "hour"],
      [24 * 60 * 60 * 1000, "day"],
      [7 * 24 * 60 * 60 * 1000, "week"],
      [30 * 24 * 60 * 60 * 1000, "month"],
      [365 * 24 * 60 * 60 * 1000, "year"],
    ];
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const [unitMs, unit] = units[i];
      if (diff >= unitMs) {
        const value = Math.round(-diff / unitMs);
        return rtf.format(value, unit);
      }
    }
    return rtf.format(-Math.round(diff / 1000), "second");
  };

  const readUdtAmount = (data: string | undefined | null): bigint => {
    if (!data || data === "0x" || data.length < 34) {
      return 0n;
    }
    try {
      const bytes = ccc.bytesFrom(data);
      if (bytes.length < 16) {
        return 0n;
      }
      const slice = bytes.subarray(0, 16);
      return ccc.numLeFromBytes(slice);
    } catch {
      return 0n;
    }
  };

  const shortenHex = (
    value: ccc.HexLike | string | null | undefined,
    head = 10,
    tail = 6
  ): string => {
    if (!value) {
      return "—";
    }

    try {
      const hex =
        typeof value === "string" ? value : ccc.hexFrom(value as ccc.HexLike);
      if (hex.length <= head + tail) {
        return hex;
      }
      return `${hex.slice(0, head)}...${hex.slice(-tail)}`;
    } catch {
      const fallback = String(value);
      if (fallback.length <= head + tail) {
        return fallback;
      }
      return `${fallback.slice(0, head)}...${fallback.slice(-tail)}`;
    }
  };

  const formatStatusLabel = (status: string | undefined | null) => {
    if (!status) {
      return "Unknown";
    }
    return status
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const handleCreateReward = () => {
    log.info("Creating reward:", newReward);
    setIsRewardDialogOpen(false);
    setNewReward({
      period: "",
      type: "monthly",
      totalPrize: {
        CKB: "",
        SPORE: "",
        DEFI: "",
      },
      distributionModel: "tiered",
      tiers: [
        {
          rank: "1st Place",
          rewards: { CKB: "", SPORE: "", DEFI: "" },
          percentage: 40,
        },
        {
          rank: "2nd Place",
          rewards: { CKB: "", SPORE: "", DEFI: "" },
          percentage: 25,
        },
        {
          rank: "3rd Place",
          rewards: { CKB: "", SPORE: "", DEFI: "" },
          percentage: 15,
        },
        {
          rank: "Top 10",
          rewards: { CKB: "", SPORE: "", DEFI: "" },
          percentage: 20,
        },
      ],
      eligibilityRules: {
        minPoints: 100,
        minQuests: 3,
        verificationRequired: true,
        acceptableVerifications: ["telegram", "kyc", "did", "manual"],
        excludeManualReview: false,
      },
      autoDistribution: true,
    });
  };

  const totalPendingCampaigns = connectedCampaigns.length;
  const totalUsers = users.length;
  const totalActiveUsers = users.filter((u) => u.status === "active").length;
  const totalPendingTips = useMemo(() => {
    return tippingProposals.filter((tip) => {
      const status = tip.data.status?.toLowerCase?.() ?? "";
      return status === "created" || status === "pending";
    }).length;
  }, [tippingProposals]);
  const pendingTipsDisplay = tippingLoading ? "..." : totalPendingTips;
  const pendingTipsBadgeLabel = tippingLoading
    ? "Loading..."
    : `${totalPendingTips} Pending Review`;

  const totalPointsIssued = useMemo(() => {
    if (!platformStats) {
      return null;
    }
    try {
      return BigInt(platformStats.pointsMinted.total);
    } catch {
      return null;
    }
  }, [platformStats]);

  // User management functions
  const filteredUsers = users.filter((user) => {
    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch =
      lowerSearch.length === 0 ||
      user.displayName.toLowerCase().includes(lowerSearch) ||
      user.pubkey.toLowerCase().includes(lowerSearch) ||
      user.lockHash.toLowerCase().includes(lowerSearch) ||
      (user.address?.toLowerCase().includes(lowerSearch) ?? false);
    const matchesStatus =
      selectedStatus === "all" || user.status === selectedStatus;
    const matchesVerification =
      selectedVerification === "all" ||
      (selectedVerification === "verified" && user.verified) ||
      (selectedVerification === "unverified" && !user.verified);
    const matchesRole = selectedRole === "all" || user.role === selectedRole;

    return matchesSearch && matchesStatus && matchesVerification && matchesRole;
  });

  const handleUserClick = (user: UserSummary) => {
    setSelectedUser(user);
    setIsUserDetailsOpen(true);
  };

  const pendingVerifications: PendingVerification[] = useMemo(() => {
    return users
      .filter((user) => !user.verified)
      .map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email || "Not provided",
        verificationMethod: user.verificationMethod,
        submittedAt: user.firstActivity
          ? new Date(user.firstActivity).toISOString()
          : null,
        sybilRisk: user.sybilRisk,
      }));
  }, [users]);

  const approvedCampaignTypeIds = useMemo(() => {
    const approved = new Set<string>();
    const list = protocolData?.campaigns_approved;
    if (!list) {
      return approved;
    }
    list.forEach((identifier) => {
      try {
        const hex =
          typeof identifier === "string"
            ? identifier
            : ccc.hexFrom(identifier as ccc.BytesLike);
        approved.add(hex.toLowerCase());
      } catch (error) {
        log.warn("Failed to normalize approved campaign id", error);
      }
    });
    return approved;
  }, [protocolData]);

  const getEndorserInfo = (
    endorserLockHash: ccc.Hex
  ): EndorserInfoLike | undefined => {
    return protocolData?.endorsers_whitelist.find(
      (e) => e.endorser_lock_hash === endorserLockHash
    );
  };

  const recentActivities = useMemo(() => {
    const events: Array<{
      id: string;
      title: string;
      description: string;
      icon: JSX.Element;
      timestamp: number | null;
      accent: string;
    }> = [];

    const toMs = (value: number): number | null => {
      if (!value || Number.isNaN(value)) {
        return null;
      }
      return value > 10_000_000_000 ? value : value * 1000;
    };

    const eventMap = new Map<
      string,
      {
        id: string;
        title: string;
        description: string;
        icon: JSX.Element;
        timestamp: number | null;
        accent: string;
      }
    >();

    allCampaignCells.forEach((cell) => {
      try {
        const data = CampaignData.decode(cell.outputData) as CampaignDataLike;
        const createdRaw = data.created_at
          ? Number(ccc.numFrom(data.created_at))
          : 0;
        const createdAt = toMs(createdRaw);
        const endorser = data.endorser_lock_hash
          ? shortenHex(data.endorser_lock_hash, 10, 6)
          : "Unknown";
        const endorserInfo = getEndorserInfo(
          ccc.hexFrom(data.endorser_lock_hash)
        );
        const id = `campaign-${cell.outPoint.txHash}-${cell.outPoint.index}`;
        const typeId =
          extractTypeIdFromCampaignCell(cell)?.toLowerCase() ?? null;
        eventMap.set(id, {
          id,
          title: `Campaign created: ${data.metadata.title}`,
          description: `Endorser ${endorserInfo?.endorser_name ?? "Unknown"}`,
          icon: (
            <FileText className="w-4 h-4 text-yellow-600" aria-hidden="true" />
          ),
          timestamp: createdAt,
          accent: "bg-yellow-100",
        });
        if (typeId && approvedCampaignTypeIds.has(typeId)) {
          const startingRaw =
            data.starting_time !== undefined && data.starting_time !== null
              ? Number(ccc.numFrom(data.starting_time))
              : 0;
          const approvalAt = toMs(startingRaw) ?? createdAt;
          const approvalDetails = [
            `Endorser ${endorserInfo?.endorser_name ?? endorser}`,
            approvalAt ? `Approved on ${formatDate(approvalAt)}` : null,
          ].filter(Boolean);
          eventMap.set(`campaign-approved-${typeId}`, {
            id: `campaign-approved-${typeId}`,
            title: `Campaign approved: ${data.metadata.title}`,
            description: approvalDetails.join(" • "),
            icon: (
              <CheckCircle
                className="w-4 h-4 text-indigo-600"
                aria-hidden="true"
              />
            ),
            timestamp: approvalAt,
            accent: "bg-indigo-100",
          });
        }
      } catch (error) {
        log.warn("Failed to decode campaign for activity", error);
      }
    });

    tippingProposals.forEach((tip, index) => {
      try {
        const createdRaw = tip.data.metadata.creation_timestamp
          ? Number(ccc.numFrom(tip.data.metadata.creation_timestamp))
          : 0;
        const createdAt = toMs(createdRaw);
        const title = tip.metadata.contribution_title;
        const rewardAmount = formatCkbAmount(tip.data.rewards.ckb_amount);
        const id = `tipping-proposal-${tip.typeId ?? index}`;
        eventMap.set(id, {
          id,
          title: `New tipping proposal: ${title}`,
          description: `${rewardAmount} CKB requested`,
          icon: (
            <DollarSign className="w-4 h-4 text-green-600" aria-hidden="true" />
          ),
          timestamp: createdAt,
          accent: "bg-green-100",
        });
      } catch (error) {
        log.warn("Failed to decode tipping proposal for activity", error);
      }
    });

    tippingProposals.forEach((tip, index) => {
      const status = tip.data.status?.toLowerCase?.() ?? "";
      if (status !== "approved" && status !== "granted") {
        return;
      }
      try {
        const grantedRaw = tip.data.granted_at
          ? Number(ccc.numFrom(tip.data.granted_at))
          : 0;
        const createdRaw = tip.data.metadata.creation_timestamp
          ? Number(ccc.numFrom(tip.data.metadata.creation_timestamp))
          : 0;
        const timestamp = grantedRaw ? toMs(grantedRaw) : toMs(createdRaw);
        const title = tip.metadata.contribution_title;
        const rewardAmount = formatCkbAmount(tip.data.rewards.ckb_amount);
        const statusLabel = (tip.data.status ?? "approved")
          .toString()
          .toLowerCase();
        const formattedStatus =
          statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
        const id = `tipping-approval-${tip.typeId ?? index}`;
        eventMap.set(id, {
          id,
          title: `Tipping ${formattedStatus}`,
          description: `${title} • ${rewardAmount} CKB`,
          icon: (
            <CheckCircle className="w-4 h-4 text-blue-600" aria-hidden="true" />
          ),
          timestamp,
          accent: "bg-blue-100",
        });
      } catch (error) {
        log.warn("Failed to decode tipping approval for activity", error);
      }
    });

    const sortedEvents = Array.from(eventMap.values()).sort((a, b) => {
      const aTime = a.timestamp ?? Number.NEGATIVE_INFINITY;
      const bTime = b.timestamp ?? Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });

    return sortedEvents.slice(0, 5);
  }, [
    allCampaignCells,
    approvedCampaignTypeIds,
    formatCkbAmount,
    tippingProposals,
  ]);

  const handleVerificationAction = (
    verificationId: string,
    action: "approve" | "reject"
  ) => {
    log.info(`${action} verification ${verificationId}`);
  };

  const getSybilRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "high":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getVerificationIcon = (method: string | null) => {
    switch (method) {
      case "telegram":
        return <MessageCircle className="w-4 h-4" />;
      case "kyc":
        return <FileText className="w-4 h-4" />;
      case "did":
        return <Fingerprint className="w-4 h-4" />;
      case "manual":
        return <Users className="w-4 h-4" />;
      default:
        return <X className="w-4 h-4" />;
    }
  };

  // Get user's verification status summary
  const getUserVerificationSummary = (user: UserSummary) => {
    if (user.verificationStatus.kyc || user.verificationStatus.did) {
      return {
        status: "identity_verified",
        color: "bg-green-100 text-green-800",
        text: "Identity Verified",
      };
    }
    if (user.verificationStatus.telegram) {
      return {
        status: "social_verified",
        color: "bg-blue-100 text-blue-800",
        text: "Social Verified",
      };
    }
    if (user.verificationStatus.manualReview) {
      return {
        status: "manual_verified",
        color: "bg-purple-100 text-purple-800",
        text: "Manual Verified",
      };
    }
    return {
      status: "unverified",
      color: "bg-red-100 text-red-800",
      text: "Unverified",
    };
  };

  if (pageLoading) {
    return (
      <PageLoading
        title="Loading Platform Administration"
        description="Syncing protocol stats, campaign connections, and tipping proposals."
      />
    );
  }

  // Redirect non-admins away from this page; skip if protocol cell is not found
  if (!isAdmin && protocolCell) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-purple-50 to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Access Denied</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  You do not have permission to access the platform admin
                  dashboard.
                </p>
                <p className="text-sm text-muted-foreground">
                  Only protocol administrators can access this page. If you
                  believe you should have access, please contact the platform
                  administrators.
                </p>
                <div className="pt-4">
                  <Link href="/">
                    <Button>Return to Home</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-purple-50 to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-8 h-8 text-red-600" />
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-purple-600 bg-clip-text text-transparent">
                    Platform Admin Dashboard
                  </h1>
                </div>
                <p className="text-lg text-muted-foreground">
                  Manage platform operations, review applications, and oversee
                  community governance
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-red-100 text-red-800">
                    🛡️ Platform Administrator
                  </Badge>
                  <Link href="/campaign-admin">
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 cursor-pointer hover:bg-amber-200"
                    >
                      👑 Campaign Admin Access
                    </Badge>
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {protocolData && (
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gradient-to-br from-red-200 to-purple-200">
                        {CURRENT_USER.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm">
                      <div className="font-medium">{CURRENT_USER.name}</div>
                      <div className="text-muted-foreground">
                        {CURRENT_USER.address}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pending Campaigns
                    </p>
                    <p className="text-2xl font-bold">
                      {totalPendingCampaigns}
                    </p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-full">
                    <FileText className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold">
                      {usersLoading ? "…" : totalUsers.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {usersLoading
                        ? "Loading user activity..."
                        : `${totalActiveUsers} active`}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pending Tips
                    </p>
                    <p className="text-2xl font-bold">{pendingTipsDisplay}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Points Issued (Total)
                    </p>
                    <p className="text-2xl font-bold">
                      {statsLoading
                        ? "…"
                        : totalPointsIssued
                        ? formatBigInt(totalPointsIssued)
                        : "0"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CKBoost Points distributed on-chain
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <Trophy className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="campaigns">Campaign Reviews</TabsTrigger>
              <TabsTrigger value="users">User Management</TabsTrigger>
              <TabsTrigger value="tips">Tip Proposals</TabsTrigger>
              <TabsTrigger value="rewards">Leaderboard Rewards</TabsTrigger>
              <TabsTrigger value="achievements">Achievements</TabsTrigger>
              <TabsTrigger value="protocol">Protocol Management</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Platform Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recentActivities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No recent activity detected. New campaigns and tipping
                        events will appear here automatically.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {recentActivities.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-center gap-3"
                          >
                            <div
                              className={`p-2 rounded-full ${activity.accent}`}
                            >
                              {activity.icon}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {activity.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {activity.description}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatRelativeTime(activity.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Funding Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {fundingError && (
                      <div className="p-3 text-sm border rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                        {fundingError}
                      </div>
                    )}

                    {fundingLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading funding information...
                      </p>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold">
                              Campaign Funding
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {fundingTotals.campaigns.campaignCount.toLocaleString()}{" "}
                              campaigns
                            </span>
                          </div>
                          <p className="text-sm">
                            <span className="font-medium">
                              {formatCkbFromShannons(
                                fundingTotals.campaigns.ckb
                              )}
                            </span>{" "}
                            CKB locked
                          </p>
                          {fundingTotals.campaigns.udts.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {fundingTotals.campaigns.udts.map((token) => (
                                <div
                                  key={`campaign-token-${token.scriptHash}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  {token.symbol}: {token.formatted}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold">
                              Tipping Pool
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {fundingTotals.tipping.cellCount.toLocaleString()}{" "}
                              cells
                            </span>
                          </div>
                          <p className="text-sm">
                            <span className="font-medium">
                              {formatCkbFromShannons(fundingTotals.tipping.ckb)}
                            </span>{" "}
                            CKB locked
                          </p>
                          {fundingTotals.tipping.udts.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {fundingTotals.tipping.udts.map((token) => (
                                <div
                                  key={`tipping-token-${token.scriptHash}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  {token.symbol}: {token.formatted}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Platform Metrics</CardTitle>
                    {platformStats && (
                      <span className="text-xs text-muted-foreground">
                        Updated{" "}
                        {formatRelativeTime(
                          Date.parse(platformStats.lastUpdated)
                        )}
                      </span>
                    )}
                  </div>
                  {statsError && (
                    <p className="text-sm text-red-600 dark:text-red-300">
                      {statsError}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading statistics from the network...
                    </p>
                  ) : !platformStats ? (
                    <p className="text-sm text-muted-foreground">
                      Statistics are unavailable. Please try again later.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2 pr-4">Window</th>
                            <th className="py-2 pr-4">Points Issued</th>
                            <th className="py-2 pr-4">Quest Submissions</th>
                            <th className="py-2">New Users</th>
                          </tr>
                        </thead>
                        <tbody>
                          {STAT_WINDOWS.map((window) => {
                            const minted = BigInt(
                              platformStats.pointsMinted[window.key]
                            );
                            const submissions =
                              platformStats.questSubmissions[window.key];
                            const newUsersCount =
                              platformStats.newUsers[window.key];
                            return (
                              <tr
                                key={window.key}
                                className="border-t border-border/40"
                              >
                                <td className="py-2 pr-4 font-medium">
                                  {window.label}
                                </td>
                                <td className="py-2 pr-4">
                                  {formatBigInt(minted)}
                                </td>
                                <td className="py-2 pr-4">
                                  {submissions.toLocaleString()}
                                </td>
                                <td className="py-2">
                                  {newUsersCount.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="campaigns" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">
                  Campaign Application Reviews
                </h2>
                {connectedCampaigns.length > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800">
                    {connectedCampaigns.length} Pending Review
                  </Badge>
                )}
              </div>

              {protocolLoading || isLoadingCampaigns ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">
                      Loading campaigns from blockchain...
                    </p>
                  </div>
                </div>
              ) : !protocolCell || !protocolData ? (
                <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                  <CardContent className="text-center py-12 space-y-2">
                    <Shield className="w-10 h-10 text-yellow-600 mx-auto" />
                    <h3 className="text-lg font-semibold text-yellow-700">
                      Protocol cell not available yet
                    </h3>
                    <p className="text-sm text-yellow-600">
                      Once the protocol cell loads, connected campaign
                      applications will appear here automatically.
                    </p>
                  </CardContent>
                </Card>
              ) : connectedCampaigns.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">
                      No pending campaigns
                    </p>
                    <p className="text-sm text-muted-foreground">
                      All connected campaigns have been reviewed and approved.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {connectedCampaigns.map((campaign, index) => {
                    try {
                      const campaignData = CampaignData.decode(
                        campaign.outputData
                      );
                      const campaignTypeId =
                        extractTypeIdFromCampaignCell(campaign) || "0x";

                      return (
                        <Card key={index}>
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-xl">
                                  {campaignData.metadata.title}
                                </CardTitle>
                                <p className="text-muted-foreground mt-1">
                                  {campaignData.metadata.short_description}
                                </p>
                                <div className="flex items-center gap-2 mt-3">
                                  <Badge className="bg-green-100 text-green-800">
                                    Active
                                  </Badge>
                                  {campaignData.metadata.categories.map(
                                    (category, catIndex) => (
                                      <Badge
                                        key={catIndex}
                                        variant="outline"
                                        className={getCategoryColor(category)}
                                      >
                                        {category}
                                      </Badge>
                                    )
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground mb-1">
                                  Created by
                                </div>
                                <div className="font-medium">
                                  {getEndorserInfo(
                                    ccc.hexFrom(campaignData.endorser_lock_hash)
                                  )?.endorser_name ?? "Unknown"}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  ID: {campaignTypeId.slice(0, 10)}...
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div>
                                <div className="text-sm text-muted-foreground">
                                  Created At
                                </div>
                                <div className="font-semibold">
                                  {campaignData.created_at
                                    ? formatDateConsistent(
                                        new Date(
                                          Number(campaignData.created_at)
                                        )
                                      )
                                    : "Unknown"}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">
                                  Duration
                                </div>
                                <div className="font-semibold">
                                  {campaignData.ending_time &&
                                  campaignData.starting_time
                                    ? `${Math.ceil(
                                        (Number(campaignData.ending_time) -
                                          Number(campaignData.starting_time)) /
                                          (1000 * 60 * 60 * 24)
                                      )} days`
                                    : "Ongoing"}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">
                                  Total Quests
                                </div>
                                <div className="font-semibold">
                                  {campaignData.quests.length}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">
                                  Participants
                                </div>
                                <div className="font-semibold">
                                  {campaignData.participants_count || 0}
                                </div>
                              </div>
                            </div>

                            <div className="mb-4">
                              <div className="text-sm text-muted-foreground mb-2">
                                Description
                              </div>
                              <p className="text-sm">
                                {campaignData.metadata.long_description}
                              </p>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/campaign/${campaignTypeId}`}>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4 mr-1" />
                                  View Details
                                </Button>
                              </Link>
                              <Link href={`/campaign/${campaignTypeId}`}>
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Review & Approve
                                </Button>
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    } catch (error) {
                      log.warn("Failed to parse campaign data:", error);
                      return null;
                    }
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              {/* ISSUE #17: Implement Pending Manual Verifications*/}
              {pendingVerifications.length < 0 && (
                <Card className="bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                      <Clock className="w-5 h-5" />
                      Pending Verifications ({pendingVerifications.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pendingVerifications.map((verification) => (
                      <div
                        key={verification.id}
                        className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback>
                              {verification.displayName
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {verification.displayName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {verification.email}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {getVerificationIcon(
                                verification.verificationMethod
                              )}
                              <span className="text-xs capitalize">
                                {verification.verificationMethod ?? "manual"}{" "}
                                verification
                              </span>
                              <Badge
                                className={getSybilRiskColor(
                                  verification.sybilRisk
                                )}
                              >
                                {verification.sybilRisk} risk
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleVerificationAction(
                                verification.id,
                                "approve"
                              )
                            }
                            className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-900"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleVerificationAction(
                                verification.id,
                                "reject"
                              )
                            }
                            className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Search and Filters */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search users by name, pubkey, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-800"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters:</span>
                  </div>

                  <Select
                    value={selectedStatus}
                    onValueChange={setSelectedStatus}
                  >
                    <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedVerification}
                    onValueChange={setSelectedVerification}
                  >
                    <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Verification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="unverified">Unverified</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Users List */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Active Users ({filteredUsers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {usersError && (
                      <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-300">
                        {usersError}
                      </div>
                    )}

                    {usersLoading && (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        Loading users from the blockchain...
                      </div>
                    )}

                    {!usersLoading &&
                      !usersError &&
                      filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => handleUserClick(user)}
                        >
                          <div className="flex items-center gap-4">
                            <Avatar>
                              <AvatarFallback>
                                {user.displayName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {user.displayName}
                                </span>
                                {user.verified && (
                                  <Shield className="w-4 h-4 text-green-600" />
                                )}
                                <Badge
                                  variant={
                                    user.role === "admin"
                                      ? "default"
                                      : "outline"
                                  }
                                >
                                  {user.role}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {user.email || user.address || "—"}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                <span>Rank #{user.currentRank}</span>
                                <span>
                                  {formatBigInt(user.totalPoints)} points
                                </span>
                                <span>
                                  {user.questsCompleted} quests completed
                                </span>
                                <Badge
                                  className={getSybilRiskColor(user.sybilRisk)}
                                >
                                  {user.sybilRisk} risk
                                </Badge>
                                <Badge
                                  className={
                                    getUserVerificationSummary(user).color
                                  }
                                >
                                  {getUserVerificationSummary(user).text}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Button>
                        </div>
                      ))}

                    {!usersLoading && filteredUsers.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No users found matching your criteria</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* User Details Modal */}
              <Dialog
                open={isUserDetailsOpen}
                onOpenChange={setIsUserDetailsOpen}
              >
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  {selectedUser && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>
                              {selectedUser.displayName
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {selectedUser.displayName}
                          {selectedUser.verified && (
                            <Shield className="w-5 h-5 text-green-600" />
                          )}
                        </DialogTitle>
                      </DialogHeader>

                      <div className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium">
                              Public Key
                            </Label>
                            <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                              {selectedUser.pubkey}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Email</Label>
                            <div className="text-sm">
                              {selectedUser.email ||
                                selectedUser.address ||
                                "—"}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Role</Label>
                            <Badge
                              variant={
                                selectedUser.role === "admin"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {selectedUser.role}
                            </Badge>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">
                              Sybil Risk
                            </Label>
                            <Badge
                              className={getSybilRiskColor(
                                selectedUser.sybilRisk
                              )}
                            >
                              {selectedUser.sybilRisk} risk
                            </Badge>
                          </div>
                        </div>

                        {/* Verification Status */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Verification Status
                          </Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(
                              selectedUser.verificationStatus
                            ).map(([method, verified]) => (
                              <div
                                key={method}
                                className="flex items-center gap-2 p-3 border dark:border-gray-700 rounded-lg"
                              >
                                {getVerificationIcon(method)}
                                <div>
                                  <div className="text-sm font-medium capitalize">
                                    {method}
                                  </div>
                                  <div
                                    className={`text-xs ${
                                      verified
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {verified ? "Verified" : "Not verified"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Activity Stats */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Activity Statistics
                          </Label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">
                                {selectedUser.activities.questsCompleted}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Quests Completed
                              </div>
                            </div>
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">
                                {selectedUser.activities.completionRate}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Completion Rate
                              </div>
                            </div>
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">
                                {selectedUser.activities.currentStreak ?? "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Current Streak
                              </div>
                            </div>
                            <div className="text-center p-3 border dark:border-gray-700 rounded-lg">
                              <div className="text-2xl font-bold">
                                {selectedUser.activities
                                  .averagePointsPerQuest ?? "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Avg Points/Quest
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Campaign Participation */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Campaign Participation
                          </Label>
                          <div className="space-y-2">
                            {selectedUser.campaignParticipation.length ===
                              0 && (
                              <div className="text-sm text-muted-foreground">
                                No campaign participation recorded yet.
                              </div>
                            )}
                            {selectedUser.campaignParticipation.map(
                              (campaign, index) => (
                                <div
                                  key={`${campaign.campaignTypeId}-${index}`}
                                  className="flex items-center justify-between p-3 border dark:border-gray-700 rounded-lg"
                                >
                                  <div>
                                    <div className="font-medium text-sm">
                                      {campaign.campaignName}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {campaign.questsCompleted} quests
                                      completed
                                    </div>
                                  </div>
                                  <Badge variant="outline">
                                    {campaign.pointsEarned
                                      ? `${formatBigInt(
                                          campaign.pointsEarned
                                        )} points`
                                      : "—"}
                                  </Badge>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="tips" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Tip Proposal Reviews</h2>
                <Badge className="bg-green-100 text-green-800">
                  {pendingTipsBadgeLabel}
                </Badge>
              </div>

              <div className="grid gap-6">
                {tippingLoading ? (
                  Array.from({ length: 2 }).map((_, index) => (
                    <Card
                      key={`tip-skeleton-${index}`}
                      className="border border-dashed"
                    >
                      <CardHeader className="space-y-3">
                        <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
                        <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
                        <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
                        <div className="h-10 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
                      </CardContent>
                    </Card>
                  ))
                ) : tippingError ? (
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-sm text-red-600 dark:text-red-300">
                        Failed to load tip proposals: {tippingError}
                      </p>
                    </CardContent>
                  </Card>
                ) : tippingProposals.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center space-y-3 text-muted-foreground">
                      <div className="text-3xl">📝</div>
                      <p>No tip proposals found yet.</p>
                      <p className="text-sm">
                        Approved tipping submissions will appear here for
                        review.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  tippingProposals.map((tip, index) => {
                    const statusRaw = tip.data.status ?? "pending";
                    const statusLabel = formatStatusLabel(statusRaw);
                    const statusClass = getStatusColor(statusRaw);
                    const title =
                      tip.data.metadata.contribution_title || "Tip Proposal";
                    const shortDescription =
                      tip.data.metadata.short_description || "";
                    const typeTags =
                      tip.data.metadata.contribution_type_tags || [];
                    const proposer = ccc.hexFrom(tip.data.proposer_lock_hash);
                    const recipient = ccc.hexFrom(tip.data.target_lock_hash);
                    const ckbAmountRaw = tip.data.rewards?.ckb_amount;
                    const ckbAmount = formatCkbAmount(ckbAmountRaw);
                    const pointsAmount = formatPointsAmount(
                      tip.data.rewards?.points_amount
                    );
                    const supporters =
                      tip.data.supporter_lock_hashes?.length ?? 0;
                    const ckbValue =
                      ckbAmountRaw !== undefined && ckbAmountRaw !== null
                        ? BigInt(ccc.numFrom(ckbAmountRaw))
                        : 0n;
                    const requiredApprovals = Math.max(
                      1,
                      approvalThresholds.filter(
                        (threshold) => ckbValue >= threshold
                      ).length + 1
                    );
                    let createdAt = "—";
                    const timestamp =
                      tip.data.metadata.creation_timestamp ?? null;
                    if (timestamp !== null && timestamp !== undefined) {
                      try {
                        const numeric = Number(ccc.numFrom(timestamp));
                        if (!Number.isNaN(numeric) && numeric > 0) {
                          createdAt = formatDate(new Date(numeric));
                        }
                      } catch {
                        createdAt = formatDate(String(timestamp));
                      }
                    }
                    const tipTypeIdHex = tip.typeId
                      ? typeof tip.typeId === "string"
                        ? tip.typeId
                        : ccc.hexFrom(tip.typeId)
                      : null;
                    const typeIdDisplay = tipTypeIdHex
                      ? shortenHex(tipTypeIdHex, 14, 6)
                      : null;
                    const additionalTips = tip.additionalTips ?? [];
                    return (
                      <Card key={tipTypeIdHex ?? `tip-${index}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-6">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <CardTitle className="text-lg">
                                  {title}
                                </CardTitle>
                                <Badge className={statusClass}>
                                  {statusLabel}
                                </Badge>
                                {typeTags.slice(0, 3).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-100"
                                  >
                                    #{tag}
                                  </Badge>
                                ))}
                              </div>
                              {shortDescription && (
                                <p className="text-sm text-muted-foreground">
                                  {shortDescription}
                                </p>
                              )}
                              <div className="text-sm text-muted-foreground space-y-1">
                                <div>
                                  <span className="font-medium text-foreground">
                                    Proposer:
                                  </span>{" "}
                                  {proposer}
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">
                                    Recipient:
                                  </span>{" "}
                                  {recipient}
                                </div>
                              </div>
                            </div>
                            <div className="text-right space-y-2">
                              <div className="text-sm text-muted-foreground">
                                Proposed Reward
                              </div>
                              <div className="text-2xl font-bold text-yellow-600">
                                {ckbAmount} CKB
                              </div>
                              {pointsAmount !== "0" && (
                                <div className="text-sm text-muted-foreground">
                                  + {pointsAmount} pts
                                </div>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-muted-foreground">
                            <Badge
                              variant="outline"
                              className="bg-gray-50 dark:bg-gray-900"
                            >
                              Supporters {supporters} / {requiredApprovals}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="bg-gray-50 dark:bg-gray-900"
                            >
                              Submitted {createdAt}
                            </Badge>
                            {typeIdDisplay && (
                              <Badge
                                variant="outline"
                                className="bg-gray-50 dark:bg-gray-900"
                              >
                                Type ID {typeIdDisplay}
                              </Badge>
                            )}
                            {!!(tip.data.rewards?.udt_assets?.length ?? 0) && (
                              <Badge
                                variant="outline"
                                className="bg-gray-50 dark:bg-gray-900"
                              >
                                {tip.data.rewards?.udt_assets?.length} UDT asset
                                {tip.data.rewards?.udt_assets?.length === 1
                                  ? ""
                                  : "s"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                              {additionalTips.length > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-200"
                                >
                                  {additionalTips.length} community tip
                                  {additionalTips.length === 1 ? "" : "s"}
                                </Badge>
                              ) : (
                                <span>No community tips yet</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm">
                                <Eye className="w-4 h-4 mr-1" />
                                View Proposal
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                              <Button size="sm">
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="rewards" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">
                  Leaderboard Reward Management (MOCK)
                </h2>
                <Dialog
                  open={isRewardDialogOpen}
                  onOpenChange={setIsRewardDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Create Reward Period
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Leaderboard Rewards</DialogTitle>
                      <DialogDescription>
                        Set up rewards for the next leaderboard period with
                        multiple token types and flexible distribution.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="period">Period</Label>
                          <Input
                            id="period"
                            placeholder="e.g., Monthly - March 2024"
                            value={newReward.period}
                            onChange={(e) =>
                              setNewReward({
                                ...newReward,
                                period: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="type">Type</Label>
                          <Select
                            value={newReward.type}
                            onValueChange={(value) =>
                              setNewReward({ ...newReward, type: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="quarterly">
                                Quarterly
                              </SelectItem>
                              <SelectItem value="special">
                                Special Event
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">
                          Total Prize Pool
                        </Label>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="ckb">CKB</Label>
                            <Input
                              id="ckb"
                              type="number"
                              placeholder="1000"
                              value={newReward.totalPrize.CKB}
                              onChange={(e) =>
                                setNewReward({
                                  ...newReward,
                                  totalPrize: {
                                    ...newReward.totalPrize,
                                    CKB: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="spore">SPORE</Label>
                            <Input
                              id="spore"
                              type="number"
                              placeholder="500"
                              value={newReward.totalPrize.SPORE}
                              onChange={(e) =>
                                setNewReward({
                                  ...newReward,
                                  totalPrize: {
                                    ...newReward.totalPrize,
                                    SPORE: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="defi">DEFI</Label>
                            <Input
                              id="defi"
                              type="number"
                              placeholder="200"
                              value={newReward.totalPrize.DEFI}
                              onChange={(e) =>
                                setNewReward({
                                  ...newReward,
                                  totalPrize: {
                                    ...newReward.totalPrize,
                                    DEFI: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">
                          Eligibility Rules
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="minPoints">Minimum Points</Label>
                            <Input
                              id="minPoints"
                              type="number"
                              placeholder="100"
                              value={newReward.eligibilityRules.minPoints}
                              onChange={(e) =>
                                setNewReward({
                                  ...newReward,
                                  eligibilityRules: {
                                    ...newReward.eligibilityRules,
                                    minPoints: parseInt(e.target.value) || 0,
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="minQuests">Minimum Quests</Label>
                            <Input
                              id="minQuests"
                              type="number"
                              placeholder="3"
                              value={newReward.eligibilityRules.minQuests}
                              onChange={(e) =>
                                setNewReward({
                                  ...newReward,
                                  eligibilityRules: {
                                    ...newReward.eligibilityRules,
                                    minQuests: parseInt(e.target.value) || 0,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-3 mt-3">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="verificationRequired"
                              checked={
                                newReward.eligibilityRules.verificationRequired
                              }
                              onChange={(e) =>
                                setNewReward({
                                  ...newReward,
                                  eligibilityRules: {
                                    ...newReward.eligibilityRules,
                                    verificationRequired: e.target.checked,
                                  },
                                })
                              }
                            />
                            <Label
                              htmlFor="verificationRequired"
                              className="text-sm"
                            >
                              Require identity verification
                            </Label>
                          </div>

                          {newReward.eligibilityRules.verificationRequired && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-3">
                              <Label className="text-sm font-medium">
                                Acceptable Verification Methods
                              </Label>
                              <div className="grid grid-cols-2 gap-2">
                                {["telegram", "kyc", "did", "manual"].map(
                                  (method) => (
                                    <div
                                      key={method}
                                      className="flex items-center space-x-2"
                                    >
                                      <input
                                        type="checkbox"
                                        id={`verification-${method}`}
                                        checked={newReward.eligibilityRules.acceptableVerifications.includes(
                                          method
                                        )}
                                        onChange={(e) => {
                                          const updatedMethods = e.target
                                            .checked
                                            ? [
                                                ...newReward.eligibilityRules
                                                  .acceptableVerifications,
                                                method,
                                              ]
                                            : newReward.eligibilityRules.acceptableVerifications.filter(
                                                (m) => m !== method
                                              );
                                          setNewReward({
                                            ...newReward,
                                            eligibilityRules: {
                                              ...newReward.eligibilityRules,
                                              acceptableVerifications:
                                                updatedMethods,
                                            },
                                          });
                                        }}
                                      />
                                      <Label
                                        htmlFor={`verification-${method}`}
                                        className="text-sm capitalize flex items-center gap-1"
                                      >
                                        {getVerificationIcon(method)}
                                        {method}
                                      </Label>
                                    </div>
                                  )
                                )}
                              </div>

                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="excludeManualReview"
                                  checked={
                                    newReward.eligibilityRules
                                      .excludeManualReview
                                  }
                                  onChange={(e) =>
                                    setNewReward({
                                      ...newReward,
                                      eligibilityRules: {
                                        ...newReward.eligibilityRules,
                                        excludeManualReview: e.target.checked,
                                      },
                                    })
                                  }
                                />
                                <Label
                                  htmlFor="excludeManualReview"
                                  className="text-sm text-orange-700"
                                >
                                  ⚠️ Exclude manual review (prefer KYC/DID for
                                  high-value rewards)
                                </Label>
                              </div>

                              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 p-2 rounded">
                                💡 Tip: KYC or DID verification automatically
                                satisfies identity requirements
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="autoDistribution"
                          checked={newReward.autoDistribution}
                          onChange={(e) =>
                            setNewReward({
                              ...newReward,
                              autoDistribution: e.target.checked,
                            })
                          }
                        />
                        <Label htmlFor="autoDistribution" className="text-sm">
                          Enable automatic distribution
                        </Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsRewardDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleCreateReward}>
                        Create Rewards
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-6">
                {LEADERBOARD_REWARDS.map((reward) => (
                  <Card key={reward.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl">
                            {reward.period}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getStatusColor(reward.status)}>
                              {reward.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Total Prize Pool: {reward.totalPrize.CKB} CKB
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          {reward.status === "upcoming" && (
                            <Button size="sm">
                              <Zap className="w-4 h-4 mr-1" />
                              Activate
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Reward Tiers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {reward.tiers.map((tier, index) => (
                            <div
                              key={index}
                              className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">{tier.rank}</h4>
                                <Badge variant="outline">
                                  {tier.percentage}%
                                </Badge>
                              </div>
                              <div className="space-y-1">
                                {Object.entries(tier.rewards).map(
                                  ([token, amount]) => (
                                    <div
                                      key={token}
                                      className="flex justify-between text-sm"
                                    >
                                      <span>{token}:</span>
                                      <span className="font-medium">
                                        {amount}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-2">
                                {tier.recipients} recipient
                                {tier.recipients !== 1 ? "s" : ""}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Eligibility Rules */}
                        <div className="border-t pt-4">
                          <h4 className="font-semibold mb-2">
                            Eligibility Requirements
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-muted-foreground">
                                Min Points:
                              </span>
                              <span className="ml-1 font-medium">
                                {reward.eligibilityRules.minPoints}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Min Quests:
                              </span>
                              <span className="ml-1 font-medium">
                                {reward.eligibilityRules.minQuests}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Verification:
                              </span>
                              <span className="ml-1 font-medium">
                                {reward.eligibilityRules.verificationRequired
                                  ? "Required"
                                  : "Optional"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Auto Distribution:
                              </span>
                              <span className="ml-1 font-medium">
                                {reward.autoDistribution ? "Enabled" : "Manual"}
                              </span>
                            </div>
                          </div>

                          {reward.eligibilityRules.verificationRequired && (
                            <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg">
                              <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                                Accepted Verification Methods
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                {reward.eligibilityRules.acceptableVerifications.map(
                                  (method: string) => (
                                    <Badge
                                      key={method}
                                      variant="outline"
                                      className="bg-white dark:bg-gray-800"
                                    >
                                      {getVerificationIcon(method)}
                                      <span className="ml-1 capitalize">
                                        {method}
                                      </span>
                                    </Badge>
                                  )
                                )}
                              </div>
                              {reward.eligibilityRules.excludeManualReview && (
                                <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                                  ⚠️ Manual review is excluded - KYC or DID
                                  verification preferred
                                </div>
                              )}
                              <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                                💡 Having KYC or DID verification satisfies
                                identity requirements
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Special Bonus */}
                        {reward.specialBonus?.enabled && (
                          <div className="border-t pt-4">
                            <h4 className="font-semibold mb-2">
                              Special Bonus
                            </h4>
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <Star className="w-4 h-4 text-yellow-600" />
                                <span className="font-medium text-yellow-800 dark:text-yellow-200">
                                  {reward.specialBonus.multiplier}x Multiplier
                                </span>
                              </div>
                              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                {reward.specialBonus.description}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="achievements" className="space-y-6">
              <AchievementsManagement />
            </TabsContent>

            <TabsContent value="protocol" className="space-y-6">
              <ProtocolManagement />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
