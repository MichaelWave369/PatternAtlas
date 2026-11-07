import type {CaseFile} from './types';
import {emptyQueue,validateQueue,queueReport} from './researchQueueCore.mjs';

export type TaskState = 'queued' | 'in-progress' | 'needs-material' | 'reviewed';
export interface ResearchTask {
  id:string;
  kind:'hypothesis'|'evidence-gap'|'researcher-added';
  title:string;
  question:string;
  evidenceNeeded:string;
  sourceIds:string[];
  signature:string;
}
export interface CustomTask {
  id:string;
  title:string;
  question:string;
  evidenceNeeded:string;
  sourceIds:string[];
  createdAt:string;
}
export interface ResearchUpdate {
  signature:string;
  status:TaskState;
  workNote:string;
  evidenceRef:string;
  updatedAt:string;
}
export interface QueueBundle {
  format:string;
  caseId:string;
  customTasks:CustomTask[];
  updates:Record<string,ResearchUpdate>;
}
const storageKey=(c:CaseFile)=>'pattern-atlas.research-queue.v1.'+c.id;
export function loadQueue(caseFile:CaseFile):{bundle:QueueBundle;locked:boolean;warning:string} {
  const blank=emptyQueue(caseFile) as QueueBundle;
  try{
    const content=window.localStorage.getItem(storageKey(caseFile));
    if(!content)return {bundle:blank,locked:false,warning:''};
    if(content.length>450000)return {bundle:blank,locked:true,warning:'Existing queue exceeds the storage size limit and has not been changed.'};
    const parsed:unknown=JSON.parse(content);
    const result=validateQueue(parsed,caseFile);
    if(!result.ok)return {bundle:blank,locked:true,warning:'Saved research queue does not match the current case. Existing data is protected: '+result.errors.slice(0,2).join(' ')};
    return {bundle:parsed as QueueBundle,locked:false,warning:''};
  }catch{return {bundle:blank,locked:true,warning:'Could not read the saved queue. Existing browser data has not been overwritten.'};}
}
export function saveQueue(caseFile:CaseFile,bundle:QueueBundle):{ok:boolean;message:string} {
  const validation=validateQueue(bundle,caseFile);
  if(!validation.ok)return {ok:false,message:'Save rejected: '+validation.errors.slice(0,3).join(' ')};
  try{window.localStorage.setItem(storageKey(caseFile),JSON.stringify(bundle));return {ok:true,message:'Research work saved in this browser.'};}
  catch{return {ok:false,message:'Browser storage is unavailable or full. Export work before leaving this page.'};}
}
export function removeStoredQueue(caseFile:CaseFile):boolean {
  try{window.localStorage.removeItem(storageKey(caseFile));return true;}
  catch{return false;}
}
export function downloadFile(contents:string,filename:string,mediaType:string) {
  const url=URL.createObjectURL(new Blob([contents],{type:mediaType}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function downloadQueue(bundle:QueueBundle) {
  downloadFile(JSON.stringify(bundle,null,2)+'\n',bundle.caseId.toLowerCase()+'-research-queue.json','application/json');
}
export function downloadQueueMarkdown(bundle:QueueBundle,c:CaseFile) {
  downloadFile(queueReport(bundle,c),c.id.toLowerCase()+'-research-queue.md','text/markdown');
}
export function rawQueueBackup(c:CaseFile):boolean {
  try{
    const stored=window.localStorage.getItem(storageKey(c));
    if(!stored)return false;
    downloadFile(stored,c.id.toLowerCase()+'-research-recovery.json','application/json');
    return true;
  }catch{return false;}
}
