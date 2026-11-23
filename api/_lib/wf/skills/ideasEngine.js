// The Creator's skill «materials_ideas» (step A6.1; document 1.6): the part around the model call. PURE: no network, no model, no clock.
// Reads: the materials and the brand of the client (the files and notes of the project card), the audit (which creatives ran), the competitors, the audience.
// Checks whether the materials are enough to make creatives. If not: a shoot brief («ТЗ на зйомку»), its formats chosen from the ideas of the competitors.
// Writes: «Креативи (матеріали)» and the «Банк ідей» (hooks, formats, angles, with examples).
// Document rules kept here:
//   · «Оффер подається лише погоджений клієнтом»: an offer of ours is always «Рекомендація, потрібне погодження» until the client approves it in the brief,
//     and it comes with a calculation of what we earn or lose on it from the Unit Economy (made by CODE, never by the model)
//   · «Цифри тільки з даних»: a number in a hook or an example must stand in the input, else the idea is marked «не підтверджено»
//   · an idea says where it comes from (a competitor, a segment of the audience, or our own); a source that does not exist is changed to «власна ідея»
import { computeUnitEconomy } from './economics.js';
import { briefFacts } from './siteEngine.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const num = (v) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;

export const KINDS = { logo: 'логотип', product: 'фото продукту', style: 'приклади стилю', creative: 'готові креативи', other: 'інше' };
export const SOURCE_LABEL = { competitor: 'від конкурента', audience: 'з аудиторії', own: 'власна ідея' };

// ---------------------------------------------------------------- what the client has (counted by code)
// materials = { settings: { cta_mode, cta_text, restrictions, figma_url, inputs: { key: { body } } }, assets: [{ kind, name, url }] } (the project card)
export function inventoryOf(materials) {
  const assets = materials?.assets || [], s = materials?.settings || {}, inputs = s.inputs || {};
  const count = Object.fromEntries(Object.keys(KINDS).map((k) => [k, assets.filter((a) => a.kind === k).length]));
  const text = (k) => clip(inputs[k]?.body, 1200);
  const brand = { figma: !!String(s.figma_url || '').trim(), colors_and_fonts: !!text('brand'), tone: !!text('tone'), copy_rules: !!text('copy_rules'), restrictions: !!clip(s.restrictions, 10), cta: !!clip(s.cta_text, 2), links_to_creatives: !!text('examples') };
  const hard = [];
  if (!count.product) hard.push('Немає жодного фото продукту: без нього не можна ні зробити візуал, ні взяти референс.');
  return { count, brand, hard_gaps: hard, notes: { tone: text('tone'), brand: text('brand'), copy_rules: text('copy_rules'), restrictions: clip(s.restrictions, 600), offer: text('offer'), examples: text('examples') } };
}

// ---------------------------------------------------------------- the facts the model may use
export function gatherIdeaFacts({ brief, materials, audit, competitors, audience, unitEconomy }) {
  const inv = inventoryOf(materials);
  const ads = audit?.recent?.ads;
  const past = ads ? { best: (ads.best || []).slice(0, 4).map((l) => ({ name: clip(l.name, 80), roas: l.roas, results: l.results })), worst: (ads.worst || []).slice(0, 3).map((l) => ({ name: clip(l.name, 80), roas: l.roas })) } : null;
  const comp = competitors ? {
    approaches: (competitors.table || []).filter((r) => r.verified).map((r) => ({ competitor: r.competitor, approach: r.approach, angles: r.angles, offers: r.offers })),
    ads: (competitors.ads_analysis || []).map((a) => ({ label: a.label, angle: a.angle, offer: a.offer, format: a.format, idea: a.idea })),
  } : null;
  const seg = audience ? (audience.segments || []).map((s) => ({ name: s.name, who: s.who, situation: s.situation, message: s.message, formats: s.formats, angles: s.angles, status: s.status })) : null;
  const ue = unitEconomy?.thresholds ? { breakeven_cpa: unitEconomy.thresholds.breakeven_cpa, target_cpa: unitEconomy.thresholds.target_cpa, breakeven_roas: unitEconomy.thresholds.breakeven_roas } : null;
  return { brief: briefFacts({ content: brief?.content }), approved_offers: ((brief?.content?.economics?.offers) || []).filter((o) => o?.approved === true).map((o) => clip(o.name, 120)), inventory: { count: inv.count, brand: inv.brand, hard_gaps: inv.hard_gaps }, notes: inv.notes, past_creatives: past, competitors: comp, audience: seg, unit_economy: ue };
}

export const SYSTEM_PROMPT = `You are the creative strategist of an advertising agency. You prepare the ground for the creatives of ONE client: you judge whether the client's materials are enough, and you build a bank of ideas.
You are given only facts: the brief, an inventory of the client's files and brand notes, which creatives ran before (from the ad account), the approaches and ads of the competitors, the segments of the audience, and the break-even figures. Work ONLY from this. A source that is null does not exist: do not use or invent it.
Task 1, "materials": say whether the materials are enough to make creatives (verdict "enough" or "not_enough") and why. Our creatives are STATIC IMAGES (4:5, 9:16, 1:1) made from the client's product photos, so judge by what such pictures need: the verdict is "enough" when there is at least one product photo AND the basics of the brand (colours and fonts, or the tone, or the copy rules). A missing logo, Figma file, earlier creatives or video footage does NOT make it "not_enough": name them in "missing" as improvements (for video say that it needs a shoot). The verdict is "not_enough" only when there is no product photo or no brand basics at all. List what the client has ("have") and what is missing ("missing"). If the verdict is not_enough, write a shoot brief "shoot_list": what exactly the client must film or photograph, in which format (for example "відео 9:16 до 15 с", "фото товару на нейтральному фоні"), why it is needed, and the "reference": the competitor host or ad label whose idea this format follows (or an empty string). First decide the formats from the ideas of the competitors and the audience, then write the list. If the verdict is enough, "shoot_list" is empty.
Task 2, "ideas": a bank of 6 to 12 ideas. Each idea: "hook" (the opening line of the ad), "angle" (the side from which the product is shown: gift, saving, guarantee, reviews...), "format", "segment" (the name of one segment of the audience, or empty), "source" ("competitor" when it comes from a competitor's approach or ad, "audience" when it comes from a segment, "own" for your own idea), "reference" (the competitor host or ad label, or the segment name; empty for own), "example" (one line: how it looks in the ad).
An idea with an OFFER of ours (a discount, a gift, a set): "source" is "own", and you add "offer": {"name","pays","list_value","extra_cost"}: pays is what the customer pays, list_value is the list price of everything given, extra_cost is the extra cost to us (for example the cost of a gift). Never use an offer that is not in approved_offers as if it were agreed: such an offer is only your recommendation.
Rules:
1. Never invent numbers (sizes, percentages, prices, results). A number may appear in a hook or an example only if it stands in the input. Never promise results.
2. Do not copy a competitor's text; take the approach and write our own hook.
3. Ideas must differ from each other in angle or format. No filler.
4. Write all text values in Ukrainian. Each value at most two short sentences.
Answer with ONE JSON object and nothing else (no markdown fence):
{"materials":{"verdict":"enough|not_enough","reason":"","have":[""],"missing":[""],"shoot_list":[{"what":"","format":"","why":"","reference":""}]},"ideas":[{"hook":"","angle":"","format":"","segment":"","source":"competitor|audience|own","reference":"","example":"","offer":null}]}`;

export function buildIdeasPrompt({ facts, language = 'uk' }) {
  return { system: SYSTEM_PROMPT, user: ['FACTS BY SOURCE (null = the source does not exist for this client):', JSON.stringify(facts, null, 1), '', `Write the values in ${language === 'en' ? 'English' : 'Ukrainian'}.`].join('\n') };
}

export function parseIdeasAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: матеріали й ідеї не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: матеріали й ідеї не прочитано.'); }
  if (!o.materials || typeof o.materials !== 'object') throw new Error('У відповіді моделі немає оцінки матеріалів.');
  if (!Array.isArray(o.ideas)) throw new Error('У відповіді моделі немає банку ідей.');
  return { materials: o.materials, ideas: o.ideas };
}

// ---------------------------------------------------------------- what we earn or lose on an offer: counted by CODE from the Unit Economy of the brief
// → { pays, list_value, extra_cost, contribution, vs_average, breakeven_cpa, margin_pct } or null when the Unit Economy cannot count it
export function offerEconomics(economics, offer) {
  const pays = num(offer?.pays), list = num(offer?.list_value), extra = num(offer?.extra_cost) ?? 0;
  if (pays == null || list == null || !economics) return null;
  const res = computeUnitEconomy({ ...economics, offers: [{ name: '__offer', pays, list_value: list, extra_cost: extra }] });
  const line = res.lines.find((l) => l.name === '__offer'), avg = res.lines.find((l) => l.kind === 'average' || l.name === 'Середнє замовлення');
  if (!line || line.blocked) return null;
  return { pays: r2(pays), list_value: r2(list), extra_cost: r2(extra), contribution: line.contribution, breakeven_cpa: line.breakeven_cpa, margin_pct: line.margin_pct, vs_average: avg && !avg.blocked ? r2(line.contribution - avg.contribution) : null };
}

// ---------------------------------------------------------------- checking the answer
export function checkMaterials(raw, inventory) {
  const m = raw.materials;
  const list = (x, n = 8) => (Array.isArray(x) ? x : []).map((t) => clip(t, 200)).filter(Boolean).slice(0, n);
  let verdict = m.verdict === 'enough' ? 'enough' : 'not_enough';
  let reason = clip(m.reason, 400);
  const forced = verdict === 'enough' && inventory.hard_gaps.length > 0;
  if (forced) { verdict = 'not_enough'; reason = `${inventory.hard_gaps.join(' ')} ${reason}`.trim(); } // the code does not allow «enough» without the basics
  const shoot = (Array.isArray(m.shoot_list) ? m.shoot_list : []).map((s) => ({ what: clip(s?.what, 240), format: clip(s?.format, 120), why: clip(s?.why, 240), reference: clip(s?.reference, 120) })).filter((s) => s.what && s.format).slice(0, 10);
  return { verdict, reason, forced, have: list(m.have), missing: [...inventory.hard_gaps, ...list(m.missing).filter((x) => !inventory.hard_gaps.includes(x))].slice(0, 10), shoot_list: verdict === 'not_enough' ? shoot : [] };
}

export function checkIdeas(raw, { facts, economics }) {
  const corpusParts = [JSON.stringify(facts)];
  const corpus = norm(corpusParts.join(' '));
  const nums = new Set(numbersOf(corpus));
  const hosts = new Set((facts.competitors?.approaches || []).map((a) => norm(a.competitor)));
  const adLabels = new Set((facts.competitors?.ads || []).map((a) => norm(a.label)));
  const segs = new Set((facts.audience || []).map((s) => norm(s.name)));
  const approved = new Set((facts.approved_offers || []).map(norm));
  let dropped = 0;
  const items = [];
  for (const [i, x] of raw.ideas.slice(0, 14).entries()) {
    const hook = clip(x?.hook, 240), angle = clip(x?.angle, 120), format = clip(x?.format, 120);
    if (!hook || !angle || !format) { dropped += 1; continue; }
    let source = ['competitor', 'audience', 'own'].includes(x.source) ? x.source : 'own';
    const ref = clip(x.reference, 120);
    let note = null;
    if (source === 'competitor' && !(hosts.has(norm(ref)) || adLabels.has(norm(ref)))) { source = 'own'; note = 'Конкурента з такою назвою немає серед прочитаних: це власна ідея.'; }
    if (source === 'audience' && !segs.has(norm(x.segment || ref))) { source = 'own'; note = 'Такого сегмента в розділі «Аудиторія» немає: це власна ідея.'; }
    const example = clip(x.example, 300);
    const stray = numbersOf(`${hook} ${example}`).filter((n) => n.length > 1 && !nums.has(n));
    let offer = null;
    if (x.offer && typeof x.offer === 'object') {
      const o = { name: clip(x.offer.name, 120), pays: num(x.offer.pays), list_value: num(x.offer.list_value), extra_cost: num(x.offer.extra_cost) ?? 0 };
      if (o.name) offer = { ...o, approved: approved.has(norm(o.name)), economics: offerEconomics(economics, o) };
    }
    // an offer that the client has not approved is only a recommendation; so is any idea of ours that carries an offer
    const recommendation = !!offer && !offer.approved;
    items.push({ id: `i${items.length + 1}`, hook, angle, format, segment: clip(x.segment, 80), source, source_label: SOURCE_LABEL[source], reference: source === 'own' ? '' : ref, example, offer, recommendation, status: stray.length ? 'unverified' : 'ok', ...(stray.length ? { problem: `число без джерела: ${[...new Set(stray)].slice(0, 3).join(', ')}` } : {}), ...(note ? { note } : {}), order: i });
  }
  return { items, dropped };
}

// ---------------------------------------------------------------- the texts of the two sections
export function renderMaterialsText(inv, m, { assetsSeen }) {
  const out = ['Креативи (матеріали): що є в клієнта і чого не вистачає.'];
  out.push(`Є: ${Object.entries(inv.count).filter(([, n]) => n).map(([k, n]) => `${KINDS[k]} ${n}`).join(', ') || 'файлів немає'}. Бренд: ${Object.entries({ figma: 'макет у Figma', colors_and_fonts: 'кольори й шрифти', tone: 'тон', copy_rules: 'правила до текстів', restrictions: 'обмеження', cta: 'текст кнопки', links_to_creatives: 'посилання на креативи' }).map(([k, l]) => `${l}: ${inv.brand[k] ? 'є' : 'немає'}`).join('; ')}.`);
  out.push(`Висновок: ${m.verdict === 'enough' ? 'матеріалів достатньо для створення креативів' : 'матеріалів недостатньо'}. ${m.reason}`);
  if (m.have.length) { out.push('', 'Є'); m.have.forEach((t) => out.push(`• ${t}`)); }
  if (m.missing.length) { out.push('', 'Не вистачає'); m.missing.forEach((t) => out.push(`• ${t}`)); }
  if (m.shoot_list.length) { out.push('', 'ТЗ на зйомку (формати визначено за ідеями конкурентів і аудиторії)'); m.shoot_list.forEach((s, i) => out.push(`${i + 1}. ${s.what} · ${s.format}`, `   Навіщо: ${s.why || '—'}${s.reference ? ` · за прикладом: ${s.reference}` : ''}`)); }
  out.push('', assetsSeen);
  return out.join('\n');
}

export function renderIdeasText(items, { notCovered }) {
  const out = ['Банк ідей: хуки, формати й кути з прикладами.'];
  items.forEach((x, i) => {
    out.push('', `${i + 1}. ${x.hook}`, `   Кут: ${x.angle} · формат: ${x.format}${x.segment ? ` · для: ${x.segment}` : ''}`, `   Звідки: ${x.source_label}${x.reference ? ` (${x.reference})` : ''}${x.status === 'unverified' ? ` · не підтверджено: ${x.problem}` : ''}`, `   Приклад: ${x.example || '—'}`);
    if (x.offer) {
      const e = x.offer.economics;
      out.push(`   Оффер: ${x.offer.name}. ${x.recommendation ? 'Рекомендація, потрібне погодження клієнта.' : 'Погоджено клієнтом.'}`,
        e ? `   Розрахунок: клієнт платить ${e.pays}, ми заробляємо до реклами ${e.contribution} із замовлення${e.vs_average != null ? ` (${e.vs_average >= 0 ? '+' : ''}${e.vs_average} проти середнього замовлення)` : ''}; беззбитковий CPA ${e.breakeven_cpa}.` : '   Розрахунок: Unit Economy не може його порахувати (немає цін або собівартості).');
    }
    if (x.note) out.push(`   Примітка: ${x.note}`);
  });
  if (!items.length) out.push('', 'Ідей немає.');
  if (notCovered.length) { out.push('', 'У цій версії не рахується'); notCovered.forEach((t) => out.push(`• ${t}`)); }
  return out.join('\n');
}
