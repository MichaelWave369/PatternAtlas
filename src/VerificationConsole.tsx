import {useMemo,useState} from 'react';
import type {CaseFile} from './types';
import {collectClaims,usageBySource,REVIEW_STATES,SOURCE_STATES,validateBundle,createBundle} from './verificationCore.mjs';
import {loadVerification,saveVerification,discardStoredVerification,downloadText,exportVerification,exportMarkdown} from './verificationStorage';
import type {ClaimReview,SourceCheck,Counterevidence,ReviewStatus,SourceCheckStatus,VerificationBundle} from './verificationStorage';

type Tab = 'claims'|'sources'|'counterevidence';
const LABELS:Record<string,string>={
  'not-reviewed':'Not reviewed',
  'document-inspected':'Document inspected (manual)',
  'needs-corroboration':'Needs corroboration',
  'disputed':'Disputed by researcher',
  'opened-by-researcher':'Opened manually',
  'unavailable':'Link unavailable (manual)',
  'compared-with-original':'Compared with original (manual)',
  'open':'Open challenge',
  'addressed':'Addressed in notes'
};
const safeHost=(url:string)=>{try{return new URL(url).hostname;}catch{return 'Invalid host';}};
const timestamp=()=>new Date().toISOString();
const nowDate=()=>new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
interface ReviewDraft {status:ReviewStatus; sourceId:string; excerpt:string; analysis:string}
interface SourceDraft {status:SourceCheckStatus; originalUrl:string; note:string}
const firstReview=(sourceId:string):ReviewDraft=>({status:'not-reviewed',sourceId,excerpt:'',analysis:''});
const firstSource=():SourceDraft=>({status:'not-reviewed',originalUrl:'',note:''});

export default function VerificationConsole({caseFile}:{caseFile:CaseFile}) {
  const [initial]=useState(()=>loadVerification(caseFile));
  const [bundle,setBundle]=useState<VerificationBundle>(initial.bundle);
  const [locked,setLocked]=useState(initial.locked);
  const [warning,setWarning]=useState(initial.warning);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<Tab>('claims');
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const claims=useMemo(()=>collectClaims(caseFile),[caseFile]);
  const usage=useMemo(()=>usageBySource(caseFile),[caseFile]);
  const [claimKey,setClaimKey]=useState(claims[0]?.key||'');
  const active=claims.find((claim)=>claim.key===claimKey);
  const [reviewDraft,setReviewDraft]=useState<ReviewDraft>(()=>{
    const saved=active?initial.bundle.reviews[active.key]:undefined;
    return saved?{status:saved.status,sourceId:saved.sourceId,excerpt:saved.excerpt,analysis:saved.analysis}:firstReview(active?.sourceIds[0]||'');
  });
  const [sourceId,setSourceId]=useState(caseFile.sources[0]?.id||'');
  const [sourceDraft,setSourceDraft]=useState<SourceDraft>(()=>{
    const saved=sourceId?initial.bundle.sourceChecks[sourceId]:undefined;
    return saved?{status:saved.status,originalUrl:saved.originalUrl,note:saved.note}:firstSource();
  });
  const chosenSource=caseFile.sources.find((s)=>s.id===sourceId);
  const [challengeSource,setChallengeSource]=useState(caseFile.sources[0]?.id||'');
  const [observation,setObservation]=useState('');
  const [reason,setReason]=useState('');
  const [resolutionDrafts,setResolutionDrafts]=useState<Record<string,string>>({});

  function applyBundle(next:VerificationBundle) {
    if(locked){setMessage('Review storage is protected. Back it up and reset before changing it.');return false;}
    const result=saveVerification(caseFile,next);
    setMessage(result.message);
    if(result.ok){setBundle(next);return true;}
    return false;
  }
  function selectClaim(key:string) {
    const claim=claims.find((c)=>c.key===key);
    if(!claim)return;
    setClaimKey(key);
    const saved=bundle.reviews[key];
    setReviewDraft(saved?
      {status:saved.status,sourceId:saved.sourceId,excerpt:saved.excerpt,analysis:saved.analysis}
      :firstReview(claim.sourceIds[0]||''));
    setMessage('');
  }
  function selectSource(id:string) {
    const chosen=caseFile.sources.find((s)=>s.id===id);
    if(!chosen)return;
    setSourceId(id);
    const saved=bundle.sourceChecks[id];
    setSourceDraft(saved?{status:saved.status,originalUrl:saved.originalUrl,note:saved.note}:firstSource());
    setMessage('');
  }
  function saveClaimReview() {
    if(!active||!reviewDraft.sourceId)return;
    const record:ClaimReview={
      signature:active.signature,status:reviewDraft.status,sourceId:reviewDraft.sourceId,
      excerpt:reviewDraft.excerpt.trim().slice(0,1400),analysis:reviewDraft.analysis.trim().slice(0,3500),recordedAt:timestamp()
    };
    applyBundle({...bundle,reviews:{...bundle.reviews,[active.key]:record}});
  }
  function saveSourceCheck() {
    if(!chosenSource)return;
    const check:SourceCheck={
      status:sourceDraft.status,sourceUrl:chosenSource.url,
      originalUrl:sourceDraft.originalUrl.trim(),note:sourceDraft.note.trim(),recordedAt:timestamp()
    };
    applyBundle({...bundle,sourceChecks:{...bundle.sourceChecks,[chosenSource.id]:check}});
  }
  function addCounterevidence() {
    if(!active){setMessage('Select a claim before adding a challenge.');return;}
    if(!observation.trim()||!reason.trim()||!challengeSource){setMessage('Choose a source and describe the contrary observation and why it matters.');return;}
    const record:Counterevidence={
      id:'ctr-'+crypto.randomUUID(),claimKey:active.key,signature:active.signature,sourceId:challengeSource,
      observation:observation.trim().slice(0,2000),whyItMatters:reason.trim().slice(0,2000),
      status:'open',recordedAt:timestamp()
    };
    if(applyBundle({...bundle,counterevidence:[...bundle.counterevidence,record]})){
      setObservation('');setReason('');
    }
  }
  function setCounterStatus(id:string,status:'open'|'addressed') {
    if(status==='addressed'&&!resolutionDrafts[id]?.trim()){
      setMessage('Explain how this challenge was addressed before changing its status.');
      return;
    }
    const changed=bundle.counterevidence.map((row)=>{
      if(row.id!==id)return row;
      if(status==='addressed')return {...row,status,resolution:resolutionDrafts[id].trim().slice(0,2000),addressedAt:timestamp()};
      const {resolution: _resolution,addressedAt: _addressedAt,...rest}=row;
      void _resolution;void _addressedAt;
      return {...rest,status};
    });
    if(applyBundle({...bundle,counterevidence:changed})){
      setResolutionDrafts((previous)=>{const next={...previous};delete next[id];return next;});
    }
  }
  function eraseCounter(id:string) {
    if(!window.confirm('Delete this locally stored counterevidence record?'))return;
    applyBundle({...bundle,counterevidence:bundle.counterevidence.filter((row)=>row.id!==id)});
  }
  async function importFile(file?:File) {
    if(!file)return;
    if(locked){setMessage('Review storage is protected. Download the original and explicitly reset it before importing.');return;}
    if(file.size>400_000){setMessage('Import rejected: file exceeds 400 KB.');return;}
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const result=validateBundle(parsed,caseFile);
      if(!result.ok){setMessage('Import rejected: '+result.errors.slice(0,3).join(' '));return;}
      if((Object.keys(bundle.reviews).length||Object.keys(bundle.sourceChecks).length||bundle.counterevidence.length)&&
        !window.confirm('Replace this case’s local verification review with the imported file? Export your current review first.'))return;
      const incoming=parsed as VerificationBundle;
      if(applyBundle(incoming)){
        const reviewed=active?incoming.reviews[active.key]:undefined;
        setReviewDraft(reviewed?{status:reviewed.status,sourceId:reviewed.sourceId,excerpt:reviewed.excerpt,analysis:reviewed.analysis}:firstReview(active?.sourceIds[0]||''));
        const checked=sourceId?incoming.sourceChecks[sourceId]:undefined;
        setSourceDraft(checked?{status:checked.status,originalUrl:checked.originalUrl,note:checked.note}:firstSource());
      }
    }catch{setMessage('Import rejected: invalid JSON file.');}
  }
  function rawBackup() {
    try{
      const value=window.localStorage.getItem('pattern-atlas.verification.v1.'+caseFile.id);
      if(value)downloadText(value,caseFile.id.toLowerCase()+'-recovery-backup.json','application/json');
      else setMessage('No existing stored file was found.');
    }catch{setMessage('Could not read stored data for backup.');}
  }
  function resetProtected() {
    if(!window.confirm('Reset this case’s locally stored review data? This permanently deletes local review entries. Export a backup first.'))return;
    if(!discardStoredVerification(caseFile)){setMessage('Could not clear local storage.');return;}
    setLocked(false);setWarning('');
    setBundle(createBundle(caseFile) as VerificationBundle);
    setReviewDraft(firstReview(active?.sourceIds[0]||''));
    setSourceDraft(firstSource());setMessage('Local verification review reset.');
  }
  const inspected=claims.filter((c)=>bundle.reviews[c.key]?.status==='document-inspected').length;
  const needs=claims.filter((c)=>bundle.reviews[c.key]?.status==='needs-corroboration'||bundle.reviews[c.key]?.status==='disputed').length;
  const open= bundle.counterevidence.filter((c)=>c.status==='open').length;
  const currentClaims=claims.filter((c)=>{
    const status=bundle.reviews[c.key]?.status||'not-reviewed';
    return (statusFilter==='all'||statusFilter===status)&&
      (c.title+' '+c.statement+' '+c.sourceIds.join(' ')).toLowerCase().includes(search.toLowerCase());
  });
  const sourceUsage=chosenSource ? usage[chosenSource.id] : undefined;
  return <section className="content-page verify-page">
    <div className="eyebrow">CASE {caseFile.id} / RESEARCHER REVIEW</div>
    <h1 className="trace-page-title">Source Verification Console.</h1>
    <p className="trace-deck">Inspect what a document actually states. Capture evidence *against* a claim as carefully as supporting material. A manual review is not independent authentication, and no page is fetched or certified automatically.</p>
    <div className="verify-metrics">
      <div><strong>{claims.length}</strong><span>CLAIMS TO REVIEW</span></div>
      <div><strong>{inspected}</strong><span>DOCUMENTS INSPECTED (MANUAL)</span></div>
      <div><strong>{needs}</strong><span>FLAGGED FOR MORE WORK</span></div>
      <div><strong>{open}</strong><span>OPEN COUNTEREVIDENCE</span></div>
    </div>
    <div className="verify-toolbar">
      <div className="verify-tabs" role="group" aria-label="Verification tools">
        <button className={tab==='claims'?'active':''} onClick={()=>setTab('claims')}>Claim-by-claim</button>
        <button className={tab==='sources'?'active':''} onClick={()=>setTab('sources')}>Source provenance</button>
        <button className={tab==='counterevidence'?'active':''} onClick={()=>setTab('counterevidence')}>Counterevidence ({open})</button>
      </div>
      <div className="verify-exports">
        <button onClick={()=>exportVerification(bundle)} disabled={locked}>Export JSON</button>
        <button onClick={()=>exportMarkdown(bundle,caseFile)} disabled={locked}>Export research memo</button>
        <label className="verify-import">Import JSON<input type="file" accept=".json,application/json" onChange={(event)=>{void importFile(event.target.files?.[0]);event.target.value='';}} /></label>
      </div>
    </div>
    {warning&&<div className="verify-storage-warning" role="alert"><p>{warning}</p>{locked&&<div><button onClick={rawBackup}>Download stored data for recovery</button><button onClick={resetProtected}>Reset this case’s review</button></div>}</div>}
    {message&&<p className="verify-message" role="status">{message}</p>}
    {tab==='claims'&&<div className="verify-layout">
      <aside className="verify-list">
        <label className="verify-filter-label">SEARCH CLAIMS<input value={search} placeholder="Text or source ID…" onChange={(e)=>setSearch(e.target.value)} /></label>
        <label className="verify-filter-label">RESEARCHER REVIEW STATUS<select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
          <option value="all">All review statuses</option>{REVIEW_STATES.map((s)=><option key={s} value={s}>{LABELS[s]}</option>)}
        </select></label>
        <div className="verify-result-count">{currentClaims.length} results</div>
        {currentClaims.map((c)=><button key={c.key} className={'verify-claim-row'+(c.key===active?.key?' active':'')} onClick={()=>selectClaim(c.key)}>
          <span className="verify-claim-kind">{c.kind.toUpperCase()} · {c.assessment}</span>
          <strong>{c.title}</strong><span className="verify-mini-status">{LABELS[bundle.reviews[c.key]?.status||'not-reviewed']}</span>
        </button>)}
        {currentClaims.length===0&&<div className="empty-state">No claims match these filters.</div>}
      </aside>
      <div className="verify-detail">{active?<><div className="eyebrow">CLAIM {active.key}</div>
        <h2>{active.title}</h2>
        <div className="verify-claim-statement"><span>WHAT THE CASE RECORD STATES</span><p>{active.statement}</p></div>
        <div className="verify-limit"><span>WHAT THIS DOES NOT ESTABLISH</span><p>{active.limitation}</p></div>
        <h3>Source documents</h3>
        <div className="verify-linked-sources">{active.sourceIds.map((id:string)=>{
          const s=caseFile.sources.find((source)=>source.id===id);
          return s?<div key={id}><strong>{s.citation}</strong><span>{safeHost(s.url)} · {s.category}</span><a href={s.url} target="_blank" rel="noopener noreferrer">Open document ↗</a></div>:null;
        })}</div>
        <div className="verify-form-head"><h3>Record a manual inspection</h3><span>Private to this browser</span></div>
        <label className="verify-field">Researcher review status<select value={reviewDraft.status} onChange={(e)=>setReviewDraft((d)=>({...d,status:e.target.value as ReviewStatus}))}>
          {REVIEW_STATES.map((s)=><option key={s} value={s}>{LABELS[s]}</option>)}
        </select></label>
        <label className="verify-field">Document associated with this note<select value={reviewDraft.sourceId} onChange={(e)=>setReviewDraft((d)=>({...d,sourceId:e.target.value}))}>
          {active.sourceIds.map((id:string)=><option key={id} value={id}>{caseFile.sources.find((s)=>s.id===id)?.citation||id}</option>)}
        </select></label>
        <label className="verify-field">Short excerpt or exact page / paragraph reference<textarea rows={3} maxLength={1400} value={reviewDraft.excerpt} onChange={(e)=>setReviewDraft((d)=>({...d,excerpt:e.target.value}))} placeholder="Only quote a brief relevant excerpt, or describe the precise location in the document…" /></label>
        <label className="verify-field">Analysis, unresolved gaps, and alternative readings<textarea rows={4} maxLength={3500} value={reviewDraft.analysis} onChange={(e)=>setReviewDraft((d)=>({...d,analysis:e.target.value}))} placeholder="Does the source directly support this narrow wording? What is missing or contradicted?" /></label>
        <button className="verify-primary" onClick={saveClaimReview} disabled={locked}>Save manual review</button>
        <p className="verify-smallprint">“Document inspected” only records that you reviewed a source. It never upgrades the historical claim to a proven fact.</p>
        <button className="verify-challenge-link" onClick={()=>{setTab('counterevidence');setMessage('');}}>Record potential counterevidence for this claim →</button>
      </>:<div className="empty-state">No claims yet. Create sourced records in Case Studio first.</div>}</div>
    </div>}
    {tab==='sources'&&<div className="verify-layout">
      <aside className="verify-list">
        {caseFile.sources.map((s)=><button key={s.id} className={'verify-claim-row'+(sourceId===s.id?' active':'')} onClick={()=>selectSource(s.id)}>
          <span className="verify-claim-kind">{s.category.toUpperCase()} · {s.date}</span><strong>{s.citation}</strong><span>{safeHost(s.url)}</span>
          <span className="verify-mini-status">{LABELS[bundle.sourceChecks[s.id]?.status||'not-reviewed']}</span></button>)}
        {caseFile.sources.length===0&&<div className="empty-state">Add a source in Case Studio before reviewing provenance.</div>}
      </aside>
      <div className="verify-detail">{chosenSource?<><div className="eyebrow">SOURCE {chosenSource.id}</div>
        <h2>{chosenSource.title}</h2><p className="verify-source-note">{chosenSource.note}</p>
        <div className="verify-source-meta"><span><strong>Host:</strong> {safeHost(chosenSource.url)}</span><span><strong>Citation:</strong> {chosenSource.citation}</span>
          <span><strong>Referenced by:</strong> {sourceUsage?.claims.length||0} claims and {sourceUsage?.hypotheses.length||0} hypotheses</span></div>
        <a className="verify-document-link" href={chosenSource.url} target="_blank" rel="noopener noreferrer">Open the linked source ↗</a>
        <div className="verify-limit"><span>PROVENANCE WARNING</span><p>Document issuer, host website and research interpretation are different things. A mirror may reproduce an original record, but the URL alone cannot authenticate it.</p></div>
        <div className="verify-form-head"><h3>Manual provenance check</h3></div>
        <label className="verify-field">Inspection status<select value={sourceDraft.status} onChange={(e)=>setSourceDraft((d)=>({...d,status:e.target.value as SourceCheckStatus}))}>
          {SOURCE_STATES.map((s)=><option key={s} value={s}>{LABELS[s]}</option>)}
        </select></label>
        <label className="verify-field">Original or independently hosted HTTPS URL (optional)<input type="url" maxLength={2048} value={sourceDraft.originalUrl} onChange={(e)=>setSourceDraft((d)=>({...d,originalUrl:e.target.value}))} placeholder="https://www.justice.gov/…"/></label>
        <label className="verify-field">How you checked it, differences, or reason access failed<textarea rows={5} maxLength={3500} value={sourceDraft.note} onChange={(e)=>setSourceDraft((d)=>({...d,note:e.target.value}))} placeholder="Source origin, mirror differences, publisher, dates and unresolved authentication questions…" /></label>
        <button className="verify-primary" onClick={saveSourceCheck} disabled={locked}>Save provenance note</button>
        <p className="verify-smallprint">This status is entered by you; the Atlas does not automatically check links or inspect the underlying PDF.</p>
      </>:<div className="empty-state">There are no source records in this case yet.</div>}</div>
    </div>}
    {tab==='counterevidence'&&<div className="verify-counter">
      <div className="verify-detail"><div className="eyebrow">DISCONFIRMING EVIDENCE / FIRST CLASS</div><h2>Challenge the interpretation.</h2>
        <p className="verify-source-note">These are researcher-entered challenge records, not automatic proof that a claim is false. Contradiction requires checking the precise wording and source context.</p>
        <label className="verify-field">Claim being challenged<select value={claimKey} onChange={(e)=>selectClaim(e.target.value)}>
          {claims.map((c)=><option key={c.key} value={c.key}>{c.title}</option>)}
        </select></label>
        <label className="verify-field">Challenging source<select value={challengeSource} onChange={(e)=>setChallengeSource(e.target.value)}>
          {caseFile.sources.map((s)=><option key={s.id} value={s.id}>{s.citation} · {s.title}</option>)}
        </select></label>
        <label className="verify-field">What appears to conflict?<textarea rows={3} maxLength={2000} value={observation} onChange={(e)=>setObservation(e.target.value)} placeholder="Cite specific contradictory wording, dated records, or missing delivery confirmation…" /></label>
        <label className="verify-field">Why would this change the interpretation?<textarea rows={3} maxLength={2000} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Explain the scope of the potential contradiction and alternative explanation…" /></label>
        <button className="verify-primary" onClick={addCounterevidence} disabled={locked||!claims.length||!caseFile.sources.length}>Add locally recorded challenge</button>
      </div>
      <div className="verify-counter-list"><h3>Recorded challenges <span>({bundle.counterevidence.length})</span></h3>
        {bundle.counterevidence.map((item)=>{
          const related=claims.find((c)=>c.key===item.claimKey);
          const source=caseFile.sources.find((s)=>s.id===item.sourceId);
          return <article className="verify-counter-card" key={item.id}>
            <span className="verify-claim-kind">{LABELS[item.status]} · {item.recordedAt.slice(0,10)}</span><h4>{related?.title||item.claimKey}</h4>
            <p>{item.observation}</p><p><strong>Why it matters:</strong> {item.whyItMatters}</p>
            {source&&<a href={source.url} target="_blank" rel="noopener noreferrer">{source.citation} ↗</a>}
            {item.status==='addressed'&&<p className="verify-resolution"><strong>Documented follow-up:</strong> {item.resolution}</p>}
            {item.status==='open'&&<label className="verify-field">Resolution / follow-up note (required to mark addressed)
              <textarea rows={2} maxLength={2000} value={resolutionDrafts[item.id]||''} onChange={(e)=>setResolutionDrafts((previous)=>({...previous,[item.id]:e.target.value}))} placeholder="What was checked, what remains unresolved, and why was the challenge addressed?" />
            </label>}
            <div className="verify-counter-actions"><button onClick={()=>setCounterStatus(item.id,item.status==='open'?'addressed':'open')} disabled={locked}>{item.status==='open'?'Mark addressed in notes':'Reopen challenge'}</button>
              <button className="verify-delete" onClick={()=>eraseCounter(item.id)} disabled={locked}>Delete locally</button></div>
          </article>;
        })}
        {!bundle.counterevidence.length&&<div className="empty-state">No counterevidence records yet. The point is to invite disconfirmation, not collect only supporting material.</div>}
      </div>
    </div>}
    <div className="verify-gap-report">
      <div className="eyebrow">STILL NOT ESTABLISHED</div><h2>Open evidentiary gaps</h2>
      <div>{caseFile.traceSteps.map((step)=><article key={step.id}><strong>{step.title}</strong><p>{step.notEstablished}</p></article>)}</div>
      {!caseFile.traceSteps.length&&<p>No claim-trace gaps recorded yet. Add them in Case Studio.</p>}
    </div>
    <div className="verify-editorial"><strong>Evidence above assumption.</strong> Reviewed status, saved excerpts, notes, and counterevidence are investigator annotations only. They are not independent validation or allegations of wrongdoing. All data stays local unless explicitly exported.</div>
    <div className="verify-footer"><span>{nowDate()} · {caseFile.id} · Private review workspace</span>{!locked&&<button onClick={resetProtected}>Clear local review data</button>}</div>
  </section>;
}
