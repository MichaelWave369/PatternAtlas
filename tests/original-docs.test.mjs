import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  emptyManifest,fingerprintPdf,compareFingerprint,createInspection,validateManifest,
  duplicateFingerprints,manifestReport,MAX_FILE_BYTES
} from '../src/originalDocCore.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../src/data/'+path,import.meta.url),'utf8'));
const case1=read('case-001.json'),case2=read('case-002.json'),targets=read('originalDocTargets.json');
const pdf=(name='%PDF-document.pdf',content='%PDF-1.7\nA minimal bytes-only fixture\n')=>{
  const data=new TextEncoder().encode(content);
  return {name,size:data.byteLength,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
};
const make=(c,sourceId,other={})=>createInspection(c,{
 sourceId,locator:'EFTA01915809',downloadUrl:'https://www.justice.gov/epstein/',origin:'other',
 fileName:'research-copy.pdf',bytes:100,sha256:'e'.repeat(64),
 researchNote:'File copied from a public archive. This provenance claim requires independent verification.',...other});
test('three priority retrieval targets are traceable to registry entries without certifying the locator',()=>{
  assert.equal(targets.length,3);
  for(const t of targets){
    const c=t.caseId==='CASE-001'?case1:case2;
    assert.ok(c.sources.find(s=>s.id===t.sourceId));
    assert.match(t.locator,/^EFTA\d{8}$/);
    assert.match(t.description,/not|unverified|original/i);
  }
  assert.match(case1.sources.find(s=>s.id==='doc-ledger-lead').note,/original ledger page.*unconfirmed/i);
});
test('a local PDF is hashed by its exact bytes without extracting text or persisting file content',async()=>{
  const hash=await fingerprintPdf(pdf('original.pdf'),webcrypto.subtle);
  assert.match(hash.sha256,/^[0-9a-f]{64}$/);
  assert.equal(hash.bytes,new TextEncoder().encode('%PDF-1.7\nA minimal bytes-only fixture\n').byteLength);
  assert.equal(hash.fileName,'original.pdf');
  assert.equal('data' in hash,false);
  assert.equal('content' in hash,false);
});
test('a second identical file matches, modified bytes do not match',async()=>{
  const first=await fingerprintPdf(pdf('first.pdf'),webcrypto.subtle);
  const second=await fingerprintPdf(pdf('renamed.pdf'),webcrypto.subtle);
  const altered=await fingerprintPdf(pdf('other.pdf','%PDF-1.7\naltered data\n'),webcrypto.subtle);
  assert.equal(compareFingerprint(first,second).sameBytes,true);
  assert.equal(compareFingerprint(first,altered).sameBytes,false);
});
test('rejects HTML masquerading as PDF, non-PDF names and oversized files',async()=>{
  await assert.rejects(fingerprintPdf(pdf('fraud.pdf','<html>hello</html>'),webcrypto.subtle),/PDF header/);
  await assert.rejects(fingerprintPdf(pdf('file.html'),webcrypto.subtle),/PDF filenames/);
  await assert.rejects(fingerprintPdf({...pdf(),size:MAX_FILE_BYTES+1},webcrypto.subtle),/50 MiB/);
});
test('no browser hashing without WebCrypto support',async()=>{
  await assert.rejects(fingerprintPdf(pdf('test.pdf'),null),/SHA-256/);
});
test('manifest validates a known source-linked capture',()=>{
  const manifest=emptyManifest(case2);
  const d=make(case2,'source-2014-doj-wire-locator');
  manifest.documents=[d];
  assert.equal(validateManifest(manifest,case2).ok,true);
  assert.equal(d.observations.length,0);
  assert.equal(d.status,'fingerprinted');
});
test('source URL changes invalidate a saved file provenance record',()=>{
  const manifest=emptyManifest(case2);
  manifest.documents.push(make(case2,'source-2014-doj-wire-locator'));
  const revised=structuredClone(case2);
  revised.sources.find(s=>s.id==='source-2014-doj-wire-locator').url+='?edited';
  assert.match(validateManifest(manifest,revised).errors.join(' '),/Source URL changed/);
});
test('imports cannot reassign a file manifest to another case',()=>{
  const manifest=emptyManifest(case2);
  assert.match(validateManifest(manifest,case1).errors.join(' '),/different case/);
});
test('manual page notes must state what is observed AND what is not established',()=>{
  const manifest=emptyManifest(case2),d=make(case2,'source-2014-doj-wire-locator');
  d.status='pages-reviewed';manifest.documents.push(d);
  assert.match(validateManifest(manifest,case2).errors.join(' '),/requires at least one/);
  d.observations.push({
    id:'note:'+webcrypto.randomUUID(),page:3,pointer:'Reply email, second paragraph',
    observed:'The copied page contains a reported receipt with date and amount.',
    notEstablished:'The page contains no explicit invoice allocation and is not a bank settlement record.',
    recordedAt:'2026-11-07T03:00:00.000Z'
  });
  assert.equal(validateManifest(manifest,case2).ok,true);
  d.observations[0].notEstablished='';
  assert.equal(validateManifest(manifest,case2).ok,false);
});
test('duplicate byte hashes are flagged as copies, not independent corroboration',()=>{
  const manifest=emptyManifest(case2);
  manifest.documents.push(make(case2,'source-2014-doj-wire-locator'));
  manifest.documents.push(make(case2,'source-2014-bank-inquiry'));
  assert.equal(validateManifest(manifest,case2).ok,true);
  assert.equal(duplicateFingerprints(manifest).length,1);
  assert.equal(duplicateFingerprints(manifest)[0].ids.length,2);
});
test('malformed, forged, unsafe, or duplicate records are rejected',()=>{
  const manifest=emptyManifest(case2),d=make(case2,'source-2014-doj-wire-locator');
  manifest.documents=[null];
  assert.doesNotThrow(()=>validateManifest(manifest,case2));
  assert.equal(validateManifest(manifest,case2).ok,false);
  manifest.documents=[d,{...d}];
  assert.match(validateManifest(manifest,case2).errors.join(' '),/duplicate/);
  manifest.documents=[{...d,downloadUrl:'javascript:alert(1)'}];
  assert.equal(validateManifest(manifest,case2).ok,false);
  manifest.documents=[{...d,sourceId:'made-up'}];
  assert.equal(validateManifest(manifest,case2).ok,false);
  manifest.documents=[{...d,fileName:'../bad.pdf'}];
  assert.equal(validateManifest(manifest,case2).ok,false);
});
test('report shows exact file fingerprint, source citation, and limitations',()=>{
  const manifest=emptyManifest(case2);
  manifest.documents.push(make(case2,'source-2014-doj-wire-locator'));
  const report=manifestReport(manifest,case2);
  assert.match(report,/EFTA01915809/);
  assert.match(report,/e{64}/);
  assert.match(report,/cannot authenticate/i);
  assert.match(report,/binary content nor any banking credentials/i);
});
test('new bank correspondence is explicitly reported, never bank-confirmed',()=>{
  const s=case2.sources.find(x=>x.id==='source-2014-bank-inquiry');
  const step=case2.traceSteps.find(x=>x.id==='tr3');
  assert.match(s.note,/not independently inspected bank ledger entries/);
  assert.match(step.notEstablished,/same bank transaction/);
  assert.equal(case2.edges.length,2);
});
