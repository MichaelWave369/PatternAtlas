import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  canonical,auditCase,createPayload,validatePayload,digestPayload,makePacket,verifyPacket,auditMarkdown
} from '../src/auditCore.mjs';

const read=(path)=>JSON.parse(readFileSync(new URL('../src/data/'+path,import.meta.url),'utf8'));
const c1=read('case-001.json'),c2=read('case-002.json'),allSeeds=read('reconciliationSeeds.json');
const seed=(c)=>allSeeds.find(x=>x.caseId===c.id)||{invoices:[],entries:[]};
const subtle=webcrypto.subtle;

test('both curated cases provide recomputable source-to-claim matrices',()=>{
  for(const c of [c1,c2]){
    const audit=auditCase(c,seed(c));
    assert.equal(audit.counts.sources,c.sources.length);
    assert.equal(audit.counts.gaps,c.traceSteps.length);
    assert.equal(audit.counts.claims,c.traceSteps.length+c.edges.length+c.events.length);
    assert.equal(audit.sources.length,c.sources.length);
    assert.ok(audit.sources.every(s=>s.citation&&s.url&&Array.isArray(s.claims)));
    assert.equal(validatePayload(createPayload(c,seed(c))).ok,true);
  }
});
test('a source supports only its explicitly linked claims and hypotheses',()=>{
  const a=auditCase(c2,seed(c2));
  const senate=a.sources.find(s=>s.id==='source-2026-senate-wire');
  assert.ok(senate.claims.length>0);
  assert.ok(senate.hypotheses.includes('h3'));
  assert.ok(!a.sources.find(s=>s.id==='source-2013-draft').hypotheses.includes('h3'));
  const claimKeys=new Set(a.claims.map(c=>c.key));
  assert.ok(senate.claims.every(k=>claimKeys.has(k)));
});
test('Case 002 has an attributed receipt email but no explicit same-invoice allocation',()=>{
  const c=c2;
  const event=c.events.find(e=>e.id==='t2');
  assert.equal(event.assessment,'reported');
  assert.match(event.description,/does not.*prove|not independently/i);
  const entry=seed(c).entries[0];
  assert.equal(entry.kind,'correspondence');
  assert.equal(entry.invoiceNoObserved,'');
  assert.match(entry.note,/no invoice number/i);
  assert.match(c.traceSteps.find(s=>s.id==='tr2').notEstablished,/specific July 15 algorithm invoice/);
});
test('the audit flags candidate correspondence and secondary accounting leads',()=>{
  const a=auditCase(c1,seed(c1)),b=auditCase(c2,seed(c2));
  assert.ok(a.flags.some(f=>f.id.startsWith('candidate:')&&/independent settlement/.test(f.title)));
  assert.ok(b.flags.some(f=>f.id==='candidate:seed:reported-2014-wire-email'));
  assert.ok(a.flags.some(f=>f.type==='gap'));
  assert.ok(a.flags.some(f=>f.type==='metadata'));
});
test('canonical serialization ignores object key ordering without changing array ordering',()=>{
  assert.equal(canonical({z:[1,2],a:{y:'x',b:1}}),canonical({a:{b:1,y:'x'},z:[1,2]}));
  assert.notEqual(canonical({z:[1,2]}),canonical({z:[2,1]}));
  assert.throws(()=>canonical({x:undefined}),/Unsupported/);
});
test('SHA-256 is deterministic over a curated case and is 64 hex characters',async()=>{
  const p=createPayload(c1,seed(c1));
  const a=await digestPayload(p,subtle);
  const b=await digestPayload(p,subtle);
  assert.equal(a,b);
  assert.match(a,/^[0-9a-f]{64}$/);
});
test('valid self-contained evidence packets round-trip without importing cases',async()=>{
  const p=createPayload(c2,seed(c2));
  const packet=await makePacket(p,subtle);
  const parsed=JSON.parse(JSON.stringify(packet));
  const result=await verifyPacket(parsed,subtle);
  assert.equal(result.ok,true,result.errors.join('; '));
  assert.equal(result.caseId,'CASE-002');
  assert.equal(result.sources,5);
});
test('a modified case source causes checksum failure after export',async()=>{
  const packet=await makePacket(createPayload(c2,seed(c2)),subtle);
  packet.payload.case.sources[0].url+='?changed';
  const result=await verifyPacket(packet,subtle);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(v=>/digest|audit/i.test(v)));
});
test('even a newly calculated digest cannot hide an inconsistent audit matrix',async()=>{
  const packet=await makePacket(createPayload(c1,seed(c1)),subtle);
  packet.payload.audit.sources[0].claims=[];
  packet.sha256=await digestPayload(packet.payload,subtle);
  const result=await verifyPacket(packet,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/Audit inventory/);
});
test('packet with forged or unknown source in transaction seed fails structure checks',()=>{
  const p=createPayload(c2,seed(c2));
  p.seed.entries[0].sourceId='unknown-source';
  assert.match(validatePayload(p).errors.join(' '),/Unknown candidate source/);
  p.seed.entries[0].sourceId='source-2026-senate-wire';
  p.seed.entries[0].url='javascript:alert(1)';
  assert.match(validatePayload(p).errors.join(' '),/Unsafe candidate/);
});
test('malformed packet envelopes fail safely',async()=>{
  for(const value of [null,{},[],{format:'other',sha256:'fake'}, {format:'pattern-atlas-evidence-packet-v1',hashAlgorithm:'SHA-256',sha256:'0'.repeat(64),payload:{}}]){
    const result=await verifyPacket(value,subtle);
    assert.equal(result.ok,false);
  }
});
test('oversized envelopes are rejected',async()=>{
  const packet=await makePacket(createPayload(c1,seed(c1)),subtle);
  packet.padding='x'.repeat(2500000);
  const result=await verifyPacket(packet,subtle);
  assert.match(result.errors.join(' '),/exceeds 2.5 MB/);
});
test('Markdown export retains source citations and explicit limitations',()=>{
  const md=auditMarkdown(createPayload(c2,seed(c2)));
  assert.match(md,/Senate Finance letter/);
  assert.match(md,/EFTA00585292/);
  assert.match(md,/Still|not established|evidentiary limits/i);
  assert.match(md,/digest can detect changed bytes/i);
  assert.match(md,/local notes.*excluded/i);
});
test('local empty case produces empty packet analysis without leaking unrelated sources',()=>{
  const local={id:'LOCAL-test',title:'Temporary case',subtitle:'Local',updated:'2026-11-06',
    description:'A locally created empty research case.',sources:[],nodes:[],edges:[],events:[],traceSteps:[],hypotheses:[]};
  const audit=auditCase(local,{invoices:[],entries:[]});
  assert.equal(audit.counts.sources,0);
  assert.equal(audit.counts.claims,0);
  assert.equal(validatePayload(createPayload(local,{invoices:[],entries:[]})).ok,true);
});
