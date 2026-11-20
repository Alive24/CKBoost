import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRevampCampaignCover } from "@/lib/revamp/use-campaign-cover";
import { buildCampaignRewards } from "@/lib/revamp/campaign-rewards";
import type { CampaignDisplay } from "@/lib/utils/campaign-utils";
import { RevampCampaignCard } from "../campaign-card";

jest.mock("@/lib/revamp/use-campaign-cover", () => ({ useRevampCampaignCover: jest.fn() }));
jest.mock("@/lib/revamp/campaign-rewards", () => ({ buildCampaignRewards: jest.fn() }));

const NOW = Date.parse("2026-11-18T08:00:00Z");
const HOUR = 60 * 60 * 1000;
const FULL_ID = `0x${"ab".repeat(32)}`;
const DEFAULT_COVER = "/assets/revamp/campaign-cover.svg";

function campaign(overrides: Partial<CampaignDisplay> = {}): CampaignDisplay {
  // The card consumes a view model. Unused on-chain fields stay outside this
  // fixture; the real decoder and reward adapter have their own focused tests.
  return {
    id: "0xababab",
    typeId: FULL_ID,
    typeHash: `0x${"cd".repeat(32)}`,
    title: "Build on CKB",
    shortDescription: "Complete a tutorial and share what you learned.",
    categories: ["Development", "Education"],
    difficulty: "easy",
    metadata: { image_url: "https://example.com/cover.png" },
    startDate: new Date(NOW - 10 * HOUR).toISOString(),
    endDate: new Date(NOW + 72 * HOUR).toISOString(),
    status: "completed",
    isExpired: true,
    quests: [],
    questsCount: 10,
    questsCompleted: 10,
    ...overrides,
  } as CampaignDisplay;
}

function artwork(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector("img");
  if (!image) throw new Error("Expected campaign artwork");
  return image;
}

beforeEach(() => {
  jest.mocked(useRevampCampaignCover).mockImplementation(source => ({ src: source ?? null, isLoading: false, ref: {current: null} }));
  jest.mocked(buildCampaignRewards).mockReturnValue([]);
  jest.clearAllMocks();
});

describe("revamp campaign card", () => {
  it.each([
    { start: -10, end: 72, badge: "Active", action: "Join campaign", schedule: "End time" },
    { start: 1, end: 2, badge: "Upcoming", action: "View details", schedule: "Start time" },
    { start: -10, end: 0, badge: "Completed", action: "View results", schedule: "End time" },
  ])("shows $action for $badge using the full campaign ID", ({ start, end, badge, action, schedule }) => {
    const view = campaign({
      startDate: new Date(NOW + start * HOUR).toISOString(),
      endDate: new Date(NOW + end * HOUR).toISOString(),
    });
    const { container } = render(<RevampCampaignCard campaign={view} now={NOW} />);
    expect(screen.getByText(badge, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `${action}: Build on CKB` })).toHaveAttribute("href", `/revamp/campaign/${FULL_ID}`);
    expect(screen.getByText(schedule, { exact: true })).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", schedule === "Start time" ? view.startDate : view.endDate);
    expect(container.querySelector("time")).toHaveTextContent(/\(UTC[+-]\d{2}:\d{2}\)/);
  });

  it("exposes elapsed time rather than quest completion, and treats Ending soon as open", () => {
    render(<RevampCampaignCard campaign={campaign({
      startDate: new Date(NOW - 6 * HOUR).toISOString(),
      endDate: new Date(NOW + 18 * HOUR).toISOString(),
    })} now={NOW} />);
    expect(screen.getByText("Ending soon", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join campaign: Build on CKB" })).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Campaign progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    expect(progress).toHaveAttribute("aria-valuetext", "25% of scheduled campaign time elapsed");
  });

  it("uses the designed fallback when old campaign metadata points at the legacy placeholder", () => {
    const view = campaign();
    view.metadata.image_url = "/placeholder.svg";
    const { container } = render(<RevampCampaignCard campaign={view} now={NOW} />);
    expect(artwork(container)).toHaveAttribute("src", DEFAULT_COVER);
    expect(useRevampCampaignCover).toHaveBeenLastCalledWith(null);
  });

  it("falls back once for a broken cover and allows a changed cover to load", () => {
    const { container, rerender } = render(<RevampCampaignCard campaign={campaign()} now={NOW} />);
    fireEvent.error(artwork(container));
    expect(artwork(container)).toHaveAttribute("src", DEFAULT_COVER);
    const callsAfterFallback = jest.mocked(useRevampCampaignCover).mock.calls.length;
    fireEvent.error(artwork(container));
    fireEvent.error(artwork(container));
    expect(useRevampCampaignCover).toHaveBeenCalledTimes(callsAfterFallback);

    const updated = campaign();
    updated.metadata.image_url = "https://example.com/replacement.png";
    rerender(<RevampCampaignCard campaign={updated} now={NOW} />);
    expect(artwork(container)).toHaveAttribute("src", "https://example.com/replacement.png");
  });

  it("avoids a malformed destination when the campaign has no full identifier", () => {
    render(<RevampCampaignCard campaign={campaign({ typeId: null, typeHash: "" })} now={NOW} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details unavailable" })).toBeDisabled();
  });

  it("renders the reward adapter's full exact amounts without converting them to Number", () => {
    jest.mocked(buildCampaignRewards).mockReturnValue([
      { key: "points", kind: "points", label: "Points", amount: "9007199254740993123456789" },
      { key: "ckb", kind: "ckb", label: "CKB", amount: "123.00000001" },
    ]);
    render(<RevampCampaignCard campaign={campaign()} now={NOW} />);
    expect(screen.getByText("9007199254740993123456789 Points", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("123.00000001 CKB", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("No configured rewards")).not.toBeInTheDocument();
  });
});
