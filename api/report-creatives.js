// The «Most effective creatives» of a saved report, for a person working on it.
//   POST { action: 'suggest',    projectId, start, end, count? }   → { items }        the best ads of the period with our copy of their pictures
//   POST { action: 'candidates', projectId, start, end }           → { candidates }   the top ads to choose from (a preview, nothing is copied)
//   POST { action: 'pick',       projectId, start, end, adId }     → { item }         the chosen ad as a report item, its picture copied
// Meta only for now. A signed-in CRM user asks; the Meta token never leaves the server. Pictures are copied into our storage with the person's own session.
import { createClient } from '@supabase/supabase-js';
import { collectCreatives, creativeCandidates, pickCreative } from './_lib/metaCreatives.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const authed = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: authError } = await authed.auth.getUser(token);
  if (authError || !user?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  const metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) { res.status(200).json({ configError: true, missing: ['META_ACCESS_TOKEN'] }); return; }

  const { action, projectId, start, end, adId, count } = req.body || {};
  if (!Number.isInteger(Number(projectId)) || !DATE.test(String(start)) || !DATE.test(String(end))) { res.status(400).json({ error: 'projectId, start і end (YYYY-MM-DD) обовʼязкові' }); return; }
  try {
    const { data: accounts, error } = await authed.from('project_ad_accounts').select('*').eq('project_id', Number(projectId));
    if (error) throw new Error(error.message);
    const period = { start, end };
    if (action === 'suggest') {
      res.status(200).json({ items: await collectCreatives({ db: authed, token: metaToken, accounts: accounts || [], projectId: Number(projectId), period, count: Math.min(Math.max(Number(count) || 3, 1), 8) }) });
    } else if (action === 'candidates') {
      res.status(200).json({ candidates: await creativeCandidates({ token: metaToken, accounts: accounts || [], period }) });
    } else if (action === 'pick' && adId) {
      res.status(200).json({ item: await pickCreative({ db: authed, token: metaToken, accounts: accounts || [], projectId: Number(projectId), period, adId: String(adId) }) });
    } else {
      res.status(400).json({ error: 'Невідома дія' });
    }
  } catch (e) {
    res.status(e.status && e.status < 500 ? 400 : 502).json({ error: e.message || String(e) });
  }
}
