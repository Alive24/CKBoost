/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect, useMemo, JSX } from "react";
import { useParams } from "next/navigation";
import {
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CardWithIndents } from "@/components/ui/card-with-indents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  Users,
  Target,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  ArrowLeft,
  Play,
  Settings,
  Coins,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import { useNostrFetch } from "@/hooks/use-nostr-fetch";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { isCampaignApproved } from "@/lib/ckb/campaign-cells";
import {
  CampaignData,
  CampaignDataLike,
  ConnectedTypeID,
} from "ssri-ckboost/types";
import type {
  AssetListLike,
  EndorserInfoLike,
  UDTAssetLike,
} from "ssri-ckboost/types";
import { createScopedLogger, formatDateConsistent } from "ssri-ckboost";

const log = createScopedLogger("CampaignPage");
import { getDifficultyString } from "@/lib";
import { udtRegistry } from "@/lib/services/udt-registry";
import { QuestSubmissionForm } from "@/components/quest-submission-form";
import { useUser } from "@/lib/providers/user-provider";
import { PageLoading } from "@/components/ui/page-loading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import {
  getQuestContentNeventId,
  mergeQuestContentPayload,
} from "@/lib/utils/campaign-nostr-content";

const extractHtmlFromContent = (raw: string): string => {
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as {
      format?: string;
      contentHtml?: string;
      content?: string;
    } | null;

    if (parsed && typeof parsed === "object") {
      if (
        parsed.format === "ckboost-campaign-long-description" &&
        typeof parsed.contentHtml === "string"
      ) {
        return parsed.contentHtml;
      }
      if (parsed.format === "html" && typeof parsed.content === "string") {
        return parsed.content;
      }
    }
  } catch {
    // Not JSON, fall back to raw string
  }

  return raw;
};

const HEX_STRING_PATTERN = /^0x[0-9a-fA-F]*$/;

const decodeHexUtf8 = (value: string): string | null => {
  if (!HEX_STRING_PATTERN.test(value) || value.length <= 2) {
    return null;
  }

  try {
    // Some chain strings are persisted as hex bytes; normalize to utf-8 text.
    return new TextDecoder()
      .decode(ccc.bytesFrom(value))
      .replace(/\u0000+$/g, "");
  } catch (error) {
    log.warn("Failed to decode hex utf-8 string", error);
    return null;
  }
};

const formatLongDescriptionHtml = (content: string): string => {
  if (!content) {
    return "";
  }

  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTags) {
    return content;
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  return `<p>${escapeHtml(content).replace(/\n/g, "<br />")}</p>`;
};

const SHANNON_FACTOR = 10n ** 8n;

const formatCkbAmount = (
  value: ccc.NumLike | bigint | number | string | null | undefined,
): string => {
  if (value === null || value === undefined) {
    return "0";
  }

  try {
    const bigintValue =
      typeof value === "bigint"
        ? value
        : typeof value === "number"
          ? BigInt(Math.floor(value))
          : BigInt(ccc.numFrom(value as ccc.NumLike));

    const integer = bigintValue / SHANNON_FACTOR;
    const fractional = bigintValue % SHANNON_FACTOR;

    if (fractional === 0n) {
      return integer.toLocaleString();
    }

    const fractionalStr = fractional
      .toString()
      .padStart(8, "0")
      .replace(/0+$/, "");

    return `${integer.toLocaleString()}.${fractionalStr}`;
  } catch (error) {
    log.warn("Failed to format CKB amount", error);
    return "0";
  }
};

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignTypeId = params.campaignTypeId as ccc.Hex;
  const { client } = ccc.useCcc();
  const { signer, protocolData, protocolCell, isAdmin, isEndorser } =
    useProtocol();
  const {
    currentUserTypeId,
    hasUserSubmittedQuest,
    isLoading: userLoading,
    refreshUserData,
  } = useUser();
  const { fetchSubmission } = useNostrFetch();
  const [resolvedDescription, setResolvedDescription] = useState<string | null>(
    null,
  );
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<
    (CampaignDataLike & { typeHash: ccc.Hex; cell: ccc.Cell }) | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedQuestIndex, setSelectedQuestIndex] = useState<number | null>(
    null,
  );
  const [questSubmissionStatuses, setQuestSubmissionStatuses] = useState<
    Record<number, boolean>
  >({});
  const [isOwner, setIsOwner] = useState(false);
  const [viewerLockHash, setViewerLockHash] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [fundingData, setFundingData] = useState<Map<ccc.Hex, bigint>>(
    new Map(),
  );
  const [fundingCkb, setFundingCkb] = useState<bigint>(0n);
  const [isLoadingFunding, setIsLoadingFunding] = useState(true);
  const protocolReady = Boolean(protocolData);

  useEffect(() => {
    let cancelled = false;
    const loadViewerLockHash = async () => {
      if (!signer) {
        if (!cancelled) {
          setViewerLockHash(null);
        }
        return;
      }
      try {
        const addressObj = await signer.getRecommendedAddressObj();
        const hash = addressObj.script.hash().toLowerCase();
        if (!cancelled) {
          setViewerLockHash(hash);
        }
      } catch (error) {
        log.warn("Failed to derive viewer lock hash", error);
        if (!cancelled) {
          setViewerLockHash(null);
        }
      }
    };

    loadViewerLockHash();
    return () => {
      cancelled = true;
    };
  }, [signer]);

  // Fetch UDT funding data for the campaign (only when signer is available)
  useEffect(() => {
    const fetchFundingData = async () => {
      // Only fetch funding data if we have a signer
      // If no signer, just mark as not loading - funding data isn't critical for viewing
      if (!signer) {
        setIsLoadingFunding(false);
        return;
      }

      if (!campaignTypeId || !protocolData) {
        return;
      }

      try {
        setIsLoadingFunding(true);
        const protocolCellTypeHash =
          protocolCell?.cellOutput.type?.hash() || ccc.hexFrom("0x");
        const {
          fetchUDTCellsByFundingLock,
          groupUDTCellsByType,
          calculateUDTBalance,
        } = await import("@/lib/ckb/udt-cells");

        const fundingLockCodeHash =
          protocolData?.protocol_config?.script_code_hashes
            ?.ckb_boost_funding_lock_code_hash || ccc.hexFrom("0x");
        const campaignTypeCodeHash =
          protocolData?.protocol_config?.script_code_hashes
            ?.ckb_boost_campaign_type_code_hash || ccc.hexFrom("0x");
        const udtCells = await fetchUDTCellsByFundingLock(
          campaignTypeId,
          fundingLockCodeHash,
          campaignTypeCodeHash,
          protocolCellTypeHash,
          signer,
        );

        let nativeCkbBalance = 0n;

        try {
          const connectedTypeArgs = ConnectedTypeID.encode({
            type_id: campaignTypeId,
            connected_key: protocolCellTypeHash,
          });

          const campaignTypeScript = ccc.Script.from({
            codeHash: campaignTypeCodeHash,
            hashType: "type" as const,
            args: connectedTypeArgs,
          });

          const campaignTypeHash = campaignTypeScript.hash();

          const fundingLockScript = ccc.Script.from({
            codeHash: fundingLockCodeHash,
            hashType: "type" as const,
            args: campaignTypeHash,
          });

          const fundingCells = signer.client.findCells({
            script: fundingLockScript,
            scriptType: "lock",
            scriptSearchMode: "exact",
          });

          for await (const cell of fundingCells) {
            if (!cell.cellOutput.type) {
              const capacity = cell.cellOutput.capacity;
              if (capacity !== undefined && capacity !== null) {
                nativeCkbBalance += BigInt(ccc.numFrom(capacity));
              }
            }
          }
        } catch (error) {
          log.warn("Failed to calculate funding CKB balance", error);
        }

        const groupedCells = groupUDTCellsByType(udtCells);
        const fundingMap = new Map<ccc.Hex, bigint>();

        for (const [typeHash, cells] of groupedCells) {
          const balance = calculateUDTBalance(cells);
          fundingMap.set(typeHash as ccc.Hex, balance);
        }

        setFundingData(fundingMap);
        setFundingCkb(nativeCkbBalance);
        log.log("Fetched funding data:", fundingMap);
      } catch (error) {
        log.error("Failed to fetch funding data:", error);
      } finally {
        setIsLoadingFunding(false);
      }
    };

    fetchFundingData();
  }, [signer, campaignTypeId, protocolData, protocolCell]);

  // Check if current user owns this campaign
  useEffect(() => {
    const evaluateOwnership = () => {
      if (!campaign?.cell || !viewerLockHash || !protocolCell) {
        setIsOwner(false);
        return;
      }

      try {
        const protocolTypeHash = protocolCell.cellOutput.type?.hash();
        const protocolLockCodeHash = deploymentManager.getContractCodeHash(
          deploymentManager.getCurrentNetwork(),
          "ckboostProtocolLock",
        );

        if (!protocolTypeHash || !protocolLockCodeHash) {
          setIsOwner(false);
          return;
        }

        const connectedId = ConnectedTypeID.encode({
          type_id: viewerLockHash as ccc.HexLike,
          connected_key: protocolTypeHash,
        });

        const expectedLock = ccc.Script.from({
          codeHash: protocolLockCodeHash,
          hashType: "type" as ccc.HashType,
          args: connectedId,
        });

        const campaignLock = campaign.cell.cellOutput.lock;
        setIsOwner(campaignLock?.eq(expectedLock) ?? false);
      } catch (error) {
        log.error("Failed to check campaign ownership:", error);
        setIsOwner(false);
      }
    };

    evaluateOwnership();
  }, [campaign, viewerLockHash, protocolCell]);

  useEffect(() => {
    if (!campaign || !viewerLockHash) {
      setIsStaff(false);
      return;
    }

    try {
      const staffHashes =
        campaign.staff_lock_hash_vec?.map((hash) =>
          ccc.hexFrom(hash as ccc.HexLike).toLowerCase(),
        ) ?? [];
      setIsStaff(staffHashes.includes(viewerLockHash));
    } catch (error) {
      log.error("Failed to evaluate staff membership:", error);
      setIsStaff(false);
    }
  }, [campaign, viewerLockHash]);

  useEffect(() => {
    let cancelled = false;

    const fetchCampaign = async () => {
      // Use public client if no signer is available
      if (!client) {
        log.warn("Waiting for client to initialize...");
        return;
      }

      if (!campaignTypeId) {
        log.warn("No campaign type ID provided");
        setIsLoading(false);
        return;
      }

      // Wait for both protocolData AND protocolCell to be loaded
      if (!protocolData || !protocolCell) {
        log.log("Waiting for protocol data and cell to load...");
        // Don't set loading to false here - keep loading state
        return;
      }

      try {
        setIsLoading(true); // Ensure loading state is set
        log.log("Fetching campaign by type ID:", campaignTypeId);
        const campaignCodeHash =
          protocolData.protocol_config?.script_code_hashes
            ?.ckb_boost_campaign_type_code_hash;
        if (!campaignCodeHash) {
          log.error("Campaign code hash not found in protocol data");
          if (!cancelled) {
            setCampaign(null);
            setIsLoading(false);
          }
          return;
        }
        const { fetchCampaignByTypeId } =
          await import("@/lib/ckb/campaign-cells");
        const cell = await fetchCampaignByTypeId(
          campaignTypeId,
          campaignCodeHash,
          client,
          protocolCell,
        );
        if (cancelled) {
          return;
        }
        if (cell) {
          const campaignData = CampaignData.decode(
            cell.outputData,
          ) as CampaignDataLike;
          setCampaign({
            ...campaignData,
            typeHash: cell.cellOutput.type?.hash() || "0x",
            cell,
          });
        } else {
          setCampaign(null);
        }
      } catch (error) {
        log.error("Failed to fetch campaign:", error);
        if (!cancelled) {
          setCampaign(null); // Set to null on error
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchCampaign();

    return () => {
      cancelled = true;
    };
  }, [client, campaignTypeId, protocolData, protocolCell]);

  useEffect(() => {
    const rawDescription = campaign?.metadata?.long_description;

    if (!rawDescription) {
      setResolvedDescription(null);
      setDescriptionError(null);
      setDescriptionLoading(false);
      return;
    }

    let cancelled = false;

    const resolveDescription = async () => {
      setDescriptionLoading(true);
      setDescriptionError(null);

      try {
        let current = rawDescription.trim();

        // Unwrap storage reference formats (hex and nevent) with a small cap
        // to support legacy data like hex-encoded nevent IDs.
        for (let i = 0; i < 3; i += 1) {
          if (!current) {
            break;
          }

          if (current.startsWith("nevent1")) {
            const submission = await fetchSubmission(current);
            if (!submission?.content) {
              throw new Error("Unable to load description from Nostr.");
            }
            current = submission.content.trim();
            continue;
          }

          const decodedHex = decodeHexUtf8(current);
          if (decodedHex !== null) {
            current = decodedHex.trim();
            continue;
          }

          break;
        }

        const htmlContent = extractHtmlFromContent(current).trim();
        const html = formatLongDescriptionHtml(htmlContent);

        if (!cancelled) {
          setResolvedDescription(html || null);
          setDescriptionError(null);
        }
      } catch (error) {
        if (!cancelled) {
          log.error("Failed to resolve campaign description", error);
          setResolvedDescription(null);
          setDescriptionError(
            error instanceof Error
              ? error.message
              : "Failed to load campaign description.",
          );
        }
      } finally {
        if (!cancelled) {
          setDescriptionLoading(false);
        }
      }
    };

    resolveDescription();

    return () => {
      cancelled = true;
    };
  }, [campaign?.metadata?.long_description, fetchSubmission]);

  useEffect(() => {
    const quests = campaign?.quests || [];
    if (quests.length === 0) {
      return;
    }

    const questsWithReferences = quests.filter(getQuestContentNeventId);
    if (questsWithReferences.length === 0) {
      return;
    }

    let cancelled = false;

    const resolveQuestContents = async () => {
      const resolvedQuests = await Promise.all(
        quests.map(async (quest) => {
          const neventId = getQuestContentNeventId(quest);
          if (!neventId) {
            return quest;
          }

          try {
            const result = await fetchSubmission(neventId);
            if (!result?.content) {
              return quest;
            }
            return mergeQuestContentPayload(quest, result.content) || quest;
          } catch (error) {
            log.error("Failed to resolve quest content from Nostr", error);
            return quest;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const changed = resolvedQuests.some(
        (quest, index) => quest !== quests[index],
      );
      if (changed) {
        setCampaign((prev) =>
          prev
            ? {
                ...prev,
                quests: resolvedQuests,
              }
            : prev,
        );
      }
    };

    resolveQuestContents();

    return () => {
      cancelled = true;
    };
  }, [campaign?.quests, fetchSubmission]);

  // Check submission statuses for all quests
  useEffect(() => {
    async function checkSubmissionStatuses() {
      if (!currentUserTypeId || !campaign?.quests) return;

      const statuses: Record<number, boolean> = {};
      for (let i = 0; i < campaign.quests.length; i++) {
        const quest = campaign.quests[i];
        const questId = Number(quest.quest_id || i + 1);
        const submitted = await hasUserSubmittedQuest(
          currentUserTypeId,
          campaignTypeId,
          questId,
        );
        statuses[questId] = submitted;
      }
      setQuestSubmissionStatuses(statuses);
    }

    checkSubmissionStatuses();
  }, [currentUserTypeId, campaign, campaignTypeId, hasUserSubmittedQuest]);

  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const ckbRewardStats = useMemo(() => {
    let totalPerCompletion = 0n;
    let totalDistributed = 0n;
    let questsWithCkb = 0;

    campaign?.quests?.forEach((quest: (typeof campaign.quests)[0]) => {
      let perCompletion = 0n;

      quest.rewards_on_completion?.forEach((rewardList: AssetListLike) => {
        if (!rewardList.ckb_amount) {
          return;
        }
        try {
          perCompletion += BigInt(ccc.numFrom(rewardList.ckb_amount));
        } catch (error) {
          log.warn("Failed to parse quest CKB reward amount", error);
        }
      });

      if (perCompletion === 0n) {
        return;
      }

      questsWithCkb += 1;
      totalPerCompletion += perCompletion;

      const completions = quest.accepted_submission_user_type_ids?.length ?? 0;
      if (completions > 0) {
        totalDistributed += perCompletion * BigInt(completions);
      }
    });

    const averagePerQuest =
      questsWithCkb > 0 ? totalPerCompletion / BigInt(questsWithCkb) : 0n;

    return {
      totalPerCompletion,
      totalDistributed,
      averagePerQuest,
      questsWithCkb,
    };
  }, [campaign?.quests]);

  // Show loading state while waiting for campaign data or protocol context
  if (isLoading || !protocolReady || (!client && !campaign) || !now) {
    return (
      <PageLoading
        title="Loading Campaign"
        description="Fetching campaign details, quests, and funding data from the CKBoost protocol."
      />
    );
  }

  // Only show "not found" if we've finished loading and there's no campaign
  if (!campaign) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
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
            <CardWithIndents>
              <CardContent className="py-16 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="text-center">
                  <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-600 dark:text-muted-foreground opacity-50" />
                  <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                    Campaign Not Found
                  </h2>
                  <p className="text-gray-600 dark:text-muted-foreground mb-6">
                    The campaign you're looking for doesn't exist or has been
                    removed.
                  </p>
                  <Link href="/">
                    <Button>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Campaigns
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </CardWithIndents>
          </div>
        </main>
      </div>
    );
  }

  const getStatusColor = (status: string | undefined) => {
    const statusStr = String(status || "").toLowerCase();
    switch (statusStr) {
      case "active":
        return "bg-green-100 text-green-800";
      case "upcoming":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "under-review":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getEndorserInfo = (
    endorserLockHash: ccc.Hex,
  ): EndorserInfoLike | undefined => {
    return protocolData?.endorsers_whitelist.find(
      (e) => e.endorser_lock_hash === endorserLockHash,
    );
  };

  const getDifficultyColor = (difficulty: string | undefined) => {
    const difficultyStr = String(difficulty || "").toLowerCase();
    switch (difficultyStr) {
      case "beginner":
      case "easy":
        return "bg-green-100 text-green-800";
      case "intermediate":
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "advanced":
      case "hard":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Convert BigInt timestamps to numbers (blockchain stores in seconds, JS needs milliseconds)
  const startTimestamp =
    typeof campaign.starting_time === "bigint"
      ? Number(campaign.starting_time) * 1000
      : Number(campaign.starting_time || 0) * 1000;
  const endTimestamp =
    typeof campaign.ending_time === "bigint"
      ? Number(campaign.ending_time) * 1000
      : Number(campaign.ending_time || 0) * 1000;

  // Check if campaign is approved using helper function
  const isApproved = isCampaignApproved(
    campaignTypeId,
    protocolData?.campaigns_approved as ccc.Hex[] | undefined,
  );

  // Debug logging for approval status
  log.log("Campaign approval check:", {
    isApproved,
    campaignTypeId,
    campaigns_approved: protocolData?.campaigns_approved,
    protocolDataExists: !!protocolData,
  });

  const formatExactTime = (date: Date) => {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
  };

  // Calculate campaign status based on dates and approval
  const startDate = new Date(startTimestamp);
  const endDate = new Date(endTimestamp);
  const status = !isApproved
    ? "under-review"
    : now < startDate
      ? "upcoming"
      : now > endDate
        ? "completed"
        : "active";
  const isCampaignExpired = status === "completed";

  // Calculate progress (only if approved)
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = Math.max(
    0,
    Math.min(now.getTime() - startDate.getTime(), totalDuration),
  );
  const progress =
    isApproved && totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

  // Calculate total points distributed (points per quest × accepted completions)
  const totalPoints =
    campaign.quests?.reduce(
      (sum: number, quest: (typeof campaign.quests)[0]) => {
        const perCompletion = Number(quest.points || 0);
        const completions = Number(
          quest.accepted_submission_user_type_ids?.length || 0,
        );
        return sum + perCompletion * completions;
      },
      0,
    ) || 0;

  const questPreviewLimit = 3;

  const getQuestRewardSummary = (
    quest: CampaignDataLike["quests"][number],
  ): string => {
    const parts: string[] = [];

    const points = Number(quest.points || 0);
    if (!Number.isNaN(points) && points > 0) {
      parts.push(`${points} pts`);
    }

    let totalCkb = 0;
    const udtRewards: string[] = [];
    if (quest.rewards_on_completion && quest.rewards_on_completion.length > 0) {
      quest.rewards_on_completion.forEach((rewardList: AssetListLike) => {
        if (rewardList.ckb_amount) {
          const ckbAmount = Number(rewardList.ckb_amount);
          if (!Number.isNaN(ckbAmount) && ckbAmount > 0) {
            totalCkb += ckbAmount / 10 ** 8;
          }
        }
        if (rewardList.udt_assets && rewardList.udt_assets.length > 0) {
          rewardList.udt_assets.forEach((asset: UDTAssetLike) => {
            try {
              const script = ccc.Script.from(asset.udt_script);
              const token = udtRegistry.getTokenByScriptHash(script.hash());
              const amountRaw = Number(asset.amount);
              if (Number.isNaN(amountRaw) || amountRaw <= 0) {
                return;
              }
              const formattedAmount = token
                ? udtRegistry.formatAmount(amountRaw, token)
                : (amountRaw / 10 ** 8).toString();
              const symbol = token?.symbol || "UDT";
              udtRewards.push(`${formattedAmount} ${symbol}`);
            } catch (error) {
              log.warn("Failed to format UDT reward", error);
              const fallbackAmount = Number(asset.amount);
              if (!Number.isNaN(fallbackAmount) && fallbackAmount > 0) {
                udtRewards.push(`${fallbackAmount} UDT`);
              }
            }
          });
        }
      });
    }

    if (totalCkb > 0) {
      const formattedCkb =
        totalCkb % 1 === 0
          ? totalCkb.toLocaleString()
          : totalCkb.toLocaleString(undefined, { maximumFractionDigits: 4 });
      parts.push(`${formattedCkb} CKB`);
    }

    if (udtRewards.length > 0) {
      parts.push(...udtRewards);
    }

    return parts.length > 0 ? parts.join(" • ") : "No rewards listed";
  };

  // Debug quest structure
  if (campaign?.quests && campaign.quests.length > 0) {
    log.log("Quest structure:", {
      firstQuest: campaign.quests[0],
      questKeys: Object.keys(campaign.quests[0] || {}),
      totalQuests: campaign.quests.length,
    });
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
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
      <main
        className="container mx-auto px-4 py-8 relative"
        style={{ zIndex: 10 }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <Link href="/">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaigns
            </Button>
          </Link>

          {isCampaignExpired && (
            <Alert className="mb-6 bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/40 dark:border-yellow-700 dark:text-yellow-100">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Event ended</AlertTitle>
              <AlertDescription>
                Submissions closed on {formatExactTime(endDate)}. You can
                still review the quests and past rewards below.
              </AlertDescription>
            </Alert>
          )}

          {/* Campaign Header */}
          <CardWithIndents className="mb-8">
            <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="w-16 h-16">
                      <AvatarFallback className="bg-linear-to-br from-purple-200 to-blue-200 text-lg font-bold">
                        {campaign.metadata?.title
                          ?.substring(0, 2)
                          .toUpperCase() || "C"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-3xl text-gray-900 dark:text-white">
                            {campaign.metadata?.title || "Untitled Campaign"}
                          </CardTitle>
                          <CardDescription className="text-lg mt-1 text-gray-600 dark:text-gray-400">
                            {campaign.metadata?.short_description ||
                              "No description available"}
                          </CardDescription>
                        </div>
                        {/* Management Button for Campaign Owner, Admins, and Staff */}
                        {(isOwner || isAdmin || isStaff) && (
                          <Link href={`/campaign-admin/${campaignTypeId}`}>
                            <Button>
                              <Settings className="w-4 h-4 mr-2" />
                              Manage Campaign
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getStatusColor(status)}>{status}</Badge>
                    {campaign.metadata?.categories?.map(
                      (category: string, index: number) => (
                        <Badge key={index} variant="outline">
                          {category}
                        </Badge>
                      ),
                    )}
                    {campaign.metadata?.difficulty && (
                      <Badge
                        className={getDifficultyColor(
                          getDifficultyString(campaign.metadata.difficulty),
                        )}
                      >
                        {getDifficultyString(campaign.metadata.difficulty)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  {/* Show status badge based on approval */}
                  {!isApproved && (
                    <Badge className="bg-yellow-100 text-yellow-800 px-4 py-2 text-lg">
                      <Clock className="w-5 h-5 mr-2" />
                      Under Review
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
              {/* Campaign Progress - only show if approved */}
              {isApproved ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-muted-foreground">
                      Campaign Progress
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {progress.toFixed(0)}%
                    </span>
                  </div>
                  {/* Progress bar - match CampaignCard styling */}
                  <div
                    className="relative w-full overflow-hidden transition-all"
                    style={{
                      height: "17px",
                      borderRadius: "99px",
                      background:
                        "linear-gradient(180deg, #313131 0%, #535353 100%)",
                      boxShadow: "0 1px 1.7px 0 rgba(0, 0, 0, 0.25) inset",
                    }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${progress}%`,
                        height: "17px",
                        borderRadius: "99px",
                        background:
                          "linear-gradient(180deg, #00FFC3 0%, #00B88D 100%)",
                        boxShadow:
                          "3px 0 3.9px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 #FFF inset",
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-muted-foreground">
                    <span>Started: {formatExactTime(startDate)}</span>
                    <span>Ends: {formatExactTime(endDate)}</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">
                      This campaign is under review
                    </span>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                    Campaign will be available once approved by platform
                    administrators.
                  </p>
                </div>
              )}
            </CardContent>
          </CardWithIndents>

          {/* Campaign Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <CardWithIndents>
              <CardContent className="p-6 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                      Total Quests
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {campaign.quests?.length || 0}
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </CardWithIndents>

            <CardWithIndents>
              <CardContent className="p-6 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                      Total Points
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {totalPoints}
                    </p>
                  </div>
                  <Trophy className="w-8 h-8 text-yellow-600" />
                </div>
              </CardContent>
            </CardWithIndents>

            <CardWithIndents>
              <CardContent className="p-6 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                      Completions
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {Number(campaign.total_completions || 0)}
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-purple-600" />
                </div>
              </CardContent>
            </CardWithIndents>

            <CardWithIndents>
              <CardContent className="p-6 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                      Created By
                    </p>
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                      {getEndorserInfo(ccc.hexFrom(campaign.endorser_lock_hash))
                        ?.endorser_name ?? "Unknown"}
                    </p>
                  </div>
                  <Star className="w-8 h-8 text-yellow-600" />
                </div>
              </CardContent>
            </CardWithIndents>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-[#F2FAF4] dark:bg-[#1b1b1b] p-1 border border-gray-300 dark:border-[#535353]">
              <TabsTrigger
                value="overview"
                className="rounded-full text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF4D00] dark:data-[state=active]:bg-[#3300FF] data-[state=active]:text-white data-[state=inactive]:text-gray-700 dark:data-[state=inactive]:text-gray-300 data-[state=inactive]:bg-transparent transition-colors"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="quests"
                className="rounded-full text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF4D00] dark:data-[state=active]:bg-[#3300FF] data-[state=active]:text-white data-[state=inactive]:text-gray-700 dark:data-[state=inactive]:text-gray-300 data-[state=inactive]:bg-transparent transition-colors"
              >
                Quests
              </TabsTrigger>
              <TabsTrigger
                value="rewards"
                className="rounded-full text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF4D00] dark:data-[state=active]:bg-[#3300FF] data-[state=active]:text-white data-[state=inactive]:text-gray-700 dark:data-[state=inactive]:text-gray-300 data-[state=inactive]:bg-transparent transition-colors"
              >
                Rewards
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="text-gray-900 dark:text-white">
                    Campaign Description
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  {descriptionLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-5/6" />
                    </div>
                  ) : descriptionError ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {descriptionError}
                    </p>
                  ) : resolvedDescription ? (
                    <div
                      className="max-w-full! prose prose-sm sm:prose dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: resolvedDescription }}
                    />
                  ) : (
                    <p className="text-gray-600 dark:text-muted-foreground whitespace-pre-wrap">
                      {campaign.metadata?.short_description ||
                        "No detailed description available."}
                    </p>
                  )}
                </CardContent>
              </CardWithIndents>

              <CardWithIndents>
                <CardHeader className="flex flex-col items-center gap-4 text-center bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <div>
                    <CardTitle className="text-2xl font-semibold text-gray-900 dark:text-white">
                      Quests
                    </CardTitle>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground mt-1">
                      {isCampaignExpired
                        ? "This event has ended. Review the quests and their requirements below."
                        : "Jump straight into the quest list to start earning points."}
                    </p>
                  </div>
                  {campaign?.quests &&
                    campaign.quests.length > 0 &&
                    !isCampaignExpired && (
                      <Button
                        size="lg"
                        onClick={() => {
                          setActiveTab("quests");
                          setSelectedQuestIndex(0);
                        }}
                        aria-label="Open quests tab and start participating"
                        className="w-full max-w-xs bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099] text-white font-medium rounded-full px-6 py-2.5 border-0 shadow-none transition-colors"
                      >
                        Get Started with the First Quest!
                      </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-4 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  {campaign?.quests && campaign.quests.length > 0 ? (
                    <>
                      {campaign.quests
                        .slice(0, questPreviewLimit)
                        .map((quest, index) => {
                          const questId = Number(quest.quest_id || index + 1);
                          const questTitle =
                            quest.metadata?.title || `Quest ${questId}`;
                          const shortDescription =
                            quest.metadata?.short_description ||
                            quest.metadata?.long_description ||
                            "No description provided.";
                          const rewardSummary = getQuestRewardSummary(quest);
                          const hasSubmission =
                            !!questSubmissionStatuses[questId];
                          return (
                            <div
                              key={`quest-preview-${questId}`}
                              className="space-y-2 border-b border-gray-300 dark:border-border/60 pb-4 last:border-none last:pb-0"
                            >
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <h4 className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">
                                  {questTitle}
                                </h4>
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                  {rewardSummary}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-muted-foreground">
                                {shortDescription}
                              </p>
                            </div>
                          );
                        })}
                      {campaign.quests.length > questPreviewLimit && (
                        <p className="text-xs text-gray-600 dark:text-muted-foreground">
                          Showing first {questPreviewLimit} of{" "}
                          {campaign.quests.length} quests.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                      No quests available yet for this campaign.
                    </p>
                  )}
                </CardContent>
              </CardWithIndents>

              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="text-gray-900 dark:text-white">
                    Campaign Rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <ul className="space-y-2">
                    {campaign.rules?.map((rule: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                        <span className="text-gray-900 dark:text-white">
                          {rule}
                        </span>
                      </li>
                    )) || (
                      <li className="text-gray-600 dark:text-muted-foreground">
                        No specific rules defined
                      </li>
                    )}
                  </ul>
                </CardContent>
              </CardWithIndents>
            </TabsContent>

            <TabsContent value="quests" className="space-y-6">
              {selectedQuestIndex === null ? (
                // Quest List View
                <CardWithIndents>
                  <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                    <CardTitle className="text-gray-900 dark:text-white">
                      Campaign Quests
                    </CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">
                      Review quest requirements and subtasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                    <div className="space-y-4">
                      {campaign?.quests?.map(
                        (quest: (typeof campaign.quests)[0], index: number) => {
                          const questId = Number(quest.quest_id || index + 1);
                          const hasSubmission =
                            !!questSubmissionStatuses[questId];
                          return (
                            <div
                              key={index}
                              className="border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
                                      {quest.metadata?.title ||
                                        `Quest ${questId}`}
                                    </h3>
                                    {/* Time and Difficulty badges - below title */}
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      {quest.metadata?.time_estimate && (
                                        <Badge variant="outline">
                                          <Clock className="w-3 h-3 mr-1" />
                                          {Number(
                                            quest.metadata.time_estimate,
                                          )}{" "}
                                          mins
                                        </Badge>
                                      )}
                                      {quest.metadata?.difficulty && (
                                        <Badge variant="outline">
                                          Difficulty:{" "}
                                          {Number(quest.metadata.difficulty)}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                                      {quest.metadata?.short_description ||
                                        quest.metadata?.long_description ||
                                        ""}
                                    </p>
                                  </div>
                                  {/* If accepted, show 'You received' label first */}
                                  {currentUserTypeId &&
                                    (
                                      quest.accepted_submission_user_type_ids ||
                                      []
                                    ).includes(currentUserTypeId) && (
                                      <span className="text-xs text-green-700 font-medium">
                                        You received:
                                      </span>
                                    )}
                                  {/* Rewards row - green badges (points, UDT, CKB) */}
                                  <div className="flex flex-wrap items-center gap-2 justify-end">
                                    {/* Points */}
                                    <Badge className="bg-green-100 text-green-800">
                                      <Trophy className="w-3 h-3 mr-1" />
                                      {Number(quest.points) || 100} points
                                    </Badge>
                                    {/* UDT + CKB rewards */}
                                    {quest.rewards_on_completion &&
                                      quest.rewards_on_completion.length > 0 &&
                                      quest.rewards_on_completion.flatMap(
                                        (
                                          rewardList: AssetListLike,
                                          idx: number,
                                        ) => {
                                          const badges = [] as JSX.Element[];
                                          if (
                                            rewardList.udt_assets &&
                                            rewardList.udt_assets.length > 0
                                          ) {
                                            rewardList.udt_assets.forEach(
                                              (
                                                udtAsset: UDTAssetLike,
                                                udtIdx: number,
                                              ) => {
                                                const script = ccc.Script.from(
                                                  udtAsset.udt_script,
                                                );
                                                const token =
                                                  udtRegistry.getTokenByScriptHash(
                                                    script.hash(),
                                                  );
                                                const amount = token
                                                  ? udtRegistry.formatAmount(
                                                      Number(udtAsset.amount),
                                                      token,
                                                    )
                                                  : (
                                                      Number(udtAsset.amount) /
                                                      10 ** 8
                                                    ).toString();
                                                const symbol =
                                                  token?.symbol || "UDT";
                                                badges.push(
                                                  <Badge
                                                    key={`udt-${idx}-${udtIdx}`}
                                                    className="bg-green-100 text-green-800"
                                                  >
                                                    <Coins className="w-3 h-3 mr-1" />
                                                    {amount} {symbol}
                                                  </Badge>,
                                                );
                                              },
                                            );
                                          }
                                          if (
                                            rewardList.ckb_amount &&
                                            Number(rewardList.ckb_amount) > 0
                                          ) {
                                            badges.push(
                                              <Badge
                                                key={`ckb-${idx}`}
                                                className="bg-green-100 text-green-800"
                                              >
                                                <Coins className="w-3 h-3 mr-1" />
                                                {Number(rewardList.ckb_amount) /
                                                  10 ** 8}{" "}
                                                CKB
                                              </Badge>,
                                            );
                                          }
                                          return badges;
                                        },
                                      )}
                                  </div>
                                </div>

                                {/* Quest Requirements */}
                                {quest.metadata?.requirements && (
                                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                                    <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">
                                      Requirements
                                    </h4>
                                    <p className="text-sm text-blue-800 dark:text-blue-200">
                                      {quest.metadata?.requirements}
                                    </p>
                                  </div>
                                )}

                                {/* Subtasks */}
                                {quest.sub_tasks &&
                                  quest.sub_tasks.length > 0 && (
                                    <div className="border-t border-gray-300 dark:border-gray-700 pt-3">
                                      <h4 className="font-medium text-sm mb-3 text-gray-900 dark:text-white">
                                        Subtasks ({quest.sub_tasks.length})
                                      </h4>
                                      <div className="space-y-2">
                                        {quest.sub_tasks.map(
                                          (
                                            subtask: (typeof quest.sub_tasks)[0],
                                            subIndex: number,
                                          ) => (
                                            <div
                                              key={subIndex}
                                              className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded"
                                            >
                                              <div className="shrink-0 mt-0.5">
                                                <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    {Number(subtask.id) ||
                                                      subIndex + 1}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                  {subtask.title ||
                                                    `Subtask ${
                                                      Number(subtask.id) ||
                                                      subIndex + 1
                                                    }`}
                                                </p>
                                                {subtask.description && (
                                                  <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">
                                                    {subtask.description}
                                                  </p>
                                                )}
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                  {subtask.type && (
                                                    <Badge
                                                      variant="outline"
                                                      className="text-xs"
                                                    >
                                                      Type: {subtask.type}
                                                    </Badge>
                                                  )}
                                                  {subtask.proof_required && (
                                                    <Badge
                                                      variant="outline"
                                                      className="text-xs"
                                                    >
                                                      Proof:{" "}
                                                      {subtask.proof_required}
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}

                                {/* Quest Actions */}
                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-300 dark:border-gray-700">
                                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-muted-foreground">
                                    {(() => {
                                      const userAccepted = currentUserTypeId
                                        ? (
                                            quest.accepted_submission_user_type_ids ||
                                            []
                                          ).includes(currentUserTypeId)
                                        : false;
                                      if (userAccepted) {
                                        return (
                                          <>
                                            <Badge className="bg-green-100 text-green-800">
                                              <CheckCircle className="w-3 h-3 mr-1" />
                                              Approved
                                            </Badge>
                                          </>
                                        );
                                      }
                                      if (hasSubmission) {
                                        return (
                                          <Badge className="bg-blue-100 text-blue-800">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Submitted
                                          </Badge>
                                        );
                                      }
                                      return (
                                        <>
                                          <Users className="w-4 h-4" />
                                          <span>
                                            {Number(
                                              quest.completion_count || 0,
                                            )}{" "}
                                            completions
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                  {isApproved ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setSelectedQuestIndex(index)
                                      }
                                    >
                                      {hasSubmission ? (
                                        <>
                                          <CheckCircle className="w-4 h-4 mr-1" />
                                          View Submission
                                        </>
                                      ) : isCampaignExpired ? (
                                        <>
                                          <Eye className="w-4 h-4 mr-1" />
                                          View Quest
                                        </>
                                      ) : (
                                        <>
                                          <Play className="w-4 h-4 mr-1" />
                                          Start Quest
                                        </>
                                      )}
                                    </Button>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      Available after approval
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        },
                      ) || (
                        <div className="text-center py-8">
                          <Target className="w-12 h-12 mx-auto mb-4 text-gray-600 dark:text-muted-foreground opacity-50" />
                          <p className="text-gray-600 dark:text-muted-foreground">
                            No quests available yet
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </CardWithIndents>
              ) : (
                // Quest Detail View
                <div className="space-y-6">
                  {/* Back to Quest List */}
                  <Button
                    variant="ghost"
                    className="mb-4"
                    onClick={() => setSelectedQuestIndex(null)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Quest List
                  </Button>

                  {campaign?.quests &&
                    selectedQuestIndex !== null &&
                    campaign.quests[selectedQuestIndex] &&
                    (() => {
                      const quest = campaign.quests[selectedQuestIndex];
                      return (
                        <>
                          {/* Quest Header */}
                          <CardWithIndents>
                            <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-2xl text-gray-900 dark:text-white">
                                    {quest.metadata?.title ||
                                      `Quest ${selectedQuestIndex + 1}`}
                                  </CardTitle>
                                  {/* Time and Difficulty badges - below title (match quest list layout) */}
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {quest.metadata?.time_estimate && (
                                      <Badge variant="outline">
                                        <Clock className="w-4 h-4 mr-1" />
                                        {Number(
                                          quest.metadata.time_estimate,
                                        )}{" "}
                                        mins
                                      </Badge>
                                    )}
                                    {quest.metadata?.difficulty && (
                                      <Badge variant="outline">
                                        Difficulty:{" "}
                                        {Number(quest.metadata.difficulty)}
                                      </Badge>
                                    )}
                                  </div>
                                  <CardDescription className="mt-2 text-gray-600 dark:text-gray-400">
                                    {quest.metadata?.short_description || ""}
                                  </CardDescription>
                                </div>
                                <div className="flex flex-col gap-2 items-end">
                                  {/* If accepted, show 'You received' label first */}
                                  {currentUserTypeId &&
                                    (
                                      quest.accepted_submission_user_type_ids ||
                                      []
                                    ).includes(currentUserTypeId) && (
                                      <span className="text-xs text-green-700 font-medium">
                                        You received:
                                      </span>
                                    )}
                                  {/* Rewards row - green badges (points, UDT, CKB), match quest list layout */}
                                  <div className="flex flex-wrap items-center gap-2 justify-end">
                                    {/* Points */}
                                    <Badge className="bg-green-100 text-green-800">
                                      <Trophy className="w-4 h-4 mr-1" />
                                      {Number(quest.points) || 100} points
                                    </Badge>
                                    {/* UDT + CKB rewards */}
                                    {quest.rewards_on_completion &&
                                      quest.rewards_on_completion.length > 0 &&
                                      quest.rewards_on_completion.flatMap(
                                        (
                                          rewardList: AssetListLike,
                                          idx: number,
                                        ) => {
                                          const badges = [] as JSX.Element[];
                                          if (
                                            rewardList.udt_assets &&
                                            rewardList.udt_assets.length > 0
                                          ) {
                                            rewardList.udt_assets.forEach(
                                              (
                                                udtAsset: UDTAssetLike,
                                                udtIdx: number,
                                              ) => {
                                                const script = ccc.Script.from(
                                                  udtAsset.udt_script,
                                                );
                                                const token =
                                                  udtRegistry.getTokenByScriptHash(
                                                    script.hash(),
                                                  );
                                                const amount = token
                                                  ? udtRegistry.formatAmount(
                                                      Number(udtAsset.amount),
                                                      token,
                                                    )
                                                  : (
                                                      Number(udtAsset.amount) /
                                                      10 ** 8
                                                    ).toString();
                                                const symbol =
                                                  token?.symbol || "UDT";
                                                badges.push(
                                                  <Badge
                                                    key={`udt2-${idx}-${udtIdx}`}
                                                    className="bg-green-100 text-green-800"
                                                  >
                                                    <Coins className="w-4 h-4 mr-1" />
                                                    {amount} {symbol}
                                                  </Badge>,
                                                );
                                              },
                                            );
                                          }
                                          if (
                                            rewardList.ckb_amount &&
                                            Number(rewardList.ckb_amount) > 0
                                          ) {
                                            badges.push(
                                              <Badge
                                                key={`ckb2-${idx}`}
                                                className="bg-green-100 text-green-800"
                                              >
                                                <Coins className="w-4 h-4 mr-1" />
                                                {Number(rewardList.ckb_amount) /
                                                  10 ** 8}{" "}
                                                CKB
                                              </Badge>,
                                            );
                                          }
                                          return badges;
                                        },
                                      )}
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                              <div className="space-y-4">
                                {/* Quest Description */}
                                {quest.metadata?.long_description && (
                                  <div>
                                    <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">
                                      Description
                                    </h3>
                                    <p className="text-gray-600 dark:text-muted-foreground whitespace-pre-wrap">
                                      {quest.metadata.long_description}
                                    </p>
                                  </div>
                                )}

                                {/* Requirements */}
                                {quest.metadata?.requirements && (
                                  <div>
                                    <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">
                                      Requirements
                                    </h3>
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                      <p className="text-sm text-gray-900 dark:text-white">
                                        {quest.metadata.requirements}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </CardWithIndents>

                          {/* Quest Submission Form */}
                          {!isCampaignExpired ? (
                            <QuestSubmissionForm
                              quest={{
                                quest_id: Number(quest.quest_id),
                                sub_tasks: quest.sub_tasks,
                              }}
                              questIndex={selectedQuestIndex}
                              campaignTypeId={campaignTypeId}
                              isAccepted={
                                currentUserTypeId
                                  ? (
                                      quest.accepted_submission_user_type_ids ||
                                      []
                                    ).includes(currentUserTypeId)
                                  : false
                              }
                              earnedPoints={Number(quest.points || 0)}
                              earnedUdts={(quest.rewards_on_completion || [])
                                .flatMap(
                                  (rewardList: AssetListLike) =>
                                    rewardList.udt_assets || [],
                                )
                                .map((udtAsset: UDTAssetLike) => {
                                  const script = ccc.Script.from(
                                    udtAsset.udt_script,
                                  );
                                  const token =
                                    udtRegistry.getTokenByScriptHash(
                                      script.hash(),
                                    );
                                  if (token) {
                                    return {
                                      symbol: token.symbol,
                                      amount: udtRegistry.formatAmount(
                                        Number(udtAsset.amount),
                                        token,
                                      ),
                                    };
                                  }
                                  // Fallback formatting with 8 decimals if unknown
                                  const amountFmt = (
                                    Number(udtAsset.amount) /
                                    10 ** 8
                                  ).toString();
                                  return { symbol: "UDT", amount: amountFmt };
                                })}
                              ckbPerCompletion={(() => {
                                const r = quest.rewards_on_completion?.[0];
                                if (
                                  r &&
                                  r.ckb_amount &&
                                  Number(r.ckb_amount) > 0
                                ) {
                                  return Number(r.ckb_amount) / 10 ** 8;
                                }
                                return 0;
                              })()}
                              onSuccess={async () => {
                                // Refresh user data after successful submission
                                log.info(
                                  "Quest submitted successfully, refreshing data...",
                                );

                                // Wait a bit for transaction to be confirmed
                                setTimeout(async () => {
                                  await refreshUserData();

                                  // Also refresh the submission statuses
                                  if (currentUserTypeId && campaign?.quests) {
                                    const statuses: Record<number, boolean> =
                                      {};
                                    for (
                                      let i = 0;
                                      i < campaign.quests.length;
                                      i++
                                    ) {
                                      const quest = campaign.quests[i];
                                      const questId = Number(
                                        quest.quest_id || i + 1,
                                      );
                                      const submitted =
                                        await hasUserSubmittedQuest(
                                          currentUserTypeId,
                                          campaignTypeId,
                                          questId,
                                        );
                                      statuses[questId] = submitted;
                                    }
                                    setQuestSubmissionStatuses(statuses);
                                  }
                                }, 3000);
                              }}
                            />
                          ) : (
                            <Alert className="bg-muted/40">
                              <AlertCircle className="w-4 h-4" />
                              <AlertTitle>Submissions closed</AlertTitle>
                              <AlertDescription>
                                This quest is part of an expired event.
                                Submissions ended on{" "}
                                {formatExactTime(endDate)}.
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Navigation between quests */}
                          <div className="flex justify-between">
                            <Button
                              variant="outline"
                              disabled={selectedQuestIndex === 0}
                              onClick={() =>
                                setSelectedQuestIndex((prev) =>
                                  prev !== null ? prev - 1 : 0,
                                )
                              }
                            >
                              <ArrowLeft className="w-4 h-4 mr-2" />
                              Previous Quest
                            </Button>
                            <Button
                              variant="outline"
                              disabled={
                                !campaign?.quests ||
                                selectedQuestIndex >= campaign.quests.length - 1
                              }
                              onClick={() =>
                                setSelectedQuestIndex((prev) =>
                                  prev !== null ? prev + 1 : 0,
                                )
                              }
                            >
                              Next Quest
                              <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                            </Button>
                          </div>
                        </>
                      );
                    })()}
                </div>
              )}
            </TabsContent>

            <TabsContent value="rewards" className="space-y-6">
              {/* Combined: Total Points (configured) + UDT Rewards Distributed */}
              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="text-gray-900 dark:text-white">
                    Rewards Summary
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Points and rewards (CKB & UDT) distributed so far
                  </CardDescription>
                </CardHeader>
                <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <div className="space-y-4">
                    {/* Total Points Configured */}
                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-600" />
                        <span className="font-medium text-gray-900 dark:text-white">
                          Total Points
                        </span>
                      </div>
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {totalPoints} Points
                      </span>
                    </div>

                    {/* CKB Distributed */}
                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-between text-right">
                      <div className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-gray-900 dark:text-white">
                          CKB
                        </span>
                      </div>
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatCkbAmount(ckbRewardStats.totalDistributed)} CKB
                      </span>
                    </div>

                    {/* UDT Distributed (aggregated) */}
                    {(() => {
                      const distributedBySymbol = new Map<
                        string,
                        {
                          amount: number;
                          tokenInfo: ReturnType<
                            typeof udtRegistry.getTokenByScriptHash
                          >;
                        }
                      >();

                      campaign?.quests?.forEach(
                        (quest: (typeof campaign.quests)[0]) => {
                          const completions = Number(
                            quest.accepted_submission_user_type_ids.length || 0,
                          );
                          quest.rewards_on_completion?.forEach(
                            (rewardList: AssetListLike) => {
                              rewardList.udt_assets?.forEach(
                                (udtAsset: UDTAssetLike) => {
                                  const script = ccc.Script.from(
                                    udtAsset.udt_script,
                                  );
                                  const scriptHash = script.hash();
                                  const token =
                                    udtRegistry.getTokenByScriptHash(
                                      scriptHash,
                                    );
                                  const symbol = token?.symbol || "UDT";
                                  const amountDistributed =
                                    Number(udtAsset.amount) * completions;
                                  const current = distributedBySymbol.get(
                                    symbol,
                                  ) || { amount: 0, tokenInfo: token };
                                  current.amount += amountDistributed;
                                  current.tokenInfo =
                                    token || current.tokenInfo;
                                  distributedBySymbol.set(symbol, current);
                                },
                              );
                            },
                          );
                        },
                      );

                      if (distributedBySymbol.size === 0) {
                        return (
                          <div className="text-center py-8 text-gray-600 dark:text-muted-foreground">
                            No UDT rewards distributed yet
                          </div>
                        );
                      }

                      return Array.from(distributedBySymbol.entries()).map(
                        ([symbol, info]) => {
                          const formatted = info.tokenInfo
                            ? udtRegistry.formatAmount(
                                info.amount,
                                info.tokenInfo,
                              )
                            : `${info.amount / 10 ** 8}`;
                          return (
                            <div
                              key={symbol}
                              className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <Coins className="w-5 h-5 text-yellow-600" />
                                <span className="font-medium text-lg text-gray-900 dark:text-white">
                                  {symbol}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                  {formatted} {symbol}
                                </span>
                              </div>
                            </div>
                          );
                        },
                      );
                    })()}
                  </div>
                </CardContent>
              </CardWithIndents>

              {/* Available Rewards */}
              <CardWithIndents>
                <CardHeader className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <CardTitle className="text-gray-900 dark:text-white">
                    Available Rewards
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Remaining token rewards bound to this campaign
                  </CardDescription>
                </CardHeader>
                <CardContent className="bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                  <div className="space-y-4">
                    {isLoadingFunding ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                      </div>
                    ) : (
                      (() => {
                        // Calculate total UDT rewards needed, distributed, and available
                        const udtRewardsSummary = new Map<
                          string,
                          {
                            totalPerQuest: number; // Total rewards per quest completion
                            totalDistributed: number; // Already distributed based on completion_count
                            totalFunded: number; // Total amount in funding pool (simulated for now)
                            available: number; // Remaining available
                            tokenInfo: ReturnType<
                              typeof udtRegistry.getTokenByScriptHash
                            >;
                            averagePerQuest: number;
                            questCount: number;
                          }
                        >();

                        // Calculate UDT rewards distributed and needed
                        campaign?.quests?.forEach(
                          (quest: (typeof campaign.quests)[0]) => {
                            const completions = Number(
                              quest.completion_count || 0,
                            );

                            quest.rewards_on_completion?.forEach(
                              (rewardList: AssetListLike) => {
                                rewardList.udt_assets?.forEach(
                                  (udtAsset: UDTAssetLike) => {
                                    const script = ccc.Script.from(
                                      udtAsset.udt_script,
                                    );
                                    const scriptHash = script.hash();
                                    const token =
                                      udtRegistry.getTokenByScriptHash(
                                        scriptHash,
                                      );
                                    const symbol = token?.symbol || "UDT";

                                    const amountPerCompletion = Number(
                                      udtAsset.amount,
                                    );
                                    const amountDistributed =
                                      amountPerCompletion * completions;

                                    const current = udtRewardsSummary.get(
                                      symbol,
                                    ) || {
                                      totalPerQuest: 0,
                                      totalDistributed: 0,
                                      totalFunded: 0,
                                      available: 0,
                                      tokenInfo: token,
                                      averagePerQuest: 0,
                                      questCount: 0,
                                    };

                                    current.totalPerQuest +=
                                      amountPerCompletion;
                                    current.totalDistributed +=
                                      amountDistributed;
                                    current.questCount += 1;
                                    current.averagePerQuest =
                                      current.totalPerQuest /
                                      current.questCount;
                                    udtRewardsSummary.set(symbol, current);
                                  },
                                );
                              },
                            );
                          },
                        );

                        // Use actual funding amounts from funding lock cells
                        udtRewardsSummary.forEach((value) => {
                          // Find the funding for this token by matching script hash
                          let actualAvailableInPool = 0n;

                          // Match funding data by script hash - this is what's currently in the pool
                          if (value.tokenInfo && value.tokenInfo.script) {
                            const tokenScript = ccc.Script.from(
                              value.tokenInfo.script,
                            );
                            const tokenScriptHash = tokenScript.hash();
                            actualAvailableInPool =
                              fundingData.get(tokenScriptHash) || 0n;
                          }

                          // Available is what's currently in the funding pool
                          value.available = Number(actualAvailableInPool);

                          // Total funded = available (in pool) + distributed (already given out)
                          value.totalFunded =
                            value.available + value.totalDistributed;
                        });

                        const rewardElements: JSX.Element[] = [];

                        if (
                          ckbRewardStats.totalPerCompletion > 0n ||
                          fundingCkb > 0n
                        ) {
                          const formattedAvailableCkb =
                            formatCkbAmount(fundingCkb);
                          const formattedAverageCkb = formatCkbAmount(
                            ckbRewardStats.averagePerQuest,
                          );
                          const ckbCompletionQuota =
                            ckbRewardStats.averagePerQuest > 0n
                              ? Number(
                                  fundingCkb / ckbRewardStats.averagePerQuest,
                                )
                              : 0;

                          rewardElements.push(
                            <div
                              key="ckb"
                              className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg space-y-3 bg-white dark:bg-gray-800"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Coins className="w-5 h-5 text-blue-600" />
                                  <span className="font-medium text-lg text-gray-900 dark:text-white">
                                    CKB
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-600 dark:text-muted-foreground">
                                    Available
                                  </p>
                                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {formattedAvailableCkb} CKB
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                  <p className="text-xs text-gray-600 dark:text-muted-foreground">
                                    Average per Quest
                                  </p>
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {formattedAverageCkb} CKB
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 dark:text-muted-foreground">
                                    Available Completions (Estimated)
                                  </p>
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {ckbCompletionQuota.toLocaleString()} quests
                                  </p>
                                </div>
                              </div>
                            </div>,
                          );
                        }

                        Array.from(udtRewardsSummary.entries()).forEach(
                          ([symbol, info]) => {
                            const formattedAvailable = info.tokenInfo
                              ? udtRegistry.formatAmount(
                                  info.available,
                                  info.tokenInfo,
                                )
                              : `${info.available / 10 ** 8}`;
                            const formattedAverage = info.tokenInfo
                              ? udtRegistry.formatAmount(
                                  info.averagePerQuest,
                                  info.tokenInfo,
                                )
                              : `${info.averagePerQuest / 10 ** 8}`;
                            const completionQuota =
                              info.averagePerQuest > 0
                                ? Math.floor(
                                    info.available / info.averagePerQuest,
                                  )
                                : 0;

                            rewardElements.push(
                              <div
                                key={symbol}
                                className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg space-y-3 bg-white dark:bg-gray-800"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Coins className="w-5 h-5 text-yellow-600" />
                                    <span className="font-medium text-lg text-gray-900 dark:text-white">
                                      {symbol}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-600 dark:text-muted-foreground">
                                      Available
                                    </p>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                      {formattedAvailable} {symbol}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                  <div>
                                    <p className="text-xs text-gray-600 dark:text-muted-foreground">
                                      Average per Quest
                                    </p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {formattedAverage} {symbol}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 dark:text-muted-foreground">
                                      Available Completions (Estimated)
                                    </p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {completionQuota.toLocaleString()} quests
                                    </p>
                                  </div>
                                </div>
                              </div>,
                            );
                          },
                        );

                        if (rewardElements.length === 0) {
                          return (
                            <div className="text-center py-8 text-gray-600 dark:text-muted-foreground">
                              No token rewards configured for this campaign
                            </div>
                          );
                        }

                        return rewardElements;
                      })()
                    )}
                  </div>
                </CardContent>
              </CardWithIndents>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
