import assert from 'node:assert/strict';
import test from 'node:test';
import { assess } from '../src/core/assessment.js';
import { createEvidence, createFinding } from '../src/core/evidence.js';
import { validateRequest } from '../src/core/input.js';
import type { CollectorResult } from '../src/core/types.js';

const request = validateRequest({ agentId: 'seo-ai-search', targetUrl: 'https://example.com/' });
const result: CollectorResult = {
  testedUrl: request.targetUrl,
  runtime: { node: '24.0.0', browser: 'Chromium 143', engine: 'collector-1' },
  coverage: [], findings: [], artifacts: [],
  evidence: Array.from({ length: 61 }, (_, index) => createEvidence({
    agentId: request.agentId, kind: 'http-check', scope: { page: request.targetUrl },
    key: String(index), summary: `HTTP observation ${index}`,
    source: { kind: 'measured', name: 'HTTP collector' },
  })),
};

test('live assessment accepts transmitted evidence and rejects invented or omitted evidence IDs', async (t) => {
  const env = { ANTHROPIC_API_KEY: 'offline-test-key', ANTHROPIC_MODEL: 'test-model' };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const [included] = result.evidence;
  const omitted = result.evidence.at(-1);
  assert.ok(included && omitted);
  let reference = included.id;
  const requests: Array<any> = [];
  let prompt = '';
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(JSON.parse(body.messages[0].content));
    prompt = body.system;
    return Response.json({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'test-model',
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
      content: [{ type: 'text', text: JSON.stringify({
        summary: 'Check the observed response.',
        actions: [{ title: 'Inspect response', rationale: 'Verify the response independently.',
          priority: 'medium', steps: ['Repeat the request.'], evidenceIds: [reference] }],
      }) }],
    });
  });

  const valid = await assess(request, result);
  assert.equal(valid.status, 'available');
  assert.deepEqual(valid.actions[0]?.evidenceIds, [included.id]);
  assert.equal(valid.truncated, true);

  for (const id of ['ev_ffffffffffffffffffffffff', omitted.id]) {
    reference = id;
    const invalid = await assess(request, result);
    assert.equal(invalid.status, 'unavailable');
    assert.match(invalid.reason, /references evidence not supplied/i);
    assert.ok(!invalid.sentEvidenceIds?.includes(id));
  }

  assert.equal(fetch.mock.callCount(), 3);
  for (const payload of requests) {
    assert.equal(payload.evidence.length, 60);
    assert.ok(payload.evidence.some(({ id }: {id:string}) => id === included.id));
    assert.ok(!payload.evidence.some(({ id }: {id:string}) => id === omitted.id));
  }
  const enriched: CollectorResult = {...result,
    evidence:result.evidence.map(e=>({...e,data:{large:'x'.repeat(1500),tags:['best-practice'],criteria:[],impact:'moderate'}})),
    findings:Array.from({length:72},(_,index)=>createFinding({agentId:request.agentId,rule:index<10 ? 'region' : 'color-contrast',
      scope:{page:request.targetUrl,state:index%2 ? 'menu-open' : 'initial',element:'#node-'+index},
      title:'Measured check',summary:'Retained observation',severity:'info',disposition:index<10 ? 'finding' : 'review-needed',
      evidenceIds:[result.evidence[index%61].id],coverageIds:[]})),
  };
  reference = included.id;
  const sampled = await assess(request,enriched);
  assert.equal(sampled.truncated,true);
  const payload = requests.at(-1);
  assert.equal(payload.fullReportCounts.findingInstances,72);
  assert.deepEqual(payload.fullReportCounts.byDisposition,{finding:10,'review-needed':62});
  assert.deepEqual(payload.fullReportCounts.byRuleDisposition.groups,[{rule:'region',disposition:'finding',count:10},{rule:'color-contrast',disposition:'review-needed',count:62}]);
  assert.deepEqual(payload.fullReportCounts.byPageState.groups.map((x:any)=>x.count),[36,36]);
  assert.equal(payload.truncation.findings,true);
  assert.equal(payload.truncation.evidence,true);
  assert.ok(payload.evidence.length<61);
  assert.deepEqual(payload.evidence[0].tags,['best-practice']);
  assert.equal(payload.findings[0].rule,'region');
  assert.equal(payload.findings[0].scope.element,'#node-0');
  assert.deepEqual(payload.findings[0].impacts,['moderate']);
  assert.match(prompt,/Manual\/review-needed checks are unresolved checks/);
  assert.match(prompt,/Never invent replacement colors/);

  const exact = await assess(request,{...result,evidence:[{...included,data:'x'.repeat(1398)}]});
  assert.equal(exact.truncated,false,'exactly 1400 serialized characters are complete');
  const summaryCut = await assess(request,{...result,evidence:[{...included,summary:'x'.repeat(1201)}]});
  assert.equal(summaryCut.truncated,true,'summary slicing is disclosed');

});

