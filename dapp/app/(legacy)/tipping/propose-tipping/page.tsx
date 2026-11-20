"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ccc } from "@ckb-ccc/connector-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  TippingInfo,
  TippingProvider,
  useTippingContext,
} from "@/lib/providers/tipping-provider";
import { TippingDataLike } from "ssri-ckboost/types";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useNostrStorage } from "@/hooks/use-nostr-storage";
import { useStorageModal } from "@/lib/providers/storage-modal-provider";
import { CommentListReplaceableKey } from "@/hooks/use-tipping-comments";

export default function ProposeTippingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signer = ccc.useSigner();
  const { updateTipping } = useTippingContext();
  const {
    isConnected: nostrConnected,
    fetchEventById,
    storeEvent,
  } = useNostrStorage();
  const storageModal = useStorageModal();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentUserAllowlisted] = useState(true);
  const [proposerLockHash, setProposerLockHash] = useState<string | null>(null);
  const [proposerAddress, setProposerAddress] = useState<string | null>(null);
  const [tippingTypeId, setTippingTypeId] = useState<string | null>(
    searchParams.get("typeId")
  );
  const [pendingTippingData, setPendingTippingData] =
    useState<TippingDataLike | null>(null);
  const [pendingTippingTypeId, setPendingTippingTypeId] = useState<
    string | null
  >(null);
  const [pendingNeventId, setPendingNeventId] = useState<string | null>(null);
  const typeIdParam = searchParams.get("typeId");

  useEffect(() => {
    if (typeIdParam) {
      setTippingTypeId(typeIdParam);
    }
  }, [typeIdParam]);

  const [recipientInputMode, setRecipientInputMode] = useState<
    "address" | "script"
  >("address");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientLockHash, setRecipientLockHash] = useState("");
  const [resolvedRecipientLockHash, setResolvedRecipientLockHash] =
    useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    contributionTitle: "",
    contributionType: "analysis",
    typeTags: "analysis",
    shortDescription: "",
    longDescription: "",
    ckbAmount: "0",
    pointsAmount: "0",
  });

  useEffect(() => {
    let cancelled = false;

    async function resolveProposerLockHash() {
      if (!signer) {
        setProposerLockHash(null);
        setProposerAddress(null);
        return;
      }

      try {
        const recommended = await signer.getRecommendedAddressObj();
        const lockHash = recommended.script.hash();
        if (!cancelled) {
          setProposerLockHash(lockHash);
          setProposerAddress(recommended.toString() ?? null);
        }
      } catch (error) {
        console.error("Failed to derive proposer lock hash", error);
        if (!cancelled) {
          setProposerLockHash(null);
          setProposerAddress(null);
        }
      }
    }

    resolveProposerLockHash();
    return () => {
      cancelled = true;
    };
  }, [signer]);

  useEffect(() => {
    let cancelled = false;

    const updateRecipientLockHash = async () => {
      if (recipientInputMode === "address") {
        if (!recipientAddress.trim()) {
          if (!cancelled) {
            setResolvedRecipientLockHash("");
            setRecipientError(null);
          }
          return;
        }

        if (!signer) {
          if (!cancelled) {
            setResolvedRecipientLockHash("");
            setRecipientError("Connect wallet to convert address to lock hash");
          }
          return;
        }

        try {
          const address = await ccc.Address.fromString(
            recipientAddress.trim(),
            signer.client
          );
          const hash = address.script.hash();
          if (!cancelled) {
            setResolvedRecipientLockHash(hash);
            setRecipientError(null);
          }
        } catch (error) {
          console.warn("Failed to derive recipient lock hash", error);
          if (!cancelled) {
            setResolvedRecipientLockHash("");
            setRecipientError("Invalid CKB address");
          }
        }
      } else {
        const lockHashValue = recipientLockHash.trim();
        if (!lockHashValue) {
          if (!cancelled) {
            setResolvedRecipientLockHash("");
            setRecipientError(null);
          }
          return;
        }

        const normalized = lockHashValue.startsWith("0x")
          ? lockHashValue
          : `0x${lockHashValue}`;

        if (!LOCK_HASH_REGEX.test(normalized)) {
          if (!cancelled) {
            setResolvedRecipientLockHash("");
            setRecipientError(
              "Lock hash must be a 0x-prefixed 32-byte hex string"
            );
          }
          return;
        }

        if (!cancelled) {
          setResolvedRecipientLockHash(normalized.toLowerCase());
          setRecipientError(null);
        }
      }
    };

    void updateRecipientLockHash();

    return () => {
      cancelled = true;
    };
  }, [recipientInputMode, recipientAddress, recipientLockHash, signer]);

  const creationTimestamp = useMemo(() => BigInt(Date.now()), []);

  const finalizeTippingSubmission = async (tipping?: TippingInfo) => {
    console.debug("📍 About to finalizeTippingSubmission", {
      pendingTippingData,
      tipping,
    });
    try {
      const finalTippingData = pendingTippingData || tipping?.data;

      if (!finalTippingData) {
        throw new Error("Missing tipping data");
      }

      const finalTipping =
        tipping ||
        ({
          data: pendingTippingData,
          metadata: {
            contribution_title: finalTippingData.metadata.contribution_title,
            contribution_type_tags:
              finalTippingData.metadata.contribution_type_tags,
            short_description: finalTippingData.metadata.short_description,
            long_description: finalTippingData.metadata.long_description,
            creation_timestamp: finalTippingData.metadata.creation_timestamp,
          },
          comments: [],
          additionalTips: [],
          status: "created",
        } as TippingInfo);

      console.debug("📍 finalizeTippingSubmission", {
        providedData: tipping,
        hasPendingNevent: !!pendingNeventId,
      });

      const txHash = await updateTipping(finalTipping);

      setPendingTippingData(null);
      setPendingTippingTypeId(null);
      setPendingNeventId(null);

      return txHash;
    } catch (error) {
      console.error("Failed to submit tipping proposal", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to submit tipping proposal"
      );
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentUserAllowlisted) {
      alert("Only allowlisted community members can create tipping proposals.");
      return;
    }

    if (!proposerLockHash) {
      alert(
        "Unable to determine proposer lock hash. Please ensure your wallet is connected."
      );
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      let finalTargetLockHash = resolvedRecipientLockHash;

      if (recipientInputMode === "address") {
        if (recipientError) {
          throw new Error(recipientError);
        }

        if (!finalTargetLockHash) {
          if (!signer) {
            throw new Error(
              "Connect wallet to convert recipient address to lock hash"
            );
          }

          if (!recipientAddress.trim()) {
            throw new Error("Recipient address is required");
          }

          const address = await ccc.Address.fromString(
            recipientAddress.trim(),
            signer.client
          );
          finalTargetLockHash = address.script.hash();
        }
      } else {
        const rawLockHash = recipientLockHash.trim();
        if (!rawLockHash) {
          throw new Error("Recipient lock hash is required");
        }

        const normalizedLockHash = rawLockHash.startsWith("0x")
          ? rawLockHash
          : `0x${rawLockHash}`;

        if (!LOCK_HASH_REGEX.test(normalizedLockHash)) {
          throw new Error(
            "Recipient lock hash must be a 0x-prefixed 32-byte hex string"
          );
        }

        finalTargetLockHash = normalizedLockHash.toLowerCase();
      }

      if (!finalTargetLockHash) {
        throw new Error("Unable to resolve recipient lock hash");
      }

      let longDescriptionForChain = formData.longDescription;
      let commentListReplaceableKey: CommentListReplaceableKey | null = null;

      if (
        longDescriptionForChain &&
        !longDescriptionForChain.startsWith("nevent1") &&
        nostrConnected
      ) {
        const dTag = `ckboost-tipping-${Date.now()}`;
        console.log(
          "Creating empty comments list event for tipping proposal..."
        );
        // Sign dTag with proposer signer
        if (!signer) {
          throw new Error("Signer required to sign dTag");
        }
        const signature = await signer.signMessage(dTag);
        const commentListResponse = await fetch(
          "/api/update-tipping-comments",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "initialize",
              dTag,
              signatureString: signature.signature,
              signatureIdentity: signature.identity,
              signatureSignType: signature.signType,
            }),
          }
        );

        if (commentListResponse.ok && commentListResponse.status == 200) {
          const commentListResult = await commentListResponse.json();
          commentListReplaceableKey = {
            authorPubkey: commentListResult.authorPubkey,
            dTag: commentListResult.dTag,
          };
          console.log(
            "Created empty comment list event for tipping proposal:",
            commentListReplaceableKey.authorPubkey
          );
        } else {
          throw new Error(
            `Failed to create comments list event: ${commentListResponse.statusText}`
          );
        }

        // Step 2: Store long description with reference to comments list (if available)
        const serializedContent = JSON.stringify({
          format: "ckboost-tipping-metadata",
          version: "1.0",
          timestamp: Date.now(),
          metadata: {
            targetLockHash: finalTargetLockHash,
            proposerLockHash,
            contributionTitle: formData.contributionTitle,
            shortDescription: formData.shortDescription,
            typeTags: formData.typeTags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0),
          },
          contentHtml: longDescriptionForChain,
          commentListReplaceableKey,
        });
        console.log("Storing metadata event for tipping proposal...");
        const tags: string[][] = [
          ["type", "ckboost-tipping-metadata"],
          ["client", "ckboost-dapp"],
          ["d", dTag],
        ];
        const metadataEvent = await storeEvent.mutateAsync({
          content: serializedContent,
          tags,
        });
        console.log(
          "Created metadata event for tipping proposal:",
          metadataEvent.neventId
        );
        longDescriptionForChain = metadataEvent.neventId;
        setPendingNeventId(metadataEvent.neventId);
      }

      let ckbAmountRaw = 0n;
      if (formData.ckbAmount && formData.ckbAmount.trim().length > 0) {
        try {
          ckbAmountRaw = parseCkbToShannons(formData.ckbAmount);
        } catch (parseError) {
          throw new Error(
            parseError instanceof Error
              ? parseError.message
              : "Invalid CKB reward amount"
          );
        }
      }
      if (ckbAmountRaw !== 0n && ckbAmountRaw < MIN_CKB_REWARD) {
        throw new Error("CKB reward must be at least 100 CKB or zero");
      }

      const tippingData: TippingDataLike = {
        target_lock_hash: finalTargetLockHash,
        proposer_lock_hash: proposerLockHash,
        supporter_lock_hashes: [],
        metadata: {
          contribution_title: formData.contributionTitle,
          contribution_type_tags: formData.typeTags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
          short_description: formData.shortDescription,
          long_description: longDescriptionForChain,
          creation_timestamp: creationTimestamp,
        },
        rewards: {
          points_amount: formData.pointsAmount
            ? BigInt(formData.pointsAmount)
            : 0n,
          ckb_amount: ckbAmountRaw,
          nft_assets: [],
          udt_assets: [],
        },
        status: "created",
        granted_at: 0n,
      };

      setPendingTippingData(tippingData);
      setPendingTippingTypeId(tippingTypeId);

      if (longDescriptionForChain.startsWith("nevent1") && nostrConnected) {
        storageModal.open({
          neventId: longDescriptionForChain,
          mode: "verifying",
          label: "Tipping Long Description",
          contentHint: "html",
          queueItems: [
            {
              neventId: longDescriptionForChain,
              label: "Tipping Long Description",
            },
          ],
          queueIndex: 0,
          onConfirm: async () =>
            finalizeTippingSubmission({
              data: tippingData,
              comments: [],
              additionalTips: [],
              metadata: tippingData.metadata,
            }),
          onClose: () => {
            setPendingTippingData(null);
            setPendingTippingTypeId(null);
            setPendingNeventId(null);
            setIsSubmitting(false);
          },
        });
        setIsSubmitting(false);
        return;
      }

      await finalizeTippingSubmission({
        data: tippingData,
        comments: [],
        additionalTips: [],
        metadata: tippingData.metadata,
      });
      setPendingTippingData(null);
      setPendingTippingTypeId(null);
      setPendingNeventId(null);
    } catch (error) {
      console.error("Failed to submit tipping proposal", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to submit tipping proposal"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasMeaningfulLongDescription = () => {
    const textContent = formData.longDescription
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, "")
      .trim();
    return textContent.length > 0;
  };

  const isFormValid = () => {
    const hasRecipient =
      !!resolvedRecipientLockHash &&
      ((recipientInputMode === "address" &&
        recipientAddress.trim() !== "" &&
        !recipientError) ||
        (recipientInputMode === "script" &&
          recipientLockHash.trim() !== "" &&
          !recipientError));

    return (
      hasRecipient &&
      formData.contributionTitle &&
      formData.shortDescription &&
      hasMeaningfulLongDescription()
    );
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "analysis":
        return "bg-blue-100 text-blue-800";
      case "tutorial":
        return "bg-green-100 text-green-800";
      case "proposal":
        return "bg-purple-100 text-purple-800";
      case "comment":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const fillTestData = () => {
    const randomSuffix = Math.floor(Math.random() * 1000);
    const mockLockHash = `0x02c93173368ec56f72ec023f63148461b80e7698eddd62cbd9dbe31a13f2b330`;

    setRecipientInputMode("script");
    setRecipientAddress("");
    setRecipientLockHash(mockLockHash);
    setResolvedRecipientLockHash(mockLockHash);
    setRecipientError(null);

    setFormData({
      contributionTitle: `Insightful Community Analysis #${randomSuffix}`,
      contributionType: "analysis",
      typeTags: "analysis, community, research",
      shortDescription:
        "Highlighting tangible outcomes from this week's CKBoost collaboration wave.",
      longDescription:
        "<p><strong>Summary:</strong> We delivered three high-impact assets that unblock new builders.</p><ul><li>Published a step-by-step SDK integration tutorial with code samples.</li><li>Drove a 60-person workshop where 70% shipped working demos.</li><li>Coordinated translation of onboarding docs into three new languages.</li></ul><p>Each deliverable includes reproducible references so the next cohort can ramp instantly.</p>",
      ckbAmount: "1000",
      pointsAmount: "250",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/tipping"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tipping
            </Link>

            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">💰</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Propose Community Tipping
              </h1>
            </div>

            <p className="text-lg text-muted-foreground">
              Submit a tipping proposal for a valuable contribution. Approved
              proposals will draw from the shared protocol funding pool.
            </p>
          </div>

          {/* Allowlist Status */}
          <div className="mb-6">
            {currentUserAllowlisted ? (
              <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-green-800">
                    You&apos;re authorised to propose tipping
                  </div>
                  <div className="text-sm text-green-600">
                    Your proposal will be published for community approval and
                    execution
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <div className="font-medium text-red-800">
                    Authorization required
                  </div>
                  <div className="text-sm text-red-600">
                    Only allowlisted community members can propose tippings
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Propose Tipping Form */}
          <Card>
            <CardHeader>
              <CardTitle>Tipping Details</CardTitle>
              <CardDescription>
                Provide the required metadata and target information for the
                tipping proposal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipientInputMode">
                      Recipient Input Method *
                    </Label>
                    <Select
                      value={recipientInputMode}
                      onValueChange={(value) =>
                        setRecipientInputMode(value as "address" | "script")
                      }
                    >
                      <SelectTrigger id="recipientInputMode">
                        <SelectValue placeholder="Select input method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="address">CKB Address</SelectItem>
                        <SelectItem value="script">Lock Hash</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Choose whether to input a CKB address or lock hash
                      directly.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contributionType">Type *</Label>
                    <select
                      id="contributionType"
                      value={formData.contributionType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contributionType: e.target.value,
                          typeTags: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      required
                    >
                      <option value="analysis">Analysis</option>
                      <option value="tutorial">Tutorial</option>
                      <option value="proposal">Proposal</option>
                      <option value="comment">Comment</option>
                    </select>
                  </div>
                </div>

                {recipientInputMode === "address" && (
                  <div className="space-y-2">
                    <Label htmlFor="recipientAddress">
                      Recipient Address *
                    </Label>
                    <Input
                      id="recipientAddress"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      placeholder="ckt1..."
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      The CKB address of the recipient.
                    </p>
                    {resolvedRecipientLockHash && !recipientError && (
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        Derived lock hash: {resolvedRecipientLockHash}
                      </p>
                    )}
                    {recipientError && (
                      <p className="text-sm text-destructive">
                        {recipientError}
                      </p>
                    )}
                  </div>
                )}

                {recipientInputMode === "script" && (
                  <div className="space-y-2">
                    <Label htmlFor="recipientLockHash">
                      Recipient Lock Hash *
                    </Label>
                    <Input
                      id="recipientLockHash"
                      value={recipientLockHash}
                      onChange={(e) => setRecipientLockHash(e.target.value)}
                      placeholder="0x..."
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      The lock hash of the recipient (32 bytes).
                    </p>
                    {!recipientError && resolvedRecipientLockHash && (
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        Using lock hash: {resolvedRecipientLockHash}
                      </p>
                    )}
                    {recipientError && (
                      <p className="text-sm text-destructive">
                        {recipientError}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Selected type:
                  </span>
                  <Badge className={getTypeColor(formData.contributionType)}>
                    {formData.contributionType}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="typeTags">Additional Tags</Label>
                  <Input
                    id="typeTags"
                    value={formData.typeTags}
                    onChange={(e) =>
                      setFormData({ ...formData, typeTags: e.target.value })
                    }
                    placeholder="analysis, education, community"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contributionTitle">
                    Contribution Title *
                  </Label>
                  <Input
                    id="contributionTitle"
                    value={formData.contributionTitle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        contributionTitle: e.target.value,
                      })
                    }
                    placeholder="Brief title of the contribution"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortDescription">Short Description *</Label>
                  <Textarea
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        shortDescription: e.target.value,
                      })
                    }
                    placeholder="One or two sentence summary"
                    rows={2}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="longDescription">Long Description *</Label>
                  <MarkdownEditor
                    id="longDescription"
                    value={formData.longDescription}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        longDescription: value,
                      })
                    }
                    placeholder="Detailed explanation of the contribution and justification for tipping"
                    height={300}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ckbAmount">CKB Reward</Label>
                    <Input
                      id="ckbAmount"
                      type="number"
                      min="0"
                      step="0.00000001"
                      value={formData.ckbAmount}
                      onChange={(e) =>
                        setFormData({ ...formData, ckbAmount: e.target.value })
                      }
                    />
                  </div>
                </div>

                {submitError && (
                  <div className="text-sm text-destructive">{submitError}</div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    className="flex items-center gap-2"
                    disabled={isSubmitting || !isFormValid()}
                  >
                    {isSubmitting ? "Submitting…" : "Submit Proposal"}
                  </Button>
                  {process.env.NODE_ENV !== "production" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex items-center gap-2"
                      onClick={fillTestData}
                      disabled={isSubmitting}
                    >
                      <Sparkles className="w-4 h-4" />
                      Fill Test Data
                    </Button>
                  )}
                  <a
                    href="https://docs.ckboost.xyz/developer-docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  >
                    Developer docs
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
const SHANNON_FACTOR = 10n ** 8n;
const MIN_CKB_REWARD = 100n * SHANNON_FACTOR;
const LOCK_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

function parseCkbToShannons(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) {
    return 0n;
  }

  const [integerPartRaw, fractionalPartRaw = ""] = trimmed.split(".");

  if (!/^\d+$/.test(integerPartRaw || "0")) {
    throw new Error("Invalid CKB amount");
  }

  if (!/^\d*$/.test(fractionalPartRaw)) {
    throw new Error("Invalid CKB amount");
  }

  if (fractionalPartRaw.length > 8) {
    throw new Error("CKB amount supports up to 8 decimal places");
  }

  const integerPart = BigInt(integerPartRaw || "0");
  const fractionalPartPadded = (fractionalPartRaw || "").padEnd(8, "0");
  const fractionalPart = BigInt(fractionalPartPadded || "0");

  return integerPart * SHANNON_FACTOR + fractionalPart;
}
