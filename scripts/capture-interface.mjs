import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

// Capture the unchanged public/ interface served by the actual compiled server.
// No interception, synthetic reports, provider keys, or modified UI assets.
const destination = resolve('acceptance-artifacts/interface');
const captureAgent = process.env.CAPTURE_AGENT;
if (captureAgent) assert(['seo-ai-search', 'accessibility', 'performance'].includes(captureAgent), 'Unsupported CAPTURE_AGENT');
await mkdir(destination, { recursive: true });
const port = 4175;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/app/server.js'], {
  env: { ...process.env, PORT: String(port), BROWSER_RUNTIME: 'local', RUN_STORAGE_ROOT: resolve('acceptance-artifacts/interface-runs'), ANTHROPIC_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
server.stdout.on('data', chunk => log.push(String(chunk)));
server.stderr.on('data', chunk => log.push(String(chunk)));
let browser;
try {
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${log.join('')}`);
    try { healthy = (await fetch(`${origin}/api/health`)).ok; } catch { /* Startup only. */ }
    if (healthy) break;
    await delay(100);
  }
  assert(healthy, 'Compiled server did not become ready');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, chromiumSandbox: true });
  const captures = [];
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1100 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('input[name="agent"]').count(), 3);
    for (const value of ['seo-ai-search', 'accessibility', 'performance']) {
      assert(await page.locator(`input[name="agent"][value="${value}"]`).count());
    }
    assert.equal(await page.locator('#report').isVisible(), false, 'Initial UI must not show fabricated results');
    await page.locator('#runtime-state').filter({ hasText: 'Collection is configured to run on the local server.' }).waitFor();
    assert.deepEqual(errors, [], 'UI script errors');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(destination, file), fullPage: true });
    if (name === 'desktop' && !captureAgent) {
      const jpeg = await page.screenshot({ path: resolve(destination, 'desktop.jpg'), type: 'jpeg', quality: 65, fullPage: true });
      // Exact image bytes for clients that can read job logs but cannot download
      // binary artifacts. This is only the initial UI, with no reports or secrets.
      console.log('MAINTENANCE_SCREENSHOT_BEGIN');
      console.log(jpeg.toString('base64'));
      console.log('MAINTENANCE_SCREENSHOT_END');
    }
    captures.push({ file, viewport, allThreeChoices: true, initialReportVisible: false, scriptErrors: errors });
    await page.close();
  }
  if (captureAgent) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator(`input[name="agent"][value="${captureAgent}"]`).check();
    await page.locator('#target-url').fill('https://www.solvd.com/');
    const returned = page.waitForResponse(response => response.url() === `${origin}/api/run` && response.request().method() === 'POST', { timeout: 670_000 });
    await page.locator('#run-button').click();
    const response = await returned;
    assert(response.ok(), `Live UI request returned HTTP ${response.status()}: ${await response.text()}`);
    const report = await response.json();
    assert.equal(report.agentId, captureAgent);
    assert.equal(report.submittedUrl, 'https://www.solvd.com/');
    assert.equal(report.assessment.status, 'unavailable', 'This CI job supplies no model credentials');
    assert(report.coverage.length > 0, 'A real returned run must describe observed or unavailable coverage');
    assert(report.coverage.some(entry => ['complete', 'incomplete', 'unavailable'].includes(entry.status)), 'No meaningful collection coverage status');
    await page.locator('#report-title').waitFor();
    await page.locator('#assessment').getByText('Assessment unavailable.', { exact: true }).waitFor();
    const jsonResponse = await fetch(`${origin}/api/runs/${report.runId}/report.json`);
    assert(jsonResponse.ok());
    assert.deepEqual(await jsonResponse.json(), report, 'JSON export must match UI response');
    const htmlResponse = await fetch(`${origin}/api/runs/${report.runId}/report.html`);
    assert(htmlResponse.ok());
    const html = await htmlResponse.text();
    assert(html.includes(report.runId), 'HTML export must identify the same run');
    assert(html.includes('Assessment unavailable.'), 'HTML must disclose unavailable AI');
    await writeFile(resolve(destination, `${captureAgent}-report.json`), JSON.stringify(report, null, 2));
    await writeFile(resolve(destination, `${captureAgent}-report.html`), html);
    for (const artifact of report.artifacts) {
      const exported = await fetch(`${origin}/api/runs/${report.runId}/artifacts/${artifact.id}`);
      assert(exported.ok(), `Retained raw artifact unavailable: ${artifact.id}`);
      await writeFile(resolve(destination, artifact.id), Buffer.from(await exported.arrayBuffer()));
    }
    await page.locator('#report-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(destination, `${captureAgent}-report-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#report-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(destination, `${captureAgent}-report-mobile.png`) });
    captures.push({ agentId: captureAgent, runId: report.runId, collectionStatus: report.collectionStatus, evidenceCount: report.evidence.length, coverage: report.coverage.map(({ subject, status, reason }) => ({ subject, status, reason })), assessment: report.assessment });
    await page.close();
  }
  await writeFile(resolve(destination, 'capture-manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local-unverified', browser: browser.version(), source: 'Actual compiled src/server.ts and unchanged public/ assets', assessment: captureAgent ? 'Real public-page collection; AI unavailable because no provider credentials are supplied' : 'No collection requested; no AI provider credentials supplied', captures }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(resolve(destination, 'server.log'), log.join(''));
}
