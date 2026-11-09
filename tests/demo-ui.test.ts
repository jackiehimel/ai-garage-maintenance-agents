import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { validateRequest } from '../src/core/input.js';
import type { AgentReport } from '../src/core/types.js';

const app = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
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
  return { element, leave: () => windowEvents.get('pagehide')?.(), text: () => { const contents = (node: Element): string => [node.textContent, ...node.children.map(contents)].join(' '); return contents(element('#report')); }, links: () => { const links = (node: Element): string[] => [node.href, ...node.children.flatMap(links)].filter(Boolean); return links(element('#report')); }, address: () => address, submit: () => element('#run-form').handlers.get('submit')!({ preventDefault() {} }) };
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
  assert.match(ui.text(), /Browser could not collect accessibility evidence/);
  assert.match(ui.text(), /2 of 3 reports returned/);
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
    throw new Error(`Unexpected path ${path}`);
  }, { search: `?runs=${first.runId},${last.runId}&scope=all` });
  await setImmediate();
  await setImmediate();
  assert.match(ui.text(), /2 of 3 reports returned/);
  assert.match(ui.text(), /Accessibility.*No report available/);
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
