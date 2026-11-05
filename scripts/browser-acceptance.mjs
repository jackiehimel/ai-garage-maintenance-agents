import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import puppeteer from 'puppeteer-core';
import lighthouse, { desktopConfig } from 'lighthouse';
import { runAgent } from '../dist/app/run.js';
import { renderReport } from '../dist/app/report.js';
import { collectSeoEvidence } from '../dist/app/agents/seo.js';
import { assembleAccessibilityResult, publicAccessibilityGuardScript } from '../dist/app/agents/accessibility.js';
import { navigationMetrics, summarizeNavigationPage, LAB_METRICS } from '../dist/app/agents/performance-measurements.js';
import { createPublicHttpClient } from '../dist/app/core/network.js';
import { createArtifactId } from '../dist/app/core/store.js';
import { createEvidence } from '../dist/app/core/evidence.js';
import { fixtureOrigin, fixturePage, fixtureResponse } from '../fixtures/browser/page.mjs';

const root = resolve('acceptance-artifacts/fixtures');
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const playwrightVersion = (await import('playwright/package.json', { with: { type: 'json' } })).default.version;
const puppeteerVersion = (await import('puppeteer-core/package.json', { with: { type: 'json' } })).default.version;
const limitation = 'Isolated test transport: actual sandboxed Chromium/axe/Lighthouse, existing evaluators and runAgent collector injection. Does not exercise production protected egress, full collectAccessibility state setup, or full collectPerformance orchestration. No public-network fixture or live AI claim.';
const chromeArgs = ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', '--disable-shared-workers'];
await mkdir(root, { recursive: true });
const manifest = { commit: process.env.GITHUB_SHA || 'local-unverified', startedAt: new Date().toISOString(), limitation, checks: [], failures: [] };
const save = (path, value) => writeFile(resolve(root, path), JSON.stringify(value, null, 2));
let playwrightBrowser;
let performanceBrowser;

async function fixtureContext(agent, phase, profile) {
  playwrightBrowser ??= await chromium.launch({ executablePath, headless: true, chromiumSandbox: true, args: chromeArgs });
  const context = await playwrightBrowser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, locale: profile.locale, timezoneId: profile.timezoneId, serviceWorkers: 'block', ignoreHTTPSErrors: false });
  await context.route('**/*', async route => {
    const response = fixtureResponse(route.request().url(), agent, phase);
    if (!response || !['GET', 'HEAD'].includes(route.request().method())) return route.abort('blockedbyclient');
    await route.fulfill(response);
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(10_000);
  return context;
}

async function seo(request, phase) {
  const context = await fixtureContext(request.agentId, phase, request.profile);
  const client = createPublicHttpClient({
    // No DNS lookup/socket occurs: this documented seam feeds the bounded HTTP parser.
    resolve: async () => [{ address: '93.184.215.14', family: 4 }],
    transport: async ({ url }) => {
      const response = fixtureResponse(url.href, request.agentId, phase);
      assert(response, 'Source transport escaped fixture origin');
      return { status: response.status, headers: { 'content-type': response.contentType }, body: Readable.from([response.body]) };
    },
  });
  try {
    const result = await collectSeoEvidence(request, client, async () => ({
      browser: playwrightBrowser.version(), driver: playwrightVersion,
      capture: async url => {
        const page = await context.newPage();
        try {
          if (phase === 'incomplete') {
            await page.route('**/*', route => route.abort('failed'));
            await assert.rejects(page.goto(url), /net::ERR_FAILED/);
            throw new Error('Observed injected fixture navigation failure; rendered document unavailable');
          }
          const response = await page.goto(url, { waitUntil: 'load' });
          assert(response);
          return { url: page.url(), status: response.status(), redirects: [], headers: response.headers(), html: await page.content(), diagnostics: [], finalConfirmed: true };
        } finally { await page.close(); }
      },
      close: async () => {},
    }));
    for (const item of result.evidence) item.source.name = item.source.name === 'Protected Chromium' ? 'Isolated sandboxed Chromium fixture transport' : 'Isolated fixture HTTP transport (no public egress)';
    result.diagnostics.push(limitation);
    return result;
  } finally { client.close(); await context.close(); }
}

async function accessibility(request, phase) {
  const context = await fixtureContext(request.agentId, phase, request.profile);
  const scans = [];
  let engine;
  try {
    for (const state of [undefined, ...request.states]) {
      const page = await context.newPage();
      const guardKey = '__fixtureReadOnlyGuard';
      await page.addInitScript({ content: publicAccessibilityGuardScript(guardKey) });
      const response = await page.goto(request.targetUrl, { waitUntil: 'load' });
      assert(response?.ok());
      const scan = { scope: { page: request.targetUrl, state: state?.id || 'initial' }, navigation: { status: 'complete', testedUrl: page.url(), httpStatus: response.status() }, readiness: { status: 'complete', data: { isolatedFixture: true } } };
      scans.push(scan);
      if (state) {
        const steps = [];
        const focus = () => page.evaluate(name => window[name].read().focus, guardKey);
        for (const [offset, step] of state.steps.entries()) {
          const before = await focus();
          let actual;
          if (step.action === 'key') { await page.keyboard.press(step.key); actual = true; }
          else if (step.action === 'assert-focus') actual = await page.evaluate(selector => document.activeElement?.matches(selector) || false, step.selector);
          else throw new Error('Fixture only implements its declared key/assert-focus steps');
          const passed = actual === true;
          steps.push({ index: offset + 1, step, status: passed ? 'passed' : 'failed', evaluated: true, actual, focusBefore: before, focusAfter: await focus(), ...(!passed ? { reason: 'Observed focus did not match fixture keyboard target' } : {}) });
        }
        scan.keyboard = { status: steps.every(step => step.status === 'passed') ? 'complete' : 'incomplete', steps };
        if (scan.keyboard.status !== 'complete') scan.keyboard.reason = 'Observed fixture focus assertion failed';
      }
      if (!scan.keyboard || scan.keyboard.status === 'complete') {
        scan.axe = await new AxeBuilder({ page }).analyze();
        engine = `${scan.axe.testEngine.name} ${scan.axe.testEngine.version}`;
      }
      await page.screenshot({ path: resolve(root, `accessibility-${phase}-${scan.scope.state}.png`) });
      await page.close();
    }
    assert(engine, 'No actual axe result was collected');
    const result = assembleAccessibilityResult(request, { node: process.version, browser: playwrightBrowser.version(), browserDriver: playwrightVersion, engine }, request.targetUrl, scans, [limitation]);
    for (const item of result.evidence) if (item.source.name === 'Protected Playwright browser') item.source.name = 'Isolated sandboxed Chromium fixture transport';
    return result;
  } finally { await context.close(); }
}

async function performance(request, phase) {
  // The real Lighthouse navigation runner owns each fresh page in this serial lane.
  performanceBrowser ??= await puppeteer.launch({ executablePath, headless: true, defaultViewport: null, args: chromeArgs, acceptInsecureCerts: false, protocolTimeout: 30_000 });
  const samples = [], artifacts = [], evidence = [];
  let engine;
  for (let index = 1; index <= request.profile.samples; index++) {
    const context = await performanceBrowser.createBrowserContext();
    const page = await context.newPage();
    await page.setBypassServiceWorker(true);
    await page.emulateTimezone(request.profile.timezoneId);
    await page.setRequestInterception(true);
    const failed = phase === 'incomplete' && index === 2;
    let injectionObserved = false;
    page.on('request', resource => {
      void (async () => {
        if (resource.isInterceptResolutionHandled()) return;
        const response = fixtureResponse(resource.url(), request.agentId, phase);
        if (!response || !['GET', 'HEAD'].includes(resource.method())) return resource.abort('blockedbyclient');
        if (failed && resource.isNavigationRequest()) { injectionObserved = true; return resource.abort('failed'); }
        await resource.respond(response);
      })().catch(error => { manifest.failures.push(`Fixture transport: ${error.message}`); });
    });
    let runner;
    try {
      runner = await lighthouse(request.targetUrl, {
        output: 'json', logLevel: 'error', onlyCategories: ['performance'], locale: request.profile.locale,
        throttlingMethod: 'simulate', throttling: { rttMs: 40, throughputKbps: 10_240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
        screenEmulation: { mobile: false, disabled: false, ...request.profile.viewport, deviceScaleFactor: request.profile.deviceScaleFactor },
        maxWaitForFcp: 10_000, maxWaitForLoad: 15_000, disableFullPageScreenshot: true, skipAudits: ['interaction-to-next-paint', 'bf-cache'],
      }, desktopConfig, page);
      assert(runner, 'Lighthouse returned no result');
      engine = `Lighthouse ${runner.lhr.lighthouseVersion}`;
      if (runner.lhr.runtimeError) throw new Error(`${runner.lhr.runtimeError.code}: ${runner.lhr.runtimeError.message}`);
      assert.equal(runner.lhr.gatherMode, 'navigation');
      assert.equal(runner.lhr.finalDisplayedUrl, request.targetUrl);
      assert(!failed, 'Injected navigation failure unexpectedly completed');
      const metrics = navigationMetrics(runner.lhr);
      assert.equal(Object.keys(metrics).length, Object.keys(LAB_METRICS).length, 'Fixture missing supported metrics');
      const workload = await page.evaluate(() => window.fixtureEvidence);
      assert.equal(workload.phase, phase);
      if (phase === 'before') assert(workload.observedBusyMs >= 2200, 'Known main-thread workload was not observed');
      samples.push({ index, status: 'collected', testedUrl: runner.lhr.finalDisplayedUrl, metrics, workload, warnings: runner.lhr.runWarnings });
    } catch (error) {
      samples.push({ index, status: 'failed', reason: error.message, injectedNavigationFailureObserved: injectionObserved });
      if (!failed) manifest.failures.push(`Lighthouse ${phase} sample ${index}: ${error.message}`);
      else assert(injectionObserved, 'Intended navigation failure did not occur');
    } finally {
      if (runner) {
        for (const [name, value] of [['lhr', runner.lhr], ['trace', runner.artifacts.Trace], ['devtools-log', runner.artifacts.DevtoolsLog]]) {
          if (value === undefined) continue;
          const id = createArtifactId();
          artifacts.push({ id, label: `${phase} sample ${index} ${name}`, mediaType: name === 'lhr' ? 'application/json' : 'application/gzip', scope: { page: request.targetUrl }, bytes: name === 'lhr' ? JSON.stringify(value) : gzipSync(JSON.stringify(value)) });
          samples.at(-1).artifacts ??= {};
          samples.at(-1).artifacts[name] = id;
        }
      }
      await context.close();
    }
    const sample = samples.at(-1);
    evidence.push(createEvidence({ agentId: request.agentId, kind: 'fixture-navigation-sample', scope: { page: request.targetUrl }, key: String(index), summary: `Actual Lighthouse fixture navigation sample ${index}: ${sample.status}`, source: { kind: 'measured', name: 'Lighthouse navigation via isolated test transport', observedAt: runner?.lhr.fetchTime || new Date().toISOString() }, data: sample, artifactIds: Object.values(sample.artifacts || {}) }));
  }
  const summarized = summarizeNavigationPage(request.targetUrl, request.profile.samples, samples);
  assert.equal(summarized.attempted, 3);
  if (phase === 'incomplete') { assert.equal(summarized.failed, 1); assert.equal(summarized.succeeded, 2); }
  else assert.equal(summarized.succeeded, 3, 'Every ordinary phase requires three real samples');
  assert(engine, 'No actual Lighthouse engine version observed');
  return { testedUrl: request.targetUrl, runtime: { node: process.version, browser: await performanceBrowser.version(), browserDriver: `Puppeteer CDP ${puppeteerVersion}`, engine }, coverage: [{ id: 'fixture-performance-samples', scope: { page: request.targetUrl }, subject: 'Isolated Lighthouse navigation fixture samples', status: summarized.succeeded === 3 ? 'complete' : 'incomplete', data: { planned: 3, attempted: summarized.attempted, succeeded: summarized.succeeded, failed: summarized.failed, notRun: summarized.notRun } }], findings: [], evidence, artifacts, diagnostics: [limitation, 'Navigation TBT is not INP. Changes remain inconclusive when spread or incomplete sampling prevents classification.'], measurements: { navigation: { method: 'lighthouse-navigation', policyVersion: 1, pages: [summarized], isolatedFixture: true, profile: request.profile, knownChange: 'Removed an observed 2200 ms main-thread task after initial paint; measured metric deltas are retained without requiring a noise-free improvement.' } } };
}

const collectors = { 'seo-ai-search': seo, accessibility, performance };
async function reportFor(agentId, phase, baseline) {
  const request = { agentId, targetUrl: `${fixtureOrigin}/${agentId}`, ...(baseline ? { baseline } : {}),
    ...(agentId === 'seo-ai-search' ? { indexIntent: [{ page: `/${agentId}`, intended: 'indexable' }] } : {}),
    ...(agentId === 'accessibility' ? { states: [{ id: 'keyboard', page: `/${agentId}`, steps: [{ action: 'key', key: 'Tab' }, { action: 'key', key: 'Tab' }, { action: 'key', key: 'Tab' }, { action: 'assert-focus', selector: '#keyboard-target' }] }] } : {}),
  };
  const report = await runAgent(request, { assessment: 'off', storageRoot: resolve(root, 'runs'), collector: validated => collectors[agentId](validated, phase) });
  await save(`${agentId}-${phase}.json`, report);
  await writeFile(resolve(root, `${agentId}-${phase}.html`), renderReport(report));
  assert.equal(report.assessment.status, 'unavailable');
  assert.equal(report.retention.status, 'saved', report.retention.reason);
  assert(report.baseline, report.baselineUnavailableReason);
  assert(report.evidence.length);
  return report;
}

function change(report, rule, element, state) {
  return report.comparison.findings.find(entry => {
    const finding = entry.before || entry.after;
    return finding.rule === rule && (element === undefined || finding.scope.element === element) && (state === undefined || finding.scope.state === state);
  });
}

try {
  for (const agentId of Object.keys(collectors)) {
    try {
    // No public reports, baselines, or numeric measurements are imported as fixtures.
    await writeFile(resolve(root, `${agentId}-before-input.html`), fixturePage(agentId, 'before'));
    await writeFile(resolve(root, `${agentId}-after-input.html`), fixturePage(agentId, 'after'));
    const before = await reportFor(agentId, 'before');
    assert.equal(before.comparison.status, 'first-run');
    const after = await reportFor(agentId, 'after', before.baseline);
    assert.equal(after.comparison.status, 'compatible');
    const incomplete = await reportFor(agentId, 'incomplete', before.baseline);
    assert.equal(incomplete.comparison.status, 'compatible');
    if (agentId === 'seo-ai-search') {
      assert.equal(change(after, 'seo.noindex')?.status, 'resolved');
      assert.equal(change(after, 'seo.structured-data-invalid')?.status, 'new');
      assert.equal(change(incomplete, 'seo.noindex')?.status, 'inconclusive');
    } else if (agentId === 'accessibility') {
      assert.equal(change(after, 'button-name', '#repair', 'keyboard')?.status, 'resolved');
      assert.equal(change(after, 'button-name', '#persistent', 'keyboard')?.status, 'persistent');
      assert.equal(change(after, 'image-alt', '#new-image', 'keyboard')?.status, 'new');
      assert.equal(change(incomplete, 'button-name', '#repair', 'keyboard')?.status, 'inconclusive');
      assert(!incomplete.comparison.findings.some(entry => entry.status === 'resolved' && entry.before?.scope.state === 'keyboard'), 'Failed keyboard scope must not resolve prior findings');
    } else {
      assert.equal(after.comparison.metrics.length, 6);
      assert(incomplete.comparison.metrics.every(entry => entry.status === 'inconclusive'));
      await save('performance-observed-deltas.json', { knownChange: after.measurements.navigation.knownChange, metrics: after.comparison.metrics, conclusion: 'Classifications reflect real distributions. No fixed improvement or causation is asserted.' });
    }
    const incompatibleBaseline = structuredClone(before.baseline);
    incompatibleBaseline.identity.runtime.browser += '-deliberately-incompatible';
    // Reuse actual after measurements only to test baseline compatibility, explicitly labeled.
    const incompatible = await runAgent({ ...after.configuration, baseline: incompatibleBaseline }, { assessment: 'off', collector: async () => ({ testedUrl: after.testedUrl, runtime: after.runtime, coverage: after.coverage, evidence: after.evidence, findings: after.findings, measurements: after.measurements, artifacts: [], diagnostics: [limitation, 'Compatibility-only replay of the retained after measurements; no new browser run.'] }) });
    assert.equal(incompatible.comparison.status, 'incompatible');
    await save(`${agentId}-incompatible-replay.json`, incompatible);
    manifest.checks.push({ agentId, before: before.runId, after: after.runId, incomplete: incomplete.runId, beforeStatus: before.collectionStatus, afterStatus: after.collectionStatus, incompleteStatus: incomplete.collectionStatus, compatibilityReplay: incompatible.comparison.status, checksPassed: true });
    } catch (error) {
      manifest.failures.push(`${agentId}: ${error.stack || error.message}`);
      manifest.checks.push({ agentId, checksPassed: false, reason: error.message });
    } finally {
      // Keep Lighthouse exclusive even if another fixture's assertions fail.
      if (agentId === 'accessibility') { await playwrightBrowser?.close(); playwrightBrowser = undefined; }
    }
  }
  assert.deepEqual(manifest.failures, []);
  manifest.status = 'passed-with-declared-scope-limitations';
} catch (error) {
  manifest.status = 'failed';
  manifest.failures.push(error.stack || error.message);
  throw error;
} finally {
  manifest.completedAt = new Date().toISOString();
  await Promise.allSettled([playwrightBrowser?.close(), performanceBrowser?.close()]);
  await save('acceptance-manifest.json', manifest);
}
