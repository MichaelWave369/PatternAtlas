import {useMemo,useState} from 'react';
import type {CaseFile} from './types';
import seedRaw from './data/reconciliationSeeds.json';
import {seedForCase} from './reconciliationCore.mjs';
import {loadOriginals} from './originalDocStorage';
import {loadHandling,downloadFile} from './handlingStorage';
import type {HandlingJournal} from './handlingStorage';
import {
  prepareCapsulePayload,makeCapsule,inspectCapsule,compareCaseToCapsule,
  CAPSULE_LIMIT
} from './capsuleCore.mjs';

type Result={ok:boolean;errors:string[];caseId?:string|null;
 counts?:{sources:number;claims:number;documents:number;pageNotes:number;handlingEvents:number};
 privacy?:{originals:boolean;handling:boolean}|null};
type Comparison={sameCase:boolean;identical:boolean;reason:string};
export default function CaseCapsule({caseFile}:{caseFile:CaseFile}){
  const seed=useMemo(()=>seedForCase(seedRaw,caseFile),[caseFile]);
  const originals=useMemo(()=>loadOriginals(caseFile),[caseFile]);
  const [includeOriginals,setIncludeOriginals]=useState(false);
  const [includeHandling,setIncludeHandling]=useState(false);
  const [handling,setHandling]=useState<HandlingJournal|null>(null);
  const [handlingWarning,setHandlingWarning]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [result,setResult]=useState<Result|null>(null);
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [fileName,setFileName]=useState('');
  const documented=originals.bundle.documents.length;
  const locked=originals.locked;
  const hasFileNotes=originals.bundle.documents.some(d=>d.observations.length);
  const canIncludeHandling=includeOriginals&&!locked&&documented>0;
  const seedInvoices=seed.invoices.length;
  const seedEntries=seed.entries.length;

  async function toggleHandling(checked:boolean){
    if(!checked){setIncludeHandling(false);setHandling(null);setHandlingWarning('');return;}
    if(!canIncludeHandling){setMessage('Include an intact PDF manifest before adding handling history.');return;}
    setBusy(true);setMessage('');
    try{
      const loaded=await loadHandling(caseFile,originals.bundle);
      if(loaded.locked){setIncludeHandling(false);setHandling(null);setHandlingWarning(loaded.warning);return;}
      setHandling(loaded.bundle);setIncludeHandling(true);setHandlingWarning('');
    }catch(err){setHandlingWarning(err instanceof Error?err.message:'Could not validate local handling history.');setIncludeHandling(false);}
    finally{setBusy(false);}
  }
  async function exportCapsule(){
    setBusy(true);setMessage('');
    try{
      if(locked&&includeOriginals)throw Error('Original-document manifest is protected and cannot be included.');
      if(includeHandling&&!handling)throw Error('Handling history is not loaded or validated.');
      if(!globalThis.crypto?.subtle)throw Error('A secure browser context is required for SHA-256.');
      const payload=prepareCapsulePayload(caseFile,seed,originals.bundle,
        includeHandling?handling:null,{originals:includeOriginals,handling:includeHandling});
      const capsule=await makeCapsule(payload,globalThis.crypto.subtle);
      downloadFile(JSON.stringify(capsule,null,2)+'\n',
        caseFile.id.toLowerCase()+'-case-capsule.json','application/json');
      setMessage('Capsule exported locally. The SHA-256 digest confirms internal file integrity, not document authenticity or trusted authorship.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not create capsule.');}
    finally{setBusy(false);}
  }
  async function inspectFile(file?:File){
    if(!file)return;
    setResult(null);setComparison(null);setFileName(file.name);setBusy(true);setMessage('');
    if(file.size>CAPSULE_LIMIT+1000){setMessage('Capsule rejected: file exceeds the permitted size.');setBusy(false);return;}
    try{
      if(!globalThis.crypto?.subtle)throw Error('Secure browser SHA-256 is unavailable.');
      const parsed:unknown=JSON.parse(await file.text());
      const review=await inspectCapsule(parsed,globalThis.crypto.subtle) as Result;
      setResult(review);
      if(review.ok){
        setComparison(compareCaseToCapsule(caseFile,parsed) as Comparison);
        setMessage('Capsule digest and internal references checked. Nothing has been imported or written to browser storage.');
      }else setMessage('Capsule did not pass integrity checks. Nothing was imported.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not parse case capsule.');}
    finally{setBusy(false);}
  }
  return <section className="content-page capsule-page">
    <div className="eyebrow">CASE {caseFile.id} / PORTABLE RESEARCH</div>
    <h1 className="trace-page-title">Case Capsule.</h1>
    <p className="trace-deck">Pack a case’s documented claims, source map, and research limits into one portable, checksum-protected file. Optionally include your local PDF inspection notes and hash-linked handling history. Verify another capsule <strong>without importing or modifying</strong> your workspace.</p>
    <div className="capsule-stats">
      <div><strong>{caseFile.sources.length}</strong><span>CASE SOURCES</span></div>
      <div><strong>{seedInvoices}</strong><span>CURATED INVOICE RECORDS</span></div>
      <div><strong>{seedEntries}</strong><span>CURATED TRANSACTION LEADS</span></div>
      <div><strong>{documented}</strong><span>LOCALLY FINGERPRINTED FILES</span></div>
    </div>
    <div className="capsule-workspace">
      <div className="capsule-builder">
        <div className="eyebrow">STEP 01 / CHOOSE EXACTLY WHAT TO SHARE</div>
        <h2>Build a research capsule</h2>
        <div className="capsule-layer fixed">
          <span className="capsule-check">✓</span>
          <div><strong>Selected case + evidence audit</strong>
            <p>Always included: complete selected case, explicitly linked source-to-claim matrix, open proof gaps, and curated invoice/transaction-candidate metadata. No private research history. Locally authored case content may itself contain private details.</p>
            <small>Always included · Review case text for sensitive details before sharing</small>
          </div>
        </div>
        <label className={'capsule-layer'+(locked?' disabled':'')}>
          <input type="checkbox" checked={includeOriginals} disabled={busy||locked}
            onChange={e=>{
              setIncludeOriginals(e.target.checked);
              if(!e.target.checked){setIncludeHandling(false);setHandling(null);setHandlingWarning('');}
            }}/>
          <div><strong>Include private PDF fingerprint manifest</strong>
            <p>Includes locally saved file names, retrieval URLs, SHA-256 digests, researcher notes, and page-by-page observations. <strong>This can reveal sensitive information.</strong></p>
            <small>{documented} file records · {hasFileNotes?'Includes written page notes':'No page notes recorded'} · Opt-in only</small>
          </div>
        </label>
        <label className={'capsule-layer'+(!canIncludeHandling?' disabled':'')}>
          <input type="checkbox" checked={includeHandling}
            disabled={busy||!canIncludeHandling} onChange={e=>{void toggleHandling(e.target.checked);}}/>
          <div><strong>Include private handling journal</strong>
            <p>Includes researcher labels, self-reported actions, dates, notes, the event hash chain, and links to the exact PDF manifest. Requires the PDF layer.</p>
            <small>{handling?handling.entries.length+' handling events loaded':'Not loaded'} · Opt-in only</small>
          </div>
        </label>
        {locked&&<div className="capsule-warning">Original Document storage is locked: {originals.warning}. The public-only capsule remains exportable. Recover the private manifest in Original documents before including it.</div>}
        {handlingWarning&&<div className="capsule-warning">Handling history cannot be included: {handlingWarning}. Recover its local records in Handling ledger first.</div>}
        <div className="capsule-scope">
          <div className="eyebrow">EXPORT CONTENTS</div>
          <div><span>Research case</span><strong>{caseFile.title}</strong></div>
          <div><span>Selected case and audit</span><strong>Included</strong></div>
          <div><span>Private PDF notes</span><strong>{includeOriginals?'Included by permission':'Excluded'}</strong></div>
          <div><span>Private handling history</span><strong>{includeHandling?'Included by permission':'Excluded'}</strong></div>
          <div><span>Original PDF file bytes</span><strong>Never included</strong></div>
        </div>
        <button className="capsule-primary" disabled={busy} onClick={()=>{void exportCapsule();}}>
          Export selected case capsule + SHA-256
        </button>
        <p className="capsule-help">All computation and downloading happen in your browser. The exported file includes a self-calculated digest, not a cryptographic signature or certified timestamp.</p>
      </div>
      <div className="capsule-checker">
        <div className="eyebrow">STEP 02 / INSPECT AN EXPORTED CAPSULE</div>
        <h2>Verify without importing</h2>
        <p>Select another capsule JSON file. The checker validates its data schema, audit references, optional PDF fingerprints, optional handling-event hashes, and overall SHA-256 digest. It never restores, overwrites or merges data.</p>
        <label className="capsule-file">Select local capsule JSON
          <input type="file" accept="application/json,.json" disabled={busy}
            onChange={e=>{void inspectFile(e.target.files?.[0]);e.target.value='';}}/>
        </label>
        {fileName&&<div className="capsule-filename">Selected: {fileName}</div>}
        {result&&<div className={'capsule-result '+(result.ok?'pass':'fail')}>
          <strong>{result.ok?'Internally consistent capsule':'Capsule validation failed'}</strong>
          {result.ok?<><div className="capsule-result-grid">
            <div><span>CASE</span><strong>{result.caseId||'Unknown'}</strong></div>
            <div><span>SOURCES</span><strong>{result.counts?.sources??0}</strong></div>
            <div><span>CLAIMS</span><strong>{result.counts?.claims??0}</strong></div>
            <div><span>PDF RECORDS</span><strong>{result.counts?.documents??0}</strong></div>
            <div><span>PAGE NOTES</span><strong>{result.counts?.pageNotes??0}</strong></div>
            <div><span>HANDLING EVENTS</span><strong>{result.counts?.handlingEvents??0}</strong></div>
          </div>
          <p>Private PDF metadata: <b>{result.privacy?.originals?'Present':'Absent'}</b>. Handling history: <b>{result.privacy?.handling?'Present':'Absent'}</b>.</p>
          {comparison&&<div className={'capsule-comparison'+(comparison.identical?' match':'')}>{comparison.reason}</div>}
          </>:<ul>{result.errors.slice(0,8).map((error,i)=><li key={i}>{error}</li>)}</ul>}
        </div>}
        <div className="capsule-noimport"><strong>Privacy by design:</strong> Previewing a JSON capsule does not make any change to your selected case, browser-local fingerprints, or handling journal. For full data restoration, use the separate case/workspace import controls only after independent review.</div>
      </div>
    </div>
    {message&&<div className="capsule-message" role="status">{message}</div>}
    <div className="capsule-footer"><strong>Integrity is not authenticity.</strong> Anyone can author a different capsule and calculate a valid new checksum. This tool cannot verify original document provenance, identify who wrote a journal, authenticate bank transactions, infer delivery of technology, or prove wrongdoing. Consider source files and notes potentially sensitive when deciding whether to share them.</div>
  </section>;
}
