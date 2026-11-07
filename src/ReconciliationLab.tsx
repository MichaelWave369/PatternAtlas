import {useMemo,useState} from 'react';
import type {CaseFile} from './types';
import seedsRaw from './data/reconciliationSeeds.json';
import {
  seedForCase,listInvoices,listEntries,examineMetadata,parseMoney,displayMoney,
  entryFingerprint,emptyReconciliation,validateReconciliation,EVIDENCE_KINDS,REVIEW_STATUSES
} from './reconciliationCore.mjs';
import {
  loadReconciliation,saveReconciliation,deleteReconciliation,exportRecon,exportReconMemo,backupRecon
} from './reconciliationStorage';
import type {
  ReconciliationInvoice,ReconciliationEntry,ReconciliationBundle,ReconciliationSeed,
  ReconciliationReview,InspectionStatus
} from './reconciliationStorage';

const statusLabel:Record<InspectionStatus,string>={
 'not-reviewed':'Not reviewed',
 'manually-inspected':'Manually inspected (researcher entry)',
 'needs-follow-up':'Needs more evidence'
};
const invoiceEmpty=(sourceId:string)=>({
 invoiceNo:'',sourceId,date:'',amount:'',currency:'USD',vendor:'',payer:'',description:''
});
const entryEmpty=()=>({
 date:'',amount:'',currency:'USD',payee:'',invoiceNoObserved:'',kind:'secondary-report',
 sourceId:'',url:'',locator:'',note:''
});
type InvoiceFields=ReturnType<typeof invoiceEmpty>;
type EntryFields=ReturnType<typeof entryEmpty>;
const defaultReview=()=>({status:'not-reviewed' as InspectionStatus,note:'',evidenceUrl:''});
type ReviewDraft=ReturnType<typeof defaultReview>;
const shortHost=(link:string)=>{
 try{return new URL(link).hostname;}catch{return 'Unlisted document host';}
};

export default function ReconciliationLab({caseFile}:{caseFile:CaseFile}) {
 const seed=useMemo(()=>seedForCase(seedsRaw,caseFile) as ReconciliationSeed,[caseFile]);
 const [initial]=useState(()=>loadReconciliation(caseFile,seed));
 const [bundle,setBundle]=useState<ReconciliationBundle>(initial.bundle);
 const [locked,setLocked]=useState(initial.locked);
 const [warning,setWarning]=useState(initial.warning);
 const [message,setMessage]=useState('');
 const invoices=listInvoices(bundle,seed) as ReconciliationInvoice[];
 const entries=listEntries(bundle,seed) as ReconciliationEntry[];
 const [invoiceId,setInvoiceId]=useState<string>(seed.invoices[0]?.id||'');
 const invoice=invoices.find((i)=>i.id===invoiceId)||null;
 const candidates=entries.filter((e)=>e.invoiceId===invoiceId);
 const [entryId,setEntryId]=useState<string>(seed.entries[0]?.id||'');
 const selectedEntry=candidates.find((e)=>e.id===entryId)||null;
 const [invoiceForm,setInvoiceForm]=useState<InvoiceFields>(()=>invoiceEmpty(caseFile.sources[0]?.id||''));
 const [entryForm,setEntryForm]=useState<EntryFields>(entryEmpty);
 const [showInvoice,setShowInvoice]=useState(false);
 const [showEntry,setShowEntry]=useState(false);
 const [reviewForm,setReviewForm]=useState<ReviewDraft>(defaultReview);
 const review=selectedEntry?bundle.reviews[selectedEntry.id]:undefined;
 const comparison=invoice&&selectedEntry?examineMetadata(invoice,selectedEntry):null;
 const inspected=Object.values(bundle.reviews).filter((r)=>r.status==='manually-inspected').length;
 const pending=entries.length-inspected;
 const selectedSource=invoice?caseFile.sources.find((s)=>s.id===invoice.sourceId):undefined;
 const entrySource=selectedEntry?.sourceId?caseFile.sources.find((s)=>s.id===selectedEntry.sourceId):undefined;

 function putInvoice<K extends keyof InvoiceFields>(key:K,value:InvoiceFields[K]){
  setInvoiceForm((old)=>({...old,[key]:value}));
 }
 function putEntry<K extends keyof EntryFields>(key:K,value:EntryFields[K]){
  setEntryForm((old)=>({...old,[key]:value}));
 }
 function persist(next:ReconciliationBundle) {
  if(locked){setMessage('Existing records are protected. Export the raw recovery file and explicitly reset first.');return false;}
  const result=saveReconciliation(caseFile,seed,next);
  setMessage(result.message);
  if(result.ok){setBundle(next);return true;}
  return false;
 }
 function pickInvoice(id:string) {
  setInvoiceId(id);
  const first=entries.find((e)=>e.invoiceId===id);
  setEntryId(first?.id||'');
  const saved=first?bundle.reviews[first.id]:undefined;
  setReviewForm(saved?{status:saved.status,note:saved.note,evidenceUrl:saved.evidenceUrl}:defaultReview());
  setMessage('');
 }
 function pickEntry(id:string){
  setEntryId(id);const saved=bundle.reviews[id];
  setReviewForm(saved?{status:saved.status,note:saved.note,evidenceUrl:saved.evidenceUrl}:defaultReview());
  setMessage('');
 }
 function createInvoice(){
  const amount=parseMoney(invoiceForm.amount);
  if(amount===null){setMessage('Enter a valid nonnegative amount with at most two decimal places.');return;}
  const record:ReconciliationInvoice={
   id:'inv:'+crypto.randomUUID(),
   sourceId:invoiceForm.sourceId,invoiceNo:invoiceForm.invoiceNo.trim(),
   date:invoiceForm.date,amountCents:amount,currency:invoiceForm.currency.toUpperCase(),
   vendor:invoiceForm.vendor.trim(),payer:invoiceForm.payer.trim(),description:invoiceForm.description.trim()
  };
  const next={...bundle,invoices:[...bundle.invoices,record]};
  if(persist(next)){pickInvoice(record.id);setShowInvoice(false);setInvoiceForm(invoiceEmpty(caseFile.sources[0]?.id||''));}
 }
 function createEntry(){
  if(!invoice){setMessage('Add or select a source-linked invoice first.');return;}
  const amount=parseMoney(entryForm.amount);
  if(amount===null){setMessage('Enter a valid numeric amount with at most two decimal places.');return;}
  const e:ReconciliationEntry={
   id:'entry:'+crypto.randomUUID(),invoiceId:invoice.id,
   date:entryForm.date,amountCents:amount,currency:entryForm.currency.toUpperCase(),
   payee:entryForm.payee.trim(),invoiceNoObserved:entryForm.invoiceNoObserved.trim(),
   kind:entryForm.kind,sourceId:entryForm.sourceId,url:entryForm.url.trim(),
   locator:entryForm.locator.trim(),note:entryForm.note.trim()
  };
  const next={...bundle,entries:[...bundle.entries,e]};
  if(persist(next)){setEntryId(e.id);setReviewForm(defaultReview());setShowEntry(false);setEntryForm(entryEmpty());}
 }
 function saveReview(){
  if(!invoice||!selectedEntry)return;
  const record:ReconciliationReview={
   signature:entryFingerprint(selectedEntry,invoice,caseFile),
   status:reviewForm.status,note:reviewForm.note.trim(),evidenceUrl:reviewForm.evidenceUrl.trim(),
   updatedAt:new Date().toISOString()
  };
  persist({...bundle,reviews:{...bundle.reviews,[selectedEntry.id]:record}});
 }
 function deleteEntry(){
  if(!selectedEntry||!selectedEntry.id.startsWith('entry:'))return;
  if(!window.confirm('Delete this private candidate and its review notes? Export a backup first.'))return;
  const next={...bundle,entries:bundle.entries.filter((e)=>e.id!==selectedEntry.id),
   reviews:Object.fromEntries(Object.entries(bundle.reviews).filter(([id])=>id!==selectedEntry.id))};
  if(persist(next)){
   const first=(listEntries(next,seed) as ReconciliationEntry[]).find((e)=>e.invoiceId===invoiceId);
   setEntryId(first?.id||'');setReviewForm(defaultReview());
  }
 }
 function deleteInvoice(){
  if(!invoice||!invoice.id.startsWith('inv:'))return;
  if(!window.confirm('Delete this private invoice, its candidates, and review notes?'))return;
  const deleting=new Set(bundle.entries.filter((e)=>e.invoiceId===invoice.id).map((e)=>e.id));
  const next={...bundle,
   invoices:bundle.invoices.filter((i)=>i.id!==invoice.id),
   entries:bundle.entries.filter((e)=>e.invoiceId!==invoice.id),
   reviews:Object.fromEntries(Object.entries(bundle.reviews).filter(([id])=>!deleting.has(id)))};
  if(persist(next)){pickInvoice(seed.invoices[0]?.id||next.invoices[0]?.id||'');}
 }
 function reset(){
  if(!window.confirm('Delete all private transaction candidates, invoices and reviews for this case? Export before resetting.'))return;
  if(!deleteReconciliation(caseFile)){setMessage('Browser storage could not be cleared.');return;}
  const blank=emptyReconciliation(caseFile) as ReconciliationBundle;
  setBundle(blank);setLocked(false);setWarning('');setMessage('Private reconciliation workspace cleared.');
  setInvoiceId(seed.invoices[0]?.id||'');setEntryId(seed.entries[0]?.id||'');setReviewForm(defaultReview());
 }
 async function importData(file?:File){
  if(!file)return;
  if(locked){setMessage('Existing stored data is protected. Back it up and reset before importing.');return;}
  if(file.size>450000){setMessage('Import rejected: the file exceeds 450 KB.');return;}
  try{
   const parsed:unknown=JSON.parse(await file.text());
   const valid=validateReconciliation(parsed,caseFile,seed);
   if(!valid.ok){setMessage('Import rejected: '+valid.errors.slice(0,3).join(' '));return;}
   if((bundle.invoices.length||bundle.entries.length||Object.keys(bundle.reviews).length)&&
       !window.confirm('Replace the local reconciliation work for this case? Export your current copy first.'))return;
   const imported=parsed as ReconciliationBundle;
   if(persist(imported)){
    const firstInv=seed.invoices[0]?.id||imported.invoices[0]?.id||'';
    const firstEntry=(listEntries(imported,seed) as ReconciliationEntry[]).find((e)=>e.invoiceId===firstInv);
    setInvoiceId(firstInv);setEntryId(firstEntry?.id||'');
    const saved=firstEntry?imported.reviews[firstEntry.id]:undefined;
    setReviewForm(saved?{status:saved.status,note:saved.note,evidenceUrl:saved.evidenceUrl}:defaultReview());
   }
  }catch{setMessage('Import rejected: this is not a valid reconciliation JSON bundle.');}
 }
 return <section className="content-page recon-page">
  <div className="eyebrow">CASE {caseFile.id} / DOCUMENTARY ACCOUNTING</div>
  <h1 className="trace-page-title">Transaction Reconciliation Lab.</h1>
  <p className="trace-deck">Compare source-backed invoices to ledger *candidates* without declaring a payment settled just because amounts or names match. Each status is an investigator note, not a bank confirmation.</p>
  <div className="recon-stats">
   <div><strong>{invoices.length}</strong><span>INVOICE RECORDS</span></div>
   <div><strong>{entries.length}</strong><span>CANDIDATE ENTRIES</span></div>
   <div><strong>{inspected}</strong><span>RESEARCHER-INSPECTED</span></div>
   <div><strong>{pending}</strong><span>NOT MARKED INSPECTED</span></div>
  </div>
  <div className="recon-toolbar">
   <button onClick={()=>setShowInvoice(!showInvoice)} className="recon-primary" disabled={locked||!caseFile.sources.length}>+ Add private invoice</button>
   <div className="recon-exports">
    <button onClick={()=>exportRecon(bundle)} disabled={locked}>Export JSON</button>
    <button onClick={()=>exportReconMemo(bundle,caseFile,seed)} disabled={locked}>Export research memo</button>
    <label>Import JSON<input type="file" accept=".json,application/json" onChange={(e)=>{void importData(e.target.files?.[0]);e.target.value='';}} /></label>
   </div>
  </div>
  {warning&&<div role="alert" className="recon-warning"><strong>Stored research protected:</strong> {warning}
   {locked&&<div className="recon-recovery"><button onClick={()=>setMessage(backupRecon(caseFile)?'Recovery copy downloaded.':'Existing storage could not be read.')}>Download recovery file</button><button onClick={reset}>Reset after backup</button></div>}
  </div>}
  {message&&<p className="recon-message" role="status">{message}</p>}
  {showInvoice&&<div className="recon-create">
   <div className="eyebrow">PRIVATE RECORD / SOURCE REQUIRED</div><h2>Add invoice metadata</h2>
   <div className="recon-form-grid">
    <label>Document from Evidence Ledger<select value={invoiceForm.sourceId} onChange={(e)=>putInvoice('sourceId',e.target.value)}>
     {caseFile.sources.map((s)=><option key={s.id} value={s.id}>{s.citation} · {s.title}</option>)}
    </select></label>
    <label>Invoice number (leave blank if absent)<input value={invoiceForm.invoiceNo} maxLength={180} onChange={(e)=>putInvoice('invoiceNo',e.target.value)} /></label>
    <label>Document date<input type="date" value={invoiceForm.date} onChange={(e)=>putInvoice('date',e.target.value)}/></label>
    <label>Amount in dollars<input inputMode="decimal" value={invoiceForm.amount} onChange={(e)=>putInvoice('amount',e.target.value)} placeholder="30000.00"/></label>
    <label>Currency (USD only in MK7)<input value="USD" disabled /></label>
    <label>Named issuing party<input value={invoiceForm.vendor} maxLength={180} onChange={(e)=>putInvoice('vendor',e.target.value)} /></label>
    <label>Named billed party<input value={invoiceForm.payer} maxLength={180} onChange={(e)=>putInvoice('payer',e.target.value)} /></label>
    <label className="recon-wide">Description and evidence limit<textarea rows={3} maxLength={2000} value={invoiceForm.description} onChange={(e)=>putInvoice('description',e.target.value)} placeholder="An invoice is not a receipt or proof of delivery." /></label>
   </div><button className="recon-primary" onClick={createInvoice} disabled={locked}>Save private invoice</button>
  </div>}
  <div className="recon-layout">
   <aside className="recon-list"><div className="eyebrow">DOCUMENT INVENTORY</div>
    {invoices.map((item)=><button key={item.id} className={'recon-invoice-item'+(item.id===invoiceId?' active':'')} onClick={()=>pickInvoice(item.id)}>
     <span>{item.id.startsWith('seed:')?'CURATED SOURCE':'PRIVATE SOURCE ENTRY'}</span>
     <strong>{item.invoiceNo?'Invoice '+item.invoiceNo:'Invoice number not shown'}</strong>
     <small>{item.date} · {displayMoney(item.amountCents,item.currency)}</small>
     <small>{item.vendor}</small>
    </button>)}
    {invoices.length===0&&<div className="empty-state">No invoice records. Add an invoice cited by your case's Evidence Ledger.</div>}
   </aside>
   <div className="recon-main">
    {invoice?<><div className="recon-titleline">
      <div><div className="eyebrow">INVOICE / {invoice.id}</div><h2>{invoice.vendor} · {displayMoney(invoice.amountCents,invoice.currency)}</h2></div>
      {invoice.id.startsWith('inv:')&&<button className="recon-danger" onClick={deleteInvoice} disabled={locked}>Delete private invoice</button>}
    </div>
    <div className="recon-invoice-summary">
     <div><span>DOCUMENT DATE</span><strong>{invoice.date}</strong></div>
     <div><span>INVOICE NUMBER</span><strong>{invoice.invoiceNo||'Not shown'}</strong></div>
     <div><span>BILLED PARTY</span><strong>{invoice.payer}</strong></div>
     <div><span>DOCUMENT CITATION</span><strong>{selectedSource?.citation||invoice.sourceId}</strong></div>
    </div>
    <p className="recon-scope">{invoice.description}</p>
    {selectedSource&&<a href={selectedSource.url} className="recon-document-link" target="_blank" rel="noopener noreferrer">Inspect invoice source · {selectedSource.citation} ↗</a>}
    <div className="recon-candidate-header"><h3>Potential corresponding entries ({candidates.length})</h3>
      <button onClick={()=>setShowEntry(!showEntry)} disabled={locked} className="recon-primary">+ Add candidate</button>
    </div>
    {showEntry&&<div className="recon-create recon-entry-create"><div className="eyebrow">RESEARCHER-ENTERED DOCUMENTARY LEAD</div>
     <div className="recon-form-grid">
      <label>Reported transaction date<input type="date" value={entryForm.date} onChange={(e)=>putEntry('date',e.target.value)}/></label>
      <label>Reported amount<input inputMode="decimal" value={entryForm.amount} onChange={(e)=>putEntry('amount',e.target.value)} placeholder="30000.00" /></label>
      <label>Currency (USD only in MK7)<input value="USD" disabled /></label>
      <label>Payee text in source<input value={entryForm.payee} maxLength={180} onChange={(e)=>putEntry('payee',e.target.value)} placeholder="Do not assume it's the invoicing entity" /></label>
      <label>Invoice number explicitly printed (optional)<input value={entryForm.invoiceNoObserved} maxLength={180} onChange={(e)=>putEntry('invoiceNoObserved',e.target.value)} /></label>
      <label>Kind of cited record<select value={entryForm.kind} onChange={(e)=>putEntry('kind',e.target.value)}>
       {EVIDENCE_KINDS.map((k:string)=><option key={k} value={k}>{k.replace(/-/g,' ')}</option>)}
      </select></label>
      <label>Source from this case (optional)<select value={entryForm.sourceId} onChange={(e)=>putEntry('sourceId',e.target.value)}>
       <option value="">Other HTTPS source</option>{caseFile.sources.map((s)=><option key={s.id} value={s.id}>{s.citation}</option>)}
      </select></label>
      <label>HTTPS source or secondary research URL<input type="url" value={entryForm.url} maxLength={2048} onChange={(e)=>putEntry('url',e.target.value)} placeholder="https://..." /></label>
      <label>Archive locator, if known<input value={entryForm.locator} maxLength={220} onChange={(e)=>putEntry('locator',e.target.value)} placeholder="EFTA document ID, page, or exhibit" /></label>
      <label className="recon-wide">What the source actually reports and what remains unverified<textarea rows={4} value={entryForm.note} maxLength={4000} onChange={(e)=>putEntry('note',e.target.value)} /></label>
     </div><button className="recon-primary" onClick={createEntry} disabled={locked}>Save candidate without claiming payment</button>
    </div>}
    <div className="recon-candidate-tabs">
     {candidates.map((e)=><button key={e.id} className={e.id===entryId?'active':''} onClick={()=>pickEntry(e.id)}>
      <span>{e.id.startsWith('seed:')?'SECONDARY-REPORTED LEAD':'PRIVATE CANDIDATE'}</span>
      <strong>{e.date} · {displayMoney(e.amountCents,e.currency)}</strong>
     </button>)}
     {!candidates.length&&<div className="empty-state">No candidate transactions exist. A missing entry is not evidence of nonpayment; it means no corresponding source has been recorded here.</div>}
    </div>
    {selectedEntry&&comparison&&<div className="recon-evaluation">
      <div className="recon-eval-head"><h3>Metadata comparison</h3><span>No probability or automated settlement verdict</span></div>
      <div className="recon-compare-grid">
       <div><span>AMOUNT</span><strong>{comparison.amount==='same'?'Exact amount matches':'Different amounts'}</strong></div>
       <div><span>CURRENCY</span><strong>{comparison.currency==='same'?'Same currency':'Different currencies'}</strong></div>
       <div><span>PAYEE NAME</span><strong>{comparison.payee==='text-equal'?'Exact normalized text':comparison.payee==='not-recorded'?'Not recorded':'Not an exact text match'}</strong></div>
       <div><span>INVOICE REFERENCE</span><strong>{comparison.invoiceNumber==='explicitly-equal'?'Explicit matching number':comparison.invoiceNumber==='not-recorded'?'No explicit link':'Different invoice number'}</strong></div>
       <div><span>DATE RELATION</span><strong>{comparison.dayGap===null?'Not recorded':comparison.dayGap+' days relative to invoice'}</strong></div>
      </div>
      <p className="recon-caution"><strong>What remains unknown:</strong> {comparison.caution} A recorded wire can also relate to another invoice; a ledger description alone does not show accepted software installation.</p>
      <div className="recon-source-info">
       <div><span>CANDIDATE DOCUMENT TYPE</span><strong>{selectedEntry.kind.replace(/-/g,' ')}</strong></div>
       <div><span>RESEARCH LOCATOR</span><strong>{selectedEntry.locator||'Not supplied'}</strong></div>
       <div><span>INVOICE NUMBER IN ENTRY</span><strong>{selectedEntry.invoiceNoObserved||'Not shown'}</strong></div>
      </div>
      <p className="recon-entry-note">{selectedEntry.note}</p>
      {(selectedEntry.url||entrySource)&&<a className="recon-document-link" href={selectedEntry.url||entrySource?.url} target="_blank" rel="noopener noreferrer">Open {selectedEntry.kind==='secondary-report'?'secondary research lead':'linked document'} · {shortHost(selectedEntry.url||entrySource?.url||'')} ↗</a>}
      <div className="recon-review-form">
       <h3>Manual verification record</h3><p>Marking a record manually inspected is an account of your research activity, not authenticated payment evidence.</p>
       <label>Researcher status<select value={reviewForm.status} onChange={(e)=>setReviewForm((d)=>({...d,status:e.target.value as InspectionStatus}))}>
        {REVIEW_STATUSES.map((k:string)=><option key={k} value={k}>{statusLabel[k as InspectionStatus]}</option>)}
       </select></label>
       <label>HTTPS link actually inspected<input type="url" value={reviewForm.evidenceUrl} maxLength={2048} onChange={(e)=>setReviewForm((d)=>({...d,evidenceUrl:e.target.value}))} placeholder="Required when recording manual inspection" /></label>
       <label>Findings, alternate explanations, and missing evidence<textarea rows={5} value={reviewForm.note} maxLength={4000} onChange={(e)=>setReviewForm((d)=>({...d,note:e.target.value}))} placeholder="Did you inspect the actual entry, or only a secondary description? Is invoice 1501 mentioned? Was settlement independently confirmed?" /></label>
       <div className="recon-review-actions"><button className="recon-primary" onClick={saveReview} disabled={locked}>Save private verification note</button>
        {selectedEntry.id.startsWith('entry:')&&<button className="recon-danger" onClick={deleteEntry} disabled={locked}>Delete private candidate</button>}
       </div>
       {review&&<p className="recon-inspection">Current saved status: <strong>{statusLabel[review.status]}</strong> · {review.updatedAt.slice(0,10)}</p>}
      </div>
     </div>}
    </>:<div className="empty-state">Add or select a documented invoice to begin. Documents are compared independently for each case.</div>}
   </div>
  </div>
  <div className="recon-footer"><strong>No automatic financial findings.</strong> The Atlas compares entered metadata only. It cannot access bank ledgers, prove receipt, authenticate archived files, reconcile invoices to settled transactions, or establish delivered technology. All private records stay in your browser until you deliberately export them.
   {!locked&&<button onClick={reset}>Clear local reconciliation workspace</button>}
  </div>
 </section>;
}
