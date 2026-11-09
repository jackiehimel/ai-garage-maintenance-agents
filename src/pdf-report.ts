import PDFDocument from 'pdfkit';
import { buildCustomerReportWithArtifacts } from './customer-report.js';
import type { CustomerFinding, CustomerSection, CustomerTone } from './customer-report.js';
import type { AgentReport } from './core/types.js';

export interface CustomerPdfOptions {
  scope?: 'all' | 'selected';
  loadArtifact?: (runId: string, artifactId: string) => Promise<Buffer | undefined>;
}
const color = {
  ink: '#192D2A', muted: '#586B66', green: '#215D49', line: '#DCE5E0', white: '#FFFFFF',
  good: { ink: '#215D49', pale: '#EDF5EF' }, attention: { ink: '#9A451E', pale: '#FFF2E7' }, limited: { ink: '#596671', pale: '#EEF1F4' },
};
function printable(input: string): string {
  return input.normalize('NFC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\n\t]/gu, char => `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`);
}

export async function renderCombinedPdf(reports: AgentReport[], options: CustomerPdfOptions = {}): Promise<Buffer> {
  const report = await buildCustomerReportWithArtifacts(reports, options);
  const doc = new PDFDocument({ size:'A4',margins:{top:91,bottom:69,left:46,right:46},autoFirstPage:false,bufferPages:true,
    info:{Title:'Your website review | Solvd',Author:'Solvd',Subject:report.targetUrl,Creator:'Solvd maintenance agents'} });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const left=46,width=503.28,bottom=766;
  let currentSection='WEBSITE REVIEW';
  doc.on('pageAdded',()=>{
    doc.font('Helvetica-Bold').fontSize(26).fillColor(color.green).text('solvd.',left,30,{lineBreak:false});
    doc.font('Helvetica').fontSize(8).fillColor(color.muted).text(printable(currentSection),260,40,{width:289,align:'right',lineBreak:false});
    doc.moveTo(left,71).lineTo(left+width,71).lineWidth(.6).strokeColor(color.line).stroke();
    doc.x=left;doc.y=91;
  });
  function ensure(height:number){if(doc.y+height>bottom)doc.addPage();}
  function height(value:string,size=10,bold=false,w=width){doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size);return doc.heightOfString(printable(value),{width:w,lineGap:2});}
  function text(value:string,size=10,ink=color.ink,bold=false,gap=7){
    const content=printable(value);ensure(Math.min(height(content,size,bold)+gap,660));
    doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(ink).text(content,left,doc.y,{width,lineGap:2});doc.y+=gap;
  }
  function heading(value:string){ensure(46);doc.y+=9;text(value,13,color.green,true,10);}
  function line(){ensure(15);doc.moveTo(left,doc.y).lineTo(left+width,doc.y).lineWidth(.5).strokeColor(color.line).stroke();doc.y+=13;}
  function bullet(value:string,size=10){text(`- ${value}`,size,color.ink,false,7);}
  function badge(label:string,tone:CustomerTone){
    const palette=color[tone],y=doc.y;doc.font('Helvetica-Bold').fontSize(9);const w=Math.min(width,doc.widthOfString(printable(label))+20);
    ensure(26);doc.roundedRect(left,y,w,21,5).fill(palette.pale);doc.fillColor(palette.ink).text(printable(label),left+10,y+6,{width:w-20,lineBreak:false});doc.y=y+31;
  }
  function finding(item:CustomerFinding){
    const where=item.where.length?`Where: ${item.where.join('; ')}`:'';
    const meta=`Suggested owner: ${item.owner}  |  Effort: ${item.effort}`;
    const h=height(item.title,11.5,true)+height(item.impact,9.5)+height(where,8.5)+height(item.recommendation,9.5)+height(meta,8)+50;
    ensure(Math.min(h,650));
    const y=doc.y,tone=item.kind==='finding'?'attention':item.kind==='review'?'limited':'good';
    doc.rect(left,y,3,12).fill(color[tone].ink);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(color[tone].ink).text(item.kind==='finding'?'FINDING':item.kind==='review'?'NEEDS REVIEW':'OBSERVATION',left+10,y+2,{lineBreak:false});doc.y=y+20;
    text(item.title,11.5,color.ink,true,6);text(item.impact,9.5,color.ink,false,5);
    if(where)text(where,8.5,color.muted,false,6);
    text(`Next action: ${item.recommendation}`,9.5,color.ink,false,6);
    text(meta,8,color.muted,false,8);line();
  }
  function metricGrid(section:CustomerSection){
    for(let index=0;index<section.metrics.length;index+=2){
      const pair=section.metrics.slice(index,index+2),gap=12,w=(width-gap)/2;
      const h=Math.max(...pair.map(m=>height(m.label,9,true,w-24)+height(m.interpretation,8.5,false,w-24)+59));ensure(h+12);const y=doc.y;
      pair.forEach((m,j)=>{const x=left+j*(w+gap),p=color[m.tone];doc.roundedRect(x,y,w,h,5).fill(p.pale);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(color.ink).text(printable(m.label),x+12,y+12,{width:w-24,lineGap:2});
        const valueY=doc.y+7;doc.font('Helvetica-Bold').fontSize(23).fillColor(p.ink).text(printable(m.value),x+12,valueY,{width:w-24});
        doc.font('Helvetica').fontSize(8.5).fillColor(color.muted).text(printable(m.interpretation),x+12,doc.y+5,{width:w-24,lineGap:2});});doc.y=y+h+12;doc.x=left;
    }
  }
  function sampleChart(section:CustomerSection){
    for(const sample of section.sampleScores){
      ensure(40+sample.values.length*21);text(sample.label,10,color.ink,true,8);
      const y=doc.y,barX=left+73,barWidth=width-112;
      sample.values.forEach((value,index)=>{const row=y+index*21,tone=value>=90?'good':'attention';
        doc.font('Helvetica').fontSize(8.5).fillColor(color.muted).text(`Sample ${index+1}`,left,row+3,{lineBreak:false});
        doc.roundedRect(barX,row,barWidth,12,3).fill(color.line);doc.roundedRect(barX,row,Math.max(2,Math.min(100,value)/100*barWidth),12,3).fill(color[tone].ink);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(color.ink).text(String(Math.round(value)),barX+barWidth+9,row+2,{lineBreak:false});});
      doc.y=y+sample.values.length*21+4;text('Scores vary between runs; the headline uses the median.',8,color.muted,false,10);
    }
  }
  async function image(section:CustomerSection){
    const ref=section.images[0];if(!ref||(!ref.dataUrl&&!options.loadArtifact))return;
    let bytes:Buffer|undefined;try{bytes=ref.dataUrl?Buffer.from(ref.dataUrl.split(',')[1],'base64'):await options.loadArtifact?.(ref.runId,ref.artifactId);}catch{return;}if(!bytes)return;
    // Only measured image artifacts are shown. A missing or invalid image leaves no placeholder.
    try{const y=doc.y;ensure(190);const imageY=doc.y;doc.image(bytes,left,imageY,{fit:[width,155],align:'center',valign:'center'});doc.y=imageY+163;text(ref.caption,8,color.muted,false,10);if(doc.y<y)doc.y=y;}catch{/* The text report remains useful if the stored image cannot be decoded. */}
  }

  doc.addPage();
  text('YOUR WEBSITE, AT A GLANCE',8.5,color.green,true,12);
  text('Where to focus next',29,color.ink,true,10);
  text(`${report.targetUrl}  |  ${report.dateLabel}`,10,color.muted,false,15);
  text(report.headline,14,color.ink,true,18);
  const gap=10,cardWidth=(width-gap*(report.sections.length-1))/report.sections.length,cardY=doc.y,cardHeight=157;
  report.sections.forEach((section,index)=>{
    const x=left+index*(cardWidth+gap),palette=color[section.rating.tone],inner=cardWidth-24;
    doc.roundedRect(x,cardY,cardWidth,cardHeight,7).fill(palette.pale);doc.rect(x,cardY,cardWidth,4).fill(palette.ink);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(color.ink).text(printable(section.title),x+12,cardY+15,{width:inner});
    let labelY=cardY+44;
    if(section.rating.score!==undefined){doc.font('Helvetica-Bold').fontSize(31).fillColor(palette.ink).text(String(section.rating.score),x+12,labelY,{lineBreak:false});doc.font('Helvetica').fontSize(12).text('/ 100',x+55,labelY+15,{lineBreak:false});labelY+=39;}
    doc.font('Helvetica-Bold').fontSize(section.rating.score===undefined?17:11).fillColor(palette.ink).text(printable(section.rating.label),x+12,labelY,{width:inner,lineGap:2});
    const basisY=Math.max(cardY+108,doc.y+8);doc.font('Helvetica').fontSize(8).fillColor(color.muted).text(printable(section.rating.basis),x+12,basisY,{width:inner,lineGap:2});
  });doc.y=cardY+cardHeight+19;doc.x=left;
  heading('Start with these priorities');
  const priorityItems=report.sections.flatMap(s=>s.findings.filter(f=>f.kind==='finding').map(f=>({section:s,item:f}))).slice(0,2);
  const perf=report.sections.find(s=>s.agentId==='performance');
  if(perf&&perf.rating.score!==undefined&&perf.rating.tone==='attention')priorityItems.push({section:perf,item:perf.findings[0]??{title:'Improve loading on the measured device',impact:perf.headline,recommendation:'Review the measured loading opportunities and repeat the test after changes.',owner:'Performance engineer',effort:'Investigation first',count:1,where:[],kind:'review',verification:''}});
  if(!priorityItems.length)for(const section of report.sections.slice(0,3)){text(section.title,10,color.ink,true,4);text(section.positives[0]??section.headline,9.5,color.muted,false,9);}
  for(const {item} of priorityItems){text(item.title,10.5,color.ink,true,5);text(item.recommendation,9.5,color.muted,false,10);}
  ensure(95);line();text(report.nextStep.title,13,color.green,true,8);text(report.nextStep.body,10,color.ink,false,9);
  text('Automated public-page review. Recommendations are starting points for a focused discussion with Solvd.',8,color.muted,false,8);

  for(const section of report.sections){
    currentSection=section.title.toUpperCase();doc.addPage();
    text(section.title,27,color.ink,true,12);badge(section.rating.score===undefined?section.rating.label:`${section.rating.score} / 100  |  ${section.rating.label}`,section.rating.tone);
    text(section.headline,12,color.ink,true,9);text(section.scope,9,color.muted,false,14);
    if(section.metrics.length)metricGrid(section);
    if(section.sampleScores.length)sampleChart(section);
    if(section.findings.length){heading('What to address');for(const item of section.findings)finding(item);}
    if(section.positives.length){heading('What is working');for(const positive of section.positives)bullet(positive,10);}
    if(section.agentId==='seo-ai-search') {
      const preview=section.images.length?section:report.sections.find(s=>s.images.length);
      if(preview)await image(preview);
    }
    if(section.reviewGroups.length){
      heading('Where a Solvd review can go further');
      for(const group of section.reviewGroups){ensure(height(group.body,9.5)+55);text(`${group.title}${group.count?` - ${group.count} ${group.count===1?'element':'elements'}`:''}`,10,color.green,true,5);text(group.body,9.5,color.ink,false,12);}
    }
    if(section.agentId!=='seo-ai-search'&&!report.sections.some(s=>s.agentId==='seo-ai-search'))await image(section);
    if(section.agentAssessment){heading(section.agentAssessment.label);text(section.agentAssessment.text,9.5,color.ink,false,7);text(section.agentAssessment.note,8,color.muted,false,9);}
    if(section.comparison){heading('Track progress');text(section.comparison,9,color.muted,false,8);}
    ensure(height(section.limits,8.5)+29);line();text(`Scope: ${section.limits}`,8.5,color.muted,false,7);
  }
  ensure(170);heading(report.nextStep.title);text('A practical next step',10,color.ink,true,6);
  for(const item of report.nextStep.items)bullet(item,9.5);
  text(report.key,8,color.muted,false,5);
  const range=doc.bufferedPageRange();
  for(let index=range.start;index<range.start+range.count;index++){
    doc.switchToPage(index);const margin=doc.page.margins.bottom;doc.page.margins.bottom=0;
    doc.moveTo(left,791).lineTo(left+width,791).strokeColor(color.line).lineWidth(.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(color.muted).text('SOLVD  |  Public website review',left,804,{width:350,lineBreak:false});doc.text(`Page ${index+1} of ${range.count}`,420,804,{width:129,align:'right',lineBreak:false});doc.page.margins.bottom=margin;
  }
  doc.end();return result;
}
