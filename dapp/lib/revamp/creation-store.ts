import { cloneCreation, hasCreationTokenRewards, type CreationModel } from "./creation-model";

export interface CreationDraftRecord {id:string; title:string; updatedAt:number; saved?:CreationModel; autosaved?:CreationModel}
export interface CreationTemplateRecord {id:string; name:string; updatedAt:number; model:CreationModel}
interface CreationStore {version:1; drafts:CreationDraftRecord[]; templates:CreationTemplateRecord[]}
const empty = (): CreationStore => ({version:1,drafts:[],templates:[]});

export function creationStorageKey(scope: {network:string;protocol:string;wallet:string}): string {
  if (!scope.network || !/^0x[0-9a-f]{64}$/i.test(scope.protocol) || !/^0x[0-9a-f]{64}$/i.test(scope.wallet)) throw new Error("An account and protocol are required to save this draft.");
  return `ckboost:revamp:creation:v1:${scope.network}:${scope.protocol.toLowerCase()}:${scope.wallet.toLowerCase()}`;
}
export function readCreationStore(key: string, storage?: Storage): CreationStore {
  try {
    const raw=(storage??window.localStorage).getItem(key);
    if (!raw) return empty();
    const parsed=JSON.parse(raw,(_key,value)=>value&&typeof value==="object"&&Object.keys(value).length===1&&typeof value.__ckboost_bigint==="string"?BigInt(value.__ckboost_bigint):value) as CreationStore;
    return parsed.version===1&&Array.isArray(parsed.drafts)&&Array.isArray(parsed.templates)?parsed:empty();
  } catch {return empty();}
}
function write(key:string,store:CreationStore,storage?:Storage) {
  (storage??window.localStorage).setItem(key,JSON.stringify(store,(_key,value)=>typeof value==="bigint"?{__ckboost_bigint:value.toString()}:value));
}
export function saveCreationDraft(key:string,id:string,model:CreationModel,explicit=false,storage?:Storage): CreationDraftRecord {
  const store=readCreationStore(key,storage);
  const existing=store.drafts.find(record=>record.id===id);
  const copy=cloneCreation(model);
  const record={...existing,id,title:model.title.trim()||"Untitled campaign",updatedAt:Date.now(),autosaved:copy,...(explicit?{saved:copy}:{})};
  store.drafts=[record,...store.drafts.filter(item=>item.id!==id)].slice(0,30);
  write(key,store,storage);
  return record;
}
export function discardCreationChanges(key:string,id:string,storage?:Storage) {
  const store=readCreationStore(key,storage);
  store.drafts=store.drafts.flatMap(record=>record.id!==id?[record]:record.saved?[{...record,autosaved:cloneCreation(record.saved),updatedAt:Date.now()}]:[]);
  write(key,store,storage);
}
export function removeCreationDraft(key:string,id:string,storage?:Storage) {
  const store=readCreationStore(key,storage);store.drafts=store.drafts.filter(record=>record.id!==id);write(key,store,storage);
}
export function saveCreationTemplate(key:string,name:string,model:CreationModel,storage?:Storage): CreationTemplateRecord {
  if (!name.trim()) throw new Error("Enter a template name.");
  if(model.quests.some(quest=>hasCreationTokenRewards(quest.original?.rewards_on_completion??quest.rewardAssets??[])))throw new Error("Templates with token or NFT rewards are not available in this editor yet. Your campaign and rewards are unchanged.");
  const store=readCreationStore(key,storage);
  const copy=cloneCreation(model);
  copy.original=undefined;copy.originalDescription=undefined;copy.sourceOutPoint=undefined;copy.scheduleInstants=undefined;copy.start="";copy.end="";copy.staff=[];
  copy.quests=copy.quests.map(quest=>({...quest,longDescription:quest.original?.metadata.long_description??quest.longDescription,requirements:quest.original?.metadata.requirements??quest.requirements,rewardAssets:cloneCreation(quest.original?.rewards_on_completion??quest.rewardAssets??[]),original:undefined,requiredLocked:false,deletionBlockedReason:undefined}));
  const record={id:crypto.randomUUID(),name:name.trim(),updatedAt:Date.now(),model:copy};
  store.templates=[record,...store.templates].slice(0,30);write(key,store,storage);return record;
}
