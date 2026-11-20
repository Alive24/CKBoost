"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Crown,
  Trophy,
  Medal,
  Award,
  Star,
  RefreshCw,
  Activity,
  Clock,
  Info,
  ArrowRight,
} from "lucide-react";
import { InMemoryLeaderboardCache, LeaderboardService } from "@/lib";
import type {
  LeaderboardEntry,
  LeaderboardStats,
  PointsMintRecord,
} from "@/lib";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { createScopedLogger } from "ssri-ckboost";
import { PageLoading } from "@/components/ui/page-loading";

const log = createScopedLogger("LeaderboardPage");

const formatPoints = (value: string): string => {
  try {
    return BigInt(value).toLocaleString();
  } catch (error) {
    log.warn("Failed to format points value", { value, error });
    return value;
  }
};

const shorten = (value: string, head = 10, tail = 6): string => {
  if (!value || value.length <= head + tail) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const getAvatarLabel = (identifier: string): string => {
  const sanitized = identifier.replace(/^0x/, "");
  const alphanumeric = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  const label = alphanumeric.slice(0, 2) || sanitized.slice(0, 2) || "??";
  return label.toUpperCase();
};

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />;
  if (rank === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <Award className="w-5 h-5 text-purple-500" />;
};

const calculateTotals = (stats: LeaderboardStats | null) => {
  if (!stats) {
    return {
      totalMinted: 0n,
      uniqueRecipients: 0,
      transactionsTracked: 0,
    };
  }

  const totalMinted = stats.mintedTransactions.reduce(
    (acc, record) => acc + BigInt(record.totalMinted),
    0n,
  );

  const recipientHashes = new Set<string>();
  stats.mintedTransactions.forEach((record) => {
    record.recipients.forEach((recipient) => {
      recipientHashes.add(recipient.lockHash.toLowerCase());
    });
  });

  return {
    totalMinted,
    uniqueRecipients: recipientHashes.size,
    transactionsTracked: stats.mintedTransactions.length,
  };
};

const getIdentifier = (entry: LeaderboardEntry): string => {
  return entry.address ?? entry.lockHash;
};

const getRecipientIdentifier = (
  record: PointsMintRecord["recipients"][number],
) => {
  return record.address ?? record.lockHash;
};

export default function Leaderboard() {
  const { client } = ccc.useCcc();
  const signer = ccc.useSigner();
  const {
    protocolCell,
    isLoading: isProtocolLoading,
    error: protocolError,
    userAddress,
  } = useProtocol();

  const cacheRef = useRef(new InMemoryLeaderboardCache());
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [userLockHash, setUserLockHash] = useState<string | null>(null);

  const service = useMemo(() => {
    if (!client || !protocolCell) {
      return null;
    }

    return new LeaderboardService({
      client,
      protocolCell,
      cache: cacheRef.current,
    });
  }, [client, protocolCell]);

  useEffect(() => {
    let cancelled = false;

    const loadLockHash = async () => {
      if (!signer) {
        if (!cancelled) {
          setUserLockHash(null);
        }
        return;
      }

      try {
        const addressObj = await signer.getRecommendedAddressObj();
        const hash = addressObj.script.hash().toLowerCase();
        if (!cancelled) {
          setUserLockHash(hash);
        }
      } catch (err) {
        log.warn("Failed to derive user lock hash", err);
        if (!cancelled) {
          setUserLockHash(null);
        }
      }
    };

    loadLockHash();

    return () => {
      cancelled = true;
    };
  }, [signer]);

  useEffect(() => {
    if (!service) {
      return;
    }

    let cancelled = false;

    const loadStats = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await service.collectLeaderboardStats();
        if (!cancelled) {
          setStats(result);
          setLastUpdated(new Date());
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load leaderboard";
        log.error("Leaderboard load failed", err);
        if (!cancelled) {
          setError(message);
          setStats(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [service]);

  const handleRefresh = useCallback(async () => {
    if (!service) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      const result = await service.collectLeaderboardStats();
      setStats(result);
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh leaderboard";
      log.error("Leaderboard refresh failed", err);
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [service]);

  const leaderboardEntries = useMemo(() => stats?.totals ?? [], [stats]);

  const leaderboardTop = useMemo(
    () => leaderboardEntries.slice(0, 10),
    [leaderboardEntries],
  );

  const recentTransactions = useMemo(() => {
    if (!stats) {
      return [] as PointsMintRecord[];
    }

    return [...stats.mintedTransactions].reverse().slice(0, 5);
  }, [stats]);

  const totalsSummary = useMemo(() => calculateTotals(stats), [stats]);

  const participantCount = leaderboardEntries.length;
  const protocolUnavailable = !protocolCell && !isProtocolLoading;
  const combinedError = error ?? (protocolUnavailable ? protocolError : null);
  const isInitialLoading = !stats && (isLoading || isProtocolLoading);

  const currentUserIndex = useMemo(() => {
    if (!leaderboardEntries.length) {
      return -1;
    }

    const addressLower = userAddress?.toLowerCase();
    const lockLower = userLockHash?.toLowerCase();

    return leaderboardEntries.findIndex((entry) => {
      if (addressLower && entry.address?.toLowerCase() === addressLower) {
        return true;
      }
      if (lockLower && entry.lockHash.toLowerCase() === lockLower) {
        return true;
      }
      return false;
    });
  }, [leaderboardEntries, userAddress, userLockHash]);

  const currentUserEntry =
    currentUserIndex >= 0 ? leaderboardEntries[currentUserIndex] : null;

  const currentUserRank = currentUserEntry ? currentUserIndex + 1 : null;
  const currentUserPoints = currentUserEntry
    ? formatPoints(currentUserEntry.totalMinted)
    : "0";
  const currentUserLabel = currentUserEntry
    ? shorten(getIdentifier(currentUserEntry), 14, 6)
    : userAddress
      ? shorten(userAddress, 14, 6)
      : "Wallet not connected";

  if (isInitialLoading) {
    return (
      <PageLoading
        title="Loading Leaderboard"
        description="Aggregating live Points minting stats from CKBoost validators."
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
      {/* CKBoost Logo Floating Background */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{
          zIndex: 1,
        }}
      >
        <img
          src="/assets/branding/CKBoost Logo Floating Background.svg"
          alt="CKBoost Logo"
          style={{
            position: "absolute",
            top: "0%",
            right: "-10%",
            width: "40vw",
            height: "auto",
            maxWidth: "900px",
            imageRendering: "pixelated",
            opacity: 1,
            transform: "translateX(-20%)",
          }}
        />
      </div>
      <main
        className="container mx-auto px-4 py-8 relative"
        style={{ zIndex: 10 }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h1
                className="text-4xl font-bold text-gray-900 dark:text-white"
                style={{
                  fontFamily: "Pixellari, monospace",
                }}
              >
                Leaderboard
              </h1>
            </div>
          </div>

          {combinedError && (
            <div className="relative w-full justify-self-center mb-8">
              {/* Four corner square indents - aligned with card border corners */}
              <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
              <div
                className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                style={{
                  borderLeft: "3px solid #535353",
                }}
              />
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                style={{
                  borderTop: "3px solid #535353",
                  borderLeft: "3px solid #535353",
                }}
              />
              <div
                className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                style={{
                  borderTop: "3px solid #535353",
                }}
              />
              <Card className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none">
                <CardContent className="py-4">
                  <div className="text-sm text-red-700 dark:text-red-200">
                    {combinedError}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="relative w-full justify-self-center">
                {/* Four corner square indents - aligned with card border corners */}
                <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
                <div
                  className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                  }}
                />
                <Card className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none">
                  <CardContent className="p-0">
                    <div
                      className="relative w-full h-full px-9 py-6 flex items-center justify-between"
                      style={{
                        background:
                          "linear-gradient(90deg, #1A4DFF 0%, #B72BFF 100%)",
                      }}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-white">
                          <Star className="w-5 h-5" />
                          <span className="text-[22px] font-medium">
                            Your Position
                          </span>
                        </div>

                        {isInitialLoading ? (
                          <div className="h-10 w-64 rounded-lg bg-white/10 animate-pulse" />
                        ) : !userAddress ? (
                          <div className="flex flex-col gap-1 text-sm text-white">
                            <span className="font-semibold">
                              Wallet not connected
                            </span>
                            <span className="text-[#C3C2FF]">
                              Connect your wallet to track your Points minting
                              progress.
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="text-2xl font-bold text-white">
                                #{currentUserRank}
                              </div>
                              <div>
                                <div className="font-medium text-white">
                                  {currentUserLabel}
                                </div>
                                <div className="text-sm text-white/70">
                                  {currentUserPoints} points minted
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        <Button className="bg-white hover:bg-gray-100 dark:bg-black dark:hover:bg-black/80 text-black dark:text-white rounded-full px-6 h-10 text-[15px] font-medium flex items-center gap-2 border-0">
                          {currentUserEntry ? "View Details" : "Get Started!"}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="relative w-full justify-self-center">
                {/* Four corner square indents - aligned with card border corners */}
                <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
                <div
                  className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                  }}
                />
                <Card className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none">
                  <CardHeader className="flex flex-row space-y-0 items-center justify-between gap-4 pb-4 border-gray-300 dark:border-[#3a3a3a] bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                      <Star className="w-5 h-5 text-purple-500" />
                      <CardTitle className="text-lg">Top Performers</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                      {stats?.lastProcessedBlock && (
                        <span className="text-xs text-[#696969]">
                          Last block tracked: #{stats.lastProcessedBlock}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleRefresh}
                        disabled={!service || isRefreshing || isLoading}
                        className="h-10 w-10 rounded-full bg-gray-300 hover:bg-gray-400 dark:bg-[#585858] dark:hover:bg-[#6a6a6a] border-0 text-gray-900 dark:text-white flex items-center justify-center"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${
                            isRefreshing ? "animate-spin" : ""
                          }`}
                        />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4 bg-[#F2FAF4] dark:bg-[#1b1b1b]">
                    {isInitialLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <div
                            key={index}
                            className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : leaderboardTop.length === 0 ? (
                      <div className="text-sm text-gray-600 dark:text-muted-foreground">
                        No Points mints recorded yet.
                      </div>
                    ) : (
                      leaderboardTop.map((entry, index) => {
                        const rank = index + 1;
                        const identifier = getIdentifier(entry);
                        const displayName = shorten(identifier, 16, 6);
                        const lockLabel = shorten(entry.lockHash, 14, 6);
                        const mintedPoints = formatPoints(entry.totalMinted);
                        const isTopThree = rank <= 3;

                        return (
                          <div
                            key={`${entry.lockHash}-${rank}`}
                            className={`flex items-center justify-between px-6 py-4 rounded-[14px] border ${
                              isTopThree
                                ? "bg-green-100 dark:bg-[#002725] border-green-300 dark:border-[#008b76]"
                                : "bg-white dark:bg-black border-gray-300 dark:border-[#3a3a3a]"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex items-center justify-center w-10 h-10">
                                {getRankIcon(rank)}
                              </div>
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-gradient-to-r from-purple-500 to-blue-500 text-white">
                                  {getAvatarLabel(identifier)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white text-[16px]">
                                  {displayName}
                                </div>
                                <div className="text-xs text-[#696969] dark:text-[#696969]">
                                  Lock: {lockLabel}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[28px] leading-tight font-semibold text-gray-900 dark:text-white">
                                {mintedPoints}
                              </div>
                              <div className="text-[13px] text-[#696969] dark:text-[#696969]">
                                Points minted
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-6">
              <div className="relative w-full justify-self-center">
                {/* Four corner square indents - aligned with card border corners */}
                <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
                <div
                  className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                  }}
                />
                <Card className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none">
                  <CardHeader className="flex items-center gap-2 border-0 text-gray-900 dark:text-white">
                    <Activity className="w-5 h-5 text-green-600" />
                    <CardTitle>Leaderboard Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-muted-foreground">
                        Total Points minted
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatPoints(totalsSummary.totalMinted.toString())}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-muted-foreground">
                        Unique recipients
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {totalsSummary.uniqueRecipients}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-muted-foreground">
                        Transactions tracked
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {totalsSummary.transactionsTracked}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-muted-foreground">
                        Participants ranked
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {participantCount}
                      </span>
                    </div>
                    {lastUpdated && (
                      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-muted-foreground pt-2 border-t border-gray-300 dark:border-gray-700">
                        <span>Last updated</span>
                        <span>{lastUpdated.toLocaleTimeString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="relative w-full justify-self-center">
                {/* Four corner square indents - aligned with card border corners */}
                <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
                <div
                  className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                  }}
                />
                <Card className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none">
                  <CardHeader className="flex items-center gap-2 bg-[#F2FAF4] dark:bg-[#1b1b1b] border-0 text-gray-900 dark:text-white">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <CardTitle>Recent Minting Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isInitialLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={index}
                            className="h-20 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : recentTransactions.length === 0 ? (
                      <div className="text-sm text-gray-600 dark:text-muted-foreground">
                        No minting transactions found yet.
                      </div>
                    ) : (
                      recentTransactions.map((record) => {
                        const topRecipients = record.recipients.slice(0, 3);
                        const extraRecipients =
                          record.recipients.length - topRecipients.length;

                        return (
                          <div
                            key={record.txHash}
                            className="p-4 rounded-lg border border-gray-300 dark:border-[#535353] bg-white dark:bg-[#1b1b1b]"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                Tx {shorten(record.txHash, 10, 6)}
                              </span>
                              <span className="text-xs text-gray-600 dark:text-muted-foreground">
                                Block{" "}
                                {record.blockNumber
                                  ? `#${record.blockNumber}`
                                  : "Pending"}
                              </span>
                            </div>
                            <div className="text-sm mb-2 text-gray-900 dark:text-white">
                              Total minted:{" "}
                              <span className="font-semibold">
                                {formatPoints(record.totalMinted)} points
                              </span>
                            </div>
                            <div className="space-y-1 text-xs">
                              {topRecipients.length === 0 ? (
                                <div className="text-gray-600 dark:text-muted-foreground">
                                  No recipients recorded.
                                </div>
                              ) : (
                                topRecipients.map((recipient, idx) => (
                                  <div
                                    key={`${record.txHash}-${recipient.lockHash}-${idx}`}
                                    className="flex items-center justify-between text-gray-600 dark:text-muted-foreground"
                                  >
                                    <span>
                                      {shorten(
                                        getRecipientIdentifier(recipient),
                                        14,
                                        6,
                                      )}
                                    </span>
                                    <span className="font-medium text-gray-900 dark:text-foreground">
                                      {formatPoints(recipient.mintedAmount)} pts
                                    </span>
                                  </div>
                                ))
                              )}
                              {extraRecipients > 0 && (
                                <div className="text-[11px] text-gray-600 dark:text-muted-foreground">
                                  + {extraRecipients} more recipient
                                  {extraRecipients > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="relative w-full justify-self-center">
                {/* Four corner square indents - aligned with card border corners */}
                <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
                <div
                  className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                    borderLeft: "3px solid #535353",
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                  style={{
                    borderTop: "3px solid #535353",
                  }}
                />
                <Card className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none">
                  <CardHeader className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Info className="w-5 h-5 text-blue-600" />
                    <CardTitle>Rules & Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-gray-600 dark:text-muted-foreground">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                        Points Overview
                      </h4>
                      <ul className="space-y-1">
                        <li>
                          • Points are minted when quests are approved by
                          campaign managers.
                        </li>
                        <li>
                          • Each minting transaction is tracked on-chain and
                          linked to recipient lock scripts.
                        </li>
                        <li>
                          • Leaderboard positions update automatically as new
                          Points are minted.
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                        Ranking Tips
                      </h4>
                      <ul className="space-y-1">
                        <li>
                          • Complete verified quests regularly to increase your
                          Points total.
                        </li>
                        <li>
                          • Stay connected to retain eligibility for rewards and
                          snapshots.
                        </li>
                        <li>
                          • Monitor minting activity to spot trending campaigns.
                        </li>
                      </ul>
                    </div>

                    <div className="text-xs pt-3 border-t border-gray-300 dark:border-gray-700">
                      Last processed block: {stats?.lastProcessedBlock ?? "—"}.
                      Leaderboard data refreshes whenever new Points cells are
                      detected.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Rabbit Background at bottom - Three rabbits */}
      <div
        className="fixed bottom-0 left-0 right-0 overflow-hidden pointer-events-none"
        style={{
          zIndex: 1,
          height: "400px",
        }}
      >
        {/* First rabbit - left */}
        <img
          src="/assets/branding/Rabbit - Background.svg"
          alt="Rabbit Background 1"
          className="hidden dark:block"
          style={{
            position: "absolute",
            bottom: "100px",
            left: "10%",
            width: "auto",
            height: "200px",
            maxHeight: "35vh",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
          }}
        />
        <img
          src="/assets/branding/Rabbit - Background  - Inverted.svg"
          alt="Rabbit Background 1 Inverted"
          className="block dark:hidden"
          style={{
            position: "absolute",
            bottom: "100px",
            left: "10%",
            width: "auto",
            height: "200px",
            maxHeight: "35vh",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
          }}
        />
        {/* Second rabbit - center */}
        <img
          src="/assets/branding/Rabbit - Background.svg"
          alt="Rabbit Background 2"
          className="hidden dark:block"
          style={{
            position: "absolute",
            bottom: "80px",
            left: "30%",
            width: "auto",
            height: "350px",
            maxHeight: "55vh",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
          }}
        />
        <img
          src="/assets/branding/Rabbit - Background  - Inverted.svg"
          alt="Rabbit Background 2 Inverted"
          className="block dark:hidden"
          style={{
            position: "absolute",
            bottom: "80px",
            left: "30%",
            width: "auto",
            height: "350px",
            maxHeight: "55vh",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
          }}
        />
        {/* Third rabbit - right */}
        <img
          src="/assets/branding/Rabbit - Background.svg"
          alt="Rabbit Background 3"
          className="hidden dark:block"
          style={{
            position: "absolute",
            bottom: "60px",
            right: "15%",
            width: "auto",
            height: "150px",
            maxHeight: "25vh",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
          }}
        />
        <img
          src="/assets/branding/Rabbit - Background  - Inverted.svg"
          alt="Rabbit Background 3 Inverted"
          className="block dark:hidden"
          style={{
            position: "absolute",
            bottom: "60px",
            right: "15%",
            width: "auto",
            height: "150px",
            maxHeight: "25vh",
            imageRendering: "pixelated",
            opacity: 1,
            filter:
              "drop-shadow(0 -6px 0 #2A21F8) drop-shadow(0 6px 0 #F426FC)",
          }}
        />
      </div>
    </div>
  );
}
