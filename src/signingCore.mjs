// MK12: browser-local ECDSA signatures on complete MK11 research capsules.
// A valid signature proves control of a private key, NOT the signer's human identity
// or the authenticity/truth of any cited record.
import {canonical} from './auditCore.mjs';
import {inspectCapsule,CAPSULE_LIMIT} from './capsuleCore.mjs';

export const SIGNED_FORMAT='pattern-atlas-signed-capsule-v1';
export const BACKUP_FORMAT='pattern-atlas-encrypted-signing-key-v1';
export const PUBLIC_CARD_FORMAT='pattern-atlas-public-key-card-v1';
export const SIGN_ALG='ECDSA-P256-SHA256';
export const PBKDF2_ROUNDS=310000;
export const SIGNED_LIMIT=CAPSULE_LIMIT+6000;
const CONTEXT=new TextEncoder().encode('Pattern Atlas MK12 encrypted private key backup v1');
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>isObject(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const stamp=v=>typeof v==='string'&&v.length<=40&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)&&!Number.isNaN(Date.parse(v));
const size=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const ec=(j)=>isObject(j)&&exact(j,['kty','crv','x','y'])&&j.kty==='EC'&&j.crv==='P-256'&&
  typeof j.x==='string'&&typeof j.y==='string'&&
  /^[A-Za-z0-9_-]{43}$/.test(j.x)&&/^[A-Za-z0-9_-]{43}$/.test(j.y);
function subtleOrFail(subtle){
  if(!subtle)throw Error('WebCrypto is unavailable; use a secure HTTPS browser context.');
  return subtle;
}
function toUrl(bytes){
  let text='';for(const b of bytes)text+=String.fromCharCode(b);
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromUrl(s,max){
  if(typeof s!=='string'||s.length>max||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid encoded key or signature.');
  const padded=s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4);
  const raw=atob(padded);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
const bytes=v=>new TextEncoder().encode(canonical(v));
export function publicJwkFromExport(raw){
  if(!isObject(raw)||raw.kty!=='EC'||raw.crv!=='P-256'||typeof raw.x!=='string'||typeof raw.y!=='string')
    throw Error('Unsupported public signing key.');
  const key={kty:'EC',crv:'P-256',x:raw.x,y:raw.y};
  if(!ec(key))throw Error('Malformed P-256 public key coordinates.');
  return key;
}
async function importPublic(jwk,subtle){
  if(!ec(jwk))throw Error('Invalid public key. Only P-256 verification keys are permitted.');
  return subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
}
export async function fingerprintPublic(jwk,subtle=globalThis.crypto?.subtle){
  const s=subtleOrFail(subtle);
  const key=await importPublic(jwk,s);
  const spki=await s.exportKey('spki',key);
  const digest=await s.digest('SHA-256',spki);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function generateIdentity(subtle=globalThis.crypto?.subtle){
  const s=subtleOrFail(subtle);
  // Extractable for explicit passphrase-encrypted backup; never persisted plaintext.
  const keys=await s.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKey=publicJwkFromExport(await s.exportKey('jwk',keys.publicKey));
  return {keys,publicKey,fingerprint:await fingerprintPublic(publicKey,s)};
}
export function publicCard(identity){
  if(!isObject(identity)||!ec(identity.publicKey)||!hex(identity.fingerprint))
    throw Error('No valid signing identity is active.');
  return {format:PUBLIC_CARD_FORMAT,algorithm:SIGN_ALG,
    fingerprint:identity.fingerprint,publicKey:identity.publicKey,
    warning:'Verify this key fingerprint independently. This unsigned card does not establish author identity.'};
}
export async function signCapsule(capsule,identity,label,subtle=globalThis.crypto?.subtle){
  const s=subtleOrFail(subtle);
  if(!identity?.keys?.privateKey||!ec(identity.publicKey)||!hex(identity.fingerprint))
    throw Error('Generate or import an active private key first.');
  if(typeof label!=='string'||label.trim().length<2||label.trim().length>80)
    throw Error('Enter a 2–80 character signer label. This is self-reported, not verified identity.');
  const outcome=await inspectCapsule(capsule,s);
  if(!outcome.ok)throw Error('Unsigned capsule failed integrity validation: '+outcome.errors.slice(0,3).join('; '));
  if((await fingerprintPublic(identity.publicKey,s))!==identity.fingerprint)
    throw Error('Public key fingerprint does not match the active identity.');
  const statement={format:SIGNED_FORMAT,algorithm:SIGN_ALG,signedAt:new Date().toISOString(),
    signerLabel:label.trim(),publicKey:identity.publicKey,
    keyFingerprint:identity.fingerprint,capsule};
  const signed=await s.sign({name:'ECDSA',hash:'SHA-256'},identity.keys.privateKey,bytes(statement));
  return {format:SIGNED_FORMAT,statement,signature:toUrl(new Uint8Array(signed))};
}
export async function verifySignedCapsule(wrapper,pinnedFingerprint='',subtle=globalThis.crypto?.subtle){
  const errors=[],fail=e=>{if(errors.length<15)errors.push(e);};
  const initial={ok:false,signatureValid:false,capsuleValid:false,
    keyMatchesPinned:null,errors,caseId:null,signerLabel:null,keyFingerprint:null};
  if(!exact(wrapper,['format','statement','signature'])||wrapper.format!==SIGNED_FORMAT||
    !isObject(wrapper.statement)||typeof wrapper.signature!=='string')
    return {...initial,errors:['Invalid signed capsule envelope.']};
  try{if(size(wrapper)>SIGNED_LIMIT)return {...initial,errors:['Signed capsule exceeds size limit.']};}
  catch{return {...initial,errors:['Signed capsule could not be serialized.']};}
  const t=wrapper.statement;
  if(!exact(t,['format','algorithm','signedAt','signerLabel','publicKey','keyFingerprint','capsule'])||
    t.format!==SIGNED_FORMAT||t.algorithm!==SIGN_ALG||!stamp(t.signedAt)||
    typeof t.signerLabel!=='string'||t.signerLabel.trim().length<2||t.signerLabel.length>80||
    !hex(t.keyFingerprint)||!ec(t.publicKey))
    return {...initial,errors:['Invalid or unsupported signing statement.']};
  if(typeof pinnedFingerprint!=='string'||(pinnedFingerprint!==''&&!hex(pinnedFingerprint)))
    fail('Expected trusted fingerprint must be exactly 64 lowercase hexadecimal characters.');
  let signatureValid=false,capsuleValid=false;
  let calculated=null;
  try{
    const s=subtleOrFail(subtle);
    calculated=await fingerprintPublic(t.publicKey,s);
    if(calculated!==t.keyFingerprint)fail('Embedded public-key fingerprint does not match the public key.');
    const pub=await importPublic(t.publicKey,s);
    const sig=fromUrl(wrapper.signature,180);
    if(sig.byteLength!==64)fail('P-256 signature must have exactly 64 bytes.');
    else{
      signatureValid=await s.verify({name:'ECDSA',hash:'SHA-256'},pub,sig,bytes(t));
      if(!signatureValid)fail('ECDSA signature verification failed.');
    }
    const cap=await inspectCapsule(t.capsule,s);
    capsuleValid=cap.ok;
    if(!cap.ok)fail('Inner MK11 capsule failed integrity: '+cap.errors.slice(0,3).join('; '));
  }catch(err){fail('Cannot validate signature: '+(err instanceof Error?err.message:'Cryptographic operation failed.'));}
  const keyMatchesPinned=pinnedFingerprint?calculated===pinnedFingerprint:null;
  if(pinnedFingerprint&&keyMatchesPinned===false)fail('Signer public key does not match independently trusted fingerprint.');
  return {ok:errors.length===0&&signatureValid&&capsuleValid,
    signatureValid,capsuleValid,keyMatchesPinned,
    errors,caseId:t.capsule?.payload?.auditPacket?.case?.id||null,
    signerLabel:t.signerLabel,keyFingerprint:calculated};
}
export async function encryptIdentity(identity,passphrase,subtle=globalThis.crypto?.subtle,
  random=globalThis.crypto){
  const s=subtleOrFail(subtle);
  if(!identity?.keys?.privateKey||!ec(identity.publicKey)||!hex(identity.fingerprint))
    throw Error('No signing identity is active.');
  if(typeof passphrase!=='string'||passphrase.length<12)
    throw Error('Use a passphrase of at least 12 characters for encrypted key backup.');
  if(!random?.getRandomValues)throw Error('Secure random generation unavailable.');
  if((await fingerprintPublic(identity.publicKey,s))!==identity.fingerprint)
    throw Error('Active identity public-key fingerprint mismatch.');
  const privatePkcs8=await s.exportKey('pkcs8',identity.keys.privateKey);
  const salt=random.getRandomValues(new Uint8Array(16));
  const iv=random.getRandomValues(new Uint8Array(12));
  const root=await s.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  const aes=await s.deriveKey({name:'PBKDF2',salt,iterations:PBKDF2_ROUNDS,hash:'SHA-256'},
    root,{name:'AES-GCM',length:256},false,['encrypt']);
  const encrypted=await s.encrypt({name:'AES-GCM',iv,additionalData:CONTEXT},aes,privatePkcs8);
  return {format:BACKUP_FORMAT,kdf:'PBKDF2-SHA256',iterations:PBKDF2_ROUNDS,
    cipher:'AES-256-GCM',salt:toUrl(salt),iv:toUrl(iv),ciphertext:toUrl(new Uint8Array(encrypted)),
    publicKey:identity.publicKey,fingerprint:identity.fingerprint};
}
export async function decryptIdentity(backup,passphrase,subtle=globalThis.crypto?.subtle){
  const s=subtleOrFail(subtle);
  if(!exact(backup,['format','kdf','iterations','cipher','salt','iv','ciphertext','publicKey','fingerprint'])||
    backup.format!==BACKUP_FORMAT||backup.kdf!=='PBKDF2-SHA256'||backup.iterations!==PBKDF2_ROUNDS||
    backup.cipher!=='AES-256-GCM'||!ec(backup.publicKey)||!hex(backup.fingerprint))
    throw Error('Unsupported or malformed encrypted key backup.');
  if(size(backup)>16000)throw Error('Encrypted key backup exceeds 16 KB.');
  if(typeof passphrase!=='string'||!passphrase.length)throw Error('Enter the backup passphrase.');
  const salt=fromUrl(backup.salt,50),iv=fromUrl(backup.iv,30),data=fromUrl(backup.ciphertext,13000);
  if(salt.length!==16||iv.length!==12||data.length<16)throw Error('Invalid encryption salt, IV or encrypted bytes.');
  if((await fingerprintPublic(backup.publicKey,s))!==backup.fingerprint)
    throw Error('Backup public-key fingerprint does not match its public key.');
  try{
    const root=await s.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
    const aes=await s.deriveKey({name:'PBKDF2',salt,iterations:PBKDF2_ROUNDS,hash:'SHA-256'},
      root,{name:'AES-GCM',length:256},false,['decrypt']);
    const pkcs8=await s.decrypt({name:'AES-GCM',iv,additionalData:CONTEXT},aes,data);
    const privateKey=await s.importKey('pkcs8',pkcs8,{name:'ECDSA',namedCurve:'P-256'},true,['sign']);
    const publicKey=await importPublic(backup.publicKey,s);
    // Verify the decrypted private key actually corresponds to the advertised public key.
    const challenge=new TextEncoder().encode('Pattern Atlas MK12 matching key check');
    const signed=await s.sign({name:'ECDSA',hash:'SHA-256'},privateKey,challenge);
    if(!await s.verify({name:'ECDSA',hash:'SHA-256'},publicKey,signed,challenge))
      throw Error('Decrypted private key does not match the public key.');
    return {keys:{privateKey,publicKey},publicKey:backup.publicKey,fingerprint:backup.fingerprint};
  }catch{throw Error('Wrong passphrase, corrupted backup, or mismatched private key. No key was loaded.');}
}
