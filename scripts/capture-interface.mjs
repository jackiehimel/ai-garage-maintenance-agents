import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

// Capture the unchanged public/ interface served by the actual compiled server.
// No interception, synthetic reports, provider keys, or modified UI assets.
const destination = resolve('acceptance-artifacts/interface');
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
    captures.push({ file, viewport, allThreeChoices: true, initialReportVisible: false, scriptErrors: errors });
    await page.close();
  }
  await writeFile(resolve(destination, 'capture-manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local-unverified', browser: browser.version(), source: 'Actual compiled src/server.ts and unchanged public/ assets', assessment: 'No collection requested; no AI provider credentials supplied', captures }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(resolve(destination, 'server.log'), log.join(''));
}
