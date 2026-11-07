import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectClaims,createBundle,validateBundle,usageBySource,makeReviewReport,fingerprint} from '../src/verificationCore.mjs';

const load=(name)=>JSON.parse(readFileSync(new URL('../src/data/'+name,import.meta.url),'utf8'));
const case1=load('case-001.json');
const case2=load('case-002.json');
const reviewed=(c,claim,sourceId=claim.sourceIds[0])=>({
  signature:claim.signature,status:'document-inspected',sourceId,excerpt:'Paragraph 5 describes a proposed service.',
  analysis:'Inspected manually; no payment record in this particular document.',recordedAt:'2026-11-06T23:11:21.000Z'
});
test('all existing cases yield sourced, unique reviewable claim keys',()=>{
  for(const c of [case1,case2]){
    const claims=collectClaims(c);
    assert.equal(claims.length,c.traceSteps.length+c.edges.length+c.events.length);
    assert.equal(new Set(claims.map((x)=>x.key)).size,claims.length);
    assert.ok(claims.every((x)=>x.sourceIds.length>0&&x.signature.length===8));
  }
});
test('new review bundles start empty and never imply automatic inspection',()=>{
  for(const c of [case1,case2]){
    const b=createBundle(c);
    assert.equal(validateBundle(b,c).ok,true);
    assert.deepEqual(Object.keys(b.reviews),[]);
    assert.deepEqual(Object.keys(b.sourceChecks),[]);
    assert.deepEqual(b.counterevidence,[]);
  }
});
test('review with actual linked source and analysis is valid',()=>{
  const b=createBundle(case1), c=collectClaims(case1)[0];
  b.reviews[c.key]=reviewed(case1,c);
  assert.equal(validateBundle(b,case1).ok,true);
});
test('source URL or claim text changes invalidate stale review fingerprint',()=>{
  const b=createBundle(case1),c=collectClaims(case1)[0];
  b.reviews[c.key]=reviewed(case1,c);
  const textChanged=structuredClone(case1);
  textChanged.traceSteps[0].established+=' Additional unsupported claim.';
  assert.match(validateBundle(b,textChanged).errors.join(' '),/changed/);
  const sourceChanged=structuredClone(case1);
  sourceChanged.sources.find((s)=>s.id===c.sourceIds[0]).url+='?new=1';
  assert.match(validateBundle(b,sourceChanged).errors.join(' '),/changed/);
});
test('unlinked and deleted claim reviews are rejected',()=>{
  const c=collectClaims(case1)[0], b=createBundle(case1);
  b.reviews[c.key]=reviewed(case1,c,'unrelated');
  assert.equal(validateBundle(b,case1).ok,false);
  delete b.reviews[c.key];
  b.reviews['trace:does-not-exist']=reviewed(case1,c);
  assert.match(validateBundle(b,case1).errors.join(' '),/no longer exists/);
});
test('review statuses never include automatic truth certification',()=>{
  const c=collectClaims(case2)[0],b=createBundle(case2);
  b.reviews[c.key]={...reviewed(case2,c),status:'verified-as-true'};
  assert.match(validateBundle(b,case2).errors.join(' '),/Invalid review status/);
});
test('manual original comparison needs original URL and rationale',()=>{
  const b=createBundle(case2),s=case2.sources[0];
  b.sourceChecks[s.id]={status:'compared-with-original',sourceUrl:s.url,originalUrl:'',note:'',recordedAt:'2026-11-06T23:11:21.000Z'};
  assert.equal(validateBundle(b,case2).ok,false);
  b.sourceChecks[s.id].originalUrl='https://www.justice.gov/';
  b.sourceChecks[s.id].note='I compared the document IDs and checked both versions manually.';
  assert.equal(validateBundle(b,case2).ok,true);
  b.sourceChecks[s.id].originalUrl='javascript:alert(1)';
  assert.equal(validateBundle(b,case2).ok,false);
});
test('a changed source URL invalidates its old inspection status',()=>{
  const b=createBundle(case2),s=case2.sources[0];
  b.sourceChecks[s.id]={status:'opened-by-researcher',sourceUrl:s.url,originalUrl:'',note:'Manually opened source.',recordedAt:'2026-11-06T23:11:21.000Z'};
  const c=structuredClone(case2);c.sources[0].url=s.url+'?revised=yes';
  assert.match(validateBundle(b,c).errors.join(' '),/URL changed/);
});
test('counterevidence requires a current claim, existing source, and explanatory text',()=>{
  const c=collectClaims(case2)[0],b=createBundle(case2);
  b.counterevidence=[{id:'ctr-00000001',claimKey:c.key,signature:c.signature,sourceId:case2.sources[0].id,
    observation:'This record has an unfilled placeholder.',whyItMatters:'The final entity being billed remains unclear.',status:'open',recordedAt:'2026-11-06T23:11:21.000Z'}];
  assert.equal(validateBundle(b,case2).ok,true);
  b.counterevidence[0].sourceId='missing';assert.equal(validateBundle(b,case2).ok,false);
  b.counterevidence[0].sourceId=case2.sources[0].id;
  b.counterevidence[0].observation=5;
  assert.doesNotThrow(()=>validateBundle(b,case2));
  assert.equal(validateBundle(b,case2).ok,false);
});
test('cross-case imports, malformed collections and oversized notes fail safely',()=>{
  const b=createBundle(case1);
  assert.equal(validateBundle(b,case2).ok,false);
  assert.equal(validateBundle({...b,reviews:[]},case1).ok,false);
  const c=collectClaims(case1)[0];
  b.reviews[c.key]={...reviewed(case1,c),analysis:'x'.repeat(3600)};
  assert.equal(validateBundle(b,case1).ok,false);
});
test('source usage and Markdown export preserve caveats',()=>{
  const claims=collectClaims(case1),usage=usageBySource(case1);
  assert.ok(Object.values(usage).some((u)=>u.claims.length>1));
  const markdown=makeReviewReport(createBundle(case1),case1);
  assert.match(markdown,/locally entered researcher observations/i);
  assert.match(markdown,/Remaining evidentiary limits/);
  assert.match(markdown,/not-reviewed/);
  assert.ok(fingerprint('first')!==fingerprint('second'));
});
test('review records never turn proposals into payments in the source dataset',()=>{
  const c=case2.traceSteps[0];
  assert.match(c.notEstablished,/paid/);
  const report=makeReviewReport(createBundle(case2),case2);
  assert.match(report,/Whether the document was final, paid, or linked to delivered algorithmic services/i);
});

test('a challenge cannot be addressed without an explicit resolution note',()=>{
  const c=collectClaims(case2)[0],b=createBundle(case2);
  b.counterevidence=[{id:'ctr-00000002',claimKey:c.key,signature:c.signature,sourceId:case2.sources[0].id,
    observation:'The invoice contains an unfilled recipient entity.',whyItMatters:'Cannot assume it was finalized.',status:'addressed',
    recordedAt:'2026-11-06T23:11:21.000Z'}];
  assert.match(validateBundle(b,case2).errors.join(' '),/written resolution/);
  b.counterevidence[0].resolution='Checked the source again; no completed settlement is shown by this document.';
  b.counterevidence[0].addressedAt='2026-11-06T23:14:21.000Z';
  assert.equal(validateBundle(b,case2).ok,true);
  b.counterevidence[0].resolution=42;
  assert.doesNotThrow(()=>validateBundle(b,case2));
  assert.equal(validateBundle(b,case2).ok,false);
});
