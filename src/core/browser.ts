import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { pipeline } from 'node:stream/promises';
import type { BrowserContext, CDPSession, Page, Request, Route } from 'playwright';
import { parsePublicResource, parsePublicTarget } from './input.js';
import { abortable, cappedBytes, deadlineSignal, isAllowedDocumentOrigin, pinDestination, sendPinnedRequest } from './network.js';
import type { PinnedDestination, Resolver } from './network.js';
import type { DeclaredProfile } from './types.js';

export interface DocumentScope {
  assert(url: URL, isMainDocument: boolean): void;
  lock(url: string | URL): void;
  origin(): string;
}

export function createDocumentScope(target: string): DocumentScope {
  let accepted = parsePublicTarget(target).origin;
  let locked = false;
  const guard = (url: URL) => {
    if (!isAllowedDocumentOrigin(url,accepted,!locked)) throw new Error('Browser document left the accepted origin');
  };
  return {
    assert(url, isMainDocument) { if (isMainDocument) guard(url); },
    lock(url) {
      const safe = parsePublicTarget(url.toString());
      guard(safe);
      accepted = safe.origin;
      locked = true;
    },
    origin:() => accepted,
  };
}

export function browserRequestTarget(method: string | undefined, raw: string | undefined, host: string | undefined): URL {
  if (method !== 'GET' && method !== 'HEAD') throw new Error('Browser proxy accepts only GET and HEAD HTTP methods');
  if (!raw || !/^http:\/\//i.test(raw)) throw new Error('Browser proxy expected an absolute HTTP URL');
  const url = parsePublicResource(raw);
  if (url.protocol !== 'http:' || host?.toLowerCase() !== url.host) throw new Error('Browser HTTP request authority does not match its Host header');
  return url;
}

export function connectTarget(raw: string | undefined, host: string | undefined): URL {
  if (!raw || !/^[a-z\d.-]+:443$/i.test(raw) || host?.toLowerCase() !== raw.toLowerCase()) throw new Error('Browser CONNECT requires a matching DNS authority on port 443');
  return parsePublicTarget('https://' + raw.slice(0,-4));
}

export function pinBrowserConnect(raw: string | undefined, host: string | undefined, resolve?: Resolver, signal?: AbortSignal): Promise<PinnedDestination> {
  return pinDestination(connectTarget(raw,host),resolve,signal);
}

export interface BrowserRequestBudget {
  signal: AbortSignal;
  observe(url: string): boolean;
  count(): number;
}

export function createBrowserRequestBudget(limit: number): BrowserRequestBudget {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid browser request limit');
  const controller = new AbortController();
  let requests = 0;
  return {
    signal:controller.signal,
    observe(url) {
      if (controller.signal.aborted) return false;
      if (!/^https?:\/\//i.test(url)) return true;
      if (requests >= limit) {
        controller.abort(new Error('Browser request count limit exceeded'));
        return false;
      }
      requests++;
      return true;
    },
    count:() => requests,
  };
}

export interface BrowserEgressLimits { lifetimeMs: number; requests: number; connections: number; concurrent: number; connectionBytes: number; totalBytes: number; dialMs: number }
const EGRESS_LIMITS: BrowserEgressLimits = {
  lifetimeMs:210_000,requests:1200,connections:600,concurrent:70,connectionBytes:22_000_000,totalBytes:140_000_000,dialMs:12_000,
};
export interface BrowserEgressOptions {
  limits?: Partial<BrowserEgressLimits>;
  resolve?: Resolver;
  signal?: AbortSignal;
  // Receives the identity of every request the egress proxy rejected before any
  // response was established (resourceType 'egress'), so collectors can account
  // for proxy-level blocks the same way as page-level guard blocks instead of
  // treating the bare reason string as an unexplained coverage limitation.
  recordFailure?: (failure: BrowserRequestFailure) => void;
}
export interface BrowserEgress {
  chromiumArgs: string[];
  proxyUrl: string;
  signal: AbortSignal;
  // Direct Chromium callers must feed each page CDP request event here before
  // navigating, including redirects and subresources in every collection target.
  requestBudget: BrowserRequestBudget;
  diagnostics(): { requests: number; connections: number; bytes: number; blocked: number; reasons: string[] };
  close(): Promise<void>;
}

// A process-wide lane keeps concurrent public runs from contaminating Lighthouse samples.
let active = false;
const queue: (() => void)[] = [];
async function acquireBrowserLane(signal?: AbortSignal): Promise<() => void> {
  signal?.throwIfAborted();
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active = false;
  };
  if (!active) { active = true; return release; }
  if (queue.length >= 10) throw new Error('Browser execution queue limit exceeded');
  return new Promise<() => void>((resolve,reject) => {
    const enter = () => {
      signal?.removeEventListener('abort',cancel);
      resolve(release);
    };
    const cancel = () => {
      const index = queue.indexOf(enter);
      if (index >= 0) queue.splice(index,1);
      reject(signal?.reason);
    };
    queue.push(enter);
    signal?.addEventListener('abort',cancel,{once:true});
  });
}

const REQUEST_HEADERS = new Set(['accept','accept-encoding','accept-language','cache-control','cookie','if-modified-since','if-none-match','range','referer','sec-fetch-dest','sec-fetch-mode','sec-fetch-site','sec-fetch-user','user-agent']);
const HOP_HEADERS = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);

export function chromiumEgressArgs(proxyUrl: string): string[] {
  return [
    '--proxy-server=' + proxyUrl, '--proxy-bypass-list=<-loopback>',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    // Playwright context events do not account for SharedWorker network requests.
    '--disable-shared-workers',
  ];
}

export async function startBrowserEgress(options: BrowserEgressOptions = {}): Promise<BrowserEgress> {
  const limits = {...EGRESS_LIMITS,...options.limits};
  const requestBudget = createBrowserRequestBudget(limits.requests);
  const queueTimeout = deadlineSignal(limits.lifetimeMs,'Browser queue deadline exceeded');
  let release: () => void;
  try {
    release = await acquireBrowserLane(AbortSignal.any([queueTimeout.signal,...(options.signal ? [options.signal] : [])]));
  } finally { queueTimeout.stop(); }
  const timer = deadlineSignal(limits.lifetimeMs,'Browser lifetime limit exceeded');
  const controller = new AbortController();
  const signal = AbortSignal.any([timer.signal,controller.signal,requestBudget.signal,...(options.signal ? [options.signal] : [])]);
  const sockets = new Set<net.Socket>();
  let connections = 0, concurrent = 0, bytes = 0, blocked = 0;
  const reasons = new Set<string>();
  const record = (error: unknown) => {
    blocked++;
    const message = error instanceof Error ? error.message : 'Browser egress rejected a request';
    if (reasons.size < 16) reasons.add(message.slice(0,240));
  };
  // Retain the rejected request's identity alongside the global reason. The
  // request never left the proxy, so method and target are the only facts known.
  const rejected = (method: string | undefined, url: string | undefined, error: unknown) => {
    record(error);
    const reason = error instanceof Error ? error.message : 'Browser egress rejected a request';
    try { options.recordFailure?.({method:method ?? 'UNKNOWN',url:url ?? '',resourceType:'egress',mainDocument:false,reason}); }
    catch { /* Diagnostics must not interfere with rejecting the request. */ }
  };
  requestBudget.signal.addEventListener('abort',() => record(requestBudget.signal.reason),{once:true});
  const debit = (count: number) => {
    bytes += count;
    if (bytes > limits.totalBytes) {
      controller.abort(new Error('Browser total egress byte limit exceeded'));
      throw signal.reason;
    }
  };
  const take = () => {
    signal.throwIfAborted();
    if (connections >= limits.connections) {
      controller.abort(new Error('Browser connection count limit exceeded'));
      throw signal.reason;
    }
    if (concurrent >= limits.concurrent) throw new Error('Browser concurrent connection limit exceeded');
    connections++;
    concurrent++;
  };
  const handleSocket = (socket: net.Socket) => {
    sockets.add(socket);
    socket.on('error',() => {});
    socket.once('close',() => sockets.delete(socket));
  };
  const server = http.createServer({maxHeaderSize:16_384,requestTimeout:12_000,headersTimeout:8_000,keepAliveTimeout:3_000});
  server.maxConnections = limits.concurrent + 8;
  server.on('connection',handleSocket);
  server.on('clientError',(_error,socket) => socket.destroy());
  server.on('upgrade',(_req,socket) => socket.destroy());
  server.on('request',(req,res) => {
    void (async () => {
      let counted = false;
      const requestTimer = deadlineSignal(limits.dialMs,'Browser HTTP request deadline exceeded');
      const requestSignal = AbortSignal.any([signal,requestTimer.signal]);
      try {
        if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0) throw new Error('Browser HTTP request bodies are blocked');
        const url = browserRequestTarget(req.method,req.url,req.headers.host);
        take();
        counted = true;
        const destination = await pinDestination(url,options.resolve,requestSignal);
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => REQUEST_HEADERS.has(key)));
        const response = await sendPinnedRequest(destination,req.method === 'HEAD' ? 'HEAD' : 'GET',headers,requestSignal);
        const outgoing = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !HOP_HEADERS.has(key)));
        res.writeHead(response.status,outgoing);
        await pipeline(response.body,cappedBytes(limits.connectionBytes,debit),res,{signal:requestSignal});
      } catch (error) {
        if (res.headersSent) record(error);
        else rejected(req.method,req.url,error);
        if (!res.headersSent && !res.destroyed) { res.writeHead(403,{'content-type':'text/plain','connection':'close'}); res.end('Browser egress rejected the request'); }
        else res.destroy();
      } finally {
        requestTimer.stop();
        if (counted) concurrent--;
      }
    })();
  });
  server.on('connect',(req,client,head) => {
    void (async () => {
      let counted = false, established = false;
      let upstream: net.Socket | undefined;
      const dial = deadlineSignal(limits.dialMs,'Browser CONNECT deadline exceeded');
      const dialSignal = AbortSignal.any([signal,dial.signal]);
      try {
        take();
        counted = true;
        const pinned = await pinBrowserConnect(req.url,req.headers.host,options.resolve,dialSignal);
        dialSignal.throwIfAborted();
        if (client.destroyed) return;
        // Chrome itself validates the origin certificate. No browser DNS result or proxy fallback is used.
        upstream = net.createConnection({host:pinned.address,family:pinned.family,port:443,signal:dialSignal});
        handleSocket(upstream);
        await abortable(new Promise<void>((resolve,reject) => {
          upstream!.once('connect',resolve);
          upstream!.once('error',reject);
        }),dialSignal);
        dial.stop();
        if (client.destroyed || signal.aborted) return;
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        established = true;
        let connectionBytes = 0;
        const debitConnection = (size: number) => {
          connectionBytes += size;
          if (connectionBytes > limits.connectionBytes) throw new Error('Browser connection byte limit exceeded');
          debit(size);
        };
        const upload = cappedBytes(limits.connectionBytes,debitConnection);
        const download = cappedBytes(limits.connectionBytes,debitConnection);
        if (head.length) upload.write(head);
        await Promise.all([
          pipeline(client,upload,upstream,{signal}),
          pipeline(upstream,download,client,{signal}),
        ]);
      } catch (error) {
        if (!established) rejected('CONNECT',req.url ? 'https://' + req.url.replace(/:443$/i,'') : undefined,error);
        else if (error instanceof Error && /limit|deadline/i.test(error.message)) record(error);
        if (!client.destroyed && !established) client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      } finally {
        dial.stop();
        upstream?.destroy();
        if (established) client.destroy();
        if (counted) concurrent--;
      }
    })();
  });
  let stopping: Promise<void> | undefined;
  const stopNetwork = () => {
    stopping ??= new Promise<void>((resolve) => {
      timer.stop();
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    });
    return stopping;
  };
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= stopNetwork().finally(release);
    controller.abort(new Error('Browser egress closed'));
    return closing;
  };
  try {
    await abortable(new Promise<void>((resolve,reject) => {
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    }),signal);
    signal.throwIfAborted();
    server.on('error',(error) => { record(error); controller.abort(error); });
  } catch (error) {
    await close();
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error('Browser egress requires a permitted loopback listener' + (code ? ` (${code})` : ''),{cause:error});
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    await close();
    throw new Error('Browser loopback proxy address unavailable');
  }
  const proxyUrl = `http://127.0.0.1:${address.port}`;
  // Stop network immediately; ownership of the lane lasts until the caller closes
  // its Chromium process and calls close(), even if the proxy has already expired.
  signal.addEventListener('abort',() => void stopNetwork(),{once:true});
  return {
    proxyUrl,
    chromiumArgs:chromiumEgressArgs(proxyUrl),
    signal,requestBudget,
    diagnostics:() => ({requests:requestBudget.count(),connections,bytes,blocked,reasons:[...reasons]}),
    close,
  };
}

export interface BrowserRequestFailure {
  method: string;
  url: string;
  resourceType: string;
  mainDocument: boolean;
  reason: string;
}
export interface BrowserFailureDiagnostics { failures: BrowserRequestFailure[]; overflow: number }

// Deliberately retain only origin/path: credentials, query values and fragments
// are never needed to identify the request that the collector could not inspect.
function requestIdentity(raw: string): string {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? (url.origin + url.pathname).slice(0,2048) : '[unavailable]';
  } catch { return '[unavailable]'; }
}
export function redactBrowserFailureReason(reason: string): string {
  return reason.replace(/https?:\/\/[^\s"'<>]+/gi,requestIdentity).slice(0,240).replaceAll('\0','\uFFFD');
}
export function createBrowserFailureDiagnostics(limit = 16) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid browser failure diagnostic limit');
  const failures: BrowserRequestFailure[] = [];
  let overflow = 0;
  return {
    record(failure: BrowserRequestFailure) {
      if (failures.length >= limit) { overflow = Math.min(Number.MAX_SAFE_INTEGER,overflow + 1); return; }
      failures.push({method:failure.method.slice(0,32),url:requestIdentity(failure.url),resourceType:failure.resourceType.toLowerCase().slice(0,64),
        mainDocument:failure.mainDocument,reason:redactBrowserFailureReason(failure.reason)});
    },
    snapshot:(): BrowserFailureDiagnostics => ({failures:failures.map(item => ({...item})),overflow}),
  };
}
export function browserRequestFailure(request: Request, reason: string): BrowserRequestFailure {
  let mainDocument = false;
  try { mainDocument = request.isNavigationRequest() && !request.frame().parentFrame(); }
  catch { /* Worker requests have no attached frame and are not main documents. */ }
  return {method:request.method(),url:request.url(),resourceType:request.resourceType(),mainDocument,reason};
}

export interface BrowserOptions extends BrowserEgressOptions {
  executablePath?: string;
  profile: DeclaredProfile;
}
export interface BrowserSession {
  browserVersion: string;
  driverVersion: string;
  scope: DocumentScope;
  signal: AbortSignal;
  newPage(): Promise<Page>;
  diagnostics(): string[];
  requestFailures(): BrowserFailureDiagnostics;
  close(): Promise<void>;
}

export function manageBrowserShutdown(egress: Pick<BrowserEgress,'signal' | 'close'>, stopBrowser: () => Promise<void>): () => Promise<void> {
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= Promise.resolve().then(stopBrowser).catch(() => {}).finally(() => egress.close());
    return closing;
  };
  const onAbort = () => { void close().catch(() => {}); };
  egress.signal.addEventListener('abort',onAbort,{once:true});
  if (egress.signal.aborted) onAbort();
  return close;
}

export async function protectRedirects(context: BrowserContext,page: Page,scope: DocumentScope,signal: AbortSignal,report: (message: string) => void,recordFailure: (failure: BrowserRequestFailure) => void): Promise<void> {
  const cdp: CDPSession = await context.newCDPSession(page);
  const {frameTree} = await cdp.send('Page.getFrameTree');
  const main = frameTree.frame.id;
  cdp.on('Fetch.requestPaused',(event) => {
    void (async () => {
      try {
        signal.throwIfAborted();
        if (event.request.method !== 'GET' && event.request.method !== 'HEAD') throw new Error('Browser method blocked');
        const url = parsePublicResource(event.request.url);
        scope.assert(url,event.resourceType === 'Document' && event.frameId === main);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Browser request blocked';
        report(reason);
        recordFailure({method:event.request.method,url:event.request.url,resourceType:event.resourceType,mainDocument:event.resourceType === 'Document' && event.frameId === main,reason});
        await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(() => {});
        return;
      }
      await cdp.send('Fetch.continueRequest',{requestId:event.requestId}).catch(() => {});
    })();
  });
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]});
}

export async function protectBrowserRoute(route: Route,allowedPages: Set<Page>,scope: DocumentScope,signal: AbortSignal,report: (message: string) => void,recordFailure: (failure: BrowserRequestFailure) => void): Promise<void> {
  const request = route.request();
  try {
    signal.throwIfAborted();
    if (!['GET','HEAD'].includes(request.method())) throw new Error('Browser method blocked');
    const url = parsePublicResource(request.url());
    if (request.isNavigationRequest()) {
      const frame = request.frame();
      if (!allowedPages.has(frame.page())) throw new Error('Unexpected browser page navigation blocked');
      scope.assert(url,!frame.parentFrame());
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Browser request blocked';
    report(reason);
    recordFailure(browserRequestFailure(request,reason));
    await route.abort('blockedbyclient').catch(() => {});
    return;
  }
  await route.continue().catch(() => {});
}

export async function openBrowserSession(target: string,options: BrowserOptions): Promise<BrowserSession> {
  const scope = createDocumentScope(target);
  let module: typeof import('playwright');
  try { module = await import('playwright'); }
  catch (error) { throw new Error('Playwright is required for browser collection',{cause:error}); }
  const executablePath = options.executablePath ?? module.chromium.executablePath();
  try { await access(executablePath,constants.X_OK); }
  catch (error) { throw new Error('Chromium executable unavailable; install Playwright Chromium or configure a trusted executable path',{cause:error}); }
  // One bounded store accounts for guard blocks at every layer: Playwright
  // routing, CDP interception and the loopback egress proxy, which otherwise
  // reports only a reason string for requests it refused (e.g. request bodies).
  const failures = createBrowserFailureDiagnostics();
  const egress = await startBrowserEgress({...options,recordFailure:(failure) => { failures.record(failure); options.recordFailure?.(failure); }});
  let close = () => egress.close();
  try {
    const browser = await module.chromium.launch({
      headless:true,executablePath,chromiumSandbox:true,args:egress.chromiumArgs,
      ignoreDefaultArgs:['--disable-popup-blocking'],timeout:30_000,
    });
    close = manageBrowserShutdown(egress,() => browser.close());
    egress.signal.throwIfAborted();
    const {viewport,deviceScaleFactor,locale,timezoneId} = options.profile;
    const context = await browser.newContext({viewport,deviceScaleFactor,locale,timezoneId,serviceWorkers:'block',acceptDownloads:false,ignoreHTTPSErrors:false});
    context.setDefaultTimeout(7_000);
    context.setDefaultNavigationTimeout(18_000);
    const allowedPages = new Set<Page>();
    const reasons = new Set<string>();
    const report = (message: string) => { if (reasons.size < 16) reasons.add(message); };
    // The context's CDP-backed events include redirects that Playwright routing
    // does not reinvoke and requests multiplexed over the same CONNECT tunnel.
    context.on('request',(request) => { egress.requestBudget.observe(request.url()); });
    context.on('page',(page) => {
      void page.opener().then((opener) => {
        if (opener) { report('Unexpected browser popup closed'); return page.close(); }
      }).catch(() => {});
    });
    await context.route('**/*',(route) => protectBrowserRoute(route,allowedPages,scope,egress.signal,report,failures.record));
    await context.routeWebSocket('**/*',(socket) => { void socket.close({code:1008,reason:'Public collection disables WebSocket'}).catch(() => {}); });
    const driverVersion = (await import('playwright/package.json',{with:{type:'json'}})).default.version;
    egress.signal.throwIfAborted();
    return {
      scope,signal:egress.signal,
      browserVersion:browser.version(),driverVersion,
      async newPage() {
        egress.signal.throwIfAborted();
        if (allowedPages.size) throw new Error('Close the previous collection page before opening another');
        const page = await context.newPage();
        allowedPages.add(page);
        page.once('close',() => allowedPages.delete(page));
        try {
          await protectRedirects(context,page,scope,egress.signal,report,failures.record);
          egress.signal.throwIfAborted();
        } catch (error) {
          await page.close().catch(() => {});
          throw error;
        }
        return page;
      },
      diagnostics:() => [...reasons,...egress.diagnostics().reasons,...(failures.snapshot().overflow ? ['Browser request failure diagnostics truncated'] : [])],
      requestFailures:failures.snapshot,
      close,
    };
  } catch (error) {
    await close();
    throw new Error('Chromium could not start in the protected browser environment',{cause:error});
  }
}

