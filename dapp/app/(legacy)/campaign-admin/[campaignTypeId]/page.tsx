/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Eye,
  Users,
  Trophy,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useProtocol } from "@/lib/providers/protocol-provider";
import type {
  QuestDataLike,
  CampaignDataLike,
  UDTAssetLike,
  ProtocolDataLike,
} from "ssri-ckboost/types";
import { CampaignData } from "ssri-ckboost/types";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { createScopedLogger } from "ssri-ckboost";
import { CampaignAdminService } from "@/lib/services/campaign-admin-service";
import { ccc } from "@ckb-ccc/connector-react";
import { Campaign } from "ssri-ckboost";
import { ssri } from "@ckb-ccc/connector-react";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { SubmissionsTab } from "@/components/campaign-admin/tabs/submissions-tab";
import {
  loadCreateDraft,
  saveCreateDraft,
  clearCreateDraft,
  getCreateDraftHistory,
  type DraftFundingEntry,
  type CampaignCreateDraftPayload,
} from "@/lib/utils/campaign-draft-storage";
import { FundingTab } from "@/components/campaign-admin/tabs/funding-tab";

// Import new components
import { QuestDialog, QuestList } from "@/components/campaign-admin/quest";
import {
  CampaignForm,
  CampaignStats,
} from "@/components/campaign-admin/campaign";
import { StaffManagement } from "@/components/campaign-admin/campaign/staff-management";
import { InitialFunding } from "@/components/campaign-admin/funding/initial-funding";
import { udtRegistry } from "@/lib/services/udt-registry";
import DraftHistory from "@/components/draft-history";
import { useNostrFetch } from "@/hooks/use-nostr-fetch";
import { useNostrStorage } from "@/hooks/use-nostr-storage";
import { useStorageModal } from "@/lib/providers/storage-modal-provider";
import { PageLoading } from "@/components/ui/page-loading";
import {
  buildQuestChainStub,
  buildQuestContentPayload,
  getQuestContentNeventId,
  mergeQuestContentPayload,
  QUEST_CONTENT_FORMAT,
  QUEST_CONTENT_VERSION,
} from "@/lib/utils/campaign-nostr-content";

const log = createScopedLogger("CampaignAdminPage");

// Type for simplified campaign form data
interface CampaignFormData {
  title: string;
  shortDescription: string;
  longDescription: string;
  categories: string[];
  startDate: string;
  endDate: string;
  difficulty: number;
  verificationLevel: string;
  rules: string[];
}

interface CoverImageState {
  dataUrl?: string;
  neventId?: string;
  dirty: boolean;
  isLoading?: boolean;
}

interface NostrQueueItem {
  neventId: string;
  label?: string;
  contentHint?: "image" | "html" | "text";
}

type NostrPayloadCache = Record<
  string,
  { content: string; metadata: Record<string, string> }
>;

interface PendingCampaignSave {
  updatedCampaign: CampaignDataLike;
  udtFunding?: Array<{ scriptHash: string; amount: bigint }>;
  ckbFunding?: bigint;
  isCreate: boolean;
  campaignTypeId?: ccc.Hex;
  initialFundingEntries?: Array<{ scriptHash: string; amount: bigint }>;
}

const HEX_STRING_PATTERN = /^0x[0-9a-fA-F]*$/;

const decodeHexUtf8 = (value: string): string | null => {
  if (!HEX_STRING_PATTERN.test(value) || value.length <= 2) {
    return null;
  }

  try {
    return new TextDecoder().decode(ccc.bytesFrom(value)).replace(/\u0000+$/g, "");
  } catch (error) {
    log.warn("Failed to decode hex string", error);
    return null;
  }
};

const resolveLongDescriptionRef = (
  rawValue: string
): { neventId: string | null; inline: string } => {
  const trimmed = rawValue.trim();
  const decoded = decodeHexUtf8(trimmed);
  const normalized = (decoded ?? trimmed).trim();

  if (normalized.startsWith("nevent1")) {
    return { neventId: normalized, inline: "" };
  }

  return { neventId: null, inline: normalized };
};

export default function CampaignAdminPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    protocolCell,
    protocolData,
    isLoading: protocolLoading,
    signer,
    updateProtocol,
    isAdmin,
  } = useProtocol();

  const campaignTypeId = params.campaignTypeId as string;
  const mode = searchParams.get("mode");
  const isCreateMode = campaignTypeId === "new" || mode === "create";

  // State Management
  const [campaign, setCampaign] = useState<CampaignDataLike | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [localQuests, setLocalQuests] = useState<QuestDataLike[]>([]);
  const [initialFunding, setInitialFunding] = useState<Map<string, bigint>>(
    new Map()
  );
  const [ckbInitialFunding, setCkbInitialFunding] = useState<bigint>(0n);
  const { fetchSubmission } = useNostrFetch();
  const { storeCampaignContent } = useNostrStorage();
  const storageModal = useStorageModal();
  const [staffLockHashes, setStaffLockHashes] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<CoverImageState>({
    dirty: false,
  });
  const [longDescriptionNeventId, setLongDescriptionNeventId] = useState<
    string | null
  >(null);
  const [longDescriptionDirty, setLongDescriptionDirty] = useState(false);
  const [isDetailsReadOnly, setIsDetailsReadOnly] = useState(!isCreateMode);
  const [pendingCampaignSave, setPendingCampaignSave] =
    useState<PendingCampaignSave | null>(null);
  const pendingCampaignSaveRef = useRef<PendingCampaignSave | null>(null);
  const [pendingNostrQueue, setPendingNostrQueue] = useState<NostrQueueItem[]>(
    []
  );
  const [pendingNostrItems, setPendingNostrItems] = useState<NostrQueueItem[]>(
    []
  );
  const [pendingNostrPayloads, setPendingNostrPayloads] =
    useState<NostrPayloadCache>({});
  const [pendingNostrTotal, setPendingNostrTotal] = useState(0);
  const [pendingNostrIndex, setPendingNostrIndex] = useState(0);
  const [viewerLockHash, setViewerLockHash] = useState<string | null>(null);
  const normalizedStaffHashes = useMemo(
    () => staffLockHashes.map((hash) => hash.toLowerCase()),
    [staffLockHashes]
  );
  const hasStaffAccess = useMemo(() => {
    if (!viewerLockHash) {
      return false;
    }
    return normalizedStaffHashes.includes(viewerLockHash.toLowerCase());
  }, [normalizedStaffHashes, viewerLockHash]);
  const shouldRestrictToSubmissions =
    !isCreateMode && !isAdmin && hasStaffAccess;
  const canViewCampaign = isCreateMode
    ? isAdmin
    : isAdmin || hasStaffAccess;
  const canManageQuests = isCreateMode || !isDetailsReadOnly;

  useEffect(() => {
    setIsDetailsReadOnly(!isCreateMode);
  }, [isCreateMode]);

  useEffect(() => {
    if (shouldRestrictToSubmissions && activeTab !== "submissions") {
      setActiveTab("submissions");
    }
  }, [activeTab, shouldRestrictToSubmissions]);

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
        log.warn("Failed to resolve viewer lock hash", error);
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

  useEffect(() => {
    let cancelled = false;
    const loadCoverImage = async () => {
      if (
        !coverImage.neventId ||
        coverImage.dirty ||
        !coverImage.neventId.startsWith("nevent1")
      ) {
        return;
      }
      setCoverImage((prev) => ({ ...prev, isLoading: true }));
      try {
        const result = await fetchSubmission(coverImage.neventId);
        if (!cancelled && result?.content) {
          setCoverImage((prev) => ({
            ...prev,
            dataUrl: result.content,
            isLoading: false,
          }));
        } else if (!cancelled) {
          setCoverImage((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        if (!cancelled) {
          log.error("Failed to fetch cover image from Nostr:", error);
          setCoverImage((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    loadCoverImage();
    return () => {
      cancelled = true;
    };
  }, [coverImage.neventId, coverImage.dirty, fetchSubmission]);

  useEffect(() => {
    let cancelled = false;
    const loadLongDescription = async () => {
      if (
        !longDescriptionNeventId ||
        longDescriptionDirty ||
        !longDescriptionNeventId.startsWith("nevent1")
      ) {
        return;
      }
      try {
        const result = await fetchSubmission(longDescriptionNeventId);
        if (!cancelled && result?.content) {
          setCampaignData((prev) => ({
            ...prev,
            longDescription: result.content,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          log.error("Failed to fetch long description from Nostr:", error);
        }
      }
    };

    loadLongDescription();
    return () => {
      cancelled = true;
    };
  }, [longDescriptionNeventId, longDescriptionDirty, fetchSubmission]);

  // Runtime type guard for draft quests payload -> QuestDataLike
  const isQuestDataLike = (val: unknown): val is QuestDataLike => {
    if (!val || typeof val !== "object") return false;
    const q = val as Record<string, unknown>;
    const has = (k: string) => Object.prototype.hasOwnProperty.call(q, k);
    return (
      has("quest_id") &&
      has("metadata") &&
      has("points") &&
      has("rewards_on_completion") &&
      has("accepted_submission_user_type_ids") &&
      has("completion_deadline") &&
      has("status") &&
      has("sub_tasks") &&
      has("completion_count")
    );
  };

  const resolveStoredQuestContents = async (
    quests: QuestDataLike[]
  ): Promise<QuestDataLike[]> => {
    return Promise.all(
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
          log.error("Failed to fetch quest content from Nostr:", error);
          return quest;
        }
      })
    );
  };

  // Autosave draft (create mode only)
  // Load any saved draft for create mode on mount
  useEffect(() => {
    if (!isCreateMode) return;
    try {
      const saved = loadCreateDraft();
      if (saved) {
        // Restore campaignData (only known fields)
        const cd = saved.campaignData; // Record<string, unknown>
        setCampaignData((prev) => ({
          title:
            typeof cd["title"] === "string"
              ? (cd["title"] as string)
              : prev.title,
          shortDescription:
            typeof cd["shortDescription"] === "string"
              ? (cd["shortDescription"] as string)
              : prev.shortDescription,
          longDescription:
            typeof cd["longDescription"] === "string"
              ? (cd["longDescription"] as string)
              : prev.longDescription,
          categories: Array.isArray(cd["categories"])
            ? (cd["categories"] as string[])
            : prev.categories,
          startDate:
            typeof cd["startDate"] === "string"
              ? (cd["startDate"] as string)
              : prev.startDate,
          endDate:
            typeof cd["endDate"] === "string"
              ? (cd["endDate"] as string)
              : prev.endDate,
          difficulty:
            typeof cd["difficulty"] === "number"
              ? (cd["difficulty"] as number)
              : prev.difficulty,
          verificationLevel:
            typeof cd["verificationLevel"] === "string"
              ? (cd["verificationLevel"] as string)
              : prev.verificationLevel,
          rules: Array.isArray(cd["rules"])
            ? (cd["rules"] as string[])
            : prev.rules,
        }));
        // Restore quests with type guard
        const savedQuests: QuestDataLike[] = Array.isArray(saved.quests)
          ? (saved.quests as unknown[]).filter(isQuestDataLike)
          : [];
        setLocalQuests(savedQuests);
        // Restore funding
        const entries = (saved.initialFunding || []) as DraftFundingEntry[];
        const map = new Map<string, bigint>();
        for (const e of entries) map.set(e.scriptHash, BigInt(e.amount));
        setInitialFunding(map);
        setCkbInitialFunding(BigInt(saved.ckbInitialFunding || "0"));
      }
    } catch (e) {
      console.error("Failed to load saved campaign draft:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateMode]);

  // Campaign form data
  const [campaignData, setCampaignData] = useState<CampaignFormData>({
    title: "",
    shortDescription: "",
    longDescription: "",
    categories: [],
    startDate: "",
    endDate: "",
    difficulty: 0,
    verificationLevel: "none",
    rules: [""],
  });

  const handleCampaignDataChange = (data: CampaignFormData) => {
    if (data.longDescription !== campaignData.longDescription) {
      setLongDescriptionDirty(true);
    }
    setCampaignData(data);
  };

  const handleCoverImageChange = (dataUrl: string | null) => {
    if (dataUrl) {
      setCoverImage({
        dataUrl,
        neventId: coverImage.neventId,
        dirty: true,
        isLoading: false,
      });
    } else {
      setCoverImage({
        dataUrl: undefined,
        neventId: undefined,
        dirty: true,
        isLoading: false,
      });
    }
  };

  const handleCoverImageClear = () => {
    setCoverImage({
      dataUrl: undefined,
      neventId: undefined,
      dirty: true,
      isLoading: false,
    });
  };

  // Keep latest values in refs for interval to read, without re-creating interval
  const campaignDataRef = useRef(campaignData);
  const questsRef = useRef(localQuests);
  const fundingRef = useRef(initialFunding);
  const ckbFundingRef = useRef(ckbInitialFunding);

  useEffect(() => {
    campaignDataRef.current = campaignData;
  }, [campaignData]);
  useEffect(() => {
    questsRef.current = localQuests;
  }, [localQuests]);
  useEffect(() => {
    fundingRef.current = initialFunding;
  }, [initialFunding]);
  useEffect(() => {
    ckbFundingRef.current = ckbInitialFunding;
  }, [ckbInitialFunding]);

  // Autosave every 60s if there are changes (dedup handled in save util)
  useEffect(() => {
    if (!isCreateMode) return;
    const id = setInterval(() => {
      try {
        const entries: DraftFundingEntry[] = Array.from(
          fundingRef.current.entries()
        ).map(([scriptHash, amount]) => ({
          scriptHash,
          amount: amount.toString(),
        }));

        const draft = {
          campaignData: campaignDataRef.current as unknown as Record<
            string,
            unknown
          >,
          quests: questsRef.current as unknown as Array<
            Record<string, unknown>
          >,
          initialFunding: entries,
          ckbInitialFunding: ckbFundingRef.current.toString(),
        };
        if (!isDraftEmpty(draft)) saveCreateDraft(draft);
      } catch (e) {
        console.error("Autosave draft failed:", e);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [isCreateMode]);

  // Draft UI helpers
  const draftStorage = {
    load: loadCreateDraft,
    save: (data: CampaignCreateDraftPayload) => saveCreateDraft(data),
    history: getCreateDraftHistory,
    clear: clearCreateDraft,
  };

  const buildCurrentDraftPayload = (): CampaignCreateDraftPayload => {
    const entries: DraftFundingEntry[] = Array.from(
      initialFunding.entries()
    ).map(([scriptHash, amount]) => ({
      scriptHash,
      amount: amount.toString(),
    }));
    return {
      campaignData: campaignData as unknown as Record<string, unknown>,
      quests: localQuests as unknown as Array<Record<string, unknown>>,
      initialFunding: entries,
      ckbInitialFunding: ckbInitialFunding.toString(),
    };
  };

  const isDraftEmpty = (payload: CampaignCreateDraftPayload): boolean => {
    const cd = (payload.campaignData || {}) as Record<string, unknown>;

    const getString = (key: string): string | undefined => {
      const v = cd[key];
      return typeof v === "string" ? v : undefined;
    };

    const getNumber = (key: string): number | undefined => {
      const v = cd[key];
      return typeof v === "number" ? v : undefined;
    };

    const getArray = (key: string): unknown[] | undefined => {
      const v = cd[key];
      return Array.isArray(v) ? (v as unknown[]) : undefined;
    };

    const getStringArray = (key: string): string[] => {
      const arr = getArray(key) || [];
      return arr.filter((x): x is string => typeof x === "string");
    };

    const rules = getStringArray("rules");
    const isRulesEmpty =
      rules.length === 0 || rules.every((r) => !r || r.trim() === "");

    const baseEmpty =
      !getString("title") &&
      !getString("shortDescription") &&
      !getString("longDescription") &&
      !(
        getArray("categories") &&
        (getArray("categories") as unknown[]).length > 0
      ) &&
      !getString("startDate") &&
      !getString("endDate") &&
      (getNumber("difficulty") ?? 0) === 0 &&
      (!getString("verificationLevel") ||
        getString("verificationLevel") === "none") &&
      isRulesEmpty;

    const questsEmpty = !payload.quests || payload.quests.length === 0;
    const fundingEmpty =
      !payload.initialFunding || payload.initialFunding.length === 0;
    const ckbEmpty =
      !payload.ckbInitialFunding || payload.ckbInitialFunding === "0";
    return baseEmpty && questsEmpty && fundingEmpty && ckbEmpty;
  };

  const handleRestoreDraft = (payload: CampaignCreateDraftPayload) => {
    try {
      const cd = payload.campaignData;
      setCampaignData((prev) => ({
        title:
          typeof cd["title"] === "string"
            ? (cd["title"] as string)
            : prev.title,
        shortDescription:
          typeof cd["shortDescription"] === "string"
            ? (cd["shortDescription"] as string)
            : prev.shortDescription,
        longDescription:
          typeof cd["longDescription"] === "string"
            ? (cd["longDescription"] as string)
            : prev.longDescription,
        categories: Array.isArray(cd["categories"])
          ? (cd["categories"] as string[])
          : prev.categories,
        startDate:
          typeof cd["startDate"] === "string"
            ? (cd["startDate"] as string)
            : prev.startDate,
        endDate:
          typeof cd["endDate"] === "string"
            ? (cd["endDate"] as string)
            : prev.endDate,
        difficulty:
          typeof cd["difficulty"] === "number"
            ? (cd["difficulty"] as number)
            : prev.difficulty,
        verificationLevel:
          typeof cd["verificationLevel"] === "string"
            ? (cd["verificationLevel"] as string)
            : prev.verificationLevel,
        rules: Array.isArray(cd["rules"])
          ? (cd["rules"] as string[])
          : prev.rules,
      }));
      const restoredQuests: QuestDataLike[] = Array.isArray(payload.quests)
        ? (payload.quests as unknown[]).filter(isQuestDataLike)
        : [];
      setLocalQuests(restoredQuests);
      const map = new Map<string, bigint>();
      for (const e of payload.initialFunding || [])
        map.set(e.scriptHash, BigInt(e.amount));
      setInitialFunding(map);
      setCkbInitialFunding(BigInt(payload.ckbInitialFunding || "0"));
      setActiveTab("details");
    } catch (e) {
      console.error("Failed to restore draft payload:", e);
      alert("Failed to restore draft");
    }
  };

  const handleClearDraft = () => {
    const emptyCampaignData: CampaignFormData = {
      title: "",
      shortDescription: "",
      longDescription: "",
      categories: [],
      startDate: "",
      endDate: "",
      difficulty: 0,
      verificationLevel: "none",
      rules: [""],
    };
    const emptyFunding = new Map<string, bigint>();
    campaignDataRef.current = emptyCampaignData;
    questsRef.current = [];
    fundingRef.current = emptyFunding;
    ckbFundingRef.current = 0n;
    setCampaignData(emptyCampaignData);
    setLocalQuests([]);
    setInitialFunding(emptyFunding);
    setCkbInitialFunding(0n);
    setCoverImage({ dirty: false });
    setLongDescriptionNeventId(null);
    setLongDescriptionDirty(false);
    setActiveTab("details");
  };

  // Quest form management
  const createEmptyQuestForm = (
    questId: number
  ): QuestDataLike & { initial_quota: number } => ({
    quest_id: questId,
    metadata: {
      title: "",
      short_description: "",
      long_description: "",
      requirements: "",
      difficulty: 1,
      time_estimate: 30,
    },
    points: 100,
    rewards_on_completion: [],
    accepted_submission_user_type_ids: [],
    completion_deadline: BigInt(
      Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60)
    ),
    status: 0,
    sub_tasks: [],
    completion_count: 0,
    initial_quota: 10,
  });

  const [isAddingQuest, setIsAddingQuest] = useState(false);
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null
  );
  const [questForm, setQuestForm] = useState<
    QuestDataLike & { initial_quota: number }
  >(createEmptyQuestForm(1));

  // Helper functions
  const getVerificationBitmask = (level: string): number => {
    const verificationMap: Record<string, number> = {
      none: 0,
      telegram: 1,
      kyc: 2,
      did: 4,
      manual: 8,
      twitter: 16,
      discord: 32,
      reddit: 64,
    };
    return verificationMap[level] || 0;
  };

  const getVerificationLevelFromBitmask = (bitmask: number[]): string => {
    if (!bitmask || bitmask.length === 0 || bitmask[0] === 0) return "none";
    const value = Number(bitmask[0]);
    if (value & 1) return "telegram";
    if (value & 16) return "twitter";
    if (value & 32) return "discord";
    if (value & 8) return "manual";
    return "none";
  };

  // Load campaign data
  useEffect(() => {
    const loadCampaign = async () => {
      if (isCreateMode) {
        setIsLoading(false);
        return;
      }

      if (!campaignTypeId || protocolLoading || campaignTypeId === "new") {
        return;
      }

      try {
        setIsLoading(true);
        log.log("Loading campaign with typeId:", campaignTypeId);

        const campaignCodeHash =
          protocolData?.protocol_config?.script_code_hashes
            ?.ckb_boost_campaign_type_code_hash;
        if (!campaignCodeHash) {
          log.error("Campaign code hash not found in protocol data");
          return;
        }

        if (!signer) {
          log.error("Signer not found");
          return;
        }

        const campaignCell = await fetchCampaignByTypeId(
          campaignTypeId as ccc.Hex,
          campaignCodeHash as ccc.Hex,
          signer.client,
          protocolCell!
        );
        if (!campaignCell) {
          log.error("Campaign cell not found");
          alert("Campaign not found");
          router.push("/campaign-admin");
          return;
        }

        // Parse campaign data directly from the cell
        const campaignData = CampaignData.decode(campaignCell.outputData);

        if (campaignData) {
          setCampaign(campaignData);

          const rawLongDescription = campaignData.metadata?.long_description || "";
          const longDescriptionRef = resolveLongDescriptionRef(rawLongDescription);
          const rawImageUrl = campaignData.metadata?.image_url || "";
          const isImageFromNostr = rawImageUrl.startsWith("nevent1");

          // Populate form data
          setCampaignData({
            title: campaignData.metadata?.title || "",
            shortDescription: campaignData.metadata?.short_description || "",
            longDescription: longDescriptionRef.inline,
            categories: campaignData.metadata?.categories || [],
            startDate: campaignData.starting_time
              ? new Date(Number(campaignData.starting_time) * 1000)
                  .toISOString()
                  .slice(0, 16)
              : "",
            endDate: campaignData.ending_time
              ? new Date(Number(campaignData.ending_time) * 1000)
                  .toISOString()
                  .slice(0, 16)
              : "",
            difficulty: Number(campaignData.metadata?.difficulty) || 0,
            verificationLevel: getVerificationLevelFromBitmask(
              campaignData.metadata?.verification_requirements || []
            ),
            rules: campaignData?.rules || [""],
          });

          setLongDescriptionNeventId(longDescriptionRef.neventId);
          setLongDescriptionDirty(false);

          setCoverImage({
            dataUrl: isImageFromNostr ? undefined : rawImageUrl || undefined,
            neventId: isImageFromNostr ? rawImageUrl : undefined,
            dirty: false,
            isLoading: isImageFromNostr,
          });

          const staffHashes =
            campaignData.staff_lock_hash_vec?.map((hash) =>
              ccc.hexFrom(hash as ccc.BytesLike)
            ) || [];
          setStaffLockHashes(staffHashes);

          // Keep editable quest state in sync with loaded campaign data.
          // Chain data may only contain Nostr references for rich quest content.
          setLocalQuests(
            await resolveStoredQuestContents(campaignData.quests || [])
          );

          log.log("Campaign loaded successfully");
        }
      } catch (error) {
        log.error("Failed to load campaign:", error);
        alert("Failed to load campaign");
      } finally {
        setIsLoading(false);
      }
    };

    loadCampaign();
  }, [
    campaignTypeId,
    isCreateMode,
    protocolLoading,
    protocolCell,
    protocolData,
    signer,
    router,
  ]);

  // Fill test data function
  const fillTestData = () => {
    const randomNum = Math.floor(Math.random() * 1000);
    const testData: CampaignFormData = {
      title: `Learn CKB Development ${randomNum}`,
      shortDescription: `Master the basics of CKB blockchain development through hands-on tasks ${randomNum}`,
      longDescription:
        "This comprehensive campaign will guide you through the fundamentals of CKB blockchain development. You'll learn about the Cell model, write smart contracts in Rust, understand the UTXO model, and build your first dApp. Perfect for developers looking to expand their blockchain skills.",
      categories: ["Education", "Development"],
      difficulty: 2,
      startDate: new Date().toISOString().slice(0, 16),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16), // 30 days from now
      verificationLevel: "none",
      rules: [
        "Complete quests in any order",
        "Submit proof of completion for each task",
        "Points are awarded upon verification",
        "Collaboration is encouraged",
      ],
    };
    setCampaignData(testData);
  };

  const handleCampaignModalClose = () => {
    log.log("handleCampaignModalClose invoked, resetting pending state");
    setPendingCampaignSave(null);
    pendingCampaignSaveRef.current = null;
    setPendingNostrQueue([]);
    setPendingNostrItems([]);
    setPendingNostrTotal(0);
    setPendingNostrIndex(0);
    setIsSaving(false);
  };

  // Campaign save handler
  const handleSaveCampaign = async () => {
    if (!signer || !protocolCell) {
      alert("Please connect your wallet first");
      return;
    }

    if (isCreateMode && localQuests.length === 0) {
      alert("Please add at least one quest before creating your campaign.");
      return;
    }

    try {
      setIsSaving(true);

      const hasReusableLongDescriptionRef =
        !!longDescriptionNeventId?.startsWith("nevent1") &&
        !longDescriptionDirty;
      const longDescriptionContent = campaignData.longDescription || "";
      const hasLongDescription = longDescriptionContent.trim().length > 0;

      if (!campaignData.title.trim()) {
        alert("Please provide a campaign title before saving.");
        setIsSaving(false);
        return;
      }

      if (!campaignData.shortDescription.trim()) {
        alert("Please provide a campaign short description before saving.");
        setIsSaving(false);
        return;
      }

      if (!hasLongDescription && !hasReusableLongDescriptionRef) {
        alert("Please provide a campaign long description before saving.");
        setIsSaving(false);
        return;
      }

      const campaignReference =
        !isCreateMode && campaignTypeId && campaignTypeId !== "new"
          ? (campaignTypeId as string)
          : `draft-${Date.now()}`;

      const nostrVerificationQueue: NostrQueueItem[] = [];
      const nostrPayloadsForModal: NostrPayloadCache = {};

      const validatedQuests: QuestDataLike[] = [];
      for (const quest of localQuests) {
        const normalizedQuest: QuestDataLike = {
          quest_id: quest.quest_id,
          metadata: quest.metadata,
          points: quest.points,
          rewards_on_completion: quest.rewards_on_completion || [],
          accepted_submission_user_type_ids:
            quest.accepted_submission_user_type_ids || [],
          completion_deadline: quest.completion_deadline,
          status: quest.status,
          sub_tasks: quest.sub_tasks || [],
          completion_count: quest.completion_count,
        };

        const questPayload = buildQuestContentPayload(normalizedQuest);
        const questPayloadContent = JSON.stringify(questPayload);
        const questPayloadMetadata = {
          format: "json",
          type: "quest_content",
          content_format: QUEST_CONTENT_FORMAT,
          version: String(QUEST_CONTENT_VERSION),
          quest_id: String(Number(normalizedQuest.quest_id || 0)),
        };

        try {
          const storedQuestId = await storeCampaignContent.mutateAsync({
            campaignTypeId: campaignReference,
            contentType: "quest_content",
            content: questPayloadContent,
            metadata: questPayloadMetadata,
          });
          validatedQuests.push(
            buildQuestChainStub(normalizedQuest, storedQuestId)
          );
          nostrVerificationQueue.push({
            neventId: storedQuestId,
            label:
              normalizedQuest.metadata?.title ||
              `Quest ${
                Number(normalizedQuest.quest_id || 0) || validatedQuests.length
              }`,
            contentHint: "text",
          });
          nostrPayloadsForModal[storedQuestId] = {
            content: questPayloadContent,
            metadata: questPayloadMetadata,
          };
        } catch (error) {
          log.error("Failed to store quest content on Nostr:", error);
          alert(
            "Failed to store quest content on Nostr. Please try again before saving."
          );
          setIsSaving(false);
          return;
        }
      }

      let imageUrlToStore =
        coverImage.neventId || campaign?.metadata?.image_url || "";
      if (coverImage.dirty) {
        if (coverImage.dataUrl) {
          try {
            const storedImageId = await storeCampaignContent.mutateAsync({
              campaignTypeId: campaignReference,
              contentType: "cover_image",
              content: coverImage.dataUrl,
              metadata: { encoding: "base64", type: "cover_image" },
            });
            imageUrlToStore = storedImageId;
            nostrVerificationQueue.push({
              neventId: storedImageId,
              label: "Campaign Cover Image",
              contentHint: "image",
            });
            nostrPayloadsForModal[storedImageId] = {
              content: coverImage.dataUrl ?? "",
              metadata: { encoding: "base64", type: "cover_image" },
            };
            setPendingNostrPayloads((prev) => ({
              ...prev,
              [storedImageId]: {
                content: coverImage.dataUrl ?? "",
                metadata: { encoding: "base64", type: "cover_image" },
              },
            }));
            setCoverImage({
              dataUrl: coverImage.dataUrl,
              neventId: storedImageId,
              dirty: false,
              isLoading: false,
            });
          } catch (error) {
            log.error("Failed to store cover image on Nostr:", error);
            alert(
              "Failed to store cover image on Nostr. Please try again before saving."
            );
            setIsSaving(false);
            return;
          }
        } else {
          imageUrlToStore = "";
          setCoverImage({
            dataUrl: undefined,
            neventId: undefined,
            dirty: false,
            isLoading: false,
          });
        }
      }

      let longDescriptionToStore =
        hasReusableLongDescriptionRef
          ? longDescriptionNeventId
          : longDescriptionContent;
      const shouldStoreLongDescription =
        hasLongDescription &&
        (longDescriptionDirty || !hasReusableLongDescriptionRef);

      if (shouldStoreLongDescription) {
        try {
          const storedLongId = await storeCampaignContent.mutateAsync({
            campaignTypeId: campaignReference,
            contentType: "long_description",
            content: longDescriptionContent,
            metadata: { format: "html", type: "long_description" },
          });
          longDescriptionToStore = storedLongId;
          nostrVerificationQueue.push({
            neventId: storedLongId,
            label: "Campaign Long Description",
            contentHint: "html",
          });
          nostrPayloadsForModal[storedLongId] = {
            content: longDescriptionContent,
            metadata: { format: "html", type: "long_description" },
          };
          setPendingNostrPayloads((prev) => ({
            ...prev,
            [storedLongId]: {
              content: longDescriptionContent,
              metadata: { format: "html", type: "long_description" },
            },
          }));
          setLongDescriptionNeventId(storedLongId);
          setLongDescriptionDirty(false);
        } catch (error) {
          log.error("Failed to store long description on Nostr:", error);
          alert(
            "Failed to store the long description on Nostr. Please try again."
          );
          setIsSaving(false);
          return;
        }
      } else if (!hasLongDescription && hasReusableLongDescriptionRef) {
        longDescriptionToStore = longDescriptionNeventId as string;
      } else if (!hasLongDescription) {
        longDescriptionToStore = "";
        setLongDescriptionNeventId(null);
        setLongDescriptionDirty(false);
      }

      const signerLockHash = (
        await signer.getRecommendedAddressObj()
      ).script.hash();
      const endorserLockHash =
        !isCreateMode && campaign?.endorser_lock_hash
          ? campaign.endorser_lock_hash
          : signerLockHash;
      const updatedCampaign: CampaignDataLike = {
        endorser_lock_hash: endorserLockHash,
        staff_lock_hash_vec: (staffLockHashes || []) as ccc.Hex[],
        created_at:
          campaign?.created_at || BigInt(Math.floor(Date.now() / 1000)),
        starting_time: campaignData.startDate
          ? BigInt(
              Math.floor(new Date(campaignData.startDate).getTime() / 1000)
            )
          : BigInt(Math.floor(Date.now() / 1000)),
        ending_time: campaignData.endDate
          ? BigInt(Math.floor(new Date(campaignData.endDate).getTime() / 1000))
          : BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60),
        rules: (campaignData.rules.filter((r) => r.trim() !== "") ||
          []) as string[],
        metadata: {
          title: (campaignData.title || "") as string,
          short_description: (campaignData.shortDescription || "") as string,
          long_description: longDescriptionToStore as string,
          total_rewards: campaign?.metadata?.total_rewards || {
            points_amount: BigInt(0) as ccc.NumLike,
            ckb_amount: BigInt(0) as ccc.NumLike,
            nft_assets: [] as ccc.ScriptLike[],
            udt_assets: [] as UDTAssetLike[],
          },
          verification_requirements: [
            getVerificationBitmask(campaignData.verificationLevel),
          ] as ccc.NumLike[],
          last_updated: BigInt(Math.floor(Date.now() / 1000)),
          categories: (campaignData.categories || []) as string[],
          difficulty: (Number(campaignData.difficulty) || 0) as ccc.NumLike,
          image_url: imageUrlToStore as string,
        },
        status: (Number(campaign?.status) || 0) as ccc.NumLike,
        quests: validatedQuests,
        participants_count: (Number(campaign?.participants_count) ||
          0) as ccc.NumLike,
        total_completions: (Number(campaign?.total_completions) ||
          0) as ccc.NumLike,
      };

      const udtFunding =
        isCreateMode && initialFunding.size > 0
          ? Array.from(initialFunding.entries()).map(
              ([scriptHash, amount]) => ({
                scriptHash,
                amount,
              })
            )
          : undefined;

      const pendingPayload: PendingCampaignSave = {
        updatedCampaign,
        udtFunding,
        ckbFunding: isCreateMode ? ckbInitialFunding : undefined,
        isCreate: isCreateMode,
        campaignTypeId: !isCreateMode
          ? (campaignTypeId as string).startsWith("0x")
            ? (campaignTypeId as ccc.Hex)
            : (`0x${campaignTypeId}` as ccc.Hex)
          : undefined,
        initialFundingEntries: isCreateMode
          ? Array.from(initialFunding.entries()).map(
              ([scriptHash, amount]) => ({ scriptHash, amount })
            )
          : undefined,
      };

      if (nostrVerificationQueue.length > 0) {
        setPendingCampaignSave(pendingPayload);
        pendingCampaignSaveRef.current = pendingPayload;
        log.log("Pending campaign save stored for verification flow", {
          queueLength: nostrVerificationQueue.length,
          pendingCampaignSave: pendingCampaignSaveRef.current,
        });
        setPendingNostrQueue(nostrVerificationQueue);
        setPendingNostrItems([...nostrVerificationQueue]);
        setPendingNostrPayloads((prev) => ({
          ...prev,
          ...nostrPayloadsForModal,
        }));
        setPendingNostrTotal(nostrVerificationQueue.length);
        setPendingNostrIndex(0);
        const firstItem = nostrVerificationQueue[0];
        log.log("Opening storage modal for campaign verification queue", {
          queueLength: nostrVerificationQueue.length,
          firstItem,
        });
        storageModal.open({
          neventId: firstItem.neventId,
          label: firstItem.label,
          contentHint: firstItem.contentHint,
          mode: "verifying",
          onConfirm: handleCampaignNostrConfirm,
          onClose: handleCampaignModalClose,
          queuePosition: 1,
          queueTotal: nostrVerificationQueue.length,
          queueItems: nostrVerificationQueue,
          queueIndex: 0,
          cachedPayloads: nostrPayloadsForModal,
        });
        return;
      }

      await performCampaignUpdate(pendingPayload);
    } catch (error) {
      log.error("Failed to save campaign:", error);
      alert(
        `Failed to save campaign: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setIsSaving(false);
    }
  };

  const performCampaignUpdate = async (
    payload: PendingCampaignSave
  ): Promise<string> => {
    try {
      log.log("performCampaignUpdate called", {
        isCreate: payload.isCreate,
        hasUdtFunding: !!payload.udtFunding?.length,
        hasCkbFunding: !!payload.ckbFunding,
        campaignTypeId: payload.campaignTypeId,
      });
      if (!signer || !protocolCell) {
        throw new Error("Please connect your wallet first");
      }

      const userCodeHash =
        protocolData?.protocol_config.script_code_hashes
          .ckb_boost_user_type_code_hash;
      const campaignCodeHash =
        protocolData?.protocol_config.script_code_hashes
          .ckb_boost_campaign_type_code_hash;
      const protocolTypeHash = protocolCell.cellOutput.type?.hash();

      if (!userCodeHash || !campaignCodeHash || !protocolTypeHash) {
        throw new Error("Missing required protocol configuration");
      }

      const network = deploymentManager.getCurrentNetwork();
      const campaignOutPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostCampaignType"
      );
      if (!campaignOutPoint) {
        throw new Error("Campaign type contract not found in deployments");
      }

      const executorUrl =
        process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
      const executor = new ssri.ExecutorJsonRpc(executorUrl);

      let campaignInstance: Campaign;

      if (payload.isCreate) {
        const campaignTypeScript = ccc.Script.from({
          codeHash: campaignCodeHash,
          hashType: "type" as const,
          args: "0x",
        });

        campaignInstance = new Campaign(
          campaignOutPoint,
          campaignTypeScript,
          protocolCell,
          { executor }
        );
      } else {
        if (!payload.campaignTypeId) {
          throw new Error("Missing campaign type ID for update");
        }

        const existingCampaignCell = await fetchCampaignByTypeId(
          payload.campaignTypeId,
          campaignCodeHash as ccc.Hex,
          signer.client,
          protocolCell
        );

        if (!existingCampaignCell || !existingCampaignCell.cellOutput.type) {
          throw new Error(
            "Existing campaign cell not found or missing type script"
          );
        }

        campaignInstance = new Campaign(
          campaignOutPoint,
          existingCampaignCell.cellOutput.type,
          protocolCell,
          { executor }
        );
      }

      const adminService = new CampaignAdminService(
        signer,
        userCodeHash as ccc.Hex,
        protocolTypeHash as ccc.Hex,
        campaignCodeHash as ccc.Hex,
        protocolCell,
        campaignInstance
      );

      let txHash: ccc.Hex;

      if (payload.isCreate) {
        txHash = await adminService.updateCampaign(
          payload.updatedCampaign,
          undefined,
          undefined,
          payload.udtFunding,
          payload.ckbFunding
        );

        try {
          clearCreateDraft();
        } catch {}

        if (
          payload.initialFundingEntries &&
          payload.initialFundingEntries.length > 0
        ) {
          const fundingInfo = payload.initialFundingEntries
            .map(({ scriptHash, amount }) => {
              const token = udtRegistry.getTokenByScriptHash(scriptHash);
              return token
                ? `${udtRegistry.formatAmount(Number(amount), token)}`
                : `${amount.toString()} tokens`;
            })
            .join(", ");

          alert(
            `Campaign created successfully with initial funding!\n\nTransaction: ${txHash}\n\nFunded with: ${fundingInfo}`
          );
        } else {
          alert("Campaign created successfully! Transaction: " + txHash);
        }

        router.push("/campaign-admin");
      } else {
        txHash = await adminService.updateCampaign(payload.updatedCampaign);
        alert("Campaign updated successfully! Transaction: " + txHash);
        await refreshCampaign();
      }

      return txHash;
    } catch (error) {
      log.error("Failed to save campaign:", error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to save campaign");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCampaignNostrConfirm = async (): Promise<string | void> => {
    const activePendingCampaignSave =
      pendingCampaignSave ?? pendingCampaignSaveRef.current;

    if (!activePendingCampaignSave) {
      log.log("handleCampaignNostrConfirm called without pendingCampaignSave");
      return;
    }

    const totalItems =
      pendingNostrTotal || pendingNostrItems.length || pendingNostrQueue.length;

    log.log("handleCampaignNostrConfirm invoked", {
      pendingNostrIndex,
      totalItems,
      pendingNostrItemsLength: pendingNostrItems.length,
      pendingNostrQueueLength: pendingNostrQueue.length,
    });

    if (pendingNostrIndex < totalItems - 1) {
      const nextIndex = pendingNostrIndex + 1;
      const sourceItems = pendingNostrItems.length
        ? pendingNostrItems
        : pendingNostrQueue;
      const nextItem = sourceItems[nextIndex];

      if (nextItem) {
        log.log("Opening next queue item in storage modal", {
          nextIndex,
          nextItem,
          totalItems,
        });
        setPendingNostrIndex(nextIndex);
        storageModal.open({
          neventId: nextItem.neventId,
          label: nextItem.label,
          contentHint: nextItem.contentHint,
          mode: "verifying",
          onConfirm: handleCampaignNostrConfirm,
          onClose: handleCampaignModalClose,
          queuePosition: nextIndex + 1,
          queueTotal: totalItems,
          queueItems: sourceItems,
          queueIndex: nextIndex,
          cachedPayloads: pendingNostrPayloads,
        });
        return;
      }
    }

    log.log("All queue items verified, performing campaign update");
    const txHash = await performCampaignUpdate(activePendingCampaignSave);
    setPendingCampaignSave(null);
    pendingCampaignSaveRef.current = null;
    setPendingNostrQueue([]);
    setPendingNostrItems([]);
    setPendingNostrPayloads({});
    setPendingNostrTotal(0);
    setPendingNostrIndex(0);
    return txHash;
  };

  // Handle campaign approval
  const handleApproveCampaign = async () => {
    if (
      !signer ||
      !protocolData ||
      !campaignTypeId ||
      !updateProtocol ||
      isCreateMode
    ) {
      log.error("Missing required data for campaign approval");
      alert(
        "Please ensure your wallet is connected and you have admin privileges."
      );
      return;
    }

    setIsApproving(true);
    try {
      log.log("Approving campaign:", campaignTypeId);

      // Ensure the type hash is properly formatted as ccc.Hex (0x + 64 hex chars)
      const formattedTypeId = campaignTypeId.startsWith("0x")
        ? (campaignTypeId as ccc.Hex)
        : (`0x${campaignTypeId}` as ccc.Hex);

      // Add the campaign to approved list in protocol
      const updatedProtocol: ProtocolDataLike = {
        campaigns_approved: [
          ...(protocolData.campaigns_approved || []),
          formattedTypeId,
        ],
        tippings_approved: protocolData.tippings_approved,
        tipping_config: protocolData.tipping_config,
        endorsers_whitelist: protocolData.endorsers_whitelist || [],
        last_updated: Math.floor(Date.now() / 1000),
        protocol_config: protocolData.protocol_config,
      };

      await updateProtocol(updatedProtocol);
      log.log("Campaign approved successfully");
      alert("Campaign approved successfully!");

      // Refresh to show the approved status
      await refreshCampaign();
    } catch (error) {
      log.error("Failed to approve campaign:", error);
      alert(
        `Failed to approve campaign: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsApproving(false);
    }
  };

  // Refresh campaign data
  const refreshCampaign = async () => {
    if (!campaignTypeId || isCreateMode) return;

    try {
      setIsRefreshing(true);
      const campaignCodeHash =
        protocolData?.protocol_config.script_code_hashes
          .ckb_boost_campaign_type_code_hash;
      if (!campaignCodeHash) {
        log.error("Campaign code hash not found in protocol data");
        return;
      }

      if (!signer) {
        log.error("Signer not found");
        return;
      }

      const campaignCell = await fetchCampaignByTypeId(
        campaignTypeId as ccc.Hex,
        campaignCodeHash as ccc.Hex,
        signer.client,
        protocolCell!
      );
      if (!campaignCell) {
        log.error("Campaign cell not found during refresh");
        return;
      }

      // Parse campaign data directly from the cell
      const campaignData = CampaignData.decode(campaignCell.outputData);

      if (campaignData) {
        setCampaign(campaignData);
        setLocalQuests(
          await resolveStoredQuestContents(campaignData.quests || [])
        );
        const rawLongDescription = campaignData.metadata?.long_description || "";
        const longDescriptionRef = resolveLongDescriptionRef(rawLongDescription);
        const rawImageUrl = campaignData.metadata?.image_url || "";
        const isImageFromNostr = rawImageUrl.startsWith("nevent1");

        setCampaignData({
          title: campaignData.metadata?.title || "",
          shortDescription: campaignData.metadata?.short_description || "",
          longDescription: longDescriptionRef.inline,
          categories: campaignData.metadata?.categories || [],
          startDate: campaignData.starting_time
            ? new Date(Number(campaignData.starting_time) * 1000)
                .toISOString()
                .slice(0, 16)
            : "",
          endDate: campaignData.ending_time
            ? new Date(Number(campaignData.ending_time) * 1000)
                .toISOString()
                .slice(0, 16)
            : "",
          difficulty: Number(campaignData.metadata?.difficulty) || 0,
          verificationLevel: getVerificationLevelFromBitmask(
            campaignData.metadata?.verification_requirements || []
          ),
          rules: campaignData?.rules || [""],
        });

        setLongDescriptionNeventId(longDescriptionRef.neventId);
        setLongDescriptionDirty(false);

        setCoverImage({
          dataUrl: isImageFromNostr ? undefined : rawImageUrl || undefined,
          neventId: isImageFromNostr ? rawImageUrl : undefined,
          dirty: false,
          isLoading: isImageFromNostr,
        });

        const staffHashes =
          campaignData.staff_lock_hash_vec?.map((hash) =>
            ccc.hexFrom(hash as ccc.BytesLike)
          ) || [];
        setStaffLockHashes(staffHashes);
      }
    } catch (error) {
      log.error("Failed to refresh campaign:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Quest handlers
  const handleAddQuest = () => {
    const newQuest: QuestDataLike = {
      ...questForm,
      quest_id: localQuests.length + 1,
    };
    setLocalQuests([...localQuests, newQuest]);
    log.log("Added quest to local state:", newQuest);

    // Reset form for next quest
    setQuestForm(createEmptyQuestForm(localQuests.length + 2));
    setIsAddingQuest(false);
  };

  const handleEditQuest = (questIndex: number) => {
    const quest = localQuests[questIndex];
    if (!quest) return;

    setQuestForm({
      ...quest,
      initial_quota:
        (quest as QuestDataLike & { initial_quota?: number }).initial_quota ||
        10,
    });
    setEditingQuestIndex(questIndex);
    setIsAddingQuest(true);
  };

  const handleClearQuestForm = () => {
    if (editingQuestIndex !== null) {
      const original = localQuests[editingQuestIndex];
      if (original) {
        setQuestForm({
          ...original,
          initial_quota:
            (original as QuestDataLike & { initial_quota?: number })
              .initial_quota || 10,
        });
      }
    } else {
      setQuestForm(createEmptyQuestForm(localQuests.length + 1));
    }
  };

  const handleSaveEditedQuest = () => {
    if (editingQuestIndex === null) return;

    const updatedQuests = [...localQuests];
    updatedQuests[editingQuestIndex] = questForm;
    setLocalQuests(updatedQuests);

    log.log(
      "Updated quest in local state at index:",
      editingQuestIndex,
      questForm
    );

    // Reset form and close edit mode
    setEditingQuestIndex(null);
    setIsAddingQuest(false);
    setQuestForm(createEmptyQuestForm(localQuests.length + 1));
  };

  const handleDeleteQuest = (questIndex: number) => {
    if (confirm("Are you sure you want to delete this quest?")) {
      const updatedQuests = localQuests.filter(
        (_, index) => index !== questIndex
      );
      setLocalQuests(updatedQuests);
      log.log("Deleted quest from local state at index:", questIndex);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <PageLoading
        title={
          isCreateMode ? "Preparing Campaign Draft" : "Loading Campaign Details"
        }
        description="Syncing campaign metadata, quests, and funding data."
      />
    );
  }

  // Error state
  if (!isCreateMode && !campaign && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
                <div>
                  <h3 className="font-semibold text-lg">Campaign Not Found</h3>
                  <p className="text-muted-foreground mt-2">
                    The campaign you're looking for doesn't exist or has been
                    removed.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/campaign-admin">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Campaigns
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!canViewCampaign && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
                <div>
                  <h3 className="font-semibold text-lg">Access Restricted</h3>
                  <p className="text-muted-foreground mt-2">
                    You need to be a campaign admin or a registered staff member
                    for this campaign to view admin tools.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/campaign-admin">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Campaign List
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Statistics calculations moved to CampaignStats component

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaign-admin">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Campaigns
                </Link>
              </Button>
              <h1 className="text-3xl font-bold">
                {isCreateMode
                  ? "Create New Campaign"
                  : campaign?.metadata?.title || "Campaign Admin"}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {!shouldRestrictToSubmissions && (
                <>
                  {!isCreateMode && (
                    <>
                      <Badge variant="secondary">
                        {campaign?.status === 0
                          ? "Draft"
                          : campaign?.status === 1
                          ? "Active"
                          : campaign?.status === 2
                          ? "Completed"
                          : "Cancelled"}
                      </Badge>

                      {/* Show Approve Campaign button for admins if not approved */}
                      {isAdmin &&
                        campaignTypeId &&
                        !protocolData?.campaigns_approved?.includes(
                          campaignTypeId as ccc.Hex
                        ) && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={handleApproveCampaign}
                            disabled={isApproving}
                          >
                            {isApproving ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Approving...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve Campaign
                              </>
                            )}
                          </Button>
                        )}

                      {/* Show approved badge if campaign is already approved */}
                      {campaignTypeId &&
                        protocolData?.campaigns_approved?.includes(
                          campaignTypeId as ccc.Hex
                        ) && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approved
                          </Badge>
                        )}

                      <Button
                        onClick={refreshCampaign}
                        disabled={isRefreshing}
                        size="sm"
                        variant="outline"
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </Button>
                    </>
                  )}

                  {isCreateMode && (
                    <Button onClick={fillTestData} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Fill Test Data
                    </Button>
                  )}

                  <Button
                    onClick={handleSaveCampaign}
                    disabled={
                      isSaving ||
                      !signer ||
                      (!isCreateMode && isDetailsReadOnly) ||
                      (isCreateMode && localQuests.length === 0)
                    }
                  >
                    {isSaving
                      ? "Saving..."
                      : isCreateMode
                      ? "Create Campaign"
                      : "Save Changes"}
                  </Button>
                  {isCreateMode && localQuests.length === 0 && (
                    <p className="text-xs text-red-600 dark:text-red-300">
                      Add at least one quest to enable campaign creation.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {!shouldRestrictToSubmissions && (
            <>
              {/* Campaign Stats */}
              <CampaignStats
                quests={localQuests}
                participantCount={
                  campaign?.participants_count
                    ? Number(campaign.participants_count)
                    : 0
                }
                completionCount={
                  campaign?.total_completions
                    ? Number(campaign.total_completions)
                    : 0
                }
              />
              {isCreateMode && (
                <div className="mt-4">
                  <DraftHistory
                    title="Campaign Draft"
                    storage={draftStorage}
                    data={buildCurrentDraftPayload()}
                    isEmpty={(d) => isDraftEmpty(d)}
                    onRestore={handleRestoreDraft}
                    onClear={handleClearDraft}
                    getVersionLabel={(d, ts) =>
                      new Date(ts).toLocaleString()
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            {!shouldRestrictToSubmissions && (
              <>
                <TabsTrigger value="details">Campaign Details</TabsTrigger>
                <TabsTrigger value="quests">
                  Quests {localQuests.length > 0 && `(${localQuests.length})`}
                </TabsTrigger>
                {isCreateMode && (
                  <TabsTrigger value="funding">
                    Initial Funding{" "}
                    {initialFunding.size > 0 && `(${initialFunding.size})`}
                  </TabsTrigger>
                )}
              </>
            )}
            {!isCreateMode && (
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
            )}
            {!shouldRestrictToSubmissions && !isCreateMode && (
              <>
                <TabsTrigger value="funding">Funding</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </>
            )}
          </TabsList>

          {!shouldRestrictToSubmissions && (
            <TabsContent value="details">
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Campaign Information</CardTitle>
                    {!isCreateMode && isDetailsReadOnly && (
                      <p className="text-sm text-muted-foreground">
                        Viewing campaign details in read-only mode. Enable
                        editing to make changes.
                      </p>
                    )}
                  </div>
                  {!isCreateMode && (
                    <Button
                      variant={isDetailsReadOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsDetailsReadOnly((prev) => !prev)}
                    >
                      {isDetailsReadOnly
                        ? "Enable Editing"
                        : "Switch to Read Only"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  <CampaignForm
                    campaignData={campaignData}
                    onChange={handleCampaignDataChange}
                    isCreateMode={isCreateMode}
                    readOnly={!isCreateMode && isDetailsReadOnly}
                    coverImage={coverImage}
                    onCoverImageChange={handleCoverImageChange}
                    onCoverImageClear={handleCoverImageClear}
                    longDescriptionNeventId={longDescriptionNeventId}
                  />
                  <StaffManagement
                    staffLockHashes={staffLockHashes}
                    onChange={setStaffLockHashes}
                    signer={signer!}
                    disabled={!isCreateMode && isDetailsReadOnly}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Quests Tab */}
          {!shouldRestrictToSubmissions && (
            <TabsContent value="quests">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">Campaign Quests</h2>
                    {!isCreateMode && !canManageQuests && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Enable editing in the Campaign Details tab to modify
                        quests.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => setIsAddingQuest(true)}
                    disabled={!canManageQuests}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Quest
                  </Button>
                </div>

                <QuestList
                  quests={localQuests}
                  onEditQuest={handleEditQuest}
                  onDeleteQuest={handleDeleteQuest}
                  onAddQuest={() => setIsAddingQuest(true)}
                  canManageQuests={canManageQuests}
                />
              </div>
            </TabsContent>
          )}

          {/* Initial Funding Tab (Create Mode) */}
          {isCreateMode && !shouldRestrictToSubmissions && (
            <TabsContent value="funding">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">
                    Initial Campaign Funding
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    Lock UDT tokens to your campaign for quest rewards
                  </p>
                </div>

                <InitialFunding
                  quests={localQuests}
                  signer={signer}
                  onFundingChange={setInitialFunding}
                  onCKBFundingChange={setCkbInitialFunding}
                  initialQuota={localQuests.map(
                    (q: QuestDataLike & { initial_quota?: number }) =>
                      q.initial_quota || 10
                  )}
                />
              </div>
            </TabsContent>
          )}

          {/* Submissions Tab */}
          {!isCreateMode && (
            <TabsContent value="submissions">
              <SubmissionsTab
                campaignTypeId={campaignTypeId as ccc.Hex}
                isStaffReviewer={!isAdmin && hasStaffAccess}
              />
            </TabsContent>
          )}

          {/* Funding Tab */}
          {!isCreateMode && !shouldRestrictToSubmissions && (
            <TabsContent value="funding">
              <FundingTab
                campaignTypeId={campaignTypeId as ccc.Hex}
                initialQuotas={localQuests.map(
                  (q: QuestDataLike & { initial_quota?: number }) =>
                    q.initial_quota || 10
                )}
              />
            </TabsContent>
          )}

          {/* Analytics Tab */}
          {!isCreateMode && !shouldRestrictToSubmissions && (
            <TabsContent value="analytics">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Analytics</CardTitle>
                </CardHeader>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Analytics dashboard coming soon</p>
                    <p className="text-sm mt-2">
                      Track participant progress, completion rates, and
                      engagement metrics
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Quest Dialog */}
      <QuestDialog
        open={isAddingQuest}
        onOpenChange={(open) => {
          setIsAddingQuest(open);
          if (!open) {
            setEditingQuestIndex(null);
          }
        }}
        questForm={questForm}
        onQuestFormChange={setQuestForm}
        onSave={
          editingQuestIndex !== null ? handleSaveEditedQuest : handleAddQuest
        }
        editMode={editingQuestIndex !== null}
        localQuestsLength={localQuests.length}
        onClear={handleClearQuestForm}
      />
    </div>
  );
}
