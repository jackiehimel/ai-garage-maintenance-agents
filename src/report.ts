import type { AgentId, AgentReport, Finding, JsonObject, JsonValue, Scope } from './core/types.js';

const names: Record<AgentId, string> = {
  'seo-ai-search': 'Technical SEO & Discoverability',
  accessibility: 'Accessibility Regression',
  performance: 'Performance Regression',
};
const limits: Record<AgentId, string> = {
  'seo-ai-search': 'Checks on the tested pages do not establish actual indexing, rankings, traffic, or AI visibility.',
  accessibility: 'Automated and scripted checks do not establish WCAG conformance. Review the coverage entries for outstanding human evaluation.',
  performance: 'Navigation lab measurements describe this test profile, not real-user experience. Total Blocking Time (TBT) does not measure Interaction to Next Paint (INP).',
};

const metricNames: Record<string, string> = {
  'performance-score': 'Performance score',
  'first-contentful-paint': 'First Contentful Paint (FCP)',
  'largest-contentful-paint': 'Largest Contentful Paint (LCP)',
  'speed-index': 'Speed Index',
  'total-blocking-time': 'Total Blocking Time (TBT)',
  'cumulative-layout-shift': 'Cumulative Layout Shift (CLS)',
};
const metricTitle = (name: string) => Object.hasOwn(metricNames, name) ? metricNames[name] : name;
const readableNumber = (value:number,unit:JsonValue|undefined) => value!==0 && unit==='unitless' && Math.abs(value)<0.0001 ? (value<0?'>−0.0001':'<0.0001') : String(Number(value.toFixed(unit==='unitless'?4:unit==='points'?0:1)));
const metricValue = (value: JsonValue | undefined, unit: JsonValue | undefined) => typeof value !== 'number'
  ? '—' : esc(typeof unit === 'string' && unit !== 'unitless' ? `${readableNumber(value,unit)} ${unit}` : readableNumber(value,unit));
const asObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
const paragraph = (value: unknown) => value == null || value === '' ? '' : `<p>${esc(value)}</p>`;
const json = (value: unknown) => value === undefined ? '' : `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
const section = (title: string, contents: string) => `<section><h2>${esc(title)}</h2>${contents}</section>`;
const label = (name: string, value: unknown) => value == null || value === '' ? '' : `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`;
const list = (items: string[], ordered = false) => {
  const tag = ordered ? 'ol' : 'ul';
  return items.length ? `<${tag}>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</${tag}>` : '';
};
const scopeLine = (scope: Scope) => [
  scope.page, scope.state && `State: ${scope.state}`, scope.component && `Component: ${scope.component}`,
  scope.element && `Element: ${scope.element}`,
].filter(Boolean).join(' · ');

function referenceLine(title: string, ids: string[], anchors: Map<string, string>) {
  if (!ids.length) return '';
  return `<p class="references">${esc(title)}: ${ids.map((id) => {
    const anchor = anchors.get(id);
    return anchor ? `<a href="#${anchor}"><code>${esc(id)}</code></a>` : `<code>${esc(id)}</code>`;
  }).join(', ')}</p>`;
}

function renderFinding(finding: Finding, evidence: Map<string, string>, coverage: Map<string, string>) {
  return `<article><h3>${esc(finding.title)}</h3>
    <p class="meta">${esc(finding.severity)} · ${esc(finding.disposition)} · ${esc(finding.rule)}</p>
    ${paragraph(finding.summary)}<p class="meta">${esc(scopeLine(finding.scope))}</p>
    <dl>${label('Finding ID', finding.id)}${label('Owner priority', finding.ownerPriority)}
      ${label('Investigate', finding.investigate)}${label('Proposed correction', finding.correct)}${label('Recheck', finding.recheck)}</dl>
    ${referenceLine('Evidence', finding.evidenceIds, evidence)}${referenceLine('Coverage', finding.coverageIds, coverage)}</article>`;
}

function renderComparison(report: AgentReport) {
  const comparison = report.comparison;
  const headline = {
    'first-run': 'First run. No baseline was provided, so there are no change classifications.',
    incompatible: 'Incompatible baseline. Compare runs with matching scope, settings, and runtime.',
    compatible: 'Compatible baseline. Individual changes may still be inconclusive when evidence is insufficient.',
  }[comparison.status];
  return section('Baseline comparison', `${paragraph(headline)}${list(comparison.reasons)}
    ${comparison.findings.map((item) => `<article><h3>${esc(item.after?.title ?? item.before?.title ?? item.id)}</h3>
      <p class="meta">${esc(item.status)} · ${esc(item.id)}</p>
      ${item.before ? `<p><strong>Before:</strong> ${esc(item.before.summary)}</p>` : ''}
      ${item.after ? `<p><strong>After:</strong> ${esc(item.after.summary)}</p>` : ''}${paragraph(item.reason)}
      ${item.before || item.after ? `<details><summary>Comparison finding data</summary>${json({ before: item.before, after: item.after })}</details>` : ''}</article>`).join('')}
    ${comparison.metrics?.length ? `<div class="table"><table><caption>Metric changes</caption><thead><tr>
      <th scope="col">Metric / page</th><th scope="col">Result</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Delta</th><th scope="col">Threshold</th><th scope="col">Spread (before / after)</th>
      </tr></thead><tbody>${comparison.metrics.map((item) => {
        const metric = (value: number | undefined) => metricValue(value, item.unit);
        return `<tr><th scope="row">${esc(metricTitle(item.metric))}<br><small>${esc(item.page)}</small></th>
          <td>${esc(item.status)}${item.reason ? `<br><small>${esc(item.reason)}</small>` : ''}</td>
          <td>${metric(item.before)}</td><td>${metric(item.after)}</td><td>${metric(item.delta)}</td><td>${metric(item.threshold)}</td>
          <td>${metric(item.beforeSpread)} / ${metric(item.afterSpread)}</td></tr>`;
      }).join('')}</tbody></table></div>` : ''}
    ${comparison.status === 'compatible' && !comparison.findings.length && !comparison.metrics?.length ? paragraph('No finding or metric changes were reported for this comparison.') : ''}`);
}

function renderAssessment(report: AgentReport, evidence: Map<string, string>) {
  const result = report.assessment;
  const name = 'AI assessment and proposed actions';
  const disclosure = result.truncated ? paragraph('The model received a capped subset of the available evidence.') : '';
  if (result.status === 'unavailable') {
    return section(name, `${paragraph('Assessment unavailable.')}${paragraph(result.reason)}
      <dl>${label('Model', result.model)}</dl>${disclosure}
      ${referenceLine('Evidence sent', result.sentEvidenceIds ?? [], evidence)}`);
  }
  return section(name, `${paragraph(result.summary)}
    <dl>${label('Model', result.model)}${label('Input tokens', result.usage?.inputTokens)}${label('Output tokens', result.usage?.outputTokens)}</dl>
    ${disclosure}${referenceLine('Evidence sent', result.sentEvidenceIds, evidence)}
    ${result.actions.map((action) => `<article><h3>${esc(action.title)}</h3>
      <p class="meta">Suggested priority: ${esc(action.priority)}</p>${paragraph(action.rationale)}${list(action.steps, true)}
      ${referenceLine('Supporting evidence', action.evidenceIds, evidence)}</article>`).join('') || paragraph('The assessment did not propose any actions.')}`);
}

function renderMeasurements(measurements: JsonObject | undefined) {
  const title = 'Measurements';
  if (!measurements) return section(title, paragraph('No structured measurements were returned.'));
  const pages = asObject(measurements.navigation)?.pages;
  if (!Array.isArray(pages) || !pages.length) return section(title, json(measurements));
  const distributions = pages.flatMap((pageValue) => {
    const page = asObject(pageValue);
    if (!page) return [];
    const metrics = Object.entries(asObject(page.metrics) ?? {}).flatMap(([name, value]) => {
      const metric = asObject(value);
      if (!metric) return [];
      const format = (number: JsonValue | undefined) => metricValue(number, metric.unit);
      return [`<tr><th scope="row">${esc(metricTitle(name))}</th><td>${format(metric.median)}</td>
        <td>${format(metric.min)}</td><td>${format(metric.max)}</td><td>${format(metric.spread)}</td>
        <td>${esc(metric.count)} / ${esc(page.planned)}</td></tr>`];
    });
    return [`<article><h3>${esc(page.page)}</h3><dl>${label('Planned', page.planned)}${label('Attempted', page.attempted)}
      ${label('Collected', page.succeeded)}${label('Failed', page.failed)}${label('Not run', page.notRun)}</dl>
      ${metrics.length ? `<div class="table"><table><caption>Navigation lab metric distributions</caption><thead><tr>
        <th scope="col">Metric</th><th scope="col">Median</th><th scope="col">Min</th><th scope="col">Max</th>
        <th scope="col">Spread</th><th scope="col">Samples / planned</th>
      </tr></thead><tbody>${metrics.join('')}</tbody></table></div>` : ''}</article>`];
  });
  return section(title, distributions.join('') + `<details><summary>Complete measurement data</summary>${json(measurements)}</details>`);
}

export function renderReport(report: AgentReport): string {
  const evidence = new Map(report.evidence.map((item, index) => [item.id, `evidence-${index + 1}`]));
  const coverage = new Map(report.coverage.map((item, index) => [item.id, `coverage-${index + 1}`]));
  const artifacts = new Map(report.artifacts.map((item, index) => [item.id, `artifact-${index + 1}`]));
  const coverageCount = report.coverage.filter((item) => item.status === 'complete').length;
  let cards:Array<[string,string|number]>=[['Completed checks',coverageCount],['Limited checks',report.coverage.filter(c=>c.status==='incomplete'||c.status==='unavailable').length],['Findings to review',report.findings.length]];
  if(report.agentId==='accessibility')cards=[['Automated findings',report.findings.filter(f=>f.disposition==='finding').length],['Manual review items',report.findings.filter(f=>f.disposition==='review-needed').length],['Completed checks',coverageCount]];
  const pages=asObject(report.measurements?.navigation)?.pages;
  if(report.agentId==='performance'&&Array.isArray(pages)&&pages[0]){
    const page=asObject(pages[0]);const metrics=asObject(page?.metrics),score=asObject(metrics?.['performance-score']),lcp=asObject(metrics?.['largest-contentful-paint']);
    if(page)cards=[['Median score',typeof score?.median==='number'?`${Math.round(score.median)} / 100`:'Unavailable'],['Largest paint',typeof lcp?.median==='number'?`${(lcp.median/1000).toFixed(2)} s`:'Unavailable'],['Samples collected',`${page.succeeded} / ${page.planned}`]];
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${esc(names[report.agentId])} · Solvd Website Maintenance</title>
<style>
:root{color-scheme:light;--paper:#faf8f4;--card:#fffefb;--ink:#22261f;--muted:#4d5245;--accent:#1f5c3f;--forest:#143d2a;--soft:#e7f0ea;--rule:#dedfd3}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}main,header>div{width:min(960px,calc(100% - 36px));margin:auto}header{padding:32px 0;background:var(--forest);color:var(--paper)}h1{font-size:clamp(1.75rem,5vw,2.65rem);line-height:1.15;margin:.3em 0 .1em}h2,h3{line-height:1.2;margin:.1em 0 .5em}h2{font-size:1.5rem}h3{font-size:1.09rem}p{margin:.65em 0}main{padding:26px 0 56px}section{margin:0 0 18px;padding:clamp(16px,4vw,28px);background:var(--card);border:1px solid var(--rule);border-radius:14px}article{padding:16px 0;border-top:1px solid var(--rule);scroll-margin-top:12px}article:last-child{padding-bottom:0}article:target{outline:2px solid var(--accent);outline-offset:4px}dl{display:grid;grid-template-columns:fit-content(38%) minmax(0,1fr);gap:5px 12px;margin:12px 0}dl:empty{display:none}dt{font-weight:650}dd{margin:0}pre{padding:12px;background:var(--soft);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:8px}pre,code{font-size:.86em}small,.meta,.references{color:var(--muted);font-size:.9em}.eyebrow{font-size:.76rem;letter-spacing:.13em;text-transform:uppercase;font-weight:700}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.91em;text-align:left}caption{text-align:left;font-weight:700;margin:0 0 8px}td,th{padding:8px;vertical-align:top;border-bottom:1px solid var(--rule)}a{color:var(--accent);text-underline-offset:3px}a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media print{header{background:none;color:var(--ink)}main,header>div{width:100%}section{border-radius:0;background:none}article{break-inside:avoid}}
.highlights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0}.highlight{padding:16px 12px;background:#ffffff16;border:1px solid #ffffff33;border-radius:10px}.highlight strong{display:block;font-size:clamp(1.2rem,3vw,2rem);line-height:1.2}.highlight span{display:block;margin-top:8px;font-size:.78rem;color:#d1e5d6}summary{cursor:pointer}
@media(max-width:480px){.highlights{grid-template-columns:1fr;gap:7px}.highlight{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px}.highlight strong{font-size:1.5rem;white-space:nowrap}.highlight span{margin:0;text-align:right}}
</style></head><body>
<header><div><p class="eyebrow">Solvd · Website Maintenance</p><h1>${esc(names[report.agentId])}</h1><p>${esc(report.testedUrl)}</p>
<div class="highlights">${cards.map(([label,value])=>`<div class="highlight"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>
${report.agentId==='performance'?'<p>Medians describe the first tested page. Review sample spread before treating a difference as a change.</p>':''}
<p>Collection: ${esc(report.collectionStatus)} · AI assessment: ${esc(report.assessment.status)} · Comparison: ${esc(report.comparison.status)}</p></div></header>
<main>
${section('Run overview', `<details><summary>Run details and coverage</summary><dl>${label('Run ID', report.runId)}${label('Submitted URL', report.submittedUrl)}${label('Tested URL', report.testedUrl)}
  ${label('Started', report.startedAt)}${label('Finished', report.completedAt)}
  ${label('Collection status', report.collectionStatus)}${label('Assessment status', report.assessment.status)}
  ${label('Coverage', `${coverageCount} of ${report.coverage.length} recorded coverage entries marked complete`)}
  ${label('Retention', report.retention.status)}${label('Retention details', report.retention.reason)}
  ${label('Baseline export', report.baseline ? 'Available in the run’s JSON exports.' : report.baselineUnavailableReason)}
  </dl></details>${paragraph(limits[report.agentId])}`)}
${section('Findings and observations', report.findings.map((item) => renderFinding(item, evidence, coverage)).join('')
  || paragraph('No findings or observations were recorded. Check the coverage before drawing conclusions.'))}
${renderComparison(report)}
${renderAssessment(report, evidence)}
${renderMeasurements(report.measurements)}
${section('Coverage', report.coverage.map((item) => `<article id="${coverage.get(item.id)}"><h3>${esc(item.subject)}</h3>
  <p class="meta">${esc(item.status)} · ${esc(item.id)} · ${esc(scopeLine(item.scope))}</p>
  ${paragraph(item.reason)}${json(item.data)}</article>`).join('') || paragraph('No coverage entries were returned.'))}
${section('Evidence and provenance', report.evidence.map((item) => `<article id="${evidence.get(item.id)}"><h3>${esc(item.kind)}</h3>
  ${paragraph(item.summary)}<p class="meta">${esc(scopeLine(item.scope))}</p>
  <dl>${label('Evidence ID', item.id)}${label('Source type', item.source.kind)}${label('Source', item.source.name)}
  ${label('Source reference', item.source.reference)}${label('Observed at', item.source.observedAt)}${label('Evidence key', item.key)}</dl>
  ${json(item.data)}${referenceLine('Raw artifacts', item.artifactIds ?? [], artifacts)}</article>`).join('') || paragraph('No evidence was recorded.'))}
${section('Diagnostics', list(report.diagnostics ?? []) || paragraph('No diagnostics were recorded.'))}
${section('Raw artifact inventory', (report.artifacts.length ? paragraph('Raw files are separate downloads. This offline report embeds the report evidence and identifies any artifacts associated with the run.') : paragraph('No raw artifacts were recorded.')) +
  report.artifacts.map((item) => `<article id="${artifacts.get(item.id)}"><h3>${esc(item.label)}</h3>
    <dl>${label('Artifact ID', item.id)}${label('Media type', item.mediaType)}${label('Size (bytes)', item.byteLength)}
    ${label('Scope', item.scope && scopeLine(item.scope))}</dl></article>`).join(''))}
${section('Run configuration and runtime', `${json(report.configuration)}<dl>
  ${label('Node', report.runtime.node)}${label('Browser', report.runtime.browser)}${label('Engine', report.runtime.engine)}
  ${label('Browser driver', report.runtime.browserDriver)}</dl>`)}
</main></body></html>`;
}
