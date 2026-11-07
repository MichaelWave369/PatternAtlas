import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import rawCase from './data/case-001.json';
import rawCase2 from './data/case-002.json';
import CaseStudio from './CaseStudio';
import VerificationConsole from './VerificationConsole';
import ResearchQueue from './ResearchQueue';
import { loadLocalCases, saveLocalCases, newCaseId } from './localCases';
import ClaimTrace from './ClaimTrace';
import PatternLab from './PatternLab';
import ResearchNotebook from './ResearchNotebook';
import type { Assessment, AtlasEvent, AtlasSource, CaseFile, NodeKind, Page } from './types';

const publishedCases = [rawCase as unknown as CaseFile, rawCase2 as unknown as CaseFile];
const PAGES: Array<{ id: Page; label: string; glyph: string }> = [
  { id: 'explore', label: 'Connection map', glyph: '◎' },
  { id: 'studio', label: 'Case studio', glyph: '⊞' },
  { id: 'verify', label: 'Source verification', glyph: '✓' },
  { id: 'queue', label: 'Research queue', glyph: '☷' },
  { id: 'trace', label: 'Claim trace', glyph: '↣' },
  { id: 'timeline', label: 'Chronology', glyph: '◷' },
  { id: 'evidence', label: 'Evidence ledger', glyph: '▤' },
  { id: 'patterns', label: 'Pattern lab', glyph: '▧' },
  { id: 'hypotheses', label: 'Hypothesis lab', glyph: '◇' },
  { id: 'method', label: 'Methodology', glyph: '≡' },
];
const FILTERS: Array<{ value: NodeKind | 'all'; label: string }> = [
  { value: 'all', label: 'All entities' },
  { value: 'person', label: 'People' },
  { value: 'organization', label: 'Organizations' },
  { value: 'research', label: 'Research' },
  { value: 'institution', label: 'Institutions' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'motif', label: 'Motifs' },
  { value: 'artifact', label: 'Objects' },
];
type Selection = { type: 'node' | 'edge'; id: string };
const dateLabel = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}) : 'Undated';
function Status({ value }: { value: Assessment }) {
  return <span className={'status status-' + value}><span className="status-dot" />{value}</span>;
}
function Sources({ ids, caseFile, compact = false }: { ids: string[]; caseFile: CaseFile; compact?: boolean }) {
  const sourceIndex = new Map(caseFile.sources.map((source) => [source.id, source]));
  const sources = ids.map((id) => sourceIndex.get(id)).filter((source): source is AtlasSource => Boolean(source));
  return <div className={'source-links' + (compact ? ' source-links-compact' : '')}>
    {sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer noopener" title={source.note}>
      <span className="source-clip">↗</span><span>{source.citation}</span><span className="source-external">open source</span>
    </a>)}
  </div>;
}
function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="section-heading">
    <div className="eyebrow">{eyebrow}</div>
    <h1>{title}</h1>
    <p>{description}</p>
  </div>;
}
function GraphView({ caseFile, visible, selected, onSelect, zoom, onZoom, pan, onPan }: {
  caseFile:CaseFile;
  visible: Set<string>;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  onPan: (pan: { x: number; y: number }) => void;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const nodeIndex = new Map(caseFile.nodes.map((node) => [node.id, node]));
  const vbWidth = 1120 / zoom;
  const vbHeight = 660 / zoom;
  const viewBox = [560 - vbWidth / 2 + pan.x, 330 - vbHeight / 2 + pan.y, vbWidth, vbHeight].join(' ');
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = event.clientX - drag.current.x;
    const deltaY = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    onPan({
      x: pan.x - deltaX * vbWidth / rect.width,
      y: pan.y - deltaY * vbHeight / rect.height,
    });
  }
  function stop() { drag.current = null; }
  return <div className="map-shell">
    <div className="map-topline"><span className="map-live-dot" /> SCHEMATIC EVIDENCE NETWORK <span className="map-topline-right">CASE 001 / 001</span></div>
    <svg className="graph-svg" viewBox={viewBox} role="img" aria-label="Interactive relationship map with source-linked entities" onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      <defs>
        <pattern id="atlas-grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#34505a" opacity=".36" />
        </pattern>
        <radialGradient id="atlas-glow">
          <stop offset="0" stopColor="#1b6367" stopOpacity=".3" />
          <stop offset="1" stopColor="#07131b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="-600" y="-600" width="2600" height="2000" fill="#0a1720" />
      <rect x="-600" y="-600" width="2600" height="2000" fill="url(#atlas-grid)" />
      <ellipse cx="560" cy="320" rx="520" ry="350" fill="url(#atlas-glow)" />
      <rect x="-600" y="-600" width="2600" height="2000" fill="transparent" className="drag-plane" onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
      }} />
      {caseFile.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)).map((edge) => {
        const from = nodeIndex.get(edge.from)!;
        const to = nodeIndex.get(edge.to)!;
        const path = 'M ' + from.x + ' ' + from.y + ' Q ' + ((from.x + to.x) / 2) + ' ' + ((from.y + to.y) / 2 - 24) + ' ' + to.x + ' ' + to.y;
        return <g key={edge.id} className={'graph-edge edge-' + edge.assessment + (selected.type === 'edge' && selected.id === edge.id ? ' is-selected' : '')} role="button" tabIndex={0} aria-label={'Relationship: ' + edge.label} onClick={() => onSelect({ type: 'edge', id: edge.id })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect({ type: 'edge', id: edge.id }); } }}>
          <path d={path} className="edge-visible" />
          <path d={path} className="edge-hit" />
          <title>{from.name + ' → ' + to.name + ': ' + edge.label}</title>
        </g>;
      })}
      {caseFile.nodes.filter((node) => visible.has(node.id)).map((node) => {
        const active = selected.type === 'node' && selected.id === node.id;
        return <g key={node.id} className={'graph-node node-' + node.kind + (active ? ' is-selected' : '')} transform={'translate(' + node.x + ' ' + node.y + ')'} role="button" tabIndex={0} aria-label={'Inspect ' + node.name} onClick={() => onSelect({ type: 'node', id: node.id })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect({ type: 'node', id: node.id }); } }}>
          <circle r="43" className="node-outer" />
          <circle r="34" className="node-core" />
          <text y="6" textAnchor="middle" className="node-short">{node.short}</text>
          <text y="68" textAnchor="middle" className="node-caption">{node.name}</text>
          <title>{node.name + '. ' + node.description}</title>
        </g>;
      })}
    </svg>
    <div className="map-controls">
      <button aria-label="Zoom out" onClick={() => onZoom(Math.max(.7, +(zoom - .2).toFixed(1)))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button aria-label="Zoom in" onClick={() => onZoom(Math.min(2, +(zoom + .2).toFixed(1)))}>+</button>
      <button className="reset-button" onClick={() => { onZoom(1); onPan({ x: 0, y: 0 }); }}>Reset</button>
    </div>
    <div className="map-footer"><span className="legend-item"><span className="legend-line legend-confirmed" />Documented</span><span className="legend-item"><span className="legend-line legend-reported" />Reported</span><span className="legend-item"><span className="legend-line legend-unverified" />Unverified</span><span className="map-disclaimer">Positions do not imply geography or influence</span></div>
  </div>;
}
function Inspector({ caseFile, selected }: { caseFile:CaseFile; selected: Selection }) {
  const nodeIndex = new Map(caseFile.nodes.map((node) => [node.id, node]));
  const node = selected.type === 'node' ? nodeIndex.get(selected.id) : undefined;
  const edge = selected.type === 'edge' ? caseFile.edges.find((candidate) => candidate.id === selected.id) : undefined;
  if (node) {
    const relationships = caseFile.edges.filter((candidate) => candidate.from === node.id || candidate.to === node.id);
    return <aside className="inspector">
      <div className="panel-label">ENTITY INSPECTOR <span>↗ 0{caseFile.nodes.findIndex((item) => item.id === node.id) + 1}</span></div>
      <div className={'inspector-icon kind-' + node.kind}>{node.short}</div>
      <div className="small-overline">{node.kind}</div>
      <h2>{node.name}</h2>
      <p className="inspector-copy">{node.description}</p>
      <div className="divider" />
      <div className="small-overline">Connected relationships <span className="count">{relationships.length}</span></div>
      <div className="relationship-list">
        {relationships.map((item) => <div key={item.id} className="relationship-item">
          <div className="relationship-name">{nodeIndex.get(item.from === node.id ? item.to : item.from)?.name}</div>
          <span>{item.label}</span>
          <Status value={item.assessment} />
        </div>)}
      </div>
      <div className="divider" />
      <div className="small-overline">Supporting sources</div>
      <Sources ids={node.sourceIds} caseFile={caseFile} />
      <p className="context-note">A documented relationship does not imply criminal conduct, institutional endorsement, or control.</p>
    </aside>;
  }
  if (edge) return <aside className="inspector">
    <div className="panel-label">RELATIONSHIP INSPECTOR</div>
    <div className="small-overline">Linked entities</div>
    <h2>{nodeIndex.get(edge.from)?.name} <span className="muted-arrow">→</span> {nodeIndex.get(edge.to)?.name}</h2>
    <div className="relationship-badge">{edge.label}</div>
    <Status value={edge.assessment} />
    <p className="inspector-copy">{edge.summary}</p>
    <div className="divider" />
    <div className="small-overline">Source records</div>
    <Sources ids={edge.sourceIds} caseFile={caseFile} />
    <p className="context-note">Assessment describes the specific labeled relationship only, not other possible conclusions.</p>
  </aside>;
  return <aside className="inspector"><h2>Select an entity</h2><p>Click a node or a connection to inspect sources.</p></aside>;
}
function Timeline({ caseFile, search }: { caseFile:CaseFile; search: string }) {
  const events = caseFile.events.filter((item) => (item.title + item.description + item.date).toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.date.localeCompare(b.date));
  return <section className="content-page">
    <SectionTitle eyebrow={"CHRONOLOGY / "+caseFile.id} title="Following the sequence." description="Primary documents, proposal dates, and infrastructure correspondence in chronological context. Approximate dates are labeled." />
    <div className="timeline-list">
      {events.map((event: AtlasEvent, i) => <article className="timeline-event" key={event.id}>
        <div className="timeline-rail"><span className="timeline-number">{String(i + 1).padStart(2, '0')}</span></div>
        <div className="timeline-body">
          <div className="timeline-date">{dateLabel(event.date)} <Status value={event.assessment} /></div>
          <h3>{event.title}</h3><p>{event.description}</p><Sources ids={event.sourceIds} caseFile={caseFile} compact />
        </div>
      </article>)}
      {events.length === 0 && <div className="empty-state">No timeline entries match your search.</div>}
    </div>
  </section>;
}
function Evidence({ caseFile, search }: { caseFile:CaseFile; search: string }) {
  const [category, setCategory] = useState('all');
  const filtered = caseFile.sources.filter((source) =>
    (category === 'all' || source.category === category) &&
    (source.title + source.note + source.citation).toLowerCase().includes(search.toLowerCase()));
  return <section className="content-page">
    <SectionTitle eyebrow={"SOURCE REGISTRY / "+caseFile.id} title="Every claim needs a trail."  description="Linked documents, clearly labeled limitations, and a private source notebook. Inclusion is not certification that every interpretation has been independently audited." />
    <div className="filters-row" role="group" aria-label="Filter by document type">{['all', 'correspondence', 'proposal', 'invoice', 'reference'].map((item) => <button key={item} className={'filter-pill' + (category === item ? ' active' : '')} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="evidence-grid">{filtered.map((source) => <article className="evidence-card" key={source.id}>
      <div className="evidence-top"><span className="evidence-type">{source.category}</span><span className="evidence-date">{dateLabel(source.date)}</span></div>
      <div className="evidence-citation">{source.citation}</div>
      <h3>{source.title}</h3><p>{source.note}</p>
      <a className="evidence-action" href={source.url} target="_blank" rel="noopener noreferrer">Inspect source ↗</a>
    </article>)}</div>
    {filtered.length === 0 && <div className="empty-state">No source records match your search.</div>}
    <ResearchNotebook key={caseFile.id} caseId={caseFile.id} sources={caseFile.sources} />
  </section>;
}
function Hypotheses({ caseFile, search }: { caseFile:CaseFile; search: string }) {
  const filtered = caseFile.hypotheses.filter((item) => (item.question + item.context + item.nextCheck).toLowerCase().includes(search.toLowerCase()));
  return <section className="content-page">
    <SectionTitle eyebrow={"HYPOTHESIS LAB / "+caseFile.id} title="Questions, not conclusions." description="Promising patterns go here until independently tested. Each hypothesis includes what supports it, what limits it, and what would resolve the uncertainty." />
    <div className="hypothesis-grid">{filtered.map((item, i) => <article key={item.id} className="hypothesis-card">
      <div className="hypothesis-head"><span>HYPOTHESIS {String(i + 1).padStart(2, '0')}</span><span className="open-state">UNRESOLVED</span></div>
      <h3>{item.question}</h3><p>{item.context}</p>
      <div className="hypothesis-contrast"><div><span className="contrast-label positive">SUPPORTING RECORD</span><p>{item.forEvidence}</p></div><div><span className="contrast-label negative">LIMITATION / ALTERNATIVE</span><p>{item.againstEvidence}</p></div></div>
      <div className="next-check"><span>NEXT VERIFICATION STEP</span>{item.nextCheck}</div>
      <Sources ids={item.sourceIds} caseFile={caseFile} compact />
    </article>)}</div>
    {filtered.length === 0 && <div className="empty-state">No hypotheses match your search.</div>}
  </section>;
}
function Method() {
  return <section className="content-page method-page">
    <SectionTitle eyebrow="RESEARCH PROTOCOL" title="No guilt by graph." description="A visual connection is only as trustworthy as the evidence that defines it. Pattern Atlas separates facts, allegations, interpretations, and unanswered questions." />
    <div className="method-grid">
      {[
        ['01', 'Specific relationships', 'Edges describe narrow, testable relationships: an invoice, a proposal, correspondence, or an exact visual comparison. They never imply a broader association.'],
        ['02', 'Primary-source links', 'Attach dated documents, source identifiers and relevant limitations. Source records are starting points for verification, not automatic endorsements.'],
        ['03', 'Uncertainty stays visible', 'Documented means the stated record exists. Reported means an account needs independent corroboration. Unverified means no demonstrated connection.'],
        ['04', 'Challenge every hypothesis', 'Record alternative explanations and disconfirming observations. The strongest hypothesis survives attempts to disprove it.'],
        ['05', 'Privacy and fairness', 'Use public, relevant records. Avoid private identifying details, sensational implications and guilt by association. Correct mistakes visibly.'],
        ['06', 'Reproducible history', 'Case data lives in version-controlled JSON and can be reviewed through pull requests. Maintain dated change notes for substantive corrections.'],
      ].map(([number, title, body]) => <article className="method-card" key={number}><div className="method-number">{number}</div><h3>{title}</h3><p>{body}</p></article>)}
    </div>
    <div className="method-note"><strong>Editorial rule:</strong> An invoice establishes an invoice. It does not establish settlement, delivery, beneficial ownership, or misuse. A decorative resemblance establishes a visual comparison, not a coded affiliation.</div>
  </section>;
}
function App() {
  const initialLocal = useMemo(() => loadLocalCases(), []);
  const [localCases,setLocalCases] = useState<Record<string,CaseFile>>(initialLocal.cases);
  const [storageError,setStorageError] = useState(initialLocal.warning);
  const [activeId,setActiveId] = useState('CASE-001');
  const caseFile = localCases[activeId] ?? publishedCases.find((item) => item.id === activeId) ?? publishedCases[0];
  const isEditable = caseFile.id.startsWith('LOCAL-') && Boolean(localCases[caseFile.id]);
  const [page, setPage] = useState<Page>('explore');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<NodeKind | 'all'>('all');
  const [selected, setSelected] = useState<Selection>({ type: 'node', id: 'southern' });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  function switchCase(id:string) {
    const match=localCases[id]??publishedCases.find((item)=>item.id===id);
    if(!match) return;
    setActiveId(id);
    setSelected({type:'node',id:match.nodes[0]?.id??''});
    setSearch('');
    setKind('all');
    setPan({x:0,y:0});
    setZoom(1);
  }
  function saveCase(next:CaseFile):boolean {
    if(initialLocal.warning){setStorageError('Existing invalid local storage was not overwritten. Back up or clear it manually before editing.');return false;}
    const updated={...localCases,[next.id]:next};
    const result=saveLocalCases(updated);
    if(!result.ok){setStorageError(result.error);return false;}
    setLocalCases(updated);setStorageError('');return true;
  }
  function createCase(title:string,description:string):boolean {
    const id=newCaseId();
    const next:CaseFile={id,title,description,subtitle:'Locally edited research case',updated:new Date().toISOString().slice(0,10),
      sources:[],nodes:[],edges:[],events:[],hypotheses:[],traceSteps:[]};
    if(!saveCase(next))return false;
    setActiveId(id);setSelected({type:'node',id:''});
    return true;
  }
  function forkCase():boolean {
    const next:CaseFile={...structuredClone(caseFile),id:newCaseId(),title:(caseFile.title+' (working copy)').slice(0,160),updated:new Date().toISOString().slice(0,10)};
    if(!saveCase(next))return false;
    setActiveId(next.id);setSelected({type:'node',id:next.nodes[0]?.id??''});
    return true;
  }
  function importCase(file:CaseFile):boolean {
    const next:CaseFile={...structuredClone(file),id:newCaseId(),updated:new Date().toISOString().slice(0,10)};
    if(!saveCase(next))return false;
    setActiveId(next.id);setSelected({type:'node',id:next.nodes[0]?.id??''});return true;
  }
  function deleteCase() {
    if(!isEditable || !window.confirm('Delete this entire local case from this browser? Export first if you want a backup.'))return;
    const updated={...localCases};delete updated[caseFile.id];
    const result=saveLocalCases(updated);
    if(!result.ok){setStorageError(result.error);return;}
    setLocalCases(updated);setStorageError('');setActiveId('CASE-001');setSelected({type:'node',id:publishedCases[0].nodes[0]?.id??''});
  }
  const visible = useMemo(() => new Set(caseFile.nodes.filter((node) =>
    (kind === 'all' || node.kind === kind) &&
    (node.name + node.description + node.kind).toLowerCase().includes(search.toLowerCase())).map((node) => node.id)), [caseFile, search, kind]);
  return <div className="app-frame">
    <aside className={'sidebar' + (menuOpen ? ' menu-open' : '')}>
      <div className="brand"><div className="brand-mark">Φ</div><div><strong>PATTERN<span>ATLAS</span></strong><small>RESEARCH INTELLIGENCE</small></div></div>
      <div className="sidebar-heading">WORKSPACE <span>01 / 01</span></div>
      <nav aria-label="Primary navigation" className="nav-list">{PAGES.map((item) => <button key={item.id} className={'nav-link' + (page === item.id ? ' active' : '')} onClick={() => { setPage(item.id); setMenuOpen(false); }}><span className="nav-glyph">{item.glyph}</span>{item.label}{page === item.id && <span className="active-caret">›</span>}</button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-brief"><div className="brief-dot" /> <span>CASE FILE OPEN</span><strong>{caseFile.id} / {caseFile.title}</strong><p>Claims separated from hypotheses. Connections anchored to source records.</p></div>
      <div className="sidebar-bottom"><span className="side-version">ATLAS MK5 · v0.5.0</span><a href="https://github.com/MichaelWave369/PatternAtlas" target="_blank" rel="noreferrer">GitHub ↗</a></div>
    </aside>
    {menuOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMenuOpen(false)} />}
    <div className="main-area">
      <header className="topbar"><button className="menu-toggle" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>☰</button><div className="breadcrumb">FIELD INTELLIGENCE <span>/</span> <strong>{PAGES.find((item) => item.id === page)?.label.toUpperCase()}</strong></div><div className="top-actions"><label className="case-picker-label">CASE <select aria-label="Active investigation" value={caseFile.id} onChange={(event)=>switchCase(event.target.value)}>
        {publishedCases.map((item)=><option key={item.id} value={item.id}>{item.id}: {item.title}</option>)}
        {Object.values(localCases).map((item)=><option key={item.id} value={item.id}>PRIVATE: {item.title}</option>)}
      </select></label><label className="search-box"><span>⌕</span><input aria-label="Search case records" placeholder="Search case records..." ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></label><span className="snapshot-label">SNAPSHOT · {caseFile.updated}</span></div></header>
      {storageError&&<div className="storage-warning" role="alert">{storageError}</div>}
      {page === 'explore' ? <div className="explore-page">
        <div className="explore-intro"><div><div className="eyebrow">CASE STUDY <span className="eyebrow-divider">/</span> {caseFile.id} <span className="eyebrow-divider">/</span> OPEN RESEARCH</div><h1>Follow the evidence<span>.</span></h1><p>{caseFile.description}</p></div><div className="case-tag"><span className="case-tag-circle">◎</span><span>ACTIVE CASE<br/><strong>{caseFile.title}</strong></span></div></div>
        <div className="stat-strip"><div><strong>{caseFile.nodes.length.toString().padStart(2, '0')}</strong><span>ENTITIES & OBJECTS</span></div><div><strong>{caseFile.edges.length.toString().padStart(2, '0')}</strong><span>LABELED RELATIONSHIPS</span></div><div><strong>{caseFile.sources.length.toString().padStart(2, '0')}</strong><span>LINKED SOURCES</span></div><div><strong>{caseFile.hypotheses.length.toString().padStart(2, '0')}</strong><span>OPEN QUESTIONS</span></div></div>
        <div className="graph-head"><div><div className="eyebrow">INTERACTIVE EXPLORER</div><h2>Connection network <span className="graph-head-sub">/ {caseFile.subtitle}</span></h2></div><div className="graph-toolbar"><label htmlFor="entity-type">View by type</label><select id="entity-type" value={kind} onChange={(event) => setKind(event.target.value as NodeKind | 'all')}>{FILTERS.map((filter) => <option value={filter.value} key={filter.value}>{filter.label}</option>)}</select></div></div>
        <div className="workspace-grid"><GraphView caseFile={caseFile} visible={visible} selected={selected} onSelect={setSelected} zoom={zoom} onZoom={setZoom} pan={pan} onPan={setPan}/><Inspector caseFile={caseFile} selected={selected}/></div>
        <div className="editorial-foot"><span className="editorial-rule">EDITORIAL SAFEGUARD</span><p>These links describe records and narrowly scoped relationships, not wrongdoing or shared motives. {caseFile.id==='CASE-001'?'The architectural comparison remains disconnected from the scientific funding network.':'Only source-supported links are displayed; invoice documents never prove payment or delivery on their own.'}</p></div>
      </div> : page === 'studio' ? <CaseStudio key={caseFile.id} caseFile={caseFile} isEditable={isEditable}
        onCreate={createCase} onFork={forkCase} onSave={saveCase} onRemove={deleteCase} onImport={importCase} /> : page === 'verify' ? <VerificationConsole key={caseFile.id} caseFile={caseFile} /> : page === 'queue' ? <ResearchQueue key={caseFile.id} caseFile={caseFile} /> : page === 'trace' ? <ClaimTrace caseFile={caseFile} /> : page === 'timeline' ? <Timeline caseFile={caseFile} search={search} /> : page === 'evidence' ? <Evidence caseFile={caseFile} search={search} /> : page === 'patterns' ? <PatternLab /> : page === 'hypotheses' ? <Hypotheses caseFile={caseFile} search={search} /> : <Method />}
      <footer className="site-footer"><span>© 2026 Φ Pattern Atlas · MIT Open Source</span><span>LEDGER ABOVE EGO · EVIDENCE ABOVE ASSUMPTION</span></footer>
    </div>
  </div>;
}
export default App;
