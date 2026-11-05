import { writeFile } from 'node:fs/promises';
import { validateRequest } from './core/input.js';
import { collectSeo, collectAccessibility, collectPerformance } from './run.js';

// Collection alone runs on the browser host. Model credentials remain on the API host.
try {
  const raw = process.env.COLLECT_REQUEST;
  if (!raw || Buffer.byteLength(raw)>60_000) throw new Error('Missing or oversized collection request');
  const request = validateRequest(JSON.parse(raw));
  const collect = {'seo-ai-search':collectSeo,accessibility:collectAccessibility,performance:collectPerformance}[request.agentId];
  const result = await collect(request,{executablePath:process.env.CHROME_PATH,signal:AbortSignal.timeout(420_000)});
  const portable = {...result,artifacts:result.artifacts.map(a=>({...a,bytes:Buffer.from(a.bytes).toString('base64'),encoding:'base64'}))};
  await writeFile('collector-result.json',JSON.stringify(portable),{mode:0o600});
  console.log(JSON.stringify({agentId:request.agentId,testedUrl:result.testedUrl,coverage:result.coverage.map(c=>({subject:c.subject,status:c.status})),findings:result.findings.length}));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Collection failed'); process.exitCode=1;
}
