import type {Page} from 'playwright';
import {abortable,deadlineSignal} from '../core/network.js';

export interface KeyboardProbeFocus {
  selector:string; tag:string; labelHint:string; role?:string;
  rect:{x:number;y:number;width:number;height:number}; frameBoundary?:boolean; inShadow?:boolean;
}
export interface KeyboardProbe {
  status:'complete'|'incomplete'|'unavailable';
  steps:Array<{index:number;key:'Tab'|'Shift+Tab';focus:KeyboardProbeFocus|null}>;
  reason?:string;
  termination:'repeat'|'step-limit'|'frame-boundary'|'guard-blocked'|'timeout'|'aborted'|'error'|'unavailable';
  forwardLimit:number; reverseLimit:number; elapsedMs:number; scopeLimit:string;
}
export interface KeyboardProbeOptions {
  signal?:AbortSignal;
  readGuard:()=>Promise<{blocked:number}>;
  getBlockedRequests:()=>number;
  getBlockedReason?:()=>string|undefined;
  forwardLimit?:number; reverseLimit?:number; timeoutMs?:number;
}
export const KEYBOARD_SAMPLE_LIMIT = 'Bounded Tab and Shift+Tab sample in the initial document only. Observed labels are DOM/ARIA text hints, not computed accessible names. Review visible focus, intended order, widget activation, other states and screen-reader behavior manually; this sample does not check every interactive element.';
const bounded = (value:string,max:number) => String(value).replaceAll('\0','�').slice(0,max);
const cap = (value:number|undefined,max:number) => Number.isFinite(value) ? Math.max(1,Math.min(max,Math.floor(value!))) : max;

/** Read only the currently focused element, including open shadow roots, without activating it. */
async function readFocus(page:Page):Promise<KeyboardProbeFocus|null> {
  const focus = await page.evaluate(() => {
    let target = document.activeElement;
    let inShadow = false;
    for (let depth=0;depth<12 && target?.shadowRoot?.activeElement;depth++) {target=target.shadowRoot.activeElement;inShadow=true;}
    if (!target) return null;
    const path:string[] = [];
    for (let element:Element|null=target;element && path.length<8;element=element.parentElement) {
      if (element.id && element.id.length<=160) {path.unshift('#'+CSS.escape(element.id));break;}
      let ordinal=1;
      for(let previous=element.previousElementSibling;previous;previous=previous.previousElementSibling) if(previous.localName===element.localName) ordinal++;
      path.unshift(element.localName+(element.parentElement ? ':nth-of-type('+ordinal+')' : ''));
    }
    const root=target.getRootNode();
    const ids=(target.getAttribute('aria-labelledby') ?? '').split(/\s+/).slice(0,8);
    const labelled=ids.map(id => root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id)?.textContent?.slice(0,180) ?? '' : '').join(' ').trim();
    const labelHint=(target.getAttribute('aria-label') || labelled || target.getAttribute('alt') || target.textContent || '').replace(/\s+/g,' ').trim().slice(0,180);
    const rect=target.getBoundingClientRect();
    return {tag:target.localName,selector:(inShadow ? '[shadow] ' : '')+path.join(' > '),labelHint,
      role:target.getAttribute('role')?.slice(0,120),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
      frameBoundary:['iframe','frame','object','embed'].includes(target.localName),inShadow};
  });
  return focus ? {...focus,selector:bounded(focus.selector,1200),tag:bounded(focus.tag,80),labelHint:bounded(focus.labelHint,180),
    ...(focus.role ? {role:bounded(focus.role,120)} : {})} : null;
}

/** Caller must seal new requests and install the existing public action/navigation guards first. */
export async function collectKeyboardProbe(page:Page,options:KeyboardProbeOptions):Promise<KeyboardProbe> {
  const started=performance.now();
  const timer=deadlineSignal(cap(options.timeoutMs,8000),'Keyboard navigation sample reached its time limit.');
  const signal=AbortSignal.any([timer.signal,...(options.signal ? [options.signal] : [])]);
  const result:KeyboardProbe={status:'complete',steps:[],termination:'step-limit',forwardLimit:cap(options.forwardLimit,40),reverseLimit:cap(options.reverseLimit,10),elapsedMs:0,scopeLimit:KEYBOARD_SAMPLE_LIMIT};
  const stop=(termination:KeyboardProbe['termination'],reason:string) => {result.status='incomplete';result.termination=termination;result.reason=bounded(reason,500);};
  try {
    signal.throwIfAborted();
    const original=await abortable(options.readGuard(),signal);
    const requests=options.getBlockedRequests();
    const safe=async () => {
      const guard=await abortable(options.readGuard(),signal);
      if(guard.blocked!==original.blocked || options.getBlockedRequests()!==requests) {
        stop('guard-blocked',options.getBlockedReason?.() ?? 'The public read-only guard blocked an action, form submission or new request. Review the interaction manually.');return false;
      }
      return true;
    };
    let focus=await abortable(readFocus(page),signal);
    for(const [key,limit] of [['Tab',result.forwardLimit],['Shift+Tab',result.reverseLimit]] as const) {
      const seen:string[]=[];
      for(let i=0;i<limit;i++) {
        signal.throwIfAborted();
        if(focus?.frameBoundary) {stop('frame-boundary','Stopped at a frame boundary; review keyboard navigation within that content manually.');return result;}
        if(!await safe()) return result;
        await abortable(page.keyboard.press(key),signal);
        focus=await abortable(readFocus(page),signal);
        result.steps.push({index:result.steps.length+1,key,focus});
        if(!await safe()) return result;
        if(focus?.frameBoundary) {stop('frame-boundary','Stopped at a frame boundary; review keyboard navigation within that content manually.');return result;}
        seen.push(focus?.selector ?? '(no focused element)');
        const length=seen.length;
        // Two identical observed sequences suffice to stop sampling, without diagnosing a trap.
        let repeated=false;
        for(let span=1;span<=Math.floor(length/2);span++) {
          if(seen.slice(length-span).every((value,j)=>value===seen[length-2*span+j])) {repeated=true;break;}
        }
        if(repeated) {result.termination='repeat';result.reason='A focus sequence repeated; document wrap or intentional containment may explain this observation. Review the intended order manually.';break;}
      }
    }
  } catch(error) {
    stop(timer.signal.aborted ? 'timeout' : options.signal?.aborted ? 'aborted' : 'error',error instanceof Error ? error.message : String(error));
  } finally {timer.stop();result.elapsedMs=Math.round(performance.now()-started);}
  return result;
}
