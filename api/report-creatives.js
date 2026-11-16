// The «Most effective creatives» of a saved report, for a person working on it.
//   POST { action: 'suggest',    projectId, start, end, count? }   → { items }        the best ads of the period with our copy of their pictures
//   POST { action: 'candidates', projectId, start, end }           → { candidates }   the top ads to choose from (a preview, nothing is copied)
//   POST { action: 'pick',       projectId, start, end, adId }     → { item }         the chosen ad as a report item, its picture copied
//   POST { action: 'import_examples', projectId, start, end, count? } → { added, already, noPicture, looked }  the best ads become files «Готовий креатив» of the client's library
//   POST { action: 'import_google_examples', projectId, start, end, count? } → { added, already, noPicture, looked }  the pictures of the best Google asset groups become files «Готовий креатив» (plan 2.16)
// The other actions are Meta only for now. A signed-in CRM user asks; the Meta token never leaves the server. Pictures are copied into our storage with the person's own session.
import { createClient } from '@supabase/supabase-js';
import { GoogleAdsApi } from 'google-ads-api';
import { collectCreatives, creativeCandidates, importExamples, pickCreative } from './_lib/metaCreatives.js';
import { importGoogleExamples } from './_lib/googleCreatives.js';

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
  // «Підтягнути з Google» needs the Google credentials, not the token of Meta
  if (req.body?.action === 'import_google_examples') {
    const { projectId: pid, start: from, end: to, count: n } = req.body;
    if (!Number.isInteger(Number(pid)) || !DATE.test(String(from)) || !DATE.test(String(to))) { res.status(400).json({ error: 'projectId, start і end (YYYY-MM-DD) обовʼязкові' }); return; }
    const missing = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'].filter((k) => !process.env[k]);
    if (missing.length) { res.status(200).json({ configError: true, missing }); return; }
    try {
      const { data: rows, error } = await authed.from('project_ad_accounts').select('*').eq('project_id', Number(pid));
      if (error) throw new Error(error.message);
      const googles = (rows || []).filter((a) => a.platform === 'google');
      if (!googles.length) { res.status(400).json({ error: 'У проєкті немає кабінетів Google.' }); return; }
      const api = new GoogleAdsApi({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || 'unused' });
      const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '');
      const total = { added: [], already: 0, noPicture: 0, looked: 0 };
      let left = Math.min(Math.max(Number(n) || 6, 1), 12);
      for (const a of googles) {
        if (left <= 0) break;
        const target = api.Customer({ customer_id: String(a.account_id).replace(/\D/g, ''), login_customer_id: login, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN });
        const r = await importGoogleExamples({ db: authed, target, projectId: Number(pid), period: { start: from, end: to }, count: left, email: user.user.email || null });
        total.added.push(...r.added); total.already += r.already; total.noPicture += r.noPicture; total.looked += r.looked;
        left -= r.looked;
      }
      res.status(200).json(total);
    } catch (e) { res.status(502).json({ error: 'Google Ads: ' + (e?.errors?.[0]?.message || e?.message || String(e)) }); }
    return;
  }
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
    } else if (action === 'import_examples') {
      res.status(200).json(await importExamples({ db: authed, token: metaToken, accounts: accounts || [], projectId: Number(projectId), period, count: Math.min(Math.max(Number(count) || 6, 1), 12), email: user.user.email }));
    } else {
      res.status(400).json({ error: 'Невідома дія' });
    }
  } catch (e) {
    res.status(e.status && e.status < 500 ? 400 : 502).json({ error: e.message || String(e) });
  }
}
