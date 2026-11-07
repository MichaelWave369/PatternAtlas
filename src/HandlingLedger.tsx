import {useEffect,useMemo,useState} from 'react';
import type {CaseFile} from './types';
import {loadOriginals} from './originalDocStorage';
import {
  appendHandling,emptyJournal,validateJournal,HANDLING_ACTIONS,GENESIS,MAX_JOURNAL_SIZE
} from './handlingCore.mjs';
import {
  loadHandling,saveHandling,clearHandling,exportHandling,exportHandlingMemo,
  exportHandlingAnchor,backupStoredHandling
} from './handlingStorage';
import type {HandlingAction,HandlingJournal} from './handlingStorage';

const actionNames:Record<HandlingAction,string>={
  acquired:'Downloaded / acquired',opened:'Opened for inspection',compared:'Compared with another file',
  copied:'Made a copy',transferred:'Transferred custody (reported)',redacted:'Redacted or transformed',
  shared:'Shared a copy',archived:'Archived locally',other:'Other handling action'
};
const nowDate=()=>new Date().toISOString().slice(0,10);
const headPreview=(v:string)=>v===GENESIS?'No events yet':v.slice(0,16)+'…'+v.slice(-10);
type CheckState={ok:boolean;errors:string[];count?:number;head?:string};

export default function HandlingLedger({caseFile}:{caseFile:CaseFile}) {
  const originals=useMemo(()=>loadOriginals(caseFile),[caseFile]);
  const [bundle,setBundle]=useState<HandlingJournal>(()=>emptyJournal(caseFile) as HandlingJournal);
  const [loading,setLoading]=useState(true);
  const [locked,setLocked]=useState(false);
  const [warning,setWarning]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [documentId,setDocumentId]=useState(originals.bundle.documents[0]?.id||'');
  const [action,setAction]=useState<HandlingAction>('opened');
  const [actor,setActor]=useState('Researcher');
  const [eventDate,setEventDate]=useState(nowDate);
  const [note,setNote]=useState('');
  const [anchor,setAnchor]=useState('');
  const [anchorResult,setAnchorResult]=useState('');
  const [check,setCheck]=useState<CheckState|null>(null);
  const documents=originals.bundle.documents;
  const selected=documents.find(d=>d.id===documentId);
  const unavailable=originals.locked||loading||locked||busy;
  const actors=new Set(bundle.entries.map(e=>e.actor)).size;
  const head=bundle.head;
  useEffect(()=>{
    let mounted=true;
    setLoading(true);
    void loadHandling(caseFile,originals.bundle).then(result=>{
      if(!mounted)return;
      setBundle(result.bundle);setLocked(result.locked);
      setWarning(result.warning);setLoading(false);
    }).catch(()=>{if(mounted){setLocked(true);setWarning('Unable to load handling ledger safely.');setLoading(false);}});
    return ()=>{mounted=false;};
  },[caseFile,originals.bundle]);

  async function record(){
    if(unavailable)return;
    if(!selected){setMessage('Save a PDF fingerprint in Original documents before recording a handling event.');return;}
    setBusy(true);setMessage('');
    try{
      const next=await appendHandling(bundle,caseFile,originals.bundle,{
        documentId:documentId,action,actor,eventDate,note
      },globalThis.crypto?.subtle) as HandlingJournal;
      const saved=await saveHandling(caseFile,originals.bundle,next,bundle.head);
      setMessage(saved.message);
      if(saved.ok){setBundle(next);setNote('');setCheck(null);setAnchorResult('');}
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to append this handling event.');}
    finally{setBusy(false);}
  }
  async function inspectJournal(){
    setCheck(null);setBusy(true);
    try{
      const outcome=await validateJournal(bundle,caseFile,originals.bundle,globalThis.crypto?.subtle) as CheckState;
      setCheck(outcome);
      setMessage(outcome.ok?'Current journal links and original-file references are internally consistent.':'Journal validation found an error.');
    }catch(error){setMessage(error instanceof Error?error.message:'Cannot validate journal.');}
    finally{setBusy(false);}
  }
  async function importJournal(file?:File){
    if(!file)return;
    if(unavailable){setMessage('Stored data is protected. Export a recovery copy and reset first.');return;}
    if(file.size>MAX_JOURNAL_SIZE){setMessage('Import refused: journal exceeds 400 KB.');return;}
    setBusy(true);
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const result=await validateJournal(parsed,caseFile,originals.bundle);
      if(!result.ok){setMessage('Import rejected: '+result.errors.slice(0,3).join(' '));return;}
      if(bundle.entries.length&&!window.confirm('Replace this browser’s handling history? Export an independent head anchor and a backup first.'))return;
      const incoming=parsed as HandlingJournal;
      // Replacement imports must be explicit; no imported events are merged into a different chain.
      const stored=window.localStorage.getItem('pattern-atlas.handling.v1.'+caseFile.id);
      const storedHead=stored?(JSON.parse(stored) as HandlingJournal).head:GENESIS;
      if(storedHead!==bundle.head){setMessage('History changed in another tab. Reload and reconcile before importing.');return;}
      window.localStorage.setItem('pattern-atlas.handling.v1.'+caseFile.id,JSON.stringify(incoming));
      setBundle(incoming);setCheck(null);setAnchorResult('');
      setMessage('Imported journal passed internal hash checks. Authenticity and authorship are not verified.');
    }catch(error){setMessage(error instanceof Error?error.message:'Import failed: invalid JSON or browser storage unavailable.');}
    finally{setBusy(false);}
  }
  function verifyAnchor(){
    if(!/^[0-9a-f]{64}$/.test(anchor.trim())){
      setAnchorResult('Enter a complete 64-character lowercase SHA-256 head hash.');return;
    }
    setAnchorResult(anchor.trim()===bundle.head?
      'MATCH: Current ledger head equals this independently retained value. This alone does not authenticate who wrote the log.':
      'MISMATCH: Current ledger head differs from the independent value. Investigate missing, edited, reset or reordered events.');
  }
  function reset(){
    if(!window.confirm('Clear this case’s entire locally saved handling history? Export its JSON and head anchor first. This cannot be undone.'))return;
    if(!clearHandling(caseFile)){setMessage('Unable to clear browser storage.');return;}
    setBundle(emptyJournal(caseFile) as HandlingJournal);setLocked(false);setWarning('');
    setCheck(null);setAnchorResult('');setMessage('Local handling journal reset. Existing PDF fingerprints were not changed.');
  }

  return <section className="content-page handling-page">
    <div className="eyebrow">CASE {caseFile.id} / SELF-REPORTED FILE HANDLING</div>
    <h1 className="trace-page-title">Evidence Handling Ledger.</h1>
    <p className="trace-deck">Record exactly when and how a downloaded document was handled. Each entry references the file’s previously saved SHA-256 fingerprint and the preceding event hash. This is a <strong>self-reported research history</strong>, not an externally certified chain of custody.</p>

    <div className="handling-stats">
      <div><strong>{documents.length}</strong><span>AVAILABLE PDF FINGERPRINTS</span></div>
      <div><strong>{bundle.entries.length}</strong><span>HANDLING EVENTS</span></div>
      <div><strong>{actors}</strong><span>RECORDED RESEARCHER LABELS</span></div>
      <div><strong>{headPreview(head)}</strong><span>CURRENT EVENT-CHAIN HEAD</span></div>
    </div>

    <div className="handling-toolbar">
      <button onClick={()=>exportHandling(bundle)} disabled={unavailable}>Export journal JSON</button>
      <button onClick={()=>exportHandlingMemo(bundle,caseFile)} disabled={unavailable}>Export research memo</button>
      <button onClick={()=>exportHandlingAnchor(bundle)} disabled={unavailable}>Export independent head anchor</button>
      <label>Import history JSON<input type="file" accept="application/json,.json" disabled={unavailable}
        onChange={e=>{void importJournal(e.target.files?.[0]);e.target.value='';}}/></label>
    </div>
    {originals.locked&&<div className="handling-warning" role="alert">Original Documents storage has changed or is invalid: {originals.warning}. Back it up and restore its original fingerprints before editing this ledger.</div>}
    {warning&&<div className="handling-warning" role="alert">
      <strong>Handling history protected:</strong> {warning}
      <div className="handling-actions"><button onClick={()=>setMessage(backupStoredHandling(caseFile)?'Raw recovery journal downloaded.':'No stored record could be recovered.')}>Export raw recovery</button><button onClick={reset}>Reset after backup</button></div>
    </div>}
    {message&&<div role="status" className="handling-message">{message}</div>}

    <div className="handling-layout">
      <div className="handling-form">
        <div className="eyebrow">STEP 01 / APPEND A RESEARCHER OBSERVATION</div>
        <h2>Record a file-handling event</h2>
        {!documents.length&&<p className="handling-warning">No PDFs have been fingerprinted for this case yet. Open <strong>Original documents</strong>, select a local PDF and save its fingerprint first. We do not create fictional acquisitions.</p>}
        <label>Exact fingerprinted file
          <select value={documentId} disabled={unavailable||!documents.length} onChange={e=>setDocumentId(e.target.value)}>
            {documents.map(d=><option key={d.id} value={d.id}>{d.locator} · {d.fileName} · {d.sha256.slice(0,12)}</option>)}
          </select>
        </label>
        {selected&&<div className="handling-file-preview">
          <span>SNAPSHOT OF LINKED FILE</span>
          <strong>{selected.locator} · {selected.bytes.toLocaleString()} bytes</strong>
          <code>{selected.sha256}</code>
          <p>Source: {caseFile.sources.find(s=>s.id===selected.sourceId)?.citation||selected.sourceId}</p>
        </div>}
        <label>Handling action
          <select value={action} disabled={unavailable} onChange={e=>setAction(e.target.value as HandlingAction)}>
            {HANDLING_ACTIONS.map((value:string)=><option key={value} value={value}>{actionNames[value as HandlingAction]}</option>)}
          </select>
        </label>
        <label>Researcher label (pseudonym allowed)
          <input value={actor} disabled={unavailable} maxLength={80} onChange={e=>setActor(e.target.value)} placeholder="Researcher" />
        </label>
        <label>Date the action occurred (self-reported)
          <input type="date" value={eventDate} disabled={unavailable} onChange={e=>setEventDate(e.target.value)}/>
        </label>
        <label>What happened? What remains uncertain?
          <textarea value={note} rows={5} disabled={unavailable} maxLength={3000}
            onChange={e=>setNote(e.target.value)}
            placeholder="Opened the downloaded PDF, visually inspected page 3, and noted that the cited email contains no invoice reference. Original hosting has not been independently authenticated."/>
        </label>
        <button className="handling-primary" onClick={()=>{void record();}} disabled={unavailable||!documents.length}>Append event with SHA-256 link</button>
        <p className="handling-help">Events are append-only in the interface. Entries cannot be individually deleted or edited. Recording time is captured in UTC; the event date is whatever the researcher reports. Resetting or importing a different history is still possible and must be documented outside this app.</p>
      </div>
      <div className="handling-timeline">
        <div className="eyebrow">STEP 02 / AUDIT THE LOCAL HISTORY</div>
        <h2>Event history</h2>
        <div className="handling-check">
          <p>Recalculate every event digest, previous-hash link, sequence number, and referenced PDF fingerprint.</p>
          <button onClick={()=>{void inspectJournal();}} disabled={busy||loading||originals.locked}>Recheck journal integrity</button>
          {check&&<p className={check.ok?'handling-check-pass':'handling-check-fail'}>
            {check.ok?'All saved event links are internally consistent.':check.errors.slice(0,4).join(' · ')}
          </p>}
        </div>
        {bundle.entries.length?bundle.entries.map(e=><article className="handling-event" key={e.id}>
          <div className="handling-event-top"><span>EVENT {String(e.seq).padStart(3,'0')}</span><span>{e.eventDate}</span></div>
          <h3>{actionNames[e.action as HandlingAction]}</h3>
          <div className="handling-event-meta">{e.actor} · Recorded {new Date(e.recordedAt).toLocaleString()}</div>
          <p>{e.note}</p>
          <div className="handling-event-ref"><span>PDF · {e.locator}</span><code>{e.fileSha256}</code></div>
          <div className="handling-event-ref"><span>Previous event hash</span><code>{e.previousHash}</code></div>
          <div className="handling-event-ref"><span>Event SHA-256</span><code>{e.hash}</code></div>
        </article>):
          <div className="empty-state">No handling events recorded. A PDF fingerprint does not automatically mean someone inspected it, and an empty journal makes no custody claim.</div>}
      </div>
    </div>

    <div className="handling-anchor">
      <div>
        <div className="eyebrow">STEP 03 / VERIFY AGAINST AN INDEPENDENT COPY</div>
        <h2>Compare a preserved head hash</h2>
        <p>Export the head anchor, keep it independently, then compare it to the current ledger after future changes. A self-contained checksum cannot rule out someone replacing both the events and their checksum.</p>
        <code>{head}</code>
      </div>
      <div>
        <label>Previously saved head SHA-256
          <input value={anchor} maxLength={64} onChange={e=>setAnchor(e.target.value.trim())}
            placeholder="Paste a prior 64-character SHA-256 value" />
        </label>
        <button onClick={verifyAnchor}>Compare independent anchor</button>
        {anchorResult&&<p role="status">{anchorResult}</p>}
      </div>
    </div>
    <div className="handling-footer"><strong>Limits and privacy.</strong> PDF bytes remain on your own device. This browser stores only a researcher-entered handling history and links to local fingerprint metadata. It does not verify physical custody, identity, timestamps, transfers, source authenticity or historical claims. Do not enter sensitive personal information or private financial identifiers. For stronger accountability, independently preserve exported head anchors or use an external signed timestamp mechanism.
      {!locked&&!originals.locked&&<button onClick={reset}>Clear local handling history for this case</button>}
    </div>
  </section>;
}
