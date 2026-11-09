import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineCompatibility, baselineIdentity, createBaseline } from '../src/core/baseline.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult, JsonObject, PortableBaseline } from '../src/core/types.js';
import { collectPerformance, comparePerformanceMetrics, auditDiagnostics, performanceProfiles, performanceFlags, createDiagnosticEvidence } from '../src/agents/performance.js';
import { navigationMetrics, summarizeNavigationPage } from '../src/agents/performance-measurements.js';

const page = 'https://www.example.com/';
const request = validateRequest({agentId:'performance',targetUrl:page});
const runtime = {node:'v24',browser:'Chrome/145',engine:'Lighthouse 13',browserDriver:'Puppeteer 25'};

test('reads navigation metrics while keeping TBT separate from INP and ignoring failed audits', () => {
  assert.deepEqual(navigationMetrics({
    categories:{performance:{score:0.92}},
    audits:{
      'total-blocking-time':{numericValue:128},
      'interaction-to-next-paint':{numericValue:249},
      'first-contentful-paint':{numericValue:1540,scoreDisplayMode:'error'},
      'cumulative-layout-shift':{numericValue:0},
    },
  }),{'performance-score':92,'total-blocking-time':128,'cumulative-layout-shift':0});
});

test('retains failed and unattempted samples in the denominator and reports actual spread', () => {
  const result = summarizeNavigationPage(page,5,[
    measured(1,980),
    {index:2,status:'failed',reason:'Page load timed out'},
    measured(3,1320),
    measured(4,1150),
    {index:5,status:'not-run',reason:'Browser deadline expired'},
  ]);
  assert.deepEqual(
    {planned:result.planned,attempted:result.attempted,succeeded:result.succeeded,failed:result.failed,notRun:result.notRun},
    {planned:5,attempted:4,succeeded:3,failed:1,notRun:1},
  );
  assert.deepEqual(result.metrics['largest-contentful-paint'],{
    unit:'ms',count:3,missing:2,median:1150,min:980,max:1320,spread:340,
  });
  assert.deepEqual(result.metrics['total-blocking-time'],{unit:'ms',count:0,missing:5});
});

function measured(index: number, lcp: number, testedUrl = page): JsonObject {
  return {index,status:'collected',testedUrl,metrics:{'largest-contentful-paint':lcp}};
}
function collection(samples: JsonObject[]): CollectorResult {
  return {
    testedUrl:page,runtime,coverage:[],evidence:[],findings:[],artifacts:[],
    measurements:{navigation:{method:'lighthouse-navigation',policyVersion:1,pages:[summarizeNavigationPage(page,3,samples)]}},
  };
}
function baseline(samples: JsonObject[]): PortableBaseline {
  const result = collection(samples);
  const exported = createBaseline(baselineIdentity(request,runtime,page),result);
  assert.equal(exported.status,'available');
  return exported.baseline;
}
const baselineSamples = [measured(1,960),measured(2,1000),measured(3,1050)];
function lcpDelta(samples: JsonObject[], prior = baseline(baselineSamples)) {
  return comparePerformanceMetrics(collection(samples),prior).find((change) => change.metric === 'largest-contentful-paint');
}

test('compares repeat medians against a meaningful threshold and observed spread', () => {
  const regression = lcpDelta([measured(1,1320),measured(2,1360),measured(3,1390)]);
  assert.deepEqual(regression,{
    page,metric:'largest-contentful-paint',unit:'ms',status:'regressed',
    before:1000,after:1360,delta:360,threshold:200,beforeSpread:90,afterSpread:70,
  });
  assert.equal(lcpDelta([measured(1,680),measured(2,700),measured(3,720)])?.status,'improved');
  assert.equal(lcpDelta([measured(1,1090),measured(2,1100),measured(3,1150)])?.status,'unchanged');
  const slowBaseline = baseline([measured(1,4950),measured(2,5000),measured(3,5100)]);
  const belowRelativeFloor = lcpDelta([measured(1,5320),measured(2,5350),measured(3,5390)],slowBaseline);
  assert.equal(belowRelativeFloor?.threshold,500);
  assert.equal(belowRelativeFloor?.status,'unchanged');
});

test('comparison stays inconclusive for noisy, incomplete, or redirected sample sets', () => {
  for (const samples of [
    [measured(1,1100),measured(2,1300),measured(3,1800)],
    [measured(1,1320),measured(2,1360),{index:3,status:'failed',reason:'Timeout'}],
    [measured(1,1320),measured(2,1360),{index:3,status:'collected',testedUrl:page,metrics:{}}],
    [measured(1,1320),measured(2,1360),measured(3,1370,'https://www.example.com/new')],
  ]) assert.equal(lcpDelta(samples)?.status,'inconclusive');
  assert.equal(lcpDelta([measured(1,1300),measured(2,1340),measured(3,1350)],baseline([
    measured(1,990,'https://www.example.com/prior'),measured(2,1000,'https://www.example.com/prior'),measured(3,1020,'https://www.example.com/prior'),
  ]))?.status,'inconclusive');
});

test('records supplied field and interaction evidence separately when navigation cannot start', async () => {
  const source = {name:'RUM export',reference:'export-7',start:'2026-10-01',end:'2026-10-31'};
  const input = validateRequest({agentId:'performance',targetUrl:page,release:{label:'July build',revision:'abc123'},supplied:{
    fieldMeasurements:[{page,metric:'INP',value:221,unit:'ms',population:'Desktop signed-in users',source}],
    interactions:[{page,metric:'INP',value:170,unit:'ms',scenario:'Filter menu',source:{...source,name:'Interaction trace'}}],
  }});
  const report = await collectPerformance(input,{executablePath:'/missing-performance-test-chromium'});
  assert.match(report.runtime.engine,/^performance-navigation-v2; Lighthouse /);
  const identity=baselineIdentity(input,report.runtime,page);
  const priorIdentity={...identity,runtime:{...identity.runtime,engine:report.runtime.engine.replace('performance-navigation-v2; ','')}};
  assert.ok(baselineCompatibility(identity,priorIdentity).includes('Node, browser, driver, or engine version differs'));
  assert.deepEqual(report.measurements?.suppliedFieldMeasurements,input.supplied?.fieldMeasurements);
  assert.deepEqual(report.measurements?.suppliedInteractions,input.supplied?.interactions);
  assert.deepEqual(report.measurements?.release,{label:'July build',revision:'abc123'});
  assert.equal(report.evidence.filter((entry) => entry.source.kind === 'supplied').length,2);
  assert.equal(report.evidence.filter((entry) => entry.source.kind === 'measured').length,0);
  const navigation = report.measurements?.navigation as JsonObject;
  const [sampled] = navigation.pages as JsonObject[];
  assert.equal(sampled.planned,3);
  assert.equal(sampled.attempted,0);
  assert.equal(sampled.notRun,3);
  assert.ok(!Object.hasOwn(sampled.metrics as JsonObject,'INP'));
  assert.ok(report.coverage.every((entry) => entry.status !== 'complete'));
});

test('mobile and desktop runs retain separate sampling profiles and unavailable denominators', async () => {
  const input = validateRequest({agentId:'performance',targetUrl:page,profile:{id:'mobile-and-desktop-v1',samples:3}});
  const profiles = performanceProfiles(input.profile);
  assert.deepEqual(profiles.map(p => p.id),['mobile-v1','desktop-v1']);
  assert.equal(performanceFlags(profiles[0]).formFactor,'mobile');
  assert.equal(performanceFlags(profiles[0]).screenEmulation?.mobile,true);
  assert.equal(performanceFlags(profiles[0]).screenEmulation?.width,412);
  assert.equal(performanceFlags(profiles[0]).throttling?.cpuSlowdownMultiplier,4);
  assert.equal(performanceFlags(profiles[1]).screenEmulation?.mobile,false);
  const result = await collectPerformance(input,{executablePath:'/missing-performance-test-chromium'});
  const pages = (result.measurements?.navigation as JsonObject).pages as JsonObject[];
  assert.deepEqual(pages.map(p => [p.profileId,p.planned,p.notRun]),[['mobile-v1',3,3],['desktop-v1',3,3]]);
  assert.equal(new Set(result.coverage.map(entry=>entry.id)).size,result.coverage.length);
  assert.deepEqual([...new Set(result.coverage.map(entry=>entry.scope.state))],['mobile','desktop']);
});

test('resource extraction names recorded blocking CSS, image savings and request dependencies without inventing costs', () => {
  const result = {audits:{
    'render-blocking-insight':{title:'Render blocking',score:0,numericValue:120,metricSavings:{LCP:120},details:{type:'table',items:[{url:'https://cdn.example.com/main.css',totalBytes:53671,wastedMs:180}]}},
    'image-delivery-insight':{title:'Images',score:0,details:{type:'table',items:[{url:'https://www.example.com/hero.png',totalBytes:100000,wastedBytes:32395,node:{selector:'#hero',nodeLabel:'A student at a desk'},subItems:{items:[{reason:'Image dimensions exceed its displayed size',wastedBytes:32395}]}}]}},
    'network-dependency-tree-insight':{title:'Network dependency tree',score:0,details:{type:'list',items:[{type:'network-tree',chains:{root:{url:page,navStartToEndTime:125,transferSize:4300,children:{css:{url:'https://cdn.example.com/main.css',navStartToEndTime:350,transferSize:53671,children:{}}}}},longestChain:{duration:350}}]}},
  }};
  const values = auditDiagnostics(result as never);
  const blocking = values.find(x=>x.id==='render-blocking-insight')!;
  assert.equal(blocking.estimatedSavingsMs,120);
  assert.deepEqual(blocking.resources,[{url:'https://cdn.example.com/main.css',totalBytes:53671,durationMs:180}]);
  const image = (values.find(x=>x.id==='image-delivery-insight')!.resources as JsonObject[])[0];
  assert.equal(image.estimatedSavingsBytes,32395);
  assert.equal(image.element,'#hero');
  assert.equal(image.description,'A student at a desk');
  assert.ok(!Object.hasOwn(image,'estimatedSavingsMs'));
  const chain = values.find(x=>x.id==='network-dependency-tree-insight')!;
  assert.equal(chain.longestChainMs,350);
  const css = (chain.resources as JsonObject[]).find(x=>x.url==='https://cdn.example.com/main.css')!;
  assert.equal(css.parentUrl,page);
  assert.equal(css.completionTimeMs,350);
});

test('dual-profile comparisons never mix a mobile sample with a desktop baseline', () => {
  const dual = validateRequest({agentId:'performance',targetUrl:page,profile:{id:'mobile-and-desktop-v1'}});
  const desktopBefore = {...summarizeNavigationPage(page,3,baselineSamples),profileId:'desktop-v1'};
  const mobileBefore = {...summarizeNavigationPage(page,3,[measured(1,1960),measured(2,2000),measured(3,2050)]),profileId:'mobile-v1'};
  const before = collection([]); (before.measurements!.navigation as JsonObject).pages=[mobileBefore,desktopBefore];
  const exported = createBaseline(baselineIdentity(dual,runtime,page),before);
  assert.equal(exported.status,'available');
  const after = collection([]);
  (after.measurements!.navigation as JsonObject).pages=[
    {...summarizeNavigationPage(page,3,[measured(1,1320),measured(2,1360),measured(3,1390)]),profileId:'desktop-v1'},
    {...summarizeNavigationPage(page,3,[measured(1,1960),measured(2,2000),measured(3,2050)]),profileId:'mobile-v1'},
  ];
  const changes=comparePerformanceMetrics(after,exported.baseline).filter(change=>change.metric==='largest-contentful-paint');
  assert.deepEqual(changes.map(change=>[change.profileId,change.before,change.after,change.status]),[
    ['mobile-v1',2000,2000,'unchanged'],['desktop-v1',1000,1360,'regressed'],
  ]);
});

test('resource evidence fits the assessment record allowance while retaining source, device and measured costs', () => {
  const longPage=`https://www.example.com/${'x'.repeat(1900)}`;
  const resources=Array.from({length:8},(_,index)=>({url:`https://cdn.example.com/${index}-${'x'.repeat(900)}.png`,totalBytes:100000,estimatedSavingsBytes:32395}));
  const entry=createDiagnosticEvidence({id:'image-delivery-insight',title:'Images',score:0,resources},2,
    performanceProfiles({...request.profile,id:'mobile-v1'})[0],{page:longPage,state:'mobile'},
    {kind:'measured',name:'Lighthouse 13',observedAt:'2026-11-09T00:00:00Z'},['artifact-lhr']);
  assert.ok(Buffer.byteLength(JSON.stringify(entry))<=4800);
  assert.equal(entry.kind,'navigation-diagnostic');
  const data=entry.data as JsonObject;
  assert.equal(data.status,'collected');
  assert.equal(data.profileId,'mobile-v1');
  assert.equal(data.sampleIndex,2);
  assert.equal(data.resourcesTruncated,true);
  const retained=data.resources as JsonObject[];
  assert.ok(retained.length>0 && retained.length<resources.length);
  assert.equal(retained[0].estimatedSavingsBytes,32395);
  assert.deepEqual(entry.artifactIds,['artifact-lhr']);
});
