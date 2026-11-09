import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssessmentGrounding, measuredAssessmentSummary, validateGroundedAssessment } from '../src/core/assessment-grounding.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult } from '../src/core/types.js';
import { summarizeNavigationPage } from '../src/agents/performance-measurements.js';
const request=validateRequest({agentId:'accessibility',targetUrl:'https://example.com/'});
const scope={page:request.targetUrl,state:'initial',element:'#test'};
function fixture():CollectorResult {return {testedUrl:request.targetUrl,runtime:{node:'24',browser:'Chromium',engine:'test'},artifacts:[],coverage:[{id:'c',scope,subject:'axe',status:'complete'}],
  evidence:[{id:'e',agentId:'accessibility',kind:'axe-violation',scope,source:{kind:'measured',name:'axe',reference:'https://example.com/version/7.1'},summary:'Contrast of 3.32 (foreground color: #665e5c, background color: #000000). Expected contrast ratio of 4.5:1',data:{rule:'color-contrast',tags:['wcag2aa','wcag143'],criteria:['1.4.3'],unrelatedCount:7.1}}],
  findings:[{id:'f',agentId:'accessibility',rule:'color-contrast',scope,title:'Contrast',summary:'Measured contrast',severity:'high',disposition:'finding',evidenceIds:['e'],coverageIds:['c']}]};}
function valid(){return {interpretation:'Inspect the recorded contrast.',claimIds:['finding:f'],actions:[{title:'Measure displayed contrast',mode:'propose-correction',targetFactIds:['finding:f'],priority:'high',rationale:'Recheck the recorded 4.5:1 threshold.',steps:['Measure the rendered foreground and background.'],verification:'Repeat axe on this element and record the measured contrast ratio.'}]};}

const performanceRequest=validateRequest({agentId:'performance',targetUrl:'https://example.com/'});
function navigationFixture(kind:'navigation-distribution'|'navigation-sample'='navigation-distribution') {
  // Use the production summarizer and the same evidence data projection as pageCoverage.
  const page=summarizeNavigationPage(performanceRequest.targetUrl,3,[3001,3013.942,3027].map((lcp,index)=>({
    index:index+1,status:'collected',testedUrl:performanceRequest.targetUrl,requests:25,blocked:0,
    metrics:{'largest-contentful-paint':lcp,'performance-score':86,'cumulative-layout-shift':0.08},
  })));
  const {planned,attempted,succeeded,failed,notRun,metrics}=page;
  const r=fixture();r.findings=[];
  r.evidence=[{id:'navigation',agentId:'performance',kind,scope:{page:page.page},source:{kind:'measured',name:'Lighthouse',reference:'https://example.com/version/2.5'},
    summary:'Recorded navigation measurements.',data:kind==='navigation-distribution'?{planned,attempted,succeeded,failed,notRun,metrics}:page.samples[1]}];
  return {result:r,page};
}
function navigationResponse(interpretation:string) {return {interpretation,claimIds:['observation:navigation'],actions:[]};}

test('production navigation distributions retain metric identity and measured statistics, excluding counts',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  const quantities=g.facts.find(f=>f.id==='observation:navigation')!.measuredParameters!.quantities;
  for(const value of [3013.942,3001,3027,26]) assert.ok(quantities.some(q=>q.value===value&&q.unit==='ms'&&q.metric==='largest-contentful-paint'));
  assert.ok(!quantities.some(q=>q.value===3||q.value===25||q.value===2.5));
  assert.doesNotThrow(()=>validateGroundedAssessment(navigationResponse('Recorded median LCP was 3013.942 ms.'),g,performanceRequest));
});

test('production navigation sample values have their metric units and failed samples cannot authorize values',()=>{
  const {result}=navigationFixture('navigation-sample');
  let g=buildAssessmentGrounding(performanceRequest,result);
  assert.doesNotThrow(()=>validateGroundedAssessment(navigationResponse('Recorded sample LCP was 3013.942 ms.'),g,performanceRequest));
  assert.ok(g.facts.find(f=>f.id==='observation:navigation')!.measuredParameters!.quantities.some(q=>q.value===86&&q.unit==='points'));
  result.evidence[0].data={...result.evidence[0].data as object,status:'failed'};
  g=buildAssessmentGrounding(performanceRequest,result);
  assert.throws(()=>validateGroundedAssessment(navigationResponse('Recorded sample LCP was 3013.942 ms.'),g,performanceRequest),/unmeasured numerical parameter/);
});

test('time formatting allows bounded ms to seconds conversion and standard rounding without invented targets',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  for(const value of ['3.013942 s','3.01 s','3013.94 ms','3014 ms']) {
    assert.doesNotThrow(()=>validateGroundedAssessment(navigationResponse(`Recorded median LCP was ${value}.`),g,performanceRequest),value);
  }
  for(const value of ['2.5 s','3.02 s','3 s','3.010 s','3013.942 kb','25 ms']) {
    assert.throws(()=>validateGroundedAssessment(navigationResponse(`Set the LCP target to ${value}.`),g,performanceRequest),/unmeasured numerical parameter/,value);
  }
  for(const value of ['2.5','3','25']) assert.throws(()=>validateGroundedAssessment(navigationResponse(`Use a threshold of ${value}.`),g,performanceRequest),/unmeasured numerical parameter/,value);
});

test('generic typed quantities still validate exact units and support seconds to milliseconds formatting',()=>{
  const {result}=navigationFixture();result.evidence[0].kind='supplied-field-measurement';
  result.evidence[0].data={metric:'LCP',unit:'s',value:3.013942};
  const g=buildAssessmentGrounding(performanceRequest,result);
  assert.doesNotThrow(()=>validateGroundedAssessment(navigationResponse('Recorded LCP was 3013.942 ms.'),g,performanceRequest));
  assert.doesNotThrow(()=>validateGroundedAssessment(navigationResponse('Recorded LCP was 3.013942 s.'),g,performanceRequest));
  assert.throws(()=>validateGroundedAssessment(navigationResponse('Use a threshold of 2.5 s.'),g,performanceRequest),/unmeasured numerical parameter/);
});

test('navigation quantity checks keep ASCII and Unicode signs',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  const check=(value:string)=>validateGroundedAssessment(navigationResponse(`Recorded median LCP was ${value} ms.`),g,performanceRequest);
  for(const value of ['3013.942','+3013.942']) assert.doesNotThrow(()=>check(value),value);
  for(const value of ['-3013.942','−3013.942','-3,013.942','−3,013.942']) assert.throws(()=>check(value),/unmeasured numerical parameter/,value);
});

test('navigation quantity checks accept valid comma grouping and reject malformed grouping',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  const check=(value:string)=>validateGroundedAssessment(navigationResponse(`Recorded median LCP was ${value} ms.`),g,performanceRequest);
  for(const value of ['3,013.942','+3,013.942']) assert.doesNotThrow(()=>check(value),value);
  for(const value of ['1,3013.942','3,,013.942','3,01.942']) assert.throws(()=>check(value),/unmeasured numerical parameter/,value);
});

test('compact ranges and adjacent signs cannot bypass numeric grounding',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  for(const literal of ['2000-9999','2000-3013.942','2000−3013.942','2000+3013.942','2000+-3013.942']) {
    assert.throws(()=>validateGroundedAssessment(navigationResponse(`Recorded LCP was ${literal} ms.`),g,performanceRequest),/unmeasured numerical parameter/,literal);
  }
  assert.throws(()=>validateGroundedAssessment(navigationResponse('Use a threshold of 3013.942-9999.'),g,performanceRequest),/unmeasured numerical parameter/);
  const contrast=buildAssessmentGrounding(request,fixture());
  assert.throws(()=>validateGroundedAssessment({...valid(),interpretation:'Recorded contrast was 2-3.32:1.'},contrast,request),/unmeasured numerical parameter/);
});

test('navigation score points and unitless measurements must match a cited quantity',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  for(const literal of ['86 points','0.08 unitless']) assert.doesNotThrow(()=>validateGroundedAssessment(navigationResponse(`Recorded value was ${literal}.`),g,performanceRequest),literal);
  for(const literal of ['99 points','0.4 unitless','-86 points','−0.08 unitless']) assert.throws(()=>validateGroundedAssessment(navigationResponse(`Recorded value was ${literal}.`),g,performanceRequest),/unmeasured numerical parameter/,literal);
});

test('contrast ratio checks keep the sign and reject malformed grouping',()=>{
  const g=buildAssessmentGrounding(request,fixture());
  const check=(value:string)=>validateGroundedAssessment({...valid(),interpretation:`The recorded contrast was ${value}:1.`},g,request);
  for(const value of ['3.32','+3.32']) assert.doesNotThrow(()=>check(value),value);
  for(const value of ['-3.32','−3.32','1,3.32']) assert.throws(()=>check(value),/unmeasured numerical parameter/,value);
});

test('explicit thresholds and targets check the entire signed and grouped number',()=>{
  const {result}=navigationFixture(),g=buildAssessmentGrounding(performanceRequest,result);
  for(const context of ['threshold of','target of','target to','at least']) {
    const check=(value:string)=>validateGroundedAssessment(navigationResponse(`Compare with ${context} ${value}.`),g,performanceRequest);
    for(const value of ['3013.942','+3,013.942']) assert.doesNotThrow(()=>check(value),`${context} ${value}`);
    for(const value of ['-3013.942','−3,013.942','26,3013.942']) assert.throws(()=>check(value),/unmeasured numerical parameter/,`${context} ${value}`);
  }
});

test('typed numerical parameters cannot be authorized by an unrelated count, URL or numeric token',()=>{
  const g=buildAssessmentGrounding(request,fixture());
  const v=valid();v.actions[0].rationale='Set the contrast threshold to 7.1:1.';
  assert.throws(()=>validateGroundedAssessment(v,g,request),/unmeasured numerical parameter/);
  v.actions[0].rationale='Set the render threshold to 4.5ms.';
  assert.throws(()=>validateGroundedAssessment(v,g,request),/unmeasured numerical parameter/);
});

test('a supported correction, new investigation and model-selected action order survive validation',()=>{
  const g=buildAssessmentGrounding(request,fixture()),v=valid();
  v.actions.push({...v.actions[0],title:'Compare alpha blending in the recorded state',mode:'investigate',priority:'medium',steps:['Compare computed background layers before selecting a replacement.']});
  const a=validateGroundedAssessment(v,g,request);v.actions.reverse();
  const b=validateGroundedAssessment(v,g,request);
  assert.deepEqual(a.actions.map(x=>x.title),b.actions.map(x=>x.title).reverse());
  assert.equal(a.actions[0].mode,'propose-correction');assert.equal(a.actions[1].mode,'investigate');
  assert.deepEqual(a.actions[0].evidenceIds,['e']);
});

test('whole-report counts do not turn missing evidence into confirmed WCAG classification',()=>{
  const r=fixture();r.evidence=[];const g=buildAssessmentGrounding(request,r);
  assert.equal(g.fullReportCounts.findingInstances,1);assert.deepEqual(g.fullReportCounts.automatic,{wcag:0,bestPractice:0,other:1});
  assert.ok(!g.facts.some(f=>f.kind==='finding'));assert.match(measuredAssessmentSummary(request,r),/1 finding instances/);
});

test('whole-record budgets remain bounded under Unicode and excessive coverage, without slicing a supporting record',()=>{
  const r=fixture();r.evidence=Array.from({length:100},(_,i)=>({...r.evidence[0],id:`e${i}`,summary:'🧪'.repeat(1000)}));
  r.coverage=Array.from({length:200},(_,i)=>({...r.coverage[0],id:`c${i}`,reason:'Reason 🧪'.repeat(100)}));
  const g=buildAssessmentGrounding(request,r);
  assert.ok(Buffer.byteLength(JSON.stringify(g))<60000);assert.ok(g.evidence.length<100);assert.ok(g.facts.length<=80);
  for(const e of g.evidence) assert.equal(e.summary,'🧪'.repeat(1000));
  assert.ok(g.truncation.coverage);assert.ok(g.truncation.findings);
});

test('name observation retains its original close-button selector without asserting an interaction result',()=>{
  const r=fixture();r.findings[0]={...r.findings[0],rule:'button-name',scope:{...scope,element:'.close-button'},severity:'critical'};
  const g=buildAssessmentGrounding(request,r),v=valid();v.interpretation='The close button has no accessible name.';
  v.actions[0].mode='investigate';v.actions[0].priority='critical';
  assert.doesNotThrow(()=>validateGroundedAssessment(v,g,request));
});

test('no coverage record cannot authorize a confirmed correction',()=>{
  const r=fixture();r.findings[0].coverageIds=[];r.coverage=[];
  assert.throws(()=>validateGroundedAssessment(valid(),buildAssessmentGrounding(request,r),request),/not supported/);
});

test('full-report rule and page/state counts remain independent of the bounded evidence sample',()=>{
  const r=fixture();r.findings=Array.from({length:100},(_,i)=>({...r.findings[0],id:`f${i}`,scope:{...scope,state:i%2?'initial':'menu-open'}}));
  const g=buildAssessmentGrounding(request,r);
  assert.deepEqual((g.fullReportCounts as any).byRuleDisposition,{groups:[{rule:'color-contrast',disposition:'finding',count:100}],omittedGroups:0,omittedFindingInstances:0});
  assert.deepEqual((g.fullReportCounts as any).byPageState.groups.map((x:any)=>x.count),[50,50]);
  assert.ok(g.truncation.findings);
});


function missingNameFixture() {
  const r=fixture();r.evidence[0]={...r.evidence[0],summary:'The close button has no accessible name.',data:{rule:'button-name',tags:['wcag2a'],criteria:['4.1.2']}};
  r.findings[0]={...r.findings[0],rule:'button-name',title:'Missing name',summary:r.evidence[0].summary};
  return buildAssessmentGrounding(request,r);
}
function observedNameResponse() {
  return {interpretation:'The close button has no accessible name.',claimIds:['observation:e'],actions:[{
    title:'Inspect the name computation',mode:'investigate',targetFactIds:['observation:e'],priority:'medium',
    rationale:'Inspect the recorded name computation before choosing a correction.',steps:['Inspect the computed name of the recorded button.'],
    verification:'Repeat axe and record the computed accessible name of the recorded button.',
  }]};
}
test('observation references cannot turn missing name into observed failed dismissal',()=>{
  const g=missingNameFixture();
  for(const location of ['interpretation','rationale'] as const) {
    const v=observedNameResponse();
    if(location==='interpretation') v.interpretation='Users cannot dismiss the notification.';
    else v.actions[0].rationale='Users cannot dismiss the notification.';
    assert.throws(()=>validateGroundedAssessment(v,g,request),/unmeasured interaction/,location);
  }
});

test('observation dismissal investigations require a hypothesis but retain legitimate name observations',()=>{
  const g=missingNameFixture(),v=observedNameResponse();
  assert.doesNotThrow(()=>validateGroundedAssessment(v,g,request));
  v.actions[0].verification='Activate the recorded close button and record whether the notification dismisses.';
  assert.throws(()=>validateGroundedAssessment(v,g,request),/requires a hypothesis/);
  const withHypothesis={...v,actions:[{...v.actions[0],hypothesis:{subject:'unknown',statement:'The absent name may make dismissal harder to discover.',supportingFactIds:['observation:e'],missingEvidence:['No activation or dismissal result was collected.']}}]};
  assert.doesNotThrow(()=>validateGroundedAssessment(withHypothesis,g,request));
});

test('hypothesis subjects must be primitive enum strings before scanner-only cause gating',()=>{
  const r=fixture();r.findings=[];r.evidence=[];r.coverage[0].status='incomplete';
  const g=buildAssessmentGrounding(request,r),v=observedNameResponse();v.claimIds=['coverage:c'];v.actions[0].targetFactIds=['coverage:c'];
  const subjectResponse=(subject:unknown)=>({...v,actions:[{...v.actions[0],hypothesis:{subject,statement:'The collector may have failed during source capture.',supportingFactIds:['coverage:c'],missingEvidence:['Capture source and compiled execution traces.']}}]});
  for(const subject of [['site'],['scanner'],[['site']],null,1,true,{},new String('scanner')]) assert.throws(()=>validateGroundedAssessment(subjectResponse(subject),g,request),/Invalid assessment hypothesis subject/,JSON.stringify(subject));
  assert.throws(()=>validateGroundedAssessment(subjectResponse('site'),g,request),/scanner-only/);
  for(const subject of ['scanner','unknown']) assert.doesNotThrow(()=>validateGroundedAssessment(subjectResponse(subject),g,request));
});
