import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildCustomerReport } from './customer-report.js';
import { openRunStore } from './core/store.js';
import { loadPdfReports } from './pdf-download.js';
import type { AgentReport } from './core/types.js';

const validId = /^run_[a-f0-9]{24}$/;
export interface ReviewSelection { runIds: string[]; scope: 'all' | 'selected' }
export interface RecentReview { url: string; date: string; verdict: string; href: string }
export async function readSavedReport(root:string,id:string):Promise<AgentReport|undefined>{
  if(!validId.test(id))return;
  try {
    if(!(await lstat(join(root,id))).isDirectory())return;
    const report=JSON.parse(await (await openRunStore(root,id)).readReport()) as AgentReport;
    return report.runId===id?report:undefined;
  }catch{return;}
}
export async function saveReview(root:string,input:unknown):Promise<void>{
  const value=input as Partial<ReviewSelection>|null;
  if(!value||!Array.isArray(value.runIds)||value.runIds.some(id=>typeof id!=='string'))throw new Error('Invalid saved review selection');
  const params=new URLSearchParams({runs:value.runIds.join(','),scope:value.scope??'selected'});
  const selection=await loadPdfReports(params,id=>readSavedReport(root,id));
  const record:ReviewSelection={runIds:selection.reports.map(r=>r.runId),scope:selection.scope};
  const base=await realpath(resolve(root)),directory=join(base,'reviews');
  await mkdir(directory,{recursive:true,mode:0o700});
  if(!(await lstat(directory)).isDirectory()||await realpath(directory)!==directory)throw new Error('Invalid review storage');
  const key=createHash('sha256').update(JSON.stringify({...record,runIds:[...record.runIds].sort()})).digest('hex');
  try{await writeFile(join(directory,`review_${key}.json`),JSON.stringify(record),{flag:'wx',mode:0o600});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
}
export async function recentReviews(root:string,limit=20):Promise<RecentReview[]>{
  root=await realpath(resolve(root)).catch(()=>resolve(root));
  const selections:ReviewSelection[]=[];
  const entries=await readdir(root,{withFileTypes:true}).catch(()=>[]);
  // Existing individual runs remain discoverable before any combined review is bookmarked.
  const dirs=await Promise.all(entries.filter(e=>e.isDirectory()&&validId.test(e.name)).map(async e=>({id:e.name,time:(await lstat(join(root,e.name)).catch(()=>null))?.mtimeMs??0})));
  selections.push(...dirs.sort((a,b)=>b.time-a.time).slice(0,200).map(e=>({runIds:[e.id],scope:'selected' as const})));
  const directory=join(resolve(root),'reviews');
  if(await realpath(directory).catch(()=>undefined)===directory){
    const files=await readdir(directory,{withFileTypes:true}).catch(()=>[]);
    const ordered=await Promise.all(files.filter(e=>e.isFile()&&/^review_[a-f0-9]{64}\.json$/.test(e.name)).map(async file=>({name:file.name,time:(await lstat(join(directory,file.name)).catch(()=>null))?.mtimeMs??0})));
    for(const file of ordered.sort((a,b)=>b.time-a.time).slice(0,200)){
      try{const path=join(directory,file.name);if((await lstat(path)).size>1024)continue;selections.push(JSON.parse(await readFile(path,'utf8')));}catch{}
    }
  }
  const cache=new Map<string,Promise<AgentReport|undefined>>();
  const read=(id:string)=>{if(!cache.has(id))cache.set(id,readSavedReport(root,id));return cache.get(id)!;};
  const rows=await Promise.all(selections.map(async selection=>{
    try {
      if(!Array.isArray(selection.runIds))return;
      const params=new URLSearchParams({runs:selection.runIds.join(','),scope:selection.scope});
      const {reports,scope}=await loadPdfReports(params,read);
      const view=buildCustomerReport(reports,{scope});
      const date=reports.map(r=>r.completedAt).sort().at(-1)!;
      if(!Number.isFinite(new Date(date).valueOf()))return;
      const href=scope==='selected'&&reports.length===1?`/?run=${reports[0].runId}`:`/?${new URLSearchParams({scope,runs:selection.runIds.join(',')})}`;
      const verdict=view.sections.map(s=>`${s.title}: ${s.rating.score===undefined?s.rating.label:`${s.rating.score}/100`}`).join(' · ');
      return {url:view.targetUrl,date,verdict,href};
    }catch{return;}
  }));
  return [...new Map(rows.filter((r):r is RecentReview=>Boolean(r)).map(r=>[r.href,r])).values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,limit);
}
