import type {CaseFile} from './types';
import {emptyReconciliation,validateReconciliation,reconciliationReport} from './reconciliationCore.mjs';

export interface ReconciliationInvoice {
 id:string;sourceId:string;invoiceNo:string;date:string;amountCents:number;currency:string;vendor:string;payer:string;description:string;
}
export interface ReconciliationEntry {
 id:string;invoiceId:string;date:string;amountCents:number;currency:string;payee:string;invoiceNoObserved:string;
 kind:string;sourceId:string;url:string;locator:string;note:string;
}
export type InspectionStatus='not-reviewed'|'manually-inspected'|'needs-follow-up';
export interface ReconciliationReview {
 signature:string;status:InspectionStatus;note:string;evidenceUrl:string;updatedAt:string;
}
export interface ReconciliationBundle {
 format:string;caseId:string;invoices:ReconciliationInvoice[];entries:ReconciliationEntry[];
 reviews:Record<string,ReconciliationReview>;
}
export interface ReconciliationSeed {
 caseId:string;invoices:ReconciliationInvoice[];entries:ReconciliationEntry[];
}
const key=(c:CaseFile)=>'pattern-atlas.reconciliation.v1.'+c.id;
export function loadReconciliation(c:CaseFile,seed:ReconciliationSeed):{
 bundle:ReconciliationBundle;locked:boolean;warning:string;
} {
 const empty=emptyReconciliation(c) as ReconciliationBundle;
 try {
  const raw=window.localStorage.getItem(key(c));
  if(!raw)return {bundle:empty,locked:false,warning:''};
  if(raw.length>450000)return {bundle:empty,locked:true,warning:'Stored reconciliation data exceeds the size cap; original data has not been overwritten.'};
  const parsed:unknown=JSON.parse(raw);
  const checked=validateReconciliation(parsed,c,seed);
  if(!checked.ok)return {bundle:empty,locked:true,warning:'The stored record no longer matches this case or its cited source: '+checked.errors.slice(0,2).join(' ')};
  return {bundle:parsed as ReconciliationBundle,locked:false,warning:''};
 }catch{return {bundle:empty,locked:true,warning:'Reconciliation storage could not be read. Original browser data has not been overwritten.'};}
}
export function saveReconciliation(c:CaseFile,seed:ReconciliationSeed,bundle:ReconciliationBundle) {
 const checked=validateReconciliation(bundle,c,seed);
 if(!checked.ok)return {ok:false,message:'Save rejected: '+checked.errors.slice(0,3).join(' ')};
 try {
  window.localStorage.setItem(key(c),JSON.stringify(bundle));
  return {ok:true,message:'Saved privately in this browser. No graph relationship was created.'};
 }catch{return {ok:false,message:'Browser storage is unavailable or full. Export research before leaving.'};}
}
export function deleteReconciliation(c:CaseFile) {
 try{window.localStorage.removeItem(key(c));return true;}catch{return false;}
}
export function downloadArtifact(content:string,name:string,mime:string) {
 const url=URL.createObjectURL(new Blob([content],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportRecon(bundle:ReconciliationBundle){
 downloadArtifact(JSON.stringify(bundle,null,2)+'\n',bundle.caseId.toLowerCase()+'-reconciliation.json','application/json');
}
export function exportReconMemo(bundle:ReconciliationBundle,c:CaseFile,seed:ReconciliationSeed){
 downloadArtifact(reconciliationReport(bundle,c,seed),bundle.caseId.toLowerCase()+'-reconciliation.md','text/markdown');
}
export function backupRecon(c:CaseFile){
 try {
  const raw=window.localStorage.getItem(key(c));
  if(!raw)return false;
  downloadArtifact(raw,c.id.toLowerCase()+'-reconciliation-recovery.json','application/json');
  return true;
 }catch{return false;}
}
