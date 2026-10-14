// Reads a PUBLIC website for the competitor agent: the home page and a few pages that say what a company sells and
// writes about (blog, news, services, cases). Careful by design, because the address is typed by a person:
//  - only http/https on the usual ports, no credentials in the address, never an internal address (localhost, private
//    ranges, cloud metadata) — checked for the address, for every redirect and for what the name resolves to;
//  - robots.txt is honoured, we say who we are, every page has a size and time limit;
//  - social networks are NOT read here (they sit behind logins and their terms forbid it).
// Network and DNS are handed in, so scripts/check-core.mjs tests every rule without the internet.
import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

export const USER_AGENT = 'MonarchiSMMBot/1.0 (+https://crm.monarchi.agency; competitor research, reads public pages only)';
const MAX_BYTES = 1_500_000;
const PAGE_CHARS = 5000;
const PAGE_WORDS = /blog|news|insight|article|resource|case|work|portfolio|service|about|pricing|solution|learn|journal|stories/i;

function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? privateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// → the parsed URL, or throws an Error with a reason a person can read.
export async function assertPublicUrl(raw, lookup = dnsLookup) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { throw new Error('Некоректна адреса сайту.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Дозволені лише http і https.');
  if (u.username || u.password) throw new Error('Адреса не може містити логін чи пароль.');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Нестандартні порти заборонені.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !net.isIP(host)) throw new Error('Внутрішні адреси заборонені.');
  if (net.isIP(host)) {
    if (privateIp(host)) throw new Error('Внутрішні адреси заборонені.');
    return u;
  }
  let addrs;
  try { addrs = await lookup(host, { all: true }); } catch { throw new Error('Сайт не знайдено (DNS).'); }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('Внутрішні адреси заборонені.');
  return u;
}

// robots.txt, the simple honest reading: the "*" group (or ours), Disallow prefixes, Allow wins when longer.
export function robotsAllows(txt, path, agent = 'monarchismmbot') {
  const groups = [];
  let cur = null;
  for (const line of String(txt || '').split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) { if (!line.trim()) cur = cur && cur.rules.length ? null : cur; continue; }
    const k = m[1].toLowerCase();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(m[2].toLowerCase()); }
    else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push([k, m[2]]);
  }
  const g = groups.find((x) => x.agents.some((a) => a !== '*' && agent.includes(a))) || groups.find((x) => x.agents.includes('*'));
  if (!g) return true;
  let best = null;
  for (const [kind, p] of g.rules) {
    if (!p) continue;
    if (path.startsWith(p) && (!best || p.length >= best.p.length)) best = { kind, p };
  }
  return !best || best.kind === 'allow';
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"', '&ndash;': '-', '&mdash;': '-' };
const decode = (s) => s.replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ');

// HTML → { title, description, text, links[] } without any parser dependency: enough to read what a page says.
export function readHtml(html, baseUrl) {
  const src = String(html || '');
  const title = decode((src.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ')).trim().slice(0, 200);
  const description = decode((src.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || src.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] || '')).trim().slice(0, 400);
  const links = [];
  for (const m of src.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { links.push({ url: new URL(m[1], baseUrl).toString(), label: decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80) }); } catch { /* skip */ }
  }
  const body = src
    .replace(/<(script|style|noscript|svg|iframe|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 2).join('\n').slice(0, PAGE_CHARS);
  return { title, description, text, links };
}

// Which pages besides the home page are worth reading: same site, a topic word in the address or the link text, no files.
export function pickPages(links, homeUrl, limit = 3) {
  const home = new URL(homeUrl);
  const seen = new Set([home.toString().replace(/\/$/, '')]);
  const out = [];
  for (const l of links) {
    let u;
    try { u = new URL(l.url); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== home.hostname.replace(/^www\./, '')) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js|xml)$/i.test(u.pathname) || u.pathname === '/' || u.search.length > 40) continue;
    if (!PAGE_WORDS.test(u.pathname) && !PAGE_WORDS.test(l.label)) continue;
    const key = (u.origin + u.pathname).replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.origin + u.pathname);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchOne(url, { fetchFn, lookup, timeoutMs, hops = 3 }) {
  let current = url;
  for (let i = 0; i <= hops; i += 1) {
    const u = await assertPublicUrl(current, lookup);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try { res = await fetchFn(u.toString(), { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.8' } }); } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), u).toString(); continue; }
    return { res, url: u.toString() };
  }
  throw new Error('Забагато перенаправлень.');
}

// Reads at most MAX_BYTES of the body: a big page is cut (the text we need is at its start), not refused.
async function readBody(res) {
  const type = res.headers.get('content-type') || '';
  let buf;
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (size >= MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
    }
    buf = new Uint8Array(Math.min(size, MAX_BYTES));
    let off = 0;
    for (const c of chunks) { const part = c.subarray(0, buf.length - off); buf.set(part, off); off += part.length; if (off >= buf.length) break; }
  } else {
    buf = new Uint8Array(await res.arrayBuffer()).subarray(0, MAX_BYTES);
  }
  return { type, text: new TextDecoder('utf-8', { fatal: false }).decode(buf) };
}

// → { pages: [{ url, title, description, text, ok, error? }], blockedByRobots }
export async function readSite(website, { fetchFn = fetch, lookup = dnsLookup, timeoutMs = 8000, extraPages = 3 } = {}) {
  const home = await assertPublicUrl(website, lookup);
  const opts = { fetchFn, lookup, timeoutMs };
  let robots = '';
  try {
    const r = await fetchOne(home.origin + '/robots.txt', opts);
    if (r.res.ok) robots = (await readBody(r.res)).text;
  } catch { /* no robots.txt is fine */ }
  if (!robotsAllows(robots, home.pathname || '/')) return { pages: [], blockedByRobots: true };

  const pages = [];
  let first;
  try { first = await fetchOne(home.toString(), opts); } catch (e) {
    if (/Внутрішні|Нестандартні|Некоректна|http і https|логін/.test(e.message)) throw e;
    return { pages: [{ url: home.toString(), ok: false, error: e.name === 'AbortError' ? 'Час очікування вичерпано.' : 'Сайт не відповідає.' }], blockedByRobots: false };
  }
  if (!first.res.ok) return { pages: [{ url: home.toString(), ok: false, error: `HTTP ${first.res.status}` }], blockedByRobots: false };
  const body = await readBody(first.res);
  if (!/html|text/i.test(body.type)) return { pages: [{ url: first.url, ok: false, error: 'Не HTML-сторінка.' }], blockedByRobots: false };
  const homePage = readHtml(body.text, first.url);
  pages.push({ url: first.url, title: homePage.title, description: homePage.description, text: homePage.text, ok: true });

  for (const url of pickPages(homePage.links, first.url, extraPages)) {
    const path = new URL(url).pathname;
    if (!robotsAllows(robots, path)) { pages.push({ url, ok: false, error: 'Заборонено robots.txt' }); continue; }
    try {
      const r = await fetchOne(url, opts);
      if (!r.res.ok) { pages.push({ url, ok: false, error: `HTTP ${r.res.status}` }); continue; }
      const b = await readBody(r.res);
      if (!/html|text/i.test(b.type)) { pages.push({ url, ok: false, error: 'Не HTML-сторінка.' }); continue; }
      const p = readHtml(b.text, r.url);
      pages.push({ url: r.url, title: p.title, description: p.description, text: p.text, ok: true });
    } catch (e) {
      pages.push({ url, ok: false, error: e.name === 'AbortError' ? 'Час очікування вичерпано.' : e.message });
    }
  }
  return { pages, blockedByRobots: false };
}
