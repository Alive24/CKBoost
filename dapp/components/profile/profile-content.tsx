"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import {
  Award,
  Calendar,
  ExternalLink,
  Medal,
  Coins,
  ShieldCheck,
  Star,
} from "lucide-react";
import { ckboost } from "ssri-ckboost";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useCampaigns } from "@/lib/providers/campaign-provider";
import { CampaignData, TippingData } from "ssri-ckboost/types";
import { extractTypeIdFromCampaignCell } from "@/lib/ckb/campaign-cells";
import { extractIdentityDisplayName } from "@/lib/utils/identity";
import { udtRegistry, type UDTToken } from "@/lib/services/udt-registry";
import { createScopedLogger } from "ssri-ckboost";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { fetchTippingByTypeId } from "@/lib/ckb/tipping-cells";
import { getLatestDisplayName } from "@/lib/profile/profile-data";
import { getDidVerificationData } from "@/lib/identity/verification-data";
import { formatDid } from "@/lib/vellum/dids";

const log = createScopedLogger("ProfileContent");

type PointsMintTransactionPayload = {
  txHash: string;
  blockNumber: string | null;
  txIndex: string | null;
  netPoints: string;
  outputs: Array<{ index: number; amount: string }>;
  inputs: Array<{ index: number; amount: string }>;
};

type PointsMintTransaction = PointsMintTransactionPayload & {
  timestamp: number | null;
};

type PointsMintResponse = {
  transactions: PointsMintTransactionPayload[];
};

type UserDataType = ReturnType<typeof ckboost.types.UserData.decode>;

export interface ProfileContentProps {
  context: "self" | "address";
  isLoading: boolean;
  loadError: string | null;
  userData: UserDataType | null;
  userTypeId: ccc.Hex | null;
  fallbackAddress?: string | null;
  onDisplayNameChange?: (displayName: string) => Promise<ccc.Hex>;
}

const shorten = (value: string | null | undefined, head = 8, tail = 6) => {
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
  } catch {
    return null;
  }
};

const decodeSubmissionContent = (content: unknown): string | null => {
  if (!content) return null;
  if (typeof content === "string") {
    if (content.startsWith("0x")) {
      try {
        const decoded = new TextDecoder().decode(ccc.bytesFrom(content));
        return decoded.trim() || null;
      } catch {
        return content;
      }
    }
    return content.trim() || null;
  }
  if (
    typeof content === "object" &&
    ArrayBuffer.isView(content as ArrayBufferView)
  ) {
    try {
      return new TextDecoder().decode(content as Uint8Array);
    } catch {
      return null;
    }
  }
  return null;
};

const formatTimestamp = (
  value: number | bigint | string | null | undefined,
): string => {
  if (value === undefined || value === null) return "Unknown";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Unknown";
  const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(millis).toLocaleString();
};

const formatPointsAmount = (points: ccc.NumLike | undefined | null): string => {
  try {
    const value = points ? BigInt(ccc.numFrom(points)) : 0n;
    return value.toLocaleString();
  } catch {
    return "0";
  }
};

const formatTimestampFromMillis = (value: number | null): string | null => {
  if (!value || Number.isNaN(value) || value <= 0) return null;
  return new Date(value).toLocaleString();
};

const numToBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0n;
    try {
      if (trimmed.startsWith("0x") || trimmed.startsWith("-0x")) {
        return BigInt(trimmed);
      }
      return BigInt(trimmed);
    } catch {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return BigInt(Math.trunc(numeric));
      }
      return 0n;
    }
  }

  try {
    const numeric = ccc.numFrom(value as ccc.NumLike);
    if (typeof numeric === "bigint") return numeric;
    if (typeof numeric === "number") {
      if (!Number.isFinite(numeric)) return 0n;
      return BigInt(Math.trunc(numeric));
    }
    const maybeToString = (numeric as unknown as { toString?: () => string })
      ?.toString;
    if (typeof maybeToString === "function") {
      return numToBigInt(maybeToString.call(numeric));
    }
  } catch {
    if (
      value &&
      typeof value === "object" &&
      "toString" in (value as Record<string, unknown>) &&
      typeof (value as { toString: () => string }).toString === "function"
    ) {
      try {
        return numToBigInt((value as { toString: () => string }).toString());
      } catch {
        return 0n;
      }
    }
  }

  return 0n;
};

const formatBigIntAmount = (value: bigint): string => {
  try {
    return value.toLocaleString();
  } catch {
    return value.toString();
  }
};

const SHANNON_FACTOR = 10n ** 8n;

const formatCkbAmount = (shannons: bigint): string => {
  try {
    const integer = shannons / SHANNON_FACTOR;
    const fractional = shannons % SHANNON_FACTOR;
    if (fractional === 0n) {
      return integer.toLocaleString();
    }
    const fractionalStr = fractional
      .toString()
      .padStart(8, "0")
      .replace(/0+$/, "");
    return `${integer.toLocaleString()}.${fractionalStr}`;
  } catch {
    return shannons.toString();
  }
};

const formatNumberStringWithSeparators = (value: string): string => {
  const [wholePart, fractionalPart] = value.split(".");
  const hasNegative = wholePart.startsWith("-");
  const numericWhole = hasNegative ? wholePart.slice(1) : wholePart;
  const withSeparators = numericWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formattedWhole = hasNegative ? `-${withSeparators}` : withSeparators;
  return fractionalPart && fractionalPart.length > 0
    ? `${formattedWhole}.${fractionalPart}`
    : formattedWhole;
};

const formatTokenAmount = (value: bigint, token: UDTToken | null): string => {
  if (token) {
    try {
      const formatted = udtRegistry.formatAmount(value, token);
      return formatNumberStringWithSeparators(formatted);
    } catch (error) {
      log.warn("Failed to format token amount", token.symbol, error);
    }
  }

  // For tokens without token info, use bigint formatting
  return formatBigIntAmount(value);
};

type RewardCategory =
  | "quest"
  | "tipping"
  | "achievement"
  | "streak"
  | "mockMint"
  | "other";

type TokenRewardDetail = {
  symbol: string;
  amount: bigint;
  scriptHash: string | null;
  token: UDTToken | null;
};

type RewardEventDetail = {
  id: string;
  type: RewardCategory;
  title: string;
  subtitle?: string | null;
  link?: string | null;
  points: bigint;
  tokenRewards: TokenRewardDetail[];
};

type RewardTableRow = {
  txHash: string;
  blockNumber: string | null;
  formattedTimestamp: string;
  explorerUrl: string;
  events: RewardEventDetail[];
  totalPoints: bigint;
  totalTokens: TokenRewardDetail[];
  timestampValue: number;
};

const rewardCategoryStyles: Record<
  RewardCategory,
  { label: string; className: string }
> = {
  quest: {
    label: "Quest",
    className:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  },
  tipping: {
    label: "Tipping",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
  achievement: {
    label: "Achievement",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  },
  other: {
    label: "Reward",
    className:
      "bg-slate-100 text-slate-700 dark:bg-slate-600/30 dark:text-slate-200",
  },
  streak: {
    label: "Streak Bonus",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
  mockMint: {
    label: "Mock Mint",
    className:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-200",
  },
};

const buildSyntheticRewardEvent = (
  tx: PointsMintTransaction,
  points: bigint,
  tippingData?: {
    points: bigint;
    ckb: bigint;
    typeId?: string;
    title?: string;
  },
): RewardEventDetail => {
  // Check if this is a tipping reward
  if (tippingData && (tippingData.points > 0n || tippingData.ckb > 0n)) {
    const tokenRewards: TokenRewardDetail[] = [];

    if (tippingData.ckb > 0n) {
      tokenRewards.push({
        symbol: "CKB",
        amount: tippingData.ckb,
        scriptHash: null,
        token: null,
      });
    }

    return {
      id: `${tx.txHash}:tipping-reward`,
      type: "tipping",
      title: tippingData.title || "Tipping proposal reward",
      subtitle: null,
      link: tippingData.typeId
        ? `/tipping?tipping=${tippingData.typeId}`
        : null,
      points: tippingData.points,
      tokenRewards,
    };
  }

  const inputCount = tx.inputs?.length ?? 0;
  const outputCount = tx.outputs?.length ?? 0;

  if (inputCount === 0 && outputCount > 0) {
    return {
      id: `${tx.txHash}:mock-mint`,
      type: "mockMint",
      title: "Mock mint allocation",
      subtitle: null,
      link: null,
      points,
      tokenRewards: [],
    };
  }

  if (inputCount === 1 && outputCount === 1) {
    const previousAmount = numToBigInt(tx.inputs?.[0]?.amount ?? 0);
    const nextAmount = numToBigInt(tx.outputs?.[0]?.amount ?? 0);
    const delta = nextAmount - previousAmount;
    const subtitle =
      delta > 0n
        ? `Balance increased by ${formatBigIntAmount(delta)}`
        : "Points balance updated";
    return {
      id: `${tx.txHash}:streak-bonus`,
      type: "streak",
      title: "Streak bonus claim",
      subtitle,
      link: null,
      points,
      tokenRewards: [],
    };
  }

  return {
    id: `${tx.txHash}:reward`,
    type: "other",
    title: "Reward distribution",
    subtitle: null,
    link: null,
    points,
    tokenRewards: [],
  };
};

export function ProfileContent({
  context,
  isLoading: externalLoading,
  loadError: externalError,
  userData,
  userTypeId,
  fallbackAddress,
  onDisplayNameChange,
}: ProfileContentProps) {
  const { client } = ccc.useCcc();
  const { protocolCell, protocolData } = useProtocol();
  const {
    campaigns,
    isLoading: campaignsLoading,
    error: campaignsError,
  } = useCampaigns();

  const isLoading = externalLoading || campaignsLoading;
  const loadError = externalError || campaignsError;
  const normalizedFallbackAddress = fallbackAddress || null;
  const [pointsTransactions, setPointsTransactions] = useState<
    PointsMintTransaction[]
  >([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [tippingRewards, setTippingRewards] = useState<
    Map<
      string,
      { points: bigint; ckb: bigint; typeId?: string; title?: string }
    >
  >(new Map());
  const explorerBaseUrl =
    process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet"
      ? "https://explorer.nervos.org/transaction/"
      : "https://pudge.explorer.nervos.org/transaction/";
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [pendingDisplayName, setPendingDisplayName] = useState("");
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const campaignMap = useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        quests: Record<
          number,
          {
            title: string;
            points: bigint;
            tokens: TokenRewardDetail[];
          }
        >;
      }
    >();

    campaigns.forEach((cell) => {
      try {
        const typeId = extractTypeIdFromCampaignCell(cell);
        if (!typeId) return;
        const data = CampaignData.decode(cell.outputData);
        const quests: Record<
          number,
          {
            title: string;
            points: bigint;
            tokens: TokenRewardDetail[];
          }
        > = {};

        (data.quests || []).forEach((quest) => {
          const questId = Number(quest.quest_id);
          try {
            const questPoints = numToBigInt(quest.points ?? 0);
            const tokenRewards: TokenRewardDetail[] = [];

            (quest.rewards_on_completion || []).forEach((assetList) => {
              (assetList?.udt_assets || []).forEach((udtAsset) => {
                const amount = numToBigInt(udtAsset.amount ?? 0);
                if (amount === 0n) {
                  return;
                }

                try {
                  const script = ccc.Script.from(udtAsset.udt_script);
                  const scriptHash = script.hash().toLowerCase();
                  const tokenInfo =
                    udtRegistry.getTokenByScriptHash(scriptHash) ?? null;
                  const symbol = tokenInfo?.symbol ?? "UDT";

                  tokenRewards.push({
                    symbol,
                    amount,
                    scriptHash,
                    token: tokenInfo,
                  });
                } catch (tokenError) {
                  log.warn(
                    "Failed to derive UDT reward for profile",
                    tokenError,
                  );
                  tokenRewards.push({
                    symbol: "UDT",
                    amount,
                    scriptHash: null,
                    token: null,
                  });
                }
              });
            });

            quests[questId] = {
              title: quest.metadata?.title || `Quest #${questId}`,
              points: questPoints,
              tokens: tokenRewards,
            };
          } catch (questError) {
            log.warn("Failed to derive quest rewards for profile", questError);
            quests[questId] = {
              title: quest.metadata?.title || `Quest #${questId}`,
              points: numToBigInt(quest.points ?? 0),
              tokens: [],
            };
          }
        });

        map.set(typeId.toLowerCase(), {
          title: data.metadata?.title || "Unknown campaign",
          quests,
        });
      } catch (error) {
        log.warn("Failed to decode campaign cell for profile", error);
      }
    });

    return map;
  }, [campaigns]);

  const profileDisplayName = useMemo(
    () => getLatestDisplayName(userData?.profile_data),
    [userData?.profile_data],
  );

  const preferredDid = useMemo(
    () =>
      getDidVerificationData(
        userData?.verification_data?.identity_verification_data,
      ),
    [userData?.verification_data?.identity_verification_data],
  );

  const canEditDisplayName =
    context === "self" &&
    typeof onDisplayNameChange === "function" &&
    !!userData &&
    !preferredDid;

  const displayName = useMemo(() => {
    if (preferredDid?.displayName) {
      return preferredDid.displayName;
    }
    if (preferredDid?.did) {
      return formatDid(preferredDid.did);
    }
    if (profileDisplayName) {
      return profileDisplayName;
    }
    const identityName = extractIdentityDisplayName(
      userData?.verification_data?.identity_verification_data,
    );
    if (identityName) {
      return identityName;
    }
    if (normalizedFallbackAddress) {
      return normalizedFallbackAddress;
    }
    if (userTypeId) {
      return userTypeId;
    }
    return "Unknown user";
  }, [
    preferredDid,
    profileDisplayName,
    normalizedFallbackAddress,
    userData,
    userTypeId,
  ]);

  const secondaryIdentifier = useMemo(() => {
    const candidate =
      preferredDid?.did ??
      (normalizedFallbackAddress && normalizedFallbackAddress.trim().length > 0
        ? normalizedFallbackAddress
        : (userTypeId ?? null));
    if (!candidate) return null;
    if (candidate === displayName) return null;
    return candidate;
  }, [displayName, normalizedFallbackAddress, preferredDid?.did, userTypeId]);

  useEffect(() => {
    if (!canEditDisplayName || isEditDialogOpen) {
      return;
    }
    setPendingDisplayName(profileDisplayName ?? "");
  }, [canEditDisplayName, profileDisplayName, isEditDialogOpen]);

  const openDisplayNameDialog = () => {
    if (!canEditDisplayName) {
      return;
    }
    setPendingDisplayName(profileDisplayName ?? "");
    setDisplayNameError(null);
    setIsEditDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setDisplayNameError(null);
      setPendingDisplayName(profileDisplayName ?? "");
    }
  };

  const handleDisplayNameSave = async () => {
    if (!onDisplayNameChange) {
      return;
    }
    const trimmed = pendingDisplayName.trim();
    if (!trimmed) {
      setDisplayNameError("Display name cannot be empty");
      return;
    }

    try {
      setIsSavingDisplayName(true);
      setDisplayNameError(null);
      await onDisplayNameChange(trimmed);
      toast({
        title: "Display name updated",
        description:
          "The new name will appear after the transaction is confirmed on-chain.",
      });
      setIsEditDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update display name";
      setDisplayNameError(message);
      toast({
        title: "Unable to update display name",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  const telegramVerified = useMemo(() => {
    const value = userData?.verification_data?.telegram_personal_chat_id;
    if (value === undefined || value === null) return false;
    try {
      const numeric = BigInt(ccc.numFrom(value));
      return numeric > 0n;
    } catch {
      return false;
    }
  }, [userData]);

  const submissionEntries = useMemo(() => {
    if (!userData) return [];
    return [...(userData.submission_records || [])]
      .map((record, index) => {
        const campaignTypeId = normalizeHex(record.campaign_type_id);
        const questId = Number(record.quest_id);
        const submissionTimestamp = Number(record.submission_timestamp ?? 0);

        const campaignInfo = campaignTypeId
          ? campaignMap.get(campaignTypeId.toLowerCase())
          : undefined;

        const questInfo = campaignInfo?.quests?.[questId];
        const submissionContent = decodeSubmissionContent(
          record.submission_content,
        );

        return {
          key: `${campaignTypeId ?? "unknown"}:${questId}:${index}`,
          campaignTypeId,
          campaignTitle: campaignInfo?.title || "Unknown campaign",
          questId,
          questTitle: questInfo?.title || `Quest #${questId}`,
          submissionTimestamp,
          submissionContent,
          points: questInfo?.points ?? 0n,
        };
      })
      .sort((a, b) => b.submissionTimestamp - a.submissionTimestamp);
  }, [userData, campaignMap]);

  useEffect(() => {
    if (!normalizedFallbackAddress) {
      setPointsTransactions([]);
      setPointsError(null);
      setPointsLoading(false);
      return;
    }

    let cancelled = false;

    const loadTransactions = async () => {
      setPointsLoading(true);
      setPointsError(null);

      try {
        const params = new URLSearchParams({
          address: normalizedFallbackAddress,
          limit: "50",
        });

        const response = await fetch(
          `/.netlify/functions/reward-history?${params.toString()}`,
        );

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load reward transactions");
        }

        const data = (await response.json()) as PointsMintResponse;
        const transactions = data.transactions ?? [];

        if (transactions.length === 0) {
          if (!cancelled) {
            setPointsTransactions([]);
          }
          return;
        }

        let timestampMap = new Map<string, number>();

        if (client) {
          const blocks = Array.from(
            new Set(
              transactions
                .map((tx) => tx.blockNumber)
                .filter((bn): bn is string => Boolean(bn)),
            ),
          );

          if (blocks.length > 0) {
            const results = await Promise.all(
              blocks.map(async (bn) => {
                try {
                  const header = await client.getHeaderByNumber(BigInt(bn));
                  if (!header || header.timestamp === undefined) {
                    return null;
                  }
                  const rawTimestamp =
                    typeof header.timestamp === "bigint"
                      ? header.timestamp
                      : ccc.numFrom(header.timestamp ?? 0);
                  const numeric =
                    typeof rawTimestamp === "bigint"
                      ? Number(rawTimestamp)
                      : Number(rawTimestamp ?? 0);
                  return { block: bn, timestamp: numeric } as const;
                } catch (error) {
                  log.warn(
                    "Failed to load block header for reward transaction",
                    bn,
                    error,
                  );
                  return null;
                }
              }),
            );

            timestampMap = new Map(
              results
                .filter((item): item is { block: string; timestamp: number } =>
                  Boolean(item && item.timestamp),
                )
                .map((item) => [item.block, item.timestamp]),
            );
          }
        }

        const withTimestamps: PointsMintTransaction[] = transactions.map(
          (tx) => ({
            ...tx,
            timestamp: tx.blockNumber
              ? (timestampMap.get(tx.blockNumber) ?? null)
              : null,
          }),
        );

        if (!cancelled) {
          setPointsTransactions(withTimestamps);
        }
      } catch (error) {
        if (!cancelled) {
          log.error("Failed to fetch reward transactions", error);
          setPointsTransactions([]);
          setPointsError(
            error instanceof Error
              ? error.message
              : "Failed to load reward transactions",
          );
        }
      } finally {
        if (!cancelled) {
          setPointsLoading(false);
        }
      }
    };

    loadTransactions();

    return () => {
      cancelled = true;
    };
  }, [normalizedFallbackAddress, client]);

  const rewardRows = useMemo<RewardTableRow[]>(() => {
    if (pointsTransactions.length === 0) return [];

    const transactionsAscending = [...pointsTransactions].sort((a, b) => {
      const aTime = a.timestamp ?? (a.blockNumber ? Number(a.blockNumber) : 0);
      const bTime = b.timestamp ?? (b.blockNumber ? Number(b.blockNumber) : 0);
      return aTime - bTime;
    });

    const submissionsAscending = [...submissionEntries].sort(
      (a, b) => a.submissionTimestamp - b.submissionTimestamp,
    );

    let submissionCursor = 0;
    const rows: RewardTableRow[] = [];

    transactionsAscending.forEach((tx) => {
      const events: RewardEventDetail[] = [];
      const tokenTotals = new Map<string, TokenRewardDetail>();
      let remainingPoints = numToBigInt(tx.netPoints);

      const timestampLabel =
        formatTimestampFromMillis(tx.timestamp ?? null) ??
        (tx.blockNumber ? `Block #${tx.blockNumber}` : "Unknown");

      while (
        submissionCursor < submissionsAscending.length &&
        remainingPoints > 0n
      ) {
        const submission = submissionsAscending[submissionCursor];
        const campaignKey = submission.campaignTypeId?.toLowerCase();
        const questDetails = campaignKey
          ? campaignMap.get(campaignKey)?.quests?.[submission.questId]
          : undefined;

        const questPoints = questDetails?.points ?? submission.points ?? 0n;

        if (questPoints <= 0n) {
          submissionCursor += 1;
          continue;
        }

        if (questPoints > remainingPoints) {
          break;
        }

        const questTokens = questDetails?.tokens ?? [];
        questTokens.forEach((token) => {
          const key = (token.scriptHash ?? `symbol:${token.symbol}`)
            .toLowerCase()
            .trim();
          const existing = tokenTotals.get(key);
          if (existing) {
            const shouldReplaceSymbol =
              existing.symbol === "UDT" && token.symbol !== "UDT";
            tokenTotals.set(key, {
              ...existing,
              symbol: shouldReplaceSymbol ? token.symbol : existing.symbol,
              amount: existing.amount + token.amount,
              token: existing.token ?? token.token ?? null,
            });
          } else {
            tokenTotals.set(key, {
              symbol: token.symbol,
              amount: token.amount,
              scriptHash: token.scriptHash,
              token: token.token ?? null,
            });
          }
        });

        events.push({
          id: `${tx.txHash}:${submission.key}`,
          type: "quest",
          title: questDetails?.title ?? submission.questTitle,
          subtitle: submission.campaignTitle,
          link: submission.campaignTypeId
            ? `/campaign/${submission.campaignTypeId}?quest=${submission.questId}`
            : null,
          points: questPoints,
          tokenRewards: questTokens.map((token) => ({ ...token })),
        });

        remainingPoints -= questPoints;
        submissionCursor += 1;
      }

      if (events.length === 0) {
        const tippingReward = tippingRewards.get(tx.txHash);
        const syntheticEvent = buildSyntheticRewardEvent(
          tx,
          remainingPoints,
          tippingReward,
        );
        events.push(syntheticEvent);

        // Aggregate tokens from tipping reward
        if (tippingReward && syntheticEvent.tokenRewards) {
          syntheticEvent.tokenRewards.forEach((token) => {
            const key = (token.scriptHash ?? `symbol:${token.symbol}`)
              .toLowerCase()
              .trim();
            const existing = tokenTotals.get(key);
            if (existing) {
              tokenTotals.set(key, {
                ...existing,
                amount: existing.amount + token.amount,
              });
            } else {
              tokenTotals.set(key, {
                symbol: token.symbol,
                amount: token.amount,
                scriptHash: token.scriptHash,
                token: token.token ?? null,
              });
            }
          });
        }
      } else if (remainingPoints > 0n) {
        events.push({
          id: `${tx.txHash}:residual`,
          type: "other",
          title: "Additional reward",
          subtitle: null,
          link: null,
          points: remainingPoints,
          tokenRewards: [],
        });
      }

      const totalPoints = numToBigInt(tx.netPoints);
      const totalTokens = Array.from(tokenTotals.values());

      rows.push({
        txHash: tx.txHash,
        blockNumber: tx.blockNumber ?? null,
        formattedTimestamp: timestampLabel,
        explorerUrl: `${explorerBaseUrl}${tx.txHash}`,
        events,
        totalPoints,
        totalTokens,
        timestampValue:
          tx.timestamp ?? (tx.blockNumber ? Number(tx.blockNumber) : 0),
      });
    });

    return rows.sort((a, b) => b.timestampValue - a.timestampValue);
  }, [
    pointsTransactions,
    submissionEntries,
    campaignMap,
    explorerBaseUrl,
    tippingRewards,
  ]);

  // Fetch tipping rewards for transactions that don't match submissions
  useEffect(() => {
    if (
      !client ||
      !protocolCell ||
      !protocolData ||
      pointsTransactions.length === 0
    ) {
      return;
    }

    let cancelled = false;

    const fetchTippingRewards = async () => {
      try {
        const network = deploymentManager.getCurrentNetwork();
        const tippingCodeHash = deploymentManager.getContractCodeHash(
          network,
          "ckboostTippingType",
        );

        if (!tippingCodeHash) {
          log.warn("Tipping code hash not found");
          return;
        }

        const protocolTypeHash = protocolCell.cellOutput.type?.hash();
        if (!protocolTypeHash) {
          return;
        }

        const rewardsMap = new Map<
          string,
          { points: bigint; ckb: bigint; typeId?: string; title?: string }
        >();

        // Check each transaction for tipping cells
        for (const tx of pointsTransactions) {
          try {
            const txResponse = await client.getTransaction(tx.txHash);
            if (!txResponse?.transaction) continue;

            const transaction = txResponse.transaction;

            // Check outputs for tipping cells
            for (let i = 0; i < transaction.outputs.length; i++) {
              const output = transaction.outputs[i];
              const typeScript = output.type;

              if (
                typeScript &&
                typeScript.codeHash === tippingCodeHash &&
                typeScript.hashType === "type"
              ) {
                // Check if connected to protocol
                try {
                  const argsBytes = ccc.bytesFrom(typeScript.args);
                  const connected =
                    ckboost.types.ConnectedTypeID.decode(argsBytes);
                  if (connected.connected_key !== protocolTypeHash) {
                    continue;
                  }

                  // Parse tipping data
                  const outputData = transaction.outputsData[i];
                  const tippingData = TippingData.decode(outputData);

                  // Check if status is "granted" (tipping was executed)
                  const status = tippingData.status;
                  if (status !== "granted") {
                    continue;
                  }

                  // Extract rewards
                  const rewards = tippingData.rewards;
                  const pointsAmount = numToBigInt(rewards.points_amount ?? 0);
                  const ckbAmount = numToBigInt(rewards.ckb_amount ?? 0);

                  if (pointsAmount > 0n || ckbAmount > 0n) {
                    const typeId = ccc.hexFrom(connected.type_id);

                    // Fetch tipping title from the tipping cell
                    let tippingTitle: string | undefined;
                    try {
                      const tippingCell = await fetchTippingByTypeId(
                        typeId,
                        tippingCodeHash,
                        client,
                        protocolCell,
                      );
                      if (tippingCell) {
                        const tippingCellData = TippingData.decode(
                          tippingCell.outputData,
                        );
                        tippingTitle =
                          tippingCellData.metadata?.contribution_title;
                      }
                    } catch (error) {
                      log.warn(
                        `Failed to fetch tipping title for ${typeId}`,
                        error,
                      );
                    }

                    rewardsMap.set(tx.txHash, {
                      points: pointsAmount,
                      ckb: ckbAmount,
                      typeId,
                      title: tippingTitle,
                    });
                    break; // Found tipping reward for this transaction
                  }
                } catch (error) {
                  log.warn(
                    `Failed to parse tipping cell in tx ${tx.txHash}`,
                    error,
                  );
                }
              }
            }
          } catch (error) {
            log.warn(`Failed to fetch transaction ${tx.txHash}`, error);
          }
        }

        if (!cancelled) {
          setTippingRewards(rewardsMap);
        }
      } catch (error) {
        log.error("Failed to fetch tipping rewards", error);
      }
    };

    fetchTippingRewards();

    return () => {
      cancelled = true;
    };
  }, [client, protocolCell, protocolData, pointsTransactions]);

  const totalPoints = formatPointsAmount(userData?.total_points_earned ?? 0);
  const totalSubmissions = userData?.submission_records?.length ?? 0;
  const lastActivity = formatTimestamp(userData?.last_activity_timestamp);
  const lookupIdentifier = normalizedFallbackAddress ?? userTypeId ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-purple-50/60 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {" "}
      <main className="container mx-auto px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Community Profile
          </h1>
          <p className="text-muted-foreground">
            Review on-chain identity, achievements, and contribution history.
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-36 rounded-xl" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : loadError ? (
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-300">
                Unable to load profile
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {loadError}
            </CardContent>
          </Card>
        ) : !userData ? (
          <Card className="border-dashed border-2 border-purple-200 dark:border-purple-800 bg-white/70 dark:bg-gray-900/60">
            <CardHeader>
              <CardTitle>
                {context === "self"
                  ? "No profile data yet"
                  : "No profile data for this address"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-muted-foreground text-sm">
              <p>
                {context === "self"
                  ? "We could not find a user cell for your connected wallet. Submit a quest or complete a verification step to create your profile."
                  : `We could not find a user cell for ${
                      lookupIdentifier ?? "this address"
                    }. The participant might not have interacted with CKBoost yet.`}
              </p>
              {context === "self" ? (
                <div className="flex flex-wrap gap-3">
                  <Link href="/identity">
                    <Badge variant="secondary" className="px-3 py-1">
                      Go to Identity Center
                    </Badge>
                  </Link>
                  <Link href="/">
                    <Badge variant="outline" className="px-3 py-1">
                      Explore Campaigns
                    </Badge>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Link href="/">
                    <Badge variant="secondary" className="px-3 py-1">
                      Explore Campaigns
                    </Badge>
                  </Link>
                  <Link href="/leaderboard">
                    <Badge variant="outline" className="px-3 py-1">
                      View Leaderboard
                    </Badge>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <Card className="overflow-hidden border-purple-200 dark:border-purple-800 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-purple-600/90 to-indigo-600/90 text-white">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-semibold">
                        {displayName?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <h2 className="text-2xl font-semibold leading-tight break-words">
                          {displayName}
                        </h2>
                        {secondaryIdentifier && (
                          <p className="text-sm text-white/80 break-words">
                            {secondaryIdentifier}
                          </p>
                        )}
                      </div>
                    </div>
                    {canEditDisplayName && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="self-start bg-white/20 text-white hover:bg-white/30"
                        onClick={openDisplayNameDialog}
                      >
                        Edit display name
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {userTypeId && (
                      <Badge
                        variant="secondary"
                        className="bg-white/20 text-white break-words"
                      >
                        Type ID: {userTypeId}
                      </Badge>
                    )}
                    {telegramVerified ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/80 text-white flex items-center gap-1"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Telegram verified
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-yellow-400/80 text-gray-900"
                      >
                        Telegram pending
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="bg-white/20 text-white flex items-center gap-1"
                    >
                      <Calendar className="w-4 h-4" />
                      Last activity: {lastActivity}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 p-6 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Total Points</p>
                  <div className="flex items-center gap-2 text-2xl font-semibold">
                    <Medal className="w-5 h-5 text-amber-500" />
                    {totalPoints}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Aggregated from approved quests and tipping rewards.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Quests Submitted
                  </p>
                  <div className="flex items-center gap-2 text-2xl font-semibold">
                    <Award className="w-5 h-5 text-purple-500" />
                    {totalSubmissions}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Includes all submissions awaiting review and approved.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Profile Progress
                  </p>
                  <div className="flex items-center gap-2 text-2xl font-semibold">
                    <Star className="w-5 h-5 text-indigo-500" />
                    {telegramVerified ? "Verified" : "In progress"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Complete additional verification methods to unlock more
                    campaigns.
                  </p>
                </div>
              </CardContent>
            </Card>

            <section className="space-y-3">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Medal className="w-5 h-5 text-amber-500" />
                      Points Earned
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-2xl font-semibold">{totalPoints}</p>
                    <p className="text-xs text-muted-foreground">
                      Reflects total approved contributions across all
                      campaigns.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Award className="w-5 h-5 text-purple-500" />
                      Active Campaigns
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-2xl font-semibold">
                      {
                        new Set(
                          submissionEntries
                            .map((entry) => entry.campaignTitle)
                            .filter(Boolean),
                        ).size
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Number of campaigns this user has contributed to.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                      Verification Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge
                        variant={telegramVerified ? "default" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        Telegram
                        {telegramVerified ? " linked" : " pending"}
                      </Badge>
                      <Badge variant="outline">
                        Additional methods coming soon
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Verification unlocks advanced campaigns and community
                      trust badges.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <Separator />

            {/* <section className="space-y-3"> */}
            {/* <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  Contribution Log
                </h3>
                <p className="text-sm text-muted-foreground">
                  {submissionEntries.length} submission
                  {submissionEntries.length === 1 ? "" : "s"} recorded on-chain.
                </p>
              </div>

              <Card className="overflow-hidden border-gray-200 dark:border-[#535353] border-r-3 border-b-3 border-t-0 border-l-0">
                {submissionEntries.length === 0 ? (
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No contributions tracked yet. Explore active campaigns and
                    share your work!
                  </CardContent>
                ) : (
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Submitted</TableHead>
                          <TableHead>Campaign</TableHead>
                          <TableHead>Quest</TableHead>
                          <TableHead className="w-[120px]">Points</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissionEntries.map((entry) => (
                          <TableRow key={entry.key}>
                            <TableCell className="font-medium">
                              {formatTimestamp(entry.submissionTimestamp)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {entry.campaignTitle}
                                </span>
                                {entry.campaignTypeId && (
                                  <span className="text-xs text-muted-foreground">
                                    {shorten(entry.campaignTypeId)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>{entry.questTitle}</span>
                                <span className="text-xs text-muted-foreground">
                                  Quest #{entry.questId}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="px-3 py-1">
                                {formatBigIntAmount(entry.points)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {entry.submissionContent ? (
                                <span className="line-clamp-2 text-sm">
                                  {entry.submissionContent}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  No additional notes provided
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableCaption className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4" />
                        For raw submission payloads, view the associated user
                        cell history on a block explorer.
                      </TableCaption>
                    </Table>
                  </CardContent> */}
            {/* )} */}
            {/* </Card> */}
            {/* </section> */}

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-500" />
                  Reward Transactions
                </h3>
                <p className="text-sm text-muted-foreground">
                  {rewardRows.length} reward
                  {rewardRows.length === 1 ? "" : "s"} detected on-chain.
                </p>
              </div>

              <Card className="overflow-hidden border-gray-200 dark:border-[#535353] border-r-3 border-b-3 border-t-0 border-l-0">
                {pointsLoading ? (
                  <CardContent className="space-y-4 p-6">
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-2/3" />
                  </CardContent>
                ) : pointsError ? (
                  <CardContent className="py-6 text-sm text-red-600 dark:text-red-400">
                    {pointsError}
                  </CardContent>
                ) : rewardRows.length === 0 ? (
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No reward transactions recorded yet. Complete quests or
                    receive tips to start earning on-chain points.
                  </CardContent>
                ) : (
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Earned</TableHead>
                          <TableHead className="min-w-[220px]">Event</TableHead>
                          <TableHead>Transaction</TableHead>
                          <TableHead className="text-right min-w-[200px]">
                            Rewards
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rewardRows.map((row) => (
                          <TableRow key={row.txHash}>
                            <TableCell className="font-medium">
                              {row.formattedTimestamp}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-2">
                                {row.events.map((event) => {
                                  const meta =
                                    rewardCategoryStyles[event.type] ??
                                    rewardCategoryStyles.other;

                                  return (
                                    <div
                                      key={event.id}
                                      className="flex items-start gap-2"
                                    >
                                      <Badge
                                        variant="secondary"
                                        className={`px-2 py-0.5 text-xs font-medium ${meta.className}`}
                                      >
                                        {meta.label}
                                      </Badge>
                                      <div className="flex flex-col text-sm">
                                        {event.link ? (
                                          <Link
                                            href={event.link}
                                            className="font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                                          >
                                            {event.title}
                                          </Link>
                                        ) : (
                                          <span className="font-medium">
                                            {event.title}
                                          </span>
                                        )}
                                        {event.subtitle && (
                                          <span className="text-xs text-muted-foreground">
                                            {event.subtitle}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <a
                                  href={row.explorerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline break-all"
                                >
                                  <span>{row.txHash}</span>
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                                {row.blockNumber && (
                                  <span className="text-xs text-muted-foreground">
                                    Block #{row.blockNumber}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                {row.totalPoints > 0n && (
                                  <Badge
                                    variant="outline"
                                    className="px-3 py-1"
                                  >
                                    +{formatBigIntAmount(row.totalPoints)}{" "}
                                    Points
                                  </Badge>
                                )}
                                {row.totalTokens.map((token) => (
                                  <Badge
                                    key={`${row.txHash}-${
                                      token.scriptHash ?? token.symbol
                                    }`}
                                    variant="secondary"
                                    className="px-3 py-1"
                                  >
                                    +
                                    {token.symbol === "CKB"
                                      ? formatCkbAmount(token.amount)
                                      : formatTokenAmount(
                                          token.amount,
                                          token.token,
                                        )}{" "}
                                    {token.symbol}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            </section>
          </div>
        )}
      </main>
      {canEditDisplayName && (
        <Dialog open={isEditDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update display name</DialogTitle>
              <DialogDescription>
                This name appears on your dashboard and public profile. Changes
                require an on-chain transaction and may take a few minutes to
                finalize.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input
                id="profile-display-name"
                autoFocus
                maxLength={80}
                value={pendingDisplayName}
                onChange={(event) =>
                  setPendingDisplayName(event.currentTarget.value)
                }
                placeholder="Your preferred name"
                disabled={isSavingDisplayName}
              />
            </div>
            {displayNameError && (
              <p className="text-sm text-red-500">{displayNameError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                disabled={isSavingDisplayName}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDisplayNameSave}
                disabled={
                  isSavingDisplayName || pendingDisplayName.trim().length === 0
                }
              >
                {isSavingDisplayName ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
