import assert from 'node:assert/strict';
import test from 'node:test';
import { BASELINE_MAX_BYTES, compareFindings, createBaseline, parseBaseline, baselineIdentity } from '../src/core/baseline.js';
import { collectionStatus, createFinding, createEvidence } from '../src/core/evidence.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult, PortableBaseline } from '../src/core/types.js';

const request = validateRequest({agentId:'accessibility',targetUrl:'https://public.example.com', states:[{id:'menu',page:'/',steps:[]}]});
const identity = baselineIdentity(request, {node:'v24', browser:'Chromium 1', engine:'axe 4'}, request.targetUrl);
const page = request.targetUrl;
const evidence = createEvidence({agentId:'accessibility', kind:'axe', scope:{page,state:'menu',element:'#menu'}, summary:'Axe result', source:{kind:'measured',name:'axe'}, data:{a:1,b:2}});
const finding = createFinding({agentId:'accessibility', rule:'label', scope:evidence.scope, title:'Missing label', summary:'A control has no name', severity:'high', disposition:'finding', evidenceIds:[evidence.id], coverageIds:['axe:menu']});
const before: CollectorResult = {
  testedUrl:page, runtime:identity.runtime, evidence:[evidence], findings:[finding], artifacts:[],
  coverage:[{id:'axe:menu', scope:{page,state:'menu'}, subject:'axe', status:'complete'}],
};

function portable(result: CollectorResult): PortableBaseline {
  const exported = createBaseline(identity,result);
  assert.equal(exported.status,'available');
  return exported.baseline;
}

test('stable identity ignores evidence payload and finding text changes but distinguishes affected selectors', () => {
  assert.equal(createEvidence({...evidence, data:{value:99}}).id, evidence.id);
  assert.equal(createFinding({...finding, title:'Different display wording'}).id, finding.id);
  assert.notEqual(createFinding({...finding, scope:{...finding.scope, element:'#other'}}).id, finding.id);
});

test('incomplete matched coverage cannot resolve or establish a new finding', () => {
  const baseline = parseBaseline(JSON.stringify(portable(before)));
  const after: CollectorResult = {...before, evidence:[], findings:[], coverage:[{...before.coverage[0],status:'incomplete',reason:'Navigation did not finish'}]};
  const comparison = compareFindings(identity, after, baseline);
  assert.equal(comparison.findings[0].status, 'inconclusive');
  assert.equal(compareFindings(identity, {...after,coverage:before.coverage}, baseline).findings[0].status, 'resolved');
  const incompleteBaseline = portable(after);
  assert.equal(compareFindings(identity, before, incompleteBaseline).findings[0].status, 'inconclusive');
});

test('first-run and version or scope mismatches produce no invented changes', () => {
  const baseline = portable(before);
  assert.equal(compareFindings(identity, before).status,'first-run');
  assert.equal(compareFindings({...identity,runtime:{...identity.runtime,browser:'Chromium 2'}}, before, baseline).status,'incompatible');
  const altered = {...baseline,findings:[{...finding,evidenceIds:['ev_000000000000000000000000']} ]};
  assert.throws(() => parseBaseline(JSON.stringify(altered)), /evidence/i);
  assert.throws(() => parseBaseline(' '.repeat(3_000_000)), /size/i);
});

test('collection status reflects required coverage without treating optional input as a failure', () => {
  const complete = before.coverage[0];
  const missing = {...complete,id:'field',status:'not-configured' as const};
  const failed = {...complete,status:'unavailable' as const};
  assert.equal(collectionStatus([complete,missing]),'complete');
  assert.equal(collectionStatus([failed,missing]),'failed');
  assert.equal(collectionStatus([complete,{...failed,id:'next'}]),'partial');
});

test('scope changes invalidate comparisons while release descriptions do not', () => {
  const release = validateRequest({agentId:'accessibility',targetUrl:page,states:[{id:'menu',page:'/',steps:[]}],release:{label:'next',notes:'maintenance'}});
  const changedScope = validateRequest({agentId:'accessibility',targetUrl:page,states:[{id:'menu',page:'/',steps:[{action:'key',key:'Tab'}]}]});
  assert.equal(compareFindings(baselineIdentity(release,identity.runtime,page),before,portable(before)).status,'compatible');
  assert.equal(compareFindings(baselineIdentity(changedScope,identity.runtime,page),before,portable(before)).status,'incompatible');
});

test('a completed scan of a different element or component does not establish resolution', () => {
  for (const wrongScope of [{page,state:'menu',element:'#footer'},{page,state:'menu',component:'footer'}]) {
    const coverage = [{...before.coverage[0],scope:wrongScope}];
    const prior = portable({...before,coverage});
    const result = compareFindings(identity,{...before,coverage,evidence:[],findings:[]},prior);
    assert.equal(result.findings[0].status,'inconclusive');
  }
  const broad = [{...before.coverage[0],scope:{page}}];
  const result = compareFindings(identity,{...before,coverage:broad,evidence:[],findings:[]},portable({...before,coverage:broad}));
  assert.equal(result.findings[0].status,'resolved');
});

test('a supplied-only finding stays in the baseline but cannot drive measured changes', () => {
  const supplied = createEvidence({...evidence,source:{kind:'supplied',name:'Reviewer'}});
  const result = {...before,evidence:[supplied],findings:[{...finding,evidenceIds:[supplied.id]}]};
  const prior = portable(result);
  assert.equal(prior.findings.length,1);
  assert.deepEqual(compareFindings(identity,result,prior).findings,[]);
  assert.deepEqual(compareFindings(identity,{...before,evidence:[],findings:[]},prior).findings,[]);
});

test('creation only offers importer-compatible baselines and preserves observations on rejection', () => {
  assert.deepEqual(parseBaseline(JSON.stringify(portable(before))),portable(before));
  const giant = {...before,evidence:[{...evidence,data:'x'.repeat(2_600_000)}]};
  const tooLarge = createBaseline(identity,giant);
  assert.equal(tooLarge.status,'unavailable');
  assert.match(tooLarge.reason,/size limit/i);
  assert.equal(giant.evidence[0].data.length,2_600_000);
  const broken = createBaseline(identity,{...before,evidence:[]});
  assert.equal(broken.status,'unavailable');
  assert.match(broken.reason,/missing baseline evidence/i);
});

test('portable export rejects a long Unicode tested URL and reimports a shorter normalized URL', () => {
  const unicodeUrl = 'https://public.example.com/' + 'é'.repeat(800);
  const rejected = createBaseline({...identity,testedUrl:unicodeUrl},{...before,testedUrl:unicodeUrl});
  assert.equal(rejected.status,'unavailable');
  assert.match(rejected.reason,/canonical.*length/i);

  const shorterUrl = 'https://public.example.com/café';
  const exported = createBaseline({...identity,testedUrl:shorterUrl},{...before,testedUrl:shorterUrl});
  assert.equal(exported.status,'available');
  assert.equal(exported.baseline.identity.testedUrl,'https://public.example.com/caf%C3%A9');
  assert.deepEqual(parseBaseline(JSON.stringify(exported.baseline)),exported.baseline);
});

test('pre-policy baselines remain importable and compare as a different browser profile', () => {
  const baseline = portable(before);
  const {sharedWorkers, ...earlierProfile} = baseline.identity.profile;
  assert.equal(sharedWorkers,'blocked');
  const legacy = parseBaseline({...baseline,identity:{...baseline.identity,profile:earlierProfile}});
  assert.equal(compareFindings(identity,before,legacy).status,'incompatible');
});

test('normalization cannot push an advertised baseline over the import byte limit', () => {
  const shortUnicode = 'https://public.example.com/café';
  const candidate = {...identity,testedUrl:shortUnicode,configuration:{filler:''}};
  const bareBaseline = {schemaVersion:1,identity:candidate,coverage:before.coverage,evidence:before.evidence,findings:before.findings};
  const fillerLength = BASELINE_MAX_BYTES - Buffer.byteLength(JSON.stringify(bareBaseline));
  candidate.configuration.filler = 'x'.repeat(fillerLength);
  const exported = createBaseline(candidate,{...before,testedUrl:shortUnicode});
  assert.equal(exported.status,'unavailable');
  assert.match(exported.reason,/size limit/i);
});
