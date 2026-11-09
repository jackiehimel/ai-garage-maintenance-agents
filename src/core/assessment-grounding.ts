import type { AssessmentAction, AssessmentClassification, AssessmentCounts, AssessmentFact, AssessmentHypothesis, AssessmentParameters, CollectorResult, Evidence, Priority, ValidatedRequest } from './types.js';
import { LAB_METRICS } from '../agents/performance-measurements.js';

export const assessmentPriorities: Priority[] = ['critical','high','medium','low','info'];
const unique = <T>(values: T[]) => [...new Set(values)];
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

function classification(evidence: Evidence[]): AssessmentClassification {
  const records = evidence.map(e=>e.data).filter(x=>x && typeof x==='object' && !Array.isArray(x));
  const strings = (key: string) => unique(records.flatMap(x=>{
    const value=(x as Record<string,unknown>)[key];
    return Array.isArray(value) ? value.filter((v):v is string=>typeof v==='string') : typeof value==='string' ? [value] : [];
  }));
  const tags=strings('tags'),criteria=strings('criteria'),impacts=strings('impact');
  return {category:criteria.length || tags.some(t=>/^wcag\d/i.test(t)) ? 'wcag' : tags.includes('best-practice') ? 'best-practice' : 'other',tags,criteria,impacts};
}

/** Deliberately narrow extraction: a number in a URL, tag or count is not a measurement. */
function measuredParameters(evidence: Evidence[]): AssessmentParameters {
  const colors: string[] = [], contrastRatios: number[] = [];
  const quantities = new Map<string, AssessmentParameters['quantities'][number]>();
  const addQuantity = (metric: string, unit: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const quantity = {metric,unit:unit.toLowerCase(),value};
    quantities.set(JSON.stringify(quantity),quantity);
  };
  const recordOf = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
  for (const e of evidence) {
    if (e.source.kind !== 'measured' && e.source.kind !== 'supplied') continue;
    if (e.kind.startsWith('axe-') && e.data && typeof e.data === 'object' && !Array.isArray(e.data) && e.data.rule === 'color-contrast') {
      for (const match of e.summary.matchAll(/(?:foreground|background) color:\s*(#[\da-f]{3,8})\b/gi)) colors.push(match[1].toLowerCase());
      for (const match of e.summary.matchAll(/contrast (?:ratio of|of)\s*(\d+(?:\.\d+)?)/gi)) contrastRatios.push(Number(match[1]));
    }
    if (e.agentId === 'performance' && e.source.kind === 'measured') {
      const data = recordOf(e.data), metrics = recordOf(data?.metrics);
      if (metrics) for (const [metric,{unit}] of Object.entries(LAB_METRICS)) {
        if (e.kind === 'navigation-distribution') {
          const distribution = recordOf(metrics[metric]);
          if (distribution?.unit === unit) for (const statistic of ['median','min','max','spread']) addQuantity(metric,unit,distribution[statistic]);
        } else if (e.kind === 'navigation-sample' && data?.status === 'collected') {
          addQuantity(metric,unit,metrics[metric]);
        }
      }
    }
    const visit = (value: unknown, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 8) return;
      if (Array.isArray(value)) { for (const child of value) visit(child, depth + 1); return; }
      const record = value as Record<string, unknown>;
      if (typeof record.metric === 'string' && typeof record.unit === 'string') {
        for (const key of ['value','median','threshold']) addQuantity(record.metric,record.unit,record[key]);
      }
      for (const child of Object.values(record)) visit(child, depth + 1);
    };
    visit(e.data);
  }
  return { colors: unique(colors), contrastRatios: unique(contrastRatios), quantities:[...quantities.values()] };
}

function counts(result: CollectorResult): AssessmentCounts {
  const byDisposition:Record<string,number>={},byCoverageStatus:Record<string,number>={};
  const automatic={wcag:0,bestPractice:0,other:0};
  const rules=new Map<string,{rule:string;disposition:typeof result.findings[number]['disposition'];count:number}>();
  const scopes=new Map<string,{page:string;state?:string;count:number}>();
  const evidence=new Map(result.evidence.map(e=>[e.id,e]));
  for(const f of result.findings){
    byDisposition[f.disposition]=(byDisposition[f.disposition]??0)+1;
    const ruleKey=JSON.stringify([f.rule,f.disposition]),scopeKey=JSON.stringify([f.scope.page,f.scope.state??null]);
    const rule=rules.get(ruleKey)??{rule:f.rule,disposition:f.disposition,count:0};rule.count++;rules.set(ruleKey,rule);
    const scope=scopes.get(scopeKey)??{page:f.scope.page,state:f.scope.state,count:0};scope.count++;scopes.set(scopeKey,scope);
    if(f.disposition==='finding') {
      const category=classification(f.evidenceIds.flatMap(id=>evidence.has(id)?[evidence.get(id)!]:[])).category;
      automatic[category==='best-practice'?'bestPractice':category]++;
    }
  }
  for(const c of result.coverage) byCoverageStatus[c.status]=(byCoverageStatus[c.status]??0)+1;
  const bounded=<T extends {count:number}>(all:T[])=>{
    const groups:T[]=[];let size=0;
    for(const group of all){const length=bytes(group);if(groups.length>=100||size+length>1800) break;groups.push(group);size+=length;}
    return {groups,omittedGroups:all.length-groups.length,omittedFindingInstances:all.slice(groups.length).reduce((sum,g)=>sum+g.count,0)};
  };
  return {findingInstances:result.findings.length,evidenceEntries:result.evidence.length,coverageEntries:result.coverage.length,byDisposition,automatic,byCoverageStatus,
    byRuleDisposition:bounded([...rules.values()]),byPageState:bounded([...scopes.values()])};
}

/** All report counts are computed before sampling; none come from generated prose. */
export function measuredAssessmentSummary(request: ValidatedRequest,result: CollectorResult): string {
  const c=counts(result),d=c.byDisposition,q=c.byCoverageStatus;
  const automatic=request.agentId==='accessibility' ? `${c.automatic.wcag} WCAG-tagged automatic findings, ${c.automatic.bestPractice} best-practice findings, ${c.automatic.other} other findings` : `${d.finding??0} findings`;
  return `${c.findingInstances} finding instances: ${automatic}, ${d['review-needed']??0} review-needed, ${d.intentional??0} intentional, ${d.observation??0} observations. Coverage: ${q.complete??0} complete, ${q.incomplete??0} incomplete, ${q.unavailable??0} unavailable, ${q['not-configured']??0} not configured. Counts describe collected records, not site-wide completeness or conformance.`;
}

export function buildAssessmentGrounding(request: ValidatedRequest,result: CollectorResult) {
  const fullReportCounts=counts(result);
  const findingEvidence=new Set(result.findings.flatMap(f=>f.evidenceIds));
  const evidence:Evidence[]=[];
  let evidenceBytes=0;
  for(const e of [...result.evidence].sort((a,b)=>Number(findingEvidence.has(b.id))-Number(findingEvidence.has(a.id)))) {
    // Whole records only: a sliced excerpt cannot authorize facts hidden in its omitted tail.
    const size=bytes(e);
    if(size>5000 || evidenceBytes+size>24000 || evidence.length>=60 || evidence.some(x=>x.id===e.id)) continue;
    evidence.push(e);evidenceBytes+=size;
  }
  const byId=new Map(evidence.map(e=>[e.id,e]));
  const facts:AssessmentFact[]=[{id:'aggregate:report',kind:'aggregate',counts:fullReportCounts,evidenceIds:[],provenance:[]}];
  let factBytes=bytes(facts);
  const add=(f:AssessmentFact)=>{const size=bytes(f);if(facts.length>=80 || size>5000 || factBytes+size>26000 || facts.some(x=>x.id===f.id)) return false;facts.push(f);factBytes+=size;return true;};
  const coverage=new Map(result.coverage.map(c=>[c.id,c]));
  for(const f of result.findings) {
    if(!f.evidenceIds.length || f.evidenceIds.some(id=>!byId.has(id)) || f.coverageIds.some(id=>!coverage.has(id))) continue;
    const supporting=unique(f.evidenceIds).map(id=>byId.get(id)!);
    add({id:`finding:${f.id}`,kind:'finding',findingId:f.id,rule:f.rule,scope:f.scope,title:f.title,summary:f.summary,
      disposition:f.disposition,severity:f.severity,classification:classification(supporting),
      coverageQuality:f.coverageIds.map(id=>coverage.get(id)!),ownerIntent:request.indexIntent.find(i=>i.page===f.scope.page)?.intended??'unknown',
      evidenceIds:unique(f.evidenceIds),provenance:supporting.map(e=>e.source),measuredParameters:measuredParameters(supporting)});
  }
  for(const c of result.coverage) add({id:`coverage:${c.id}`,kind:'coverage',coverageId:c.id,scope:c.scope,subject:c.subject,status:c.status,
    ...(c.reason===undefined?{}:{reason:c.reason}),...(c.data===undefined?{}:{data:c.data}),evidenceIds:[],provenance:[{kind:'measured',name:'Collector coverage record'}]});
  for(const e of evidence) add({id:`observation:${e.id}`,kind:'observation',evidenceId:e.id,scope:e.scope,observationKind:e.kind,summary:e.summary,evidenceIds:[e.id],provenance:[e.source],measuredParameters:measuredParameters([e])});
  const truncation={evidence:evidence.length<result.evidence.length,findings:facts.filter(f=>f.kind==='finding').length<result.findings.length,
    coverage:facts.filter(f=>f.kind==='coverage').length<result.coverage.length,observations:facts.filter(f=>f.kind==='observation').length<evidence.length,
    countGroups:fullReportCounts.byRuleDisposition.omittedGroups>0 || fullReportCounts.byPageState.omittedGroups>0};
  return {fullReportCounts,facts,evidence,truncation};
}
export type AssessmentGrounding = ReturnType<typeof buildAssessmentGrounding>;

function object(input:unknown,required:string[],optional:string[]=[]):Record<string,unknown> {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid assessment object');
  const value=input as Record<string,unknown>;
  if(required.some(k=>!Object.hasOwn(value,k)) || Object.keys(value).some(k=>![...required,...optional].includes(k))) throw new Error('Invalid assessment keys');
  return value;
}
function text(value:unknown,max:number):string {
  if(typeof value!=='string' || !value.trim() || value.length>max) throw new Error('Invalid assessment text');return value.trim();
}
function texts(value:unknown,min:number,max:number,length:number):string[] {
  if(!Array.isArray(value) || value.length<min || value.length>max) throw new Error('Invalid assessment array limit');
  const list=value.map(v=>text(v,length));if(unique(list).length!==list.length) throw new Error('Duplicate assessment values');return list;
}
function references(value:unknown,byId:Map<string,AssessmentFact>,min=1):AssessmentFact[] {
  const ids=texts(value,min,8,200);
  if(ids.some(id=>!byId.has(id))) throw new Error('Assessment references facts not supplied');return ids.map(id=>byId.get(id)!);
}
const evidenceIds=(facts:AssessmentFact[])=>unique(facts.flatMap(f=>f.evidenceIds));
function correctionEligible(f:AssessmentFact,request:ValidatedRequest):f is AssessmentFact & {kind:'finding'} {
  return f.kind==='finding' && f.disposition==='finding' && f.coverageQuality.length>0 && f.coverageQuality.every(c=>c.status==='complete') &&
    (request.agentId!=='accessibility' || f.classification.category==='wcag') &&
    (request.agentId!=='seo-ai-search' || f.ownerIntent==='indexable');
}

function supportsMissingName(facts:AssessmentFact[],grounding:AssessmentGrounding):boolean {
  if(facts.some(f=>f.kind==='finding'&&f.rule==='button-name')) return true;
  // Observations cite the same scanner evidence and must retain its rule-specific limits.
  const ids=new Set(evidenceIds(facts));
  return grounding.evidence.some(e=>ids.has(e.id) && e.data && typeof e.data==='object' && !Array.isArray(e.data) && e.data.rule==='button-name');
}

// Capture internal signs and separators so parsing can reject compound tokens as a whole.
const numericToken = /(?<![\d.,+\-−])((?:(?<!\w)|(?=[+\-−]))[\d.,+\-−]*\d)/.source;
const ratioLiterals = new RegExp(`${numericToken}\\s*:\\s*1\\b`,'g');
const quantityLiterals = new RegExp(`${numericToken}\\s*(ms|s|%|kb|mb|points|unitless)\\b`,'gi');
const thresholdLiterals = new RegExp(`\\b(?:at least|threshold(?: of| to)?|target(?: of| to)?)\\s+${numericToken}`,'gi');

function parseNumericLiteral(literal:string):number {
  if(!/^[+\-−]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(literal)) return NaN;
  return Number(literal.replaceAll(',','').replace('−','-'));
}

function matchesQuantity(quantity:AssessmentParameters['quantities'][number],literal:string,unit:string):boolean {
  const value=parseNumericLiteral(literal);
  if(quantity.unit===unit && quantity.value===value) return true;
  if((unit!=='ms' && unit!=='s') || (quantity.unit!=='ms' && quantity.unit!=='s')) return false;
  const converted=quantity.unit===unit?quantity.value:unit==='ms'?quantity.value*1000:quantity.value/1000;
  if(converted===value) return true;
  // Accept display rounding at the written precision, with at most a 10 ms step.
  const decimals=literal.split('.')[1]?.length??0;
  return decimals<=(unit==='ms'?3:6) && (unit==='ms'||decimals>=2) && Number(converted.toFixed(decimals))===value;
}

/** Targeted regression guards, NOT a general natural-language entailment checker. */
function checkGeneratedText(generated:string,supporting:AssessmentFact[],grounding:AssessmentGrounding,kind:'assertion'|'proposal'|'hypothesis') {
  const parameters = supporting.flatMap(f=>f.measuredParameters ? [f.measuredParameters] : []);
  const colors=generated.match(/#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b/gi)??[];
  if(colors.some(color=>!parameters.some(p=>p.colors.includes(color.toLowerCase())))) throw new Error('Assessment contains an unmeasured color');
  const ratios=[...generated.matchAll(ratioLiterals)].map(m=>parseNumericLiteral(m[1]));
  const quantities=[...generated.matchAll(quantityLiterals)];
  const thresholds=[...generated.matchAll(thresholdLiterals)].map(m=>parseNumericLiteral(m[1]));
  if(ratios.some(value=>!parameters.some(p=>p.contrastRatios.includes(value))) ||
     quantities.some(m=>!parameters.some(p=>p.quantities.some(q=>matchesQuantity(q,m[1],m[2].toLowerCase())))) ||
     thresholds.some(value=>!parameters.some(p=>p.contrastRatios.includes(value)||p.quantities.some(q=>q.value===value)))) {
    throw new Error('Assessment contains an unmeasured numerical parameter');
  }
  const missingName=supportsMissingName(supporting,grounding);
  const dismissal=/\b(?:cannot|can't|unable to|fails? to|failed to|could not|does not|doesn't)\s+(?:\w+\s+){0,3}(?:dismiss|close)\b|\b(?:dismissal|closing) (?:fails|failed|is impossible|was prevented)\b/i;
  if(missingName && dismissal.test(generated) && kind==='assertion') throw new Error('Assessment asserts an unmeasured interaction; use a hypothesis and verification');
  if(/\b(template-wide|site-wide defect|all pages (?:have|fail)|(?:is|are) (?:actually )?indexed|not indexed in (?:google|search))\b/i.test(generated)) throw new Error('Assessment exceeds recorded scope');
}

export function validateGroundedAssessment(input:unknown,grounding:AssessmentGrounding,request:ValidatedRequest) {
  const value=object(input,['interpretation','claimIds','actions']);
  const byId=new Map(grounding.facts.map(f=>[f.id,f]));
  const interpretation=text(value.interpretation,1200),claims=references(value.claimIds,byId);
  checkGeneratedText(interpretation,claims,grounding,'assertion');
  if(!Array.isArray(value.actions) || value.actions.length>3) throw new Error('Invalid assessment action limit');
  const actions=value.actions.map((raw):AssessmentAction=>{
    const a=object(raw,['title','mode','targetFactIds','priority','rationale','steps','verification'],['hypothesis']);
    if(a.mode!=='investigate'&&a.mode!=='propose-correction') throw new Error('Invalid assessment mode');
    if(!assessmentPriorities.includes(a.priority as Priority)) throw new Error('Invalid assessment priority');
    const targets=references(a.targetFactIds,byId),eligible=targets.filter(f=>correctionEligible(f,request));
    if(a.mode==='propose-correction' && eligible.length!==targets.length) throw new Error('Assessment correction is not supported by confirmed target findings');
    const priority=a.priority as Priority;
    if((priority==='high'||priority==='critical') && eligible.length!==targets.length) throw new Error('Assessment priority exceeds target support');
    if(priority==='critical' && !eligible.some(f=>f.kind==='finding'&&f.severity==='critical')) throw new Error('Assessment critical priority is not supported');
    const title=text(a.title,200),rationale=text(a.rationale,800),steps=texts(a.steps,1,4,300),verification=text(a.verification,500);
    // Minimum procedural detail only; this gate does not establish that a proposed procedure is sufficient.
    if(verification.length<25 || !/\b(repeat|rerun|re-run|measure|test|verify|record|inspect|compare|activate|check)\b/i.test(verification)) throw new Error('Assessment requires concrete verification');
    let hypothesis:AssessmentHypothesis|undefined;
    if(a.hypothesis!==undefined){
      const h=object(a.hypothesis,['subject','statement','supportingFactIds','missingEvidence']);
      if(typeof h.subject!=='string' || !['scanner','site','unknown'].includes(h.subject)) throw new Error('Invalid assessment hypothesis subject');
      const support=references(h.supportingFactIds,byId);
      if(support.some(f=>!targets.some(t=>t.id===f.id))) throw new Error('Assessment hypothesis support is outside action targets');
      if(h.subject==='site' && !support.some(f=>f.kind==='finding'&&f.disposition==='finding')) throw new Error('Assessment scanner-only evidence cannot establish a site cause');
      hypothesis={subject:h.subject as AssessmentHypothesis['subject'],statement:text(h.statement,600),supportingFactIds:support.map(f=>f.id),missingEvidence:texts(h.missingEvidence,1,4,300)};
      checkGeneratedText(hypothesis.statement,support,grounding,'hypothesis');
    }
    for(const generated of [title,rationale]) checkGeneratedText(generated,targets,grounding,'assertion');
    for(const generated of [...steps,verification,...(hypothesis?.missingEvidence??[])]) checkGeneratedText(generated,targets,grounding,'proposal');
    const interaction=supportsMissingName(targets,grounding) && /\b(dismiss(?:al|ed|es|ing)?|clos(?:e|ed|es|ing))\b/i.test([...steps,verification].join(' '));
    if(interaction && !hypothesis) throw new Error('Assessment interaction investigation requires a hypothesis and missing evidence');
    return {title,mode:a.mode,targetFactIds:targets.map(f=>f.id),priority,rationale,steps,verification,evidenceIds:evidenceIds(targets),...(hypothesis?{hypothesis}:{})};
  });
  if(unique(actions.map(a=>a.title.toLowerCase())).length!==actions.length) throw new Error('Duplicate assessment actions');
  return {interpretation:{text:interpretation,claimIds:claims.map(f=>f.id),evidenceIds:evidenceIds(claims)},actions};
}
