"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import { CampaignData, type CampaignDataLike } from "ssri-ckboost/types";
import { AchievementsSection } from "@/components/dashboard/achievements-section";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardWithIndents } from "@/components/ui/card-with-indents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  Target,
  Users,
  TrendingUp,
  Calendar,
  CheckCircle,
  Shield,
  Settings,
  UserCog,
  FileText,
  Activity,
  Clock,
  Coins,
  Wallet,
} from "lucide-react";
import { createScopedLogger, formatDateConsistent } from "ssri-ckboost";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { useUser } from "@/lib/providers/user-provider";
import { useCampaigns } from "@/lib";
import {
  extractTypeIdFromCampaignCell,
  isCampaignApproved,
} from "@/lib/ckb/campaign-cells";
import type { UserSubmissionRecordLike } from "ssri-ckboost/types";
import { udtRegistry } from "@/lib/services/udt-registry";
import { extractIdentityDisplayName } from "@/lib/utils/identity";
import { getLatestDisplayName } from "@/lib/profile/profile-data";
import { PageLoading } from "@/components/ui/page-loading";

const log = createScopedLogger("DashboardPage");

interface SubmissionDisplayEntry {
  key: string;
  campaignTypeId: string;
  campaignTitle: string;
  questId: number;
  questTitle: string;
  points: number;
  status: "pending" | "approved";
  userTypeId: string | null;
  submissionTimestamp: number | null;
  deadlineTimestamp: number | null;
}

interface DeadlineEntry {
  key: string;
  campaignTypeId: string;
  campaignTitle: string;
  questId: number;
  questTitle: string;
  deadlineTimestamp: number;
  submissionStatus?: "pending" | "approved" | null;
}

const shorten = (
  value: string | null | undefined,
  head = 8,
  tail = 4,
): string => {
  if (!value) return "Unknown";
  if (value.length <= head + tail) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const normalizeHex = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    if (
      typeof value === "object" &&
      ArrayBuffer.isView(value as ArrayBufferView)
    ) {
      return ccc.hexFrom(value as ArrayLike<number>);
    }
    return ccc.hexFrom(ccc.bytesFrom(value as ccc.BytesLike));
  } catch (error) {
    log.warn("Failed to normalise hex value", { value, error });
    return null;
  }
};

const toMillis = (
  value: number | bigint | string | undefined | null,
): number | null => {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  // Heuristic: values greater than year 3000 in seconds will already be ms
  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
};

const readUdtAmount = (data: ccc.Hex): bigint => {
  if (!data || data === "0x" || data.length < 34) {
    return 0n;
  }
  const slice = data.slice(0, 34);
  const bytes = ccc.bytesFrom(slice);
  return ccc.numLeFromBytes(bytes);
};

const formatPoints = (
  value: number | bigint | string | undefined | null,
): string => {
  if (value === undefined || value === null) return "0";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString();
};

const buildSubmissionEntries = (
  submissions: UserSubmissionRecordLike[] | undefined,
  campaignMap: Map<string, CampaignDataLike>,
  userTypeId: string | null,
): SubmissionDisplayEntry[] => {
  if (!submissions || submissions.length === 0) return [];

  const normalizedUserTypeId = userTypeId ? userTypeId.toLowerCase() : null;

  return submissions.flatMap((submission, index) => {
    const campaignTypeId = normalizeHex(submission.campaign_type_id);
    if (!campaignTypeId) {
      return [];
    }

    const campaignData = campaignMap.get(campaignTypeId.toLowerCase());
    const questId = Number(submission.quest_id);
    const quest = campaignData?.quests?.find(
      (item) => Number(item.quest_id) === questId,
    );

    const acceptedIds = quest?.accepted_submission_user_type_ids || [];
    const isApproved =
      normalizedUserTypeId !== null
        ? acceptedIds.some(
            (candidate) =>
              normalizeHex(candidate)?.toLowerCase() === normalizedUserTypeId,
          )
        : false;

    const questTitle = quest?.metadata?.title || `Quest #${questId}`;
    const campaignTitle = campaignData?.metadata?.title || "Unknown campaign";
    const points = Number(quest?.points ?? 0);
    const submissionTimestamp = toMillis(
      Number(submission.submission_timestamp),
    );
    const deadlineTimestamp = toMillis(Number(quest?.completion_deadline));

    return [
      {
        key: `${campaignTypeId}:${questId}:${index}`,
        campaignTypeId,
        campaignTitle,
        questId,
        questTitle,
        points,
        status: isApproved ? "approved" : "pending",
        userTypeId: normalizedUserTypeId,
        submissionTimestamp,
        deadlineTimestamp,
      },
    ];
  });
};

const getActivityIcon = (status: "pending" | "approved") => {
  if (status === "approved") {
    return <CheckCircle className="w-4 h-4 text-green-600" />;
  }
  return <Clock className="w-4 h-4 text-blue-600" />;
};

const formatActivityText = (entry: SubmissionDisplayEntry): string => {
  if (entry.status === "approved") {
    return `Quest "${entry.questTitle}" approved (+${entry.points} points)`;
  }
  return `Submitted to "${entry.questTitle}" - awaiting review`;
};

export default function Dashboard() {
  const {
    userAddress,
    isAdmin,
    isEndorser,
    protocolData,
    protocolCell,
    error: protocolError,
    isLoading: protocolLoading,
  } = useProtocol();
  const signer = ccc.useSigner();
  const { client, open } = ccc.useCcc();
  const {
    currentUserData,
    currentUserTypeId,
    isLoading: userLoading,
    error: userError,
  } = useUser();
  const {
    campaigns,
    isLoading: campaignsLoading,
    error: campaignsError,
  } = useCampaigns();

  const [pointsBalance, setPointsBalance] = useState<bigint | null>(null);
  const [tokenBalances, setTokenBalances] = useState<
    Array<{
      key: string;
      symbol: string;
      formatted: string;
      raw: bigint;
      scriptHash: string;
      isPoints: boolean;
    }>
  >([]);
  const [tokenBalancesLoading, setTokenBalancesLoading] = useState(false);

  const displayName = useMemo(() => {
    const profileName = getLatestDisplayName(currentUserData?.profile_data);
    if (profileName) {
      return profileName;
    }
    const identityName = extractIdentityDisplayName(
      currentUserData?.verification_data?.identity_verification_data,
    );
    if (identityName) {
      return identityName;
    }
    if (userAddress) {
      return shorten(userAddress, 6, 6);
    }
    if (currentUserTypeId) {
      return currentUserTypeId;
    }
    return "Unknown user";
  }, [currentUserData, userAddress, currentUserTypeId]);

  const isVerified = useMemo(() => {
    if (!currentUserData) return false;
    const telegramId = Number(
      currentUserData.verification_data?.telegram_personal_chat_id || 0,
    );
    const identityBytes =
      currentUserData.verification_data?.identity_verification_data || "";
    return (
      telegramId > 0 ||
      (typeof identityBytes === "string" && identityBytes.length > 0)
    );
  }, [currentUserData]);

  const campaignMap = useMemo(() => {
    const map = new Map<string, CampaignDataLike>();
    campaigns.forEach((cell) => {
      try {
        const typeId = extractTypeIdFromCampaignCell(cell);
        if (!typeId) {
          return;
        }
        const campaignData = CampaignData.decode(
          cell.outputData,
        ) as CampaignDataLike;
        map.set(typeId.toLowerCase(), campaignData);
      } catch (error) {
        log.warn("Failed to decode campaign data", error);
      }
    });
    return map;
  }, [campaigns]);

  const submissionEntries = useMemo(
    () =>
      buildSubmissionEntries(
        currentUserData?.submission_records,
        campaignMap,
        currentUserTypeId,
      ),
    [currentUserData, campaignMap, currentUserTypeId],
  );

  const approvedSubmissions = useMemo(
    () =>
      submissionEntries.filter(
        (entry) =>
          entry.status === "approved" &&
          entry.userTypeId ===
            (currentUserTypeId ? currentUserTypeId.toLowerCase() : null),
      ),
    [submissionEntries, currentUserTypeId],
  );
  const pendingSubmissions = useMemo(
    () =>
      submissionEntries.filter(
        (entry) =>
          entry.status === "pending" &&
          entry.userTypeId ===
            (currentUserTypeId ? currentUserTypeId.toLowerCase() : null),
      ),
    [submissionEntries, currentUserTypeId],
  );
  const campaignsParticipated = useMemo(() => {
    const normalizedUserTypeId = currentUserTypeId
      ? currentUserTypeId.toLowerCase()
      : null;
    const userEntries = submissionEntries.filter(
      (entry) => entry.userTypeId === normalizedUserTypeId,
    );
    const unique = new Set(
      userEntries.map((entry) => entry.campaignTypeId.toLowerCase()),
    );
    return unique.size;
  }, [submissionEntries, currentUserTypeId]);

  const upcomingDeadlines = useMemo(() => {
    const now = Date.now();
    const deadlineEntries: DeadlineEntry[] = [];
    const approvedCampaignIds =
      (protocolData?.campaigns_approved as ccc.Hex[] | undefined) || [];
    const normalizedUserTypeId = currentUserTypeId
      ? currentUserTypeId.toLowerCase()
      : null;

    // Create a map of user submissions by campaignTypeId:questId
    const submissionMap = new Map<string, "pending" | "approved">();
    if (normalizedUserTypeId) {
      submissionEntries.forEach((entry) => {
        if (entry.userTypeId === normalizedUserTypeId) {
          const key = `${entry.campaignTypeId.toLowerCase()}:${entry.questId}`;
          // Prefer approved status if available, otherwise pending
          if (entry.status === "approved") {
            submissionMap.set(key, "approved");
          } else if (entry.status === "pending" && !submissionMap.has(key)) {
            submissionMap.set(key, "pending");
          }
        }
      });
    }

    // Iterate through all campaigns
    campaigns.forEach((cell) => {
      try {
        const campaignTypeId = extractTypeIdFromCampaignCell(cell);
        if (!campaignTypeId) {
          return;
        }

        // Check if campaign is approved
        if (!isCampaignApproved(campaignTypeId, approvedCampaignIds)) {
          return;
        }

        const campaignData = CampaignData.decode(
          cell.outputData,
        ) as CampaignDataLike;

        // Check if campaign is still active (not ended)
        const endTime = toMillis(ccc.numFrom(campaignData.ending_time));
        if (!endTime || endTime <= now) {
          return; // Campaign has ended
        }

        const campaignTitle =
          campaignData.metadata?.title || "Unknown campaign";

        // Iterate through all quests in the campaign
        campaignData.quests?.forEach((quest) => {
          const questDeadline = toMillis(
            ccc.numFrom(quest.completion_deadline),
          );
          if (!questDeadline || questDeadline <= now) {
            return; // Quest deadline has passed or doesn't exist
          }

          const questTitle =
            quest.metadata?.title || `Quest #${Number(quest.quest_id)}`;

          // Check if user has submitted to this quest
          const submissionKey = `${campaignTypeId.toLowerCase()}:${Number(
            quest.quest_id,
          )}`;
          const submissionStatus = submissionMap.get(submissionKey);

          deadlineEntries.push({
            key: `${campaignTypeId}:${quest.quest_id}`,
            campaignTypeId,
            campaignTitle,
            questId: Number(quest.quest_id),
            questTitle,
            deadlineTimestamp: questDeadline,
            submissionStatus: submissionStatus || null,
          });
        });
      } catch (error) {
        log.warn("Failed to process campaign for deadlines", error);
      }
    });

    // Sort by deadline (soonest first) and return top 5
    return deadlineEntries
      .sort((a, b) => a.deadlineTimestamp - b.deadlineTimestamp)
      .slice(0, 5);
  }, [campaigns, protocolData, submissionEntries, currentUserTypeId]);

  const recentActivity = useMemo(() => {
    const normalizedUserTypeId = currentUserTypeId
      ? currentUserTypeId.toLowerCase()
      : null;

    // Expand entries to show both submission and approval events for approved submissions
    const activityEntries: SubmissionDisplayEntry[] = [];
    const seenKeys = new Set<string>();

    submissionEntries.forEach((entry) => {
      if (
        !entry.submissionTimestamp ||
        entry.userTypeId !== normalizedUserTypeId
      ) {
        return;
      }

      const entryKey = `${entry.campaignTypeId}:${entry.questId}`;

      // Always add submission event
      if (!seenKeys.has(`${entryKey}:submission`)) {
        activityEntries.push({
          ...entry,
          key: `${entry.key}:submission`,
          status: "pending",
        });
        seenKeys.add(`${entryKey}:submission`);
      }

      // If approved, also add approval event
      if (
        entry.status === "approved" &&
        !seenKeys.has(`${entryKey}:approval`)
      ) {
        activityEntries.push({
          ...entry,
          key: `${entry.key}:approval`,
          status: "approved",
          // Use submission timestamp + 1ms so approval appears after submission in timeline
          submissionTimestamp: entry.submissionTimestamp + 1,
        });
        seenKeys.add(`${entryKey}:approval`);
      }
    });

    return activityEntries
      .sort((a, b) => b.submissionTimestamp! - a.submissionTimestamp!)
      .slice(0, 6);
  }, [submissionEntries, currentUserTypeId]);

  useEffect(() => {
    if (!signer || !client || !protocolCell || !protocolData) {
      setPointsBalance(null);
      setTokenBalances([]);
      return;
    }

    let cancelled = false;

    const loadTokenBalances = async () => {
      setTokenBalancesLoading(true);
      try {
        const protocolTypeScript = protocolCell.cellOutput.type;
        if (!protocolTypeScript) {
          if (!cancelled) {
            setPointsBalance(0n);
            setTokenBalances([]);
          }
          return;
        }

        const protocolTypeHash = protocolTypeScript.hash();
        const lockScript = (await signer.getRecommendedAddressObj()).script;

        const gatherAmountForScript = async (
          script: ccc.Script,
        ): Promise<bigint> => {
          let total = 0n;
          const collector = client.findCells({
            script: lockScript,
            scriptType: "lock" as const,
            scriptSearchMode: "exact" as const,
            filter: {
              script,
            },
            withData: true,
          });

          for await (const cell of collector) {
            total += readUdtAmount(cell.outputData as ccc.Hex);
          }

          return total;
        };

        const balancesMap = new Map<
          string,
          { raw: bigint; script: ccc.Script; isPoints: boolean }
        >();

        const scriptHashes = protocolData.protocol_config?.script_code_hashes;
        const pointsCodeHash =
          scriptHashes?.ckb_boost_points_udt_type_code_hash;

        // Load Points balance but don't add it to the display map
        if (pointsCodeHash) {
          const pointsScript = ccc.Script.from({
            codeHash: pointsCodeHash,
            hashType: "type" as ccc.HashType,
            args: protocolTypeHash,
          });
          const amount = await gatherAmountForScript(pointsScript);
          if (!cancelled) {
            setPointsBalance(amount);
          }
        } else if (!cancelled) {
          setPointsBalance(0n);
        }

        // Fetch CKB balance
        let ckbBalance = 0n;
        try {
          ckbBalance = await client.getBalance([lockScript]);
        } catch (error) {
          log.warn("Failed to fetch CKB balance", error);
        }

        const acceptedUdts = scriptHashes?.accepted_udt_type_scripts ?? [];

        for (const scriptLike of acceptedUdts) {
          try {
            const script = ccc.Script.from(scriptLike);
            const amount = await gatherAmountForScript(script);
            const hash = script.hash().toLowerCase();
            const existing = balancesMap.get(hash);
            if (existing) {
              balancesMap.set(hash, {
                ...existing,
                raw: amount,
              });
            } else if (amount > 0n) {
              balancesMap.set(hash, {
                raw: amount,
                script,
                isPoints: false,
              });
            }
          } catch (error) {
            log.warn("Failed to process accepted UDT script", error);
          }
        }

        if (!cancelled) {
          const entries: Array<{
            key: string;
            symbol: string;
            formatted: string;
            raw: bigint;
            scriptHash: string;
            isPoints: boolean;
          }> = [];

          // Add CKB balance first (always show it)
          const formatCKB = (value: bigint): string => {
            const divisor = 10n ** 8n;
            const integerPart = value / divisor;
            const fractionalPart = value % divisor;

            if (fractionalPart === 0n) {
              return integerPart.toLocaleString();
            }

            const fractionalStr = fractionalPart
              .toString()
              .padStart(8, "0")
              .replace(/0+$/, "");
            return `${integerPart.toLocaleString()}.${fractionalStr}`;
          };

          entries.push({
            key: "ckb-native",
            symbol: "CKB",
            formatted: formatCKB(ckbBalance),
            raw: ckbBalance,
            scriptHash: "",
            isPoints: false,
          });

          // Add other UDT tokens (excluding Points)
          balancesMap.forEach((value, hash) => {
            // Skip Points entries
            if (value.isPoints) {
              return;
            }

            const scriptHash = hash;
            const tokenInfo = udtRegistry.getTokenByScriptHash(scriptHash);
            const symbol = tokenInfo?.symbol ?? shorten(scriptHash, 6, 6);
            let formatted: string;
            if (tokenInfo) {
              formatted = udtRegistry.formatAmount(value.raw, tokenInfo);
            } else {
              formatted = value.raw.toString();
            }

            if (value.raw > 0n) {
              entries.push({
                key: scriptHash,
                symbol,
                formatted,
                raw: value.raw,
                scriptHash,
                isPoints: false,
              });
            }
          });

          entries.sort((a, b) => {
            // CKB always first
            if (a.symbol === "CKB") return -1;
            if (b.symbol === "CKB") return 1;
            if (a.raw === b.raw) {
              return a.symbol.localeCompare(b.symbol);
            }
            return a.raw > b.raw ? -1 : 1;
          });

          setTokenBalances(entries);
        }
      } catch (error) {
        log.warn("Failed to load user token balances", error);
        if (!cancelled) {
          setTokenBalances([]);
          setPointsBalance((prev) => prev ?? 0n);
        }
      } finally {
        if (!cancelled) {
          setTokenBalancesLoading(false);
        }
      }
    };

    loadTokenBalances();

    return () => {
      cancelled = true;
    };
  }, [signer, client, protocolCell, protocolData]);

  const loading = userLoading || campaignsLoading || protocolLoading;
  const combinedError = userError || campaignsError || protocolError;
  const pointsBalanceDisplay = useMemo(() => {
    if (!userAddress) {
      return "?";
    }
    if (pointsBalance === null) {
      return tokenBalancesLoading ? "?" : "0";
    }
    return pointsBalance.toLocaleString();
  }, [userAddress, pointsBalance, tokenBalancesLoading]);

  const [questFilter, setQuestFilter] = useState<"pending" | "approved">(
    "pending",
  );

  const renderQuestList = (
    entries: SubmissionDisplayEntry[],
    status: "pending" | "approved",
  ) => {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-20 rounded-lg bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-50 text-gray-900 dark:text-white" />
          <p className="text-gray-900 dark:text-white">
            {status === "pending"
              ? "No quests waiting for review"
              : "No approved quests yet"}
          </p>
          <Link href="/">
            <Button className="mt-4 rounded-full text-white font-semibold shadow-lg border-0 hover:opacity-90 transition-opacity bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099]">
              Browse Campaigns
            </Button>
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {entries.map((entry) => {
          const submittedAt = entry.submissionTimestamp
            ? formatDateConsistent(new Date(entry.submissionTimestamp))
            : "Unknown";
          const deadlineDate = entry.deadlineTimestamp
            ? formatDateConsistent(new Date(entry.deadlineTimestamp))
            : null;
          let deadlineBadge: React.ReactNode = null;
          if (deadlineDate) {
            const daysLeft = Math.max(
              0,
              Math.ceil(
                (entry.deadlineTimestamp! - Date.now()) / (1000 * 60 * 60 * 24),
              ),
            );
            deadlineBadge = (
              <Badge
                variant={daysLeft <= 3 ? "destructive" : "secondary"}
                className="bg-red-900/30 text-red-200 border-red-700"
              >
                {daysLeft}d left
              </Badge>
            );
          }

          return (
            <div
              key={entry.key}
              className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-4 bg-white dark:bg-gray-800"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-base text-gray-900 dark:text-white">
                    {entry.questTitle}
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Campaign: {entry.campaignTitle}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Submitted {submittedAt}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={
                      entry.status === "approved" ? "secondary" : "outline"
                    }
                    className={
                      entry.status === "approved"
                        ? "bg-green-900/30 text-green-200 border-green-700"
                        : "border-blue-400 text-blue-300 bg-blue-900/30"
                    }
                  >
                    {entry.status === "approved"
                      ? "Approved"
                      : "Pending Review"}
                  </Badge>
                  {deadlineBadge}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Points reward
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatPoints(entry.points)} pts
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Quest #{entry.questId}</span>
                  {deadlineDate && <span>Deadline {deadlineDate}</span>}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Progress
                  value={entry.status === "approved" ? 100 : 40}
                  className="h-2 w-3/4"
                />
                <Link
                  href={`/campaign/${entry.campaignTypeId}/quest/${entry.questId}`}
                >
                  <Button
                    size="sm"
                    className="rounded-full text-white font-semibold shadow-lg border-0 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#0000FF" }}
                  >
                    View Quest
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Check wallet connection first
  if (!signer) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        {/* Starlight background */}
        <div
          className="fixed inset-0 overflow-hidden pointer-events-none bg-white dark:bg-black"
          style={{
            zIndex: 0,
            backgroundImage: `url('/assets/Base%20UI/Starlight%20background.svg')`,
            backgroundSize: "100vw 100vh",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            imageRendering: "pixelated",
            width: "100%",
            height: "100%",
          }}
        />
        <main
          className="container mx-auto px-4 py-8 relative"
          style={{ zIndex: 10 }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-[60vh]">
              <CardWithIndents className="max-w-md w-full">
                <CardHeader className="text-center bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <div className="w-16 h-16 mx-auto rounded-full bg-blue-900 flex items-center justify-center mb-4">
                    <Wallet className="h-8 w-8 text-blue-300" />
                  </div>
                  <CardTitle className="text-2xl text-gray-900 dark:text-white">
                    Wallet Connection Required
                  </CardTitle>
                  <CardDescription className="text-base mt-2 text-gray-600 dark:text-gray-400">
                    Please connect your wallet to access your dashboard and view
                    your progress.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <Button
                    onClick={async () => {
                      try {
                        await open();
                      } catch (error) {
                        log.error("Connection failed:", error);
                      }
                    }}
                    size="lg"
                    className="rounded-full text-white font-semibold shadow-lg border-0 hover:opacity-90 transition-opacity bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099]"
                  >
                    <Wallet className="w-5 h-5 mr-2" />
                    Connect Wallet
                  </Button>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    Connect your CKB wallet to view your quest submissions,
                    points balance, and achievements.
                  </p>
                </CardContent>
              </CardWithIndents>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <PageLoading
        title="Loading Your Dashboard"
        description="Syncing your quests, submissions, and points from the CKBoost protocol."
      />
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
      {/* Starlight background - only for main content area, not footer */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none bg-white dark:bg-black"
        style={{
          zIndex: 0,
          backgroundImage: `url('/assets/Base%20UI/Starlight%20background.svg')`,
          backgroundSize: "100vw 100vh",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          imageRendering: "pixelated",
          width: "100%",
          height: "100%",
        }}
      />
      {/* Rabbit in top-right corner */}
      <div
        className="fixed top-0 right-0 overflow-hidden pointer-events-none"
        style={{
          zIndex: 1,
          width: "40vw",
          height: "30vh",
        }}
      >
        <img
          src="/assets/branding/Rabbit - Background.svg"
          alt="Rabbit Top Right"
          className="hidden dark:block"
          style={{
            position: "absolute",
            top: "0",
            right: "-5%",
            width: "auto",
            height: "100%",
            maxHeight: "400px",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
            transform: "rotate(-15deg)",
          }}
        />
        <img
          src="/assets/branding/Rabbit - Background  - Inverted.svg"
          alt="Rabbit Top Right Inverted"
          className="block dark:hidden"
          style={{
            position: "absolute",
            top: "0",
            right: "-5%",
            width: "auto",
            height: "100%",
            maxHeight: "400px",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
            transform: "rotate(-15deg)",
          }}
        />
      </div>
      <main
        className="container mx-auto px-4 py-8 relative"
        style={{ zIndex: 10 }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h1
                    className="text-4xl font-bold"
                    style={{
                      fontFamily: "Pixellari, monospace",
                    }}
                  >
                    <span className="text-[#0000FF] dark:text-white">
                      Welcome back,{" "}
                    </span>
                    <span
                      style={{
                        color: "#FF00FF",
                      }}
                    >
                      {displayName}
                    </span>
                  </h1>
                </div>
                <p className="text-lg text-gray-700 dark:text-white">
                  Track your submissions and monitor quest approvals in real
                  time.
                </p>
              </div>

              {!isVerified && userAddress && (
                <Link href="/identity">
                  <Button
                    className="flex items-center gap-2 rounded-full text-white font-semibold shadow-lg border-0 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#FFD700" }}
                  >
                    <Shield className="w-4 h-4" />
                    Verify Identity
                  </Button>
                </Link>
              )}
            </div>

            {(isAdmin || isEndorser) && (
              <Card className="mb-6 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 dark:from-orange-900/20 dark:to-red-900/20 dark:border-orange-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                    <Settings className="w-5 h-5" />
                    Admin Quick Access
                  </CardTitle>
                  <CardDescription className="text-sm text-orange-900/80 dark:text-orange-100/70">
                    Jump to the management tools that match your current
                    permissions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {isAdmin && (
                      <div className="rounded-lg border border-orange-200 bg-white/70 p-4 shadow-sm dark:border-orange-800/60 dark:bg-orange-950/30">
                        <div className="flex items-start gap-3">
                          <Shield className="w-5 h-5 text-orange-700 dark:text-orange-200" />
                          <div>
                            <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                              Platform Administration
                            </h3>
                            <p className="text-sm text-orange-800/80 dark:text-orange-100/70">
                              Manage protocol-wide settings and approvals.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <Link href="/platform-admin">
                            <Button className="w-full justify-start rounded-full text-white font-semibold shadow-lg border-0 hover:opacity-90 transition-opacity bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099]">
                              <Settings className="w-4 h-4 mr-2" />
                              Platform Admin Dashboard
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}

                    {(isAdmin || isEndorser) && (
                      <div className="rounded-lg border border-orange-200 bg-white/70 p-4 shadow-sm dark:border-orange-800/60 dark:bg-orange-950/30">
                        <div className="flex items-start gap-3">
                          <UserCog className="w-5 h-5 text-orange-700 dark:text-orange-200" />
                          <div>
                            <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                              Campaign Administration
                            </h3>
                            <p className="text-sm text-orange-800/80 dark:text-orange-100/70">
                              Review quests, manage teams, and track tipping.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <Link href="/campaign-admin">
                            <Button className="w-full justify-start rounded-full text-white font-semibold shadow-lg border-0 hover:opacity-90 transition-opacity bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099]">
                              <UserCog className="w-4 h-4 mr-2" />
                              Campaign Admin Dashboard
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {combinedError && (
            <Card className="mb-8 border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
              <CardContent className="py-4">
                <div className="text-sm text-red-700 dark:text-red-200">
                  {combinedError}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <CardWithIndents>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">
                  Points Balance
                </CardTitle>
                <Trophy className="h-4 w-4 text-yellow-400" />
              </CardHeader>
              <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {pointsBalanceDisplay}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  On-chain Points UDT balance
                </p>
              </CardContent>
            </CardWithIndents>

            <CardWithIndents>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">
                  Approved Quests
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {approvedSubmissions.length}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {pendingSubmissions.length} pending review
                </p>
              </CardContent>
            </CardWithIndents>

            <CardWithIndents>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">
                  Pending Reviews
                </CardTitle>
                <Activity className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {pendingSubmissions.length}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Waiting for campaign managers
                </p>
              </CardContent>
            </CardWithIndents>

            <CardWithIndents>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">
                  Campaigns Joined
                </CardTitle>
                <Users className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {campaignsParticipated}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Unique campaigns contributed
                </p>
              </CardContent>
            </CardWithIndents>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <CardWithIndents>
                <CardHeader className="flex flex-col gap-4 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-400" />
                    <CardTitle className="text-gray-900 dark:text-white">
                      Your Quests
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <Tabs
                    value={questFilter}
                    onValueChange={(value) =>
                      setQuestFilter(value as "pending" | "approved")
                    }
                  >
                    <TabsList className="bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                      <TabsTrigger
                        value="pending"
                        className="rounded-full text-white font-semibold shadow-lg border-0 transition-all hover:opacity-90 data-[state=active]:opacity-100 data-[state=inactive]:opacity-60 data-[state=inactive]:bg-gray-300 dark:data-[state=inactive]:bg-gray-700 bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099]"
                      >
                        Pending Review ({pendingSubmissions.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="approved"
                        className="rounded-full text-white font-semibold shadow-lg border-0 transition-all hover:opacity-90 data-[state=active]:opacity-100 data-[state=inactive]:opacity-60 data-[state=inactive]:bg-gray-300 dark:data-[state=inactive]:bg-gray-700 bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099]"
                      >
                        Approved ({approvedSubmissions.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="pending" className="mt-4">
                      {renderQuestList(pendingSubmissions, "pending")}
                    </TabsContent>
                    <TabsContent value="approved" className="mt-4">
                      {renderQuestList(approvedSubmissions, "approved")}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </CardWithIndents>
            </div>

            <div className="space-y-6">
              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Coins className="w-5 h-5 text-purple-400" />
                    Asset Balances
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  {!userAddress ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Connect your wallet to view balances.
                    </div>
                  ) : tokenBalancesLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={index}
                          className="h-10 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : tokenBalances.length === 0 ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      No token balances found.
                    </div>
                  ) : (
                    tokenBalances.map((token) => (
                      <div
                        key={token.key}
                        className="flex items-center justify-between"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {token.symbol}
                          </span>
                          {!token.isPoints && token.scriptHash && (
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {shorten(token.scriptHash, 6, 6)}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {token.formatted}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Balances are calculated from on-chain CKB and UDT cells held
                    by your wallet.
                  </div>
                </CardContent>
              </CardWithIndents>

              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Calendar className="w-5 h-5 text-orange-400" />
                    Upcoming Deadlines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  {upcomingDeadlines.length === 0 ? (
                    <div className="text-center py-4 text-gray-600 dark:text-gray-400 text-sm">
                      No upcoming deadlines
                    </div>
                  ) : (
                    upcomingDeadlines.map((entry) => {
                      const deadline = entry.deadlineTimestamp
                        ? formatDateConsistent(
                            new Date(entry.deadlineTimestamp),
                          )
                        : "Unknown";
                      const daysLeft = entry.deadlineTimestamp
                        ? Math.max(
                            0,
                            Math.ceil(
                              (entry.deadlineTimestamp - Date.now()) /
                                (1000 * 60 * 60 * 24),
                            ),
                          )
                        : null;

                      return (
                        <Link
                          key={`deadline-${entry.key}`}
                          href={`/campaign/${entry.campaignTypeId}`}
                          className="block"
                        >
                          <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-gray-300 dark:border-gray-700">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm mb-1 text-gray-900 dark:text-white">
                                {entry.questTitle}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {entry.campaignTitle}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                Due {deadline}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 items-end ml-2 flex-shrink-0">
                              {entry.submissionStatus === "approved" && (
                                <Badge
                                  variant="secondary"
                                  className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 w-fit"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Approved
                                </Badge>
                              )}
                              {entry.submissionStatus === "pending" && (
                                <Badge
                                  variant="outline"
                                  className="border-blue-300 text-blue-600 dark:border-blue-500 dark:text-blue-200 w-fit"
                                >
                                  Pending
                                </Badge>
                              )}
                              {daysLeft !== null && (
                                <Badge
                                  variant={
                                    daysLeft <= 3 ? "destructive" : "secondary"
                                  }
                                >
                                  {daysLeft}d left
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </CardContent>
              </CardWithIndents>

              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  {recentActivity.length === 0 ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      No submissions yet. Complete a quest to see it here.
                    </div>
                  ) : (
                    recentActivity.map((entry) => (
                      <div
                        key={`activity-${entry.key}`}
                        className="flex items-start gap-3"
                      >
                        {getActivityIcon(entry.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {formatActivityText(entry)}
                          </div>
                          {entry.submissionTimestamp && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {formatDateConsistent(
                                new Date(entry.submissionTimestamp),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </CardWithIndents>
            </div>
          </div>

          <div className="mt-8">
            <AchievementsSection />
          </div>
        </div>
      </main>

      {/* Rabbit on Logo at bottom */}
      <div
        className="fixed bottom-0 left-0 right-0 overflow-hidden pointer-events-none"
        style={{
          zIndex: 1,
          height: "400px",
        }}
      >
        <img
          src="/assets/branding/Rabbit on Logo.svg"
          alt="Rabbit on Logo"
          className="hidden dark:block"
          style={{
            position: "absolute",
            bottom: "0",
            left: "50%",
            transform: "translateX(-50%)",
            width: "auto",
            height: "350px",
            maxHeight: "60vh",
            imageRendering: "pixelated",
            opacity: 1,
          }}
        />
        <img
          src="/assets/branding/Rabbit on Logo  - Inverted.svg"
          alt="Rabbit on Logo Inverted"
          className="block dark:hidden"
          style={{
            position: "absolute",
            bottom: "0",
            left: "50%",
            transform: "translateX(-50%)",
            width: "auto",
            height: "350px",
            maxHeight: "60vh",
            imageRendering: "pixelated",
            opacity: 1,
          }}
        />
      </div>
    </div>
  );
}
