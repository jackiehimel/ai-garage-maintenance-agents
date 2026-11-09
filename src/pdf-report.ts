import PDFDocument from 'pdfkit';
import { buildCustomerReportWithArtifacts } from './customer-report.js';
import type { CustomerFinding, CustomerSection } from './customer-report.js';
import type { AgentReport } from './core/types.js';

export interface CustomerPdfOptions {
  scope?: 'all' | 'selected';
  loadArtifact?: (runId: string, artifactId: string) => Promise<Buffer | undefined>;
}
// Design Report reference: Letter, 1-inch margins, black Helvetica hierarchy,
// broad images, comparison tables and quiet captions. Customer brief controls flow.
const C = {ink:'#101010',muted:'#595959',green:'#215D49',line:'#D9D9D9',pale:'#F3F5F4',amber:'#855310',red:'#A02F2F',white:'#FFFFFF'};
function printable(input:string):string {
  return input.normalize('NFC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201C\u201D]/g,'"').replace(/\u2026/g,'...').replace(/\u00A0/g,' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\n\t]/gu,char=>`[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`);
}
export async function renderCombinedPdf(reports:AgentReport[],options:CustomerPdfOptions={}):Promise<Buffer> {
  const report=await buildCustomerReportWithArtifacts(reports,options);
  const doc=new PDFDocument({size:'LETTER',margins:{top:72,bottom:72,left:72,right:72},autoFirstPage:false,bufferPages:true,
    info:{Title:'Website review | Solvd',Author:'Solvd',Subject:report.targetUrl,Creator:'Solvd maintenance agents'}});
  const chunks:Buffer[]=[];
  const result=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const L=72,W=468,B=716;let label='Website review';
  doc.on('pageAdded',()=>{
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.green).text('solvd.',L,31,{lineBreak:false});
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(printable(label),280,36,{width:260,align:'right',lineBreak:false});
    doc.x=L;doc.y=75;
  });
  const h=(value:string,size=10,bold=false,width=W)=>{doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size);return doc.heightOfString(printable(value),{width,lineGap:2});};
  const ensure=(height:number)=>{if(doc.y+height>B)doc.addPage();};
  function text(value:string,size=10,ink=C.ink,bold=false,gap=6,width=W,x=L){
    if(!value)return;const content=printable(value);ensure(Math.min(h(content,size,bold,width)+gap,B-75));
    doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(ink).text(content,x,doc.y,{width,lineGap:2});doc.y+=gap;doc.x=L;
  }
  function title(value:string){text(value,26,C.ink,false,10);}
  function heading(value:string){ensure(38);doc.y+=6;text(value,15,C.ink,false,9);}
  function rule(gap=12){doc.moveTo(L,doc.y).lineTo(L+W,doc.y).strokeColor(C.line).lineWidth(.6).stroke();doc.y+=gap;}
  function page(value:string){label=value;doc.addPage();title(value);}
  function sectionIntro(section:CustomerSection){
    text(section.rating.label,10,section.rating.tone==='good'?C.green:section.rating.tone==='limited'?C.muted:section.agentId==='accessibility'?C.red:C.amber,true,8);
    text(section.headline,10,C.ink,false,5);text(section.scope,9,C.muted,false,9);
  }
  function resourceName(value:string):string {
    // Keep actual file names and measured costs; full paths remain in the technical report.
    return value.replace(/(?:https?:\/\/)?[^\s/]+\/(?:[^\s()]*\/)?([^\s/()]+)(?=\s*\()/g,'$1');
  }
  function finding(item:CustomerFinding){
    const kind=item.kind==='finding'?'Finding':item.kind==='review'?'Needs review':'Observation';
    const details=item.deviceDetails;
    const where=!details&&item.where.length?`Where: ${item.where.join('; ')}`:'';
    const multiplePages=new Set(details?.map(d=>d.page)).size>1;
    const detailLines=details?.map(d=>`${d.device}${multiplePages?` (${d.page})`:''}: ${d.resources.map(resourceName).join('; ')}`)??[];
    const body=[item.impact,...detailLines];
    const owner=`Suggested owner: ${item.owner}`;
    const height=h(`${kind}  /  ${item.title}`,11,true)+body.reduce((n,v)=>n+h(v,9.5)+5,0)+h(where,8.5)+h(`Next action: ${item.recommendation}`,9.5)+h(owner,8)+31;
    ensure(Math.min(height,B-75));
    text(`${kind}  /  ${item.title}`,11,item.kind==='finding'?C.red:item.kind==='review'?C.amber:C.green,true,7);
    text(item.impact,9.5,C.ink,false,5);
    for(const line of detailLines)text(line,8.5,C.muted,false,5);
    if(where)text(where,8.5,C.muted,false,5);
    text(`Next action: ${item.recommendation}`,9.5,C.ink,false,5);
    text(owner,8,C.muted,false,7);rule();
  }
  function quietEnd(section:CustomerSection){
    if(section.agentAssessment){heading(section.agentAssessment.label);text(section.agentAssessment.text,10);text(section.agentAssessment.note,8,C.muted);}
    const note=[section.comparison,`Scope: ${section.limits}`].filter(Boolean).join(' ');
    ensure(h(note,8)+18);doc.y+=5;text(note,8,C.muted,false,6);
  }
  async function screenshot(section:CustomerSection,width=W,maxHeight=140,x=L):Promise<boolean>{
    const ref=section.images[0];if(!ref)return false;
    try{
      const bytes=ref.dataUrl?Buffer.from(ref.dataUrl.split(',')[1],'base64'):await options.loadArtifact?.(ref.runId,ref.artifactId);
      if(!bytes)return false;
      const required=maxHeight+h(ref.caption,8,false,width)+12;ensure(required);const y=doc.y;
      doc.image(bytes,x,y,{fit:[width,maxHeight]});doc.y=y+maxHeight+6;
      text(ref.caption.replace(/seo/g,'SEO'),8,C.muted,false,8,width,x);return true;
    }catch{return false;}
  }
  const perf=report.sections.find(s=>s.agentId==='performance');
  const metric=(device:string,name:string)=>perf?.metrics.find(m=>m.label.includes(name)&&(m.label.startsWith(device)||!m.label.includes(' - ')&&perf.scope.startsWith(device)));
  function timingChart(){
    const rows=[['Phones',metric('Mobile','(LCP)')],['Desktop',metric('Desktop','(LCP)')]] as const;
    const values=rows.filter((r):r is readonly ['Phones'|'Desktop',NonNullable<typeof r[1]>]=>Boolean(r[1])).map(([name,m])=>({name,value:parseFloat(m.value)})).filter(r=>Number.isFinite(r.value));
    if(!values.length)return;
    ensure(104);const y=doc.y,barX=L+65,barW=W-135,scale=Math.max(4,...values.map(r=>r.value)),goalX=barX+2/scale*barW;
    text('Time until main content appears',11,C.ink,true,12);
    const top=doc.y;
    for(const [i,r] of values.entries()){
      const ry=top+i*28;doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(r.name,L,ry+3,{lineBreak:false});
      doc.rect(barX,ry,barW,16).fill(C.pale);doc.rect(barX,ry,r.value/scale*barW,16).fill(r.value>=4?C.red:C.amber);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink).text(`${r.value.toFixed(1)} s`,L+W-53,ry+1,{lineBreak:false});
    }
    doc.moveTo(goalX,top-4).lineTo(goalX,top+values.length*28-8).lineWidth(1).dash(2,{space:2}).strokeColor(C.green).stroke().undash();
    doc.y=top+values.length*28+3;text('Goal: under 2 s. Main-content timing (LCP) is the page-load proxy used here.',8,C.muted,false,10);doc.y=Math.max(doc.y,y+100);
  }
  function verdicts(){
    heading('At a glance');
    for(const section of report.sections){
      const verdict=section.rating.score===undefined?section.rating.label:`${section.rating.score}/100 - ${section.rating.label}`;
      const rowH=Math.max(h(section.title,10,true,155),h(verdict,12,true,285))+h(section.rating.basis,8,false,285)+22;
      ensure(rowH);const y=doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(printable(section.title),L,y,{width:155,lineGap:2});
      doc.font('Helvetica-Bold').fontSize(12).fillColor(section.rating.tone==='good'?C.green:section.rating.tone==='limited'?C.muted:section.agentId==='accessibility'?C.red:C.amber).text(printable(verdict),L+170,y,{width:W-170,lineGap:2});
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(printable(section.rating.basis),L+170,doc.y+5,{width:W-170,lineGap:2});doc.y=y+rowH;rule();
    }
  }
  function metricsTable(section:CustomerSection){
    const defs=[['Performance score','performance score'],['Main content appears','(LCP)'],['Blocking during load','(TBT)'],['Visual stability','(CLS)']];
    for(const [name,key] of defs){
      const all=section.metrics.filter(m=>m.label.includes(key)).map(item=>({device:item.label.startsWith('Mobile')||(!item.label.includes(' - ')&&section.scope.startsWith('Mobile'))?'Mobile':'Desktop',item}));
      for(let offset=0;offset<all.length;offset+=2){
      const items=all.slice(offset,offset+2);
      const colW=W/items.length,maxH=Math.max(...items.map(r=>h(r.item!.interpretation,8,false,colW-20)))+46;
      ensure(maxH+9);const y=doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(name,L,y,{width:W});
      for(const [i,{device,item}] of items.entries()){
        const x=L+i*colW;doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(device,x,y+17,{width:colW-20});
        doc.font('Helvetica-Bold').fontSize(20).fillColor(item!.tone==='good'?C.green:C.amber).text(printable(item!.value),x+48,y+12,{width:colW-68});
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(printable(item!.interpretation),x,y+39,{width:colW-20,lineGap:2});
      }
      doc.y=y+maxH;rule(6);
      }
    }
  }
  function samples(section:CustomerSection){
    if(!section.sampleScores.length)return;ensure(115);heading('Sample scores');
    for(const sample of section.sampleScores){
      ensure(43);const y=doc.y;text(sample.label,9,C.ink,true,3);
      const gap=12,w=(W-gap*(sample.values.length-1))/sample.values.length,top=doc.y;
      for(const [i,value] of sample.values.entries()){
        const x=L+i*(w+gap);doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(`Sample ${i+1}: ${Math.round(value)}`,x,top,{width:w});
        doc.rect(x,top+13,w,5).fill(C.line);doc.rect(x,top+13,w*Math.max(0,Math.min(100,value))/100,5).fill(C.green);
      }
      doc.y=Math.max(y+43,top+25);
    }
    text('The headline score is the median of the completed lab samples for that device.',8,C.muted,false,8);
  }
  page('Website review');
  text(`${report.targetUrl}  |  ${report.dateLabel}`,10,C.muted,false,18);
  text(report.headline,22,C.ink,true,18);timingChart();verdicts();
  heading('Start with the customer experience');
  const first=report.sections.find(s=>s.agentId==='accessibility')?.findings.filter(f=>f.kind==='finding').slice(0,2)??[];
  for(const item of first)text(`${item.title}. ${item.recommendation}`,10,C.ink,false,8);
  if(!first.length)text(report.nextStep.body,10);
  text(report.key,8,C.muted,false,0);

  for(const section of report.sections.filter(s=>s.agentId!=='performance')){
    page(section.title);
    if(section.agentId==='seo-ai-search'&&section.images.length){
      const top=doc.y;
      const found=await screenshot(section,208,100,L+260);const imageEnd=doc.y;doc.y=top;
      text(section.rating.label,11,C.amber,true,8,240);
      text(section.headline,10,C.ink,false,7,240);
      text(section.scope,9,C.muted,false,8,240);
      doc.y=Math.max(doc.y,found?imageEnd:top)+10;
    }else sectionIntro(section);
    for(const item of section.findings)finding(item);
    if(section.positives.length){heading('What is working');for(const positive of section.positives)text(positive,9,C.ink,false,3);}
    if(section.reviewGroups.length)text('The remaining human checks are grouped under Where Solvd can go further.',9,C.muted,false,8);
    if(section.agentId!=='seo-ai-search'&&!report.sections.some(s=>s.agentId==='seo-ai-search'))await screenshot(section);
    quietEnd(section);
  }
  if(perf){
    page(perf.scope.includes('Mobile')&&perf.scope.includes('Desktop')?'Performance on phones and desktop':perf.scope.includes('Mobile')?'Performance on phones':'Performance on desktop');sectionIntro(perf);metricsTable(perf);samples(perf);quietEnd(perf);
    if(!report.sections.some(s=>s.agentId==='seo-ai-search'))await screenshot(perf);
    if(perf.findings.length){page('What will improve loading');text('Mobile and desktop observations are combined below. Estimated savings are opportunities to validate, not guaranteed improvements.',10,C.muted,false,16);for(const item of perf.findings)finding(item);}
  }
  const followups=report.sections.flatMap(section=>section.reviewGroups.map(group=>({section,group})));
  if(followups.length||doc.y>400)page('Where Solvd can go further');else heading('Where Solvd can go further');
  text(report.nextStep.body,12,C.ink,false,17);
  for(const {section,group} of followups){
    ensure(h(group.body,10)+65);text(`${group.title}${group.count?` - ${group.count} ${group.count===1?'element':'elements'}`:''}`,12,C.ink,true,7);text(group.body,10,C.ink,false,8);text(section.title,8,C.muted,false,12);rule();
  }
  heading(report.nextStep.title);
  for(const item of report.nextStep.items)text(item,11,C.ink,false,12);
  const range=doc.bufferedPageRange();
  for(let index=range.start;index<range.start+range.count;index++){
    doc.switchToPage(index);const saved=doc.page.margins.bottom;doc.page.margins.bottom=0;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Solvd  |  Public website review',L,752,{width:310,lineBreak:false});
    doc.text(`Page ${index+1} of ${range.count}`,420,752,{width:120,align:'right',lineBreak:false});doc.page.margins.bottom=saved;
  }
  doc.end();return result;
}
