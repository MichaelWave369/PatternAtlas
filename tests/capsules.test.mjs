import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedForCase} from '../src/reconciliationCore.mjs';
import {emptyManifest,createInspection} from '../src/originalDocCore.mjs';
import {emptyJournal,appendHandling} from '../src/handlingCore.mjs';
import {digestPayload} from '../src/auditCore.mjs';
import {
  CAPSULE_FORMAT,countCapsuleContents,prepareCapsulePayload,
  validateCapsulePayload,makeCapsule,inspectCapsule,compareCaseToCapsule
} from '../src/capsuleCore.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=(n)=>JSON.parse(readFileSync(new URL('../src/data/'+n,import.meta.url),'utf8'));
const c1=read('case-001.json'),c2=read('case-002.json'),seeds=read('reconciliationSeeds.json');
const seed=c=>seedForCase(seeds,c);
const stamp='2026-11-06T23:30:00.000Z';
const privateData=async()=>{
  const manifest=emptyManifest(c2);
  const document=createInspection(c2,{
    sourceId:'source-2014-doj-wire-locator',locator:'EFTA01915809',
    downloadUrl:'https://www.justice.gov/epstein/files/DataSet%2010/EFTA01915809.pdf',
    origin:'other',fileName:'EFTA01915809.pdf',bytes:800,sha256:'f'.repeat(64),
    researchNote:'The downloaded document is unverified; this is an illustrative source handling note.'
  });
  document.observations.push({id:'note:'+webcrypto.randomUUID(),page:3,
    pointer:'email correspondence',observed:'A letter contains a reported transaction reference.',
    notEstablished:'This does not independently establish allocation to a specific invoice.',
    recordedAt:stamp});
  document.status='pages-reviewed';
  manifest.documents.push(document);
  const journal=await appendHandling(emptyJournal(c2),c2,manifest,{
    documentId:document.id,actor:'Researcher',action:'opened',eventDate:'2026-11-06',
    note:'Opened an illustrative local PDF and recorded a page note; origin is not independently authenticated.'
  },webcrypto.subtle);
  return {manifest,journal};
};
const build=async(c=c2,flags={originals:false,handling:false},m=null,j=null)=>{
  const payload=prepareCapsulePayload(c,seed(c),m,j,flags,stamp);
  return makeCapsule(payload,webcrypto.subtle);
};
test('public-only capsule includes source-linked audit but no private storage even if supplied',async()=>{
  const {manifest,journal}=await privateData();
  const packet=await build(c2,{originals:false,handling:false},manifest,journal);
  assert.deepEqual(Object.keys(packet.payload).sort(),['auditPacket','createdAt','format','privacy'].sort());
  assert.deepEqual(packet.payload.privacy,{originals:false,handling:false});
  assert.equal(packet.payload.auditPacket.case.id,c2.id);
  assert.equal((await inspectCapsule(packet,webcrypto.subtle)).ok,true);
});
test('capsules are tagged by case and keep curated transaction candidates separate',async()=>{
  for(const c of [c1,c2]){
    const packet=await build(c);
    const result=await inspectCapsule(packet,webcrypto.subtle);
    assert.equal(result.ok,true,result.errors.join('; '));
    assert.equal(result.caseId,c.id);
    assert.equal(result.counts.sources,c.sources.length);
    assert.equal(packet.payload.auditPacket.seed.entries.length,seed(c).entries.length);
  }
});
test('opt-in original manifest carries file fingerprints and page notes only with explicit consent',async()=>{
  const {manifest,journal}=await privateData();
  const capsule=await build(c2,{originals:true,handling:false},manifest,journal);
  assert.ok(capsule.payload.originals);
  assert.equal('handling' in capsule.payload,false);
  assert.equal(countCapsuleContents(capsule.payload).documents,1);
  assert.equal(countCapsuleContents(capsule.payload).pageNotes,1);
  assert.equal((await inspectCapsule(capsule,webcrypto.subtle)).ok,true);
});
test('opt-in handling history requires a manifest and cross-layer hashes validate',async()=>{
  const {manifest,journal}=await privateData();
  const capsule=await build(c2,{originals:true,handling:true},manifest,journal);
  const result=await inspectCapsule(capsule,webcrypto.subtle);
  assert.equal(result.ok,true,result.errors.join('; '));
  assert.equal(result.counts.handlingEvents,1);
  assert.equal(capsule.payload.handling.head,journal.head);
});
test('handling privacy cannot be true unless original documents are also shared',async()=>{
  const {manifest,journal}=await privateData();
  assert.throws(()=>prepareCapsulePayload(c2,seed(c2),manifest,journal,
    {originals:false,handling:true},stamp),/requires its exact original-document manifest/);
});
test('fake privacy declaration and injected undeclared notes are rejected',async()=>{
  const packet=await build();
  const bad=structuredClone(packet);
  bad.payload.sensitiveNotes=['accidental private export'];
  bad.digest=await digestPayload(bad.payload,webcrypto.subtle);
  assert.match((await inspectCapsule(bad,webcrypto.subtle)).errors.join(' '),/Unexpected or missing capsule fields/);
  const altered=structuredClone(packet);
  altered.payload.privacy.originals=true;
  altered.digest=await digestPayload(altered.payload,webcrypto.subtle);
  assert.match((await inspectCapsule(altered,webcrypto.subtle)).errors.join(' '),/Unexpected or missing capsule fields/);
});
test('simple tampering triggers a SHA-256 mismatch',async()=>{
  const cap=await build();
  cap.payload.auditPacket.case.title='Altered case title';
  assert.match((await inspectCapsule(cap,webcrypto.subtle)).errors.join(' '),/SHA-256 mismatch/);
});
test('audit recomputation prevents a self-rehashed forged audit matrix',async()=>{
  const cap=await build();
  cap.payload.auditPacket.audit.sources[0].claims=['invented'];
  cap.digest=await digestPayload(cap.payload,webcrypto.subtle);
  assert.match((await inspectCapsule(cap,webcrypto.subtle)).errors.join(' '),/Audit inventory/);
});
test('recomputed outer hash cannot hide a falsified handling event hash',async()=>{
  const {manifest,journal}=await privateData();
  const cap=await build(c2,{originals:true,handling:true},manifest,journal);
  cap.payload.handling.entries[0].note='Event contents were rewritten after export; original input not independently authenticated.';
  cap.digest=await digestPayload(cap.payload,webcrypto.subtle);
  assert.match((await inspectCapsule(cap,webcrypto.subtle)).errors.join(' '),/Event hash mismatch/);
});
test('changing cited document metadata fails manifest/source validation',async()=>{
  const {manifest}=await privateData();
  const cap=await build(c2,{originals:true,handling:false},manifest);
  cap.payload.auditPacket.case.sources.find(s=>s.id==='source-2014-doj-wire-locator').url+='?moved';
  cap.payload.auditPacket.audit.sources.find(s=>s.id==='source-2014-doj-wire-locator').url+='?moved';
  cap.digest=await digestPayload(cap.payload,webcrypto.subtle);
  assert.match((await inspectCapsule(cap,webcrypto.subtle)).errors.join(' '),/Source URL changed/);
});
test('a missing original document breaks a dependent handling journal',async()=>{
  const {manifest,journal}=await privateData();
  const cap=await build(c2,{originals:true,handling:true},manifest,journal);
  cap.payload.originals.documents=[];
  cap.digest=await digestPayload(cap.payload,webcrypto.subtle);
  assert.match((await inspectCapsule(cap,webcrypto.subtle)).errors.join(' '),/missing or wrong-case PDF fingerprint/);
});
test('a capsule from another case is valid but does not impersonate the selected case',async()=>{
  const cap=await build(c1);
  const validation=await inspectCapsule(cap,webcrypto.subtle);
  assert.equal(validation.ok,true);
  const check=compareCaseToCapsule(c2,cap);
  assert.equal(check.sameCase,false);
  assert.equal(check.identical,false);
  assert.match(check.reason,/another case/);
});
test('old snapshot of same case highlights record drift without changing anything',async()=>{
  const cap=await build(c2);
  const current=structuredClone(c2);
  current.description+=' An updated note.';
  const check=compareCaseToCapsule(current,cap);
  assert.equal(check.sameCase,true);
  assert.equal(check.identical,false);
  assert.match(check.reason,/differs from the current case/);
  assert.equal(compareCaseToCapsule(c2,cap).identical,true);
});
test('malformed JSON-equivalent envelopes are rejected safely',async()=>{
  for(const value of [null,{},[],{format:CAPSULE_FORMAT,digest:'0'.repeat(64)},
    {format:CAPSULE_FORMAT,algorithm:'SHA-256',digest:'x'.repeat(64),payload:{}}]){
    assert.equal((await inspectCapsule(value,webcrypto.subtle)).ok,false);
  }
});
test('unrelated private manifest cannot be attached to the case',async()=>{
  const {manifest}=await privateData();
  const packet=prepareCapsulePayload(c1,seed(c1),manifest,null,{originals:true,handling:false},stamp);
  const result=await validateCapsulePayload(packet,webcrypto.subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/different case/);
});
test('size limit and field restrictions prevent unbounded import',async()=>{
  const capsule=await build();
  const altered=structuredClone(capsule);
  altered.extra='x';
  assert.match((await inspectCapsule(altered,webcrypto.subtle)).errors.join(' '),/envelope/);
  const payload=prepareCapsulePayload(c2,seed(c2),null,null,{originals:false,handling:false},stamp);
  payload.hidden='x'.repeat(3500001);
  assert.match((await validateCapsulePayload(payload,webcrypto.subtle)).errors.join(' '),/Unexpected or missing capsule fields/);
});
