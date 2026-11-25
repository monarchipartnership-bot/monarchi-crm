// POST { text?, files?: [{ name, type, data (base64) }], language? } → { facts, products, offers, goals, unplaced, dropped, files, costUsd }
// «Розкажіть про клієнта своїми словами»: the model finds the facts of the brief in the words of the manager and in the attached files, the code checks every quote and number
// (src/lib/workflow/briefExtract.js). Nothing is written here: the page shows the result for a check and fills the form. Needs a signed-in person; one model call.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { TEXT_TYPES, docxText, isDocx, isPdf } from './_lib/docText.js';
import { buildExtractPrompt, checkExtraction } from '../src/lib/workflow/briefExtract.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';
const MAX_FILES = 3;
const MAX_BASE64 = 4_000_000; // a serverless function takes a body of about 4.5 MB

// → { text, pdfBlocks, files: [{ name, read }] } or throws a readable Error. Exported for the tests.
export function readFiles(files = []) {
  if (!Array.isArray(files)) return { text: '', pdfBlocks: [], files: [], unreadable: [] };
  if (files.length > MAX_FILES) throw new Error(`Файлів може бути до ${MAX_FILES}.`);
  if (files.reduce((n, f) => n + String(f?.data || '').length, 0) > MAX_BASE64) throw new Error('Файли завеликі: разом до 3 МБ.');
  const out = { text: '', pdfBlocks: [], files: [], unreadable: [] };
  for (const f of files) {
    const name = String(f?.name || 'файл').slice(0, 120), type = String(f?.type || '');
    const buf = Buffer.from(String(f?.data || ''), 'base64');
    if (!buf.length) throw new Error(`Файл «${name}» порожній.`);
    if (isPdf(name, type)) { out.pdfBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: String(f.data) } }); out.files.push({ name, read: 'pdf' }); out.unreadable.push(name); }
    else if (isDocx(name, type)) { out.text += `\n\n[Файл ${name}]\n${docxText(buf)}`; out.files.push({ name, read: 'text' }); }
    else if (TEXT_TYPES.test(type) || TEXT_TYPES.test(name)) { out.text += `\n\n[Файл ${name}]\n${buf.toString('utf8')}`; out.files.push({ name, read: 'text' }); }
    else throw new Error(`Файл «${name}»: підходять PDF, Word (.docx), .txt і .md.`);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Не авторизовано' }); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY не налаштовано на сервері' }); return; }
  try {
    const typed = String(req.body?.text || '').trim();
    const read = readFiles(req.body?.files);
    const text = [typed, read.text.trim()].filter(Boolean).join('\n\n');
    if (text.length < 8 && !read.pdfBlocks.length) { res.status(400).json({ error: 'Напишіть або надиктуйте трохи більше про клієнта, або прикріпіть файл.' }); return; }
    const language = ['uk', 'ru', 'en'].includes(req.body?.language) ? req.body.language : 'uk';
    const { system, user } = buildExtractPrompt({ text, fileNames: read.pdfBlocks.length ? read.files.filter((f) => f.read === 'pdf').map((f) => f.name) : [], language });
    const content = [...read.pdfBlocks, { type: 'text', text: user }];
    const result = await getModelClient(token).callModel({ agentKey: 'brief-extract', actor: userData.user.email, params: { model: MODEL, max_tokens: 4000, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] } });
    res.status(200).json({ ...checkExtraction(result.text, { text, unreadable: read.unreadable }), files: read.files, costUsd: result.costUsd });
  } catch (e) {
    if (e instanceof BudgetError) { res.status(429).json({ error: e.message }); return; }
    if (e instanceof ModelError) { res.status(502).json({ error: 'Помилка моделі: ' + e.message }); return; }
    res.status(/Файл|файл|розібрати/.test(e?.message || '') ? 422 : 500).json({ error: e?.message || 'Не вдалося розібрати.' });
  }
}
