import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CampaignDataLike, UserDataLike } from "ssri-ckboost/types";
import type { useSubmissionReview } from "@/lib/revamp/use-submission-review";
import { SubmissionReviewWorkspace } from "../submission-review";

const mockFetchSubmission = jest.fn();
jest.mock("@ckb-ccc/connector-react", () => ({ccc: {useCcc: () => ({open: jest.fn()})}}));
jest.mock("@/lib/revamp/use-submission-review", () => ({useSubmissionReview: jest.fn()}));
jest.mock("@/hooks/use-nostr-fetch", () => ({useNostrFetch: () => ({fetchSubmission: mockFetchSubmission})}));
jest.mock("../theme", () => ({useRevampTheme: () => ({theme: "dark", portalContainer: null})}));
jest.mock("../site-shell", () => ({RevampSiteShell: ({children}: {children: React.ReactNode}) => <>{children}</>}));
jest.mock("@/lib/utils/campaign-utils", () => ({cellToCampaignDisplay: (cell: {outputData: CampaignDataLike}) => ({title: cell.outputData.metadata.title, shortDescription: "Campaign description", categories: ["Education"], difficulty: "easy", startDate: 1000, endDate: 2000, endorserName: "Endorser"})}));
jest.mock("../ui", () => ({...jest.requireActual("../ui"), RevampSelect: ({label, value, options, onValueChange}: {label: string; value: string; options: {value: string; label: string}[]; onValueChange: (value: string) => void}) => <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}));

const campaignId = `0x${"aa".repeat(32)}`;
const ada = `0x${"01".repeat(32)}`;
const bea = `0x${"02".repeat(32)}`;
const cam = `0x${"03".repeat(32)}`;
const dee = `0x${"04".repeat(32)}`;
const response = (userTypeId: string, questId: number, time: number) => ({userTypeId, campaign_type_id: campaignId, quest_id: questId, submission_timestamp: time, submission_content: `Proof from ${userTypeId}`});
const quest = (id: number, accepted: string[]) => ({quest_id: id, metadata: {title: id ? "Advanced analysis" : "Basic tutorial"}, points: 100, accepted_submission_user_type_ids: accepted, sub_tasks: [{title: "Proof", type: "text"}]});
const details = new Map([[ada, "Ada"], [bea, "Bea"], [cam, "Cam"], [dee, "Dee"]].map(([id, name]) => [id, {verification_data: {identity_verification_data: JSON.stringify({name})}} as unknown as UserDataLike]));
function fixture(single = false) {
  const campaign = {metadata: {title: "Build on CKB"}, quests: single ? [quest(0, [])] : [quest(0, [cam]), quest(1, [ada])]} as unknown as CampaignDataLike;
  const submissions = new Map(single ? [[0, [response(ada, 0, 1000)]]] : [[0, [response(ada, 0, 1000), response(bea, 0, 2000), response(cam, 0, 3000)]], [1, [response(ada, 1, 4000)]]]);
  const review = {dataset: {campaignData: campaign, submissions, userDetails: details, context: {campaignCell: {outputData: campaign}, capabilities: {isApproved: true}}}, access: "allowed", approval: null, approvalTimes: {}, error: null, refreshing: false, refresh: jest.fn(), approve: jest.fn(), checkConfirmation: jest.fn(), explorerBaseUrl: "https://example.com/"} as unknown as ReturnType<typeof useSubmissionReview>;
  return {campaign, review};
}

describe("review workspace interactions", () => {
  it("defaults to all quests/pending, preserves a selected contributor on refresh, and scopes filter counts", async () => {
    const {campaign, review} = fixture();
    const {rerender} = render(<SubmissionReviewWorkspace campaignTypeId={campaignId} campaign={campaign} review={review} />);
    expect(screen.getByRole("combobox", {name: "Quest"})).toHaveValue("all");
    expect(screen.getByRole("button", {name: "Pending review (2)"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: /Quest 1 · Basic tutorial/})).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", {name: /Quest 1 · Basic tutorial/}));
    fireEvent.click(screen.getByRole("button", {name: /Bea/}));
    await waitFor(() => expect(screen.getByRole("heading", {name: "Bea"})).toBeInTheDocument());
    const next = {...review, dataset: {...review.dataset!, submissions: new Map([[0, [...review.dataset!.submissions.get(0)!, response(dee, 0, 1500)]], [1, review.dataset!.submissions.get(1)!]])}};
    rerender(<SubmissionReviewWorkspace campaignTypeId={campaignId} campaign={campaign} review={next} />);
    expect(screen.getByRole("button", {name: /Bea/})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: /Quest 1 · Basic tutorial/})).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByRole("combobox", {name: "Quest"}), {target: {value: "1"}});
    expect(screen.getByRole("button", {name: "Pending review (0)"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Approved (1)"})).toBeInTheDocument();
    expect(screen.getByText("4 participants · 5 submissions")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: /Quest 2 · Advanced analysis/})).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", {name: "View approved submissions"}));
    await waitFor(() => expect(screen.getByRole("heading", {name: "Ada"})).toBeInTheDocument());
    expect(screen.getByText(/Approval time unavailable/)).toBeInTheDocument();
  });

  it("opens a single quest and passes the real selected row to the approval boundary", async () => {
    const {campaign, review} = fixture(true);
    render(<SubmissionReviewWorkspace campaignTypeId={campaignId} campaign={campaign} review={review} />);
    expect(screen.getByRole("button", {name: /Quest 1 · Basic tutorial/})).toHaveAttribute("aria-expanded", "true");
    const approve = await screen.findByRole("button", {name: "Approve"});
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    expect(review.approve).toHaveBeenCalledWith(0, [expect.objectContaining({userTypeId: ada, status: "pending"})]);
    fireEvent.click(screen.getByRole("button", {name: "Approve 1 submission"}));
    expect(review.approve).toHaveBeenCalledTimes(2);
  });

  it("shows real 2026 millisecond timestamps and the date-specific UTC offset",async()=>{
    const {campaign,review}=fixture(true);const timestamp=Date.parse("2026-11-18T08:30:00.000Z");
    review.dataset!.submissions=new Map([[0,[response(ada,0,timestamp)]]]);
    render(<SubmissionReviewWorkspace campaignTypeId={campaignId} campaign={campaign} review={review}/>);
    await waitFor(()=>expect(screen.getByText(/Quest 1 · Submitted .*2026.*\(UTC[+-]\d{2}:\d{2}\)/)).toBeInTheDocument());
    expect(screen.getByText(/Submitted at \(UTC[+-]\d{2}:\d{2}\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Submitted .*1970/)).not.toBeInTheDocument();
  });
  it("keeps NFT evidence/export readable while blocking both approval entry points",async()=>{
    const {campaign,review}=fixture(true);campaign.quests[0].rewards_on_completion=[{nft_assets:[{codeHash:`0x${"aa".repeat(32)}`,hashType:"type",args:"0x"}],udt_assets:[],ckb_amount:0,points_amount:0}];
    render(<SubmissionReviewWorkspace campaignTypeId={campaignId} campaign={campaign} review={review}/>);
    expect(screen.getByRole("button",{name:"Approve 1 submission"})).toBeDisabled();
    await waitFor(()=>expect(screen.getByRole("button",{name:"Approve"})).toBeDisabled());
    expect(screen.getByText(/NFT reward approval is unavailable/)).toBeInTheDocument();expect(screen.getByRole("button",{name:/Export Quest 1/})).toBeEnabled();expect(review.approve).not.toHaveBeenCalled();
  });
});
