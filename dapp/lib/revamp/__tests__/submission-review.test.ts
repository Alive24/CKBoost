import type { QuestDataLike } from "ssri-ckboost/types";
import { buildReviewExport, buildReviewQueue, escapeReviewCsvCell, getScopedReviewCounts, reconcileReviewSelection, resolveReviewQuestContent, type ReviewSubmission } from "../submission-review";

const quest = (id: number, accepted: string[] = []) => ({quest_id: id, metadata: {title: `Quest ${id}`}, accepted_submission_user_type_ids: accepted, sub_tasks: []}) as unknown as QuestDataLike;
const submission = (id: string, questId: number, time: number, content = "Response"): ReviewSubmission => ({userTypeId: id, campaign_type_id: "0x11", quest_id: questId, submission_timestamp: time, submission_content: content});

describe("submission review queue", () => {
  it("counts current contributor/quest responses once and keeps campaign totals independent of filters", () => {
    const queue = buildReviewQueue([quest(0), quest(1, ["0xAA"])], new Map([
      [0, [submission("0xAA", 0, 100), submission("0xaa", 0, 200, "Edited"), submission("0xbb", 0, 300)]],
      [1, [submission("0xaa", 1, 100)]],
    ]));
    expect(queue.totals).toEqual({participants: 2, submissions: 3, pending: 2, approved: 1});
    expect(queue.byQuest.get(0)?.[0].submission_content).toBe("Edited");
    expect(getScopedReviewCounts(queue, "0")).toEqual({pending: 2, approved: 0});
    expect(getScopedReviewCounts(queue, "1")).toEqual({pending: 0, approved: 1});
    expect(queue.totals.submissions).toBe(3);
  });

  it("preserves a visible selected contributor after refresh and selects the first remaining row otherwise", () => {
    const rows = buildReviewQueue([quest(1)], new Map([[1, [submission("0xaa", 1, 100), submission("0xbb", 1, 200)]]])).byQuest.get(1)!;
    expect(reconcileReviewSelection(rows, "1:0xbb")).toBe("1:0xbb");
    expect(reconcileReviewSelection(rows.slice(0, 1), "1:0xbb")).toBe("1:0xaa");
    expect(reconcileReviewSelection([], "1:0xaa")).toBeNull();
  });

  it("quotes CSV delimiters/newlines and neutralizes spreadsheet formulas", () => {
    expect(escapeReviewCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(escapeReviewCsvCell(" =SUM(A1:A2)")).toBe('"\' =SUM(A1:A2)"');
  });

  it("exports the complete selected quest across both statuses and preserves long responses", async () => {
    const longText = "long response ".repeat(3000);
    const selectedQuest = quest(1, ["0xbb"]);
    const queue = buildReviewQueue([selectedQuest], new Map([[1, [submission("0xaa", 1, 100, longText), submission("0xbb", 1, 200, "Accepted response")]]]));
    const exported = await buildReviewExport({format: "csv", campaignTitle: "Campaign", campaignTypeId: "0xcc", quest: selectedQuest, rows: queue.byQuest.get(1)!, userDetails: new Map()});
    expect(exported.content.includes(longText.trim())).toBe(true);
    expect(exported.content).toContain("Pending review");
    expect(exported.content).toContain("Approved");
    expect(exported.filename).toBe("Campaign-quest-1-submissions.csv");
  });

  it("exports a real 2026 submission timestamp as milliseconds without multiplying it",async()=>{
    const timestamp=Date.parse("2026-11-18T08:30:00.000Z"),selectedQuest=quest(0);
    const queue=buildReviewQueue([selectedQuest],new Map([[0,[submission("0xaa",0,timestamp)]]]));
    for(const format of ["csv","markdown"] as const){
      const result=await buildReviewExport({format,campaignTitle:"Campaign",campaignTypeId:"0xcc",quest:selectedQuest,rows:queue.byQuest.get(0)!,userDetails:new Map()});
      expect(result.content).toContain("2026-11-18T08:30:00.000Z");
      expect(result.content).not.toContain("1970-");
    }
  });

  it("uses a safe code fence around untrusted Markdown evidence without truncation", async () => {
    const selectedQuest = quest(0);
    const queue = buildReviewQueue([selectedQuest], new Map([[0, [submission("0xaa", 0, 100, "```\n<img src=x onerror=alert(1)>\n```")]]]));
    const exported = await buildReviewExport({format: "markdown", campaignTitle: "Campaign", campaignTypeId: "0xcc", quest: selectedQuest, rows: queue.byQuest.get(0)!, userDetails: new Map()});
    expect(exported.content).toContain("````text\n```\n<img");
    expect(exported.content).toContain("Pending review");
  });

  it("resolves organizer field labels from a referenced quest payload", async () => {
    const stub = {...quest(1), metadata: {title: "On-chain title", long_description: "nevent1reference"}} as QuestDataLike;
    const fetcher = jest.fn(async () => ({content: JSON.stringify({format: "ckboost-campaign-quest-content", version: 1, quest_id: 1, metadata: {title: "Organizer title", short_description: "Summary", long_description: "Requirements", requirements: "Proof"}, sub_tasks: [{title: "Organizer's question", description: "", type: "text", proof_required: "", required_response: true}]})}));
    const resolved = await resolveReviewQuestContent(stub, fetcher);
    expect(resolved.sub_tasks[0].title).toBe("Organizer's question");
    expect(resolved.metadata.title).toBe("Organizer title");
    expect(fetcher).toHaveBeenCalledWith("nevent1reference");
  });

  it("fails closed for missing or incorrectly scoped quest requirements and leaves inline legacy quests unchanged", async () => {
    const inline = quest(1);
    const unused = jest.fn();
    expect(await resolveReviewQuestContent(inline, unused)).toBe(inline);
    expect(unused).not.toHaveBeenCalled();
    const stub = {...inline, metadata: {...inline.metadata, long_description: "nevent1reference"}};
    await expect(resolveReviewQuestContent(stub, async () => null)).rejects.toThrow("could not be loaded");
    const wrongQuest = JSON.stringify({format: "ckboost-campaign-quest-content", version: 1, quest_id: 2, metadata: {title: "Title", short_description: "", long_description: "", requirements: ""}, sub_tasks: []});
    await expect(resolveReviewQuestContent(stub, async () => ({content: wrongQuest}))).rejects.toThrow("different quest");
  });
});
