import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  seedForCase,listInvoices,listEntries,examineMetadata,parseMoney,displayMoney,entryFingerprint,
  emptyReconciliation,validateReconciliation,reconciliationReport
} from '../src/reconciliationCore.mjs';

const read=(p)=>JSON.parse(readFileSync(new URL('../src/data/'+p,import.meta.url),'utf8'));
const c1=read('case-001.json'),c2=read('case-002.json'),seeds=read('reconciliationSeeds.json');
const s1=seedForCase(seeds,c1),s2=seedForCase(seeds,c2);
const date='2026-11-06T23:18:43.000Z';
const review=(c,invoice,entry,overrides={})=>({
  signature:entryFingerprint(entry,invoice,c),status:'needs-follow-up',
  note:'Need the original bank or ledger record to validate the alleged payment.',
  evidenceUrl:'',updatedAt:date,...overrides
});
const customEntry=(invoiceId)=>({
  id:'entry:ba4e740d-5c2e-47da-832d-7b8d3f2e73f2',invoiceId,
  date:'2015-04-13',amountCents:3000000,currency:'USD',payee:'Novamente LLC',
  invoiceNoObserved:'',kind:'secondary-report',sourceId:'',
  url:'https://example.org/ledger-summary',locator:'EFTA reference not verified',
  note:'A secondary summary reports a possible $30,000 transaction; no settlement record inspected.'
});

test('both curated seed invoices remain explicitly separate from transaction evidence',()=>{
  assert.equal(s1.invoices.length,1);
  assert.equal(s1.entries.length,1);
  assert.equal(s2.invoices.length,1);
  assert.equal(s2.entries.length,1);
  assert.equal(s1.invoices[0].invoiceNo,'1501');
  assert.equal(s1.invoices[0].amountCents,3000000);
  assert.equal(s2.invoices[0].amountCents,2000000000);
});

test('the 2015 candidate is a secondary-reported lead, not a bank-confirmed payment',()=>{
  const entry=s1.entries[0];
  assert.equal(entry.kind,'secondary-report');
  assert.match(entry.note,/not been independently verified/i);
  assert.match(entry.locator,/candidate archive locator/i);
  assert.equal(entry.invoiceNoObserved,'');
  assert.match(s1.invoices[0].description,/not confirmation of settlement/i);
});

test('amount parser uses integer cents and rejects floating-point/ambiguous input',()=>{
  assert.equal(parseMoney('30000.00'),3000000);
  assert.equal(parseMoney('0.01'),1);
  assert.equal(parseMoney('0'),0);
  assert.equal(parseMoney('3.1'),310);
  assert.equal(parseMoney('3.141'),null);
  assert.equal(parseMoney('-30'),null);
  assert.equal(parseMoney('1e4'),null);
  assert.equal(parseMoney('30,000'),null);
  assert.equal(parseMoney(''),null);
  assert.equal(displayMoney(3000000,'USD'),'$30,000.00');
});

test('metadata match never yields an overall settlement verdict',()=>{
  const invoice=s1.invoices[0],entry=s1.entries[0];
  const data=examineMetadata(invoice,entry);
  assert.equal(data.amount,'same');
  assert.equal(data.currency,'same');
  assert.equal(data.invoiceNumber,'not-recorded');
  assert.equal(data.payee,'text-differs');
  assert.ok(data.dayGap>0);
  assert.match(data.caution,/cannot prove settlement/i);
  assert.equal('verified' in data,false);
  assert.equal('probability' in data,false);
});

test('explicit source number match and nonmatching metadata are independently visible',()=>{
  const invoice=s1.invoices[0];
  const entry={...s1.entries[0],invoiceNoObserved:'1501',amountCents:2999000,payee:'Novamente LLC',date:'2015-01-01'};
  const m=examineMetadata(invoice,entry);
  assert.equal(m.invoiceNumber,'explicitly-equal');
  assert.equal(m.payee,'text-equal');
  assert.equal(m.amount,'different');
  assert.equal(m.order,'earlier-than-invoice');
});

test('empty private bundles validate for each case',()=>{
  for(const [c,seed] of [[c1,s1],[c2,s2]]){
    const bundle=emptyReconciliation(c);
    assert.equal(validateReconciliation(bundle,c,seed).ok,true);
    assert.deepEqual(bundle.reviews,{});
  }
});

test('manual invoice requires a known case source',()=>{
  const bundle=emptyReconciliation(c2);
  bundle.invoices.push({
    id:'inv:4dc079d1-4e41-4f44-b122-8cf71a884c96',sourceId:'missing',
    invoiceNo:'draft',date:'2014-07-15',amountCents:2000000000,currency:'USD',
    vendor:'Southern Trust Company',payer:'Entity unspecified',description:'A draft document exists but no payment has been verified.'
  });
  assert.match(validateReconciliation(bundle,c2,s2).errors.join(' '),/source in the case/);
  bundle.invoices[0].sourceId='source-2014-invoice';
  assert.equal(validateReconciliation(bundle,c2,s2).ok,true);
});

test('local candidate must link to a current invoice and a source or HTTPS URL',()=>{
  const bundle=emptyReconciliation(c1);
  const candidate=customEntry(s1.invoices[0].id);
  bundle.entries.push(candidate);
  assert.equal(validateReconciliation(bundle,c1,s1).ok,true);
  candidate.invoiceId='seed:unknown';
  assert.match(validateReconciliation(bundle,c1,s1).errors.join(' '),/missing invoice/);
  candidate.invoiceId=s1.invoices[0].id;
  candidate.url='javascript:alert(1)';
  assert.match(validateReconciliation(bundle,c1,s1).errors.join(' '),/must use HTTPS/);
  candidate.url='';
  assert.match(validateReconciliation(bundle,c1,s1).errors.join(' '),/needs an existing source/);
});

test('researcher cannot mark inspection completed without a meaningful note and URL',()=>{
  const bundle=emptyReconciliation(c1);
  const invoice=s1.invoices[0],entry=s1.entries[0];
  bundle.reviews[entry.id]=review(c1,invoice,entry,{status:'manually-inspected',note:'done'});
  assert.equal(validateReconciliation(bundle,c1,s1).ok,false);
  bundle.reviews[entry.id].note='I inspected a document viewer, but could not confirm a settled transaction.';
  bundle.reviews[entry.id].evidenceUrl='https://epstein-data.com/EFTA00809214';
  assert.equal(validateReconciliation(bundle,c1,s1).ok,true);
});

test('candidate or invoice changes invalidate a prior review',()=>{
  const bundle=emptyReconciliation(c1),invoice=s1.invoices[0],entry=s1.entries[0];
  bundle.reviews[entry.id]=review(c1,invoice,entry);
  assert.equal(validateReconciliation(bundle,c1,s1).ok,true);
  const changedSeed=structuredClone(s1);
  changedSeed.entries[0].amountCents=3050000;
  assert.match(validateReconciliation(bundle,c1,changedSeed).errors.join(' '),/changed/);
  const changedInvoice=structuredClone(s1);
  changedInvoice.invoices[0].vendor+=' Incorporated';
  assert.match(validateReconciliation(bundle,c1,changedInvoice).errors.join(' '),/changed/);
});

test('case source changes invalidate reviews linked to corresponding invoices',()=>{
  const bundle=emptyReconciliation(c1),invoice=s1.invoices[0],entry=s1.entries[0];
  bundle.reviews[entry.id]=review(c1,invoice,entry);
  const changed=structuredClone(c1);
  changed.sources.find((s)=>s.id===invoice.sourceId).url+='?new=1';
  assert.match(validateReconciliation(bundle,changed,s1).errors.join(' '),/changed/);
});

test('cross-case imports and unknown review entries are rejected',()=>{
  const bundle=emptyReconciliation(c1),invoice=s1.invoices[0],entry=s1.entries[0];
  assert.match(validateReconciliation(bundle,c2,s2).errors.join(' '),/another case/);
  bundle.reviews['entry:nonexistent']=review(c1,invoice,entry);
  assert.match(validateReconciliation(bundle,c1,s1).errors.join(' '),/missing candidate/);
});

test('malformed and duplicated records are rejected without crashing',()=>{
  const bundle=emptyReconciliation(c1);
  bundle.invoices=[null];
  assert.doesNotThrow(()=>validateReconciliation(bundle,c1,s1));
  assert.equal(validateReconciliation(bundle,c1,s1).ok,false);
  bundle.invoices=[];
  const e=customEntry(s1.invoices[0].id);
  bundle.entries=[e,{...e}];
  assert.match(validateReconciliation(bundle,c1,s1).errors.join(' '),/duplicate candidate ID/);
});

test('zero and negative currency assumptions cannot silently pass other-currency records',()=>{
  const bundle=emptyReconciliation(c1);
  const e=customEntry(s1.invoices[0].id);
  e.currency='JPY';
  bundle.entries=[e];
  assert.match(validateReconciliation(bundle,c1,s1).errors.join(' '),/candidate date, amount or currency/);
});

test('reports retain uncertainties and do not create new case graph edges',()=>{
  const before=c1.edges.length;
  const report=reconciliationReport(emptyReconciliation(c1),c1,s1);
  assert.match(report,/EFTA01191405/);
  assert.match(report,/secondary-report/);
  assert.match(report,/not proof of payment/i);
  assert.match(report,/No automated authentication/i);
  assert.equal(c1.edges.length,before);
});

test('existing invoice and secondary candidate stay source-visible if private data is empty',()=>{
  const b=emptyReconciliation(c1);
  assert.equal(listInvoices(b,s1).length,1);
  assert.equal(listEntries(b,s1).length,1);
  assert.equal(listEntries(b,s2).length,1);
});
