import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {runAgent} from '../dist/app/run.js';
import {renderReport} from '../dist/app/report.js';

const destination='acceptance-artifacts/report-corrections';
await mkdir(destination,{recursive:true});
let accessibilityReport;
let seoStatus;
for(const agentId of ['seo-ai-search','accessibility']) {
  const report=await runAgent({agentId,targetUrl:'https://solvd.com/'},{assessment:'off',storageRoot:destination,executablePath:process.env.CHROME_PATH,signal:AbortSignal.timeout(180_000)});
  await writeFile(`${destination}/${agentId}.html`,renderReport(report));
  assert.equal(report.testedUrl,'https://solvd.com/');
  assert(report.evidence.length>0,'Real collector returned no evidence');
  if(agentId==='accessibility') accessibilityReport=report;
  if(agentId==='seo-ai-search') seoStatus=report.collectionStatus;
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

// Exercise the actual saved-report UI with fresh measured data, with no new scan
// or AI provider call and no page response interception.
const server=spawn(process.execPath,['dist/app/server.js'],{env:{...process.env,PORT:'4175',RUN_STORAGE_ROOT:resolve(destination),ANTHROPIC_API_KEY:''},stdio:['ignore','pipe','pipe']});
let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<60;attempt++) {
    if(server.exitCode!==null) throw new Error('Preview server exited');
    try {ready=(await fetch('http://127.0.0.1:4175/api/health')).ok;} catch {}
    if(ready)break;
    await delay(100);
  }
  assert(ready,'Preview server did not start');
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,chromiumSandbox:true});
  for(const [name,viewport] of [['desktop',{width:1280,height:1050}],['mobile',{width:390,height:844}]]) {
    const page=await browser.newPage({viewport,serviceWorkers:'block'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:4175/?run=${accessibilityReport.runId}`,{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Human checks still needed',exact:true}).waitFor();
    assert.equal(await page.locator('#findings h4').count(),new Set(accessibilityReport.findings.map(f=>f.rule+':'+f.disposition)).size);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Report overflows viewport');
    await page.locator('#findings').evaluate(element=>element.scrollIntoView({block:'start'}));
    const shot=await page.screenshot({path:`${destination}/${name}.jpg`,type:'jpeg',quality:65});
    if(name==='desktop')console.log('REPORT_SCREENSHOT_BASE64 '+shot.toString('base64'));
    assert.deepEqual(errors,[],'Report raised script errors');
    await page.close();
  }
  console.log('REPORT_UI_VERIFIED desktop and mobile; real saved report; no script errors or horizontal overflow');
} finally {
  await browser?.close();server.kill('SIGTERM');
}
assert.equal(seoStatus,'complete','Fresh Solvd SEO inspection still has a coverage limitation; inspect retained request identities');
