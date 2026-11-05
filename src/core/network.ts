import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { assertPublicHostname, parsePublicResource } from './input.js';

const blocked = new BlockList();
for (const [ip,bits] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
  ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3],
] as const) blocked.addSubnet(ip,bits,'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::',3,'ipv6');
for (const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const) blocked.addSubnet(ip,bits,'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (address.includes('%')) return false;
  if (family === 4) return !blocked.check(address,'ipv4');
  return family === 6 && globalV6.check(address,'ipv6') && !blocked.check(address,'ipv6');
}

export interface ResolvedAddress { address: string; family: number }
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
export interface PinnedDestination { url: URL; address: string; family: 4 | 6 }
const systemResolve: Resolver = (hostname) => lookup(hostname + '.', {all:true});

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve,reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) aborted();
    else signal.addEventListener('abort',aborted,{once:true});
    promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',aborted)).catch(() => {});
  });
}

export async function pinDestination(url: URL, resolve: Resolver = systemResolve, signal?: AbortSignal): Promise<PinnedDestination> {
  const safe = parsePublicResource(url.href);
  assertPublicHostname(safe.hostname);
  const answers = await abortable(resolve(safe.hostname),signal);
  if (!answers.length || answers.length > 64) throw new Error('URL hostname has no usable public DNS answers');
  if (answers.some(({address,family}) => family !== isIP(address) || !isPublicAddress(address))) {
    throw new Error('URL hostname returned a non-public DNS address');
  }
  const chosen = answers.find((answer) => answer.family === 4) ?? answers[0];
  return {url:safe,address:chosen.address,family:chosen.family as 4 | 6};
}

export function pinnedRequestOptions(destination: PinnedDestination, method: 'GET' | 'HEAD' = 'GET', headers: http.OutgoingHttpHeaders = {}, signal?: AbortSignal): https.RequestOptions {
  const {url,address,family} = destination;
  // The socket is addressed by vetted IP. Host, TLS SNI and TLS verification use the public name.
  return {
    protocol:url.protocol,hostname:address,family,port:url.protocol === 'https:' ? 443 : 80,
    ...(url.protocol === 'https:' ? {servername:url.hostname,rejectUnauthorized:true} : {}),
    method,path:url.href.slice(url.origin.length).split('#',1)[0],headers:{...headers,host:url.host},agent:false,signal,
    maxHeaderSize:32_768,
  };
}
export interface HttpHop { status: number; headers: http.IncomingHttpHeaders; body: Readable }
export type HttpTransport = (destination: PinnedDestination, method: 'GET' | 'HEAD', headers: http.OutgoingHttpHeaders, signal: AbortSignal) => Promise<HttpHop>;
export const sendPinnedRequest: HttpTransport = (destination,method,headers,signal) => new Promise((resolve,reject) => {
  const {protocol} = destination.url;
  const request = (protocol === 'https:' ? https : http).request(pinnedRequestOptions(destination,method,headers,signal), (response) => {
    resolve({status:response.statusCode ?? 0,headers:response.headers,body:response});
  });
  request.once('error',reject);
  request.once('upgrade',(_response,socket) => { socket.destroy(); reject(new Error('HTTP protocol upgrades are blocked')); });
  request.end();
});

export interface HttpLimits { requests: number; bodyBytes: number; totalBytes: number; redirects: number; requestMs: number; lifetimeMs: number }
const HTTP_LIMITS: HttpLimits = {requests:48,bodyBytes:2_000_000,totalBytes:16_000_000,redirects:5,requestMs:12_000,lifetimeMs:85_000};
export interface HttpClientOptions { limits?: Partial<HttpLimits>; resolve?: Resolver; transport?: HttpTransport; signal?: AbortSignal }
export interface FetchOptions { method?: 'GET' | 'HEAD'; documentOrigin?: string; allowCanonical?: boolean; headers?: { 'user-agent'?: string; accept?: string }; signal?: AbortSignal }
export interface RedirectHop { url: string; status: number; location: string }
export class PublicHttpError extends Error {
  constructor(cause: unknown, readonly redirects: readonly RedirectHop[], readonly failedUrl?: string) {
    super(cause instanceof Error ? cause.message : 'HTTP collection failed',{cause});
    this.name = 'PublicHttpError';
  }
}
export interface HttpResult { url: string; status: number; headers: http.IncomingHttpHeaders; redirects: RedirectHop[]; body: Buffer }
export interface PublicHttpClient { fetch(input: string | URL, options?: FetchOptions): Promise<HttpResult>; close(): void }
const REDIRECTS = new Set([301,302,303,307,308]);

export function deadlineSignal(ms: number, message: string): {signal: AbortSignal; stop(): void} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(message)),ms);
  return {signal:controller.signal,stop:() => clearTimeout(timer)};
}

export function isAllowedDocumentOrigin(target: URL, origin: string, allowCanonical = false): boolean {
  const initial = new URL(origin);
  if (target.origin === initial.origin) return true;
  if (!allowCanonical || initial.protocol !== 'https:' || target.protocol !== 'https:') return false;
  const alias = initial.hostname.startsWith('www.') ? initial.hostname.slice(4) : 'www.' + initial.hostname;
  return !target.port && target.hostname === alias;
}

export function createPublicHttpClient(options: HttpClientOptions = {}): PublicHttpClient {
  const limits = {...HTTP_LIMITS,...options.limits};
  const closed = new AbortController();
  const expiresAt = Date.now() + limits.lifetimeMs;
  let requestCount = 0;
  let totalWireBytes = 0;
  let totalBodyBytes = 0;
  const consume = async (hop: HttpHop, signal: AbortSignal): Promise<Buffer> => {
    const encoding = hop.headers['content-encoding']?.toLowerCase().trim();
    const decode = !encoding || encoding === 'identity' ? undefined :
      encoding === 'gzip' || encoding === 'x-gzip' ? createGunzip() :
      encoding === 'br' ? createBrotliDecompress() :
      encoding === 'deflate' ? createInflate() : null;
    if (decode === null) throw new Error('Unsupported HTTP content encoding');
    const length = Number(hop.headers['content-length']);
    if (Number.isFinite(length) && length > limits.bodyBytes) throw new Error('HTTP body size limit exceeded');
    let rawSize = 0;
    let decodedSize = 0;
    const rawLimit = new Transform({transform(chunk: Buffer,_enc,done) {
      try {
        rawSize += chunk.length;
        totalWireBytes += chunk.length;
        if (totalWireBytes > limits.totalBytes) throw new Error('HTTP total wire body limit exceeded');
        if (rawSize > limits.bodyBytes) throw new Error('HTTP body size limit exceeded');
        done(null,chunk);
      } catch (error) { done(error as Error); }
    }});
    const chunks: Buffer[] = [];
    const gather = new Transform({transform(chunk: Buffer,_enc,done) {
      decodedSize += chunk.length;
      totalBodyBytes += chunk.length;
      if (totalBodyBytes > limits.totalBytes) return done(new Error('HTTP total decoded body limit exceeded'));
      if (decodedSize > limits.bodyBytes) return done(new Error('Decoded HTTP body size limit exceeded'));
      chunks.push(chunk);
      done();
    }});
    if (decode) await pipeline(hop.body,rawLimit,decode,gather,{signal});
    else await pipeline(hop.body,rawLimit,gather,{signal});
    return Buffer.concat(chunks,decodedSize);
  };
  return {
    close:() => closed.abort(new Error('HTTP collection closed')),
    async fetch(input, opts = {}) {
      if (closed.signal.aborted) throw closed.signal.reason;
      const available = expiresAt - Date.now();
      if (available <= 0) throw new Error('HTTP collection deadline exceeded');
      const method = opts.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD') throw new Error('Only GET and HEAD are allowed');
      const timer = deadlineSignal(Math.min(available,limits.requestMs),'HTTP request deadline exceeded');
      const signal = AbortSignal.any([closed.signal,timer.signal,...(options.signal ? [options.signal] : []),...(opts.signal ? [opts.signal] : [])]);
      const redirects: RedirectHop[] = [];
      let url: URL | undefined;
      try {
        url = parsePublicResource(input.toString());
        while (true) {
          signal.throwIfAborted();
          if (opts.documentOrigin && !isAllowedDocumentOrigin(url,opts.documentOrigin,opts.allowCanonical)) throw new Error('Document redirect left the accepted origin');
          if (++requestCount > limits.requests) throw new Error('HTTP request count limit exceeded');
          const destination = await pinDestination(url,options.resolve,signal);
          signal.throwIfAborted();
          const hop = await abortable((options.transport ?? sendPinnedRequest)(destination,method,{
            'user-agent':'MaintenanceAgents/0.1 (+public-page-observation)',accept:'*/*','accept-encoding':'gzip, br, deflate',...opts.headers,
          },signal),signal);
          try {
            const location = hop.headers.location;
            if (REDIRECTS.has(hop.status) && typeof location === 'string' && location.length) {
              redirects.push({url:url.href,status:hop.status,location});
              if (redirects.length > limits.redirects) throw new Error('HTTP redirect limit exceeded');
              const next = parsePublicResource(location,url);
              if (!location.includes('#') && url.hash) next.hash = url.hash;
              url = next;
              continue;
            }
            const body = method === 'HEAD' ? Buffer.alloc(0) : await consume(hop,signal);
            return {url:url.href,status:hop.status,headers:hop.headers,redirects,body};
          } finally { hop.body.destroy(); }
        }
      } catch (error) {
        throw new PublicHttpError(signal.aborted ? signal.reason : error,redirects,url?.href);
      } finally { timer.stop(); }
    },
  };
}

export function cappedBytes(limit: number, debit: (bytes: number) => void): Transform {
  let total = 0;
  return new Transform({transform(chunk: Buffer,_encoding,done) {
    try {
      total += chunk.length;
      if (total > limit) throw new Error('Browser connection byte limit exceeded');
      debit(chunk.length);
      done(null,chunk);
    } catch (error) { done(error as Error); }
  }});
}
