// The work of the internal growth team on ONE lead: the Analyst reads the lead and its site and the code scores it; the Author writes the letter and the code checks it.
// Everything outside (the database, the model, the network) is handed in, so scripts/check-growth.mjs runs the whole path without any of them.
//   deps.repo     the storage of gr_* (api/_lib/gr/repo.js, the twin scripts/grMemoryRepo.mjs)
//   deps.ask      ({ system, user, maxTokens, agentKey }) → { text, costUsd }   the model
//   deps.readSite (url) → { url, pages, tags, site: { url, title, description, h1, text }, error? }   the site (api/_lib/gr/leadSite.js)
import { scoreLead } from '../../../src/lib/growth/icp.js';
import { CASES, pickCase } from '../../../src/lib/growth/cases.js';
import { checkDraft, languageFor, withFooter, wordCount } from '../../../src/lib/growth/draftRules.js';
import { allowedQuotes, buildAnalystPrompt, buildAuthorPrompt, checkAnalystAnswer, parseAuthorAnswer, parseJsonLoose } from '../../../src/lib/growth/prompts.js';
import { siteFindings } from '../../../src/lib/growth/siteFindings.js';
import { firstUrl } from '../../../src/lib/growth/leadFlow.js';

export class HeldError extends Error { constructor(message, kind) { super(message); this.name = 'HeldError'; this.kind = kind; } }

const SOCIAL_HOST = /(linkedin\.com|upwork\.com|facebook\.com|instagram\.com|t\.me|twitter\.com|x\.com)/i;
const CHANNEL_OF = { site: 'email', manual: 'email', linkedin: 'linkedin', upwork: 'upwork' };
export const channelOf = (source) => CHANNEL_OF[source] || 'email';

// the first address in the text that is not a social network or the job board itself = the site of the company
export function websiteOf(lead) {
  if (lead.website) return lead.website;
  const urls = String(lead.raw_text || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return urls.map((u) => u.replace(/[.,;]+$/, '')).find((u) => !SOCIAL_HOST.test(u)) || null;
}

// stop and budget are checked BEFORE the model is called
async function guard(repo) {
  const s = await repo.getSettings();
  if (s.stopped) throw new HeldError('Команду зупинено: нові кроки не запускаються.', 'stopped');
  const spent = await repo.monthSpend();
  if (spent >= Number(s.monthly_budget_usd)) throw new HeldError(`Місячний бюджет внутрішньої команди вичерпано ($${spent.toFixed(2)} із $${Number(s.monthly_budget_usd).toFixed(0)}).`, 'budget');
  return s;
}
async function asked(repo, leadId, agent, call) {
  const r = await call();
  await repo.insertRun({ lead_id: leadId, kind: agent, status: 'ok', cost_usd: r.costUsd || 0 });
  return r;
}

// ---------------------------------------------------------------- the Analyst + the score
export async function analyseLead({ repo, leadId, deps }) {
  const lead = await repo.getLead(leadId);
  if (!lead) throw new Error('Ліда не знайдено.');
  await guard(repo);
  try {
    const website = websiteOf(lead);
    let read = null, findings = [];
    if (website) {
      try { read = await deps.readSite(website); } catch (e) { read = { pages: [], tags: null, error: e.message || 'Сайт не прочитано.' }; }
      findings = siteFindings({ pages: read.pages || [], tags: read.tags });
    }
    const siteReadable = !!(read && (read.pages || []).some((p) => p.ok));
    const signals = (read?.pages || []).filter((p) => p.ok).map((p) => p.signals || {});
    const hasCheckout = signals.some((s) => s.cart_link) || (read?.pages || []).some((p) => p.ok && (p.kind === 'cart' || p.kind === 'checkout'));

    const prompt = buildAnalystPrompt({ lead, site: siteReadable ? read.site : null, findings });
    const res = await asked(repo, leadId, 'analyst', () => deps.ask({ ...prompt, maxTokens: 1200, agentKey: 'gr-analyst' }));
    const parsed = parseJsonLoose(res.text);
    if (!parsed) throw new Error('Аналітик відповів не у форматі JSON.');
    const siteText = [read?.site?.title, read?.site?.description, read?.site?.text].filter(Boolean).join(' ');
    const { fields, dropped } = checkAnalystAnswer(parsed, { leadText: lead.raw_text, siteText, findingIds: findings.map((f) => f.id) });

    const upwork = lead.source === 'upwork' ? extractUpwork(parsed, lead.raw_text) : null;
    const scored = scoreLead({
      name: fields.company || lead.name, source: lead.source, country: fields.country || lead.country || '', niche: fields.niche, subniche: fields.subniche,
      paysAds: fields.paysAds, budget_amount: fields.budget_amount, budget_currency: fields.budget_currency,
      hasSite: !!website, siteHasCheckout: hasCheckout, problemNamed: fields.problemNamed, asksGuarantee: fields.asksGuarantee, outOfScope: fields.outOfScope,
      text: lead.raw_text, upwork,
    });
    const flags = [...scored.flags];
    let verdict = scored.verdict;
    if (website && !siteReadable) { flags.push(`Сайт не вдалося прочитати${read?.error ? ': ' + read.error : ''}`); if (verdict === 'ok') verdict = 'ask'; }
    if (lead.source === 'upwork' && upwork?.paymentVerified == null && verdict === 'ok') { flags.push('Upwork: оплату замовника не підтверджено в тексті'); verdict = 'ask'; }
    if (dropped.length) flags.push(...dropped.map((d) => 'Не прийнято від Аналітика: ' + d));

    const chosenCase = verdict === 'no' ? null : pickCase({ subniche: fields.subniche, niche: fields.niche, channel: fields.channel });
    const patch = {
      name: fields.company || lead.name, website: website || null, country: fields.country || lead.country || null, niche: fields.niche, subniche: fields.subniche,
      pays_ads: fields.paysAds, budget_usd: scored.lead.budgetUsd, channel: fields.channel, language: fields.language,
      has_site: !!website, has_checkout: hasCheckout, problem_named: fields.problemNamed,
      findings, finding_id: fields.finding_id, case_key: chosenCase?.key || null,
      score: scored.score, score_parts: scored.parts, verdict, reject_reason: scored.reject, flags, missing: scored.missing, error: null,
      status: verdict === 'no' ? 'rejected' : verdict === 'ask' ? 'scored' : 'drafting',
    };
    return await repo.updateLead(leadId, patch);
  } catch (e) {
    if (e instanceof HeldError) throw e;
    await repo.insertRun({ lead_id: leadId, kind: 'analyst', status: 'failed', cost_usd: 0, error: String(e.message || e).slice(0, 300) });
    return repo.updateLead(leadId, { status: 'failed', error: String(e.message || e).slice(0, 300) });
  }
}

// facts of the Upwork client, accepted only with a quote that exists in the pasted text
function extractUpwork(a, text) {
  const q = (k) => String(a?.[k] || '').toLowerCase().replace(/\s+/g, ' ');
  const has = (quote) => quote.length >= 4 && String(text || '').toLowerCase().replace(/\s+/g, ' ').includes(quote);
  const u = { paymentVerified: null, totalSpentUsd: null, rating: null, proposals: null };
  if (typeof a?.upwork_payment_verified === 'boolean' && has(q('upwork_payment_quote'))) u.paymentVerified = a.upwork_payment_verified;
  if (Number.isFinite(Number(a?.upwork_total_spent_usd)) && a.upwork_total_spent_usd !== null && has(q('upwork_spent_quote'))) u.totalSpentUsd = Number(a.upwork_total_spent_usd);
  if (Number.isFinite(Number(a?.upwork_rating)) && a.upwork_rating !== null && has(q('upwork_rating_quote'))) u.rating = Number(a.upwork_rating);
  if (Number.isFinite(Number(a?.upwork_proposals)) && a.upwork_proposals !== null && has(q('upwork_proposals_quote'))) u.proposals = Number(a.upwork_proposals);
  return u;
}

// ---------------------------------------------------------------- the Author
// kind: 'letter' | 'followup' | 'reply'; incoming: the text of the lead's message for a reply
export async function writeDraft({ repo, leadId, deps, kind = 'letter', incoming = '' }) {
  const lead = await repo.getLead(leadId);
  if (!lead) throw new Error('Ліда не знайдено.');
  await guard(repo);
  try {
    const lang = languageFor({ country: lead.country || '', leadLanguage: lead.language });
    const channel = channelOf(lead.source);
    const caseObj = lead.case_key && CASES[lead.case_key] ? { key: lead.case_key, ...CASES[lead.case_key] } : null;
    const finding = (lead.findings || []).find((f) => f.id === lead.finding_id) || null;
    const brand = await repo.getBrand();
    const base = buildAuthorPrompt({ lead, kind, lang, channel, finding, caseObj, brand, incoming, contactName: lead.contact_name || null });
    const allowed = allowedQuotes({ finding, lang, leadText: lead.raw_text, incoming });
    const check = (body) => checkDraft(body, { caseKey: caseObj?.key || null, allowedText: allowed, channel, kind });

    let answer = null, result = null, issues = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const user = attempt === 0 ? base.user : JSON.stringify({ ...JSON.parse(base.user), your_previous_attempt: answer.body, it_broke_these_rules: issues.map((i) => i.text), fix: 'Write the message again and fix every rule.' });
      result = await asked(repo, leadId, 'author', () => deps.ask({ system: base.system, user, maxTokens: 900, agentKey: 'gr-author' }));
      const parsed = parseAuthorAnswer(result.text);
      if (!parsed) { if (attempt === 1) throw new Error('Автор відповів не у форматі JSON.'); answer = { body: String(result.text || '').slice(0, 400) }; issues = [{ text: 'Відповідь має бути одним JSON-об\'єктом {"subject","body"}.' }]; continue; }
      answer = parsed; issues = check(parsed.body).issues;
      if (!issues.length) break;
    }
    const words = wordCount(answer.body);
    const body = kind === 'reply' ? answer.body : withFooter(answer.body, { channel, lang });
    const draft = await repo.insertDraft({ lead_id: leadId, kind, channel, lang, subject: channel === 'email' ? (answer.subject || null) : null, body, words, case_key: caseObj?.key || null, issues, status: 'pending', model: 'claude-sonnet-5', cost_usd: result.costUsd || 0 });
    await repo.updateLead(leadId, { status: kind === 'reply' ? 'replied' : kind === 'followup' ? 'sent' : 'draft', error: null });
    return draft;
  } catch (e) {
    if (e instanceof HeldError) throw e;
    await repo.insertRun({ lead_id: leadId, kind: 'author', status: 'failed', cost_usd: 0, error: String(e.message || e).slice(0, 300) });
    await repo.updateLead(leadId, { error: String(e.message || e).slice(0, 300) });
    throw e;
  }
}

// the whole path for a new lead: analyse, and if it is clearly «ok», write the letter at once
export async function processLead({ repo, leadId, deps }) {
  const lead = await analyseLead({ repo, leadId, deps });
  if (lead.status === 'drafting') { try { await writeDraft({ repo, leadId, deps }); } catch (e) { if (e instanceof HeldError) throw e; /* the lead stays «drafting» with the error; the person can press «Спробувати ще раз» */ } }
  return repo.getLead(leadId);
}
