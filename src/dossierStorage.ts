import type {CaseFile} from './types';
import {emptyDossiers,validateDossiers,makeDossierReport} from './dossierCore.mjs';

export interface DossierRecord {
  id:string;sourceA:string;sourceB:string;signature:string;title:string;question:string;
  findingA:string;findingB:string;sharedContext:string;notEstablished:string;alternative:string;
  nextCheck:string;createdAt:string;updatedAt:string;
}
export interface DossierBundle {
  format:string;caseId:string;dossiers:DossierRecord[];
}
const key=(c:CaseFile)=>'pattern-atlas.dossiers.v1.'+c.id;
export function readDossiers(c:CaseFile) {
  const blank=emptyDossiers(c) as DossierBundle;
  try{
    const raw=window.localStorage.getItem(key(c));
    if(!raw)return {bundle:blank,locked:false,warning:''};
    if(raw.length>440000)return {bundle:blank,locked:true,warning:'Stored dossiers exceed the 440 KB limit. Existing records were not overwritten.'};
    const parsed:unknown=JSON.parse(raw);
    const result=validateDossiers(parsed,c);
    if(!result.ok)return {bundle:blank,locked:true,warning:'Saved dossier data differs from current sources or is invalid. Existing storage is protected: '+result.errors.slice(0,2).join(' ')};
    return {bundle:parsed as DossierBundle,locked:false,warning:''};
  }catch{return {bundle:blank,locked:true,warning:'Unable to read dossier storage. Existing records remain protected.'};}
}
export function writeDossiers(c:CaseFile,bundle:DossierBundle) {
  const valid=validateDossiers(bundle,c);
  if(!valid.ok)return {ok:false,message:'Dossier validation failed: '+valid.errors.slice(0,3).join(' ')};
  try{window.localStorage.setItem(key(c),JSON.stringify(bundle));return {ok:true,message:'Saved privately in this browser.'};}
  catch{return {ok:false,message:'Local storage is full or unavailable. Export your research before closing this page.'};}
}
export function clearDossiers(c:CaseFile) {
  try{window.localStorage.removeItem(key(c));return true;}catch{return false;}
}
export function download(content:string,filename:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportDossiers(bundle:DossierBundle) {
  download(JSON.stringify(bundle,null,2)+'\n',bundle.caseId.toLowerCase()+'-dossiers.json','application/json');
}
export function exportDossierMemo(bundle:DossierBundle,c:CaseFile) {
  download(makeDossierReport(bundle,c),bundle.caseId.toLowerCase()+'-dossiers.md','text/markdown');
}
export function backupDossiers(c:CaseFile) {
  try{
    const raw=window.localStorage.getItem(key(c));
    if(!raw)return false;
    download(raw,c.id.toLowerCase()+'-dossier-recovery.json','application/json');
    return true;
  }catch{return false;}
}
