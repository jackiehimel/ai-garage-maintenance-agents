import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRequest } from '../src/core/input.js';
import http from 'node:http';
import net from 'node:net';
import { browserRequestTarget, chromiumEgressArgs, connectTarget, createBrowserRequestBudget, createDocumentScope, manageBrowserShutdown, pinBrowserConnect, createBrowserFailureDiagnostics, protectRedirects, protectBrowserRoute, startBrowserEgress } from '../src/core/browser.js';

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


test('request failure identities redact credentials, queries, fragments and bound retained records', () => {
  const store = createBrowserFailureDiagnostics(2);
  store.record({method:'POST',url:'https://user:secret@example.com/api?token=private#private',resourceType:'fetch',mainDocument:false,reason:'Denied https://example.com/api?secret=private#private'});
  store.record({method:'GET',url:'invalid?secret=private',resourceType:'script',mainDocument:false,reason:'failed'});
  store.record({method:'GET',url:'https://example.com/third',resourceType:'document',mainDocument:true,reason:'failed'});
  const result = store.snapshot();
  assert.equal(result.failures[0].url,'https://example.com/api');
  assert.equal(result.failures[0].reason,'Denied https://example.com/api');
  assert.equal(result.failures[1].url,'[unavailable]');
  assert.equal(result.overflow,1);
  assert.doesNotMatch(JSON.stringify(result),/private|secret|user:/);
  result.failures.length = 0;
  assert.equal(store.snapshot().failures.length,2);
});

test('both browser interception paths retain blocked request identity without permitting it', async () => {
  const store = createBrowserFailureDiagnostics();
  const messages: string[] = [];
  let listener: (event: unknown) => void = () => {};
  const commands: string[] = [];
  const cdp = {send:async (command: string) => { commands.push(command); return {frameTree:{frame:{id:'main'}}}; },on:(_name: string,fn: typeof listener) => { listener = fn; }};
  await protectRedirects({newCDPSession:async () => cdp} as never,{} as never,createDocumentScope('https://example.com'),new AbortController().signal,m => messages.push(m),failure => store.record(failure));
  listener({request:{method:'POST',url:'https://example.com/submit?token=hidden#hidden'},resourceType:'Document',frameId:'main',requestId:'id'});
  await new Promise<void>(resolve => setImmediate(resolve));
  let aborted = false, continued = false;
  const request = {method:() => 'POST',url:() => 'https://other.example.com/api?token=hidden',resourceType:() => 'fetch',isNavigationRequest:() => false};
  await protectBrowserRoute({request:() => request,abort:async () => { aborted = true; },continue:async () => { continued = true; }} as never,new Set(),createDocumentScope('https://example.com'),new AbortController().signal,m => messages.push(m),failure => store.record(failure));
  assert.ok(commands.includes('Fetch.failRequest'));
  assert.ok(!commands.includes('Fetch.continueRequest'));
  assert.ok(aborted);
  assert.equal(continued,false);
  assert.deepEqual(store.snapshot().failures.map(({method,url,resourceType,mainDocument,reason}) => ({method,url,resourceType,mainDocument,reason})),[
    {method:'POST',url:'https://example.com/submit',resourceType:'document',mainDocument:true,reason:'Browser method blocked'},
    {method:'POST',url:'https://other.example.com/api',resourceType:'fetch',mainDocument:false,reason:'Browser method blocked'},
  ]);
  assert.deepEqual(messages,['Browser method blocked','Browser method blocked']);
});

test('the egress proxy retains the identity of requests it refuses, alongside the global reason', async () => {
  const store = createBrowserFailureDiagnostics();
  const egress = await startBrowserEgress({recordFailure:store.record});
  try {
    const port = Number(new URL(egress.proxyUrl).port);
    const status = await new Promise<number>((resolve,reject) => {
      const request = http.request({host:'127.0.0.1',port,method:'POST',path:'http://beacon.example.com/collect?token=hidden#hidden',headers:{host:'beacon.example.com','content-type':'text/plain','content-length':'4'}},(response) => {
        response.resume();
        response.on('end',() => resolve(response.statusCode ?? 0));
      });
      request.on('error',reject);
      request.end('body');
    });
    assert.equal(status,403);
    const connectReply = await new Promise<string>((resolve,reject) => {
      const socket = net.connect({host:'127.0.0.1',port},() => socket.write('CONNECT private.example.com:444 HTTP/1.1\r\nHost: private.example.com:444\r\n\r\n'));
      let data = '';
      socket.on('data',chunk => { data += chunk.toString(); });
      socket.on('close',() => resolve(data));
      socket.on('error',reject);
    });
    assert.match(connectReply,/^HTTP\/1\.1 403/);
    const retained = store.snapshot();
    assert.equal(retained.overflow,0);
    assert.deepEqual(retained.failures,[
      {method:'POST',url:'http://beacon.example.com/collect',resourceType:'egress',mainDocument:false,reason:'Browser HTTP request bodies are blocked'},
      {method:'CONNECT',url:'https://private.example.com:444/',resourceType:'egress',mainDocument:false,reason:'Browser CONNECT requires a matching DNS authority on port 443'},
    ]);
    const diagnostics = egress.diagnostics();
    assert.equal(diagnostics.blocked,2);
    assert.deepEqual(diagnostics.reasons,['Browser HTTP request bodies are blocked','Browser CONNECT requires a matching DNS authority on port 443']);
    assert.doesNotMatch(JSON.stringify(retained),/hidden|token|#/);
  } finally { await egress.close(); }
});
