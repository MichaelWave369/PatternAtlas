// MK9 Original Document Lab: byte-level comparison and manual page notes.
// No PDF text extraction or upload, no source authentication and no settlement inference.
export const DOCUMENT_FORMAT='pattern-atlas-document-inspections-v1';
export const MAX_FILE_BYTES=50*1024*1024;
export const MAX_MANIFEST_CHARS=440000;
export const DOC_STATES=['fingerprinted','pages-reviewed','needs-original'];
export const ORIGINS=['official-repository','archive-mirror','other'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const txt=(v,n,required=true)=>typeof v==='string'&&v.length<=n&&(!required||v.trim().length>0);
const stamp=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)&&!Number.isNaN(Date.parse(v));
const https=v=>{if(typeof v!=='string'||v.length>2048)return false;try{const u=new URL(v);
  return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}};
const nameOK=v=>typeof v==='string'&&v.length<=180&&v.length>4&&/\.pdf$/i.test(v)&&
  !/[\/\\\x00-\x1f\x7f]/.test(v);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
export function emptyManifest(c){return {format:DOCUMENT_FORMAT,caseId:c.id,documents:[]};}
export async function fingerprintPdf(file,subtle=globalThis.crypto?.subtle){
  if(!file||typeof file.arrayBuffer!=='function')throw Error('Select a PDF file from your computer.');
  if(!subtle)throw Error('SHA-256 hashing requires a secure browser context.');
  if(!nameOK(file.name))throw Error('Only PDF filenames without path separators are accepted.');
  if(!Number.isSafeInteger(file.size)||file.size<5||file.size>MAX_FILE_BYTES)
    throw Error('PDF size must be between 5 bytes and 50 MiB.');
  const bytes=await file.arrayBuffer();
  const v=new Uint8Array(bytes);
  if(v.length!==file.size)throw Error('File length changed during reading.');
  if(String.fromCharCode(...v.subarray(0,5))!=='%PDF-')
    throw Error('File does not begin with a PDF header. No file was stored.');
  const hash=await subtle.digest('SHA-256',bytes);
  const sha256=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
  return {sha256,bytes:file.size,fileName:file.name};
}
export function compareFingerprint(stored,observed){
  return {sameBytes:stored.sha256===observed.sha256&&stored.bytes===observed.bytes,
    hashEqual:stored.sha256===observed.sha256,sizeEqual:stored.bytes===observed.bytes};
}
export function createInspection(c,input){
  const source=c.sources.find(s=>s.id===input.sourceId);
  return {id:'doc:'+crypto.randomUUID(),sourceId:input.sourceId,sourceUrlAtCapture:source?.url||'',
    locator:input.locator.trim(),downloadUrl:input.downloadUrl.trim(),origin:input.origin,
    fileName:input.fileName,bytes:input.bytes,sha256:input.sha256,
    status:'fingerprinted',researchNote:input.researchNote.trim(),
    observations:[],capturedAt:new Date().toISOString()};
}
export function validateManifest(m,c){
  const errors=[];const fail=v=>{if(errors.length<25)errors.push(v);};
  if(!obj(m))return {ok:false,errors:['Document manifest must be an object.']};
  try{if(JSON.stringify(m).length>MAX_MANIFEST_CHARS)fail('Manifest exceeds 440 KB.');}
  catch{return {ok:false,errors:['Manifest cannot be serialized.']};}
  if(m.format!==DOCUMENT_FORMAT)fail('Unrecognized manifest format.');
  if(m.caseId!==c.id)fail('Manifest belongs to a different case.');
  if(!Array.isArray(m.documents))return {ok:false,errors:[...errors,'Documents must be an array.']};
  if(m.documents.length>100)fail('Too many source-file entries.');
  const sources=new Map(c.sources.map(s=>[s.id,s]));const ids=new Set();
  for(const d of m.documents){
    if(!obj(d)){fail('Invalid document entry.');continue;}
    if(typeof d.id!=='string'||!/^doc:[a-f0-9-]{36}$/.test(d.id)||ids.has(d.id))
      fail('Invalid or duplicate document ID.');
    ids.add(d.id);
    const source=sources.get(d.sourceId);
    if(!source)fail('Document must refer to a known case source.');
    else if(d.sourceUrlAtCapture!==source.url)fail('Source URL changed since file capture: '+d.id);
    if(!txt(d.locator,160)||!https(d.downloadUrl)||!ORIGINS.includes(d.origin))
      fail('Document needs a locator, HTTPS retrieval URL and source-host classification.');
    if(!nameOK(d.fileName)||!Number.isSafeInteger(d.bytes)||d.bytes<5||d.bytes>MAX_FILE_BYTES||
       !hex(d.sha256)||!stamp(d.capturedAt))
      fail('Invalid PDF filename, byte count, digest or capture timestamp.');
    if(!DOC_STATES.includes(d.status)||!txt(d.researchNote,2500))
      fail('Document needs valid inspection status and explanatory note.');
    if(!Array.isArray(d.observations)||d.observations.length>40){fail('Invalid page observations.');continue;}
    const noteIds=new Set();
    for(const note of d.observations){
      if(!obj(note)){fail('Malformed page observation.');continue;}
      if(typeof note.id!=='string'||!/^note:[a-f0-9-]{36}$/.test(note.id)||noteIds.has(note.id))
        fail('Invalid or duplicate page observation ID.');
      noteIds.add(note.id);
      if(!Number.isSafeInteger(note.page)||note.page<1||note.page>10000||
        !txt(note.observed,2000)||!txt(note.notEstablished,2000)||!txt(note.pointer,350,false)||
        !stamp(note.recordedAt))fail('Page notes need a page number, observation, limitation and timestamp.');
    }
    if(d.status==='pages-reviewed'&&!d.observations.length)
      fail('Marking pages reviewed requires at least one manual page observation.');
  }
  return {ok:errors.length===0,errors};
}
export function duplicateFingerprints(manifest){
  const byHash=new Map();
  for(const d of manifest.documents){
    const ids=byHash.get(d.sha256)||[];ids.push(d.id);byHash.set(d.sha256,ids);
  }
  return [...byHash.entries()].filter(([,ids])=>ids.length>1).map(([sha256,ids])=>({sha256,ids}));
}
const safe=s=>String(s).replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
export function manifestReport(manifest,c){
  const byId=new Map(c.sources.map(s=>[s.id,s]));
  const out=['# Pattern Atlas · Original Document Inspection','',
    'Case: '+safe(c.id)+' · '+safe(c.title),'',
    '> SHA-256 identifies exact downloaded bytes only; it cannot authenticate a publisher, PDF, email, bank record or allegation.','',
    '| Source | Locator | Byte size | SHA-256 | Reported host class | Page notes |',
    '| --- | --- | ---: | --- | --- | ---: |',
    ...manifest.documents.map(d=>'| '+safe(byId.get(d.sourceId)?.citation||d.sourceId)+' | '+safe(d.locator)+
      ' | '+d.bytes+' | '+d.sha256+' | '+safe(d.origin)+' | '+d.observations.length+' |'),
    '','## Manual inspection notes',''];
  for(const d of manifest.documents){
    out.push('### '+safe(d.locator)+' · '+safe(d.fileName),'',
      '- Source URL captured: '+safe(d.sourceUrlAtCapture),
      '- File retrieval link entered by researcher: '+safe(d.downloadUrl),
      '- Capture note: '+safe(d.researchNote),
      '- Status: '+safe(d.status),'');
    for(const n of d.observations)out.push('- **PDF page '+n.page+'**: '+safe(n.observed)+
      '. **Not established**: '+safe(n.notEstablished)+(n.pointer?' · Pointer: '+safe(n.pointer):''));
    out.push('');
  }
  out.push('Files were selected and hashed locally. Neither their binary content nor any banking credentials were included in this manifest.','');
  return out.join('\n');
}
