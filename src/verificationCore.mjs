// Evidence review primitives. No network calls and no automatic truth judgments.
export const FORMAT = 'pattern-atlas-verification-v1';
export const REVIEW_STATES = ['not-reviewed','document-inspected','needs-corroboration','disputed'];
export const SOURCE_STATES = ['not-reviewed','opened-by-researcher','unavailable','compared-with-original'];
export const DISPUTE_STATES = ['open','addressed'];
const MAX_BUNDLE = 400_000;
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const validText = (v,max=3500) => typeof v === 'string' && v.length <= max;
const validStamp = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) && v.length<=40 && !Number.isNaN(Date.parse(v));
const validUrl = (value) => {
  if(typeof value!=='string'||value.length>2048)return false;
  try {const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}
  catch{return false;}
};
export function fingerprint(text) {
  // Used only for detecting stale annotations, not for authenticity or cryptographic verification.
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash ^ text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function collectClaims(caseFile) {
  const byNode=new Map(caseFile.nodes.map((n)=>[n.id,n]));
  const bySource=new Map(caseFile.sources.map((s)=>[s.id,s]));
  const make=(kind,id,title,statement,limitation,sourceIds,assessment)=>{
    const key=kind+':'+id;
    const refs=sourceIds.map((sourceId)=>[sourceId,bySource.get(sourceId)?.url||'']);
    const signature=fingerprint(JSON.stringify([key,title,statement,limitation,refs,assessment]));
    return {key,kind,id,title,statement,limitation,sourceIds:[...sourceIds],assessment,signature};
  };
  const traces=caseFile.traceSteps.map((s)=>make('trace',s.id,s.title,s.established,s.notEstablished,s.sourceIds,'milestone'));
  const edges=caseFile.edges.map((e)=>make('edge',e.id,(byNode.get(e.from)?.name||e.from)+' → '+(byNode.get(e.to)?.name||e.to)+': '+e.label,e.summary,
    'A documented relationship does not establish wrongdoing, completed payment or delivery, or organizational control beyond the statement above.',e.sourceIds,e.assessment));
  const events=caseFile.events.map((e)=>make('event',e.id,e.title,e.description,
    'This dated record must be assessed in context and does not independently prove any unstated consequence.',e.sourceIds,e.assessment));
  return [...traces,...edges,...events];
}
export function createBundle(caseFile) {
  return {format:FORMAT,caseId:caseFile.id,reviews:{},sourceChecks:{},counterevidence:[]};
}
export function usageBySource(caseFile) {
  const usage=Object.fromEntries(caseFile.sources.map((s)=>[s.id,{claims:[],hypotheses:[]}]));
  for(const c of collectClaims(caseFile))for(const id of c.sourceIds)if(usage[id])usage[id].claims.push(c.key);
  for(const h of caseFile.hypotheses)for(const id of h.sourceIds)if(usage[id])usage[id].hypotheses.push(h.id);
  return usage;
}
export function validateBundle(bundle,caseFile) {
  const errors=[];
  const fail=(x)=>{if(errors.length<30)errors.push(x);};
  if(!isRecord(bundle))return {ok:false,errors:['Verification bundle must be an object.']};
  try{if(JSON.stringify(bundle).length>400_000)fail('Verification bundle exceeds 400 KB.');}
  catch{return {ok:false,errors:['Verification bundle cannot be serialized.']};}
  if(bundle.format!==FORMAT)fail('Unsupported verification format.');
  if(bundle.caseId!==caseFile.id)fail('Bundle belongs to another case.');
  if(!isRecord(bundle.reviews)||!isRecord(bundle.sourceChecks)||!Array.isArray(bundle.counterevidence))
    return {ok:false,errors:[...errors,'Invalid review, source-check, or counterevidence collection.']};
  const claims=new Map(collectClaims(caseFile).map((c)=>[c.key,c]));
  const sources=new Map(caseFile.sources.map((s)=>[s.id,s]));
  if(Object.keys(bundle.reviews).length>1500)fail('Too many claim reviews.');
  if(Object.keys(bundle.sourceChecks).length>1000)fail('Too many source checks.');
  if(bundle.counterevidence.length>500)fail('Too many counterevidence records.');
  for(const [key,review] of Object.entries(bundle.reviews)){
    const claim=claims.get(key);
    if(!claim){fail('Claim no longer exists: '+key);continue;}
    if(!isRecord(review)){fail('Malformed claim review: '+key);continue;}
    if(review.signature!==claim.signature)fail('Claim text or referenced source changed: '+key);
    if(!REVIEW_STATES.includes(review.status))fail('Invalid review status: '+key);
    if(!validText(review.excerpt,1400)||!validText(review.analysis)||!validStamp(review.recordedAt))fail('Invalid review text or timestamp: '+key);
    if(!claim.sourceIds.includes(review.sourceId))fail('Excerpt source not linked to claim: '+key);
    if(review.status!=='not-reviewed'&&typeof review.excerpt==='string'&&typeof review.analysis==='string'&&!review.excerpt.trim()&&!review.analysis.trim())fail('Review note required: '+key);
  }
  for(const [id,check] of Object.entries(bundle.sourceChecks)){
    const source=sources.get(id);
    if(!source){fail('Source no longer exists: '+id);continue;}
    if(!isRecord(check)){fail('Malformed source check: '+id);continue;}
    if(check.sourceUrl!==source.url)fail('Source URL changed since inspection: '+id);
    if(!SOURCE_STATES.includes(check.status))fail('Invalid source-check status: '+id);
    if(!validText(check.originalUrl,2048)||!validText(check.note)||!validStamp(check.recordedAt))fail('Invalid source-check fields: '+id);
    if(check.originalUrl&&!validUrl(check.originalUrl))fail('Original link must use HTTPS: '+id);
    if(check.status==='compared-with-original'&&(!check.originalUrl||typeof check.note!=='string'||!check.note.trim()))fail('Original comparison requires URL and rationale: '+id);
  }
  const seen=new Set();
  for(const item of bundle.counterevidence){
    if(!isRecord(item)){fail('Malformed counterevidence item.');continue;}
    if(typeof item.id!=='string'||!/^ctr-[A-Za-z0-9-]{6,80}$/.test(item.id)||seen.has(item.id))fail('Unsafe or duplicate counterevidence ID.');
    seen.add(item.id);
    const claim=claims.get(item.claimKey);
    if(!claim)fail('Counterevidence targets unknown claim: '+String(item.claimKey));
    else if(item.signature!==claim.signature)fail('Counterevidence targets changed claim: '+item.claimKey);
    if(!sources.has(item.sourceId))fail('Counterevidence source is unknown.');
    if(!DISPUTE_STATES.includes(item.status))fail('Invalid counterevidence status.');
    if(item.status==='addressed' && (!validText(item.resolution,2000)||!(typeof item.resolution==='string'&&item.resolution.trim())||!validStamp(item.addressedAt)))
      fail('Addressed challenges require a written resolution note and timestamp.');
    if(item.status==='open' && item.resolution !== undefined && !validText(item.resolution,2000))
      fail('Invalid optional challenge note.');
    if(!validText(item.observation,2000)||!(typeof item.observation==='string'&&item.observation.trim())||!validText(item.whyItMatters,2000)||!(typeof item.whyItMatters==='string'&&item.whyItMatters.trim())||!validStamp(item.recordedAt))fail('Counterevidence needs a concise observation, rationale and time.');
  }
  return {ok:errors.length===0,errors};
}
const escaped=(v)=>String(v).replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
export function makeReviewReport(bundle,caseFile) {
  const claims=collectClaims(caseFile);
  const bySource=new Map(caseFile.sources.map((s)=>[s.id,s]));
  const lines=[
    '# Pattern Atlas evidence review','',
    'Case: '+caseFile.id+' · '+caseFile.title,'',
    '> These are locally entered researcher observations, not independent verification of claims.','',
    '## Claim review matrix','',
    '| Claim | Record classification | Inspection status | Linked sources |',
    '| --- | --- | --- | --- |',
    ...claims.map((c)=>'| '+escaped(c.title)+' | '+escaped(c.assessment)+' | '+escaped(bundle.reviews[c.key]?.status||'not-reviewed')+' | '+escaped(c.sourceIds.map((id)=>bySource.get(id)?.citation||id).join(', '))+' |'),
    '','## Open counterevidence notes','',
    ...bundle.counterevidence.filter((c)=>c.status==='open').map((c)=>'- **'+escaped(claims.find((x)=>x.key===c.claimKey)?.title||c.claimKey)+'**: '+escaped(c.observation)+'. Why it matters: '+escaped(c.whyItMatters)+'. Source: '+escaped(bySource.get(c.sourceId)?.citation||c.sourceId)+'.'),
    '','## Remaining evidentiary limits','',
    ...caseFile.traceSteps.map((s)=>'- **'+escaped(s.title)+'**: '+escaped(s.notEstablished)),
    '','No automatic webpage retrieval, source authentication, payment verification or truth assessment was performed.',''
  ];
  return lines.join('\n');
}
