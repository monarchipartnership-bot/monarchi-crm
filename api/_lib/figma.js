// Reads a Figma file for the creative strategist: the top frames as pictures and the style of the file (colours, fonts, the words used). Read-only: the
// REST API with a personal access token (env FIGMA_TOKEN, scope file_content:read). The token owner must be able to open the file. Everything the
// network provides is handed in (fetchImpl), so tests run it with stand-ins.
const API = 'https://api.figma.com';
const FRAME_TYPES = new Set(['FRAME', 'COMPONENT']);

export const figmaToken = (env = process.env) => String(env.FIGMA_TOKEN || '').trim();

// https://www.figma.com/design/<key>/<name>?node-id=12-34 (also /file/, /proto/, /board/, /make/) → { key, nodeId } or null.
export function figmaFileKey(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (!/(^|\.)figma\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(?:design|file|proto|board|make)\/([A-Za-z0-9]+)/);
  if (!m) return null;
  const node = u.searchParams.get('node-id');
  return { key: m[1], nodeId: node ? node.replace('-', ':') : null };
}

const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

// Colours, fonts and the words of a frame: counted over its visible nodes (the first 4000 only).
function collectStyle(root, acc) {
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 4000) {
    const n = stack.pop();
    if (!n || n.visible === false) continue;
    seen += 1;
    for (const f of n.fills || []) {
      if (f.type === 'SOLID' && f.visible !== false && f.color && (f.opacity ?? 1) > 0.4) acc.colors[hex(f.color)] = (acc.colors[hex(f.color)] || 0) + 1;
    }
    if (n.type === 'TEXT') {
      const s = n.style || {};
      if (s.fontFamily) { const k = `${s.fontFamily}${s.fontWeight ? ` ${s.fontWeight}` : ''}`; acc.fonts[k] = (acc.fonts[k] || 0) + 1; }
      const t = String(n.characters || '').replace(/\s+/g, ' ').trim();
      if (t && acc.texts.length < 12) acc.texts.push(t.slice(0, 80));
    }
    for (const c of n.children || []) stack.push(c);
  }
}

// The frames among the children of a page: frames and components, and the frames inside sections (one level).
function topFrames(children = [], max = 4) {
  const out = [];
  for (const c of children || []) {
    if (out.length >= max) break;
    if (FRAME_TYPES.has(c.type)) out.push({ id: c.id, name: c.name || '' });
    else if (c.type === 'SECTION') for (const f of c.children || []) if (FRAME_TYPES.has(f.type) && out.length < max) out.push({ id: f.id, name: f.name || '' });
  }
  return out;
}

const top = (counts, n) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);

class FigmaError extends Error {}
const explain = (status) => (status === 403 ? 'Figma не пускає: токен не має доступу до цього файлу (власник токена має вміти його відкрити).' : status === 404 ? 'Файл не знайдено: перевірте посилання.' : status === 429 ? 'Figma просить зачекати (ліміт запитів). Спробуйте пізніше.' : status === 401 ? 'Токен Figma недійсний або прострочений.' : `Figma відповіла помилкою ${status}.`);

// → { ok: true, name, frames: [{ id, name, imageUrl }], colors: [[hex, uses]], fonts: [[font, uses]], texts } or { ok: false, noToken?, error }
export async function readFigma(url, { token, fetchImpl = fetch, maxFrames = 4 } = {}) {
  const ref = figmaFileKey(url);
  if (!ref) return { ok: false, error: 'Це не схоже на посилання на файл Figma.' };
  if (!token) return { ok: false, noToken: true, error: 'Токен Figma не налаштований на сервері (FIGMA_TOKEN): макет не прочитано.' };
  const get = async (path) => {
    const r = await fetchImpl(`${API}${path}`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new FigmaError(explain(r.status));
    return r.json();
  };
  try {
    let frames = [];
    if (ref.nodeId) {
      // a link to a node: a frame is read as it is, a page (or a section) of the file is read by its top frames
      const part = await get(`/v1/files/${ref.key}/nodes?ids=${encodeURIComponent(ref.nodeId)}&depth=2`);
      const doc = part.nodes?.[ref.nodeId]?.document;
      if (!doc) return { ok: false, error: 'Вузол із посилання не знайдено у файлі Figma.' };
      frames = doc.type === 'CANVAS' || doc.type === 'SECTION' ? topFrames(doc.children, maxFrames) : [{ id: ref.nodeId, name: doc.name || '' }];
    } else {
      const file = await get(`/v1/files/${ref.key}?depth=2`);
      for (const page of file.document?.children || []) frames.push(...topFrames(page.children, maxFrames - frames.length));
    }
    if (!frames.length) return { ok: false, error: 'У файлі Figma немає кадрів верхнього рівня.' };
    const ids = encodeURIComponent(frames.map((f) => f.id).join(','));
    const [nodes, images] = await Promise.all([get(`/v1/files/${ref.key}/nodes?ids=${ids}`), get(`/v1/images/${ref.key}?ids=${ids}&format=png&scale=1`)]);
    const acc = { colors: {}, fonts: {}, texts: [] };
    frames = frames.map((f) => {
      const doc = nodes.nodes?.[f.id]?.document;
      if (doc) collectStyle(doc, acc);
      return { id: f.id, name: f.name || doc?.name || '', imageUrl: images.images?.[f.id] || null };
    });
    return { ok: true, name: nodes.name || '', frames, colors: top(acc.colors, 8), fonts: top(acc.fonts, 5), texts: acc.texts };
  } catch (e) {
    return { ok: false, error: e instanceof FigmaError ? e.message : `Не вдалося прочитати Figma: ${String(e?.message || e).slice(0, 160)}` };
  }
}

// The text the strategist reads about the file.
export function figmaText(res) {
  if (!res?.ok) return res?.error || 'Макет Figma не прочитано.';
  return [
    `Файл: ${res.name || '(без назви)'}`,
    `Кадри (їх картинки додано нижче): ${res.frames.map((f) => f.name || f.id).join(', ')}`,
    res.colors.length ? `Кольори (за частотою): ${res.colors.map(([h]) => h).join(', ')}` : '',
    res.fonts.length ? `Шрифти: ${res.fonts.map(([f]) => f).join(', ')}` : '',
    res.texts.length ? `Фрагменти текстів із макета (для тону): ${res.texts.map((t) => `«${t}»`).join('; ')}` : '',
  ].filter(Boolean).join('\n');
}
