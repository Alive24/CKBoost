/** Schedule rules from CKBoost Redesign's Home specification (273:15674).
 * These helpers intentionally do not change the legacy homepage's status logic.
 */
export type CampaignDate = string | number | Date;
export type CampaignDiscoveryStatus =
  | "ending-soon"
  | "active"
  | "upcoming"
  | "completed";

/** Numbers are epoch milliseconds, not the on-chain epoch seconds. */
export interface CampaignSchedule {
  startDate: CampaignDate;
  endDate: CampaignDate;
}

export interface CampaignIdentity {
  typeId?: string | null;
  typeHash?: string | null;
  id?: string;
}

export interface SearchableCampaign extends CampaignSchedule {
  title: string;
  shortDescription?: string;
  categories?: readonly string[];
  difficulty?: string;
}

export interface CampaignDiscoveryFilters {
  search?: string;
  status?: CampaignDiscoveryStatus | "all";
  difficulty?: string;
}

export const ENDING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

export const discoveryStatusLabels: Record<CampaignDiscoveryStatus, string> = {
  "ending-soon": "Ending soon",
  active: "Active",
  upcoming: "Upcoming",
  completed: "Completed",
};

function epochMs(value: CampaignDate): number {
  const result = value instanceof Date
    ? value.getTime()
    : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(result)) {
    throw new RangeError("Campaign schedule must contain valid absolute timestamps.");
  }
  return result;
}

/** Cutoffs are absolute instants; the device time zone only affects formatting. */
export function getDiscoveryStatus(
  campaign: CampaignSchedule,
  now = Date.now(),
): CampaignDiscoveryStatus {
  const start = epochMs(campaign.startDate);
  const end = epochMs(campaign.endDate);
  if (now < start) return "upcoming";
  if (now >= end) return "completed";
  return end - now <= ENDING_SOON_WINDOW_MS ? "ending-soon" : "active";
}

/** Campaign progress represents elapsed scheduled time, never quest completion. */
export function getCampaignProgress(campaign: CampaignSchedule, now = Date.now()): number {
  const start = epochMs(campaign.startDate);
  const end = epochMs(campaign.endDate);
  if (now < start) return 0;
  if (now >= end) return 100;
  if (end <= start) return 0;
  return Math.round(((now - start) / (end - start)) * 100);
}

/** Cards show minute precision. Refresh at a minute or an actual status cutoff,
 * rather than rerendering the entire grid every second while it is idle. */
export function getNextDiscoveryUpdateAt(campaigns: readonly CampaignSchedule[], now = Date.now()): number {
  let next = (Math.floor(now / 60_000) + 1) * 60_000;
  for (const campaign of campaigns) {
    const start = epochMs(campaign.startDate);
    const end = epochMs(campaign.endDate);
    for (const cutoff of [start, end - ENDING_SOON_WINDOW_MS, end]) {
      if (cutoff > now && cutoff < next) next = cutoff;
    }
  }
  return next;
}

export function matchesDiscoveryStatus(
  actual: CampaignDiscoveryStatus,
  filter?: CampaignDiscoveryStatus | "all",
): boolean {
  return !filter || filter === "all" || actual === filter ||
    (filter === "active" && actual === "ending-soon");
}

/** Prefer full identifiers. Existing CampaignDisplay.id is a shortened label. */
export function getCampaignStableId(campaign: CampaignIdentity): string {
  return campaign.typeId || campaign.typeHash || campaign.id || "";
}

const statusOrder: Record<CampaignDiscoveryStatus, number> = {
  "ending-soon": 0,
  active: 1,
  upcoming: 2,
  completed: 3,
};

export function sortCampaignsForDiscovery<T extends CampaignSchedule & CampaignIdentity>(
  campaigns: readonly T[],
  now = Date.now(),
): T[] {
  return [...campaigns].sort((a, b) => {
    const aStatus = getDiscoveryStatus(a, now);
    const bStatus = getDiscoveryStatus(b, now);
    const groupDifference = statusOrder[aStatus] - statusOrder[bStatus];
    if (groupDifference) return groupDifference;

    const timestampDifference = aStatus === "upcoming"
      ? epochMs(a.startDate) - epochMs(b.startDate)
      : aStatus === "completed"
        ? epochMs(b.endDate) - epochMs(a.endDate)
        : epochMs(a.endDate) - epochMs(b.endDate);
    if (timestampDifference) return timestampDifference;

    const aId = getCampaignStableId(a).toLowerCase();
    const bId = getCampaignStableId(b).toLowerCase();
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
}

export function filterCampaignsForDiscovery<T extends SearchableCampaign>(
  campaigns: readonly T[],
  filters: CampaignDiscoveryFilters,
  now = Date.now(),
): T[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const difficulty = filters.difficulty?.trim().toLowerCase();
  return campaigns.filter(campaign => {
    if (!matchesDiscoveryStatus(getDiscoveryStatus(campaign, now), filters.status)) return false;
    // Display labels are compared as supplied. No legacy difficulty codes are migrated.
    if (difficulty && difficulty !== "all" && campaign.difficulty?.toLowerCase() !== difficulty) return false;
    return !search || [campaign.title, campaign.shortDescription ?? "", ...(campaign.categories ?? [])]
      .some(value => value.toLowerCase().includes(search));
  });
}

/** English design copy, 24-hour clock, and the offset applicable on this date.
 * Omitting timeZone uses the viewer's browser/device time zone.
 */
export function formatCampaignSchedule(value: CampaignDate, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(epochMs(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  const offset = part("timeZoneName").replace(/^GMT/, "UTC");
  const normalizedOffset = offset === "UTC" ? "UTC+00:00" : offset;
  return `${part("month")} ${part("day")}, ${part("year")}, ${Number(part("hour"))}:${part("minute")} (${normalizedOffset})`;
}
