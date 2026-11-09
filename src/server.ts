import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { recentReviews, saveReview } from './recent-reviews.js';
import { runAgent } from './run.js';
import { renderReport } from './report.js';
import { collectRemote } from './core/remote.js';
import { openRunStore } from './core/store.js';
import { validateRequest } from './core/input.js';
import { loadPdfReports, PdfDownloadError } from './pdf-download.js';
import { renderCombinedPdf } from './pdf-report.js';
import { buildCustomerReportWithArtifacts } from './customer-report.js';
import type { AgentReport } from './core/types.js';

const port=Number(process.env.PORT||4175);
const storageRoot=resolve(process.env.RUN_STORAGE_ROOT||'.runs');
const remote=process.env.BROWSER_RUNTIME==='github-actions';
const reports=new Map<string,AgentReport>();
let busy=false;
const server=createServer(async(req,res)=>{
  const send=(status:number,type:string,body:string|Buffer)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(body);};
  const json=(status:number,body:unknown)=>send(status,'application/json; charset=utf-8',JSON.stringify(body));
  try {
    const host=req.headers.host;
    if(!host || ![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)) return json(403,{error:'This local demo only accepts localhost requests'});
    if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)) return json(403,{error:'Cross-origin requests are not permitted'});
    const url=new URL(req.url||'/',`http://${host}`);
    const path=url.pathname;
    if(req.method==='GET' && path==='/api/health') return json(200,{status:'ok',agents:['seo-ai-search','accessibility','performance'],runtime:{mode:remote?'github-actions':'local',browserReady:remote||Boolean(process.env.CHROME_PATH)}});
    if(req.method==='GET' && path==='/api/reviews') return json(200,{reviews:await recentReviews(storageRoot)});
    if(req.method==='POST' && path==='/api/reviews') {
      if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'Use application/json'});
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1024)return json(413,{error:'Review selection too large'});chunks.push(chunk);}
      try{await saveReview(storageRoot,JSON.parse(Buffer.concat(chunks).toString()));return json(200,{saved:true});}
      catch{return json(400,{error:'Choose saved results for the same website.'});}
    }
    if(req.method==='GET' && (path==='/api/report.pdf' || path==='/api/report-summary')) {
      try {
        const selection=await loadPdfReports(url.searchParams,async id=>{
          const cached=reports.get(id);if(cached)return cached;
          try {const store=await openRunStore(storageRoot,id);return JSON.parse(await store.readReport()) as AgentReport;}catch{return undefined;}
        });
        const loadArtifact=async(runId:string,id:string)=>{
          const report=selection.reports.find(report=>report.runId===runId);
          const artifact=report?.artifacts.find(artifact=>artifact.id===id);
          if(!artifact || !['image/png','image/jpeg','application/json'].includes(artifact.mediaType))return undefined;
          try {return await (await openRunStore(storageRoot,runId)).readArtifact(id);}catch{return undefined;}
        };
        if(path==='/api/report-summary') return json(200,await buildCustomerReportWithArtifacts(selection.reports,{scope:selection.scope,loadArtifact}));
        const pdf=await renderCombinedPdf(selection.reports,{scope:selection.scope,loadArtifact});
        res.setHeader('Content-Disposition','attachment; filename="solvd-maintenance-report.pdf"');
        return send(200,'application/pdf',pdf);
      } catch(error) {if(error instanceof PdfDownloadError)return json(error.status,{error:error.message});throw error;}
    }
    if(req.method==='POST' && path==='/api/run') {
      if(busy) return json(429,{error:'A check is already running. Wait for it to finish before starting another.'});
      if(!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:'Use application/json'});
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>3_000_000)return json(413,{error:'Request exceeds 3 MB'});chunks.push(chunk);}
      let input:unknown;
      try{input=JSON.parse(Buffer.concat(chunks).toString());validateRequest(input);}catch(error){return json(400,{error:error instanceof Error?error.message:'Invalid input'});}
      if(busy) return json(429,{error:'A check is already running'});
      busy=true;
      const disconnect=new AbortController();
      const onClose=()=>{if(!res.writableEnded)disconnect.abort(new Error('Client disconnected'));};
      res.on('close',onClose);
      try {
        const report=await runAgent(input,{storageRoot,collector:remote?collectRemote:undefined,signal:AbortSignal.any([AbortSignal.timeout(660_000),disconnect.signal])});
        reports.set(report.runId,report);if(reports.size>20)reports.delete(reports.keys().next().value!);
        return json(200,report);
      } finally {busy=false;res.off('close',onClose);}
    }
    const match=/^\/api\/runs\/(run_[a-f0-9]{24})\/(report\.html|report\.json|baseline\.json|artifacts\/(art_[a-f0-9]{24}))$/.exec(path);
    if(req.method==='GET' && match) {
      let report=reports.get(match[1]);
      if(!report)try{const store=await openRunStore(storageRoot,match[1]);report=JSON.parse(await store.readReport()) as AgentReport;}catch{return json(404,{error:'Run not found'});}
      if(match[2]==='report.html')return send(200,'text/html; charset=utf-8',renderReport(report!));
      if(match[2]==='report.json')return json(200,report);
      if(match[2]==='baseline.json')return report!.baseline?json(200,report!.baseline):json(404,{error:report!.baselineUnavailableReason||'Baseline unavailable'});
      const artifact=report!.artifacts.find(a=>a.id===match[3]);
      if(!artifact)return json(404,{error:'Artifact not found'});
      try {const store=await openRunStore(storageRoot,match[1]);res.setHeader('Content-Disposition',`attachment; filename="${artifact.id}"`);return send(200,artifact.mediaType,await store.readArtifact(artifact.id));}catch{return json(404,{error:'Raw artifact was not retained'});}
    }
    const files:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8']};
    if(req.method==='GET' && files[path])return send(200,files[path][1],await readFile(resolve('public',files[path][0])));
    return json(404,{error:'Not found'});
  } catch(error) {console.error(error instanceof Error?error.message:'Request failed');json(502,{error:error instanceof Error?error.message:'Check failed'});}
});
server.requestTimeout=700_000;
server.listen(port,'127.0.0.1',()=>console.log(`Maintenance agents: http://127.0.0.1:${port} (${remote?'live GitHub Actions browser':'local browser'})`));
