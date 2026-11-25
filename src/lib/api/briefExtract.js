import { authedPost } from '../adAccounts';

export const MAX_FILES = 3;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // the server takes a body of about 4.5 MB, and a file grows by a third in base64
export const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown';

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error(`Не вдалося прочитати файл «${file.name}».`));
  r.readAsDataURL(file);
});

// → { facts, products, offers, goals, unplaced, dropped, files, costUsd }; the server asks the model once and the code checks every quote and number
export async function extractBrief({ text = '', files = [], language = 'uk' }) {
  if (files.length > MAX_FILES) throw new Error(`Файлів може бути до ${MAX_FILES}.`);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) throw new Error('Файли завеликі: разом до 3 МБ.');
  const body = { text, language, files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await toBase64(f) }))) };
  return authedPost('/api/brief-extract', body);
}
