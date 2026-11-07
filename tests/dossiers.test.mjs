import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pairFingerprint,createDossier,emptyDossiers,validateDossiers,makeDossierReport} from '../src/dossierCore.mjs';

const read=(name)=>JSON.parse(readFileSync(new URL('../src/data/'+name,import.meta.url),'utf8'));
const c1=read('case-001.json'),c2=read('case-002.json'),seeds=read('dossierSeeds.json');
const settings=(c)=>({
  sourceA:c.sources[0].id,sourceB:c.sources[1].id,
  title:'Compare two source records',
  question:'Could these be related pieces of documentation?',
  findingA:'Record A identifies a proposal or a vendor invoice, without settlement confirmation.',
  findingB:'Record B identifies a related topic but lacks an independent transaction match.',
  sharedContext:'The documents may involve the same organization and broad subject.',
  notEstablished:'The documents do not independently prove the same transaction or a completed deployment.',
  alternative:'They may be distinct proposals, different contracts, or unrelated implementations.',
  nextCheck:'Obtain signed terms and independent settlement or delivery documentation.'
});
test('all featured dossier pairs resolve to two actual sources in the right case',()=>{
  assert.equal(seeds.length,2);
  for(const seed of seeds){
    const c=seed.caseId==='CASE-001'?c1:c2;
    const ids=new Set(c.sources.map((s)=>s.id));
    assert.ok(ids.has(seed.sourceA)&&ids.has(seed.sourceB));
    assert.notEqual(seed.sourceA,seed.sourceB);
    for(const key of ['title','question','findingA','findingB','sharedContext','notEstablished','alternative','nextCheck'])assert.ok(seed[key].length>30);
  }
});
test('Case 002 now contains separate 2013 draft and 2014 invoice sources',()=>{
  assert.equal(c2.sources.length,2);
  const draft=c2.sources.find((s)=>s.id==='source-2013-draft');
  assert.match(draft.note,/draft/i);
  assert.match(draft.note,/not establish execution/i);
  assert.equal(c2.edges.length,2);
  assert.ok(c2.edges.every((e)=>e.sourceIds.includes('source-2014-invoice')));
  assert.equal(c2.traceSteps.length,2);
});
test('empty dossier collection is valid for every case',()=>{
  for(const c of [c1,c2]){
    assert.equal(validateDossiers(emptyDossiers(c),c).ok,true);
  }
});
test('a complete comparison saves when both references exist',()=>{
  const d=createDossier(c2,settings(c2)),data=emptyDossiers(c2);
  data.dossiers.push(d);
  assert.equal(validateDossiers(data,c2).ok,true);
  assert.equal(d.signature,pairFingerprint(c2,d.sourceA,d.sourceB));
});
test('same source in both positions cannot be called independent corroboration',()=>{
  const d=createDossier(c2,{...settings(c2),sourceB:c2.sources[0].id}),data=emptyDossiers(c2);
  data.dossiers.push(d);
  assert.match(validateDossiers(data,c2).errors.join(' '),/two distinct existing sources/);
});
test('imported dossiers from another case are rejected',()=>{
  const data=emptyDossiers(c1);data.dossiers.push(createDossier(c1,settings(c1)));
  assert.match(validateDossiers(data,c2).errors.join(' '),/another case/);
});
test('changed source URLs or cited metadata invalidate prior comparison',()=>{
  const d=createDossier(c2,settings(c2)),data=emptyDossiers(c2);data.dossiers.push(d);
  const updated=structuredClone(c2);
  updated.sources[0].url+='?changed=yes';
  assert.match(validateDossiers(data,updated).errors.join(' '),/changed/);
  const changedCitation=structuredClone(c2);
  changedCitation.sources[1].citation='Different document ID';
  assert.match(validateDossiers(data,changedCitation).errors.join(' '),/changed/);
});
test('all interpretation fields required and IDs cannot impersonate published seeds',()=>{
  const d=createDossier(c2,settings(c2)),data=emptyDossiers(c2);data.dossiers.push(d);
  data.dossiers[0].alternative='';assert.equal(validateDossiers(data,c2).ok,false);
  data.dossiers[0].alternative=settings(c2).alternative;
  data.dossiers[0].id='published:estate-draft-invoice';assert.equal(validateDossiers(data,c2).ok,false);
});
test('duplicate IDs and imported oversized fields are rejected',()=>{
  const d=createDossier(c1,settings(c1)),data=emptyDossiers(c1);
  data.dossiers.push(d,{...d});
  assert.equal(validateDossiers(data,c1).ok,false);
  data.dossiers=[{...d,question:'x'.repeat(2300)}];
  assert.equal(validateDossiers(data,c1).ok,false);
});
test('malformed arrays fail without throwing',()=>{
  const d=emptyDossiers(c2);d.dossiers=[null];
  assert.doesNotThrow(()=>validateDossiers(d,c2));
  assert.equal(validateDossiers(d,c2).ok,false);
  d.dossiers={};assert.equal(validateDossiers(d,c2).ok,false);
});
test('Markdown report cites both records and preserves doubts',()=>{
  const d=createDossier(c2,settings(c2)),data=emptyDossiers(c2);data.dossiers.push(d);
  const report=makeDossierReport(data,c2);
  assert.match(report,/EFTA01188213/);
  assert.match(report,/EFTA00585292/);
  assert.match(report,/Not established/);
  assert.match(report,/not a proof/i);
  assert.match(report,/No source documents were automatically retrieved/i);
});
test('dossier work never adds graph relationships',()=>{
  const before=c2.edges.length;
  const d=createDossier(c2,settings(c2));
  assert.ok(d.id.startsWith('local:'));
  assert.equal(c2.edges.length,before);
});
