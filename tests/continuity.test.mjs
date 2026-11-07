import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateIdentity,signCapsule} from '../src/signingCore.mjs';
import {prepareCapsulePayload,makeCapsule} from '../src/capsuleCore.mjs';
import {seedForCase} from '../src/reconciliationCore.mjs';
import {
  ROTATION_FORMAT,REVOCATION_FORMAT,CONTINUITY_FORMAT,issueRotation,issueRevocation,
  inspectRotation,inspectRevocation,continuityBundle,inspectContinuity,
  reviewSignedWithContinuity
} from '../src/continuityCore.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const subtle=webcrypto.subtle;
const read=p=>JSON.parse(readFileSync(new URL('../src/data/'+p,import.meta.url),'utf8'));
const c=read('case-001.json'),seeds=read('reconciliationSeeds.json');
const rationale='Scheduled researcher key rotation; both keys authorize the transition.';
const revReason='Key retired after scheduled replacement; please do not trust new signatures using it.';
const delayed=async()=>{
  const a=await generateIdentity(subtle),b=await generateIdentity(subtle),z=await generateIdentity(subtle);
  const ab=await issueRotation(a,b,rationale,subtle);
  const bz=await issueRotation(b,z,'Second planned replacement with dual key authorization.',subtle);
  const notice=await issueRevocation(b,revReason,subtle);
  return {a,b,z,ab,bz,notice};
};
let keysPromise;
const keys=()=>keysPromise||(keysPromise=delayed());
const signed=async id=>{
  const payload=prepareCapsulePayload(c,seedForCase(seeds,c),null,null,{originals:false,handling:false},
    '2026-11-06T21:00:00.000Z');
  const cap=await makeCapsule(payload,subtle);
  return signCapsule(cap,id,'Researcher',subtle);
};

test('rotation uses signatures of both the previous and new keys',async()=>{
  const {a,b,ab}=await keys();
  assert.equal(ab.format,ROTATION_FORMAT);
  assert.equal(ab.statement.previousFingerprint,a.fingerprint);
  assert.equal(ab.statement.nextFingerprint,b.fingerprint);
  assert.equal((await inspectRotation(ab,subtle)).ok,true);
  assert.notEqual(ab.previousSignature,ab.nextSignature);
  assert.equal('d' in ab.statement.previousKey,false);
  assert.equal('d' in ab.statement.nextKey,false);
});
test('modifying an issued rotation rationale breaks the authorization signatures',async()=>{
  const {ab}=await keys();const item=structuredClone(ab);
  item.statement.reason='Falsified source material cannot be trusted as evidence of an authorized rotation.';
  const result=await inspectRotation(item,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/signature is invalid/);
});
test('an attacker cannot substitute an unrelated replacement public key',async()=>{
  const {ab,z}=await keys();const item=structuredClone(ab);
  item.statement.nextKey={...z.publicKey};item.statement.nextFingerprint=z.fingerprint;
  const result=await inspectRotation(item,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/authorization signature is invalid|acceptance signature is invalid/);
});
test('rotation cannot self-endorse one identical key',async()=>{
  const {a}=await keys();
  await assert.rejects(issueRotation(a,a,rationale,subtle),/different/);
});
test('short rationale is rejected for both rotation and revocation',async()=>{
  const {a,b}=await keys();
  await assert.rejects(issueRotation(a,b,'changed',subtle),/20–1200/);
  await assert.rejects(issueRevocation(a,'bad',subtle),/20–1200/);
});
test('revocation notice is self-signed by the covered key',async()=>{
  const {b,notice}=await keys();
  assert.equal(notice.format,REVOCATION_FORMAT);
  assert.equal(notice.statement.fingerprint,b.fingerprint);
  assert.equal((await inspectRevocation(notice,subtle)).ok,true);
  const tampered=structuredClone(notice);tampered.statement.reason+=' fabricated';
  const result=await inspectRevocation(tampered,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/signature is invalid/);
});
test('a trusted root accepts an ordered two-step dual-signed lineage',async()=>{
  const {a,z,ab,bz}=await keys();
  const result=await inspectContinuity(continuityBundle(a.fingerprint,[ab,bz]),a.fingerprint,subtle);
  assert.equal(result.ok,true,result.errors.join('; '));
  assert.equal(result.currentFingerprint,z.fingerprint);
  assert.equal(result.keys.length,3);
  assert.equal(result.historical.length,2);
  assert.equal(result.rootVerified,true);
});
test('a bundle-supplied root does not count as independent trust',async()=>{
  const {a,ab}=await keys(),bundle=continuityBundle(a.fingerprint,[ab]);
  const result=await inspectContinuity(bundle,'',subtle);
  assert.equal(result.ok,false);
  assert.equal(result.rootVerified,false);
  assert.match(result.errors.join(' '),/separately trusted root/);
});
test('a reviewer-pinned different root blocks an otherwise valid rotation',async()=>{
  const {a,b,ab}=await keys();
  const check=await inspectContinuity(continuityBundle(a.fingerprint,[ab]),b.fingerprint,subtle);
  assert.equal(check.ok,false);
  assert.match(check.errors.join(' '),/does not equal/);
});
test('reordering or omitting rotation records fails chain continuity',async()=>{
  const {a,ab,bz}=await keys();
  const reversed=continuityBundle(a.fingerprint,[bz,ab]);
  const result=await inspectContinuity(reversed,a.fingerprint,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/does not continue/);
  const missing=await inspectContinuity(continuityBundle(a.fingerprint,[bz]),a.fingerprint,subtle);
  assert.equal(missing.ok,false);
});
test('a repeated key or nonauthorized branch is rejected',async()=>{
  const {a,b,z,ab}=await keys();
  const za=await issueRotation(z,a,'Rotate back deliberately to a previous fingerprint to exercise cycle checking.',subtle);
  const result=await inspectContinuity(continuityBundle(a.fingerprint,[ab,za]),a.fingerprint,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/cycle or repeats/);
  const illegal=await issueRotation(z,b,'Unrelated branch from an unknown key to an existing key is unsupported.',subtle);
  const other=await inspectContinuity(continuityBundle(a.fingerprint,[ab,illegal]),a.fingerprint,subtle);
  assert.equal(other.ok,false);
});
test('signed revocation of a known key is surfaced but does not claim trusted timestamps',async()=>{
  const {a,ab,bz,notice,b}=await keys();
  const result=await inspectContinuity(continuityBundle(a.fingerprint,[ab,bz],[notice]),a.fingerprint,subtle);
  assert.equal(result.ok,true);
  assert.ok(result.revoked.includes(b.fingerprint));
});
test('revocation of key outside lineage is not accepted as relevant proof',async()=>{
  const {a,notice}=await keys();
  const result=await inspectContinuity(continuityBundle(a.fingerprint,[],[notice]),a.fingerprint,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/unknown key/);
});
test('duplicate self-revocation notices cannot silently count as corroboration',async()=>{
  const {a,ab,notice}=await keys();
  const result=await inspectContinuity(continuityBundle(a.fingerprint,[ab],[notice,notice]),a.fingerprint,subtle);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/Duplicate revocation/);
});
test('a signed capsule under current nonrevoked descendant key passes continuity review',async()=>{
  const {a,ab,bz,z}=await keys();
  const result=await reviewSignedWithContinuity(await signed(z),
    continuityBundle(a.fingerprint,[ab,bz]),a.fingerprint,subtle);
  assert.equal(result.currentUseAccepted,true,result.warnings.join('; '));
  assert.equal(result.signatureValid,true);
  assert.equal(result.capsuleValid,true);
  assert.equal(result.isCurrent,true);
});
test('older signer is cryptographically valid but not current-use accepted',async()=>{
  const {a,ab,bz,b}=await keys();
  const result=await reviewSignedWithContinuity(await signed(b),
    continuityBundle(a.fingerprint,[ab,bz]),a.fingerprint,subtle);
  assert.equal(result.signatureValid,true);
  assert.equal(result.inChain,true);
  assert.equal(result.currentUseAccepted,false);
  assert.match(result.warnings.join(' '),/historical validity cannot be determined/);
});
test('self-revoked currently selected key is reported as a caution, not trusted for new use',async()=>{
  const {a,ab,b,notice}=await keys();
  const result=await reviewSignedWithContinuity(await signed(b),
    continuityBundle(a.fingerprint,[ab],[notice]),a.fingerprint,subtle);
  assert.equal(result.signatureValid,true);
  assert.equal(result.selfRevoked,true);
  assert.equal(result.currentUseAccepted,false);
  assert.match(result.warnings.join(' '),/independent publication and timing/);
});
test('a capsule signed by an unrelated key is not trusted via a valid lineage',async()=>{
  const {a,ab,bz}=await keys(),other=await generateIdentity(subtle);
  const result=await reviewSignedWithContinuity(await signed(other),
    continuityBundle(a.fingerprint,[ab,bz]),a.fingerprint,subtle);
  assert.equal(result.signatureValid,true);
  assert.equal(result.inChain,false);
  assert.equal(result.currentUseAccepted,false);
});
test('malformed formats and injected private JWK fields are rejected',async()=>{
  const {ab,notice,a}=await keys();
  for(const item of [null,{},[],{format:ROTATION_FORMAT}])
    assert.equal((await inspectRotation(item,subtle)).ok,false);
  const tampered=structuredClone(ab);tampered.statement.previousKey.d='private-key-must-not-be-supplied';
  assert.equal((await inspectRotation(tampered,subtle)).ok,false);
  const badRev=structuredClone(notice);badRev.statement.unknown='injected';
  assert.equal((await inspectRevocation(badRev,subtle)).ok,false);
  const badBundle={...continuityBundle(a.fingerprint),unrecognized:true};
  assert.equal((await inspectContinuity(badBundle,a.fingerprint,subtle)).ok,false);
});
test('mismatched or corrupt rotation signature cannot authorize a successor',async()=>{
  const {a,ab}=await keys();
  const corrupted=structuredClone(ab);
  corrupted.nextSignature=(corrupted.nextSignature[0]==='a'?'b':'a')+corrupted.nextSignature.slice(1);
  const outcome=await inspectContinuity(continuityBundle(a.fingerprint,[corrupted]),a.fingerprint,subtle);
  assert.equal(outcome.ok,false);
  assert.match(outcome.errors.join(' '),/Rotation 1/);
});
