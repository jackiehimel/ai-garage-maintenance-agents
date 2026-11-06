import { validateRequest } from '../src/core/input.js';
import type { AgentReport, Finding } from '../src/core/types.js';

export function accessibilityReport(): AgentReport {
  const targetUrl = 'https://example.com/';
  const report: AgentReport = {
    schemaVersion: 1, runId: 'run_0123456789abcdef01234567', agentId: 'accessibility',
    submittedUrl: targetUrl, testedUrl: targetUrl, startedAt: '2026-11-05T09:00:00Z', completedAt: '2026-11-05T09:01:00Z',
    collectionStatus: 'complete', configuration: validateRequest({ agentId: 'accessibility', targetUrl }),
    runtime: { node: '24.0.0', browser: 'Chromium', engine: 'Chromium' }, evidence: [], findings: [],
    coverage: [{ id: 'coverage-test', scope: { page: targetUrl }, subject: 'Initial page', status: 'complete' }], artifacts: [],
    comparison: { status: 'first-run', reasons: [], findings: [] },
    assessment: { status: 'available', model: 'historical-model', truncated: true, sentEvidenceIds: [],
      summary: 'Historical draft: seven contrast failures in the main navigation; make text darker.', actions: [] },
    retention: { status: 'saved' }, baselineUnavailableReason: 'No comparable evidence.',
  };
  const add = (rule: string, disposition: Finding['disposition'], count: number, wcag: boolean) => {
    for (let i = 0; i < count; i++) {
      const n = report.findings.length;
      const scope = { page: targetUrl, state: 'initial', element: `#selector-${n}` };
      report.findings.push({ id: `finding-${n}`, agentId: 'accessibility', rule, scope,
        title: `Scanner ${rule}`, summary: 'Fix any of the following:\n  Raw scanner detail <img src=x onerror=alert(1)>',
        severity: disposition === 'review-needed' ? 'info' : 'high', disposition,
        evidenceIds: [`evidence-${n}`], coverageIds: ['coverage-test'] });
      report.evidence.push({ id: `evidence-${n}`, agentId: 'accessibility', kind: disposition === 'finding' ? 'axe-violation' : 'axe-incomplete',
        scope, summary: 'Raw scanner summary\n  Another line', source: { kind: 'measured', name: 'axe' },
        data: { rule, tags: wcag ? ['wcag2aa', 'wcag143'] : ['best-practice'], criteria: wcag ? ['1.4.3'] : [],
          impact: disposition === 'finding' ? 'serious' : null, target: [scope.element], html: '<span>Raw element</span>',
          observedChecks: [{ message: 'Background overlaps a pseudo-element' }] } });
    }
  };
  add('button-name', 'finding', 1, true);
  add('color-contrast', 'finding', 6, true);
  add('landmark-unique', 'finding', 1, false);
  add('region', 'finding', 2, false);
  add('color-contrast', 'review-needed', 55, true);
  add('video-caption', 'review-needed', 7, true);
  return report;
}
