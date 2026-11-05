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

function demo(fetch: (path: string) => Promise<Response>) {
  class Element {
    textContent = '';
    value = '';
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
  }
  const elements = new Map<string, Element>();
  function element(id: string) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  }
  element('#target-url').value = targetUrl;
  let address = new URL('http://localhost:4175/');
  runInNewContext(app, {
    document: { querySelector: element, createElement: () => new Element(), createDocumentFragment: () => new Element(), body: new Element() },
    window: { location: address, history: { replaceState: (_state: null, _title: string, url: URL) => { address = url; } }, addEventListener() {} },
    FormData: class { get() { return 'seo-ai-search'; } },
    fetch, URL, URLSearchParams, AbortController, Blob, Error,
  });
  return { element, address: () => address, submit: () => element('#run-form').handlers.get('submit')!({ preventDefault() {} }) };
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
