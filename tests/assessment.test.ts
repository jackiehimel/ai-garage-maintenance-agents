import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { assess } from '../src/core/assessment.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult } from '../src/core/types.js';

// Compact excerpts from the two saved Solvd runs; no live traffic or provider calls.
const fixtures = JSON.parse(readFileSync(new URL('../../tests/fixtures/solvd-assessment.json', import.meta.url), 'utf8')) as Record<'seo'|'accessibility', CollectorResult & {findingGroups: Array<{rule:string;summary:string;disposition:string;evidenceData:unknown[]}>}>;
// Rehydrate exact repeated scanner records from the compact fixture table.
for (const result of Object.values(fixtures)) for (const finding of result.findings) {
  const grouped=finding as typeof finding & {group:number};
  const group=result.findingGroups[grouped.group];
  Object.assign(finding,{rule:group.rule,summary:group.summary,disposition:group.disposition});
  finding.evidenceIds.forEach((id,index)=>Object.assign(result.evidence.find(e=>e.id===id)!,{summary:group.summary,data:group.evidenceData[index]}));
  delete (grouped as Partial<typeof grouped>).group;
}
const request = (agentId: 'seo-ai-search'|'accessibility'|'performance' = 'accessibility') => validateRequest({agentId,targetUrl:'https://solvd.com/'});
const empty: CollectorResult = {testedUrl:'https://solvd.com/',runtime:{node:'24',browser:'Chromium',engine:'test'},coverage:[],findings:[],evidence:[],artifacts:[]};
const fact = (p:any, rule?:string) => p.facts?.find((f:any)=>rule ? f.rule===rule : f.kind==='finding')?.id ?? 'missing-feature';
const response = (p:any, rule?:string) => ({interpretation:'Inspect the affected element in its recorded state.',claimIds:[fact(p,rule)],actions:[{
  title:'Compare computed accessibility information before and after activation',mode:'investigate',targetFactIds:[fact(p,rule)],priority:'medium',
  rationale:'Measure the component before choosing a correction.',steps:['Inspect the recorded element in the recorded page and state.'],
  verification:'Repeat axe on the same page and state and record the computed accessible name.',
}]});

function provider(t:any, generate:(p:any)=>unknown, options:{stop?:string;error?:string|Error;http?:number}={}) {
  for (const key of ['ANTHROPIC_API_KEY','ANTHROPIC_MODEL']) {
    const old=process.env[key]; process.env[key]=key==='ANTHROPIC_MODEL'?'fixture-model':'offline-test-key';
    t.after(()=>{if(old===undefined) delete process.env[key]; else process.env[key]=old;});
  }
  const calls:any[]=[];
  t.mock.method(globalThis,'fetch',async (_url:unknown,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body));const payload=JSON.parse(body.messages[0].content);calls.push({body,payload});
    if(options.error) throw typeof options.error==='string'?new Error(options.error):options.error;
    if(options.http) return Response.json({type:'error',error:{type:'api_error',message:'fixture outage'}},{status:options.http});
    const value=generate(payload);
    return Response.json({id:'msg_fixture',type:'message',role:'assistant',model:'actual-fixture-model',stop_reason:options.stop??'end_turn',stop_sequence:null,
      usage:{input_tokens:123,output_tokens:45},content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]});
  });
  return calls;
}

test('rejects legacy freeform recommendations even with a genuine evidence ID',async t=>{
  provider(t,p=>({summary:'The site JavaScript has a ReferenceError. Fix its bundled scripts.',actions:[{title:'Fix site scripts',rationale:'The site caused the error.',priority:'high',steps:['Fix JavaScript.'],evidenceIds:[p.evidence[0].id]}]}));
  const r=await assess(request('seo-ai-search'),fixtures.seo);
  assert.equal(r.status,'unavailable');
});

test('retains new model investigations, differing interpretations, order and allowed priority',async t=>{
  let variation=false;
  const calls=provider(t,p=>{const v=response(p,'button-name');if(variation){v.interpretation='Compare the name computation with the recorded markup.';v.actions[0].priority='low';v.actions[0].steps.reverse();}return v;});
  const a=await assess(request(),fixtures.accessibility);variation=true;const b=await assess(request(),fixtures.accessibility);
  assert.equal(a.status,'available');assert.equal(b.status,'available');
  if(a.status!=='available'||b.status!=='available') return;
  assert.notEqual((a as any).interpretation.text,(b as any).interpretation.text);
  assert.equal(a.actions[0].priority,'medium');assert.equal(b.actions[0].priority,'low');
  assert.equal(a.actions[0].title,'Compare computed accessibility information before and after activation');
  assert.deepEqual(a.actions[0].evidenceIds,fixtures.accessibility.findings.find(f=>f.rule==='button-name')!.evidenceIds);
  assert.equal(a.model,'actual-fixture-model');assert.deepEqual(a.usage,{inputTokens:123,outputTokens:45});
  assert.match(a.summary,/72 finding instances/);assert.match(a.summary,/7 WCAG-tagged/);assert.match(a.summary,/3 best-practice/);assert.match(a.summary,/62.*review/);
  assert.notEqual(a.summary,(a as any).interpretation.text);
  assert.equal(calls.length,2);assert.equal(calls[0].body.max_tokens,2200);
  assert.doesNotMatch(JSON.stringify(calls[0].body.output_config),/maxItems|maxLength|minLength|uniqueItems/,'raw provider schema must use only supported constraints; runtime enforces limits');
});

test('strict schema and ledger references fail closed',async t=>{
  let mutate=(v:any,p:any)=>{};
  provider(t,p=>{const v=response(p,'button-name');mutate(v,p);return v;});
  const mutations:Array<(v:any,p:any)=>void>=[
    v=>v.claimIds=['invented'], v=>v.claimIds=[],v=>v.extra=true,v=>v.actions[0].evidenceIds=['fake'],
    v=>v.actions[0].targetFactIds=['invented'],v=>v.actions[0].targetFactIds=[],v=>v.actions[0].targetFactIds.push(v.actions[0].targetFactIds[0]),
    v=>v.actions[0].mode='fix',v=>v.actions[0].priority='urgent',(v,p)=>{v.actions[0].priority='critical';v.actions[0].targetFactIds=[fact(p,'color-contrast')];},
    v=>v.actions[0].steps=[],v=>v.actions[0].steps=Array(5).fill('Inspect.'),v=>v.actions[0].verification='Recheck.',
    v=>v.actions=Array(4).fill(v.actions[0]),v=>v.actions.push(v.actions[0]),v=>v.interpretation='x'.repeat(1201),
  ];
  for(const mutation of mutations){mutate=mutation;const r=await assess(request(),fixtures.accessibility);assert.equal(r.status,'unavailable',mutation.toString());}
});

test('scanner capture error cannot authorize a site correction or site-cause hypothesis',async t=>{
  let mode='investigate';let subject:unknown='scanner';
  const calls=provider(t,p=>{const id=p.facts?.find((f:any)=>f.kind==='coverage'&&f.status==='incomplete')?.id??'missing-feature';return {
    interpretation:'The recorded page capture did not complete.',claimIds:[id],actions:[{title:'Reproduce the source-runtime capture failure',mode,targetFactIds:[id],priority:'medium',rationale:'Compare source and compiled collector execution.',steps:['Run the capture function in an isolated browser context.'],verification:'Rerun the collector and verify that rendered HTML coverage completes.',hypothesis:{subject,statement:'The source runtime may inject an unavailable helper.',supportingFactIds:[id],missingEvidence:['Compare serialized capture code in source and compiled execution.']}}]};});
  assert.equal((await assess(request('seo-ai-search'),fixtures.seo)).status,'available');
  mode='propose-correction';assert.equal((await assess(request('seo-ai-search'),fixtures.seo)).status,'unavailable');
  mode='investigate';subject='site';assert.equal((await assess(request('seo-ai-search'),fixtures.seo)).status,'unavailable');
  for (const malformed of [['site'],['scanner'],[['site']],null,1,true,{}]) {
    subject=malformed;assert.equal((await assess(request('seo-ai-search'),fixtures.seo)).status,'unavailable',`Malformed subject: ${JSON.stringify(malformed)}`);
  }
  subject='unknown';assert.equal((await assess(request('seo-ai-search'),fixtures.seo)).status,'available');
  assert.ok(calls[0].payload.facts.some((f:any)=>f.reason?.includes('__name')));
});

test('review-only, best-practice and unknown-intent facts permit investigation at medium or below',async t=>{
  let mode='propose-correction',priority='medium',rule='region';
  provider(t,p=>{const v=response(p,rule);Object.assign(v.actions[0],{mode,priority});return v;});
  assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  mode='investigate';priority='high';assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  priority='medium';assert.equal((await assess(request(),fixtures.accessibility)).status,'available');
  rule='video-caption';mode='propose-correction';assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  const unknown={...fixtures.accessibility,findings:[{...fixtures.accessibility.findings[0],disposition:'review-needed' as const,rule:'seo.noindex',summary:'Owner intent: unknown.'}]};
  rule='seo.noindex';assert.equal((await assess(request('seo-ai-search'),unknown)).status,'unavailable');
});

test('missing name cannot become observed failed dismissal; explicit hypothesis remains usable',async t=>{
  let hypothesize=false;
  provider(t,p=>{const v:any=response(p,'button-name');if(!hypothesize) v.interpretation='Users cannot dismiss the notification.';
    else v.actions[0].hypothesis={subject:'unknown',statement:'Dismissal might be difficult without a meaningful name.',supportingFactIds:v.claimIds,missingEvidence:['No activation or dismissal result was collected.']};
    v.actions[0].verification='Activate the recorded close button with keyboard and assistive technology; record whether the notification dismisses.';
    return v;});
  assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  hypothesize=true;assert.equal((await assess(request(),fixtures.accessibility)).status,'available');
});

test('observation references retain missing-name dismissal gates and legitimate hypotheses',async t=>{
  const name=fixtures.accessibility.findings.find(f=>f.rule==='button-name')!;
  const observed={...fixtures.accessibility,findings:[name],evidence:fixtures.accessibility.evidence.filter(e=>name.evidenceIds.includes(e.id))};
  let variant='interpretation';
  provider(t,p=>{
    const id=p.facts.find((f:any)=>f.kind==='observation'&&f.evidenceIds.includes(name.evidenceIds[0])).id;
    const v:any=response(p,'button-name');v.claimIds=[id];v.actions[0].targetFactIds=[id];
    if(variant==='interpretation') v.interpretation='Users cannot dismiss the notification.';
    if(variant==='rationale') v.actions[0].rationale='Users cannot dismiss the notification.';
    if(variant==='steps') v.actions[0].steps=['Activate the close button and record dismissal.'];
    if(variant==='verification'||variant==='hypothesis') v.actions[0].verification='Activate the close button and record whether the notification dismisses.';
    if(variant==='name') v.interpretation='The close button has no accessible name.';
    if(variant==='hypothesis') v.actions[0].hypothesis={subject:'unknown',statement:'Dismissal might be difficult without a meaningful name.',supportingFactIds:[id],missingEvidence:['No activation or dismissal result was collected.']};
    return v;
  });
  for(const invalid of ['interpretation','rationale','steps','verification']) {variant=invalid;assert.equal((await assess(request(),observed)).status,'unavailable',invalid);}
  for(const valid of ['name','hypothesis']) {variant=valid;assert.equal((await assess(request(),observed)).status,'available',valid);}
});

test('rejects unmeasured replacement colors and thresholds while allowing supplied measurements',async t=>{
  let rationale='Replace the text with #949494.',verification='Repeat axe and measure the displayed contrast on the recorded element.';
  provider(t,p=>{const v=response(p,'color-contrast');Object.assign(v.actions[0],{rationale,verification});return v;});
  assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  rationale='Measure the foreground #665e5c against #000000 before selecting a replacement.';
  assert.equal((await assess(request(),fixtures.accessibility)).status,'available');
  rationale='Adjust the contrast to at least 7.1:1.';assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  rationale='Recheck against the recorded 4.5:1 threshold.';assert.equal((await assess(request(),fixtures.accessibility)).status,'available');
});

test('ledger is bounded, keeps exact provenance, omits unsupported and oversized detail',async t=>{
  let omitted='';
  const calls=provider(t,p=>{if(omitted) return {interpretation:'Inspect omitted detail.',claimIds:[omitted],actions:[]};return {interpretation:'The complete report includes checks requiring review.',claimIds:[p.facts?.[0]?.id??'missing-feature'],actions:[]};});
  const source=fixtures.accessibility.evidence.find(e=>e.id===fixtures.accessibility.findings[0].evidenceIds[0])!;
  const large={...fixtures.accessibility,evidence:[...fixtures.accessibility.evidence,{...source,id:'oversized',data:{description:'x'.repeat(30000),tags:['wcag2aa']}}],findings:[...fixtures.accessibility.findings,{...fixtures.accessibility.findings[0],id:'unsupported',evidenceIds:['oversized']}]};
  const r=await assess(request(),large);assert.equal(r.status,'available');
  const p=calls[0].payload;assert.ok(p.facts.length<=80);assert.ok(JSON.stringify(p).length<70000);assert.equal(p.fullReportCounts.findingInstances,73);
  assert.ok(p.truncation.evidence);assert.ok(!p.evidence.some((e:any)=>e.id==='oversized'));assert.ok(!p.facts.some((f:any)=>f.findingId==='unsupported'));
  for(const f of p.facts) for(const id of f.evidenceIds) assert.ok(p.evidence.some((e:any)=>e.id===id));
  const name=p.facts.find((f:any)=>f.rule==='button-name');assert.deepEqual(name.scope,fixtures.accessibility.findings[0].scope);assert.deepEqual(name.provenance,[source.source]);
  omitted='finding:unsupported';assert.equal((await assess(request(),large)).status,'unavailable');
});

test('clean first run accepts an empty action array without inventing a recommendation',async t=>{
  provider(t,p=>({interpretation:'No finding instances were recorded; empty coverage cannot establish conformance.',claimIds:[p.facts?.[0]?.id??'missing-feature'],actions:[]}));
  const r=await assess(request(),empty);assert.equal(r.status,'available');if(r.status==='available'){assert.deepEqual(r.actions,[]);assert.match(r.summary,/0 finding instances/);}
});

test('missing credentials make no call; malformed, incomplete, timeout and provider errors preserve collected data',async t=>{
  const original=JSON.stringify(fixtures.accessibility);let variant='json';
  const calls=provider(t,p=>variant==='json'?'not json':response(p));
  assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');
  delete process.env.ANTHROPIC_API_KEY;assert.equal((await assess(request(),fixtures.accessibility)).status,'unavailable');assert.equal(calls.length,1);
  assert.equal(JSON.stringify(fixtures.accessibility),original);
});
for(const options of [{stop:'max_tokens'},{error:'request timed out'},{http:503}]) test(`provider failure is unavailable with one attempt: ${JSON.stringify(options)}`,async t=>{
  const calls=provider(t,p=>response(p),options);const r=await assess(request(),fixtures.accessibility);assert.equal(r.status,'unavailable');assert.equal(calls.length,1);
  if(options.stop && r.status==='unavailable')assert.match(r.reason,/incomplete.*max_tokens/);
});


test('provider schema stays identical across sites while local fact references remain enforced',async t=>{
  const calls=provider(t,p=>({interpretation:'The available evidence supports a scoped review.',claimIds:[p.facts[0].id],actions:[]}));
  await assess(request('seo-ai-search'),fixtures.seo);
  await assess(request(),fixtures.accessibility);
  assert.deepEqual(calls[0].body.output_config,calls[1].body.output_config);
});

test('one reformat attempt repairs an overlong field without changing the evidence or losing token usage',async t=>{
  let attempts=0;
  const calls=provider(t,p=>{const v=response(p,'button-name');if(attempts++===0)v.interpretation='x'.repeat(1201);return v;});
  const result=await assess(request(),fixtures.accessibility);
  assert.equal(result.status,'available');
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].payload,calls[1].payload);
  assert.equal(calls[1].body.messages.length,3);
  assert.match(calls[1].body.messages[2].content,/interpretation.*1200/);
  if(result.status==='available')assert.deepEqual(result.usage,{inputTokens:246,outputTokens:90});
});

test('repeated malformed text stops after two attempts with a field-specific safe diagnosis',async t=>{
  const calls=provider(t,p=>({...response(p,'button-name'),interpretation:'x'.repeat(1201)}));
  const result=await assess(request(),fixtures.accessibility);
  assert.equal(result.status,'unavailable');assert.equal(calls.length,2);
  if(result.status==='unavailable')assert.match(result.reason,/interpretation.*1200.*1201/);
});

test('unsupported claims do not trigger reformat attempts or get silently accepted',async t=>{
  const calls=provider(t,p=>({...response(p,'button-name'),claimIds:['not-in-ledger']}));
  const result=await assess(request(),fixtures.accessibility);
  assert.equal(result.status,'unavailable');assert.equal(calls.length,1);
});

for(const [error,reason] of [
  [new Anthropic.APIConnectionTimeoutError(),/timed out/i],
  [new Anthropic.APIUserAbortError(),/cancelled/i],
  [new Anthropic.APIConnectionError({message:'Sensitive provider detail is not a report message'}),/connection failed/i],
] as const)test(`provider errors preserve their category: ${error.constructor.name}`,async t=>{
  const calls=provider(t,p=>response(p),{error});const result=await assess(request(),fixtures.accessibility);
  assert.equal(result.status,'unavailable');assert.equal(calls.length,1);
  if(result.status==='unavailable'){assert.match(result.reason,reason);assert.doesNotMatch(result.reason,/Sensitive/);}
});

test('calculated comparisons and supplied release context reach synthesis with citable provenance',async t=>{
  const r=validateRequest({agentId:'performance',targetUrl:'https://solvd.com/',release:{label:'Navigation update',notes:'Changed header assets'}});
  const calls=provider(t,p=>({interpretation:'The LCP moved from 3.00 s to 2.50 s, but the change is inconclusive.',claimIds:[p.facts.find((f:any)=>f.contextKind==='comparison'&&f.data.metric)?.id??'missing-context'],actions:[]}));
  const comparison={status:'compatible' as const,reasons:[],findings:[],metrics:[{page:r.targetUrl,metric:'largest-contentful-paint',profileId:'mobile-v1' as const,unit:'ms',status:'inconclusive' as const,before:3000,after:2500,reason:'Observed variation is too large.'}]};
  const result=await assess(r,empty,undefined,{comparison});
  assert.equal(result.status,'available');
  const release=calls[0].payload.facts.find((f:any)=>f.contextKind==='release');
  assert.equal(release.data.label,'Navigation update');assert.equal(release.provenance[0].kind,'supplied');
  const change=calls[0].payload.facts.find((f:any)=>f.data?.metric==='largest-contentful-paint');
  assert.equal(change.data.status,'inconclusive');assert.deepEqual(change.evidenceIds,[]);assert.equal(change.scope.state,'mobile');
});
