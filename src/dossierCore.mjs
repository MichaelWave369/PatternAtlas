// Pure case-specific dossier model. A comparison is NOT an inferred relationship.
export const DOSSIER_FORMAT='pattern-atlas-dossiers-v1';
const isRecord=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeText=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const iso=(x)=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(x)&&x.length<=40&&!Number.isNaN(Date.parse(x));
const idPattern=/^local:[a-f0-9-]{16,50}$/;
function hash(text) {
  // A change detector, not an authenticity or cryptographic signature.
  let v=2166136261;for(let i=0;i<text.length;i++)v=Math.imul(v^text.charCodeAt(i),16777619);
  return (v>>>0).toString(16).padStart(8,'0');
}
export function pairFingerprint(caseFile,sourceA,sourceB) {
  const get=(id)=>caseFile.sources.find((s)=>s.id===id);
  const encode=(id)=>{const s=get(id);return s?[s.id,s.citation,s.date,s.url]:null;};
  return hash(JSON.stringify([caseFile.id,encode(sourceA),encode(sourceB)]));
}
export function emptyDossiers(caseFile) {
  return {format:DOSSIER_FORMAT,caseId:caseFile.id,dossiers:[]};
}
export function createDossier(caseFile,settings) {
  const stamp=new Date().toISOString();
  return {
    id:settings.id||'local:'+crypto.randomUUID(),
    sourceA:settings.sourceA,sourceB:settings.sourceB,
    signature:pairFingerprint(caseFile,settings.sourceA,settings.sourceB),
    title:settings.title,question:settings.question,
    findingA:settings.findingA, findingB:settings.findingB,sharedContext:settings.sharedContext,
    notEstablished:settings.notEstablished,alternative:settings.alternative,nextCheck:settings.nextCheck,
    createdAt:stamp,updatedAt:stamp
  };
}
export function validateDossiers(value,caseFile) {
  const errors=[];
  const add=(reason)=>{if(errors.length<30)errors.push(reason);};
  if(!isRecord(value))return {ok:false,errors:['Dossier bundle must be an object.']};
  try{if(JSON.stringify(value).length>440000)add('Dossier bundle exceeds 440 KB.');}
  catch{return {ok:false,errors:['Bundle cannot be serialized.']};}
  if(value.format!==DOSSIER_FORMAT)add('Unsupported dossier format.');
  if(value.caseId!==caseFile.id)add('Bundle belongs to another case.');
  if(!Array.isArray(value.dossiers))return {ok:false,errors:[...errors,'Dossiers must be an array.']};
  if(value.dossiers.length>80)add('Too many dossier records.');
  const sources=new Set(caseFile.sources.map((s)=>s.id));
  const ids=new Set();
  for(const d of value.dossiers) {
    if(!isRecord(d)){add('Malformed dossier.');continue;}
    if(typeof d.id!=='string'||!idPattern.test(d.id)||ids.has(d.id))add('Invalid or duplicate dossier ID.');
    ids.add(d.id);
    if(!sources.has(d.sourceA)||!sources.has(d.sourceB)||d.sourceA===d.sourceB)add('A dossier requires two distinct existing sources.');
    if(d.signature!==pairFingerprint(caseFile,d.sourceA,d.sourceB))add('Source metadata changed; previous dossier needs review: '+String(d.id));
    if(!safeText(d.title,180)||!safeText(d.question,2200)||!safeText(d.findingA,4000)||!safeText(d.findingB,4000)||
       !safeText(d.sharedContext,4000)||!safeText(d.notEstablished,4000)||!safeText(d.alternative,4000)||!safeText(d.nextCheck,4000))
      add('All dossier interpretations and limitations must be complete.');
    if(!iso(d.createdAt)||!iso(d.updatedAt))add('Invalid dossier timestamps.');
  }
  return {ok:errors.length===0,errors};
}
const md=(v)=>String(v).replace(/\r?\n/g,' ').trim();
export function makeDossierReport(value,caseFile) {
  const source=(id)=>caseFile.sources.find((s)=>s.id===id);
  const out=['# Pattern Atlas · Document dossiers','',
  'Case: '+caseFile.id+' · '+caseFile.title,'',
  '> Comparisons are researcher-authored interpretations, not a proof that the documents concern the same transaction or an identical technical system.',''];
  for(const d of value.dossiers) {
    const a=source(d.sourceA),b=source(d.sourceB);
    out.push('## '+md(d.title),'','**Question:** '+md(d.question),'',
      '**Document A:** '+md(a?.citation||d.sourceA)+' · '+md(a?.url||''),'',
      md(d.findingA),'',
      '**Document B:** '+md(b?.citation||d.sourceB)+' · '+md(b?.url||''),'',
      md(d.findingB),'',
      '**Shared context:** '+md(d.sharedContext),'',
      '**Not established:** '+md(d.notEstablished),'',
      '**Alternative explanation:** '+md(d.alternative),'',
      '**Next verification:** '+md(d.nextCheck),'');
  }
  out.push('No source documents were automatically retrieved or authenticated, and no financial or criminal conclusion was generated.','');
  return out.join('\n');
}
