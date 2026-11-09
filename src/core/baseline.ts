import { canonicalJson, createEvidence, createFinding, EVIDENCE_ID, FINDING_ID } from './evidence.js';
import { boundedJson, choice, list, object, parsePublicTarget, string } from './input.js';
import { AGENT_IDS } from './types.js';
import type {
  AgentId, BaselineExport, BaselineIdentity, CollectorResult, Comparison, CoverageEntry, Evidence, Finding, FindingChange,
  JsonObject, JsonValue, PortableBaseline, RuntimeVersions, Scope, ValidatedRequest,
} from './types.js';

export const BASELINE_MAX_BYTES = 2_500_000;
const PRIORITIES = ['critical','high','medium','low','info'] as const;

export function baselineIdentity(request: ValidatedRequest, runtime: RuntimeVersions, testedUrl: string): BaselineIdentity {
  const configuration: JsonObject = {pages:request.pages.map((p) => p.url)};
  if (request.agentId === 'accessibility') {
    configuration.states = request.states.map((s) => ({
      page:s.page,id:s.id,steps:s.steps.map((step) => ({...step})),
    }));
    configuration.components = request.components.map((c) => ({id:c.id,selector:c.selector}));
  }
  if (request.agentId === 'seo-ai-search') configuration.indexIntent = request.indexIntent.map((i) => ({page:i.page,intended:i.intended})).sort((a,b) => a.page.localeCompare(b.page));
  if (request.agentId === 'seo-ai-search' && request.pageDiscovery) configuration.pageDiscovery = request.pageDiscovery;
  return {agentId:request.agentId,targetUrl:request.targetUrl,testedUrl,runtime:{...runtime},profile:structuredClone(request.profile),configuration};
}

export function createBaseline(identity: BaselineIdentity, result: CollectorResult): BaselineExport {
  const {coverage,evidence,findings,measurements} = result;
  try {
    const baseline = parseBaseline({schemaVersion:1,identity,coverage,evidence,findings,measurements});
    // Normalization can increase the serialized byte count even when each URL fits.
    return {status:'available',baseline:parseBaseline(baseline)};
  } catch (error) {
    return {status:'unavailable',reason:error instanceof Error ? error.message : 'Baseline export validation failed'};
  }
}

function jsonValue(input: unknown, depth = 0): JsonValue {
  if (depth > 14) throw new Error('Baseline JSON nesting exceeds the limit');
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (Array.isArray(input)) return list(input,'baseline data items',5000).map((x) => jsonValue(x,depth+1));
  return Object.fromEntries(Object.entries(object(input,undefined,'baseline data')).map(([k,v]) => [string(k,'baseline data key',240),jsonValue(v,depth+1)]));
}
function jsonObject(input: unknown): JsonObject { return jsonValue(object(input)) as JsonObject; }
const maybeString = (x: unknown, name: string, max = 2048) => x === undefined ? undefined : string(x,name,max);
function scoped(input: unknown): Scope {
  const s = object(input,['page','state','element','component'],'scope');
  return {page:parsePublicTarget(s.page).href,state:maybeString(s.state,'state',80),element:maybeString(s.element,'element',2048),component:maybeString(s.component,'component',120)};
}
function matchingId(input: unknown, pattern: RegExp, name: string): string {
  const id = string(input,name,120);
  if (!pattern.test(id)) throw new Error(`Invalid ${name}`);
  return id;
}
function positive(input: unknown, name: string, max: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0 || input > max) throw new Error(`Invalid baseline ${name}`);
  return input;
}
function identityFrom(input: unknown): BaselineIdentity {
  const i = object(input,['agentId','targetUrl','testedUrl','configuration','runtime','profile'],'baseline identity');
  const r = object(i.runtime,['node','browser','engine','browserDriver'],'baseline runtime');
  const p = object(i.profile,['id','samples','viewport','deviceScaleFactor','locale','timezoneId','sharedWorkers'],'baseline profile');
  const viewport = object(p.viewport,['width','height'],'baseline viewport');
  if (p.samples !== 3 && p.samples !== 4 && p.samples !== 5) throw new Error('Invalid baseline samples');
  return {
    agentId:choice(i.agentId,AGENT_IDS,'baseline agent ID'),
    targetUrl:parsePublicTarget(i.targetUrl).href,testedUrl:parsePublicTarget(i.testedUrl).href,
    configuration:jsonObject(i.configuration),
    runtime:{node:string(r.node,'baseline Node version',120),browser:string(r.browser,'baseline browser version',120),engine:string(r.engine,'baseline engine version',120),browserDriver:maybeString(r.browserDriver,'baseline browser driver',120)},
    profile:{id:choice(p.id,['desktop-v1','mobile-v1','mobile-and-desktop-v1'],'baseline profile ID'),samples:p.samples,viewport:{width:positive(viewport.width,'viewport width',8000),height:positive(viewport.height,'viewport height',8000)},deviceScaleFactor:positive(p.deviceScaleFactor,'scale factor',8),locale:string(p.locale,'baseline locale',50),timezoneId:string(p.timezoneId,'baseline time zone',80),sharedWorkers:p.sharedWorkers === undefined ? undefined : choice(p.sharedWorkers,['blocked'],'SharedWorker coverage policy')},
  };
}
function coverageFrom(input: unknown): CoverageEntry {
  const c = object(input,['id','scope','subject','status','reason','data'],'coverage');
  return {id:string(c.id,'coverage ID',120),scope:scoped(c.scope),subject:string(c.subject,'coverage subject',180),status:choice(c.status,['complete','incomplete','not-configured','unavailable'],'coverage status'),reason:maybeString(c.reason,'coverage reason'),data:c.data === undefined ? undefined : jsonObject(c.data)};
}
function evidenceFrom(input: unknown, agentId: AgentId): Evidence {
  const e = object(input,['id','agentId','kind','scope','summary','source','key','data','artifactIds'],'evidence');
  if (e.agentId !== agentId) throw new Error('Invalid evidence agent ID');
  const p = object(e.source,['kind','name','reference','observedAt'],'evidence provenance');
  const evidence = createEvidence({
    agentId,kind:string(e.kind,'evidence kind',120),scope:scoped(e.scope),summary:string(e.summary,'evidence summary',4000),
    source:{kind:choice(p.kind,['measured','supplied'],'evidence provenance kind'),name:string(p.name,'evidence source',150),reference:maybeString(p.reference,'evidence reference'),observedAt:maybeString(p.observedAt,'evidence observation time',50)},
    key:maybeString(e.key,'evidence key'),data:e.data === undefined ? undefined : jsonValue(e.data),
    artifactIds:e.artifactIds === undefined ? undefined : list(e.artifactIds,'evidence artifact IDs',60).map((v) => matchingId(v,/^art_[a-f0-9]{24}$/,'artifact ID')),
  });
  if (evidence.id !== e.id) throw new Error('Invalid evidence ID');
  return evidence;
}
function findingFrom(input: unknown, agentId: AgentId): Finding {
  const f = object(input,['id','agentId','rule','scope','title','summary','severity','disposition','evidenceIds','coverageIds','key','investigate','correct','recheck','ownerPriority'],'finding');
  if (f.agentId !== agentId) throw new Error('Invalid finding agent ID');
  const finding = createFinding({
    agentId,rule:string(f.rule,'finding rule',180),scope:scoped(f.scope),title:string(f.title,'finding title',300),summary:string(f.summary,'finding summary',4000),
    severity:choice(f.severity,PRIORITIES,'finding severity'),
    disposition:choice(f.disposition,['finding','review-needed','intentional','observation'],'finding disposition'),
    evidenceIds:list(f.evidenceIds,'finding evidence IDs',200).map((v) => matchingId(v,EVIDENCE_ID,'evidence ID')),
    coverageIds:list(f.coverageIds,'finding coverage IDs',80).map((v) => string(v,'coverage ID',120)),
    key:maybeString(f.key,'finding key'),investigate:maybeString(f.investigate,'investigation'),correct:maybeString(f.correct,'correction'),recheck:maybeString(f.recheck,'recheck'),ownerPriority:f.ownerPriority === undefined ? undefined : choice(f.ownerPriority,PRIORITIES,'owner priority'),
  });
  if (finding.id !== matchingId(f.id,FINDING_ID,'finding ID')) throw new Error('Invalid finding ID');
  return finding;
}
function indexUnique<T extends {id: string}>(items: T[], label: string): Map<string,T> {
  const indexed = new Map(items.map((i) => [i.id,i]));
  if (indexed.size !== items.length) throw new Error(`Duplicate ${label} ID`);
  return indexed;
}

export function parseBaseline(input: unknown): PortableBaseline {
  const root = object(boundedJson(input,BASELINE_MAX_BYTES,'Baseline'),undefined,'baseline JSON');
  const b = object(root.baseline === undefined ? root : root.baseline,['schemaVersion','identity','coverage','evidence','findings','measurements'],'portable baseline');
  if (b.schemaVersion !== 1) throw new Error('Unsupported baseline schema version');
  const identity = identityFrom(b.identity);
  const coverage = list(b.coverage,'baseline coverage',600).map(coverageFrom);
  const evidence = list(b.evidence,'baseline evidence',4000).map((e) => evidenceFrom(e,identity.agentId));
  const findings = list(b.findings,'baseline findings',2500).map((f) => findingFrom(f,identity.agentId));
  const evidenceIds = indexUnique(evidence,'evidence');
  const coverageIds = indexUnique(coverage,'coverage');
  indexUnique(findings,'finding');
  for (const f of findings) {
    if (!f.evidenceIds.length || f.evidenceIds.some((id) => !evidenceIds.has(id))) throw new Error('Finding references missing baseline evidence');
    if (f.coverageIds.some((id) => !coverageIds.has(id))) throw new Error('Finding references missing baseline coverage');
  }
  return {schemaVersion:1,identity,coverage,evidence,findings,measurements:b.measurements === undefined ? undefined : jsonObject(b.measurements)};
}

export function baselineCompatibility(current: BaselineIdentity, previous: BaselineIdentity): string[] {
  const reasons: string[] = [];
  if (current.agentId !== previous.agentId) reasons.push('Agent differs');
  if (current.targetUrl !== previous.targetUrl || current.testedUrl !== previous.testedUrl) reasons.push('Submitted or tested URL differs');
  if (canonicalJson(current.configuration) !== canonicalJson(previous.configuration)) reasons.push('Configured collection scope differs');
  if (canonicalJson(current.runtime) !== canonicalJson(previous.runtime)) reasons.push('Node, browser, driver, or engine version differs');
  if (canonicalJson(current.profile) !== canonicalJson(previous.profile)) reasons.push('Sampling profile differs');
  if ([current.runtime.browser,current.runtime.engine].some((v) => !v || /^(?:unknown|unavailable)$/i.test(v))) reasons.push('Browser or engine version unavailable');
  return reasons;
}

function measuredFindings(result: { findings: Finding[]; evidence: Evidence[] }): Finding[] {
  const sources = indexUnique(result.evidence,'comparison evidence');
  return result.findings.filter((finding) => finding.disposition === 'finding' && finding.evidenceIds.some((id) => {
    const source = sources.get(id);
    return source?.agentId === finding.agentId && source.source.kind === 'measured';
  }));
}

function coversFinding(scope: Scope, finding: Scope): boolean {
  if (scope.page !== finding.page) return false;
  return (['state','element','component'] as const).every((key) => scope[key] === undefined || scope[key] === finding[key]);
}

export function compareFindings(identity: BaselineIdentity, current: CollectorResult, baseline?: PortableBaseline): Comparison {
  if (!baseline) return {status:'first-run',reasons:[],findings:[]};
  const reasons = baselineCompatibility(identity,baseline.identity);
  if (reasons.length) return {status:'incompatible',reasons,findings:[]};
  const prior = indexUnique(measuredFindings(baseline),'prior finding');
  const present = indexUnique(measuredFindings(current),'current finding');
  const priorCoverage = indexUnique(baseline.coverage,'prior coverage');
  const presentCoverage = indexUnique(current.coverage,'current coverage');
  const findings = [...new Set([...prior.keys(),...present.keys()])].sort().map((id): FindingChange => {
    const before = prior.get(id);
    const after = present.get(id);
    if (before && after) return {id,status:'persistent',before,after};
    const finding = (before ?? after)!;
    const covered = finding.coverageIds.length > 0 && finding.coverageIds.every((key) => {
      const old = priorCoverage.get(key);
      const now = presentCoverage.get(key);
      return old?.status === 'complete' && now?.status === 'complete' && old.subject === now.subject &&
        coversFinding(old.scope,finding.scope) && canonicalJson(old.scope) === canonicalJson(now.scope);
    });
    if (!covered) return {id,status:'inconclusive',before,after,reason:'Equivalent coverage was not complete in both runs'};
    return {id,status:before ? 'resolved' : 'new',before,after};
  });
  return {status:'compatible',reasons:[],findings};
}
