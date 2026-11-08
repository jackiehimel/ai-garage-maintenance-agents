import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssessmentGrounding, measuredAssessmentSummary, validateGroundedAssessment } from '../src/core/assessment-grounding.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult } from '../src/core/types.js';
const request=validateRequest({agentId:'accessibility',targetUrl:'https://example.com/'});
const scope={page:request.targetUrl,state:'initial',element:'#test'};
function fixture():CollectorResult {return {testedUrl:request.targetUrl,runtime:{node:'24',browser:'Chromium',engine:'test'},artifacts:[],coverage:[{id:'c',scope,subject:'axe',status:'complete'}],
  evidence:[{id:'e',agentId:'accessibility',kind:'axe-violation',scope,source:{kind:'measured',name:'axe',reference:'https://example.com/version/7.1'},summary:'Contrast of 3.32 (foreground color: #665e5c, background color: #000000). Expected contrast ratio of 4.5:1',data:{rule:'color-contrast',tags:['wcag2aa','wcag143'],criteria:['1.4.3'],unrelatedCount:7.1}}],
  findings:[{id:'f',agentId:'accessibility',rule:'color-contrast',scope,title:'Contrast',summary:'Measured contrast',severity:'high',disposition:'finding',evidenceIds:['e'],coverageIds:['c']}]};}
function valid(){return {interpretation:'Inspect the recorded contrast.',claimIds:['finding:f'],actions:[{title:'Measure displayed contrast',mode:'propose-correction',targetFactIds:['finding:f'],priority:'high',rationale:'Recheck the recorded 4.5:1 threshold.',steps:['Measure the rendered foreground and background.'],verification:'Repeat axe on this element and record the measured contrast ratio.'}]};}

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
