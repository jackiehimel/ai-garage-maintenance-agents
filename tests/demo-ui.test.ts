import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { validateRequest } from '../src/core/input.js';
import { buildCustomerReport, buildCustomerReportWithArtifacts } from '../src/customer-report.js';
import type { AgentReport } from '../src/core/types.js';
import { accessibilityReport } from './report-fixture.js';

const app = readFileSync('public/app.js', 'utf8');
const runId = 'run_0123456789abcdef01234567';
const targetUrl = 'https://example.com/';
const report: AgentReport = {
  schemaVersion: 1, runId, agentId: 'seo-ai-search', submittedUrl: targetUrl, testedUrl: targetUrl,
  startedAt: '2026-11-05T09:00:00Z', completedAt: '2026-11-05T09:01:00Z',
  collectionStatus: 'complete', configuration: validateRequest({ agentId: 'seo-ai-search', targetUrl }),
  runtime: { node: '24.0.0', browser: 'Chromium', engine: 'Chromium' }, evidence: [], findings: [], coverage: [], artifacts: [],
  comparison: { status: 'first-run', reasons: [], findings: [] },
  assessment: { status: 'unavailable', reason: 'No model configured.' },
  retention: { status: 'saved' }, baselineUnavailableReason: 'No comparable evidence.',
};

function demo(fetch: (path: string, init?: RequestInit) => Promise<Response>, options: { agent?: string; search?: string } = {}) {
  class Element {
    textContent = '';
    value = '';
    checked = false;
    href = '';
    id = '';
    src = '';
    alt = '';
    className = '';
    files?: { size: number; name: string; text(): Promise<string> }[];
    disabled = false;
    hidden = true;
    dataset = {};
    children: Element[] = [];
    handlers = new Map<string, (event: { preventDefault(): void }) => Promise<void>>();
    get childElementCount() { return this.children.length; }
    addEventListener(type: string, handler: (event: { preventDefault(): void }) => Promise<void>) { this.handlers.set(type, handler); }
    append(...children: (Element | string)[]) {
      for (const child of children) {
        if (typeof child === 'string') this.textContent += child;
        else this.children.push(child);
      }
    }
    replaceChildren(...children: Element[]) { this.children = children; }
    setAttribute() {}
    focus() {}
    querySelectorAll() { return radios; }
  }
  const elements = new Map<string, Element>();
  function element(id: string) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  }
  const radios = ['all', 'seo-ai-search', 'accessibility', 'performance'].map(value => { const item = new Element(); item.value = value; return item; });
  const windowEvents = new Map<string, () => void>();
  element('#target-url').value = targetUrl;
  let address = new URL('http://localhost:4175/' + (options.search ?? ''));
  runInNewContext(app, {
    document: { querySelector: element, createElement: () => new Element(), createDocumentFragment: () => new Element(), body: new Element() },
    window: { location: address, history: { replaceState: (_state: null, _title: string, url: URL) => { address = url; } }, addEventListener(type: string, handler: () => void) { windowEvents.set(type, handler); } },
    FormData: class { get() { return options.agent ?? 'seo-ai-search'; } },
    fetch, URL, URLSearchParams, AbortController, Blob, Error,
  });
  const nodes = (node: Element): Element[] => [node, ...node.children.flatMap(nodes)];
  return { element, nodes: () => nodes(element('#report')), leave: () => windowEvents.get('pagehide')?.(), text: () => { const contents = (node: Element): string => [node.textContent, ...node.children.map(contents)].join(' '); return contents(element('#report')); }, links: () => { const links = (node: Element): string[] => [node.href, ...node.children.flatMap(links)].filter(Boolean); return links(element('#report')); }, address: () => address, submit: () => element('#run-form').handlers.get('submit')!({ preventDefault() {} }) };
}

test('a dropped run request labels and preserves the prior report and does not verify the new run', async () => {
  let requestCount = 0;
  const { element, address, submit } = demo(async (path) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local', browserReady: true } });
    assert.equal(path, '/api/run');
    if (requestCount++ === 0) return Response.json(report);
    throw new TypeError('Load failed');
  });
  await submit();
  const previous = element('#report').children[0];
  assert.ok(previous);
  assert.equal(address().searchParams.get('run'), runId);

  element('#target-url').value = 'https://example.org/';
  await submit();

  assert.match(element('#run-error').textContent, /could not reach the local demo service/i);
  assert.match(element('#run-error').textContent, /run was not verified/i);
  assert.doesNotMatch(element('#run-error').textContent, /Load failed/);
  assert.match(element('#run-status').textContent, /previous report/i);
  assert.equal(element('#report').hidden, false);
  assert.equal(element('#report').children[0], previous);
  assert.equal(address().searchParams.get('run'), runId);
  assert.equal(element('#run-controls').disabled, false);
});

test('a server rejection displays its reason even if startup health failed', async () => {
  const message = 'A check is already running. Wait for it to finish before starting another.';
  const { element, submit } = demo(async (path) => {
    if (path === '/api/health') throw new TypeError('Load failed');
    assert.equal(path, '/api/run');
    return Response.json({ error: message }, { status: 429 });
  });
  await setImmediate();
  assert.match(element('#runtime-state').textContent, /could not confirm.*local demo service/i);
  await submit();
  assert.equal(element('#run-error').textContent, message);
  assert.equal(element('#report').hidden, true);
});

test('an interrupted response body is reported as an unverified run', async () => {
  const { element, submit } = demo(async (path) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local', browserReady: true } });
    assert.equal(path, '/api/run');
    return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Load failed')); } }));
  });
  await submit();
  assert.match(element('#run-error').textContent, /connection.*interrupted/i);
  assert.match(element('#run-error').textContent, /run was not verified/i);
  assert.match(element('#runtime-state').textContent, /browser availability is checked during the run/i);
});


const reportFor = (agentId: AgentReport['agentId'], digit: string): AgentReport => ({
  ...report, agentId, runId: `run_${digit.repeat(24)}`,
  configuration: validateRequest({ agentId, targetUrl }),
});

test('one submission queues all agents without overlap and retains successful reports when one fails', async () => {
  const requests: Record<string, any>[] = [];
  let releaseFirst!: (response: Response) => void;
  const first = new Promise<Response>(resolve => { releaseFirst = resolve; });
  const ui = demo(async (path, init) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    if (path.startsWith('/api/report-summary?')) return Response.json(buildCustomerReport([reportFor('seo-ai-search', '1'), reportFor('performance', '3')], { scope: 'all' }));
    assert.equal(path, '/api/run');
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    if (requests.length === 1) return first;
    if (request.agentId === 'accessibility') return Response.json({ error: 'Browser could not collect accessibility evidence.' }, { status: 502 });
    return Response.json(reportFor('performance', '3'));
  }, { agent: 'all' });
  ui.element('#configuration').value = JSON.stringify({ pages: ['/about'], profile: { samples: 5 }, release: { label: 'November release' }, ownerPriorities: [{ rule: 'button-name', priority: 'high' }] });
  const baseline = { schemaVersion: 1, identity: { agentId: 'seo-ai-search' }, findings: [] };
  ui.element('#baseline-file').files = [{ size: 120, name: 'seo.json', text: async () => JSON.stringify(baseline) }];
  const pending = ui.submit();
  await setImmediate();
  assert.equal(requests.length, 1);
  assert.match(ui.text(), /Accessibility.*Queued/);
  await ui.submit();
  assert.equal(requests.length, 1, 'another submit must not start a second queue');
  releaseFirst(Response.json(reportFor('seo-ai-search', '1')));
  await pending;
  assert.deepEqual(requests.map(request => request.agentId), ['seo-ai-search', 'accessibility', 'performance']);
  assert.deepEqual(requests.map(request => request.targetUrl), [targetUrl, targetUrl, targetUrl]);
  assert.deepEqual(requests.map(request => request.profile?.samples), [undefined, undefined, 5]);
  assert.deepEqual(requests.map(request => request.baseline?.identity.agentId), ['seo-ai-search', undefined, undefined]);
  for (const request of requests) {
    assert.deepEqual(request.pages, ['/about']);
    assert.equal(request.release.label, 'November release');
    assert.deepEqual(request.ownerPriorities, [{ rule: 'button-name', priority: 'high' }]);
  }
  assert.match(ui.text(), /Accessibility.*Not assessed/);
  assert.doesNotMatch(ui.text(), /Browser could not collect accessibility evidence/);
  assert.match(ui.element('#run-status').textContent, /2 of 3 reports returned/);
  assert.match(ui.text(), /Download combined PDF/);
  assert.deepEqual(ui.links().filter(link => link.startsWith('/?run=')), [`/?run=run_${'1'.repeat(24)}`, `/?run=run_${'3'.repeat(24)}`]);
  assert.equal(ui.address().searchParams.get('runs'), `run_${'1'.repeat(24)},run_${'3'.repeat(24)}`);
  assert.equal(ui.address().searchParams.get('scope'), 'all');
  assert.equal(ui.element('#run-controls').disabled, false);
});

test('all-agent mode rejects excess performance pages before starting any agent', async () => {
  let runs = 0;
  const ui = demo(async (path) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    runs++;
    return Response.json(report);
  }, { agent: 'all' });
  ui.element('#configuration').value = JSON.stringify({ pages: ['/one', '/two', '/three'] });
  await ui.submit();
  assert.equal(runs, 0);
  assert.match(ui.element('#run-error').textContent, /three pages|3 pages/i);
  assert.equal(ui.element('#configuration').value, '{"pages":["/one","/two","/three"]}');
});

test('saved combined reports restore all three result slots and distinguish unavailable evidence from a clean result', async () => {
  const first = reportFor('seo-ai-search', '1');
  const last = reportFor('performance', '3');
  const ui = demo(async (path) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    if (path === `/api/runs/${first.runId}/report.json`) return Response.json(first);
    if (path === `/api/runs/${last.runId}/report.json`) return Response.json(last);
    if (path.startsWith('/api/report-summary?')) return Response.json(buildCustomerReport([first, last], { scope: 'all' }));
    throw new Error(`Unexpected path ${path}`);
  }, { search: `?runs=${first.runId},${last.runId}&scope=all` });
  await setImmediate();
  await setImmediate();
  assert.match(ui.element('#run-status').textContent, /2 of 3 reports returned/);
  assert.match(ui.text(), /Accessibility.*Not assessed/);
  assert.match(ui.text(), /Download combined PDF/);
  assert.equal(ui.element('#target-url').value, targetUrl);
});


test('leaving the page aborts the active combined run and never starts the remaining agents', async () => {
  let release!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  let runs = 0;
  const pendingResponse = new Promise<Response>(resolve => { release = resolve; });
  const ui = demo(async (path, init) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    runs++;
    signal = init?.signal;
    return pendingResponse;
  }, { agent: 'all' });
  const pending = ui.submit();
  await setImmediate();
  assert.equal(runs, 1);
  ui.leave();
  assert.equal(signal?.aborted, true);
  release(Response.json(reportFor('seo-ai-search', '1')));
  await pending;
  assert.equal(runs, 1);
  assert.equal(ui.address().searchParams.has('runs'), false);
  assert.doesNotMatch(ui.text(), /Download combined PDF/);
});

test('a saved combined view refuses reports from different targets', async () => {
  const first = reportFor('seo-ai-search', '1');
  const other = { ...reportFor('performance', '3'), submittedUrl: 'https://example.org/' };
  const ui = demo(async (path) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    return Response.json(path.includes(first.runId) ? first : other);
  }, { search: `?runs=${first.runId},${other.runId}&scope=all` });
  await setImmediate();
  assert.match(ui.element('#run-error').textContent, /same entered URL/);
  assert.equal(ui.element('#report').hidden, true);
});

test('performance defaults to both devices while an explicit profile remains selected', async () => {
  const requests: Record<string, any>[] = [];
  const ui = demo(async (path, init) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(reportFor('performance', '3'));
  }, { agent: 'performance' });
  await ui.submit();
  assert.equal(requests[0].profile.id, 'mobile-and-desktop-v1');
  ui.element('#configuration').value = JSON.stringify({ profile: { id: 'desktop-v1', samples: 4 } });
  await ui.submit();
  assert.deepEqual(requests[1].profile, { id: 'desktop-v1', samples: 4 });
});

test('all-agent settings keep mobile sampling and sitemap selection on their respective agents', async () => {
  const requests: Record<string, any>[] = [];
  const ui = demo(async (path, init) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    if (path.startsWith('/api/report-summary')) return Response.json({}, {status:503});
    const request=JSON.parse(String(init?.body)); requests.push(request);
    return Response.json(reportFor(request.agentId,String(requests.length)));
  }, { agent: 'all' });
  ui.element('#configuration').value = JSON.stringify({ profile: { id: 'mobile-v1', samples: 4 }, pageDiscovery: 'configured-only' });
  await ui.submit();
  assert.deepEqual(requests.map(request=>request.profile?.id), [undefined, undefined, 'mobile-v1']);
  assert.deepEqual(requests.map(request=>request.pageDiscovery), ['configured-only', undefined, undefined]);
  assert.deepEqual(requests.map(request=>request.profile?.samples), [undefined, undefined, 4]);
});

test('a missing customer-summary service preserves saved results without offering a finished customer PDF', async () => {
  const first=reportFor('seo-ai-search','1');
  let requestedSummary=false;
  const ui=demo(async path=>{
    if(path==='/api/health')return Response.json({status:'ok',runtime:{mode:'local'}});
    if(path.startsWith('/api/report-summary')){requestedSummary=true;return Response.json({error:'Internal stack failure'},{status:502});}
    return Response.json(first);
  },{search:`?runs=${first.runId}&scope=all`});
  await setImmediate(); await setImmediate();
  assert.equal(requestedSummary,true);
  assert.match(ui.text(),/saved|collected/i);
  assert.match(ui.text(),/summary.*unavailable/i);
  assert.doesNotMatch(ui.text(),/Internal stack failure|Download combined PDF|AI assessment/);
  assert.deepEqual(ui.links().filter(link=>link.startsWith('/?run=')),[`/?run=${first.runId}`]);
});

test('the customer view presents measured scores and plain findings with real images while keeping internal evidence in separate links', async () => {
  const accessibility = accessibilityReport();
  accessibility.assessment = { status: 'unavailable', reason: 'Invalid assessment text' };
  const imageId = `art_${'a'.repeat(24)}`;
  const lighthouseId = `art_${'b'.repeat(24)}`;
  const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcAAAAABJRU5ErkJggg==';
  accessibility.artifacts = [{ id: imageId, label: 'Page screenshot', mediaType: 'image/png', byteLength: 128 }];
  const performance = reportFor('performance', '3');
  performance.coverage = accessibility.coverage;
  performance.assessment = { status: 'available', model: 'live', groundingVersion: 1,
    summary: 'Measured performance interpretation', interpretation: { text: 'Loading is close to the good reference band. Prioritize the largest visible content before expanding this review.', claimIds: ['measured-performance'], evidenceIds: ['timing'] },
    actions: [], sentEvidenceIds: ['timing'], truncated: false };
  performance.artifacts = [{ id: lighthouseId, label: 'Lighthouse JSON', mediaType: 'application/json', byteLength: 1024 }];
  performance.measurements = { navigation: { pages: [{ page: targetUrl, profileId: 'desktop-v1', formFactor: 'desktop', planned: 3, succeeded: 3,
    metrics: { 'performance-score': { median: 78 }, 'largest-contentful-paint': { median: 2490 }, 'total-blocking-time': { median: 139 }, 'cumulative-layout-shift': { median: 0.00008 } },
    samples: [68, 78, 86].map(score => ({ status: 'collected', metrics: { 'performance-score': score }, artifacts: { lhr: lighthouseId } })) }] } };
  const reports = [reportFor('seo-ai-search', '1'), accessibility, performance];
  const ui = demo(async path => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    if (path.startsWith('/api/report-summary?')) return Response.json(await buildCustomerReportWithArtifacts(reports, { scope: 'all', loadArtifact: async () => Buffer.from(JSON.stringify({ audits: { 'final-screenshot': { details: { data: screenshot } } } })) }));
    return Response.json(reports.find(item => path.includes(item.runId)));
  }, { search: `?runs=${reports.map(item => item.runId).join(',')}&scope=all` });
  await setImmediate(); await setImmediate();
  assert.match(ui.text(), /78.*100/);
  assert.match(ui.text(), /screen.reader/);
  assert.match(ui.text(), /What Solvd can review next/);
  assert.match(ui.text(), /Contrast on decorative or overlay elements · 55 items/);
  assert.match(ui.text(), /Discuss these findings with Solvd/);
  assert.doesNotMatch(ui.text(), /run_[a-f0-9]{24}|#selector-|Invalid assessment|Raw scanner|Historical draft|state initial|COMPLETE/);
  assert.equal(ui.nodes().filter(node => node.className === 'verdict-card').length, 3);
  assert.equal(ui.nodes().filter(node => node.className === 'sample-row').length, 3);
  assert.ok(ui.nodes().some(node => node.src === `/api/runs/${accessibility.runId}/artifacts/${imageId}` && /page captured/i.test(node.alt)));
  assert.ok(ui.nodes().some(node => node.src === screenshot && /performance measurement/.test(node.alt)));
  assert.equal(ui.nodes().filter(node => node.className === 'customer-agent-assessment').length, 1);
  assert.match(ui.text(), /Agent assessment.*Loading is close to the good reference band/);
  assert.match(ui.text(), /Agent interpretation of the measured evidence/);
  const accessibilitySection = ui.nodes().find(node => node.id === 'customer-accessibility')!;
  const findingIndex = accessibilitySection.children.findIndex(node => node.className === 'customer-finding');
  assert.ok(findingIndex >= 0 && findingIndex < accessibilitySection.children.findIndex(node => node.className === 'customer-limits'), 'findings should precede scope limits');
});

test('leaving while the customer summary loads aborts it and prevents late results from replacing the current view', async () => {
  let release!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  const summary = new Promise<Response>(resolve => { release = resolve; });
  const reports: AgentReport[] = [];
  const ui = demo(async (path, init) => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    if (path.startsWith('/api/report-summary?')) { signal = init?.signal; return summary; }
    const request = JSON.parse(String(init?.body));
    const result = reportFor(request.agentId, String(reports.length + 1)); reports.push(result);
    return Response.json(result);
  }, { agent: 'all' });
  const pending = ui.submit(); await setImmediate();
  assert.ok(signal);
  const visible = ui.text();
  ui.leave();
  assert.equal(signal.aborted, true);
  release(Response.json(buildCustomerReport(reports, { scope: 'all' })));
  await pending;
  assert.equal(ui.text(), visible);
  assert.doesNotMatch(ui.text(), /Download combined PDF/);
});

test('saved combined links restore SEO discovery and the selected performance profile regardless of report order', async () => {
  const seo = reportFor('seo-ai-search', '1');
  seo.configuration = validateRequest({ agentId: seo.agentId, targetUrl, pageDiscovery: 'sitemap-sample' });
  const performance = reportFor('performance', '3');
  performance.configuration = validateRequest({ agentId: performance.agentId, targetUrl, profile: { id: 'mobile-v1', samples: 4 } });
  const ui = demo(async path => {
    if (path === '/api/health') return Response.json({ status: 'ok', runtime: { mode: 'local' } });
    if (path.startsWith('/api/report-summary?')) return Response.json(buildCustomerReport([performance, seo], { scope: 'all' }));
    return Response.json(path.includes(performance.runId) ? performance : seo);
  }, { search: `?runs=${performance.runId},${seo.runId}&scope=all` });
  await setImmediate(); await setImmediate();
  const configuration = JSON.parse(ui.element('#configuration').value);
  assert.deepEqual(configuration.profile, { id: 'mobile-v1', samples: 4 });
  assert.equal(configuration.pageDiscovery, 'sitemap-sample');
});

test('the web report states measured phone timing and shows one shared verification for combined performance findings', async () => {
  const performance=reportFor('performance','3');performance.coverage=accessibilityReport().coverage;
  performance.measurements={navigation:{pages:['mobile','desktop'].map((device,index)=>({page:targetUrl,formFactor:device,profileId:`${device}-v1`,planned:3,succeeded:3,
    metrics:{'performance-score':{median:index?81:55},'largest-contentful-paint':{median:index?3268:6845}},samples:[{status:'collected',metrics:{'performance-score':index?81:55},diagnostics:['image-delivery-insight','render-blocking-insight','network-dependency-tree-insight'].map(id=>({id,score:0.5,resources:[{url:`https://example.com/${device}.css`,durationMs:index?100:300}]}))}]}))}};
  const reports=[reportFor('seo-ai-search','1'),accessibilityReport(),performance];
  const ui=demo(async path=>path==='/api/health'?Response.json({status:'ok',runtime:{mode:'local'}}):path.startsWith('/api/report-summary?')?Response.json(buildCustomerReport(reports,{scope:'all'})):Response.json(reports.find(r=>path.includes(r.runId))),{search:`?runs=${reports.map(r=>r.runId).join(',')}&scope=all`});
  await setImmediate();await setImmediate();
  const card=ui.nodes().find(node=>node.className==='verdict-card'&&node.children.some(child=>child.textContent==='Performance'))!;
  assert.ok(card.children.some(node=>/On phones.*6.8 s.*desktop 3.3 s/.test(node.textContent)));
  const section=ui.nodes().find(node=>node.id==='customer-performance')!;
  assert.equal(section.children.filter(node=>node.className==='customer-finding').length,3);
  assert.equal(section.children.filter(node=>node.className==='finding-check').length,1);
  assert.doesNotMatch(ui.text(),/Effort:/);
});
