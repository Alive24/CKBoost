"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useHomeCampaigns } from "@/lib/revamp/use-home-campaigns";
import { useOrganizerAccess } from "@/lib/revamp/use-organizer-access";
import { filterCampaignsForDiscovery, sortCampaignsForDiscovery, getCampaignStableId, getNextDiscoveryUpdateAt, type CampaignDiscoveryStatus } from "@/lib/revamp/campaign-discovery";
import { RevampButton, RevampIcon, RevampInput, RevampSelect } from "./ui";
import { RevampCampaignCard } from "./campaign-card";
import { RevampSiteHeader, RevampSiteFooter } from "./site-shell";
import styles from "./home.module.css";

const statusOptions = [
  {value: "all", label: "All statuses"},
  {value: "active", label: "Active"},
  {value: "ending-soon", label: "Ending soon"},
  {value: "upcoming", label: "Upcoming"},
  {value: "completed", label: "Completed"},
] as const;
const difficultyOptions = [
  {value: "all", label: "All difficulties"},
  {value: "easy", label: "Easy"},
  {value: "medium", label: "Intermediate"},
  {value: "hard", label: "Hard"},
] as const;

function HomeFrame({ children }: { children: ReactNode }) {
  return <div className={styles.page}>
    <a href="#campaign-discovery" className={styles.skipLink}>Skip to campaigns</a>
    <RevampSiteHeader />
    <section className={styles.banner} aria-labelledby="home-introduction">
      <div aria-hidden="true" className={styles.starlight}><img src="/assets/revamp/starlight.svg" alt="" /></div>
      <div className={styles.bannerInner}>
        <div className={styles.bannerLogo} aria-hidden="true"><img src="/assets/revamp/banner-logo.svg" alt="" /></div>
        <div className={styles.bannerMessage}>
          <h1 id="home-introduction">Build. Learn. Earn on CKB.</h1>
          <p>Join campaigns, complete quests, and grow your reputation.</p>
        </div>
      </div>
    </section>
    {children}
    <RevampSiteFooter />
  </div>;
}

function CampaignSkeleton() {
  return <div className={styles.skeletonCard} aria-hidden="true">
      <div className={styles.skeletonCover} />
      <div className={styles.skeletonBody}>{Array.from({length: 6}, (_, line) => <span key={line} />)}</div>
    </div>;
}

function CampaignSkeletons() {
  return <div className={styles.grid}>{Array.from({length: 6}, (_, index) => <CampaignSkeleton key={index} />)}</div>;
}

export function RevampHomeLoading() {
  return <HomeFrame><main className={styles.main} id="campaign-discovery" aria-busy="true">
    <div className={styles.heading}><h2>Explore Campaigns</h2><span role="status">Loading campaigns…</span></div>
    <div className={styles.loadingToolbar} aria-hidden="true" />
    <CampaignSkeletons />
  </main></HomeFrame>;
}

export function RevampHomePage() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(() => new URLSearchParams(params.toString()));
  useEffect(() => {
    const sync = () => setQuery(new URLSearchParams(window.location.search));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [params]);
  const { campaigns, isLoading, hasError, missingCount, pendingCount, retry } = useHomeCampaigns();
  const canCreate = useOrganizerAccess();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const current = Date.now();
      setNow(current);
      timer = setTimeout(update, Math.max(1, getNextDiscoveryUpdateAt(campaigns, current) - current));
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [campaigns]);

  const search = query.get("q") ?? "";
  const rawStatus = query.get("status") ?? "all";
  const status = statusOptions.some(option => option.value === rawStatus)
    ? rawStatus as CampaignDiscoveryStatus | "all" : "all";
  const rawDifficulty = query.get("difficulty") ?? "all";
  const difficulty = difficultyOptions.some(option => option.value === rawDifficulty) ? rawDifficulty : "all";
  const hasFilters = Boolean(search || status !== "all" || difficulty !== "all");
  const visible = sortCampaignsForDiscovery(filterCampaignsForDiscovery(campaigns, {search, status, difficulty}, now), now);

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(window.location.search);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setQuery(next);
    const query = next.toString();
    // Next's native history integration updates useSearchParams synchronously,
    // without a new data request on every keystroke. Back retains discovery state.
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
  }
  function clearFilters() {
    setQuery(new URLSearchParams());
    window.history.replaceState(null, "", pathname);
  }

  return <HomeFrame>
    <main className={styles.main} id="campaign-discovery" aria-busy={isLoading}>
      <div className={styles.heading}>
        <h2>Explore Campaigns</h2>
        <span role="status" aria-live="polite">{isLoading ? "Loading campaigns…" : `${visible.length} ${visible.length === 1 ? "campaign" : "campaigns"}${pendingCount ? ` · Loading ${pendingCount} more…` : ""}`}</span>
        {canCreate && <RevampButton asChild className={styles.createButton}><Link href="/revamp/campaigns/new" prefetch={false}>Create campaign</Link></RevampButton>}
      </div>
      <div className={styles.toolbar} role="search" aria-label="Find campaigns">
        <div className={styles.search}>
          <RevampIcon name="search" />
          <RevampInput className={styles.searchInput} type="search" value={search} onChange={event => changeFilter("q", event.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" />
        </div>
        <div className={styles.filters}>
          <RevampSelect label="Status" value={status} onValueChange={value => changeFilter("status", value)} options={statusOptions}
            leadingIcon="filter" triggerClassName={styles.filterTrigger} displayValue={status === "all" ? "Status" : undefined} />
          <RevampSelect label="Difficulty" value={difficulty} onValueChange={value => changeFilter("difficulty", value)} options={difficultyOptions}
            leadingIcon="filter" triggerClassName={styles.filterTrigger} displayValue={difficulty === "all" ? "Difficulty" : undefined} />
        </div>
        {hasFilters && <RevampButton variant="secondary" size="small" onClick={clearFilters}>Clear filters</RevampButton>}
      </div>

      {isLoading ? <CampaignSkeletons /> : hasError ?
        <div className={styles.state} role="alert"><h3>Unable to load campaigns</h3><p>Campaigns are unavailable right now. Please try again.</p><RevampButton onClick={() => void retry()}>Try again</RevampButton></div>
        : <>
          {missingCount > 0 && <div className={styles.partial} role="status"><span>Some campaigns couldn’t be loaded.</span><RevampButton variant="secondary" size="small" onClick={() => void retry()}>Retry</RevampButton></div>}
          {visible.length ? <div className={styles.grid}>
              {visible.map(campaign => <RevampCampaignCard key={getCampaignStableId(campaign)} campaign={campaign} now={now} />)}
              {Array.from({length: Math.min(pendingCount, Math.max(0, 6 - visible.length))}, (_, index) => <CampaignSkeleton key={`pending-${index}`} />)}
            </div>
            : pendingCount > 0 ? <CampaignSkeletons />
            : <div className={styles.state}><h3>{hasFilters ? "No matching campaigns" : "No campaigns yet"}</h3><p>{hasFilters ? "Try another search or clear the filters to explore all campaigns." : "Approved campaigns will appear here."}</p>{hasFilters && <RevampButton variant="secondary" onClick={clearFilters}>Clear filters</RevampButton>}</div>}
        </>}
    </main>
  </HomeFrame>;
}
