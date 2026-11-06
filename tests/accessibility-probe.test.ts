import assert from 'node:assert/strict';
import test from 'node:test';
import type {Page} from 'playwright';

const modulePath = '../src/agents/accessibility-probe.js';
async function probe() {
  const loaded = await import(modulePath).catch(() => ({}));
  assert.equal(typeof loaded.collectKeyboardProbe,'function','bounded keyboard probe must be implemented');
  return loaded.collectKeyboardProbe as (page:Page,options:Record<string,unknown>) => Promise<any>;
}
function fixture(sequence:string[],settings:{frameAt?:number;failAt?:number;blockedAt?:number;hang?:boolean;displaySelector?:string} = {}) {
  let offset = 0;
  const keys:string[] = [];
  const page = {
    keyboard:{async press(key:string) {keys.push(key);offset++;if(settings.failAt === offset) throw new Error('Detached document');if(settings.hang) await new Promise(() => {});}},
    async evaluateHandle() {return {dispose:async () => {}};},
    async evaluate() {const tag = settings.frameAt === offset ? 'iframe' : 'button';return {identity:offset % sequence.length,focus:{tag,selector:settings.displaySelector ?? sequence[offset % sequence.length],labelHint:'<img src=x>\0' + 'x'.repeat(1000),rect:{x:0,y:0,width:20,height:20},frameBoundary:tag === 'iframe'}};},
  } as unknown as Page;
  return {page,keys,options:{readGuard:async () => ({blocked:settings.blockedAt === offset ? 1 : 0}),getBlockedRequests:() => 0}};
}
test('records bounded forward and reverse observations; repeats are observations, never trap findings', async () => {
  const run = await probe();const f = fixture(['#a','#b','#c']);
  const result = await run(f.page,{...f.options,forwardLimit:8,reverseLimit:4});
  assert.equal(result.status,'complete');
  assert.equal(result.termination,'repeat');
  assert.ok(f.keys.includes('Shift+Tab'));
  assert.ok(result.steps.length <= 12);
  assert.match(result.scopeLimit,/sample/i);
  assert.doesNotMatch(result.reason ?? '',/trap|violation/i);
  assert.ok(result.steps[0].focus.labelHint.length <= 180);
  assert.ok(!result.steps[0].focus.labelHint.includes('\0'));
});
test('step caps cannot exceed 40 forward and 10 reverse', async () => {
  const run = await probe();const f = fixture(Array.from({length:100},(_,i) => '#item-' + i));
  const result = await run(f.page,{...f.options,forwardLimit:999,reverseLimit:999});
  assert.equal(result.status,'complete');assert.equal(result.termination,'step-limit');
  assert.equal(f.keys.filter(key => key === 'Tab').length,40);
  assert.equal(f.keys.filter(key => key === 'Shift+Tab').length,10);
});
test('frame boundary and blocked form/navigation action stop the sample', async () => {
  const run = await probe();
  for(const [settings,termination] of [[{frameAt:1},'frame-boundary'],[{blockedAt:1},'guard-blocked']] as const) {
    const f = fixture(['#a','#b','#c'],settings);const result = await run(f.page,f.options);
    assert.equal(result.status,'incomplete');assert.equal(result.termination,termination);assert.equal(f.keys.length,1);
  }
});
test('deadline, abort, and evaluation failures return portable limitations', async () => {
  const run = await probe();const hanging = fixture(['#a'],{hang:true});
  const timed = await run(hanging.page,{...hanging.options,timeoutMs:15});
  assert.equal(timed.status,'incomplete');assert.equal(timed.termination,'timeout');
  const failed = fixture(['#a','#b'],{failAt:2});const failure = await run(failed.page,failed.options);
  assert.equal(failure.steps.length,1);assert.equal(failure.status,'incomplete');assert.match(failure.reason,/Detached document/);
  const controller = new AbortController();controller.abort();const f = fixture(['#a']);
  assert.equal((await run(f.page,{...f.options,signal:controller.signal})).status,'incomplete');assert.equal(f.keys.length,0);
});


test('distinct focus elements with identical truncated display paths do not end sampling early', async () => {
  const run=await probe();
  const displaySelector=Array.from({length:8},()=> 'div:nth-of-type(1)').join(' > ')+' > button:nth-of-type(1)';
  const f=fixture(['deep-branch-a','deep-branch-b','deep-branch-c','deep-branch-d','deep-branch-e'],{displaySelector});
  const result=await run(f.page,{...f.options,forwardLimit:4,reverseLimit:1});
  assert.equal(result.termination,'step-limit');
  assert.equal(f.keys.filter(key=>key==='Tab').length,4);
  assert.equal(result.steps.length,5);
  assert.ok(result.steps.every((step:any)=>step.focus.selector===displaySelector));
});
