import type { CollectorResult, JsonObject, JsonValue, MetricChange, PortableBaseline } from '../core/types.js';

export const NAVIGATION_METHOD = 'lighthouse-navigation';
export const NAVIGATION_POLICY_VERSION = 1;
export const RELATIVE_CHANGE_THRESHOLD = 0.1;
export const LAB_METRICS = {
  'performance-score': {unit:'points',minimumChange:5,preferred:'higher'},
  'first-contentful-paint': {unit:'ms',minimumChange:150,preferred:'lower'},
  'largest-contentful-paint': {unit:'ms',minimumChange:200,preferred:'lower'},
  'speed-index': {unit:'ms',minimumChange:200,preferred:'lower'},
  'total-blocking-time': {unit:'ms',minimumChange:75,preferred:'lower'},
  'cumulative-layout-shift': {unit:'unitless',minimumChange:0.025,preferred:'lower'},
} as const;

const metricNames = Object.keys(LAB_METRICS) as Array<keyof typeof LAB_METRICS>;
const rounded = (value: number) => Number(value.toPrecision(12));
const asObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
const metricNumber = (value: unknown, metric: keyof typeof LAB_METRICS): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && (metric !== 'performance-score' || value <= 100);

type PerformanceAudits = {
  categories: {performance?: {score: number | null}};
  audits: Record<string,{numericValue?: number; scoreDisplayMode?: string} | undefined>;
};

export function navigationMetrics(result: PerformanceAudits): JsonObject {
  const metrics: JsonObject = {};
  for (const metric of metricNames) {
    if (metric === 'performance-score') {
      const score = result.categories.performance?.score;
      if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1) {
        metrics[metric] = rounded(score * 100);
      }
      continue;
    }
    const audit = result.audits[metric];
    if (audit && !['error','notApplicable','manual'].includes(audit.scoreDisplayMode ?? '') && metricNumber(audit.numericValue,metric)) {
      metrics[metric] = audit.numericValue;
    }
  }
  return metrics;
}

function distribution(samples: JsonObject[], metric: keyof typeof LAB_METRICS) {
  const values = samples
    .flatMap((sample) => {
      const value = asObject(sample.metrics)?.[metric];
      return sample.status === 'collected' && metricNumber(value,metric) ? [value] : [];
    })
    .sort((a,b) => a-b);
  const count = values.length;
  if (!count) return {count};
  const center = Math.floor(count / 2);
  const min = values[0];
  const max = values[count - 1];
  const median = count % 2 === 0 ? rounded(values[center - 1] / 2 + values[center] / 2) : values[center];
  return {count,median,min,max,spread:rounded(max-min)};
}

export function summarizeNavigationPage(page: string, planned: number, samples: JsonObject[]) {
  const succeeded = samples.filter((sample) => sample.status === 'collected').length;
  const failed = samples.filter((sample) => sample.status === 'failed').length;
  const metrics: Record<string,JsonObject> = {};
  for (const metric of metricNames) {
    const values = distribution(samples,metric);
    const summary: JsonObject = {unit:LAB_METRICS[metric].unit,count:values.count,missing:planned-values.count};
    if (values.median !== undefined) Object.assign(summary,{
      median:values.median,min:values.min,max:values.max,spread:values.spread,
    });
    metrics[metric] = summary;
  }
  return {page,planned,attempted:succeeded+failed,succeeded,failed,notRun:planned-succeeded-failed,samples,metrics};
}

function samplePages(measurements?: JsonObject): Map<string,JsonObject> {
  const navigation = asObject(measurements?.navigation);
  const entries = new Map<string,JsonObject>();
  const duplicates = new Set<string>();
  if (navigation?.method !== NAVIGATION_METHOD || navigation.policyVersion !== NAVIGATION_POLICY_VERSION || !Array.isArray(navigation.pages)) return entries;
  for (const entry of navigation.pages) {
    const item = asObject(entry);
    if (!item || typeof item.page !== 'string') continue;
    if (entries.has(item.page)) duplicates.add(item.page);
    entries.set(item.page,item);
  }
  for (const page of duplicates) entries.delete(page);
  return entries;
}

function sampleSet(record?: JsonObject): JsonObject[] {
  if (!record || !Array.isArray(record.samples) || record.samples.length > 5) return [];
  const samples = record.samples.map(asObject);
  return samples.every((sample,index): sample is JsonObject => sample?.index === index + 1) ? samples : [];
}

function measuredUrl(samples: JsonObject[]): string | undefined {
  const urls = new Set(samples.filter((sample) => sample.status === 'collected').map((sample) => sample.testedUrl));
  const url = urls.values().next().value;
  return urls.size === 1 && typeof url === 'string' ? url : undefined;
}

// Run this only after core baseline compatibility has checked target, scope, browser,
// driver, engine, and desktop profile. A compatible envelope can still lack valid
// samples or contain a different final document on a configured secondary page.
export function comparePerformanceMetrics(current: CollectorResult, baseline: PortableBaseline): MetricChange[] {
  const currentPages = samplePages(current.measurements);
  const baselinePages = samplePages(baseline.measurements);
  const configuredPages = baseline.identity.configuration.pages;
  const pages = new Set(Array.isArray(configuredPages) ?
    configuredPages.filter((page): page is string => typeof page === 'string') : []);
  const planned = baseline.identity.profile.samples;
  return [...pages].flatMap((page) => {
    const prior = baselinePages.get(page);
    const present = currentPages.get(page);
    const beforeSamples = sampleSet(prior);
    const afterSamples = sampleSet(present);
    const beforeUrl = measuredUrl(beforeSamples);
    const afterUrl = measuredUrl(afterSamples);
    return metricNames.map((metric): MetricChange => {
      const policy = LAB_METRICS[metric];
      const priorValues = distribution(beforeSamples,metric);
      const currentValues = distribution(afterSamples,metric);
      const before = priorValues.median;
      const after = currentValues.median;
      const beforeSpread = priorValues.spread;
      const afterSpread = currentValues.spread;
      const threshold = before === undefined ? undefined : rounded(Math.max(policy.minimumChange,before * RELATIVE_CHANGE_THRESHOLD));
      const delta = before === undefined || after === undefined ? undefined : rounded(after-before);
      const details = {
        page,metric,unit:policy.unit,
        ...(before !== undefined ? {before,beforeSpread} : {}),
        ...(after !== undefined ? {after,afterSpread} : {}),
        ...(delta !== undefined ? {delta} : {}),
        ...(threshold !== undefined ? {threshold} : {}),
      };
      const inconclusive = (reason: string): MetricChange => ({...details,status:'inconclusive',reason});
      if (prior?.planned !== planned || present?.planned !== planned ||
          priorValues.count !== planned || currentValues.count !== planned ||
          beforeSamples.length !== planned || afterSamples.length !== planned ||
          threshold === undefined || delta === undefined || beforeSpread === undefined || afterSpread === undefined) {
        return inconclusive(`Expected ${planned} comparable samples; baseline supplied ${priorValues.count}, current run supplied ${currentValues.count}.`);
      }
      if (!beforeUrl || beforeUrl !== afterUrl) {
        return inconclusive('Samples did not consistently measure the same final document URL in both runs.');
      }
      if (Math.max(beforeSpread,afterSpread) > threshold) {
        return inconclusive('The observed within-run spread exceeds the meaningful-change threshold.');
      }
      if (Math.abs(delta) < threshold) return {...details,status:'unchanged'};
      if (priorValues.max! >= currentValues.min! && currentValues.max! >= priorValues.min!) {
        return inconclusive('The observed sample ranges overlap or touch.');
      }
      const improved = policy.preferred === 'higher' ? delta > 0 : delta < 0;
      return {...details,status:improved ? 'improved' : 'regressed'};
    });
  });
}
