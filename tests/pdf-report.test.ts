import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { renderCombinedPdf } from '../src/pdf-report.js';
import { validateRequest } from '../src/core/input.js';
import { accessibilityReport } from './report-fixture.js';
import type { AgentId, AgentReport, Finding } from '../src/core/types.js';

function report(agentId: AgentId): AgentReport {
  return {
    schemaVersion: 1, runId: `run_${agentId === 'accessibility' ? 'b' : agentId === 'performance' ? 'c' : 'a'}`.padEnd(28, '0'),
    agentId, submittedUrl: 'https://example.com/', testedUrl: 'https://example.com/',
    startedAt: '2026-11-09T00:00:00Z', completedAt: '2026-11-09T00:01:00Z', collectionStatus: 'complete',
    configuration: validateRequest({ agentId, targetUrl: 'https://example.com/' }),
    runtime: { node: '24', browser: 'Chromium', engine: 'Chromium' },
    evidence: [], findings: [], coverage: [{ id: 'complete', scope: { page: 'https://example.com/' }, subject: 'Page scan', status: 'complete' }],
    artifacts: [], comparison: { status: 'first-run', reasons: [], findings: [] },
    assessment: { status: 'unavailable', reason: 'Not configured' }, retention: { status: 'saved' },
    baselineUnavailableReason: 'No baseline',
  };
}

function finding(id: string, disposition: Finding['disposition']): Finding {
  return { id, agentId: 'accessibility', rule: 'button-name', title: 'Button has no accessible name',
    summary: 'The sampled button has no name.', severity: 'high', disposition,
    scope: { page: 'https://example.com/', element: `#${id}` }, evidenceIds: [], coverageIds: [],
    correct: 'Provide a descriptive name.', recheck: 'Check the accessible name after the change.' };
}

// Read the real generated content streams. No PDF renderer or text function is mocked.
function pdfText(buffer: Buffer): string {
  return [...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    let content: string;
    try { content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { content = match[1]; }
    return [...content.matchAll(/\[([^\]]*)\]\s*TJ|<([a-f\d]+)>\s*Tj/gi)].map((line) =>
      [...(line[1] ?? `<${line[2]}>`).matchAll(/<([a-f\d]+)>/gi)].map((token) => Buffer.from(token[1], 'hex').toString('latin1')).join('')
    ).join('\n');
  }).join('\n');
}

test('combined PDF keeps automatic flags, review items and absent agents distinct', async () => {
  const a11y = report('accessibility');
  a11y.findings = [finding('measured', 'finding'), finding('review1', 'review-needed'), finding('review2', 'review-needed')];
  const pdf = await renderCombinedPdf([report('seo-ai-search'), a11y], { scope: 'all' });
  const text = pdfText(pdf);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(text, /1 automatic flag/);
  assert.match(text, /2 items need human review/);
  assert.match(text, /Performance/);
  assert.match(text, /No report returned/);
  assert.match(text, /No issues detected in completed checks/);
  assert.match(text, /Provide a descriptive name/);
  assert.match(text, /Check the accessible name after the change/);
  assert.doesNotMatch(text, /3 confirmed|3 automatic/);
});

test('PDF reports actual medians and inconclusive comparison without inventing a regression', async () => {
  const performance = report('performance');
  performance.measurements = { navigation: { pages: [{ page: 'https://example.com/', planned: 3, succeeded: 3, metrics: {
    'performance-score': { median: 79, min: 66, max: 81, unit: 'points' },
    'largest-contentful-paint': { median: 2852.288, min: 2197, max: 3134, unit: 'ms' },
  } }] } };
  performance.comparison = { status: 'compatible', reasons: [], findings: [], metrics: [{ page: 'https://example.com/', metric: 'largest-contentful-paint', status: 'inconclusive', unit: 'ms', reason: 'Within-run variation is too large.' }] };
  const text = pdfText(await renderCombinedPdf([performance]));
  assert.match(text, /79 \/ 100/);
  assert.match(text, /2\.85 s/);
  assert.match(text, /3 of 3 samples/);
  assert.match(text, /inconclusive/i);
  assert.match(text, /Within-run variation is too large/);
  assert.doesNotMatch(text, /No report returned/);
});

test('legacy AI claims are omitted while current proposals stay explicitly unverified', async () => {
  const seo = report('seo-ai-search');
  seo.assessment = { status: 'available', model: 'test', summary: 'Invented fact from old analysis', actions: [], sentEvidenceIds: [], truncated: false };
  const a11y = report('accessibility');
  a11y.assessment = { status: 'available', model: 'test', summary: 'Current proposed interpretation', interpretation: { text: 'Current proposed interpretation', claimIds: [], evidenceIds: [] }, actions: [], sentEvidenceIds: [], truncated: false, groundingVersion: 1 };
  const text = pdfText(await renderCombinedPdf([seo, a11y]));
  assert.doesNotMatch(text, /Invented fact/);
  assert.match(text, /Current proposed interpretation/);
  assert.match(text, /AI proposals - unverified/);
});

test('long finding guidance paginates without losing the last action or footer', async () => {
  const a11y = report('accessibility');
  a11y.findings = Array.from({ length: 18 }, (_, index) => ({ ...finding(`item${index}`, 'finding'), rule: `rule-${index}`, title: `Action ${index + 1}`, summary: 'Long finding detail. '.repeat(45), correct: `Unique correction ${index + 1}` }));
  const pdf = await renderCombinedPdf([a11y]);
  const text = pdfText(pdf);
  const pages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.ok(pages > 3);
  assert.match(text, /Unique correction 18/);
  assert.match(text, new RegExp(`Page ${pages} of ${pages}`));
});

test('PDF rejects conflicting targets and duplicate agents instead of combining unrelated runs', async () => {
  await assert.rejects(renderCombinedPdf([]), /report/i);
  await assert.rejects(renderCombinedPdf([report('seo-ai-search'), report('seo-ai-search')]), /duplicate/i);
  const other = report('accessibility'); other.submittedUrl = 'https://other.com/';
  await assert.rejects(renderCombinedPdf([report('seo-ai-search'), other]), /same target/i);
});

test('failed collection is never summarized as a clean result', async () => {
  const failed = report('seo-ai-search');
  failed.collectionStatus = 'failed';
  failed.coverage = [{ id: 'failed', scope: { page: failed.submittedUrl }, subject: 'Page scan', status: 'unavailable', reason: 'Connection failed' }];
  const text = pdfText(await renderCombinedPdf([failed], { scope: 'all' }));
  assert.match(text, /Collection failed/);
  assert.match(text, /Connection failed/);
  assert.doesNotMatch(text, /No issues detected in completed checks/);
});


test('accessibility PDF keeps requirement tags and scanner severity separate from owner priority', async () => {
  const fixture = accessibilityReport();
  fixture.findings[0].ownerPriority = 'critical';
  const text = pdfText(await renderCombinedPdf([fixture]));
  assert.match(text, /7 items tied to accessibility requirements; 3 best-practice suggestions/);
  assert.match(text, /62 inconclusive items/);
  assert.match(text, /CRITICAL owner-supplied priority/);
  assert.match(text, /HIGH scanner severity/);
  assert.doesNotMatch(text, /HIGH priority|INFO priority/);
});
