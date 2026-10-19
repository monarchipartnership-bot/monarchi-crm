// The website's door into the CRM. The form of www.monarchi.agency sends a copy of every submission here (a small script on the site,
// see the «Заявки з сайту» page in the CRM); the lead becomes a contact + a deal in the «Website» pipeline and is announced in Telegram
// and in the CRM bell. Public by nature, so it is guarded: only the sites listed in the settings, the site key, a honeypot, a rate limit
// per address, and a visitor never learns anything about the CRM from the answer.
//
// POST (JSON or text/plain JSON): { key, name, email, phone, link, services, message, page_url, referrer, utm }
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { signInAgent } from './_lib/agentSession.js';
import { handleSiteLead } from './_lib/siteLead.js';
import { sendMessage } from './_lib/telegram.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const same = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  let agent;
  let settings;
  let db;
  try {
    agent = await signInAgent();
    db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    settings = (await db.from('site_lead_settings').select('*').eq('id', 1).maybeSingle()).data;
  } catch (e) {
    console.error('site-lead: setup failed', e?.message || e);
    res.status(503).json({ ok: false });
    return;
  }
  const allowed = settings?.allowed_origins || [];
  if (origin && allowed.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Site-Key');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  if (!settings) { res.status(503).json({ ok: false }); return; }
  if (origin && !allowed.includes(origin)) { res.status(403).json({ ok: false }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  if (!same(body.key || req.headers['x-site-key'], settings.site_key)) { res.status(401).json({ ok: false }); return; }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const result = await handleSiteLead({
    db, settings, body, ip, telegram: token ? { send: (m) => sendMessage(m) } : null,
    crmUrl: process.env.CRM_BASE_URL || 'https://crm.monarchi.agency',
  });
  if (result.status === 'error') console.error('site-lead: failed', result.error);
  if (result.status === 'invalid') { res.status(400).json({ ok: false, error: result.errors?.[0] || 'invalid' }); return; }
  if (result.status === 'limited') { res.status(429).json({ ok: false }); return; }
  if (result.status === 'error') { res.status(500).json({ ok: false }); return; }
  res.status(200).json({ ok: true });
}
