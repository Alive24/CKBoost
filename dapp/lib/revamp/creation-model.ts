import type { AssetListLike, CampaignDataLike, QuestDataLike } from "ssri-ckboost/types";
import { creationUnixTime, creationDateInput, decodeCreationDescription, requiredResponse } from "./creation-content";

export interface CreationSubtask {
  id: number; title: string; type: string; description: string; evidence: string; required?: boolean;
}
export interface CreationQuest {
  id: number; title: string; description: string; difficulty: number; minutes: string; points: string;
  quota: string; ckb: string; subtasks: CreationSubtask[]; nextSubtaskId: number;
  longDescription?:string;requirements?:string;rewardAssets?:AssetListLike[];
  original?: QuestDataLike; requiredLocked?: boolean; deletionBlockedReason?:string;
}
export interface CreationModel {
  title: string; summary: string; description: string; timeZone: string; start: string; end: string;
  difficulty: number; categories: string[]; rules: string[]; verification: number;
  cover: string; coverDirty: boolean; staff: string[]; quests: CreationQuest[]; nextQuestId: number;
  original?: CampaignDataLike; originalDescription?: string; sourceOutPoint?: string;
  scheduleInstants?:{start?:{value:string;timeZone:string;unix:number};end?:{value:string;timeZone:string;unix:number}};
}
export type CreationErrors = Record<string, string>;

export function newCreationQuest(id: number): CreationQuest {
  return {id, title:"", description:"", difficulty:1, minutes:"30", points:"0", quota:"10", ckb:"0", subtasks:[], nextSubtaskId:1};
}

export function newCreationModel(timeZone = "UTC"): CreationModel {
  return {title:"", summary:"", description:"", timeZone, start:"", end:"", difficulty:1, categories:[], rules:[], verification:0, cover:"", coverDirty:false, staff:[], quests:[newCreationQuest(1)], nextQuestId:2};
}

export function creationFromCampaign(data: CampaignDataLike, resolvedDescription: string, resolvedQuests: QuestDataLike[], timeZone = "UTC"): CreationModel {
  const description = decodeCreationDescription(resolvedDescription);
  const zone = description.timeZone ?? timeZone;
  const quests = resolvedQuests.map(quest => ({
    id:Number(quest.quest_id), title:quest.metadata.title, description:quest.metadata.short_description,
    difficulty:Number(quest.metadata.difficulty), minutes:String(quest.metadata.time_estimate), points:String(quest.points),
    quota:"10", ckb:"0", original:quest,
    longDescription:quest.metadata.long_description,requirements:quest.metadata.requirements,rewardAssets:cloneCreation(quest.rewards_on_completion),
    subtasks:quest.sub_tasks.map(subtask => ({id:Number(subtask.id),title:subtask.title,type:subtask.type,description:subtask.description,evidence:subtask.proof_required,required:requiredResponse(subtask)})),
    nextSubtaskId:Math.max(0,...quest.sub_tasks.map(subtask=>Number(subtask.id)))+1,
    requiredLocked:true,
    deletionBlockedReason:getCreationQuestDeletionReason(quest,undefined),
  }));
  const start=creationDateInput(Number(data.starting_time),zone),end=creationDateInput(Number(data.ending_time),zone);
  return {
    title:data.metadata.title, summary:data.metadata.short_description, description:description.description, timeZone:zone,
    start,end,scheduleInstants:{start:{value:start,timeZone:zone,unix:Number(data.starting_time)},end:{value:end,timeZone:zone,unix:Number(data.ending_time)}},
    difficulty:Number(data.metadata.difficulty), categories:[...data.metadata.categories], rules:[...data.rules], verification:Number(data.metadata.verification_requirements[0] || 0),
    cover:data.metadata.image_url,coverDirty:false,staff:data.staff_lock_hash_vec.map(value=>String(value)), quests,
    nextQuestId:Math.max(0,...quests.map(quest=>quest.id))+1,original:data,originalDescription:description.description,
  };
}

/** A configured reward is not evidence of an awarded reward. Prevent orphaning
 * actual submissions/completion records, and verify history before deletion. */
export function getCreationQuestDeletionReason(quest:Pick<QuestDataLike,"accepted_submission_user_type_ids"|"completion_count">,submissionCount:number|undefined,failed=false):string|undefined {
  if(quest.accepted_submission_user_type_ids.length>0)return "This quest has accepted submissions and may have reward records. It cannot be deleted.";
  if(Number(quest.completion_count)>0)return "This quest has completed submissions and reward history. It cannot be deleted.";
  if(failed)return "Submission history could not be verified. Retry the submission check before deleting this quest.";
  if(submissionCount===undefined||!Number.isSafeInteger(submissionCount)||submissionCount<0)return "Checking submission history before this published quest can be deleted.";
  if(submissionCount>0)return `This quest has ${submissionCount} submitted response${submissionCount===1?"":"s"}. It cannot be deleted.`;
  return undefined;
}

export function validateCreation(model: CreationModel): CreationErrors {
  const errors: CreationErrors = {};
  if (!model.title.trim()) errors.title="Enter a campaign title.";
  if (!model.summary.trim()) errors.summary="Enter a one-sentence summary.";
  if (!model.description.trim()) errors.description="Enter the full description.";
  if (![1,2,3].includes(model.difficulty)) errors.difficulty="Choose a supported difficulty.";
  let start:number|undefined; let end:number|undefined;
  try { start=creationScheduleUnix(model,"start"); } catch(error) { errors.start=(error as Error).message; }
  try { end=creationScheduleUnix(model,"end"); } catch(error) { errors.end=(error as Error).message; }
  if (start!==undefined&&end!==undefined&&end <= start) errors.end="End time must be after start time.";
  if (!model.quests.length) errors.quests="Add at least one quest before launch.";
  const ids = new Set<number>();
  for (const quest of model.quests) {
    const key=`quest.${quest.id}`;
    if (!Number.isInteger(quest.id)||quest.id<0||quest.id>0xffffffff||ids.has(quest.id)) errors[`${key}.id`]="Quest IDs must be unique and stable.";
    ids.add(quest.id);
    if (!quest.title.trim()) errors[`${key}.title`]="Enter a quest title.";
    if (![1,2,3].includes(quest.difficulty)) errors[`${key}.difficulty`]="Choose a supported quest difficulty.";
    if (!/^\d+$/.test(quest.points)||BigInt(quest.points)>=(1n<<128n)) errors[`${key}.points`]="Enter a whole number of points within the supported range.";
    if (!/^\d+$/.test(quest.minutes)||BigInt(quest.minutes)>0xffffffffn) errors[`${key}.minutes`]="Enter a valid estimated time in minutes.";
    if (!/^\d+$/.test(quest.quota)||BigInt(quest.quota)>0xffffffffn) errors[`${key}.quota`]="Enter a valid reward quota.";
    if (!/^\d+(\.\d{1,8})?$/.test(quest.ckb)) errors[`${key}.ckb`]="Enter a CKB amount with up to eight decimals.";
    if(!quest.original&&hasCreationTokenRewards(quest.rewardAssets??[]))errors[`${key}.rewards`]="This editor cannot launch unfunded token or NFT reward definitions. Configure those rewards with the existing funding workflow.";
    const subtasks = new Set<number>();
    for (const subtask of quest.subtasks) {
      const subkey=`${key}.subtask.${subtask.id}`;
      if (!Number.isInteger(subtask.id)||subtask.id<1||subtask.id>255||subtasks.has(subtask.id)) errors[`${subkey}.id`]="Subtask IDs must be unique, from 1 to 255.";
      subtasks.add(subtask.id);
      if (!subtask.title.trim()) errors[`${subkey}.title`]="Enter a subtask title.";
      if (!subtask.description.trim()) errors[`${subkey}.description`]="Enter subtask instructions.";
      if (!subtask.type.trim()) errors[`${subkey}.type`]="Select a response type.";
      // Required response is independent of required organizer setup fields.
    }
  }
  if (new Set(model.staff.map(hash=>hash.toLowerCase())).size!==model.staff.length || model.staff.some(hash=>!/^0x[0-9a-f]{64}$/i.test(hash))) errors.staff="Reviewers require unique full lock hashes.";
  return errors;
}

export function hasCreationTokenRewards(assets:readonly AssetListLike[]):boolean {
  const nonzero=(amount:unknown)=>{
    if(typeof amount!=="string"&&typeof amount!=="number"&&typeof amount!=="bigint")return true;
    if(typeof amount==="number"&&!Number.isSafeInteger(amount))return true;
    try{return BigInt(amount)!==0n;}catch{return true;}
  };
  return assets.some(asset=>nonzero(asset.ckb_amount)||(asset.nft_assets?.length??0)>0||asset.udt_assets?.some(token=>nonzero(token.amount)));
}

/** Retain an existing absolute instant (including seconds and a DST fold) until
 * the visible schedule actually changes. Newly typed ambiguous clocks reject. */
export function creationScheduleUnix(model:CreationModel,field:"start"|"end"):number {
  const retained=model.scheduleInstants?.[field];
  if(retained&&retained.value===model[field]&&retained.timeZone===model.timeZone&&Number.isSafeInteger(retained.unix)&&retained.unix>=0&&creationDateInput(retained.unix,retained.timeZone)===retained.value)return retained.unix;
  const unix=creationUnixTime(model[field],model.timeZone);
  if(!Number.isSafeInteger(unix)||unix<0)throw new Error("Choose a date on or after January 1, 1970.");
  return unix;
}

export function decimalCreationUnits(value: string, decimals = 8): bigint {
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(value)) throw new Error("Invalid token amount.");
  const [whole,fraction=""] = value.split(".");
  return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,"0") || "0");
}

export function cloneCreation<T>(value: T): T {
  return JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==="bigint"?{__ckboost_bigint:item.toString()}:item),(_key,item)=>item&&typeof item==="object"&&Object.keys(item).length===1&&typeof item.__ckboost_bigint==="string"?BigInt(item.__ckboost_bigint):item) as T;
}

export function applyCreationTemplate(current: CreationModel, template: CreationModel): CreationModel {
  if (current.original) throw new Error("Templates can only replace a new campaign draft. Published quest IDs are preserved when editing.");
  const next=cloneCreation(template);
  // Copy settings even when empty. Dates, reviewer assignments, chain state and
  // submission/approval state never come from a reusable template.
  return {...next,start:current.start,end:current.end,timeZone:current.timeZone,scheduleInstants:current.scheduleInstants,staff:[...current.staff],original:current.original,originalDescription:current.originalDescription,sourceOutPoint:current.sourceOutPoint,
    quests:next.quests.map((quest,index)=>({...quest,id:current.nextQuestId+index,original:undefined,requiredLocked:false,deletionBlockedReason:undefined})),
    nextQuestId:current.nextQuestId+next.quests.length};
}
