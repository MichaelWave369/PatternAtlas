// Research operations model. Pure JavaScript, tested without a browser.
// Tasks track investigative WORK, never whether an underlying allegation is true.
export const RESEARCH_FORMAT = 'pattern-atlas-research-queue-v1';
export const TASK_STATES = ['queued','in-progress','needs-material','reviewed'];
const HTTPS = (text) => {
  if(typeof text!=='string'||text.length>2048)return false;
  try {const u=new URL(text);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}
  catch{return false;}
};
const isObj=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v,max=4000)=>typeof v==='string'&&v.length<=max;
const stamp=(v)=>typeof v==='string'&&v.length<=40&&!Number.isNaN(Date.parse(v))&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v);
function hash(text) {
  // Version drift guard, not a cryptographic signature.
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return (h>>>0).toString(16).padStart(8,'0');
}
function taskSignature(caseFile,task) {
  const urls=task.sourceIds.map((id)=>caseFile.sources.find((s)=>s.id===id)?.url||'');
  return hash(JSON.stringify([caseFile.id,task.id,task.title,task.question,task.evidenceNeeded,task.sourceIds,urls]));
}
export function deriveTasks(caseFile) {
  const tasks=[];
  for(const h of caseFile.hypotheses) {
    tasks.push({
      id:'hyp:'+h.id,kind:'hypothesis',
      title:h.question,
      question:h.context,
      evidenceNeeded:h.nextCheck,
      sourceIds:[...h.sourceIds]
    });
  }
  for(const step of caseFile.traceSteps) {
    tasks.push({
      id:'gap:'+step.id,kind:'evidence-gap',
      title:'Resolve evidence gap: '+step.title,
      question:step.notEstablished,
      evidenceNeeded:'Find independent records that resolve this specific limitation, or document why they remain unavailable.',
      sourceIds:[...step.sourceIds]
    });
  }
  return tasks.map((t)=>({...t,signature:taskSignature(caseFile,t)}));
}
export function allTasks(caseFile,bundle) {
  const automatic=deriveTasks(caseFile);
  const manual=(Array.isArray(bundle?.customTasks)?bundle.customTasks:[])
    .filter((t)=>isObj(t)&&Array.isArray(t.sourceIds))
    .map((t)=>({...t,kind:'researcher-added',signature:taskSignature(caseFile,t)}));
  return [...automatic,...manual];
}
export function emptyQueue(caseFile) {
  return {format:RESEARCH_FORMAT,caseId:caseFile.id,customTasks:[],updates:{}};
}
export function validateQueue(bundle,caseFile) {
  const errors=[];
  const fail=(msg)=>{if(errors.length<30)errors.push(msg);};
  if(!isObj(bundle))return {ok:false,errors:['Research queue must be an object.']};
  try {if(JSON.stringify(bundle).length>450000)fail('Queue exceeds the 450 KB limit.');}
  catch{return {ok:false,errors:['Queue cannot be serialized.']};}
  if(bundle.format!==RESEARCH_FORMAT)fail('Unrecognized queue format.');
  if(bundle.caseId!==caseFile.id)fail('Queue belongs to another case.');
  if(!Array.isArray(bundle.customTasks)||!isObj(bundle.updates))
    return {ok:false,errors:[...errors,'Invalid custom tasks or task updates.']};
  if(bundle.customTasks.length>120)fail('Too many custom research tasks.');
  if(Object.keys(bundle.updates).length>700)fail('Too many task updates.');
  const sources=new Set(caseFile.sources.map((s)=>s.id));
  const customIds=new Set();
  for(const t of bundle.customTasks) {
    if(!isObj(t)){fail('Invalid custom task.');continue;}
    if(typeof t.id!=='string'||!/^custom:[a-f0-9-]{16,50}$/.test(t.id)||customIds.has(t.id))fail('Duplicate or unsafe custom task ID.');
    customIds.add(t.id);
    if(!str(t.title,160)||!t.title.trim()||!str(t.question,2000)||!t.question.trim()||
       !str(t.evidenceNeeded,2000)||!t.evidenceNeeded.trim()||!stamp(t.createdAt))fail('Custom task needs a title, question, evidence requirement and date.');
    if(!Array.isArray(t.sourceIds)||t.sourceIds.length<1||t.sourceIds.length>15||
       t.sourceIds.some((id)=>!sources.has(id)))fail('Custom task needs one or more existing source records.');
  }
  const tasks=new Map(allTasks(caseFile,bundle).map((t)=>[t.id,t]));
  for(const [id,u] of Object.entries(bundle.updates)) {
    const t=tasks.get(id);
    if(!t){fail('Update points to a missing task: '+id);continue;}
    if(!isObj(u)){fail('Invalid update for '+id);continue;}
    if(u.signature!==t.signature)fail('Task changed since its update: '+id);
    if(!TASK_STATES.includes(u.status))fail('Invalid task status: '+id);
    if(!str(u.workNote)||!str(u.evidenceRef,2048)||!stamp(u.updatedAt))fail('Invalid note, evidence reference or timestamp: '+id);
    if(u.status==='needs-material'&&!(typeof u.workNote==='string'&&u.workNote.trim().length>=12))
      fail('A blocked task must explain the missing material: '+id);
    if(u.status==='reviewed') {
      if(!(typeof u.workNote==='string'&&u.workNote.trim().length>=25))fail('Review requires a substantial finding: '+id);
      if(typeof u.evidenceRef!=='string'||!(sources.has(u.evidenceRef)||HTTPS(u.evidenceRef)))
        fail('Review requires a source ID or HTTPS evidence link: '+id);
    }
    if(typeof u.evidenceRef==='string'&&u.evidenceRef&&!sources.has(u.evidenceRef)&&!HTTPS(u.evidenceRef))
      fail('Evidence pointer must reference a known source ID or HTTPS URL: '+id);
  }
  return {ok:errors.length===0,errors};
}
const safe=(v)=>String(v).replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
export function queueReport(bundle,caseFile) {
  const tasks=allTasks(caseFile,bundle);
  const sourceMap=new Map(caseFile.sources.map((s)=>[s.id,s]));
  const lines=['# Pattern Atlas research operations','',
    'Case: '+caseFile.id+' · '+caseFile.title,'',
    '> These tasks describe investigation work. A reviewed task does not establish any historical claim as true.','',
    '| Task | Scope | Work status | Evidence needed | Source basis |',
    '| --- | --- | --- | --- | --- |',
    ...tasks.map((t)=>'| '+safe(t.title)+' | '+safe(t.kind)+' | '+safe(bundle.updates[t.id]?.status||'queued')+
      ' | '+safe(t.evidenceNeeded)+' | '+safe(t.sourceIds.map((id)=>sourceMap.get(id)?.citation||id).join(', '))+' |'),
    '','## Research notes','',
    ...tasks.filter((t)=>bundle.updates[t.id]?.workNote?.trim()).map((t)=>{
      const u=bundle.updates[t.id];return '- **'+safe(t.title)+'** ('+safe(u.status)+'): '+safe(u.workNote)+
        (u.evidenceRef?' · Evidence pointer: '+safe(u.evidenceRef):'');
    }),
    '','No remote source retrieval, external transaction verification, or automated legal conclusion was performed.',''
  ];
  return lines.join('\n');
}
