import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useHomeCampaigns } from "@/lib/revamp/use-home-campaigns";
import { useOrganizerAccess } from "@/lib/revamp/use-organizer-access";
import type { CampaignDisplay } from "@/lib/utils/campaign-utils";
import { RevampHomePage } from "../home-page";

const mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({usePathname: () => "/revamp", useSearchParams: () => mockParams}));
jest.mock("@/lib/revamp/use-home-campaigns", () => ({useHomeCampaigns: jest.fn()}));
jest.mock("@/lib/revamp/use-organizer-access", () => ({useOrganizerAccess: jest.fn()}));
jest.mock("../site-shell", () => ({RevampSiteHeader: () => <header />, RevampSiteFooter: () => <footer />}));
jest.mock("../campaign-card", () => ({RevampCampaignCard: ({campaign}: {campaign: CampaignDisplay}) => <article>{campaign.title}</article>}));
// Radix keyboard/portal behavior is exercised by select.test.tsx; here retain
// native filter interaction to verify Home's URL and progressive-data boundary.
jest.mock("../ui", () => ({
  RevampIcon: () => null,
  RevampInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  RevampButton: ({children, asChild, variant, size, ...props}: any) => asChild ? children : <button {...props}>{children}</button>,
  RevampSelect: ({label, value, onValueChange, options}: any) => <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
}));

const campaigns = [
  {typeId:"0x01", title:"Fiber tutorial", shortDescription:"Learn", categories:[], difficulty:"easy", startDate:"2020-01-01T00:00:00Z", endDate:"2090-01-01T00:00:00Z"},
  {typeId:"0x02", title:"Completed tutorial", shortDescription:"Learn", categories:[], difficulty:"hard", startDate:"2020-01-01T00:00:00Z", endDate:"2021-01-01T00:00:00Z"},
] as unknown as CampaignDisplay[];

function snapshot(overrides: Partial<ReturnType<typeof useHomeCampaigns>> = {}) {
  const state = {campaigns, isLoading:false, hasError:false, missingCount:0, pendingCount:0, retry:jest.fn(), ...overrides};
  jest.mocked(useHomeCampaigns).mockReturnValue(state);
  return state;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/revamp");
  jest.mocked(useOrganizerAccess).mockReturnValue(false);
  snapshot();
});

it("filters immediately, restores back/forward query state, and clears all filter state", () => {
  render(<RevampHomePage />);
  fireEvent.change(screen.getByRole("searchbox"), {target:{value:"Fiber"}});
  fireEvent.change(screen.getByRole("combobox", {name:"Status"}), {target:{value:"active"}});
  expect(window.location.search).toBe("?q=Fiber&status=active");
  expect(screen.queryByText("Completed tutorial")).not.toBeInTheDocument();
  act(() => {
    window.history.replaceState(null, "", "/revamp?status=completed");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("combobox", {name:"Status"})).toHaveValue("completed");
  expect(screen.queryByText("Fiber tutorial")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Clear filters"}));
  expect(window.location.search).toBe("");
  expect(screen.getByText("2 campaigns")).toBeInTheDocument();
});

it("keeps delivered cards usable while other campaigns load or fail", () => {
  const state = snapshot({campaigns:[campaigns[0]], pendingCount:1, missingCount:1});
  render(<RevampHomePage />);
  expect(screen.getByText("Fiber tutorial")).toBeInTheDocument();
  expect(screen.getByText(/1 campaign · Loading 1 more/)).toBeInTheDocument();
  expect(screen.queryByText("No campaigns yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Retry"}));
  expect(state.retry).toHaveBeenCalledTimes(1);
});

it("distinguishes a settled empty list, a pending list, and a failed list", () => {
  snapshot({campaigns:[]});
  const view = render(<RevampHomePage />);
  expect(screen.getByText("No campaigns yet")).toBeInTheDocument();
  snapshot({campaigns:[], pendingCount:2});
  view.rerender(<RevampHomePage />);
  expect(screen.queryByText("No campaigns yet")).not.toBeInTheDocument();
  snapshot({campaigns:[], hasError:true});
  view.rerender(<RevampHomePage />);
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load campaigns");
});

it("exposes the new creation route only when the fresh authorization hook permits it", () => {
  const view = render(<RevampHomePage />);
  expect(screen.queryByRole("link", {name:"Create campaign"})).not.toBeInTheDocument();
  jest.mocked(useOrganizerAccess).mockReturnValue(true);
  view.rerender(<RevampHomePage />);
  expect(screen.getByRole("link", {name:"Create campaign"})).toHaveAttribute("href", "/revamp/campaigns/new");
});
