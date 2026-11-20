import {
  ENDING_SOON_WINDOW_MS,
  filterCampaignsForDiscovery,
  formatCampaignSchedule,
  getCampaignProgress,
  getCampaignStableId,
  getDiscoveryStatus,
  getNextDiscoveryUpdateAt,
  matchesDiscoveryStatus,
  sortCampaignsForDiscovery,
} from "../campaign-discovery";

const now = Date.parse("2026-11-18T08:00:00Z");
const hour = 60 * 60 * 1000;

it("refreshes on minute ticks while preserving exact start, ending-soon and end cutoffs", () => {
  expect(getNextDiscoveryUpdateAt([], now + 1234)).toBe(now + 60_000);
  expect(getNextDiscoveryUpdateAt([{startDate: now + 3210, endDate: now + 3 * hour}], now)).toBe(now + 3210);
  expect(getNextDiscoveryUpdateAt([{startDate: now - hour, endDate: now + ENDING_SOON_WINDOW_MS + 4567}], now)).toBe(now + 4567);
  expect(getNextDiscoveryUpdateAt([{startDate: now - hour, endDate: now + 9876}], now)).toBe(now + 9876);
  expect(getNextDiscoveryUpdateAt([{startDate: now - hour, endDate: now}], now)).toBe(now + 60_000);
});
const campaign = (typeId: string, start: number, end: number) => ({
  typeId,
  startDate: new Date(start).toISOString(),
  endDate: new Date(end).toISOString(),
  title: `Campaign ${typeId}`,
  difficulty: "easy",
});

describe("redesigned campaign discovery schedule", () => {
  it("switches into Ending soon exactly 48 hours before the deadline", () => {
    const item = campaign("soon", now - hour, now + ENDING_SOON_WINDOW_MS);
    expect(getDiscoveryStatus(item, now - 1)).toBe("active");
    expect(getDiscoveryStatus(item, now)).toBe("ending-soon");
  });

  it("keeps a short campaign Upcoming until its start, then closes exactly at its deadline", () => {
    const item = campaign("short", now + hour, now + 2 * hour);
    expect(getDiscoveryStatus(item, now)).toBe("upcoming");
    expect(getDiscoveryStatus(item, now + hour)).toBe("ending-soon");
    expect(getDiscoveryStatus(item, now + 2 * hour - 1)).toBe("ending-soon");
    expect(getDiscoveryStatus(item, now + 2 * hour)).toBe("completed");
  });

  it("includes Ending soon under Active without including Upcoming or Completed", () => {
    expect(matchesDiscoveryStatus("ending-soon", "active")).toBe(true);
    expect(matchesDiscoveryStatus("active", "active")).toBe(true);
    expect(matchesDiscoveryStatus("upcoming", "active")).toBe(false);
    expect(matchesDiscoveryStatus("completed", "active")).toBe(false);
    expect(matchesDiscoveryStatus("active", "ending-soon")).toBe(false);
    expect(matchesDiscoveryStatus("completed", "all")).toBe(true);
  });

  it("sorts the four groups using their specified time order without mutating the input", () => {
    const input = [
      campaign("ended-old", now - 20 * hour, now - 10 * hour),
      campaign("active-later", now - hour, now + 80 * hour),
      campaign("upcoming-later", now + 5 * hour, now + 12 * hour),
      campaign("ending-later", now - hour, now + 4 * hour),
      campaign("ended-recent", now - 10 * hour, now - hour),
      campaign("active-earlier", now - hour, now + 60 * hour),
      campaign("ending-earlier", now - hour, now + 2 * hour),
      campaign("upcoming-earlier", now + 3 * hour, now + 20 * hour),
    ];
    const originalOrder = input.map(item => item.typeId);
    expect(sortCampaignsForDiscovery(input, now).map(item => item.typeId)).toEqual([
      "ending-earlier", "ending-later", "active-earlier", "active-later",
      "upcoming-earlier", "upcoming-later", "ended-recent", "ended-old",
    ]);
    expect(input.map(item => item.typeId)).toEqual(originalOrder);
  });

  it("uses the full campaign ID to break equal-time ties even when display IDs collide", () => {
    const a = {...campaign("0x123456789a", now - hour, now + hour), id: "0x123456", typeHash: "0xz"};
    const b = {...campaign("0x123456789b", now - hour, now + hour), id: "0x123456", typeHash: "0xa"};
    expect(sortCampaignsForDiscovery([b, a], now).map(item => item.typeId)).toEqual([a.typeId, b.typeId]);
    expect(getCampaignStableId(a)).toBe(a.typeId);
    expect(getCampaignStableId({typeId: null, typeHash: "0xfull-hash", id: "0xshort"})).toBe("0xfull-hash");
  });

  it("measures elapsed time, clamps at both ends and handles a zero-duration schedule", () => {
    const item = campaign("progress", now, now + 4 * hour);
    expect(getCampaignProgress(item, now - hour)).toBe(0);
    expect(getCampaignProgress(item, now)).toBe(0);
    expect(getCampaignProgress(item, now + hour)).toBe(25);
    expect(getCampaignProgress(item, now + 4 * hour)).toBe(100);
    expect(getCampaignProgress(item, now + 8 * hour)).toBe(100);
    expect(getCampaignProgress(campaign("instant", now, now), now)).toBe(100);
  });

  it("filters trimmed search text, status and existing difficulty labels together", () => {
    const input = [
      {...campaign("fiber", now - hour, now + hour), title: "Learn Fiber", shortDescription: "Build payment channels", categories: ["Development"]},
      {...campaign("hard-fiber", now - hour, now + 80 * hour), title: "Advanced Fiber", difficulty: "hard"},
      {...campaign("upcoming", now + hour, now + 2 * hour), title: "Learn Fiber"},
    ];
    expect(filterCampaignsForDiscovery(input, {search: "  FIBER  ", status: "active", difficulty: "EASY"}, now)
      .map(item => item.typeId)).toEqual(["fiber"]);
    expect(filterCampaignsForDiscovery(input, {search: "channels"}, now)).toHaveLength(1);
    expect(filterCampaignsForDiscovery(input, {search: "Development"}, now)).toHaveLength(1);
    expect(filterCampaignsForDiscovery(input, {search: "no matches"}, now)).toEqual([]);
    expect(filterCampaignsForDiscovery(input, {search: "   ", status: "all", difficulty: "all"}, now)).toHaveLength(3);
  });

  it("rejects invalid timestamps rather than inventing an active campaign", () => {
    expect(() => getDiscoveryStatus({startDate: "invalid", endDate: now}, now)).toThrow(RangeError);
    expect(() => formatCampaignSchedule("invalid")).toThrow(RangeError);
  });
});

describe("viewer-local campaign schedule labels", () => {
  it("shows the requested device zone and a 24-hour time without an hour leading zero", () => {
    expect(formatCampaignSchedule("2026-10-25T18:00:00Z", "Asia/Shanghai"))
      .toBe("Oct 26, 2026, 2:00 (UTC+08:00)");
    expect(formatCampaignSchedule("2026-10-25T16:00:00Z", "Asia/Shanghai"))
      .toBe("Oct 26, 2026, 0:00 (UTC+08:00)");
    expect(formatCampaignSchedule("2026-10-25T18:00:00Z", "UTC"))
      .toBe("Oct 25, 2026, 18:00 (UTC+00:00)");
  });

  it("uses the offset on each date across daylight saving and supports half-hour zones", () => {
    expect(formatCampaignSchedule("2026-07-01T12:30:00Z", "America/New_York"))
      .toBe("Jul 1, 2026, 8:30 (UTC-04:00)");
    expect(formatCampaignSchedule("2026-12-01T12:30:00Z", "America/New_York"))
      .toBe("Dec 1, 2026, 7:30 (UTC-05:00)");
    expect(formatCampaignSchedule("2026-07-01T12:30:00Z", "Asia/Kolkata"))
      .toBe("Jul 1, 2026, 18:00 (UTC+05:30)");
  });

  it("keeps status independent from equivalent timestamp offsets", () => {
    const utc = {startDate: "2026-11-18T00:00:00Z", endDate: "2026-11-19T00:00:00Z"};
    const shanghai = {startDate: "2026-11-18T08:00:00+08:00", endDate: "2026-11-19T08:00:00+08:00"};
    expect(getDiscoveryStatus(utc, now)).toBe(getDiscoveryStatus(shanghai, now));
    expect(getCampaignProgress(utc, now)).toBe(getCampaignProgress(shanghai, now));
  });
});
