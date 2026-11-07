import {useMemo,useState} from 'react';
import type {CaseFile} from './types';
import type {ReconciliationSeed} from './reconciliationStorage';
import seedsRaw from './data/reconciliationSeeds.json';
import {
  seedForCase
} from './reconciliationCore.mjs';
import {
  auditCase,createPayload,makePacket,verifyPacket,auditMarkdown,AUDIT_LIMIT
} from './auditCore.mjs';
import {downloadArtifact} from './reconciliationStorage';

type AuditTab='sources'|'gaps'|'flags'|'packet';
type AuditSource={id:string;citation:string;title:string;date:string;category:string;url:string;
  claims:string[];hypotheses:string[];events:string[];trace:string[]};
type AuditClaim={key:string;title:string;kind:string;assessment:string;statement:string;limitation:string;sourceIds:string[]};
type AuditFlag={id:string;type:string;title:string;detail:string;sourceIds:string[]};
type AuditGap={id:string;title:string;date:string;established:string;notEstablished:string;sourceIds:string[]};
type AuditSummary={counts:{sources:number;claims:number;hypotheses:number;gaps:number;flags:number;invoices:number;candidates:number};
  sources:AuditSource[];claims:AuditClaim[];flags:AuditFlag[];gaps:AuditGap[]};
type CheckResult={ok:boolean;errors:string[];caseId?:string|null;sources?:number};

export default function EvidenceAudit({caseFile}:{caseFile:CaseFile}){
  const seed=useMemo(()=>seedForCase(seedsRaw,caseFile) as ReconciliationSeed,[caseFile]);
  const audit=useMemo(()=>auditCase(caseFile,seed) as AuditSummary,[caseFile,seed]);
  const [tab,setTab]=useState<AuditTab>('sources');
  const [selectedSource,setSelectedSource]=useState(caseFile.sources[0]?.id||'');
  const [search,setSearch]=useState('');
  const [flagType,setFlagType]=useState('all');
  const [feedback,setFeedback]=useState('');
  const [checkResult,setCheckResult]=useState<CheckResult|null>(null);
  const current=audit.sources.find(s=>s.id===selectedSource)||audit.sources[0];
  const claimMap=new Map(audit.claims.map(c=>[c.key,c]));
  const sourceName=(id:string)=>audit.sources.find(s=>s.id===id)?.citation||id;
  const sourceMatches=audit.sources.filter(s=>
    (s.citation+' '+s.title+' '+s.date+' '+s.url).toLowerCase().includes(search.toLowerCase()));
  const flags=audit.flags.filter(f=>(flagType==='all'||f.type===flagType)&&
    (f.title+' '+f.detail+' '+f.sourceIds.join(' ')).toLowerCase().includes(search.toLowerCase()));
  const gaps=audit.gaps.filter(g=>
    (g.title+' '+g.established+' '+g.notEstablished).toLowerCase().includes(search.toLowerCase()));

  async function exportPacket(){
    try{
      if(!globalThis.crypto?.subtle)throw new Error('SHA-256 is not available. This export requires a secure browser context.');
      const payload=createPayload(caseFile,seed);
      const packet=await makePacket(payload,globalThis.crypto.subtle);
      downloadArtifact(JSON.stringify(packet,null,2)+'\n',
        caseFile.id.toLowerCase()+'-audit-packet.json','application/json');
      setFeedback('Evidence packet exported with a SHA-256 integrity digest. The digest is not an authenticity signature.');
    }catch(e){setFeedback(e instanceof Error?e.message:'Could not create evidence packet.');}
  }
  function exportMemo(){
    try{
      downloadArtifact(auditMarkdown(createPayload(caseFile,seed)),
        caseFile.id.toLowerCase()+'-evidence-audit.md','text/markdown');
      setFeedback('Read-only evidence audit memo exported. Private browser notes were not included.');
    }catch(e){setFeedback(e instanceof Error?e.message:'Could not export audit memo.');}
  }
  async function verifyFile(file?:File){
    if(!file)return;
    setCheckResult(null);
    if(file.size>AUDIT_LIMIT){
      setFeedback('Rejected: packet exceeds 2.5 MB.');
      return;
    }
    try{
      if(!globalThis.crypto?.subtle)throw new Error('SHA-256 is unavailable in this browser.');
      const value:unknown=JSON.parse(await file.text());
      const result=await verifyPacket(value,globalThis.crypto.subtle) as CheckResult;
      setCheckResult(result);
      setFeedback(result.ok?'Digest and internal case/claim consistency checks passed. This is NOT proof the source material is authentic.':
        'Packet integrity check found a problem. See the errors below.');
    }catch(e){setFeedback(e instanceof Error?e.message:'Unable to parse evidence packet.');}
  }

  return <section className="content-page audit-page">
    <div className="eyebrow">CASE {caseFile.id} / PROVENANCE AND INTEGRITY</div>
    <h1 className="trace-page-title">Evidence Audit.</h1>
    <p className="trace-deck">Every citation has a place in the chain. Inspect which claims use it, expose open proof gaps, and export a reproducible evidence packet. A valid file digest says the packet was unchanged, not that the original documents or interpretations are true.</p>

    <div className="audit-stats">
      <div><strong>{audit.counts.sources}</strong><span>DOCUMENT SOURCES</span></div>
      <div><strong>{audit.counts.claims}</strong><span>REVIEWABLE CLAIMS</span></div>
      <div><strong>{audit.counts.gaps}</strong><span>RECORDED LIMITS</span></div>
      <div><strong>{audit.counts.flags}</strong><span>REVIEW FLAGS</span></div>
    </div>

    <div className="audit-toolbar">
      <div className="audit-tabs" role="group" aria-label="Evidence audit views">
        <button className={tab==='sources'?'active':''} onClick={()=>{setTab('sources');setSearch('');}}>Source matrix</button>
        <button className={tab==='gaps'?'active':''} onClick={()=>{setTab('gaps');setSearch('');}}>Proof gaps</button>
        <button className={tab==='flags'?'active':''} onClick={()=>{setTab('flags');setSearch('');}}>Review flags</button>
        <button className={tab==='packet'?'active':''} onClick={()=>{setTab('packet');setSearch('');}}>Audit packet</button>
      </div>
      <button className="audit-primary" onClick={()=>{void exportPacket();}}>Export evidence packet</button>
    </div>

    {tab!=='packet'&&<label className="audit-search">
      <span>FIND DOCUMENTS AND QUESTIONS</span>
      <input placeholder="Search citation, record, or open issue…" value={search} onChange={e=>setSearch(e.target.value)}/>
    </label>}

    {feedback&&<div role="status" className="audit-message">{feedback}</div>}

    {tab==='sources'&&<div className="audit-layout">
      <aside className="audit-source-list">
        <div className="eyebrow">SOURCE REGISTRY / {sourceMatches.length} RESULTS</div>
        {sourceMatches.map(s=><button key={s.id} onClick={()=>setSelectedSource(s.id)}
            className={'audit-source-row'+(s.id===current?.id?' active':'')}>
          <span>{s.category.toUpperCase()} · {s.date}</span>
          <strong>{s.citation}</strong><small>{s.title}</small>
          <small>{s.claims.length} claims · {s.hypotheses.length} hypotheses</small>
        </button>)}
        {!sourceMatches.length&&<div className="empty-state">No matching sources. A missing source is a reason to investigate, not evidence of a conclusion.</div>}
      </aside>
      <div className="audit-source-detail">
        {current?<><div className="eyebrow">SOURCE / {current.id}</div>
          <h2>{current.title}</h2>
          <div className="audit-source-meta">
            <div><span>CITATION</span><strong>{current.citation}</strong></div>
            <div><span>DATE IN CASE</span><strong>{current.date}</strong></div>
            <div><span>RECORD TYPE</span><strong>{current.category}</strong></div>
          </div>
          <a className="audit-link" target="_blank" rel="noopener noreferrer" href={current.url}>Inspect linked public document ↗</a>
          <p className="audit-disclaimer">This link is a documentary locator, not independent authentication of a PDF, mirror, publisher, or recorded event. Consult Source Verification to log your inspection.</p>

          <div className="audit-section-heading"><h3>Claims using this source</h3><span>{current.claims.length} references</span></div>
          {current.claims.map(key=>{
            const c=claimMap.get(key);
            return c?<article key={c.key} className="audit-claim-card">
              <div className="audit-record-type">{c.kind.toUpperCase()} · {c.assessment}</div>
              <h4>{c.title}</h4><p>{c.statement}</p>
              <div className="audit-limitation"><strong>Limit:</strong> {c.limitation}</div>
            </article>:null;
          })}
          {!current.claims.length&&<div className="empty-state">No direct claim uses this source. Being in the source registry does not establish a claim.</div>}
          <div className="audit-section-heading"><h3>Hypotheses citing this source</h3><span>{current.hypotheses.length} references</span></div>
          {current.hypotheses.map(id=>{
            const h=caseFile.hypotheses.find(v=>v.id===id);
            return h?<article className="audit-question" key={id}>
              <strong>{h.question}</strong><p><b>Next check:</b> {h.nextCheck}</p>
            </article>:null;
          })}
          {!current.hypotheses.length&&<p className="audit-muted">No explicitly linked hypotheses.</p>}
        </>:<div className="empty-state">No sources exist in this case.</div>}
      </div>
    </div>}

    {tab==='gaps'&&<div className="audit-card-grid">
      {gaps.map(g=><article className="audit-gap-card" key={g.id}>
        <div className="eyebrow">{g.date} · {g.id}</div>
        <h3>{g.title}</h3>
        <div className="audit-established"><strong>Document supports</strong><p>{g.established}</p></div>
        <div className="audit-unproven"><strong>Still not established</strong><p>{g.notEstablished}</p></div>
        <div className="audit-source-tags">{g.sourceIds.map(id=><span key={id}>{sourceName(id)}</span>)}</div>
      </article>)}
      {!gaps.length&&<div className="empty-state">No gap records match the search.</div>}
    </div>}

    {tab==='flags'&&<div className="audit-flags">
      <div className="audit-filter">
        <span>SHOW FLAG TYPE</span>
        <select value={flagType} onChange={e=>setFlagType(e.target.value)}>
          <option value="all">All review flags</option>
          <option value="gap">Explicit evidence limits</option>
          <option value="review">Needs source review</option>
          <option value="metadata">Metadata checks</option>
        </select>
      </div>
      {flags.map(f=><article key={f.id} className="audit-flag-row">
        <span>{f.type.toUpperCase()}</span><div><h3>{f.title}</h3><p>{f.detail}</p>
          <small>{f.sourceIds.map(sourceName).join(' · ')||'Cross-record check'}</small></div>
      </article>)}
      {!flags.length&&<div className="empty-state">No review flags match these filters. Automated flags are not a substitute for source inspection.</div>}
    </div>}

    {tab==='packet'&&<div className="audit-packet-layout">
      <div className="audit-packet-info">
        <div className="eyebrow">REPRODUCIBLE CASE SNAPSHOT</div>
        <h2>Export the evidence, then check it.</h2>
        <p>The exported JSON includes the curated case records, source-to-claim matrix, proof gaps, metadata flags, and published transaction-candidate labels. <strong>Private notebook entries, browser-local case edits from other cases, and inspection history are not included.</strong></p>
        <div className="audit-packet-actions">
          <button className="audit-primary" onClick={()=>{void exportPacket();}}>Export JSON + SHA-256</button>
          <button onClick={exportMemo}>Export Markdown research memo</button>
        </div>
        <div className="audit-disclaimer"><strong>Checksum ≠ certification.</strong> A SHA-256 match detects changes to the enclosed payload after export. Anyone can create a new packet and compute a new digest. Without a trusted signature or independently authenticated source, it does not establish origin, provenance, or truth.</div>
      </div>
      <div className="audit-verify">
        <div className="eyebrow">OFFLINE FILE INTEGRITY CHECK</div>
        <h3>Validate an exported packet</h3>
        <p>Select a previously exported evidence JSON. The browser recalculates its SHA-256 digest and checks whether the source-to-claim audit matches the enclosed case dataset. No file uploads.</p>
        <label className="audit-file-input">Select evidence JSON
          <input type="file" accept="application/json,.json" onChange={e=>{void verifyFile(e.target.files?.[0]);e.target.value='';}}/>
        </label>
        {checkResult&&<div className={'audit-check-result'+(checkResult.ok?' pass':' fail')}>
          <strong>{checkResult.ok?'Packet internally consistent':'Packet check failed'}</strong>
          {checkResult.ok?<p>{checkResult.caseId} · {checkResult.sources} source records · Digest and internal references match. Authenticity remains unverified.</p>:
          <ul>{checkResult.errors.map((x,i)=><li key={i}>{x}</li>)}</ul>}
        </div>}
      </div>
    </div>}
    <div className="audit-bottom"><strong>Evidence Above Assumption.</strong> This is a verification workflow, not a forensic examiner, bank ledger, court judgment, or a measure of anyone's culpability. An email reporting money received still does not identify which invoice was satisfied without a supporting allocation record.</div>
  </section>;
}
