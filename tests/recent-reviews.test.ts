import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {recentReviews,saveReview} from '../src/recent-reviews.js';
import {openRunStore} from '../src/core/store.js';
import {accessibilityReport} from './report-fixture.js';

test('saved single and combined reviews are discoverable across reads and duplicate visits do not create duplicates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'maintenance-recent-'));
 try{
  const one=accessibilityReport(),two={...accessibilityReport(),runId:`run_${'b'.repeat(24)}`,agentId:'performance' as const,findings:[],evidence:[]};
  for(const r of [one,two])await(await openRunStore(root,r.runId)).writeReport(r);
  assert.equal((await recentReviews(root)).length,2);
  const selection={scope:'all',runIds:[one.runId,two.runId]};await saveReview(root,selection);await saveReview(root,selection);
  const rows=await recentReviews(root);assert.equal(rows.length,3);
  const combined=rows.find(r=>r.href.startsWith('/?scope=all'))!;assert.equal(combined.url,one.submittedUrl);
  assert.match(combined.verdict,/Accessibility: 7 findings need attention/);assert.match(combined.verdict,/SEO.*Not assessed/);
  await assert.rejects(saveReview(root,{scope:'all',runIds:['../outside']}));
  await assert.rejects(saveReview(root,{scope:'all',runIds:[one.runId,one.runId]}));
  const other={...one,runId:`run_${'c'.repeat(24)}`,submittedUrl:'https://other.example/'};
  await(await openRunStore(root,other.runId)).writeReport(other);
  await assert.rejects(saveReview(root,{scope:'all',runIds:[one.runId,other.runId]}),/same submitted/);
 }finally{await rm(root,{recursive:true,force:true});}
});
