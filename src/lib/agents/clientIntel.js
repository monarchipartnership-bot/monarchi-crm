// «Розвідник» of the creative team (owner, 2026-11-12): before the first creative one agent studies the client: the site (what it sells, how it looks and sounds) and the ads that
// already ran in the cabinet (what worked). The result is one profile per project that the strategist, the brief writer, the copywriter and the maker read, so the person is not asked
// for what the site already shows, and the briefs match the real products. Pure code (no network, no React): the server runner (api/_lib/creativeScout.js), the card and the tests use it.

export const SCOUT_ROLE = 'creative_scout';
export const INTEL_STALE_DAYS = 30; // an older profile is made again in the background; the work does not wait for it
export const MAX_SITE_PAGES = 8; // the home page and up to seven pages of the catalogue
export const MAX_SITE_PHOTOS = 8; // the pictures of the site the model looks at (and may mark as references for the maker)
export const MAX_ADS = 6; // the best ads of the cabinet it looks at

import { cleanStyle, effectiveStyle, styleBlock } from './projectStyle.js';

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const asList = (v) => (Array.isArray(v) ? v : []);
const DAY = 86400000;

// → 'none' | 'running' | 'fresh' | 'stale' | 'failed'. A profile that is only partly filled (the site was closed, no cabinet) still counts as made: it says what is missing itself.
export function intelState(row, now = new Date()) {
  if (!row) return 'none';
  if (row.status === 'running') return now.getTime() - new Date(row.updated_at || 0).getTime() > 20 * 60000 ? 'failed' : 'running'; // a run that never reported back is not still running
  if (row.status === 'failed') return 'failed';
  const age = (now.getTime() - new Date(row.updated_at || 0).getTime()) / DAY;
  return age > INTEL_STALE_DAYS ? 'stale' : 'fresh';
}

// ----------------------------------------------------------------------------------------------------------------------------------------------- reading a shop
const SHOP_WORDS = /shop|store|catalog|catalogue|product|products|collection|collections|categor|item|goods|buy|jewel|ring|каталог|товар|магазин|колекц|категор|продукц|about|about-us|brand|service|pricing|про-нас|про нас|послуг|цін/i;
const SKIP_PATH = /\/(cart|checkout|account|login|signin|register|wishlist|search|policy|privacy|terms|cookie|returns|shipping|contact|blog\/tag|tag|feed|wp-json|wp-admin)\b/i;

// Which pages besides the home page show what the client sells: the shop, its categories and a few products, then «about». → [url]
export function pickShopPages(links, homeUrl, limit = MAX_SITE_PAGES - 1) {
  const home = new URL(homeUrl);
  const host = home.hostname.replace(/^www\./, '');
  const seen = new Set([home.toString().replace(/\/$/, '')]);
  const scored = [];
  for (const l of links || []) {
    let u;
    try { u = new URL(l.url); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== host || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js|xml)$/i.test(u.pathname) || u.pathname === '/' || u.search.length > 40 || SKIP_PATH.test(u.pathname)) continue;
    const key = (u.origin + u.pathname).replace(/\/$/, '');
    if (seen.has(key)) continue;
    const hit = SHOP_WORDS.test(u.pathname) || SHOP_WORDS.test(l.label || '');
    if (!hit) continue;
    seen.add(key);
    const depth = u.pathname.split('/').filter(Boolean).length;
    // a category (short path) tells more about the range than a single product, and «about» says who the client is: take them first, then products
    const score = (/about|brand|про-нас|про нас/i.test(u.pathname + l.label) ? 2 : 0) + (depth <= 2 ? 3 : 1) + (/shop|catalog|collection|каталог|колекц/i.test(u.pathname) ? 2 : 0);
    scored.push({ url: u.origin + u.pathname, score, order: scored.length });
  }
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((x) => x.url);
}

const NOT_A_PHOTO = /(^|[\W_])(icon|sprite|pixel|avatar|flag|payment|arrow|star|rating|badge|placeholder|spinner|loader|1x1|tracking|emoji|social|favicon|visa|mastercard|paypal)([\W_]|$)/i;
// The pictures of one page → [{ url, alt, logo }]: the main picture of the page, the logo and the photos in the text; never icons, counters, flags or files that are not pictures.
export function imagesOf(html, baseUrl) {
  const src = String(html || '');
  const out = [];
  const seen = new Set();
  const add = (raw, alt = '', logoHint = false) => {
    if (!raw || /^data:/i.test(raw)) return;
    let u;
    try { u = new URL(String(raw).trim().split(/\s+/)[0], baseUrl); } catch { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    const path = u.pathname.toLowerCase();
    if (/\.(svg|gif|ico)$/.test(path) || NOT_A_PHOTO.test(path + ' ' + alt)) return;
    const key = u.origin + u.pathname;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: u.toString().slice(0, 600), alt: clip(alt, 140), logo: logoHint || /logo|логотип/i.test(path + ' ' + alt) });
  };
  const og = src.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || src.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og) add(og[1], 'main picture of the page');
  for (const m of src.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n) => tag.match(new RegExp(`\\b${n}=["']([^"']*)["']`, 'i'))?.[1] || '';
    const w = Number(attr('width')) || 0;
    if (w && w < 120) continue; // a small picture is an icon or a thumbnail
    const srcset = attr('srcset') || attr('data-srcset');
    const best = srcset ? srcset.split(',').map((s) => s.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0]?.[0] : '';
    add(best || attr('data-src') || attr('data-lazy-src') || attr('src'), attr('alt'));
    if (out.length >= 40) break;
  }
  return out;
}

// Every page's pictures together, the logo first, then the main pictures; each address once. → at most `limit` { url, alt, logo, page }
export function pickPhotos(pages, limit = MAX_SITE_PHOTOS) {
  const all = [];
  const seen = new Set();
  for (const p of pages || []) for (const im of p.images || []) {
    const key = im.url.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ ...im, page: p.url });
  }
  const logo = all.find((x) => x.logo);
  const rest = all.filter((x) => !x.logo);
  // the pictures of the deeper pages (products) go before the home page's banners: they show the goods, not the mood
  return [...(logo ? [logo] : []), ...rest].slice(0, limit);
}

// ----------------------------------------------------------------------------------------------------------------------------------------------- the profile
// The model's answer → the profile the card and the other agents use. Missing parts stay empty: nothing is invented here.
export function parseIntel(json, { photos = [], ads = [] } = {}) {
  const j = json && typeof json === 'object' ? json : {};
  const list = (v, n, k = 200) => asList(v).map((x) => clip(typeof x === 'string' ? x : x?.name || x?.text, k)).filter(Boolean).slice(0, n);
  const products = asList(j.products).map((p) => ({ name: clip(p?.name, 120), category: clip(p?.category, 80), price: clip(p?.price, 40), note: clip(p?.note, 200) })).filter((p) => p.name).slice(0, 24);
  const picks = asList(j.photo_picks).map((p) => ({ n: Number(p?.n), label: clip(p?.label, 160), use: p?.use === 'logo' ? 'logo' : p?.use === 'skip' ? 'skip' : 'product' }))
    .filter((p) => Number.isInteger(p.n) && p.n >= 1 && p.n <= photos.length && p.use !== 'skip');
  const refs = [];
  const used = new Set();
  for (const p of picks) {
    if (used.has(p.n)) continue;
    used.add(p.n);
    refs.push({ url: photos[p.n - 1].url, label: p.label || photos[p.n - 1].alt || 'Фото з сайту', use: p.use, page: photos[p.n - 1].page || '' });
  }
  return {
    summary: clip(j.summary, 1500),
    business: clip(j.business, 900),
    products,
    categories: list(j.categories, 12, 80),
    price_range: clip(j.price_range, 160),
    tone: clip(j.tone, 500),
    visual_style: clip(j.visual_style, 900),
    ads: { worked: list(j.ads?.worked, 8, 240), avoid: list(j.ads?.avoid, 8, 240), formats: list(j.ads?.formats, 6, 120), notes: clip(j.ads?.notes, 600), seen: ads.length },
    gaps: list(j.gaps, 8, 240),
    photos: refs,
    style: cleanStyle(j.style), // the style of the creatives the scout read from the site and the past ads (a person corrects it: style_manual)
  };
}

// What the other agents read (a block of their prompt). `row` is ag_project_intel.
export function intelBlock(row, now = new Date()) {
  if (!row || !['ready', 'partial'].includes(row.status)) return null;
  const p = row.profile || {};
  const days = Math.max(0, Math.floor((now.getTime() - new Date(row.updated_at || now).getTime()) / DAY));
  const lines = [
    p.summary && `Summary: ${p.summary}`,
    p.business && `Business: ${p.business}`,
    asList(p.categories).length && `Categories: ${p.categories.join(', ')}`,
    asList(p.products).length && `Products seen on the site:\n${p.products.map((x) => `- ${x.name}${x.category ? ` (${x.category})` : ''}${x.price ? `, ${x.price}` : ''}${x.note ? `: ${x.note}` : ''}`).join('\n')}`,
    p.price_range && `Price range: ${p.price_range}`,
    p.tone && `Tone of voice: ${p.tone}`,
    p.visual_style && `Visual style: ${p.visual_style}`,
    asList(p.ads?.worked).length && `What worked in the client's past ads:\n${p.ads.worked.map((x) => `- ${x}`).join('\n')}`,
    asList(p.ads?.avoid).length && `What did not work / avoid:\n${p.ads.avoid.map((x) => `- ${x}`).join('\n')}`,
    asList(p.ads?.formats).length && `Formats used: ${p.ads.formats.join(', ')}`,
    p.ads?.notes && `Notes on the ads: ${p.ads.notes}`,
    asList(p.photos).length && `Product photos taken from the site (the maker uses them as references): ${p.photos.length}`,
    asList(p.gaps).length && `Not learned (say so, do not invent): ${p.gaps.join('; ')}`,
    (() => { const sb = styleBlock(effectiveStyle(p.style, row.style_manual).value); return sb ? `${sb.title}:
${sb.text}` : ''; })(),
  ].filter(Boolean);
  return { title: `Профіль клієнта від Розвідника (${days ? `${days} дн. тому` : 'сьогодні'}${row.status === 'partial' ? ', неповний' : ''})`, text: lines.join('\n') };
}

// Ukrainian plural: 1 товар, 2 товари, 5 товарів
const many = (n, one, few, lots) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : lots}`;

// The short line of the card: what the scout found.
export function intelSummaryLine(row) {
  if (!row || !['ready', 'partial'].includes(row.status)) return '';
  const p = row.profile || {};
  const bits = [asList(p.products).length ? many(p.products.length, 'товар', 'товари', 'товарів') : '', asList(p.categories).length ? many(p.categories.length, 'категорія', 'категорії', 'категорій') : '', p.ads?.seen ? `${many(p.ads.seen, 'реклама', 'реклами', 'реклам')} з кабінету` : '', asList(p.photos).length ? `${many(p.photos.length, 'фото', 'фото', 'фото')} з сайту` : ''].filter(Boolean);
  return bits.join(', ');
}

// ----------------------------------------------------------------------------------------------------------------------------------------------- the prompts
export const SCOUT_PROMPT = `You are the scout of the creative department of a performance marketing agency. Before any creative is made for a client you study the client's public site and the ads that already ran in the client's ad account, and you write ONE profile that the strategist, the brief writer, the copywriter and the creative maker will read. You are given the text of several pages of the site, numbered pictures of the site, screenshots of the client's best past ads with their numbers, and the client's project card. Describe what you really see and read: the products and categories, the prices, the tone of voice, the look (colours, type of photography, composition, mood), which of the past ads worked (look at the numbers) and why they might have, and what you could not learn. Judge the pictures of the site yourself: choose the ones that show a product cleanly enough to serve as a reference for generating new creatives, mark the logo, and skip banners with text, icons, people-only photos and anything unrelated. Never invent a product, a price, a claim or a result that is not in the material.`;

export const SCOUT_CONTRACT = [
  'The answer is machine-read JSON: escape every double quote inside a text as \\" or use single quotes; write each line break as the two characters backslash and n; no trailing commas; no text before or after the JSON object.',
  'Answer with ONE JSON object: {"summary":"4-7 sentences in Ukrainian: who the client is, what it sells, to whom, how it positions itself","business":"one paragraph in Ukrainian: the business model and the main offer","categories":["main categories of the range"],"products":[{"name":"","category":"","price":"as written on the site, with currency","note":"what is special, or empty"}],"price_range":"e.g. from 120 to 940 EUR","tone":"the tone of voice of the site and the ads","visual_style":"colours, photography, composition, mood, what the brand imagery looks like","ads":{"worked":["what the best ads did, with the numbers you saw"],"avoid":["what to avoid, from weak or missing results"],"formats":["static image, carousel, video..."],"notes":""},"photo_picks":[{"n":1,"use":"product|logo|skip","label":"what is on the picture"}],"style":{"text":{"zone":"top|bottom|left|right|center|auto","size":"small|medium|large|auto","plate":"yes|no|auto"},"image":{"formats":["1:1","4:5","9:16","16:9"],"tone":"colour and light of the pictures that suit this client","mood":"the mood"},"copy":{"tone":"the tone of the ad copy"}},"gaps":["what you could not learn and why (closed site, no catalogue in the HTML, no cabinet)"]}.',
  '"style" is what the creatives of THIS client should look like, judged from the ads that worked and from the site: where the words sit in the best ads (zone), whether they sit on a plate (plate), how big the type is (size), which formats those ads use, the colour and light of the pictures, the tone of the copy. Say "auto" for a field you cannot judge; never guess a format that no ad used.',
  'At most 24 products, the ones that look the most representative. "photo_picks" refers to the numbered SITE pictures only (n is the number in brackets before the picture); list only the pictures worth keeping (product or logo). When a part of the material is missing (the site could not be read, there is no ad account), say so in "gaps" and leave that part empty: never guess.',
].join('\n');
