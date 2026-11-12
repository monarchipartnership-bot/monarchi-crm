// The style of a project's creatives (owner, 2026-11-12, step 3.1c): how the words sit on a picture (place, size, plate under them, colour), the formats and the tone of the pictures, the tone of the
// copy. The chain decides it by itself (the scout reads the site and the past ads: ag_project_intel.profile.style) and a person corrects what is wrong (ag_project_intel.style_manual): a manual
// value wins field by field and stays when the scout makes the profile again. Pure code: the server, the card and the tests use it.

export const TEXT_ZONES = ['auto', 'top', 'bottom', 'left', 'right', 'center'];
export const TEXT_SIZES = { small: 0.8, medium: 1, large: 1.2 }; // × the base size of the type (1080 px wide picture: headline 64 px)
export const TEXT_PLATES = ['auto', 'on', 'off'];
export const TEXT_COLORS = ['auto', 'light', 'dark'];
export const RATIOS = ['1:1', '4:5', '9:16', '16:9'];
export const AUTO_TEXT = { zone: 'auto', size: 'auto', plate: 'auto', color: 'auto', margin: 'auto' };
export const DEFAULT_MARGIN = 7; // percent of the width, what the painter uses when the style does not say

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

// size: 'auto' | 'small' | 'medium' | 'large' | a number 40..140 (percent of the base size)
const cleanSize = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(140, Math.max(40, Math.round(v)));
  const s = String(v ?? '').trim().toLowerCase();
  if (/^\d{2,3}$/.test(s)) return Math.min(140, Math.max(40, Number(s)));
  return Object.keys(TEXT_SIZES).includes(s) ? s : 'auto';
};

// margin: 'auto' | a number 3..15 (percent of the width from the edge)
const cleanMargin = (v) => {
  const n = typeof v === 'number' ? v : /^\d{1,2}(\.\d+)?$/.test(String(v ?? '').trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(15, Math.max(3, Math.round(n))) : 'auto';
};

// Any input (the scout's answer or the manual one) → the clean style: only known values, everything else stays «auto» / empty.
export function cleanStyle(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = r.text && typeof r.text === 'object' ? r.text : {};
  const strength = Number(t.plate_strength);
  return {
    text: {
      zone: oneOf(String(t.zone ?? '').toLowerCase(), TEXT_ZONES, 'auto'),
      size: cleanSize(t.size),
      plate: t.plate === true || t.plate === 'yes' ? 'on' : t.plate === false || t.plate === 'no' ? 'off' : oneOf(String(t.plate ?? '').toLowerCase(), TEXT_PLATES, 'auto'),
      color: oneOf(String(t.color ?? '').toLowerCase(), TEXT_COLORS, 'auto'),
      margin: cleanMargin(t.margin),
      ...(Number.isFinite(strength) && strength > 0 ? { plate_strength: Math.min(90, Math.max(10, Math.round(strength))) } : {}),
    },
    image: {
      formats: [...new Set((Array.isArray(r.image?.formats) ? r.image.formats : []).map((f) => String(f).trim()).filter((f) => RATIOS.includes(f)))].slice(0, 4),
      tone: clip(r.image?.tone, 300),
      mood: clip(r.image?.mood, 200),
    },
    copy: { tone: clip(r.copy?.tone, 300) },
  };
}

// What the person changed: only the fields that were really set. A text field set to «auto» is kept too: it takes the decision back from the scout (the picture decides). Unknown values are dropped.
export function cleanManual(raw) {
  const s = cleanStyle(raw);
  const given = raw?.text && typeof raw.text === 'object' ? raw.text : {};
  const out = { text: {}, image: {}, copy: {} };
  Object.entries(s.text).forEach(([k, v]) => {
    if (k === 'plate_strength') { if (v !== undefined) out.text[k] = v; return; }
    if (v !== 'auto') { out.text[k] = v; return; }
    const g = given[k];
    if (g !== undefined && String(g).trim().toLowerCase() === 'auto') out.text[k] = 'auto'; // really typed as auto, not just a default of the cleaning
  });
  if (s.image.formats.length) out.image.formats = s.image.formats;
  if (s.image.tone) out.image.tone = s.image.tone;
  if (s.image.mood) out.image.mood = s.image.mood;
  if (s.copy.tone) out.copy.tone = s.copy.tone;
  return out;
}

export const isEmptyManual = (m) => !m || (!Object.keys(m.text || {}).length && !Object.keys(m.image || {}).length && !Object.keys(m.copy || {}).length);

// auto (the scout) + manual (the person) → the style that counts, with the source of every field: { text: { zone: { value, source } ... }, ..., value: the plain style }
export function effectiveStyle(auto, manual) {
  const a = cleanStyle(auto);
  const m = cleanManual(manual);
  const pick = (autoVal, manualVal) => (manualVal !== undefined ? { value: manualVal, source: 'manual' } : { value: autoVal, source: 'auto' });
  const textKeys = ['zone', 'size', 'plate', 'color', 'margin'];
  const text = Object.fromEntries(textKeys.map((k) => [k, pick(a.text[k], m.text[k])]));
  const strength = pick(a.text.plate_strength, m.text.plate_strength);
  const image = { formats: pick(a.image.formats, m.image.formats), tone: pick(a.image.tone, m.image.tone), mood: pick(a.image.mood, m.image.mood) };
  const copy = { tone: pick(a.copy.tone, m.copy.tone) };
  return {
    text, image, copy, strength,
    value: {
      text: { ...Object.fromEntries(textKeys.map((k) => [k, text[k].value])), ...(strength.value ? { plate_strength: strength.value } : {}) },
      image: { formats: image.formats.value, tone: image.tone.value, mood: image.mood.value },
      copy: { tone: copy.tone.value },
    },
  };
}

// The style of the text → what the painter of the words needs: { zoneLock, scale, plate, plateAlpha, ink }. null/'auto' fields stay with the picture to decide.
export function composerOptions(text = AUTO_TEXT) {
  const t = { ...AUTO_TEXT, ...(text || {}) };
  const size = t.size;
  const scale = typeof size === 'number' ? size / 100 : TEXT_SIZES[size] || null;
  return {
    zoneLock: TEXT_ZONES.includes(t.zone) && t.zone !== 'auto' ? t.zone : null,
    margin: typeof t.margin === 'number' ? t.margin / 100 : null,
    scale,
    plate: t.plate === 'on' || t.plate === 'off' ? t.plate : 'auto',
    plateAlpha: t.plate === 'on' ? (t.plate_strength ? t.plate_strength / 100 : 0.55) : null,
    ink: t.color === 'light' || t.color === 'dark' ? t.color : 'auto',
  };
}

const ZONE_NAME = { top: 'at the top', bottom: 'at the bottom', left: 'on the left', right: 'on the right', center: 'in the centre' };
// The lines the agents read (a block of their prompt): empty when nothing is decided.
export function styleBlock(style) {
  const s = cleanStyle(style);
  const lines = [
    s.text.zone !== 'auto' && `Words on the creatives sit ${ZONE_NAME[s.text.zone]}: keep that part of every picture calm and empty, no busy detail and no logo there.`,
    s.text.plate === 'on' && 'The words are set on a plate (a dark or light veil under them).',
    s.text.plate === 'off' && 'No plate under the words: the picture itself must be calm where the words go.',
    s.text.size !== 'auto' && `Type size of the words: ${typeof s.text.size === 'number' ? `${s.text.size}% of the standard` : s.text.size}.`,
    s.image.formats.length && `Formats used for this client: ${s.image.formats.join(', ')}.`,
    s.image.tone && `Tone of the pictures (colour, light): ${s.image.tone}`,
    s.image.mood && `Mood: ${s.image.mood}`,
    s.copy.tone && `Tone of the copy: ${s.copy.tone}`,
  ].filter(Boolean);
  return lines.length ? { title: 'Стиль оформлення цього завдання (рішення розвідки для клієнта, поверх нього налаштування завдання)', text: lines.join('\n') } : null;
}

const ZONE_UA = { auto: 'за картинкою', top: 'зверху', bottom: 'знизу', left: 'зліва', right: 'справа', center: 'по центру' };
const SIZE_UA = { auto: 'стандартний', small: 'менший', medium: 'середній', large: 'більший' };
const PLATE_UA = { auto: 'за картинкою', on: 'з підкладкою', off: 'без підкладки' };
const COLOR_UA = { auto: 'за картинкою', light: 'світлий', dark: 'темний' };
// The card of the client shows the style that counts, line by line, with where each value came from (the scout or a person): → [{ label, value, source }] (only the decided ones plus the text rows).
export function styleRows(eff) {
  if (!eff || !eff.text) return [];
  const t = eff.text;
  const size = (v) => (typeof v === 'number' ? `${v}%` : SIZE_UA[v] || v);
  const rows = [
    { label: 'Текст на картинці: місце', value: ZONE_UA[t.zone.value] || t.zone.value, source: t.zone.source },
    { label: 'Текст: розмір', value: size(t.size.value), source: t.size.source },
    { label: 'Текст: підкладка', value: PLATE_UA[t.plate.value] || t.plate.value, source: t.plate.source },
    { label: 'Текст: колір', value: COLOR_UA[t.color.value] || t.color.value, source: t.color.source },
    { label: 'Текст: відступ від краю', value: typeof t.margin.value === 'number' ? `${t.margin.value}%` : 'стандартний', source: t.margin.source },
  ];
  if (eff.image?.formats?.value?.length) rows.push({ label: 'Формати', value: eff.image.formats.value.join(', '), source: eff.image.formats.source });
  if (eff.image?.tone?.value) rows.push({ label: 'Тон картинок', value: eff.image.tone.value, source: eff.image.tone.source });
  if (eff.image?.mood?.value) rows.push({ label: 'Настрій', value: eff.image.mood.value, source: eff.image.mood.source });
  if (eff.copy?.tone?.value) rows.push({ label: 'Тон текстів', value: eff.copy.tone.value, source: eff.copy.tone.source });
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------- the editor of the style (step 3.1d)
const sizeNumber = (v) => (typeof v === 'number' ? v : TEXT_SIZES[v] ? Math.round(TEXT_SIZES[v] * 100) : 'auto');

// The values the editor shows: the scout's decision with the manual one over it. → { zone, size: 'auto'|number, plate, strength, color, margin: 'auto'|number }
export function draftFromStyle(autoText = AUTO_TEXT, manualText = {}) {
  const m = { ...AUTO_TEXT, ...(autoText || {}), ...(manualText || {}) };
  return { zone: m.zone, size: sizeNumber(m.size), plate: m.plate, strength: m.plate_strength || 55, color: m.color, margin: m.margin };
}

// What a person's draft changes against the scout's decision: only the fields that differ, so a value put back to the scout's own is no longer «manual». → the manual text style (clean order)
export function manualFromDraft(draft, autoText = AUTO_TEXT) {
  const a = { ...AUTO_TEXT, ...(autoText || {}) };
  const out = {};
  if (draft.zone !== a.zone) out.zone = draft.zone;
  if (draft.size !== sizeNumber(a.size)) out.size = draft.size;
  if (draft.plate !== a.plate) out.plate = draft.plate;
  if (draft.color !== a.color) out.color = draft.color;
  if (draft.margin !== a.margin) out.margin = draft.margin;
  if (draft.plate === 'on' && draft.strength !== (a.plate_strength || 55)) out.plate_strength = draft.strength;
  return cleanManual({ text: out }).text;
}

// The pictures the editor shows its preview on: the clean pictures of the newest creatives (with their own headline and button), then the photos from the site. cockpit: buildCockpit's result.
export function styleSamplesOf(cockpit, limit = 6) {
  const out = []; const seen = new Set();
  const add = (s) => { if (s.url && !seen.has(s.url) && out.length < limit) { seen.add(s.url); out.push(s); } };
  [...(cockpit?.requests || [])].sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || ''))).forEach((r) => {
    (r.items || []).forEach((i) => add({ id: `c${i.id}`, url: i.rawUrl, label: i.conceptName || 'Креатив', headline: i.copy?.headline || '', cta: i.copy?.cta || '' }));
  });
  (cockpit?.intel?.photos || []).filter((p) => p.use !== 'logo').forEach((p, n) => add({ id: `p${n}`, url: p.url, label: p.label || 'Фото з сайту', headline: '', cta: '' }));
  return out;
}
