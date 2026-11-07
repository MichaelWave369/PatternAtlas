import { useState } from 'react';
import type { Assessment, CaseFile, NodeKind } from './types';
import { checkCase } from './caseValidation.mjs';
import { exportCase, newEntryId } from './localCases';

type EditorKind = 'source' | 'node' | 'edge' | 'event' | 'hypothesis' | 'trace';
const tabs: Array<{ id:EditorKind; label:string }> = [
  {id:'source',label:'Sources'}, {id:'node',label:'Entities'}, {id:'edge',label:'Relationships'},
  {id:'event',label:'Events'}, {id:'hypothesis',label:'Hypotheses'}, {id:'trace',label:'Claim trace'}
];
const nodeKinds: NodeKind[] = ['person','organization','research','institution','infrastructure','artifact','motif'];
const statuses: Assessment[] = ['documented','reported','unverified'];
const categories: Array<CaseFile['sources'][number]['category']> = ['correspondence','proposal','invoice','reference'];
const fresh = () => ({title:'',description:'',citation:'',url:'',note:'',date:'undated',category:'reference',
  name:'',short:'',kind:'organization',sourceId:'',from:'',to:'',label:'',summary:'',assessment:'unverified',
  question:'',context:'',forEvidence:'',againstEvidence:'',nextCheck:'',stage:'proposed',
  established:'',notEstablished:''});
type Fields = ReturnType<typeof fresh>;

export default function CaseStudio({ caseFile, isEditable, onCreate, onFork, onSave, onRemove, onImport }:{
  caseFile:CaseFile;
  isEditable:boolean;
  onCreate:(title:string, description:string)=>boolean;
  onFork:()=>boolean;
  onSave:(file:CaseFile)=>boolean;
  onRemove:()=>void;
  onImport:(file:CaseFile)=>boolean;
}) {
  const [newTitle,setNewTitle] = useState('');
  const [newDescription,setNewDescription] = useState('');
  const [tab,setTab] = useState<EditorKind>('source');
  const [fields,setFields] = useState<Fields>(fresh);
  const [message,setMessage] = useState('');
  const [metadataOpen,setMetadataOpen] = useState(false);
  const [heading,setHeading] = useState(caseFile.title);
  const [description,setDescription] = useState(caseFile.description);
  const [renameMessage,setRenameMessage] = useState('');
  function put<K extends keyof Fields>(key:K, value:Fields[K]) {setFields((old)=>({...old,[key]:value}));}
  const reference = caseFile.sources.find((item)=>item.id === fields.sourceId);
  const items = tab === 'source' ? caseFile.sources : tab === 'node' ? caseFile.nodes : tab === 'edge' ? caseFile.edges : tab === 'event' ? caseFile.events : tab === 'hypothesis' ? caseFile.hypotheses : caseFile.traceSteps;
  function validateAndSave(next:CaseFile) {
    next.updated = new Date().toISOString().slice(0,10);
    const valid = checkCase(next);
    if (!valid.ok) { setMessage('Validation blocked the change: ' + valid.errors.slice(0,2).join(' ')); return false; }
    const ok=onSave(next);
    setMessage(ok ? 'Saved in this browser. Export JSON to make a portable copy.' : 'Browser storage failed. Export your data before closing this tab.');
    if(ok) setFields(fresh());
    return ok;
  }
  function required(...values:string[]) {
    if (values.some((value)=>!value.trim())) {setMessage('Complete all required fields before adding the record.');return false;}
    if (!reference && tab !== 'source') {setMessage('First add or select an existing source document.');return false;}
    return true;
  }
  function add() {
    if(!isEditable) return;
    const now = new Date().toISOString().slice(0,10);
    const next: CaseFile=structuredClone(caseFile);
    const id=newEntryId(tab.slice(0,3));
    if(tab==='source') {
      if (!required(fields.title,fields.citation,fields.note,fields.url)) return;
      if (fields.url.trim().length > 2048 || !fields.url.startsWith('https://')) {setMessage('Source URLs must use HTTPS.');return;}
      next.sources.push({id,title:fields.title.trim(),citation:fields.citation.trim(),url:fields.url.trim(),note:fields.note.trim(),
        date:fields.date.trim() || 'undated',category:fields.category as CaseFile['sources'][number]['category']});
    } else if(tab==='node') {
      if(!required(fields.name,fields.description)) return;
      const count=caseFile.nodes.length;
      const angle=count*2.3999632297;
      const x=Math.round(550+260*Math.cos(angle)), y=Math.round(325+205*Math.sin(angle));
      next.nodes.push({id,name:fields.name.trim(),short:(fields.short.trim()||fields.name.trim().slice(0,3)).slice(0,12),
        description:fields.description.trim(),kind:fields.kind as NodeKind,x,y,sourceIds:[fields.sourceId]});
    } else if(tab==='edge') {
      if(!required(fields.from,fields.to,fields.label,fields.summary)) return;
      if(fields.from===fields.to) {setMessage('A relationship must connect two distinct entities.');return;}
      next.edges.push({id,from:fields.from,to:fields.to,label:fields.label.trim(),summary:fields.summary.trim(),
        assessment:fields.assessment as Assessment,sourceIds:[fields.sourceId]});
    } else if(tab==='event') {
      if(!required(fields.date,fields.title,fields.description)) return;
      next.events.push({id,date:fields.date,title:fields.title.trim(),description:fields.description.trim(),
        assessment:fields.assessment as Assessment,sourceIds:[fields.sourceId]});
    } else if(tab==='hypothesis') {
      if(!required(fields.question,fields.context,fields.forEvidence,fields.againstEvidence,fields.nextCheck)) return;
      next.hypotheses.push({id,question:fields.question.trim(),context:fields.context.trim(),forEvidence:fields.forEvidence.trim(),
        againstEvidence:fields.againstEvidence.trim(),nextCheck:fields.nextCheck.trim(),sourceIds:[fields.sourceId]});
    } else {
      if(!required(fields.date,fields.stage,fields.title,fields.established,fields.notEstablished)) return;
      next.traceSteps.push({id,date:fields.date,title:fields.title.trim(),stage:fields.stage.trim(),
        established:fields.established.trim(),notEstablished:fields.notEstablished.trim(),sourceIds:[fields.sourceId]});
    }
    next.events.sort((a,b)=>a.date.localeCompare(b.date));
    next.traceSteps.sort((a,b)=>a.date.localeCompare(b.date));
    next.updated=now;
    validateAndSave(next);
  }
  function removeItem(id:string) {
    if(!isEditable || !window.confirm('Delete this record from your local case?')) return;
    const next:CaseFile=structuredClone(caseFile);
    if(tab==='source') {
      const used=[...next.nodes,...next.edges,...next.events,...next.hypotheses,...next.traceSteps]
        .some((item)=>item.sourceIds.includes(id));
      if(used) {setMessage('Source is used by other records. Remove or change those records first.');return;}
      next.sources=next.sources.filter((item)=>item.id!==id);
    } else if(tab==='node') {
      next.nodes=next.nodes.filter((item)=>item.id!==id);
      next.edges=next.edges.filter((edge)=>edge.from!==id && edge.to!==id);
    } else if(tab==='edge') next.edges=next.edges.filter((item)=>item.id!==id);
    else if(tab==='event') next.events=next.events.filter((item)=>item.id!==id);
    else if(tab==='hypothesis') next.hypotheses=next.hypotheses.filter((item)=>item.id!==id);
    else next.traceSteps=next.traceSteps.filter((item)=>item.id!==id);
    validateAndSave(next);
  }
  async function importFile(file?:File) {
    if(!file)return;
    if (file.size>1_200_000) {setMessage('Import rejected. Case file exceeds 1.2 MB.');return;}
    try {
      const parsed:unknown=JSON.parse(await file.text());
      const result=checkCase(parsed);
      if(!result.ok) {setMessage('Import rejected: '+result.errors.slice(0,3).join(' '));return;}
      setMessage(onImport(parsed as CaseFile)?'Valid case imported as a local working copy.':'Import could not be saved locally.');
    } catch {setMessage('The selected file is not valid case JSON.');}
  }
  function updateMetadata() {
    if(!isEditable)return;
    const changed={...caseFile,title:heading.trim(),description:description.trim()};
    const valid=checkCase(changed);
    if(!valid.ok){setRenameMessage(valid.errors.slice(0,3).join(' '));return;}
    setRenameMessage(onSave({...changed,updated:new Date().toISOString().slice(0,10)})?'Case details updated.':'Unable to save case.');
  }
  const field=(label:string,key:keyof Fields,props?:{placeholder?:string;multiline?:boolean;type?:string})=>
    <label className="studio-field"><span>{label}</span>{props?.multiline?
      <textarea rows={3} value={fields[key]} maxLength={4000} placeholder={props.placeholder} onChange={(event)=>put(key,event.target.value)}/>:
      <input type={props?.type||'text'} value={fields[key]} maxLength={key==='url'?2048:250} placeholder={props?.placeholder} onChange={(event)=>put(key,event.target.value)}/>}</label>;
  const picker=(label:string,key:keyof Fields,values:Array<{id:string;label:string}>)=>
    <label className="studio-field"><span>{label}</span><select value={fields[key]} onChange={(event)=>put(key,event.target.value)}>
      <option value="">Choose…</option>{values.map((value)=><option key={value.id} value={value.id}>{value.label}</option>)}
    </select></label>;
  return <section className="content-page studio-page">
    <div className="eyebrow">LOCAL-FIRST / RESEARCH WORKSPACE</div>
    <h1 className="trace-page-title">Case studio.</h1>
    <p className="trace-deck">Create or fork an investigation, attach sources, then build entities and narrowly defined relationships. Drafts are private to this browser. Nothing is published to GitHub automatically.</p>
    <div className="studio-action-grid">
      <div className="studio-panel"><div className="eyebrow">CREATE NEW INVESTIGATION</div>
        <label className="studio-field"><span>Case title</span><input maxLength={160} value={newTitle} onChange={(event)=>setNewTitle(event.target.value)} placeholder="A question worth investigating"/></label>
        <label className="studio-field"><span>Short scope and context</span><textarea maxLength={3000} rows={3} value={newDescription} onChange={(event)=>setNewDescription(event.target.value)} placeholder="What is being examined? What is not being assumed?"/></label>
        <button className="studio-primary" disabled={!newTitle.trim()||!newDescription.trim()} onClick={()=>{
          const ok=onCreate(newTitle.trim(),newDescription.trim());
          setMessage(ok?'Created a new local case. Add a source first.':'Unable to save new case.');
          if(ok){setNewTitle('');setNewDescription('');}
        }}>+ Create local case</button>
      </div>
      <div className="studio-panel"><div className="eyebrow">WORK WITH A CASE FILE</div>
        <h2>{caseFile.title}</h2><p>{isEditable?'This is your local working copy.':'This is a published, read-only case. Fork it before changing evidence.'}</p>
        <div className="studio-actions">
          {!isEditable&&<button className="studio-primary" onClick={()=>{const ok=onFork();setMessage(ok?'Curated case forked privately.':'Unable to create a private copy.');}}>Fork into private workspace</button>}
          <button onClick={()=>exportCase(caseFile)}>Export case JSON ↓</button>
          <label className="studio-upload">Import case JSON<input type="file" accept="application/json,.json" onChange={(event)=>{void importFile(event.target.files?.[0]);event.target.value='';}}/></label>
          {isEditable&&<button className="studio-danger" onClick={onRemove}>Delete local case</button>}
        </div>
      </div>
    </div>
    {message&&<p role="status" className="studio-message">{message}</p>}
    {isEditable&&<div className="studio-metadata"><button onClick={()=>setMetadataOpen(!metadataOpen)} aria-expanded={metadataOpen}>Edit case title and scope {metadataOpen?'−':'+'}</button>{metadataOpen&&<div className="studio-metadata-fields"><label>Title<input value={heading} onChange={(event)=>setHeading(event.target.value.slice(0,160))}/></label><label>Description<textarea rows={3} value={description} onChange={(event)=>setDescription(event.target.value.slice(0,4000))}/></label><button onClick={updateMetadata}>Save case details</button>{renameMessage&&<p role="status">{renameMessage}</p>}</div>}</div>}
    <div className="studio-editor-head"><div><div className="eyebrow">STRUCTURED RECORDS / {caseFile.id}</div><h2>Evidence-backed records</h2></div><span>{caseFile.sources.length} sources · {caseFile.nodes.length} entities · {caseFile.edges.length} relationships</span></div>
    <div className="studio-tabs" role="group" aria-label="Case record type">{tabs.map((item)=><button key={item.id} onClick={()=>{setTab(item.id);setFields(fresh());setMessage('');}} className={tab===item.id?'active':''}>{item.label}</button>)}</div>
    {isEditable&&<div className="studio-form">
      <div className="studio-form-head"><strong>Add {tabs.find((item)=>item.id===tab)?.label.toLowerCase().replace(/s$/,'')} record</strong><span>All fields except the short entity label are required</span></div>
      <div className="studio-fields">
        {tab==='source'&&<>{field('Document title','title')}{field('Document ID / citation','citation',{placeholder:'EFTA… or official reference'})}
          {field('Public HTTPS source URL','url',{type:'url'})}{field('Source date (YYYY-MM-DD or undated)','date')}
          <label className="studio-field"><span>Source type</span><select value={fields.category} onChange={(event)=>put('category',event.target.value)}>{categories.map((x)=><option key={x} value={x}>{x}</option>)}</select></label>
          {field('What the record shows, and what it does NOT prove','note',{multiline:true})}</>}
        {tab==='node'&&<>{field('Entity / object name','name')}{field('Short graph label (optional)','short')}
          <label className="studio-field"><span>Entity type</span><select value={fields.kind} onChange={(event)=>put('kind',event.target.value)}>{nodeKinds.map((x)=><option key={x} value={x}>{x}</option>)}</select></label>
          {field('Neutral description','description',{multiline:true})}</>}
        {tab==='edge'&&<>{picker('From entity','from',caseFile.nodes.map((x)=>({id:x.id,label:x.name})))}
          {picker('To entity','to',caseFile.nodes.map((x)=>({id:x.id,label:x.name})))}
          {field('Narrow relationship label','label',{placeholder:'Named on invoice, cited by author…'})}
          {field('Exact scope and limitations of the relationship','summary',{multiline:true})}
          <label className="studio-field"><span>Assessment</span><select value={fields.assessment} onChange={(event)=>put('assessment',event.target.value)}>{statuses.map((x)=><option key={x}>{x}</option>)}</select></label></>}
        {tab==='event'&&<>{field('Date (YYYY-MM-DD or undated)','date')}{field('Event headline','title')}
          {field('What occurred, with limits','description',{multiline:true})}
          <label className="studio-field"><span>Assessment</span><select value={fields.assessment} onChange={(event)=>put('assessment',event.target.value)}>{statuses.map((x)=><option key={x}>{x}</option>)}</select></label></>}
        {tab==='hypothesis'&&<>{field('Testable question','question')}{field('Context','context',{multiline:true})}
          {field('Supporting observation','forEvidence',{multiline:true})}{field('Limitation / alternative explanation','againstEvidence',{multiline:true})}
          {field('Next verification step','nextCheck',{multiline:true})}</>}
        {tab==='trace'&&<>{field('Date (YYYY-MM-DD)','date')}{field('Stage name','stage',{placeholder:'proposed / invoiced / delivered…'})}
          {field('Milestone title','title')}{field('What this document establishes','established',{multiline:true})}
          {field('What it cannot establish','notEstablished',{multiline:true})}</>}
        {tab!=='source'&&picker('Required supporting document','sourceId',caseFile.sources.map((s)=>({id:s.id,label:s.citation+' · '+s.title})))}
      </div>
      <div className="studio-save-row"><button className="studio-primary" onClick={add}>+ Add sourced record</button><span>Changes save to local browser storage only.</span></div>
    </div>}
    <div className="studio-records"><h3>{tabs.find((item)=>item.id===tab)?.label} <span>({items.length})</span></h3>{items.map((item)=>{
      const title='citation'in item?item.citation:'name'in item?item.name:'label'in item?item.label:'question'in item?item.question:'title'in item?item.title:'Untitled record';
      const sourceCount='sourceIds' in item?item.sourceIds.length:0;
      return <article key={item.id} className="studio-record"><div><strong>{title}</strong><small>{item.id}{sourceCount?' · '+sourceCount+' cited source(s)':''}</small></div>
        {isEditable&&<button aria-label={'Remove '+title} onClick={()=>removeItem(item.id)}>Remove</button>}</article>;
    })}
      {items.length===0&&<div className="empty-state">No {tab} records yet. Source documents are the starting point for every claim.</div>}
    </div>
    <div className="studio-caution"><strong>Editorial rule:</strong> The system validates structure and source links, not the truth of every statement. A citation does not turn an inference into a fact. Forked case edits stay private unless you deliberately export and contribute them.</div>
  </section>;
}
