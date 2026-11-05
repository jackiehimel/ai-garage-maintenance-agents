import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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


import { accessibilityReport } from './report-fixture.js';

test('accessibility report groups repeated rules and dispositions with precise measured counts', () => {
  const document = parse(exporter.renderReport(accessibilityReport()));
  assert.equal(document.querySelectorAll('.finding-group').length, 6);
  assert.equal(document.querySelectorAll('.affected-instance').length, 72);
  assert.match(document.text, /10 flagged items across 4 checks/);
  assert.match(document.text, /7 items tied to accessibility requirements/);
  assert.match(document.text, /3 best-practice suggestions/);
  assert.match(document.text, /62 inconclusive items across 2 checks/);
  const contrast = document.querySelectorAll('.finding-group').filter(n => n.getAttribute('data-rule') === 'color-contrast');
  assert.deepEqual(contrast.map(n => n.getAttribute('data-count')), ['6', '55']);
  for (const instance of document.querySelectorAll('.affected-instance')) assert.ok(instance.closest('details'));
  for (let i = 0; i < 72; i++) {
    assert.ok(document.text.includes(`#selector-${i}`));
    assert.ok(document.text.includes(`finding-${i}`));
    assert.ok(document.querySelector(`a[href="#evidence-${i + 1}"]`));
  }
  assert.equal(document.querySelectorAll('script,img').length, 0);
  assert.match(document.text, /inconclusive.*not confirmed errors/i);
  assert.match(document.text, /Scanner impact.*business priority/i);
});

test('plain-language guidance handles overlap, captions and regions without claiming confirmed manual failures', () => {
  const document = parse(exporter.renderReport(accessibilityReport()));
  const groups = document.querySelectorAll('.finding-group');
  const manualContrast = groups.find(n => n.getAttribute('data-rule') === 'color-contrast' && n.getAttribute('data-disposition') === 'review-needed')!;
  assert.match(manualContrast.text, /overlap|pseudo-element/);
  assert.match(manualContrast.text, /only if.*fails/i);
  const captions = groups.find(n => n.getAttribute('data-rule') === 'video-caption')!;
  assert.match(captions.text, /speech or meaningful audio/i);
  assert.match(captions.text, /silent decorative/i);
  const region = groups.find(n => n.getAttribute('data-rule') === 'region')!;
  assert.match(region.text, /skip links/i);
  for (const group of groups) for (const label of ['Suggested owner', 'Next step', 'How to confirm']) assert.ok(group.text.includes(label));
});

test('historical AI prose is preserved in a collapsed unverified draft after the measured findings', () => {
  const document = parse(exporter.renderReport(accessibilityReport()));
  const draft = document.querySelector('.ai-draft')!;
  assert.ok(draft);
  assert.equal(draft.hasAttribute('open'), false);
  assert.match(draft.text, /AI interpretation.*unverified draft/i);
  assert.ok(draft.text.indexOf('capped subset') < draft.text.indexOf('Historical draft'));
  assert.match(document.text, /may contain errors.*measured results.*source of truth/i);
  assert.match(draft.text, /seven contrast failures in the main navigation; make text darker/);
});


test('live and offline accessibility grouping and actionable guidance have identical semantics', () => {
  const app = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function accessibilityGroups(');
  const end = app.indexOf('function renderFindings(', start);
  const live = runInNewContext(`${app.slice(start, end)}; ({ accessibilityGroups, accessibilityGuidance, groupLocation })`);
  const fixture = accessibilityReport();
  const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(live.accessibilityGroups(fixture)), exporter.accessibilityGroups(fixture));
  for (const rule of ['button-name', 'color-contrast', 'video-caption', 'landmark-unique', 'region', '<img onerror=alert(1)>']) {
    for (const disposition of ['finding', 'review-needed', 'observation'] as const) {
      assert.deepEqual(plain(live.accessibilityGuidance(rule, disposition)), exporter.accessibilityGuidance(rule, disposition));
    }
  }
  assert.equal(live.groupLocation(fixture.findings), exporter.groupLocation(fixture.findings));
});
