// MK7: metadata reconciliation, not a payment verification engine.
// All records and researcher statements are treated as untrusted inputs.
export const RECON_FORMAT = 'pattern-atlas-reconciliation-v1';
export const REVIEW_STATUSES = ['not-reviewed','manually-inspected','needs-follow-up'];
export const EVIDENCE_KINDS = ['secondary-report','invoice','ledger','bank-statement','correspondence','other'];
const ID = /^(inv|entry):[a-f0-9-]{16,50}$/;
const dateOK = (value) => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
const timestampOK = (value) => typeof value === 'string' &&
  value.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
  !Number.isNaN(Date.parse(value));
const textOK = (v,n=2000,required=true) =>
  typeof v === 'string' && v.length <= n && (!required || v.trim().length > 0);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const https = (v) => {
  if(typeof v!=='string'||v.length>2048)return false;
  try {const u=new URL(v);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}
  catch{return false;}
};
const moneyOK=(v)=>Number.isSafeInteger(v)&&v>=0&&v<=100_000_000_000_000;
const currencyOK=(v)=>v==='USD'; // MK7 intentionally supports USD cents only.
export function parseMoney(text) {
  if(typeof text!=='string'||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text.trim()))return null;
  const [whole,cents='']=text.trim().split('.');
  const value=Number(whole)*100+Number(cents.padEnd(2,'0'));
  return moneyOK(value)?value:null;
}
export function displayMoney(cents,currency='USD') {
  if(!moneyOK(cents)||!currencyOK(currency))return 'Amount unavailable';
  return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(cents/100);
}
const conservativeName=(v)=>typeof v==='string'?v.toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ').trim():'';
export function examineMetadata(invoice,entry) {
  const amount=invoice.amountCents===entry.amountCents?'same':'different';
  const currency=invoice.currency===entry.currency?'same':'different';
  const payee = !invoice.vendor||!entry.payee?'not-recorded':
    conservativeName(invoice.vendor)===conservativeName(entry.payee)?'text-equal':'text-differs';
  const invoiceNumber= !invoice.invoiceNo||!entry.invoiceNoObserved?'not-recorded':
    invoice.invoiceNo.trim().toLowerCase()===entry.invoiceNoObserved.trim().toLowerCase()?'explicitly-equal':'different';
  const a=dateOK(invoice.date)?Date.parse(invoice.date+'T00:00:00Z'):NaN;
  const b=dateOK(entry.date)?Date.parse(entry.date+'T00:00:00Z'):NaN;
  const dayGap=Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):null;
  const order=dayGap===null?'not-recorded':dayGap<0?'earlier-than-invoice':'same-day-or-later';
  return {amount,currency,payee,invoiceNumber,dayGap,order,
    caution:'Metadata overlap cannot prove settlement, invoice allocation, software delivery, or wrongdoing.'};
}
function hash(value) {
  // Drift detection only, NOT cryptographic hashing or documentary authentication.
  let h=2166136261;const s=JSON.stringify(value);
  for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
  return (h>>>0).toString(16).padStart(8,'0');
}
export function seedForCase(seeds,caseFile) {
  const seed=seeds.find((x)=>x.caseId===caseFile.id);
  if(!seed)return {invoices:[],entries:[]};
  const sourceIds=new Set(caseFile.sources.map((s)=>s.id));
  return {
    invoices:seed.invoices.filter((i)=>sourceIds.has(i.sourceId)),
    entries:seed.entries.filter((e)=>seed.invoices.some((i)=>i.id===e.invoiceId))
  };
}
export function listInvoices(bundle,seed) {
  return [...seed.invoices,...bundle.invoices];
}
export function listEntries(bundle,seed) {
  return [...seed.entries,...bundle.entries];
}
export function entryFingerprint(entry,invoice,caseFile) {
  const invoiceSource=caseFile.sources.find((s)=>s.id===invoice.sourceId);
  const entrySource=caseFile.sources.find((s)=>s.id===entry.sourceId);
  return hash([
    caseFile.id,invoice.id,invoice.invoiceNo,invoice.date,invoice.amountCents,
    invoice.currency,invoice.vendor,invoice.payer,invoiceSource?.url||'',
    entry.id,entry.invoiceId,entry.date,entry.amountCents,entry.currency,entry.payee,
    entry.invoiceNoObserved,entry.kind,entry.sourceId,entry.url,entry.note,
    entrySource?.url||'',entry.locator
  ]);
}
export function emptyReconciliation(caseFile) {
  return {format:RECON_FORMAT,caseId:caseFile.id,invoices:[],entries:[],reviews:{}};
}
export function validateReconciliation(bundle,caseFile,seed) {
  const errors=[];const fail=(v)=>{if(errors.length<30)errors.push(v);};
  if(!object(bundle))return {ok:false,errors:['Reconciliation bundle must be an object.']};
  try {if(JSON.stringify(bundle).length>450_000)fail('Bundle exceeds 450 KB.');}
  catch {return {ok:false,errors:['Bundle cannot be serialized.']};}
  if(bundle.format!==RECON_FORMAT)fail('Unsupported format.');
  if(bundle.caseId!==caseFile.id)fail('Bundle belongs to another case.');
  if(!Array.isArray(bundle.invoices)||!Array.isArray(bundle.entries)||!object(bundle.reviews))
    return {ok:false,errors:[...errors,'Invalid invoice, entry, or review collection.']};
  if(bundle.invoices.length>100||bundle.entries.length>300||Object.keys(bundle.reviews).length>600)
    fail('Too many records.');
  const sourceIds=new Set(caseFile.sources.map((s)=>s.id));
  const invoiceIds=new Set(seed.invoices.map((i)=>i.id));
  const entryIds=new Set(seed.entries.map((e)=>e.id));
  for(const i of bundle.invoices){
    if(!object(i)){fail('Malformed invoice.');continue;}
    if(typeof i.id!=='string'||!ID.test(i.id)||!i.id.startsWith('inv:')||invoiceIds.has(i.id))fail('Invalid or duplicate invoice ID.');
    invoiceIds.add(i.id);
    if(!sourceIds.has(i.sourceId))fail('Invoice requires a source in the case evidence ledger.');
    if(!dateOK(i.date)||!moneyOK(i.amountCents)||!currencyOK(i.currency))fail('Invalid invoice date, amount or currency.');
    for(const k of ['invoiceNo','vendor','payer'])if(!textOK(i[k],180,k!=='invoiceNo'))fail('Invoice has invalid '+k+'.');
    if(!textOK(i.description,2000))fail('Invoice needs a description and scope.');
  }
  const invoices=new Map(listInvoices(bundle,seed).filter(object).map((i)=>[i.id,i]));
  for(const e of bundle.entries){
    if(!object(e)){fail('Malformed transaction candidate.');continue;}
    if(typeof e.id!=='string'||!ID.test(e.id)||!e.id.startsWith('entry:')||entryIds.has(e.id))fail('Invalid or duplicate candidate ID.');
    entryIds.add(e.id);
    if(!invoices.has(e.invoiceId))fail('Candidate refers to a missing invoice.');
    if(!dateOK(e.date)||!moneyOK(e.amountCents)||!currencyOK(e.currency))fail('Invalid candidate date, amount or currency.');
    if(!EVIDENCE_KINDS.includes(e.kind))fail('Unrecognized evidence type.');
    if(!textOK(e.payee,180)||!textOK(e.invoiceNoObserved,180,false)||!textOK(e.locator,220,false)||!textOK(e.note,4000))
      fail('Invalid transaction candidate description.');
    if(e.sourceId && !sourceIds.has(e.sourceId))fail('Candidate source ID not found in evidence ledger.');
    if(e.url && !https(e.url))fail('Candidate source link must use HTTPS.');
    if(!e.sourceId&&!e.url)fail('Candidate needs an existing source or HTTPS research lead.');
  }
  const entries=new Map(listEntries(bundle,seed).filter(object).map((e)=>[e.id,e]));
  for(const [id,review] of Object.entries(bundle.reviews)){
    const entry=entries.get(id);
    if(!entry){fail('Review refers to missing candidate: '+id);continue;}
    if(!object(review)){fail('Malformed review: '+id);continue;}
    const invoice=invoices.get(entry.invoiceId);
    if(!invoice){fail('Reviewed invoice no longer exists.');continue;}
    if(review.signature!==entryFingerprint(entry,invoice,caseFile))fail('Invoice, source, or candidate changed: '+id);
    if(!REVIEW_STATUSES.includes(review.status))fail('Unsupported review status: '+id);
    if(!textOK(review.note,4000,false)||!textOK(review.evidenceUrl,2048,false)||!timestampOK(review.updatedAt))
      fail('Invalid review note, evidence link, or date.');
    if(review.evidenceUrl&&!https(review.evidenceUrl))fail('Review evidence URL must be HTTPS.');
    if(review.status==='manually-inspected'&&(!(typeof review.note==='string'&&review.note.trim().length>=30)||!review.evidenceUrl))
      fail('Manual inspection requires a substantial note and HTTPS source link.');
    if(review.status==='needs-follow-up'&&!(typeof review.note==='string'&&review.note.trim().length>=15))
      fail('Follow-up status requires a description of missing evidence.');
  }
  return {ok:errors.length===0,errors};
}
const clean=(v)=>String(v).replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
export function reconciliationReport(bundle,caseFile,seed) {
  const invoices=listInvoices(bundle,seed),entries=listEntries(bundle,seed);
  const lines=['# Pattern Atlas · Transaction Reconciliation Lab','',
   'Case: '+caseFile.id+' · '+caseFile.title,'',
   '> Metadata comparison is NOT proof of payment, receipt, allocation to an invoice, delivery of services, or wrongdoing.',
   '','| Invoice | Date | Amount | Vendor | Document source |',
   '| --- | --- | --- | --- | --- |',
   ...invoices.map((i)=>'| '+clean(i.invoiceNo||'(number not shown)')+' | '+i.date+' | '+clean(displayMoney(i.amountCents,i.currency))+
     ' | '+clean(i.vendor)+' | '+clean(caseFile.sources.find((s)=>s.id===i.sourceId)?.citation||i.sourceId)+' |'),
   '','## Candidate entries',''];
  for(const e of entries) {
    const i=invoices.find((v)=>v.id===e.invoiceId);
    if(!i)continue;
    const m=examineMetadata(i,e),review=bundle.reviews[e.id];
    lines.push('### '+clean(e.id),'',
      '- Candidate date/amount: '+e.date+' / '+clean(displayMoney(e.amountCents,e.currency)),
      '- Payee label: '+clean(e.payee),
      '- Evidence category **entered**: '+clean(e.kind),
      '- Source or lead: '+clean(e.sourceId||e.url||'unavailable'),
      '- Record locator: '+clean(e.locator||'(none)'),
      '- Exact amount: '+m.amount+'; payee text: '+m.payee+'; invoice number: '+m.invoiceNumber+
        '; date relation: '+m.order+'.',
      '- Researcher inspection status: '+clean(review?.status||'not-reviewed'),
      '- Research note: '+clean(review?.note||e.note),
      '- **Still not established:** Payment settlement, accepted service delivery, or operation of software.','');
  }
  lines.push('No automated authentication of remote documents or bank settlement check was performed.','');
  return lines.join('\n');
}
