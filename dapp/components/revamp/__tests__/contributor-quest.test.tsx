import { fireEvent,render,screen } from "@testing-library/react";
import { ContributorQuest } from "../contributor-quest";
let mockAccepted=false,mockPending=false;
jest.mock("@ckb-ccc/connector-react",()=>({ccc:{useCcc:()=>({open:jest.fn()}),numFrom:(value:number)=>BigInt(value)}}));
jest.mock("@/lib/revamp/contributor-data",()=>({contributorQuestState:()=>({accepted:mockAccepted,submission:mockPending?{submission_timestamp:Date.parse("2026-11-03T10:00:00Z")}:null}),contributorCapabilities:()=>({submissionsOpen:true,canSubmitQuest:!mockPending&&!mockAccepted,canEditSubmission:mockPending&&!mockAccepted})}));
jest.mock("../contributor-rich-text",()=>({ContributorRichText:({content}:{content:string})=><p>{content}</p>}));
jest.mock("../submission-evidence",()=>({SafeEvidenceValue:({value}:{value:string})=><p>{value || "-"}</p>}));
const hash=(letter:string)=>`0x${letter.repeat(64)}`;
const quest={quest_id:1,points:5,metadata:{title:"Do this",short_description:"Steps"},sub_tasks:[{title:"Required proof",type:"Text",required_response:true}]};
function props(){return{quest,index:0,expanded:true,onToggle:jest.fn(),data:{campaign:{typeId:hash("c")},protocol:{},signer:{},identity:{lockHash:hash("a"),protocolHash:hash("b"),userTypeId:hash("d")},eligible:true,evidence:{1:JSON.stringify({format:"json",version:"1.0",timestamp:1,subtasks:[{title:"Required proof",response:"Original saved response"}]})},evidenceErrors:{},contentErrors:{},reload:jest.fn()},submission:{busy:false,submit:jest.fn()}} as unknown as Parameters<typeof ContributorQuest>[0];}
beforeEach(()=>{mockAccepted=false;mockPending=false;localStorage.clear();});
describe("quest response editing",()=>{
  it("keeps an incomplete submit focusable, prevents publication and clears its required error as evidence is entered",()=>{
    const setup=props();render(<ContributorQuest {...setup}/>);
    fireEvent.click(screen.getByRole("button",{name:"Start quest"}));
    const submit=screen.getByRole("button",{name:"Submit quest"});
    expect(submit).not.toBeDisabled();expect(submit).toHaveAttribute("aria-disabled","true");
    submit.focus();expect(submit).toHaveFocus();fireEvent.click(submit);
    expect(screen.getByText("This response is required.")).toBeInTheDocument();expect(setup.submission.submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox",{name:/Required proof/}),{target:{value:"My evidence"}});
    expect(screen.queryByText("This response is required.")).not.toBeInTheDocument();expect(submit).not.toHaveAttribute("aria-disabled");
  });
  it("prefills a pending response, cancels changes, and never presents unsaved edits as an approved response",()=>{
    mockPending=true;const setup=props();const {rerender}=render(<ContributorQuest {...setup}/>);
    expect(screen.getByText(/Last submitted.*2026.*UTC/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Edit submission"}));
    const field=screen.getByRole("textbox",{name:/Required proof/});expect(field).toHaveValue("Original saved response");
    fireEvent.change(field,{target:{value:"Unsaved draft"}});
    mockAccepted=true;rerender(<ContributorQuest {...setup}/>);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();expect(screen.getByText("Original saved response")).toBeInTheDocument();expect(screen.queryByText("Unsaved draft")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Save changes"})).not.toBeInTheDocument();
  });
});
