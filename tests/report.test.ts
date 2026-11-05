import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'node-html-parser';
import type { AgentReport } from '../src/core/types.js';
import * as exporter from '../src/report.js';

const scope = { page: 'https://example.com/?a=1&b=2', element: '"><img src=x onerror=alert(1)>' };
const runtime = { node: '24.0.0', browser: 'Chromium', engine: '123' };
const report: AgentReport = {
  schemaVersion: 1,
  runId: 'test-run',
  agentId: 'performance',
  submittedUrl: 'https://example.com/',
  testedUrl: scope.page,
  startedAt: '2026-11-05T09:00:00Z',
  completedAt: '2026-11-05T09:02:00Z',
  runtime,
  collectionStatus: 'partial',
  configuration: {
    agentId: 'performance', targetUrl: 'https://example.com/', pages: [{ url: scope.page }],
    states: [], components: [], ownerPriorities: [], indexIntent: [],
    profile: { id: 'desktop-v1', samples: 3, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' },
  },
  evidence: [{
    id: 'e/unsafe "><img>', agentId: 'performance', kind: 'lab-sample', scope,
    summary: 'Measured </pre><script>alert(1)</script> & saved',
    source: { kind: 'measured', name: 'Lighthouse', reference: 'https://example.com/reference' },
    data: { value: 2100, unit: 'ms' }, artifactIds: ['sample-1'],
  }],
  coverage: [{ id: 'c-one', scope, subject: 'Navigation samples', status: 'incomplete', reason: '2 of 3 samples returned' }],
  findings: [{
    id: 'f-one', agentId: 'performance', rule: 'slow-lcp', scope,
    title: 'LCP observation', summary: 'Inspect the hero image.', severity: 'medium',
    disposition: 'observation', evidenceIds: ['e/unsafe "><img>'], coverageIds: ['c-one'],
    investigate: 'Inspect the request waterfall.',
  }],
  comparison: { status: 'incompatible', reasons: ['Browser versions differ.'], findings: [] },
  assessment: {
    status: 'available', model: 'test-model', usage: { inputTokens: 12, outputTokens: 8 }, truncated: true,
    sentEvidenceIds: ['e/unsafe "><img>'], summary: 'Check measured <LCP>.',
    actions: [{ title: 'Review image priority', rationale: 'Measure again after the change.', priority: 'medium',
      steps: ['Inspect <img>.'], evidenceIds: ['e/unsafe "><img>'] }],
  },
  measurements: { sampleCount: 2 },
  diagnostics: ['Third sample timed out.'],
  artifacts: [{ id: 'sample-1', label: 'Lighthouse trace', mediaType: 'application/json', byteLength: 402 }],
  retention: { status: 'export-only', reason: 'Disk unavailable.' },
  baselineUnavailableReason: 'Collection did not yield a compatible baseline.',
};

test('offline HTML preserves untrusted data as text and links evidence without remote dependencies', () => {
  const html = exporter.renderReport(report);
  const document = parse(html);
  assert.match(html, /^<!doctype html>/i);
  assert.equal(document.querySelectorAll('script, img, iframe, link, object, embed').length, 0);
  assert.match(document.text, /Measured <\/pre><script>alert\(1\)<\/script> & saved/);
  assert.match(document.text, /https:\/\/example\.com\/\?a=1&b=2/);
  const links = document.querySelectorAll('a');
  assert.ok(links.length > 0);
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    assert.match(href, /^#[a-z0-9-]+$/);
    assert.ok(document.getElementById(href.slice(1)));
  }
});

test('offline HTML reports coverage, live assessment, comparison, retention and measurements independently', () => {
  const document = parse(exporter.renderReport(report));
  for (const value of [
    'partial', 'test-model', 'Review image priority', 'Inspect <img>.',
    '2 of 3 samples returned', 'Browser versions differ.',
    'Disk unavailable.', 'Collection did not yield a compatible baseline.',
    'Third sample timed out.', 'Lighthouse trace', 'sampleCount', '2100',
  ]) {
    assert.ok(document.text.includes(value), `missing ${value}`);
  }
});

test('offline HTML displays unavailable AI and distinguishes a first run from an incompatible baseline', () => {
  const document = parse(exporter.renderReport({
    ...report,
    comparison: { status: 'first-run', reasons: [], findings: [] },
    assessment: { status: 'unavailable', reason: 'Provider timed out.' },
  }));
  assert.match(document.text, /first run/i);
  assert.match(document.text, /Provider timed out\./);
  assert.doesNotMatch(document.text, /Review image priority/);
});

test('offline navigation results give the denominator, spread and units next to each metric', () => {
  const document = parse(exporter.renderReport({
    ...report,
    measurements: {
      navigation: { pages: [{
        page: 'https://example.com/', planned: 3, attempted: 3, succeeded: 2, failed: 1, notRun: 0,
        metrics: {
          'largest-contentful-paint': { unit: 'ms', count: 2, median: 2100, min: 2000, max: 2200, spread: 200, missing: 1 },
        },
      }] },
    },
  }));
  const row = document.querySelector('tbody tr');
  assert.ok(row);
  assert.deepEqual(row.children.map((cell) => cell.text), [
    'Largest Contentful Paint (LCP)', '2100 ms', '2000 ms', '2200 ms', '200 ms', '2 / 3',
  ]);
});
