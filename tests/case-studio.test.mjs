import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCase } from '../src/caseValidation.mjs';

const load = (name) => JSON.parse(readFileSync(new URL('../src/data/'+name, import.meta.url),'utf8'));
const good = () => load('case-002.json');

test('both curated cases validate', () => {
  for (const path of ['case-001.json','case-002.json']) {
    const result=checkCase(load(path));
    assert.equal(result.ok,true,path+': '+result.errors.join('; '));
  }
});
test('an empty local case with metadata is structurally allowed', () => {
  const doc={id:'LOCAL-abc123',title:'New investigation',subtitle:'Local',description:'Evidence collection in progress.',updated:'2026-11-06',
    nodes:[],edges:[],sources:[],events:[],hypotheses:[],traceSteps:[]};
  assert.equal(checkCase(doc).ok,true);
});
test('malicious or unsupported source URLs are rejected', () => {
  for(const url of ['javascript:alert(1)','http://archive.example/test','https://name:pass@example.com/a','https://']) {
    const c=good();c.sources[0].url=url;
    assert.equal(checkCase(c).ok,false,url);
  }
});
test('malformed collections cannot crash the validator', () => {
  const doc=good();doc.sources={};
  assert.doesNotThrow(()=>checkCase(doc));
  assert.equal(checkCase(doc).ok,false);
});
test('unknown source references and missing relationship endpoints are rejected', () => {
  const doc=good();doc.edges[0].sourceIds=['unknown'];
  assert.equal(checkCase(doc).ok,false);
  doc.edges[0].sourceIds=['source-2014-invoice'];
  doc.edges[0].to='made-up-person';
  assert.equal(checkCase(doc).ok,false);
});
test('unverified relationships still require citations', () => {
  const doc=good();
  doc.edges[0].assessment='unverified';doc.edges[0].sourceIds=[];
  assert.equal(checkCase(doc).ok,false);
});
test('duplicate IDs and impossible dates are rejected', () => {
  const doc=good();
  doc.nodes.push({...doc.nodes[0]});
  assert.equal(checkCase(doc).ok,false);
  const doc2=good();
  doc2.events[0].date='2026-02-30';
  assert.equal(checkCase(doc2).ok,false);
});
test('all trace milestones include what is and is not established',()=>{
  for(const filename of ['case-001.json','case-002.json']){
    const doc=load(filename);
    for(const step of doc.traceSteps){
      assert.ok(step.established.length>20);
      assert.ok(step.notEstablished.length>20);
      assert.ok(step.sourceIds.length>0);
    }
  }
});
test('2014 invoice document is not treated as a completed payment',()=>{
  const doc=good();
  assert.equal(doc.sources.length,2);
  assert.match(doc.sources[0].note,/not.*settlement|does not.*settlement/i);
  assert.match(doc.traceSteps.find((s)=>s.id==='tr1').notEstablished,/paid/i);
  assert.equal(doc.edges[0].label,'named invoice addressee');
});
