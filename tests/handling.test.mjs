import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  HANDLING_ACTIONS,GENESIS,canonical,hashEvent,emptyJournal,appendHandling,
  validateJournal,handlingReport
} from '../src/handlingCore.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const c=JSON.parse(readFileSync(new URL('../src/data/case-002.json',import.meta.url),'utf8'));
const source=c.sources.find(s=>s.id==='source-2014-doj-wire-locator');
const id='doc:11111111-1111-4111-8111-111111111111';
const manifest=()=>({documents:[{
  id,sourceId:source.id,sourceUrlAtCapture:source.url,sha256:'a'.repeat(64),bytes:19432,
  locator:'EFTA01915809',fileName:'EFTA01915809.pdf',downloadUrl:source.url
}]});
const input=(more={})=>({documentId:id,actor:'Researcher',action:'opened',
 eventDate:'2026-11-06',note:'Opened a locally downloaded PDF; its original provenance remains unconfirmed.',...more});
const add=async(j=emptyJournal(c),m=manifest(),more={})=>appendHandling(j,c,m,input(more),webcrypto.subtle);

test('fresh per-case ledger has an explicit SHA-256 genesis and no claimed events',async()=>{
 const j=emptyJournal(c);
 assert.equal(j.head,GENESIS);
 assert.deepEqual(j.entries,[]);
 assert.equal((await validateJournal(j,c,manifest(),webcrypto.subtle)).ok,true);
});
test('recorded event binds a case, source URL, PDF bytes and researcher observation',async()=>{
 const journal=await add();
 const event=journal.entries[0];
 assert.equal(event.seq,1);
 assert.equal(event.previousHash,GENESIS);
 assert.equal(event.caseId,c.id);
 assert.equal(event.fileSha256,'a'.repeat(64));
 assert.equal(event.fileBytes,19432);
 assert.equal(event.sourceId,source.id);
 assert.equal(event.sourceUrl,source.url);
 assert.equal(journal.head,event.hash);
 assert.equal((await validateJournal(journal,c,manifest(),webcrypto.subtle)).ok,true);
});
test('events create an ordered SHA-256 linked sequence',async()=>{
 const first=await add();
 const second=await add(first,manifest(),{action:'compared',note:'Compared the same document to a second downloaded copy; no authenticity established.'});
 assert.equal(second.entries.length,2);
 assert.equal(second.entries[1].seq,2);
 assert.equal(second.entries[1].previousHash,second.entries[0].hash);
 assert.notEqual(second.head,first.head);
 assert.equal((await validateJournal(second,c,manifest(),webcrypto.subtle)).ok,true);
});
test('changing an event note without recomputing its checksum fails validation',async()=>{
 const journal=await add();
 journal.entries[0].note='Invented an event with different content and questionable provenance.';
 const verdict=await validateJournal(journal,c,manifest(),webcrypto.subtle);
 assert.equal(verdict.ok,false);
 assert.match(verdict.errors.join(' '),/hash mismatch/);
});
test('changing event order or deleting events breaks sequence integrity',async()=>{
 const two=await add(await add(),manifest(),{action:'archived',note:'Placed the reviewed copy into a locally named archive directory.'});
 const reversed=structuredClone(two);
 reversed.entries.reverse();
 assert.equal((await validateJournal(reversed,c,manifest(),webcrypto.subtle)).ok,false);
 const removed=structuredClone(two);
 removed.entries.shift();
 assert.equal((await validateJournal(removed,c,manifest(),webcrypto.subtle)).ok,false);
});
test('changing a referenced PDF checksum, source URL, or locator invalidates old custody notes',async()=>{
 const j=await add();
 const badDigest=manifest();badDigest.documents[0].sha256='b'.repeat(64);
 assert.match((await validateJournal(j,c,badDigest,webcrypto.subtle)).errors.join(' '),/fingerprint or source metadata changed/);
 const movedUrl=structuredClone(c);movedUrl.sources.find(s=>s.id===source.id).url+='?changed';
 assert.match((await validateJournal(j,movedUrl,manifest(),webcrypto.subtle)).errors.join(' '),/fingerprint or source metadata changed/);
 const changedLocator=manifest();changedLocator.documents[0].locator='EFTA00000000';
 assert.equal((await validateJournal(j,c,changedLocator,webcrypto.subtle)).ok,false);
});
test('missing PDF fingerprint or cross-case history is rejected',async()=>{
 const j=await add();
 assert.match((await validateJournal(j,c,{documents:[]},webcrypto.subtle)).errors.join(' '),/missing or wrong-case PDF/);
 const other=structuredClone(c);other.id='CASE-OTHER';
 assert.match((await validateJournal(j,other,manifest(),webcrypto.subtle)).errors.join(' '),/another case/);
});
test('requires meaningful user reports, not decorative click-through events',async()=>{
 await assert.rejects(add(emptyJournal(c),manifest(),{note:'checked'}),/observation/);
 await assert.rejects(add(emptyJournal(c),manifest(),{action:'officially-verified'}),/observation/);
 await assert.rejects(add(emptyJournal(c),manifest(),{actor:'x'}),/observation/);
 await assert.rejects(add(emptyJournal(c),manifest(),{eventDate:'2026-02-30'}),/observation/);
 assert.ok(HANDLING_ACTIONS.includes('redacted'));
});
test('duplicate IDs, unknown extra fields and unlinked head hashes are rejected',async()=>{
 const two=await add(await add(),manifest(),{action:'copied',note:'Copied the downloaded PDF to backup storage; provenance is not authenticated.'});
 two.entries[1].id=two.entries[0].id;
 assert.match((await validateJournal(two,c,manifest(),webcrypto.subtle)).errors.join(' '),/repeated event ID/);
 const j=await add();j.entries[0].someInjectedField='unhashed';
 assert.match((await validateJournal(j,c,manifest(),webcrypto.subtle)).errors.join(' '),/Unexpected or missing/);
 const fork=await add();fork.head=GENESIS;
 assert.match((await validateJournal(fork,c,manifest(),webcrypto.subtle)).errors.join(' '),/Journal head/);
});
test('malformed imported objects fail safely',async()=>{
 for(const data of [null,[],{},{format:'bad',caseId:c.id,entries:[],head:GENESIS},
   {format:'pattern-atlas-handling-ledger-v1',caseId:c.id,entries:[null],head:GENESIS}]){
   const result=await validateJournal(data,c,manifest(),webcrypto.subtle);
   assert.equal(result.ok,false);
 }
});
test('canonical encoding normalizes key order but preserves array order',()=>{
 assert.equal(canonical({b:2,a:[{z:true,x:1}]}),canonical({a:[{x:1,z:true}],b:2}));
 assert.notEqual(canonical([1,2]),canonical([2,1]));
});
test('report includes independent anchor limitations, event sequence and document digest',async()=>{
 const j=await add();
 const report=handlingReport(j,c);
 assert.match(report,/self-reported evidence handling history/i);
 assert.match(report,/Anyone controlling the entire journal can regenerate its hashes/i);
 assert.match(report,/EFTA01915809/);
 assert.match(report,/a{64}/);
 assert.match(report,/No event independently verifies file origin/i);
});
test('a wholly rewritten self-hashed journal can still validate, demonstrating need for external anchors',async()=>{
 const j=await add();const rewritten=structuredClone(j);
 rewritten.entries[0].note='A rewritten researcher report without independent time or authorship proof.';
 rewritten.entries[0].hash=await hashEvent(rewritten.entries[0],webcrypto.subtle);
 rewritten.head=rewritten.entries[0].hash;
 assert.equal((await validateJournal(rewritten,c,manifest(),webcrypto.subtle)).ok,true);
 assert.notEqual(rewritten.head,j.head);
});
test('record limit is enforced without silently deleting old history',async()=>{
 let journal=await add();
 journal.entries=Array.from({length:201},()=>({...journal.entries[0]}));
 assert.match((await validateJournal(journal,c,manifest(),webcrypto.subtle)).errors.join(' '),/exceeds 200/);
});
