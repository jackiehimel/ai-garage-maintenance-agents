import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { collectSeoEvidence, seoGuardFailuresAccounted } from '../src/agents/seo.js';
import { baselineIdentity, compareFindings, createBaseline } from '../src/core/baseline.js';
import { validateRequest } from '../src/core/input.js';
import { createPublicHttpClient } from '../src/core/network.js';

const url = 'https://example.com/custom?release=2';
const extra = 'https://example.com/extra';
const noindex = '<meta name="robots" content="noindex, follow">';
const template = (head = '') => '<!doctype html><html><head>' + head + '</head><body>Test</body></html>';
const runtime = { browser: '120.0.0.0', driver: '1.63.0' };

async function fixture(options: { intent?: 'indexable'|'excluded'; source?: string; render?: string|null; search?: boolean; sitemaps?: boolean; redirect?: boolean; robots?: string; sitemap?: string; headers?: Record<string,string>; provisionalBrowser?: boolean; renderFailure?: boolean; sitemapIndex?: string; diagnostics?: string[]; requestFailures?: import('../src/core/browser.js').BrowserFailureDiagnostics } = {}) {
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
    ['/index.xml', options.sitemapIndex ?? '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/sitemap.xml</loc></sitemap></sitemapindex>'],
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
        if (options.renderFailure) return {error:'Final browser response unavailable',redirects:[],requestFailures:options.requestFailures};
        if (options.render === null) throw new Error('Rendered fixture unavailable');
        if (page === url && options.provisionalBrowser) return {url:'https://example.com/intermediate',status:302,redirects:[],headers:{location:'https://blocked.example/'},diagnostics:[],reason:'Navigation blocked',networkReason:'No final document',finalConfirmed:false};
        const html = page === url ? template(options.render ?? options.source) : template();
        return {url:page,status:200,redirects:[],headers:{},html,diagnostics:options.diagnostics ?? [],requestFailures:options.requestFailures};
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
  for (const sitemapXml of ['<urlset><url><loc>https://example.com/extra</loc></url>',
    '<urlset><sitemap><loc>https://example.com/extra</loc></sitemap></urlset>']) {
    const {result} = await fixture({sitemaps:true,sitemap:sitemapXml});
    const sitemap = result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === url);
    assert.ok(sitemap);
    assert.equal((sitemap.data as {coverage:string}).coverage,'incomplete');
    assert.ok(result.coverage.some(c => c.scope.page === url && c.subject === 'sampled sitemap membership' && c.status === 'incomplete'));
    assert.ok(!result.findings.some(f => f.rule.includes('sitemap') && f.disposition === 'finding'));
  }
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

test('a confirmed www alias can share the exact measured canonical robots file and sitemap', async () => {
  const submitted = 'https://www.example.com/';
  const canonical = 'https://example.com/';
  for (const robotsTarget of [canonical + 'robots.txt','https://unrelated.example.org/robots.txt']) {
    const requests: string[] = [];
    const client = createPublicHttpClient({
      resolve: async () => [{address:'93.184.215.14',family:4}],
      transport: async ({url}) => {
        requests.push(url.href);
        if (url.href === submitted || url.href === submitted + 'robots.txt') {
          return {status:301,headers:{location:url.href === submitted ? canonical : robotsTarget},body:Readable.from([])};
        }
        const [type,body] = url.href === canonical + 'robots.txt' ?
          ['text/plain','User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml'] :
          url.href === canonical + 'sitemap.xml' ?
            ['application/xml','<urlset><url><loc>https://example.com/</loc></url></urlset>'] : ['text/html',template()];
        return {status:200,headers:{'content-type':type},body:Readable.from([body])};
      },
    });
    try {
      const request = validateRequest({agentId:'seo-ai-search',targetUrl:submitted});
      const result = await collectSeoEvidence(request,client,async () => ({
        ...runtime,capture:async () => ({url:canonical,status:200,headers:{},redirects:[],html:template(),diagnostics:[]}),
        close:async () => {},
      }));
      const verifiedAlias = robotsTarget === canonical + 'robots.txt';
      const coverage = result.coverage.find(x => x.subject === 'robots.txt policy for observed page origins');
      assert.equal(coverage?.status,verifiedAlias ? 'complete' : 'incomplete');
      const robot = result.evidence.find(x => x.kind === 'seo.robots-policy');
      assert.ok(robot);
      const legacy = (robot.data as {files:{url:string;fetch:{url?:string;redirects:{location:string}[]}}[]}).files.find(x => x.url === submitted + 'robots.txt');
      assert.equal(legacy?.fetch.redirects[0]?.location,robotsTarget);
      if (verifiedAlias) {
        assert.equal(legacy?.fetch.url,robotsTarget);
        assert.ok(!requests.includes(submitted + 'sitemap.xml'));
        assert.equal(requests.filter(x => x === canonical + 'robots.txt').length,1);
        const sitemap = result.evidence.find(x => x.kind === 'seo.sitemap-membership');
        assert.equal((sitemap?.data as {documents:unknown[]}).documents.length,1);
      } else {
        assert.ok(!requests.includes(robotsTarget));
      }
    } finally { client.close(); }
  }
});


const wideIndex = '<sitemapindex>' + ['sitemap.xml','a.xml','b.xml','c.xml','d.xml'].map(name => `<sitemap><loc>https://example.com/${name}</loc></sitemap>`).join('') + '</sitemapindex>';

test('fully parsed positive membership is complete even when bounded traversal is incomplete', async () => {
  const {result} = await fixture({sitemaps:true,sitemapIndex:wideIndex});
  const item = result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === extra)!;
  const data = item.data as Record<string, unknown>;
  assert.equal(data.coverage,'complete');
  assert.equal(data.traversalCoverage,'incomplete');
  assert.equal(data.coverageBasis,'fully-parsed-urlset-match');
  assert.equal(data.sampled,true);
  assert.match(JSON.stringify(data.reasons),/limit reached/);
  assert.equal(result.coverage.find(c => c.subject === 'sampled sitemap membership' && c.scope.page === extra)?.status,'complete');
  const missing = result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === url)!;
  assert.equal((missing.data as Record<string, unknown>).coverage,'incomplete');
  assert.equal((missing.data as Record<string, unknown>).coverageBasis,'bounded-traversal');
});

test('partial positive urlsets and index locations cannot establish complete scoped membership', async () => {
  for (const sitemap of ['<urlset><url><loc>https://example.com/extra</loc></url>',
    '<urlset><url><loc>https://example.com/extra</loc></url><wrong/></urlset>',
    '<sitemapindex><sitemap><loc>https://example.com/extra</loc></sitemap></sitemapindex>']) {
    const {result} = await fixture({sitemaps:true,sitemapIndex:wideIndex,sitemap});
    const data = result.evidence.find(e => e.kind === 'seo.sitemap-membership' && e.scope.page === extra)!.data as Record<string, unknown>;
    assert.equal(data.coverage,'incomplete');
    assert.equal(data.coverageBasis,'bounded-traversal');
  }
});

test('retained request identities and overflow remain visible evidence and render limitations', async () => {
  const requestFailures = {failures:[{method:'POST',url:'https://example.com/api',resourceType:'fetch',mainDocument:false,reason:'Browser method blocked'}],overflow:2};
  const {result} = await fixture({requestFailures});
  const http = result.evidence.find(e => e.kind === 'seo.rendered-http' && e.scope.page === url)!;
  assert.deepEqual((http.data as Record<string,unknown>).requestFailures,requestFailures);
  assert.equal(result.coverage.find(c => c.subject === 'rendered HTML canonical and indexing directives' && c.scope.page === url)?.status,'incomplete');
});

test('SEO observes failed and HTTP-error requests with bounded redacted identity', async () => {
  const {observeSeoRequestFailures} = await import('../src/agents/seo.js');
  const listeners = new Map<string,(value: unknown) => void>();
  const notes: string[] = [];
  const failures = observeSeoRequestFailures({on:(name: string,listener: (value: unknown) => void) => listeners.set(name,listener)} as never,text => notes.push(text));
  const request = (type: string,main = false) => ({method:() => 'GET',url:() => 'https://example.com/asset?token=secret#secret',resourceType:() => type,isNavigationRequest:() => main,frame:() => ({parentFrame:() => null}),failure:() => ({errorText:'net::ERR_FAILED https://example.com/asset?token=secret#secret'})});
  listeners.get('requestfailed')!(request('document',true));
  listeners.get('response')!({request:() => request('stylesheet'),status:() => 503});
  listeners.get('response')!({request:() => request('script'),status:() => 200});
  for (let count = 0; count < 18; count++) listeners.get('requestfailed')!(request('fetch'));
  const retained = failures.snapshot();
  assert.equal(retained.failures.length,16);
  assert.equal(retained.overflow,4);
  assert.equal(retained.failures[0].mainDocument,true);
  assert.equal(retained.failures[1].resourceType,'stylesheet');
  assert.equal(retained.failures[1].reason,'returned HTTP 503');
  assert.doesNotMatch(JSON.stringify({retained,notes}),/secret|token|#/);
});

test('failed main navigation retains request failure identities in SEO evidence', async () => {
  const requestFailures = {failures:[{method:'GET',url:'https://other.example.com/',resourceType:'document',mainDocument:true,reason:'Browser document left the accepted origin'}],overflow:0};
  const {result} = await fixture({renderFailure:true,requestFailures});
  const http = result.evidence.find(e => e.kind === 'seo.rendered-http' && e.scope.page === url)!;
  assert.deepEqual((http.data as Record<string,unknown>).requestFailures,requestFailures);
  assert.equal(result.coverage.find(c => c.subject === 'rendered HTTP status and redirects' && c.scope.page === url)?.status,'unavailable');
});


test('only exact observed reporting blocks and ordinary non-content assets preserve metadata coverage', async () => {
  const reporting = ['https://analytics.google.com/g/collect','https://stats.g.doubleclick.net/g/collect',
    'https://www.google.com/g/collect','https://www.google.com/ccm/collect',
    'https://ad.doubleclick.net/ccm/s/collect','https://www.google.com/rmkt/collect/123/'];
  const failures = reporting.map(url=>({method:'POST',url,resourceType:'fetch',mainDocument:false,reason:'Browser method blocked'}));
  failures.push({method:'GET',url:'https://ad.doubleclick.net/ccm/s/collect',resourceType:'image',mainDocument:false,reason:'failed: net::ERR_BLOCKED_BY_CLIENT.Inspector'});
  failures.push({method:'GET',url:'https://ad.doubleclick.net/ccm/s/collect',resourceType:'image',mainDocument:false,reason:'failed: net::ERR_BLOCKED_BY_ORB'});
  failures.push({method:'GET',url:'https://example.com/video',resourceType:'media',mainDocument:false,reason:'failed: net::ERR_ABORTED'});
  for (const resourceType of ['image','media','font','ping']) failures.push({method:'GET',url:'https://example.com/asset',resourceType,mainDocument:false,reason:'returned HTTP 404'});
  const {result} = await fixture({requestFailures:{failures,overflow:0},diagnostics:['Browser method blocked']});
  for (const page of [url,extra]) {
    assert.equal(result.coverage.find(c=>c.subject === 'rendered HTML canonical and indexing directives' && c.scope.page === page)?.status,'complete');
    assert.equal(result.coverage.find(c=>c.subject === 'rendered JSON-LD parse and type observations' && c.scope.page === page)?.status,'complete');
    const data = result.evidence.find(e=>e.kind === 'seo.rendered-http' && e.scope.page === page)!.data as Record<string,unknown>;
    assert.deepEqual(data.requestFailures,{failures,overflow:0});
    assert.ok((data.requestFailureImpact as Array<{impact:string;reason:string}>).every(f=>f.impact === 'non-content' && f.reason.length>0));
  }
});

test('unknown, spoofed, security, unaccounted and overflow failures still limit rendered observations', async () => {
  const base = {method:'POST',url:'https://analytics.google.com/g/collect',resourceType:'fetch',mainDocument:false,reason:'Browser method blocked'};
  const invalid = [
    {...base,url:'https://analytics.google.com.attacker.example/g/collect'},
    {...base,url:'https://analytics.google.com/g/collect/extra'},
    {...base,url:'https://analytics.google.com:443/g/collect'},
    {...base,url:'HTTPS://analytics.google.com:443/g/collect'},
    {...base,url:'https://user@analytics.google.com/g/collect'},
    {...base,url:'http://analytics.google.com/g/collect'},
    {...base,url:'https://example.com/api'},
    {...base,resourceType:'script'}, {...base,resourceType:'stylesheet'},
    {...base,resourceType:'document'}, {...base,resourceType:'unknown'}, {...base,mainDocument:true},
    {...base,reason:'Private address blocked'},
    {...base,method:'GET',resourceType:'media',reason:'Browser method blocked'},
  ];
  for (const requestFailures of [...invalid.map(f=>({failures:[f],overflow:0})),{failures:[base],overflow:1},{failures:[],overflow:0},undefined]) {
    const {result} = await fixture({requestFailures,diagnostics:['Browser method blocked']});
    assert.equal(result.coverage.find(c=>c.subject === 'rendered HTML canonical and indexing directives' && c.scope.page === url)?.status,'incomplete');
  }
  for (const reason of ['Page script error: failed','Browser request budget exceeded']) {
    const {result} = await fixture({requestFailures:{failures:[base],overflow:0},diagnostics:[reason]});
    assert.equal(result.coverage.find(c=>c.subject === 'rendered JSON-LD parse and type observations' && c.scope.page === url)?.status,'incomplete');
  }
});


test('asset security and unknown errors remain limiting, including ORB outside the exact reporting image', async () => {
  const base = {method:'GET',url:'https://ad.doubleclick.net/ccm/s/collect',resourceType:'image',mainDocument:false,reason:'failed: net::ERR_BLOCKED_BY_ORB'};
  const failures = [
    ...['ERR_CERT_AUTHORITY_INVALID','ERR_SSL_PROTOCOL_ERROR','ERR_UNSAFE_PORT','ERR_MADE_UP_CODE'].map(code=>({...base,reason:'failed: net::'+code})),
    {...base,url:'https://ad.doubleclick.net.attacker.example/ccm/s/collect'},
    {...base,url:'https://ad.doubleclick.net/ccm/s/collect/extra'},
    {...base,resourceType:'fetch'}, {...base,resourceType:'script'}, {...base,mainDocument:true},
    {...base,reason:'failed: net::ERR_BLOCKED_BY_ORB.Inspector'},
  ];
  for (const failure of failures) {
    const {result} = await fixture({requestFailures:{failures:[failure],overflow:0}});
    assert.equal(result.coverage.find(c=>c.subject === 'rendered HTML canonical and indexing directives' && c.scope.page === url)?.status,'incomplete');
    const data = result.evidence.find(e=>e.kind === 'seo.rendered-http' && e.scope.page === url)!.data as Record<string,unknown>;
    assert.deepEqual(data.requestFailures,{failures:[failure],overflow:0});
    assert.equal((data.requestFailureImpact as Array<{impact:string}>)[0].impact,'limiting');
  }
});


test('observed xhr guard and fetch failure account for the same reporting request', () => {
  const guard = {method:'POST',url:'https://analytics.google.com/g/collect',resourceType:'xhr',mainDocument:false,reason:'Browser method blocked'};
  const observed = {...guard,resourceType:'fetch',reason:'failed: net::ERR_BLOCKED_BY_CLIENT.Inspector'};
  assert.equal(seoGuardFailuresAccounted([guard],[observed]),true);
  assert.equal(seoGuardFailuresAccounted([guard,guard],[observed]),false);
});
