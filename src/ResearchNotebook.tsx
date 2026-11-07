import { useEffect, useState } from 'react';
import type { AtlasSource } from './types';

const KEY = 'pattern-atlas.notes.v1';
type NoteRecord = { text: string; updatedAt: string };
type Notes = Record<string, NoteRecord>;
const MAX_NOTES_BYTES = 256_000;

function cleanNotes(value: unknown, validSourceIds: Set<string>): Notes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Notes = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!validSourceIds.has(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.text !== 'string' || typeof candidate.updatedAt !== 'string') continue;
    result[id] = { text: candidate.text.slice(0, 4000), updatedAt: candidate.updatedAt.slice(0, 60) };
  }
  return result;
}

export default function ResearchNotebook({ sources }: { sources: AtlasSource[] }) {
  const known = new Set(sources.map((source) => source.id));
  const [notes, setNotes] = useState<Notes>(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw || raw.length > MAX_NOTES_BYTES) return {};
      return cleanNotes(JSON.parse(raw), known);
    } catch { return {}; }
  });
  const [selected, setSelected] = useState(sources[0]?.id ?? '');
  const [status, setStatus] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(notes)); }
    catch { setStatus('Browser storage is unavailable or full. Export your notes to keep them.'); }
  }, [notes]);
  const current = notes[selected]?.text ?? '';
  function save(text: string) {
    setNotes((previous) => ({ ...previous, [selected]: { text: text.slice(0, 4000), updatedAt: new Date().toISOString() } }));
    setStatus('Saved locally in this browser.');
  }
  function download() {
    const content = JSON.stringify({ format: 'pattern-atlas-notes-v1', case: 'CASE-001', exportedAt: new Date().toISOString(), notes }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'pattern-atlas-notes.json';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Notes exported as a JSON file on your device.');
  }
  async function importNotes(file?: File) {
    if (!file) return;
    if (file.size > MAX_NOTES_BYTES) { setStatus('File too large. Maximum 256 KB.'); return; }
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.format !== 'pattern-atlas-notes-v1') throw new Error('Unsupported notebook format');
      const incoming = cleanNotes(parsed.notes, known);
      setNotes((previous) => ({ ...previous, ...incoming }));
      setStatus('Imported ' + Object.keys(incoming).length + ' source notes to this browser.');
    } catch { setStatus('Import failed. Only Pattern Atlas notebook JSON is accepted.'); }
  }
  const count = Object.values(notes).filter((note) => note.text.trim()).length;
  return <section className="notebook">
    <div className="notebook-header"><div><div className="eyebrow">PRIVATE RESEARCH WORKSPACE</div><h2>Source notebook <span>{count} saved</span></h2><p>Your annotations stay in browser localStorage. They are not sent to GitHub or published.</p></div><button className="notebook-toggle" onClick={() => setShow(!show)} aria-expanded={show}>{show ? 'Close notebook' : 'Open notebook'}</button></div>
    {show && <div className="notebook-body">
      <label>Source to annotate<select value={selected} onChange={(event) => { setSelected(event.target.value); setStatus(''); }}>{sources.map((source) => <option key={source.id} value={source.id}>{source.citation} · {source.title}</option>)}</select></label>
      <label>Private notes<textarea rows={5} value={current} maxLength={4000} placeholder="Your own observations, contrary evidence, questions and verification tasks…" onChange={(event) => save(event.target.value)}/></label>
      <div className="notebook-tools"><button onClick={download}>Export notes JSON ↓</button><label className="import-button">Import notes JSON<input type="file" accept="application/json,.json" onChange={(event) => { void importNotes(event.target.files?.[0]); event.target.value = ''; }}/></label><button className="notebook-clear" onClick={() => { if (window.confirm('Delete this source note from this browser?')) { setNotes((previous) => { const next = { ...previous }; delete next[selected]; return next; }); setStatus('Note deleted locally.'); } }}>Delete selected note</button></div>
      {status && <p role="status" className="notebook-status">{status}</p>}
      <p className="notebook-caution">Local browser storage can be cleared by your browser. Export important research regularly. Avoid recording unrelated personal information.</p>
    </div>}
  </section>;
}
