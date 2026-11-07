// MK10 evidence handling journal. Self-hashed event sequence, NOT an authenticated chain of custody.
export const HANDLING_FORMAT='pattern-atlas-handling-ledger-v1';
export const HANDLING_ACTIONS=['acquired','opened','compared','copied','transferred','redacted','shared','archived','other'];
export const GENESIS='0'.repeat(64);
export const MAX_JOURNAL_SIZE=400000;
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max,min=1)=>typeof v==='string'&&v.length>=min&&v.trim().length>=min&&v.length<=max;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const safeId=v=>typeof v==='string'&&/^handling:[a-f0-9-]{36}$/.test(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&
 !Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const stamp=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)&&
 !Number.isNaN(Date.parse(v));
const fields=['caseId','id','seq','previousHash','documentId','sourceId','sourceUrl','fileSha256',
 'fileBytes','locator','action','actor','eventDate','recordedAt','note'];
export const canonical=(v)=>{
 const seen=new WeakSet();
 const sort=(x)=>{
  if(Array.isArray(x))return x.map(sort);
  if(isRecord(x)){
   if(seen.has(x))throw Error('Circular entry');
   seen.add(x);const out={};
   for(const key of Object.keys(x).sort())out[key]=sort(x[key]);
   seen.delete(x);return out;
  }
  if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(typeof x==='number'&&Number.isFinite(x))return x;
  throw Error('Unsupported entry value');
 };
 return JSON.stringify(sort(v));
};
export async function hashEvent(event,subtle=globalThis.crypto?.subtle){
 if(!subtle)throw Error('SHA-256 unavailable in this browser.');
 const data=new TextEncoder().encode(canonical(Object.fromEntries(fields.map(k=>[k,event[k]]))));
 const bytes=await subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export function emptyJournal(c){return {format:HANDLING_FORMAT,caseId:c.id,entries:[],head:GENESIS};}
export async function appendHandling(journal,c,manifest,input,subtle=globalThis.crypto?.subtle){
 const check=await validateJournal(journal,c,manifest,subtle);
 if(!check.ok)throw Error('Existing journal failed validation: '+check.errors.slice(0,2).join(' '));
 const d=manifest.documents.find(v=>v.id===input.documentId);
 if(!d)throw Error('Choose a currently saved PDF fingerprint first.');
 if(journal.entries.length>=200)throw Error('Handling journal has reached 200 events.');
 const time=new Date().toISOString();
 const event={
  caseId:c.id,id:'handling:'+crypto.randomUUID(),seq:journal.entries.length+1,
  previousHash:journal.head,documentId:d.id,sourceId:d.sourceId,
  sourceUrl:d.sourceUrlAtCapture,fileSha256:d.sha256,fileBytes:d.bytes,
  locator:d.locator,action:input.action,actor:input.actor.trim(),
  eventDate:input.eventDate,recordedAt:time,note:input.note.trim()
 };
 const next={...event,hash:await hashEvent(event,subtle)};
 const updated={...journal,entries:[...journal.entries,next],head:next.hash};
 const verdict=await validateJournal(updated,c,manifest,subtle);
 if(!verdict.ok)throw Error('Proposed entry rejected: '+verdict.errors.slice(0,3).join(' '));
 return updated;
}
export async function validateJournal(journal,c,manifest,subtle=globalThis.crypto?.subtle){
 const errors=[],fail=x=>{if(errors.length<30)errors.push(x);};
 if(!isRecord(journal))return {ok:false,errors:['Journal must be an object.']};
 try{if(JSON.stringify(journal).length>MAX_JOURNAL_SIZE)fail('Journal exceeds 400 KB.');}
 catch{return {ok:false,errors:['Cannot serialize journal.']};}
 if(journal.format!==HANDLING_FORMAT)fail('Unsupported journal format.');
 if(journal.caseId!==c.id)fail('Journal belongs to another case.');
 if(!Array.isArray(journal.entries))return {ok:false,errors:[...errors,'Entries must be an array.']};
 if(journal.entries.length>200)fail('Journal exceeds 200 events.');
 if(!sha(journal.head))fail('Invalid journal head checksum.');
 if(!isRecord(manifest)||!Array.isArray(manifest.documents))
  return {ok:false,errors:[...errors,'Original PDF fingerprint manifest is unavailable.']};
 const docs=new Map(manifest.documents.filter(isRecord).map(d=>[d.id,d]));
 const sources=new Map(c.sources.map(s=>[s.id,s]));
 let previous=GENESIS,lastTime='',ids=new Set();
 for(let n=0;n<journal.entries.length;n++){
  const e=journal.entries[n];
  if(!isRecord(e)){fail('Malformed event '+(n+1));continue;}
  if(Object.keys(e).sort().join('|')!==[...fields,'hash'].sort().join('|'))
   fail('Unexpected or missing event fields at '+(n+1));
  if(!safeId(e.id)||ids.has(e.id))fail('Missing or repeated event ID at '+(n+1));
  ids.add(e.id);
  if(e.seq!==n+1||e.caseId!==c.id)fail('Event sequence or case identity mismatch at '+(n+1));
  if(e.previousHash!==previous||!sha(e.hash))fail('Broken hash link at '+(n+1));
  const d=docs.get(e.documentId),source=sources.get(e.sourceId);
  if(!d||!source||d.sourceId!==e.sourceId)fail('Event refers to a missing or wrong-case PDF fingerprint at '+(n+1));
  else if(d.sha256!==e.fileSha256||d.bytes!==e.fileBytes||
    d.sourceUrlAtCapture!==e.sourceUrl||source.url!==e.sourceUrl||d.locator!==e.locator)
    fail('PDF fingerprint or source metadata changed at event '+(n+1));
  if(!sha(e.fileSha256)||!Number.isSafeInteger(e.fileBytes)||e.fileBytes<5||
    !text(e.sourceUrl,2048)||!text(e.locator,160))fail('Bad PDF fingerprint snapshot at '+(n+1));
  if(!HANDLING_ACTIONS.includes(e.action)||!text(e.actor,80,2)||
    !text(e.note,3000,20)||!date(e.eventDate)||!stamp(e.recordedAt))
    fail('Invalid handling observation at '+(n+1));
  if(lastTime&&e.recordedAt<lastTime)fail('Event recording times are out of order at '+(n+1));
  if(stamp(e.recordedAt))lastTime=e.recordedAt;
  try {
   const expected=await hashEvent(e,subtle);
   if(expected!==e.hash)fail('Event hash mismatch at '+(n+1));
  }catch{fail('SHA-256 unavailable or event cannot be hashed at '+(n+1));}
  previous=e.hash;
 }
 if(journal.head!==previous)fail('Journal head does not match final event.');
 return {ok:errors.length===0,errors,head:previous,count:journal.entries.length};
}
export function handlingReport(journal,c){
 const safe=x=>String(x).replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
 const lines=['# Pattern Atlas · Self-reported evidence handling history','',
  'Case: '+safe(c.id)+' · '+safe(c.title),'',
  '**Last event hash:** '+journal.head,'',
  '> Hash links detect accidental or partial changes to a saved history. Anyone controlling the entire journal can regenerate its hashes. An independently preserved head hash is needed for external comparison; this is not authenticated custody or document truth.','',
  '| Seq | Event date | Action | Researcher label | PDF locator | PDF SHA-256 | Event hash |',
  '| ---: | --- | --- | --- | --- | --- | --- |',
  ...journal.entries.map(e=>'| '+e.seq+' | '+e.eventDate+' | '+safe(e.action)+' | '+safe(e.actor)+
    ' | '+safe(e.locator)+' | '+e.fileSha256+' | '+e.hash+' |'),
  '','## Researcher-entered handling notes',''];
 for(const e of journal.entries){
  lines.push('### Event '+e.seq+' · '+safe(e.action),'',
   '- Recorded at (UTC): '+safe(e.recordedAt),
   '- Event date (reported): '+safe(e.eventDate),
   '- Exact local-file digest: '+e.fileSha256,
   '- Previous event hash: '+e.previousHash,
   '- Notes: '+safe(e.note),'');
 }
 lines.push('No event independently verifies file origin, transfer, transaction settlement, or historical allegations.','');
 return lines.join('\n');
}
