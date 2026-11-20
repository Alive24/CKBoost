import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreationWorkspace } from "../creation-workspace";
import { publishCreation } from "@/lib/revamp/creation-publish";
import { creationStorageKey, readCreationStore, saveCreationDraft } from "@/lib/revamp/creation-store";
import { newCreationModel } from "@/lib/revamp/creation-model";

const hash=(value:string)=>`0x${value.repeat(64)}`;
const mockAdmin=hash("a"),mockProtocolHash=hash("b"),mockOutsider=hash("c");
const mockClient={},mockOpen=jest.fn(),mockPush=jest.fn();
const mockAdminSigner={getRecommendedAddressObj:async()=>({script:{hash:()=>mockAdmin}})};
const mockOutsiderSigner={getRecommendedAddressObj:async()=>({script:{hash:()=>mockOutsider}})};
let mockSigner:typeof mockAdminSigner|undefined;
const mockProtocol={protocolCell:{cellOutput:{type:{hash:()=>mockProtocolHash}}},protocolData:{protocol_config:{admin_lock_hash_vec:[mockAdmin]},campaigns_approved:[]},error:null};
const mockPending={pendingTransactions:[],refresh:jest.fn(),explorerBaseUrl:"https://example.com/tx/"};
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{useSigner:()=>mockSigner,useCcc:()=>({client:mockClient,open:mockOpen}),hexFrom:(value:string)=>value}}));
jest.mock("@/lib/revamp/creation-access",()=>({useCreationAuthorization:()=>{
  const React=require("react");
  const [resolved,setResolved]=React.useState(null as null|{signer:typeof mockSigner;hash:string});
  React.useEffect(()=>{let cancelled=false;if(mockSigner){const current=mockSigner;current.getRecommendedAddressObj().then(address=>{if(!cancelled)setResolved({signer:current,hash:address.script.hash()});});}return()=>{cancelled=true;};},[mockSigner]);
  const snapshot=resolved&&resolved.signer===mockSigner?{...mockProtocol,lockHash:resolved.hash,capabilities:{canCreateCampaign:mockProtocol.protocolData.protocol_config.admin_lock_hash_vec.includes(resolved.hash),canEditCampaign:false}}:undefined;
  return {snapshot,loading:Boolean(mockSigner&&!snapshot),error:undefined};
}}));
jest.mock("@/lib/revamp/creation-submission-check",()=>({useCreationSubmissionCheck:()=>({result:undefined,loading:false,error:undefined})}));
jest.mock("@/lib/providers/pending-transaction-provider",()=>({usePendingTransactions:()=>mockPending}));
jest.mock("@/hooks/use-nostr-fetch",()=>({useNostrFetch:()=>({fetchSubmission:jest.fn()})}));
jest.mock("@/hooks/use-nostr-storage",()=>({useNostrStorage:()=>({storeCampaignContent:{mutateAsync:jest.fn()}})}));
jest.mock("@/hooks/use-campaign-cover-image",()=>({useCampaignCoverImage:()=>({src:null,isLoading:false})}));
jest.mock("@/lib/revamp/campaign-rewards",()=>({buildCampaignRewards:()=>[]}));
jest.mock("@/lib/revamp/creation-publish",()=>({publishCreation:jest.fn()}));
jest.mock("@/lib/ckb/campaign-cells",()=>({fetchCampaignByTypeId:jest.fn()}));
jest.mock("@/lib/ckb/deployment-manager",()=>({deploymentManager:{getCurrentNetwork:()=>"testnet"}}));
jest.mock("next/navigation",()=>({useRouter:()=>({push:mockPush})}));
jest.mock("../site-shell",()=>({RevampSiteShell:({children}:{children:React.ReactNode})=><div>{children}</div>}));
jest.mock("../theme",()=>({useRevampTheme:()=>({portalContainer:document.body,theme:"dark"})}));

describe("organizer workspace account and draft behavior",()=>{
  beforeAll(()=>Object.defineProperty(crypto,"randomUUID",{configurable:true,value:()=>"new-draft-id"}));
  beforeEach(()=>{localStorage.clear();jest.clearAllMocks();mockSigner=undefined;});
  it("shows a read-only Figma form and connect action to visitors",()=>{
    render(<CreationWorkspace/>);
    expect(screen.getByRole("heading",{name:"Create campaign"})).toBeInTheDocument();
    expect(screen.getByRole("textbox",{name:"Campaign title"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Save draft"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Connect wallet"}));expect(mockOpen).toHaveBeenCalledTimes(1);
  });
  it("enables an actual admin, then clears and disables the form immediately after a wallet switch",async()=>{
    mockSigner=mockAdminSigner;const view=render(<CreationWorkspace/>);
    const title=screen.getByRole("textbox",{name:"Campaign title"});await waitFor(()=>expect(title).toBeEnabled());
    fireEvent.change(title,{target:{value:"Admin draft"}});
    mockSigner=mockOutsiderSigner;view.rerender(<CreationWorkspace/>);
    expect(title).toBeDisabled();await waitFor(()=>expect(title).toHaveValue(""));
    await waitFor(()=>expect(screen.getByText("Only a currently authorized Organizer or platform admin can create campaigns.")).toBeInTheDocument());
    expect(publishCreation).not.toHaveBeenCalled();
  });
  it("requires explicit draft resume and confirms replacing the current form",async()=>{
    const key=creationStorageKey({network:"testnet",protocol:mockProtocolHash,wallet:mockAdmin});
    const draft=newCreationModel();draft.title="Saved onboarding";saveCreationDraft(key,"saved-id",draft,true);
    mockSigner=mockAdminSigner;render(<CreationWorkspace/>);
    await screen.findByRole("dialog",{name:"Campaign drafts"});
    expect(screen.getByRole("textbox",{name:"Campaign title",hidden:true})).toHaveValue("");
    fireEvent.click(screen.getByRole("button",{name:"Resume draft"}));
    expect(await screen.findByRole("dialog",{name:"Resume this draft?"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Confirm replacement"}));
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Campaign title"})).toHaveValue("Saved onboarding"));
  });
  it("autosaves only into the active account scope and supports more than one category",async()=>{
    mockSigner=mockAdminSigner;render(<CreationWorkspace/>);
    const title=screen.getByRole("textbox",{name:"Campaign title"});await waitFor(()=>expect(title).toBeEnabled());
    fireEvent.change(title,{target:{value:"My new campaign"}});
    const categories=screen.getByRole("textbox",{name:"Campaign categories"});
    fireEvent.change(categories,{target:{value:"Development,"}});expect(categories).toHaveValue("Development,");
    fireEvent.change(categories,{target:{value:"Development, Education"}});
    const key=creationStorageKey({network:"testnet",protocol:mockProtocolHash,wallet:mockAdmin});
    await waitFor(()=>expect(readCreationStore(key).drafts[0]?.autosaved).toMatchObject({title:"My new campaign",categories:["Development","Education"]}),{timeout:1600});
    expect(readCreationStore(creationStorageKey({network:"testnet",protocol:mockProtocolHash,wallet:mockOutsider})).drafts).toEqual([]);
  });
  it("flushes an authorized draft on unmount before the autosave debounce expires",async()=>{
    mockSigner=mockAdminSigner;const view=render(<CreationWorkspace/>);
    const title=screen.getByRole("textbox",{name:"Campaign title"});await waitFor(()=>expect(title).toBeEnabled());
    fireEvent.change(title,{target:{value:"Last keystroke before Back"}});view.unmount();
    const key=creationStorageKey({network:"testnet",protocol:mockProtocolHash,wallet:mockAdmin});
    expect(readCreationStore(key).drafts[0]?.autosaved?.title).toBe("Last keystroke before Back");
  });
  it("flushes on browser traversal without rewinding or injecting history entries",async()=>{
    mockSigner=mockAdminSigner;render(<CreationWorkspace/>);
    const title=screen.getByRole("textbox",{name:"Campaign title"});await waitFor(()=>expect(title).toBeEnabled());
    fireEvent.change(title,{target:{value:"Latest browser Back draft"}});
    const back=jest.spyOn(history,"back"),go=jest.spyOn(history,"go"),push=jest.spyOn(history,"pushState");
    window.dispatchEvent(new PopStateEvent("popstate"));
    const key=creationStorageKey({network:"testnet",protocol:mockProtocolHash,wallet:mockAdmin});
    expect(readCreationStore(key).drafts[0]?.autosaved?.title).toBe("Latest browser Back draft");
    expect(back).not.toHaveBeenCalled();expect(go).not.toHaveBeenCalled();expect(push).not.toHaveBeenCalled();
    back.mockRestore();go.mockRestore();push.mockRestore();
  });
  it("keeps an explicit saved draft after wallet rejection and never shows confirmed success",async()=>{
    mockSigner=mockAdminSigner;jest.mocked(publishCreation).mockRejectedValueOnce(new Error("Wallet rejected the signature"));render(<CreationWorkspace/>);
    const title=screen.getByRole("textbox",{name:"Campaign title"});await waitFor(()=>expect(title).toBeEnabled());
    for(const [label,value] of [["Campaign title","Ready campaign"],["Campaign summary","Summary"],["Full description","Instructions"],["Start time","2026-11-18T09:00"],["End time","2026-12-18T09:00"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
    fireEvent.click(screen.getByRole("tab",{name:"Quests"}));fireEvent.change(screen.getByRole("textbox",{name:"Quest 1 title"}),{target:{value:"First quest"}});
    fireEvent.click(screen.getByRole("button",{name:"Launch campaign"}));await waitFor(()=>expect(publishCreation).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByText("Wallet rejected the signature")).not.toHaveLength(0);
    expect(screen.queryByText("Campaign confirmed",{exact:true})).not.toBeInTheDocument();
    const key=creationStorageKey({network:"testnet",protocol:mockProtocolHash,wallet:mockAdmin});expect(readCreationStore(key).drafts[0].saved?.title).toBe("Ready campaign");
  });
  it("adds required subtasks by default and restores deleted draft subtasks with Undo",async()=>{
    mockSigner=mockAdminSigner;render(<CreationWorkspace/>);
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Campaign title"})).toBeEnabled());
    fireEvent.click(screen.getByRole("tab",{name:"Quests"}));fireEvent.click(screen.getByRole("button",{name:"Add subtask"}));
    expect(screen.getByRole("checkbox",{name:"Required response"})).toBeChecked();
    fireEvent.change(screen.getByRole("textbox",{name:"Quest 1 subtask 1 title"}),{target:{value:"My repository"}});
    fireEvent.click(screen.getByRole("button",{name:"Delete subtask 1 from quest 1"}));
    expect(screen.queryByRole("textbox",{name:"Quest 1 subtask 1 title"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Undo"}));
    expect(screen.getByRole("textbox",{name:"Quest 1 subtask 1 title"})).toHaveValue("My repository");
    expect(screen.getByRole("checkbox",{name:"Required response"})).toBeChecked();
  });
  it("searches named zones and preserves the absolute instant when changing the selected zone",async()=>{
    mockSigner=mockAdminSigner;render(<CreationWorkspace/>);
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Campaign title"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:"Campaign time zone"}));
    fireEvent.click(screen.getByRole("option",{name:"UTC"}));
    fireEvent.change(screen.getByLabelText("Start time"),{target:{value:"2026-11-18T09:00"}});
    fireEvent.click(screen.getByRole("button",{name:"Campaign time zone"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Search named time zones"}),{target:{value:"New York"}});
    fireEvent.click(screen.getByRole("option",{name:"America/New_York"}));
    expect(screen.getByLabelText("Start time")).toHaveValue("2026-11-18T04:00");
    expect(screen.getByText(/UTC-05:00.*America\/New_York/)).toBeInTheDocument();
  });
});
