import assert from 'node:assert/strict';
import test from 'node:test';
import { assess } from '../src/core/assessment.js';
import { createEvidence } from '../src/core/evidence.js';
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
  const requests: Array<{ evidence: Array<{ id: string }> }> = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(JSON.parse(body.messages[0].content));
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
    assert.ok(payload.evidence.some(({ id }) => id === included.id));
    assert.ok(!payload.evidence.some(({ id }) => id === omitted.id));
  }
});
