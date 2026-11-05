import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRequest } from '../src/core/input.js';
import { browserRequestTarget, chromiumEgressArgs, connectTarget, createBrowserRequestBudget, createDocumentScope, manageBrowserShutdown, pinBrowserConnect } from '../src/core/browser.js';

test('blocks direct HTTP methods, proxy authorities that could bypass DNS validation, and unauthorized ports', () => {
  assert.throws(() => browserRequestTarget('POST','http://public.example.com/checkout','public.example.com'),/GET|method/i);
  assert.throws(() => browserRequestTarget('GET','http://other.example.com/','public.example.com'),/authority|host/i);
  assert.throws(() => browserRequestTarget('GET','http://169.254.169.254/','169.254.169.254'),/URL|hostname/i);
  assert.throws(() => connectTarget('public.example.com:444','public.example.com:444'),/port/i);
  assert.throws(() => connectTarget('169.254.169.254:443','169.254.169.254:443'),/URL|hostname/i);
  assert.throws(() => connectTarget('public.example.com:443','other.example.com:443'),/authority/i);
  assert.equal(connectTarget('public.example.com:443','public.example.com:443').href,'https://public.example.com/');
});

test('allows the first www canonical target but locks future documents and leaves public subresources available', () => {
  const scope = createDocumentScope('https://example.com/');
  assert.doesNotThrow(() => scope.assert(new URL('https://www.example.com/'),true));
  assert.throws(() => scope.assert(new URL('https://other.example.com/'),true),/origin/i);
  assert.doesNotThrow(() => scope.assert(new URL('https://cdn.example.net/style.css'),false));
  assert.throws(() => createDocumentScope('https://www.example.com/').assert(new URL('https://www.www.example.com/'),true),/origin/i);
  scope.lock('https://www.example.com/');
  assert.throws(() => scope.assert(new URL('https://example.com/'),true),/origin/i);
  assert.doesNotThrow(() => scope.assert(new URL('https://www.example.com/about'),true));
});

test('browser CONNECT does not permit mixed public and private DNS answers', async () => {
  await assert.rejects(pinBrowserConnect('cdn.example.com:443','cdn.example.com:443',async () => [
    {address:'8.8.8.8',family:4},{address:'192.168.1.3',family:4},
  ]),/non-public/i);
  const pinned = await pinBrowserConnect('cdn.example.com:443','cdn.example.com:443',async () => [{address:'8.8.8.8',family:4}]);
  assert.equal(pinned.address,'8.8.8.8');
});

test('requests sharing a tunnel and redirect hops consume distinct slots and stop browser egress', () => {
  const budget = createBrowserRequestBudget(3);
  let stops = 0;
  budget.signal.addEventListener('abort',() => stops++);
  assert.equal(budget.observe('data:text/plain,embedded'),true);
  assert.equal(budget.observe('https://public.example.com/'),true);
  assert.equal(budget.observe('https://public.example.com/after-redirect'),true);
  assert.equal(budget.observe('https://public.example.com/style.css'),true);
  assert.equal(budget.observe('https://public.example.com/style.css'),false);
  assert.equal(budget.observe('https://cdn.example.com/another'),false);
  assert.equal(budget.count(),3);
  assert.match(budget.signal.reason.message,/request count limit/i);
  assert.equal(stops,1);
});

test('aborting during setup stops Chromium before releasing egress, including an already aborted run', async () => {
  for (const abortBeforeInstall of [true,false]) {
    const controller = new AbortController();
    const events: string[] = [];
    if (abortBeforeInstall) controller.abort();
    const close = manageBrowserShutdown({signal:controller.signal,close:async () => { events.push('released'); }}, async () => {
      events.push('browser closed');
    });
    if (!abortBeforeInstall) controller.abort();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(events,['browser closed','released']);
    await close();
    assert.deepEqual(events,['browser closed','released']);
  }
});

test('the common Chromium launch configuration blocks SharedWorkers and declares the coverage restriction', () => {
  const args = chromiumEgressArgs('http://127.0.0.1:43210');
  assert.ok(args.includes('--disable-shared-workers'));
  assert.ok(args.includes('--proxy-server=http://127.0.0.1:43210'));
  const {profile} = validateRequest({agentId:'performance',targetUrl:'https://public.example.com/'});
  assert.equal(profile.sharedWorkers,'blocked');
});
