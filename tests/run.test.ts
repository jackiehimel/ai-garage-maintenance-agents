import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseBaseline } from '../src/core/baseline.js';
import { createEvidence, createFinding } from '../src/core/evidence.js';
import { openRunStore } from '../src/core/store.js';
import type { AgentRequest, CollectorResult } from '../src/core/types.js';
import { runAgent } from '../src/run.js';

const request = {
  agentId: 'seo-ai-search', targetUrl: 'https://example.com/catalog',
  pages: ['https://example.com/catalog/item'],
} satisfies AgentRequest;
const scope = { page: request.pages[0] };
const artifact = {
  id: 'art_0123456789abcdef01234567', label: 'Page head', mediaType: 'text/html',
  bytes: '<title>Catalogue — Example</title>', scope,
};
const evidence = createEvidence({
  agentId: request.agentId, kind: 'page-head', scope, summary: 'Canonical tag is absent',
  source: { kind: 'measured', name: 'Rendered document' }, artifactIds: [artifact.id],
});
const finding = createFinding({
  agentId: request.agentId, rule: 'missing-canonical', scope, title: 'Canonical tag missing',
  summary: 'The rendered page has no canonical tag.', severity: 'medium', disposition: 'finding',
  evidenceIds: [evidence.id], coverageIds: ['page-head'],
});
const result: CollectorResult = {
  testedUrl: request.targetUrl,
  runtime: { node: '24.0.0', browser: 'Chromium 143', engine: 'collector-1' },
  coverage: [{ id: 'page-head', scope, subject: 'Rendered page metadata', status: 'complete' }],
  evidence: [evidence], findings: [finding], artifacts: [artifact],
};

test('stores a report and artifact and accepts the exported baseline in a second run', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'maintenance-run-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const first = await runAgent(request, {
    storageRoot, assessment: 'off', collector: async (validated) => {
      assert.equal(validated.targetUrl, request.targetUrl);
      assert.ok(validated.pages.some((page) => page.url === scope.page));
      return result;
    },
  });
  assert.equal(first.collectionStatus, 'complete');
  assert.equal(first.comparison.status, 'first-run');
  assert.equal(first.assessment.status, 'unavailable');
  assert.equal(first.retention.status, 'saved');
  assert.equal(first.artifacts[0]?.id, first.evidence[0]?.artifactIds?.[0]);
  assert.equal(first.artifacts[0]?.byteLength, Buffer.byteLength(artifact.bytes));
  assert.ok(first.baseline);

  const store = await openRunStore(storageRoot, first.runId);
  const saved = await store.readReport();
  assert.deepEqual(JSON.parse(saved), JSON.parse(JSON.stringify(first)));
  assert.equal((await store.readArtifact(artifact.id)).toString(), artifact.bytes);
  assert.deepEqual(parseBaseline(saved), first.baseline);

  const second = await runAgent({ ...request, baseline: JSON.stringify(first.baseline) }, {
    assessment: 'off', collector: async () => result,
  });
  assert.equal(second.retention.status, 'export-only');
  assert.equal(second.comparison.status, 'compatible');
  assert.deepEqual(second.comparison.findings.map(({ id, status }) => ({ id, status })), [
    { id: finding.id, status: 'persistent' },
  ]);
  assert.equal(Object.hasOwn(second.configuration, 'baseline'), false);
});

test('a failed collection cannot resolve a prior finding when its scope was unobserved', async () => {
  const first = await runAgent(request, { assessment: 'off', collector: async () => result });
  assert.ok(first.baseline);
  const failed = await runAgent({ ...request, baseline: first.baseline }, {
    assessment: 'off', collector: async () => ({
      ...result,
      coverage: [{ ...result.coverage[0]!, status: 'unavailable', reason: 'Navigation timed out' }],
      findings: [], evidence: [], artifacts: [],
    }),
  });
  assert.equal(failed.collectionStatus, 'failed');
  assert.equal(failed.coverage[0]?.reason, 'Navigation timed out');
  assert.equal(failed.comparison.status, 'compatible');
  assert.deepEqual(failed.comparison.findings.map(({ id, status }) => ({ id, status })), [
    { id: finding.id, status: 'inconclusive' },
  ]);
});
