// The form «Сповіщення» of the page «Стан системи» (ai_agent_settings): the draft shown on the page ↔ the row saved to the database. Pure code, shared by the page and the tests.
import { cleanApprovers } from './rights.js';

// settings row → what the form shows (every field is text or a flag, so an empty input is simply '').
export function noticeDraft(s) {
  return {
    enabled: !!s?.enabled,
    chat: s?.tg_chat_id == null ? '' : String(s.tg_chat_id),
    attention: s?.attention_thread_id == null ? '' : String(s.attention_thread_id),
    spend: s?.spend_thread_id == null ? '' : String(s.spend_thread_id),
    hour: s?.digest_hour == null ? '9' : String(s.digest_hour),
    emails: [...(s?.notify_emails || [])],
  };
}

const thread = (raw, label) => {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (!/^\d{1,12}$/.test(t) || Number(t) < 1) throw new Error(`${label}: потрібне ціле число більше нуля (номер гілки в Telegram).`);
  return Number(t);
};

// form draft → the columns to write; throws a Ukrainian message for the first thing that is wrong.
export function cleanNotices(d = {}) {
  const chat = String(d.chat ?? '').trim();
  if (chat && !/^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{3,})$/.test(chat)) throw new Error('Чат Telegram: вкажіть числовий id групи (наприклад -1001234567890) або @імʼя каналу.');
  const hourText = String(d.hour ?? '').trim();
  const hour = hourText === '' ? 9 : Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Година денного підсумку: ціле число від 0 до 23 (за Києвом).');
  return {
    enabled: !!d.enabled,
    tg_chat_id: chat || null,
    attention_thread_id: thread(d.attention, 'Гілка «потрібна увага»'),
    spend_thread_id: thread(d.spend, 'Гілка «витрати»'),
    digest_hour: hour,
    notify_emails: cleanApprovers(d.emails || []),
  };
}

// Has the draft changed against the saved row? (the Save button is lit only then)
export function noticesChanged(draft, settings) {
  try {
    const a = cleanNotices(draft);
    const b = cleanNotices(noticeDraft(settings));
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch { return true; } // a draft that does not pass the check is still «changed»: the page shows the error on Save
}

// The people of the pick list: everyone with a profile plus the addresses already in the list (a person who left must still be removable).
export function pickList(profiles = [], current = []) {
  const seen = new Map();
  profiles.forEach((p) => { const e = String(p.email || '').trim().toLowerCase(); if (e) seen.set(e, { email: e, label: `${p.first_name || ''} ${p.last_name || ''}`.trim() || e }); });
  current.forEach((raw) => { const e = String(raw || '').trim().toLowerCase(); if (e && !seen.has(e)) seen.set(e, { email: e, label: e, extra: true }); });
  return [...seen.values()].sort((x, y) => x.label.localeCompare(y.label, 'uk'));
}

// → 'ok' | 'warn' | 'bad' → the words for the top line of the page.
export const OVERALL_TEXT = {
  ok: 'Усе працює',
  warn: 'Працює, але є що перевірити',
  bad: 'Є проблема, агенти можуть не працювати',
};
