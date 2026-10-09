// Writes the "What was done" block of a client report. Same rules as the other
// endpoints that spend money on an external API: a valid Supabase session is required and the key
// only lives in the server environment.
//
// POST body:
//   { action: 'describe', facts: string[], projectName, note?, from, to }
//       facts = what people really changed in the ad accounts (already filtered, in plain English)
//   { action: 'merge', weeks: [{ label, text }], projectName, note?, from, to }
//       weeks = the weekly "What was done" lists of one month, to become one monthly list
// Returns { text } — a "- item" list in English. The model may only reword and group what it is
// given: no invented reasons, results or numbers.
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';

const EXAMPLES = `Examples of how our account managers really write this section (match their voice, not their exact content):

Example 1 (weekly, Meta):
This week, we launched a dedicated Labor Day promotional campaign. The Labor Day offer was added to our catalog ads, along with separate promotional creatives. We also integrated the offer and relevant creatives into the existing campaigns for hybrid wigs.
Additionally, we continued scaling the best-performing campaigns by increasing budgets for those delivering the strongest results.

Example 2 (weekly, Meta):
• Turned off the Labor Day promotional creatives and returned the creatives that were performing well before the promotion.
• Launched new creatives promoting the 10% discount on Ready-to-Ship products, which is currently active across the website.
• Optimized budget allocation across the active campaigns to improve overall efficiency.

Example 3 (weekly, Meta):
This week, we paused the advertising campaigns for Half Wigs, as they showed weak results during the previous testing period. We increased the budget for the catalog campaign and optimized the other advertising campaigns based on their current budgets and performance.

Example 4 (weekly, Google Ads):
- Increased the budget for M'A_P. Max_Categories_NON-HYBRID from $45/day to $55/day to support further campaign scaling.
- Updated the bidding strategy in M'A_P. Max_Kinky Curly Wig Main from Maximize Conversions to Maximize Conversion Value.
- Added 2 new promotional videos to the asset groups to improve creative variety.
- Reviewed search terms across all campaigns and added 178 negative keywords to improve traffic relevance and reduce spend on irrelevant queries.

Example 5 (weekly, Google Ads):
- Analyzed search queries and added negative keywords to improve traffic quality and eliminate irrelevant searches
- Reallocated budgets across campaigns based on their performance and efficiency
- Continuously monitored campaign performance and implemented ongoing optimizations

Example 6 (monthly):
Throughout the month, the main focus was on reallocating budget toward the most promising and better-performing areas.
The budget for Catalog RTS was significantly increased, as this campaign showed the strongest scaling potential.
We continued running Kinky Bang RTS, Hybrid Wig RTS, and separate promotional offer campaigns.
We launched and tested the RTS Special Offer campaign with a dedicated budget.`;

const STYLE = [
  'You write the "What was done" section of an advertising performance report that a marketing agency sends to its client. It must read as if an experienced account manager wrote it by hand, not as a generated log.',
  'Voice: natural business English, past tense, first person plural where it fits ("we launched", "we increased"), varied sentence openings, no robotic repetition. Mix concise bullets with the occasional fuller sentence. Group related actions instead of listing every micro-change.',
  'Format: lines that each start with "- ". For a weekly report write 4 to 7 lines. For a monthly report you may open with one short line that only restates the main actions below in a few words; it must not add any interpretation (no "testing", "focus on scaling" or similar unless the facts say so), or skip the opening line.',
  'Keep the concrete details that managers keep: campaign / ad set / ad names exactly as written, budget changes as "from $X/day to $Y/day", how many keywords, ads or creatives.',
  'Use ONLY the given facts for WHAT was done. Never invent actions, numbers, results or performance claims ("showed strong results", "improved ROAS" and the like are forbidden unless the facts say so).',
  'Purpose phrases: you may add a short, generic, always-true purpose after an action, in the way managers do ("to support further scaling" after a budget increase, "to optimize budget allocation" after a decrease, "to improve traffic relevance" after negative keywords, "to keep creatives fresh" after new creatives). Never state a specific cause or result.',
  'Never judge performance: do not call anything underperforming, weak, strong, best or successful, and do not say why something was paused. Use each purpose phrase at most once in the whole text.',
  'Write campaign names without quotation marks, as managers do, unless the name contains the "|" character (then keep it in quotes).',
  'You may close with one general line such as "Continued regular monitoring and optimization of the active campaigns." when at least one concrete action is listed.',
  'Do not use "Meta:" or "Google Ads:" as a label. Name a platform ("On Meta", "In Google Ads") inside a sentence only when the given text itself names it for that action; if it does not name one, do NOT write "Meta" or "Google" at all.',
  'Translate any non-English words in the facts (for example optimization goals) into English. Do not mention people, internal tools, platform review states or technical details, and do not say "items".',
  'Output only the lines, nothing before or after them.',
].join(' ') + '\n\n' + EXAMPLES;

function bad(res, code, error) { res.status(code).json({ error }); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { bad(res, 401, 'Сесія недійсна'); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { bad(res, 500, 'ANTHROPIC_API_KEY не налаштовано'); return; }

  const { action, facts, weeks, projectName, note, from, to, periodType } = req.body || {};
  const kind = periodType === 'monthly' ? 'monthly' : 'weekly';
  let prompt;
  if (action === 'describe') {
    if (!Array.isArray(facts) || !facts.length || facts.length > 60) { bad(res, 400, 'facts: 1–60 рядків'); return; }
    prompt = `Project: ${String(projectName || '').slice(0, 120)}\nPeriod: ${from} to ${to}\n${note ? `Manager's context (use only to choose wording, do not quote): ${String(note).slice(0, 600)}\n` : ''}\nFacts about what was changed in the ad accounts:\n${facts.map((f) => '- ' + String(f).slice(0, 400)).join('\n')}`;
  } else if (action === 'merge') {
    if (!Array.isArray(weeks) || !weeks.length || weeks.length > 6) { bad(res, 400, 'weeks: 1–6 тижнів'); return; }
    prompt = `Project: ${String(projectName || '').slice(0, 120)}\nMonth: ${from} to ${to}\n${note ? `Manager's context (use only to choose wording, do not quote): ${String(note).slice(0, 600)}\n` : ''}\nThe weekly "What was done" lists of this month. Combine them into ONE list for the whole month: merge repeated actions into one bullet (for example the same campaign touched in several weeks), keep every distinct action, keep the concrete details, and do not add anything that is not in the weekly lists.\n\n${weeks.map((w) => `Week ${String(w.label || '').slice(0, 60)}:\n${String(w.text).slice(0, 3000)}`).join('\n\n')}`;
  } else { bad(res, 400, 'action: describe | merge'); return; }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, thinking: { type: 'disabled' }, system: STYLE, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await upstream.json();
    if (!upstream.ok) { bad(res, 502, data?.error?.message || 'Помилка моделі'); return; }
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) { bad(res, 502, `Модель не повернула текст (stop_reason: ${data.stop_reason || '?'}, блоки: ${(data.content || []).map((x) => x.type).join(',') || 'немає'}, токени: ${data.usage?.output_tokens ?? '?'})`); return; }
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('-') ? l : '- ' + l.replace(/^[•*]\s*/, '')));
    // The model sometimes adds a platform the source never named; take such phrases out again.
    const source = (action === 'merge' ? weeks.map((w) => w.text).join('\n') : facts.join('\n')).toLowerCase();
    let out = lines.join('\n');
    [['Meta', 'meta'], ['Google Ads', 'google']].forEach(([label, probe]) => {
      if (source.includes(probe)) return;
      out = out
        .replace(new RegExp('\\s+(?:on|in|via|through)\\s+' + label + '\\b', 'gi'), '')
        .replace(new RegExp('(^|\\n)- (?:On|In)\\s+' + label + ',\\s*(\\w)', 'g'), (m, nl, ch) => nl + '- ' + ch.toUpperCase());
    });
    res.status(200).json({ text: out });
  } catch (e) {
    bad(res, 502, 'Не вдалося звернутися до моделі: ' + e.message);
  }
}
