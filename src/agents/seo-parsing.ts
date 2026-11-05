import { parse } from 'node-html-parser';
import type { IncomingHttpHeaders } from 'node:http';

export const SEARCH_CRAWLERS = ['Googlebot','Bingbot'] as const;
export const CRAWLERS = [...SEARCH_CRAWLERS,'GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','PerplexityBot','Applebot','Google-Extended','CCBot'] as const;
const VALUE_LIMIT = 2048;
const ENTRY_LIMIT = 16;
const TYPE_LIMIT = 12;
const TYPE_CHARS = 120;
export const ROBOTS_BYTES = 512_000;
const limit = (s: string) => s.slice(0,VALUE_LIMIT).replaceAll('\0','\uFFFD');
const clean = (s: string | undefined) => limit(s?.trim() ?? '');
const robotsAgents = new Set(['robots',...CRAWLERS.map((name) => name.toLowerCase()),'googlebot-news','googlebot-image']);

export function normalizedHttpUrl(value: string, base?: string): string | null {
  if (!value || value.length > VALUE_LIMIT) return null;
  try {
    const url = new URL(value,base);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href.length <= VALUE_LIMIT ? url.href : null;
  } catch { return null; }
}

export function headerDirectives(headers: IncomingHttpHeaders) {
  const value = headers['x-robots-tag'];
  const raw = (Array.isArray(value) ? value : value === undefined ? [] : [value]).slice(0,ENTRY_LIMIT).map(limit);
  const directives: {agent: string; value: string}[] = [];
  let incomplete = Array.isArray(value) ? value.length > ENTRY_LIMIT || value.some(x => x.length > VALUE_LIMIT) : (value?.length ?? 0) > VALUE_LIMIT;
  for (const line of raw) {
    let agent = 'robots';
    for (const token of line.split(',')) {
      if (!token.trim()) continue;
      const match = token.trim().match(/^([a-z][a-z0-9_-]*):\s*(.*)$/i);
      if (match && !/^(?:unavailable_after|max-snippet|max-image-preview|max-video-preview)$/i.test(match[1])) {
        agent = match[1].toLowerCase();
        if (!match[2].trim()) continue;
      }
      if (directives.length >= ENTRY_LIMIT) { incomplete = true; break; }
      directives.push({agent,value:limit(match && agent === match[1].toLowerCase() ? match[2].trim() : token.trim())});
    }
  }
  return {raw,directives,incomplete};
}

export function isNoindex(value: string): boolean {
  return value.split(/[,\s]+/).some(word => /^(?:noindex|none)$/i.test(word));
}

export function searchNoindex(directives: readonly {agent:string;value:string}[]): string[] {
  return [...new Set(directives.filter(x => (x.agent === 'robots' || SEARCH_CRAWLERS.some(a => a.toLowerCase() === x.agent)) && isNoindex(x.value)).map(x => x.agent))];
}

export function readDocument(html: string, url: string) {
  const doc = parse(html);
  const head = doc.querySelector('head');
  const metadata = head ?? doc;
  const base = normalizedHttpUrl(clean(metadata.querySelector('base[href]')?.getAttribute('href')),url) ?? url;
  let incomplete = false;
  let structuredIncomplete = false;
  const links = metadata.querySelectorAll('link').filter(link => (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  if (links.length > ENTRY_LIMIT) incomplete = true;
  const canonical = links.slice(0,ENTRY_LIMIT).map(link => {
    const href = link.getAttribute('href')?.trim() ?? '';
    if (href.length > VALUE_LIMIT) incomplete = true;
    return {href:limit(href),url:normalizedHttpUrl(href,base)};
  });
  const metaTags = metadata.querySelectorAll('meta').filter(meta => robotsAgents.has((meta.getAttribute('name') ?? '').trim().toLowerCase()));
  if (metaTags.length > ENTRY_LIMIT) incomplete = true;
  const directives = metaTags.slice(0,ENTRY_LIMIT).map(meta => {
    const value = (meta.getAttribute('content') ?? '').trim();
    if (value.length > VALUE_LIMIT) incomplete = true;
    return {agent:clean(meta.getAttribute('name')).toLowerCase(),value:limit(value)};
  });
  const scripts = doc.querySelectorAll('script').filter(script => (script.getAttribute('type') ?? '').trim().toLowerCase() === 'application/ld+json');
  const jsonLd = scripts.slice(0,ENTRY_LIMIT).map((script,index): {index:number; status:string; types:string[]; reason:string|null} => {
    const scriptText = script.rawText;
    if (scriptText.length > 120_000) {
      structuredIncomplete = true;
      return {index:index + 1,status:'not-parsed',types:[] as string[],reason:'JSON-LD block exceeds the parse limit'};
    }
    let value: unknown;
    try { value = JSON.parse(scriptText); }
    catch { return {index:index + 1,status:'invalid-json',types:[],reason:null}; }
    if (!value || typeof value !== 'object') return {index:index + 1,status:'unexpected-top-level',types:[],reason:null};
    const types = new Set<string>();
    const todo: unknown[] = [value];
    let nodes = 0;
    let limited = false;
    while (todo.length) {
      if (++nodes > 4000) { limited = true; break; }
      const node = todo.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0 && todo.length < 4000; i--) todo.push(node[i]);
        if (node.length > 4000 || todo.length >= 4000) limited = true;
        continue;
      }
      const record = node as Record<string,unknown>;
      for (const type of (Array.isArray(record['@type']) ? record['@type'].slice(0,ENTRY_LIMIT) : [record['@type']])) {
        if (typeof type === 'string' && type.trim()) {
          if ((!types.has(type.trim()) && types.size >= TYPE_LIMIT) || type.length > TYPE_CHARS) limited = true;
          else types.add(limit(type.trim()));
        }
      }
      if (Array.isArray(record['@type']) && record['@type'].length > ENTRY_LIMIT) limited = true;
      for (const nested of Object.values(record)) {
        if (nested && typeof nested === 'object') {
          if (todo.length >= 4000) { limited = true; break; }
          todo.push(nested);
        }
      }
    }
    if (limited) structuredIncomplete = true;
    return {index:index + 1,status:limited ? 'type-scan-limited' : 'parsed',types:[...types].sort(),reason:limited ? 'JSON-LD type sampling or traversal limit reached' : null};
  });
  if (scripts.length > ENTRY_LIMIT) structuredIncomplete = true;
  return {
    title:clean(metadata.querySelector('title')?.text),
    description:clean(metadata.querySelectorAll('meta').find(meta => meta.getAttribute('name')?.toLowerCase() === 'description')?.getAttribute('content')),
    canonical,directives,
    jsonLd,structuredCount:scripts.length,incomplete,structuredIncomplete,
  };
}

type RobotRule = {action: 'allow'|'disallow'; path: string};
type RobotGroup = {agents: string[]; rules: RobotRule[]};
export function readRobots(text: string) {
  const groups: RobotGroup[] = [];
  const sitemaps: string[] = [];
  let group: RobotGroup | undefined;
  let rules = 0;
  let agents = 0;
  let incomplete = false;
  let malformed = 0;
  for (const line of text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/)) {
    const field = line.split('#',1)[0].trim();
    if (!field) continue;
    const pair = field.match(/^([a-z_-]+)\s*:\s*(.*)$/i);
    if (!pair) { malformed++; continue; }
    const [,key,value] = pair;
    switch (key.toLowerCase()) {
      case 'user-agent':
        if (!/^(?:[a-z_-]+[a-z0-9_-]*|\*)$/i.test(value) || value.length > 100) { malformed++; break; }
        if (++agents > 600) { incomplete = true; break; }
        if (!group || group.rules.length) {
          group = {agents:[],rules:[]};
          groups.push(group);
        }
        group.agents.push(value.toLowerCase());
        break;
      case 'allow': case 'disallow':
        if (!group || (value && !value.startsWith('/'))) { malformed++; break; }
        if (++rules > 1600 || value.length > VALUE_LIMIT) { incomplete = true; break; }
        group.rules.push({action:key.toLowerCase() as RobotRule['action'],path:value});
        break;
      case 'sitemap':
        if (!value || value.length > VALUE_LIMIT) { malformed++; break; }
        if (sitemaps.length >= ENTRY_LIMIT) { incomplete = true; break; }
        sitemaps.push(value);
    }
  }
  return {groups,sitemaps,malformed,incomplete:incomplete || malformed > 0};
}

function robotOctets(value: string): string {
  return value.replace(/%([a-f0-9]{2})|[^\x00-\x7F]/giu,(whole,hex: string | undefined) => {
    if (hex) {
      const char = String.fromCharCode(Number.parseInt(hex,16));
      return /^[a-z0-9._~-]$/i.test(char) ? char : '%' + hex.toUpperCase();
    }
    return Buffer.from(whole).toString('hex').replace(/../g, (bytes) => '%' + bytes.toUpperCase());
  });
}

function robotMatch(path: string, pattern: string): number | undefined {
  if (!pattern) return undefined;
  const anchored = pattern.endsWith('$');
  const normalized = robotOctets(anchored ? pattern.slice(0,-1) : pattern);
  const parts = normalized.split('*');
  if (!path.startsWith(parts[0])) return undefined;
  let cursor = parts[0].length;
  for (let index = 1; index < parts.length; index++) {
    const piece = parts[index];
    if (anchored && index === parts.length - 1) {
      if (!path.endsWith(piece) || cursor > path.length - piece.length) return undefined;
      cursor = path.length;
    } else {
      const found = path.indexOf(piece,cursor);
      if (found === -1) return undefined;
      cursor = found + piece.length;
    }
  }
  if (anchored && cursor !== path.length) return undefined;
  return normalized.replace(/%[A-F0-9]{2}/g,'x').length;
}

export function robotDecision(groups: readonly RobotGroup[],agent: string,url: string) {
  const name = agent.toLowerCase();
  const exact = groups.filter(g => g.agents.includes(name));
  const selected = exact.length ? exact : groups.filter(g => g.agents.includes('*'));
  const target = new URL(url);
  if (target.pathname === '/robots.txt') return {agent,group:null,decision:'allowed',matchedRule:null};
  const path = robotOctets(target.pathname + target.search);
  let winner: RobotRule | undefined;
  let priority = -1;
  for (const group of selected) for (const rule of group.rules) {
    const length = robotMatch(path,rule.path);
    if (length === undefined || length < priority || (length === priority && winner?.action === 'allow')) continue;
    winner = rule;
    priority = length;
  }
  return {
    agent, group:exact.length ? name : selected.length ? '*' : null,
    decision:winner?.action === 'disallow' ? 'disallowed' : 'allowed',
    matchedRule:winner ?? null,
  };
}

// Read the sitemap protocol's direct loc elements. The tokenizer checks nesting
// and does not resolve DTDs or external entities.
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w.:-]{0,127}(?:[^"'<>]|"[^"<]{0,8192}"|'[^'<]{0,8192}'){0,8192}>|[^<]+/gy;
const XML_ATTRIBUTE = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gy;

function validAttributes(text: string): boolean {
  const names = new Set<string>();
  XML_ATTRIBUTE.lastIndex = 0;
  let cursor = 0;
  for (let match = XML_ATTRIBUTE.exec(text); match; match = XML_ATTRIBUTE.exec(text)) {
    if (names.size >= 64 || names.has(match[1]) || entity(match[2] ?? match[3]) === undefined) return false;
    names.add(match[1]);
    cursor = XML_ATTRIBUTE.lastIndex;
  }
  return !text.slice(cursor).trim();
}
const entity = (text: string): string | undefined => {
  let invalid = false;
  const decoded = text.replace(/&(?:amp;|lt;|gt;|quot;|apos;|#(?:[0-9]+|x[a-fA-F0-9]+);)?/g,(token) => {
    switch (token) {
      case '&amp;': return '&';
      case '&lt;': return '<';
      case '&gt;': return '>';
      case '&quot;': return '"';
      case '&apos;': return "'";
    }
    const isHex = token[2] === 'x';
    const value = Number.parseInt(token.slice(isHex ? 3 : 2,-1),isHex ? 16 : 10);
    if (!(value > 0 && value <= 0x10ffff) || (value >= 0xd800 && value <= 0xdfff)) { invalid = true; return ''; }
    return String.fromCodePoint(value);
  });
  return invalid ? undefined : decoded;
};
export function readSitemap(xml: string) {
  const stack: string[] = [];
  const locations: string[] = [];
  let root: 'urlset'|'sitemapindex'|null = null;
  let reason: string | null = null;
  let loc: string | undefined;
  let cursor = 0;
  let tokens = 0;
  let locationCount = 0;
  let itemCount = 0;
  let itemHasLoc = false;
  let invalidLocations = 0;
  const local = (s: string) => s.split(':').at(-1);
  TOKEN.lastIndex = 0;
  while (cursor < xml.length) {
    const match = TOKEN.exec(xml);
    if (!match || ++tokens > 180_000) { reason = 'Malformed or unsupported XML, or sitemap token limit reached'; break; }
    cursor = TOKEN.lastIndex;
    const part = match[0];
    if (part.startsWith('<?') || part.startsWith('<!--')) continue;
    if (part.startsWith('<![CDATA[')) {
      if (loc !== undefined) loc += part.slice(9,-3);
      else if (!stack.length) { reason = 'CDATA outside sitemap root'; break; }
      continue;
    }
    if (!part.startsWith('<')) {
      if (loc !== undefined) {
        const decoded = entity(part);
        if (decoded === undefined) { reason = 'Invalid XML entity in sitemap location'; break; }
        loc += decoded;
      } else if (!stack.length && part.trim()) { reason = 'Text outside sitemap root'; break; }
      continue;
    }
    const close = part.startsWith('</');
    const selfClosing = part.endsWith('/>');
    const name = part.match(/^<\/?([^\s/>]+)/)![1];
    if (close) {
      if (!/^<\/[^\s/>]+\s*>$/.test(part) || name !== stack.at(-1)) { reason = 'Unbalanced sitemap XML'; break; }
    } else {
      if (loc !== undefined) { reason = 'Unexpected markup within sitemap location'; break; }
      if (!validAttributes(part.slice(name.length + 1,selfClosing ? -2 : -1))) { reason = 'Invalid sitemap XML attributes'; break; }
      if (stack.length === 0) {
        const top = local(name);
        if (root || (top !== 'urlset' && top !== 'sitemapindex')) { reason = 'Expected one sitemap urlset or sitemapindex root'; break; }
        root = top;
      }
      if (stack.length >= 32) { reason = 'Sitemap XML nesting limit reached'; break; }
      if (stack.length === 1 && local(name) === (root === 'urlset' ? 'url' : 'sitemap')) {
        itemCount++;
        itemHasLoc = false;
      }
      if (stack.length === 2 && local(name) === 'loc' && local(stack[1]) === (root === 'urlset' ? 'url' : 'sitemap')) {
        if (itemHasLoc) invalidLocations++;
        itemHasLoc = true;
        loc = '';
      }
      stack.push(name);
    }
    if (close || selfClosing) {
      if (loc !== undefined) {
        locationCount++;
        const value = normalizedHttpUrl(loc.trim());
        if (!value) invalidLocations++;
        else if (locations.length < 5000) locations.push(value);
        else reason = 'Sitemap location sample limit reached';
        loc = undefined;
      }
      if (stack.length === 2 && local(name) === (root === 'urlset' ? 'url' : 'sitemap') && !itemHasLoc) invalidLocations++;
      stack.pop();
    }
  }
  if (stack.length || !root) reason ??= 'Sitemap XML did not close correctly';
  if (invalidLocations) reason ??= 'Sitemap contains missing, duplicate, or invalid location elements';
  return {root,locations,locationCount,itemCount,invalidLocations,reason};
}
