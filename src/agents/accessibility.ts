import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults, NodeResult, Result } from 'axe-core';
import type { Page, Request } from 'playwright';
import { collectKeyboardProbe, KEYBOARD_SAMPLE_LIMIT } from './accessibility-probe.js';
import type { KeyboardProbe } from './accessibility-probe.js';
import { openBrowserSession } from '../core/browser.js';
import type { BrowserSession } from '../core/browser.js';
import { canonicalJson, createEvidence, createFinding } from '../core/evidence.js';
import { parsePublicTarget } from '../core/input.js';
import { abortable, deadlineSignal } from '../core/network.js';
import { createArtifactId } from '../core/store.js';
import type {
  CollectorOptions, CollectorResult, ComponentConfig, CoverageEntry, JsonObject, JsonValue, Priority,
  RuntimeVersions, Scope, StateConfig, StateStep, ValidatedRequest,
} from '../core/types.js';

const AGENT = 'accessibility';
const AXE = 'axe-core via @axe-core/playwright';
const KEYBOARD = 'Playwright scripted keyboard path';
const DOCUMENT = 'Protected Playwright browser';
const AUTOMATION_LIMIT = 'Automated results do not establish WCAG conformance or completion of human keyboard or screen-reader evaluation.';
const MAX_ARTIFACT_BYTES = 15_000_000;
const MAX_ARTIFACTS_BYTES = 90_000_000;
const MAX_STRUCTURED_INSTANCES = 850;
const STATE_DEADLINE_MS = 28_000;
const ASSERTION_TIMEOUT_MS = 900;
const PAGE_LOAD_TIMEOUT_MS = 4_500;

type ScanScope = Scope & {state:string};
type Focus = { tag:string; selector:string; role?:string; inShadow?:boolean; frameBoundary?:boolean };
type StepStatus = 'passed' | 'failed' | 'not-run';
interface KeyboardObservation {
  index:number;
  step:StateStep;
  status:StepStatus;
  focusBefore?:Focus | null;
  focusAfter?:Focus | null;
  actual?:JsonValue;
  selectorMatches?:number;
  evaluated?:boolean;
  reason?:string;
}
interface ComponentSnapshot {
  counts:Record<string,number | null>;
  mappings:Array<{target:NodeResult['target'];componentIds:string[]}>;
  limitations?:string[];
}
export interface AccessibilityScan {
  scope:ScanScope;
  navigation:{status:'complete' | 'incomplete' | 'unavailable';testedUrl?:string;httpStatus?:number;reason?:string};
  readiness?:{status:'complete' | 'incomplete';reason?:string;data?:JsonObject};
  keyboard?:{status:'complete' | 'incomplete';steps:KeyboardObservation[];reason?:string};
  keyboardProbe?:KeyboardProbe;
  axe?:AxeResults;
  axeReason?:string;
  components?:ComponentSnapshot;
}

const hash = (value:unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0,24);
const coverageId = (scope:ScanScope,subject:string) => 'a11y:' + hash({scope,subject});
const clean = (value:string,max:number) => value.replaceAll('\0','�').slice(0,max);
const note = (error:unknown) => clean(error instanceof Error ? error.message : String(error),500);
const safeText = (value:string | undefined,max:number,fallback:string) => clean(value ?? '',max).trim() || fallback;

function scopeEntries(request:ValidatedRequest): Array<{scope:ScanScope;state?:StateConfig}> {
  return request.pages.flatMap(({url:page}) => [
    {scope:{page,state:'initial'}},
    ...request.states.filter((state) => state.page === page).map((state) => ({scope:{page,state:state.id},state})),
  ]);
}

function criterion(tag:string):string | undefined {
  const match = /^wcag([1-4])(\d)(\d{1,2})$/.exec(tag);
  return match ? [match[1],match[2],match[3]].join('.') : undefined;
}

function severity(impact:NodeResult['impact'],manual:boolean):Priority {
  if (manual) return 'info';
  switch (impact) {
    case 'critical': return 'critical';
    case 'serious': return 'high';
    case 'moderate': return 'medium';
    case 'minor': return 'low';
    default: return 'info';
  }
}

function elementIdentity(target:NodeResult['target']):string {
  const value = clean(target.length === 1 && typeof target[0] === 'string' ? target[0] : canonicalJson(target),50_000);
  return value.length <= 2000 ? (value || '(document)') : value.slice(0,1960) + '… [' + hash(target) + ']';
}

function boundedCheckData(value:unknown,depth=0):JsonValue {
  if (value == null) return null;
  if (typeof value === 'string') return clean(value,700);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 3) return '[additional context retained in raw axe JSON]';
  if (Array.isArray(value)) return value.slice(0,6).map(item => boundedCheckData(item,depth+1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0,8).map(([key,item]) => [clean(key,100),boundedCheckData(item,depth+1)]));
  return null;
}
function observedChecks(node:NodeResult):JsonObject {
  return Object.fromEntries((['any','all','none'] as const).map((kind) => [kind,node[kind].slice(0,6).map((check) => ({
    id:clean(check.id,120),message:clean(check.message,700),data:boundedCheckData(check.data),
    relatedNodes:(check.relatedNodes ?? []).slice(0,4).map(related => ({target:boundedCheckData(related.target),html:clean(related.html,500)})),
  }))]));
}
function reviewAction(rule:Result,node:NodeResult|undefined,summary:string):string {
  const reasons=node ? [...node.any,...node.all,...node.none].map(check => check.message).filter(Boolean).slice(0,6).join(' ') : summary;
  const recorded='Recorded reason: '+clean(reasons || summary,1200)+' ';
  if(rule.id === 'color-contrast') return recorded+'Use the recorded cause and related-node context to identify the affected layers. Measure the actual displayed foreground and background across the affected text and states; record the measured ratio and applicable text-size threshold. The scanner did not supply a determinate ratio.';
  if(rule.id === 'video-caption') return recorded+'Inspect whether the video contains speech or meaningful audio, then review caption accuracy, completeness and synchronization. A captions track alone does not establish a pass or failure.';
  return recorded+'Inspect this instance using the recorded check data, related nodes and linked rule guidance: '+clean(rule.helpUrl,500);
}

function recheckState(scope:ScanScope):string {
  return scope.state === 'initial' ? 'the initial page' : 'the configured ' + scope.state + ' state';
}

function remediation(rule:Result):{investigate:string;correct:string} {
  switch (rule.id) {
    case 'button-name':
    case 'link-name':
    case 'aria-command-name':
      return {investigate:'Inspect the control and its computed accessible name in the browser accessibility tree.',
        correct:'Give the control a concise, descriptive accessible name, using its visible text when possible.'};
    case 'label':
      return {investigate:'Inspect the input, label association, and computed accessible name.',
        correct:'Associate a persistent descriptive label with the form control; use native label markup when possible.'};
    case 'image-alt':
      return {investigate:'Determine whether the image provides information, serves a function, or is decorative.',
        correct:'Supply appropriate alternative text for meaningful images and an empty alt attribute for decorative images.'};
    case 'color-contrast':
      return {investigate:'Measure the computed foreground and background across the affected states and themes.',
        correct:'Adjust the foreground or background to meet the contrast criterion applicable to the text size.'};
    default:
      return {investigate:'Inspect the affected selector, the recorded axe checks, and the linked rule guidance.',
        correct:'Apply the relevant technique from the linked rule guidance to the affected instance.'};
  }
}

function dataObject(data:JsonValue | undefined):JsonObject | undefined {
  return data && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
}

/** Qualify comparison coverage in place, including results from a remote runner without the baseline. */
export function applyAccessibilityComparisonCoverage(request:ValidatedRequest,result:CollectorResult):CollectorResult {
  const baseline = request.baseline;
  if (!baseline || baseline.identity.agentId !== AGENT) return result;
  for (const entry of result.coverage) {
    if (entry.subject !== 'axe-core scan' || entry.status !== 'complete') continue;
    const inScope = (item:{scope:Scope}) => item.scope.page === entry.scope.page && item.scope.state === entry.scope.state;
    const prior = baseline.evidence.filter(inScope);
    const current = result.evidence.filter(inScope);
    const priorUrl = dataObject(prior.find((item) => item.kind === 'navigation')?.data)?.testedUrl;
    const currentUrl = dataObject(current.find((item) => item.kind === 'navigation')?.data)?.testedUrl;
    const summary = dataObject(current.find((item) => item.kind === 'axe-summary')?.data);
    const outcomes = new Set(['violations','passes','inapplicable','incomplete'].flatMap((key) =>
      Array.isArray(summary?.[key]) ? summary[key] : []));
    const ruleOf = (item:{key?:string;data?:JsonValue}) => dataObject(item.data)?.rule ?? item.key?.split('#',1)[0];
    const sameElement = (before:Scope,after:Scope) => !before.element || !after.element || before.element === after.element;
    let reason:string | undefined;
    if (typeof priorUrl === 'string' && priorUrl !== currentUrl) {
      reason = 'The page navigated to a different final URL than the baseline.';
    } else {
      for (const item of prior.filter((evidence) => evidence.kind === 'axe-violation')) {
        const rule = ruleOf(item);
        if (typeof rule !== 'string') continue;
        if (!outcomes.has(rule)) { reason = 'A rule that produced a baseline violation was not reported by axe: ' + rule + '.'; break; }
        if (current.some((evidence) => evidence.kind === 'axe-review' && ruleOf(evidence) === rule &&
          (dataObject(evidence.data)?.ruleError === true || sameElement(item.scope,evidence.scope)))) {
          reason = 'axe marked a baseline violation as requiring manual review: ' + rule + '.';
          break;
        }
        if (current.some((evidence) => evidence.kind === 'axe-violation' && ruleOf(evidence) === rule &&
          evidence.scope.element === item.scope.element && evidence.scope.component !== item.scope.component)) {
          reason = 'A still-violating element changed its configured component mapping: ' + rule + '.';
          break;
        }
      }
      if (!reason) for (const item of prior.filter((evidence) => evidence.kind === 'axe-review')) {
        const rule = ruleOf(item);
        if (typeof rule === 'string' && current.some((evidence) => evidence.kind === 'axe-violation' && ruleOf(evidence) === rule &&
          (dataObject(item.data)?.ruleError === true || sameElement(item.scope,evidence.scope)))) {
          reason = 'A current violation was inconclusive in the baseline: ' + rule + '.';
          break;
        }
      }
    }
    if (reason) { entry.status = 'incomplete'; entry.reason = reason; }
  }
  return result;
}

/** Translate captured browser observations into portable evidence without making a browser claim. */
export function assembleAccessibilityResult(
  request:ValidatedRequest,
  runtime:RuntimeVersions,
  testedUrl:string,
  scans:AccessibilityScan[],
  diagnostics:string[] = [],
):CollectorResult {
  const result:CollectorResult = {testedUrl,runtime,coverage:[],evidence:[],findings:[],artifacts:[],diagnostics:[...diagnostics]};
  const owner = new Map(request.ownerPriorities.map(({rule,priority}) => [rule,priority]));
  const providedScans = new Map(scans.map((scan) => [coverageId(scan.scope,'scope'),scan]));
  let retainedBytes = 0;
  let instances = 0;
  for (const {scope,state} of scopeEntries(request)) {
    const scan:AccessibilityScan = providedScans.get(coverageId(scope,'scope')) ??
      {scope,navigation:{status:'unavailable',reason:'This scope was not exercised.'}};
    const cover = (subject:string, status:CoverageEntry['status'], reason?:string, data?:JsonObject) => {
      const id = coverageId(scope,subject);
      result.coverage.push({id,scope,subject,status,reason,data});
      return id;
    };
    const {navigation} = scan;
    const navigationId = cover('Page navigation',navigation.status,navigation.reason,
      navigation.testedUrl ? {testedUrl:navigation.testedUrl,httpStatus:navigation.httpStatus ?? null} : undefined);
    result.evidence.push(createEvidence({
      agentId:AGENT,kind:'navigation',scope,summary:navigation.status === 'complete' ? 'Requested page opened in Chromium.' :
        'Requested page could not be verified: ' + (navigation.reason ?? 'navigation unavailable'),
      source:{kind:'measured',name:DOCUMENT},
      data:{status:navigation.status,testedUrl:navigation.testedUrl ?? null,httpStatus:navigation.httpStatus ?? null,reason:navigation.reason ?? null},
    }));
    const readinessId = cover('Document resource readiness',scan.readiness?.status ?? 'unavailable',
      scan.readiness?.reason ?? (scan.readiness ? undefined : navigation.reason),scan.readiness?.data);

    let pathId:string | undefined;
    if (state) {
      const path = scan.keyboard;
      pathId = cover('Configured keyboard path',path?.status ?? 'unavailable',path?.reason ?? (path ? (!state.steps.length ? 'No interactions were configured; this state represents the page after navigation.' : undefined) : navigation.reason),
        {configuredSteps:state.steps.length,observedSteps:path?.steps.filter(({status}) => status !== 'not-run').length ?? 0});
      for (const [offset,step] of state.steps.entries()) {
        const index = offset+1;
        const observation = path?.steps.find((item) => item.index === index) ??
          {index,step,status:'not-run' as const,reason:path?.reason ?? navigation.reason ?? 'The state was not exercised.'};
        const evidence = createEvidence({
          agentId:AGENT,kind:'keyboard-step',scope:'selector' in step ? {...scope,element:step.selector} : scope,key:String(index),
          summary:'Step ' + index + ' · ' + step.action + ('key' in step ? ' ' + step.key : '') + ' · ' + observation.status,
          source:{kind:'measured',name:KEYBOARD},data:{
            step:{...step},status:observation.status,focusBefore:observation.focusBefore ?? null,focusAfter:observation.focusAfter ?? null,
            actual:observation.actual ?? null,selectorMatches:observation.selectorMatches ?? null,
            evaluated:observation.evaluated ?? observation.status === 'passed',reason:observation.reason ?? null,
          },
        });
        result.evidence.push(evidence);
        if (!step.action.startsWith('assert-')) continue;
        const measured = observation.evaluated ?? (observation.status === 'passed' || 'actual' in observation);
        const assertionId = cover('Keyboard assertion ' + index,measured ? 'complete' : 'unavailable',
          measured ? undefined : observation.reason,{step:index,outcome:observation.status});
        if (measured && observation.status === 'failed') {
          const rule = 'keyboard-' + step.action;
          result.findings.push(createFinding({
            agentId:AGENT,rule,scope:evidence.scope,key:String(index),title:'Configured ' + step.action.slice(7) + ' assertion failed',
            summary:observation.reason ?? 'The recorded browser state did not match the configured expectation.',
            severity:step.action === 'assert-focus' ? 'high' : 'medium',ownerPriority:owner.get(rule),disposition:'finding',
            evidenceIds:[evidence.id],coverageIds:[navigationId,readinessId,assertionId],
            investigate:'Replay the recorded steps and inspect the actual focus, target, or attribute after the assertion.',
            correct:'Verify the intended state, then correct the focus or state management if it differs from that intent.',
            recheck:'Repeat this configured path and confirm the same assertion passes in the browser; review the interaction with a keyboard as appropriate.',
          }));
        }
      }
    }

    if (!state) {
      const probe = scan.keyboardProbe;
      cover('Sampled keyboard navigation',probe?.status ?? 'unavailable',probe?.reason ?? (probe ? undefined : 'No keyboard navigation sample was recorded.'),
        {observedSteps:probe?.steps.length ?? 0,scopeLimit:probe?.scopeLimit ?? KEYBOARD_SAMPLE_LIMIT});
      if (probe) result.evidence.push(createEvidence({agentId:AGENT,kind:'keyboard-probe',scope,
        summary:'Keyboard navigation sample: '+probe.steps.length+' observed focus steps; '+probe.status+'. '+(probe.reason ?? probe.scopeLimit),
        source:{kind:'measured',name:'Protected Playwright Tab-only sample'},data:JSON.parse(JSON.stringify(probe)) as JsonObject}));
    }
    const componentId = cover('Explicit component mapping',
      !request.components.length ? 'not-configured' : scan.components ? (Object.values(scan.components.counts).some((count) => count === null) ? 'incomplete' : 'complete') : 'unavailable',
      !request.components.length ? 'No component selectors were configured.' :
        !scan.components ? 'Component selectors could not be evaluated.' :
        Object.values(scan.components.counts).some((count) => count === null) ? 'One or more component selectors could not be evaluated.' : undefined,
      {components:request.components.map(({id,selector,label}) => ({id,selector,label:label ?? null,matches:scan.components?.counts[id] ?? null})),
        limitations:scan.components?.limitations ?? []});
    const axe = scan.axe;
    if (!axe) {
      cover('axe-core scan','unavailable',scan.axeReason ?? scan.keyboard?.reason ?? navigation.reason ?? 'No axe results were returned.');
      continue;
    }

    const count = [...axe.violations,...axe.incomplete].reduce((n,rule) => n + Math.max(1,rule.nodes.length),0);
    const truncated = instances + count > MAX_STRUCTURED_INSTANCES;
    const raw = JSON.stringify(axe);
    const rawBytes = Buffer.byteLength(raw);
    let rawId:string | undefined;
    if (rawBytes <= MAX_ARTIFACT_BYTES && retainedBytes + rawBytes <= MAX_ARTIFACTS_BYTES) {
      rawId = createArtifactId();
      retainedBytes += rawBytes;
      result.artifacts.push({id:rawId,label:'axe-core raw JSON · ' + scope.state,mediaType:'application/json',bytes:raw,scope});
    }
    const uncertainty = axe.incomplete.some((rule) => rule.id === 'frame-tested') ? 'axe could not verify one or more frames.' : undefined;
    const scanReason = scan.readiness?.reason ?? uncertainty ?? (truncated ? 'Structured finding limit reached; consult the raw axe result for remaining instances.' :
      !rawId ? 'The raw axe result exceeded the artifact retention limits.' : undefined);
    const axeId = cover('axe-core scan',scanReason ? 'incomplete' : 'complete',scanReason,{
      executed:true,violationRules:axe.violations.length,reviewRules:axe.incomplete.length,
      passedRules:axe.passes.length,inapplicableRules:axe.inapplicable.length,rawRetained:!!rawId,
    });
    result.evidence.push(createEvidence({
      agentId:AGENT,kind:'axe-summary',scope,summary:'axe checked ' + recheckState(scope) + '. ' + AUTOMATION_LIMIT,
      source:{kind:'measured',name:AXE,observedAt:axe.timestamp},artifactIds:rawId ? [rawId] : undefined,
      data:{observedUrl:axe.url,violations:axe.violations.map(({id}) => id),incomplete:axe.incomplete.map(({id}) => id),
        passes:axe.passes.map(({id}) => id),inapplicable:axe.inapplicable.map(({id}) => id),
        structuredInstancesOmitted:Math.max(0,instances+count-Math.max(MAX_STRUCTURED_INSTANCES,instances)),
        reviewRemaining:['Verify keyboard order, visible focus, and interaction behavior in the relevant states.',
          'Review accessible names, announcements, reading order, and interaction behavior with representative assistive technology.']},
    }));

    const mappings = new Map(scan.components?.mappings.map(({target,componentIds}) => [canonicalJson(target),componentIds]) ?? []);
    for (const [manual,rules] of [[false,axe.violations],[true,axe.incomplete]] as const) {
      const duplicates = new Map<string,number>();
      for (const rule of rules) {
        const nodes: Array<NodeResult | undefined> = rule.nodes.length ? rule.nodes : [undefined];
        for (const node of nodes) {
          if (instances >= MAX_STRUCTURED_INSTANCES) break;
          instances++;
          const element = node ? elementIdentity(node.target) : undefined;
          const candidates = node ? (mappings.get(canonicalJson(node.target)) ?? []) : [];
          const component = candidates.length === 1 ? candidates[0] : undefined;
          const instanceScope = {...scope,element,component};
          const identity = rule.id + ':' + (element ?? '');
          const occurrence = (duplicates.get(identity) ?? 0) + 1;
          duplicates.set(identity,occurrence);
          const key = occurrence === 1 ? rule.id : rule.id + '#' + occurrence;
          const impact = node?.impact ?? rule.impact;
          const engineError = 'error' in rule ? rule.error as {message?:string} | undefined : undefined;
          const summary = safeText(node?.failureSummary ?? engineError?.message ?? rule.description,850,
            manual ? 'axe did not reach an automatic determination.' : 'axe reported a violation.');
          const evidence = createEvidence({
            agentId:AGENT,kind:manual ? 'axe-review' : 'axe-violation',scope:instanceScope,key,
            summary,source:{kind:'measured',name:AXE,reference:rule.helpUrl || undefined,observedAt:axe.timestamp},
            artifactIds:rawId ? [rawId] : undefined,
            data:{rule:rule.id,ruleError:!!engineError,impact:impact ?? null,tags:rule.tags,criteria:rule.tags.map(criterion).filter((value):value is string => !!value),
              helpUrl:rule.helpUrl,description:clean(rule.description,500),target:node ? JSON.parse(canonicalJson(node.target)) as JsonValue : null,
              html:node ? clean(node.html,500) : null,checks:node ? observedChecks(node) : null,componentCandidates:candidates,
              componentLabel:request.components.find(({id}) => id === component)?.label ?? null},
          });
          result.evidence.push(evidence);
          const guidance = remediation(rule);
          result.findings.push(createFinding({
            agentId:AGENT,rule:rule.id,scope:instanceScope,key:manual ? 'review:' + key : key,
            title:safeText(rule.help,275,rule.id),summary,severity:severity(impact,manual),ownerPriority:owner.get(rule.id),
            disposition:manual ? 'review-needed' : 'finding',evidenceIds:[evidence.id],
            coverageIds:[navigationId,readinessId,...(pathId ? [pathId] : []),axeId,...(component ? [componentId] : [])],
            investigate:manual ? reviewAction(rule,node,summary) : guidance.investigate,
            correct:manual ? 'Change the implementation only after review confirms an accessibility barrier.' : guidance.correct,
            recheck:'Repeat the axe scan in ' + recheckState(scope) + ' and verify the relevant behavior manually.',
          }));
        }
      }
    }
  }

  for (const [index,record] of (request.supplied?.humanReviews ?? []).entries()) {
    result.evidence.push(createEvidence({
      agentId:AGENT,kind:'supplied-human-review',scope:{page:record.page,state:record.state},key:String(index+1),
      summary:record.result,source:{kind:'supplied',name:record.source.name,reference:record.source.reference,observedAt:record.source.end},
      data:{method:record.method,result:record.result,tool:record.tool ?? null,start:record.source.start,end:record.source.end},
    }));
  }
  result.measurements = {
    keyboardProbe:{version:1,scopes:scans.filter(scan => scan.scope.state === 'initial' && scan.keyboardProbe).map(scan => ({page:scan.scope.page,state:scan.scope.state,...JSON.parse(JSON.stringify(scan.keyboardProbe)) as JsonObject}))},
    automationLimit:AUTOMATION_LIMIT,requestedScopes:request.pages.length + request.states.length,
    suppliedHumanReviews:request.supplied?.humanReviews?.length ?? 0,
  };
  return applyAccessibilityComparisonCoverage(request,result);
}

interface ActivationTarget {tag:string;type?:string;role?:string;inForm:boolean;editable:boolean}

/** Only explicit, non-submitting widgets may receive the native activation keys. */
export function activationPermitted(target:ActivationTarget | null):boolean {
  if (!target || target.inForm || target.editable) return false;
  if (target.tag === 'button') return target.type === 'button';
  if (target.tag === 'summary') return true;
  if (['a','area','input','select','textarea','label','iframe','object','embed'].includes(target.tag)) return false;
  return ['button','tab','menuitem','menuitemcheckbox','menuitemradio','checkbox','radio','switch','treeitem','option'].includes(target.role ?? '');
}

interface GuardReading {blocked:number;focus:Focus | null;activationAllowed:boolean}
interface ReadOnlyGuard {read():GuardReading;seal():void}

/** This fixed collector script runs before page scripts; no script text is accepted in configuration. */
function installReadOnlyGuard(key:string, permits:typeof activationPermitted):void {
  let blocked = 0;
  let sealed = false;
  const handlers = {
    deny(event?:Event) {
      blocked++;
      if (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    active():Element | null {
      let target = document.activeElement;
      for (let depth = 0; depth < 12 && target?.shadowRoot?.activeElement; depth++) target = target.shadowRoot.activeElement;
      return target;
    },
    targetInfo(target:EventTarget | null):ActivationTarget | null {
      if (!target || !(target instanceof Element)) return null;
      const tag = target.localName.toLowerCase();
      const control = target as HTMLButtonElement;
      const root = target.getRootNode();
      const shadowHost = root instanceof ShadowRoot ? root.host : null;
      return {tag,type:tag === 'button' ? control.type : undefined,role:target.getAttribute('role')?.toLowerCase(),
        inForm:!!target.closest('form') || !!control.form || !!shadowHost?.closest('form'),
        editable:!!control.isContentEditable || document.designMode.toLowerCase() === 'on'};
    },
    focusLabel(target:Element | null):Focus | null {
      if (!target) return null;
      const path:string[] = [];
      const root = target.getRootNode();
      for (let element:Element | null = target; element && path.length < 8; element = element.parentElement) {
        if (element.id && element.id.length <= 160) { path.unshift('#' + CSS.escape(element.id)); break; }
        let ordinal = 1;
        for (let before = element.previousElementSibling; before; before = before.previousElementSibling) {
          if (before.localName === element.localName) ordinal++;
        }
        path.unshift(element.localName + (element.parentElement ? ':nth-of-type(' + ordinal + ')' : ''));
      }
      const inShadow = root instanceof ShadowRoot;
      const tag = target.localName;
      return {tag,selector:(inShadow ? root.host.localName + ' [shadow] ' : '') + path.join(' > '),
        role:target.getAttribute('role')?.slice(0,120) ?? undefined,inShadow,frameBoundary:tag === 'iframe' || tag === 'frame'};
    },
  };
  // Capture native submissions (including GET) and block form APIs used by custom keyboard handlers.
  window.addEventListener('submit',(event) => handlers.deny(event),true);
  for (const name of ['submit','requestSubmit'] as const) {
    Object.defineProperty(HTMLFormElement.prototype,name,{value() { handlers.deny(); },configurable:false,writable:false});
  }
  for (const name of ['keydown','keypress','keyup'] as const) {
    window.addEventListener(name,(event) => {
      if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
          !permits(handlers.targetInfo(event.composedPath()[0] ?? null))) handlers.deny(event);
    },true);
  }
  // Seal scripted popup, dialog, synthetic click and same-document navigation before sampling.
  const nativeOpen = window.open;
  Object.defineProperty(window,'open',{configurable:false,writable:false,value(...args:Parameters<typeof window.open>) {if(sealed) {handlers.deny();return null;}return nativeOpen.apply(window,args);}});
  for (const name of ['alert','confirm','prompt'] as const) {
    const original=window[name]?.bind(window);
    if (!original) continue;
    Object.defineProperty(window,name,{configurable:false,writable:false,value(...args:unknown[]) {if(sealed) {handlers.deny();return name === 'confirm' ? false : null;}return Reflect.apply(original,window,args);}});
  }
  window.addEventListener('click',event => {if(sealed) handlers.deny(event);},true);
  for (const name of ['pushState','replaceState'] as const) {
    if (typeof history === 'undefined') break;
    const original=history[name].bind(history);
    Object.defineProperty(history,name,{configurable:false,writable:false,value(...args:Parameters<History[typeof name]>) {if(sealed) {handlers.deny();return;}return Reflect.apply(original,history,args);}});
  }
  const navigation=Reflect.get(window,'navigation') as EventTarget|undefined;
  navigation?.addEventListener('navigate',event => {if(sealed && event.cancelable) handlers.deny(event);});
  Object.defineProperty(window,key,{configurable:false,writable:false,value:Object.freeze({
    seal() {sealed=true;},
    read() {
      const target = handlers.active();
      return {blocked,focus:handlers.focusLabel(target),activationAllowed:permits(handlers.targetInfo(target))};
    },
  }) satisfies ReadOnlyGuard});
}

export function publicAccessibilityGuardScript(guardKey:string):string {
  // Both sources are fixed code from this module. The key is serialized as data.
  return '(' + installReadOnlyGuard.toString() + ')(' + JSON.stringify(guardKey) + ',(' + activationPermitted.toString() + '));';
}

async function readGuard(page:Page,key:string):Promise<GuardReading> {
  return page.evaluate((name) => {
    const guard = Reflect.get(window,name) as ReadOnlyGuard | undefined;
    if (!guard) throw new Error('Public read-only guard is unavailable.');
    return guard.read();
  },key);
}

interface SelectorReading {
  count:number;
  invalid?:boolean;
  actual?:boolean | string | null;
}

function inspectSelector(page:Page,step:Exclude<StateStep,{action:'key'}>):Promise<SelectorReading> {
  return page.evaluate((operation):SelectorReading => {
    let matches:NodeListOf<Element>;
    try { matches = document.querySelectorAll(operation.selector); }
    catch { return {count:0,invalid:true}; }
    if (matches.length > 1) return {count:matches.length};
    const element = matches[0];
    if (!element) return {count:0,actual:operation.action === 'assert-attribute' ? null : false};
    if (operation.action === 'focus') {
      const focusable = element as HTMLElement;
      if (typeof focusable.focus === 'function') focusable.focus();
    }
    if (operation.action === 'focus' || operation.action === 'assert-focus') {
      return {count:1,actual:document.activeElement === element};
    }
    if (operation.action === 'assert-attribute') return {count:1,actual:element.getAttribute(operation.name)?.slice(0,500) ?? null};
    const style = getComputedStyle(element);
    const visible = style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
      Array.from(element.getClientRects()).some(({width,height}) => width > 0 && height > 0);
    return {count:1,actual:visible};
  },step);
}

function keyboardActual(step:Exclude<StateStep,{action:'key'}>,reading:SelectorReading):boolean {
  switch (step.action) {
    case 'focus':
    case 'assert-focus':
    case 'assert-visible': return reading.actual === true;
    case 'assert-hidden': return reading.actual === false;
    case 'assert-attribute': return reading.count === 1 && reading.actual === step.equals;
  }
}

async function exerciseKeyboard(
  page:Page,state:StateConfig,guardKey:string,signal:AbortSignal,getBlockedNavigations:()=>number,
):Promise<NonNullable<AccessibilityScan['keyboard']>> {
  const steps:KeyboardObservation[] = [];
  let reason:string | undefined;
  for (const [offset,step] of state.steps.entries()) {
    const index = offset+1;
    if (reason) { steps.push({index,step,status:'not-run',reason:'A previous step did not complete.'}); continue; }
    const observation:KeyboardObservation = {index,step,status:'failed',evaluated:false};
    steps.push(observation);
    let before:GuardReading | undefined;
    const requestsBefore = getBlockedNavigations();
    try {
      signal.throwIfAborted();
      before = await readGuard(page,guardKey);
      observation.focusBefore = before.focus;
      if (step.action === 'key') {
        if (before.focus?.frameBoundary && !['Tab','Shift+Tab'].includes(step.key)) {
          throw new Error(step.key + ' was not sent: keyboard activation within a frame is outside the configured main-document state.');
        }
        if (['Enter','Space'].includes(step.key) && !before.activationAllowed) {
          throw new Error(step.key + ' was not sent: the focused element is not a permitted non-form widget.');
        }
        await page.keyboard.press(step.key);
        observation.evaluated = true;
      } else {
        const deadline = performance.now()+ASSERTION_TIMEOUT_MS;
        let reading:SelectorReading;
        do {
          reading = await inspectSelector(page,step);
          if (reading.invalid) throw new Error('The configured CSS selector is invalid.');
          if (reading.count > 1) throw new Error('The configured CSS selector matched more than one element.');
          if (keyboardActual(step,reading) || (step.action === 'focus' && reading.count === 1) || performance.now() >= deadline) break;
          await delay(55,undefined,{signal});
        } while (true);
        observation.actual = typeof reading.actual === 'string' ? clean(reading.actual,500) : (reading.actual ?? null);
        observation.selectorMatches = reading.count;
        observation.evaluated = true;
        if (!keyboardActual(step,reading)) {
          throw new Error('The observed browser state did not match ' + step.action + ' for ' + step.selector + '.');
        }
      }
      const after = await readGuard(page,guardKey);
      observation.focusAfter = after.focus;
      if (after.blocked !== before.blocked || getBlockedNavigations() !== requestsBefore) {
        observation.evaluated = false;
        throw new Error('The public read-only guard blocked an activation, form submission, or navigation.');
      }
      observation.status = 'passed';
    } catch (error) {
      reason = note(error);
      observation.reason = reason;
      if (getBlockedNavigations() !== requestsBefore) observation.evaluated = false;
      if (!signal.aborted && !('focusAfter' in observation)) {
        try {
          const after = await readGuard(page,guardKey);
          observation.focusAfter = after.focus;
          if (before && after.blocked !== before.blocked) observation.evaluated = false;
        } catch { /* Navigation may have invalidated the original document. */ }
      }
    }
  }
  return reason ? {status:'incomplete',steps,reason} : {status:'complete',steps};
}

async function mapComponents(page:Page,configs:ComponentConfig[],axe:AxeResults):Promise<ComponentSnapshot> {
  const unique = new Map<string,NodeResult['target']>();
  let unsupported = 0;
  let capped = false;
  for (const {nodes} of [...axe.violations,...axe.incomplete]) {
    for (const {target} of nodes) {
      const key = canonicalJson(target);
      if (unique.has(key)) continue;
      if (target.length !== 1 || typeof target[0] !== 'string') { unsupported++; continue; }
      if (unique.size >= MAX_STRUCTURED_INSTANCES) { capped = true; continue; }
      unique.set(key,target);
    }
  }
  const observed = await page.evaluate(({components,targets}) => {
    const counts:Record<string,number | null> = Object.create(null) as Record<string,number | null>;
    const valid:Array<{id:string;selector:string}> = [];
    for (const {id,selector} of components) {
      try { counts[id] = document.querySelectorAll(selector).length; valid.push({id,selector}); }
      catch { counts[id] = null; }
    }
    const mappings = [];
    let unresolved = 0;
    for (const target of targets) {
      const selector = target[0];
      if (typeof selector !== 'string') continue;
      let element:Element | null = null;
      try {
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) element = matches[0];
      } catch { /* Keep the original axe selector as ungrouped evidence. */ }
      if (!element) { unresolved++; continue; }
      for (let ancestor:Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const matching = valid.filter(({selector:component}) => ancestor!.matches(component)).map(({id}) => id);
        if (matching.length) { mappings.push({target,componentIds:matching}); break; }
      }
    }
    return {counts,mappings,unresolved};
  },{components:configs,targets:[...unique.values()]});
  const limitations = [];
  if (unsupported) limitations.push('Frame and shadow-tree selectors were retained without component grouping.');
  if (observed.unresolved) limitations.push('Some axe selectors did not resolve uniquely in the main document.');
  if (observed.mappings.some(({componentIds}) => componentIds.length > 1)) limitations.push('Instances with multiple equally close configured components were left ungrouped.');
  if (capped) limitations.push('Additional targets exceeded the structured component mapping limit.');
  return {counts:observed.counts,mappings:observed.mappings,limitations};
}

function sameDocumentUrl(a:string,b:string):boolean {
  const first = new URL(a), second = new URL(b);
  first.hash = ''; second.hash = '';
  return first.href === second.href;
}

function criticalRequest(request:Request,origin:string):boolean {
  const type = request.resourceType();
  if (!/^https?:\/\//i.test(request.url())) return false;
  if (['document','script','stylesheet','font'].includes(type)) return true;
  if (!['xhr','fetch'].includes(type) || request.method() !== 'GET') return false;
  try { return new URL(request.url()).origin === origin; }
  catch { return false; }
}

async function captureScope(
  page:Page,session:BrowserSession,scan:AccessibilityScan,state:StateConfig | undefined,
  components:ComponentConfig[],url:string,initialTarget:boolean,signal:AbortSignal,
):Promise<void> {
  const guardKey = '__a11y_' + randomUUID();
  await page.addInitScript({content:publicAccessibilityGuardScript(guardKey)});
  const failures = new Set<string>();
  let readinessTimedOut = false;
  let sealed = false;
  let monitorOrigin = new URL(url).origin;
  let blockedRequests = 0;
  let navigationFinished = false;
  let observedRequests = 0;
  const recordFailure = (request:Request,description:string) => {
    if (sealed || !criticalRequest(request,monitorOrigin) || failures.size >= 24) return;
    let location = '(invalid resource URL)';
    try { const resource = new URL(request.url()); location = resource.origin + resource.pathname; } catch { /* Retain the failure without a URL. */ }
    failures.add(clean(request.resourceType() + ' ' + location + ' (' + description + ')',350));
  };
  const updateReadiness = () => {
    const reason = readinessTimedOut ? 'The page did not reach the load event within the readiness deadline.' :
      failures.size ? 'One or more document, script, stylesheet, font, or same-origin data requests failed.' : undefined;
    scan.readiness = {status:reason ? 'incomplete' : 'complete',reason,data:{observedRequests,failedResources:[...failures]}};
  };
  page.on('request',(request) => { if (!sealed && criticalRequest(request,monitorOrigin)) observedRequests++; });
  page.on('requestfailed',(request) => { recordFailure(request,request.failure()?.errorText ?? 'request failed'); });
  page.on('response',(response) => { if (response.status() >= 400) recordFailure(response.request(),'HTTP ' + response.status()); });
  await page.route('**/*',async (route) => {
    const request = route.request();
    if (sealed || (navigationFinished && request.isNavigationRequest() && request.frame() === page.mainFrame())) {
      blockedRequests++;
      await route.abort('blockedbyclient').catch(() => {});
    } else {
      await route.fallback().catch(() => {});
    }
  });
  signal.throwIfAborted();
  const response = await page.goto(url,{waitUntil:'domcontentloaded'});
  const opened = parsePublicTarget(page.url());
  session.scope.assert(opened,true);
  if (initialTarget) session.scope.lock(opened);
  if (!response || !sameDocumentUrl(response.url(),opened.href)) {
    scan.navigation = {status:'incomplete',testedUrl:opened.href,reason:'No HTTP response could be matched to the final document.'};
    return;
  }
  const httpStatus = response.status();
  if (httpStatus < 200 || httpStatus >= 300) {
    scan.navigation = {status:'incomplete',testedUrl:opened.href,httpStatus,reason:'The final document returned HTTP ' + httpStatus + '.'};
    return;
  }
  const mediaType = response.headers()['content-type']?.split(';',1)[0]?.trim().toLowerCase();
  if (mediaType !== 'text/html' && mediaType !== 'application/xhtml+xml') {
    scan.navigation = {status:'incomplete',testedUrl:opened.href,httpStatus,reason:'The final response was not served as an HTML document.'};
    return;
  }
  navigationFinished = true;
  monitorOrigin = opened.origin;
  scan.navigation = {status:'complete',testedUrl:opened.href,httpStatus};
  try { await page.waitForLoadState('load',{timeout:PAGE_LOAD_TIMEOUT_MS}); }
  catch (error) {
    if (!(error instanceof Error && error.name === 'TimeoutError')) throw error;
    readinessTimedOut = true;
  }
  updateReadiness();
  signal.throwIfAborted();

  // Configured focus and keyboard actions must not initiate a new request, even a GET.
  // Resources from the initial load are allowed under the shared protected egress policy.
  sealed = !!state?.steps.length;
  const guard = await readGuard(page,guardKey);
  if (state) {
    scan.keyboard = await exerciseKeyboard(page,state,guardKey,signal,() => blockedRequests);
    if (scan.keyboard.status !== 'complete') return;
  }
  if (!sameDocumentUrl(opened.href,page.url()) || blockedRequests || (await readGuard(page,guardKey)).blocked !== guard.blocked) {
    scan.axeReason = 'The page attempted a blocked request or form action, or changed documents before it could be scanned.';
    if (scan.keyboard) scan.keyboard = {...scan.keyboard,status:'incomplete',reason:scan.axeReason};
    return;
  }
  signal.throwIfAborted();
  const axe = await new AxeBuilder({page}).options({resultTypes:['violations','incomplete']}).analyze();
  scan.axe = axe;
  if (!sameDocumentUrl(opened.href,page.url()) || blockedRequests || (await readGuard(page,guardKey)).blocked !== guard.blocked) {
    scan.axeReason = 'The page attempted a blocked request or form action, or changed documents during the axe scan.';
    scan.readiness={status:'incomplete',reason:scan.axeReason,data:scan.readiness?.data};
    if (scan.keyboard) scan.keyboard = {...scan.keyboard,status:'incomplete',reason:scan.axeReason};
    return;
  }
  updateReadiness();
  if (!state) scan.keyboardProbe={status:'unavailable',steps:[],termination:'unavailable',forwardLimit:40,reverseLimit:10,elapsedMs:0,scopeLimit:KEYBOARD_SAMPLE_LIMIT,reason:'The scope ended before the keyboard sample could run.'};
  if (components.length) {
    try {scan.components = await mapComponents(page,components,axe);}
    catch (error) {scan.components={counts:Object.fromEntries(components.map(component => [component.id,null])),mappings:[],limitations:[note(error)]};}
  }
  if (!state) {
    sealed = true;
    await page.evaluate(name => {const guard=Reflect.get(window,name) as ReadOnlyGuard;guard.seal();},guardKey);
    scan.keyboardProbe = await collectKeyboardProbe(page,{signal,readGuard:() => readGuard(page,guardKey),getBlockedRequests:() => blockedRequests,
      getBlockedReason:() => 'The read-only guard blocked a form, action, navigation or new request during the sample. This limits interaction coverage; it is not an accessibility finding.'});
  }
}

/** Collect measured accessibility evidence from the requested public pages and keyboard states. */
export async function collectAccessibility(request:ValidatedRequest,options:CollectorOptions = {}):Promise<CollectorResult> {
  let testedUrl = request.targetUrl;
  const runtime:RuntimeVersions = {node:process.version,browser:'unavailable',engine:'unavailable'};
  const diagnostics:string[] = [];
  const scans:AccessibilityScan[] = [];
  let session:BrowserSession;
  try {
    session = await openBrowserSession(request.targetUrl,{...options,profile:request.profile});
    runtime.browser = session.browserVersion;
    runtime.browserDriver = session.driverVersion;
  } catch (error) {
    const reason = note(error);
    const cause = error instanceof Error && error.cause instanceof Error ? note(error.cause) : undefined;
    diagnostics.push('Chromium did not start: ' + reason + (cause ? ' · ' + cause : ''));
    return assembleAccessibilityResult(request,runtime,testedUrl,scopeEntries(request).map(({scope}) => ({
      scope,navigation:{status:'unavailable',reason},
    })),diagnostics);
  }

  try {
    for (const [index,{scope,state}] of scopeEntries(request).entries()) {
      const scan:AccessibilityScan = {scope,navigation:{status:'unavailable'}};
      scans.push(scan);
      const timer = deadlineSignal(STATE_DEADLINE_MS,'Accessibility scope deadline exceeded.');
      const signal = AbortSignal.any([session.signal,timer.signal]);
      let page:Page | undefined;
      try {
        signal.throwIfAborted();
        page = await session.newPage();
        // Only the exact target's redirect has been observed. Other configured URLs are used as submitted.
        const url = index > 0 && scope.page === request.targetUrl ? testedUrl : scope.page;
        await abortable(captureScope(page,session,scan,state,request.components,url,index === 0,signal),signal);
      } catch (error) {
        const reason = note(error);
        if (scan.navigation.status !== 'complete') scan.navigation = {...scan.navigation,status:'incomplete',reason};
        else if (scan.axe) diagnostics.push('Component mapping did not complete for ' + scope.page + ' · ' + scope.state + ': ' + reason);
        else scan.axeReason = reason;
      } finally {
        timer.stop();
        if (index === 0) {
          testedUrl = scan.navigation.testedUrl ?? testedUrl;
          session.scope.lock(testedUrl);
        }
        if (scan.axe) runtime.engine = scan.axe.testEngine.name + ' ' + scan.axe.testEngine.version;
        if (page) {
          // axe opens an internal about:blank page to merge frame results. Clean it up even on timeout.
          await Promise.all(page.context().pages().map((opened) => opened.close({runBeforeUnload:false}).catch(() => {})));
        }
      }
    }
  } finally {
    diagnostics.push(...session.diagnostics());
    await session.close();
  }
  return assembleAccessibilityResult(request,runtime,testedUrl,scans,diagnostics);
}

