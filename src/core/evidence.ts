import { createHash } from 'node:crypto';
import type { CollectionStatus, CoverageEntry, Evidence, Finding } from './types.js';

export const EVIDENCE_ID = /^ev_[a-f0-9]{24}$/;
export const FINDING_ID = /^fi_[a-f0-9]{24}$/;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
    }
    return entry;
  });
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0,24);
}

export function createEvidence(draft: Omit<Evidence,'id'>): Evidence {
  const { agentId, kind, scope, source, key } = draft;
  return {...draft, id:'ev_' + digest({agentId,kind,scope,source:{kind:source.kind,name:source.name},key})};
}
export function createFinding(draft: Omit<Finding,'id'>): Finding {
  const { agentId, rule, scope, key } = draft;
  return {...draft, id:'fi_' + digest({agentId,rule,scope,key})};
}

// A missing optional input is not a failed measurement. An empty or entirely
// unavailable coverage manifest cannot imply that a collection completed.
export function collectionStatus(coverage: readonly CoverageEntry[]): CollectionStatus {
  if (!coverage.some((entry) => entry.status === 'complete')) return 'failed';
  return coverage.some((entry) => entry.status === 'incomplete' || entry.status === 'unavailable') ? 'partial' : 'complete';
}
