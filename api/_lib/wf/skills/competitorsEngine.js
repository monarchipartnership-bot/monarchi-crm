// The «competitors» skill of the Researcher (step A4; document 1.5): the part around the model call. PURE: no network, no model, no clock.
// Decision of the owner (2026-11-19): the official Meta Ad Library API returns commercial ads only for the EU and the UK, so the ads of competitors are
// VERIFIED BY THE MANAGER: a link to the ad in the Ad Library, a screenshot and the date «активно з» are entered by a person. The agent never adds an ad itself
// and uses only ads that carry that confirmation («якщо його там немає, як приклад не беремо»). The sites of the competitors it reads and compares itself.
// Competitors come from the brief only in this version (finding more in the same niche needs a search source we do not have yet).

import { adProblems } from '../../../../src/lib/workflow/ads.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const hostOf = (u) => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const MAX_COMPETITORS = 4, MAX_ADS = 6;

// the brief's text «сайти конкурентів, по одному в рядку» → [{ host, url }] without the client's own site, without repeats
export function parseCompetitors(text, ownSite = '') {
  const own = hostOf(ownSite);
  const seen = new Set(own ? [own] : []);
  const out = [];
  for (const part of String(text || '').split(/[\s,;]+/)) {
    const t = part.trim().replace(/[()<>]/g, '');
    if (!t || !/[a-zа-яіїєґ0-9-]+\.[a-zа-яіїєґ]{2,}/i.test(t)) continue;
    const host = hostOf(t);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push({ host, url: /^https?:\/\//i.test(t) ? t : 'https://' + t });
    if (out.length >= MAX_COMPETITORS) break;
  }
  return out;
}

// the ads the manager confirmed: only entries with an Ad Library link, an «active since» date and a name of the person who checked it
export function verifiedAds(content) {
  const ok = [], skipped = [];
  for (const a of (Array.isArray(content?.ads) ? content.ads : []).slice(0, 30)) {
    const shot = String(a?.screenshot_url || '').trim();
    const problems = adProblems(a);
    const link = String(a?.library_url || '').trim(), date = String(a?.active_since || '').trim(), who = String(a?.verified_by || '').trim();
    if (problems.length) { skipped.push({ competitor: clip(a?.competitor, 80) || '?', problems }); continue; }
    ok.push({ id: `ad${ok.length + 1}`, competitor: clip(a.competitor, 80), library_url: link, active_since: date, verified_by: who, screenshot_url: /^https:\/\//i.test(shot) ? shot : '', note: clip(a.note, 300) });
    if (ok.length >= MAX_ADS) break;
  }
  return { ads: ok, skipped };
}

// a site as the prompt sees it: few pages, short text (several sites go into one request)
export function compactSite(data, { pages = 5, chars = 1700 } = {}) {
  return (data.pages || []).filter((p) => p.ok).slice(0, pages).map((p) => ({ kind: p.kind, url: p.url, title: p.title, description: p.description, text: String(p.text || '').slice(0, chars), signals: { h1: p.signals?.h1, buttons: (p.signals?.buttons || []).slice(0, 6), price_samples: p.signals?.price_samples, delivery_words: p.signals?.delivery_words, payment_words: p.signals?.payment_words, returns_words: p.signals?.returns_words, review_words: p.signals?.review_words, search: p.signals?.search, messengers: p.signals?.messengers, phone_link: p.signals?.phone_link, subscribe: p.signals?.subscribe, upsell_words: p.signals?.upsell_words, viewport: p.signals?.viewport } }));
}

const AREA_KEYS = ['first_screen', 'product_page', 'trust', 'terms', 'checkout', 'mobile', 'navigation', 'upsell', 'contact', 'lead_capture'];

export const SYSTEM_PROMPT = `You are a senior marketing analyst studying the COMPETITORS of one client of an advertising agency.
You are given: the client's site (short extracts), the sites of up to 4 competitors (short extracts and hard facts), and the competitor ads that a manager has confirmed in the Meta Ad Library (as images with ids).
Work ONLY from this input. Never invent products, prices, offers or numbers. A price or number may be written only if it stands in that competitor's input.
Produce:
1. "table": one row per competitor: products, prices, offers (discounts, gifts, free delivery), angles (what the site says to sell), approach (positioning in one phrase). "evidence.quote" is an exact quote copied character for character from THAT competitor's text.
2. "site_comparison": up to 8 items comparing competitor sites with the client's site. "area" is one of: ${AREA_KEYS.join(', ')}. "better_theirs": what a competitor does better than the client (empty string if nothing), "worse_theirs": what the competitor does worse (empty if nothing). "competitor_quote" is an exact quote from the competitor's text, "client_quote" an exact quote from the client's text or an empty string when the client simply lacks it.
3. "ads": for every confirmed ad id you were given, read its image: "angle" (the hook), "offer" (what is offered; empty if none visible), "format" (static, video, carousel, as visible), "idea" (one line: what we can learn or do differently). Do not read text you cannot see in the image.
4. "ideas": one idea for EVERY distinct approach you found (competitors' sites and ads): {"approach","idea"}. Ideas are for our creative team, short and concrete.
Rules: be specific and short (at most two sentences per value); if a competitor site could not be read, leave it out of the table and say nothing about it; write all text values in Ukrainian.
Answer with ONE JSON object and nothing else (no markdown fence):
{"table":[{"competitor":"<host>","products":"","prices":"","offers":"","angles":"","approach":"","evidence":{"quote":""}}],"site_comparison":[{"area":"","competitor":"<host>","better_theirs":"","worse_theirs":"","competitor_quote":"","client_quote":""}],"ads":[{"id":"ad1","angle":"","offer":"","format":"","idea":""}],"ideas":[{"approach":"","idea":""}]}`;

export function buildCompetitorsPrompt({ client, competitors, ads, goal }) {
  const lines = [`CLIENT'S GOAL (from the brief): ${clip(goal, 300) || 'unknown'}`, '', 'CLIENT SITE:', JSON.stringify(client)];
  for (const c of competitors) lines.push('', `COMPETITOR ${c.host}:`, JSON.stringify(c.pages));
  lines.push('', `CONFIRMED ADS (${ads.length}): ${ads.map((a) => `${a.id} = ${a.competitor}, active since ${a.active_since}${a.note ? ', manager note: ' + a.note : ''}`).join('; ') || 'none'}`);
  return { system: SYSTEM_PROMPT, user: lines.join('\n') + '\n\nWrite the values in Ukrainian.', images: ads.filter((a) => a.screenshot_url).map((a) => ({ id: a.id, url: a.screenshot_url })) };
}

export function parseCompetitorsAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: конкурентів не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: конкурентів не прочитано.'); }
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (!Array.isArray(o.table)) throw new Error('У відповіді моделі немає таблиці конкурентів.');
  return { table: o.table, site_comparison: arr(o.site_comparison), ads: arr(o.ads), ideas: arr(o.ideas) };
}

// each competitor's own text, searchable (a quote must come from THAT competitor); the client's text for client quotes
const corpusOf = (pages) => norm(pages.map((p) => [p.title, p.description, p.text, JSON.stringify(p.signals)].join('\n')).join('\n'));

// → { table, comparison, ads, ideas, dropped }: every row carries verified true/false (a quote and the numbers must stand in the right site)
export function checkCompetitors(raw, { competitors, client, ads }) {
  const byHost = new Map(competitors.map((c) => [c.host, { corpus: corpusOf(c.pages), nums: new Set(numbersOf(corpusOf(c.pages))) }]));
  const clientCorpus = corpusOf(client);
  let dropped = 0;
  const table = [];
  for (const r of raw.table.slice(0, 8)) {
    const host = hostOf(r?.competitor);
    const src = byHost.get(host);
    if (!src) { dropped += 1; continue; }
    const row = { competitor: host, products: clip(r.products, 300), prices: clip(r.prices, 300), offers: clip(r.offers, 300), angles: clip(r.angles, 300), approach: clip(r.approach, 200) };
    const quote = clip(r?.evidence?.quote, 300);
    let verified = true, problem = null;
    if (!quote || !src.corpus.includes(norm(quote))) { verified = false; problem = !quote ? 'немає цитати' : 'цитати немає на прочитаних сторінках цього конкурента'; }
    else {
      const stray = numbersOf(`${row.prices} ${row.offers} ${row.products}`).filter((n) => n.length > 1 && !src.nums.has(n));
      if (stray.length) { verified = false; problem = `число без джерела: ${[...new Set(stray)].slice(0, 3).join(', ')}`; }
    }
    table.push({ ...row, evidence: { quote }, verified, ...(problem ? { problem } : {}) });
  }
  const comparison = [];
  for (const c of raw.site_comparison.slice(0, 12)) {
    const host = hostOf(c?.competitor);
    const src = byHost.get(host);
    const better = clip(c?.better_theirs, 300), worse = clip(c?.worse_theirs, 300);
    if (!src || !AREA_KEYS.includes(c?.area) || (!better && !worse)) { dropped += 1; continue; }
    const cq = clip(c.competitor_quote, 300), kq = clip(c.client_quote, 300);
    const okC = !!cq && src.corpus.includes(norm(cq));
    const okK = !kq || clientCorpus.includes(norm(kq));
    const stray = numbersOf(`${better} ${worse}`).filter((n) => n.length > 1 && !src.nums.has(n) && !numbersOf(clientCorpus).includes(n));
    comparison.push({ area: c.area, competitor: host, better_theirs: better, worse_theirs: worse, competitor_quote: cq, client_quote: kq, verified: okC && okK && !stray.length, ...(!okC ? { problem: 'цитати конкурента немає на його сторінках' } : !okK ? { problem: 'цитати клієнта немає на його сайті' } : stray.length ? { problem: `число без джерела: ${stray[0]}` } : {}) });
  }
  const adIds = new Map(ads.map((a) => [a.id, a]));
  const adsOut = [];
  for (const a of raw.ads) {
    const src = adIds.get(a?.id);
    if (!src || !src.screenshot_url) { dropped += 1; continue; }
    adsOut.push({ ...src, label: `Конкурент: ${src.competitor}`, angle: clip(a.angle, 200), offer: clip(a.offer, 200), format: clip(a.format, 80), idea: clip(a.idea, 250) });
  }
  const ideas = raw.ideas.map((i) => ({ approach: clip(i?.approach, 160), idea: clip(i?.idea, 300) })).filter((i) => i.approach && i.idea).slice(0, 10);
  return { table, comparison, ads: adsOut, ideas, dropped };
}

// verified items where the competitor does something better → tasks for the pool (type «site», for the client's developer), at most 5
export function comparisonTasks(comparison) {
  return comparison.filter((c) => c.verified && c.better_theirs).slice(0, 5).map((c) => ({
    type: 'site', owner: 'client_dev', priority: 'medium', title: `Сайт: перейняти в ${c.competitor}: ${c.better_theirs}`.slice(0, 160),
    evidence: `Конкурент ${c.competitor} робить краще. Цитата: «${c.competitor_quote}».${c.client_quote ? ` У клієнта: «${c.client_quote}».` : ' У клієнта цього немає.'}`.slice(0, 500),
  }));
}

const AREA_NAME = { first_screen: 'Перший екран і оффер', product_page: 'Картка товару', trust: 'Довіра', terms: 'Ціна, доставка, повернення, оплата', checkout: 'Оформлення', mobile: 'Мобільна версія', navigation: 'Навігація і пошук', upsell: 'Допродажі', contact: 'Зв’язок', lead_capture: 'Збір контактів' };

export function renderCompetitorsText(res, { competitors, failed, skippedAds }) {
  const out = [`Ринок і конкуренти. Прочитано сайтів конкурентів: ${competitors.length}${failed.length ? `; не вдалося: ${failed.map((f) => `${f.host} (${f.error})`).join(', ')}` : ''}. Конкурентів беремо з брифу.`];
  const good = res.table.filter((r) => r.verified), bad = res.table.filter((r) => !r.verified);
  out.push('', `Таблиця конкурентів (${good.length})`);
  good.forEach((r, i) => out.push(`${i + 1}. ${r.competitor}`, `   Товари: ${r.products || '—'}`, `   Ціни: ${r.prices || '—'}`, `   Офери: ${r.offers || '—'}`, `   Кути: ${r.angles || '—'}`, `   Підхід: ${r.approach || '—'}`, `   Доказ: «${r.evidence.quote}»`));
  if (bad.length) { out.push('', `Не підтверджено (${bad.length})`); bad.forEach((r) => out.push(`• ${r.competitor}: ${r.approach || r.products || '—'} (${r.problem})`)); }
  if (res.ads.length) { out.push('', `Реклама конкурентів, підтверджена менеджером (${res.ads.length})`); res.ads.forEach((a) => out.push(`• ${a.label} · активно з ${a.active_since} · перевірив ${a.verified_by} · ${a.library_url}`, `   Кут: ${a.angle || '—'}; оффер: ${a.offer || '—'}; формат: ${a.format || '—'}`, `   Ідея: ${a.idea || '—'}`)); }
  else out.push('', 'Реклама конкурентів: немає підтверджених менеджером оголошень. Додайте їх з Бібліотеки реклами Meta (посилання, скриншот, дата «активно з»): без цього реклама як приклад не береться.');
  if (skippedAds.length) { out.push('', 'Оголошення, які не враховано (немає підтвердження)'); skippedAds.forEach((s) => out.push(`• ${s.competitor}: ${s.problems.join(', ')}`)); }
  if (res.ideas.length) { out.push('', 'Ідеї для банку ідей'); res.ideas.forEach((i, k) => out.push(`${k + 1}. ${i.approach}: ${i.idea}`)); }
  return out.join('\n');
}

const MARK = '\n\n— Порівняння з сайтами конкурентів —';
// the block that is added to the section «Сайт» (and replaced, not repeated, on a new run)
export function siteAppendix(comparison) {
  const rows = comparison.filter((c) => c.verified);
  if (!rows.length) return '';
  return MARK + '\n' + rows.map((c, i) => `${i + 1}. ${AREA_NAME[c.area]} · ${c.competitor}${c.better_theirs ? `\n   Краще в конкурента: ${c.better_theirs}` : ''}${c.worse_theirs ? `\n   Гірше в конкурента: ${c.worse_theirs}` : ''}\n   Доказ: «${c.competitor_quote}»`).join('\n');
}
export const withSiteAppendix = (body, comparison) => String(body || '').split(MARK)[0] + siteAppendix(comparison);
