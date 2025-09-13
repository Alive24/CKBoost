/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Navigation } from "@/components/navigation";
import { useVerification } from "@/lib/hooks/use-verification";
import { ccc } from "@ckb-ccc/connector-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  CheckCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageCircle,
  FileText,
  User,
  Fingerprint,
  Twitter,
  MessageSquare,
} from "lucide-react";
import { StatusAlert } from "@/components/verify/StatusAlert";
import { TelegramWidgetSection } from "@/components/verify/TelegramWidgetSection";
import { VerificationMethodCard } from "@/components/verify/VerificationMethodCard";
import { TelegramVerificationData } from "@/lib/types/verify";
import { useUser } from "@/lib/providers/user-provider";

const VERIFICATION_METHODS = [
  {
    id: "telegram",
    name: "Telegram Verification",
    description: "Link your Telegram account for identity verification",
    icon: MessageCircle,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active Telegram account", "Join verification bot"],
    status: "available",
  },
  {
    id: "twitter",
    name: "X (Twitter) Binding",
    description: "Connect your X (Twitter) account to your wallet",
    icon: Twitter,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active X (Twitter) account"],
    status: "available",
  },
  {
    id: "discord",
    name: "Discord Binding",
    description: "Connect your Discord account to your wallet",
    icon: MessageSquare,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active Discord account"],
    status: "available",
  },
  {
    id: "reddit",
    name: "Reddit Binding",
    description: "Connect your Reddit account to your wallet",
    icon: MessageCircle,
    difficulty: "Easy",
    timeEstimate: "2-5 minutes",
    requirements: ["Active Reddit account"],
    status: "available",
  },
  {
    id: "kyc",
    name: "KYC Verification",
    description: "Complete Know Your Customer verification with ID documents",
    icon: FileText,
    difficulty: "Medium",
    timeEstimate: "10-30 minutes",
    requirements: [
      "Government-issued ID",
      "Proof of address",
      "Selfie verification",
    ],
    status: "available",
  },
  {
    id: "did",
    name: "DID Verification",
    description:
      "Use Decentralized Identity for privacy-preserving verification",
    icon: Fingerprint,
    difficulty: "Advanced",
    timeEstimate: "5-15 minutes",
    requirements: [
      "DID wallet",
      "Verifiable credentials",
      "Technical knowledge",
    ],
    status: "coming_soon",
  },
  {
    id: "manual",
    name: "Manual Review",
    description: "Submit application for human verification review",
    icon: User,
    difficulty: "Variable",
    timeEstimate: "1-3 days",
    requirements: [
      "Detailed application",
      "Supporting evidence",
      "Admin review",
    ],
    status: "available",
  },
];

export default function VerifyIdentity() {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [twitterUsername, setTwitterUsername] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");
  const [redditUsername, setRedditUsername] = useState("");
  const [manualApplication, setManualApplication] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [telegramRedirectData, setTelegramRedirectData] =
    useState<TelegramVerificationData | null>(null);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { userService } = useUser();

  // Get wallet connection
  const { open } = ccc.useCcc();
  const signer = ccc.useSigner();

  // Get wallet address when signer is connected
  useEffect(() => {
    const getAddress = async () => {
      if (signer) {
        try {
          const addr = await signer.getRecommendedAddress();
          setWalletAddress(addr);
        } catch (error) {
          console.error("Failed to get wallet address:", error);
        }
      } else {
        setWalletAddress(null);
      }
    };
    getAddress();
  }, [signer]);

  // Use the verification hook for real verification management
  const {
    verificationStatus,
    isLoading,
    loadVerificationStatus,
  } = useVerification();

  const searchParams = useSearchParams();
  const router = useRouter();

  // Map verification status to the UI format
  const currentUserStatus = verificationStatus
    ? {
        telegram: verificationStatus.telegram,
        twitter: verificationStatus.twitter,
        discord: verificationStatus.discord,
        reddit: verificationStatus.reddit,
        kyc: verificationStatus.kyc,
        did: verificationStatus.did,
        manualReview: verificationStatus.manual_review,
      }
    : {
        telegram: false,
        twitter: false,
        discord: false,
        reddit: false,
        kyc: false,
        did: false,
        manualReview: false,
      };

  // Telegram verification: use Telegram Login widget (no code generation)

  const handleTwitterVerification = async () => {
    setIsSubmitting(true);
    // Keep the card selected during the process
    setSelectedMethod("twitter");

    // Simulate OAuth flow and transaction signing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // This would normally update via the backend
    setJustCompleted("twitter");
    setIsSubmitting(false);

    // Keep the card selected to show success message
    // Auto-hide success message after 5 seconds
    setTimeout(() => {
      setJustCompleted(null);
      setSelectedMethod(null); // Clear selection after success message fades
    }, 5000);
  };

  const handleDiscordVerification = async () => {
    setIsSubmitting(true);
    // Keep the card selected during the process
    setSelectedMethod("discord");

    // Simulate OAuth flow and transaction signing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // This would normally update via the backend
    setJustCompleted("discord");
    setIsSubmitting(false);

    // Keep the card selected to show success message
    // Auto-hide success message after 5 seconds
    setTimeout(() => {
      setJustCompleted(null);
      setSelectedMethod(null); // Clear selection after success message fades
    }, 5000);
  };

  const handleRedditVerification = async () => {
    setIsSubmitting(true);
    // Keep the card selected during the process
    setSelectedMethod("reddit");

    // Simulate OAuth flow and transaction signing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // This would normally update via the backend
    setJustCompleted("reddit");
    setIsSubmitting(false);

    // Keep the card selected to show success message
    // Auto-hide success message after 5 seconds
    setTimeout(() => {
      setJustCompleted(null);
      setSelectedMethod(null); // Clear selection after success message fades
    }, 5000);
  };

  const handleManualSubmission = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    console.log("Manual verification submitted:", manualApplication);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy":
        return "bg-green-100 text-green-800";
      case "Medium":
        return "bg-yellow-100 text-yellow-800";
      case "Advanced":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
      case "coming_soon":
        return "bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100";
    }
  };

  // Parse Telegram redirect params (?source=telegram&...)
  useEffect(() => {
    const source = searchParams?.get("source");
    if (source === "telegram") {
      const id = searchParams.get("id");
      const username = searchParams.get("username") || "";
      const firstName = searchParams.get("first_name") || "";
      const lastName = searchParams.get("last_name") || undefined;
      const photo_url = searchParams.get("photo_url") || undefined;
      const auth_date = searchParams.get("auth_date") || undefined;
      const hash = searchParams.get("hash") || undefined;
      if (id) {
        const redirectData = {
          id,
          username,
          firstName,
          lastName,
          photo_url,
          auth_date,
          hash,
        } as unknown as TelegramVerificationData;
        setTelegramRedirectData(redirectData);
        // Do not keep sensitive params in URL longer than needed
        // Replace URL without query once we've captured data
        const url = new URL(window.location.href);
        url.search = "";
        router.replace(url.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const bindTelegramToWallet = async () => {
    if (!telegramRedirectData) return;
    try {
      setIsSubmitting(true);

      if (!userService) {
        console.error("User service not found");
        return;
      }

      // Server-side validate Telegram payload before binding
      const txHash = await userService.updateTelegramVerification(telegramRedirectData);
      // const resp = await fetch("/api/telegram/authenticate", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     telegram: telegramRedirectData.authData,
      //     tx: txLike || undefined,
      //   }),
      // });
      // if (!resp.ok) {
      //   console.error("Telegram validation failed at server");
      //   return;
      // }
      // const json = await resp.json();
      // if (!json.success) {
      //   console.error("Telegram validation rejected:", json.error);
      //   return;
      // }
      setJustCompleted("telegram");
      setSelectedMethod("telegram");
      setTelegramRedirectData(null);
      await loadVerificationStatus();
    } catch (e) {
      console.error("Failed to bind Telegram to wallet", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🛡️</div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Identity Verification and Bindings
              </h1>
            </div>
            <p className="text-lg text-muted-foreground mb-6">
              Verify your identity to prevent sybil attacks and ensure fair
              reward distribution
            </p>

            {/* Current Status */}
            <StatusAlert currentUserStatus={currentUserStatus} />
            {telegramRedirectData && (
              <div className="mt-4">
                <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                  <MessageCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    Telegram login received for{" "}
                    {telegramRedirectData.username
                      ? `@${telegramRedirectData.username}`
                      : telegramRedirectData.firstName}
                    . Click below to bind it to your connected wallet.
                    <div className="mt-3">
                      <Button
                        onClick={bindTelegramToWallet}
                        disabled={isSubmitting}
                        className="inline-flex"
                      >
                        {isSubmitting
                          ? "Binding..."
                          : "Bind Telegram To Wallet"}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>

          {/* Why Verification Matters */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                Why Identity Verification Matters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Prevents Sybil Attacks</h4>
                  <p className="text-sm text-muted-foreground">
                    Stops users from creating multiple accounts to farm rewards
                    unfairly
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    Fair Reward Distribution
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Ensures legitimate users get their fair share of quest
                    rewards
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Community Trust</h4>
                  <p className="text-sm text-muted-foreground">
                    Builds confidence in the platform's integrity and fairness
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Enhanced Features</h4>
                  <p className="text-sm text-muted-foreground">
                    Access to higher-value quests and exclusive campaigns
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Verification Methods - Split into two groups */}
          <div className="space-y-8 mb-8">
            {/* Identity Verification Section */}
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Shield className="w-6 h-6 text-purple-600" />
                Identity Verification
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {VERIFICATION_METHODS.filter((m) =>
                  ["telegram", "kyc", "did", "manual"].includes(m.id)
                ).map((method) => {
                  const isSelected =
                    selectedMethod === method.id ||
                    (isSubmitting && selectedMethod === method.id) ||
                    justCompleted === method.id;
                  const isDisabled = method.status === "coming_soon";
                  const isCompleted =
                    currentUserStatus[
                      method.id as keyof typeof currentUserStatus
                    ];
                  return (
                    <VerificationMethodCard
                      key={method.id}
                      method={method}
                      isSelected={!!isSelected}
                      isCompleted={!!isCompleted}
                      isDisabled={!!isDisabled}
                      isSubmitting={isSubmitting}
                      justCompletedId={justCompleted}
                      onToggle={() =>
                        setSelectedMethod(isSelected ? null : method.id)
                      }
                      completedDetails={
                        method.id === "telegram" &&
                        verificationStatus?.telegram_data ? (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <div className="text-sm space-y-1">
                              <p className="font-medium text-blue-800 dark:text-blue-200">
                                ✅ Verification Details:
                              </p>
                              {verificationStatus.telegram_data.username && (
                                <p className="text-blue-700 dark:text-blue-300">
                                  <strong>Username:</strong> @
                                  {verificationStatus.telegram_data.username}
                                </p>
                              )}
                              <p className="text-blue-700 dark:text-blue-300">
                                <strong>Verified:</strong>{" "}
                                {new Date(
                                  verificationStatus.telegram_data.verified_at *
                                    1000
                                ).toLocaleString()}
                              </p>
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                                Your Telegram account is now linked to your
                                wallet
                              </p>
                            </div>
                          </div>
                        ) : undefined
                      }
                      getDifficultyColor={getDifficultyColor}
                      getStatusColor={getStatusColor}
                    >
                      {method.id === "telegram" && (
                        <TelegramWidgetSection
                          walletAddress={walletAddress}
                          open={() => {
                            void open();
                          }}
                        />
                      )}
                      {method.id === "kyc" && (
                        <>
                          <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertDescription>
                              KYC verification will redirect you to our secure
                              partner for document verification.
                            </AlertDescription>
                          </Alert>
                          <Button className="w-full">
                            Start KYC Verification
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </Button>
                        </>
                      )}
                      {method.id === "manual" && (
                        <>
                          <div>
                            <Label htmlFor="application">
                              Verification Application
                            </Label>
                            <Textarea
                              id="application"
                              placeholder="Please explain why you should be verified. Include any relevant information about your identity, social media profiles, or community involvement..."
                              value={manualApplication}
                              onChange={(e) =>
                                setManualApplication(e.target.value)
                              }
                              rows={4}
                            />
                          </div>
                          <Button
                            onClick={handleManualSubmission}
                            disabled={!manualApplication.trim() || isSubmitting}
                            className="w-full"
                          >
                            {isSubmitting
                              ? "Submitting..."
                              : "Submit for Manual Review"}
                          </Button>
                        </>
                      )}
                    </VerificationMethodCard>
                  );
                })}
              </div>
            </div>

            {/* Social Media Bindings Section */}
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-blue-600" />
                Social Media Bindings
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {VERIFICATION_METHODS.filter((m) =>
                  ["twitter", "discord", "reddit"].includes(m.id)
                ).map((method) => {
                  const isSelected =
                    selectedMethod === method.id ||
                    (isSubmitting && selectedMethod === method.id) ||
                    justCompleted === method.id;
                  const isDisabled = method.status === "coming_soon";
                  const isCompleted =
                    currentUserStatus[
                      method.id as keyof typeof currentUserStatus
                    ];
                  return (
                    <VerificationMethodCard
                      key={method.id}
                      method={method}
                      isSelected={!!isSelected}
                      isCompleted={!!isCompleted}
                      isDisabled={!!isDisabled}
                      isSubmitting={isSubmitting}
                      justCompletedId={justCompleted}
                      onToggle={() =>
                        setSelectedMethod(isSelected ? null : method.id)
                      }
                      completedDetails={undefined}
                      getDifficultyColor={getDifficultyColor}
                      getStatusColor={getStatusColor}
                    >
                      {method.id === "twitter" && (
                        <>
                          <Alert>
                            <Twitter className="h-4 w-4" />
                            <AlertDescription>
                              You'll be redirected to sign in to X (Twitter),
                              then return here to sign a transaction that
                              connects your account to your wallet.
                            </AlertDescription>
                          </Alert>
                          <Button
                            onClick={handleTwitterVerification}
                            disabled={isSubmitting}
                            className="w-full"
                          >
                            {isSubmitting
                              ? "Connecting..."
                              : "Connect X (Twitter) Account"}
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </Button>
                        </>
                      )}
                      {method.id === "discord" && (
                        <>
                          <Alert>
                            <MessageSquare className="h-4 w-4" />
                            <AlertDescription>
                              You'll be redirected to sign in to Discord, then
                              return here to sign a transaction that connects
                              your account to your wallet.
                            </AlertDescription>
                          </Alert>
                          <Button
                            onClick={handleDiscordVerification}
                            disabled={isSubmitting}
                            className="w-full"
                          >
                            {isSubmitting
                              ? "Connecting..."
                              : "Connect Discord Account"}
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </Button>
                        </>
                      )}
                      {method.id === "reddit" && (
                        <>
                          <Alert>
                            <MessageCircle className="h-4 w-4" />
                            <AlertDescription>
                              You'll be redirected to sign in to Reddit, then
                              return here to sign a transaction that connects
                              your account to your wallet.
                            </AlertDescription>
                          </Alert>
                          <Button
                            onClick={handleRedditVerification}
                            disabled={isSubmitting}
                            className="w-full"
                          >
                            {isSubmitting
                              ? "Connecting..."
                              : "Connect Reddit Account"}
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </Button>
                        </>
                      )}
                    </VerificationMethodCard>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle>Verification Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Privacy Protection</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Your verification data is encrypted and secure</li>
                    <li>• We only store necessary verification status</li>
                    <li>
                      • Personal documents are processed by trusted partners
                    </li>
                    <li>• You can request data deletion at any time</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Verification Benefits</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Access to all quest types and campaigns</li>
                    <li>• Higher reward multipliers for verified users</li>
                    <li>• Priority in limited-slot campaigns</li>
                    <li>• Verified badge on leaderboards</li>
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Need Help?</h4>
                <p className="text-sm text-muted-foreground">
                  If you have questions about the verification process or
                  encounter any issues, please contact our support team or join
                  our community Discord for assistance.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
