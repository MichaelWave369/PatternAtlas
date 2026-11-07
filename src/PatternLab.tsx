import { useEffect, useRef, useState } from 'react';

type Asset = { name: string; url: string; width: number; height: number; bytes: number };
type Slot = 'a' | 'b';
type Mode = 'side' | 'overlay';
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const maxBytes = 20 * 1024 * 1024;

export default function PatternLab() {
  const [a, setA] = useState<Asset | null>(null);
  const [b, setB] = useState<Asset | null>(null);
  const [mode, setMode] = useState<Mode>('side');
  const [opacity, setOpacity] = useState(50);
  const [noteA, setNoteA] = useState('');
  const [noteB, setNoteB] = useState('');
  const [observation, setObservation] = useState('');
  const [message, setMessage] = useState('');
  const urls = useRef<{ a?: string; b?: string }>({});
  useEffect(() => () => {
    if (urls.current.a) URL.revokeObjectURL(urls.current.a);
    if (urls.current.b) URL.revokeObjectURL(urls.current.b);
  }, []);

  function receive(slot: Slot, file?: File) {
    if (!file) return;
    if (!allowedTypes.has(file.type) || file.size > maxBytes) {
      setMessage('Select a PNG, JPEG, WebP or GIF under 20 MB. Unsupported files stay on your device.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const asset = { name: file.name, url, width: img.naturalWidth, height: img.naturalHeight, bytes: file.size };
      const prior = urls.current[slot];
      urls.current[slot] = url;
      if (slot === 'a') setA(asset);
      else setB(asset);
      if (prior) URL.revokeObjectURL(prior);
      setMessage('');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMessage('That file could not be decoded as an image.');
    };
    img.src = url;
  }
  function clear(slot: Slot) {
    const prior = urls.current[slot];
    if (prior) URL.revokeObjectURL(prior);
    delete urls.current[slot];
    if (slot === 'a') setA(null);
    else setB(null);
  }
  async function copyObservation() {
    const text = [
      'PATTERN ATLAS · VISUAL COMPARISON NOTE',
      'Image A: ' + (a?.name || 'not loaded') + (noteA ? ' | ' + noteA : ''),
      'Image B: ' + (b?.name || 'not loaded') + (noteB ? ' | ' + noteB : ''),
      'Observation: ' + (observation || '(none recorded)'),
      'Status: visual comparison only, not an identity, provenance, or organizational link.',
      'Verification needed: dated source images, maker/catalog reference, independent provenance.'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Comparison note copied. Images are not included.');
    } catch {
      setMessage('Clipboard was unavailable. Select and copy the note manually.');
    }
  }
  function viewer(asset: Asset | null, slot: Slot) {
    return <div className="pattern-slot">
      <div className="pattern-slot-top"><span>REFERENCE {slot.toUpperCase()}</span><button disabled={!asset} onClick={() => clear(slot)} aria-label={'Clear image ' + slot.toUpperCase()}>Clear</button></div>
      <div className="pattern-image-frame">{asset ? <img src={asset.url} alt={'Locally selected pattern ' + slot.toUpperCase() + ': ' + asset.name}/> : <div className="pattern-empty">◇<span>No image selected</span></div>}</div>
      <div className="pattern-file-meta">{asset ? <><strong>{asset.name}</strong><span>{asset.width} × {asset.height} px · {(asset.bytes / 1024 / 1024).toFixed(2)} MB</span></> : <span>Images remain only in this browser tab</span>}</div>
      <label className="pattern-file-pick">Choose local image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { receive(slot, event.target.files?.[0]); event.target.value = ''; }}/></label>
    </div>;
  }
  return <section className="content-page pattern-page">
    <div className="eyebrow">LOCAL TOOL / VISUAL RESEARCH</div>
    <h1 className="trace-page-title">Pattern comparison lab.</h1>
    <p className="trace-deck">Compare two photographs or ornaments without uploading either to a server. A shared curve, spiral or color is a visual resemblance, not proof of the same mold, maker, owner or intent.</p>
    <div className="pattern-controls"><div className="pattern-mode" role="group" aria-label="Comparison mode"><button className={mode === 'side' ? 'active' : ''} onClick={() => setMode('side')}>Side by side</button><button className={mode === 'overlay' ? 'active' : ''} onClick={() => setMode('overlay')}>Overlay</button></div>{mode === 'overlay' && <label className="opacity-control">B opacity: {opacity}%<input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))}/></label>}</div>
    <div className="pattern-local-grid">{viewer(a, 'a')}{viewer(b, 'b')}</div>
    {mode === 'overlay' && <div className="pattern-overlay-panel">
      <div className="pattern-slot-top">OVERLAY PREVIEW <span>Images independently scaled to fit; alignments are illustrative</span></div>
      <div className="pattern-overlay">
        {a && <img src={a.url} alt="Reference A as overlay base" />}
        {b && <img src={b.url} className="pattern-overlaid" style={{ opacity: opacity / 100 }} alt="Reference B with adjustable opacity" />}
        {(!a || !b) && <div className="overlay-help">Load both images for an overlay comparison</div>}
      </div>
    </div>}
    <div className="pattern-notes"><h2>Record the comparison</h2><p>Add dates, collection names, catalog IDs or other provenance in the fields below. Don't infer a historical connection from a shape match alone.</p><div className="pattern-notes-row"><label>Reference A provenance<input value={noteA} onChange={(event) => setNoteA(event.target.value.slice(0,500))} placeholder="Source, date, collection, object ID…"/></label><label>Reference B provenance<input value={noteB} onChange={(event) => setNoteB(event.target.value.slice(0,500))} placeholder="Source, date, collection, object ID…"/></label></div><label>Observed similarities and differences<textarea value={observation} maxLength={2000} onChange={(event) => setObservation(event.target.value)} rows={4} placeholder="Describe loops, proportions, intersections, leaf count, unique defects and disconfirming differences…"/></label><button className="pattern-copy" onClick={copyObservation}>Copy evidence-aware observation</button>{message && <p role="status" className="pattern-message">{message}</p>}</div>
    <div className="pattern-privacy"><strong>Privacy:</strong> Files are loaded with temporary local object URLs and are never posted to Pattern Atlas. This tool does not perform facial recognition or automated identity matching. Notes in this comparison disappear when the tab closes unless you copy them.</div>
  </section>;
}
