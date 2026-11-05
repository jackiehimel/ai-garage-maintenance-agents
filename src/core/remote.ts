import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { CollectorOptions, CollectorResult, RawArtifact, ValidatedRequest } from './types.js';

const exec = promisify(execFile);
const repository = process.env.MAINTENANCE_REPOSITORY || 'jackiehimel/ai-garage-maintenance-agents';
const branch = process.env.MAINTENANCE_REF || 'codex/recovery-live-agents';
async function gh(args:string[],signal?:AbortSignal):Promise<string> {
  try { return (await exec('gh',args,{timeout:30_000,maxBuffer:2_000_000,signal})).stdout; }
  catch { throw new Error('GitHub browser worker request failed. Check GitHub authentication and Actions availability.'); }
}
export async function collectRemote(request:ValidatedRequest,options:CollectorOptions={}):Promise<CollectorResult> {
  const {baseline:_baseline,profile,...rest}=request;
  const payload=JSON.stringify({...rest,profile:request.agentId==='performance'?{id:profile.id,samples:profile.samples}:{id:profile.id}});
  if(Buffer.byteLength(payload)>55_000) throw new Error('Remote collection configuration exceeds 55 KB; reduce supplied evidence or run with a local browser');
  const id=randomUUID();
  const signal=AbortSignal.any([AbortSignal.timeout(600_000),...(options.signal?[options.signal]:[])]);
  await gh(['workflow','run','collect.yml','--repo',repository,'--ref',branch,'-f',`request=${payload}`,'-f',`correlation=${id}`],signal);
  let runId:number|undefined;
  for(let i=0;i<30;i++) {
    const runs=JSON.parse(await gh(['run','list','--repo',repository,'--workflow','collect.yml','--branch',branch,'--limit','30','--json','databaseId,displayTitle'],signal)) as Array<{databaseId:number;displayTitle:string}>;
    runId=runs.find(r=>r.displayTitle===`Maintenance ${id}`)?.databaseId;
    if(runId) break;
    await delay(2000,undefined,{signal});
  }
  if(!runId) throw new Error('Browser worker was dispatched but no matching run became visible');
  try {
    for(;;) {
      const state=JSON.parse(await gh(['run','view',String(runId),'--repo',repository,'--json','status,conclusion'],signal)) as {status:string;conclusion:string};
      if(state.status==='completed') {if(state.conclusion!=='success') throw new Error(`Browser collection failed; inspect GitHub Actions run ${runId}`);break;}
      await delay(3000,undefined,{signal});
    }
    const directory=await mkdtemp(join(tmpdir(),'maintenance-worker-'));
    try {
      await gh(['run','download',String(runId),'--repo',repository,'--name',`collector-result-${request.agentId}`,'--dir',directory],signal);
      const raw=await readFile(join(directory,'collector-result.json'));
      if(raw.byteLength>140_000_000) throw new Error('Remote result exceeded size limit');
      const portable=JSON.parse(raw.toString()) as Omit<CollectorResult,'artifacts'> & {artifacts:Array<Omit<RawArtifact,'bytes'> & {bytes:string;encoding:string}>};
      const result:CollectorResult={...portable,artifacts:[]};
      if(!result.runtime || !Array.isArray(result.coverage) || !Array.isArray(result.evidence) || !Array.isArray(result.findings) || !Array.isArray(portable.artifacts)) throw new Error('Remote worker returned an invalid result');
      result.artifacts=portable.artifacts.map(a=>{
        if(a.encoding!=='base64'||typeof a.bytes!=='string') throw new Error('Invalid remote artifact encoding');
        return {...a,bytes:Buffer.from(a.bytes,'base64')};
      });
      result.diagnostics=[...(result.diagnostics??[]),`Collected live on GitHub Actions: https://github.com/${repository}/actions/runs/${runId}`];
      return result;
    } finally {await rm(directory,{recursive:true,force:true});}
  } catch(error) {
    if(signal.aborted) await gh(['run','cancel',String(runId),'--repo',repository]).catch(()=>{});
    throw error;
  }
}
