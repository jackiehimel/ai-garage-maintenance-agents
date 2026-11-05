// Pure helpers shared by the acceptance scripts; no browser or network startup.
export function requireFetchOk(response, label) {
  if (typeof response.ok !== 'boolean') throw new TypeError('Expected a native fetch Response with a boolean ok property');
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response;
}

export function relabelFixtureEvidence(result, createEvidence) {
  const names = {
    'Protected Chromium': 'Isolated sandboxed Chromium fixture transport',
    'Protected Playwright browser': 'Isolated sandboxed Chromium fixture transport',
    'DNS-pinned public HTTP': 'Isolated fixture HTTP transport (no public egress)',
  };
  const ids = new Map();
  result.evidence = result.evidence.map(({ id, ...draft }) => {
    const evidence = createEvidence({ ...draft, source: { ...draft.source, name: names[draft.source.name] || draft.source.name } });
    ids.set(id, evidence.id);
    return evidence;
  });
  for (const finding of result.findings) {
    finding.evidenceIds = finding.evidenceIds.map(id => {
      if (!ids.has(id)) throw new Error('Fixture finding references missing evidence');
      return ids.get(id);
    });
  }
  return result;
}

export function requestForFixture(agentId, origin, baseline) {
  return { agentId, targetUrl: `${origin}/${agentId}`, ...(baseline ? { baseline } : {}),
    ...(agentId === 'seo-ai-search' ? { indexIntent: [{ page: `/${agentId}`, intended: 'indexable' }] } : {}),
    ...(agentId === 'accessibility' ? { states: [{ id: 'keyboard', page: `/${agentId}`, steps: [{ action: 'key', key: 'Tab' }, { action: 'key', key: 'Tab' }, { action: 'key', key: 'Tab' }, { action: 'assert-focus', selector: '#keyboard-target' }] }] } : {}),
  };
}
