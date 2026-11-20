"use client";

import { useMemo, useState } from "react";
import { CampaignCard } from "@/components/campaign-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, Star, X } from "lucide-react";
import Link from "next/link";
import {
  getDerivedStatus,
  useCampaigns,
  cellToCampaignDisplay,
  type CampaignDisplay,
} from "@/lib";
import { useProtocol } from "@/lib/providers/protocol-provider";
import { createScopedLogger } from "ssri-ckboost";
import { PageLoading } from "@/components/ui/page-loading";
import { PixelLogo } from "@/components/pixel-logo";

const log = createScopedLogger("HomePage");

export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>(
    [],
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedEndorsers, setSelectedEndorsers] = useState<string[]>([]);
  const [excludeExpired, setExcludeExpired] = useState(false);

  // Use campaign provider
  const {
    campaigns: campaignCells,
    featuredCampaigns: featuredCells,
    isLoading,
    error,
  } = useCampaigns();
  const { endorserResolver } = useProtocol();

  // Convert Cell data to display format
  const campaigns = campaignCells
    .map((cell) => {
      try {
        return cellToCampaignDisplay(cell, { endorserResolver });
      } catch (err) {
        log.error("Failed to convert campaign cell:", err);
        return null;
      }
    })
    .filter((c): c is CampaignDisplay => c !== null);

  const featuredCampaigns = featuredCells
    .map((cell) => {
      try {
        return cellToCampaignDisplay(cell, { endorserResolver });
      } catch (err) {
        log.error("Failed to convert featured campaign cell:", err);
        return null;
      }
    })
    .filter((c): c is CampaignDisplay => c !== null)
    .filter((campaign) => !campaign.isExpired);

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedDifficulties.length > 0 ||
    selectedCategories.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedEndorsers.length > 0 ||
    excludeExpired;

  const filteredCampaigns = campaigns.filter((campaign) => {
    // If no filters are active, exclude featured campaigns from "All Campaigns" section
    if (
      !hasActiveFilters &&
      featuredCampaigns.some((fc) => fc.id === campaign.id)
    ) {
      return false;
    }

    const matchesSearch =
      campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.shortDescription
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const matchesDifficulty =
      selectedDifficulties.length === 0 ||
      selectedDifficulties.includes(campaign.difficulty.toLowerCase());
    const matchesCategory =
      selectedCategories.length === 0 ||
      campaign.categories.some((cat) =>
        selectedCategories.includes(cat.toLowerCase()),
      );

    // Handle status filter with derived status
    const derivedStatus = getDerivedStatus(campaign);
    const matchesStatus =
      selectedStatuses.length === 0 || selectedStatuses.includes(derivedStatus);
    const matchesEndorser =
      selectedEndorsers.length === 0 ||
      (campaign.endorserLockHash &&
        selectedEndorsers.includes(campaign.endorserLockHash));
    const matchesExpiration = !excludeExpired || !campaign.isExpired;

    return (
      matchesSearch &&
      matchesDifficulty &&
      matchesCategory &&
      matchesStatus &&
      matchesEndorser &&
      matchesExpiration
    );
  });

  const allCategories = Array.from(
    new Set(campaigns.flatMap((c) => c.categories)),
  );
  const endorserOptions = useMemo(() => {
    const mapping = new Map<string, { lockHash: string; name: string }>();
    campaigns.forEach((campaign) => {
      if (!campaign.endorserLockHash) {
        return;
      }
      if (!mapping.has(campaign.endorserLockHash)) {
        mapping.set(campaign.endorserLockHash, {
          lockHash: campaign.endorserLockHash,
          name:
            campaign.endorser?.name ||
            campaign.endorserName ||
            campaign.endorserLockHash,
        });
      }
    });
    return Array.from(mapping.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [campaigns]);

  const noCampaignsLoaded =
    !isLoading && campaigns.length === 0 && featuredCampaigns.length === 0;

  // Handle loading and empty dataset states
  if (isLoading || noCampaignsLoaded) {
    return (
      <PageLoading
        title="Loading Campaigns"
        description="Fetching the latest CKBoost campaigns and featured quests."
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {" "}
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-red-500 text-xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold mb-2">
                Failed to Load Campaigns
              </h2>
              <p className="text-gray-900 dark:text-muted-foreground mb-4">
                {error}
              </p>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const scrollToAllCampaigns = () => {
    const allCampaignsSection = document.getElementById("all-campaigns");
    if (allCampaignsSection) {
      allCampaignsSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleCategoryClick = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
    // Scroll to filtered results after a brief delay to allow state update
    setTimeout(() => scrollToAllCampaigns(), 100);
  };

  const handleDifficultyClick = (difficulty: string) => {
    if (selectedDifficulties.includes(difficulty)) {
      setSelectedDifficulties(
        selectedDifficulties.filter((d) => d !== difficulty),
      );
    } else {
      setSelectedDifficulties([...selectedDifficulties, difficulty]);
    }
    setTimeout(() => scrollToAllCampaigns(), 100);
  };

  const handleStatusClick = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter((s) => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
    setTimeout(() => scrollToAllCampaigns(), 100);
  };

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
          {/* Hero Section */}
          <div className="mb-12">
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-10 mx-auto px-4 w-fit">
              {/* Left: Pixel Art Logo */}
              <div className="flex-shrink-0 w-full md:w-auto">
                <PixelLogo className="w-full max-w-xs md:max-w-sm mx-auto md:mx-0" />
              </div>

              {/* Right: Text and Buttons */}
              <div className="text-center md:text-left space-y-6 w-full md:w-auto">
                <p className="text-base md:text-lg text-gray-900 dark:text-white leading-relaxed max-w-md mx-auto md:mx-0 font-sans antialiased">
                  Join campaigns, complete quests, and earn rewards while
                  contributing to the CKB ecosystem. Build your reputation and
                  grow with the community.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                  <Link href="/dashboard" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto bg-[#00FF99] hover:bg-[#00E687] active:bg-[#00CC6F] text-[#2A2A2A] font-medium rounded-full px-6 py-2.5 text-sm transition-colors duration-200 border-0 shadow-none cursor-pointer">
                      View My Progress
                    </button>
                  </Link>
                  <Link href="/docs" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto bg-white/90 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 text-[#0000FF] dark:text-white font-medium rounded-full px-6 py-2.5 text-sm transition-colors duration-200 border border-[#0000FF] dark:border-white/30 shadow-none cursor-pointer">
                      Read the Docs
                    </button>
                  </Link>
                  <Link href="/leaderboard" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto bg-[#FF4D00] hover:bg-[#E64500] active:bg-[#CC3D00] dark:bg-[#3300FF] dark:hover:bg-[#2A00CC] dark:active:bg-[#220099] text-white font-medium rounded-full px-6 py-2.5 text-sm transition-colors duration-200 border-0 shadow-none cursor-pointer">
                      View Leaderboard
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Featured Campaigns */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-[#0000FF] dark:text-white"
                style={{
                  fontFamily: "Pixellari, monospace",
                  fontSize: "37px",
                  lineHeight: "165%",
                  fontWeight: 500,
                  fontStyle: "normal",
                  textTransform: "none",
                  letterSpacing: "normal",
                  WebkitFontSmoothing: "none",
                  textRendering: "optimizeSpeed",
                }}
              >
                Featured Campaigns
              </h2>
              <Badge
                variant="outline"
                className="bg-black text-white dark:bg-gray-800 dark:text-white"
              >
                {featuredCampaigns.length} featured
              </Badge>
            </div>

            {featuredCampaigns.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-muted-foreground">
                No featured campaigns are available right now. Check back soon!
              </p>
            ) : (
              <>
                {/* Mobile horizontal slider */}
                <div className="md:hidden -mx-4 px-4">
                  <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4">
                    {featuredCampaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="snap-start flex-shrink-0"
                        style={{
                          width: "min(420px, calc(100vw - 64px))",
                        }}
                      >
                        <CampaignCard
                          campaign={{
                            ...campaign,
                            status: getDerivedStatus(campaign),
                          }}
                          onCategoryClick={handleCategoryClick}
                          onDifficultyClick={handleDifficultyClick}
                          onStatusClick={handleStatusClick}
                          selectedCategories={selectedCategories}
                          selectedDifficulties={selectedDifficulties}
                          selectedStatuses={selectedStatuses}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop grid */}
                <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 justify-items-center">
                  {featuredCampaigns.map((campaign) => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={{
                        ...campaign,
                        status: getDerivedStatus(campaign),
                      }}
                      onCategoryClick={handleCategoryClick}
                      onDifficultyClick={handleDifficultyClick}
                      onStatusClick={handleStatusClick}
                      selectedCategories={selectedCategories}
                      selectedDifficulties={selectedDifficulties}
                      selectedStatuses={selectedStatuses}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Search and Filters */}
          <div className="mb-8 space-y-4">
            <div className="relative w-full">
              {/* Four corner square indents - aligned with card border corners */}
              {/* Top-left */}
              <div className="absolute top-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 border-r-1 shadow-none border-[#535353] dark:border-[#535353]" />
              {/* Top-right: left border (inset) */}
              <div
                className="absolute top-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 border-b-1 shadow-none border-[#535353] dark:border-[#535353]"
                style={{
                  borderLeft: "3px solid #535353",
                }}
              />
              {/* Bottom-right: top and left border (inset) */}
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-white dark:bg-black z-20 shadow-none border-[#535353] dark:border-[#535353]"
                style={{
                  borderTop: "3px solid #535353",
                  borderLeft: "3px solid #535353",
                }}
              />
              {/* Bottom-left: top border (inset) */}
              <div
                className="absolute bottom-0 left-0 w-4 h-4 bg-white dark:bg-black z-20 border-r-1 shadow-none border-[#535353] dark:border-[#535353]"
                style={{
                  borderTop: "3px solid #535353",
                }}
              />
              <Card
                className="overflow-hidden flex flex-col h-full w-full bg-[#F2FAF4] dark:bg-[#1b1b1b] border border-[#535353] dark:border-[#535353] border-r-3 border-b-3 border-[#535353] dark:border-[#535353] border-t-1 border-l-1 relative z-10 shadow-none"
                style={{
                  borderRadius: "8px",
                }}
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-gray-900 dark:text-white" />
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      Search & Filter All Campaigns
                    </h3>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search Campaigns..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-white dark:bg-black border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    />
                  </div>

                  <div className="space-y-4">
                    {/* Difficulty Filter */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
                          Difficulty:
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedDifficulties([])}
                          className={`h-auto p-1 text-xs text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white ${selectedDifficulties.length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Clear
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["beginner", "easy", "medium", "advanced"].map(
                          (level) => {
                            const isSelected =
                              selectedDifficulties.includes(level);
                            return (
                              <Badge
                                key={level}
                                variant="outline"
                                className={`cursor-pointer px-3 py-1 text-sm transition-all hover:opacity-80 ${
                                  isSelected
                                    ? "!bg-black !text-white !border-black dark:!bg-white/10 dark:!text-white dark:!border-white"
                                    : "!bg-transparent !text-black !border-black dark:!bg-transparent dark:!text-white dark:!border-[#3A3A3A]"
                                }`}
                                style={{
                                  borderRadius: "79px",
                                }}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedDifficulties(
                                      selectedDifficulties.filter(
                                        (d) => d !== level,
                                      ),
                                    );
                                  } else {
                                    setSelectedDifficulties([
                                      ...selectedDifficulties,
                                      level,
                                    ]);
                                  }
                                }}
                              >
                                {level.charAt(0).toUpperCase() + level.slice(1)}
                              </Badge>
                            );
                          },
                        )}
                      </div>
                    </div>

                    {/* Category Filter */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
                          Category:
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedCategories([])}
                          className={`h-auto p-1 text-xs text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white ${selectedCategories.length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Clear
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((category) => {
                          const isSelected = selectedCategories.includes(
                            category.toLowerCase(),
                          );
                          return (
                            <Badge
                              key={category}
                              variant="outline"
                              className={`cursor-pointer px-3 py-1 text-sm transition-all hover:opacity-80 ${
                                isSelected
                                  ? "!bg-black !text-white !border-black dark:!bg-white/10 dark:!text-white dark:!border-white"
                                  : "!bg-transparent !text-black !border-black dark:!bg-transparent dark:!text-white dark:!border-[#3A3A3A]"
                              }`}
                              style={{
                                borderRadius: "79px",
                              }}
                              onClick={() => {
                                const categoryLower = category.toLowerCase();
                                if (isSelected) {
                                  setSelectedCategories(
                                    selectedCategories.filter(
                                      (c) => c !== categoryLower,
                                    ),
                                  );
                                } else {
                                  setSelectedCategories([
                                    ...selectedCategories,
                                    categoryLower,
                                  ]);
                                }
                              }}
                            >
                              {category}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {/* Endorser Filter */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
                          Endorser:
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEndorsers([])}
                          className={`h-auto p-1 text-xs text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white ${selectedEndorsers.length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Clear
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {endorserOptions.length === 0 ? (
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            No endorsers available
                          </span>
                        ) : (
                          endorserOptions.map((endorser) => {
                            const isSelected = selectedEndorsers.includes(
                              endorser.lockHash,
                            );
                            return (
                              <Badge
                                key={endorser.lockHash}
                                variant="outline"
                                className={`cursor-pointer px-3 py-1 text-sm transition-all hover:opacity-80 ${
                                  isSelected
                                    ? "!bg-black !text-white !border-black dark:!bg-white/10 dark:!text-white dark:!border-white"
                                    : "!bg-transparent !text-black !border-black dark:!bg-transparent dark:!text-white dark:!border-[#3A3A3A]"
                                }`}
                                style={{
                                  borderRadius: "79px",
                                }}
                                onClick={() => {
                                  setSelectedEndorsers((prev) =>
                                    isSelected
                                      ? prev.filter(
                                          (hash) => hash !== endorser.lockHash,
                                        )
                                      : [...prev, endorser.lockHash],
                                  );
                                  setTimeout(() => scrollToAllCampaigns(), 100);
                                }}
                              >
                                {endorser.name}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
                          Status:
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedStatuses([])}
                          className={`h-auto p-1 text-xs text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white ${selectedStatuses.length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Clear
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["active", "ending-soon", "upcoming", "completed"].map(
                          (status) => {
                            const isSelected =
                              selectedStatuses.includes(status);
                            return (
                              <Badge
                                key={status}
                                variant="outline"
                                className={`cursor-pointer px-3 py-1 text-sm transition-all hover:opacity-80 ${
                                  isSelected
                                    ? "!bg-black !text-white !border-black dark:!bg-white/10 dark:!text-white dark:!border-white"
                                    : "!bg-transparent !text-black !border-black dark:!bg-transparent dark:!text-white dark:!border-[#3A3A3A]"
                                }`}
                                style={{
                                  borderRadius: "79px",
                                }}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedStatuses(
                                      selectedStatuses.filter(
                                        (s) => s !== status,
                                      ),
                                    );
                                  } else {
                                    setSelectedStatuses([
                                      ...selectedStatuses,
                                      status,
                                    ]);
                                  }
                                }}
                              >
                                {status.charAt(0).toUpperCase() +
                                  status.slice(1)}
                              </Badge>
                            );
                          },
                        )}
                      </div>
                    </div>

                    {/* Expiration Filter */}
                    <div className="inline-flex w-fit items-center gap-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2 bg-white/50 dark:bg-transparent">
                      <Switch
                        checked={excludeExpired}
                        onCheckedChange={(checked) => {
                          setExcludeExpired(checked);
                          setTimeout(() => scrollToAllCampaigns(), 100);
                        }}
                        aria-label="Toggle to hide expired campaigns"
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700 dark:text-muted-foreground">
                          Exclude expired events
                        </p>
                        <p className="text-xs text-gray-600 dark:text-muted-foreground">
                          Hide campaigns whose quests have ended.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* All Campaigns */}
          <div id="all-campaigns" className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-[#0000FF] dark:text-white text-2xl font-bold "
                style={{
                  fontFamily: "Pixellari, monospace",
                  lineHeight: "165%",
                  fontWeight: 500,
                  fontStyle: "normal",
                  textTransform: "none",
                  letterSpacing: "normal",
                  WebkitFontSmoothing: "none",
                  textRendering: "optimizeSpeed",
                }}
              >
                {hasActiveFilters ? "Filtered Campaigns" : "Other Campaigns"}
              </h2>
              <Badge
                variant="outline"
                className="bg-black text-white dark:bg-gray-800 dark:text-white"
              >
                {filteredCampaigns.length} campaigns
              </Badge>
            </div>

            {filteredCampaigns.length > 0 && (
              <>
                {/* Mobile slider */}
                <div className="md:hidden -mx-4 px-4">
                  <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4">
                    {filteredCampaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="snap-start flex-shrink-0"
                        style={{
                          width: "min(420px, calc(100vw - 64px))",
                        }}
                      >
                        <CampaignCard
                          campaign={{
                            ...campaign,
                            status: getDerivedStatus(campaign),
                          }}
                          onCategoryClick={handleCategoryClick}
                          onDifficultyClick={handleDifficultyClick}
                          onStatusClick={handleStatusClick}
                          selectedCategories={selectedCategories}
                          selectedDifficulties={selectedDifficulties}
                          selectedStatuses={selectedStatuses}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop grid */}
                <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 justify-items-center">
                  {filteredCampaigns.map((campaign) => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={{
                        ...campaign,
                        status: getDerivedStatus(campaign),
                      }}
                      onCategoryClick={handleCategoryClick}
                      onDifficultyClick={handleDifficultyClick}
                      onStatusClick={handleStatusClick}
                      selectedCategories={selectedCategories}
                      selectedDifficulties={selectedDifficulties}
                      selectedStatuses={selectedStatuses}
                    />
                  ))}
                </div>
              </>
            )}

            {filteredCampaigns.length === 0 && (
              <div className="text-center py-12">
                <Star className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                  No campaigns found
                </h3>
                <p className="text-gray-600 dark:text-muted-foreground mb-4">
                  Try adjusting your search terms or filters to find campaigns
                  that match your interests.
                </p>
                <Button
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedDifficulties([]);
                    setSelectedCategories([]);
                    setSelectedStatuses([]);
                  }}
                  variant="outline"
                  className="border-gray-400 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Rabbit at bottom - above Footer */}
        <div
          className="relative w-full"
          style={{ height: "50px", marginBottom: "-2rem", marginTop: "0" }}
        >
          <img
            src="/assets/branding/Rabbit.svg"
            alt="Rabbit"
            className="hidden dark:block"
            style={{
              position: "absolute",
              width: "auto",
              height: "50px",
              right: "20px",
              bottom: "0",
              maxHeight: "30vh",
              imageRendering: "pixelated",
              opacity: 1,
              zIndex: 10,
            }}
          />
          <img
            src="/assets/branding/Rabbit  - Inverted .svg"
            alt="Rabbit Inverted"
            className="block dark:hidden"
            style={{
              position: "absolute",
              width: "auto",
              height: "50px",
              right: "20px",
              bottom: "0",
              maxHeight: "30vh",
              imageRendering: "pixelated",
              opacity: 1,
              zIndex: 10,
            }}
          />
        </div>
      </main>
    </div>
  );
}
