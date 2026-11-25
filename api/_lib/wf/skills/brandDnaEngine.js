// The Researcher's skill «brand_dna» (adopted from the study of Zeely, owner's decision 2026-11-25): a structured profile of the brand of the client, filled from its website and CHECKED by a person.
//   identity:      colours, fonts, visual style, what must never be in a picture, the logo
//   branding:      overview, values, tagline
//   communication: tone, banned words, banned claims, headline styles to avoid
//   rules:         general rules for the creatives
// PURE: no network, no model, no clock. The facts a model cannot be trusted with (colours, fonts, the logo address) are read from the code of the page BY CODE and the model may only choose among them.
// A person's notes in the project card (brand, tone, copy rules, restrictions) always win over what the site says.

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const list = (x, n, len = 160) => (Array.isArray(x) ? x : []).map((t) => clip(t, len)).filter(Boolean).slice(0, n);

// ---------------------------------------------------------------- colours
export function normHex(v) {
  const m = String(v || '').trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const h = m[1];
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
}
const rgbHex = (r, g, b) => '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('');
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
// a colour that carries the brand: not grey, not near-white, not near-black
export const isChromatic = (hex) => { const { s, l } = hsl(hex); return s >= 0.18 && l > 0.1 && l < 0.92; };

const BRAND_VAR = /(primary|brand|accent|main|theme|secondary|cta|button)/i;
export function extractColors(css, html = '') {
  const count = new Map();
  const add = (hex, w = 1) => { const h = normHex(hex); if (h) count.set(h, (count.get(h) || 0) + w); };
  const src = `${css}\n${String(html).replace(/<(script)\b[\s\S]*?<\/\1>/gi, ' ')}`;
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) add(m[2], BRAND_VAR.test(m[1]) ? 8 : 2); // a named variable says the colour is meant
  for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) add(m[0]);
  for (const m of src.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)) add(rgbHex(m[1], m[2], m[3]));
  return [...count.entries()].map(([hex, n]) => ({ hex, count: n, chromatic: isChromatic(hex) })).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- fonts
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial', 'unset', 'revert', 'emoji', 'math', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue', 'arial', 'oxygen', 'ubuntu', 'cantarell', 'fira sans', 'droid sans', 'noto sans', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'times', 'times new roman', 'georgia', 'courier new', 'tahoma', 'verdana']);
export function extractFonts(css, html = '') {
  const count = new Map();
  const add = (name, w = 1) => { const n = clip(name.replace(/^["']|["']$/g, ''), 60); if (!n || n.length < 2 || /^var\(|^-+|\d{3}/.test(n) || GENERIC.has(n.toLowerCase())) return; count.set(n, (count.get(n) || 0) + w); };
  for (const m of String(css).matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*([^;}]+)/gi)) add(m[1].trim(), 6); // a font the site brings itself
  for (const m of String(css).matchAll(/font-family\s*:\s*([^;}{]+)/gi)) { const first = m[1].split(',')[0].trim(); add(first, 1); }
  for (const m of String(html).matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi)) {
    for (const f of m[1].matchAll(/family=([^&:;"']+)/g)) add(decodeURIComponent(f[1]).replace(/\+/g, ' '), 8);
  }
  return [...count.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- logo candidates (addresses only, nothing is downloaded)
export function extractLogos(html, baseUrl) {
  const out = [], seen = new Set();
  const add = (u, why) => { try { const a = new URL(u, baseUrl).toString(); if (/^https?:/.test(a) && !seen.has(a)) { seen.add(a); out.push({ url: a, why }); } } catch { /* skip */ } };
  for (const m of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/logo/i.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src && !/^data:/i.test(src)) add(src, 'зображення з «logo» на сторінці');
  }
  for (const m of String(html).matchAll(/<link\b[^>]*rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) { const h = m[0].match(/href=["']([^"']+)["']/i)?.[1]; if (h) add(h, 'іконка сайту'); }
  const og = String(html).match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
  if (og) add(og, 'og:image сторінки');
  return out.slice(0, 5);
}

// the signals of a site: assets = { url, html, css: [{ url, text }] }
export function extractBrandSignals(assets) {
  const html = String(assets?.html || '');
  const css = [(assets?.css || []).map((c) => c.text).join('\n'), [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n'), [...html.matchAll(/\bstyle=["']([^"']+)["']/gi)].map((m) => m[1]).join(';')].join('\n');
  const theme = normHex(html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)?.[1] || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i)?.[1]);
  const colors = extractColors(css, html).slice(0, 14);
  if (theme && !colors.some((c) => c.hex === theme)) colors.unshift({ hex: theme, count: 10, chromatic: isChromatic(theme), theme: true });
  return { url: assets?.url || '', theme_color: theme, colors, fonts: extractFonts(css, html).slice(0, 8), logos: extractLogos(html, assets?.url || 'https://x.invalid/'), css_files: (assets?.css || []).length };
}

// ---------------------------------------------------------------- the notes of a person (the project card): they win
export function manualNotes(materials) {
  const s = materials?.settings || {}, inputs = s.inputs || {};
  const t = (k) => clip(inputs[k]?.body, 1500);
  return { brand: t('brand'), tone: t('tone'), copy_rules: t('copy_rules'), restrictions: clip(s.restrictions, 1500), has_figma: !!String(s.figma_url || '').trim() };
}

// ---------------------------------------------------------------- the prompt
export const SYSTEM_PROMPT = `You are the brand analyst of an advertising agency. You describe the brand of ONE client from its website, for the people who will make ads for it.
You are given: SIGNALS read from the code of the site (colours, fonts, logo candidates: facts), the TEXT of the site's pages, and the NOTES of the account manager (they have priority over everything else).
Rules:
1. Colours: choose ONLY from "signals.colors" (use the hex exactly as given). Give each a role: "primary", "secondary", "accent", "background" or "text". At most 6. If no colour is clearly the brand's, return an empty list. Never invent a colour.
2. Fonts: choose ONLY from "signals.fonts" (exact name) with a role "headings" or "body". If none fits, return an empty list.
3. "logo_url": one of "signals.logos" (exact url) or an empty string.
4. "style": the visual style of the brand in one or two sentences (photography, mood, layout), only what the site's text and signals support. "visual_donts": what must not appear in the pictures of this brand; only what follows from the site or the manager's notes (restrictions); otherwise an empty list.
5. "overview": what the company is and who it serves, from the site. "values": at most 5 values the site states. "tagline": the site's own tagline or slogan, exactly as written, or an empty string.
6. "tone": the tone of voice the site's text really uses. "taboo_words" and "taboo_claims": ONLY what the manager's notes (copy rules, restrictions) or the site itself forbid or avoid; never add your own guesses. "headline_avoid": headline styles that would clash with the site's tone (at most 4).
7. "rules": at most 6 short general rules for the creatives that follow from the above.
8. Never invent facts, numbers, prices, awards or claims. Anything you cannot support is an empty string or an empty list.
Answer with ONE JSON object and nothing else (no markdown fence):
{"identity":{"colors":[{"hex":"#000000","role":"primary"}],"fonts":[{"name":"","role":"headings"}],"logo_url":"","style":"","visual_donts":[""]},"branding":{"overview":"","values":[""],"tagline":""},"communication":{"tone":"","taboo_words":[""],"taboo_claims":[""],"headline_avoid":[""]},"rules":[""]}`;

export function buildBrandPrompt({ signals, pages = [], notes = {}, brief = null, language = 'uk' }) {
  const facts = {
    signals: { colors: signals.colors.map((c) => ({ hex: c.hex, uses: c.count, chromatic: c.chromatic, theme_color: !!c.theme })), fonts: signals.fonts.map((f) => ({ name: f.name, uses: f.count })), logos: signals.logos },
    pages: pages.slice(0, 5).map((p) => ({ kind: p.kind, title: clip(p.title, 160), description: clip(p.description, 300), text: String(p.text || '').slice(0, 2200) })),
    manager_notes: { brand: notes.brand || '', tone: notes.tone || '', copy_rules: notes.copy_rules || '', restrictions: notes.restrictions || '' },
    brief: brief || null,
  };
  return { system: SYSTEM_PROMPT, user: ['FACTS (empty = does not exist):', JSON.stringify(facts, null, 1), '', `Write the text fields in ${language === 'en' ? 'English' : 'Ukrainian'}.`].join('\n') };
}

export function parseBrandAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: ДНК бренду не прочитано.');
  try { return JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: ДНК бренду не прочитано.'); }
}

// ---------------------------------------------------------------- the check: what the code could not confirm is dropped and counted
const COLOR_ROLES = ['primary', 'secondary', 'accent', 'background', 'text'];
const FONT_ROLES = ['headings', 'body'];
export function checkBrand(raw, signals, notes = {}) {
  const id = raw?.identity || {}, br = raw?.branding || {}, cm = raw?.communication || {};
  const dropped = [];
  const known = new Set(signals.colors.map((c) => c.hex));
  const colors = [], usedHex = new Set();
  for (const c of Array.isArray(id.colors) ? id.colors : []) {
    const hex = normHex(c?.hex);
    if (!hex || !known.has(hex)) { dropped.push(`колір ${clip(c?.hex, 12)} (його немає в коді сайту)`); continue; }
    if (usedHex.has(hex)) continue;
    usedHex.add(hex);
    colors.push({ hex, role: COLOR_ROLES.includes(c.role) ? c.role : 'accent' });
  }
  const fontByName = new Map(signals.fonts.map((f) => [norm(f.name), f.name]));
  const fonts = [];
  for (const f of Array.isArray(id.fonts) ? id.fonts : []) {
    const name = fontByName.get(norm(f?.name));
    if (!name) { dropped.push(`шрифт «${clip(f?.name, 40)}» (його немає в коді сайту)`); continue; }
    if (!fonts.some((x) => x.name === name)) fonts.push({ name, role: FONT_ROLES.includes(f.role) ? f.role : 'body' });
  }
  const logoUrl = signals.logos.find((l) => l.url === String(id.logo_url || '').trim())?.url || '';
  if (id.logo_url && !logoUrl) dropped.push('адреса логотипа (її немає серед знайдених на сторінці)');
  const taboo_words = list(cm.taboo_words, 20, 60), taboo_claims = list(cm.taboo_claims, 12, 160);
  return {
    dna: {
      schema: 1, url: signals.url || '', source: 'site', reviewed: false, has_manual_notes: !!(notes.brand || notes.tone || notes.copy_rules || notes.restrictions),
      identity: { colors, fonts, logo_url: logoUrl, style: clip(id.style, 400), visual_donts: list(id.visual_donts, 8) },
      branding: { overview: clip(br.overview, 500), values: list(br.values, 5, 80), tagline: clip(br.tagline, 120) },
      communication: { tone: clip(cm.tone, 400), taboo_words, taboo_claims, headline_avoid: list(cm.headline_avoid, 4) },
      rules: list(raw?.rules, 6, 200),
    },
    dropped,
  };
}

// how complete the profile is: what is missing is a question to the manager, not an invention
export function brandGaps(dna) {
  const out = [];
  if (!dna?.identity?.colors?.length) out.push('Кольори бренду не визначено: додайте їх у картці проєкту або в цьому розділі.');
  if (!dna?.identity?.fonts?.length) out.push('Шрифти не визначено.');
  if (!dna?.identity?.logo_url) out.push('Логотип на сторінці не знайдено: завантажте його в картку проєкту.');
  if (!dna?.communication?.tone) out.push('Тон комунікації не визначено.');
  if (!dna?.communication?.taboo_words?.length && !dna?.communication?.taboo_claims?.length) out.push('Заборонених слів і тверджень немає: якщо клієнт має обмеження, додайте їх.');
  return out;
}
export const dnaIsUsable = (dna) => !!dna && !!(dna.identity?.colors?.length || dna.identity?.fonts?.length || dna.communication?.tone || dna.identity?.style);

// ---------------------------------------------------------------- what the Creator reads
// the human notes win; the profile fills only what the notes leave empty
export function brandForCreator(dna, notes = {}) {
  if (!dnaIsUsable(dna)) return null;
  const col = (dna.identity.colors || []).map((c) => `${c.role} ${c.hex}`).join(', ');
  const fnt = (dna.identity.fonts || []).map((f) => `${f.name} (${f.role})`).join(', ');
  return {
    tone: notes.tone || dna.communication.tone || '',
    colors_and_fonts: notes.brand || [col && `colours: ${col}`, fnt && `fonts: ${fnt}`, dna.identity.style && `style: ${dna.identity.style}`].filter(Boolean).join('; '),
    copy_rules: notes.copy_rules || (dna.rules || []).join(' '),
    taboo_words: dna.communication.taboo_words || [], taboo_claims: dna.communication.taboo_claims || [],
    headline_avoid: dna.communication.headline_avoid || [], visual_donts: dna.identity.visual_donts || [], tagline: dna.branding.tagline || '',
  };
}

// the banned words or claims a text contains (whole words for a word, a substring for a phrase) → [string]
export function tabooHits(text, { taboo_words = [], taboo_claims = [] } = {}) {
  const t = ` ${norm(text).replace(/[.,!?:;()—–-]/g, ' ').replace(/\s+/g, ' ')} `;
  const hit = [];
  for (const w of [...taboo_words, ...taboo_claims]) {
    const n = norm(w).replace(/[.,!?:;()—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (n.length >= 2 && t.includes(` ${n} `) && !hit.includes(w)) hit.push(w);
  }
  return hit;
}

// ---------------------------------------------------------------- the text of the section
export function renderBrandText(dna, { gaps = [], dropped = [], url } = {}) {
  const out = ['ДНК бренду (складено з сайту, потребує перевірки менеджером)'];
  if (url) out.push(`Сайт: ${url}`);
  const i = dna.identity, b = dna.branding, c = dna.communication;
  out.push('', 'Візуальна ідентичність');
  out.push(`• Кольори: ${i.colors.map((x) => `${x.hex} (${x.role})`).join(', ') || 'не визначено'}`);
  out.push(`• Шрифти: ${i.fonts.map((x) => `${x.name} (${x.role})`).join(', ') || 'не визначено'}`);
  out.push(`• Логотип: ${i.logo_url || 'не знайдено'}`);
  out.push(`• Стиль: ${i.style || 'не визначено'}`);
  if (i.visual_donts.length) out.push(`• Не показувати: ${i.visual_donts.join('; ')}`);
  out.push('', 'Бренд');
  out.push(`• Про компанію: ${b.overview || 'не визначено'}`);
  if (b.values.length) out.push(`• Цінності: ${b.values.join('; ')}`);
  if (b.tagline) out.push(`• Слоган: ${b.tagline}`);
  out.push('', 'Комунікація');
  out.push(`• Тон: ${c.tone || 'не визначено'}`);
  if (c.taboo_words.length) out.push(`• Заборонені слова: ${c.taboo_words.join(', ')}`);
  if (c.taboo_claims.length) out.push(`• Заборонені твердження: ${c.taboo_claims.join('; ')}`);
  if (c.headline_avoid.length) out.push(`• Яких заголовків уникати: ${c.headline_avoid.join('; ')}`);
  if (dna.rules.length) { out.push('', 'Загальні правила'); dna.rules.forEach((r) => out.push(`• ${r}`)); }
  const open = [...gaps, ...dropped.map((d) => `Відкинуто, бо не підтверджено кодом сайту: ${d}.`)];
  if (open.length) { out.push('', 'Відкриті питання'); open.forEach((o) => out.push(`• ${o}`)); }
  return out.join('\n');
}
