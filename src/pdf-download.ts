import { AGENT_IDS } from './core/types.js';
import type { AgentReport } from './core/types.js';

export class PdfDownloadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function loadPdfReports(
  params: URLSearchParams,
  read: (id: string) => Promise<AgentReport | undefined>,
): Promise<{reports: AgentReport[]; scope: 'all' | 'selected'}> {
  const ids = (params.get('runs') ?? '').split(',');
  const scope = params.get('scope') ?? 'selected';
  if (ids.length > 3 || ids.some(id => !/^run_[a-f0-9]{24}$/.test(id)) ||
      new Set(ids).size !== ids.length || !['all','selected'].includes(scope)) {
    throw new PdfDownloadError('Invalid report selection. Select one to three saved agent reports.');
  }
  const reports: AgentReport[] = [];
  for (const id of ids) {
    const report = await read(id);
    if (!report || report.runId !== id || !AGENT_IDS.includes(report.agentId)) {
      throw new PdfDownloadError('A selected report is unavailable. Return to the app and reopen the saved results.', 404);
    }
    reports.push(report);
  }
  if (new Set(reports.map(report => report.submittedUrl)).size !== 1) {
    throw new PdfDownloadError('Combined reports must use the same submitted URL.');
  }
  if (new Set(reports.map(report => report.agentId)).size !== reports.length) {
    throw new PdfDownloadError('Choose only one report per agent.');
  }
  return {reports, scope: scope as 'all' | 'selected'};
}
