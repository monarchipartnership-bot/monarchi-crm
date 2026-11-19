// The «audience» skill of the Researcher (step A4; document 1.3): the part around the model call. PURE: no network, no model, no clock.
// The document's rule: «Беремо те, що є, і пропускаємо те, чого немає. Обов'язковий лише бриф. Нічого не вигадуємо.»
// Sources: the brief (the base), the audit of the ad cabinet (age, gender, placement, device, region with results), the client's GA4 (only if it holds
// demographics), AI hypotheses. A segment is by the SITUATION of buying, not by age. «Спершу гіпотези ШІ, потім перевірка за брифом, кабінетом і відгуками:
// що підтвердилося, а що лишається гіпотезою (так і позначається).» The check is made by CODE: a confirmation is accepted only if its quote or key stands in that source.

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const pc = (x) => (x == null ? null : Math.round(x * 100)); // shares go to the model as whole percents, so a «34%» in its text can be found in the input
const SOURCES = ['brief', 'meta', 'ga4'];

export const SEGMENT_FIELDS = [['who', 'Хто'], ['situation', 'Що відбувається'], ['wants', 'Чого хочуть'], ['pains', 'Болі'], ['blockers', 'Що зупиняє'], ['convincers', 'Що переконує'], ['message', 'Що кажемо в рекламі'], ['formats', 'Формати'], ['products', 'Товари'], ['targeting', 'Таргетинг']];

// → the facts the model may use, split by source. Each part is null when its source is missing (and the text says why).
export function gatherFacts({ brief, audit, ga4 }) {
  const c = brief?.content || {}, g = c.general || {}, e = c.economics || {};
  const b = {
    audience: clip(g.audience, 1500) || null, goal: clip(g.goal, 400) || null, geo: clip(g.geo, 200) || null, priority: clip(g.priority, 300) || null,
    products: (e.products || []).slice(0, 10).map((p) => clip(p?.name, 80)).filter(Boolean), offers: (e.offers || []).slice(0, 6).map((o) => clip(o?.name, 120)).filter(Boolean),
    text: clip(brief?.body, 2500) || null,
  };
  let meta = null;
  if (audit?.breakdowns) {
    const lines = (name) => (audit.breakdowns[name]?.life || []).slice(0, 8).map((l) => ({ key: String(l.key), spend_share_pct: pc(l.share), results: l.results, roas: l.roas, cost_per_result: l.cpr, verdict: l.verdict }));
    const parts = Object.fromEntries(['age', 'gender', 'placement', 'device', 'region'].map((n) => [n, lines(n)]).filter(([, v]) => v.length));
    if (Object.keys(parts).length) meta = { result_kind: audit.resultKind, currency: audit.currency || null, breakdowns: parts };
  }
  let g4 = null;
  if (ga4 && Object.keys(ga4.reports || {}).length) {
    const rep = (n, k = 8) => (ga4.reports[n]?.rows || []).slice(0, k).map((r) => ({ key: r.key, users_share_pct: pc(r.share), purchases: r.purchases }));
    g4 = { window: ga4.window, demographics_available: ga4.demographics, age: ga4.demographics ? rep('age') : undefined, gender: ga4.demographics ? rep('gender') : undefined, country: rep('country'), city: rep('city', 10), device: rep('device'), visitors: rep('visitor'), channels: rep('channel'), funnel: ga4.funnel };
  }
  return { brief: b, meta, ga4: g4 };
}

export const SYSTEM_PROMPT = `You are a senior marketing strategist building the target AUDIENCE of one client for an advertising agency.
You build SEGMENTS BY THE SITUATION OF BUYING (who buys, in what life or business situation, why now), NOT by age or gender.
You are given only the facts we have, split by source: "brief" (what the manager wrote after talking to the client: the base), "meta" (results by age, gender, placement, device, region from the client's ad account), "ga4" (who visits the site). A source that is null does not exist: do not use or invent it.
Method: first propose the segments that this business can really have (hypotheses), then check each one against the sources: what is confirmed and what stays a hypothesis.
Rules:
1. Only concrete, key segments, 2 to 6 of them. Very similar ones are merged into one; clearly different ones stay separate. No filler segments.
2. Never invent numbers, shares, sizes or conversion rates. Use a number only if it stands in the input. Do not claim a segment is big or buys more unless a source shows it.
3. "confirmed_by" lists the evidence: {"source":"brief|meta|ga4","ref":"..."}. For "brief" the ref is an exact quote copied character for character from the brief facts. For "meta" and "ga4" the ref is the exact key from that source (for example "25-34", "female", "mobile", "Kyiv", "view_item"). If nothing confirms the segment, leave confirmed_by empty: it will be shown as a hypothesis, and that is fine and honest.
4. Do not treat age and gender as the segment; they may only be evidence.
5. If the brief describes the audience only in general words, put up to 6 short clarifying questions for the client in "questions". If the brief is detailed, leave it empty.
6. Targeting means what can be set in Meta Ads (interests, behaviours, lookalikes, custom audiences, placements, geo), described in words, with no invented audience sizes.
7. "angles" are short advertising ideas for this segment (one line each, at most 4), later given to the creative team.
8. Write all text values in Ukrainian. Each value at most two short sentences.
Answer with ONE JSON object and nothing else (no markdown fence):
{"segments":[{"name":"...","who":"...","situation":"...","wants":"...","pains":"...","blockers":"...","convincers":"...","message":"...","formats":"...","products":"...","targeting":"...","angles":["..."],"confirmed_by":[{"source":"brief|meta|ga4","ref":"..."}]}],"questions":["..."]}`;

export function buildAudiencePrompt({ facts, language = 'uk' }) {
  const lines = ['FACTS BY SOURCE (null = the source does not exist for this client):', JSON.stringify({ brief: facts.brief, meta: facts.meta, ga4: facts.ga4 }, null, 1), '', `Write the values in ${language === 'en' ? 'English' : 'Ukrainian'}.`];
  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}

export function parseAudienceAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: аудиторію не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: аудиторію не прочитано.'); }
  if (!Array.isArray(o.segments)) throw new Error('У відповіді моделі немає списку сегментів.');
  return { segments: o.segments, questions: Array.isArray(o.questions) ? o.questions : [] };
}

// the searchable text of each source: a confirmation counts only when its ref is found in the source it names
export function sourceCorpora(facts) {
  const brief = norm(JSON.stringify(facts.brief));
  const meta = facts.meta ? norm(Object.values(facts.meta.breakdowns).flat().map((l) => l.key).join(' | ')) : null;
  const ga4 = facts.ga4 ? norm([...['age', 'gender', 'country', 'city', 'device', 'visitors', 'channels'].flatMap((n) => (facts.ga4[n] || []).map((r) => r.key)), ...(facts.ga4.funnel || []).map((f) => f.event)].join(' | ')) : null;
  return { brief, meta, ga4, all: norm(JSON.stringify(facts)) };
}

// → { segments: [{ ...fields, status: 'confirmed'|'hypothesis'|'unverified', confirmed_by: [ok ones], rejected: [bad ones], problem? }], dropped, questions }
export function checkSegments(raw, facts) {
  const corp = sourceCorpora(facts);
  const allNums = new Set(numbersOf(corp.all));
  let dropped = 0;
  const segments = [];
  for (const s of raw.segments.slice(0, 8)) {
    const name = clip(s?.name, 80);
    const fields = Object.fromEntries(SEGMENT_FIELDS.map(([k]) => [k, clip(s?.[k], 400)]));
    if (!name || !fields.who || !fields.situation) { dropped += 1; continue; }
    const ok = [], rejected = [];
    for (const e of (Array.isArray(s.confirmed_by) ? s.confirmed_by : []).slice(0, 6)) {
      const source = String(e?.source || ''), ref = clip(e?.ref, 200);
      const found = SOURCES.includes(source) && ref && corp[source] != null && corp[source].includes(norm(ref));
      (found ? ok : rejected).push({ source, ref });
    }
    const stray = numbersOf(Object.values(fields).join(' ')).filter((n) => n.length > 1 && !allNums.has(n));
    const status = stray.length ? 'unverified' : ok.length ? 'confirmed' : 'hypothesis';
    segments.push({ name, ...fields, angles: (Array.isArray(s.angles) ? s.angles : []).map((a) => clip(a, 160)).filter(Boolean).slice(0, 4), status, confirmed_by: ok, rejected, ...(stray.length ? { problem: `число без джерела: ${[...new Set(stray)].slice(0, 3).join(', ')}` } : {}) });
  }
  const questions = raw.questions.map((q) => clip(q, 240)).filter(Boolean).slice(0, 6);
  return { segments, dropped, questions };
}

// which sources were used and which skipped, in words (decided by code from what was really available)
export function sourceNotes({ facts, ga4, hasAudit, propertyGiven }) {
  const used = [], skipped = [];
  (facts.brief.audience || facts.brief.goal ? used : skipped).push('Бриф' + (facts.brief.audience ? '' : ': опису аудиторії немає, лише загальні дані'));
  if (facts.meta) used.push('Кабінет Meta: розбивки за віком, статтю, плейсментами, пристроями, регіонами'); else skipped.push(hasAudit ? 'Кабінет Meta: у кабінеті немає розбивок із результатами' : 'Кабінет Meta: аудиту кабінету немає (клієнт ще не рекламувався або кабінет не підключено)');
  if (facts.ga4) used.push(`GA4: ${ga4.window.start} – ${ga4.window.end}${ga4.demographics ? '' : ' (без віку й статі: демографію не ввімкнено в GA4 клієнта)'}`);
  else skipped.push(propertyGiven ? `GA4: не вдалося прочитати${ga4?.errors?.length ? ' (' + ga4.errors[0] + ')' : ''}` : 'GA4: у брифі не вказано Property ID');
  skipped.push('Дані клієнта про покупців: не надано (магазин автоматично не підключаємо)', 'Відгуки: у цій версії не читаються');
  return { used, skipped };
}

export function questionsTask(questions) {
  if (!questions.length) return null;
  return { type: 'client', owner: 'manager', priority: 'medium', title: 'Уточнити в клієнта опис аудиторії', evidence: questions.map((q, i) => `${i + 1}. ${q}`).join(' ').slice(0, 600) };
}

const STATUS = { confirmed: 'підтверджено', hypothesis: 'гіпотеза', unverified: 'не підтверджено' };
export function renderAudienceText(res, { notes }) {
  const out = ['Цільова аудиторія по сегментах (за ситуацією купівлі, не за віком).'];
  out.push(`Джерела: ${notes.used.join('; ') || 'немає'}.`, `Пропущено: ${notes.skipped.join('; ')}.`);
  res.segments.forEach((s, i) => {
    out.push('', `${i + 1}. ${s.name} [${STATUS[s.status]}]`);
    for (const [k, label] of SEGMENT_FIELDS) if (s[k]) out.push(`   ${label}: ${s[k]}`);
    if (s.confirmed_by.length) out.push(`   Чим підтверджено: ${s.confirmed_by.map((c) => `${{ brief: 'бриф', meta: 'Meta', ga4: 'GA4' }[c.source]} «${c.ref}»`).join('; ')}`);
    if (s.problem) out.push(`   Увага: ${s.problem}`);
    if (s.angles.length) out.push(`   Кути для банку ідей: ${s.angles.join(' | ')}`);
  });
  if (!res.segments.length) out.push('', 'Сегментів не побудовано.');
  if (res.questions.length) { out.push('', 'Питання до клієнта'); res.questions.forEach((q, i) => out.push(`${i + 1}. ${q}`)); }
  return out.join('\n');
}
