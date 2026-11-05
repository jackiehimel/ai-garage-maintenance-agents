import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import type { AxeResults, NodeResult, Result } from 'axe-core';
import { activationPermitted, applyAccessibilityComparisonCoverage, assembleAccessibilityResult, collectAccessibility, publicAccessibilityGuardScript } from '../src/agents/accessibility.js';
import type { AccessibilityScan } from '../src/agents/accessibility.js';
import { baselineIdentity, compareFindings, createBaseline } from '../src/core/baseline.js';
import { validateRequest } from '../src/core/input.js';

const page = 'https://audit.example.com/';
const runtime = {node:'v24',browser:'142.0.0.0',engine:'axe-core 4.14.0',browserDriver:'1.63.0'};
const request = validateRequest({
  agentId:'accessibility',targetUrl:page,
  states:[{id:'open-menu',page:'/',steps:[{action:'key',key:'Tab'},{action:'assert-focus',selector:'#menu-button'}]}],
  components:[{id:'main-menu',selector:'#menu'}],
  ownerPriorities:[{rule:'button-name',priority:'critical'}],
  supplied:{humanReviews:[{page:'/',state:'open-menu',method:'screen-reader',result:'Reviewer described the button output.',
    source:{name:'Accessibility review',reference:'Review ticket 23',start:'2026-10-01',end:'2026-10-02'},tool:'NVDA'}]},
});
const navigation = {status:'complete',testedUrl:page} as const;
const readiness = {status:'complete'} as const;
const keyboard = {status:'complete',steps:[
  {index:1,step:{action:'key',key:'Tab'},status:'passed',focusBefore:{tag:'body',selector:'body'},focusAfter:{tag:'button',selector:'#menu-button'}},
  {index:2,step:{action:'assert-focus',selector:'#menu-button'},status:'passed',focusBefore:{tag:'button',selector:'#menu-button'},focusAfter:{tag:'button',selector:'#menu-button'},actual:true},
]} satisfies NonNullable<AccessibilityScan['keyboard']>;

function node(selector: string, impact: NodeResult['impact'] = 'serious'): NodeResult {
  return {target:[selector],html:'<button></button>',impact,any:[],all:[],none:[],failureSummary:'Accessible name is absent.'};
}
function rule(id: string, nodes: NodeResult[]): Result {
  return {id,nodes,description:'Check accessible names',help:'Buttons must have an accessible name',
    helpUrl:'https://dequeuniversity.com/rules/axe/4.14/button-name',tags:['cat.name-role-value','wcag2a','wcag412'],impact:'serious'};
}
function axe(violations: Result[], incomplete: Result[] = [], passes: Result[] = []): AxeResults {
  return {violations,incomplete,passes,inapplicable:[rule('image-alt',[])],url:page,timestamp:'2026-10-15T00:00:00Z',
    testEngine:{name:'axe-core',version:'4.14.0'},testRunner:{name:'axe'},
    testEnvironment:{userAgent:'Chromium fixture',windowWidth:1365,windowHeight:768},toolOptions:{}};
}
function scan(axeResult?: AxeResults, path: AccessibilityScan['keyboard'] = keyboard): AccessibilityScan {
  return {scope:{page,state:'open-menu'},navigation,readiness,keyboard:path,axe:axeResult,
    components:{counts:{'main-menu':1},mappings:[
      {target:['#menu-button'],componentIds:['main-menu']},
      {target:['#close'],componentIds:['main-menu']},
      {target:['#ambiguous'],componentIds:['main-menu','another-component']},
    ]}};
}
function initial(axeResult = axe([])): AccessibilityScan {
  return {scope:{page,state:'initial'},navigation,readiness,axe:axeResult,components:{counts:{'main-menu':1},mappings:[]}};
}

test('normalizes actual instances, independent manual reviews, component mappings, and raw output', () => {
  const raw = axe([rule('button-name',[node('#menu-button'),node('#close','moderate'),node('#ambiguous')])],
    [rule('color-contrast',[node('#check','minor')])],[rule('landmark-one-main',[node('main')])]);
  const result = assembleAccessibilityResult(request,runtime,page,[initial(),scan(raw)]);
  const auto = result.findings.filter((finding) => finding.disposition === 'finding');
  assert.deepEqual(auto.map((finding) => [finding.scope.element,finding.scope.component,finding.severity,finding.ownerPriority]),[
    ['#menu-button','main-menu','high','critical'],['#close','main-menu','medium','critical'],['#ambiguous',undefined,'high','critical'],
  ]);
  const named = result.evidence.find((evidence) => evidence.id === auto[0].evidenceIds[0])!;
  assert.deepEqual((named.data as {criteria:string[]}).criteria,['4.1.2']);
  assert.equal(named.scope.state,'open-menu');
  assert.equal(result.findings.some((finding) => finding.disposition === 'review-needed' && finding.rule === 'color-contrast'),true);
  const supplied = result.evidence.find((evidence) => evidence.source.kind === 'supplied')!;
  assert.equal(supplied.source.reference,'Review ticket 23');
  assert.equal((supplied.data as {method:string}).method,'screen-reader');
  assert.equal((supplied.data as {start:string}).start,'2026-10-01');
  const scripted = result.evidence.find((evidence) => evidence.kind === 'keyboard-step' && evidence.key === '2')!;
  assert.equal(scripted.source.kind,'measured');
  assert.equal((scripted.data as {focusAfter:{selector:string}}).focusAfter.selector,'#menu-button');
  const summary = result.evidence.find((evidence) => evidence.kind === 'axe-summary' && evidence.scope.state === 'open-menu')!;
  assert.deepEqual((summary.data as {passes:string[]}).passes,['landmark-one-main']);
  assert.deepEqual((summary.data as {inapplicable:string[]}).inapplicable,['image-alt']);
  const artifact = result.artifacts.find(({id}) => named.artifactIds?.includes(id!))!;
  assert.deepEqual(JSON.parse(String(artifact.bytes)),raw);
  const reordered = axe([rule('button-name',[node('#close'),node('#menu-button')])]);
  const next = assembleAccessibilityResult(request,runtime,page,[initial(),scan(reordered)]);
  assert.equal(next.findings.find((finding) => finding.scope.element === '#menu-button')?.id,auto[0].id);
  assert.equal(next.evidence.find((evidence) => evidence.kind === 'axe-violation' && evidence.scope.element === '#menu-button')?.id,named.id);
});

test('compatible comparison separates resolved, new, persistent, and unverified state results', () => {
  const previous = assembleAccessibilityResult(request,runtime,page,[initial(axe([],[],[rule('button-name',[node('#home')])])),scan(axe([rule('button-name',[node('#menu-button'),node('#close')])]))]);
  const identity = baselineIdentity(request,runtime,page);
  const exported = createBaseline(identity,previous);
  assert.equal(exported.status,'available');
  const configured = {...request,baseline:exported.baseline};
  const after = assembleAccessibilityResult(configured,runtime,page,[
    initial(axe([rule('button-name',[node('#home')])])),
    scan(axe([rule('button-name',[node('#menu-button')])],[],[rule('button-name',[node('#close')])])),
  ]);
  const changes = compareFindings(identity,after,exported.baseline).findings;
  assert.equal(changes.find(({before}) => before?.scope.element === '#close')?.status,'resolved');
  assert.equal(changes.find(({before}) => before?.scope.element === '#menu-button')?.status,'persistent');
  assert.equal(changes.find(({after}) => after?.scope.element === '#home')?.status,'new');

  const failed = assembleAccessibilityResult(configured,runtime,page,[
    initial(),
    scan(undefined,{status:'incomplete',reason:'Expected #menu-button to hold focus',steps:[
      {index:1,step:{action:'key',key:'Tab'},status:'passed',focusAfter:{tag:'a',selector:'#skip'}},
      {index:2,step:{action:'assert-focus',selector:'#menu-button'},status:'failed',focusAfter:{tag:'a',selector:'#skip'},actual:false},
    ]}),
  ]);
  const comparison = compareFindings(identity,failed,exported.baseline);
  assert.deepEqual(comparison.findings.filter(({before}) => before).map(({status}) => status),['inconclusive','inconclusive']);
  assert.ok(failed.evidence.some((evidence) => evidence.kind === 'keyboard-step' && evidence.key === '2'));

  const remoteResult = assembleAccessibilityResult(request,runtime,page,[
    initial(),
    scan(axe([], [rule('button-name',[node('#close')])], [rule('button-name',[node('#menu-button')])])),
  ]);
  const becameManual = applyAccessibilityComparisonCoverage(configured,remoteResult);
  assert.equal(compareFindings(identity,becameManual,exported.baseline).findings.find(({before}) => before?.scope.element === '#close')?.status,'inconclusive');

  const redirected = assembleAccessibilityResult(request,runtime,page,[
    initial(),
    {...scan(axe([],[],[rule('button-name',[node('#menu-button')])])),navigation:{status:'complete',testedUrl:page + 'new-route'}},
  ]);
  applyAccessibilityComparisonCoverage(configured,redirected);
  assert.equal(compareFindings(identity,redirected,exported.baseline).findings.find(({before}) => before?.scope.element === '#close')?.status,'inconclusive');

  const missingResources = assembleAccessibilityResult(request,runtime,page,[
    initial(),
    {...scan(axe([],[],[rule('button-name',[node('#menu-button')])])),readiness:{status:'incomplete',reason:'The application bundle did not load.'}},
  ]);
  assert.equal(compareFindings(identity,missingResources,exported.baseline).findings.find(({before}) => before?.scope.element === '#close')?.status,'inconclusive');
});

test('activation policy permits bounded widget keys and rejects form, input, link, and editor targets', () => {
  assert.equal(activationPermitted({tag:'button',type:'button',inForm:false,editable:false}),true);
  assert.equal(activationPermitted({tag:'summary',inForm:false,editable:false}),true);
  assert.equal(activationPermitted({tag:'div',role:'tab',inForm:false,editable:false}),true);
  for (const target of [
    {tag:'button',type:'submit',inForm:false,editable:false},
    {tag:'button',type:'button',inForm:true,editable:false},
    {tag:'input',type:'text',inForm:false,editable:false},
    {tag:'a',role:'button',inForm:false,editable:false},
    {tag:'div',role:'button',inForm:false,editable:true},
    {tag:'button',type:'reset',inForm:false,editable:false},
  ]) assert.equal(activationPermitted(target),false,JSON.stringify(target));
  assert.equal(activationPermitted(null),false);
});


test('the injected public guard blocks form APIs and captures a submit before page listeners', () => {
  // An EventTarget exercises the guard wiring itself; it does not simulate Chromium navigation.
  const window = new EventTarget();
  let submitted = 0;
  class Form {
    submit() { submitted++; }
    requestSubmit() { submitted++; }
  }
  const document = {activeElement:null,designMode:'off'};
  runInNewContext(publicAccessibilityGuardScript('testGuard'),{window,document,HTMLFormElement:Form});
  const form = new Form();
  form.submit();
  form.requestSubmit();
  window.addEventListener('submit',() => { submitted++; });
  const submission = new Event('submit',{cancelable:true});
  assert.equal(window.dispatchEvent(submission),false);
  assert.equal(submission.defaultPrevented,true);
  assert.equal(submitted,0);
  const guard = Reflect.get(window,'testGuard') as {read():{blocked:number}};
  assert.equal(guard.read().blocked,3);
});


test('a missing browser marks every requested state unavailable without fabricated results', async () => {
  const result = await collectAccessibility(request,{executablePath:'/nonexistent/maintenance-a11y-chromium'});
  assert.equal(result.runtime.browser,'unavailable');
  assert.equal(result.runtime.engine,'unavailable');
  assert.deepEqual(result.coverage.filter((entry) => entry.subject === 'axe-core scan').map((entry) => [entry.scope.state,entry.status]),[
    ['initial','unavailable'],['open-menu','unavailable'],
  ]);
  assert.equal(result.findings.length,0);
  assert.equal(result.artifacts.length,0);
  assert.ok(result.evidence.some((entry) => entry.source.kind === 'supplied'));
});

test('structured limits leave all affected instances in the raw artifact and mark scan coverage incomplete', () => {
  const affected = Array.from({length:851},(_,index) => node('#control-' + index));
  const result = assembleAccessibilityResult(request,runtime,page,[
    initial(axe([rule('button-name',affected)])),scan(axe([])),
  ]);
  assert.equal(result.findings.length,850);
  assert.equal(result.coverage.find((entry) => entry.subject === 'axe-core scan' && entry.scope.state === 'initial')?.status,'incomplete');
  const raw = JSON.parse(String(result.artifacts.find((entry) => entry.scope?.state === 'initial')?.bytes)) as AxeResults;
  assert.equal(raw.violations[0].nodes.at(-1)?.target[0],'#control-850');
});

test('moving a still-violating element to another configured component cannot resolve it', () => {
  const config = validateRequest({
    agentId:'accessibility',targetUrl:page,
    components:[{id:'header',selector:'#header'},{id:'footer',selector:'#footer'}],
  });
  const identity = baselineIdentity(config,runtime,page);
  const target = '#broken';
  const observation = (component:string):AccessibilityScan => ({
    ...initial(axe([rule('button-name',[node(target)])])),
    components:{counts:{header:1,footer:1},mappings:[{target:[target],componentIds:[component]}]},
  });
  const before = assembleAccessibilityResult(config,runtime,page,[observation('header')]);
  const exported = createBaseline(identity,before);
  assert.equal(exported.status,'available');

  const after = assembleAccessibilityResult(config,runtime,page,[observation('footer')]);
  applyAccessibilityComparisonCoverage({...config,baseline:exported.baseline},after);
  const changes = compareFindings(identity,after,exported.baseline).findings;
  assert.equal(after.findings[0].scope.component,'footer');
  assert.equal(changes.find(({before}) => before?.scope.component === 'header')?.status,'inconclusive');
  assert.equal(changes.find(({after}) => after?.scope.component === 'footer')?.status,'inconclusive');
});


test('retains recorded review reasons, bounded check data and related nodes without resolving them', () => {
  const reviewNode = node('#contrast');
  reviewNode.any = [{id:'color-contrast',message:'Background image prevents contrast determination.',data:{reason:'background-image',sample:'x'.repeat(9000)},relatedNodes:[{target:['#image'],html:'<img src="background.png">'}],impact:'serious'}];
  const raw = axe([], [rule('color-contrast',[reviewNode]),rule('video-caption',[node('#video')])]);
  const result = assembleAccessibilityResult(request,runtime,page,[initial(raw)]);
  const evidence = result.evidence.find(item => item.kind === 'axe-review' && (item.data as {rule:string}).rule === 'color-contrast')!;
  const check = (evidence.data as {checks:{any:Array<{data:unknown;relatedNodes:unknown[]}>}}).checks.any[0];
  assert.ok(check.data);
  assert.equal(check.relatedNodes.length,1);
  assert.ok(JSON.stringify(check.data).length < 4000);
  assert.match(result.findings.find(item => item.rule === 'color-contrast')!.investigate!,/Background image/);
  assert.match(result.findings.find(item => item.rule === 'color-contrast')!.investigate!,/displayed.*foreground.*background/);
  assert.match(result.findings.find(item => item.rule === 'video-caption')!.investigate!,/meaningful audio/);
  assert.equal(result.findings.filter(item => item.disposition === 'review-needed').length,2);
  assert.deepEqual(JSON.parse(String(result.artifacts[0].bytes)),raw);
});

test('a stopped keyboard sample preserves prior axe findings, raw output and scan coverage', () => {
  const raw=axe([rule('button-name',[node('#broken')])]);
  const original=initial(raw);
  original.keyboardProbe={status:'incomplete',steps:[],reason:'Blocked navigation',termination:'guard-blocked',forwardLimit:40,reverseLimit:10,elapsedMs:3,scopeLimit:'Bounded sample'};
  const result=assembleAccessibilityResult(request,runtime,page,[original]);
  assert.equal(result.findings[0].rule,'button-name');
  assert.equal(result.coverage.find(item=>item.subject==='axe-core scan')?.status,'complete');
  assert.equal(result.coverage.filter(item=>item.subject==='Sampled keyboard navigation').length,1);
  assert.equal(result.coverage.find(item=>item.subject==='Sampled keyboard navigation')?.status,'incomplete');
  assert.deepEqual(JSON.parse(String(result.artifacts[0].bytes)),raw);
  assert.equal(result.evidence.find(item=>item.kind==='keyboard-probe')?.source.kind,'measured');
  assert.equal((result.measurements?.keyboardProbe as {scopes:unknown[]}).scopes.length,1);
});

test('sealed action guard prevents popup, dialog, history and cancelable navigation before page handlers', () => {
  const window = new EventTarget();
  const navigation = new EventTarget();
  let effects = 0;
  Object.assign(window,{open:()=>{effects++;},alert:()=>{effects++;},confirm:()=>{effects++;},prompt:()=>{effects++;},navigation});
  const history={pushState:()=>{effects++;},replaceState:()=>{effects++;}};
  class Form {submit() {effects++;}requestSubmit() {effects++;}}
  runInNewContext(publicAccessibilityGuardScript('sealedGuard'),{window,document:{activeElement:null},HTMLFormElement:Form,history});
  const guard=Reflect.get(window,'sealedGuard') as {seal():void;read():{blocked:number}};
  guard.seal();
  for(const name of ['open','alert','confirm','prompt']) Reflect.get(window,name)();
  history.pushState();history.replaceState();
  const navigate=new Event('navigate',{cancelable:true});
  navigation.addEventListener('navigate',()=>{effects++;});
  assert.equal(navigation.dispatchEvent(navigate),false);
  const click=new Event('click',{cancelable:true});
  window.addEventListener('click',()=>{effects++;});
  assert.equal(window.dispatchEvent(click),false);
  assert.equal(effects,0);
  assert.equal(guard.read().blocked,8);
});
