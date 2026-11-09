import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCustomerReport } from '../src/customer-report.js';
import { accessibilityReport } from './report-fixture.js';
import { validateRequest } from '../src/core/input.js';
import type { AgentId, AgentReport } from '../src/core/types.js';

export function customerFixture(agentId: AgentId): AgentReport {
  return { ...accessibilityReport(), agentId, configuration: validateRequest({ agentId, targetUrl: 'https://example.com/' }),
    evidence: [], findings: [], artifacts: [], assessment: { status: 'unavailable', reason: 'Invalid assessment text; secret_config' } };
}

test('customer accessibility report separates measured requirements from suggestions and groups inconclusive checks', () => {
  const report = accessibilityReport();
  const reviews = report.evidence.filter(e => e.kind === 'axe-incomplete');
  reviews.forEach((e, i) => { if (i < 55) e.data = { ...(e.data as object), checks: { any: [{ message: i < 54 ? "Background could not be determined due to a pseudo element" : "Background partially overlaps other elements" }], all: [], none: [] }, observedChecks: [] }; });
  const section = buildCustomerReport([report]).sections[0];
  assert.equal(section.rating.label, '7 findings need attention');
  assert.match(section.headline, /7.*requirements.*3.*suggestions/);
  assert.deepEqual(section.reviewGroups.map(g => g.count).sort((a,b) => a-b), [1,7,54]);
  assert.equal(section.findings.filter(f => f.kind === 'finding').reduce((sum,f) => sum+f.count,0), 7);
  assert.equal(section.findings.filter(f => f.kind === 'observation').reduce((sum,f) => sum+f.count,0), 3);
  assert.match(section.findings.find(f => /name/.test(f.title))!.impact, /screen.reader/);
  assert.doesNotMatch(JSON.stringify(section), /#selector-|Scanner |Fix any|Raw scanner|state initial|Historical draft/);
});

test('customer performance reports real scores, device-specific medians, sample variability and inconclusive comparison', () => {
  const report = customerFixture('performance');
  report.measurements = { navigation: { pages: [ { page: report.testedUrl, planned: 3, succeeded: 3, profileId: 'desktop-v1', formFactor: 'desktop', metrics: {
    'performance-score': { median:78,min:68,max:86 }, 'largest-contentful-paint': { median:2490.6155 }, 'total-blocking-time': { median:139 }, 'cumulative-layout-shift': { median:0.000083 }
  }, samples: [68,78,86].map(n => ({ status:'collected', metrics: { 'performance-score':n } })) } ] } };
  report.comparison = { status: 'compatible', reasons: [], findings: [], metrics: [{ page:report.testedUrl,metric:'largest-contentful-paint',status:'inconclusive',unit:'ms',reason:'Within-run variation is too large.' }] };
  const section = buildCustomerReport([report]).sections[0];
  assert.equal(section.rating.score, 78);
  assert.match(section.rating.basis,/Desktop/);
  assert.match(section.metrics.find(m => /Main content/.test(m.label))!.interpretation,/Good.*2.5.*goal: under 2 s/);
  assert.equal(section.metrics.find(m => /Input blocking/.test(m.label))!.tone,'good');
  assert.deepEqual(section.sampleScores[0].values,[68,78,86]);
  assert.match(section.comparison!,/inconclusive/i);
  assert.match(section.limits,/desktop only/i);
  assert.doesNotMatch(JSON.stringify(section),/Invalid assessment|secret_config/);
});

test('SEO customer summary explains verified strengths and does not invent a numeric score or comprehensive pass', () => {
  const report = customerFixture('seo-ai-search');
  report.evidence.push({id:'metadata',agentId:report.agentId,kind:'seo.rendered-metadata',scope:{page:report.testedUrl},summary:'internal',source:{kind:'measured',name:'Browser'},data:{title:'Company services',description:'Useful service description.',canonical:[{url:report.testedUrl}]}});
  const section = buildCustomerReport([report]).sections[0];
  assert.equal(section.rating.score,undefined);
  assert.match(section.scope,/1 page/);
  assert.ok(section.positives.some(x => /title.*description/i.test(x)));
  assert.match(section.limits,/rankings/);
  assert.doesNotMatch(section.headline,/perfect|excellent SEO|indexed/i);
});

test('missing or failed agents cannot appear as healthy', () => {
  const report = customerFixture('seo-ai-search'); report.collectionStatus='failed'; report.coverage=[];
  const view = buildCustomerReport([report],{scope:'all'});
  assert.equal(view.sections.length,3);
  assert.ok(view.sections.every(s => s.rating.tone==='limited'));
  assert.ok(view.sections.every(s => s.rating.score===undefined));
});

test('customer report separates current grounded agent interpretation and omits historical or technical prose', () => {
  const report=customerFixture('seo-ai-search');
  report.assessment={status:'available',model:'live',summary:'summary',groundingVersion:1,interpretation:{text:'The sampled page has a useful search foundation; check important service pages next.',claimIds:['measured-fact'],evidenceIds:['e1']},actions:[],sentEvidenceIds:['e1'],truncated:false};
  assert.match(buildCustomerReport([report]).sections[0].agentAssessment!.text,/search foundation/);
  assert.match(buildCustomerReport([report]).sections[0].agentAssessment!.note,/interpretation/);
  report.assessment.groundingVersion=undefined;
  assert.equal(buildCustomerReport([report]).sections[0].agentAssessment,undefined);
  report.assessment.groundingVersion=1;report.assessment.interpretation!.text='Fix #menu-item-123 > a';
  assert.equal(buildCustomerReport([report]).sections[0].agentAssessment,undefined);
});

test('retained Lighthouse resource details are recovered without changing the saved input or treating duration as savings', async () => {
  const {buildCustomerReportWithArtifacts}=await import('../src/customer-report.js');
  const report=customerFixture('performance');
  report.measurements={navigation:{pages:[{page:report.testedUrl,planned:3,succeeded:1,metrics:{'performance-score':{median:78}},samples:[{metrics:{'performance-score':78},artifacts:{lhr:'raw-lhr'},diagnostics:[]}]}]}};
  const lhr={audits:{'render-blocking-insight':{id:'render-blocking-insight',title:'Render-blocking requests',score:0.5,scoreDisplayMode:'numeric',details:{type:'table',headings:[],items:[{url:'https://example.com/main.css',totalBytes:1024,wastedMs:300}]}}}};
  report.artifacts=[{id:'raw-lhr',label:'Lighthouse report',mediaType:'application/json',byteLength:500}];
  const before=JSON.stringify(report);
  const view=await buildCustomerReportWithArtifacts([report],{loadArtifact:async()=>Buffer.from(JSON.stringify(lhr))});
  assert.equal(JSON.stringify(report),before);
  assert.match(JSON.stringify(view.sections[0].findings),/main.css/);
  assert.match(JSON.stringify(view.sections[0].findings),/300 ms request duration/);
  assert.doesNotMatch(JSON.stringify(view.sections[0].findings),/300 ms saving/);
});

test('auxiliary completed checks cannot create a healthy SEO or accessibility verdict', () => {
  const seo=customerFixture('seo-ai-search');seo.collectionStatus='partial';
  seo.evidence=[{id:'robots',agentId:seo.agentId,kind:'seo.robots-policy',scope:{page:seo.testedUrl},summary:'Collected robots',source:{kind:'measured',name:'HTTP'},data:{status:'complete'}}, {id:'metadata',agentId:seo.agentId,kind:'seo.rendered-metadata',scope:{page:seo.testedUrl},summary:'unavailable',source:{kind:'measured',name:'Browser'},data:{title:null,description:null,reason:'Browser could not load'}}];
  const a11y=customerFixture('accessibility');a11y.collectionStatus='partial';
  a11y.evidence=[{id:'keyboard',agentId:a11y.agentId,kind:'keyboard-probe',scope:{page:a11y.testedUrl},summary:'Sampled',source:{kind:'measured',name:'Browser'},data:{status:'complete'}}];
  for(const input of [seo,a11y]){const section=buildCustomerReport([input]).sections[0];assert.equal(section.rating.tone,'limited');assert.doesNotMatch(section.headline,/foundations|no accessibility problems|look sound/i);}
});

test('failed performance samples do not supply customer scores, resource recommendations or retained artifacts', async () => {
  const {buildCustomerReportWithArtifacts}=await import('../src/customer-report.js');
  const report=customerFixture('performance');
  report.measurements={navigation:{pages:[{page:report.testedUrl,planned:3,succeeded:1,metrics:{'performance-score':{median:78}},samples:[{status:'collected',metrics:{'performance-score':78},diagnostics:[]},{status:'failed',metrics:{'performance-score':10},artifacts:{lhr:'failed-lhr'},diagnostics:[{id:'image-delivery-insight',score:0.5,resources:[{url:'https://example.com/failed-only-image.webp',estimatedSavingsBytes:10000}]}]}]}]}};
  report.artifacts=[{id:'failed-lhr',label:'Failed sample',mediaType:'application/json',byteLength:100}];
  let reads=0;
  const view=await buildCustomerReportWithArtifacts([report],{loadArtifact:async()=>{reads++;return Buffer.from('{}');}});
  assert.deepEqual(view.sections[0].sampleScores[0].values,[78]);assert.doesNotMatch(JSON.stringify(view),/failed-only-image/);assert.equal(reads,0);
});

test('the headline leads with measured phone content timing and compares only the same desktop page', () => {
  const report=customerFixture('performance');
  report.measurements={navigation:{pages:[{page:report.testedUrl,profileId:'mobile-v1',formFactor:'mobile',succeeded:3,planned:3,metrics:{'performance-score':{median:43},'largest-contentful-paint':{median:6593.413}}},{page:report.testedUrl,profileId:'desktop-v1',formFactor:'desktop',succeeded:3,planned:3,metrics:{'performance-score':{median:72},'largest-contentful-paint':{median:3224.17025}}}]}};
  assert.equal(buildCustomerReport([report]).headline,'On phones, your main content appears after 6.6 s (goal: under 2 s); desktop 3.2 s.');
  assert.match(buildCustomerReport([report]).sections[0].limits,/LCP.*proxy.*page.load goal/i);
  assert.equal(buildCustomerReport([report]).sections[0].headline,buildCustomerReport([report]).headline);
  assert.equal(buildCustomerReport([report]).sections[0].metrics.find(m=>m.label==='Mobile - Main content appears (LCP)')!.interpretation,'Poor - over 4 s. Your goal: under 2 s.');
  (report.measurements.navigation as any).pages[1].page='https://example.com/another-page/';
  assert.doesNotMatch(buildCustomerReport([report]).headline,/desktop 3.2/);
});

test('duplicate performance opportunities merge by audit while preserving device resource costs', () => {
  const report=customerFixture('performance');
  report.measurements={navigation:{pages:['mobile','desktop'].map((device,index)=>({page:report.testedUrl,formFactor:device,profileId:`${device}-v1`,planned:3,succeeded:1,metrics:{'performance-score':{median:70},'largest-contentful-paint':{median:3200}},samples:[{status:'collected',metrics:{'performance-score':70},diagnostics:[{id:'image-delivery-insight',score:0.5,value:index?20480:10240,unit:'byte',resources:[{url:`https://example.com/${device}-image.webp`,estimatedSavingsBytes:index?20480:10240}]}]}]}))}};
  const section=buildCustomerReport([report]).sections[0];
  assert.equal(section.findings.length,1);assert.equal(section.findings[0].title,'Reduce image weight');
  assert.deepEqual(section.findings[0].deviceDetails?.map(d=>d.device),['Mobile','Desktop']);
  assert.match(section.findings[0].where.join(' '),/Mobile:.*10 KB saving.*Desktop:.*20 KB saving/);
  assert.match(section.findings[0].impact,/Mobile:.*10 KB.*Desktop:.*20 KB/);
});

test('SEO verdict names review items and describes only verified same-page HTTP canonical mismatches precisely', () => {
  const report=customerFixture('seo-ai-search');const page='https://example.com/campaign/';
  report.evidence=[{id:'meta',kind:'seo.source-metadata',agentId:report.agentId,scope:{page},summary:'Recorded metadata',source:{kind:'measured',name:'HTTP'},data:{title:'Campaign',description:'',documentUrl:page,canonical:[{url:'http://example.com/campaign/'}]}}];
  report.findings=[{id:'desc',agentId:report.agentId,rule:'seo.description-missing',title:'Raw',summary:'Raw',severity:'low',disposition:'review-needed',scope:{page},evidenceIds:['meta'],coverageIds:[]},{id:'canonical',agentId:report.agentId,rule:'seo.canonical-target',title:'Raw',summary:'Raw',severity:'medium',disposition:'review-needed',scope:{page},evidenceIds:['meta'],coverageIds:[]}];
  let section=buildCustomerReport([report]).sections[0];
  assert.equal(section.rating.label,'2 findings need attention');
  assert.ok(section.findings.every(f=>f.kind==='finding'));
  assert.equal(report.findings[0].disposition,'review-needed','saved technical evidence is not rewritten');
  assert.match(section.findings[0].title,/\/campaign\//);assert.match(section.findings[0].where.join(' '),/\/campaign\//);
  assert.match(section.findings[1].impact,/HTTP.*same page.*HTTPS/i);assert.match(section.findings[1].recommendation,/HTTP.*HTTPS/i);
  (report.evidence[0].data as any).canonical=[{url:'http://example.com/different/'}];
  section=buildCustomerReport([report]).sections[0];assert.equal(section.findings[1].kind,'review');assert.doesNotMatch(section.findings[1].impact,/same page/);assert.doesNotMatch(section.findings[1].recommendation,/Replace.*HTTP.*HTTPS/);
});

test('accessibility verdict and grouped observations reconcile their instance counts, and SEO preview capitalization is preserved', () => {
  const report=accessibilityReport();const section=buildCustomerReport([report]).sections[0];
  assert.equal(section.rating.label,'7 findings need attention');
  const observations=section.findings.filter(f=>f.kind==='observation');assert.deepEqual(observations.map(f=>f.count),[1,2]);
  assert.match(observations[0].title,/1 /);assert.match(observations[1].title,/2 /);
  const seo=customerFixture('seo-ai-search');seo.evidence=[{id:'meta',kind:'seo.source-metadata',agentId:seo.agentId,scope:{page:seo.testedUrl},summary:'metadata',source:{kind:'measured',name:'HTTP'},data:{title:'Example',description:'Example description'}}];seo.artifacts=[{id:'preview',label:'Page preview',mediaType:'image/jpeg',byteLength:100}];
  assert.match(buildCustomerReport([seo]).sections[0].images[0].caption,/SEO/);
});

test('SEO consolidates page metadata strengths and names incomplete browser checks without promoting missing evidence', () => {
  const report=customerFixture('seo-ai-search');report.collectionStatus='partial';
  const page='https://example.com/campaign/';
  report.coverage.push({id:'render',scope:{page},subject:'rendered HTML canonical and indexing directives',status:'incomplete',reason:'secret_config browser error'});
  report.evidence=[{id:'good',agentId:report.agentId,kind:'seo.source-metadata',scope:{page:report.testedUrl},summary:'metadata',source:{kind:'measured',name:'HTTP'},data:{title:'Example title',description:'Example description'}},
    {id:'quality-good',agentId:report.agentId,kind:'seo.page-quality',scope:{page:report.testedUrl},summary:'quality',source:{kind:'measured',name:'HTML'},data:{titleStatus:'present',descriptionStatus:'present'}},
    {id:'quality-missing',agentId:report.agentId,kind:'seo.page-quality',scope:{page},summary:'quality',source:{kind:'measured',name:'HTML'},data:{descriptionStatus:'missing'}}];
  report.findings=[{id:'missing',agentId:report.agentId,rule:'seo.description-missing',title:'Raw',summary:'Raw',severity:'low',disposition:'review-needed',scope:{page},evidenceIds:['quality-missing'],coverageIds:[]}];
  const section=buildCustomerReport([report]).sections[0];
  assert.equal(section.findings[0].kind,'finding');
  assert.deepEqual(section.positives.filter(p=>/title.*description/.test(p)),['1 of 2 pages have a title and description; /campaign is missing its description (see findings).']);
  assert.match(section.limits,/could not fully check search information after these pages loaded: \/campaign/);
  assert.doesNotMatch(section.limits,/Some checks could not finish|secret_config/);
  report.evidence=report.evidence.filter(e=>e.id!=='quality-missing');
  assert.equal(buildCustomerReport([report]).sections[0].findings[0].kind,'review');
});
