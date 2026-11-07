import {useMemo,useState} from 'react';
import type {CaseFile} from './types';
import {allTasks,emptyQueue,TASK_STATES,validateQueue} from './researchQueueCore.mjs';
import {
  loadQueue,saveQueue,removeStoredQueue,downloadQueue,downloadQueueMarkdown,rawQueueBackup
} from './researchQueueStorage';
import type {TaskState,ResearchTask,QueueBundle,CustomTask,ResearchUpdate} from './researchQueueStorage';

type Filter = 'all'|TaskState;
const stateNames:Record<TaskState,string>={
  'queued':'Queued','in-progress':'Investigating','needs-material':'Missing material','reviewed':'Research reviewed'
};
const now=()=>new Date().toISOString();
const newId=()=> 'custom:'+crypto.randomUUID();
const beginning=(task:ResearchTask|null,bundle:QueueBundle)=>{
  const previous=task?bundle.updates[task.id]:undefined;
  const ref=previous?.evidenceRef||'';
  return {
    status:previous?.status||'queued' as TaskState,
    note:previous?.workNote||'',
    evidenceChoice:ref.startsWith('https://')?'external':ref,
    url:ref.startsWith('https://')?ref:''
  };
};
type Draft=ReturnType<typeof beginning>;

export default function ResearchQueue({caseFile}:{caseFile:CaseFile}) {
  const [initial]=useState(()=>loadQueue(caseFile));
  const [bundle,setBundle]=useState<QueueBundle>(initial.bundle);
  const [locked,setLocked]=useState(initial.locked);
  const [warning,setWarning]=useState(initial.warning);
  const [message,setMessage]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [kind,setKind]=useState('all');
  const [search,setSearch]=useState('');
  const tasks=useMemo(()=>allTasks(caseFile,bundle) as ResearchTask[],[caseFile,bundle]);
  const [selectedId,setSelectedId]=useState(()=>((allTasks(caseFile,initial.bundle) as ResearchTask[])[0]?.id||''));
  const selected=tasks.find((t:ResearchTask)=>t.id===selectedId)||null;
  const [draft,setDraft]=useState<Draft>(()=>beginning((allTasks(caseFile,initial.bundle) as ResearchTask[])[0]||null,initial.bundle));
  const [customOpen,setCustomOpen]=useState(false);
  const [newTitle,setNewTitle]=useState('');
  const [newQuestion,setNewQuestion]=useState('');
  const [newEvidence,setNewEvidence]=useState('');
  const [newSource,setNewSource]=useState(caseFile.sources[0]?.id||'');

  function apply(next:QueueBundle):boolean {
    if(locked){setMessage('Existing storage is protected. Download a recovery copy and explicitly reset it first.');return false;}
    const status=saveQueue(caseFile,next);
    setMessage(status.message);
    if(status.ok){setBundle(next);return true;}
    return false;
  }
  function selectTask(task:ResearchTask) {
    setSelectedId(task.id);
    setDraft(beginning(task,bundle));
    setMessage('');
  }
  function saveTask() {
    if(!selected)return;
    const evidenceRef=draft.evidenceChoice==='external'?draft.url.trim():draft.evidenceChoice;
    const update:ResearchUpdate={
      status:draft.status,
      workNote:draft.note.trim(),
      evidenceRef:evidenceRef||'',
      signature:selected.signature,
      updatedAt:now()
    };
    apply({...bundle,updates:{...bundle.updates,[selected.id]:update}});
  }
  function addCustom() {
    if(!newTitle.trim()||!newQuestion.trim()||!newEvidence.trim()||!newSource) {
      setMessage('Complete the question, evidence requirement and supporting source.');return;
    }
    const task:CustomTask={
      id:newId(),
      title:newTitle.trim().slice(0,160),
      question:newQuestion.trim().slice(0,2000),
      evidenceNeeded:newEvidence.trim().slice(0,2000),
      sourceIds:[newSource],
      createdAt:now()
    };
    if(apply({...bundle,customTasks:[...bundle.customTasks,task]})){
      setNewTitle('');setNewQuestion('');setNewEvidence('');setCustomOpen(false);
      const tasksAfter=allTasks(caseFile,{...bundle,customTasks:[...bundle.customTasks,task]}) as ResearchTask[];
      const added=tasksAfter.find((t:ResearchTask)=>t.id===task.id);
      if(added)selectTask(added);
    }
  }
  function removeCustom() {
    if(!selected||selected.kind!=='researcher-added'||!window.confirm('Delete this private research task and its notes? Export first if needed.'))return;
    const next:QueueBundle={
      ...bundle,
      customTasks:bundle.customTasks.filter((t)=>t.id!==selected.id),
      updates:Object.fromEntries(Object.entries(bundle.updates).filter(([id])=>id!==selected.id))
    };
    if(apply(next)){
      const first=(allTasks(caseFile,next) as ResearchTask[])[0]||null;
      setSelectedId(first?.id||'');
      setDraft(beginning(first,next));
    }
  }
  function resetQueue() {
    if(!window.confirm('Delete this case’s locally saved research queue? Export first. This cannot be undone.'))return;
    if(!removeStoredQueue(caseFile)){setMessage('Browser storage could not be cleared.');return;}
    const fresh=emptyQueue(caseFile) as QueueBundle;
    setBundle(fresh);setWarning('');setLocked(false);setMessage('Local research queue reset.');
    const first=(allTasks(caseFile,fresh) as ResearchTask[])[0]||null;
    setSelectedId(first?.id||'');
    setDraft(beginning(first,fresh));
  }
  async function importQueue(file?:File) {
    if(!file)return;
    if(locked){setMessage('Existing stored data is protected. Back it up and reset before importing.');return;}
    if(file.size>450000){setMessage('Import rejected: file is too large.');return;}
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const result=validateQueue(parsed,caseFile);
      if(!result.ok){setMessage('Import rejected: '+result.errors.slice(0,3).join(' '));return;}
      if((bundle.customTasks.length||Object.keys(bundle.updates).length)&&!window.confirm('Replace this case’s local research work? Export a backup before replacing it.'))return;
      const incoming=parsed as QueueBundle;
      if(apply(incoming)){
        const first=(allTasks(caseFile,incoming) as ResearchTask[])[0]||null;
        setSelectedId(first?.id||'');setDraft(beginning(first,incoming));
      }
    }catch{setMessage('Import rejected: not valid research queue JSON.');}
  }
  const counts={total:tasks.length,investigating:0,needs:0,reviewed:0};
  for(const t of tasks){
    const state=bundle.updates[t.id]?.status||'queued';
    if(state==='in-progress')counts.investigating++;
    if(state==='needs-material')counts.needs++;
    if(state==='reviewed')counts.reviewed++;
  }
  const filtered=tasks.filter((t:ResearchTask)=>{
    const taskStatus=bundle.updates[t.id]?.status||'queued';
    return (filter==='all'||taskStatus===filter)&&(kind==='all'||kind===t.kind)&&
      (t.title+' '+t.question+' '+t.evidenceNeeded+' '+t.sourceIds.join(' ')).toLowerCase().includes(search.toLowerCase());
  });
  return <section className="content-page research-page">
    <div className="eyebrow">CASE {caseFile.id} / LOCAL-FIRST RESEARCH OPERATIONS</div>
    <h1 className="trace-page-title">Research Queue.</h1>
    <p className="trace-deck">Turn unresolved hypotheses and missing-evidence statements into concrete investigation tasks. Track what you checked, what evidence is missing, and where you found it. Status tracks your research work, <strong>not historical truth.</strong></p>
    <div className="rq-stats">
      <div><strong>{counts.total}</strong><span>RESEARCH CHECKPOINTS</span></div>
      <div><strong>{counts.investigating}</strong><span>INVESTIGATING</span></div>
      <div><strong>{counts.needs}</strong><span>MISSING MATERIAL</span></div>
      <div><strong>{counts.reviewed}</strong><span>MANUALLY REVIEWED</span></div>
    </div>
    <div className="rq-toolbar">
      <button className="rq-primary" onClick={()=>setCustomOpen(!customOpen)} disabled={locked} aria-expanded={customOpen}>+ Add sourced research task</button>
      <div className="rq-exports">
        <button disabled={locked} onClick={()=>downloadQueue(bundle)}>Export queue JSON</button>
        <button disabled={locked} onClick={()=>downloadQueueMarkdown(bundle,caseFile)}>Export research brief</button>
        <label>Import JSON<input type="file" accept="application/json,.json" onChange={(e)=>{void importQueue(e.target.files?.[0]);e.target.value='';}}/></label>
      </div>
    </div>
    {warning&&<div className="rq-warning" role="alert"><strong>Stored queue protected:</strong> {warning}
      {locked&&<div className="rq-recovery"><button onClick={()=>setMessage(rawQueueBackup(caseFile)?'Stored data downloaded for recovery.':'No saved queue could be read.')}>Download recovery file</button><button onClick={resetQueue}>Reset after backup</button></div>}
    </div>}
    {message&&<div role="status" className="rq-message">{message}</div>}
    {customOpen&&<div className="rq-create">
      <div className="eyebrow">RESEARCHER-ADDED INVESTIGATION</div><h2>Create a task tied to an existing source</h2>
      <div className="rq-create-fields">
        <label>Question title<input maxLength={160} value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} placeholder="Does an original ledger record show payment?" /></label>
        <label>Why this needs investigation<textarea rows={3} maxLength={2000} value={newQuestion} onChange={(e)=>setNewQuestion(e.target.value)} placeholder="Explain what is known and why the question remains open." /></label>
        <label>What would be sufficient evidence?<textarea rows={3} maxLength={2000} value={newEvidence} onChange={(e)=>setNewEvidence(e.target.value)} placeholder="Original settlement record, verified asset ledger, delivery acceptance…" /></label>
        <label>Source that motivates this question<select value={newSource} onChange={(e)=>setNewSource(e.target.value)}>
          {caseFile.sources.map((s)=><option key={s.id} value={s.id}>{s.citation} · {s.title}</option>)}
        </select></label>
      </div><button className="rq-primary" disabled={!caseFile.sources.length||locked} onClick={addCustom}>Add to private queue</button>
    </div>}
    <div className="rq-layout">
      <aside className="rq-list">
        <label>SEARCH TASKS<input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Sources, keywords, questions…" /></label>
        <div className="rq-filters">
          <label>STATUS<select value={filter} onChange={(e)=>setFilter(e.target.value as Filter)}>
            <option value="all">All statuses</option>
            {TASK_STATES.map((s:string)=><option key={s} value={s}>{stateNames[s as TaskState]}</option>)}
          </select></label>
          <label>ORIGIN<select value={kind} onChange={(e)=>setKind(e.target.value)}>
            <option value="all">All tasks</option><option value="hypothesis">Hypotheses</option><option value="evidence-gap">Evidence gaps</option><option value="researcher-added">Added by researcher</option>
          </select></label>
        </div>
        <div className="rq-results">{filtered.length} tasks found</div>
        {filtered.map((t:ResearchTask)=><button key={t.id} className={'rq-task'+(selected?.id===t.id?' active':'')} onClick={()=>selectTask(t)}>
          <span>{t.kind.replace(/-/g,' ').toUpperCase()} · {stateNames[bundle.updates[t.id]?.status||'queued']}</span><strong>{t.title}</strong>
          <small>{t.sourceIds.length} source{t.sourceIds.length===1?'':'s'}</small>
        </button>)}
        {!filtered.length&&<div className="empty-state">No tasks match the current filter.</div>}
      </aside>
      <div className="rq-detail">
        {selected?<><div className="eyebrow">RESEARCH TASK / {selected.id}</div>
          <h2>{selected.title}</h2>
          <div className="rq-problem"><span>THE UNRESOLVED QUESTION</span><p>{selected.question}</p></div>
          <div className="rq-criteria"><span>EVIDENCE TO LOOK FOR</span><p>{selected.evidenceNeeded}</p></div>
          <div className="rq-source-head"><h3>Starting documents</h3><span>Context, not proof of resolution</span></div>
          <div className="rq-sources">{selected.sourceIds.map((id)=>{
            const s=caseFile.sources.find((x)=>x.id===id);
            return s?<a key={id} href={s.url} target="_blank" rel="noopener noreferrer">↗ {s.citation} <span>{s.title}</span></a>:null;
          })}</div>
          <div className="rq-editor">
            <h3>Record your research progress</h3>
            <label>Work status<select value={draft.status} onChange={(e)=>setDraft((d)=>({...d,status:e.target.value as TaskState}))}>
              {TASK_STATES.map((s:string)=><option key={s} value={s}>{stateNames[s as TaskState]}</option>)}
            </select></label>
            <label>What was checked? What is missing or contradicted?<textarea rows={6} maxLength={4000} value={draft.note} onChange={(e)=>setDraft((d)=>({...d,note:e.target.value}))} placeholder="Record your search method, observed result, alternative interpretation, and specific remaining limitation." /></label>
            <label>Evidence pointer {draft.status==='reviewed'?'(required to mark research reviewed)':'(optional)'}
              <select value={draft.evidenceChoice} onChange={(e)=>setDraft((d)=>({...d,evidenceChoice:e.target.value}))}>
                <option value="">None yet</option>
                {caseFile.sources.map((s)=><option key={s.id} value={s.id}>{s.citation}</option>)}
                <option value="external">New HTTPS document link…</option>
              </select>
            </label>
            {draft.evidenceChoice==='external'&&<label>New HTTPS source URL<input type="url" maxLength={2048} value={draft.url} onChange={(e)=>setDraft((d)=>({...d,url:e.target.value}))} placeholder="https://official-source.example/document"/></label>}
            <div className="rq-action-row"><button className="rq-primary" disabled={locked} onClick={saveTask}>Save private progress</button>
              {selected.kind==='researcher-added'&&<button className="rq-danger" disabled={locked} onClick={removeCustom}>Delete custom task</button>}
            </div>
            <p>“Research reviewed” means an investigator completed this checkpoint and recorded a substantial note and evidence pointer. It does <strong>not</strong> certify a payment, source, allegation, or scientific result.</p>
          </div>
        </>:<div className="empty-state">No task selected. Add a sourced hypothesis or claim-trace milestone in Case Studio.</div>}
      </div>
    </div>
    <div className="rq-footer">
      <p><strong>Local only.</strong> Research notes never sync to GitHub or other servers. Back up the queue JSON before clearing browser storage. A changed source link or task wording invalidates older status annotations rather than silently inheriting them.</p>
      {!locked&&<button onClick={resetQueue}>Clear this case's local research queue</button>}
    </div>
  </section>;
}
