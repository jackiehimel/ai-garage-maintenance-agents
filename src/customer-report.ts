import { parse } from 'node-html-parser';
import { AGENT_IDS } from './core/types.js';
import type { AgentId, AgentReport, Evidence, Finding, JsonValue } from './core/types.js';

export type CustomerTone = 'good' | 'attention' | 'limited';
export interface CustomerFinding {
  title: string; impact: string; where: string[]; recommendation: string; owner: string; effort: string;
  verification: string; count: number; kind: 'finding' | 'review' | 'observation';
}
export interface CustomerSection {
  agentId: AgentId; title: string; rating: { label: string; tone: CustomerTone; score?: number; basis: string };
  headline: string; scope: string; findings: CustomerFinding[]; reviewGroups: { title: string; count: number; body: string }[];
  positives: string[]; metrics: { label: string; value: string; interpretation: string; tone: CustomerTone }[];
  sampleScores: { label: string; values: number[] }[]; limits: string; comparison?: string;
  agentAssessment?: { label: string; text: string; note: string };
  images: { runId: string; artifactId: string; caption: string; dataUrl?: string }[];
}
export interface CustomerReport {
  targetUrl: string; dateLabel: string; headline: string; sections: CustomerSection[];
  nextStep: { title: string; body: string; items: string[] }; key: string;
}
const titles: Record<AgentId, string> = { 'seo-ai-search': 'SEO & discoverability', accessibility: 'Accessibility', performance: 'Performance' };
function obj(value: unknown): Record<string, JsonValue> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {}; }
function list(value: unknown): JsonValue[] { return Array.isArray(value) ? value : []; }
function str(value: unknown): string { return typeof value === 'string' ? value : ''; }
function num(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function successfulSample(sample: Record<string, JsonValue>): boolean {
  return sample.status === 'collected' || (sample.status === undefined && Object.values(obj(sample.metrics)).some(value => num(value) !== undefined));
}
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function plural(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? '' : 's'}`; }
function pageLabel(url: string): string {
  try { const u = new URL(url); const path = decodeURIComponent(u.pathname).replace(/\/$/, ''); return path ? path : 'Homepage'; } catch { return 'Tested page'; }
}
function evidenceFor(report: AgentReport, finding: Finding): Evidence[] { return report.evidence.filter(e => finding.evidenceIds.includes(e.id)); }
function checks(evidence: Evidence): Record<string, JsonValue>[] {
  const data = obj(evidence.data), groups = obj(data.checks);
  return [...list(groups.any), ...list(groups.all), ...list(groups.none), ...list(data.observedChecks)].map(obj);
}
function requirement(report: AgentReport, finding: Finding): boolean {
  return evidenceFor(report, finding).some(e => list(obj(e.data).criteria).length || list(obj(e.data).tags).some(t => typeof t === 'string' && /^wcag/i.test(t)));
}
function bestPractice(report: AgentReport, finding: Finding): boolean {
  return !requirement(report, finding) && evidenceFor(report, finding).some(e => list(obj(e.data).tags).includes('best-practice'));
}
function elementName(report: AgentReport, finding: Finding): string {
  for (const evidence of evidenceFor(report, finding)) {
    const data = obj(evidence.data), html = str(data.html);
    if (str(data.componentLabel)) return str(data.componentLabel).slice(0, 100);
    if (!html) continue;
    const node = parse(html).firstElementChild;
    if (!node) continue;
    const label = node.getAttribute('aria-label') || node.getAttribute('alt') || node.textContent.trim();
    if (label && label.length < 100) return label.replace(/\s+/g, ' ');
    if (node.tagName === 'BUTTON' && /(?:icon|btn|button)[-_]close|close[-_](?:icon|btn|button)/i.test(html)) return 'Close button';
    if (node.tagName === 'BUTTON') return 'Unnamed button';
    if (node.tagName === 'NAV') return 'Navigation group';
    if (node.tagName === 'VIDEO') return 'Video';
    if (node.tagName === 'INPUT') return 'Form field';
    if (node.tagName === 'IMG') return 'Image';
  }
  return pageLabel(finding.scope.page);
}
function affected(report: AgentReport, findings: Finding[]): string[] {
  return unique(findings.map(f => `${elementName(report, f)}${elementName(report,f) === pageLabel(f.scope.page) ? '' : ` (${pageLabel(f.scope.page)})`}`));
}
function baseFinding(report: AgentReport, group: Finding[], title: string, impact: string, recommendation: string, owner: string, effort: string, verification: string): CustomerFinding {
  const first = group[0];
  return { title, impact, recommendation, owner, effort, verification, count: group.length, where: affected(report, group),
    kind: first.disposition === 'finding' ? bestPractice(report, first) ? 'observation' : 'finding' : first.disposition === 'review-needed' ? 'review' : 'observation' };
}
function grouped(findings: Finding[]): Finding[][] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) { const key = `${f.rule}:${f.disposition}`; const group = map.get(key) ?? []; group.push(f); map.set(key, group); }
  return [...map.values()];
}
function comparison(report: AgentReport): string {
  if (report.comparison.status === 'first-run') return 'This is a starting point for tracking improvement; no earlier run was compared.';
  if (report.comparison.status === 'incompatible') return 'The earlier run used different conditions, so a reliable change comparison is not available.';
  const metrics = report.comparison.metrics ?? [];
  const changed = report.comparison.findings;
  const parts: string[] = [];
  const uncertain = metrics.filter(m => m.status === 'inconclusive').length;
  if (uncertain) parts.push(`${plural(uncertain,'metric comparison')} ${uncertain === 1 ? 'is' : 'are'} inconclusive; the samples do not establish a reliable change.`);
  for (const [status, label] of [['improved','improved'],['regressed','slower'],['unchanged','similar']] as const) {
    const n = metrics.filter(m => m.status === status).length; if (n) parts.push(`${plural(n,'metric')} ${label} under comparable test conditions.`);
  }
  for (const [status, label] of [['new','new'],['persistent','still present'],['resolved','no longer detected']] as const) {
    const n = changed.filter(f => f.status === status).length; if (n) parts.push(`${plural(n,'recorded item')} ${label}.`);
  }
  return parts.join(' ') || 'No new or resolved findings were recorded against the comparable earlier run.';
}
function blank(agentId: AgentId): CustomerSection {
  return { agentId, title: titles[agentId], rating: { label: 'Not assessed', tone:'limited',basis:'No usable result returned' },
    headline: 'A result is still needed before judging this area.', scope:'No completed assessment', findings:[],reviewGroups:[],positives:[],metrics:[],sampleScores:[],images:[],
    limits:'This area has not been assessed. Solvd can rerun the check before discussing its results.' };
}
function a11y(report: AgentReport, section: CustomerSection): void {
  const usableScan = report.evidence.some(e => (e.kind === 'axe-summary' && Array.isArray(obj(e.data).passes)) || ['axe-violation','axe-review','axe-incomplete'].includes(e.kind));
  if (!usableScan) {
    section.rating = {label:'Not enough evidence',tone:'limited',basis:'Automatic accessibility checks did not return a usable result'};
    section.headline = 'More accessibility evidence is needed before judging this page.';
    section.scope = 'Supporting navigation checks alone do not assess page accessibility.';
    section.limits = 'Repeat the accessibility scan and follow up with assistive-technology checks.';
    return;
  }
  const automatic = report.findings.filter(f => f.disposition === 'finding');
  const wcag = automatic.filter(f => requirement(report,f)).length;
  const bp = automatic.filter(f => bestPractice(report,f)).length;
  const other = automatic.length - wcag - bp;
  const reviews = report.findings.filter(f => f.disposition === 'review-needed');
  section.rating = { label:automatic.length ? 'Needs attention' : reviews.length ? 'Review recommended' : 'Sample checks look sound', tone:automatic.length || reviews.length ? 'attention' : 'good',
    basis:`${plural(wcag,'finding')} tied to accessibility requirements${bp ? `; ${plural(bp,'best-practice suggestion')}` : ''}${other ? `; ${plural(other,'additional finding')}` : ''}` };
  section.headline = automatic.length ? `${wcag} measured findings tied to accessibility requirements${bp ? ` and ${bp} best-practice suggestions` : ''}${other ? `, plus ${other} additional findings` : ''} need attention.` : reviews.length ? 'Some accessibility questions need a person to check them.' : 'No accessibility problems were detected by the completed automatic checks.';
  for (const group of grouped(report.findings.filter(f => f.disposition !== 'review-needed'))) {
    const rule = group[0].rule;
    const make = (title:string,impact:string,action:string,owner='Website developer',effort='Focused change',verification='Repeat the check and confirm the affected element works with assistive technology.') => baseFinding(report,group,title,impact,action,owner,effort,verification);
    if (rule === 'button-name' || rule === 'link-name') {
      const control = rule === 'button-name' ? 'button' : 'link';
      section.findings.push(make(`${plural(group.length,control)} without a screen-reader name`, `A screen-reader user may hear an unnamed ${control}, making its purpose unclear.`, `Give each ${control} a short, descriptive accessible name that matches its purpose.`, 'Website developer', 'Focused change', 'Read the control with a screen reader and confirm its name and operation.'));
    } else if (rule === 'color-contrast') {
      const values = unique(group.flatMap(f => evidenceFor(report,f).flatMap(e => checks(e).map(c => {
        const data = obj(c.data), ratio = num(data.contrastRatio), target = str(data.expectedContrastRatio);
        return ratio !== undefined && target ? `${Number(ratio.toFixed(2))}:1 contrast against a ${target} minimum` : '';
      }))));
      section.findings.push(make(`${plural(group.length,'text element')} with weak contrast`, `Some text is harder to read for people with low vision.${values.length ? ` Measured: ${values.join('; ')}.` : ''}`, 'Adjust text or background colors while preserving the design, then check the resulting contrast.', 'Design + development', 'Focused style change', 'Measure contrast again on each affected element and check hover and focus states.'));
    } else if (rule === 'landmark-unique') {
      section.findings.push(make('Navigation groups could be easier to distinguish', 'Similar navigation regions can be harder to identify when jumping around the page with a screen reader.', 'Review the navigation groups and give repeated groups distinct, meaningful names where useful.', 'Accessibility specialist + developer', 'Focused review', 'Use the screen-reader landmark list to check that the groups are understandable.'));
    } else if (rule === 'region') {
      section.findings.push(make('Review the page structure for screen-reader navigation', 'Some content sits outside the main page regions. Its context determines whether this creates a navigation problem.', 'Review the affected content in the page structure. Preserve working skip links; change the structure only where it improves navigation.', 'Accessibility specialist', 'Focused review', 'Navigate the page by headings and regions and verify the skip link.'));
    } else if (rule === 'image-alt') {
      section.findings.push(make('Images need a text alternative', 'People who cannot see an informative image may miss its meaning.', 'Describe meaningful images in text; mark purely decorative images so screen readers skip them.', 'Content owner + developer'));
    } else if (rule === 'label') {
      section.findings.push(make('Form fields need clear labels', 'People using assistive technology may not know what to enter.', 'Connect a descriptive label to each affected field and keep instructions visible.', 'Design + development'));
    } else {
      section.findings.push(make('Additional accessibility checks need attention', `${plural(group.length,'recorded item')} require context before deciding the best change.`, 'Have an accessibility specialist inspect these locations and identify the user impact before changing the page.', 'Accessibility specialist', 'Investigation first'));
    }
  }
  const buckets = new Map<string, {title:string;count:number;body:string}>();
  for (const f of reviews) {
    const messages = evidenceFor(report,f).flatMap(e => checks(e).map(c => str(c.message))).join(' ');
    let key='other', title='Additional accessibility checks',body='Solvd can inspect these locations with assistive technology and identify which changes are needed.';
    if (f.rule === 'color-contrast') {
      if (/pseudo[- ]element/i.test(messages)) { key='contrast-overlay';title='Contrast on decorative or overlay elements'; body='Automatic testing could not determine the background behind these elements. A Solvd review can measure the visible text and background by hand.'; }
      else if (/overlap/i.test(messages)) { key='contrast-overlap';title='Contrast where elements overlap';body='Overlapping elements prevented an automatic measurement. A Solvd review can check the visible colors in context.'; }
      else { key='contrast-other';title='Contrast that needs a visual check';body='Automatic testing could not reach a contrast conclusion. Solvd can verify the visible text and background in context.'; }
    } else if (f.rule === 'video-caption') {key='video';title='Video and caption needs';body='Solvd can check which videos contain speech or meaningful audio and whether captions are needed and available. Silent decorative video does not automatically require captions.';}
    const bucket=buckets.get(key) ?? {title,count:0,body}; bucket.count++;buckets.set(key,bucket);
  }
  section.reviewGroups = [...buckets.values()];
  section.limits = `Automatic checks${report.evidence.some(e=>e.kind==='keyboard-probe')?' and a keyboard sample':''} cover part of accessibility; a full WCAG assessment also needs human review.`;
}
function seo(report: AgentReport, section: CustomerSection): void {
  const quality = report.evidence.filter(e => e.kind === 'seo.page-quality');
  const pages = unique(quality.map(e => e.scope.page));
  const metadata = report.evidence.filter(e => /seo\.(rendered|source)-metadata/.test(e.kind) && !str(obj(e.data).reason) && ('title' in obj(e.data) || 'description' in obj(e.data)));
  if (!quality.length && !metadata.length) {
    section.rating = {label:'Not enough evidence',tone:'limited',basis:'Page content checks could not establish a usable result'};
    section.headline = 'Page content checks are needed before judging search readiness.';
    section.scope = 'Some supporting checks may have finished; core page content was not assessed.';
    section.limits = 'A fresh page sample is needed; completed supporting checks do not establish search readiness.';
    return;
  }
  const actualPages = pages.length ? pages : unique(metadata.map(e => e.scope.page));
  if (actualPages.length) section.scope = `${plural(actualPages.length,'page')} checked: ${actualPages.map(pageLabel).join(', ')}.`;
  const findings = report.findings.filter(f => f.disposition === 'finding' || f.disposition === 'review-needed');
  section.rating = { label:findings.length ? 'Needs attention' : actualPages.length > 1 ? 'Sample checks look sound' : 'Initial checks look sound', tone:findings.length?'attention':'good',basis:`${plural(actualPages.length || report.configuration.pages.length,'page')} sampled; ${plural(findings.length,'item')} to address` };
  section.headline = findings.length ? `${plural(findings.length,'search-readiness item')} ${findings.length === 1 ? 'needs' : 'need'} attention across the sampled pages.` : actualPages.length > 1 ? 'The sampled pages have useful search foundations in place.' : 'The homepage has useful search foundations; a wider page sample is the next step.';
  const definitions: Record<string,[string,string,string,string]> = {
    'seo.http-status':['A page could not be loaded successfully','Visitors and search crawlers may not receive the intended page.','Restore the intended page response or redirect visitors to the right destination.','Website developer'],
    'seo.noindex':['A page asks search engines to stay out','The page includes an instruction not to index it. This matters if the page is meant to attract search visitors.','Confirm whether the page should appear in search, then align its indexing instructions.','SEO lead + developer'],
    'seo.robots-disallow':['Search crawlers are blocked from a page','Selected search crawlers cannot access the page under its current crawl policy.','Confirm whether the block is intentional and allow access if the page should be discoverable.','SEO lead + developer'],
    'seo.canonical-target':['The preferred search address needs review','The page points search engines toward a different address, which may change which page receives search visibility.','Confirm the preferred URL and align the page signals with it.','SEO lead + developer'],
    'seo.source-rendered-difference':['Search signals change when the page loads','Search-related information differs between the initial page and the browser-rendered page.','Make the important search information consistent in both versions.','Website developer'],
    'seo.structured-data-invalid':['Search markup cannot be read correctly','Some structured page information cannot be parsed, reducing the information available to search engines.','Repair the affected structured data and validate it against the relevant search feature requirements.','SEO lead + developer'],
    'seo.exclusion-unconfirmed':['A private-to-search page needs its instructions checked','The expected search exclusion was not confirmed.','Align the page instructions with the agreed indexing intent.','SEO lead + developer'],
  };
  for (const group of grouped(findings)) {
    const rule=group[0].rule;
    let def=definitions[rule];
    if (!def && /title.*duplicate|duplicate.*title/.test(rule)) def=['Pages share the same search title','Repeated titles make it harder to distinguish what each page offers.','Write a distinct, descriptive title for each page.','Content + SEO'];
    if (!def && /description.*duplicate|duplicate.*description/.test(rule)) def=['Pages share the same search description','Repeated descriptions miss a chance to explain the value of each page.','Write a specific summary for each page.','Content + SEO'];
    if (!def && /title/.test(rule)) def=['Page titles need attention','A missing, repeated or generic title gives visitors and search engines less useful context.','Give each page one clear title describing its subject and purpose.','Content + SEO'];
    if (!def && /description/.test(rule)) def=['Search descriptions need attention','A missing or unclear description misses an opportunity to explain the page before someone visits.','Write one accurate, useful description per page.','Content + SEO'];
    if (!def && /structured/.test(rule)) def=['Structured page information needs review','Search engines may receive less useful context about the page.','Review the appropriate structured-data types and validate the markup.','SEO lead + developer'];
    def ??= ['Additional search checks need review','The sampled page has a search-related signal that needs context.','Review the recorded page and agree the intended search behavior before making a change.','SEO lead'];
    const f=baseFinding(report,group,def[0],def[1],def[2],def[3],'Focused review','Repeat the page checks and confirm the intended search signals.'); f.where=unique(group.map(g=>pageLabel(g.scope.page))); section.findings.push(f);
  }
  const goodMeta = metadata.filter(e => str(obj(e.data).title).trim() && str(obj(e.data).description).trim());
  if (goodMeta.length) section.positives.push(`A page title and description are present on ${plural(new Set(goodMeta.map(e=>e.scope.page)).size,'checked page')}.`);
  const healthyQuality=quality.filter(e=>obj(e.data).titleStatus==='present'&&obj(e.data).descriptionStatus==='present');
  if (healthyQuality.length) section.positives.push(`${plural(healthyQuality.length,'page')} ${healthyQuality.length===1?'has':'have'} a descriptive title and description under the checks applied.`);
  const summary = obj(report.evidence.find(e=>e.kind==='seo.sample-summary')?.data);
  if (pages.length>1 && Array.isArray(summary.duplicateTitles) && !summary.duplicateTitles.length && Array.isArray(summary.duplicateDescriptions) && !summary.duplicateDescriptions.length && healthyQuality.length===pages.length) section.positives.push('Titles and descriptions are distinct across the sampled pages.');
  const structured = report.evidence.filter(e=>/seo\.(source|rendered)-structured-data/.test(e.kind));
  const structuredPages=unique(structured.filter(e=>list(obj(e.data).blocks).some(b=>obj(b).status==='parsed')).map(e=>e.scope.page));
  if (structuredPages.length) section.positives.push(`Readable structured page information is present on ${plural(structuredPages.length,'checked page')}.`);
  if (report.evidence.some(e=>e.kind==='seo.sitemap-membership'&&obj(e.data).listed===true)) section.positives.push('The submitted page is included in the site sitemap.');
  const matches=report.evidence.filter(e=>e.kind==='seo.source-rendered'&&Object.values(obj(e.data)).some(v=>v===false));
  if (matches.length && !findings.some(f=>f.rule==='seo.source-rendered-difference')) section.positives.push('No differences were flagged between the initial and browser-rendered search signals checked.');
  if (actualPages.length<=1) section.reviewGroups.push({title:'Check the wider site',count:0,body:'Solvd can review key service and content pages for distinct titles, descriptions and relevant search markup.'});
  section.limits='This public-page sample checks search readiness; it does not establish indexing, rankings, traffic or AI visibility.';
}
function performance(report: AgentReport, section: CustomerSection): void {
  const pages=list(obj(report.measurements?.navigation).pages).map(obj);
  const valid=pages.filter(p=>num(obj(obj(p.metrics)['performance-score']).median)!==undefined);
  if (!valid.length) { section.rating={label:'Not enough data',tone:'limited',basis:'No usable navigation score'};section.headline='More measurements are needed to assess page speed.';section.limits='No reliable lab performance score was recorded. A fresh measurement is needed.';return; }
  const primary=valid.find(p=>p.formFactor==='mobile'||p.profileId==='mobile-v1')??valid[0];
  const score=Math.round(num(obj(obj(primary.metrics)['performance-score']).median)!);
  const device=(p:Record<string,JsonValue>)=>p.formFactor==='mobile'||p.profileId==='mobile-v1'?'Mobile':'Desktop';
  const devices=unique(valid.map(device));
  section.rating={label:score>=90?'Good lab result':score>=50?'Room to improve':'Needs attention',tone:score>=90?'good':'attention',score,basis:`${device(primary)} Lighthouse median; ${primary.succeeded ?? 0} samples`};
  section.headline=`${device(primary)} performance scored ${score}/100. ${score>=90?'The measured loading experience is in Lighthouse\'s good range.':'There are measurable opportunities to improve the loading experience.'}`;
  section.scope=valid.map(p=>`${device(p)}: ${p.succeeded ?? 0} of ${p.planned ?? '?'} samples on ${pageLabel(str(p.page))}`).join('; ')+'.';
  const resourceFindings: CustomerFinding[]=[];
  for (const page of valid) {
    const label=device(page), metrics=obj(page.metrics), prefix=valid.length>1?`${label} - `:'';
    const median=(name:string)=>num(obj(metrics[name]).median);
    const lcp=median('largest-contentful-paint'),tbt=median('total-blocking-time'),cls=median('cumulative-layout-shift');
    const pageScore=median('performance-score');
    if (valid.length>1&&pageScore!==undefined) section.metrics.push({label:`${label} performance score`,value:`${Math.round(pageScore)} / 100`,interpretation:'Median Lighthouse lab score; 90 or above is good.',tone:pageScore>=90?'good':'attention'});
    if (lcp!==undefined) section.metrics.push({label:`${prefix}Main content appears (LCP)`,value:`${(lcp/1000).toFixed(2)} s`,interpretation:`${lcp<=2500?'Within the 2.5-second good reference band':lcp<=4000?'Above the 2.5-second good reference band':'Above the 4-second poor reference boundary'}; ${lcp<2000?'within':'above'} the separate 2-second page-load goal using key-content timing as a proxy.`,tone:lcp<=2500?'good':'attention'});
    if (tbt!==undefined) section.metrics.push({label:`${prefix}Input blocking during load (TBT)`,value:`${Math.round(tbt)} ms`,interpretation:`${tbt<=(label==='Mobile'?200:150)?'Fast':'Needs attention'} for this ${label.toLowerCase()} lab test. This measures blocking during loading.`,tone:tbt<=(label==='Mobile'?200:150)?'good':'attention'});
    if (cls!==undefined) section.metrics.push({label:`${prefix}Visual stability (CLS)`,value:cls<0.001?'< 0.001':String(Number(cls.toFixed(3))),interpretation:cls<=0.1?'Stable in this test; within the good reference band of 0.1 or less.':'Unexpected layout movement exceeded the good reference band of 0.1.',tone:cls<=0.1?'good':'attention'});
    const samples=list(page.samples).map(obj).filter(successfulSample);
    const scores=samples.map(s=>num(obj(s.metrics)['performance-score'])).filter((v):v is number=>v!==undefined);
    if(scores.length) section.sampleScores.push({label:`${label} sample scores`,values:scores});
    const byAudit=new Map<string,Record<string,JsonValue>[]>();
    for(const sample of samples) for(const raw of list(sample.diagnostics)){const audit=obj(raw),id=str(audit.id);if(num(audit.score)===1)continue;if(!['render-blocking-insight','image-delivery-insight','network-dependency-tree-insight'].includes(id))continue;const group=byAudit.get(id)??[];group.push(audit);byAudit.set(id,group);}
    for(const [id,audits] of byAudit){
      const resources=new Map<string,Record<string,JsonValue>>();
      // Keep one measured resource entry; repeated samples are not additive savings.
      for(const audit of audits)for(const raw of list(audit.resources)){const r=obj(raw);const url=str(r.url);if(url&&!resources.has(url))resources.set(url,r);}
      const names=[...resources.values()].sort((a,b)=>(num(b.estimatedSavingsBytes)??num(b.totalBytes)??0)-(num(a.estimatedSavingsBytes)??num(a.totalBytes)??0)).slice(0,4).map(r=>{
        const url=str(r.url);let name=url;try{const u=new URL(url);name=`${u.hostname}${u.pathname}`;}catch{/* recorded text remains bounded */}
        const bytes=num(r.estimatedSavingsBytes),duration=num(r.durationMs),savings=num(r.estimatedSavingsMs),size=num(r.transferBytes)??num(r.totalBytes);
        return `${name.slice(0,160)}${bytes!==undefined&&bytes>0?` (estimated ${Math.round(bytes/1024)} KB saving)`:savings!==undefined&&savings>0?` (estimated ${Math.round(savings)} ms saving)`:duration!==undefined?` (${Math.round(duration)} ms request duration)`:size!==undefined?` (${Math.round(size/1024)} KB resource size)`:''}`;
      });
      const image=id==='image-delivery-insight',chain=id==='network-dependency-tree-insight';
      const totalBytes=audits.map(a=>num(a.estimatedSavingsBytes)??(a.unit==='byte'?num(a.value):undefined)).find(v=>v!==undefined&&v>0);
      const impact=image?`Some images could be delivered more efficiently${totalBytes!==undefined?`; the sampled audit estimates ${Math.round(totalBytes/1024)} KB in potential savings`:''}.`:chain?'The browser waits for a chain of requests before it can finish loading important content.':'Some page resources must load before the browser can draw the content.';
      resourceFindings.push({title:`${label}: ${image?'Reduce image weight':chain?'Shorten the loading chain':'Review resources that delay drawing'}`,impact,where:names.length?names:[pageLabel(str(page.page))],recommendation:image?'Review the listed images for appropriate dimensions, compression and format.':chain?'Review the request chain and load important assets earlier where safe.':'Review critical styles and scripts; defer nonessential work after checking dependencies.',owner:'Performance engineer',effort:'Investigation first',verification:'Repeat the same device samples after a change and compare the medians and variation.',count:resources.size||1,kind:'review'});
    }
  }
  section.findings=resourceFindings;
  section.limits=`${devices.length===1?`${devices[0]} only; `:''}lab samples are not real-user Core Web Vitals. LCP and CLS use reference bands; TBT is not a measure of real-user interaction responsiveness.`;
  if(devices.length===1&&devices[0]==='Desktop')section.reviewGroups.push({title:'Measure the mobile experience',count:0,body:'A mobile run can show how loading behaves on a smaller screen and a slower connection.'});
}

export function buildCustomerReport(reports: AgentReport[], options: {scope?:'all'|'selected'} = {}): CustomerReport {
  if(!reports.length||reports.length>3)throw new Error('Supply one to three reports.');
  if(new Set(reports.map(r=>r.agentId)).size!==reports.length)throw new Error('Duplicate agent reports are not allowed.');
  if(new Set(reports.map(r=>r.submittedUrl)).size!==1)throw new Error('Reports must have the same target URL.');
  if(reports.some(r=>!AGENT_IDS.includes(r.agentId)))throw new Error('Unknown report agent.');
  const ordered=AGENT_IDS.filter(id=>options.scope==='all'||reports.some(r=>r.agentId===id));
  const sections=ordered.map(id=>{
    const section=blank(id),report=reports.find(r=>r.agentId===id);if(!report)return section;
    section.comparison=comparison(report);
    if(report.collectionStatus==='failed'||!report.coverage.some(c=>c.status==='complete')){section.rating.label='Not enough evidence';section.headline='The checks could not gather enough evidence to judge this area.';return section;}
    section.scope=`${plural(report.configuration.pages.length,'page')} checked.`;
    if(id==='accessibility')a11y(report,section);else if(id==='seo-ai-search')seo(report,section);else performance(report,section);
    const assessment=report.assessment;
    if(assessment.status==='available'&&assessment.groundingVersion===1&&assessment.interpretation?.text.trim()&&
      !/run_[a-f0-9]+|state initial|Invalid assessment|No component selectors|[.#][A-Za-z_-]+\s*>|#[A-Za-z_-][\w-]*\b|<[^>]+>/i.test(assessment.interpretation.text)) {
      section.agentAssessment={label:'Agent assessment',text:assessment.interpretation.text,note:'Agent interpretation of the measured evidence; validate recommendations before acting.'};
    }
    if(report.collectionStatus==='partial') {
      section.limits=`Some checks could not finish. ${section.limits}`;
      if(section.rating.tone==='good') { section.rating={...section.rating,label:'Incomplete assessment',tone:'limited'};section.headline='The completed checks provide useful evidence, but this assessment is incomplete.'; }
    }
    section.images=report.artifacts.filter(a=>/^image\/(png|jpeg)$/.test(a.mediaType)&&/screenshot|page preview/i.test(a.label)).slice(0,2).map(a=>({runId:report.runId,artifactId:a.id,caption:`Page captured during the ${section.title.toLowerCase()} review${a.scope?.state==='mobile'?' (mobile)':a.scope?.state==='desktop'?' (desktop)':''}.`}));
    return section;
  });
  const attention=sections.filter(s=>s.rating.tone==='attention').length,limited=sections.filter(s=>s.rating.tone==='limited').length;
  const latest=reports.map(r=>new Date(r.completedAt)).filter(d=>Number.isFinite(d.valueOf())).sort((a,b)=>b.valueOf()-a.valueOf())[0];
  return {targetUrl:reports[0].submittedUrl,dateLabel:latest?latest.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'America/New_York'}):'Date unavailable',
    headline:attention?`${attention} ${attention===1?'area needs':'areas need'} attention. Here is where Solvd can help.`:limited?'More evidence is needed before drawing a conclusion.':'The sampled checks show useful foundations. Build on them with a focused review.',sections,
    nextStep:{title:'Discuss these findings with Solvd',body:'We found these results from public pages. A focused review can validate the priorities, agree the right changes and define the work with your team.',items:['Confirm the highest-impact issues and the pages that matter most to your customers.','With agreed access, review key user journeys, search data and real-user performance.','Agree owners and effort, then measure the results of any separately scoped changes.']},
    key:'Finding: a problem detected by a completed check. Needs review: a question to validate. Observation: context or a best-practice suggestion.'};
}

export interface CustomerReportOptions {
  scope?: 'all' | 'selected';
  loadArtifact?: (runId: string, artifactId: string) => Promise<Buffer | undefined>;
}
/** Recover detail from retained Lighthouse files without rewriting historical runs. */
export async function buildCustomerReportWithArtifacts(reports: AgentReport[], options: CustomerReportOptions = {}): Promise<CustomerReport> {
  if (!options.loadArtifact) return buildCustomerReport(reports, options);
  // Validate before reading any artifacts.
  buildCustomerReport(reports, options);
  const hydrated = structuredClone(reports);
  const images: CustomerSection['images'] = [];
  for (const report of hydrated.filter(r => r.agentId === 'performance')) {
    const pages = list(obj(report.measurements?.navigation).pages).map(obj);
    for (const page of pages) {
      for (const [index, sample] of list(page.samples).map(obj).filter(successfulSample).entries()) {
        const id = str(obj(sample.artifacts).lhr);
        const descriptor = report.artifacts.find(a => a.id === id && a.mediaType === 'application/json');
        if (!id || !descriptor || descriptor.byteLength > 12_000_000) continue;
        // New reports already preserve resources; only the first sample can supply a preview.
        const hasDetails = list(sample.diagnostics).some(d => Array.isArray(obj(d).resources));
        if (hasDetails && (index !== 0 || report.artifacts.some(a => /^image\//.test(a.mediaType)))) continue;
        try {
          const bytes = await options.loadArtifact(report.runId, id);
          if (!bytes || bytes.byteLength > 12_000_000) continue;
          const lhr = JSON.parse(bytes.toString('utf8'));
          if (!lhr || typeof lhr.audits !== 'object' || !lhr.audits) continue;
          const { auditDiagnostics } = await import('./agents/performance.js');
          sample.diagnostics = auditDiagnostics(lhr);
          const dataUrl = lhr.audits['final-screenshot']?.details?.data;
          if (index === 0 && typeof dataUrl === 'string' && dataUrl.length < 2_000_000 && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
            images.push({ runId:report.runId,artifactId:id,dataUrl,caption:`Page captured during the ${page.formFactor === 'mobile' || page.profileId === 'mobile-v1' ? 'mobile' : 'desktop'} performance measurement.` });
          }
        } catch { /* Retained measurements remain usable if an optional artifact is missing or unreadable. */ }
      }
    }
  }
  const view = buildCustomerReport(hydrated, options);
  const performanceSection = view.sections.find(s => s.agentId === 'performance');
  if (performanceSection && !performanceSection.images.length) performanceSection.images = images.slice(0, 2);
  return view;
}
