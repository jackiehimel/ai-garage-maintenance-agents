export const AGENT_IDS = ['seo-ai-search', 'accessibility', 'performance'] as const;
export type AgentId = typeof AGENT_IDS[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface PageConfig { url: string; label?: string }
export const KEYBOARD_KEYS = ['Tab', 'Shift+Tab', 'Escape', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] as const;
export type KeyboardKey = typeof KEYBOARD_KEYS[number];
export type StateStep =
  | { action: 'focus' | 'assert-focus' | 'assert-visible' | 'assert-hidden'; selector: string }
  | { action: 'key'; key: KeyboardKey }
  | { action: 'assert-attribute'; selector: string; name: string; equals: string };
export interface StateConfig { id: string; page: string; steps: StateStep[]; label?: string }
export interface ComponentConfig { id: string; selector: string; label?: string }
export interface IndexIntent { page: string; intended: 'indexable' | 'excluded'; note?: string }
export interface ReleaseContext { label: string; revision?: string; template?: string; notes?: string }
export interface DeclaredProfile {
  id: 'desktop-v1';
  samples: 3 | 4 | 5;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  // Legacy portable baselines may omit this browser coverage restriction.
  sharedWorkers?: 'blocked';
}
export interface SuppliedSource { name: string; reference?: string; start: string; end: string }
export interface SuppliedSearchRecord {
  page: string; observation: string; source: SuppliedSource; coverage: string;
}
export interface SuppliedHumanReview {
  page: string; state?: string; method: 'keyboard' | 'screen-reader'; result: string;
  source: SuppliedSource; tool?: string;
}
export interface SuppliedFieldMeasurement {
  page: string; metric: string; value: number; unit: string; population: string; source: SuppliedSource;
}
export interface SuppliedInteraction {
  page: string; scenario: string; metric: string; value: number; unit: string; source: SuppliedSource;
}
export interface SuppliedData {
  searchConsole?: SuppliedSearchRecord[];
  humanReviews?: SuppliedHumanReview[];
  fieldMeasurements?: SuppliedFieldMeasurement[];
  interactions?: SuppliedInteraction[];
}
export interface AgentRequest {
  agentId: AgentId; targetUrl: string;
  pages?: Array<string | PageConfig>;
  states?: StateConfig[];
  components?: ComponentConfig[];
  ownerPriorities?: { rule: string; priority: Priority }[];
  indexIntent?: IndexIntent[];
  release?: ReleaseContext;
  profile?: { id?: 'desktop-v1'; samples?: 3 | 4 | 5 };
  supplied?: SuppliedData;
  baseline?: PortableBaseline | string;
}
export interface ValidatedRequest extends Omit<AgentRequest, 'pages' | 'states' | 'components' | 'ownerPriorities' | 'indexIntent' | 'profile' | 'baseline'> {
  pages: PageConfig[]; states: StateConfig[]; components: ComponentConfig[];
  ownerPriorities: { rule: string; priority: Priority }[];
  indexIntent: IndexIntent[]; profile: DeclaredProfile; baseline?: PortableBaseline;
}
export interface RuntimeVersions { node: string; browser: string; engine: string; browserDriver?: string }
export interface Scope { page: string; state?: string; element?: string; component?: string }
export type CollectionStatus = 'complete' | 'partial' | 'failed';
export type CoverageStatus = 'complete' | 'incomplete' | 'not-configured' | 'unavailable';
export interface CoverageEntry { id: string; scope: Scope; subject: string; status: CoverageStatus; reason?: string; data?: JsonObject }
export interface Provenance { kind: 'measured' | 'supplied'; name: string; reference?: string; observedAt?: string }
export interface Evidence {
  id: string; agentId: AgentId; kind: string; scope: Scope; summary: string; source: Provenance;
  key?: string; data?: JsonValue; artifactIds?: string[];
}
export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface Finding {
  id: string; agentId: AgentId; rule: string; scope: Scope; title: string; summary: string;
  severity: Priority; disposition: 'finding' | 'review-needed' | 'intentional' | 'observation';
  evidenceIds: string[]; coverageIds: string[]; key?: string;
  investigate?: string; correct?: string; recheck?: string; ownerPriority?: Priority;
}
export interface RawArtifact {
  label: string; mediaType: string; bytes: string | Uint8Array; scope?: Scope; id?: string;
}
export interface ArtifactDescriptor {
  id: string; label: string; mediaType: string; byteLength: number; scope?: Scope;
}
export interface CollectorResult {
  testedUrl: string; runtime: RuntimeVersions;
  coverage: CoverageEntry[]; evidence: Evidence[]; findings: Finding[]; artifacts: RawArtifact[];
  measurements?: JsonObject; diagnostics?: string[];
}
export interface CollectorOptions { executablePath?: string; signal?: AbortSignal }
export interface BaselineIdentity {
  agentId: AgentId; targetUrl: string; testedUrl: string;
  configuration: JsonObject; runtime: RuntimeVersions; profile: DeclaredProfile;
}
export interface PortableBaseline {
  schemaVersion: 1; identity: BaselineIdentity;
  coverage: CoverageEntry[]; evidence: Evidence[]; findings: Finding[]; measurements?: JsonObject;
}
export type BaselineExport =
  | { status: 'available'; baseline: PortableBaseline }
  | { status: 'unavailable'; reason: string };
export interface FindingChange {
  id: string; status: 'new' | 'persistent' | 'resolved' | 'inconclusive';
  before?: Finding; after?: Finding; reason?: string;
}
export interface MetricChange {
  page: string; metric: string; status: 'improved' | 'regressed' | 'unchanged' | 'inconclusive';
  unit: string; before?: number; after?: number; delta?: number; threshold?: number;
  beforeSpread?: number; afterSpread?: number; reason?: string;
}
export interface Comparison {
  status: 'first-run' | 'compatible' | 'incompatible'; reasons: string[]; findings: FindingChange[];
  metrics?: MetricChange[];
}
export interface AssessmentAction {
  title: string; rationale: string; priority: Priority; steps: string[]; evidenceIds: string[];
}
export type Assessment =
  | { status: 'available'; model: string; usage?: {inputTokens: number; outputTokens: number}; summary: string; actions: AssessmentAction[]; sentEvidenceIds: string[]; truncated: boolean }
  | { status: 'unavailable'; reason: string; model?: string; sentEvidenceIds?: string[]; truncated?: boolean };
export type Retention = { status: 'saved' | 'export-only' | 'failed'; reason?: string };
interface AgentReportFields {
  schemaVersion: 1; runId: string; agentId: AgentId; submittedUrl: string; testedUrl: string;
  startedAt: string; completedAt: string; runtime: RuntimeVersions; collectionStatus: CollectionStatus;
  configuration: Omit<ValidatedRequest, 'baseline'>;
  evidence: Evidence[]; findings: Finding[]; coverage: CoverageEntry[];
  measurements?: JsonObject; diagnostics?: string[]; artifacts: ArtifactDescriptor[];
  comparison: Comparison; assessment: Assessment; retention: Retention;
}

export type AgentReport = AgentReportFields & (
  | { baseline: PortableBaseline; baselineUnavailableReason?: never }
  | { baseline?: never; baselineUnavailableReason: string }
);
