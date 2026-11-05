import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { createPublicHttpClient, isPublicAddress, pinDestination, pinnedRequestOptions } from '../src/core/network.js';

test('rejects IPv4 special ranges and IPv6 loopback, mapped, translation and reserved addresses', () => {
  for (const ip of ['127.0.0.1','10.0.0.1','100.64.0.1','169.254.169.254','198.18.0.2','192.0.2.1','224.0.0.1','::','::1','::ffff:8.8.8.8','64:ff9b::a9fe:a9fe','2001:db8::1','2002:0808:0808::','3fff::1','fc00::1','fe80::1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('rejects mixed DNS answers and uses only the vetted address at connect while keeping TLS SNI', async () => {
  const url = new URL('https://public.example.com/some/path');
  await assert.rejects(pinDestination(url,async () => [{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]), /non-public/i);
  const address = await pinDestination(url,async () => [{address:'8.8.8.8',family:4}]);
  const opts = pinnedRequestOptions(address);
  assert.equal(opts.hostname,'8.8.8.8');
  assert.equal(opts.servername,'public.example.com');
  assert.equal(opts.path,'/some/path');
  assert.deepEqual(opts.headers, {host:'public.example.com'});
  assert.equal(opts.agent,false);
});

test('rejects a public redirect if the next DNS answer for the same hostname rebinds', async () => {
  let queries = 0;
  let dials = 0;
  const client = createPublicHttpClient({
    resolve: async () => [{address: ++queries === 1 ? '8.8.8.8' : '127.0.0.1', family:4}],
    transport: async () => { dials++; return {status:302,headers:{location:'/next'},body:Readable.from([])}; },
  });
  await assert.rejects(client.fetch('https://public.example.com/'),/non-public/i);
  assert.equal(dials,1);
  assert.equal(queries,2);
  client.close();
});

test('rejects redirect-to-private host before a second dial and disallows unrelated document origins', async () => {
  const resolver = async (hostname: string) => [{address:hostname === 'private.example.com' ? '10.0.0.1' : '8.8.8.8', family:4}];
  let dials = 0;
  const client = createPublicHttpClient({resolve:resolver, transport:async () => {
    dials++; return {status:302,headers:{location:'https://private.example.com/'},body:Readable.from([])};
  }});
  await assert.rejects(client.fetch('https://public.example.com/'), (error: Error & {redirects?: unknown}) => {
    assert.match(error.message,/non-public/i);
    assert.deepEqual(error.redirects,[{url:'https://public.example.com/',status:302,location:'https://private.example.com/'}]);
    return true;
  });
  await assert.rejects(client.fetch('https://public.example.com/', {documentOrigin:'https://public.example.com'}),/origin/i);
  assert.equal(dials,2);
  client.close();
});

test('aborts oversized decompressed response bodies and DNS that outlasts the request deadline', async () => {
  const client = createPublicHttpClient({limits:{bodyBytes:1024},resolve:async () => [{address:'8.8.8.8',family:4}],transport:async () => ({
    status:200,headers:{'content-encoding':'gzip'},body:Readable.from([gzipSync(Buffer.alloc(4096))]),
  })});
  await assert.rejects(client.fetch('https://public.example.com/'),/body.*limit/i);
  client.close();
  const waiting = createPublicHttpClient({limits:{requestMs:20},resolve:async () => new Promise(() => {})});
  await assert.rejects(waiting.fetch('https://public.example.com/'), /deadline/i);
  waiting.close();
});

test('preserves an empty query in the wire request and never transmits the fragment', async () => {
  const address = await pinDestination(new URL('https://public.example.com/path?#details'),async () => [{address:'8.8.8.8',family:4}]);
  assert.equal(pinnedRequestOptions(address).path,'/path?');
});

test('caps total decompressed bytes across successful requests', async () => {
  const client = createPublicHttpClient({limits:{bodyBytes:1024,totalBytes:1100},resolve:async () => [{address:'8.8.8.8',family:4}],transport:async () => ({
    status:200,headers:{'content-encoding':'gzip'},body:Readable.from([gzipSync(Buffer.alloc(700))]),
  })});
  assert.equal((await client.fetch('https://public.example.com/')).body.length,700);
  await assert.rejects(client.fetch('https://public.example.com/next'),/total.*limit/i);
  client.close();
});
