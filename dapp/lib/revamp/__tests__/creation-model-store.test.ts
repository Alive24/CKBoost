import type { CampaignDataLike } from "ssri-ckboost/types";
import { applyCreationTemplate, cloneCreation, creationFromCampaign, creationScheduleUnix, getCreationQuestDeletionReason, newCreationModel, newCreationQuest, validateCreation } from "../creation-model";
import { encodeCreationDescription } from "../creation-content";
import { creationStorageKey, discardCreationChanges, readCreationStore, saveCreationDraft, saveCreationTemplate } from "../creation-store";

const hash=(value:string)=>`0x${value.repeat(64)}`;
const key=creationStorageKey({network:"testnet",protocol:hash("a"),wallet:hash("b")});
function valid(){const model=newCreationModel("UTC");Object.assign(model,{title:"Learn CKB",summary:"Hands-on lessons",description:"Build a transaction",start:"2026-11-18T09:00",end:"2026-12-18T09:00"});model.quests[0].title="Start here";return model;}

describe("organizer drafts, templates and setup validation",()=>{
  beforeAll(()=>Object.defineProperty(crypto,"randomUUID",{configurable:true,value:()=>"test-template-id"}));
  beforeEach(()=>localStorage.clear());
  it("scopes drafts to the network, full protocol and full connected lock hash",()=>{
    saveCreationDraft(key,"draft-a",valid(),true);
    expect(readCreationStore(key).drafts).toHaveLength(1);
    expect(readCreationStore(creationStorageKey({network:"mainnet",protocol:hash("a"),wallet:hash("b")})).drafts).toEqual([]);
    expect(readCreationStore(creationStorageKey({network:"testnet",protocol:hash("a"),wallet:hash("c")})).drafts).toEqual([]);
    expect(()=>creationStorageKey({network:"testnet",protocol:"0x123",wallet:hash("b")})).toThrow();
  });
  it("keeps the explicit saved version separate from later autosaves, and discards only newer changes",()=>{
    const saved=valid();saveCreationDraft(key,"a",saved,true);
    saveCreationDraft(key,"a",{...saved,title:"Unsaved edit"});
    expect(readCreationStore(key).drafts[0]).toMatchObject({saved:{title:"Learn CKB"},autosaved:{title:"Unsaved edit"}});
    discardCreationChanges(key,"a");
    expect(readCreationStore(key).drafts[0].autosaved?.title).toBe("Learn CKB");
    saveCreationDraft(key,"new",saved);discardCreationChanges(key,"new");
    expect(readCreationStore(key).drafts.map(record=>record.id)).toEqual(["a"]);
  });
  it("round-trips exact chain BigInts without mutating the editor snapshot",()=>{
    const model=valid();model.quests[0].original={points:9007199254740993n} as NonNullable<typeof model.quests[0]["original"]>;
    saveCreationDraft(key,"a",model,true);model.title="Changed after save";
    const restored=readCreationStore(key).drafts[0].saved!;
    expect(restored.title).toBe("Learn CKB");expect(restored.quests[0].original?.points).toBe(9007199254740993n);
  });
  it("applies empty template rules and eligibility and regenerates only new draft IDs",()=>{
    const current=valid();current.rules=["Old rule"];current.verification=32;current.staff=[hash("c")];current.nextQuestId=9;
    const template=valid();template.title="Template";template.rules=[];template.verification=0;template.start="2000-01-01T00:00";template.staff=[hash("d")];
    const applied=applyCreationTemplate(current,template);
    expect(applied).toMatchObject({title:"Template",rules:[],verification:0,start:current.start,end:current.end,timeZone:current.timeZone,staff:current.staff,nextQuestId:10});
    expect(applied.quests[0].id).toBe(9);expect(current.rules).toEqual(["Old rule"]);
    current.original={} as CampaignDataLike;expect(()=>applyCreationTemplate(current,template)).toThrow("Published quest IDs");
  });
  it("stores reusable templates without chain state, reviewer assignments or dates",()=>{
    const model=valid();model.original={} as CampaignDataLike;model.staff=[hash("c")];model.sourceOutPoint="old-cell";
    const template=saveCreationTemplate(key,"Reusable",model);
    expect(template.model).toMatchObject({start:"",end:"",staff:[]});expect(template.model.original).toBeUndefined();expect(template.model.sourceOutPoint).toBeUndefined();
    expect(readCreationStore(key).templates[0].name).toBe("Reusable");
  });
  it("preserves rich Quest definitions independently of the chain state removed from templates",()=>{
    const model=valid();model.quests[0].original={metadata:{title:"Quest",short_description:"Short",long_description:"<p>Full instructions</p>",requirements:"Existing evidence policy",difficulty:1,time_estimate:30},rewards_on_completion:[]} as unknown as NonNullable<typeof model.quests[0]["original"]>;
    const template=saveCreationTemplate(key,"Rich quest",model);
    expect(template.model.quests[0]).toMatchObject({longDescription:"<p>Full instructions</p>",requirements:"Existing evidence policy",rewardAssets:[]});
    expect(template.model.quests[0].original).toBeUndefined();
    expect(applyCreationTemplate(valid(),template.model).quests[0].longDescription).toBe("<p>Full instructions</p>");
  });
  it("does not silently export or launch token reward definitions without a funding path",()=>{
    const model=valid();model.quests[0].rewardAssets=[{points_amount:0,ckb_amount:100000001n,nft_assets:[],udt_assets:[]}];
    expect(()=>saveCreationTemplate(key,"Funded campaign",model)).toThrow("token or NFT rewards");
    expect(readCreationStore(key).templates).toEqual([]);
    expect(validateCreation(model)["quest.1.rewards"]).toMatch(/unfunded token/);
    expect(model.quests[0].rewardAssets[0].ckb_amount).toBe(100000001n);
  });
  it("round-trips an existing schedule's seconds and DST overlap while rejecting a newly typed ambiguous clock",()=>{
    const start=Date.parse("2026-11-01T06:30:45Z")/1000,end=Date.parse("2026-11-01T08:00:30Z")/1000;
    const data={metadata:{title:"Old campaign",short_description:"Summary",difficulty:1,categories:[],verification_requirements:[0],image_url:""},starting_time:BigInt(start),ending_time:BigInt(end),quests:[],rules:[],staff_lock_hash_vec:[]} as unknown as CampaignDataLike;
    const restored=creationFromCampaign(data,encodeCreationDescription("Description","America/New_York"),[]);
    expect(restored.start).toBe("2026-11-01T01:30");expect(creationScheduleUnix(restored,"start")).toBe(start);expect(creationScheduleUnix(restored,"end")).toBe(end);
    expect(validateCreation(restored).start).toBeUndefined();
    restored.start="2026-11-01T01:31";expect(()=>creationScheduleUnix(restored,"start")).toThrow("occurs twice");
  });
  it("requires setup fields even when the contributor response is optional",()=>{
    const model=valid();model.quests[0].subtasks=[{id:1,title:"",type:"text",description:"",evidence:"",required:false}];
    expect(validateCreation(model)).toMatchObject({"quest.1.subtask.1.title":expect.any(String),"quest.1.subtask.1.description":expect.any(String)});
    model.quests[0].subtasks[0].title="Share findings";model.quests[0].subtasks[0].description="Write what you learned";
    expect(validateCreation(model)).toEqual({});
  });
  it("validates end after start and stable unique Quest IDs without renumbering",()=>{
    const model=valid();model.end=model.start;model.quests.push(newCreationQuest(1));
    expect(validateCreation(model)).toMatchObject({end:expect.any(String),"quest.1.id":expect.any(String)});
    const copied=cloneCreation(model);copied.quests.reverse();expect(copied.quests.map(quest=>quest.id)).toEqual([1,1]);
  });
  it("reports storage write failure instead of claiming a draft saved",()=>{
    const storage={getItem:()=>null,setItem:()=>{throw new Error("Quota exceeded");}} as unknown as Storage;
    expect(()=>saveCreationDraft(key,"a",valid(),true,storage)).toThrow("Quota exceeded");
  });
  it("allows unused published deletion and explains submission/completion or unverified-history blocks",()=>{
    const quest={accepted_submission_user_type_ids:[],completion_count:0};
    expect(getCreationQuestDeletionReason(quest,0)).toBeUndefined();
    expect(getCreationQuestDeletionReason(quest,undefined)).toMatch(/Checking submission history/);
    expect(getCreationQuestDeletionReason(quest,undefined,true)).toMatch(/could not be verified/);
    expect(getCreationQuestDeletionReason(quest,2)).toMatch(/2 submitted responses/);
    expect(getCreationQuestDeletionReason({...quest,completion_count:1},0)).toMatch(/reward history/);
    expect(getCreationQuestDeletionReason({...quest,accepted_submission_user_type_ids:[hash("d")]},0)).toMatch(/accepted submissions/);
  });
});
