// MK8: case snapshot audit, not a documentary authenticity or truth validator.
import {checkCase} from './caseValidation.mjs';
import {collectClaims} from './verificationCore.mjs';

export const AUDIT_FORMAT='pattern-atlas-evidence-packet-v1';
export const AUDIT_LIMIT=2500000;
const record=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const https=(v)=>{try{if(typeof v!=='string'||v.length>2048)return false;
  const u=new URL(v);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}
  catch{return false;}};
export function canonical(value) {
  const seen=new WeakSet();
  const sort=(node)=>{
    if(Array.isArray(node))return node.map(sort);
    if(node!==null&&typeof node==='object'){
      if(seen.has(node))throw Error('Circular input');
      seen.add(node);
      const out={};
      for(const k of Object.keys(node).sort())out[k]=sort(node[k]);
      seen.delete(node);return out;
    }
    if(node===null||typeof node==='boolean'||typeof node==='string')return node;
    if(typeof node==='number'&&Number.isFinite(node))return node;
    throw Error('Unsupported value in packet');
  };
  return JSON.stringify(sort(value));
}
export async function digestPayload(payload,subtle=globalThis.crypto?.subtle){
  if(!subtle)throw Error('SHA-256 unavailable in this context.');
  const data=new TextEncoder().encode(canonical(payload));
  const hash=await subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export function auditCase(caseFile,seed={invoices:[],entries:[]}) {
  const claims=collectClaims(caseFile);
  const sourceMap=new Map(caseFile.sources.map(s=>[s.id,{id:s.id,citation:s.citation,
    title:s.title,date:s.date,category:s.category,url:s.url,claims:[],hypotheses:[],events:[],trace:[]}]));
  for(const c of claims)for(const id of c.sourceIds)sourceMap.get(id)?.claims.push(c.key);
  for(const h of caseFile.hypotheses)for(const id of h.sourceIds)sourceMap.get(id)?.hypotheses.push(h.id);
  for(const e of caseFile.events)for(const id of e.sourceIds)sourceMap.get(id)?.events.push(e.id);
  for(const t of caseFile.traceSteps)for(const id of t.sourceIds)sourceMap.get(id)?.trace.push(t.id);
  const sources=[...sourceMap.values()], flags=[];
  const flag=(id,type,title,detail,sourceIds)=>flags.push({id,type,title,detail,sourceIds});
  for(const s of sources){
    if(!s.claims.length&&!s.hypotheses.length)flag('unused:'+s.id,'review','Source without explicit claim',
      'Listed sources alone are not evidence of an unstated relationship.',[s.id]);
    if(s.date==='undated')flag('undated:'+s.id,'metadata','Undated source',
      'Without independent dating, this source cannot anchor a precise historical sequence.',[s.id]);
  }
  for(const e of caseFile.edges)if(e.assessment!=='documented')
    flag('edge:'+e.id,'review','Relationship requires careful review',
      'Relationship is classified as '+e.assessment+', not established as a proven association.',e.sourceIds);
  for(const t of caseFile.traceSteps)
    flag('gap:'+t.id,'gap',t.title,t.notEstablished,t.sourceIds);
  const byUrl=new Map();
  for(const s of sources){const found=byUrl.get(s.url)||[];found.push(s.id);byUrl.set(s.url,found);}
  for(const [url,ids] of byUrl)if(ids.length>1)
    flag('duplicate:'+ids.join(':'),'metadata','Multiple source IDs use one URL',
      'Check for citation alias or accidental duplicate rather than counting this as independent corroboration: '+url,ids);
  for(const e of seed.entries||[]){
    if(e.kind==='correspondence'||e.kind==='secondary-report'||!e.sourceId){
      flag('candidate:'+e.id,'review','Transaction candidate needs independent settlement records',
        'This '+e.kind+' record is not a bank-confirmed allocation to a specific invoice or evidence of delivered technology.',
        e.sourceId?[e.sourceId]:[]);
    }
  }
  return {
    counts:{sources:sources.length,claims:claims.length,hypotheses:caseFile.hypotheses.length,
      gaps:caseFile.traceSteps.length,flags:flags.length,invoices:(seed.invoices||[]).length,candidates:(seed.entries||[]).length},
    sources,claims,flags,
    gaps:caseFile.traceSteps.map(t=>({id:t.id,date:t.date,title:t.title,
      established:t.established,notEstablished:t.notEstablished,sourceIds:t.sourceIds})),
    hypotheses:caseFile.hypotheses.map(h=>({id:h.id,question:h.question,nextCheck:h.nextCheck,sourceIds:h.sourceIds})),
    transactionInventory:{
      invoices:(seed.invoices||[]).map(i=>({id:i.id,sourceId:i.sourceId,date:i.date,amountCents:i.amountCents,
        currency:i.currency,invoiceNo:i.invoiceNo})),
      entries:(seed.entries||[]).map(e=>({id:e.id,invoiceId:e.invoiceId,kind:e.kind,sourceId:e.sourceId,
        url:e.url,date:e.date,amountCents:e.amountCents,currency:e.currency,invoiceNoObserved:e.invoiceNoObserved}))
    }
  };
}
export function createPayload(caseFile,seed) {
  return {format:AUDIT_FORMAT,case:JSON.parse(JSON.stringify(caseFile)),
    seed:JSON.parse(JSON.stringify(seed||{invoices:[],entries:[]})),
    audit:auditCase(caseFile,seed)};
}
export function validatePayload(payload) {
  const errors=[],fail=v=>{if(errors.length<20)errors.push(v);};
  if(!record(payload)||payload.format!==AUDIT_FORMAT||!record(payload.case)||
      !record(payload.seed)||!record(payload.audit))
    return {ok:false,errors:['Invalid case, seed or audit payload.']};
  const c=checkCase(payload.case);
  if(!c.ok)fail('Case schema violation: '+c.errors.slice(0,2).join(' '));
  if(!Array.isArray(payload.seed.invoices)||!Array.isArray(payload.seed.entries))
    return {ok:false,errors:[...errors,'Invalid seed transaction arrays.']};
  if(payload.seed.invoices.length>250||payload.seed.entries.length>500)fail('Oversized transaction inventory.');
  const sources=new Set(Array.isArray(payload.case.sources)?payload.case.sources.map(s=>s.id):[]);
  const invoiceIds=new Set(),entryIds=new Set();
  for(const i of payload.seed.invoices){
    if(!record(i)||typeof i.id!=='string'||invoiceIds.has(i.id)||!sources.has(i.sourceId)||
       !Number.isSafeInteger(i.amountCents)||i.amountCents<0||i.currency!=='USD')
      fail('Invalid or duplicate seed invoice.');
    if(record(i))invoiceIds.add(i.id);
  }
  for(const e of payload.seed.entries){
    if(!record(e)||typeof e.id!=='string'||entryIds.has(e.id)||!invoiceIds.has(e.invoiceId)||
       !Number.isSafeInteger(e.amountCents)||e.amountCents<0||e.currency!=='USD')
      fail('Invalid or duplicate candidate entry.');
    if(record(e)){
      entryIds.add(e.id);
      if(e.sourceId&&!sources.has(e.sourceId))fail('Unknown candidate source.');
      if(e.url&&!https(e.url))fail('Unsafe candidate source link.');
      if(!e.sourceId&&!e.url)fail('Candidate without source pointer.');
    }
  }
  if(!errors.length){
    try{if(canonical(payload.audit)!==canonical(auditCase(payload.case,payload.seed)))
      fail('Audit inventory does not match included case and source records.');}
    catch{fail('Audit inventory cannot be recomputed.');}
  }
  return {ok:errors.length===0,errors};
}
export async function makePacket(payload,subtle) {
  const check=validatePayload(payload);
  if(!check.ok)throw Error(check.errors.join('; '));
  return {format:AUDIT_FORMAT,createdAt:new Date().toISOString(),hashAlgorithm:'SHA-256',
    sha256:await digestPayload(payload,subtle),payload};
}
export async function verifyPacket(packet,subtle) {
  const errors=[];
  if(!record(packet)||packet.format!==AUDIT_FORMAT||packet.hashAlgorithm!=='SHA-256'||
    typeof packet.sha256!=='string'||!/^[a-f0-9]{64}$/.test(packet.sha256)||!record(packet.payload))
      return {ok:false,errors:['Invalid evidence packet envelope.']};
  let serialized;
  try{serialized=JSON.stringify(packet);}
  catch{return {ok:false,errors:['Cannot serialize packet.']};}
  if(serialized.length>AUDIT_LIMIT)return {ok:false,errors:['Packet exceeds 2.5 MB.']};
  const structural=validatePayload(packet.payload);
  if(!structural.ok)errors.push(...structural.errors);
  try{
    if((await digestPayload(packet.payload,subtle))!==packet.sha256)
      errors.push('SHA-256 digest mismatch: payload changed after packet creation.');
  }catch(e){errors.push(e instanceof Error?e.message:'Cannot compute packet digest.');}
  return {ok:errors.length===0,errors,
    caseId:typeof packet.payload.case?.id==='string'?packet.payload.case.id:null,
    sources:Array.isArray(packet.payload.case?.sources)?packet.payload.case.sources.length:0};
}
const cleaned=v=>String(v).replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
export function auditMarkdown(payload) {
  const a=payload.audit,c=payload.case;
  const lines=['# Pattern Atlas Evidence Audit','',
    'Case: '+c.id+' · '+c.title,'',
    '> A digest can detect changed bytes, but cannot establish document authenticity, a legal finding or the truth of an underlying claim.','',
    '## Source-to-claim inventory','',
    '| Citation | Date | Claims | Hypotheses | URL |','| --- | --- | --- | --- | --- |',
    ...a.sources.map(s=>'| '+cleaned(s.citation)+' | '+cleaned(s.date)+' | '+s.claims.length+
      ' | '+s.hypotheses.length+' | '+cleaned(s.url)+' |'),
    '','## Explicit evidentiary limits','',
    ...a.gaps.map(g=>'- **'+cleaned(g.title)+'**: '+cleaned(g.notEstablished)),
    '','## Source review flags','',
    ...a.flags.map(f=>'- **'+cleaned(f.title)+'**: '+cleaned(f.detail)),
    '','Only curated case records and candidate metadata are included. Local notes and browsing history are excluded.',''];
  return lines.join('\n');
}
