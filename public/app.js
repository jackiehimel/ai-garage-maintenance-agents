const form = document.querySelector('#run-form');
const controls = document.querySelector('#run-controls');
const urlField = document.querySelector('#target-url');
const configField = document.querySelector('#configuration');
const baselineField = document.querySelector('#baseline-file');
const baselineSelection = document.querySelector('#baseline-selection');
const clearBaseline = document.querySelector('#clear-baseline');
const advanced = document.querySelector('#advanced');
const runButton = document.querySelector('#run-button');
const runLabel = document.querySelector('#run-button-label');
const runStatus = document.querySelector('#run-status');
const runError = document.querySelector('#run-error');
const reportPanel = document.querySelector('#report');
const runtimeState = document.querySelector('#runtime-state');

const agents = {
  'seo-ai-search': {
    title: 'Technical SEO & Discoverability',
    limit: 'These checks do not establish actual indexing, rankings, traffic, or AI visibility.',
  },
  accessibility: {
    title: 'Accessibility Regression',
    limit: 'Automated and scripted checks do not establish WCAG conformance. Coverage identifies where human evaluation is still needed.',
  },
  performance: {
    title: 'Performance Regression',
    limit: 'Navigation measurements are lab data. Total Blocking Time (TBT) does not measure Interaction to Next Paint (INP).',
  },
};

const labels = {
  'first-run': 'First run',
  'not-configured': 'Not configured',
  'review-needed': 'Review needed',
  'export-only': 'Export only',
};

const metricNames = {
  'performance-score': 'Performance score',
  'first-contentful-paint': 'First Contentful Paint (FCP)',
  'largest-contentful-paint': 'Largest Contentful Paint (LCP)',
  'speed-index': 'Speed Index',
  'total-blocking-time': 'Total Blocking Time (TBT)',
  'cumulative-layout-shift': 'Cumulative Layout Shift (CLS)',
};

const allowedConfiguration = new Set(['pages', 'states', 'components', 'ownerPriorities', 'indexIntent', 'release', 'profile', 'supplied']);
const maxRequestBytes = 3_000_000;
const maxBaselineBytes = 2_500_000;
const maxImportBytes = 16_000_000;
const validRunId = (value) => typeof value === 'string' && /^run_[a-f0-9]{24}$/.test(value);
let baselineFromRun = null;
let activeRun = null;
let runtimeMode;

const statusText = (status) => Object.hasOwn(labels, status) ? labels[status] : String(status ?? '').replace(/^./, (char) => char.toUpperCase());
const metricTitle = (name) => Object.hasOwn(metricNames, name) ? metricNames[name] : name;
const defined = (value) => value !== undefined && value !== null && value !== '';
const scopeText = (scope) => scope ? [
  scope.page,
  scope.state && `State: ${scope.state}`,
  scope.component && `Component: ${scope.component}`,
  scope.element && `Element: ${scope.element}`,
].filter(Boolean).join(' · ') : '';
const safeSegment = (part) => encodeURIComponent(String(part));
const readableNumber = (value, unit) => value !== 0 && unit === 'unitless' && Math.abs(value) < 0.0001 ? (value < 0 ? '>−0.0001' : '<0.0001') : String(Number(value.toFixed(unit === 'unitless' ? 4 : unit === 'points' ? 0 : 1)));
const unitValue = (value, unit) => typeof value !== 'number' ? '—' : `${readableNumber(value, unit)}${unit && unit !== 'unitless' ? ` ${unit}` : ''}`;

function headlineMetrics(report) {
  const measured=report.findings.filter(f=>f.disposition==='finding').length;
  const reviews=report.findings.filter(f=>f.disposition==='review-needed').length;
  const complete=report.coverage.filter(c=>c.status==='complete').length;
  const limited=report.coverage.filter(c=>c.status==='incomplete'||c.status==='unavailable').length;
  if(report.agentId==='performance') {
    const page=report.measurements?.navigation?.pages?.[0];
    if(page) {
      const score=page.metrics?.['performance-score'], lcp=page.metrics?.['largest-contentful-paint'];
      return [['Median score',typeof score?.median==='number'?`${Math.round(score.median)} / 100`:'Unavailable'],['Largest paint',typeof lcp?.median==='number'?`${(lcp.median/1000).toFixed(2)} s`:'Unavailable'],['Samples collected',`${page.succeeded} / ${page.planned}`]];
    }
  }
  return report.agentId==='accessibility' ? [['Automated findings',measured],['Manual review items',reviews],['Completed checks',complete]] : [['Completed checks',complete],['Limited checks',limited],['Findings to review',report.findings.length]];
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (defined(content)) node.textContent = String(content);
  return node;
}

function paragraph(parent, content, className) {
  if (defined(content)) parent.append(element('p', className, content));
}

function itemList(parent, items, ordered = false) {
  if (!items?.length) return;
  const node = element(ordered ? 'ol' : 'ul', 'report-list');
  for (const item of items) node.append(element('li', '', item));
  parent.append(node);
}

function detailList(parent, pairs) {
  const details = element('dl', 'details-grid');
  for (const [name, value] of pairs) {
    if (defined(value)) details.append(element('dt', '', name), element('dd', '', value));
  }
  if (details.childElementCount) parent.append(details);
}

function rawData(parent, title, data) {
  if (data === undefined) return;
  const disclosure = element('details', 'report-data');
  disclosure.append(element('summary', '', title), element('pre', '', JSON.stringify(data, null, 2)));
  parent.append(disclosure);
}

function badge(text, tone) {
  const node = element('span', 'badge', text);
  if (tone) node.dataset.tone = tone;
  return node;
}

function referenceLine(parent, title, ids, anchors) {
  if (!ids?.length) return;
  const line = element('p', 'meta', `${title}: `);
  ids.forEach((id, index) => {
    if (index) line.append(', ');
    const code = element('code', '', id);
    const anchor = anchors.get(id);
    if (anchor) {
      const link = element('a');
      link.href = `#${anchor}`;
      link.append(code);
      line.append(link);
    } else line.append(code);
  });
  parent.append(line);
}

function section(parent, id, title) {
  const container = element('section', 'report-panel');
  container.id = id;
  const heading = element('h2', '', title);
  heading.id = `${id}-title`;
  container.setAttribute('aria-labelledby', heading.id);
  container.append(heading);
  parent.append(container);
  return container;
}

function entry(parent, title, id) {
  const container = element('article', 'report-entry');
  if (id) container.id = id;
  container.append(element('h3', '', title));
  parent.append(container);
  return container;
}

function table(parent, caption, columns, rows) {
  const scroll = element('div', 'table-scroll');
  const tableNode = element('table');
  const head = element('thead');
  const headingRow = element('tr');
  for (const name of columns) {
    const cell = element('th', '', name);
    cell.scope = 'col';
    headingRow.append(cell);
  }
  head.append(headingRow);
  const body = element('tbody');
  for (const row of rows) {
    const rowNode = element('tr');
    row.forEach((value, index) => {
      const cell = element(index === 0 ? 'th' : 'td', '', value);
      if (index === 0) cell.scope = 'row';
      rowNode.append(cell);
    });
    body.append(rowNode);
  }
  tableNode.append(element('caption', '', caption), head, body);
  scroll.append(tableNode);
  parent.append(scroll);
  if (columns.length > 3) {
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', caption);
  }
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = element('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

function downloadJson(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

function actionButton(parent, label, handler, secondary = false) {
  const node = element('button', `button${secondary ? ' secondary' : ''}`, label);
  node.type = 'button';
  node.addEventListener('click', handler);
  parent.append(node);
  return node;
}

function endpointDownload(parent, label, endpoint, filename, message) {
  const button = actionButton(parent, label, async () => {
    button.disabled = true;
    message.textContent = '';
    try {
      const result = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      if (!result.ok) throw new Error('Download unavailable. The file may no longer be retained on the server.');
      const blob = await result.blob();
      downloadBlob(blob, filename);
      message.textContent = `${label} download requested.`;
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Download unavailable.';
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function renderOverview(root, report, agent, runPath) {
  const overview = element('div', 'report-panel report-overview');
  const title = element('h2', '', agent.title);
  title.id = 'report-title';
  title.tabIndex = -1;
  const indicators = element('div', 'badges');
  const completed = report.coverage.filter((item) => item.status === 'complete').length;
  indicators.append(
    badge(`Collection: ${statusText(report.collectionStatus)}`, report.collectionStatus === 'failed' ? 'error' : report.collectionStatus === 'partial' ? 'warn' : ''),
    badge(`AI assessment: ${statusText(report.assessment.status)}`, report.assessment.status === 'unavailable' ? 'warn' : ''),
    badge(`Comparison: ${statusText(report.comparison.status)}`, report.comparison.status === 'incompatible' ? 'warn' : ''),
  );
  overview.append(element('p', 'eyebrow', 'Run report'), title, indicators);
  paragraph(overview, report.testedUrl, 'report-target');
  const highlights=element('div','metric-highlights');
  for(const [label,value] of headlineMetrics(report)) {
    const card=element('div','metric-highlight');card.append(element('strong','',value),element('span','',label));highlights.append(card);
  }
  overview.append(highlights);
  if(report.agentId==='performance')paragraph(overview,'Medians describe the first tested page. Review the sample spread before treating a difference as a change.','meta');
  paragraph(overview,`Checked ${new Date(report.completedAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}`,'meta');
  const runDetails=element('details','run-details');runDetails.append(element('summary','','Run details'));
  detailList(runDetails, [
    ['Submitted URL', report.submittedUrl], ['Tested URL', report.testedUrl], ['Run ID', report.runId],
    ['Started', report.startedAt], ['Finished', report.completedAt],
    ['Coverage', `${completed} of ${report.coverage.length} recorded entries marked complete`],
    ['Retention', statusText(report.retention.status)], ['Retention details', report.retention.reason],
  ]);
  overview.append(runDetails);
  paragraph(overview, agent.limit, 'meta');
  if (report.collectionStatus !== 'complete') {
    paragraph(overview, 'Collection did not finish across the requested scope. Review coverage and diagnostics before interpreting the results.', 'meta');
  }
  if (!report.baseline) paragraph(overview, `Baseline export unavailable: ${report.baselineUnavailableReason}`, 'meta');
  const exports = element('div', 'actions');
  const downloads = element('p', 'meta');
  downloads.setAttribute('role', 'status');
  endpointDownload(exports, 'Download HTML', `${runPath}/report.html`, `${report.runId}.html`, downloads);
  actionButton(exports, 'Download JSON', () => downloadJson(report, `${report.runId}.json`));
  if (report.baseline) {
    actionButton(exports, 'Download baseline', () => downloadJson(report.baseline, `${report.runId}-baseline.json`));
    actionButton(exports, 'Use as baseline', () => {
      baselineFromRun = { data: report.baseline, runId: report.runId };
      baselineField.value = '';
      updateBaselineSelection();
      advanced.open = true;
      urlField.focus();
    }, true);
  }
  overview.append(exports, downloads);
  root.append(overview);
  return title;
}

function renderFindings(root, report, anchors) {
  const findings = section(root, 'findings', 'Findings and observations');
  if (!report.findings.length) {
    paragraph(findings, 'No findings or observations were recorded. Check the coverage before drawing conclusions.');
    return;
  }
  for (const finding of report.findings) {
    const card = entry(findings, finding.title);
    const indicators = element('div', 'badges');
    indicators.append(badge(statusText(finding.disposition), finding.disposition === 'review-needed' ? 'warn' : ''),
      badge(`Severity: ${statusText(finding.severity)}`, ['critical', 'high'].includes(finding.severity) ? 'error' : ''));
    card.append(indicators);
    paragraph(card, finding.summary);
    paragraph(card, scopeText(finding.scope), 'meta');
    detailList(card, [
      ['Rule', finding.rule], ['Finding ID', finding.id], ['Owner priority', finding.ownerPriority],
      ['Investigate', finding.investigate], ['Proposed correction', finding.correct], ['Recheck', finding.recheck],
    ]);
    referenceLine(card, 'Evidence', finding.evidenceIds, anchors.evidence);
    referenceLine(card, 'Coverage', finding.coverageIds, anchors.coverage);
  }
}

function renderComparison(root, comparison) {
  const panel = section(root, 'comparison', 'Baseline comparison');
  if (comparison.status === 'first-run') paragraph(panel, 'First run. No baseline was supplied, so there are no change classifications.');
  if (comparison.status === 'incompatible') paragraph(panel, 'Incompatible baseline. The two runs cannot be used to classify changes.');
  if (comparison.status === 'compatible') {
    paragraph(panel, 'Compatible baseline. Individual changes may still be inconclusive when evidence is insufficient.');
    if (!comparison.findings.length && !comparison.metrics?.length) paragraph(panel, 'No finding or metric changes were reported.');
  }
  itemList(panel, comparison.reasons);
  for (const change of comparison.findings) {
    const item = entry(panel, change.after?.title ?? change.before?.title ?? change.id);
    item.append(badge(statusText(change.status), change.status === 'inconclusive' ? 'warn' : ''));
    paragraph(item, scopeText(change.after?.scope ?? change.before?.scope), 'meta');
    detailList(item, [
      ['Finding ID', change.id], ['Before', change.before?.summary], ['After', change.after?.summary], ['Reason', change.reason],
    ]);
  }
  if (comparison.metrics?.length) {
    table(panel, 'Metric changes', ['Metric and page', 'Result', 'Before', 'After', 'Delta', 'Threshold', 'Spread (before / after)'],
      comparison.metrics.map((change) => [
        `${metricTitle(change.metric)} · ${change.page}`,
        [statusText(change.status), change.reason].filter(Boolean).join(' · '),
        unitValue(change.before, change.unit), unitValue(change.after, change.unit), unitValue(change.delta, change.unit),
        unitValue(change.threshold, change.unit), `${unitValue(change.beforeSpread, change.unit)} / ${unitValue(change.afterSpread, change.unit)}`,
      ]));
  }
}

function renderAssessment(root, assessment, evidence) {
  const panel = section(root, 'assessment', 'AI assessment and proposed actions');
  if (assessment.status === 'unavailable') {
    paragraph(panel, 'Assessment unavailable.');
    paragraph(panel, assessment.reason);
  } else {
    paragraph(panel, assessment.summary);
    if (!assessment.actions.length) paragraph(panel, 'The assessment did not propose any actions.');
  }
  detailList(panel, [
    ['Model', assessment.model], ['Input tokens', assessment.usage?.inputTokens], ['Output tokens', assessment.usage?.outputTokens],
  ]);
  if (assessment.truncated) paragraph(panel, 'The model received a capped subset of the available evidence.', 'meta');
  referenceLine(panel, 'Evidence sent to the model', assessment.sentEvidenceIds, evidence);
  for (const action of assessment.actions ?? []) {
    const card = entry(panel, action.title);
    paragraph(card, `Suggested priority: ${statusText(action.priority)}`, 'meta');
    paragraph(card, action.rationale);
    itemList(card, action.steps, true);
    referenceLine(card, 'Supporting evidence', action.evidenceIds, evidence);
  }
}

function renderMeasurements(root, measurements) {
  const panel = section(root, 'measurements', 'Measurements');
  if (!measurements) {
    paragraph(panel, 'No structured measurements were returned.');
    return;
  }
  const pages = measurements.navigation?.pages;
  if (Array.isArray(pages)) {
    paragraph(panel, 'Lighthouse navigation lab results. The sample count and spread are shown separately for each metric.');
    for (const page of pages) {
      const card = entry(panel, page.page);
      detailList(card, [
        ['Planned', page.planned], ['Attempted', page.attempted], ['Collected', page.succeeded], ['Failed', page.failed], ['Not run', page.notRun],
      ]);
      const metrics = Object.entries(page.metrics ?? {});
      if (metrics.length) {
        table(card, 'Navigation lab metric distributions', ['Metric', 'Median', 'Min', 'Max', 'Spread', 'Samples / planned'],
          metrics.map(([name, metric]) => [
            metricTitle(name), unitValue(metric.median, metric.unit), unitValue(metric.min, metric.unit),
            unitValue(metric.max, metric.unit), unitValue(metric.spread, metric.unit), `${metric.count} / ${page.planned}`,
          ]));
      }
    }
  } else {
    detailList(panel, Object.entries(measurements)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()), value]));
  }
  rawData(panel, 'View complete measurement data', measurements);
}

function renderEvidence(root, report, anchors) {
  const coverage = section(root, 'coverage', 'Coverage');
  if (!report.coverage.length) paragraph(coverage, 'No coverage entries were returned.');
  for (const item of report.coverage) {
    const card = entry(coverage, item.subject, anchors.coverage.get(item.id));
    card.append(badge(statusText(item.status), item.status === 'complete' ? '' : 'warn'));
    paragraph(card, scopeText(item.scope), 'meta');
    paragraph(card, item.reason);
    detailList(card, [['Coverage ID', item.id]]);
    rawData(card, 'View coverage data', item.data);
  }
  const evidence = section(root, 'evidence', 'Evidence and provenance');
  if (!report.evidence.length) paragraph(evidence, 'No evidence was recorded.');
  for (const item of report.evidence) {
    const card = entry(evidence, item.kind.replaceAll('-', ' '), anchors.evidence.get(item.id));
    card.append(badge(statusText(item.source.kind)));
    paragraph(card, item.summary);
    paragraph(card, scopeText(item.scope), 'meta');
    detailList(card, [
      ['Evidence ID', item.id], ['Source', item.source.name], ['Source reference', item.source.reference],
      ['Observed at', item.source.observedAt], ['Evidence key', item.key],
    ]);
    rawData(card, 'View evidence data', item.data);
    referenceLine(card, 'Raw artifacts', item.artifactIds, anchors.artifacts);
  }
}

function renderRunDetails(root, report, anchors, runPath) {
  const diagnostics = section(root, 'diagnostics', 'Diagnostics');
  if (report.diagnostics?.length) itemList(diagnostics, report.diagnostics);
  else paragraph(diagnostics, 'No diagnostics were recorded.');
  const artifacts = section(root, 'artifacts', 'Raw artifacts');
  if (!report.artifacts.length) paragraph(artifacts, 'No raw artifacts are listed for this run.');
  else if (report.retention.status !== 'saved') paragraph(artifacts, 'Some raw files may not be available because retention is limited.');
  for (const item of report.artifacts) {
    const card = entry(artifacts, item.label, anchors.artifacts.get(item.id));
    detailList(card, [
      ['Artifact ID', item.id], ['Media type', item.mediaType], ['Size (bytes)', item.byteLength], ['Scope', scopeText(item.scope)],
    ]);
    const message = element('p', 'meta');
    message.setAttribute('role', 'status');
    endpointDownload(card, 'Download raw artifact', `${runPath}/artifacts/${safeSegment(item.id)}`, item.id+(item.mediaType==='application/json'?'.json':item.mediaType==='application/gzip'?'.json.gz':''), message);
    card.append(message);
  }
  const configuration = section(root, 'run-configuration', 'Run configuration and runtime');
  detailList(configuration, [
    ['Node', report.runtime.node], ['Browser', report.runtime.browser],
    ['Engine', report.runtime.engine], ['Browser driver', report.runtime.browserDriver],
  ]);
  rawData(configuration, 'View normalized configuration', report.configuration);
}

function renderReport(report) {
  const agent = agents[report.agentId];
  const root = document.createDocumentFragment();
  const runPath = `/api/runs/${safeSegment(report.runId)}`;
  const anchors = {};
  for (const key of ['evidence', 'coverage', 'artifacts']) {
    anchors[key] = new Map(report[key].map((item, index) => [item.id, `run-${key}-${index + 1}`]));
  }
  const title = renderOverview(root, report, agent, runPath);
  const nav = element('nav', 'report-nav');
  nav.setAttribute('aria-label', 'Report sections');
  for (const [id, text] of [
    ['findings', 'Findings'], ['comparison', 'Comparison'], ['assessment', 'AI assessment'], ['measurements', 'Measurements'],
    ['coverage', 'Coverage'], ['evidence', 'Evidence'], ['diagnostics', 'Diagnostics'], ['artifacts', 'Raw artifacts'],
    ['run-configuration', 'Configuration'],
  ]) {
    const link = element('a', '', text);
    link.href = `#${id}`;
    nav.append(link);
  }
  root.append(nav);
  renderFindings(root, report, anchors);
  renderComparison(root, report.comparison);
  renderAssessment(root, report.assessment, anchors.evidence);
  renderMeasurements(root, report.measurements);
  renderEvidence(root, report, anchors);
  renderRunDetails(root, report, anchors, runPath);
  reportPanel.replaceChildren(root);
  reportPanel.hidden = false;
  if (document.activeElement === document.body || document.activeElement === runButton) title.focus();
}

function updateBaselineSelection() {
  const file = baselineField.files?.[0];
  baselineSelection.textContent = baselineFromRun ? `Baseline selected: ${baselineFromRun.runId}` :
    file ? `Selected file: ${file.name}` : '';
  clearBaseline.hidden = !baselineFromRun && !file;
}

baselineField.addEventListener('change', () => {
  baselineFromRun = null;
  updateBaselineSelection();
});
clearBaseline.addEventListener('click', () => {
  baselineFromRun = null;
  baselineField.value = '';
  updateBaselineSelection();
  baselineField.focus();
});

function parseConfiguration(input) {
  if (!input.trim()) return {};
  let parsed;
  try { parsed = JSON.parse(input); }
  catch { throw new Error('Additional configuration must be valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Additional configuration must be a JSON object.');
  const invalid = Object.keys(parsed).filter((key) => !allowedConfiguration.has(key));
  if (invalid.length) throw new Error(`Unsupported configuration field: ${invalid[0]}. Use the agent, URL, and baseline controls for those inputs.`);
  return parsed;
}

async function parseBaselineFile(file) {
  if (file.size > maxImportBytes) throw new Error('This import file exceeds 16 MB. Try a standalone baseline export.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error('The baseline file must contain valid JSON.'); }
  const baseline = parsed?.baseline ?? parsed;
  if (!baseline || baseline.schemaVersion !== 1 || !baseline.identity || !Array.isArray(baseline.findings)) {
    throw new Error('The file must contain a portable baseline. A report without an exportable baseline cannot be used.');
  }
  if (new Blob([JSON.stringify(baseline)]).size > maxBaselineBytes) throw new Error('The baseline exceeds the 2.5 MB size limit.');
  return baseline;
}

function setBusy(busy, label = 'Running…') {
  controls.disabled = busy;
  runLabel.textContent = busy ? label : 'Run check';
  runStatus.dataset.running = String(busy);
}

function showError(message) {
  runError.hidden = false;
  runError.textContent = message;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeRun) return;
  runError.hidden = true;
  runError.textContent = '';
  runStatus.textContent = '';
  const targetUrl = urlField.value.trim();
  if (!/^https:\/\/[^/@?#:\s\\]+(?:[/?#][^\u0000-\u0020\u007f\\]*)?$/i.test(targetUrl)) {
    showError('Enter a public HTTPS URL without credentials or an explicit port.');
    urlField.focus();
    return;
  }
  const agentId = new FormData(form).get('agent');
  if (!Object.hasOwn(agents, agentId)) {
    showError('Choose an agent to run.');
    return;
  }
  const input = configField.value;
  const file = baselineField.files?.[0];
  const selectedBaseline = baselineFromRun?.data;
  const current = { controller: new AbortController() };
  activeRun = current;
  setBusy(true);
  let stage = 'preparing';
  runStatus.textContent = 'Preparing the run request…';
  try {
    const request = { ...parseConfiguration(input), agentId, targetUrl };
    if (selectedBaseline) request.baseline = selectedBaseline;
    else if (file) request.baseline = await parseBaselineFile(file);
    if (activeRun !== current) return;
    const body = JSON.stringify(request);
    if (new Blob([body]).size > maxRequestBytes) throw new Error('Configuration and baseline together exceed the 3 MB request limit.');
    stage = 'running';
    reportPanel.hidden = true;
    reportPanel.replaceChildren();
    const worker = runtimeMode === 'github-actions' ? ' through GitHub Actions' : '';
    runStatus.textContent = `Requested ${agents[agentId].title}${worker}. Waiting for the report…`;
    const response = await fetch('/api/run', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      signal: current.controller.signal, body,
    });
    const result = await response.json().catch(() => null);
    if (activeRun !== current) return;
    if (!response.ok) {
      const description = typeof result?.error === 'string' ? result.error : typeof result?.message === 'string' ? result.message : '';
      throw new Error(description || `The server could not run the check (HTTP ${response.status}).`);
    }
    if (!isReport(result) || result.agentId !== agentId) throw new Error('The server did not return a valid report.');
    setBusy(false);
    renderReport(result);
    const address = new URL(window.location.href);
    address.searchParams.set('run', result.runId);
    window.history.replaceState(null, '', address);
    runStatus.textContent = reportStatus('Report returned', result);
  } catch (error) {
    if (activeRun !== current) return;
    runStatus.textContent = '';
    showError(error instanceof Error && error.name !== 'AbortError' ? error.message : 'The run did not return a report.');
    if (stage === 'preparing') {
      advanced.open = true;
      setBusy(false);
      if (!file || error?.message?.includes('configuration')) configField.focus();
      else baselineField.focus();
    }
  } finally {
    if (activeRun === current) {
      activeRun = null;
      setBusy(false);
    }
  }
});

window.addEventListener('pagehide', () => {
  if (activeRun) {
    const current = activeRun;
    activeRun = null;
    current.controller.abort();
    setBusy(false);
    runStatus.textContent = '';
  }
});

function isReport(value) {
  return value?.schemaVersion === 1 && validRunId(value.runId) && Object.hasOwn(agents, value.agentId) &&
    typeof value.submittedUrl === 'string' && Array.isArray(value.findings) && Array.isArray(value.evidence) &&
    Array.isArray(value.coverage) && Array.isArray(value.artifacts) && value.comparison && value.assessment &&
    value.retention && value.runtime && value.configuration;
}

function reportStatus(prefix, result) {
  return `${prefix}. Collection: ${statusText(result.collectionStatus)}. AI assessment: ${statusText(result.assessment.status)}.`;
}

function restoreRunInputs(result) {
  const agent = [...form.querySelectorAll('input[name="agent"]')].find((option) => option.value === result.agentId);
  if (agent) agent.checked = true;
  urlField.value = result.submittedUrl;
  const configuration = result.configuration;
  const extras = {};
  for (const key of ['states', 'components', 'ownerPriorities', 'indexIntent']) {
    if (Array.isArray(configuration[key]) && configuration[key].length) extras[key] = configuration[key];
  }
  const pages = configuration.pages?.filter((page) => page.url !== configuration.targetUrl || page.label);
  if (pages?.length) extras.pages = pages;
  if (configuration.release) extras.release = configuration.release;
  if (configuration.supplied) extras.supplied = configuration.supplied;
  if (result.agentId === 'performance' && [4, 5].includes(configuration.profile?.samples)) {
    extras.profile = { samples: configuration.profile.samples };
  }
  configField.value = Object.keys(extras).length ? JSON.stringify(extras, null, 2) : '';
}

async function loadSavedReport() {
  const runId = new URLSearchParams(window.location.search).get('run');
  if (runId === null) return;
  if (!validRunId(runId)) {
    showError('The report link has an invalid run ID.');
    return;
  }
  const current = { controller: new AbortController() };
  activeRun = current;
  setBusy(true, 'Loading report…');
  runStatus.textContent = 'Loading the saved report…';
  try {
    const response = await fetch(`/api/runs/${runId}/report.json`, {
      credentials: 'same-origin', cache: 'no-store', signal: current.controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (activeRun !== current) return;
    if (!response.ok || !isReport(result) || result.runId !== runId) {
      throw new Error('This report is unavailable on the current server. You can start a new check.');
    }
    restoreRunInputs(result);
    setBusy(false);
    renderReport(result);
    runStatus.textContent = reportStatus('Saved report loaded', result);
  } catch (error) {
    if (activeRun !== current) return;
    runStatus.textContent = '';
    showError(error instanceof Error ? error.message : 'The saved report could not be loaded.');
  } finally {
    if (activeRun === current) {
      activeRun = null;
      setBusy(false);
    }
  }
}

async function checkRuntime() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return;
    const health = await response.json();
    runtimeMode = health.runtime?.mode;
    if (runtimeMode === 'github-actions') {
      runtimeState.textContent = 'Collection runs on GitHub Actions. The target URL and optional collection settings are sent to the configured worker.';
    } else if (runtimeMode === 'local') {
      runtimeState.textContent = 'Collection runs on the local server.';
    }
    if (health.runtime?.browserReady === false) {
      runtimeState.append(' Browser readiness is not confirmed. A run may return limited evidence.');
    }
  } catch {
    // The run request provides an actionable server response if the health check is unavailable.
  }
}

updateBaselineSelection();
checkRuntime();
loadSavedReport();
