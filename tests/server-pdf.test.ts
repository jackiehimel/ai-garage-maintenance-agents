import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRunStore } from '../src/core/store.js';
import { accessibilityReport } from './report-fixture.js';

// Exercise the actual HTTP route, saved-report loader and PDF renderer together.
test('saved report PDF downloads through the local API with origin and selection checks', {timeout:15000}, async () => {
  const root = await mkdtemp(join(tmpdir(),'maintenance-pdf-api-'));
  const report = accessibilityReport();
  await (await openRunStore(root,report.runId)).writeReport(report);
  const port = 43000 + Math.floor(Math.random()*15000);
  const server = spawn(process.execPath,[new URL('../src/server.js',import.meta.url).pathname],{
    env:{...process.env,PORT:String(port),RUN_STORAGE_ROOT:root,BROWSER_RUNTIME:'local'},stdio:['ignore','pipe','pipe'],
  });
  try {
    await new Promise<void>((resolve,reject) => {
      let output='';
      const timer=setTimeout(()=>reject(new Error(`Server did not start: ${output}`)),6000);
      const finish=(error?:Error)=>{clearTimeout(timer);error?reject(error):resolve();};
      server.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Maintenance agents:'))finish();});
      server.stderr.on('data',chunk=>{output+=chunk;});
      server.once('error',finish);
      server.once('exit',()=>finish(new Error(`Server exited: ${output}`)));
    });
    const endpoint=`http://127.0.0.1:${port}/api/report.pdf?runs=${report.runId}&scope=all`;
    const result=await fetch(endpoint);
    assert.equal(result.status,200);
    assert.equal(result.headers.get('content-type'),'application/pdf');
    assert.match(result.headers.get('content-disposition')??'',/attachment.*\.pdf/);
    assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    assert.equal((await fetch(endpoint,{headers:{Origin:'https://untrusted.com'}})).status,403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/report.pdf?runs=invalid`)).status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/report.pdf?runs=run_aaaaaaaaaaaaaaaaaaaaaaaa`)).status,404);
  } finally {
    if(server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
    await rm(root,{recursive:true,force:true});
  }
});
