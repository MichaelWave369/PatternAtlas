import {useState} from 'react';
import type {CaseFile} from './types';
import {downloadFile} from './handlingStorage';
import {decryptIdentity,encryptIdentity,generateIdentity,SIGNED_LIMIT} from './signingCore.mjs';
import {
  ROTATION_FORMAT,REVOCATION_FORMAT,CONTINUITY_FORMAT,
  issueRotation,issueRevocation,inspectRotation,inspectRevocation,
  inspectContinuity,continuityBundle,reviewSignedWithContinuity,
  MAX_ROTATIONS,MAX_REVOCATIONS
} from './continuityCore.mjs';
type Identity={keys:CryptoKeyPair;publicKey:{kty:string;crv:string;x:string;y:string};fingerprint:string};
type KeyNotice={format:string;statement:{previousFingerprint?:string;nextFingerprint?:string;fingerprint?:string};};
type Chain={ok:boolean;errors:string[];rootVerified:boolean;keys:string[];
  currentFingerprint:string|null;historical:string[];revoked:string[];
  rotationCount:number;revocationCount:number};
type SignedReview={currentUseAccepted:boolean;signatureValid:boolean;capsuleValid:boolean;
  chainValid:boolean;inChain:boolean;isCurrent:boolean;selfRevoked:boolean;
  keyFingerprint:string|null;currentFingerprint:string|null;caseId:string|null;
  signerLabel:string|null;warnings:string[];errors:string[]};
const SHORT=(fp:string)=>fp.slice(0,16)+'…'+fp.slice(-10);
function LabelledKey({value,label}:{value:string;label:string}){
  return <div className="continuity-key"><span>{label}</span><code>{value||'Not loaded'}</code></div>;
}
export default function KeyContinuity({caseFile}:{caseFile:CaseFile}) {
  const [previous,setPrevious]=useState<Identity|null>(null);
  const [next,setNext]=useState<Identity|null>(null);
  const [previousPass,setPreviousPass]=useState('');
  const [newPass,setNewPass]=useState('');
  const [nextBackedUp,setNextBackedUp]=useState(false);
  const [rotationReason,setRotationReason]=useState('Routine planned replacement; preserve prior signed capsules for historical review.');
  const [revocationReason,setRevocationReason]=useState('');
  const [root,setRoot]=useState('');
  const [rotations,setRotations]=useState<KeyNotice[]>([]);
  const [revocations,setRevocations]=useState<KeyNotice[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [chain,setChain]=useState<Chain|null>(null);
  const [review,setReview]=useState<SignedReview|null>(null);
  const [signedFilename,setSignedFilename]=useState('');
  const ready=!!globalThis.crypto?.subtle;

  async function readPrevious(file?:File){
    if(!file)return;
    if(file.size>16000){setMessage('Encrypted private-key backup exceeds 16 KB.');return;}
    if(!previousPass){setMessage('Enter the existing key backup passphrase first.');return;}
    if(previous&&!window.confirm('Replace the loaded old signing key? Preserve its backup separately.'))return;
    setBusy(true);setMessage('');
    try{
      const value:unknown=JSON.parse(await file.text());
      const id=await decryptIdentity(value,previousPass,globalThis.crypto?.subtle) as Identity;
      setPrevious(id);setMessage('Existing signing key restored in memory. Independently confirm its fingerprint.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not restore old key.');}
    finally{setPreviousPass('');setBusy(false);}
  }
  async function generateNext(){
    if(next&&!window.confirm('Replace the unsaved next key? Save its encrypted backup before replacing it.'))return;
    setBusy(true);setMessage('');setNextBackedUp(false);
    try{
      const id=await generateIdentity(globalThis.crypto?.subtle) as Identity;
      setNext(id);
      setMessage('Replacement P-256 key created in memory. Export an encrypted backup before issuing the rotation.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not create replacement key.');}
    finally{setBusy(false);}
  }
  async function backupNext(){
    if(!next||busy)return;
    setBusy(true);setMessage('');
    try{
      const backup=await encryptIdentity(next,newPass,globalThis.crypto?.subtle,globalThis.crypto);
      downloadFile(JSON.stringify(backup,null,2)+'\n','pattern-atlas-new-key-encrypted-'+next.fingerprint.slice(0,10)+'.json','application/json');
      setNextBackedUp(true);
      setMessage('Encrypted replacement-key backup downloaded. Confirm independent, secure retention before using the new identity.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not create encrypted replacement backup.');}
    finally{setNewPass('');setBusy(false);}
  }
  async function rotate(){
    if(!previous||!next||!nextBackedUp)return;
    setBusy(true);setMessage('');
    try{
      const certificate=await issueRotation(previous,next,rotationReason,globalThis.crypto?.subtle);
      downloadFile(JSON.stringify(certificate,null,2)+'\n',
        'pattern-atlas-key-rotation-'+next.fingerprint.slice(0,12)+'.json','application/json');
      setMessage('Dual-signed rotation notice exported. Distribute it with an independently known old-key fingerprint. Import the new encrypted key in Capsule signatures to sign future capsules.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not issue rotation.');}
    finally{setBusy(false);}
  }
  async function revoke(){
    if(!previous)return;
    if(!window.confirm('Create a SELF-SIGNED revocation warning for the loaded key? This does not contact reviewers, delete the key, or automatically revoke old signatures.'))return;
    setBusy(true);setMessage('');
    try{
      const notice=await issueRevocation(previous,revocationReason,globalThis.crypto?.subtle);
      downloadFile(JSON.stringify(notice,null,2)+'\n',
        'pattern-atlas-key-revocation-'+previous.fingerprint.slice(0,12)+'.json','application/json');
      setMessage('Signed self-revocation notice downloaded. Publish it through a channel reviewers already trust. Old signatures are not automatically invalidated.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not issue revocation notice.');}
    finally{setBusy(false);}
  }
  async function loadEvidence(files?:FileList|null){
    if(!files?.length)return;
    setBusy(true);setMessage('');setChain(null);setReview(null);
    try{
      let newRot=[...rotations],newRev=[...revocations],added=0;
      for(const file of Array.from(files)){
        if(file.size>300000)throw Error('A key notice exceeds 300 KB.');
        const parsed:any=JSON.parse(await file.text());
        if(parsed?.format===CONTINUITY_FORMAT){
          if(!Array.isArray(parsed.rotations)||!Array.isArray(parsed.revocations))throw Error('Invalid continuity bundle.');
          newRot=[...parsed.rotations];newRev=[...parsed.revocations];added+=newRot.length+newRev.length;
          // The embedded root is NOT automatically adopted as trusted.
        }else if(parsed?.format===ROTATION_FORMAT){
          const check=await inspectRotation(parsed,globalThis.crypto?.subtle);
          if(!check.ok)throw Error('Invalid rotation notice: '+check.errors.join('; '));
          newRot.push(parsed);added++;
        }else if(parsed?.format===REVOCATION_FORMAT){
          const check=await inspectRevocation(parsed,globalThis.crypto?.subtle);
          if(!check.ok)throw Error('Invalid revocation notice: '+check.errors.join('; '));
          newRev.push(parsed);added++;
        }else throw Error('File is not an MK13 rotation, revocation, or continuity bundle.');
        if(newRot.length>MAX_ROTATIONS||newRev.length>MAX_REVOCATIONS)
          throw Error('Review limit: 12 rotations or 20 revocations.');
      }
      setRotations(newRot);setRevocations(newRev);
      setMessage('Loaded '+added+' continuity record(s) for review. Confirm your trusted root separately and run the chain check.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not load key notices.');}
    finally{setBusy(false);}
  }
  async function evaluate(){
    setBusy(true);setChain(null);setReview(null);setMessage('');
    try{
      const bundle=continuityBundle(root.trim().toLowerCase(),rotations,revocations);
      const outcome=await inspectContinuity(bundle,root.trim().toLowerCase(),globalThis.crypto?.subtle) as Chain;
      setChain(outcome);
      setMessage(outcome.ok?'Key lineage and signed notices are internally valid against your supplied root. Human identity and dates remain unverified.':
        'Trust-chain validation failed. Inspect the errors before relying on the key lineage.');
    }catch(error){setMessage(error instanceof Error?error.message:'Cannot verify trust chain.');}
    finally{setBusy(false);}
  }
  function exportBundle(){
    try{
      const bundle=continuityBundle(root.trim().toLowerCase(),rotations,revocations);
      downloadFile(JSON.stringify(bundle,null,2)+'\n',
        'pattern-atlas-key-continuity-'+bundle.rootFingerprint.slice(0,12)+'.json','application/json');
      setMessage('Portable continuity records exported. The included root is not itself independently authenticated.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not export continuity records.');}
  }
  async function checkSigned(file?:File){
    if(!file)return;
    if(file.size>SIGNED_LIMIT){setMessage('Signed capsule exceeds size limit.');return;}
    setSignedFilename(file.name);setBusy(true);setReview(null);setMessage('');
    try{
      const signed:unknown=JSON.parse(await file.text());
      const bundle=continuityBundle(root.trim().toLowerCase(),rotations,revocations);
      const result=await reviewSignedWithContinuity(signed,bundle,root.trim().toLowerCase(),globalThis.crypto?.subtle) as SignedReview;
      setReview(result);
      setMessage(result.currentUseAccepted?'Capsule signature belongs to the current, non-revoked key of the reviewed lineage. Source claims still require investigation.':
        'This signed capsule is not accepted as current-key use under the reviewed continuity evidence.');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to review signed capsule.');}
    finally{setBusy(false);}
  }
  return <section className="content-page continuity-page">
    <div className="eyebrow">CASE {caseFile.id} / SIGNING KEY CONTINUITY</div>
    <h1 className="trace-page-title">Key Continuity.</h1>
    <p className="trace-deck">Rotate researcher signing keys with <strong>two-key authorization</strong>, publish signed self-revocation notices, and review signed capsules against an independently known root fingerprint. All keys and file processing remain local. No automatic trust, revocation network or certified timestamps.</p>
    <div className="continuity-stats">
      <div><strong>{previous?'LOADED':'NONE'}</strong><span>PRIOR KEY · VOLATILE</span></div>
      <div><strong>{next?'READY':'NONE'}</strong><span>REPLACEMENT KEY · VOLATILE</span></div>
      <div><strong>{rotations.length}</strong><span>ROTATION NOTICES IN REVIEW</span></div>
      <div><strong>{revocations.length}</strong><span>REVOCATION NOTICES IN REVIEW</span></div>
    </div>
    {!ready&&<p className="continuity-warning">This browser lacks secure-context WebCrypto. Use HTTPS on a modern browser.</p>}
    <div className="continuity-grid">
      <div className="continuity-panel">
        <div className="eyebrow">STEP 01 · ROTATE A SIGNING KEY</div>
        <h2>Restore the previous key</h2>
        <p>Load its existing MK12 encrypted key backup. Neither the passphrase nor private key is saved in Atlas browser storage.</p>
        <label>Old backup passphrase<input type="password" autoComplete="off" value={previousPass}
          disabled={busy} onChange={e=>setPreviousPass(e.target.value)}/></label>
        <label className="continuity-file">Choose encrypted old-key backup
          <input type="file" accept=".json,application/json" disabled={busy||!ready||!previousPass}
            onChange={e=>{void readPrevious(e.target.files?.[0]);e.target.value='';}}/></label>
        <LabelledKey label="PREVIOUS KEY SHA-256 / SPKI" value={previous?.fingerprint||''}/>
        <div className="continuity-rule"/>
        <h2>Create and back up the replacement</h2>
        <button onClick={()=>{void generateNext();}} disabled={busy||!ready}>Generate a new P-256 key</button>
        <LabelledKey label="REPLACEMENT KEY SHA-256 / SPKI" value={next?.fingerprint||''}/>
        <label>New backup passphrase (12+ characters)<input type="password" autoComplete="new-password"
          value={newPass} disabled={busy||!next} onChange={e=>setNewPass(e.target.value)}/></label>
        <button disabled={busy||!next||newPass.length<12}
          onClick={()=>{void backupNext();}}>Export encrypted replacement backup</button>
        <p className="continuity-help">{nextBackedUp?'Encrypted backup was exported this session. Keep it secure.':'Rotation export stays disabled until the replacement backup has been exported.'}</p>
        <label>Rotation rationale (20+ characters)<textarea rows={3} maxLength={1200}
          value={rotationReason} disabled={busy} onChange={e=>setRotationReason(e.target.value)}/></label>
        <button className="continuity-primary" disabled={busy||!previous||!next||!nextBackedUp}
          onClick={()=>{void rotate();}}>Export dual-signed rotation certificate</button>
        <p className="continuity-help">The previous and replacement private keys both sign the exact same statement. Exporting does not automatically change the key in the MK12 signing page. Restore the replacement backup there when ready.</p>
      </div>
      <div className="continuity-panel">
        <div className="eyebrow">STEP 02 · ISSUE A REVOCATION WARNING</div>
        <h2>Self-revoke the loaded key</h2>
        <p>Uses the <strong>previous key</strong> loaded on the left. The notice is signed by that key, which might also be compromised. It must be published and checked independently by reviewers.</p>
        <LabelledKey label="KEY COVERED BY THIS NOTICE" value={previous?.fingerprint||''}/>
        <label>Reason for retiring or distrust (20+ characters)<textarea value={revocationReason}
          maxLength={1200} rows={4} disabled={busy} onChange={e=>setRevocationReason(e.target.value)}
          placeholder="This key may have been exposed. Do not accept new signatures without independently verifying the replacement key."/></label>
        <button disabled={busy||!previous||revocationReason.trim().length<20}
          onClick={()=>{void revoke();}}>Export signed self-revocation notice</button>
        <div className="continuity-warning"><strong>A notice is not a broadcast.</strong> Other researchers won't learn about revocation unless you distribute it through a channel they check. It also does not automatically invalidate signatures produced before the notice, particularly without trusted signing and publication timestamps.</div>
        <div className="continuity-rule"/>
        <h3>Recommended handling</h3>
        <p>Keep signed capsules already published, retain independently preserved old-key fingerprints, and communicate the new fingerprint and rotation document through a separately trusted channel. If the old key was stolen, a dual-signed rotation is not reliable evidence of an authorized transition by itself.</p>
      </div>
    </div>
    <div className="continuity-review">
      <div className="eyebrow">STEP 03 · REVIEW KEY LINEAGE AGAINST AN INDEPENDENT TRUST ANCHOR</div>
      <h2>Verify rotation and revocation documents</h2>
      <p>The root fingerprint must come from a source you already trust. A continuity bundle can carry its own root field, but <strong>that field is not an authorization to trust it</strong>. Upload ordered notices and verify their signatures and linkage before using the newest key.</p>
      <label>Independently trusted root fingerprint (64 hex characters)
        <input value={root} maxLength={64} spellCheck={false} autoCapitalize="off"
          onChange={e=>{setRoot(e.target.value.trim().toLowerCase());setChain(null);setReview(null);}}
          placeholder="Previously confirmed P-256 public-key SPKI fingerprint"/></label>
      <label className="continuity-file">Load rotation/revocation JSON or continuity bundle
        <input type="file" accept=".json,application/json" multiple disabled={busy||!ready}
          onChange={e=>{void loadEvidence(e.target.files);e.target.value='';}}/></label>
      <div className="continuity-tools">
        <button disabled={busy} onClick={()=>{setRotations([]);setRevocations([]);setChain(null);setReview(null);setMessage('Review evidence cleared. Your signing keys were not changed.');}}>Clear review records</button>
        <button disabled={busy||root.length!==64} onClick={exportBundle}>Export review bundle</button>
        <button className="continuity-primary" disabled={busy||root.length!==64}
          onClick={()=>{void evaluate();}}>Verify trust lineage</button>
      </div>
      <p className="continuity-help">Imported rotation order matters. Records are not automatically sorted by self-reported timestamps. Up to {MAX_ROTATIONS} rotations and {MAX_REVOCATIONS} self-revocation notices; nothing is saved to localStorage.</p>
      {chain&&<div className={'continuity-chain '+(chain.ok?'pass':'fail')}>
        <strong>{chain.ok?'Key lineage cryptographically consistent with pinned root':'Key lineage cannot be accepted'}</strong>
        <div><span>Trusted root checked</span><b>{chain.rootVerified?'Matches supplied independent fingerprint':'Missing or mismatched'}</b></div>
        <div><span>Currently declared key</span><code>{chain.currentFingerprint||'Unavailable'}</code></div>
        <div><span>Earlier keys in sequence</span><b>{chain.historical.length}</b></div>
        <div><span>Keys with signed revocation notices</span><b>{chain.revoked.length}</b></div>
        {chain.revoked.length>0&&<p className="continuity-warning">Self-revoked: {chain.revoked.map(SHORT).join(' · ')}. A self-reported revocation date is not a certified cutoff for older signatures.</p>}
        {chain.errors.length>0&&<ul>{chain.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>}
      </div>}
      <div className="continuity-rule"/>
      <h3>Check a signed MK12 capsule against the lineage</h3>
      <label className="continuity-file">Choose signed capsule JSON
        <input type="file" accept=".json,application/json" disabled={busy||!ready||root.length!==64}
          onChange={e=>{void checkSigned(e.target.files?.[0]);e.target.value='';}}/></label>
      {signedFilename&&<p className="continuity-help">Last examined: {signedFilename}</p>}
      {review&&<div className={'continuity-chain '+(review.currentUseAccepted?'pass':'fail')}>
        <strong>{review.currentUseAccepted?'Matches current non-revoked key lineage':'Not accepted as current-key use'}</strong>
        <div><span>Underlying capsule and signature</span><b>{review.signatureValid&&review.capsuleValid?'Valid cryptographic checks':'Failed one or more checks'}</b></div>
        <div><span>Lineage from independently pinned root</span><b>{review.chainValid?'Valid':'Invalid / not anchored'}</b></div>
        <div><span>Signer appears in lineage</span><b>{review.inChain?'Yes':'No'}</b></div>
        <div><span>Signer key currently selected</span><b>{review.isCurrent?'Yes':'No'}</b></div>
        <div><span>Signed self-revocation for this key</span><b>{review.selfRevoked?'Exists':'None provided'}</b></div>
        <div><span>Signed capsule case</span><b>{review.caseId||'Unknown'}</b></div>
        {review.warnings.map((warning,i)=><p key={i}>{warning}</p>)}
        {review.errors.map((error,i)=><p key={'e'+i}>{error}</p>)}
      </div>}
    </div>
    {message&&<p className="continuity-message" role="status">{message}</p>}
    <div className="continuity-footer"><strong>Explicit limits:</strong> All signatures prove only control of private keys. A chain cannot confirm real-world identity, prevent key theft, certify historical signing timestamps or prove document truth. Revocation notices are self-signed warnings, not a centralized, automatically propagated or retroactively enforceable revocation service. Verify independent root identity, publication and source documents before making trust decisions.</div>
  </section>;
}
