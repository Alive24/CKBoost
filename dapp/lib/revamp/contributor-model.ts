import { isNostrSubmissionData } from "@/types/submission";
import { normalizePermissionHash } from "./campaign-permissions";

export interface ContributorTask { title?: string; description?: string; type?: string; proof_required?: string; required_response?: boolean }
export type ContributorResponses = Record<number, string>;
export function contributorTasks(tasks: readonly ContributorTask[]): readonly ContributorTask[] { return tasks.length ? tasks : [{title:"Your response",type:"Text",description:"Provide evidence that you completed this quest."}]; }
export function responseHasContent(value: string): boolean {
  return Boolean(value.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160);/gi, " ").trim() || /<(?:img|video|audio)\b[^>]+src\s*=/i.test(value));
}
export function contributorFieldKind(task: ContributorTask): "link" | "file" | "social" | "text" {
  const type = (task.type ?? "").toLowerCase();
  if (/file|image|upload|attachment/.test(type)) return "file";
  if (/link|url/.test(type)) return "link";
  if (/social|telegram|twitter|discord/.test(type)) return "social";
  return "text";
}
export function validateContributorResponses(tasks: readonly ContributorTask[], responses: ContributorResponses): Record<number, string> {
  const errors: Record<number, string> = {};
  tasks.forEach((task, index) => {
    const response = responses[index] ?? "";
    if (task.required_response === true && !responseHasContent(response)) errors[index] = "This response is required.";
    if (response.trim() && ["link", "file"].includes(contributorFieldKind(task)) && !(contributorFieldKind(task)==="file" && isContributorFile(response))) {
      try { const url = new URL(response.trim()); if (!["https:","http:"].includes(url.protocol)) throw new Error(); }
      catch { errors[index] = "Enter a public HTTP or HTTPS link."; }
    }
  });
  if (!tasks.some((_,index)=>responseHasContent(responses[index] ?? "")) && !Object.keys(errors).length) errors[0] = "Provide at least one response for this quest.";
  return errors;
}
export const MAX_CONTRIBUTOR_FILE_BYTES = 10 * 1024 * 1024;
export function isContributorFile(value: string): boolean {
  try {
    const file=JSON.parse(value) as Record<string,unknown>;
    if(file.format!=="ckboost-file" || typeof file.name!=="string" || typeof file.type!=="string" || typeof file.size!=="number" || !Number.isSafeInteger(file.size) || file.size<=0 || file.size>MAX_CONTRIBUTOR_FILE_BYTES || typeof file.data_url!=="string" || file.data_url.length>Math.ceil(MAX_CONTRIBUTOR_FILE_BYTES*4/3)+256)return false;
    const encoded=/^data:[^;,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.data_url)?.[1];
    if(!encoded || encoded.length%4!==0)return false;
    const decodedBytes=encoded.length*3/4-(encoded.endsWith("==")?2:encoded.endsWith("=")?1:0);
    return decodedBytes===file.size;
  } catch {return false;}
}
export function parseContributorResponses(content: string, count: number): ContributorResponses | null {
  try { const value: unknown = JSON.parse(content); if (isNostrSubmissionData(value)) return Object.fromEntries(value.subtasks.slice(0,count).map((task,index) => [index,task.response])); } catch { /* Legacy text remains editable in the first field. */ }
  return count && content.trim() && !content.startsWith("nevent1") ? {0: content} : null;
}
export function contributorDraftKey(protocol: string, account: string, campaign: string, questId: number): string {
  const ids = [protocol,account,campaign].map(normalizePermissionHash);
  if (ids.some(id => !id) || !Number.isSafeInteger(questId) || questId < 0) throw new Error("A complete account, protocol, campaign and quest identity is required.");
  return `ckboost:revamp:quest-draft:v1:${ids.join(":")}:${questId}`;
}
export function readContributorDraft(value: string | null, count: number): ContributorResponses | null {
  if (!value || value.length > 20_000_000) return null;
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== "object" || (data as {version?:unknown}).version !== 1) return null;
    const responses = (data as {responses?:unknown}).responses;
    if (!responses || typeof responses !== "object" || Array.isArray(responses)) return null;
    const result: ContributorResponses = {};
    for (const [key,response] of Object.entries(responses)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= count || typeof response !== "string") return null;
      result[index] = response;
    }
    return result;
  } catch { return null; }
}
export function buildContributorSubmission(tasks: readonly ContributorTask[], responses: ContributorResponses, timestamp = Date.now()): string {
  return JSON.stringify({format:"json", version:"1.0", timestamp, subtasks:tasks.map((task,index) => ({title:task.title || `Task ${index+1}`, description:task.description, type:task.type, proof_required:task.proof_required, response:responses[index] ?? ""}))});
}
