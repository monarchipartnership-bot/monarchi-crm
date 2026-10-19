// A lead from the website form → the CRM. Pure functions for reading and checking what the site sent, and one function that does the work
// (find or create the contact, open a deal in the «Website» pipeline, tell the Telegram chats and the people in the CRM).
// The database and Telegram are handed in, so scripts/check-core.mjs tests the whole path with stand-ins.
import { createHash } from 'node:crypto';
import { normText } from '../../src/lib/monthlyAggregation.js';
import { splitClientName } from '../../src/lib/clientName.js';
import { DEFAULT_TEMPLATE, escapeHtml, mentionOf, renderMessage } from '../../src/lib/siteLeadMessage.js';

export const SERVICE_LABELS = { service1: 'Google Ads', service2: 'Meta Ads', service3: 'TikTok Ads', service4: 'Other Ads', service5: 'Email marketing', service6: 'SEO' };
const RATE_LIMIT = 6; // submissions per address in RATE_WINDOW_MIN minutes
const RATE_WINDOW_MIN = 10;
const SAME_PERSON_MIN = 10; // the same contact sending twice within this time is one request
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);

export const hashIp = (ip, salt = process.env.CRON_SECRET || 'monarchi') => createHash('sha256').update(`${salt}|${ip || ''}`).digest('hex').slice(0, 20);

// Reads the raw body (JSON object, urlencoded fields or a JSON string) into a clean lead.
// → { lead, errors: [], spam: boolean }
export function normalizeLead(raw) {
  let body = raw;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  const services = [].concat(body.services ?? body['services[]'] ?? []).flatMap((s) => (Array.isArray(s) ? s : String(s).split(/\s*,\s*/))).map((s) => clip(SERVICE_LABELS[s] || s, 60)).filter(Boolean).slice(0, 10);
  const email = clip(body.email, 200).toLowerCase();
  const phoneRaw = clip(body.phone, 60);
  const digits = phoneRaw.replace(/\D/g, '');
  const phone = digits.length >= 6 && digits.length <= 18 ? `${phoneRaw.trim().startsWith('+') ? '+' : ''}${digits}` : '';
  const message = clip(body.message, 3000);
  const utm = {};
  Object.entries(body.utm && typeof body.utm === 'object' ? body.utm : {}).slice(0, 8).forEach(([k, v]) => { if (/^utm_[a-z]+$/.test(k) && clip(v, 120)) utm[k] = clip(v, 120); });
  const lead = {
    form: clip(body.form || 'contact', 40) || 'contact',
    name: clip(body.name, 120), email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '', phone,
    link: clip(body.link, 300), services, message, page_url: clip(body.page_url, 500), referrer: clip(body.referrer, 500), utm,
  };
  const errors = [];
  if (!lead.email && !lead.phone) errors.push('Потрібен e-mail або телефон.');
  const spam = clip(body.hp, 100) !== '' || (message.match(/https?:\/\//gi) || []).length >= 4;
  return { lead, errors, spam };
}

// The values a template can use, from a clean lead.
const kyivTime = (d) => new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
export function leadValues(lead, { isReturning = false, pings = '', now = new Date() } = {}) {
  return {
    name: lead.name, email: lead.email, phone: lead.phone, link: lead.link, services: (lead.services || []).join(', '), message: lead.message, page: lead.page_url,
    utm: Object.entries(lead.utm || {}).map(([k, v]) => `${k.replace('utm_', '')}=${v}`).join(', '),
    time: kyivTime(now), returning: isReturning ? ' (клієнт уже є в CRM)' : '', ping: pings,
  };
}
export function buildTelegramText(lead, { template, pings = '', isReturning = false, now } = {}) {
  return renderMessage(template || DEFAULT_TEMPLATE, leadValues(lead, { isReturning, pings, now }));
}

// The people to mention in each chat (those ticked in the settings), as the HTML Telegram needs.
export async function loadPings(db) {
  const rows = (await db.from('tg_members').select('chat_id, user_id, username, name').eq('ping', true)).data || [];
  const by = {};
  rows.forEach((m) => { (by[m.chat_id] ||= []).push(mentionOf(m)); });
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.join(' ')]));
}

// A sample lead for the «test the message form» button.
export const SAMPLE = { name: 'Анна Коваль', email: 'anna@example.com', phone: '+380501234567', link: 'https://shop.example', services: ['Google Ads', 'SEO'], message: 'Хочемо запустити рекламу для інтернет-магазину.', page_url: 'https://www.monarchi.agency/', utm: { utm_source: 'google', utm_medium: 'cpc' } };

const nowIso = (now) => now().toISOString();

// Does the work. deps: { db, telegram: { send({chatId,text,url}) -> {ok,error} } | null, now, crmUrl }
// → { status: 'created' | 'duplicate' | 'spam' | 'invalid' | 'limited' | 'disabled' | 'error', leadId?, clientId?, dealId?, error? }
export async function handleSiteLead({ db, settings, body, ip, telegram = null, now = () => new Date(), crmUrl = 'https://crm.monarchi.agency' }) {
  if (!settings?.enabled) return { status: 'disabled' };
  const { lead, errors, spam } = normalizeLead(body);
  if (errors.length) return { status: 'invalid', errors };
  const ipHash = hashIp(ip);
  const base = { form: lead.form, name: lead.name || null, email: lead.email || null, phone: lead.phone || null, link: lead.link || null, services: lead.services, message: lead.message || null, page_url: lead.page_url || null, referrer: lead.referrer || null, utm: Object.keys(lead.utm).length ? lead.utm : null, ip_hash: ipHash };
  const logRow = async (extra) => {
    const { data, error } = await db.from('site_leads').insert({ ...base, received_at: nowIso(now), ...extra }).select().single();
    if (error) throw new Error('site_leads: ' + error.message);
    return data;
  };
  if (spam) { const row = await logRow({ status: 'spam' }); return { status: 'spam', leadId: row.id }; }

  const since = new Date(now().getTime() - RATE_WINDOW_MIN * 60000).toISOString();
  const recent = (await db.from('site_leads').select('id').eq('ip_hash', ipHash).gte('received_at', since)).data || [];
  if (recent.length >= RATE_LIMIT) return { status: 'limited' };

  const row = await logRow({ status: 'new' });
  try {
    // ---- the contact: by e-mail (or the same phone), otherwise a new one
    let client = null;
    if (lead.email) client = ((await db.from('clients').select('*').ilike('email', lead.email).limit(1)).data || [])[0] || null;
    if (!client && lead.phone) client = ((await db.from('clients').select('*').eq('phone', lead.phone).limit(1)).data || [])[0] || null;
    const returning = !!client;
    if (!client) {
      const full = lead.name || lead.email || lead.phone;
      const { name, lastName } = splitClientName(full);
      let key = normText(full);
      if (((await db.from('clients').select('id').eq('name_key', key).limit(1)).data || []).length) key = normText(`${full} ${lead.email || lead.phone}`); // another person with the same name
      const ins = await db.from('clients').insert({
        name, last_name: lastName || null, name_key: key, status: 'Новий', source: 'Website', manager: settings.manager || null,
        email: lead.email || null, phone: lead.phone || null, websites: lead.link ? [lead.link] : [], service_interest: lead.services.join(', ') || null,
        other_notes: lead.message || null, updated_at: nowIso(now),
      }).select().single();
      if (ins.error) throw new Error('clients: ' + ins.error.message);
      client = ins.data;
    } else {
      const patch = {};
      if (!client.phone && lead.phone) patch.phone = lead.phone;
      if (!client.email && lead.email) patch.email = lead.email;
      if (lead.link && !(client.websites || []).includes(lead.link)) patch.websites = [...(client.websites || []), lead.link];
      if (Object.keys(patch).length) await db.from('clients').update({ ...patch, updated_at: nowIso(now) }).eq('id', client.id);
    }

    // ---- the same contact writing twice in a row is one request: no second deal, no second message
    const sinceDup = new Date(now().getTime() - SAME_PERSON_MIN * 60000).toISOString();
    const dup = ((await db.from('deals').select('id').eq('client_id', client.id).eq('source', 'Website').gte('created_at', sinceDup).limit(1)).data || [])[0];
    if (dup) { await db.from('site_leads').update({ status: 'duplicate', client_id: client.id, deal_id: dup.id }).eq('id', row.id); return { status: 'duplicate', leadId: row.id, clientId: client.id, dealId: dup.id }; }

    // ---- the deal: the first stage of the Website pipeline
    let pipelineId = settings.pipeline_id;
    if (!pipelineId) pipelineId = ((await db.from('pipelines').select('id, name').order('position', { ascending: true })).data || []).find((p) => String(p.name).toLowerCase() === 'website')?.id;
    if (!pipelineId) throw new Error('Не знайдено воронку «Website».');
    const stage = ((await db.from('deal_stages').select('id').eq('pipeline_id', pipelineId).order('position', { ascending: true }).limit(1)).data || [])[0];
    if (!stage) throw new Error('У воронці немає етапів.');
    const notes = [lead.message, lead.services.length ? `Послуги: ${lead.services.join(', ')}` : '', lead.link ? `Проєкт: ${lead.link}` : '', lead.page_url ? `Сторінка: ${lead.page_url}` : ''].filter(Boolean).join('\n');
    const dealIns = await db.from('deals').insert({
      client_id: client.id, pipeline_id: pipelineId, stage_id: stage.id, title: `Заявка з сайту · ${lead.name || lead.email || lead.phone}`, source: 'Website',
      manager: settings.manager || null, website: lead.link || null, notes: notes || null, stage_changed_at: nowIso(now), created_at: nowIso(now), currency: 'USD',
    }).select().single();
    if (dealIns.error) throw new Error('deals: ' + dealIns.error.message);
    const deal = dealIns.data;
    await db.from('deal_activity').insert({ deal_id: deal.id, event_type: 'created', text: `Заявка з сайту (${lead.form})${lead.services.length ? ': ' + lead.services.join(', ') : ''}`, created_by: 'сайт' });

    // ---- the people: Telegram chats and the bell in the CRM (a failure here never loses the lead)
    const dealUrl = `${crmUrl}/reports/deals?open=${deal.id}`;
    let tgStatus = 'skipped';
    let tgError = null;
    let tgMessages = null;
    const chats = settings.telegram_chat_ids || [];
    if (telegram && chats.length) {
      const pingsBy = await loadPings(db);
      const results = await Promise.all(chats.map((chatId) => telegram.send({
        chatId, text: buildTelegramText(lead, { template: settings.message_template, pings: pingsBy[String(chatId)] || '', isReturning: returning, now: now() }),
        url: settings.show_button === false ? undefined : dealUrl,
      }).catch((e) => ({ ok: false, error: String(e.message || e) }))));
      const bad = results.filter((r) => !r.ok);
      tgStatus = bad.length === results.length ? 'failed' : 'sent';
      if (bad.length) tgError = bad.map((r) => r.error).join('; ').slice(0, 300);
      tgMessages = Object.fromEntries(chats.map((c, i) => [String(c), results[i]?.result?.message_id]).filter(([, id]) => id));
    }
    const emails = [...new Set((settings.notify_emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    if (emails.length) {
      await db.from('notifications').insert(emails.map((email) => ({ recipient_email: email, sender_email: 'site', type: 'project_report', deal_id: deal.id, title: 'Нова заявка з сайту', body: `${lead.name || lead.email || lead.phone}${lead.services.length ? ': ' + lead.services.join(', ') : ''}`.slice(0, 300), link: `/reports/deals?open=${deal.id}` })));
    }
    await db.from('site_leads').update({ client_id: client.id, deal_id: deal.id, telegram_status: tgStatus, telegram_error: tgError, telegram_messages: tgMessages }).eq('id', row.id);
    return { status: 'created', leadId: row.id, clientId: client.id, dealId: deal.id, telegram: tgStatus, returning };
  } catch (e) {
    await db.from('site_leads').update({ status: 'error', error: String(e.message || e).slice(0, 400) }).eq('id', row.id);
    return { status: 'error', leadId: row.id, error: String(e.message || e) };
  }
}

// ---------------------------------------------------------------------------------------------------- reminders
// A lead counts as TAKEN when its deal has left the first stage («Новий лід»), or was archived or deleted. Until then the bot reminds in
// every chat (as a reply to the original message, mentioning the ticked people) every `reminder_minutes`, at most `reminder_max` times.
// Called by the cron tick (every 15 minutes), so the real interval is a multiple of that.
export async function runLeadReminders({ db, settings, telegram, now = () => new Date(), crmUrl = 'https://crm.monarchi.agency' }) {
  if (!settings?.reminders_enabled || !telegram || !(settings.telegram_chat_ids || []).length) return { sent: 0 };
  const t = now().getTime();
  const since = new Date(t - 24 * 3600000).toISOString();
  const leads = ((await db.from('site_leads').select('*').eq('status', 'new').gte('received_at', since)).data || []).filter((l) => l.deal_id && l.telegram_messages && (l.reminders_sent || 0) < (settings.reminder_max || 3));
  const minutes = settings.reminder_minutes || 30;
  const firstStage = new Map();
  const pingsBy = leads.length ? await loadPings(db) : {};
  let sent = 0;
  for (const l of leads) {
    const lastAt = new Date(l.last_reminder_at || l.received_at).getTime();
    if (t - lastAt < minutes * 60000) continue;
    const deal = ((await db.from('deals').select('id, stage_id, pipeline_id, archived').eq('id', l.deal_id).limit(1)).data || [])[0];
    if (!deal || deal.archived) continue;
    if (!firstStage.has(deal.pipeline_id)) firstStage.set(deal.pipeline_id, ((await db.from('deal_stages').select('id').eq('pipeline_id', deal.pipeline_id).order('position', { ascending: true }).limit(1)).data || [])[0]?.id);
    if (deal.stage_id !== firstStage.get(deal.pipeline_id)) continue; // taken
    const waited = Math.round((t - new Date(l.received_at).getTime()) / 60000);
    const who = [l.name, l.phone || l.email].filter(Boolean).join(' · ');
    let any = false;
    for (const chatId of settings.telegram_chat_ids) {
      const ping = pingsBy[String(chatId)] || '';
      const text = `⏰ <b>Заявку ще не взято в роботу</b> (${waited} хв)\n${escapeHtml(who)}\nПереведіть угоду з етапу «Новий лід», коли візьмете її.${ping ? '\n' + ping : ''}`;
      const r = await telegram.send({ chatId, text, url: settings.show_button === false ? undefined : `${crmUrl}/reports/deals?open=${l.deal_id}`, replyTo: l.telegram_messages[String(chatId)] }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      any = any || r.ok;
    }
    await db.from('site_leads').update({ reminders_sent: (l.reminders_sent || 0) + 1, last_reminder_at: now().toISOString() }).eq('id', l.id);
    if (any) sent += 1;
  }
  return { sent };
}
