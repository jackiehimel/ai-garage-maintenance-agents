import PDFDocument from 'pdfkit';
import { AGENT_IDS } from './core/types.js';
import { accessibilityGroups } from './report.js';
import type { AgentId, AgentReport, Finding, JsonValue } from './core/types.js';

const names: Record<AgentId, string> = {
  'seo-ai-search': 'SEO & discoverability', accessibility: 'Accessibility', performance: 'Performance',
};
const limits: Record<AgentId, string> = {
  'seo-ai-search': 'Public-page checks do not establish actual indexing, search rankings, traffic or AI visibility.',
  accessibility: 'Automatic checks and sampled keyboard navigation do not establish full WCAG conformance. Review-needed items are not confirmed defects.',
  performance: 'These are desktop navigation lab measurements, not real-user field performance. Total Blocking Time does not measure Interaction to Next Paint.',
};
const metricNames: Record<string, string> = {
  'performance-score': 'Performance score', 'largest-contentful-paint': 'Largest Contentful Paint',
  'first-contentful-paint': 'First Contentful Paint', 'total-blocking-time': 'Total Blocking Time',
  'speed-index': 'Speed Index', 'cumulative-layout-shift': 'Cumulative Layout Shift',
};
const priorityOrder = ['critical', 'high', 'medium', 'low', 'info'];
const colors = { ink: '#182C25', green: '#1E5C40', muted: '#56665E', line: '#DCE5DF', pale: '#EFF5F0', white: '#FFFFFF' };

// Standard PDF fonts preserve western text; unsupported glyphs are shown by code point
// rather than silently disappearing or producing an unrelated glyph.
function printable(input: string): string {
  return input.normalize('NFC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\n\t]/gu, (char) => `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`);
}
function record(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function count(report: AgentReport, disposition: Finding['disposition']): number {
  return report.findings.filter((finding) => finding.disposition === disposition).length;
}
function counts(report: AgentReport): string {
  const automatic = count(report, 'finding'); const review = count(report, 'review-needed');
  return `${automatic} automatic flag${automatic === 1 ? '' : 's'} | ${review} item${review === 1 ? '' : 's'} need${review === 1 ? 's' : ''} human review`;
}
function date(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') : value;
}
function groups(report: AgentReport): Finding[][] {
  const grouped = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    const key = JSON.stringify([finding.rule, finding.disposition, finding.ownerPriority ?? finding.severity, finding.investigate, finding.correct, finding.recheck]);
    const group = grouped.get(key) ?? []; group.push(finding); grouped.set(key, group);
  }
  return [...grouped.values()].sort((a, b) =>
    (a[0].disposition === 'finding' ? 0 : a[0].disposition === 'review-needed' ? 1 : 2) -
    (b[0].disposition === 'finding' ? 0 : b[0].disposition === 'review-needed' ? 1 : 2) ||
    priorityOrder.indexOf(a[0].ownerPriority ?? a[0].severity) - priorityOrder.indexOf(b[0].ownerPriority ?? b[0].severity));
}
function metricValue(value: JsonValue | undefined, unit: JsonValue | undefined, name: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  if (name === 'performance-score') return `${Math.round(value)} / 100`;
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Number(value.toFixed(1))} ms`;
  return `${Number(value.toPrecision(4))}${unit && unit !== 'unitless' ? ` ${unit}` : ''}`;
}
function baseline(report: AgentReport): string {
  if (report.comparison.status === 'first-run') return 'First run: no previous baseline was compared.';
  if (report.comparison.status === 'incompatible') return `No valid change conclusion: the selected baseline is incompatible. ${report.comparison.reasons.join(' ')}`;
  const changes = report.comparison.findings;
  const summary = ['new', 'persistent', 'resolved', 'inconclusive'].map((status) => `${changes.filter((change) => change.status === status).length} ${status}`).join(', ');
  return `Compatible baseline compared. Finding changes: ${summary}.`;
}

export async function renderCombinedPdf(reports: AgentReport[], options: { scope?: 'all' | 'selected' } = {}): Promise<Buffer> {
  if (!reports.length || reports.length > 3) throw new Error('Supply one to three reports.');
  if (new Set(reports.map((report) => report.agentId)).size !== reports.length) throw new Error('Duplicate agent reports are not allowed.');
  if (new Set(reports.map((report) => report.submittedUrl)).size !== 1) throw new Error('Reports must have the same target URL.');
  if (reports.some((report) => !AGENT_IDS.includes(report.agentId))) throw new Error('Unknown report agent.');
  const ordered = AGENT_IDS.filter((id) => options.scope === 'all' || reports.some((report) => report.agentId === id));
  const byAgent = new Map(reports.map((report) => [report.agentId, report]));
  const target = reports[0].submittedUrl;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 96, bottom: 64, left: 46, right: 46 }, autoFirstPage: false, bufferPages: true,
    info: { Title: 'Solvd Website Maintenance Report', Author: 'Solvd', Subject: target, Creator: 'Solvd maintenance agents' } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => { doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const width = 503.28; const left = 46; const bottom = 768;
  doc.on('pageAdded', () => {
    doc.font('Helvetica-Bold').fontSize(25).fillColor(colors.green).text('solvd.', left, 34, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text('WEBSITE MAINTENANCE', 330, 43, { width: 219, align: 'right', lineBreak: false });
    doc.moveTo(left, 77).lineTo(left + width, 77).strokeColor(colors.line).lineWidth(0.7).stroke();
    doc.x = left; doc.y = 99;
  });
  function ensure(height: number) { if (doc.y + height > bottom) doc.addPage(); }
  function text(value: string, size = 10, color = colors.ink, bold = false, gap = 6) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
    const content = printable(value);
    ensure(Math.min(doc.heightOfString(content, { width, lineGap: 2 }), 50));
    doc.text(content, left, doc.y, { width, lineGap: 2 }); doc.y += gap;
  }
  function heading(value: string) { ensure(56); doc.y += 10; text(value, 14, colors.green, true, 9); }
  function label(value: string, content: string) { text(`${value}: ${content}`, 9.5, colors.ink, false, 6); }
  function rule() { doc.y += 4; ensure(14); doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(colors.line).lineWidth(0.5).stroke(); doc.y += 12; }
  function agentTitle(id: AgentId) { text(names[id], 25, colors.ink, true, 8); }

  doc.addPage();
  text('YOUR WEBSITE, AT A GLANCE', 9, colors.green, true, 12);
  text('Maintenance report', 30, colors.ink, true, 10);
  text(target, 12, colors.muted, false, 10);
  text('A summary of collected evidence, recommended follow-up and what still needs checking.', 11, colors.ink, false, 16);
  for (const id of ordered) {
    const report = byAgent.get(id); ensure(82);
    const y = doc.y;
    doc.roundedRect(left, y, width, 68, 5).fill(colors.pale);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.green).text(names[id], left + 14, y + 12, { width: width - 28 });
    doc.font('Helvetica').fontSize(9.5).fillColor(colors.ink).text(printable(report ? `${report.collectionStatus.toUpperCase()}  |  ${counts(report)}` : 'No report returned - this agent is not assessed.'), left + 14, y + 34, { width: width - 28 });
    doc.y = y + 81; doc.x = left;
  }
  heading('What to do next');
  const priorities = reports.flatMap((report) => groups(report).filter((group) => group[0].disposition === 'finding' || group[0].disposition === 'review-needed').map((group) => ({ report, group })))
    .sort((a, b) => (a.group[0].disposition === 'finding' ? 0 : 1) - (b.group[0].disposition === 'finding' ? 0 : 1) || priorityOrder.indexOf(a.group[0].ownerPriority ?? a.group[0].severity) - priorityOrder.indexOf(b.group[0].ownerPriority ?? b.group[0].severity));
  if (!priorities.length) text(reports.some((report) => report.collectionStatus === 'failed' || !report.coverage.some((entry) => entry.status === 'complete'))
    ? 'No findings can be prioritized from these results. Review failed or incomplete collection before drawing conclusions.'
    : 'No issues detected in completed checks. Review the coverage limits before deciding whether further investigation is needed.');
  for (const { report, group } of priorities.slice(0, 3)) {
    const first = group[0];
    text(`${names[report.agentId]}: ${first.title} (${group.length} ${group.length === 1 ? 'item' : 'items'}${first.disposition === 'review-needed' ? ', needs human review' : ''})`, 10, colors.ink, true, 3);
    text(first.disposition === 'finding' ? first.correct ?? first.investigate ?? 'Review the recorded evidence and agree the next action.' : first.investigate ?? 'Review the recorded evidence before treating this as a defect.', 9.5, colors.muted, false, 9);
  }
  if (priorities.length > 3) text(`${priorities.length - 3} more grouped items appear in the agent sections.`, 9, colors.muted);
  if (ordered.some((id) => !byAgent.has(id))) text('Follow up on missing agents before treating this as a three-agent review.', 9.5, colors.ink, true);
  text('Flags are automatic findings, not a count of confirmed site defects. Fixes require separate review and authorization.', 9, colors.muted);
  text('This PDF summarizes saved runs. Open each source run in the app for all evidence, raw collection notes and baseline exports.', 8.5, colors.muted);

  for (const id of ordered) {
    doc.addPage(); agentTitle(id);
    const report = byAgent.get(id);
    if (!report) {
      text('No report returned', 14, colors.green, true);
      text('This agent has no saved result in this report. It may have failed or not run. No result is treated as a pass.');
      text(`Next action: run ${names[id]} again from the app.`);
      text(limits[id], 9.5, colors.muted); continue;
    }
    text(`${report.collectionStatus.toUpperCase()}  |  ${counts(report)}`, 10, colors.green, true);
    label('Collected', date(report.completedAt));
    text(`Source run: ${report.runId}`, 8, colors.muted);
    if (report.testedUrl !== report.submittedUrl) label('Final tested URL', report.testedUrl);
    label('Scope', `${report.configuration.pages.length} configured page${report.configuration.pages.length === 1 ? '' : 's'}; ${report.configuration.states.length} additional configured state${report.configuration.states.length === 1 ? '' : 's'}.`);
    text(limits[id], 9, colors.muted);
    if (id === 'accessibility') {
      for (const category of accessibilityGroups(report).filter((item) => item.disposition !== 'other')) text(category.summary, 9, colors.muted);
    }
    const measured = count(report, 'finding'); const reviews = count(report, 'review-needed');
    if (!measured && !reviews) text(report.collectionStatus === 'failed' ? 'Collection failed. There is not enough evidence to assess this page.' : report.coverage.some((entry) => entry.status === 'complete') ? 'No issues detected in completed checks.' : 'No completed checks were returned. This page has not been assessed.', 11, colors.ink, true);
    if (id === 'performance') {
      const navigation = record(report.measurements?.navigation);
      const pages = Array.isArray(navigation?.pages) ? navigation.pages : [];
      if (pages.length) heading('Measured performance');
      for (const value of pages) {
        const page = record(value); if (!page) continue;
        text(String(page.page ?? report.testedUrl), 10, colors.ink, true);
        text(`${page.succeeded ?? 0} of ${page.planned ?? '?'} samples collected. Values below are medians, with observed sample ranges.`, 9, colors.muted);
        const metrics = record(page.metrics);
        for (const [name, raw] of Object.entries(metrics ?? {})) {
          const metric = record(raw); if (!metric) continue;
          label(metricNames[name] ?? name, `${metricValue(metric.median, metric.unit, name)} (range ${metricValue(metric.min, metric.unit, name)} to ${metricValue(metric.max, metric.unit, name)})`);
        }
      }
    }
    heading('Change since the previous run');
    text(baseline(report), 9.5);
    for (const metric of report.comparison.metrics ?? []) label(metricNames[metric.metric] ?? metric.metric, `${metric.status}${metric.reason ? `. ${metric.reason}` : ''}`);
    heading('Findings and follow-up');
    const allGroups = groups(report);
    if (!allGroups.length) text('No finding records were returned. Completed checks and gaps are listed below.', 9.5);
    for (const group of allGroups) {
      const first = group[0]; ensure(100);
      const disposition = first.disposition === 'finding' ? 'AUTOMATIC FLAG' : first.disposition === 'review-needed' ? 'HUMAN REVIEW' : first.disposition.toUpperCase();
      text(`${disposition}  |  ${group.length} ${group.length === 1 ? 'instance' : 'instances'}  |  ${first.ownerPriority ? `${first.ownerPriority.toUpperCase()} owner-supplied priority` : `${first.severity.toUpperCase()} scanner severity`}`, 8.5, colors.green, true, 5);
      text(first.title, 12, colors.ink, true, 6);
      text(group.length > 1 ? `Example observation: ${first.summary}` : first.summary, 9.5);
      const scopes = [...new Set(group.map((finding) => [finding.scope.page, finding.scope.state && `state ${finding.scope.state}`, finding.scope.component && `component ${finding.scope.component}`, finding.scope.element].filter(Boolean).join(' | ')))];
      label('Where', scopes.slice(0, 3).join('\n'));
      if (scopes.length > 3) text(`Plus ${scopes.length - 3} other affected locations. The full per-agent report contains every instance.`, 8.5, colors.muted);
      if (first.investigate) label('Investigate', first.investigate);
      if (first.correct) label(first.disposition === 'finding' ? 'Suggested correction' : 'Correction to consider after review', first.correct);
      if (first.recheck) label('Verify', first.recheck);
      rule();
    }
    heading('Coverage and remaining checks');
    const completed = report.coverage.filter((entry) => entry.status === 'complete');
    const gaps = report.coverage.filter((entry) => entry.status !== 'complete');
    text(`${completed.length} completed checks. ${gaps.length} ${gaps.length === 1 ? 'check' : 'checks'} limited, unavailable or not configured.`, 9.5);
    const subjects = [...new Set(completed.map((entry) => entry.subject))];
    if (subjects.length) label('Completed', subjects.join('; '));
    for (const entry of gaps) label(`${entry.subject} (${entry.status.replaceAll('-', ' ')})`, `${entry.reason ?? 'No further detail recorded.'} Page: ${entry.scope.page}`);
    if (report.assessment.status === 'available' && report.assessment.groundingVersion === 1) {
      heading('AI proposals - unverified');
      text('Model-generated interpretation and possible next steps. Review them against the evidence before acting; they do not add confirmed findings.', 9, colors.muted);
      text(report.assessment.interpretation?.text ?? report.assessment.summary, 9.5);
      for (const action of report.assessment.actions) {
        ensure(70); text(action.title, 10, colors.ink, true); text(action.rationale, 9.5);
        for (const step of action.steps) text(`- ${step}`, 9.5);
        if (action.verification) label('Proposed verification', action.verification);
      }
      if (report.assessment.truncated) text('The model received a bounded evidence subset. Review the complete per-agent report for omitted details.', 9, colors.muted);
    } else text(report.assessment.status === 'available' ? 'AI output from this older report is omitted because it predates the current evidence-grounding checks. Rerun the agent for a current assessment.' : `AI assessment unavailable: ${report.assessment.reason}`, 9, colors.muted);
  }
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(left, 795).lineTo(left + width, 795).strokeColor(colors.line).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(colors.muted).text('SOLVD  |  Evidence-led maintenance review', left, 807, { width: 350, lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, 420, 807, { width: 129, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return output;
}
