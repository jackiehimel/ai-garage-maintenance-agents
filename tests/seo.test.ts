import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { collectSeoEvidence } from '../src/agents/seo.js';
import { baselineIdentity, compareFindings, createBaseline } from '../src/core/baseline.js';
import { validateRequest } from '../src/core/input.js';
import { createPublicHttpClient } from '../src/core/network.js';

const url = 'https://example.com/custom?release=2';
const extra = 'https://example.com/extra';
const noindex = '<meta name="robots" content="noindex, follow">';
const template = (head = '') => '<!doctype html><html><head>' + head + '</head><body>Test</body></html>';
const runtime = { browser: '120.0.0.0', driver: '1.63.0' };

async function fixture(options: { intent?: 'indexable'|'excluded'; source?: string; render?: string|null; search?: boolean; sitemaps?: boolean; redirect?: boolean; robots?: string; sitemap?: string; headers?: Record<string,string>; provisionalBrowser?: boolean } = {}) {
  const request = validateRequest({
    agentId: 'seo-ai-search', targetUrl: url, pages: [extra],
    indexIntent: options.intent ? [{page:url,intended:options.intent}] : [],
    supplied: options.search ? {searchConsole:[{page:url,observation:'Owner report',coverage:'Property export',source:{name:'GSC',start:'2026-11-01',end:'2026-11-02'}}]} : undefined,
  });
  const requested: string[] = [];
  const documents = new Map([
    ['/custom?release=2', template(options.source)],
    ['/extra', template()],
    ['/landing', template()],
    ['/robots.txt', options.robots ?? (options.sitemaps ? 'Sitemap: https://example.com/index.xml\nUser-agent: *\nDisallow: /custom*\nUser-agent: Googlebot\nDisallow: /custom\nAllow: /custom?release=2$' : 'User-agent: *\nDisallow:')],
    ['/index.xml', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/sitemap.xml</loc></sitemap></sitemapindex>'],
    ['/sitemap.xml', options.sitemap ?? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/custom?release=2&amp;x=3</loc></url><url><loc>https://example.com/extra</loc></url></urlset>'],
  ]);
  const client = createPublicHttpClient({
    resolve: async () => [{address:'93.184.215.14',family:4}],
    transport: async ({url}) => {
      const path = url.pathname + url.search;
      requested.push(url.href);
      if (options.redirect && path === '/custom?release=2') return {status:301,headers:{location:'/landing'},body:Readable.from([])};
      const body = documents.get(path);
      const status = body === undefined || (!options.sitemaps && path.endsWith('.xml')) ? 404 : 200;
      return {status,headers:{'content-type':path.endsWith('.xml') ? 'application/xml' : path === '/robots.txt' ? 'text/plain' : 'text/html',...(path === '/custom?release=2' ? options.headers : {})},body:Readable.from([status === 200 ? body! : ''])};
    },
  });
  try {
    const result = await collectSeoEvidence(request, client, async () => ({
      ...runtime,
      capture: async (page) => {
        if (options.render === null) throw new Error('Rendered fixture unavailable');
        if (page === url && options.provisionalBrowser) return {url:'https://example.com/intermediate',status:302,redirects:[],headers:{location:'https://blocked.example/'},diagnostics:[],reason:'Navigation blocked',networkReason:'No final document',finalConfirmed:false};
        const html = page === url ? template(options.render ?? options.source) : template();
        return {url:page,status:200,redirects:[],headers:{},html,diagnostics:[]};
      },
      close: async () => {},
    }));
    return {result,request,requested};
  } finally { client.close(); }
}

test('scans submitted URLs and preserves source versus rendered canonical and JSON-LD observations', async () => {
  const source = '<base href="/a/"><link rel="alternate canonical" href="../custom?release=2"><script type="application/ld+json">{"@graph":[{"@type":["WebPage","Article"]}]}</script>';
  const render = '<link rel="canonical" href="/other"><script type="application/ld+json">{invalid}</script>';
  const {result,requested} = await fixture({source,render,search:true});
  assert.deepEqual(requested.filter(x => !x.endsWith('.txt') && !x.endsWith('.xml')).sort(),[url,extra]);
  const comparison = result.evidence.find(e => e.kind === 'seo.source-rendered' && e.scope.page === url);
  assert.ok(comparison);
  assert.match(JSON.stringify(comparison.data), /"canonical":true/);
  assert.match(JSON.stringify(result.evidence), /Article/);
  assert.ok(result.findings.some(f => f.rule === 'seo.structured-data-invalid' && f.scope.page === url));
  assert.ok(result.evidence.some(e => e.kind === 'seo.search-console' && e.source.kind === 'supplied' && JSON.stringify(e.data).includes('2026-11-02')));
});

test('the same measured noindex is classified according to owner intent', async () => {
  for (const [intent,disposition] of [[undefined,'review-needed'],['excluded','intentional'],['indexable','finding']] as const) {
    const {result} = await fixture({intent,source:noindex});
    const found = result.findings.find(f => f.rule === 'seo.noindex' && f.scope.page === url);
    assert.equal(found?.disposition,disposition);
    assert.ok(found?.evidenceIds.length);
  }
});

test('known noindex removal resolves only when equivalent HTML and rendering were observed', async () => {
  const first = await fixture({intent:'indexable',render:noindex});
  const clean = await fixture({intent:'indexable'});
  const partial = await fixture({intent:'indexable',render:null});
  const identity = baselineIdentity(first.request,first.result.runtime,first.result.testedUrl);
  const baseline = createBaseline(identity,first.result);
  assert.equal(baseline.status,'available');
  if (baseline.status !== 'available') return;
  const finding = first.result.findings.find(f => f.rule === 'seo.noindex' && f.scope.page === url);
  assert.ok(finding);
  for (const [run,expected] of [[clean,'resolved'],[partial,'inconclusive']] as const) {
    const actual = compareFindings(baselineIdentity(run.request,run.result.runtime,run.result.testedUrl),run.result,baseline.baseline);
    assert.equal(actual.findings.find(f => f.id === finding.id)?.status,expected);
  }
});

test('robots evaluation honors crawler-specific groups and sitemap samples retain query identity', async () => {
  const {result} = await fixture({sitemaps:true});
  const robots = result.evidence.find(e => e.kind === 'seo.robots-policy' && e.scope.page === url);
  assert.ok(robots);
  const decisions = (robots.data as {decisions: {agent:string; decision:string}[]}).decisions;
  assert.equal(decisions.find(x => x.agent === 'Googlebot')?.decision,'allowed');
  assert.equal(decisions.find(x => x.agent === 'Bingbot')?.decision,'disallowed');
  assert.equal(result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === url)?.data &&
    (result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === url)?.data as {listed:boolean}).listed,false);
  assert.ok(result.evidence.some(e => e.kind === 'seo.sitemap-membership' && e.scope.page === extra && (e.data as {listed:boolean}).listed));
});

test('a redirected URL can be blocked by robots at the submitted path even when the final path is allowed', async () => {
  const {result} = await fixture({intent:'indexable',redirect:true,render:null,robots:'User-agent: Googlebot\nDisallow: /custom'});
  const source = result.evidence.find(e => e.kind === 'seo.source-http' && e.scope.page === url);
  assert.ok(source);
  assert.equal(result.testedUrl,'https://example.com/landing');
  assert.deepEqual((source.data as {redirects:unknown[]}).redirects,[{url,status:301,location:'/landing'}]);
  const blocked = result.findings.find(f => f.rule === 'seo.robots-disallow' && f.scope.page === url);
  assert.equal(blocked?.disposition,'finding');
});

test('truncated or malformed sitemap data cannot establish that a URL is absent', async () => {
  const {result} = await fixture({sitemaps:true,sitemap:'<urlset><url><loc>https://example.com/extra</loc></url>'});
  const sitemap = result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === url);
  assert.ok(sitemap);
  assert.equal((sitemap.data as {coverage:string}).coverage,'incomplete');
  assert.ok(result.coverage.some(c => c.scope.page === url && c.subject === 'sampled sitemap membership' && c.status === 'incomplete'));
  assert.ok(!result.findings.some(f => f.rule.includes('sitemap') && f.disposition === 'finding'));
});

test('crawler-scoped X-Robots-Tag distinguishes a search exclusion from an AI crawler directive', async () => {
  const both = await fixture({intent:'indexable',headers:{'x-robots-tag':'GPTBot: noindex, Googlebot: none'}});
  const aiOnly = await fixture({intent:'indexable',headers:{'x-robots-tag':'GPTBot: noindex'}});
  const item = both.result.findings.find(f => f.rule === 'seo.noindex' && f.scope.page === url);
  assert.ok(item?.summary.includes('googlebot'));
  assert.ok(!aiOnly.result.findings.some(f => f.rule === 'seo.noindex' && f.scope.page === url));
});

test('an intermediate browser response cannot stand in for a verified final document', async () => {
  const {result} = await fixture({intent:'indexable',provisionalBrowser:true});
  assert.equal(result.testedUrl,url);
  assert.ok(result.coverage.some(c => c.scope.page === url && c.subject === 'rendered HTTP indexing directives' && c.status === 'incomplete'));
  assert.ok(!result.findings.some(f => f.scope.page === url && f.rule === 'seo.http-status'));
  const response = result.evidence.find(e => e.scope.page === url && e.kind === 'seo.rendered-http');
  assert.equal((response?.data as {status:number}).status,302);
});
