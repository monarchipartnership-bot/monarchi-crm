// Pure edits of a deck (every function returns a new deck; nothing mutates the old one,
// so undo / redo is just keeping the previous object).
import { text } from './textModel';

const cloneDeep = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

const splitId = (id) => { const i = id.indexOf(':'); return [id.slice(0, i), id.slice(i + 1)]; };

export function getBlockText(deck, blockId) {
  const [head, key] = splitId(blockId);
  if (head === 'meta') return deck.meta[key];
  return deck.slides.find((s) => s.id === head)?.data?.[key];
}

// Rich block (a Text) or one of the shared fields (client, period).
export function setBlockText(deck, blockId, value) {
  const [head, key] = splitId(blockId);
  if (head === 'meta') return { ...deck, meta: { ...deck.meta, [key]: value } };
  return { ...deck, slides: deck.slides.map((s) => (s.id === head ? { ...s, data: { ...s.data, [key]: value } } : s)) };
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  const root = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const k = Number.isNaN(Number(parts[i])) ? parts[i] : Number(parts[i]);
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
    cur = cur[k];
  }
  const last = Number.isNaN(Number(parts[parts.length - 1])) ? parts[parts.length - 1] : Number(parts[parts.length - 1]);
  cur[last] = value;
  return root;
}

// Plain cell: id is "slideId:path" (e.g. "s1:rows.2.cells.0").
export function setCell(deck, cellId, value) {
  const [sid, path] = splitId(cellId);
  return { ...deck, slides: deck.slides.map((s) => (s.id === sid ? { ...s, data: setPath(s.data, path, value) } : s)) };
}

export const slideIndex = (deck, id) => deck.slides.findIndex((s) => s.id === id);

export function insertSlide(deck, afterId, slide) {
  const i = slideIndex(deck, afterId);
  const at = i < 0 ? deck.slides.length : i + 1;
  return { ...deck, slides: [...deck.slides.slice(0, at), slide, ...deck.slides.slice(at)] };
}

// The last remaining slide can't be removed.
export function removeSlide(deck, id) {
  if (deck.slides.length <= 1) return deck;
  return { ...deck, slides: deck.slides.filter((s) => s.id !== id) };
}

export function moveSlide(deck, id, to) {
  const from = slideIndex(deck, id);
  if (from < 0 || to < 0 || to >= deck.slides.length || to === from) return deck;
  const slides = [...deck.slides];
  const [s] = slides.splice(from, 1);
  slides.splice(to, 0, s);
  return { ...deck, slides };
}

export function toggleHidden(deck, id) {
  const visible = deck.slides.filter((s) => !s.hidden).length;
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      if (s.id !== id) return s;
      // At least one slide has to stay visible.
      if (!s.hidden && visible <= 1) return s;
      return { ...s, hidden: !s.hidden };
    }),
  };
}

export function duplicateSlide(deck, id, newId) {
  const i = slideIndex(deck, id);
  if (i < 0) return deck;
  const copy = { ...cloneDeep(deck.slides[i]), id: newId, hidden: false };
  return { ...deck, slides: [...deck.slides.slice(0, i + 1), copy, ...deck.slides.slice(i + 1)] };
}

export const setMeta = (deck, patch) => ({ ...deck, meta: { ...deck.meta, ...patch } });

// ----- Tables ------------------------------------------------------------------------------------
// What a table slide can do in the inspector: add / remove a row or a column.
export function tableInfo(slide) {
  switch (slide.type) {
    case 'campaignTable': return { rows: slide.data.rows.length, cols: slide.data.columns.length, canCols: true };
    case 'table': return { rows: slide.data.rows.length, cols: slide.data.header.length, canCols: true };
    case 'dynamicsTable': return { rows: slide.data.rows.length, cols: 4, canCols: false };
    case 'metricslist': return { rows: slide.data.items.length, cols: 0, canCols: false, label: 'метрик' };
    case 'kpigrid': return { rows: slide.data.cards.length, cols: 0, canCols: false, label: 'карток' };
    default: return null;
  }
}

export function tableAddRow(slide) {
  const d = slide.data;
  switch (slide.type) {
    case 'campaignTable': return { ...d, rows: [...d.rows, { label: '', cells: d.columns.map(() => '') }] };
    case 'table': return { ...d, rows: [...d.rows, d.header.map(() => '')] };
    case 'dynamicsTable': return { ...d, rows: [...d.rows, { label: '', prev: '', change: '', cur: '' }] };
    case 'metricslist': return { ...d, items: [...d.items, { label: '', value: '', delta: '' }] };
    case 'kpigrid': return { ...d, cards: [...d.cards, { label: '', value: '', delta: '' }] };
    default: return d;
  }
}

export function tableRemoveRow(slide) {
  const d = slide.data;
  switch (slide.type) {
    case 'campaignTable': case 'table': case 'dynamicsTable': return d.rows.length > 1 ? { ...d, rows: d.rows.slice(0, -1) } : d;
    case 'metricslist': return d.items.length > 1 ? { ...d, items: d.items.slice(0, -1) } : d;
    case 'kpigrid': return d.cards.length > 1 ? { ...d, cards: d.cards.slice(0, -1) } : d;
    default: return d;
  }
}

export function tableAddCol(slide) {
  const d = slide.data;
  if (slide.type === 'campaignTable') return { ...d, columns: [...d.columns, ''], rows: d.rows.map((r) => ({ ...r, cells: [...r.cells, ''] })) };
  if (slide.type === 'table') return { ...d, header: [...d.header, ''], rows: d.rows.map((r) => [...r, '']) };
  return d;
}

export function tableRemoveCol(slide) {
  const d = slide.data;
  if (slide.type === 'campaignTable') return d.columns.length > 1 ? { ...d, columns: d.columns.slice(0, -1), rows: d.rows.map((r) => ({ ...r, cells: r.cells.slice(0, -1) })) } : d;
  if (slide.type === 'table') return d.header.length > 1 ? { ...d, header: d.header.slice(0, -1), rows: d.rows.map((r) => r.slice(0, -1)) } : d;
  return d;
}

export function updateSlideData(deck, id, fn) {
  return { ...deck, slides: deck.slides.map((s) => (s.id === id ? { ...s, data: fn(s) } : s)) };
}

export { text };

// A picture next to the text (logo of the client, a screenshot). Only text-style slides take one.
export const IMAGE_TYPES = ['paragraph', 'bullets', 'agenda'];
export const canHaveImage = (slide) => IMAGE_TYPES.includes(slide.type);

export function setSlideImage(deck, id, image) {
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      if (s.id !== id) return s;
      const { image: _old, ...rest } = s;
      return image ? { ...rest, image } : rest;
    }),
  };
}
