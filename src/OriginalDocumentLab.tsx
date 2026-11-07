import {useMemo,useState} from 'react';
import type {CaseFile} from './types';
import targetsRaw from './data/originalDocTargets.json';
import {
  fingerprintPdf,compareFingerprint,createInspection,emptyManifest,validateManifest,
  duplicateFingerprints,ORIGINS,DOC_STATES,MAX_FILE_BYTES
} from './originalDocCore.mjs';
import {
  loadOriginals,saveOriginals,clearOriginals,exportManifest,exportManifestReport,recoverOriginals
} from './originalDocStorage';
import type {OriginalManifest,OriginalDocument,PageObservation} from './originalDocStorage';

type Target={caseId:string;id:string;sourceId:string;locator:string;title:string;url:string;description:string;state:string};
type Pending={sha256:string;bytes:number;fileName:string};
type SourceOrigin='official-repository'|'archive-mirror'|'other';
type DocStatus='fingerprinted'|'pages-reviewed'|'needs-original';
const origins:Record<SourceOrigin,string>={
  'official-repository':'Researcher reports original/official repository',
  'archive-mirror':'Researcher reports archive mirror',
  'other':'Other or not established'
};
const statusNames:Record<DocStatus,string>={
  'fingerprinted':'File fingerprinted only',
  'pages-reviewed':'Pages inspected manually',
  'needs-original':'Needs original or corroboration'
};

export default function OriginalDocumentLab({caseFile}:{caseFile:CaseFile}) {
  const [initial]=useState(()=>loadOriginals(caseFile));
  const [bundle,setBundle]=useState<OriginalManifest>(initial.bundle);
  const [locked,setLocked]=useState(initial.locked);
  const [warning,setWarning]=useState(initial.warning);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const targets=useMemo(()=> (targetsRaw as Target[]).filter(t=>t.caseId===caseFile.id),[caseFile.id]);
  const [targetId,setTargetId]=useState(targets[0]?.id||'');
  const currentTarget=targets.find(t=>t.id===targetId);
  const [sourceId,setSourceId]=useState(currentTarget?.sourceId||caseFile.sources[0]?.id||'');
  const [locator,setLocator]=useState(currentTarget?.locator||'');
  const [downloadUrl,setDownloadUrl]=useState(currentTarget?.url||'');
  const [origin,setOrigin]=useState<SourceOrigin>('other');
  const [researchNote,setResearchNote]=useState('');
  const [pending,setPending]=useState<Pending|null>(null);
  const [selectedId,setSelectedId]=useState(bundle.documents[0]?.id||'');
  const selected=bundle.documents.find(d=>d.id===selectedId);
  const [page,setPage]=useState('1');
  const [pointer,setPointer]=useState('');
  const [observed,setObserved]=useState('');
  const [notEstablished,setNotEstablished]=useState('');
  const [comparison,setComparison]=useState('');
  const duplicates=useMemo(()=>duplicateFingerprints(bundle),[bundle]);
  const selectedDocSource=caseFile.sources.find(s=>s.id===selected?.sourceId);

  function persist(next:OriginalManifest) {
    if(locked){setMessage('Stored records are protected. Export a recovery file and explicitly reset first.');return false;}
    const result=saveOriginals(caseFile,next);
    setMessage(result.message);
    if(result.ok){setBundle(next);return true;}
    return false;
  }
  function chooseTarget(id:string) {
    const t=targets.find(row=>row.id===id);
    if(!t)return;
    setTargetId(t.id);setSourceId(t.sourceId);setLocator(t.locator);
    setDownloadUrl(t.url);setOrigin('other');setResearchNote('');
    setPending(null);setMessage('');
  }
  async function inspectFile(file?:File) {
    if(!file)return;
    setPending(null);
    if(locked){setMessage('Storage is protected; export a recovery file before continuing.');return;}
    setBusy(true);
    try{
      const hash=await fingerprintPdf(file,globalThis.crypto?.subtle) as Pending;
      setPending(hash);
      setMessage('PDF bytes hashed locally. Add an honest source-origin note, then save the metadata.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not hash the PDF.');}
    finally{setBusy(false);}
  }
  function saveFile() {
    if(!pending){setMessage('Select and hash an actual local PDF before saving.');return;}
    if(!researchNote.trim()){setMessage('Describe exactly where you obtained this file, and what you have not verified.');return;}
    const d=createInspection(caseFile,{...pending,sourceId,locator,downloadUrl,origin,researchNote}) as OriginalDocument;
    const next={...bundle,documents:[...bundle.documents,d]};
    if(persist(next)){setSelectedId(d.id);setPending(null);setResearchNote('');}
  }
  async function compareFile(file?:File) {
    if(!file||!selected)return;
    setBusy(true);setComparison('');
    try{
      const hash=await fingerprintPdf(file,globalThis.crypto?.subtle);
      const result=compareFingerprint(selected,hash);
      setComparison(result.sameBytes?
        'IDENTICAL BYTES: The selected file has the same SHA-256 and size as this saved record. This does not prove either file is authentic.':
        'DIFFERENT BYTES: SHA-256 or size differs from the saved copy. Compare versions, redactions, or provenance before drawing conclusions.');
    }catch(error){setComparison(error instanceof Error?error.message:'Could not compare local PDF.');}
    finally{setBusy(false);}
  }
  function addObservation() {
    if(!selected)return;
    const pageNumber=Number(page);
    if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>10000||
      !observed.trim()||!notEstablished.trim()){
      setMessage('Page notes require a valid page number, observation and explicit evidentiary limit.');return;
    }
    const item:PageObservation={
      id:'note:'+crypto.randomUUID(),page:pageNumber,pointer:pointer.trim(),
      observed:observed.trim(),notEstablished:notEstablished.trim(),recordedAt:new Date().toISOString()
    };
    const next={...bundle,documents:bundle.documents.map(d=>d.id===selected.id?
      {...d,observations:[...d.observations,item]}:d)};
    if(persist(next)){setObserved('');setPointer('');setNotEstablished('');}
  }
  function setStatus(status:DocStatus) {
    if(!selected)return;
    persist({...bundle,documents:bundle.documents.map(d=>d.id===selected.id?{...d,status}:d)});
  }
  function deleteObservation(id:string) {
    if(!selected||!window.confirm('Delete this page-specific note from local storage?'))return;
    const update=bundle.documents.map(d=>d.id===selected.id?
      {...d,observations:d.observations.filter(n=>n.id!==id),
        status:d.status==='pages-reviewed'&&d.observations.length===1?'fingerprinted' as DocStatus:d.status}:d);
    persist({...bundle,documents:update});
  }
  function deleteDocument() {
    if(!selected||!window.confirm('Delete this locally saved fingerprint and all its page notes? Export a backup first.'))return;
    const next={...bundle,documents:bundle.documents.filter(d=>d.id!==selected.id)};
    if(persist(next)){setSelectedId(next.documents[0]?.id||'');setComparison('');}
  }
  function reset() {
    if(!window.confirm('Permanently delete all private PDF fingerprints and page notes for this case? Export a backup first.'))return;
    if(!clearOriginals(caseFile)){setMessage('Browser storage could not be cleared.');return;}
    setBundle(emptyManifest(caseFile) as OriginalManifest);setLocked(false);setWarning('');
    setSelectedId('');setPending(null);setComparison('');setMessage('Private document manifest reset.');
  }
  async function importData(file?:File){
    if(!file)return;
    if(locked){setMessage('Old data is protected. Download a recovery file and explicitly reset before importing.');return;}
    if(file.size>440000){setMessage('Import rejected: manifest exceeds 440 KB.');return;}
    try{
      const candidate:unknown=JSON.parse(await file.text());
      const checked=validateManifest(candidate,caseFile);
      if(!checked.ok){setMessage('Import rejected: '+checked.errors.slice(0,3).join(' '));return;}
      if(bundle.documents.length&&!window.confirm('Replace private document fingerprints and notes in this case? Export a backup first.'))return;
      const next=candidate as OriginalManifest;
      if(persist(next)){setSelectedId(next.documents[0]?.id||'');setPending(null);setComparison('');}
    }catch{setMessage('Import rejected: invalid manifest JSON.');}
  }
  return <section className="content-page original-page">
    <div className="eyebrow">CASE {caseFile.id} / ORIGINAL DOCUMENT INSPECTION</div>
    <h1 className="trace-page-title">Original Document Lab.</h1>
    <p className="trace-deck">Find the underlying document, download it yourself, and let your browser fingerprint its exact PDF bytes. Record which page says what and which conclusion it does <strong>not</strong> prove. No file upload, PDF text extraction, or automatic authenticity judgment.</p>

    <div className="od-stats">
      <div><strong>{targets.length}</strong><span>PRIORITY LOCATORS</span></div>
      <div><strong>{bundle.documents.length}</strong><span>LOCAL FILE FINGERPRINTS</span></div>
      <div><strong>{bundle.documents.reduce((n,d)=>n+d.observations.length,0)}</strong><span>MANUAL PAGE NOTES</span></div>
      <div><strong>{duplicates.length}</strong><span>DUPLICATE BYTE HASHES</span></div>
    </div>

    <div className="od-toolbar">
      <div className="od-exports">
        <button onClick={()=>exportManifest(bundle)} disabled={locked}>Export manifest JSON</button>
        <button onClick={()=>exportManifestReport(bundle,caseFile)} disabled={locked}>Export research memo</button>
        <label>Import JSON<input type="file" accept=".json,application/json" onChange={e=>{void importData(e.target.files?.[0]);e.target.value='';}}/></label>
      </div>
      <span className="od-local">ALL FILE BYTES REMAIN ON YOUR DEVICE</span>
    </div>
    {warning&&<div className="od-warning" role="alert">{warning}
      {locked&&<div><button onClick={()=>setMessage(recoverOriginals(caseFile)?'Recovery copy downloaded.':'Could not read existing data.')}>Download raw recovery</button><button onClick={reset}>Reset after backup</button></div>}
    </div>}
    {message&&<p className="od-message" role="status">{message}</p>}

    <div className="od-layout">
      <div className="od-retrieve">
        <div className="eyebrow">STEP 01 / LOCATE ORIGINAL RECORD</div>
        <h2>Priority retrieval targets</h2>
        <div className="od-target-list">{targets.map(t=><button className={t.id===targetId?'active':''} key={t.id} onClick={()=>chooseTarget(t.id)}>
          <span>{t.locator}</span><strong>{t.title}</strong><small>{t.state}</small>
        </button>)}</div>
        {currentTarget&&<div className="od-lead">
          <h3>{currentTarget.locator}</h3><p>{currentTarget.description}</p>
          <a href={currentTarget.url} target="_blank" rel="noopener noreferrer">Open research locator ↗</a>
        </div>}
        <div className="od-divider"/>
        <div className="eyebrow">STEP 02 / HASH DOWNLOADED PDF</div>
        <p className="od-help">Use a file you intentionally downloaded. The browser reads it locally and computes SHA-256. PDF bytes and filename are never sent to a server by this tool.</p>
        <label className="od-field">Related source in this case
          <select value={sourceId} onChange={e=>setSourceId(e.target.value)}>
            {caseFile.sources.map(s=><option key={s.id} value={s.id}>{s.citation}</option>)}
          </select></label>
        <label className="od-field">Document locator / Bates identifier
          <input maxLength={160} value={locator} onChange={e=>setLocator(e.target.value)} placeholder="EFTA01915809" /></label>
        <label className="od-field">HTTPS page or URL where you downloaded the file
          <input type="url" maxLength={2048} value={downloadUrl} onChange={e=>setDownloadUrl(e.target.value)}/></label>
        <label className="od-field">Origin you personally observed
          <select value={origin} onChange={e=>setOrigin(e.target.value as SourceOrigin)}>
            {ORIGINS.map((o:string)=><option key={o} value={o}>{origins[o as SourceOrigin]}</option>)}
          </select></label>
        <label className="od-field">Source provenance note (required)
          <textarea rows={4} maxLength={2500} value={researchNote} onChange={e=>setResearchNote(e.target.value)}
          placeholder="Which webpage did you use? Was it a DOJ-hosted PDF or a third-party mirror? What remains unverified?"/></label>
        <label className="od-file">Choose local PDF to calculate SHA-256
          <input type="file" accept=".pdf,application/pdf" disabled={busy||locked}
            onChange={e=>{void inspectFile(e.target.files?.[0]);e.target.value='';}}/></label>
        <p className="od-help">Accepted: PDFs with a %PDF- header, up to {Math.round(MAX_FILE_BYTES/1048576)} MiB. Files are not rendered or executed.</p>
        {pending&&<div className="od-fingerprint">
          <span>LOCAL FILE FINGERPRINT</span><strong>{pending.fileName}</strong>
          <small>{pending.bytes.toLocaleString()} bytes</small>
          <code>{pending.sha256}</code>
          <button className="od-primary" disabled={locked} onClick={saveFile}>Save metadata and research provenance</button>
        </div>}
      </div>
      <div className="od-records">
        <div className="eyebrow">STEP 03 / DOCUMENT EVIDENCE REGISTER</div>
        <h2>Saved file fingerprints</h2>
        <div className="od-record-tabs">{bundle.documents.map(d=><button key={d.id}
            onClick={()=>{setSelectedId(d.id);setComparison('');}}
            className={selectedId===d.id?'active':''}>
          <span>{d.locator}</span><strong>{d.fileName}</strong><small>{d.observations.length} page notes</small>
        </button>)}</div>
        {!bundle.documents.length&&<div className="empty-state">No PDF fingerprints yet. Select a downloaded original or mirror file on the left and save its research provenance. The PDF itself will not be stored.</div>}
        {selected&&<div className="od-selected">
          <div className="od-selected-head"><h3>{selected.locator}</h3><button className="od-delete" onClick={deleteDocument} disabled={locked}>Delete private record</button></div>
          <p>{selected.researchNote}</p>
          <div className="od-meta">
            <div><span>LINKED CASE SOURCE</span><strong>{selectedDocSource?.citation||selected.sourceId}</strong></div>
            <div><span>FILE SIZE</span><strong>{selected.bytes.toLocaleString()} bytes</strong></div>
            <div><span>CAPTURED</span><strong>{selected.capturedAt.slice(0,10)}</strong></div>
            <div><span>USER-REPORTED HOST CLASS</span><strong>{origins[selected.origin]}</strong></div>
          </div>
          <div className="od-digest"><span>SHA-256 · EXACT FILE BYTES</span><code>{selected.sha256}</code></div>
          <a className="od-source-link" href={selected.downloadUrl} target="_blank" rel="noopener noreferrer">Open researcher-entered download URL ↗</a>
          <div className="od-compare">
            <h4>Recheck another local copy</h4>
            <p>Recompute its hash and check byte-for-byte identity against the saved fingerprint. This is not authentication of either copy.</p>
            <label className="od-file">Choose comparison PDF
              <input type="file" accept=".pdf,application/pdf" disabled={busy}
                onChange={e=>{void compareFile(e.target.files?.[0]);e.target.value='';}}/>
            </label>
            {comparison&&<p className="od-comparison" role="status">{comparison}</p>}
          </div>
          <div className="od-divider"/>
          <h4>Manual page inspection</h4>
          <p className="od-help">Use the PDF's visible page numbering. Quote minimally. Record both an observation and the conclusion the page cannot establish.</p>
          <label className="od-field">Review state
            <select value={selected.status} disabled={locked} onChange={e=>setStatus(e.target.value as DocStatus)}>
              {DOC_STATES.map((s:string)=><option key={s} value={s}>{statusNames[s as DocStatus]}</option>)}
            </select></label>
          <div className="od-page-inputs">
            <label className="od-field">PDF page number<input type="number" min={1} max={10000} value={page} onChange={e=>setPage(e.target.value)}/></label>
            <label className="od-field">Section or brief excerpt (optional)<input value={pointer} maxLength={350} onChange={e=>setPointer(e.target.value)}/></label>
          </div>
          <label className="od-field">What did you directly observe?<textarea rows={3} maxLength={2000}
            value={observed} onChange={e=>setObserved(e.target.value)} placeholder="The document contains a dated email reporting receipt, not a bank ledger screenshot…" /></label>
          <label className="od-field">What does that page NOT establish?<textarea rows={3} maxLength={2000}
            value={notEstablished} onChange={e=>setNotEstablished(e.target.value)} placeholder="The excerpt does not identify invoice allocation, payment purpose or accepted software…" /></label>
          <button className="od-primary" disabled={locked} onClick={addObservation}>Add page-specific research note</button>
          <div className="od-notes">
            {selected.observations.map(note=><article key={note.id}>
              <div><strong>PDF page {note.page}</strong><button onClick={()=>deleteObservation(note.id)} disabled={locked}>Remove</button></div>
              {note.pointer&&<small>{note.pointer}</small>}
              <p>{note.observed}</p><p><b>Not established:</b> {note.notEstablished}</p>
            </article>)}
            {!selected.observations.length&&<p className="od-help">No page observations recorded. A byte hash alone is not a document review.</p>}
          </div>
        </div>}
      </div>
    </div>
    {duplicates.length>0&&<div className="od-duplicates">
      <strong>Duplicate bytes across saved records</strong>
      <p>Some saved records have identical SHA-256 hashes. They may be intentional mirror copies, not independent corroboration. Inspect source provenance before counting them separately.</p>
      {duplicates.map(d=><code key={d.sha256}>{d.sha256} · {d.ids.length} saved records</code>)}
    </div>}
    <div className="od-footer"><strong>Content stays private.</strong> PDF bytes are never uploaded, displayed, or saved by Pattern Atlas. The manifest contains filenames, file sizes, hashes, source URLs and your written notes only. Anyone could hash a different file and claim it came from an official website. Independent source authentication and chain-of-custody review remain necessary.
      {!locked&&<button onClick={reset}>Clear this case's local document manifest</button>}
    </div>
  </section>;
}
