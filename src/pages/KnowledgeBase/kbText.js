// Presentation helpers for the plain-text articles. Nothing here re-authors an article: it only splits, trims and measures what is written.

// blank-line-separated blocks; inside a block a short "Label:" first line becomes its heading, a run of "- item" lines becomes a list
export function parseBlocks(content) {
  return (content || '')
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      let heading = null;
      let rest = lines;
      if (lines.length > 1 && lines[0].endsWith(':') && lines[0].length < 80 && !lines[0].startsWith('-')) {
        heading = lines[0].slice(0, -1);
        rest = lines.slice(1);
      }
      const isList = rest.length > 0 && rest.every((l) => l.startsWith('- '));
      return { heading, isList, items: isList ? rest.map((l) => l.slice(2).trim()) : null, text: isList ? null : rest.join('\n') };
    });
}

export function readMinutes(content) {
  const words = (content || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return null; }
}

// the first sentences of an article without list markers: the preview on cards
export function preview(content, max = 150) {
  const flat = (content || '').replace(/^- /gm, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max).replace(/\s+\S*$/, '') + '…' : flat;
}

// the text around the first match of the search query, for the search results
export function snippetAround(content, query) {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return preview(content, 160);
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + query.length + 100);
  return (start > 0 ? '…' : '') + content.slice(start, end).replace(/\s+/g, ' ').trim() + (end < content.length ? '…' : '');
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
