import {useState} from 'react';
import type {CaseFile} from './types';
import {downloadFile} from './handlingStorage';
import {
  generateIdentity,publicCard,encryptIdentity,decryptIdentity,signCapsule,verifySignedCapsule,
  SIGNED_LIMIT
} from './signingCore.mjs';

type Identity={
  keys:CryptoKeyPair;publicKey:{kty:string;crv:string;x:string;y:string};fingerprint:string;
};
type VerifyResult={
  ok:boolean;signatureValid:boolean;capsuleValid:boolean;keyMatchesPinned:boolean|null;
  errors:string[];caseId:string|null;signerLabel:string|null;keyFingerprint:string|null;
};

export default function CapsuleSignatures({caseFile}:{caseFile:CaseFile}){
  const [identity,setIdentity]=useState<Identity|null>(null);
  const [label,setLabel]=useState('Researcher');
  const [password,setPassword]=useState('');
  const [backupPassword,setBackupPassword]=useState('');
  const [pinned,setPinned]=useState('');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [signedName,setSignedName]=useState('');
  const [checkedName,setCheckedName]=useState('');
  const [verification,setVerification]=useState<VerifyResult|null>(null);
  const fingerprint=identity?.fingerprint||'No active signing key';
  const secure=!!globalThis.crypto?.subtle;
  const MAX_BACKUP=16000;

  async function generate(){
    if(busy)return;setBusy(true);setStatus('');
    try{
      if(identity&&!window.confirm('Replace the active in-memory signing key? Export its encrypted backup first; otherwise it cannot be recovered.'))return;
      const id=await generateIdentity(globalThis.crypto?.subtle) as Identity;
      setIdentity(id);setStatus('New P-256 signing key generated in memory. Export an encrypted backup before navigating away or closing this tab.');
      setPassword('');setBackupPassword('');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not generate signing key.');}
    finally{setBusy(false);}
  }
  async function backup(){
    if(!identity||busy)return;
    setBusy(true);setStatus('');
    try{
      const encrypted=await encryptIdentity(identity,password,globalThis.crypto?.subtle,globalThis.crypto);
      downloadFile(JSON.stringify(encrypted,null,2)+'\n','pattern-atlas-private-key-encrypted.json','application/json');
      setStatus('Encrypted private-key backup downloaded. Keep this file and its passphrase secure and separate. Your private key was not uploaded.');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not encrypt signing key.');}
    finally{setPassword('');setBusy(false);}
  }
  async function importBackup(file?:File){
    if(!file)return;
    if(file.size>MAX_BACKUP){setStatus('Encrypted backup exceeds 16 KB.');setBackupPassword('');return;}
    if(!backupPassword){setStatus('Enter the backup passphrase before selecting its file.');return;}
    if(identity&&!window.confirm('Replace your current signing key in memory? Save an encrypted backup first.'))return;
    setBusy(true);setStatus('');
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const restored=await decryptIdentity(parsed,backupPassword,globalThis.crypto?.subtle) as Identity;
      setIdentity(restored);
      setStatus('Encrypted signing identity restored in memory. Confirm its fingerprint with your independently retained public-key card.');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not restore encrypted signing key.');}
    finally{setBackupPassword('');setBusy(false);}
  }
  function exportPublic(){
    if(!identity)return;
    try{
      downloadFile(JSON.stringify(publicCard(identity),null,2)+'\n',
        'pattern-atlas-public-key-'+identity.fingerprint.slice(0,12)+'.json','application/json');
      setStatus('Public-key card downloaded. Its fingerprint must be independently confirmed with the intended signer.');
    }catch(error){setStatus(error instanceof Error?error.message:'Cannot export public-key card.');}
  }
  async function signFile(file?:File){
    if(!file)return;
    if(!identity){setStatus('Generate or restore a private key before signing.');return;}
    if(file.size>SIGNED_LIMIT){setStatus('Unsigned capsule is too large.');return;}
    setBusy(true);setStatus('');setSignedName('');
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const signed=await signCapsule(parsed,identity,label,globalThis.crypto?.subtle);
      downloadFile(JSON.stringify(signed,null,2)+'\n',
        'signed-'+(signed.statement.capsule.payload.auditPacket.case.id||'case').toLowerCase()+'.json',
        'application/json');
      setSignedName(file.name);
      setStatus('Signature created over the complete validated capsule and signer metadata. The private key stayed in this browser session.');
    }catch(error){setStatus(error instanceof Error?error.message:'Capsule signing failed.');}
    finally{setBusy(false);}
  }
  async function verifyFile(file?:File){
    if(!file)return;
    setCheckedName(file.name);setVerification(null);setBusy(true);setStatus('');
    if(file.size>SIGNED_LIMIT){setStatus('Signed capsule exceeds the size limit.');setBusy(false);return;}
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const outcome=await verifySignedCapsule(parsed,pinned.trim().toLowerCase(),globalThis.crypto?.subtle) as VerifyResult;
      setVerification(outcome);
      setStatus(outcome.ok?'Signature and inner capsule checks passed. Human identity and historical claims remain unverified.':
        'Signed capsule did not pass all integrity or fingerprint checks.');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not verify signed capsule.');}
    finally{setBusy(false);}
  }
  return <section className="content-page signing-page">
    <div className="eyebrow">CASE {caseFile.id} / RESEARCHER-CONTROLLED SIGNATURES</div>
    <h1 className="trace-page-title">Capsule Signatures.</h1>
    <p className="trace-deck">Sign an existing MK11 Case Capsule using an **ECDSA P-256 private key** generated in your browser. Verify signatures against an independently trusted public-key fingerprint. A valid signature proves control of a key, <strong>not who the human signer is or whether a historical claim is true.</strong></p>
    <div className="signing-stats">
      <div><strong>{identity?'KEY ACTIVE':'NO KEY'}</strong><span>IN-MEMORY SIGNING IDENTITY</span></div>
      <div><strong>P-256</strong><span>ECDSA / SHA-256</span></div>
      <div><strong>LOCAL</strong><span>PRIVATE KEY NEVER UPLOADED</span></div>
      <div><strong>NO AUTO-TRUST</strong><span>INDEPENDENT FINGERPRINT REQUIRED</span></div>
    </div>
    {!secure&&<div className="signing-warning" role="alert">This browser does not expose WebCrypto. Use HTTPS with a modern browser to sign or verify capsules.</div>}
    <div className="signing-layout">
      <div className="signing-workspace">
        <div className="eyebrow">STEP 01 / KEY GENERATION AND BACKUP</div>
        <h2>Your browser signing identity</h2>
        <p>A keypair exists only in memory during this visit. It is not automatically saved to localStorage or a remote server. An encrypted backup is the way to restore it after closing the page.</p>
        <button className="signing-primary" disabled={busy||!secure} onClick={()=>{void generate();}}>
          {identity?'Generate replacement key':'Generate a new signing key'}
        </button>
        <div className="signing-fingerprint">
          <span>PUBLIC KEY SHA-256 FINGERPRINT (SPKI)</span>
          <code>{fingerprint}</code>
          <p>Share and confirm this fingerprint through an independent trusted channel. The signer label below is only self-reported.</p>
        </div>
        <button onClick={exportPublic} disabled={!identity||busy}>Export public-key card</button>
        <div className="signing-divider"/>
        <h3>Encrypt and back up your private key</h3>
        <p>Use a unique 12+ character passphrase. The backup uses PBKDF2-SHA-256 with 310,000 iterations and AES-256-GCM. Store the encrypted file separately from your passphrase. Losing both the active key and your backup means losing the ability to sign with this identity.</p>
        <label>Backup passphrase
          <input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters" disabled={busy||!identity}/>
        </label>
        <button onClick={()=>{void backup();}} disabled={!identity||busy||password.length<12}>Export encrypted private-key backup</button>
        <div className="signing-divider"/>
        <h3>Restore an encrypted key</h3>
        <label>Backup passphrase
          <input type="password" autoComplete="off" value={backupPassword} onChange={e=>setBackupPassword(e.target.value)} placeholder="Passphrase for the encrypted backup" disabled={busy}/>
        </label>
        <label className="signing-file">Select encrypted key JSON
          <input type="file" accept=".json,application/json" disabled={busy||!secure||!backupPassword}
            onChange={e=>{void importBackup(e.target.files?.[0]);e.target.value='';}}/>
        </label>
        <p className="signing-help">The backup is encrypted before downloading. Passphrases are cleared from the form after each backup or restoration attempt, and not written to localStorage.</p>
      </div>
      <div className="signing-workspace">
        <div className="eyebrow">STEP 02 / SIGN A VALIDATED CASE CAPSULE</div>
        <h2>Attach a cryptographic signature</h2>
        <p>First export a capsule in the <strong>Case capsule</strong> sidebar page. The complete MK11 capsule and the signer’s label, public key and signing time are covered by the signature. The original unsigned capsule remains unchanged.</p>
        <label>Self-reported signer label
          <input maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} disabled={busy} placeholder="A researcher name or pseudonym"/>
        </label>
        <label className={'signing-file'+(!identity?' disabled':'')}>Choose an unsigned MK11 capsule to sign
          <input type="file" accept=".json,application/json" disabled={busy||!identity||!secure}
            onChange={e=>{void signFile(e.target.files?.[0]);e.target.value='';}}/>
        </label>
        {signedName&&<p className="signing-help">Last source capsule signed: {signedName}</p>}
        <div className="signing-disclaimer"><strong>What a signature means:</strong> A verifier can confirm that the holder of the private key signed the complete capsule. It does not prove that the labeled person owns that key. Key theft, self-issued keys and incorrect source claims remain possible.</div>
      </div>
    </div>
    <div className="signing-verifier">
      <div>
        <div className="eyebrow">STEP 03 / INDEPENDENT VERIFICATION</div>
        <h2>Check a signed research capsule</h2>
        <p>Verification checks the ECDSA signature, embedded key fingerprint and the original MK11 capsule's hash and evidence structure. To establish that this is the key you expected, paste a trusted fingerprint obtained separately from the signed file.</p>
        <label>Expected public-key fingerprint (optional, independently verified)
          <input value={pinned} maxLength={64} spellCheck={false} autoCapitalize="off"
            onChange={e=>{setPinned(e.target.value.trim());setVerification(null);}}
            placeholder="64-character SHA-256 fingerprint"/>
        </label>
        <label className="signing-file">Choose a signed capsule JSON to verify
          <input type="file" accept=".json,application/json" disabled={busy||!secure}
            onChange={e=>{void verifyFile(e.target.files?.[0]);e.target.value='';}}/>
        </label>
        {checkedName&&<p className="signing-help">Last checked: {checkedName}</p>}
      </div>
      <div>
        {verification?<div className={'signing-verification '+(verification.ok?'pass':'fail')}>
          <strong>{verification.ok?'Cryptographic checks passed':'Signed capsule verification failed'}</strong>
          <div><span>ECDSA SIGNATURE</span><b>{verification.signatureValid?'Valid for included public key':'Not valid'}</b></div>
          <div><span>INNER CASE CAPSULE</span><b>{verification.capsuleValid?'Internally valid':'Invalid'}</b></div>
          <div><span>TRUSTED FINGERPRINT</span><b>{verification.keyMatchesPinned===true?'Matches expected key':verification.keyMatchesPinned===false?'Does not match expected key':'Not checked: author identity unverified'}</b></div>
          <div><span>SELF-REPORTED SIGNER</span><b>{verification.signerLabel||'Unavailable'}</b></div>
          <div><span>CASE IN PACKAGE</span><b>{verification.caseId||'Unavailable'}</b></div>
          <div className="signing-key-value"><span>PUBLIC KEY FINGERPRINT</span><code>{verification.keyFingerprint||'Unavailable'}</code></div>
          {verification.errors.length>0&&<ul>{verification.errors.map((error,i)=><li key={i}>{error}</li>)}</ul>}
        </div>:<div className="signing-verifier-empty">No signed capsule inspected yet. Verification reads files locally and never imports, overwrites or alters your Atlas research.</div>}
      </div>
    </div>
    {status&&<div role="status" className="signing-message">{status}</div>}
    <div className="signing-footer"><strong>No automated trust or historical verdict.</strong> A signed packet can still be false, incomplete, intentionally misleading or signed by an unknown person. Verify the public-key fingerprint through an independent channel and inspect the original documents before relying on a conclusion. Private keys and passphrases are never transmitted by this tool.</div>
  </section>;
}
