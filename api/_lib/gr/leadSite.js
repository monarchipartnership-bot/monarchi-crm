// Reads the website of a lead for the Analyst: the pages that decide a sale (reuses the safe reader of the project: public addresses only, robots.txt, size and time limits)
// plus the tracking tags of the raw home page. Nothing is written anywhere. → { url, pages, tags, site: { url, title, description, h1, text }, blocked, error? }
import { lookup as dnsLookup } from 'node:dns/promises';
import { collectSiteData } from '../wf/skills/siteData.js';
import { fetchOne, readBody } from '../siteReader.js';
import { detectTags } from '../../../src/lib/growth/siteFindings.js';

export async function readLeadSite(website, { fetchFn = fetch, lookup = dnsLookup, timeoutMs = 8000 } = {}) {
  const data = await collectSiteData({ website, fetchFn, lookup, timeoutMs });
  const ok = (data.pages || []).filter((p) => p.ok);
  const home = ok.find((p) => p.kind === 'home') || ok[0];
  let tags = null;
  if (home) {
    try { const r = await fetchOne(home.url, { fetchFn, lookup, timeoutMs }); if (r.res.ok) tags = detectTags((await readBody(r.res)).text); } catch { /* the tags stay unknown: no finding is made from them */ }
  }
  return {
    url: data.final_url || data.url, pages: data.pages || [], tags, blocked: !!data.blockedByRobots, error: data.blockedByRobots ? 'Сайт закритий для читання (robots.txt)' : (!ok.length ? (data.errors?.[0] || 'Сайт не відповідає') : undefined),
    site: home ? { url: home.url, title: home.title, description: home.description, h1: home.signals?.h1 || [], text: ok.map((p) => `[${p.kind}] ${p.text || ''}`).join('\n').slice(0, 9000) } : null,
  };
}
