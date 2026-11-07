import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedForCase} from '../src/reconciliationCore.mjs';
import {prepareCapsulePayload,makeCapsule} from '../src/capsuleCore.mjs';
import {digestPayload} from '../src/auditCore.mjs';
import {
  SIGNED_FORMAT,SIGN_ALG,BACKUP_FORMAT,PBKDF2_ROUNDS,
  generateIdentity,publicCard,fingerprintPublic,
  signCapsule,verifySignedCapsule,encryptIdentity,decryptIdentity
} from '../src/signingCore.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=p=>JSON.parse(readFileSync(new URL('../src/data/'+p,import.meta.url),'utf8'));
const c=read('case-002.json'),seeds=read('reconciliationSeeds.json');
const subtle=webcrypto.subtle;
const capsule=async()=>{
  const p=prepareCapsulePayload(c,seedForCase(seeds,c),null,null,{originals:false,handling:false},
    '2026-11-06T22:00:00.000Z');
  return makeCapsule(p,subtle);
};
let cached;
const identity=async()=>cached||(cached=await generateIdentity(subtle));
const signed=async()=>signCapsule(await capsule(),await identity(),'Independent Researcher',subtle);

test('generates a fresh ECDSA P-256 key and stable SPKI SHA-256 fingerprint',async()=>{
  const id=await identity();
  assert.equal(id.publicKey.kty,'EC');
  assert.equal(id.publicKey.crv,'P-256');
  assert.equal('d' in id.publicKey,false);
  assert.match(id.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(await fingerprintPublic(id.publicKey,subtle),id.fingerprint);
  const card=publicCard(id);
  assert.equal(card.algorithm,SIGN_ALG);
  assert.equal(card.fingerprint,id.fingerprint);
  assert.equal(JSON.stringify(card).includes('privateKey'),false);
});

test('signs complete validated capsule and verifies without private key',async()=>{
  const artifact=await signed();
  assert.equal(artifact.format,SIGNED_FORMAT);
  assert.equal(artifact.statement.algorithm,SIGN_ALG);
  assert.equal(artifact.statement.signerLabel,'Independent Researcher');
  const result=await verifySignedCapsule(JSON.parse(JSON.stringify(artifact)),'',subtle);
  assert.equal(result.ok,true,result.errors.join(' | '));
  assert.equal(result.signatureValid,true);
  assert.equal(result.capsuleValid,true);
  assert.equal(result.keyMatchesPinned,null);
  assert.equal(result.caseId,c.id);
});

test('a separately pinned fingerprint explicitly matches the signer public key',async()=>{
  const id=await identity();
  const result=await verifySignedCapsule(await signed(),id.fingerprint,subtle);
  assert.equal(result.ok,true);
  assert.equal(result.keyMatchesPinned,true);
});

test('wrong trusted fingerprint rejects otherwise valid cryptographic signature',async()=>{
  const result=await verifySignedCapsule(await signed(),'f'.repeat(64),subtle);
  assert.equal(result.signatureValid,true);
  assert.equal(result.capsuleValid,true);
  assert.equal(result.keyMatchesPinned,false);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/does not match independently trusted/);
});

test('changing a signed signer label invalidates ECDSA signature',async()=>{
  const artifact=await signed();
  artifact.statement.signerLabel='A different researcher';
  const r=await verifySignedCapsule(artifact,'',subtle);
  assert.equal(r.ok,false);
  assert.equal(r.signatureValid,false);
  assert.match(r.errors.join(' '),/signature verification failed/);
});

test('changing source claim and recomputing only MK11 checksum breaks outer ECDSA signature',async()=>{
  const artifact=await signed();
  artifact.statement.capsule.payload.auditPacket.case.title='Altered claimed case identity';
  artifact.statement.capsule.payload.auditPacket.audit.sources[0].citation='Changed';
  artifact.statement.capsule.digest=await digestPayload(artifact.statement.capsule.payload,subtle);
  const r=await verifySignedCapsule(artifact,'',subtle);
  assert.equal(r.signatureValid,false);
  assert.equal(r.ok,false);
});

test('replacing signature bytes fails while inner capsule can still pass',async()=>{
  const artifact=await signed();
  artifact.signature=(artifact.signature[0]==='a'?'b':'a')+artifact.signature.slice(1);
  const r=await verifySignedCapsule(artifact,'',subtle);
  assert.equal(r.capsuleValid,true);
  assert.equal(r.signatureValid,false);
  assert.equal(r.ok,false);
});

test('replacing a public key and updating its embedded fingerprint cannot forge signature',async()=>{
  const artifact=await signed(),other=await generateIdentity(subtle);
  artifact.statement.publicKey=other.publicKey;
  artifact.statement.keyFingerprint=other.fingerprint;
  const r=await verifySignedCapsule(artifact,'',subtle);
  assert.equal(r.ok,false);
  assert.equal(r.signatureValid,false);
});

test('a fingerprint inconsistent with embedded public key rejects signed envelope',async()=>{
  const artifact=await signed();
  artifact.statement.keyFingerprint='1'.repeat(64);
  const r=await verifySignedCapsule(artifact,'',subtle);
  assert.equal(r.ok,false);
  assert.match(r.errors.join(' '),/Embedded public-key fingerprint/);
});

test('malformed envelopes, private JWK injection and unsupported algorithms are rejected',async()=>{
  for(const a of [null,{},[],{format:SIGNED_FORMAT,statement:{},signature:''}]){
    assert.equal((await verifySignedCapsule(a,'',subtle)).ok,false);
  }
  const a=await signed();a.statement.publicKey.d='injected-secret';
  assert.match((await verifySignedCapsule(a,'',subtle)).errors.join(' '),/Invalid or unsupported signing statement/);
  const b=await signed();b.statement.algorithm='RSA-SHA1';
  assert.equal((await verifySignedCapsule(b,'',subtle)).ok,false);
});

test('passphrases are required and encrypted backup contains no plaintext private key',async()=>{
  const id=await identity();
  await assert.rejects(encryptIdentity(id,'short',subtle,webcrypto),/at least 12/);
  const backup=await encryptIdentity(id,'correct horse battery staple',subtle,webcrypto);
  assert.equal(backup.format,BACKUP_FORMAT);
  assert.equal(backup.iterations,PBKDF2_ROUNDS);
  assert.equal(backup.cipher,'AES-256-GCM');
  assert.equal(backup.fingerprint,id.fingerprint);
  assert.equal('privateKey' in backup,false);
  assert.equal(JSON.stringify(backup).includes('PRIVATE KEY'),false);
});

test('encrypted key backup restores the signer and can produce a valid signature',async()=>{
  const id=await identity();
  const backup=await encryptIdentity(id,'long and unique backup passphrase',subtle,webcrypto);
  const restored=await decryptIdentity(backup,'long and unique backup passphrase',subtle);
  assert.equal(restored.fingerprint,id.fingerprint);
  const artifact=await signCapsule(await capsule(),restored,'Restored identity',subtle);
  const r=await verifySignedCapsule(artifact,id.fingerprint,subtle);
  assert.equal(r.ok,true,r.errors.join(' | '));
});

test('wrong passphrase and corrupt encrypted ciphertext cannot restore private key',async()=>{
  const id=await identity();
  const backup=await encryptIdentity(id,'very long backup passphrase',subtle,webcrypto);
  await assert.rejects(decryptIdentity(backup,'a wrong passphrase',subtle),/Wrong passphrase/);
  backup.ciphertext=(backup.ciphertext[0]==='a'?'b':'a')+backup.ciphertext.slice(1);
  await assert.rejects(decryptIdentity(backup,'very long backup passphrase',subtle),/Wrong passphrase/);
});

test('altering salt, nonce, or advertised fingerprint is rejected',async()=>{
  const id=await identity();
  const base=await encryptIdentity(id,'another good backup passphrase',subtle,webcrypto);
  const badSalt=structuredClone(base);badSalt.salt=(base.salt[0]==='B'?'C':'B')+base.salt.slice(1);
  await assert.rejects(decryptIdentity(badSalt,'another good backup passphrase',subtle),/Wrong passphrase/);
  const badIv=structuredClone(base);badIv.iv=(base.iv[0]==='B'?'C':'B')+base.iv.slice(1);
  await assert.rejects(decryptIdentity(badIv,'another good backup passphrase',subtle),/Wrong passphrase/);
  const badFp=structuredClone(base);badFp.fingerprint='2'.repeat(64);
  await assert.rejects(decryptIdentity(badFp,'another good backup passphrase',subtle),/fingerprint does not match/);
});

test('no cryptographic signature can be created from an invalid unsigned MK11 capsule',async()=>{
  const broken=await capsule();broken.payload.auditPacket.case.title='Tampered';
  await assert.rejects(signCapsule(broken,await identity(),'Researcher',subtle),/Unsigned capsule failed integrity/);
});

test('signing rejects empty self-reported labels and missing private keys',async()=>{
  await assert.rejects(signCapsule(await capsule(),await identity(),' ',subtle),/2–80/);
  await assert.rejects(signCapsule(await capsule(),{publicKey:(await identity()).publicKey,
    fingerprint:(await identity()).fingerprint},'Researcher',subtle),/active private key/);
});
