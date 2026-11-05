import { isIP } from 'node:net';
import { parseBaseline } from './baseline.js';
import { AGENT_IDS, KEYBOARD_KEYS } from './types.js';
import type {
  AgentId, DeclaredProfile, IndexIntent, StateConfig, StateStep, SuppliedData, SuppliedSource, ValidatedRequest,
} from './types.js';

export const INPUT_LIMITS = { requestBytes: 3_000_000, urlChars: 2048, pages: 8, performancePages: 3, states: 12, stepsPerState: 16, totalSteps: 64 } as const;
const INTERNAL_SUFFIXES = ['localhost','local','internal','localdomain','home','lan','test','invalid','example','onion','arpa','alt','corp'];
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const PRIORITIES = ['critical','high','medium','low','info'] as const;

export function boundedJson(value: unknown, limit: number, subject: string): unknown {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof encoded !== 'string') throw new Error(`Invalid ${subject} JSON`);
  if (Buffer.byteLength(encoded) > limit) throw new Error(`${subject} exceeds the size limit`);
  try { return JSON.parse(encoded) as unknown; } catch { throw new Error(`Invalid ${subject} JSON`); }
}
export function object(value: unknown, keys?: readonly string[], subject = 'object'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${subject}`);
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some((key) => !keys.includes(key))) throw new Error(`Unexpected ${subject} field`);
  return result;
}
export function string(value: unknown, name: string, limit = 1000, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > limit || value.includes('\0')) throw new Error(`Invalid ${name}`);
  return value;
}
export function choice<const T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`Invalid ${name}`);
  return value as T[number];
}
export function list(value: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${name}: limit ${max}`);
  return value as unknown[];
}
const optionalText = (value: unknown, name: string, length: number) => value === undefined ? undefined : string(value, name, length);
const optionalList = (value: unknown, name: string, max: number) => value === undefined ? [] : list(value, name, max);
function token(value: unknown, name: string): string {
  const checked = string(value, name, 80);
  if (!TOKEN.test(checked)) throw new Error(`Invalid ${name}`);
  return checked;
}
function unique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${name}`);
}

export function assertPublicHostname(hostname: string): void {
  const host = hostname.toLowerCase();
  const labels = host.split('.');
  if (isIP(host.replace(/^\[|\]$/g,'')) || host.length > 253 || labels.length < 2 ||
      INTERNAL_SUFFIXES.includes(labels.at(-1) ?? '') ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('URL hostname must be a public DNS name');
  }
}

export function parsePublicTarget(raw: unknown): URL {
  const value = string(raw, 'target URL', INPUT_LIMITS.urlChars);
  if (!/^https:\/\/[^/@?#:\s\\]+(?:[/?#][^\u0000-\u0020\u007f\\]*)?$/i.test(value)) {
    throw new Error('Target URL must be HTTPS with no credentials or explicit port');
  }
  const url = new URL(value);
  assertPublicHostname(url.hostname);
  if (url.href.length > INPUT_LIMITS.urlChars) throw new Error('Canonical URL exceeds the length limit');
  return url;
}

export function parsePublicResource(raw: string, base?: URL): URL {
  if (raw.length > INPUT_LIMITS.urlChars || /[\u0000-\u0020\u007f\\]/.test(raw)) throw new Error('Invalid resource URL');
  const authority = /^(?:[a-z][a-z\d+.-]*:)?\/\/([^/?#]*)/i.exec(raw)?.[1];
  if (authority && (authority.includes('@') || authority.includes(':'))) throw new Error('Resource URL authority cannot have credentials, an IP literal, or a port');
  const url = new URL(raw, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Invalid HTTP(S) resource URL');
  assertPublicHostname(url.hostname);
  if (url.href.length > INPUT_LIMITS.urlChars) throw new Error('Canonical URL exceeds the length limit');
  return url;
}

function configuredUrl(value: unknown, target: URL): string {
  const raw = string(value, 'page URL', INPUT_LIMITS.urlChars);
  if (raw.startsWith('//') || /[\u0000-\u0020\u007f\\]/.test(raw)) throw new Error('Invalid configured page URL');
  const url = /^[a-z][a-z\d+.-]*:/i.test(raw) ? parsePublicTarget(raw) : parsePublicTarget(new URL(raw, target.origin).href);
  if (url.origin !== target.origin) throw new Error('Configured page must stay on the target origin');
  return url.href;
}
function profile(input: unknown, agentId: AgentId): DeclaredProfile {
  const p = input === undefined ? {} : object(input, ['id','samples'], 'profile');
  if (p.id !== undefined) choice(p.id, ['desktop-v1'], 'profile ID');
  const samples = p.samples ?? 3;
  if (samples !== 3 && samples !== 4 && samples !== 5) throw new Error('Performance samples must be 3, 4 or 5');
  if (agentId !== 'performance' && p.samples !== undefined) throw new Error('Only performance accepts a samples option');
  return { id:'desktop-v1', samples, viewport:{width:1365,height:768}, deviceScaleFactor:1, locale:'en-US', timezoneId:'UTC', sharedWorkers:'blocked' };
}
function step(value: unknown): StateStep {
  const s = object(value, ['action','selector','name','equals','key'], 'state action');
  const action = choice(s.action, ['focus','assert-focus','assert-visible','assert-hidden','assert-attribute','key'], 'state action');
  if (action === 'key') {
    object(s, ['action','key'], 'key action');
    return {action,key:choice(s.key, KEYBOARD_KEYS, 'keyboard key')};
  }
  const selector = string(s.selector,'selector',240);
  if (action === 'assert-attribute') {
    object(s, ['action','selector','name','equals'], 'attribute assertion');
    return {action,selector,name:token(s.name,'attribute name'),equals:string(s.equals,'attribute value',240,true)};
  }
  object(s, ['action','selector'], 'selector action');
  return {action,selector};
}
function suppliedSource(value: unknown): SuppliedSource {
  const s = object(value, ['name','reference','start','end'], 'supplied provenance');
  const start = string(s.start,'provenance start',35);
  const end = string(s.end,'provenance end',35);
  const date = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;
  if (!date.test(start) || !date.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) > Date.parse(end)) {
    throw new Error('Invalid supplied provenance window');
  }
  return {name:string(s.name,'provenance name',150),reference:optionalText(s.reference,'provenance reference',400),start,end};
}
function supplied(input: unknown, page: (value: unknown) => string): SuppliedData {
  const s = object(input, ['searchConsole','humanReviews','fieldMeasurements','interactions'], 'supplied data');
  const metric = (m: Record<string, unknown>) => {
    if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value < 0) throw new Error('Invalid supplied metric value');
    return {page:page(m.page),metric:string(m.metric,'metric',80),value:m.value,unit:string(m.unit,'unit',50),source:suppliedSource(m.source)};
  };
  return {
    searchConsole: s.searchConsole === undefined ? undefined : list(s.searchConsole,'Search Console records',24).map((v) => {
      const r = object(v,['page','observation','source','coverage'],'Search Console record');
      return {page:page(r.page),observation:string(r.observation,'observation',800),coverage:string(r.coverage,'coverage',400),source:suppliedSource(r.source)};
    }),
    humanReviews: s.humanReviews === undefined ? undefined : list(s.humanReviews,'human reviews',24).map((v) => {
      const r = object(v,['page','state','method','result','source','tool'],'human review');
      return {page:page(r.page),state:r.state === undefined ? undefined : token(r.state,'state ID'),method:choice(r.method,['keyboard','screen-reader'],'review method'),result:string(r.result,'review result',800),tool:optionalText(r.tool,'review tool',120),source:suppliedSource(r.source)};
    }),
    fieldMeasurements: s.fieldMeasurements === undefined ? undefined : list(s.fieldMeasurements,'field measurements',24).map((v) => {
      const r = object(v,['page','metric','value','unit','source','population'],'field measurement');
      return {...metric(r),population:string(r.population,'population',240)};
    }),
    interactions: s.interactions === undefined ? undefined : list(s.interactions,'interaction evidence',24).map((v) => {
      const r = object(v,['page','metric','value','unit','source','scenario'],'interaction evidence');
      return {...metric(r),scenario:string(r.scenario,'scenario',240)};
    }),
  };
}

export function validateRequest(input: unknown): ValidatedRequest {
  const r = object(boundedJson(input, INPUT_LIMITS.requestBytes, 'Request'), ['agentId','targetUrl','pages','states','components','ownerPriorities','indexIntent','release','profile','supplied','baseline'], 'request');
  const agentId = choice(r.agentId, AGENT_IDS, 'agent ID');
  const target = parsePublicTarget(r.targetUrl);
  const maxPages = agentId === 'performance' ? INPUT_LIMITS.performancePages : INPUT_LIMITS.pages;
  const extras = optionalList(r.pages, 'configured pages', maxPages).map((entry) => {
    if (typeof entry === 'string') return {url:configuredUrl(entry,target)};
    const p = object(entry,['url','label'],'page');
    return {url:configuredUrl(p.url,target),label:optionalText(p.label,'page label',100)};
  });
  unique(extras.map((p) => p.url), 'configured page');
  const pages = extras.some((p) => p.url === target.href)
    ? [extras.find((p) => p.url === target.href)!, ...extras.filter((p) => p.url !== target.href)]
    : [{url:target.href}, ...extras];
  if (pages.length > maxPages) throw new Error(`Configured pages exceed limit ${maxPages}`);
  const pageInScope = (raw: unknown) => {
    const page = configuredUrl(raw, target);
    if (!pages.some((p) => p.url === page)) throw new Error('Evidence or state page must be a configured page');
    return page;
  };
  const states: StateConfig[] = optionalList(r.states,'states',INPUT_LIMITS.states).map((v) => {
    const s = object(v,['id','page','steps','label'],'state');
    const id = token(s.id,'state ID');
    if (id === 'initial') throw new Error('The initial state ID is reserved');
    return {id,page:pageInScope(s.page),steps:list(s.steps,'state steps',INPUT_LIMITS.stepsPerState).map(step),label:optionalText(s.label,'state label',100)};
  });
  unique(states.map((s) => s.page + '\n' + s.id), 'state per page');
  if (states.reduce((total,s) => total+s.steps.length,0) > INPUT_LIMITS.totalSteps) throw new Error('Total state steps exceed limit');
  const components = optionalList(r.components,'components',24).map((v) => {
    const c = object(v,['id','selector','label'],'component');
    return {id:token(c.id,'component ID'),selector:string(c.selector,'selector',240),label:optionalText(c.label,'component label',100)};
  });
  unique(components.map((c) => c.id),'component ID');
  const ownerPriorities = optionalList(r.ownerPriorities,'owner priorities',30).map((v) => {
    const p = object(v,['rule','priority'],'owner priority');
    return {rule:string(p.rule,'owner rule',120),priority:choice(p.priority,PRIORITIES,'owner priority')};
  });
  unique(ownerPriorities.map((p) => p.rule),'owner priority rule');
  const indexIntent: IndexIntent[] = optionalList(r.indexIntent,'index intent',maxPages).map((v) => {
    const i = object(v,['page','intended','note'],'index intent');
    return {page:pageInScope(i.page),intended:choice(i.intended,['indexable','excluded'],'index intent'),note:optionalText(i.note,'index intent note',400)};
  });
  unique(indexIntent.map((i) => i.page),'index intent page');
  const release = r.release === undefined ? undefined : object(r.release,['label','revision','template','notes'],'release');
  return {
    agentId,targetUrl:target.href,pages,states,components,ownerPriorities,indexIntent,profile:profile(r.profile,agentId),
    release:release ? {label:string(release.label,'release label',150),revision:optionalText(release.revision,'release revision',150),template:optionalText(release.template,'release template',150),notes:optionalText(release.notes,'release notes',600)} : undefined,
    supplied:r.supplied === undefined ? undefined : supplied(r.supplied,pageInScope),
    baseline:r.baseline === undefined ? undefined : parseBaseline(r.baseline),
  };
}
