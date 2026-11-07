import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveTasks,allTasks,emptyQueue,validateQueue,queueReport} from '../src/researchQueueCore.mjs';

const load=(filename)=>JSON.parse(readFileSync(new URL('../src/data/'+filename,import.meta.url),'utf8'));
const a=load('case-001.json'),b=load('case-002.json');
const time='2026-11-06T21:30:00.000Z';
const taskUpdate=(task,overrides={})=>({
  signature:task.signature,status:'in-progress',workNote:'Investigated preliminary records; next find matching bank entry.',
  evidenceRef:'',updatedAt:time,...overrides
});
test('derive source-linked tasks from both hypotheses and trace gaps',()=>{
  for(const c of [a,b]) {
    const tasks=deriveTasks(c);
    assert.equal(tasks.length,c.hypotheses.length+c.traceSteps.length);
    assert.equal(new Set(tasks.map((t)=>t.id)).size,tasks.length);
    assert.ok(tasks.every((t)=>t.title&&t.evidenceNeeded&&t.sourceIds.length&&t.signature.length===8));
  }
});
test('new case starts with no researcher-entered progress',()=>{
  for(const c of [a,b]) {
    const queue=emptyQueue(c);
    assert.equal(validateQueue(queue,c).ok,true);
    assert.deepEqual(queue.updates,{});
    assert.deepEqual(queue.customTasks,[]);
  }
});
test('task is reviewed only with substantial note and existing reference',()=>{
  const q=emptyQueue(a),t=deriveTasks(a)[0];
  q.updates[t.id]=taskUpdate(t,{status:'reviewed',workNote:'Read the invoice and checked the installation discussion; payment and operation remain unproven.',evidenceRef:t.sourceIds[0]});
  assert.equal(validateQueue(q,a).ok,true);
  q.updates[t.id].evidenceRef='';
  assert.match(validateQueue(q,a).errors.join(' '),/requires a source ID/);
  q.updates[t.id].evidenceRef=t.sourceIds[0];
  q.updates[t.id].workNote='done';
  assert.match(validateQueue(q,a).errors.join(' '),/substantial finding/);
});
test('status "needs material" requires an explanation',()=>{
  const q=emptyQueue(b),t=deriveTasks(b)[0];
  q.updates[t.id]=taskUpdate(t,{status:'needs-material',workNote:'no'});
  assert.equal(validateQueue(q,b).ok,false);
  q.updates[t.id].workNote='Need an original executed contract to confirm billing terms.';
  assert.equal(validateQueue(q,b).ok,true);
});
test('manual task needs a linked existing source and safe unique ID',()=>{
  const q=emptyQueue(a),id='custom:12345678-1234-1234-1234-123456789abc';
  q.customTasks.push({id,title:'Check a ledger lead',question:'Was the Novamente invoice paid?',
    evidenceNeeded:'Find the original ledger and settlement record.',sourceIds:['doc-invoice'],createdAt:time});
  assert.equal(validateQueue(q,a).ok,true);
  const added=allTasks(a,q).find((t)=>t.id===id);
  assert.equal(added.kind,'researcher-added');
  q.customTasks[0].sourceIds=['unlisted'];
  assert.equal(validateQueue(q,a).ok,false);
  q.customTasks[0].sourceIds=['doc-invoice'];
  q.customTasks.push({...q.customTasks[0]});
  assert.equal(validateQueue(q,a).ok,false);
});
test('source URL and task wording changes invalidate stale progress',()=>{
  const q=emptyQueue(a),task=deriveTasks(a)[0];
  q.updates[task.id]=taskUpdate(task);
  const changed=structuredClone(a);
  changed.sources.find((x)=>x.id===task.sourceIds[0]).url+='?new-link';
  assert.match(validateQueue(q,changed).errors.join(' '),/changed since its update/);
  const changedText=structuredClone(a);
  changedText.hypotheses[0].nextCheck+=' Now demand independent confirmation.';
  assert.match(validateQueue(q,changedText).errors.join(' '),/changed since its update/);
});
test('cross-case imported status is rejected',()=>{
  const q=emptyQueue(a);
  assert.match(validateQueue(q,b).errors.join(' '),/another case/);
  const task=deriveTasks(a)[0];q.updates[task.id]=taskUpdate(task);
  assert.equal(validateQueue(q,b).ok,false);
});
test('unknown task, unsafe URL or forged status rejected',()=>{
  const q=emptyQueue(a),t=deriveTasks(a)[0];
  q.updates[t.id]=taskUpdate(t,{status:'reviewed',workNote:'Investigated the source and retained the remaining uncertainty for future checks.',evidenceRef:'javascript:alert(1)'});
  assert.equal(validateQueue(q,a).ok,false);
  q.updates[t.id].evidenceRef='https://example.org/document';
  assert.equal(validateQueue(q,a).ok,true);
  q.updates[t.id].status='true';
  assert.equal(validateQueue(q,a).ok,false);
  delete q.updates[t.id];
  q.updates['gap:does-not-exist']=taskUpdate(t);
  assert.equal(validateQueue(q,a).ok,false);
});
test('malformed collections do not crash validation',()=>{
  const q=emptyQueue(a);q.updates=[];
  assert.doesNotThrow(()=>validateQueue(q,a));
  assert.equal(validateQueue(q,a).ok,false);
  const q2=emptyQueue(a);q2.customTasks=[null];
  assert.doesNotThrow(()=>validateQueue(q2,a));
  assert.equal(validateQueue(q2,a).ok,false);
});
test('reviewed research does not become a verified historical conclusion',()=>{
  const q=emptyQueue(b),t=deriveTasks(b)[0];
  q.updates[t.id]=taskUpdate(t,{status:'reviewed',workNote:'Read the invoice; it alone does not demonstrate payment or delivery.',evidenceRef:t.sourceIds[0]});
  const report=queueReport(q,b);
  assert.match(report,/reviewed task does not establish any historical claim as true/i);
  assert.match(report,/does not demonstrate payment or delivery/i);
  assert.match(report,/EFTA00585292/);
});
