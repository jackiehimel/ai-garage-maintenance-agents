import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectKeyboardProbe} from '../dist/app/agents/accessibility-probe.js';
import {publicAccessibilityGuardScript} from '../dist/app/agents/accessibility.js';

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,chromiumSandbox:true});
const fixtureUrl='https://fixture.example.test/';
try {
  async function fixture(name,html,check) {
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    let blocked=0;
    let initialDocument=true;
    await context.route('**/*',async route=>{
      if(initialDocument && route.request().isNavigationRequest() && route.request().url()===fixtureUrl) {
        initialDocument=false;
        return route.fulfill({status:200,contentType:'text/html',body:html});
      }
      blocked++;await route.abort('blockedbyclient');
    });
    try {
      // A synthetic HTTPS origin exercises the Navigation API used by real
      // scanned pages; opaque about:blank documents disable that API behavior.
      // Every request is intercepted here; no fixture request reaches a server.
      await page.goto(fixtureUrl,{waitUntil:'load'});
      await page.evaluate(publicAccessibilityGuardScript('fixtureGuard'));
      await page.evaluate(()=>window.fixtureGuard.seal());
      const result=await collectKeyboardProbe(page,{
        signal:AbortSignal.timeout(10_000),
        readGuard:()=>page.evaluate(()=>window.fixtureGuard.read()),
        getBlockedRequests:()=>blocked,
        getBlockedReason:()=>blocked?'Fixture prevented an outbound request':undefined,
      });
      await check(result,page,()=>blocked);
      console.log('ASSISTED_FIXTURE_VERIFIED '+JSON.stringify({name,status:result.status,termination:result.termination,steps:result.steps.length}));
    } finally {await context.close();}
  }
  await fixture('forward-reverse-and-wrap','<button id="a">Alpha</button><button id="b">Beta</button><button id="c">Gamma</button>',async result=>{
    assert.equal(result.status,'complete');
    assert(result.steps.some(s=>s.key==='Shift+Tab'),'Reverse keyboard traversal missing');
    for(const id of ['a','b','c'])assert(result.steps.some(s=>s.focus?.selector==='#'+id),'Expected focus target '+id);
    assert(result.steps.length<=50);assert(result.elapsedMs<10_000);
  });
  await fixture('repeated-focus-is-observation','<button id="a" onkeydown="if(event.key===\'Tab\')event.preventDefault()">Repeated focus</button><button id="b">Other control</button>',async result=>{
    assert(result.steps.length<=50);assert(result.steps.some(s=>s.focus?.selector==='#a'));
    assert.equal(result.termination,'repeat','Returning to the same element must still stop a repeated sequence');
    assert.equal(result.findings,undefined,'Probe must not invent confirmed WCAG failures');
  });
  const nestedCollisions=Array.from({length:42},()=>'<section>'+ '<div>'.repeat(9)+'<button>Identical label</button>'+'</div>'.repeat(9)+'</section>').join('');
  await fixture('distinct-elements-with-colliding-display-paths',nestedCollisions,async result=>{
    assert.equal(result.status,'complete');assert.equal(result.termination,'step-limit');
    assert.equal(result.steps.filter(s=>s.key==='Tab').length,40,'Colliding display paths must not stop forward sampling');
    assert.equal(result.steps.filter(s=>s.key==='Shift+Tab').length,10);
    assert.equal(new Set(result.steps.map(s=>s.focus?.selector)).size,1,'Fixture must actually produce colliding truncated paths');
    assert(result.steps.every(s=>s.focus?.labelHint==='Identical label'));
  });
  const shadowCollisions='<div id="hosts"></div><script>for(let i=0;i<42;i++){const host=document.createElement("div");document.getElementById("hosts").append(host);host.attachShadow({mode:"open"}).innerHTML="<button id=shared>Identical label</button>";}</script>';
  await fixture('distinct-shadow-host-elements-with-colliding-display-paths',shadowCollisions,async result=>{
    assert.equal(result.status,'complete');assert.equal(result.termination,'step-limit');
    assert.equal(result.steps.filter(s=>s.key==='Tab').length,40,'Elements in separate shadow roots must have distinct identities');
    assert.equal(result.steps.filter(s=>s.key==='Shift+Tab').length,10);
    assert.equal(new Set(result.steps.map(s=>s.focus?.selector)).size,1);
    assert(result.steps.every(s=>s.focus?.inShadow));
  });
  await fixture('open-shadow-focus','<div id="host"></div><script>const r=document.getElementById("host").attachShadow({mode:"open"});r.innerHTML="<button id=shadow-button>Shadow button</button>";</script><button>After shadow</button>',async result=>{
    assert(result.steps.some(s=>s.focus?.inShadow),'Open shadow focus was not recorded');
  });
  await fixture('frame-boundary','<button>Before frame</button><iframe title="Embedded content" srcdoc="<button>Inside frame</button>"></iframe><button>After frame</button>',async result=>{
    assert.equal(result.status,'incomplete');assert(result.steps.some(s=>s.focus?.frameBoundary),'Frame boundary was not recorded');
  });
  await fixture('focus-triggered-navigation','<button onfocus="location.href=\'https://fixture.invalid/not-allowed\'">Navigation attempt</button>',async(result,page,getBlocked)=>{
    const guard=await page.evaluate(()=>window.fixtureGuard.read());
    assert.equal(result.status,'incomplete');assert(getBlocked()>0||guard.blocked>0);assert.equal(page.url(),fixtureUrl);
  });
  await fixture('focus-triggered-form','<form id="form" action="https://fixture.invalid/not-allowed"><button type="button" onfocus="document.getElementById(\'form\').requestSubmit()">Submit attempt</button></form>',async(result,page,getBlocked)=>{
    assert.equal(result.status,'incomplete');assert.equal(getBlocked(),0,'Form guard must prevent network submission');assert.equal(page.url(),fixtureUrl);
  });
} finally {await browser.close();}
