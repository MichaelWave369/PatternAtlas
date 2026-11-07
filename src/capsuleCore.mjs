// MK11 portable research capsule. No network requests or storage mutations.
// SHA-256 detects changes, NOT source authenticity, signature, or factual truth.
import {AUDIT_FORMAT,createPayload,validatePayload,canonical,digestPayload} from './auditCore.mjs';
import {validateManifest} from './originalDocCore.mjs';
import {validateJournal} from './handlingCore.mjs';

export const CAPSULE_FORMAT='pattern-atlas-case-capsule-v1';
export const CAPSULE_LIMIT=3_500_000;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const stamp=v=>typeof v==='string'&&v.length<=40&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)&&!Number.isNaN(Date.parse(v));
const exactKeys=(obj,fields)=>record(obj)&&Object.keys(obj).sort().join('|')===[...fields].sort().join('|');
const bytes=object=>new TextEncoder().encode(JSON.stringify(object)).length;
const fail=(errors,msg)=>{if(errors.length<25)errors.push(msg);};

export function countCapsuleContents(payload) {
  if(!record(payload))return {sources:0,claims:0,documents:0,pageNotes:0,handlingEvents:0};
  const audit=payload.auditPacket?.audit;
  const originals=payload.originals?.documents||[];
  return {
    sources:Number(audit?.counts?.sources)||0,
    claims:Number(audit?.counts?.claims)||0,
    documents:originals.length,
    pageNotes:originals.reduce((total,d)=>total+(Array.isArray(d?.observations)?d.observations.length:0),0),
    handlingEvents:Array.isArray(payload.handling?.entries)?payload.handling.entries.length:0
  };
}

export function prepareCapsulePayload(caseFile,seed,manifest,journal,privacy,createdAt=new Date().toISOString()) {
  const includeOriginals=privacy?.originals===true;
  const includeHandling=privacy?.handling===true;
  if(includeHandling&&!includeOriginals)
    throw Error('Handling history requires its exact original-document manifest.');
  if(includeOriginals&&!manifest)throw Error('Original-document manifest was not supplied.');
  if(includeHandling&&!journal)throw Error('Handling history was not supplied.');
  const payload={
    format:CAPSULE_FORMAT,createdAt,
    auditPacket:createPayload(caseFile,seed),
    privacy:{originals:includeOriginals,handling:includeHandling},
    ...(includeOriginals?{originals:structuredClone(manifest)}:{}),
    ...(includeHandling?{handling:structuredClone(journal)}:{})
  };
  if(bytes(payload)>CAPSULE_LIMIT)throw Error('Capsule exceeds its 3.5 MB limit.');
  return payload;
}
export async function validateCapsulePayload(payload,subtle=globalThis.crypto?.subtle) {
  const errors=[];
  if(!record(payload)||payload.format!==CAPSULE_FORMAT||!record(payload.auditPacket))
    return {ok:false,errors:['Missing or unsupported case capsule format.']};
  if(!stamp(payload.createdAt))fail(errors,'Invalid capsule creation time.');
  if(!exactKeys(payload.privacy,['originals','handling'])||
    typeof payload.privacy.originals!=='boolean'||typeof payload.privacy.handling!=='boolean')
    return {ok:false,errors:['Invalid explicit privacy selection.']};
  const {originals,handling}=payload.privacy;
  if(handling&&!originals)fail(errors,'Handling history cannot be included without its original-document manifest.');
  const required=['format','createdAt','auditPacket','privacy',
    ...(originals?['originals']:[]),...(handling?['handling']:[])];
  if(!exactKeys(payload,required))fail(errors,'Unexpected or missing capsule fields; privacy declarations do not match contents.');
  const pack=payload.auditPacket;
  if(!exactKeys(pack,['format','case','seed','audit'])||pack.format!==AUDIT_FORMAT)
    return {ok:false,errors:[...errors,'Invalid audit packet inside capsule.']};
  const validation=validatePayload(pack);
  if(!validation.ok)errors.push(...validation.errors.slice(0,10).map(s=>'Case audit: '+s));
  const c=pack.case;
  if(originals){
    if(!record(payload.originals)||!Array.isArray(payload.originals.documents))
      fail(errors,'Original-document manifest is missing or malformed.');
    else if(record(c)){
      const m=validateManifest(payload.originals,c);
      if(!m.ok)errors.push(...m.errors.slice(0,10).map(s=>'Original documents: '+s));
    }
  }
  if(handling){
    if(!record(payload.handling)||!Array.isArray(payload.handling.entries))
      fail(errors,'Handling history is missing or malformed.');
    else if(record(c)&&record(payload.originals)&&Array.isArray(payload.originals.documents)){
      const journal=await validateJournal(payload.handling,c,payload.originals,subtle);
      if(!journal.ok)errors.push(...journal.errors.slice(0,10).map(s=>'Handling journal: '+s));
    }
  }
  try{if(bytes(payload)>CAPSULE_LIMIT)fail(errors,'Capsule payload exceeds 3.5 MB.');}
  catch{fail(errors,'Capsule payload cannot be serialized.');}
  return {ok:errors.length===0,errors,counts:countCapsuleContents(payload),
    caseId:typeof c?.id==='string'?c.id:null};
}
export async function makeCapsule(payload,subtle=globalThis.crypto?.subtle) {
  const result=await validateCapsulePayload(payload,subtle);
  if(!result.ok)throw Error('Capsule validation failed: '+result.errors.slice(0,4).join('; '));
  return {format:CAPSULE_FORMAT,algorithm:'SHA-256',
    digest:await digestPayload(payload,subtle),payload};
}
export async function inspectCapsule(capsule,subtle=globalThis.crypto?.subtle) {
  const errors=[];
  if(!exactKeys(capsule,['format','algorithm','digest','payload'])||
     capsule.format!==CAPSULE_FORMAT||capsule.algorithm!=='SHA-256'||!hex(capsule.digest))
    return {ok:false,errors:['Invalid or incomplete case capsule envelope.']};
  try {
    if(bytes(capsule)>CAPSULE_LIMIT+1000)
      return {ok:false,errors:['Capsule exceeds its maximum permitted size.']};
  }catch{return {ok:false,errors:['Unreadable capsule JSON.']};}
  let body;
  try{body=await validateCapsulePayload(capsule.payload,subtle);}
  catch(err){return {ok:false,errors:['Capsule could not be validated: '+String(err)]};}
  if(!body.ok)errors.push(...body.errors);
  try{if((await digestPayload(capsule.payload,subtle))!==capsule.digest)
    fail(errors,'SHA-256 mismatch: exported capsule contents have changed.');}
  catch(err){fail(errors,'SHA-256 check unavailable: '+String(err));}
  return {ok:errors.length===0,errors,caseId:body.caseId,
    counts:body.counts,privacy:capsule.payload?.privacy||null};
}
export function compareCaseToCapsule(currentCase,cap) {
  if(!record(cap)||!record(cap.payload)||!record(cap.payload.auditPacket?.case))
    return {sameCase:false,identical:false,reason:'Missing case snapshot.'};
  const captured=cap.payload.auditPacket.case;
  if(captured.id!==currentCase.id)
    return {sameCase:false,identical:false,reason:'This capsule is for another case. No case was imported or changed.'};
  try{
    const identical=canonical(currentCase)===canonical(captured);
    return {sameCase:true,identical,reason:identical?
      'Enclosed case records match the currently selected case.':
      'Case snapshot differs from the current case; source records may have been edited since export.'};
  }catch{return {sameCase:true,identical:false,reason:'Could not compare the enclosed case snapshot.'};}
}
