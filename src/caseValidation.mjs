// Shared runtime guard for imported and edited case files.
// Deliberately independent of React so Node's test runner can exercise it.
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(['person','organization','research','institution','infrastructure','artifact','motif']);
const STATES = new Set(['documented','reported','unverified']);
const CATEGORIES = new Set(['correspondence','proposal','invoice','reference']);
const LIMITS = { sources:400, nodes:300, edges:500, events:500, hypotheses:200, traceSteps:300 };
const MAX_TEXT = 6000;
const MAX_CASE_CHARS = 1_200_000;

export function checkCase(value) {
  const errors = [];
  const fail = (message) => { if (errors.length < 40) errors.push(message); };
  const record = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, max = MAX_TEXT) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const date = (v) => typeof v === 'string' && (v === 'undated' || (DATE.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v));
  const array = (v) => Array.isArray(v) && v.length <= 1000;
  const ids = new Map();

  if (!record(value)) return { ok:false, errors:['Case root must be an object.'] };
  try { if (JSON.stringify(value).length > MAX_CASE_CHARS) fail('Case JSON exceeds the 1.2 MB limit.'); }
  catch { fail('Case cannot be serialized.'); }
  if (!text(value.id,80) || !ID.test(value.id)) fail('Case requires a safe ID.');
  for (const field of ['title','subtitle','description']) if (!text(value[field],field === 'description' ? 4000 : 180)) fail('Invalid case field: ' + field);
  if (!date(value.updated) || value.updated === 'undated') fail('Case updated must be a real ISO date.');

  for (const [collection, limit] of Object.entries(LIMITS)) {
    if (!array(value[collection]) || value[collection].length > limit) {
      fail('Invalid or oversized collection: ' + collection);
      continue;
    }
    const unique = new Set();
    for (const item of value[collection]) {
      if (!record(item) || !text(item.id,80) || !ID.test(item.id) || unique.has(item.id)) {
        fail(collection + ' has a missing, duplicate or invalid item ID.');
        continue;
      }
      unique.add(item.id);
    }
    ids.set(collection,unique);
  }

  const refs = (item,owner, min=1) => {
    if (!Array.isArray(item.sourceIds) || item.sourceIds.length < min || item.sourceIds.length > 30 || item.sourceIds.some((id) => !ids.get('sources')?.has(id))) {
      fail(owner + ' must link to existing source IDs.');
    }
  };
  for (const s of (Array.isArray(value.sources) ? value.sources : [])) {
    if (!record(s)) continue;
    if (!text(s.title,200) || !text(s.citation,120) || !text(s.note,MAX_TEXT)) fail('Invalid source title, citation or note.');
    if (!CATEGORIES.has(s.category) || !date(s.date)) fail('Invalid source category or date.');
    if (typeof s.url !== 'string' || s.url.length > 2048 || !s.url.startsWith('https://')) fail('Only HTTPS source links are allowed.');
    else try {
      const u = new URL(s.url);
      if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) fail('Invalid source URL.');
    } catch { fail('Invalid source URL.'); }
  }
  for (const n of (Array.isArray(value.nodes) ? value.nodes : [])) {
    if (!record(n)) continue;
    if (!text(n.name,150) || !text(n.short,12) || !text(n.description)) fail('Invalid node text.');
    if (!KINDS.has(n.kind)) fail('Invalid node kind.');
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x)>10000 || Math.abs(n.y)>10000) fail('Invalid node coordinates.');
    refs(n,'Node ' + n.id);
  }
  for (const e of (Array.isArray(value.edges) ? value.edges : [])) {
    if (!record(e)) continue;
    if (!ids.get('nodes')?.has(e.from) || !ids.get('nodes')?.has(e.to) || e.from === e.to) fail('Relationship must connect distinct existing nodes.');
    if (!text(e.label,150) || !text(e.summary)) fail('Invalid relationship label or summary.');
    if (!STATES.has(e.assessment)) fail('Invalid relationship assessment.');
    refs(e,'Relationship ' + e.id);
  }
  for (const e of (Array.isArray(value.events) ? value.events : [])) {
    if (!record(e)) continue;
    if (!date(e.date) || !text(e.title,200) || !text(e.description) || !STATES.has(e.assessment)) fail('Invalid event date, text or assessment.');
    refs(e,'Event ' + e.id);
  }
  for (const h of (Array.isArray(value.hypotheses) ? value.hypotheses : [])) {
    if (!record(h)) continue;
    for (const field of ['question','context','forEvidence','againstEvidence','nextCheck']) if (!text(h[field])) fail('Invalid hypothesis field: ' + field);
    refs(h,'Hypothesis ' + h.id);
  }
  for (const step of (Array.isArray(value.traceSteps) ? value.traceSteps : [])) {
    if (!record(step)) continue;
    if (!date(step.date) || step.date === 'undated' || !text(step.stage,100) || !text(step.title,200) || !text(step.established) || !text(step.notEstablished)) fail('Invalid trace step fields.');
    refs(step,'Trace step ' + step.id);
  }
  return { ok:errors.length===0, errors };
}
