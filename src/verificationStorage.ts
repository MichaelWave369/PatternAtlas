import type { CaseFile } from './types';
import {createBundle,validateBundle,makeReviewReport} from './verificationCore.mjs';

export type ReviewStatus = 'not-reviewed'|'document-inspected'|'needs-corroboration'|'disputed';
export type SourceCheckStatus = 'not-reviewed'|'opened-by-researcher'|'unavailable'|'compared-with-original';
export type CounterStatus = 'open'|'addressed';
export interface ClaimReview {
  signature:string;
  status:ReviewStatus;
  sourceId:string;
  excerpt:string;
  analysis:string;
  recordedAt:string;
}
export interface SourceCheck {
  status:SourceCheckStatus;
  sourceUrl:string;
  originalUrl:string;
  note:string;
  recordedAt:string;
}
export interface Counterevidence {
  id:string;
  claimKey:string;
  signature:string;
  sourceId:string;
  observation:string;
  whyItMatters:string;
  status:CounterStatus;
  recordedAt:string;
  resolution?:string;
  addressedAt?:string;
}
export interface VerificationBundle {
  format:string;
  caseId:string;
  reviews:Record<string,ClaimReview>;
  sourceChecks:Record<string,SourceCheck>;
  counterevidence:Counterevidence[];
}
export interface LoadVerification {
  bundle:VerificationBundle;
  warning:string;
  locked:boolean;
}
const keyFor = (caseFile:CaseFile) => 'pattern-atlas.verification.v1.'+caseFile.id;
export function loadVerification(caseFile:CaseFile):LoadVerification {
  const empty=createBundle(caseFile) as VerificationBundle;
  try {
    const input=window.localStorage.getItem(keyFor(caseFile));
    if(!input)return {bundle:empty,warning:'',locked:false};
    if(input.length>400_000)return {bundle:empty,warning:'Stored review data is oversized. Export or back it up before resetting.',locked:true};
    const parsed:unknown=JSON.parse(input);
    const result=validateBundle(parsed,caseFile);
    if(!result.ok)return {bundle:empty,warning:'The saved review no longer matches this case or has invalid data. Existing storage is protected: '+result.errors.slice(0,2).join(' '),locked:true};
    return {bundle:parsed as VerificationBundle,warning:'',locked:false};
  }catch{return {bundle:empty,warning:'Could not read your review data. Existing storage has not been overwritten.',locked:true};}
}
export function saveVerification(caseFile:CaseFile,bundle:VerificationBundle):{ok:boolean;message:string} {
  const result=validateBundle(bundle,caseFile);
  if(!result.ok)return {ok:false,message:'Review was rejected: '+result.errors.slice(0,3).join(' ')};
  try{
    window.localStorage.setItem(keyFor(caseFile),JSON.stringify(bundle));
    return {ok:true,message:'Saved privately in this browser.'};
  }catch{return {ok:false,message:'Browser storage is unavailable or full. Export existing notes before closing this tab.'};}
}
export function discardStoredVerification(caseFile:CaseFile):boolean {
  try{window.localStorage.removeItem(keyFor(caseFile));return true;}
  catch{return false;}
}
export function downloadText(content:string,filename:string,mime:string) {
  const blob=new Blob([content],{type:mime});
  const uri=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=uri;anchor.download=filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(uri),1000);
}
export function exportVerification(bundle:VerificationBundle) {
  downloadText(JSON.stringify(bundle,null,2)+'\n',bundle.caseId.toLowerCase()+'-verification.json','application/json');
}
export function exportMarkdown(bundle:VerificationBundle,caseFile:CaseFile) {
  downloadText(makeReviewReport(bundle,caseFile),caseFile.id.toLowerCase()+'-review.md','text/markdown');
}
