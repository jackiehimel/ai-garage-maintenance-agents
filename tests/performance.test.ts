import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineIdentity, createBaseline } from '../src/core/baseline.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult, JsonObject, PortableBaseline } from '../src/core/types.js';
import { collectPerformance, comparePerformanceMetrics } from '../src/agents/performance.js';
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
