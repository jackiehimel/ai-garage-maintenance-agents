import { validateRequest } from './core/input.js';
import { createBaseline, baselineIdentity, compareFindings } from './core/baseline.js';
import { collectionStatus } from './core/evidence.js';
import { assess } from './core/assessment.js';
import { createRunId, describeArtifact, openRunStore } from './core/store.js';
import { collectSeo } from './agents/seo.js';
import { collectAccessibility, applyAccessibilityComparisonCoverage } from './agents/accessibility.js';
import { collectPerformance, comparePerformanceMetrics } from './agents/performance.js';
import type { AgentReport, CollectorOptions, CollectorResult, ValidatedRequest } from './core/types.js';

export interface RunOptions extends CollectorOptions {
  storageRoot?: string;
  assessment?: 'live' | 'off';
  collector?: (request:ValidatedRequest,options:CollectorOptions)=>Promise<CollectorResult>;
}

export async function runAgent(input:unknown,options:RunOptions={}):Promise<AgentReport> {
  const request = validateRequest(input);
  const startedAt = new Date().toISOString();
  const runId = createRunId();
  const collect = options.collector ?? {'seo-ai-search':collectSeo,accessibility:collectAccessibility,performance:collectPerformance}[request.agentId];
  const result = await collect(request,{executablePath:options.executablePath ?? process.env.CHROME_PATH,signal:options.signal});
  if(request.agentId==='accessibility') applyAccessibilityComparisonCoverage(request,result);
  const identity = baselineIdentity(request,result.runtime,result.testedUrl);
  const comparison = compareFindings(identity,result,request.baseline);
  if (request.agentId==='performance' && comparison.status==='compatible' && request.baseline) comparison.metrics=comparePerformanceMetrics(result,request.baseline);
  const baseline = createBaseline(identity,result);
  const {baseline:_prior,...configuration}=request;
  const assessment = options.assessment==='off' ? {status:'unavailable' as const,reason:'Live assessment explicitly disabled for this run'} : await assess(request,result,options.signal);
  const report:AgentReport = {
    schemaVersion:1,runId,agentId:request.agentId,submittedUrl:request.targetUrl,testedUrl:result.testedUrl,
    startedAt,completedAt:new Date().toISOString(),runtime:result.runtime,collectionStatus:collectionStatus(result.coverage),configuration,
    evidence:result.evidence,findings:result.findings,coverage:result.coverage,measurements:result.measurements,diagnostics:result.diagnostics,
    artifacts:[],comparison,assessment,retention:{status:'export-only',reason:'Download the report and portable baseline to retain this run'},
    ...(baseline.status==='available' ? {baseline:baseline.baseline} : {baselineUnavailableReason:baseline.reason}),
  };
  if (options.storageRoot) {
    try {
      const store = await openRunStore(options.storageRoot,runId);
      for (const artifact of result.artifacts) report.artifacts.push(await store.writeArtifact(artifact));
      report.retention={status:'saved'};
      await store.writeReport(report);
    } catch {
      report.retention={status:'failed',reason:'Local retention failed; download the report and baseline now. Raw artifact availability may be incomplete.'};
    }
  } else report.artifacts=result.artifacts.map(describeArtifact);
  return report;
}

export { collectSeo, collectAccessibility, collectPerformance };
