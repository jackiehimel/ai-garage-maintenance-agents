import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicResource, validateRequest } from '../src/core/input.js';
import { baselineIdentity, parseBaseline } from '../src/core/baseline.js';

test('public target syntax rejects credentials, IP literals, and internal names', () => {
  for (const targetUrl of [
    'http://public.example.com/', 'https://@public.example.com/', 'https://public.example.com:443/',
    'https://0x7f000001/',
    'https://[2606:4700:4700::1111]/', 'https://foo.localhost/', 'https://intranet/',
    'https://public.example.com\\@127.0.0.1/',
  ]) {
    assert.throws(() => validateRequest({ agentId: 'accessibility', targetUrl }), /URL|hostname|HTTPS|target/i, targetUrl);
  }
});

test('normalizes configured pages and rejects out-of-origin pages and excess sample bounds', () => {
  const r = validateRequest({agentId: 'performance', targetUrl: 'https://PUBLIC.example.com', pages: ['/about']});
  assert.deepEqual(r.pages.map((p: {url: string}) => p.url), ['https://public.example.com/', 'https://public.example.com/about']);
  assert.equal(r.profile.samples, 3);
  assert.throws(() => validateRequest({...r, pages: ['//other.example.com/']}), /origin|page/i);
  assert.throws(() => validateRequest({agentId: 'performance', targetUrl: r.targetUrl, profile: {samples: 2}}), /samples/i);
  assert.throws(() => validateRequest({agentId: 'performance', targetUrl: r.targetUrl, pages: ['/1','/2','/3']}), /pages/i);
});

test('public state configuration rejects arbitrary actions and unbounded keys', () => {
  const base = {agentId: 'accessibility', targetUrl: 'https://public.example.com'};
  for (const steps of [[{action:'script', code:'alert(1)'}],[{action:'key', key:'Control+Enter'}]]) {
    assert.throws(() => validateRequest({...base, states: [{id:'opened', page:'/', steps}]}), /action|key|field/i);
  }
  assert.throws(() => validateRequest({...base, states: [{id:'opened', page:'/unlisted', steps:[]}]}), /configured page/i);
  const result = validateRequest({...base, states: [{id:'menu', page:'/', steps:[{action:'key', key:'Tab'},{action:'assert-focus', selector:'button'}]}]});
  assert.equal(result.states[0].page, 'https://public.example.com/');
  assert.equal(result.supplied, undefined);
});

test('preserves bounded query and fragment state for configured HTTPS pages', () => {
  const r = validateRequest({agentId:'accessibility',targetUrl:'https://public.example.com/?plan=a%2Fb#details',pages:['/test?q=x#state']});
  assert.equal(r.targetUrl,'https://public.example.com/?plan=a%2Fb#details');
  assert.equal(r.pages[1].url,'https://public.example.com/test?q=x#state');
});

test('target and resource URLs are bounded after Unicode percent encoding', () => {
  const segment = 'é'.repeat(800);
  const targetUrl = 'https://public.example.com/' + segment;
  assert.throws(() => validateRequest({agentId:'accessibility',targetUrl}),/canonical.*length/i);
  assert.throws(() => parsePublicResource('/' + segment,new URL('https://public.example.com/')),/canonical.*length/i);
  const shortUrl = 'https://public.example.com/café';
  assert.equal(validateRequest({agentId:'accessibility',targetUrl:shortUrl}).targetUrl,'https://public.example.com/caf%C3%A9');
});

test('mobile profiles are explicit and portable without changing the desktop API default', () => {
  const base={agentId:'performance',targetUrl:'https://public.example.com/'};
  assert.equal(validateRequest(base).profile.id,'desktop-v1');
  const mobile=validateRequest({...base,profile:{id:'mobile-v1',samples:4}});
  assert.equal(mobile.profile.id,'mobile-v1');
  const identity=baselineIdentity(mobile,{node:'24',browser:'chromium',engine:'test'},mobile.targetUrl);
  const portable=parseBaseline({schemaVersion:1,identity,coverage:[],evidence:[],findings:[]});
  assert.equal(portable.identity.profile.id,'mobile-v1');
  assert.equal(portable.identity.profile.samples,4);
  assert.equal(validateRequest({...base,profile:{id:'mobile-and-desktop-v1'}}).profile.samples,3);
  assert.throws(()=>validateRequest({...base,agentId:'accessibility',profile:{id:'mobile-v1'}}),/profile/i);
});

test('SEO page discovery distinguishes default sampling from explicit configured scope', () => {
  const base={agentId:'seo-ai-search',targetUrl:'https://public.example.com/'};
  assert.equal(validateRequest(base).pageDiscovery,'sitemap-sample');
  assert.equal(validateRequest({...base,pages:['/']}).pageDiscovery,'configured-only');
  assert.equal(validateRequest({...base,pageDiscovery:'configured-only'}).pageDiscovery,'configured-only');
  assert.throws(()=>validateRequest({...base,pageDiscovery:'unbounded'}),/discovery/i);
});
