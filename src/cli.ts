import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runAgent } from './run.js';
import { renderReport } from './report.js';

async function main():Promise<void> {
  const args=process.argv.slice(2);
  const [agentId,targetUrl]=args;
  if (!agentId || !targetUrl) throw new Error('Usage: npm run agent -- <seo-ai-search|accessibility|performance> <https-url> [--config file.json] [--baseline file.json] [--output directory] [--no-ai]');
  const option=(name:string) => {const i=args.indexOf(name); if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing ${name} value`);return args[i+1];};
  const configPath=option('--config'), baselinePath=option('--baseline');
  const config=configPath ? JSON.parse(await readFile(configPath,'utf8')) as Record<string,unknown> : {};
  const baseline=baselinePath ? JSON.parse(await readFile(baselinePath,'utf8')) as unknown : config.baseline;
  const output=resolve(option('--output') ?? '.runs');
  await mkdir(output,{recursive:true});
  const report=await runAgent({...config,agentId,targetUrl,baseline},{storageRoot:output,assessment:args.includes('--no-ai')?'off':'live'});
  const dir=join(output,report.runId);
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'report.html'),renderReport(report));
  await writeFile(join(dir,'export.json'),JSON.stringify(report,null,2));
  if(report.baseline) await writeFile(join(dir,'baseline.json'),JSON.stringify(report.baseline,null,2));
  console.log(JSON.stringify({runId:report.runId,agentId:report.agentId,testedUrl:report.testedUrl,collection:report.collectionStatus,findings:report.findings.length,assessment:report.assessment.status,comparison:report.comparison.status,output:dir},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Agent failed');process.exitCode=1;});
