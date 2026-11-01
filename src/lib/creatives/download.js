// Taking the ready creatives out of the CRM WITHOUT losing quality: the file that is saved is the very file that sits in our storage (the bytes of the picture
// as the model made it, or the PNG with the words put over it), it is never re-drawn, re-sized or re-compressed on the way. One file or a ZIP of many (the ZIP
// stores the files as they are, without compressing them again).

const clean = (v) => String(v || '').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const extOf = (url, type = '') => {
  const t = String(type).toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('webp')) return 'webp';
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('webm')) return 'webm';
  const m = String(url || '').split('?')[0].match(/\.([a-z0-9]{2,4})$/i);
  return m ? m[1].toLowerCase() : 'png';
};

// The name of the file a person gets: project, concept, format, number of the creative.
export function fileNameOf(item, { project = '', ext = null } = {}) {
  const base = [clean(project), clean(item.conceptName || item.concept_name || item.concept_key), clean(String(item.ratio || '').replace(':', 'x')), `n${item.id}`].filter(Boolean).join('_');
  return `${base}.${ext || extOf(item.downloadUrl || item.url)}`;
}

async function fetchBlob(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Файл недоступний (${res.status}).`);
  return { blob: await res.blob(), type: res.headers.get('content-type') || '' };
}

function save(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}

export async function downloadOne(item, { project = '' } = {}) {
  const url = item.downloadUrl || item.url;
  if (!url) throw new Error('У цього креативу ще немає файлу.');
  const { blob, type } = await fetchBlob(url);
  save(blob, fileNameOf(item, { project, ext: extOf(url, type) }));
}

// The archive itself (no page needed, so it is tested in Node): the files go in as they are, the names stay unique inside.
export async function buildZip(items, { project = '', fetchFn = fetch } = {}) {
  const list = items.filter((i) => i.downloadUrl || i.url);
  if (!list.length) throw new Error('Немає готових файлів для завантаження.');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set();
  let done = 0;
  const queue = [...list];
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const url = item.downloadUrl || item.url;
      const { blob, type } = await fetchBlob(url, fetchFn);
      let name = fileNameOf(item, { project, ext: extOf(url, type) });
      while (used.has(name)) name = name.replace(/(\.[a-z0-9]+)$/i, '_1$1');
      used.add(name);
      zip.file(name, await blob.arrayBuffer(), { compression: 'STORE' }); // the bytes as they came
      done += 1;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (done !== list.length) throw new Error('Не всі файли вдалося завантажити.');
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return { blob: new Blob([bytes], { type: 'application/zip' }), count: done, names: [...used] };
}

// items: the creatives that have a file. One ZIP saved on the computer.
export async function downloadZip(items, { project = '', zipName = 'creatives' } = {}) {
  const { blob, count } = await buildZip(items, { project });
  save(blob, `${clean(zipName) || 'creatives'}.zip`);
  return count;
}
