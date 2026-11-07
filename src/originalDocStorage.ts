import type {CaseFile} from './types';
import {emptyManifest,validateManifest,manifestReport} from './originalDocCore.mjs';

export interface PageObservation {
  id:string;page:number;pointer:string;observed:string;notEstablished:string;recordedAt:string;
}
export interface OriginalDocument {
  id:string;sourceId:string;sourceUrlAtCapture:string;locator:string;downloadUrl:string;
  origin:'official-repository'|'archive-mirror'|'other';fileName:string;bytes:number;sha256:string;
  status:'fingerprinted'|'pages-reviewed'|'needs-original';researchNote:string;
  observations:PageObservation[];capturedAt:string;
}
export interface OriginalManifest {format:string;caseId:string;documents:OriginalDocument[];}
const storageKey=(c:CaseFile)=>'pattern-atlas.original-docs.v1.'+c.id;
export function loadOriginals(c:CaseFile){
  const blank=emptyManifest(c) as OriginalManifest;
  try{
    const raw=window.localStorage.getItem(storageKey(c));
    if(!raw)return {bundle:blank,locked:false,warning:''};
    if(raw.length>440000)return {bundle:blank,locked:true,warning:'Stored document manifest is oversized. Existing storage was not overwritten.'};
    const parsed:unknown=JSON.parse(raw);
    const validation=validateManifest(parsed,c);
    if(!validation.ok)return {bundle:blank,locked:true,warning:'Saved source IDs or URLs changed, or the manifest is malformed. Existing data is protected: '+validation.errors.slice(0,2).join(' ')};
    return {bundle:parsed as OriginalManifest,locked:false,warning:''};
  }catch{return {bundle:blank,locked:true,warning:'Cannot read stored document manifest; existing data was not overwritten.'};}
}
export function saveOriginals(c:CaseFile,bundle:OriginalManifest) {
  const validation=validateManifest(bundle,c);
  if(!validation.ok)return {ok:false,message:'Save rejected: '+validation.errors.slice(0,3).join(' ')};
  try{
    window.localStorage.setItem(storageKey(c),JSON.stringify(bundle));
    return {ok:true,message:'File fingerprint and notes saved privately. PDF bytes were not stored.'};
  }catch{return {ok:false,message:'Local storage is unavailable/full. Export this manifest before leaving.'};}
}
export function clearOriginals(c:CaseFile) {
  try{window.localStorage.removeItem(storageKey(c));return true;}catch{return false;}
}
export function download(content:string,name:string,mime:string){
  const href=URL.createObjectURL(new Blob([content],{type:mime}));
  const anchor=document.createElement('a');anchor.href=href;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export function exportManifest(bundle:OriginalManifest){
  download(JSON.stringify(bundle,null,2)+'\n',bundle.caseId.toLowerCase()+'-original-docs.json','application/json');
}
export function exportManifestReport(bundle:OriginalManifest,c:CaseFile){
  download(manifestReport(bundle,c),bundle.caseId.toLowerCase()+'-original-documents.md','text/markdown');
}
export function recoverOriginals(c:CaseFile){
  try{
    const raw=window.localStorage.getItem(storageKey(c));
    if(!raw)return false;
    download(raw,c.id.toLowerCase()+'-original-doc-recovery.json','application/json');
    return true;
  }catch{return false;}
}
