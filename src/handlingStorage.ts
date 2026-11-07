import type {CaseFile} from './types';
import type {OriginalManifest} from './originalDocStorage';
import {emptyJournal,validateJournal,handlingReport,MAX_JOURNAL_SIZE,GENESIS} from './handlingCore.mjs';

export type HandlingAction='acquired'|'opened'|'compared'|'copied'|'transferred'|'redacted'|'shared'|'archived'|'other';
export interface HandlingEvent {
  caseId:string;id:string;seq:number;previousHash:string;hash:string;
  documentId:string;sourceId:string;sourceUrl:string;
  fileSha256:string;fileBytes:number;locator:string;
  action:HandlingAction;actor:string;eventDate:string;recordedAt:string;note:string;
}
export interface HandlingJournal {
  format:string;caseId:string;entries:HandlingEvent[];head:string;
}
const key=(c:CaseFile)=>'pattern-atlas.handling.v1.'+c.id;
export async function loadHandling(c:CaseFile,manifest:OriginalManifest){
  const blank=emptyJournal(c) as HandlingJournal;
  try{
    const raw=window.localStorage.getItem(key(c));
    if(!raw)return {bundle:blank,locked:false,warning:''};
    if(raw.length>MAX_JOURNAL_SIZE)return {bundle:blank,locked:true,warning:'Existing handling journal exceeds its size limit. It was not overwritten.'};
    const parsed:unknown=JSON.parse(raw);
    const result=await validateJournal(parsed,c,manifest);
    if(!result.ok)return {bundle:blank,locked:true,warning:'Stored handling events no longer match their document fingerprints or case: '+result.errors.slice(0,3).join(' ')};
    return {bundle:parsed as HandlingJournal,locked:false,warning:''};
  }catch{return {bundle:blank,locked:true,warning:'Cannot read or validate handling history. Existing stored data is protected.'};}
}
export async function saveHandling(c:CaseFile,manifest:OriginalManifest,next:HandlingJournal,expectedHead:string){
  const valid=await validateJournal(next,c,manifest);
  if(!valid.ok)return {ok:false,message:'Journal rejected: '+valid.errors.slice(0,3).join(' ')};
  try{
    // Optimistic stale-tab guard. Browser localStorage does not provide atomic cross-tab transactions.
    const old=window.localStorage.getItem(key(c));
    const current=old?JSON.parse(old) as HandlingJournal:null;
    if((current?.head||GENESIS)!==expectedHead)
      return {ok:false,message:'Another tab or import changed the handling history. Export your work and reload instead of overwriting it.'};
    const raw=JSON.stringify(next);
    if(raw.length>MAX_JOURNAL_SIZE)return {ok:false,message:'Journal exceeds 400 KB; export before adding more notes.'};
    window.localStorage.setItem(key(c),raw);
    return {ok:true,message:'Handling event saved locally. Its hash is not a trusted custody signature.'};
  }catch{return {ok:false,message:'Browser storage is unavailable or full. Export a recovery copy before leaving.'};}
}
export function clearHandling(c:CaseFile){
  try{window.localStorage.removeItem(key(c));return true;}catch{return false;}
}
export function downloadFile(content:string,name:string,mime:string){
  const href=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement('a');a.href=href;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export function exportHandling(bundle:HandlingJournal){
  downloadFile(JSON.stringify(bundle,null,2)+'\n',bundle.caseId.toLowerCase()+'-handling-history.json','application/json');
}
export function exportHandlingMemo(bundle:HandlingJournal,c:CaseFile){
  downloadFile(handlingReport(bundle,c),bundle.caseId.toLowerCase()+'-handling-history.md','text/markdown');
}
export function exportHandlingAnchor(bundle:HandlingJournal){
  downloadFile(JSON.stringify({
    format:'pattern-atlas-handling-head-v1',caseId:bundle.caseId,
    eventCount:bundle.entries.length,head:bundle.head,exportedAt:new Date().toISOString(),
    disclaimer:'Independent preservation is required. A hash is not a signature or certified timestamp.'
  },null,2)+'\n',bundle.caseId.toLowerCase()+'-handling-anchor.json','application/json');
}
export function backupStoredHandling(c:CaseFile){
  try{
    const raw=window.localStorage.getItem(key(c));
    if(!raw)return false;
    downloadFile(raw,c.id.toLowerCase()+'-handling-recovery.json','application/json');
    return true;
  }catch{return false;}
}
