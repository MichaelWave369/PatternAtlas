import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/case-001.json', import.meta.url), 'utf8'));
const nodeIds = new Set(data.nodes.map((n) => n.id));
const sourceIds = new Set(data.sources.map((s) => s.id));

test('unique entity, source, and relationship IDs', () => {
  for (const items of [data.nodes, data.edges, data.sources, data.events, data.hypotheses]) {
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  }
});

test('all relationships have existing endpoints and sources', () => {
  for (const edge of data.edges) {
    assert.ok(nodeIds.has(edge.from), edge.id + ': missing from');
    assert.ok(nodeIds.has(edge.to), edge.id + ': missing to');
    assert.notEqual(edge.from, edge.to);
    assert.ok(edge.sourceIds.length > 0);
    for (const id of edge.sourceIds) assert.ok(sourceIds.has(id), edge.id + ': source ' + id);
  }
});

test('all claims and hypotheses have traceable source identifiers', () => {
  for (const item of [...data.nodes, ...data.events, ...data.hypotheses]) {
    assert.ok(item.sourceIds.length > 0, item.id + ': no sources');
    for (const id of item.sourceIds) assert.ok(sourceIds.has(id), item.id + ': source ' + id);
  }
});

test('source URLs and uncertainty fields are present', () => {
  for (const source of data.sources) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.citation && source.note);
  }
  for (const hypothesis of data.hypotheses) {
    assert.ok(hypothesis.forEvidence && hypothesis.againstEvidence && hypothesis.nextCheck);
  }
  for (const edge of data.edges) assert.ok(['documented','reported','unverified'].includes(edge.assessment));
});

test('ornament comparison remains separate from financial/scientific network', () => {
  const motifGroup = new Set(['motif','onlay']);
  assert.ok(data.edges.some((edge) => motifGroup.has(edge.from) && motifGroup.has(edge.to)));
  assert.ok(data.edges.every((edge) => motifGroup.has(edge.from) === motifGroup.has(edge.to)),
    'Never imply a connection between an ornament and an unrelated research entity');
});
