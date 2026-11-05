import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {runAgent} from '../dist/app/run.js';
import {renderReport} from '../dist/app/report.js';

const destination='acceptance-artifacts/report-corrections';
await mkdir(destination,{recursive:true});
for(const agentId of ['seo-ai-search','accessibility']) {
  const report=await runAgent({agentId,targetUrl:'https://solvd.com/'},{assessment:'off',storageRoot:destination,executablePath:process.env.CHROME_PATH,signal:AbortSignal.timeout(180_000)});
  await writeFile(`${destination}/${agentId}.html`,renderReport(report));
  assert.equal(report.testedUrl,'https://solvd.com/');
  assert(report.evidence.length>0,'Real collector returned no evidence');
  const groups=Object.values(report.findings.reduce((groups,f)=>{
    const key=f.rule+':'+f.disposition;
    groups[key]??={rule:f.rule,disposition:f.disposition,count:0,selectors:[]};
    groups[key].count++;groups[key].selectors.push(f.scope.element);return groups;
  },{}));
  console.log('REPORT_CORRECTION_RESULT '+JSON.stringify({agentId,runId:report.runId,collectionStatus:report.collectionStatus,coverage:report.coverage,groups,diagnostics:report.diagnostics,evidence:agentId==='seo-ai-search'?report.evidence:report.evidence.filter(e=>['navigation','axe-summary'].includes(e.kind))}));
  if(agentId==='seo-ai-search') {
    const membership=report.evidence.find(e=>e.kind==='seo.sitemap-membership');
    assert(membership?.data?.listed,'Solvd homepage must be observed in the live sitemap');
    assert.equal(report.coverage.find(c=>c.subject==='sampled sitemap membership')?.status,'complete','Positive membership must not inherit incomplete traversal');
  }
}
