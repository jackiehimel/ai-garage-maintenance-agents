import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { collectSeoEvidence } from '../src/agents/seo.js';
import { validateRequest } from '../src/core/input.js';
import { createPublicHttpClient } from '../src/core/network.js';
import { baselineIdentity, createBaseline, compareFindings } from '../src/core/baseline.js';

const target='https://example.com/';
const html=(title:string,description:string,structured='')=>`<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}">${structured}</head><body>Page</body></html>`;
async function scan(options:{pages?:string[];sitemap?:string[];documents?:Record<string,string>;preview?:Uint8Array}={}) {
  const request=validateRequest({agentId:'seo-ai-search',targetUrl:target,...(options.pages?{pages:options.pages}:{})});
  const pages=options.sitemap??['https://example.com/services/','https://example.com/about/','https://other.com/steal','https://example.com/blog/post/a','https://example.com/file.pdf','https://example.com/'];
  const requested:string[]=[];
  const documents=options.documents??{
    [target]:html('Example advisory services','Independent advisory services for growing businesses.'),
    [target+'about/']:html('About our team','Meet our experienced advisory team and learn how we work.'),
    [target+'services/']:html('Services for growing businesses','Explore the advisory services available to growing businesses.'),
  };
  const client=createPublicHttpClient({resolve:async()=>[{address:'93.184.215.14',family:4}],transport:async({url})=>{
    requested.push(url.href);
    const body=url.pathname==='/robots.txt'?'User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml':url.pathname==='/sitemap.xml'?'<urlset>'+pages.map(page=>`<url><loc>${page.replaceAll('&','&amp;')}</loc></url>`).join('')+'</urlset>':documents[url.href];
    return {status:body?200:404,headers:{'content-type':url.pathname.endsWith('.xml')?'application/xml':url.pathname==='/robots.txt'?'text/plain':'text/html'},body:Readable.from([body??''])};
  }});
  try {
    const result=await collectSeoEvidence(request,client,async()=>({browser:'test-browser',driver:'test-driver',close:async()=>{},capture:async(url)=>({url,status:documents[url]?200:404,headers:{},redirects:[],html:documents[url],preview:url===target?options.preview:undefined,diagnostics:[]})}));
    return {result,request,requested};
  } finally {client.close();}
}

test('default SEO samples only two additional same-origin sitemap pages and records the actual scope',async()=>{
  const {result,requested}=await scan();
  assert.deepEqual(requested.filter(url=>!url.endsWith('.txt')&&!url.endsWith('.xml')).sort(),[target,target+'about/',target+'services/'].sort());
  assert.deepEqual((result.measurements?.seoSample as any)?.pages.map((page:any)=>page.url),[target,target+'about/',target+'services/']);
  assert.equal(result.evidence.filter(item=>item.kind==='seo.page-quality').length,3);
  assert.ok(result.evidence.some(item=>item.kind==='seo.sample-summary'));
});

test('explicit SEO pages remain the exact requested scope',async()=>{
  const {result,requested}=await scan({pages:[target]});
  assert.deepEqual(requested.filter(url=>!url.endsWith('.txt')&&!url.endsWith('.xml')),[target]);
  assert.equal((result.measurements?.seoSample as any)?.mode,'configured');
});

test('SEO turns generic metadata and cross-page duplicates into reviewable guidance while retaining healthy observations',async()=>{
  const {result}=await scan({documents:{
    [target]:html('Home','Welcome to our website'),
    [target+'about/']:html('Home','Welcome to our website'),
    [target+'services/']:html('Explore our advisory services','Find the support your business needs.', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Service","name":"Advisory"}</script>'),
  }});
  assert.ok(result.findings.some(item=>item.rule==='seo.title-generic'&&item.disposition==='review-needed'));
  assert.equal(result.findings.filter(item=>item.rule==='seo.title-duplicate').length,2);
  assert.equal(result.findings.filter(item=>item.rule==='seo.description-duplicate').length,2);
  const quality=result.evidence.find(item=>item.kind==='seo.page-quality'&&item.scope.page===target+'services/')?.data as any;
  assert.deepEqual(quality.structuredTypes,['Service']);
  assert.equal(quality.titleStatus,'present');
  assert.ok(quality.checks.some((check:any)=>check.id==='structured-data'&&check.status==='pass'));
});

test('different discovered SEO scopes cannot silently compare against each other',async()=>{
  const first=await scan();
  const next=await scan({sitemap:[target,target+'services/']});
  const prior=createBaseline(baselineIdentity(first.request,first.result.runtime,first.result.testedUrl),first.result);
  assert.equal(prior.status,'available');
  if(prior.status!=='available')return;
  const compared=compareFindings(baselineIdentity(next.request,next.result.runtime,next.result.testedUrl),next.result,prior.baseline);
  assert.equal(compared.status,'incompatible');
});


test('explicit SEO scopes larger than the default sample retain every supplied page',async()=>{
  const pages=[target,target+'about/',target+'services/',target+'contact/'];
  const {result,requested}=await scan({pages,documents:Object.fromEntries(pages.map((page,index)=>[page,html('Page topic '+index,'A distinct description for content '+index)]))});
  assert.deepEqual(requested.filter(url=>!url.endsWith('.txt')&&!url.endsWith('.xml')).sort(),[...pages].sort());
  assert.equal(result.evidence.filter(item=>item.kind==='seo.page-quality').length,4);
});

test('a healthy sample reports concrete positives without fabricating SEO findings',async()=>{
  const pages=[target,target+'about/',target+'services/'];
  const {result}=await scan({documents:Object.fromEntries(pages.map((page,index)=>[page,html('Business topic '+index,'A distinct description for content '+index,
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>')]))});
  assert.equal(result.findings.length,0);
  const observations=result.evidence.filter(item=>item.kind==='seo.page-quality');
  assert.equal(observations.length,3);
  assert.ok(observations.every(item=>(item.data as any).checks.every((check:any)=>check.status==='pass')));
});

test('missing sitemap evidence limits scope instead of inventing additional pages',async()=>{
  const {result}=await scan({sitemap:[]});
  assert.equal((result.measurements?.seoSample as any)?.pages.length,1);
  assert.equal(result.coverage.find(item=>item.subject==='public-page sample selection')?.status,'incomplete');
});

test('an available page preview is retained as an artifact referenced by its metadata',async()=>{
  const preview=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
  const {result}=await scan({pages:[target],preview});
  const image=result.artifacts.find(item=>item.mediaType==='image/jpeg');
  assert.ok(image);
  assert.deepEqual(image.bytes,preview);
  assert.deepEqual(result.evidence.find(item=>item.kind==='seo.page-quality')?.artifactIds,[image.id]);
});

test('oversized metadata cannot produce a healthy page-quality assertion from truncated text',async()=>{
  const {result}=await scan({pages:[target],documents:{[target]:html('x'.repeat(2050),'A page description')}});
  assert.equal(result.evidence.filter(item=>item.kind==='seo.page-quality').length,0);
  assert.ok(result.coverage.some(item=>item.reason==='Document metadata exceeded parse limits'&&item.status==='incomplete'));
});
