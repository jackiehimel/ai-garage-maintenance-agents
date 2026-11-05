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
  RawArtifact, RuntimeVersions, Scope, SuppliedData, SuppliedSource, ValidatedRequest,
} from '../core/types.js';
import {
  LAB_METRICS, NAVIGATION_METHOD, NAVIGATION_POLICY_VERSION, RELATIVE_CHANGE_THRESHOLD,
  navigationMetrics, summarizeNavigationPage,
} from './performance-measurements.js';

export { comparePerformanceMetrics } from './performance-measurements.js';

const AGENT = 'performance' as const;
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

function flags(profile: DeclaredProfile): Flags {
  return {
    output:'json',logLevel:'error',onlyCategories:['performance'],
    locale:'en-US',throttlingMethod:'simulate',throttling:DESKTOP_THROTTLING,
    screenEmulation:{mobile:false,disabled:false,...profile.viewport,deviceScaleFactor:profile.deviceScaleFactor},
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

function retainArtifacts(artifacts: RawArtifact[]) {
  let auxiliaryBytes = 0;
  return (sample: number, pageNumber: number, scope: Scope, result: RunnerResult) => {
    const references: Record<string,string> = {};
    const omissions: string[] = [];
    const items = [
      {key:'lhr',file:'lighthouse.lhr',value:result.lhr,limit:LHR_BYTES},
      {key:'trace',file:'lighthouse.trace',value:result.artifacts.Trace,limit:6_000_000},
      {key:'devtoolsLog',file:'lighthouse.devtoolslog',value:result.artifacts.DevtoolsLog ?? result.artifacts.DevtoolsLogError,limit:3_000_000},
    ];
    for (const {key,file,value,limit} of items) {
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
          id,scope,label:`Page ${pageNumber} sample ${sample}: ${file}.json${compressed ? '.gz' : ''}`,
          mediaType:compressed ? 'application/gzip' : 'application/json',bytes,
        });
        references[key] = id;
        if (key !== 'lhr') auxiliaryBytes += size;
      } catch { omissions.push(`${key} could not be retained within the artifact allowance`); }
    }
    return {references,omissions};
  };
}

function auditDiagnostics(result: Result): JsonObject[] {
  return DIAGNOSTIC_AUDITS.flatMap((id) => {
    const audit = result.audits[id];
    if (!audit || ['error','notApplicable'].includes(audit.scoreDisplayMode)) return [];
    return [{
      id,title:note(audit.title,240),
      ...(typeof audit.score === 'number' && Number.isFinite(audit.score) ? {score:audit.score} : {}),
      ...(typeof audit.numericValue === 'number' && Number.isFinite(audit.numericValue) ? {value:audit.numericValue} : {}),
      ...(audit.numericUnit ? {unit:note(audit.numericUnit,50)} : {}),
      ...(audit.displayValue ? {display:note(audit.displayValue,240)} : {}),
    }];
  });
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
  const {default:lighthouse,desktopConfig} = await import('lighthouse');
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
    lighthouseRun = lighthouse(scope.page,flags(profile),desktopConfig,page);
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
  evidence: Evidence[], findings: Finding[], source: Evidence['source'],
) {
  const {page,planned,attempted,succeeded,failed,notRun,samples,metrics} = summarized;
  const scope = {page};
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
    summary:`${succeeded} of ${planned} planned Lighthouse navigation samples produced valid lab measurements.`,
    source,data:{planned,attempted,succeeded,failed,notRun,metrics},
  });
  evidence.push(entry);
  const profile = metrics['performance-score'];
  const pageFinding = {
    agentId:AGENT,scope,rule:'navigation-lab-baseline',evidenceIds:[entry.id],coverageIds:[id],
    recheck:'Repeat the same page with the same browser, Lighthouse version, desktop settings and sample count.',
  };
  findings.push(createFinding({
    ...pageFinding,title:'Desktop navigation lab baseline',
    summary:typeof profile.median === 'number' && typeof profile.spread === 'number'
      ? `The Lighthouse performance score median was ${profile.median}/100 (observed spread: ${profile.spread} points; ${profile.count}/${planned} samples).`
      : 'Some navigation measurements were collected, but the Lighthouse performance score is unavailable.',
    severity:'info',disposition:'observation',
    investigate:'Review the individual Lighthouse reports for main-thread, network, rendering and layout-shift evidence.',
  }));

  // Repeat advisory diagnostics across samples without treating an audit
  // suggestion as a measured root cause, or as a regression on a first run.
  for (const audit of DIAGNOSTIC_AUDITS.filter((id) => id.endsWith('-insight'))) {
    const supportingSamples = evidence.filter((item) => item.scope.page === page && item.kind === 'navigation-sample' &&
      item.data && typeof item.data === 'object' && !Array.isArray(item.data) && item.data.status === 'collected' &&
      Array.isArray(item.data.diagnostics) && item.data.diagnostics.some((diagnostic) =>
        diagnostic && typeof diagnostic === 'object' && !Array.isArray(diagnostic) &&
        diagnostic.id === audit && typeof diagnostic.score === 'number' && diagnostic.score < 0.9));
    if (supportingSamples.length < Math.floor(planned/2) + 1) continue;
    const title = audit.replace(/-insight$/,'').replace(/-/g,' ');
    findings.push(createFinding({
      agentId:AGENT,scope,rule:`lighthouse-${audit}`,title:`Review ${title}`,
      summary:`Lighthouse flagged ${title} in ${supportingSamples.length} of ${planned} planned desktop navigation samples.`,
      severity:'info',disposition:'review-needed',evidenceIds:supportingSamples.map((item) => item.id),coverageIds:[id],
      investigate:'Use the linked Lighthouse reports and retained traces to identify the implicated resources and verify the sequence of events.',
      recheck:'Repeat the same navigation under the same settings after any targeted change.',
    }));
  }
}

export async function collectPerformance(request: ValidatedRequest,options: CollectorOptions = {}): Promise<CollectorResult> {
  const runtime: RuntimeVersions = {node:process.version,browser:'unavailable',engine:'unavailable'};
  const supplied = suppliedRecords(request.supplied);
  const coverage: CoverageEntry[] = [];
  const evidence: Evidence[] = [...supplied.evidence];
  const findings: Finding[] = [];
  const artifacts: RawArtifact[] = [];
  const diagnostics: string[] = [
    'Lighthouse desktop navigation measures page-load lab performance. It does not collect real-user field data or interaction INP.',
    'Lighthouse allows ordinary page-script requests inside the protected egress policy; this mode is not GET-only.',
    ...(supplied.field.length ? [] : ['No field measurements were supplied.']),
    ...(supplied.interactions.length ? [] : ['No interaction evidence was supplied.']),
  ];
  const retain = retainArtifacts(artifacts);
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
      runtime.engine = `Lighthouse ${lighthouse.default.version}`;
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

    for (const [pageIndex,page] of request.pages.entries()) {
      const scope = {page:page.url};
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
            browser,egress,scope,acceptedOrigin,profile:request.profile,signal:sampleSignal,
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
        const kept = report ? retain(index,pageNumber,scope,report) : undefined;
        const warnings = (report?.lhr.runWarnings ?? []).slice(0,12).map((warning) => note(warning));
        const audits = report ? auditDiagnostics(report.lhr) : [];
        const metrics = report && !result.reason ? navigationMetrics(report.lhr) : {};
        const reason = result.reason ?? (!kept?.references.lhr ? 'Raw Lighthouse report could not be retained.' :
          Object.keys(metrics).length === 0 ? 'Lighthouse reported no supported navigation metrics.' :
          warnings.some((warning) => warning.startsWith('The page loaded too slowly to finish within the time limit.')) ?
            'Lighthouse did not reliably finish loading the page.' : undefined);
        const status = reason ? 'failed' : 'collected';
        const sample: JsonObject = {
          index,status,requests,blocked,warnings,diagnostics:audits,
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
          runtime.engine = `Lighthouse ${report.lhr.lighthouseVersion}`;
          evidence.push(createEvidence({
            agentId:AGENT,kind:'navigation-sample',scope,key:`sample-${index}`,
            summary:reason ? `Lighthouse sample ${index} was excluded from metrics: ${reason}` : `Lighthouse desktop navigation sample ${index}.`,
            source:{kind:'measured',name:runtime.engine,observedAt:report.lhr.fetchTime},
            data:sample,artifactIds:Object.values(kept?.references ?? {}),
          }));
        }
      }
      const summarized = summarizeNavigationPage(page.url,request.profile.samples,samples);
      pages.push(summarized);
      pageCoverage(summarized,pageNumber,coverage,evidence,findings,source);
    }
  } finally {
    if (egress) {
      egressTotals = egress.diagnostics();
      diagnostics.push(...egressTotals.reasons);
      if (egress.signal.aborted) diagnostics.push(errorText(egress.signal.reason));
    }
    await close?.();
  }
  const lighthouseFlags = flags(request.profile);
  return {
    testedUrl,runtime,coverage,evidence,findings,artifacts,diagnostics:[...new Set(diagnostics)],
    measurements:{
      navigation:{
        method:NAVIGATION_METHOD,policyVersion:NAVIGATION_POLICY_VERSION,pages,
        profile:{
          ...request.profile,formFactor:'desktop',throttlingMethod:'simulate',
          throttlingPreset:'Lighthouse desktop dense 4G',throttling:DESKTOP_THROTTLING,freshBrowserContextPerSample:true,
          serviceWorkers:'blocked',maxWaitForFcpMs:lighthouseFlags.maxWaitForFcp!,
          maxWaitForLoadMs:lighthouseFlags.maxWaitForLoad!,sampleDeadlineMs:SAMPLE_TIMEOUT_MS,
        },
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
