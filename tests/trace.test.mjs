import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../src/data/case-001.json', import.meta.url), 'utf8'));
const sources = new Set(data.sources.map((source) => source.id));
test('claim trace is chronological, stable and source-linked', () => {
  assert.ok(data.traceSteps.length >= 6);
  const ids = data.traceSteps.map((step) => step.id);
  assert.equal(ids.length, new Set(ids).size);
  const dates = data.traceSteps.map((step) => step.date);
  assert.deepEqual(dates, [...dates].sort());
  for (const step of data.traceSteps) {
    assert.match(step.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(step.title && step.stage && step.established && step.notEstablished);
    assert.ok(step.sourceIds.length);
    for (const id of step.sourceIds) assert.ok(sources.has(id), 'unresolved source: ' + id);
  }
});
test('invoice and request remain separate stages', () => {
  const request = data.traceSteps.find((item) => item.id === 'tr-request');
  const invoice = data.traceSteps.find((item) => item.id === 'tr-invoice');
  assert.equal(request.stage, 'requested');
  assert.equal(invoice.stage, 'invoiced');
  assert.ok(invoice.notEstablished.toLowerCase().includes('paid'));
  const paymentQuestion = data.traceSteps.find((item) => item.id === 'tr-ask');
  assert.match(paymentQuestion.notEstablished.toLowerCase(), /transferred|payment/);
});
test('litigation positions are labeled and cannot be mistaken for court findings', () => {
  const allegation = data.sources.find((source) => source.id === 'doc-usvi-complaint');
  const expert = data.sources.find((source) => source.id === 'doc-edc-report');
  assert.match(allegation.note, /Allegations are not findings/i);
  assert.match(expert.note, /not a judicial finding/i);
});
test('visual comparison remains disconnected from finance graph', () => {
  const motif = new Set(['motif', 'onlay']);
  for (const edge of data.edges) {
    assert.equal(motif.has(edge.from), motif.has(edge.to), edge.id + ' crosses isolated comparison cluster');
  }
});
