import {useMemo,useState} from 'react';
import type {CaseFile,AtlasSource} from './types';
import seedsRaw from './data/dossierSeeds.json';
import {createDossier,emptyDossiers,pairFingerprint,validateDossiers} from './dossierCore.mjs';
import {
  readDossiers,writeDossiers,clearDossiers,exportDossiers,exportDossierMemo,backupDossiers
} from './dossierStorage';
import type {DossierRecord,DossierBundle} from './dossierStorage';

type Seed={
  caseId:string;id:string;title:string;sourceA:string;sourceB:string;question:string;
  findingA:string;findingB:string;sharedContext:string;notEstablished:string;alternative:string;nextCheck:string;
};
type Fields=Pick<DossierRecord,'title'|'sourceA'|'sourceB'|'question'|'findingA'|'findingB'|'sharedContext'|'notEstablished'|'alternative'|'nextCheck'>;
const seeds=seedsRaw as Seed[];
const getFields=(d:Seed|DossierRecord):Fields=>({
  title:d.title,sourceA:d.sourceA,sourceB:d.sourceB,question:d.question,
  findingA:d.findingA,findingB:d.findingB,sharedContext:d.sharedContext,
  notEstablished:d.notEstablished,alternative:d.alternative,nextCheck:d.nextCheck
});
const blank=(caseFile:CaseFile):Fields=>({
  title:'',sourceA:caseFile.sources[0]?.id||'',sourceB:caseFile.sources[1]?.id||'',
  question:'',findingA:'',findingB:'',sharedContext:'',notEstablished:'',alternative:'',nextCheck:''
});
function SourcePanel({source,letter}:{source?:AtlasSource;letter:'A'|'B'}) {
  return <article className="dossier-document">
    <div className="dossier-document-label">DOCUMENT {letter}</div>
    {source?<><div className="dossier-document-id">{source.citation}</div>
      <h3>{source.title}</h3><div className="dossier-document-meta">{source.date} · {source.category}</div>
      <p>{source.note}</p>
      <a href={source.url} target="_blank" rel="noopener noreferrer">Inspect public source ↗</a>
    </>:<p>Choose an existing source record to compare.</p>}
  </article>;
}
export default function DossierLab({caseFile}:{caseFile:CaseFile}) {
  const [initial]=useState(()=>readDossiers(caseFile));
  const [bundle,setBundle]=useState<DossierBundle>(initial.bundle);
  const [locked,setLocked]=useState(initial.locked);
  const [warning,setWarning]=useState(initial.warning);
  const [message,setMessage]=useState('');
  const curated=useMemo(()=>seeds.filter((s)=>s.caseId===caseFile.id &&
    caseFile.sources.some((x)=>x.id===s.sourceA)&&caseFile.sources.some((x)=>x.id===s.sourceB)),[caseFile]);
  const [selected,setSelected]=useState<string>(()=>curated[0]?.id||'new');
  const initialSeed=curated[0];
  const [fields,setFields]=useState<Fields>(()=>initialSeed?getFields(initialSeed):blank(caseFile));
  const [editing,setEditing]=useState(false);
  const [search,setSearch]=useState('');
  const all=[...curated.map((d)=>({...d,origin:'curated' as const})),...bundle.dossiers.map((d)=>({...d,origin:'local' as const}))];
  const current=all.find((d)=>d.id===selected);
  const saved=current?.origin==='local';
  const canEdit=editing||saved||selected==='new';
  const sourceA=caseFile.sources.find((s)=>s.id===fields.sourceA);
  const sourceB=caseFile.sources.find((s)=>s.id===fields.sourceB);
  const relevant=all.filter((x)=>(x.title+' '+x.question+' '+x.sourceA+' '+x.sourceB).toLowerCase().includes(search.toLowerCase()));
  const setField=<K extends keyof Fields>(key:K,value:Fields[K])=>setFields((old)=>({...old,[key]:value}));
  function openDossier(d:Seed|DossierRecord) {
    setSelected(d.id);setFields(getFields(d));setEditing(false);setMessage('');
  }
  function newPair() {
    setSelected('new');setFields(blank(caseFile));setEditing(true);setMessage('');
  }
  function persist(next:DossierBundle):boolean {
    if(locked){setMessage('Existing data is protected. Download the raw recovery file and explicitly reset before editing.');return false;}
    const result=writeDossiers(caseFile,next);setMessage(result.message);
    if(result.ok){setBundle(next);return true;}return false;
  }
  function saveCurrent() {
    const settings=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.trim()])) as unknown as Fields;
    const existing=saved?bundle.dossiers.find((x)=>x.id===selected):undefined;
    const newRecord=createDossier(caseFile,{...settings,id:existing?.id}) as DossierRecord;
    if(existing)newRecord.createdAt=existing.createdAt;
    const nextRecords=existing?bundle.dossiers.map((d)=>d.id===existing.id?newRecord:d):[...bundle.dossiers,newRecord];
    const next={...bundle,dossiers:nextRecords};
    const check=validateDossiers(next,caseFile);
    if(!check.ok){setMessage('Cannot save: '+check.errors.slice(0,3).join(' '));return;}
    if(persist(next)){setSelected(newRecord.id);setFields(getFields(newRecord));setEditing(false);}
  }
  function removeCurrent() {
    if(!saved||!window.confirm('Delete this private comparison? Export it first if needed.'))return;
    const next={...bundle,dossiers:bundle.dossiers.filter((d)=>d.id!==selected)};
    if(persist(next)){
      const first=curated[0];setSelected(first?.id||'new');setFields(first?getFields(first):blank(caseFile));setEditing(false);
    }
  }
  function resetData() {
    if(!window.confirm('Delete all locally stored dossier comparisons for this case? Back them up first.'))return;
    if(!clearDossiers(caseFile)){setMessage('Browser storage could not be cleared.');return;}
    const empty=emptyDossiers(caseFile) as DossierBundle;
    setBundle(empty);setLocked(false);setWarning('');setMessage('Local dossier data cleared.');
    setSelected(curated[0]?.id||'new');setFields(curated[0]?getFields(curated[0]):blank(caseFile));setEditing(false);
  }
  async function importFile(file?:File) {
    if(!file)return;
    if(locked){setMessage('Stored data is locked. Back up and reset first.');return;}
    if(file.size>440000){setMessage('Import rejected: file over 440 KB.');return;}
    try{
      const candidate:unknown=JSON.parse(await file.text());
      const checked=validateDossiers(candidate,caseFile);
      if(!checked.ok){setMessage('Import rejected: '+checked.errors.slice(0,3).join(' '));return;}
      if(bundle.dossiers.length&&!window.confirm('Replace the local dossiers for this case? Export them first.'))return;
      const next=candidate as DossierBundle;
      if(persist(next)){
        const first=next.dossiers[0]||curated[0];
        setSelected(first?.id||'new');setFields(first?getFields(first):blank(caseFile));setEditing(false);
      }
    }catch{setMessage('Import rejected: invalid dossier JSON.');}
  }
  const input=(key:keyof Fields,label:string,placeholder:string,rows=3)=>{
    const max=key==='title'?180:key==='question'?2200:4000;
    return <label className="dossier-field"><span>{label}</span>
      {key==='title'?<input value={fields[key]} maxLength={max} placeholder={placeholder} disabled={!canEdit||locked} onChange={(e)=>setField(key,e.target.value)}/>:
      <textarea rows={rows} value={fields[key]} maxLength={max} placeholder={placeholder} disabled={!canEdit||locked} onChange={(e)=>setField(key,e.target.value)}/>}
    </label>;
  };
  return <section className="content-page dossier-page">
    <div className="eyebrow">CASE {caseFile.id} / DOCUMENT PROVENANCE</div>
    <h1 className="trace-page-title">Document Dossiers.</h1>
    <p className="trace-deck">Compare two actual source records without asserting that they belong to the same transaction, implementation or hidden network. Every comparison records supporting details, alternatives, and a concrete next verification step.</p>
    <div className="dossier-bar">
      <div className="dossier-bar-count"><strong>{curated.length}</strong> curated comparison{curated.length===1?'':'s'} · <strong>{bundle.dossiers.length}</strong> private dossiers</div>
      <div className="dossier-actions">
        <button className="dossier-primary" onClick={newPair} disabled={locked||caseFile.sources.length<2}>+ New document pair</button>
        <button onClick={()=>exportDossiers(bundle)} disabled={locked}>Export JSON</button>
        <button onClick={()=>exportDossierMemo(bundle,caseFile)} disabled={locked}>Export research memo</button>
        <label>Import JSON<input type="file" accept=".json,application/json" onChange={(e)=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
      </div>
    </div>
    {warning&&<div className="dossier-warning" role="alert"><strong>Old dossiers protected:</strong> {warning}
      {locked&&<div className="dossier-recovery"><button onClick={()=>setMessage(backupDossiers(caseFile)?'Recovery file downloaded.':'Could not read prior stored data.')}>Download raw recovery</button><button onClick={resetData}>Reset after backup</button></div>}
    </div>}
    {message&&<p className="dossier-message" role="status">{message}</p>}
    <div className="dossier-layout">
      <aside className="dossier-list">
        <label className="dossier-search">FIND A DOSSIER<input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Document ID, question…" /></label>
        <p>CURATED & PRIVATE COMPARISONS</p>
        {relevant.map((d)=><button key={d.id} className={'dossier-list-item'+(selected===d.id?' active':'')} onClick={()=>openDossier(d)}>
          <span>{d.origin==='curated'?'REVIEWED STARTING POINT':'PRIVATE WORKING COPY'}</span>
          <strong>{d.title}</strong><small>{d.id}</small>
        </button>)}
        {relevant.length===0&&<div className="empty-state">No dossiers match your search. Create a pair using two existing source records.</div>}
      </aside>
      <div className="dossier-main">
        <div className="dossier-editor-heading"><div><div className="eyebrow">{saved?'PRIVATE RESEARCH COPY':current?.origin==='curated'?'SOURCE-CONTROLLED STARTING POINT':'UNPUBLISHED NEW PAIR'}</div>
          <h2>{current?.title||'New source comparison'}</h2></div>
          <div className="dossier-editor-tools">
            {current?.origin==='curated'&&<button onClick={()=>{setEditing(true);setMessage('Editing a new private copy. The published comparison remains unchanged.');}}>Fork to private copy</button>}
            {saved&&<button className="dossier-delete" disabled={locked} onClick={removeCurrent}>Delete private copy</button>}
          </div>
        </div>
        {caseFile.sources.length<2?<div className="empty-state">This case has fewer than two sources. Add another documented source in Case Studio before comparing records.</div>:<>
          <div className="dossier-selectors">
            {(['sourceA','sourceB'] as const).map((key,i)=><label key={key}>DOCUMENT {i===0?'A':'B'}
              <select value={fields[key]} disabled={!canEdit||locked} onChange={(e)=>setField(key,e.target.value)}>
                {caseFile.sources.map((s)=><option key={s.id} value={s.id}>{s.citation} · {s.title}</option>)}
              </select></label>)}
          </div>
          <div className="dossier-doc-grid">
            <SourcePanel source={sourceA} letter="A"/>
            <SourcePanel source={sourceB} letter="B"/>
          </div>
          <div className="dossier-form">
            {input('title','Dossier title','Describe the documents being compared')}
            {input('question','Question being tested','What specific claim could these records establish or refute?')}
            <div className="dossier-form-pair">
              {input('findingA','What Document A actually states','Use narrow wording, not a presumed outcome.')}
              {input('findingB','What Document B actually states','Describe only what this document establishes.')}
            </div>
            {input('sharedContext','Shared subject or overlap','What topic, parties, dates or technical scope might overlap?')}
            {input('notEstablished','What is NOT established','Missing transaction link, amendment, payment, acceptance, or deployment.')}
            {input('alternative','Alternative explanations','Could these be distinct projects, drafts, separate machines or unrelated fees?')}
            {input('nextCheck','Next independent verification','What signed, dated or independently corroborated record would actually resolve the question?')}
            {canEdit&&<button className="dossier-primary" disabled={locked} onClick={saveCurrent}>{saved?'Save private dossier':'Save as private dossier'}</button>}
            {!canEdit&&<p className="dossier-curated-note">Curated text is read-only. Fork it into your private workspace to make edits and export a research note.</p>}
          </div>
        </>}
      </div>
    </div>
    <div className="dossier-footnote">
      <strong>Editorial safeguard:</strong> Similar names, matching dollar amounts or related research themes do not automatically establish the same transaction. This module creates no network edges. Source dates and notes are presented as recorded, not independently authenticated by the browser.
      <div>{!locked&&<button onClick={resetData}>Clear all private dossiers for this case</button>}</div>
    </div>
  </section>;
}
