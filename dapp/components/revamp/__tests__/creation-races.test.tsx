import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PendingTransactionRecord } from "@/lib/providers/pending-transaction-provider";
import { CreationWorkspace } from "../creation-workspace";
import { publishCreation } from "@/lib/revamp/creation-publish";
import { creationStorageKey, readCreationStore, saveCreationDraft } from "@/lib/revamp/creation-store";
import { newCreationModel } from "@/lib/revamp/creation-model";

const hash = (value: string) => `0x${value.repeat(64)}`;
const mockAdminA = hash("a"), mockAdminB = hash("b"), mockProtocolHash = hash("c");
const mockTxA = hash("d"), mockTxB = hash("e");
const mockClient = { getTransaction: jest.fn(async () => ({ transaction: { outputs: [] } })) };
const mockOpen = jest.fn(), mockPush = jest.fn();
const mockSignerA = { getRecommendedAddressObj: async () => ({ script: { hash: () => mockAdminA } }) };
const mockSignerB = { getRecommendedAddressObj: async () => ({ script: { hash: () => mockAdminB } }) };
let mockSigner: typeof mockSignerA | undefined;
const mockProtocol = {
  protocolCell: { cellOutput: { type: { hash: () => mockProtocolHash } } },
  protocolData: { protocol_config: { admin_lock_hash_vec: [mockAdminA, mockAdminB], script_code_hashes: { ckb_boost_campaign_type_code_hash: hash("f") } }, campaigns_approved: [] },
  error: null,
};
const mockPending = { pendingTransactions: [] as PendingTransactionRecord[], register: jest.fn(), refresh: jest.fn(), explorerBaseUrl: "https://example.com/tx/" };
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: { useSigner: () => mockSigner, useCcc: () => ({ client: mockClient, open: mockOpen }), hexFrom: (value: string) => value } }));
jest.mock("@/lib/revamp/creation-access",()=>({useCreationAuthorization:()=>{
  const React=require("react");
  const [resolved,setResolved]=React.useState(null as null|{signer:typeof mockSigner;hash:string});
  React.useEffect(()=>{let cancelled=false;if(mockSigner){const current=mockSigner;current.getRecommendedAddressObj().then(address=>{if(!cancelled)setResolved({signer:current,hash:address.script.hash()});});}return()=>{cancelled=true;};},[mockSigner]);
  const snapshot=resolved&&resolved.signer===mockSigner?{...mockProtocol,lockHash:resolved.hash,capabilities:{canCreateCampaign:mockProtocol.protocolData.protocol_config.admin_lock_hash_vec.includes(resolved.hash),canEditCampaign:false}}:undefined;
  return {snapshot,loading:Boolean(mockSigner&&!snapshot),error:undefined};
}}));
jest.mock("@/lib/revamp/creation-submission-check",()=>({useCreationSubmissionCheck:()=>({result:undefined,loading:false,error:undefined})}));
jest.mock("@/lib/providers/pending-transaction-provider", () => ({ usePendingTransactions: () => mockPending }));
jest.mock("@/hooks/use-nostr-fetch", () => ({ useNostrFetch: () => ({ fetchSubmission: jest.fn() }) }));
jest.mock("@/hooks/use-nostr-storage", () => ({ useNostrStorage: () => ({ storeCampaignContent: { mutateAsync: jest.fn() } }) }));
jest.mock("@/hooks/use-campaign-cover-image", () => ({ useCampaignCoverImage: (source: string) => ({ src: source || null, isLoading: false }) }));
jest.mock("@/lib/revamp/campaign-rewards", () => ({ buildCampaignRewards: () => [] }));
jest.mock("@/lib/revamp/creation-publish", () => ({ publishCreation: jest.fn() }));
jest.mock("@/lib/ckb/campaign-cells", () => ({ fetchCampaignByTypeId: jest.fn() }));
jest.mock("@/lib/ckb/deployment-manager", () => ({ deploymentManager: { getCurrentNetwork: () => "testnet" } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../site-shell", () => ({ RevampSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("../theme", () => ({ useRevampTheme: () => ({ portalContainer: document.body, theme: "dark" }) }));

function scope(wallet = mockAdminA) { return creationStorageKey({ network: "testnet", protocol: mockProtocolHash, wallet }); }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
class DelayedReader {
  result: string | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  readAsDataURL = jest.fn();
  constructor() { readers.push(this); }
  complete(value: string) { this.result = value; this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>); }
}
let readers: DelayedReader[] = [];
const originalReader = globalThis.FileReader;
let uuid = 0;
const pendingRecord = (status: PendingTransactionRecord["status"]): PendingTransactionRecord => ({ txHash: mockTxA, createdAt: Date.now(), checkAttempts: 1, confirmations: status === "finalized" ? 6 : 0, status });
async function waitForEditor() { await waitFor(() => expect(screen.getByRole("textbox", { name: "Campaign title" })).toBeEnabled()); }
function beginImageRead() {
  fireEvent.change(screen.getByLabelText("Upload campaign cover"), { target: { files: [new File(["image"], "cover.png", { type: "image/png" })] } });
  expect(readers).toHaveLength(1);
  return readers[0];
}
async function fillReadyCampaign(title: string) {
  fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
  await waitForEditor();
  for (const [label, value] of [["Campaign title", title], ["Campaign summary", "Summary"], ["Full description", "Instructions"], ["Start time", "2026-11-18T09:00"], ["End time", "2026-12-18T09:00"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("tab", { name: "Quests" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Quest 1 title" }), { target: { value: "First quest" } });
}

describe("organizer asynchronous account and receipt isolation", () => {
  beforeAll(() => Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => `new-draft-${++uuid}` }));
  beforeEach(() => {
    localStorage.clear(); jest.clearAllMocks(); jest.mocked(publishCreation).mockReset();
    mockSigner = mockSignerA; mockPending.pendingTransactions = []; readers = []; uuid = 0;
    Object.defineProperty(globalThis, "FileReader", { configurable: true, value: DelayedReader });
  });
  afterAll(() => Object.defineProperty(globalThis, "FileReader", { configurable: true, value: originalReader }));

  it("ignores a delayed image from the previous wallet after the next admin starts editing", async () => {
    const view = render(<CreationWorkspace />); await waitForEditor();
    const reader = beginImageRead();
    mockSigner = mockSignerB; view.rerender(<CreationWorkspace />); await waitForEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Campaign title" }), { target: { value: "Second account draft" } });
    await act(async () => { reader.complete("data:image/png;base64,b2xkLWFjY291bnQ="); });
    expect(screen.queryByText("Custom campaign cover")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(readCreationStore(scope(mockAdminB)).drafts[0].saved).toMatchObject({ title: "Second account draft", cover: "" });
  });

  it("ignores a delayed image after explicitly replacing the current form with another saved draft", async () => {
    const draft = newCreationModel(); draft.title = "Replacement draft";
    saveCreationDraft(scope(), "replacement-id", draft, true);
    render(<CreationWorkspace />);
    await screen.findByRole("dialog", { name: "Campaign drafts" });
    fireEvent.click(screen.getByRole("button", { name: "Continue current campaign" })); await waitForEditor();
    const reader = beginImageRead();
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm replacement" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Campaign title" })).toHaveValue("Replacement draft"));
    await act(async () => { reader.complete("data:image/png;base64,b2xkLWRyYWZ0"); });
    expect(screen.queryByText("Custom campaign cover")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(readCreationStore(scope()).drafts.find(record => record.id === "replacement-id")?.saved?.cover).toBe("");
  });

  it.each(["resolve", "reject"] as const)("keeps the new account's dock unchanged when the old launch later %ss", async outcome => {
    const oldLaunch = deferred<string>(), newLaunch = deferred<string>();
    jest.mocked(publishCreation).mockImplementationOnce(() => oldLaunch.promise).mockImplementationOnce(() => newLaunch.promise);
    const view = render(<CreationWorkspace />); await fillReadyCampaign("Account A campaign");
    fireEvent.click(screen.getByRole("button", { name: "Launch campaign" }));
    await waitFor(() => expect(publishCreation).toHaveBeenCalledTimes(1));
    const oldOptions = jest.mocked(publishCreation).mock.calls[0][0];
    mockSigner = mockSignerB; view.rerender(<CreationWorkspace />);
    await fillReadyCampaign("Account B campaign");
    fireEvent.click(screen.getByRole("button", { name: "Launch campaign" }));
    await waitFor(() => expect(publishCreation).toHaveBeenCalledTimes(2));
    await act(async () => {
      oldOptions.onStage("wallet", "Old account must not replace this dock");
      if (outcome === "resolve") oldLaunch.resolve(mockTxA); else oldLaunch.reject(new Error("Old account launch failed"));
      await Promise.resolve();
    });
    expect(screen.getByText("Checking current Organizer access…")).toBeInTheDocument();
    expect(screen.queryByText("Old account must not replace this dock")).not.toBeInTheDocument();
    expect(screen.queryByText("Old account launch failed")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View transaction ↗" })).not.toBeInTheDocument();
    await act(async () => { newLaunch.resolve(mockTxB); });
  });

  it("removes the published receipt draft after confirmation while preserving an unrelated draft", async () => {
    const published = newCreationModel(); published.title = "Published campaign";
    const unrelated = newCreationModel(); unrelated.title = "Unrelated campaign";
    saveCreationDraft(scope(), "published-id", published, true); saveCreationDraft(scope(), "unrelated-id", unrelated, true);
    localStorage.setItem(`${scope()}:receipt`, JSON.stringify({ txHash: mockTxA, draftId: "published-id", title: published.title }));
    mockPending.pendingTransactions = [pendingRecord("waiting")];
    const view = render(<CreationWorkspace />);
    await screen.findByRole("button", { name: "Expand publishing progress", hidden: true });
    mockPending.pendingTransactions = [pendingRecord("finalized")]; view.rerender(<CreationWorkspace />);
    await waitFor(() => expect(readCreationStore(scope()).drafts.map(record => record.id)).toEqual(["unrelated-id"]));
  });

  it("does not offer an already-finalized receipt draft for resume on a new mount", async () => {
    const published = newCreationModel(); published.title = "Already published campaign";
    const unrelated = newCreationModel(); unrelated.title = "Unrelated campaign";
    saveCreationDraft(scope(), "published-id", published, true); saveCreationDraft(scope(), "unrelated-id", unrelated, true);
    localStorage.setItem(`${scope()}:receipt`, JSON.stringify({ txHash: mockTxA, draftId: "published-id", title: published.title }));
    mockPending.pendingTransactions = [pendingRecord("finalized")]; render(<CreationWorkspace />);
    await waitFor(() => expect(readCreationStore(scope()).drafts.map(record => record.id)).toEqual(["unrelated-id"]));
    if (!screen.queryByRole("dialog", { name: "Campaign drafts" })) {
      await waitForEditor();
      fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    }
    expect(screen.queryByRole("radio", { name: /Already published campaign/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Unrelated campaign/ })).toBeInTheDocument();
  });
});
