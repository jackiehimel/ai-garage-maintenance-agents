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
    limit: 'Automated accessibility check. See detected issues, recommended actions and checks that need human review.',
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
  return report.agentId==='accessibility' ? [['Flagged items',measured],['Human checks needed',reviews],['Completed checks',complete]] : [['Completed checks',complete],['Limited checks',limited],['Findings to review',report.findings.length]];
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
  if (report.agentId === 'accessibility') {
    const scope=element('details','supporting-details');scope.append(element('summary','','What this check covers'));
    paragraph(scope,'Automated and scripted checks do not establish WCAG conformance. The bounded keyboard sample does not check every interactive element, widget operation, other states or screen-reader behavior. Review coverage for outstanding human evaluation.');overview.append(scope);
  }
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

function accessibilityGroups(report) {
  const evidence = new Map(report.evidence.map(item => [item.id, item]));
  const grouped = new Map();
  for (const finding of report.findings) {
    const key = `${finding.disposition}:${finding.rule}`;
    if (!grouped.has(key)) grouped.set(key, { rule: finding.rule, disposition: finding.disposition, instances: [] });
    grouped.get(key).instances.push(finding);
  }
  const categories = [
    { disposition: 'finding', title: 'Automated checks found issues' },
    { disposition: 'review-needed', title: 'Human checks still needed' },
    { disposition: 'other', title: 'Other observations' },
  ];
  return categories.map(category => {
    const groups = [...grouped.values()].filter(group => category.disposition === 'other'
      ? !['finding', 'review-needed'].includes(group.disposition) : group.disposition === category.disposition);
    const instances = groups.flatMap(group => group.instances);
    const classify = finding => {
      const records = finding.evidenceIds.map(id => evidence.get(id)?.data).filter(Boolean);
      if (records.some(data => (Array.isArray(data.tags) && data.tags.some(tag => typeof tag === 'string' && /^wcag/i.test(tag))) || (Array.isArray(data.criteria) && data.criteria.length))) return 'wcag';
      if (records.some(data => Array.isArray(data.tags) && data.tags.includes('best-practice'))) return 'best-practice';
      return 'unspecified';
    };
    const wcag = instances.filter(finding => classify(finding) === 'wcag').length;
    const bestPractice = instances.filter(finding => classify(finding) === 'best-practice').length;
    let summary = `${instances.length} observations across ${groups.length} rules.`;
    if (category.disposition === 'finding') summary = `${instances.length} flagged items across ${groups.length} checks: ${wcag} items tied to accessibility requirements; ${bestPractice} best-practice suggestions.${instances.length > wcag + bestPractice ? ` ${instances.length - wcag - bestPractice} items have no recorded accessibility-requirement or best-practice tag.` : ''} Scanner impact is a tool rating, not business priority. These results do not establish WCAG conformance.`;
    if (category.disposition === 'review-needed') summary = `${instances.length} inconclusive items across ${groups.length} checks. These are not confirmed errors. A person must check the rendered page before deciding whether a change is needed.`;
    return { ...category, groups, summary };
  });
}

function accessibilityGuidance(rule, disposition) {
  const review = disposition === 'review-needed';
  const guidance = {
    'button-name': {
      title: 'Give buttons a name people can hear', owner: 'Developer',
      happened: 'The scanner found a button without a descriptive accessible name. People using a screen reader may not know what it does.',
      next: 'Give the icon-only control a concise, descriptive accessible name that explains its action.',
      confirm: 'Use the keyboard to reach the control and verify its name and operation with a screen reader; repeat the scan.',
    },
    'color-contrast': review ? {
      title: 'Check text contrast on the displayed background', owner: 'Designer / QA',
      happened: 'The scanner could not determine contrast. Inspect each recorded reason, including overlap, pseudo-elements, images, gradients or an unknown background where reported.',
      next: 'Measure the actual displayed foreground and background in the affected state. Change colors only if the contrast fails the threshold for that text size.',
      confirm: 'Record the measured ratio and applicable text-size threshold, then check the affected states again.',
    } : {
      title: 'Improve text contrast where the scanner found a failure', owner: 'Designer / developer',
      happened: 'The scanner measured text contrast below its applicable threshold. The text may be difficult to read.',
      next: 'Measure the displayed foreground and background, then adjust either color to meet the applicable text-size threshold. Choose the direction of the change from the measured colors.',
      confirm: 'Verify the resulting contrast ratio for the text size in each affected state and repeat the scan.',
    },
    'video-caption': {
      title: 'Check whether videos need captions', owner: 'Content owner',
      happened: 'The scanner could not determine whether these videos require captions.',
      next: 'Check whether each video contains speech or meaningful audio. Provide synchronized captions if required; do not mark silent decorative videos as missing captions.',
      confirm: 'Review caption accuracy, completeness and synchronization with meaningful audio; track presence alone cannot establish a pass or failure.',
    },
    'landmark-unique': {
      title: 'Make navigation areas easy to distinguish', owner: 'Developer',
      happened: 'The scanner found page landmarks that may be difficult to distinguish in assistive technology. This is a best-practice suggestion when tagged as such.',
      next: 'Review the purpose of each navigation area and give distinct navigation areas meaningful accessible labels.',
      confirm: 'Inspect the landmark list with a screen reader and verify that people can distinguish the navigation areas.',
    },
    region: {
      title: 'Review how content belongs to page sections', owner: 'Developer',
      happened: 'The scanner found content outside recognized page landmarks. Check its purpose before changing the page structure.',
      next: 'Check that meaningful content belongs to an appropriate page section. Review skip links as a special case; do not automatically wrap every flagged element.',
      confirm: 'Review the page sections and skip-link behavior with keyboard and screen-reader navigation; repeat the scan.',
    },
  };
  const known = Object.hasOwn(guidance, rule) ? guidance[rule] : null;
  if (known) return review && !['color-contrast', 'video-caption'].includes(rule) ? {
    ...known, happened: 'The scanner could not reach a conclusion for this rule. This instance needs a human check; it is not a confirmed error.',
    next: `Inspect the affected instance and rule evidence before making changes. If a barrier is confirmed: ${known.next}`,
  } : known;
  return {
    title: review ? 'Check an unresolved accessibility result' : disposition === 'finding' ? 'Investigate a scanner-reported accessibility issue' : 'Review an accessibility observation',
    owner: 'Developer / accessibility QA',
    happened: `The scanner recorded the rule “${rule}”. The available label alone does not explain the cause.${review ? ' The result is inconclusive.' : ''}`,
    next: 'Inspect each affected location, its scanner message and linked evidence to identify the cause. Make a correction only after confirming the issue.',
    confirm: 'Repeat the relevant rule check and manually verify the affected behavior after any change.',
  };
}

function groupLocation(instances) {
  const pages = new Set(instances.map(finding => finding.scope.page));
  const states = [...new Set(instances.map(finding => finding.scope.state).filter(Boolean))];
  return `${instances.length} affected item${instances.length === 1 ? '' : 's'} on ${pages.size} tested page${pages.size === 1 ? '' : 's'}${states.length ? ` · States: ${states.join(', ')}` : ''}. Expand the locations below for selectors and evidence.`;
}

function emptyFindingsSummary(report) {
  const titles = { 'seo-ai-search': 'Technical SEO & Discoverability', accessibility: 'Accessibility Regression', performance: 'Performance Regression' };
  const limited = report.coverage.filter(item => item.status === 'incomplete' || item.status === 'unavailable');
  const headline = report.collectionStatus === 'failed'
    ? 'Could not complete the scan — no reliable conclusion is available.'
    : report.collectionStatus === 'partial' || limited.length
      ? 'Scan incomplete — no confirmed issues in the available results.'
      : 'No issues detected by the completed checks.';
  const scope = `This report covers only ${titles[report.agentId]} checks on the requested pages and states. Zero reported issues does not mean the site is clean or that other maintenance areas were checked.`;
  const limitations = limited.map(item => {
    let explanation = item.reason || 'The scanner did not finish this check.';
    if (report.agentId === 'seo-ai-search' && /rendered/i.test(item.subject) && /rendered HTML missing|snapshot size limit/i.test(item.reason || '')) {
      explanation = 'The scanner could not capture the rendered page; rendered SEO checks were not completed.';
    } else if (report.agentId === 'seo-ai-search' && /sitemap/i.test(item.subject) && /limit|bounded|not fetched/i.test(item.reason || '')) {
      explanation = 'Sitemap inspection reached its limits; page membership remains unconfirmed.';
    }
    return { ...item, explanation };
  });
  return { headline, scope, limitations };
}

function renderFindings(root, report, anchors) {
  const findings = section(root, 'findings', 'Findings and observations');
  if (!report.findings.length) {
    const summary = emptyFindingsSummary(report);
    const empty = element('div', 'empty-findings');
    empty.append(element('h3', '', summary.headline));
    paragraph(empty, summary.scope);
    for (const item of summary.limitations) {
      const check = entry(empty, item.subject);
      paragraph(check, `${statusText(item.status)} · ${scopeText(item.scope)}`, 'meta');
      paragraph(check, item.explanation);
      if (item.reason && item.reason !== item.explanation) {
        const original = element('details', 'report-data');
        original.append(element('summary', '', 'Recorded limitation'), element('p', '', item.reason));
        check.append(original);
      }
    }
    findings.append(empty);
    return;
  }
  if (report.agentId === 'accessibility') {
    for (const category of accessibilityGroups(report)) {
      if (category.disposition === 'other' && !category.groups.length) continue;
      const categoryNode = element('div', 'finding-category');
      categoryNode.append(element('h3', '', category.title));
      paragraph(categoryNode, category.summary);
      findings.append(categoryNode);
      for (const group of category.groups) {
        const guide = accessibilityGuidance(group.rule, group.disposition);
        const card = element('article', 'report-entry finding-group');
        card.dataset.rule = group.rule;
        card.dataset.disposition = group.disposition;
        card.dataset.count = String(group.instances.length);
        card.append(element('h4', '', `${guide.title} · ${group.instances.length} item${group.instances.length === 1 ? '' : 's'}`));
        paragraph(card, guide.happened);
        paragraph(card, groupLocation(group.instances), 'meta');
        detailList(card, [['Suggested owner', guide.owner], ['Next step', guide.next], ['How to confirm', guide.confirm]]);
        const affected = element('details', 'affected-details');
        affected.append(element('summary', '', `Affected locations and evidence (${group.instances.length})`));
        for (const finding of group.instances) {
          const instance = element('div', 'affected-instance');
          paragraph(instance, scopeText(finding.scope));
          if (finding.disposition === 'review-needed') paragraph(instance, finding.investigate);
          referenceLine(instance, 'Evidence', finding.evidenceIds, anchors.evidence);
          referenceLine(instance, 'Coverage', finding.coverageIds, anchors.coverage);
          const technical = element('details', 'report-data');
          technical.append(element('summary', '', 'Technical details and original scanner text'));
          detailList(technical, [['Finding ID', finding.id], ['Rule', finding.rule], ['Disposition', finding.disposition],
            ...(finding.disposition === 'finding' ? [['Scanner severity (not business priority)', finding.severity]] : []),
            ['Owner priority', finding.ownerPriority], ['Original title', finding.title], ['Original investigation', finding.investigate],
            ['Original correction', finding.correct], ['Original recheck', finding.recheck]]);
          technical.append(element('pre', 'scanner-text', finding.summary));
          for (const id of finding.evidenceIds) {
            const record = report.evidence.find(item => item.id === id);
            if (record?.data) rawData(technical, 'Recorded scanner evidence (tags, target, markup and checks)', record.data);
          }
          instance.append(technical);
          affected.append(instance);
        }
        card.append(affected);
        categoryNode.append(card);
      }
    }
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
  const panel = section(root, 'assessment', 'AI interpretation');
  paragraph(panel, 'AI prose may contain errors. The measured results above are the source of truth; verify this draft against the affected locations before acting.', 'meta');
  const draft = element('details', 'ai-draft');
  draft.append(element('summary', '', 'AI interpretation — unverified draft'));
  panel.append(draft);
  if (assessment.truncated) paragraph(draft, 'The model received a capped subset of the available evidence.', 'meta');
  if (assessment.status === 'unavailable') {
    paragraph(draft, 'Assessment unavailable.');
    paragraph(draft, assessment.reason);
  } else {
    paragraph(draft, assessment.summary);
    if (!assessment.actions.length) paragraph(draft, 'The assessment did not propose any actions.');
  }
  detailList(draft, [
    ['Model', assessment.model], ['Input tokens', assessment.usage?.inputTokens], ['Output tokens', assessment.usage?.outputTokens],
  ]);
  referenceLine(draft, 'Evidence sent to the model', assessment.sentEvidenceIds, evidence);
  for (const action of assessment.actions ?? []) {
    const card = entry(draft, action.title);
    paragraph(card, `AI-suggested priority (unverified): ${statusText(action.priority)}`, 'meta');
    paragraph(card, action.rationale);
    itemList(card, action.steps, true);
    referenceLine(card, 'Supporting evidence', action.evidenceIds, evidence);
  }
}

function renderKeyboardProbe(root, report) {
  if (report.agentId !== 'accessibility') return;
  const panel=section(root,'keyboard-sample','Keyboard navigation sample');
  const stops={'step-limit':'Sample limit reached',repeat:'Focus sequence repeated','frame-boundary':'Stopped at embedded content','guard-blocked':'Stopped by the read-only guard',timeout:'Time limit reached',aborted:'Sample interrupted',error:'Sample could not finish',unavailable:'Sample unavailable'};
  const scopes=report.measurements?.keyboardProbe?.scopes;
  if (!Array.isArray(scopes) || !scopes.length) {paragraph(panel,'No keyboard navigation sample was recorded. Review keyboard order, visible focus and interaction behavior manually.');return;}
  for (const scope of scopes) {
    const card=entry(panel,`${scope.page} · ${scope.state}`);
    const steps=Array.isArray(scope.steps) ? scope.steps : [];
    const forward=steps.filter(step => step.key === 'Tab').length;
    paragraph(card,`${steps.length} observed focus steps: ${forward} forward, ${steps.length-forward} backward. Status: ${scope.status} · ${stops[scope.termination] ?? scope.termination}.`);
    paragraph(card,'We sampled keyboard focus on the initial page. Review the order and visible focus, then test controls and screen-reader behavior.');
    paragraph(card,`Sample bounds: up to ${scope.forwardLimit} forward Tabs and ${scope.reverseLimit} backward Tabs, within 8 seconds.`);paragraph(card,scope.reason);
    const sequence=element('ol','keyboard-sequence');
    for(const step of steps) {
      const focus=step.focus;
      const item=element('li','',`${step.key === 'Shift+Tab' ? 'Backward' : 'Forward'} · ${focus?.tag ?? 'No focused element'}${focus?.labelHint ? ' · '+focus.labelHint : ''}`);
      if(focus) rawData(item,'Technical focus details',focus);
      sequence.append(item);
    }
    const order=element('details','supporting-details');order.append(element('summary','','View recorded focus order'),sequence);card.append(order);
    const technical=element('details','supporting-details');technical.append(element('summary','','Sample scope and technical details'));
    paragraph(technical,scope.scopeLimit);paragraph(technical,`Elapsed: ${scope.elapsedMs} ms.`);card.append(technical);
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
  const coveragePanel = section(root, 'coverage', 'Coverage');
  const coverage = element('details', 'supporting-details');
  coverage.append(element('summary', '', `Recorded coverage entries (${report.coverage.length})`));
  coveragePanel.append(coverage);
  if (!report.coverage.length) paragraph(coverage, 'No coverage entries were returned.');
  for (const item of report.coverage) {
    const card = entry(coverage, item.subject, anchors.coverage.get(item.id));
    card.append(badge(statusText(item.status), item.status === 'complete' ? '' : 'warn'));
    paragraph(card, scopeText(item.scope), 'meta');
    paragraph(card, item.reason);
    detailList(card, [['Coverage ID', item.id]]);
    rawData(card, 'View coverage data', item.data);
  }
  const evidencePanel = section(root, 'evidence', 'Evidence and provenance');
  const evidence = element('details', 'supporting-details');
  evidence.append(element('summary', '', `Recorded evidence entries (${report.evidence.length})`));
  evidencePanel.append(evidence);
  if (!report.evidence.length) paragraph(evidence, 'No evidence was recorded.');
  for (const item of report.evidence) {
    const card = entry(evidence, item.kind.replaceAll('-', ' '), anchors.evidence.get(item.id));
    card.append(badge(statusText(item.source.kind)));
    paragraph(card, item.data?.rule ? `Rule: ${item.data.rule}` : item.summary, 'meta');
    paragraph(card, scopeText(item.scope), 'meta');
    if (item.data?.rule) { const original = element('details', 'report-data'); original.append(element('summary', '', 'Original scanner text'), element('pre', 'scanner-text', item.summary)); card.append(original); }
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
    ['findings', 'Findings'], ...(report.agentId === 'accessibility' ? [['keyboard-sample','Keyboard sample']] : []), ['comparison', 'Comparison'], ['assessment', 'AI assessment'], ['measurements', 'Measurements'],
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
  renderKeyboardProbe(root, report);
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
  const previousReportStatus = reportPanel.hidden ? '' : 'Showing the previous report.';
  runStatus.textContent = previousReportStatus;
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
  runStatus.textContent = `Preparing the run request… ${previousReportStatus}`.trimEnd();
  try {
    const request = { ...parseConfiguration(input), agentId, targetUrl };
    if (selectedBaseline) request.baseline = selectedBaseline;
    else if (file) request.baseline = await parseBaselineFile(file);
    if (activeRun !== current) return;
    const body = JSON.stringify(request);
    if (new Blob([body]).size > maxRequestBytes) throw new Error('Configuration and baseline together exceed the 3 MB request limit.');
    stage = 'running';
    const worker = runtimeMode === 'github-actions' ? ' through GitHub Actions' : '';
    runStatus.textContent = `Requested ${agents[agentId].title}${worker}. Waiting for the report… ${previousReportStatus}`.trimEnd();
    const response = await fetch('/api/run', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      signal: current.controller.signal, body,
    }).catch((error) => {
      if (error?.name === 'AbortError') throw error;
      throw new Error('Could not reach the local demo service. This run was not verified. Check that the demo is running and try again.');
    });
    const result = await response.json().catch((error) => {
      if (error?.name === 'AbortError') throw error;
      if (error?.name === 'TypeError') {
        throw new Error('The connection to the local demo service was interrupted before the report arrived. This run was not verified. Try again when the demo is available.');
      }
      return null;
    });
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
    runStatus.textContent = previousReportStatus;
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
    const health = response.ok ? await response.json() : null;
    const mode = health?.status === 'ok' && health.runtime?.mode;
    if (mode === 'github-actions') {
      runtimeState.textContent = 'Collection is configured to run on GitHub Actions. The target URL and optional collection settings are sent to the configured worker.';
    } else if (mode === 'local') {
      runtimeState.textContent = 'Collection is configured to run on the local server.';
    } else {
      throw new Error('Unexpected health response.');
    }
    runtimeMode = mode;
    runtimeState.append(' Browser availability is checked during the run.');
  } catch {
    runtimeState.textContent = 'Could not confirm a connection to the local demo service at page load. Running a check will try again.';
  }
}

updateBaselineSelection();
checkRuntime();
loadSavedReport();

