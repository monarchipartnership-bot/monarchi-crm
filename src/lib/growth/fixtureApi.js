// A DEV-ONLY stand-in for the data of the window «Зростання»: the same shape as src/lib/api/growth.js, the data in memory, made-up leads. It is loaded only by a dev server with `?fixture`
// in the address (the production build drops it), so the window can be looked at and clicked before the tables exist. Names and figures are invented.
import { actionOfChannel, emptyRecord, recordDecision } from './autonomy.js';
import { FOOTERS, wordCount } from './draftRules.js';

const iso = (d = 0) => new Date(Date.now() - d * 86400000).toISOString();
const PARTS_SHOP = [['niche', 'Інтернет-магазин: наша головна ніша', 30, 30, true], ['pays_ads', 'Уже платить за рекламу', 25, 25, true], ['budget', 'Бюджет від $1 500 на місяць', 15, 25, true], ['market', 'Ринок: США', 15, 15, true], ['site', 'Є сайт з оплатою, названа проблема', 5, 5, true]];
const parts = (rows) => rows.map(([key, label, points, max, good]) => ({ key, label, points, max, good }));
const FIND = [{ id: 'no_meta_pixel', en: 'I could not find the Meta Pixel loading on your home page', uk: 'я не знайшов піксель Meta на вашій головній сторінці' }];

export function fixtureApi() {
  let n = 100;
  const D = {
    settings: { stopped: false, monthly_budget_usd: 30, autonomy: { email_outreach: { streak: 12, unlockedAuto: false } } }, spent: 6.4,
    leads: [
      { id: 'a', name: 'Lumi Candles', source: 'upwork', source_url: 'https://www.upwork.com/jobs/~01abc', website: 'https://lumicandles.com', country: 'USA', niche: 'ecommerce', subniche: 'other_ecom', status: 'draft', verdict: 'ok', score: 90, score_parts: parts(PARTS_SHOP), findings: FIND, finding_id: 'no_meta_pixel', case_key: 'mellowdiamond', flags: [], missing: [], language: 'en', created_at: iso(1), updated_at: iso(1), raw_text: 'Need a Meta Ads expert for our candle shop. Budget is $2,000 per month.' },
      { id: 'b', name: 'Kovalski Dental', source: 'site', website: 'https://kovalski-dental.example', country: 'Польща', niche: 'leadgen', subniche: 'services', status: 'scored', verdict: 'ask', score: 65, score_parts: parts([['niche', 'Лідогенерація: друга за важливістю ніша', 20, 30, true], ['pays_ads', 'Невідомо, чи вже запускали рекламу', 10, 25, false], ['budget', 'Бюджет від $3 000 на місяць', 25, 25, true], ['market', 'Ринок: Польща', 10, 15, true], ['site', 'Сайт без оплати, проблема не названа', 0, 5, false]]), findings: [], case_key: 'oystersxo', flags: [], missing: ['чи вже запускали рекламу'], created_at: iso(1), updated_at: iso(1), raw_text: 'Заявка з форми сайту.' },
      { id: 'c', name: 'EduPath Academy', source: 'linkedin', source_url: 'https://www.linkedin.com/in/edupath', website: 'https://edupath.example', country: 'Україна', niche: 'education', subniche: 'education', status: 'draft', verdict: 'ok', score: 75, score_parts: parts([['niche', 'Освіта: друга за важливістю ніша', 20, 30, true], ['pays_ads', 'Уже платить за рекламу', 25, 25, true], ['budget', 'Бюджет від $1 500 на місяць', 15, 25, true], ['market', 'Ринок: Україна', 10, 15, true], ['site', 'Є сайт з оплатою, названа проблема', 5, 5, true]]), findings: [], case_key: null, flags: [], missing: [], language: 'uk', created_at: iso(2), updated_at: iso(2), raw_text: 'Курси онлайн.' },
      { id: 'd', name: 'Brightside Apparel', source: 'site', website: 'https://brightside.example', country: 'Canada', niche: 'ecommerce', subniche: 'fashion', status: 'sent', verdict: 'ok', score: 88, score_parts: parts(PARTS_SHOP), findings: [], case_key: 'byme', flags: [], missing: [], sent_at: iso(2), created_at: iso(4), updated_at: iso(2), raw_text: '' },
      { id: 'e', name: 'Hana Skincare', source: 'linkedin', website: 'https://hana.example', country: 'Germany', niche: 'ecommerce', subniche: 'beauty', status: 'replied', verdict: 'ok', score: 84, score_parts: parts(PARTS_SHOP), findings: [], case_key: 'mola', flags: [], missing: [], sent_at: iso(6), replied_at: iso(1), created_at: iso(8), updated_at: iso(1), raw_text: '' },
      { id: 'f', name: 'Sklep Mebli', source: 'site', website: 'https://sklep.example', country: 'Польща', niche: 'ecommerce', subniche: 'furniture', status: 'won', verdict: 'ok', score: 80, score_parts: parts(PARTS_SHOP), findings: [], case_key: 'humancentric', flags: [], missing: [], sent_at: iso(30), replied_at: iso(28), created_at: iso(33), updated_at: iso(20), raw_text: '' },
      { id: 'g', name: 'NordCoin Exchange', source: 'upwork', country: 'USA', niche: 'excluded', status: 'rejected', verdict: 'no', score: 0, score_parts: [], reject_reason: 'Ринок, з яким ми не працюємо (сірий або чорний ринок)', findings: [], flags: [], missing: [], created_at: iso(2), updated_at: iso(2), raw_text: '' },
      { id: 'h', name: 'verde-pets.example', source: 'site', country: null, status: 'new', verdict: null, score: null, score_parts: [], findings: [], flags: [], missing: [], created_at: iso(0), updated_at: iso(0), raw_text: 'Заявка з форми сайту.' },
    ],
    drafts: [
      { id: 1, lead_id: 'a', kind: 'letter', channel: 'upwork', lang: 'en', subject: null, status: 'pending', words: 71, case_key: 'mellowdiamond', edited: false, issues: [], created_at: iso(1), body: "Hi Sarah, I looked at lumicandles.com before writing. I could not find the Meta Pixel loading on your home page, which makes it hard for campaigns to learn from sales.\nWe recently cut MellowDiamond's cost per purchase by 34% on Meta, starting from the same kind of audit.\nI can send a one-page list of what I would check first, or we can do a 15-minute call.\nMon'Archi team" },
      { id: 2, lead_id: 'c', kind: 'letter', channel: 'linkedin', lang: 'uk', subject: null, status: 'pending', words: 62, case_key: null, edited: false, issues: [], created_at: iso(2), body: "Вітаю, Ірино. Подивився сторінку вашого курсу й побачив, що її варто перевірити на передачу події Lead.\nОпублікованого кейса для освіти в нас поки немає, тому не буду підганяти чужий: можу показати, як ми діяли в схожій воронці заявок.\nМожемо коротко поговорити цього тижня?\nMon'Archi team" },
      { id: 3, lead_id: 'e', kind: 'reply', channel: 'linkedin', lang: 'en', subject: null, status: 'pending', words: 42, case_key: null, edited: false, issues: [], created_at: iso(1), body: "Hi Hana, thanks for getting back. Before sending any terms I would like to look at your Meta account for 20 minutes, so the numbers are specific to you. Would Tuesday or Wednesday work?\nMon'Archi team" },
    ],
  };
  const live = () => ({ leads: D.leads.map((l) => ({ ...l })), drafts: D.drafts.map((d) => ({ ...d })), settings: JSON.parse(JSON.stringify(D.settings)), spent: D.spent });
  const lead = (id) => D.leads.find((l) => l.id === id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rec = (channel, fn) => { const k = actionOfChannel(channel); D.settings.autonomy[k] = fn(D.settings.autonomy[k] || emptyRecord()); };
  return {
    fixture: true,
    async load() { return live(); },
    async add({ text, website, url }) { await wait(900); const l = { id: 'n' + (n += 1), name: (website || url || text || 'Новий лід').replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), source: /upwork/.test(text + url) ? 'upwork' : /linkedin/.test(text + url) ? 'linkedin' : 'manual', website: website || null, country: 'USA', status: 'scored', verdict: 'ask', score: 60, score_parts: parts(PARTS_SHOP.slice(0, 3)), findings: [], flags: ['Приклад: у dev-режимі модель не викликається'], missing: ['країна'], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), raw_text: text || '' }; D.leads.unshift(l); return { lead: l }; },
    async run(id) { await wait(500); return { lead: lead(id) }; },
    async approveLead(id) { await wait(900); const l = lead(id); l.status = 'draft'; D.drafts.unshift({ id: (n += 1), lead_id: id, kind: 'letter', channel: l.source === 'site' ? 'email' : l.source, lang: 'en', subject: l.source === 'site' ? 'A quick note on your ads' : null, status: 'pending', words: 55, case_key: l.case_key, edited: false, issues: [], created_at: new Date().toISOString(), body: "Hi, I looked at your site before writing and have one concrete idea about your campaigns. We recently helped a similar business lower its cost per result, starting from an audit. Would a 15-minute call this week make sense?\nMon'Archi team" + (l.source === 'site' ? '\n\n' + FOOTERS.en : '') }); return { lead: l }; },
    async makeDraft(id, kind) { await wait(700); D.drafts.unshift({ id: (n += 1), lead_id: id, kind, channel: 'linkedin', lang: 'en', status: 'pending', words: 30, issues: [], edited: false, created_at: new Date().toISOString(), body: 'Thanks for the quick reply. Let us set up a short call to look at your account together.\nMon\'Archi team' }); return { draft: D.drafts[0] }; },
    async approveDraft({ draft, body, edited }) { const d = D.drafts.find((x) => x.id === draft.id); Object.assign(d, { status: 'approved', body, edited, words: wordCount(body), issues: [] }); lead(d.lead_id).status = d.kind === 'reply' ? 'replied' : 'ready'; rec(d.channel, (r) => recordDecision(r, { approved: true, edited })); },
    async skipDraft({ draft }) { D.drafts.find((x) => x.id === draft.id).status = 'skipped'; rec(draft.channel, (r) => recordDecision(r, { approved: false, edited: false })); },
    async markSent({ lead: l, draft }) { if (draft) D.drafts.find((x) => x.id === draft.id).status = 'sent'; Object.assign(lead(l.id), { status: 'sent', sent_at: new Date().toISOString() }); },
    async markReplied(id) { Object.assign(lead(id), { status: 'replied', replied_at: new Date().toISOString() }); },
    async markWon(id) { lead(id).status = 'won'; },
    async endLead(id, status) { lead(id).status = status; },
    async setStopped(stopped) { D.settings.stopped = stopped; },
    async setBudget(usd) { D.settings.monthly_budget_usd = usd; },
    async setLevel({ key, level }) { D.settings.autonomy[key] = { ...(D.settings.autonomy[key] || emptyRecord()), level }; },
    async unlockAuto() {},
    async waiting() { return 0; },
  };
}
