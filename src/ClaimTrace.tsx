import { useState } from 'react';
import type { CaseFile, AtlasTraceStep, AtlasSource } from './types';

const sequence = ['Proposed', 'Requested', 'Invoiced', 'Paid?', 'Delivered?', 'Operated?'];

function LinkedSources({ ids, index }: { ids: string[]; index: Map<string, AtlasSource> }) {
  return <div className="trace-sources">{ids.map((id) => {
    const source = index.get(id);
    return source ? <a href={source.url} key={id} target="_blank" rel="noopener noreferrer" title={source.note}>↗ {source.citation}</a> : null;
  })}</div>;
}

function Step({ step, index }: { step: AtlasTraceStep; index: Map<string, AtlasSource> }) {
  return <article className="trace-card">
    <div className="trace-top">
      <time dateTime={step.date}>{step.date}</time>
      <span className={'trace-state trace-' + step.stage.replace(/[^a-z]+/g, '-')}>{step.stage}</span>
    </div>
    <h3>{step.title}</h3>
    <div className="trace-assessments">
      <section><div className="trace-label supported">WHAT THE DOCUMENT SUPPORTS</div><p>{step.established}</p></section>
      <section><div className="trace-label missing">WHAT IT DOES NOT ESTABLISH</div><p>{step.notEstablished}</p></section>
    </div>
    <LinkedSources ids={step.sourceIds} index={index} />
  </article>;
}

export default function ClaimTrace({ caseFile }: { caseFile: CaseFile }) {
  const [filter, setFilter] = useState('all');
  const years = [...new Set(caseFile.traceSteps.map((step)=>step.date.slice(0,4)))].sort();
  const stages=[{value:'all',label:'All records'}, ...years.map((year)=>({value:year,label:year}))];
  const index = new Map(caseFile.sources.map((source) => [source.id, source]));
  const steps = caseFile.traceSteps
    .filter((item) => filter === 'all' || item.date.startsWith(filter))
    .sort((a, b) => a.date.localeCompare(b.date));
  return <section className="content-page trace-page">
    <div className="eyebrow">CASE {caseFile.id.replace('CASE-', '')} / EVIDENCE SEQUENCE</div>
    <h1 className="trace-page-title">From proposal to proof.</h1>
    <p className="trace-deck">Documents can establish conversations, invoices, and unsuccessful installation attempts without establishing a functioning system. Inspect the transitions without skipping stages.</p>
    {caseFile.id==='CASE-001'&&<div className="claim-ladder" aria-label="Evidence maturity ladder">
      {sequence.map((label, i) => <div key={label} className={'claim-ladder-step' + (i < 3 ? ' supported' : ' unresolved')}><span>{String(i + 1).padStart(2, '0')}</span><strong>{label}</strong>{i < sequence.length - 1 && <b aria-hidden="true">›</b>}</div>)}
    </div>}
    <p className="trace-warning"><strong>Reading the ladder:</strong> {caseFile.id==='CASE-001'?'The first three categories have documentary examples. This record does not independently establish completed payment, delivery, or operation.':'A document, invoice, or proposal does not on its own establish a settled transaction, delivered work product or deployed system.'} A later source could change that finding.</p>
    <div className="trace-filter">
      <div><div className="eyebrow">DOCUMENT-BY-DOCUMENT</div><h2>{steps.length} tracked milestones</h2></div>
      <div className="trace-year-buttons" role="group" aria-label="Filter claim trace by year">
        {stages.map((item) => <button key={item.value} className={filter === item.value ? 'active' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}
      </div>
    </div>
    <div className="trace-list">{steps.map((step) => <Step key={step.id} step={step} index={index} />)}</div>
    {steps.length===0&&<div className="empty-state">No documented claim milestones in this case yet. Add one in Case Studio.</div>}
    <div className="trace-bottom"><strong>Verification reminder:</strong> An invoice, meeting or proposal is not proof of payment, delivery, control or wrongdoing. Every milestone explicitly states its limits. Investigate contrary evidence as well as supporting material.</div>
  </section>;
}
