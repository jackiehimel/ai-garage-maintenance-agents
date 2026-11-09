import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { renderCombinedPdf } from '../src/pdf-report.js';
import { accessibilityReport } from './report-fixture.js';
import type { AgentId, AgentReport } from '../src/core/types.js';
import { validateRequest } from '../src/core/input.js';
function report(agentId: AgentId): AgentReport {
  return {...accessibilityReport(),agentId,configuration:validateRequest({agentId,targetUrl:'https://example.com/'}),evidence:[],findings:[],artifacts:[],assessment:{status:'unavailable',reason:'Invalid assessment text'}};
}
// Inspect the real generated PDF content streams, without replacing the renderer.
function pdfText(buffer: Buffer): string {
  return [...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(match=>{
    let content:string;try{content=inflateSync(Buffer.from(match[1],'latin1')).toString('latin1');}catch{content=match[1];}
    return [...content.matchAll(/\[([^\]]*)\]\s*TJ|<([a-f\d]+)>\s*Tj/gi)].map(line=>[...(line[1]??`<${line[2]}>`).matchAll(/<([a-f\d]+)>/gi)].map(token=>Buffer.from(token[1],'hex').toString('latin1')).join('')).join('\n');
  }).join('\n');
}
test('customer PDF gives verdicts and actions without engineering strings or unverified AI prose',async()=>{
  const a11y=accessibilityReport();
  const seo=report('seo-ai-search');
  const pdf=await renderCombinedPdf([seo,a11y],{scope:'all'});const text=pdfText(pdf);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.match(text,/Needs attention/);assert.match(text,/Not assessed/);
  assert.match(text,/7 measured findings tied to accessibility requirements/);
  assert.match(text,/3 best-practice suggestions/);assert.match(text,/55 elements/);assert.match(text,/7 elements/);
  assert.match(text,/screen-reader name/);assert.match(text,/Discuss these findings with Solvd/);
  assert.doesNotMatch(text,/#selector-|Raw scanner|Scanner |Fix any|run_012|UTC|state initial|COMPLETE|Invalid assessment|Historical draft|CRITICAL|HIGH/);
});
test('PDF puts real performance score and sample variation in the customer report',async()=>{
  const perf=report('performance');perf.measurements={navigation:{pages:[{page:perf.testedUrl,planned:3,succeeded:3,metrics:{'performance-score':{median:78,min:68,max:86},'largest-contentful-paint':{median:2490.6155}},samples:[68,78,86].map(n=>({metrics:{'performance-score':n}}))}]}};
  const pdf=await renderCombinedPdf([perf]);const text=pdfText(pdf);
  assert.match(text,/78/);assert.match(text,/100/);assert.match(text,/2.49 s/);assert.match(text,/3 of 3 samples/);assert.match(text,/Sample 1/);assert.match(text,/68/);assert.match(text,/86/);assert.match(text,/Desktop only/);
});
test('PDF rejects conflicting targets and duplicate agents',async()=>{
  await assert.rejects(renderCombinedPdf([]),/report/i);await assert.rejects(renderCombinedPdf([report('seo-ai-search'),report('seo-ai-search')]),/duplicate/i);
  const other=report('accessibility');other.submittedUrl='https://other.com/';await assert.rejects(renderCombinedPdf([report('seo-ai-search'),other]),/same target/i);
});
test('failed collection is a visible limitation without exposing the internal error',async()=>{
  const failed=report('seo-ai-search');failed.collectionStatus='failed';failed.coverage=[{id:'failed',scope:{page:failed.testedUrl},subject:'Page scan',status:'unavailable',reason:'secret_config connection EACCES'}];
  const text=pdfText(await renderCombinedPdf([failed],{scope:'all'}));assert.match(text,/Not enough evidence/);assert.doesNotMatch(text,/checks look sound|secret_config|EACCES/);
});
test('PDF includes every grouped action when the report spans pages and keeps footer pagination',async()=>{
  const a11y=accessibilityReport();
  a11y.findings=Array.from({length:20},(_,i)=>({...a11y.findings[0],id:`f${i}`,rule:`additional-${i}`,scope:{page:`https://example.com/page-${i}`},evidenceIds:[]}));
  const pdf=await renderCombinedPdf([a11y]);const text=pdfText(pdf);const pages=[...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.ok(pages>3);assert.match(text,/\/page-19/);assert.match(text,new RegExp(`Page ${pages} of ${pages}`));
});
