// The «site» skill of the Researcher (step A4; document 1.2): the part around the model call. PURE: no network, no model, no clock.
//   buildSitePrompt  → what the model reads (the collected pages and facts, the brief's goal) and the rules it must follow
//   parseSiteAnswer  → its JSON answer, or an error a person can read
//   checkFindings    → the guard against invention (document: «у кожної цифри є джерело ... так в документ не потрапляють вигадані цифри»):
//                      a quote must be found in the pages we read, a number must stand in the input, otherwise the finding is kept but marked
//                      «не підтверджено» and makes no task
//   renderSiteText, tasksFromFindings
// The agent looks at the site ALONE, without competitors: «інакше він перейме їхні слабкі рішення». Competitors come at step 1.5 and add to this section.

export const AREAS = [
  { key: 'first_screen', name: 'Перший екран і оффер', hint: 'what the visitor sees first: headline, offer, main button, whether it is clear what is sold and why here' },
  { key: 'product_page', name: 'Картка товару', hint: 'photos, price, description, variants, add to cart, availability' },
  { key: 'trust', name: 'Довіра', hint: 'reviews, ratings, guarantees, company details, certificates, real contacts' },
  { key: 'terms', name: 'Ціна, доставка, повернення, оплата', hint: 'is price, delivery cost and time, return rules and payment methods clear before checkout' },
  { key: 'checkout', name: 'Оформлення замовлення', hint: 'steps, fields, guest checkout, payment options, only what is visible without a purchase' },
  { key: 'mobile', name: 'Мобільна версія', hint: 'viewport, tap targets, what the phone user gets (only what the HTML and the speed test show)' },
  { key: 'speed', name: 'Швидкість', hint: 'only from the PageSpeed figures given; never guess a speed' },
  { key: 'navigation', name: 'Навігація і пошук', hint: 'menu, catalog structure, search, filters' },
  { key: 'upsell', name: 'Допродажі', hint: 'related products, bundles, cart upsells, free-shipping threshold' },
  { key: 'contact', name: 'Зв’язок', hint: 'phone, messengers, chat, how fast a person can ask a question' },
  { key: 'lead_capture', name: 'Збір контактів', hint: 'subscription, popups, forms for those who are not ready to buy now' },
];
const AREA_KEYS = new Set(AREAS.map((a) => a.key));
const AREA_NAME = Object.fromEntries(AREAS.map((a) => [a.key, a.name]));
const SEV = { high: 'Висока', medium: 'Середня', low: 'Низька' };
const SEV_ORDER = { high: 0, medium: 1, low: 2 };

export const SYSTEM_PROMPT = `You are a senior conversion-rate optimisation (CRO) specialist reviewing ONE website for an advertising agency. The goal: more of the visitors who come from paid ads should buy (or leave a request).
You review the site ALONE. You know nothing about its competitors and must not compare it with them or with "best practice sites" you remember.

You are given only what our reader could see: the visible text of the pages it read, hard facts counted from the HTML ("signals"), and optionally PageSpeed figures. Work ONLY from this.
Rules:
1. Every finding must rest on something in the input. Give an exact quote copied character for character from a page ("quote"), or name a signal ("signal"), or say that something is absent on the pages that were read ("absence").
2. Never invent numbers (speeds, conversion rates, percentages, prices, counts). Use a number only if it stands in the input. Never promise a result ("will increase sales by ...").
3. If an area cannot be judged from the input (for example the checkout needs a cart, or speed figures are missing), do not guess: put it in "not_checked" with the reason.
4. An area that is fine goes to "ok_areas" with one short note. Do not invent problems to look useful.
5. Be specific for a developer: "change" says what exactly to change and where; "acceptance" is a check someone can perform in a minute to say it is done.
6. Take the client's goal and products into account: judge what stops THIS business from selling.
7. Write all text values in Ukrainian. Keep each value short: "seen" and "why" at most two sentences, "change" and "acceptance" at most two sentences.
Answer with ONE JSON object and nothing else (no markdown fence), in this shape:
{"findings":[{"area":"<one of the area keys>","severity":"high|medium|low","page":"<url of a page that was read, or empty>","seen":"what we see (facts)","evidence":{"kind":"quote|signal|absence","quote":"<exact text, when kind is quote>","signal":"<signal name, when kind is signal>"},"why":"why it matters for sales","change":"what to change","acceptance":"how a developer checks it is done"}],"ok_areas":[{"area":"<key>","note":"<short>"}],"not_checked":[{"area":"<key>","reason":"<short>"}]}
"severity" is the effect on sales weighed against the effort: high = clearly stops purchases and is cheap or moderate to fix.
Give at most 12 findings, the most important first.`;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// brief → what the model should know about the business (only facts the manager entered)
export function briefFacts(brief) {
  const c = brief?.content || {};
  const g = c.general || {}, e = c.economics || {};
  return {
    goal: clip(g.goal, 300) || null, geo: clip(g.geo, 120) || null, priority: clip(g.priority, 200) || null,
    products: (e.products || []).slice(0, 8).map((p) => clip(typeof p === 'string' ? p : p?.name, 80)).filter(Boolean),
    offers: (e.offers || []).slice(0, 5).map((p) => clip(typeof p === 'string' ? p : p?.name || p?.title, 120)).filter(Boolean),
    site_cvr: e.site_cvr ?? null, currency: e.currency || null,
  };
}

export function buildSitePrompt({ data, speed, brief, language = 'uk' }) {
  const pages = data.pages.filter((p) => p.ok);
  const lines = [];
  lines.push('CLIENT (from the manager\'s brief; empty means unknown):', JSON.stringify(briefFacts(brief)), '');
  lines.push('AREAS TO CHECK (use these keys):', ...AREAS.map((a) => `- ${a.key}: ${a.name}; ${a.hint}`), '');
  lines.push(`PAGES READ (${pages.length}); pages that failed: ${data.pages.filter((p) => !p.ok).map((p) => `${p.kind || ''} ${p.url} (${p.error})`).join('; ') || 'none'}`, '');
  for (const p of pages) {
    lines.push(`=== PAGE [${p.kind}] ${p.url}`, `title: ${p.title}`, p.description ? `meta description: ${p.description}` : 'meta description: (none)');
    lines.push('signals: ' + JSON.stringify(p.signals));
    lines.push('visible text:', p.text, '');
  }
  if (speed && (speed.mobile || speed.desktop)) {
    lines.push('PAGESPEED (Google lab test of the home page):');
    for (const k of ['mobile', 'desktop']) if (speed[k]) lines.push(`${k}: scores ${JSON.stringify(speed[k].scores)}; metrics ${speed[k].metrics.map((m) => `${m.key} ${m.display}`).join(', ')}; main opportunities: ${speed[k].opportunities.map((o) => o.title).join(' | ') || 'none'}`);
  } else lines.push('PAGESPEED: not available. Put "speed" in not_checked.');
  lines.push('', `Write the values in ${language === 'en' ? 'English' : 'Ukrainian'}.`);
  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}

// the model's text → { findings, ok_areas, not_checked } (raw); throws an Error with a readable reason
export function parseSiteAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: аналіз сайту не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: аналіз сайту не прочитано.'); }
  if (!Array.isArray(o.findings)) throw new Error('У відповіді моделі немає списку знахідок.');
  return { findings: o.findings, ok_areas: Array.isArray(o.ok_areas) ? o.ok_areas : [], not_checked: Array.isArray(o.not_checked) ? o.not_checked : [] };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));

// the whole input as one searchable text: everything the model could legitimately quote
export function buildCorpus(data, speed) {
  const parts = [];
  for (const p of data.pages.filter((x) => x.ok)) {
    parts.push(p.title, p.description, p.text, JSON.stringify(p.signals));
    const s = p.signals || {};
    parts.push(...(s.h1 || []), ...(s.h2 || []), ...(s.buttons || []), ...(s.nav || []), s.footer);
  }
  if (speed) for (const k of ['mobile', 'desktop']) if (speed[k]) parts.push(JSON.stringify(speed[k]));
  return norm(parts.join('\n'));
}

// → { findings: [{ ..., verified, problem? }], dropped, ok_areas, not_checked }
export function checkFindings(raw, data, speed) {
  const corpus = buildCorpus(data, speed);
  const corpusNums = new Set(numbersOf(corpus));
  const readUrls = new Set(data.pages.filter((p) => p.ok).map((p) => p.url));
  const signalNames = new Set(data.pages.filter((p) => p.ok).flatMap((p) => Object.keys(p.signals || {})));
  let dropped = 0;
  const findings = [];
  for (const f of raw.findings.slice(0, 20)) {
    const area = String(f?.area || '');
    const seen = clip(f?.seen, 400), why = clip(f?.why, 400), change = clip(f?.change, 400), acceptance = clip(f?.acceptance, 300);
    if (!AREA_KEYS.has(area) || !seen || !why || !change || !acceptance) { dropped += 1; continue; }
    const ev = f.evidence || {};
    const kind = ['quote', 'signal', 'absence'].includes(ev.kind) ? ev.kind : null;
    const quote = clip(ev.quote, 300), signal = clip(ev.signal, 60);
    let verified = true, problem = null;
    if (!kind) { verified = false; problem = 'не вказано, на чому ґрунтується висновок'; }
    else if (kind === 'quote') {
      if (!quote) { verified = false; problem = 'немає цитати'; }
      else if (!corpus.includes(norm(quote))) { verified = false; problem = 'цитати немає на прочитаних сторінках'; }
    } else if (kind === 'signal') {
      if (!signal || !signalNames.has(signal)) { verified = false; problem = 'такого показника немає серед прочитаних'; }
    }
    if (verified) {
      const stray = numbersOf(seen).filter((n) => n.length > 1 && !corpusNums.has(n));
      if (stray.length) { verified = false; problem = `число без джерела: ${[...new Set(stray)].slice(0, 3).join(', ')}`; }
    }
    const page = readUrls.has(f.page) ? f.page : '';
    findings.push({ area, area_name: AREA_NAME[area], severity: SEV[f.severity] ? f.severity : 'medium', page, seen, why, change, acceptance, evidence: { kind: kind || 'absence', quote: kind === 'quote' ? quote : '', signal: kind === 'signal' ? signal : '' }, verified, ...(problem ? { problem } : {}) });
  }
  findings.sort((a, b) => (b.verified - a.verified) || (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]));
  const okAreas = raw.ok_areas.filter((o) => AREA_KEYS.has(o?.area) && clip(o.note, 200)).map((o) => ({ area: o.area, area_name: AREA_NAME[o.area], note: clip(o.note, 200) }));
  const notChecked = raw.not_checked.filter((o) => AREA_KEYS.has(o?.area) && clip(o.reason, 200)).map((o) => ({ area: o.area, area_name: AREA_NAME[o.area], reason: clip(o.reason, 200) }));
  return { findings, dropped, ok_areas: okAreas, not_checked: notChecked };
}

// the tasks for the pool: verified findings of high and medium severity (the low ones stay in the section only)
export function tasksFromFindings(findings) {
  return findings.filter((f) => f.verified && f.severity !== 'low').map((f) => ({
    type: 'site', owner: 'client_dev', priority: f.severity,
    title: `Сайт: ${f.change}`.slice(0, 160),
    evidence: `${f.area_name}. ${f.seen}${f.evidence.quote ? ` Цитата: «${f.evidence.quote}».` : ''} Критерій приймання: ${f.acceptance}`.slice(0, 600),
  }));
}

const EVID = { quote: 'цитата зі сторінки', signal: 'показник з HTML', absence: 'на прочитаних сторінках цього немає' };
export function renderSiteText(res, { url, pages, speedChecked }) {
  const out = [];
  const read = pages.filter((p) => p.ok), failed = pages.filter((p) => !p.ok);
  out.push(`Сайт: самостійний огляд CRO-спеціаліста, без порівняння з конкурентами. Адреса: ${url}. Прочитано сторінок: ${read.length} (${read.map((p) => p.kind).join(', ')}).${failed.length ? ` Не вдалося прочитати: ${failed.map((p) => `${p.kind} (${p.error})`).join(', ')}.` : ''} Швидкість ${speedChecked ? 'перевірено через PageSpeed' : 'не перевірялась'}.`);
  const good = res.findings.filter((f) => f.verified);
  const bad = res.findings.filter((f) => !f.verified);
  out.push('', `Що змінити (${good.length})`);
  good.forEach((f, i) => {
    out.push(`${i + 1}. [${SEV[f.severity]}] ${f.area_name}${f.page ? ` · ${f.page}` : ''}`, `   Що бачимо: ${f.seen}`, `   Чому важливо: ${f.why}`, `   Що змінити: ${f.change}`, `   Критерій приймання: ${f.acceptance}`,
      `   Доказ (${EVID[f.evidence.kind]}): ${f.evidence.quote ? `«${f.evidence.quote}»` : f.evidence.signal || '—'}`);
  });
  if (!good.length) out.push('Підтверджених знахідок немає.');
  if (bad.length) { out.push('', `Не підтверджено (${bad.length}): не потрапляють у задачі, поки менеджер не перевірить`); bad.forEach((f) => out.push(`• ${f.area_name}: ${f.seen} (${f.problem})`)); }
  if (res.ok_areas.length) { out.push('', 'Добре'); res.ok_areas.forEach((o) => out.push(`• ${o.area_name}: ${o.note}`)); }
  if (res.not_checked.length) { out.push('', 'Не перевірено'); res.not_checked.forEach((o) => out.push(`• ${o.area_name}: ${o.reason}`)); }
  out.push('', 'Розділ доповниться на кроці «Конкуренти»: приклади з їхніх сайтів, що в них краще й гірше.');
  return out.join('\n');
}
