// The text of a file the manager attaches to the brief, read by CODE (so the quotes of the facts can be checked against it): a plain text file, markdown, csv and a Word file (.docx).
// A .docx is a zip: only the part word/document.xml is read, with the built-in zlib and no dependency. A PDF is NOT read here: the model reads it itself (api/brief-extract.js).
import zlib from 'node:zlib';

export const TEXT_TYPES = /^text\/(plain|markdown|csv)$|\.(txt|md|csv)$/i;
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const isDocx = (name, type) => type === DOCX_TYPE || /\.docx$/i.test(String(name || ''));
export const isPdf = (name, type) => type === 'application/pdf' || /\.pdf$/i.test(String(name || ''));

// → the bytes of one file of a zip, or null. Reads the central directory (the end of the archive), then the local header; stored and deflated entries.
export function zipEntry(buf, wanted) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      if (buf.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
export function docxText(buf) {
  const xml = zipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('Не вдалося прочитати Word-файл. Збережіть його як .docx, .txt або PDF.');
  return xml.toString('utf8')
    .replace(/<\/w:p>\s*<\/w:tc>/g, ' | ').replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n').replace(/<\/w:tc>/g, ' | ')
    .replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
