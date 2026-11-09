import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import type { Flags, Result, RunnerResult } from 'lighthouse';
import type { Browser, BrowserContext, Page } from 'puppeteer-core';
import { createDocumentScope, manageBrowserShutdown, startBrowserEgress } from '../core/browser.js';
import type { BrowserEgress } from '../core/browser.js';
import { createEvidence, createFinding } from '../core/evidence.js';
import { parsePublicResource, parsePublicTarget } from '../core/input.js';
import { abortable, deadlineSignal } from '../core/network.js';
import { createArtifactId } from '../core/store.js';
import type {
  CollectorOptions, CollectorResult, CoverageEntry, DeclaredProfile, Evidence, Finding, JsonObject,
  RawArtifact, RuntimeVersions, Scope, SuppliedData, SuppliedSource, ValidatedRequest, PortableBaseline, MetricChange,
} from '../core/types.js';
import {
  LAB_METRICS, NAVIGATION_METHOD, NAVIGATION_POLICY_VERSION, RELATIVE_CHANGE_THRESHOLD,
  navigationMetrics, summarizeNavigationPage, comparePerformanceMetrics as compareNavigationMetrics,
} from './performance-measurements.js';

const AGENT = 'performance' as const;
// Include collector policy in runtime identity so older desktop-only baselines
// cannot silently compare against the revised device-scoped evidence pipeline.
const ENGINE = 'performance-navigation-v2';
const SAMPLE_TIMEOUT_MS = 25_000;
const CDP_TIMEOUT_MS = 6_000;
const SAMPLE_DRAIN_MS = 2_000;
const LHR_BYTES = 5_000_000; // At most 75 MB for 15 raw reports.
const AUXILIARY_BYTES = 14_000_000; // Reserve the rest of the shared 90 MB artifact allowance.
const STARTUP_TIMEOUT_MS = 20_000;
const DESKTOP_THROTTLING = {
  rttMs:40,throughputKbps:10_240,cpuSlowdownMultiplier:1,
  requestLatencyMs:0,downloadThroughputKbps:0,uploadThroughputKbps:0,
};
const MOBILE_THROTTLING = {
  rttMs:150,throughputKbps:1638.4,cpuSlowdownMultiplier:4,
  requestLatencyMs:562.5,downloadThroughputKbps:1474.56,uploadThroughputKbps:675,
};
const RESOURCE_AUDITS = new Set(['render-blocking-insight','image-delivery-insight','network-dependency-tree-insight']);
const MAX_RESOURCES = 8;
const asObject = (value: unknown): Record<string,unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;

type SampleProfile = Omit<DeclaredProfile,'id'> & {id:'mobile-v1'|'desktop-v1'};
export function performanceProfiles(profile: DeclaredProfile): SampleProfile[] {
  const mobile: SampleProfile = {...profile,id:'mobile-v1',viewport:{width:412,height:823},deviceScaleFactor:1.75};
  const desktop: SampleProfile = {...profile,id:'desktop-v1',viewport:{width:1365,height:768},deviceScaleFactor:1};
  return profile.id === 'mobile-and-desktop-v1' ? [mobile,desktop] : profile.id === 'mobile-v1' ? [mobile] : [{...profile,id:'desktop-v1'}];
}

export function comparePerformanceMetrics(current: CollectorResult, baseline: PortableBaseline): MetricChange[] {
  if (baseline.identity.profile.id === 'desktop-v1') return compareNavigationMetrics(current,baseline);
  const select = (measurements: JsonObject | undefined, profileId: string): JsonObject | undefined => {
    const navigation = asObject(measurements?.navigation);
    if (!navigation || !Array.isArray(navigation.pages)) return measurements;
    return {...measurements,navigation:{...navigation,pages:navigation.pages.filter(value => asObject(value)?.profileId === profileId)} as JsonObject};
  };
  return performanceProfiles(baseline.identity.profile).flatMap(profile => compareNavigationMetrics(
    {...current,measurements:select(current.measurements,profile.id)},
    {...baseline,measurements:select(baseline.measurements,profile.id)},
  ).map(change => ({...change,profileId:profile.id})));
}
const DIAGNOSTIC_AUDITS = [
  'network-requests','resource-summary','total-byte-weight','mainthread-work-breakdown','long-tasks',
  'render-blocking-insight','lcp-breakdown-insight','lcp-discovery-insight','network-dependency-tree-insight',
  'image-delivery-insight','third-parties-insight','cls-culprits-insight','document-latency-insight',
] as const;

const note = (value: string, max = 400) => value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
function errorText(error: unknown): string {
  return note(error instanceof Error ? error.message : typeof error === 'string' ? error : 'Lighthouse navigation did not complete') ||
    'Lighthouse navigation did not complete';
}

export function performanceFlags(profile: DeclaredProfile): Flags {
  const mobile = profile.id === 'mobile-v1';
  return {
    output:'json',logLevel:'error',onlyCategories:['performance'],
    locale:'en-US',formFactor:mobile?'mobile':'desktop',throttlingMethod:'simulate',throttling:mobile?MOBILE_THROTTLING:DESKTOP_THROTTLING,
    screenEmulation:{mobile,disabled:false,...profile.viewport,deviceScaleFactor:profile.deviceScaleFactor},
    extraHeaders:{'Accept-Language':profile.locale},
    maxWaitForFcp:10_000,maxWaitForLoad:15_000,
    disableFullPageScreenshot:true,
    skipAudits:['interaction-to-next-paint','bf-cache'],
    blockedUrlPatterns:['ws://*','wss://*'],
  };
}

async function chromePath(explicit?: string): Promise<string> {
  const configured = explicit ?? process.env.CHROME_PATH;
  if (configured) {
    try { await access(configured,constants.X_OK); return configured; }
    catch (cause) { throw new Error('Configured Chromium executable is not accessible',{cause}); }
  }
  const { chromium } = await import('playwright');
  const playwrightPath = chromium.executablePath();
  try { await access(playwrightPath,constants.X_OK); return playwrightPath; }
  catch {
    try {
      const { getChromePath } = await import('chrome-launcher');
      const discovered = getChromePath();
      await access(discovered,constants.X_OK);
      return discovered;
    } catch { throw new Error('Chromium executable unavailable; install Chromium or configure a trusted executable path'); }
  }
}

function retainArtifacts(artifacts: RawArtifact[], plannedSamples: number, dualProfile: boolean) {
  let auxiliaryBytes = 0;
  const lhrLimit = Math.min(LHR_BYTES,Math.floor(75_000_000 / plannedSamples));
  return (sample: number, pageNumber: number, scope: Scope, result: RunnerResult, device: string) => {
    const references: Record<string,string> = {};
    const omissions: string[] = [];
    const items = [
      {key:'lhr',file:'lighthouse.lhr',value:result.lhr,limit:lhrLimit},
      {key:'trace',file:'lighthouse.trace',value:result.artifacts.Trace,limit:6_000_000},
      {key:'devtoolsLog',file:'lighthouse.devtoolslog',value:result.artifacts.DevtoolsLog ?? result.artifacts.DevtoolsLogError,limit:3_000_000},
    ];
    for (const {key,file,value,limit} of items) {
      if (dualProfile && key !== 'lhr' && sample !== 1) { omissions.push(`${key} retained for the first sample of each device/page only`); continue; }
      if (!value || value instanceof Error) { omissions.push(`${key} unavailable from Lighthouse`); continue; }
      const budget = key === 'lhr' ? limit : Math.min(limit,AUXILIARY_BYTES - auxiliaryBytes);
      if (budget <= 0) { omissions.push(`${key} exceeded the remaining artifact allowance`); continue; }
      try {
        const json = JSON.stringify(value);
        let bytes: string | Uint8Array = json;
        let size = Buffer.byteLength(json);
        let compressed = false;
        if (key !== 'lhr' || size > budget) {
          bytes = gzipSync(json,{level:1,maxOutputLength:budget});
          size = bytes.byteLength;
          compressed = true;
        }
        if (size > budget) throw new Error('Artifact exceeds its retention limit');
        const id = createArtifactId();
        artifacts.push({
          id,scope,label:`Page ${pageNumber} ${device} sample ${sample}: ${file}.json${compressed ? '.gz' : ''}`,
          mediaType:compressed ? 'application/gzip' : 'application/json',bytes,
        });
        references[key] = id;
        if (key !== 'lhr') auxiliaryBytes += size;
      } catch { omissions.push(`${key} could not be retained within the artifact allowance`); }
    }
    if (sample === 1) {
      const details = asObject(result.lhr.audits['final-screenshot']?.details);
      const data = details?.data;
      if (typeof data === 'string' && data.length <= 2_800_000) {
        const match = /^data:image\/(jpeg|png);base64,([a-z\d+/=]+)$/i.exec(data);
        if (match) {
          const bytes = Buffer.from(match[2],'base64');
          if (bytes.byteLength <= Math.min(2_000_000,AUXILIARY_BYTES-auxiliaryBytes)) {
            const id = createArtifactId();
            artifacts.push({id,scope,label:`Page ${pageNumber} ${device} sample ${sample}: final page screenshot`,mediaType:`image/${match[1].toLowerCase()}`,bytes});
            auxiliaryBytes += bytes.byteLength; references.screenshot=id;
          } else omissions.push('Final page screenshot exceeded the artifact allowance');
        }
      }
    }
    return {references,omissions};
  };
}

function resourceDetails(details: unknown, auditId: string): {resources: JsonObject[]; longestChainMs?: number; resourcesTruncated: boolean} {
  const resources: JsonObject[] = [];
  let visited = 0;
  let longestChainMs: number | undefined;
  let resourcesTruncated = false;
  const numeric = (row: JsonObject, key: string, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) row[key]=value;
  };
  const walk = (value: unknown, depth = 0, parentUrl?: string) => {
    if (depth > 10 || ++visited > 160) { resourcesTruncated=true;return; }
    const object=asObject(value); if (!object) return;
    const row: JsonObject={};
    const url = typeof object.url === 'string' ? object.url : typeof object.origin === 'string' ? object.origin : undefined;
    if (url && /^https?:\/\//i.test(url)) {
      row.url=note(url,1200);
      if (parentUrl) row.parentUrl=parentUrl;
      numeric(row,'totalBytes',object.totalBytes);
      numeric(row,'transferBytes',object.transferSize);
      numeric(row,'estimatedSavingsBytes',object.wastedBytes);
      numeric(row,auditId==='render-blocking-insight'?'durationMs':'estimatedSavingsMs',object.wastedMs);
      numeric(row,'completionTimeMs',object.navStartToEndTime);
      const node=asObject(object.node);
      if (typeof node?.selector === 'string') row.element=note(node.selector,500);
      if (typeof node?.nodeLabel === 'string') row.description=note(node.nodeLabel,180);
      if (resources.length < MAX_RESOURCES) resources.push(row); else resourcesTruncated=true;
    }
    const longest=asObject(object.longestChain)?.duration;
    if (typeof longest==='number' && Number.isFinite(longest) && longest>=0) longestChainMs=longest;
    if (Array.isArray(object.items)) for (const item of object.items) walk(item,depth+1,parentUrl);
    if (object.value) walk(object.value,depth+1,parentUrl);
    for (const nested of [asObject(object.chains),asObject(object.children)]) {
      if (nested) for (const child of Object.values(nested)) walk(child,depth+1,url ?? parentUrl);
    }
  };
  walk(details);
  return {resources,...(longestChainMs===undefined?{}:{longestChainMs}),resourcesTruncated};
}

export function auditDiagnostics(result: Result): JsonObject[] {
  return DIAGNOSTIC_AUDITS.flatMap((id) => {
    const audit = result.audits[id];
    if (!audit || ['error','notApplicable'].includes(audit.scoreDisplayMode)) return [];
    const savings=asObject(audit.metricSavings);
    const recordedMs = Object.entries(savings??{}).filter((entry):entry is [string,number]=>['FCP','LCP','TBT'].includes(entry[0])&&typeof entry[1]==='number'&&Number.isFinite(entry[1])&&entry[1]>=0).sort((a,b)=>b[1]-a[1]);
    return [{
      id,title:note(audit.title,240),
      ...(typeof audit.score === 'number' && Number.isFinite(audit.score) ? {score:audit.score} : {}),
      ...(typeof audit.numericValue === 'number' && Number.isFinite(audit.numericValue) ? {value:audit.numericValue} : {}),
      ...(audit.numericUnit ? {unit:note(audit.numericUnit,50)} : {}),
      ...(audit.displayValue ? {display:note(audit.displayValue,240)} : {}),
      ...(RESOURCE_AUDITS.has(id) ? resourceDetails(audit.details,id) : {}),
      ...(recordedMs.length ? {estimatedSavingsMs:recordedMs[0][1],estimatedSavingsMetric:recordedMs[0][0]} : {}),
    }];
  });
}

export function createDiagnosticEvidence(
  audit: JsonObject, sample: number, profile: DeclaredProfile, scope: Scope,
  source: Evidence['source'], artifactIds: string[],
): Evidence {
  const resources=Array.isArray(audit.resources)?audit.resources:[];
  const data: JsonObject={auditId:audit.id,title:audit.title,status:'collected',sampleIndex:sample,profileId:profile.id,
    formFactor:profile.id==='mobile-v1'?'mobile':'desktop',recordedResourceCount:resources.length,resources:[],
    resourcesTruncated:Boolean(audit.resourcesTruncated)};
  for (const key of ['score','estimatedSavingsMs','estimatedSavingsMetric','longestChainMs']) if (audit[key]!==undefined) data[key]=audit[key];
  const entry=createEvidence({
    agentId:AGENT,kind:'navigation-diagnostic',scope,key:`diagnostic-${audit.id}`,
    summary:`Recorded ${data.formFactor} resource details for ${audit.title} from sample ${sample}; estimated savings are Lighthouse estimates.`,
    source,data,artifactIds,
  });
  for (const resource of resources) {
    const selected=data.resources as JsonObject[];
    if (selected.length>=3 || Buffer.byteLength(JSON.stringify({...entry,data:{...data,resources:[...selected,resource]}}))>4800) {
      data.resourcesTruncated=true;continue;
    }
    selected.push(resource as JsonObject);
  }
  return entry;
}

function suppliedRecords(supplied?: SuppliedData) {
  // JSON serialization omits the optional reference rather than storing undefined.
  const clean = (source: SuppliedSource): JsonObject => ({
    name:source.name,start:source.start,end:source.end,
    ...(source.reference ? {reference:source.reference} : {}),
  });
  const field = supplied?.fieldMeasurements ?? [];
  const interactions = supplied?.interactions ?? [];
  const fieldData = field.map((entry) => ({...entry,source:clean(entry.source)}));
  const interactionData = interactions.map((entry) => ({...entry,source:clean(entry.source)}));
  const evidence: Evidence[] = [
    ...field.map((entry,index) => createEvidence({
      agentId:AGENT,kind:'supplied-field-measurement',scope:{page:entry.page},
      key:`${entry.metric}:${index}`,summary:`Supplied field measurement: ${entry.metric} (${entry.population}).`,
      source:{kind:'supplied',name:entry.source.name,reference:entry.source.reference,observedAt:entry.source.end},data:fieldData[index],
    })),
    ...interactions.map((entry,index) => createEvidence({
      agentId:AGENT,kind:'supplied-interaction',scope:{page:entry.page},
      key:`${entry.metric}:${index}`,summary:`Supplied interaction evidence: ${entry.metric} (${entry.scenario}).`,
      source:{kind:'supplied',name:entry.source.name,reference:entry.source.reference,observedAt:entry.source.end},data:interactionData[index],
    })),
  ];
  return {field:fieldData,interactions:interactionData,evidence};
}

type SampleOptions = {
  browser: Browser; egress: BrowserEgress; scope: Scope; acceptedOrigin?: string;
  profile: DeclaredProfile; signal: AbortSignal;
  setOpeningPage: (opening: boolean) => void;
  setContext: (context: BrowserContext | undefined) => void;
  stopRun: (error: Error) => void;
};
type SampleResult = {report?: RunnerResult; testedUrl?: string; reason?: string; requests: number; blocked: number};

async function collectSample(options: SampleOptions): Promise<SampleResult> {
  const {browser,egress,scope,profile,acceptedOrigin,signal,setOpeningPage,setContext,stopRun} = options;
  const {default:lighthouse,desktopConfig,defaultConfig} = await import('lighthouse');
  const documentScope = createDocumentScope(scope.page);
  const submittedOrigin = new URL(scope.page).origin;
  if (acceptedOrigin === submittedOrigin) documentScope.lock(scope.page);
  const initial = egress.diagnostics();
  let context: BrowserContext | undefined;
  let report: RunnerResult | undefined;
  let lighthouseRun: Promise<RunnerResult | undefined> | undefined;
  let testedUrl: string | undefined;
  let documentViolation: string | undefined;
  let cdpFailure: string | undefined;
  let page: Page | undefined;
  let reason: string | undefined;
  try {
    signal.throwIfAborted();
    context = await browser.createBrowserContext({downloadBehavior:{policy:'deny'}});
    setContext(context);
    signal.throwIfAborted();
    setOpeningPage(true);
    try { page = await context.newPage(); }
    finally { setOpeningPage(false); }

    // Puppeteer's page request event is fed by Network.requestWillBeSent in
    // the main target, cross-process frames and dedicated workers, including redirects.
    page.on('request',(request) => { egress.requestBudget.observe(request.url()); });
    const client = await page.createCDPSession();
    const {frameTree} = await client.send('Page.getFrameTree');
    const mainFrame = frameTree.frame.id;
    await Promise.all([
      page.emulateTimezone(profile.timezoneId),
      page.setBypassServiceWorker(true),
      client.send('Emulation.setLocaleOverride',{locale:profile.locale}),
      page.evaluateOnNewDocument(() => {
        // The fresh browser context contains no registrations or persisted storage.
        if (typeof ServiceWorkerContainer !== 'undefined') {
          Object.defineProperty(ServiceWorkerContainer.prototype,'register',{
            value:() => Promise.reject(new DOMException('Service worker registration is disabled during collection','NotSupportedError')),
            configurable:false,writable:false,
          });
        }
      }),
    ]);
    client.on('Fetch.requestPaused',(event) => {
      void (async () => {
        try {
          signal.throwIfAborted();
          const url = parsePublicResource(event.request.url);
          if (event.frameId === mainFrame) {
            documentScope.assert(url,true);
            if (url.origin !== submittedOrigin) documentScope.lock(url);
          }
        } catch (error) {
          if (event.frameId === mainFrame) documentViolation ??= errorText(error);
          await client.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(() => {});
          return;
        }
        await client.send('Fetch.continueRequest',{requestId:event.requestId}).catch((error: unknown) => {
          cdpFailure ??= errorText(error);
        });
      })();
    });
    await client.send('Fetch.enable',{patterns:[
      {urlPattern:'http://*',resourceType:'Document'},
      {urlPattern:'https://*',resourceType:'Document'},
    ]});
    signal.throwIfAborted();
    lighthouseRun = lighthouse(scope.page,performanceFlags(profile),profile.id==='mobile-v1'?defaultConfig:desktopConfig,page);
    report = await abortable(lighthouseRun,signal);
    signal.throwIfAborted();
    if (!report) throw new Error('Lighthouse returned no result');
    if (documentViolation) throw new Error(documentViolation);
    if (cdpFailure) throw new Error('Browser document interception failed: ' + cdpFailure);
    if (report.lhr.runtimeError) throw new Error(`${report.lhr.runtimeError.code}: ${report.lhr.runtimeError.message}`);
    if (report.lhr.gatherMode !== 'navigation') throw new Error('Lighthouse did not produce a navigation result');
    const final = parsePublicTarget(report.lhr.finalDisplayedUrl);
    const document = parsePublicTarget(report.lhr.mainDocumentUrl ?? report.lhr.finalUrl);
    documentScope.assert(final,true);
    documentScope.assert(document,true);
    if (final.origin !== document.origin || (acceptedOrigin && final.origin !== acceptedOrigin)) {
      throw new Error('Final document did not remain on the accepted origin');
    }
    testedUrl = final.href;
  } catch (error) {
    reason = documentViolation ?? errorText(signal.aborted ? signal.reason : error);
  } finally {
    try { await context?.close(); }
    catch (error) {
      if (!egress.signal.aborted) {
        reason ??= 'Lighthouse browser context did not close: ' + errorText(error);
        stopRun(new Error(reason,{cause:error}));
      }
    } finally { setContext(undefined); }
    if (lighthouseRun && signal.aborted) {
      // Close the context first to interrupt its CDP work, then allow the
      // canceled gather to settle before starting another measurement.
      const drain = deadlineSignal(SAMPLE_DRAIN_MS,'Canceled Lighthouse sample did not settle');
      try { await abortable(lighthouseRun.catch(() => undefined),drain.signal); }
      catch (error) { stopRun(new Error(errorText(error),{cause:error})); }
      finally { drain.stop(); }
    }
  }
  const final = egress.diagnostics();
  return {report,testedUrl,reason,requests:final.requests-initial.requests,blocked:final.blocked-initial.blocked};
}

function pageCoverage(
  summarized: ReturnType<typeof summarizeNavigationPage>, pageNumber: number, coverage: CoverageEntry[],
  evidence: Evidence[], findings: Finding[], source: Evidence['source'], scope: Scope, profile: DeclaredProfile,
) {
  const {page,planned,attempted,succeeded,failed,notRun,samples,metrics} = summarized;
  const device = profile.id==='mobile-v1'?'mobile':'desktop';
  const id = `performance-page-${pageNumber}`;
  const allMetrics = Object.values(metrics).every((metric) => metric.count === planned);
  const stableDocument = new Set(samples.filter((sample) => sample.status === 'collected').map((sample) => sample.testedUrl)).size === 1;
  const status = succeeded === 0 ? (attempted ? 'incomplete' : 'unavailable') :
    succeeded === planned && allMetrics && stableDocument ? 'complete' : 'incomplete';
  const missingReason = !succeeded ? 'No Lighthouse navigation sample completed.' :
    !stableDocument ? 'Successful samples did not measure the same final document.' :
    succeeded !== planned ? 'Some planned samples did not produce valid navigation measurements.' :
    !allMetrics ? 'At least one supported metric was missing from a sample.' : undefined;
  coverage.push({
    id,scope,subject:'Lighthouse navigation samples',status,reason:missingReason,
    data:{planned,attempted,succeeded,failed,notRun,stableDocument},
  });
  for (const sample of samples) {
    coverage.push({
      id:`${id}-sample-${sample.index}`,scope,subject:`Lighthouse navigation sample ${sample.index}`,
      status:sample.status === 'collected' ? 'complete' : sample.status === 'failed' ? 'incomplete' : 'unavailable',
      ...(typeof sample.reason === 'string' ? {reason:sample.reason} : {}),
    });
  }
  if (!succeeded) return;
  const entry = createEvidence({
    agentId:AGENT,kind:'navigation-distribution',scope,key:'lab',
    summary:`${succeeded} of ${planned} planned Lighthouse ${device} navigation samples produced valid lab measurements.`,
    source,data:{profileId:profile.id,formFactor:device,planned,attempted,succeeded,failed,notRun,metrics},
  });
  evidence.push(entry);
  const score = metrics['performance-score'];
  const pageFinding = {
    agentId:AGENT,scope,rule:'navigation-lab-baseline',evidenceIds:[entry.id],coverageIds:[id],
    recheck:`Repeat the same page with the same browser, Lighthouse version, ${device} settings and sample count.`,
  };
  findings.push(createFinding({
    ...pageFinding,title:`${device==='mobile'?'Mobile':'Desktop'} navigation lab baseline`,
    summary:typeof score.median === 'number' && typeof score.spread === 'number'
      ? `The Lighthouse performance score median was ${score.median}/100 (observed spread: ${score.spread} points; ${score.count}/${planned} samples).`
      : 'Some navigation measurements were collected, but the Lighthouse performance score is unavailable.',
    severity:'info',disposition:'observation',
    investigate:'Review the individual Lighthouse reports for main-thread, network, rendering and layout-shift evidence.',
  }));

  // Repeat advisory diagnostics across samples without treating an audit
  // suggestion as a measured root cause, or as a regression on a first run.
  for (const audit of DIAGNOSTIC_AUDITS.filter((id) => id.endsWith('-insight'))) {
    const supportingSamples = evidence.filter((item) => item.scope.page === page && item.scope.state===scope.state && item.kind === 'navigation-sample' &&
      item.data && typeof item.data === 'object' && !Array.isArray(item.data) && item.data.status === 'collected' &&
      Array.isArray(item.data.diagnostics) && item.data.diagnostics.some((diagnostic) =>
        diagnostic && typeof diagnostic === 'object' && !Array.isArray(diagnostic) &&
        diagnostic.id === audit && typeof diagnostic.score === 'number' && diagnostic.score < 0.9));
    if (supportingSamples.length < Math.floor(planned/2) + 1) continue;
    const title = audit.replace(/-insight$/,'').replace(/-/g,' ');
    const urls = [...new Set(supportingSamples.flatMap(item=>{
      const data=asObject(item.data);
      const matched=(Array.isArray(data?.diagnostics)?data.diagnostics:[]).map(asObject).find(value=>value?.id===audit);
      return (Array.isArray(matched?.resources)?matched.resources:[]).flatMap(value=>{
        const resource=asObject(value);return typeof resource?.url==='string'?[resource.url]:[];
      });
    }))].slice(0,3);
    const named = urls.map(url=>{try{return note(new URL(url).pathname.split('/').filter(Boolean).at(-1)||new URL(url).hostname,100);}catch{return note(url,100);}}).join(', ');
    const guidance = audit==='render-blocking-insight' ? `Review loading of ${named}. Check whether noncritical styles or scripts can load after the initial content, then measure the change.` :
      audit==='image-delivery-insight' ? `Review ${named}. Check the displayed image dimensions, compression and format before changing the delivered files.` :
      audit==='network-dependency-tree-insight' ? `Review the recorded request chain involving ${named}. Check which dependencies delay important content before changing load order.` : undefined;
    findings.push(createFinding({
      agentId:AGENT,scope,rule:`lighthouse-${audit}`,title:`Review ${title}`,
      summary:`Lighthouse flagged ${title} in ${supportingSamples.length} of ${planned} planned ${device} navigation samples.`,
      severity:'info',disposition:'review-needed',evidenceIds:[...supportingSamples.map((item) => item.id),...evidence.filter(item=>item.kind==='navigation-diagnostic'&&item.scope.page===page&&item.scope.state===scope.state&&asObject(item.data)?.auditId===audit).map(item=>item.id)],coverageIds:[id],
      investigate:named&&guidance?guidance:'Review the recorded Lighthouse diagnostic and verify the sequence of events before choosing a change.',
      recheck:'Repeat the same navigation under the same settings after any targeted change.',
    }));
  }
}

export async function collectPerformance(request: ValidatedRequest,options: CollectorOptions = {}): Promise<CollectorResult> {
  const profiles=performanceProfiles(request.profile);
  const runtime: RuntimeVersions = {node:process.version,browser:'unavailable',engine:'unavailable'};
  const supplied = suppliedRecords(request.supplied);
  const coverage: CoverageEntry[] = [];
  const evidence: Evidence[] = [...supplied.evidence];
  const diagnosticEvidenceKeys=new Set<string>();
  const findings: Finding[] = [];
  const artifacts: RawArtifact[] = [];
  const diagnostics: string[] = [
    `Lighthouse ${profiles.map(profile=>profile.id==='mobile-v1'?'mobile':'desktop').join(' and ')} navigation measures page-load lab performance. It does not collect real-user field data or interaction INP.`,
    'Lighthouse allows ordinary page-script requests inside the protected egress policy; this mode is not GET-only.',
    ...(supplied.field.length ? [] : ['No field measurements were supplied.']),
    ...(supplied.interactions.length ? [] : ['No interaction evidence was supplied.']),
  ];
  const retain = retainArtifacts(artifacts,request.pages.length*profiles.length*request.profile.samples,profiles.length>1);
  const pages: JsonObject[] = [];
  const browserPolicy = new AbortController();
  let egress: BrowserEgress | undefined;
  let browser: Browser | undefined;
  let close: (() => Promise<void>) | undefined;
  let context: BrowserContext | undefined;
  let openingPage = false;
  let testedUrl = request.targetUrl;
  let acceptedOrigin: string | undefined;
  let unavailable: string | undefined;
  let egressTotals: ReturnType<BrowserEgress['diagnostics']> | undefined;
  try {
    try {
      const [lighthouse,pup] = await Promise.all([
        import('lighthouse/package.json',{with:{type:'json'}}),import('puppeteer-core/package.json',{with:{type:'json'}}),
      ]);
      runtime.engine = `${ENGINE}; Lighthouse ${lighthouse.default.version}`;
      runtime.browserDriver = `Puppeteer CDP ${pup.default.version}`;
      const executablePath = await chromePath(options.executablePath);
      const signal = AbortSignal.any([browserPolicy.signal,...(options.signal ? [options.signal] : [])]);
      egress = await startBrowserEgress({signal});
      close = () => egress!.close();
      const {default:puppeteer} = await import('puppeteer-core');
      egress.signal.throwIfAborted();
      browser = await puppeteer.launch({
        // The socket transport waits for Chrome's debugger-ready message before
        // sending target discovery. The random listener is bound to loopback,
        // which remains unreachable from page requests through protected egress.
        executablePath,headless:true,defaultViewport:null,
        // Supplying the address suppresses Puppeteer's automatic port flag.
        args:[...egress.chromiumArgs,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--lang=${request.profile.locale}`],
        ignoreDefaultArgs:['--disable-popup-blocking','--no-sandbox'],
        handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,
        acceptInsecureCerts:false,timeout:STARTUP_TIMEOUT_MS,protocolTimeout:CDP_TIMEOUT_MS,signal:egress.signal,
      });
      const runningBrowser = browser;
      close = manageBrowserShutdown(egress,() => runningBrowser.close());
      runtime.browser = await abortable(runningBrowser.version(),egress.signal);
      runningBrowser.on('targetcreated',(target) => {
        // Unexpected targets terminate egress rather than running outside the sampled page.
        if (target.type() === 'service_worker') {
          browserPolicy.abort(new Error('Unexpected service worker target; browser egress stopped'));
        } else if (target.type() === 'page' && !(openingPage && target.browserContext() === context && !target.opener() && target.url() === 'about:blank')) {
          browserPolicy.abort(new Error('Unexpected browser popup or page target; browser egress stopped'));
        }
      });
      egress.signal.throwIfAborted();
    } catch (error) {
      unavailable = errorText(error);
      diagnostics.push('Protected Lighthouse browser unavailable: ' + unavailable);
    }

    const tasks=profiles.flatMap(profile=>request.pages.map((page,pageIndex)=>({profile,page,pageIndex})));
    for (const [taskIndex,{profile,page,pageIndex}] of tasks.entries()) {
      const device=profile.id==='mobile-v1'?'mobile':'desktop';
      const scope: Scope = {page:page.url,...(profile.id==='mobile-v1'||profiles.length>1?{state:device}:{})};
      const pageNumber = pageIndex + 1;
      const samples: JsonObject[] = [];
      const source = {kind:'measured' as const,name:runtime.engine};
      for (let index = 1; index <= request.profile.samples; index++) {
        if (!browser || !egress || unavailable || egress.signal.aborted) {
          samples.push({index,status:'not-run',reason:unavailable ?? errorText(egress?.signal.reason)});
          continue;
        }
        const timer = deadlineSignal(SAMPLE_TIMEOUT_MS,'Lighthouse sample deadline exceeded');
        const sampleSignal = AbortSignal.any([timer.signal,egress.signal]);
        let result: SampleResult;
        try {
          result = await collectSample({
            browser,egress,scope,acceptedOrigin,profile,signal:sampleSignal,
            setOpeningPage:(opening) => { openingPage = opening; },
            setContext:(activeContext) => { context = activeContext; },
            stopRun:(error) => browserPolicy.abort(error),
          });
        } catch (error) {
          const reason = errorText(error);
          browserPolicy.abort(error);
          result = {reason,requests:0,blocked:0};
        } finally { timer.stop(); }
        const {report,testedUrl:finalUrl,requests,blocked} = result;
        const kept = report ? retain(index,pageNumber,scope,report,device) : undefined;
        const warnings = (report?.lhr.runWarnings ?? []).slice(0,12).map((warning) => note(warning));
        const audits = report ? auditDiagnostics(report.lhr) : [];
        const metrics = report && !result.reason ? navigationMetrics(report.lhr) : {};
        const reason = result.reason ?? (!kept?.references.lhr ? 'Raw Lighthouse report could not be retained.' :
          Object.keys(metrics).length === 0 ? 'Lighthouse reported no supported navigation metrics.' :
          warnings.some((warning) => warning.startsWith('The page loaded too slowly to finish within the time limit.')) ?
            'Lighthouse did not reliably finish loading the page.' : undefined);
        const status = reason ? 'failed' : 'collected';
        const sample: JsonObject = {
          index,status,profileId:profile.id,formFactor:device,requests,blocked,warnings,diagnostics:audits,
          ...(reason ? {reason} : {}),
          ...(finalUrl ? {testedUrl:finalUrl} : {}),
          ...(status === 'collected' ? {metrics} : {}),
          ...(kept ? {artifacts:kept.references,artifactOmissions:kept.omissions} : {}),
        };
        samples.push(sample);
        if (status === 'collected' && finalUrl && pageIndex === 0 && !acceptedOrigin) {
          testedUrl = finalUrl;
          acceptedOrigin = new URL(finalUrl).origin;
          if (acceptedOrigin !== new URL(request.targetUrl).origin) diagnostics.push('The initial page used an accepted www/apex canonical redirect.');
        }
        if (report) {
          runtime.engine = `${ENGINE}; Lighthouse ${report.lhr.lighthouseVersion}`;
          evidence.push(createEvidence({
            agentId:AGENT,kind:'navigation-sample',scope,key:`sample-${index}`,
            summary:reason ? `Lighthouse ${device} sample ${index} was excluded from metrics: ${reason}` : `Lighthouse ${device} navigation sample ${index}.`,
            source:{kind:'measured',name:runtime.engine,observedAt:report.lhr.fetchTime},
            data:sample,artifactIds:Object.values(kept?.references ?? {}),
          }));
          if (status==='collected') for (const audit of audits.filter(item=>Array.isArray(item.resources)&&item.resources.length)) {
            const key=`${scope.page}|${scope.state??''}|${audit.id}`;
            if (diagnosticEvidenceKeys.has(key)) continue;
            diagnosticEvidenceKeys.add(key);
            evidence.push(createDiagnosticEvidence(audit,index,profile,scope,
              {kind:'measured',name:runtime.engine,observedAt:report.lhr.fetchTime},kept?.references.lhr?[kept.references.lhr]:[]));
          }
        }
      }
      const summarized = {...summarizeNavigationPage(page.url,request.profile.samples,samples),profileId:profile.id,formFactor:device};
      pages.push(summarized);
      pageCoverage(summarized,taskIndex+1,coverage,evidence,findings,source,scope,profile);
    }
  } finally {
    if (egress) {
      egressTotals = egress.diagnostics();
      diagnostics.push(...egressTotals.reasons);
      if (egress.signal.aborted) diagnostics.push(errorText(egress.signal.reason));
    }
    await close?.();
  }
  const lighthouseFlags = performanceFlags(profiles[0]);
  return {
    testedUrl,runtime,coverage,evidence,findings,artifacts,diagnostics:[...new Set(diagnostics)],
    measurements:{
      navigation:{
        method:NAVIGATION_METHOD,policyVersion:NAVIGATION_POLICY_VERSION,pages,
        profile:{
          ...request.profile,formFactor:profiles.length>1?'mobile-and-desktop':profiles[0].id==='mobile-v1'?'mobile':'desktop',throttlingMethod:'simulate',
          throttlingPreset:profiles.length>1?'Mobile slow 4G and desktop dense 4G':profiles[0].id==='mobile-v1'?'Lighthouse mobile slow 4G':'Lighthouse desktop dense 4G',
          ...(profiles.length===1?{throttling:profiles[0].id==='mobile-v1'?MOBILE_THROTTLING:DESKTOP_THROTTLING}:{}),freshBrowserContextPerSample:true,
          serviceWorkers:'blocked',maxWaitForFcpMs:lighthouseFlags.maxWaitForFcp!,
          maxWaitForLoadMs:lighthouseFlags.maxWaitForLoad!,sampleDeadlineMs:SAMPLE_TIMEOUT_MS,
        },
        profiles:profiles.map(profile=>({...profile,formFactor:profile.id==='mobile-v1'?'mobile':'desktop',throttling:profile.id==='mobile-v1'?MOBILE_THROTTLING:DESKTOP_THROTTLING})),
        meaningfulChange:{
          relativeToBaselineMedian:RELATIVE_CHANGE_THRESHOLD,metrics:LAB_METRICS,
          spread:'maximum minus minimum',
          rule:'Require every planned sample and matching final documents; use the greater of the absolute floor and the relative threshold. A spread above that threshold or overlapping ranges for a candidate change is inconclusive.',
        },
        ...(egressTotals ? {egress:egressTotals} : {}),
      },
      ...(request.release ? {release:Object.fromEntries(Object.entries(request.release).filter((entry): entry is [string,string] => typeof entry[1] === 'string'))} : {}),
      suppliedFieldMeasurements:supplied.field,
      suppliedInteractions:supplied.interactions,
    },
  };
}
