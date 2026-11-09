import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPdfReports } from '../src/pdf-download.js';
import { accessibilityReport } from './report-fixture.js';

const first = 'run_0123456789abcdef01234567';
const second = 'run_1123456789abcdef01234567';

test('PDF download rejects invalid IDs before reading any saved report', async () => {
  for (const query of ['runs=../../secret', `runs=${first},${first}`, 'runs=', `runs=${first}&scope=unknown`]) {
    await assert.rejects(loadPdfReports(new URLSearchParams(query), async () => { assert.fail('must not read'); }), /Invalid/);
  }
});

test('PDF download refuses to combine different targets or two runs of one agent', async () => {
  const a = accessibilityReport();
  const b = {...a, runId:second};
  const params = new URLSearchParams({runs:`${first},${second}`,scope:'all'});
  await assert.rejects(loadPdfReports(params, async id => id === first ? a : b), /one report per agent/);
  await assert.rejects(loadPdfReports(params, async id => id === first ? a : {...b,agentId:'performance',submittedUrl:'https://different.org/'}), /same submitted URL/);
});

test('PDF download keeps all scope when only one report is available', async () => {
  const report = accessibilityReport();
  const result = await loadPdfReports(new URLSearchParams({runs:first,scope:'all'}), async () => report);
  assert.equal(result.scope,'all');
  assert.deepEqual(result.reports,[report]);
});

test('PDF download rejects unavailable or mismatched saved reports', async () => {
  await assert.rejects(loadPdfReports(new URLSearchParams({runs:first}), async () => undefined), /unavailable/);
  await assert.rejects(loadPdfReports(new URLSearchParams({runs:first}), async () => ({...accessibilityReport(),runId:second})), /unavailable/);
});
