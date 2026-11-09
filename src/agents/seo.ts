import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { Page, Response } from 'playwright';
import { browserRequestFailure, createBrowserFailureDiagnostics, openBrowserSession, redactBrowserFailureReason } from '../core/browser.js';
import type { BrowserFailureDiagnostics, BrowserRequestFailure } from '../core/browser.js';
import { canonicalJson, createEvidence, createFinding } from '../core/evidence.js';
import { parsePublicTarget } from '../core/input.js';
import { abortable, createPublicHttpClient, PublicHttpError } from '../core/network.js';
import type { HttpResult, PublicHttpClient, RedirectHop } from '../core/network.js';
import type { CollectorOptions, CollectorResult, CoverageEntry, CoverageStatus, Evidence, Finding, JsonObject, JsonValue, RawArtifact, Scope, ValidatedRequest } from '../core/types.js';
import { CRAWLERS, headerDirectives, normalizedHttpUrl, readDocument, readRobots, readSitemap, ROBOTS_BYTES, robotDecision, SEARCH_CRAWLERS, searchNoindex } from './seo-parsing.js';

const agentId = 'seo-ai-search' as const;
const ENGINE = 'seo-source-rendered-v2';
const DEFAULT_PAGE_SAMPLE = 3;
const RENDER_CHARS = 1_000_000;
const SITEMAP_REQUESTS_PER_ORIGIN = 4;
const SITEMAP_INDEX_DEPTH = 2;
const ROBOTS_PATHS_PER_PAGE = 8;
const MAX_DIAGNOSTICS = 30;
const short = (text: string) => text.slice(0,1000).replaceAll('\0','\uFFFD');
const message = (error: unknown) => short(error instanceof Error ? error.message : String(error));
const digest = (input: unknown) => createHash('sha256').update(canonicalJson(input)).digest('hex').slice(0,24);
const success = (status: number) => status >= 200 && status < 300;
const isHtml = (contentType: string | undefined, text: string) => contentType
  ? /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(contentType)
  : /^\s*(?:<!doctype\s+html|<html\b|<head\b|<meta\b|<title\b)/i.test(text);

interface Snapshot {
  url: string; status: number; redirects: readonly RedirectHop[]; headers: IncomingHttpHeaders;
  preview?: Uint8Array; html?: string; diagnostics: string[]; requestFailures?: BrowserFailureDiagnostics; reason?: string; networkReason?: string; navigation?: string; finalConfirmed?: boolean;
}
interface Renderer {
  browser: string; driver: string;
  capture(url: string, observedSourceUrl?: string): Promise<Snapshot | FailedSource>;
  close(): Promise<void>;
}
type FailedSource = {error: string; redirects: readonly RedirectHop[]; failedUrl?: string; requestFailures?: BrowserFailureDiagnostics};
type Source = HttpResult | FailedSource;

// Global reason strings the browser guards emit once per session. Each is
// cleared from a page's limitations only when the same reason is retained with
// a request identity on that page and every retained failure is non-content.
const GUARD_REASONS = new Set(['Browser method blocked','Browser HTTP request bodies are blocked']);

function seoFailureImpact(failure: BrowserRequestFailure): {impact:'limiting'|'non-content';reason:string} {
  const limiting = {impact:'limiting' as const,reason:'Unknown content dependency or security failure; rendered metadata coverage remains limited'};
  if (failure.mainDocument) return limiting;
  // The loopback proxy refuses a request with a body before learning its
  // purpose; only its method and redacted target are known. Nothing establishes
  // that it was reporting traffic, so it limits coverage with a precise reason.
  if (failure.resourceType === 'egress') {
    return {impact:'limiting',reason:'Egress proxy refused this request before its purpose could be established; rendered metadata coverage remains limited'};
  }
  const intentionalBlock = failure.reason === 'Browser method blocked' || /^failed: net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/.test(failure.reason);
  let reporting = false;
  try {
    const url = new URL(failure.url);
    // Google documents analytics.google.com/g/collect and reporting destinations:
    // https://developers.google.com/tag-platform/security/guides/csp
    // Other exact paths below are inferences from the protected Solvd trace,
    // not documented stable APIs. The exact GET image ORB exception also comes
    // from that observed trace. See docs/research/seo-coverage.md.
    const exact = url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      !/^https:\/\/[^/]*:/i.test(failure.url);
    const postPath = (url.hostname === 'analytics.google.com' && url.pathname === '/g/collect') ||
      (url.hostname === 'stats.g.doubleclick.net' && url.pathname === '/g/collect') ||
      (url.hostname === 'www.google.com' && ['/g/collect','/ccm/collect'].includes(url.pathname)) ||
      (url.hostname === 'ad.doubleclick.net' && url.pathname === '/ccm/s/collect') ||
      (url.hostname === 'www.google.com' && /^\/rmkt\/collect\/\d+\/$/.test(url.pathname));
    reporting = exact && (
      (intentionalBlock && failure.method === 'POST' && ['fetch','xhr','ping'].includes(failure.resourceType) && postPath) ||
      (failure.method === 'GET' && failure.resourceType === 'image' && url.hostname === 'ad.doubleclick.net' && url.pathname === '/ccm/s/collect' &&
        (intentionalBlock || failure.reason === 'failed: net::ERR_BLOCKED_BY_ORB')));
  } catch { /* Unavailable or invalid request identity cannot establish reporting traffic. */ }
  if (reporting) return {impact:'non-content',reason:'Observed reporting endpoint was blocked; it does not establish a failed HTML metadata dependency'};
  // Ordinary asset errors remain visible but are outside HTML metadata inspection.
  // Unknown guard/security failures (including unaccounted method blocks) still limit it.
  if (['image','media','font','ping'].includes(failure.resourceType) && ['GET','HEAD'].includes(failure.method) &&
      (/^returned HTTP [45]\d\d$/.test(failure.reason) || failure.reason === 'failed: net::ERR_ABORTED')) {
    return {impact:'non-content',reason:'Image, media, font or ping failure retained outside HTML canonical, indexing and JSON-LD inspection scope'};
  }
  return limiting;
}

function seoRequestLimitations(snapshot: Snapshot): string[] {
  const failures = snapshot.requestFailures;
  const impacts = failures?.failures.map(seoFailureImpact) ?? [];
  const fullyAccounted = !!failures && !failures.overflow && failures.failures.length>0 && impacts.every(item=>item.impact === 'non-content');
  // A guard reason without a retained request identity cannot be accounted for.
  const retainedReasons = new Set(failures?.failures.map(item=>item.reason) ?? []);
  const reasons = snapshot.diagnostics.filter(reason=>!(GUARD_REASONS.has(reason) && fullyAccounted && retainedReasons.has(reason)));
  if (failures?.overflow) reasons.push('Browser request failure diagnostics truncated');
  if (impacts.some(item=>item.impact === 'limiting')) reasons.push('Browser requests could not be fully inspected');
  return [...new Set(reasons)];
}

export function seoGuardFailuresAccounted(blocks: BrowserRequestFailure[], observed: BrowserRequestFailure[]): boolean {
  // CDP calls an XHR 'xhr' while Playwright can report the same request as 'fetch'.
  const identity = (item: BrowserRequestFailure) => JSON.stringify([item.method,item.url,
    ['xhr','fetch'].includes(item.resourceType) ? 'fetch/xhr' : item.resourceType,item.mainDocument]);
  const remaining = observed.filter(item=>/^failed: net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/.test(item.reason));
  return blocks.every(block=>{
    const index = remaining.findIndex(item=>identity(item) === identity(block));
    if (index<0) return false;
    remaining.splice(index,1); return true;
  });
}

export function observeSeoRequestFailures(page: Page, note: (reason: string) => void) {
  const failures = createBrowserFailureDiagnostics();
  const record = (request: import('playwright').Request, reason: string) => {
    const failure = browserRequestFailure(request,reason);
    failures.record(failure);
    if (seoFailureImpact(failure).impact === 'limiting') note(`${request.resourceType()} ${redactBrowserFailureReason(reason)}`);
  };
  page.on('requestfailed',(request) => record(request,`failed: ${request.failure()?.errorText ?? 'unknown browser error'}`));
  page.on('response',(response) => {
    if (response.status() >= 400) record(response.request(),`returned HTTP ${response.status()}`);
  });
  return failures;
}

// This function is serialized into the page. Keep it independent of module state
// and local function bindings: tsx adds Node-side __name calls to those bindings.
export function captureSeoDocument(limit: number): {html?:string;reason?:string} {
  if (!document.documentElement || !document.head) return {reason:'Rendered SEO document root or head is missing'};
  const robots = new Set(['robots','googlebot','bingbot','gptbot','oai-searchbot','chatgpt-user','claudebot',
    'claude-searchbot','perplexitybot','applebot','google-extended','ccbot','googlebot-news','googlebot-image']);
  let html = '<!doctype html><html><head>';
  for (const node of document.head.querySelectorAll('title,base,meta,link')) {
    const tag = node.tagName.toLowerCase();
    const name = node.getAttribute('name') ?? '';
    if (tag === 'base' && !node.hasAttribute('href')) continue;
    if (tag === 'meta' && name.toLowerCase() !== 'description' && !robots.has(name.trim().toLowerCase())) continue;
    if (tag === 'link' && !(node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical')) continue;
    const attributes = tag === 'base' ? ['href'] : tag === 'meta' ? ['name','content'] : tag === 'link' ? ['rel','href'] : [];
    let text = '<'+tag;
    for (const key of attributes) {
      if (!node.hasAttribute(key)) continue;
      const value = node.getAttribute(key)!.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
      text += ' '+key+'="'+value+'"';
    }
    text += '>'+(tag === 'title' ? node.innerHTML+'</title>' : '');
    if (html.length + text.length > limit) return {reason:'Rendered SEO metadata exceeds the snapshot size limit'};
    html += text;
  }
  if (html.length + '</head><body>'.length > limit) return {reason:'Rendered SEO metadata exceeds the snapshot size limit'};
  html += '</head><body>';
  // JSON-LD can occur in the body; hydration data and executable scripts are irrelevant here.
  for (const script of document.querySelectorAll('script')) {
    if ((script.getAttribute('type') ?? '').trim().toLowerCase() !== 'application/ld+json') continue;
    const text = '<script type="application/ld+json">'+(script.textContent ?? '')+'</script>';
    if (html.length + text.length > limit) {
      return {reason:'Rendered SEO JSON-LD exceeds the snapshot size limit'};
    }
    html += text;
  }
  if (html.length + '</body></html>'.length > limit) return {reason:'Rendered SEO metadata exceeds the snapshot size limit'};
  html += '</body></html>';
  return {html};
}

async function browserRenderer(request: ValidatedRequest, options: CollectorOptions): Promise<Renderer> {
  const browser = await openBrowserSession(request.targetUrl,{profile:request.profile,...options});
  let first = true;
  async function redirectChain(response: Response): Promise<RedirectHop[]> {
    const redirects: RedirectHop[] = [];
    for (let hop = response.request().redirectedFrom(); hop && redirects.length < 20; hop = hop.redirectedFrom()) {
      const prior = await abortable(hop.response(),browser.signal);
      if (!prior) throw new Error('A redirect response was unavailable');
      redirects.push({url:prior.url(),status:prior.status(),location:prior.headers().location ?? ''});
    }
    return redirects.reverse();
  }
  return {
    browser:browser.browserVersion,driver:browser.driverVersion,
    close:() => browser.close(),
    async capture(requested,observedSourceUrl) {
      const main = first;
      first = false;
      let navigation = requested;
      if (!main && new URL(requested).origin !== browser.scope.origin()) {
        if (!observedSourceUrl || new URL(observedSourceUrl).origin !== browser.scope.origin()) {
          throw new Error('The configured URL is on the submitted origin, but its redirect to the accepted canonical origin could not be verified');
        }
        navigation = observedSourceUrl;
      }
      const beforeFailures = browser.requestFailures();
      const page = await browser.newPage();
      const diagnostics = new Set<string>();
      const before = new Set(browser.diagnostics());
      const note = (text: string) => { if (diagnostics.size < 8) diagnostics.add(short(text)); };
      const failures = observeSeoRequestFailures(page,note);
      page.on('pageerror',(error) => note(`Page script error: ${error.message}`));
      let response: Response | undefined;
      page.on('response',(item) => {
        if (item.request().isNavigationRequest()) {
          try { if (item.request().frame() === page.mainFrame()) response = item; }
          catch { /* Navigation can precede Playwright's frame attachment. */ }
        }
      });
      let html: string | undefined;
      let preview: Uint8Array | undefined;
      let reason: string | undefined;
      let networkReason = navigation === requested ? undefined : 'Browser started at the verified HTTP redirect destination; the submitted redirect chain was only observed by HTTP.';
      let finalConfirmed = false;
      try {
        try {
          const navigated = await abortable(page.goto(navigation,{waitUntil:'load',timeout:14_000}),browser.signal);
          if (navigated && !response) response = navigated;
          if (!response) throw new Error('No main document response was returned by Chromium');
          const location = parsePublicTarget(page.url());
          browser.scope.assert(location,true);
          if (normalizedHttpUrl(location.href) !== normalizedHttpUrl(response.url())) {
            networkReason = 'Page URL changed after the observed document response';
            throw new Error(networkReason);
          }
          if (main) browser.scope.lock(location);
          finalConfirmed = true;
          const contentType = response.headers()['content-type'];
          if (success(response.status()) && (!contentType || isHtml(contentType,''))) {
            const snapshot = await abortable(page.evaluate(captureSeoDocument,RENDER_CHARS),AbortSignal.any([browser.signal,AbortSignal.timeout(4000)]));
            if (!snapshot.html) throw new Error(snapshot.reason ?? 'Rendered SEO snapshot is missing');
            html = snapshot.html;
            if (main) {
              try {
                const bytes = await abortable(page.screenshot({type:'jpeg',quality:60,fullPage:false,timeout:2000}),browser.signal);
                if (bytes.byteLength <= 1_200_000) preview = bytes;
              } catch { /* A missing optional preview does not invalidate measured metadata. */ }
            }
            if (normalizedHttpUrl(page.url()) !== normalizedHttpUrl(location.href)) {
              html = undefined;
              preview = undefined;
              throw new Error('Page URL changed during the HTML snapshot');
            }
          } else reason = success(response.status()) ? 'Rendered document is not HTML' : `Rendered document returned HTTP ${response.status()}`;
        } catch (error) {
          reason = message(error);
          if (!finalConfirmed) networkReason = 'Final browser response could not be verified: ' + reason;
        }
        const retained = browser.requestFailures();
        // The same bounded store accounts for guard and page events; overflow is
        // explicit even when the browser session's earlier captures filled its cap.
        const observed = failures.snapshot();
        for (const failure of retained.failures.slice(beforeFailures.failures.length)) failures.record(failure);
        const requestFailures = failures.snapshot();
        requestFailures.overflow += retained.overflow - beforeFailures.overflow;
        if (requestFailures.overflow) diagnostics.add('Browser request failure diagnostics truncated');
        const newGuards = retained.failures.slice(beforeFailures.failures.length);
        for (const entry of browser.diagnostics()) {
          if (GUARD_REASONS.has(entry)) {
            const blocks = newGuards.filter(item=>item.reason === entry);
            // Repeated global reason strings are not event counters. Account for
            // every fresh guard record, even when the string existed on a prior page.
            // Route/CDP method blocks must also match the page's own failure event;
            // egress proxy refusals are page-invisible and carry their own identity.
            const matched = entry === 'Browser method blocked' ? seoGuardFailuresAccounted(blocks,observed.failures) : true;
            if (!requestFailures.overflow && !retained.overflow && blocks.length && matched &&
                requestFailures.failures.every(item=>seoFailureImpact(item).impact === 'non-content')) continue;
            if (blocks.length && !matched) {
              // Guard identities are redacted; require the per-page failure event
              // before suppressing its global reason, including repeated requests.
              note('Browser method blocked without complete per-request diagnostics');
            }
            if (before.has(entry) && !blocks.length && !retained.overflow) continue;
          }
          note(entry);
        }
        if (!response) return {error:reason ?? 'No main document response was returned by Chromium',redirects:[],requestFailures};
        const url = normalizedHttpUrl(page.url()) === normalizedHttpUrl(response.url()) ? page.url() : response.url();
        const redirects = await redirectChain(response).catch((error) => { networkReason = `Browser redirect history incomplete: ${message(error)}`; return []; });
        return {url,status:response.status(),headers:response.headers(),redirects,html,preview,reason,networkReason,navigation,finalConfirmed,diagnostics:[...diagnostics],requestFailures};
      } finally { await page.close().catch(() => {}); }
    },
  };
}

async function fetchSource(client: PublicHttpClient, url: string, origin: string, allowCanonical: boolean): Promise<Source> {
  try { return await client.fetch(url,{documentOrigin:origin,allowCanonical}); }
  catch (error) {
    if (error instanceof PublicHttpError) return {error:message(error),redirects:error.redirects,failedUrl:error.failedUrl};
    return {error:message(error),redirects:[]};
  }
}

function networkData(source: HttpResult | Snapshot | FailedSource): JsonObject {
  const redirects = source.redirects.slice(0,20).map(({url,status,location}) => ({
    url:url.slice(0,2048),status,location:location.slice(0,2048),
  }));
  const failureData: JsonObject = 'requestFailures' in source && source.requestFailures ? {
    requestFailures:{failures:source.requestFailures.failures.map(failure => ({...failure})),overflow:source.requestFailures.overflow},
    requestFailureImpact:source.requestFailures.failures.map((failure,index) => ({index,...seoFailureImpact(failure)})),
  } : {};
  if ('error' in source) return {error:source.error,failedUrl:source.failedUrl?.slice(0,2048) ?? null,redirects,...failureData};
  const contentType = source.headers['content-type'];
  return {url:source.url,status:source.status,redirects,contentType:contentType ? short(contentType) : null,
    ...failureData,
    ...('navigation' in source && source.navigation ? {navigation:source.navigation} : {}),
    ...('finalConfirmed' in source ? {finalConfirmed:source.finalConfirmed ?? null} : {}),
    ...(source.headers.location ? {location:source.headers.location.slice(0,2048)} : {}),
    ...('networkReason' in source && source.networkReason ? {reason:short(source.networkReason)} : {}),
  };
}

type DocumentRead = ReturnType<typeof readDocument>;
interface Layer {
  network: Evidence; statusCoverage: CoverageEntry;
  metadata: Evidence; metadataCoverage: CoverageEntry;
  structured: Evidence; structuredCoverage: CoverageEntry;
  headerCoverage: CoverageEntry; header: ReturnType<typeof headerDirectives>;
  document?: DocumentRead; url?: string; status?: number; redirects: readonly RedirectHop[];
}
interface SitemapDocument { requested: string; result: Source; parsed?: ReturnType<typeof readSitemap>; reason?: string; missing?: boolean }
interface Site {
  robotsUrl: string; robots: Source; robotStatus: CoverageStatus; robotReason?: string;
  rules?: ReturnType<typeof readRobots>;
  maps: SitemapDocument[]; sitemapReasons: string[]; sitemapMissing: boolean; locations: Set<string>;
}
function acceptedOrigin(candidate: string, origin: string): boolean {
  try { return parsePublicTarget(candidate).origin === origin; } catch { return false; }
}
async function fetchSite(
  client: PublicHttpClient,
  origin: string,
  alias?: {origin: string; site: Promise<Site>},
): Promise<Site> {
  const robotsUrl = new URL('/robots.txt',origin).href;
  const robots = await fetchSource(client,robotsUrl,origin,false);
  if (alias && 'error' in robots && robots.redirects.length && robots.failedUrl === new URL('/robots.txt',alias.origin).href) {
    // Reuse the independently pinned response only for the exact file named by
    // the robots redirect, after a main-page navigation verified this alias.
    const canonical = await alias.site;
    if (!('error' in canonical.robots)) {
      return {...canonical,robotsUrl,robots:{...canonical.robots,redirects:[...robots.redirects,...canonical.robots.redirects]}};
    }
  }
  let robotStatus: CoverageStatus;
  let robotReason: string | undefined;
  let rules: ReturnType<typeof readRobots> | undefined;
  if ('error' in robots) {
    robotStatus = 'unavailable';
    robotReason = robots.error;
  } else if (robots.status === 404 || robots.status === 410) {
    robotStatus = 'complete';
    robotReason = `HTTP ${robots.status}: no robots.txt policy was observed`;
  } else if (robots.status !== 200) {
    robotStatus = 'incomplete';
    robotReason = `HTTP ${robots.status}: applicable robots.txt policy could not be determined`;
  } else {
    const contentType = robots.headers['content-type'] ?? '';
    const sample = robots.body.subarray(0,ROBOTS_BYTES);
    try {
      const text = new TextDecoder('utf-8',{fatal:true}).decode(sample,{stream:robots.body.length > ROBOTS_BYTES});
      if (/^(?:text\/html|application\/xhtml\+xml)/i.test(contentType) || /^\s*</.test(text)) {
        robotStatus = 'incomplete';
        robotReason = 'robots.txt returned markup rather than a text policy';
      } else {
        rules = readRobots(text);
        robotStatus = robots.body.length > ROBOTS_BYTES || rules.incomplete ? 'incomplete' : 'complete';
        if (robotStatus === 'incomplete') robotReason = 'Robots policy contained malformed records or exceeded the parse limits; matches are provisional';
      }
    } catch {
      robotStatus = 'incomplete';
      robotReason = 'robots.txt is not valid UTF-8 in the inspected range';
    }
  }
  const maps: SitemapDocument[] = [];
  const locations = new Set<string>();
  const sitemapReasons = new Set<string>();
  const queue = (rules?.sitemaps.length ? rules.sitemaps : [new URL('/sitemap.xml',origin).href]).map(url => ({url,depth:0}));
  const seen = new Set<string>();
  while (queue.length) {
    const {url,depth} = queue.shift()!;
    const normalized = normalizedHttpUrl(url);
    if (!normalized || !acceptedOrigin(normalized,origin)) {
      sitemapReasons.add('Some declared sitemap URLs were invalid or outside the measured origin');
      continue;
    }
    if (seen.has(normalized)) {
      // A URL already observed missing at depth zero may also be a required
      // child of an index. Use that observation without repeating the request.
      if (depth > 0 && maps.some(map => map.requested === normalized && map.missing)) {
        sitemapReasons.add('Some sitemap documents were inaccessible');
      }
      continue;
    }
    if (maps.length >= SITEMAP_REQUESTS_PER_ORIGIN || depth > SITEMAP_INDEX_DEPTH) {
      sitemapReasons.add('Sitemap request or index depth limit reached; some documents were not fetched');
      break;
    }
    seen.add(normalized);
    const result = await fetchSource(client,normalized,origin,false);
    // A missing discovery URL is an observation. A missing child of a sitemap
    // index leaves some of the declared sitemap contents uninspected.
    if (depth === 0 && !('error' in result) && (result.status === 404 || result.status === 410)) {
      maps.push({requested:normalized,result,missing:true});
      continue;
    }
    if ('error' in result || result.status !== 200) {
      const reason = 'error' in result ? result.error : `Sitemap returned HTTP ${result.status}`;
      maps.push({requested:normalized,result,reason});
      sitemapReasons.add('Some sitemap documents were inaccessible');
      continue;
    }
    let parsed: ReturnType<typeof readSitemap>;
    try { parsed = readSitemap(new TextDecoder('utf-8',{fatal:true}).decode(result.body)); }
    catch {
      maps.push({requested:normalized,result,reason:'Sitemap is not valid UTF-8'});
      sitemapReasons.add('Some sitemap documents were incomplete or unsupported');
      continue;
    }
    maps.push({requested:normalized,result,parsed,reason:parsed.reason ?? undefined});
    if (parsed.reason) sitemapReasons.add('Some sitemap documents were incomplete or unsupported');
    if (parsed.root === 'sitemapindex') {
      for (const child of parsed.locations.slice(0,32)) queue.push({url:child,depth:depth + 1});
      if (parsed.locations.length > 32) sitemapReasons.add('Sitemap index child sample limit reached');
    } else if (parsed.root === 'urlset') for (const loc of parsed.locations) locations.add(loc);
  }
  if (robotStatus !== 'complete') sitemapReasons.add('Sitemap discovery was limited by incomplete robots.txt coverage');
  const sitemapMissing = !sitemapReasons.size && maps.length > 0 && maps.every(map => map.missing);
  return {robotsUrl,robots,robotStatus,robotReason,rules,maps,sitemapReasons:[...sitemapReasons],sitemapMissing,locations};
}

function sourceSnapshot(source: HttpResult): Snapshot {
  const {url,status,headers,redirects} = source;
  if (!success(status)) return {url,status,headers,redirects,diagnostics:[],reason:`Source document returned HTTP ${status}`};
  const prefix = source.body.subarray(0,1024).toString('latin1');
  const contentType = headers['content-type'];
  if (!isHtml(contentType,prefix.replace(/^ï»¿/,''))) return {url,status,headers,redirects,diagnostics:[],reason:'Source response is not HTML'};
  const headerEncoding = contentType?.match(/;\s*charset\s*=\s*['"]?([a-z0-9_-]+)/i)?.[1];
  const metaEncoding = prefix.match(/<meta\b[^>]{0,800}\bcharset\s*=\s*['"]?([a-z0-9_-]+)/i)?.[1];
  const bomEncoding = /^ï»¿/.test(prefix) ? 'utf-8' : prefix.startsWith('ÿþ') ? 'utf-16le' : prefix.startsWith('þÿ') ? 'utf-16be' : undefined;
  try {
    const html = new TextDecoder(bomEncoding ?? headerEncoding ?? metaEncoding ?? 'utf-8',{fatal:true}).decode(source.body);
    return {url,status,headers,redirects,html,diagnostics:[]};
  } catch {
    return {url,status,headers,redirects,diagnostics:[],reason:'Source HTML uses an unsupported or invalid character encoding'};
  }
}

export async function collectSeoEvidence(
  request: ValidatedRequest,
  client: PublicHttpClient,
  openRenderer: () => Promise<Renderer>,
): Promise<CollectorResult> {
  const coverage: CoverageEntry[] = [];
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const artifacts = new Map<string,RawArtifact>();
  const diagnostics = new Set<string>();
  const now = new Date().toISOString();
  const note = (reason: string) => { if (diagnostics.size < MAX_DIAGNOSTICS) diagnostics.add(short(reason)); };
  const addCoverage = (scope: Scope, subject: string, status: CoverageStatus, reason?: string, data?: JsonObject) => {
    const entry: CoverageEntry = {id:'cov_seo_' + digest({scope,subject}),scope,subject,status,reason:reason ? short(reason) : undefined,data};
    coverage.push(entry);
    return entry;
  };
  const addEvidence = (scope: Scope, kind: string, name: string, summary: string, data: JsonValue, artifactIds?: string[]) => {
    const item = createEvidence({agentId,scope,kind,source:{kind:'measured',name,observedAt:now},summary,data,artifactIds});
    evidence.push(item);
    return item;
  };
  const addFinding = (scope: Scope, rule: string, title: string, summary: string, severity: Finding['severity'],
    disposition: Finding['disposition'], entries: Evidence[], subjects: CoverageEntry[],
    guidance: Pick<Finding,'investigate'|'correct'|'recheck'>) => {
    findings.push(createFinding({
      agentId,scope,rule,title,summary,severity,disposition,
      evidenceIds:[...new Set(entries.map(item => item.id))],coverageIds:[...new Set(subjects.map(item => item.id))],
      ownerPriority:request.ownerPriorities.find(x => x.rule === rule)?.priority,...guidance,
    }));
  };
  const layer = (scope: Scope, kind: 'source'|'rendered', snapshot: Snapshot | FailedSource): Layer => {
    const name = kind === 'source' ? 'DNS-pinned public HTTP' : 'Protected Chromium';
    const missing = 'error' in snapshot;
    const network = addEvidence(scope,`seo.${kind}-http`,name,missing ? `${kind} request did not complete` : `${kind} HTTP ${snapshot.status}`,networkData(snapshot));
    const statusCoverage = addCoverage(scope,`${kind} HTTP status and redirects`,missing ? 'unavailable' : snapshot.networkReason ? 'incomplete' : 'complete',missing ? snapshot.error : snapshot.networkReason);
    const header = headerDirectives(missing ? {} : snapshot.headers);
    const confirmed = !missing && snapshot.finalConfirmed !== false;
    const headerCoverage = addCoverage(scope,`${kind} HTTP indexing directives`,missing ? 'unavailable' : !confirmed || header.incomplete ? 'incomplete' : 'complete',
      missing ? snapshot.error : !confirmed ? 'Final document response headers could not be verified' : header.incomplete ? 'HTTP directives exceeded the evidence bounds' : undefined);
    let document: DocumentRead | undefined;
    let parseError: string | undefined;
    if (!missing && snapshot.html !== undefined) {
      try { document = readDocument(snapshot.html,snapshot.url); }
      catch (error) { parseError = `HTML parsing did not complete: ${message(error)}`; }
    }
    const limitations = missing ? [] : seoRequestLimitations(snapshot);
    const quality = missing ? snapshot.error : snapshot.reason ?? parseError ?? (limitations.length ? `Render had limited coverage: ${limitations.join('; ')}` : undefined);
    if (quality && kind === 'rendered') note(quality);
    const metadataCoverage = addCoverage(scope,`${kind} HTML canonical and indexing directives`,!document ? (missing ? 'unavailable' : 'incomplete') :
      quality || document.incomplete ? 'incomplete' : 'complete',quality ?? (!document ? 'No HTML snapshot was available' : document.incomplete ? 'Document metadata exceeded parse limits' : undefined));
    const structuredCoverage = addCoverage(scope,`${kind} JSON-LD parse and type observations`,!document ? (missing ? 'unavailable' : 'incomplete') :
      quality || document.structuredIncomplete ? 'incomplete' : 'complete',quality ?? (!document ? 'No HTML snapshot was available' : document.structuredIncomplete ? 'JSON-LD sampling or type traversal limit reached' : undefined));
    const previewIds: string[] = [];
    if (!missing && document && snapshot.preview) {
      const id = 'art_' + createHash('sha256').update(scope.page).update(snapshot.preview).digest('hex').slice(0,24);
      artifacts.set('preview:' + scope.page,{id,scope,label:'Page preview: '+scope.page,mediaType:'image/jpeg',bytes:snapshot.preview});
      previewIds.push(id);
    }
    const metadata = addEvidence(scope,`seo.${kind}-metadata`,name,document ? `${kind} canonical and indexing directives` : `${kind} HTML metadata not observed`,{
      title:document?.title ?? null,description:document?.description ?? null,
      canonical:document?.canonical ?? null,metaDirectives:document?.directives ?? null,
      httpDirectives:missing ? null : header.directives,xRobotsTag:missing ? null : header.raw,
      reason:quality ?? null,documentUrl:missing ? null : snapshot.url,
    },previewIds.length ? previewIds : undefined);
    const structured = addEvidence(scope,`seo.${kind}-structured-data`,name,document ? `${document.structuredCount} JSON-LD blocks in ${kind} HTML` : `${kind} JSON-LD not observed`,{
      count:document?.structuredCount ?? null,blocks:document?.jsonLd ?? null,reason:quality ?? null,
      coverage:structuredCoverage.status,format:'JSON-LD; syntax and type observations only',
    });
    return {network,statusCoverage,metadata,metadataCoverage,structured,structuredCoverage,headerCoverage,header,document,
      url:confirmed ? snapshot.url : undefined,status:confirmed ? snapshot.status : undefined,redirects:snapshot.redirects};
  };

  const start = openRenderer().then(renderer => ({renderer} as const),error => ({error:message(error)} as const));
  const origin = new URL(request.targetUrl).origin;
  const first = await fetchSource(client,request.targetUrl,origin,true);
  const canonicalOrigin = 'url' in first ? new URL(first.url).origin : origin;
  const sourceSites = new Map<string,Promise<Site>>();
  if (canonicalOrigin !== origin) sourceSites.set(canonicalOrigin,fetchSite(client,canonicalOrigin));
  const pages = request.pages.map(page => ({...page,source:page.url === request.targetUrl ? 'submitted' : 'configured'}));
  const discover = request.pageDiscovery === 'sitemap-sample' && pages.length === 1;
  let availableSitemapUrls = 0;
  let discoveryReason: string | undefined;
  let discoveryLimited = false;
  if (discover) {
    const pending = sourceSites.get(canonicalOrigin) ?? fetchSite(client,canonicalOrigin);
    sourceSites.set(canonicalOrigin,pending);
    const site = await pending;
    const known = new Set([request.targetUrl,...('url' in first ? [first.url] : [])]);
    const candidates = [...site.locations].filter(url => acceptedOrigin(url,canonicalOrigin) && !known.has(url) &&
      !/\.(?:pdf|jpe?g|png|gif|svg|webp|avif|mp4|zip|xml|json|txt|css|js)(?:$|[?#])/i.test(url));
    const depth = (url: string) => new URL(url).pathname.split('/').filter(Boolean).length;
    candidates.sort((a,b) => depth(a)-depth(b) || Number(Boolean(new URL(a).search))-Number(Boolean(new URL(b).search)) || a.localeCompare(b));
    availableSitemapUrls = candidates.length;
    for (const url of candidates.slice(0,DEFAULT_PAGE_SAMPLE - 1)) pages.push({url,source:'sitemap'});
    discoveryLimited = !candidates.length && !site.sitemapMissing;
    if (site.sitemapMissing) discoveryReason = 'The checked sitemap URLs returned HTTP 404 or 410, so the sample contains only the submitted page.';
    else if (!candidates.length) discoveryReason = 'No additional eligible same-origin pages could be identified in the sampled sitemap documents.';
    else if (site.sitemapReasons.length) discoveryReason = 'The page sample comes from a limited sitemap traversal; it does not cover the entire site.';
  }
  const sources = Promise.all(pages.map(({url,source}) => url === request.targetUrl ? first :
    fetchSource(client,url,source === 'sitemap' ? canonicalOrigin : origin,source !== 'sitemap' && canonicalOrigin !== origin)));
  const rendered = await start;
  const renders: (Snapshot | FailedSource)[] = [];
  const sourceResults = await sources;
  try {
    for (const [index,page] of pages.entries()) {
      const source = sourceResults[index];
      if ('error' in rendered) renders.push({error:rendered.error,redirects:[]});
      else {
        try { renders.push(await rendered.renderer.capture(page.url,'url' in source ? source.url : undefined)); }
        catch (error) { renders.push({error:message(error),redirects:[]}); }
      }
    }
  } finally { if ('renderer' in rendered) await rendered.renderer.close(); }
  const renderedFirst = renders[0];
  const confirmedRender = renderedFirst && 'url' in renderedFirst && renderedFirst.finalConfirmed !== false ? renderedFirst : undefined;
  const renderedOrigin = confirmedRender ? new URL(confirmedRender.url).origin : origin;
  const aliasOrigin = canonicalOrigin !== origin ? canonicalOrigin : renderedOrigin !== origin ? renderedOrigin : undefined;
  const siteFor = (siteOrigin: string): Promise<Site> => {
    const cached = sourceSites.get(siteOrigin);
    if (cached) return cached;
    const alias = siteOrigin === origin && aliasOrigin ? {origin:aliasOrigin,site:siteFor(aliasOrigin)} : undefined;
    const site = fetchSite(client,siteOrigin,alias);
    sourceSites.set(siteOrigin,site);
    return site;
  };

  const qualityPages: {page:string;document:DocumentRead;entry:Evidence;coverage:CoverageEntry}[] = [];
  for (const [index,page] of pages.entries()) {
    const scope = {page:page.url};
    const sourceResult = sourceResults[index];
    const source = layer(scope,'source','error' in sourceResult ? sourceResult : sourceSnapshot(sourceResult));
    const render = layer(scope,'rendered',renders[index]);
    const current = render.url ?? source.url ?? page.url;
    const intentRule = request.indexIntent.find(rule => rule.page === page.url);
    const intent = intentRule?.intended ?? 'unknown';
    const pageEvidence = [source.network,render.network];
    const pageCoverage = [source.statusCoverage,render.statusCoverage];
    const metadataEvidence = [source.metadata,render.metadata];
    const metadataCoverage = [source.headerCoverage,render.headerCoverage,source.metadataCoverage,render.metadataCoverage];
    const structureCoverage = [source.structuredCoverage,render.structuredCoverage];
    const compare = (a: unknown,b: unknown) => a === undefined || b === undefined ? null : canonicalJson(a) !== canonicalJson(b);
    const observed = (entry: CoverageEntry,value: unknown) => entry.status === 'complete' ? value : undefined;
    const differences = {
      status:compare(observed(source.statusCoverage,source.status),observed(render.statusCoverage,render.status)),
      finalUrl:compare(observed(source.statusCoverage,source.url),observed(render.statusCoverage,render.url)),
      title:compare(observed(source.metadataCoverage,source.document?.title),observed(render.metadataCoverage,render.document?.title)),
      description:compare(observed(source.metadataCoverage,source.document?.description),observed(render.metadataCoverage,render.document?.description)),
      canonical:compare(observed(source.metadataCoverage,source.document?.canonical),observed(render.metadataCoverage,render.document?.canonical)),
      metaDirectives:compare(observed(source.metadataCoverage,source.document?.directives),observed(render.metadataCoverage,render.document?.directives)),
      httpDirectives:compare(observed(source.headerCoverage,source.header.directives),observed(render.headerCoverage,render.header.directives)),
      jsonLd:compare(observed(source.structuredCoverage,source.document?.jsonLd),observed(render.structuredCoverage,render.document?.jsonLd)),
    };
    const comparisonEvidence = addEvidence(scope,'seo.source-rendered','DNS-pinned HTTP and protected Chromium','Observed differences between source and rendered page',{...differences,
      observation:'null means one or both layers were unavailable or incomplete; false means the retained observations matched',
      ownerIntent:intent,ownerNote:intentRule?.note ?? null,
    });

    const badStatus = [source,render].filter(x => x.status !== undefined && !success(x.status));
    const barrierDisposition = intent === 'indexable' ? 'finding' : intent === 'excluded' ? 'intentional' : 'review-needed';
    if (badStatus.length) {
      addFinding(scope,'seo.http-status','Page returned a non-success HTTP status',
        `At least one observed request returned a non-success status. Owner intent: ${intent}.`,
        intent === 'indexable' ? 'high' : 'info',intent === 'excluded' && badStatus.some(x => x.status! >= 500) ? 'review-needed' : barrierDisposition,pageEvidence,pageCoverage,{
          investigate:'Inspect the source and browser redirect chains and the final response from the origin.',
          correct:intent === 'indexable' ? 'Serve the intended public URL or its approved redirect destination with a successful HTML response.' : undefined,
          recheck:'Rerun both source and rendered requests for the same URL after any redirect or origin change.',
        });
    }

    const noindex = [
      ...searchNoindex(source.status === undefined ? [] : source.header.directives),...searchNoindex(render.status === undefined ? [] : render.header.directives),
      ...searchNoindex(source.document?.directives ?? []),...searchNoindex(render.document?.directives ?? []),
    ];
    if (noindex.length) {
      addFinding(scope,'seo.noindex','Noindex directive observed',
        `The source or rendered document exposes noindex or none for ${[...new Set(noindex)].join(', ')}. Owner intent: ${intent}.`,
        intent === 'indexable' ? 'high' : 'info',barrierDisposition,metadataEvidence,metadataCoverage,{
          investigate:'Find the matching meta directive in the page template or the X-Robots-Tag header in the origin/CDN configuration.',
          correct:intent === 'indexable' ? 'Remove the unintended directive from the relevant template or HTTP response.' : undefined,
          recheck:'Repeat the source and rendered check to confirm the directive agrees with the declared intent.',
        });
    }

    const knownOrigins = new Set([origin,canonicalOrigin,new URL(current).origin]);
    const paths = [...new Set([current,page.url,source.url,render.url,...source.redirects.map(hop => hop.url),...render.redirects.map(hop => hop.url)]
      .filter((url): url is string => Boolean(url)).map(url => normalizedHttpUrl(url)).filter((url): url is string => Boolean(url))
      .filter(url => knownOrigins.has(new URL(url).origin)))];
    const siteEntries = await Promise.all([...new Set(paths.map(url => new URL(url).origin))]
      .map(async siteOrigin => [siteOrigin,await siteFor(siteOrigin)] as const));
    const sites = new Map(siteEntries);
    const robotSites = [...sites.values()];
    const site = sites.get(new URL(current).origin)!;
    const robotObservations = paths.slice(0,ROBOTS_PATHS_PER_PAGE).map(affected => {
      const item = sites.get(new URL(affected).origin)!;
      const results = item.rules ? CRAWLERS.map(agent => {
        const decision = robotDecision(item.rules!.groups,agent,affected);
        return {...decision,matchedRule:decision.matchedRule ? {...decision.matchedRule,path:short(decision.matchedRule.path)} : null};
      }) : [];
      return {item,affected,results};
    });
    const robotsReasons = [...robotSites.map(item => item.robotReason).filter(Boolean),
      ...(paths.length > ROBOTS_PATHS_PER_PAGE ? ['Some intermediate redirect paths were omitted by the robots evaluation limit'] : [])];
    const robotsCoverage = addCoverage(scope,'robots.txt policy for observed page origins',
      robotSites.every(item => item.robotStatus === 'complete') && paths.length <= ROBOTS_PATHS_PER_PAGE ? 'complete' :
        robotSites.every(item => item.robotStatus === 'unavailable') ? 'unavailable' : 'incomplete',
      robotsReasons.join('; ') || undefined);
    const robotsArtifacts = robotSites.flatMap(item => {
      if ('error' in item.robots || !item.rules) return [];
      const artifactUrl = item.robots.url;
      const id = 'art_' + digest({agentId,kind:'robots',url:artifactUrl});
      if (!artifacts.has(id)) artifacts.set(id,{id,label:`Robots policy sample: ${new URL(artifactUrl).hostname}`,mediaType:'text/plain',
        bytes:item.robots.body.subarray(0,ROBOTS_BYTES),scope:{page:artifactUrl}});
      return [id];
    });
    const robotsEvidence = addEvidence(scope,'seo.robots-policy','DNS-pinned public HTTP','Robots policy for selected crawler user agents',{
      url:site.robotsUrl,affectedUrl:current,decisions:robotObservations[0].results,
      paths:robotObservations.map(({item,affected,results}) => ({policy:item.robotsUrl,affected,decisions:results})),
      files:robotSites.map(item => ({
        url:item.robotsUrl,fetch:networkData(item.robots),status:item.robotStatus,
        reason:item.robotReason ?? null,groupCount:item.rules?.groups.length ?? null,
        malformedRecords:item.rules?.malformed ?? null,sitemapDeclarations:item.rules?.sitemaps.slice(0,8) ?? [],
      })),
      caveat:'Observed rules and selected crawler tokens only. Access rules do not establish indexing or AI visibility.',
    },robotsArtifacts.length ? [...new Set(robotsArtifacts)] : undefined);
    const blocked = [...new Set(robotObservations.flatMap(({item,results}) => item.robotStatus !== 'complete' ? [] :
      results.filter(x => x.decision === 'disallowed' && SEARCH_CRAWLERS.some(a => a === x.agent)).map(x => x.agent)))];
    if (blocked.length) {
      addFinding(scope,'seo.robots-disallow','Robots policy disallows selected search crawlers',
        `Observed robots.txt rules disallow ${blocked.join(', ')} for the submitted URL, its final URL, or an observed redirect hop. Owner intent: ${intent}.`,
        intent === 'indexable' ? 'high' : 'info',barrierDisposition,[robotsEvidence],[robotsCoverage,...pageCoverage],{
          investigate:'Review the matched crawler group and path rule, including the query string.',
          correct:intent === 'indexable' ? 'Adjust the intended crawler group or path rule to allow access to the public URL.' : undefined,
          recheck:'Check the same path and crawler tokens against the served robots.txt after the change.',
        });
    }

    const sitemapReasons = [...new Set(robotSites.flatMap(item => item.sitemapReasons))];
    const sitemapDocuments = [...new Set(robotSites.flatMap(item => item.maps))];
    const sitemapMissing = robotSites.every(item => item.sitemapMissing);
    const sitemapStatus = sitemapReasons.length ? (sitemapDocuments.length && sitemapDocuments.every(x => 'error' in x.result) ? 'unavailable' : 'incomplete') : 'complete';
    const lookup = new Set([page.url,source.url,render.url].filter((url): url is string => Boolean(url)).map(url => normalizedHttpUrl(url)).filter((url): url is string => Boolean(url)));
    const listedUrls = [...lookup].filter(url => robotSites.some(item => item.locations.has(url)));
    const positiveComplete = sitemapDocuments.some(({result,parsed,reason}) => !('error' in result) && result.status === 200 && !reason && !parsed?.reason && parsed?.root === 'urlset' && parsed.locations.some(url => lookup.has(url)));
    const coverageBasis = positiveComplete ? 'fully-parsed-urlset-match' : sitemapMissing ? 'observed-http-absence' : 'bounded-traversal';
    const sitemapCoverage = addCoverage(scope,'sampled sitemap membership',positiveComplete ? 'complete' : sitemapStatus,positiveComplete ? undefined : sitemapReasons.join('; ') || undefined,{traversalCoverage:sitemapStatus,coverageBasis});
    const sitemapEvidence = addEvidence(scope,'seo.sitemap-membership','DNS-pinned public HTTP',sitemapMissing ? 'Checked sitemap URLs returned HTTP 404 or 410' : listedUrls.length ? 'Page URL appears in the sampled sitemap data' : 'Page URL was not seen in the sampled sitemap data',{
      listed:listedUrls.length > 0,listedUrls,checkedUrls:[...lookup],sampled:true,sitemapMissing,distinctLocations:new Set(robotSites.flatMap(item => [...item.locations])).size,
      reasons:sitemapReasons,documents:sitemapDocuments.map(({requested,result,parsed,reason}) => ({
        requested,...networkData(result),root:parsed?.root ?? null,locations:parsed?.locationCount ?? null,
        sample:parsed?.locations.slice(0,6) ?? [],reason:reason ?? null,
      })),
      coverage:sitemapCoverage.status,traversalCoverage:sitemapStatus,coverageBasis,
    });
    if (page.url === request.targetUrl && sitemapMissing) addFinding(scope,'seo.sitemap-missing','Add a sitemap',
      'The sitemap URLs checked during discovery returned HTTP 404 or 410. A sitemap can help search engines discover the public pages you want indexed.',
      'low','finding',[sitemapEvidence,robotsEvidence],[sitemapCoverage],{
        investigate:'Check whether the site already generates a sitemap at a different URL.',
        correct:'Publish a sitemap listing the canonical public pages you want indexed and declare its URL in robots.txt.',
        recheck:'Verify that the sitemap URL returns HTTP 200 with a readable sitemap and lists the intended URLs.',
      });

    const readable = render.metadataCoverage.status === 'complete' && render.document ? render :
      source.metadataCoverage.status === 'complete' && source.document ? source : undefined;
    if (readable?.document && intent !== 'excluded') {
      const document = readable.document;
      const titleStatus = !document.title ? 'missing' : document.titleCount > 1 ? 'multiple' :
        /^(?:home(?:page)?|index|untitled(?: page)?|welcome(?: to (?:our|the) (?:website|site))?|page(?: \d+)?)$/i.test(document.title) ? 'generic' : 'present';
      const descriptionStatus = !document.description ? 'missing' : document.descriptionCount > 1 ? 'multiple' :
        /(?:lorem ipsum|your (?:meta )?description|description (?:goes )?here|insert description)/i.test(document.description) ? 'placeholder' : 'present';
      const structuredTypes = [...new Set(document.jsonLd.flatMap(block=>block.types))];
      const structuredStatus = readable.structuredCoverage.status !== 'complete' ? 'limited' : !document.structuredCount ? 'absent' :
        document.jsonLd.some(block=>['invalid-json','unexpected-top-level'].includes(block.status)) ? 'invalid' :
        !structuredTypes.length ? 'type-missing' : 'present';
      const qualityCoverage = addCoverage(scope,'page title and description content checks','complete',undefined,
        {layer:readable === render ? 'rendered':'source',meaning:'Presence, basic text checks and duplicates are assessed; search relevance and rich-result eligibility are not established.'});
      const checks: JsonObject[] = [
        {id:'title',status:titleStatus === 'present'?'pass':titleStatus === 'missing'?'finding':'review',message:
          titleStatus === 'present'?'A page title is present and passes the basic text checks.':titleStatus === 'missing'?'The page has no usable title.':titleStatus === 'multiple'?'Multiple title elements compete to describe this page.':'The title is generic and does not identify the page topic or business.'},
        {id:'description',status:descriptionStatus === 'present'?'pass':'review',message:
          descriptionStatus === 'present'?'A page description is present.':descriptionStatus === 'missing'?'No page description was found.':descriptionStatus === 'multiple'?'Multiple meta descriptions compete to describe this page.':'The description appears to contain placeholder text.'},
        {id:'structured-data',status:structuredStatus === 'present'?'pass':structuredStatus === 'invalid'?'finding':'review',message:
          structuredStatus === 'present'?`Readable structured data describes ${structuredTypes.join(', ')}.`:structuredStatus === 'absent'?'No JSON-LD structured data was found.':structuredStatus === 'type-missing'?'Structured data does not identify any entity type.':structuredStatus === 'limited'?'Structured-data inspection was limited.':'Some structured data could not be read as valid JSON.'},
      ];
      const entry = addEvidence(scope,'seo.page-quality',readable === render?'Protected Chromium':'DNS-pinned public HTTP','Page-level search presentation and structured-data checks',{
        pageLabel:document.title || new URL(page.url).pathname,title:document.title,description:document.description,
        titleCount:document.titleCount,descriptionCount:document.descriptionCount,titleCharacters:document.title.length,descriptionCharacters:document.description.length,
        titleStatus,descriptionStatus,structuredTypes,structuredBlocks:document.structuredCount,structuredStatus,source:readable === render?'rendered':'source',checks,
        limits:['Text presence and duplication checks do not establish relevance, search ranking or the wording a search engine will display.',
          'Structured-data syntax and type checks do not establish rich-result eligibility or factual accuracy.'],
      },readable.metadata.artifactIds);
      qualityPages.push({page:page.url,document,entry,coverage:qualityCoverage});
      if (titleStatus !== 'present') addFinding(scope,'seo.title-'+titleStatus,
        titleStatus === 'missing'?'Give this page a clear search title':titleStatus === 'generic'?'Make this page title more descriptive':'Choose one clear title for this page',
        titleStatus === 'missing'?'No usable page title was found in the inspected HTML.':`The inspected page title is “${document.title}”. ${checks[0].message}`,
        'medium',titleStatus === 'missing'?'finding':'review-needed',[entry],[qualityCoverage],{
          investigate:'Check the page topic and intended audience, then compare the title with the main page heading.',
          correct:'Write one concise title that identifies this page’s subject and distinguishes it from other pages.',
          recheck:'Open the same page after the change and verify that its source and rendered title match the intended wording.',
        });
      if (descriptionStatus !== 'present') addFinding(scope,'seo.description-'+descriptionStatus,
        descriptionStatus === 'missing'?'Add a useful description for this page':descriptionStatus === 'placeholder'?'Replace placeholder description text':'Choose one description for this page',
        String(checks[1].message),'low','review-needed',[entry],[qualityCoverage],{
          investigate:'Review what a prospective customer should learn about this page before choosing to visit it.',
          correct:'Write a specific, accurate description of this page rather than repeating generic site-wide text.',
          recheck:'Check the source and rendered meta description. Search engines may choose a different snippet.',
        });
      if (structuredStatus === 'type-missing') addFinding(scope,'seo.structured-data-type-missing','Describe what this structured data represents',
        'The readable JSON-LD does not identify an entity type. Review whether it gives search engines useful information about this page.',
        'low','review-needed',[entry],[readable.structuredCoverage],{
          investigate:'Identify the business or content represented and check whether the structured data is a complete entity or only a reference.',
          recheck:'Validate the intended entity type and relevant properties with the search provider’s structured-data test.',
        });
    }

    const documents = [source,render].filter(x => x.document);
    const canonicalIssues = documents.flatMap(x => {
      const references = x.document!.canonical;
      const resolved = new Set(references.flatMap(ref => ref.url ? [ref.url] : []));
      const final = normalizedHttpUrl(x.url!);
      const difference = [...resolved].some(url => url !== final);
      return references.some(ref => !ref.url) || resolved.size > 1 || difference ? [x] : [];
    });
    if (canonicalIssues.length) {
      addFinding(scope,'seo.canonical-target','Canonical target needs review',
        'Observed canonical declarations include a different URL, conflicting targets, or an invalid target. Confirm the intended primary URL before changing the declaration.',
        'medium','review-needed',[...metadataEvidence,comparisonEvidence],metadataCoverage,{
          investigate:'Compare the resolved source and rendered canonicals with the final document URL and the owner’s consolidation plan.',
          correct:'Where a declaration is wrong, replace it with a single valid canonical that names the intended primary URL.',
          recheck:'Fetch and render the same URL, then verify that both layers declare the expected canonical.',
        });
    }
    if (differences.title || differences.description || differences.canonical || differences.metaDirectives || differences.httpDirectives || differences.status || differences.finalUrl || differences.jsonLd) {
      addFinding(scope,'seo.source-rendered-difference','Source and rendered search signals differ',
        'The two collection methods returned different titles, descriptions, status, final URL, canonical, indexing directives, or JSON-LD observations. Review the evidence to determine whether browser rendering, redirects, or request handling account for the difference.',
        'low','review-needed',[...pageEvidence,...metadataEvidence,comparisonEvidence],[...pageCoverage,...metadataCoverage],{
          investigate:'Compare the HTTP response and rendered DOM, and check the template or client-side code responsible for each signal.',
          recheck:'Repeat both observations against the same submitted URL and expected document state.',
        });
    }

    if (documents.some(x => x.document!.jsonLd.some(block => block.status === 'invalid-json' || block.status === 'unexpected-top-level'))) {
      addFinding(scope,'seo.structured-data-invalid','JSON-LD block could not be read as a JSON object or array',
        'At least one sampled JSON-LD block contains invalid JSON or a primitive top-level value.',
        'medium','finding',[source.structured,render.structured],structureCoverage,{
          investigate:'Locate the sampled block by its position among JSON-LD scripts and inspect its template output.',
          correct:'Serialize the intended object or array as valid JSON-LD in the affected template.',
          recheck:'Repeat source and rendered parsing and verify the intended types are present.',
        });
    }
    if (intent === 'excluded' && !noindex.length && !badStatus.length && [...metadataCoverage,...pageCoverage].every(x => x.status === 'complete')) {
      addFinding(scope,'seo.exclusion-unconfirmed','No explicit indexing exclusion was observed',
        'The owner marked this page for exclusion. The observed responses were successful and lacked a supported noindex directive; robots.txt access rules and canonical hints do not establish indexing exclusion.',
        'medium','review-needed',[...pageEvidence,...metadataEvidence,robotsEvidence],[...pageCoverage,...metadataCoverage],{
          investigate:'Confirm the intended exclusion mechanism and review separate search-provider evidence if available.',
          correct:'If the URL should stay publicly reachable but excluded from search, add the appropriate noindex directive and allow the intended crawler to read it.',
          recheck:'Check the response headers and rendered DOM, and confirm search-provider status separately if needed.',
        });
    }
  }

  const duplicates = (field:'title'|'description') => {
    const values = new Map<string,typeof qualityPages>();
    for (const page of qualityPages) {
      const value = page.document[field].trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
      if (!value) continue;
      const group = values.get(value) ?? []; group.push(page); values.set(value,group);
    }
    return [...values.values()].filter(group=>group.length > 1);
  };
  const duplicateTitles = duplicates('title');
  const duplicateDescriptions = duplicates('description');
  for (const [field,groups] of [['title',duplicateTitles],['description',duplicateDescriptions]] as const) {
    for (const group of groups) for (const page of group) addFinding({page:page.page},'seo.'+field+'-duplicate',
      field === 'title'?'Different pages use the same search title':'Different pages use the same description',
      `${group.length} sampled pages share this ${field}: “${page.document[field]}”. Review whether they represent distinct content.`,
      'medium','review-needed',group.map(item=>item.entry),group.map(item=>item.coverage),{
        investigate:'Compare the sampled pages and their intended topics. Shared wording may be appropriate for deliberate duplicate or consolidated pages.',
        correct:`For distinct pages, write a specific ${field} that explains each page’s own content.`,
        recheck:`Rerun the same page sample and confirm that distinct pages have distinguishable ${field}s.`,
      });
  }
  const sampleData = {mode:discover?'sitemap-sample':'configured',pages:pages.map(({url,source})=>({url,source})),limit:discover?DEFAULT_PAGE_SAMPLE:pages.length,availableSitemapUrls,
    duplicateTitles:duplicateTitles.map(group=>({value:group[0].document.title,pages:group.map(item=>item.page)})),
    duplicateDescriptions:duplicateDescriptions.map(group=>({value:group[0].document.description,pages:group.map(item=>item.page)})),
    scopeNote:discoveryReason ?? 'A bounded sample of public pages was inspected; this is not a whole-site audit.'};
  addEvidence({page:request.targetUrl},'seo.sample-summary','DNS-pinned sitemap discovery and page inspection',`${pages.length} public pages selected for SEO inspection`,sampleData);
  if (discover) addCoverage({page:request.targetUrl},'public-page sample selection',discoveryLimited?'incomplete':'complete',discoveryReason,
    {selectedPages:pages.length,availableSitemapUrls,selection:'Shallower same-origin sitemap URLs, then URLs without query strings, then alphabetical order. Maximum three pages.'});

  const records = request.supplied?.searchConsole ?? [];
  const suppliedKeys = new Set<string>();
  for (const record of records) {
    const key = digest(record);
    if (suppliedKeys.has(key)) continue;
    suppliedKeys.add(key);
    evidence.push(createEvidence({
      agentId,scope:{page:record.page},kind:'seo.search-console',key,
      source:{kind:'supplied',name:record.source.name,reference:record.source.reference},
      summary:record.observation,data:{observation:record.observation,coverage:record.coverage,window:{start:record.source.start,end:record.source.end}},
    }));
  }
  for (const {url} of pages) {
    const count = records.filter(r => r.page === url).length;
    addCoverage({page:url},'owner-supplied Search Console evidence',count ? 'complete' : 'not-configured',
      count ? undefined : 'No Search Console evidence supplied for this page',count ? {records:count} : undefined);
  }
  return {
    testedUrl:confirmedRender ? confirmedRender.url : 'url' in first ? first.url : request.targetUrl,
    runtime:{node:process.version,engine:ENGINE + '-' + digest(pages.map(page => page.url)),browser:'renderer' in rendered ? rendered.renderer.browser : 'unavailable',
      browserDriver:'renderer' in rendered ? rendered.renderer.driver : undefined},
    coverage,evidence,findings,artifacts:[...artifacts.values()],diagnostics:[...diagnostics],
    measurements:{seoSample:{mode:discover?'sitemap-sample':'configured',pages:pages.map(({url,source})=>({url,source})),limit:discover?DEFAULT_PAGE_SAMPLE:pages.length,availableSitemapUrls,scopeNote:discoveryReason??'This is a bounded sample of public pages, not a whole-site audit.'}},
  };
}

export async function collectSeo(request: ValidatedRequest, options: CollectorOptions = {}): Promise<CollectorResult> {
  const client = createPublicHttpClient({signal:options.signal});
  try { return await collectSeoEvidence(request,client,() => browserRenderer(request,options)); }
  finally { client.close(); }
}

