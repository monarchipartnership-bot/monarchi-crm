// The prompts of the Analyst and the Author and the checks of their answers (docs/growth-workflow.md, section 2). PURE.
// The model describes; the code verifies every quote and number against the text it was given, and refuses what it cannot confirm.
import { NICHES, SUBNICHES, USD_RATE } from './icp.js';
import { CASES, caseFacts } from './cases.js';
import { MAX_WORDS } from './draftRules.js';

// the answer of a model as an object: a fenced block or text around the JSON is tolerated
export function parseJsonLoose(text) {
  const t = String(text || '').trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : t;
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(src.slice(a, b + 1)); } catch { return null; }
}
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const inText = (quote, ...texts) => { const q = norm(quote); return q.length >= 4 && texts.some((t) => norm(t).includes(q)); };
const digitsOf = (s) => String(s || '').replace(/[^\d.,]/g, '').replace(/[,](?=\d{3}\b)/g, '').replace(',', '.');

// ---------------------------------------------------------------- the Analyst
export function buildAnalystPrompt({ lead, site, findings }) {
  const system = [
    "You are the Analyst of Mon'Archi, a performance marketing agency (Meta Ads, Google Ads, e-commerce first). You classify ONE sales lead so that code can score it.",
    'Use ONLY what is written in the material below. If something is not written, answer null or "unknown". Never guess a budget, a country or a problem.',
    'Every number or claim you give must be backed by an EXACT quote copied from the lead text (or from the site text for "pays_ads"). Code checks each quote and drops what it cannot find.',
    'Answer with one JSON object and nothing else.',
  ].join('\n');
  const user = JSON.stringify({
    task: 'classify the lead',
    allowed: { niche: Object.keys(NICHES), subniche: SUBNICHES, pays_ads: ['yes', 'no', 'unknown'], channel: ['meta', 'google', null], currencies: Object.keys(USD_RATE) },
    notes: {
      niche: 'ecommerce = sells products online; leadgen = services that get inquiries (clinics, events, B2B); education = courses, info-business; excluded = casino, betting, crypto, adult, MLM, weapons, vape; other = anything else',
      pays_ads: '"yes" only if the text says they run or ran ads (quote it); "no" only if it says they do not; else "unknown"',
      problem_quote: 'an exact quote of a problem they name (low ROAS, expensive leads, ads stopped working...), or null',
      finding_id: 'choose the ONE most useful id from findings for a first message, or null if none fits',
      asks_guarantee: 'true if they demand guaranteed results', out_of_scope: 'true if they want a logo, a website from scratch or an app',
      ...(lead.source === 'upwork' ? { upwork: 'for an Upwork job post copy the client facts ONLY if they are written: upwork_payment_verified (true/false), upwork_total_spent_usd, upwork_rating, upwork_proposals, each with its exact quote in the matching *_quote field; otherwise null' } : {}),
    },
    lead: { name: lead.name || null, source: lead.source, text: String(lead.raw_text || '').slice(0, 6000) },
    site: site ? { url: site.url, title: site.title, description: site.description, h1: site.h1, text: String(site.text || '').slice(0, 5000) } : null,
    findings: findings.map((f) => ({ id: f.id, says: f.en })),
    answer_shape: { company: 'string|null', country: 'string|null', niche: '...', subniche: '...', pays_ads: '...', pays_ads_quote: 'string|null', budget_amount: 'number|null', budget_currency: 'string|null', budget_quote: 'string|null', problem_quote: 'string|null', asks_guarantee: 'boolean', out_of_scope: 'boolean', language: 'uk|en|null (the language the lead wrote in)', channel: 'meta|google|null (the ad platform they already use)', finding_id: 'string|null', ...(lead.source === 'upwork' ? { upwork_payment_verified: 'boolean|null', upwork_payment_quote: 'string|null', upwork_total_spent_usd: 'number|null', upwork_spent_quote: 'string|null', upwork_rating: 'number|null', upwork_rating_quote: 'string|null', upwork_proposals: 'number|null', upwork_proposals_quote: 'string|null' } : {}) },
  });
  return { system, user };
}

// → { fields, dropped: [reason] }  the model's answer after the checks
export function checkAnalystAnswer(answer, { leadText = '', siteText = '', findingIds = [] } = {}) {
  const a = answer && typeof answer === 'object' ? answer : {};
  const dropped = [];
  const fields = {
    company: a.company ? String(a.company).slice(0, 120) : null,
    country: a.country ? String(a.country).slice(0, 60) : null,
    niche: Object.keys(NICHES).includes(a.niche) ? a.niche : 'other',
    subniche: SUBNICHES.includes(a.subniche) ? a.subniche : 'other',
    paysAds: 'unknown', budget_amount: null, budget_currency: null, problemNamed: false,
    asksGuarantee: a.asks_guarantee === true, outOfScope: a.out_of_scope === true,
    language: a.language === 'uk' || a.language === 'en' ? a.language : null,
    channel: a.channel === 'meta' || a.channel === 'google' ? a.channel : null,
    finding_id: findingIds.includes(a.finding_id) ? a.finding_id : null,
  };
  if (!Object.keys(NICHES).includes(a.niche)) dropped.push('ніша не з дозволеного списку');
  if (a.pays_ads === 'yes') { if (inText(a.pays_ads_quote, leadText, siteText)) fields.paysAds = 'yes'; else dropped.push('«уже платить за рекламу»: цитату не знайдено в тексті'); }
  else if (a.pays_ads === 'no') { if (inText(a.pays_ads_quote, leadText)) fields.paysAds = 'no'; else dropped.push('«реклами не веде»: цитату не знайдено в тексті'); }
  if (a.budget_amount != null) {
    const n = Number(a.budget_amount);
    const quoted = digitsOf(a.budget_quote);
    if (Number.isFinite(n) && n > 0 && inText(a.budget_quote, leadText) && quoted && quoted.split(/[^\d.]+/).filter(Boolean).some((d) => Number(d) === n)) {
      fields.budget_amount = n; fields.budget_currency = Object.keys(USD_RATE).includes(String(a.budget_currency).toUpperCase()) ? String(a.budget_currency).toUpperCase() : 'USD';
    } else dropped.push('бюджет: цитата не збігається з числом або її немає в тексті');
  }
  if (a.problem_quote) { if (inText(a.problem_quote, leadText)) fields.problemNamed = true; else dropped.push('проблема: цитату не знайдено в тексті'); }
  return { fields, dropped };
}

// ---------------------------------------------------------------- the Author
const CHANNEL_RULES = {
  email: 'An email. Plain, no formatting. Aim for 70-100 words. Also give a short subject line (max 60 characters, no numbers, no emoji, no exclamation mark).',
  linkedin: 'A LinkedIn direct message. Aim for 50-80 words. No subject.',
  upwork: 'An Upwork proposal. Open with the specifics of THEIR job, then one relevant case. Aim for 70-100 words. No subject.',
};
export function buildAuthorPrompt({ lead, kind = 'letter', lang = 'en', channel = 'email', finding = null, caseObj = null, brand = null, incoming = '', contactName = null }) {
  const L = lang === 'uk' ? 'Ukrainian' : 'English';
  const system = [
    "You write first messages for Mon'Archi, a performance marketing agency. You write as a person on the team, not as a company brochure.",
    `Write in ${L}. ${CHANNEL_RULES[channel] || CHANNEL_RULES.email} Hard limit: ${MAX_WORDS} words.`,
    brand?.voice ? `Voice of the brand: ${String(brand.voice).slice(0, 700)}` : 'Voice: direct, practical, data-led, honest, never hype.',
    brand?.donts ? `Never: ${String(brand.donts).slice(0, 900)}` : 'Never invent numbers, clients or results. Never promise results or guarantee ROAS. Never quote prices. No emoji, no exclamation marks, no clickbait.',
    kind === 'followup' ? 'This is a short follow-up (max 60 words): one new useful point, no pressure, no repeating the first message.' : '',
    kind === 'reply' ? 'This is a reply to the message of the lead (given below). Answer what they asked, then suggest a short call or a look at their account. Do not mention prices or terms; if they ask about price, say we will go through it on a call.' : '',
    'Structure of a first message: (1) one concrete observation about THEIR site or business, using ONLY the observation given; if none is given, one honest remark about their niche without invented facts; (2) exactly one case, with the figures EXACTLY as given, or, if no case is given, say plainly that we do not have a published case in their niche yet and offer to show how we handled a similar funnel, without naming any client; (3) one soft call to action: a short call or a one-page list of what you would check first.',
    'Use only the numbers that appear in the material. Sign as "Mon\'Archi team". Answer with one JSON object: {"subject": string|null, "body": string}.',
  ].filter(Boolean).join('\n');
  const user = JSON.stringify({
    lead: { name: lead.name, company: lead.company || lead.name, country: lead.country || null, contact: contactName, niche: lead.niche, text: String(lead.raw_text || '').slice(0, 2500) },
    observation: finding ? findingTextOf(finding, lang) : null,
    case: caseObj ? { client: caseObj.client, description: caseObj.blurb, figures: caseFacts(caseObj, lang) } : null,
    incoming_message: incoming ? String(incoming).slice(0, 2500) : null,
  });
  return { system, user };
}
const findingTextOf = (f, lang) => (typeof f === 'string' ? f : f?.[lang === 'uk' ? 'uk' : 'en'] || '');

// → { subject, body } or null; the numbers and the rules are checked afterwards with checkDraft()
export function parseAuthorAnswer(text) {
  const o = parseJsonLoose(text);
  if (!o || typeof o.body !== 'string' || !o.body.trim()) return null;
  return { subject: o.subject ? String(o.subject).trim().slice(0, 90) : null, body: o.body.trim() };
}
// the text the Author is allowed to quote besides the case: the observation and the lead's own words
export const allowedQuotes = ({ finding = null, lang = 'en', leadText = '', incoming = '' } = {}) => [findingTextOf(finding, lang), leadText, incoming].filter(Boolean);
export { CASES };
