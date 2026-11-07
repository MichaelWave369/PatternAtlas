// MK13: Signed key rotation and self-revocation notices, with explicit trust anchoring.
// This verifies key control and declared continuity, NOT identity or trusted time.
import {canonical} from './auditCore.mjs';
import {fingerprintPublic,verifySignedCapsule,SIGN_ALG} from './signingCore.mjs';

export const ROTATION_FORMAT='pattern-atlas-key-rotation-v1';
export const REVOCATION_FORMAT='pattern-atlas-key-revocation-v1';
export const CONTINUITY_FORMAT='pattern-atlas-key-continuity-v1';
export const MAX_ROTATIONS=12;
export const MAX_REVOCATIONS=20;
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>isRecord(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const jwk=v=>exact(v,['kty','crv','x','y'])&&v.kty==='EC'&&v.crv==='P-256'&&
  /^[A-Za-z0-9_-]{43}$/.test(v.x||'')&&/^[A-Za-z0-9_-]{43}$/.test(v.y||'');
const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)&&
  v.length<=40&&!Number.isNaN(Date.parse(v));
const reason=v=>typeof v==='string'&&v.trim().length>=20&&v.trim().length<=1200;
const encode=data=>{
  let out='';for(const v of new Uint8Array(data))out+=String.fromCharCode(v);
  return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const decode=value=>{
  if(typeof value!=='string'||value.length!==86||!/^[A-Za-z0-9_-]{86}$/.test(value))
    throw Error('Invalid 64-byte ECDSA signature encoding.');
  const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'==');
  if(raw.length!==64)throw Error('ECDSA signature byte count differs.');
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
};
const bytes=x=>new TextEncoder().encode(canonical(x));
async function importPublic(j,s){
  if(!jwk(j))throw Error('Only restricted P-256 public keys are supported.');
  return s.importKey('jwk',j,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
}
const requireCrypto=s=>{if(!s)throw Error('WebCrypto unavailable; use secure HTTPS.');return s;};
async function identityCheck(id,s){
  if(!id?.keys?.privateKey||!jwk(id.publicKey)||!hex(id.fingerprint))
    throw Error('An active matching private/public key is required.');
  if(await fingerprintPublic(id.publicKey,s)!==id.fingerprint)
    throw Error('Private-key identity has an inconsistent public fingerprint.');
  const challenge=bytes({format:'pattern-atlas-identity-check-v1',fp:id.fingerprint});
  const sig=await s.sign({name:'ECDSA',hash:'SHA-256'},id.keys.privateKey,challenge);
  const pub=await importPublic(id.publicKey,s);
  if(!await s.verify({name:'ECDSA',hash:'SHA-256'},pub,sig,challenge))
    throw Error('Private key does not match declared public key.');
}
async function verifyStatement(pub,data,signature,s){
  const key=await importPublic(pub,s);
  return s.verify({name:'ECDSA',hash:'SHA-256'},key,decode(signature),bytes(data));
}
async function signStatement(id,statement,s){
  return encode(await s.sign({name:'ECDSA',hash:'SHA-256'},id.keys.privateKey,bytes(statement)));
}
export async function issueRotation(previous,next,note,subtle=globalThis.crypto?.subtle){
  const s=requireCrypto(subtle);
  if(!reason(note))throw Error('A specific 20–1200 character rotation rationale is required.');
  await identityCheck(previous,s);await identityCheck(next,s);
  if(previous.fingerprint===next.fingerprint)throw Error('Replacement key must be different.');
  const statement={
    format:ROTATION_FORMAT,algorithm:SIGN_ALG,rotatedAt:new Date().toISOString(),
    previousFingerprint:previous.fingerprint,nextFingerprint:next.fingerprint,
    previousKey:{...previous.publicKey},nextKey:{...next.publicKey},reason:note.trim()
  };
  const doc={format:ROTATION_FORMAT,statement,
    previousSignature:await signStatement(previous,statement,s),
    nextSignature:await signStatement(next,statement,s)};
  const result=await inspectRotation(doc,s);
  if(!result.ok)throw Error('Rotation self-check failed: '+result.errors.join('; '));
  return doc;
}
export async function inspectRotation(doc,subtle=globalThis.crypto?.subtle){
  const errors=[];
  const fail=e=>{if(errors.length<10)errors.push(e);};
  if(!exact(doc,['format','statement','previousSignature','nextSignature'])||
     doc.format!==ROTATION_FORMAT||!exact(doc.statement,[
       'format','algorithm','rotatedAt','previousFingerprint','nextFingerprint','previousKey','nextKey','reason'
     ]))return {ok:false,errors:['Invalid rotation format or unexpected fields.']};
  const t=doc.statement;
  if(t.format!==ROTATION_FORMAT||t.algorithm!==SIGN_ALG||!stamp(t.rotatedAt)||
    !hex(t.previousFingerprint)||!hex(t.nextFingerprint)||t.previousFingerprint===t.nextFingerprint||
    !jwk(t.previousKey)||!jwk(t.nextKey)||!reason(t.reason))
    return {ok:false,errors:['Invalid rotation statement, public key or reason.']};
  try{
    const s=requireCrypto(subtle);
    if(await fingerprintPublic(t.previousKey,s)!==t.previousFingerprint)
      fail('Previous public key fingerprint differs.');
    if(await fingerprintPublic(t.nextKey,s)!==t.nextFingerprint)
      fail('Replacement public key fingerprint differs.');
    if(!await verifyStatement(t.previousKey,t,doc.previousSignature,s))
      fail('Previous-key authorization signature is invalid.');
    if(!await verifyStatement(t.nextKey,t,doc.nextSignature,s))
      fail('Next-key acceptance signature is invalid.');
  }catch(error){fail('Cryptographic verification failed: '+(error instanceof Error?error.message:'unknown failure'));}
  return {ok:!errors.length,errors,
    previousFingerprint:t.previousFingerprint,nextFingerprint:t.nextFingerprint};
}
export async function issueRevocation(identity,note,subtle=globalThis.crypto?.subtle){
  const s=requireCrypto(subtle);
  if(!reason(note))throw Error('A specific 20–1200 character revocation rationale is required.');
  await identityCheck(identity,s);
  const statement={
    format:REVOCATION_FORMAT,algorithm:SIGN_ALG,revokedAt:new Date().toISOString(),
    fingerprint:identity.fingerprint,publicKey:{...identity.publicKey},reason:note.trim()
  };
  const doc={format:REVOCATION_FORMAT,statement,signature:await signStatement(identity,statement,s)};
  const result=await inspectRevocation(doc,s);
  if(!result.ok)throw Error('Revocation notice self-check failed: '+result.errors.join('; '));
  return doc;
}
export async function inspectRevocation(doc,subtle=globalThis.crypto?.subtle){
  const errors=[];
  if(!exact(doc,['format','statement','signature'])||doc.format!==REVOCATION_FORMAT||
    !exact(doc.statement,['format','algorithm','revokedAt','fingerprint','publicKey','reason']))
    return {ok:false,errors:['Invalid revocation format or unexpected fields.']};
  const t=doc.statement;
  if(t.format!==REVOCATION_FORMAT||t.algorithm!==SIGN_ALG||!stamp(t.revokedAt)||
    !hex(t.fingerprint)||!jwk(t.publicKey)||!reason(t.reason))
    return {ok:false,errors:['Invalid revocation statement, key or rationale.']};
  try{
    const s=requireCrypto(subtle);
    if(await fingerprintPublic(t.publicKey,s)!==t.fingerprint)
      errors.push('Revocation fingerprint does not match its public key.');
    if(!await verifyStatement(t.publicKey,t,doc.signature,s))
      errors.push('Self-revocation signature is invalid.');
  }catch(error){errors.push('Cannot verify revocation: '+(error instanceof Error?error.message:'unknown failure'));}
  return {ok:errors.length===0,errors,fingerprint:t.fingerprint};
}
export function continuityBundle(rootFingerprint,rotations=[],revocations=[]){
  if(!hex(rootFingerprint))throw Error('Provide a 64-character fingerprint from a separately trusted source.');
  return {format:CONTINUITY_FORMAT,rootFingerprint,
    rotations:structuredClone(rotations),revocations:structuredClone(revocations)};
}
export async function inspectContinuity(bundle,pinnedRoot,subtle=globalThis.crypto?.subtle){
  const errors=[];
  const blank={ok:false,errors,rootVerified:false,keys:[],currentFingerprint:null,
    revoked:[],historical:[],rootFingerprint:null,rotationCount:0,revocationCount:0};
  if(!exact(bundle,['format','rootFingerprint','rotations','revocations'])||
    bundle.format!==CONTINUITY_FORMAT||!hex(bundle.rootFingerprint)||
    !Array.isArray(bundle.rotations)||!Array.isArray(bundle.revocations))
    return {...blank,errors:['Invalid continuity bundle.']};
  if(bundle.rotations.length>MAX_ROTATIONS||bundle.revocations.length>MAX_REVOCATIONS)
    return {...blank,errors:['Continuity bundle exceeds rotation/revocation limits.']};
  if(typeof pinnedRoot!=='string'||!hex(pinnedRoot))
    errors.push('A separately trusted root fingerprint must be provided.');
  else if(bundle.rootFingerprint!==pinnedRoot)
    errors.push('The bundle root does not equal your independently trusted root fingerprint.');
  const keys=[bundle.rootFingerprint],revoked=new Set();
  const s=requireCrypto(subtle);
  for(let i=0;i<bundle.rotations.length;i++){
    const doc=bundle.rotations[i];
    const result=await inspectRotation(doc,s);
    if(!result.ok){errors.push('Rotation '+(i+1)+': '+result.errors.join('; '));continue;}
    const t=doc.statement;
    if(t.previousFingerprint!==keys[keys.length-1])
      errors.push('Rotation '+(i+1)+' does not continue from the previous key.');
    if(keys.includes(t.nextFingerprint))
      errors.push('Rotation '+(i+1)+' creates a cycle or repeats an earlier key.');
    keys.push(t.nextFingerprint);
  }
  for(let i=0;i<bundle.revocations.length;i++){
    const doc=bundle.revocations[i];
    const result=await inspectRevocation(doc,s);
    if(!result.ok){errors.push('Revocation '+(i+1)+': '+result.errors.join('; '));continue;}
    const fp=doc.statement.fingerprint;
    if(!keys.includes(fp))errors.push('Revocation '+(i+1)+' refers to an unknown key.');
    if(revoked.has(fp))errors.push('Duplicate revocation of key '+fp.slice(0,12)+'.');
    revoked.add(fp);
  }
  // A valid revocation notice is a self-reported warning, not a trusted timestamp.
  const rootVerified=hex(pinnedRoot)&&bundle.rootFingerprint===pinnedRoot;
  return {
    ok:errors.length===0&&rootVerified,errors,rootVerified,
    keys,currentFingerprint:keys[keys.length-1],historical:keys.slice(0,-1),
    revoked:[...revoked],rootFingerprint:bundle.rootFingerprint,
    rotationCount:bundle.rotations.length,revocationCount:bundle.revocations.length
  };
}
export async function reviewSignedWithContinuity(signed,bundle,pinnedRoot,subtle=globalThis.crypto?.subtle){
  const [chain,capsule]=await Promise.all([
    inspectContinuity(bundle,pinnedRoot,subtle),
    verifySignedCapsule(signed,'',subtle)
  ]);
  const key=capsule.keyFingerprint;
  const inChain=chain.keys.includes(key);
  const selfRevoked=chain.revoked.includes(key);
  const isCurrent=inChain&&chain.currentFingerprint===key&&!selfRevoked;
  const warnings=[];
  if(!chain.rootVerified)warnings.push('No independently authenticated root fingerprint.');
  if(!chain.ok)warnings.push('Continuity chain has integrity or root-trust failures.');
  if(!capsule.ok)warnings.push('Capsule signature or contents failed validation.');
  if(!inChain)warnings.push('Signer is not in the reviewed key lineage.');
  if(inChain&&!isCurrent)warnings.push('Signer is an earlier or self-revoked key; historical validity cannot be determined from browser timestamps.');
  if(selfRevoked)warnings.push('A signed self-revocation notice exists for this key; check independent publication and timing.');
  const currentUseAccepted=chain.ok&&capsule.ok&&isCurrent;
  return {currentUseAccepted,signatureValid:capsule.signatureValid,capsuleValid:capsule.capsuleValid,
    chainValid:chain.ok,inChain,isCurrent,selfRevoked,
    keyFingerprint:key,currentFingerprint:chain.currentFingerprint,
    caseId:capsule.caseId,signerLabel:capsule.signerLabel,warnings,
    errors:[...chain.errors,...capsule.errors]};
}
