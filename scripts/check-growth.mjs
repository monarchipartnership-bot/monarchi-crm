// Checks of the internal growth team (docs/growth-workflow.md): the score of a lead, the choice of a case, the rules of a message, the levels of automation, the journey of a lead.
// Pure code, no network and no database. Run:  node scripts/check-growth.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_BUDGET_USD, THRESHOLDS, marketOf, scoreLead, toUsd } from '../src/lib/growth/icp.js';
import { CASES, caseFacts, pickCase } from '../src/lib/growth/cases.js';
import { FOOTERS, MAX_WORDS, checkDraft, followUpDates, isSensitive, languageFor, stripFooter, withFooter, wordCount } from '../src/lib/growth/draftRules.js';
import { ACTIONS, UNLOCK_AFTER, actionOf, actionOfChannel, canUnlockAuto, isQuietHour, levelsFor, recordDecision, sendMode } from '../src/lib/growth/autonomy.js';
import { buildQueue, capsuleOf, classifySource, firstUrl, followUpsDue, funnel, monthStats, staleDeals } from '../src/lib/growth/leadFlow.js';
import { checkAnalystAnswer, parseAuthorAnswer, parseJsonLoose } from '../src/lib/growth/prompts.js';
import { detectTags, siteFindings } from '../src/lib/growth/siteFindings.js';
import { HeldError, analyseLead, processLead, websiteOf, writeDraft } from '../api/_lib/gr/pipeline.js';
import { createMemoryGrRepo } from './grMemoryRepo.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed += 1; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

const LUMI = { name: 'Lumi Candles', source: 'upwork', country: 'USA', niche: 'ecommerce', subniche: 'home', paysAds: 'yes', budget_amount: 2000, budget_currency: 'USD', hasSite: true, siteHasCheckout: true, problemNamed: true, upwork: { paymentVerified: true, totalSpentUsd: 12000, rating: 4.9, proposals: 8 } };

await test('score: the table of 8.1 adds up (shop 30 + pays ads 25 + budget 15 + tier-1 market 15 + site 5 = 90)', () => {
  const r = scoreLead(LUMI);
  assert.equal(r.score, 90); assert.equal(r.verdict, 'ok'); assert.equal(r.reject, null);
  assert.deepEqual(r.parts.map((p) => [p.key, p.points]), [['niche', 30], ['pays_ads', 25], ['budget', 15], ['market', 15], ['site', 5]]);
});
await test('score: the same lead with a rich budget gets 100 and with a poor one loses the budget points', () => {
  assert.equal(scoreLead({ ...LUMI, budget_amount: 4000 }).score, 100);
  assert.equal(scoreLead({ ...LUMI, budget_amount: 900 }).score, 75); // 30+25+0+15+5
  assert.equal(MIN_BUDGET_USD, 1500);
});
await test('score: thresholds 70 and 40 decide ok / ask / no, and the missing facts are named', () => {
  const kov = scoreLead({ name: 'Kovalski Dental', source: 'site', country: 'Польща', niche: 'leadgen', paysAds: 'unknown', budget_amount: 3500, budget_currency: 'USD', hasSite: true, siteHasCheckout: false, problemNamed: false });
  assert.equal(kov.score, 65); assert.equal(kov.verdict, 'ask'); assert.ok(kov.missing.includes('чи вже запускали рекламу'));
  assert.equal(scoreLead({ name: 'X', source: 'manual', country: 'Nepal', niche: 'other', paysAds: 'no', hasSite: true }).verdict, 'no');
  assert.deepEqual(THRESHOLDS, { ok: 70, ask: 40 });
});
await test('score: education counts 20 and the market of Ukraine 10 (EduPath = 75)', () => {
  const e = scoreLead({ name: 'EduPath Academy', source: 'linkedin', country: 'Україна', niche: 'education', subniche: 'education', paysAds: 'yes', budget_amount: 1500, budget_currency: 'USD', hasSite: true, siteHasCheckout: true, problemNamed: true });
  assert.equal(e.score, 75); assert.equal(e.verdict, 'ok');
});
await test('score: the hard refusals (grey market, no site, guarantees, out of scope, unverified Upwork payment) give no points at all', () => {
  assert.equal(scoreLead({ ...LUMI, name: 'NordCoin crypto exchange' }).verdict, 'no');
  assert.match(scoreLead({ ...LUMI, niche: 'excluded' }).reject, /Ринок/);
  assert.match(scoreLead({ ...LUMI, hasSite: false }).reject, /сайту/);
  assert.match(scoreLead({ ...LUMI, text: 'We need guaranteed ROAS of 5' }).reject, /гарант/i);
  assert.match(scoreLead({ ...LUMI, text: 'looking for a logo design' }).reject, /не продаємо/);
  const bad = scoreLead({ ...LUMI, upwork: { ...LUMI.upwork, paymentVerified: false } });
  assert.equal(bad.verdict, 'no'); assert.equal(bad.score, 0); assert.match(bad.reject, /Upwork/);
});
await test('score: a weak Upwork client (no spend history, rating below 4, 15+ proposals) is never «ok» on its own', () => {
  for (const up of [{ totalSpentUsd: 0 }, { rating: 3.5 }, { proposals: 20 }]) {
    const r = scoreLead({ ...LUMI, upwork: { ...LUMI.upwork, ...up } });
    assert.equal(r.score, 90); assert.equal(r.verdict, 'ask'); assert.ok(r.flags.length >= 1);
  }
});
await test('score: money and markets are read sensibly (currencies to dollars, tier of a country by name in two languages)', () => {
  assert.equal(toUsd(100000, 'UAH'), 2400); assert.equal(toUsd(0, 'USD'), null); assert.equal(toUsd('abc'), null);
  assert.equal(marketOf('United States'), 'tier1'); assert.equal(marketOf('Британія'), 'tier1'); assert.equal(marketOf('Німеччина'), 'tier2'); assert.equal(marketOf('Nepal'), 'other'); assert.equal(marketOf(''), 'unknown');
});

await test('cases: only published cases, by niche; education has none and the agent must say so', () => {
  assert.equal(pickCase({ subniche: 'education', niche: 'education' }), null);
  assert.equal(pickCase({ subniche: 'info', niche: 'education' }), null);
  assert.equal(pickCase({ subniche: 'events', niche: 'leadgen' }).client, 'Oysters XO');
  assert.equal(pickCase({ subniche: 'furniture', niche: 'ecommerce' }).client, 'HumanCentric');
  assert.equal(pickCase({ subniche: 'jewelry', niche: 'ecommerce', channel: 'meta' }).client, 'MellowDiamond');
  assert.equal(pickCase({ subniche: 'fashion', niche: 'ecommerce', channel: 'google' }).client, 'byMe');
  assert.equal(pickCase({ subniche: 'other', niche: 'ecommerce' }).client, 'MellowDiamond'); // the closest published one for a shop
  assert.equal(pickCase({ subniche: 'other', niche: 'other' }), null);
  assert.match(caseFacts(CASES.mellowdiamond, 'en'), /−34%/);
});

const GOOD = "Hi Sarah, I looked at lumicandles.com before writing. Your checkout sends no Purchase event to Meta, so campaigns optimise on add-to-cart instead of sales. We recently cut cost per purchase by 34% for a US DTC brand on Meta, starting from the same kind of audit. I can send a one-page list of what I would check first, or we can do a 15-minute call. Mon'Archi team";
await test('draft: a good letter passes (numbers from the chosen case, «15-minute», signature)', () => {
  const r = checkDraft(GOOD, { caseKey: 'mellowdiamond', allowedText: [] });
  assert.deepEqual(r.issues, []); assert.ok(r.ok); assert.ok(r.words <= MAX_WORDS);
});
await test('draft: every rule breaks a text: length, guarantee, price, emoji, shouting, foreign numbers, other clients', () => {
  const codes = (t, o = { caseKey: 'mellowdiamond' }) => checkDraft(t, o).issues.map((i) => i.code);
  assert.ok(codes(Array(130).fill('word').join(' ')).includes('too_long'));
  assert.ok(codes('Short.').includes('too_short'));
  assert.ok(codes(GOOD + ' We guarantee results.').includes('guarantee'));
  assert.ok(codes(GOOD + ' Our pricing starts low.').includes('price'));
  assert.ok(codes(GOOD + ' 🚀').includes('emoji'));
  assert.ok(codes(GOOD + ' Great! Really great!').includes('exclaim'));
  assert.ok(codes(GOOD + ' We raised ROAS by 412% for them.').includes('numbers'));
  assert.ok(codes(GOOD + ' Also HumanCentric did well.').includes('other_client'));
  assert.ok(codes('Hello there, this message has enough words to pass the length check and it names MellowDiamond which was not chosen at all for this lead.', { caseKey: null }).includes('case_not_allowed'));
});
await test('draft: numbers of the observation and the lead\'s own words are allowed, small numbers and units too', () => {
  const t = 'Hi, your page lists 4 products with 1 800 UAH average order and 3 days delivery, which is what I would audit first with a 20-minute look at the account, nothing more.';
  assert.deepEqual(checkDraft(t, { caseKey: null, allowedText: ['average order 1800 UAH'] }).issues.map((i) => i.code), []);
});
await test('draft: language by market (Ukraine → Ukrainian, others → English, a lead\'s own language wins) and the opt-out footer only for email', () => {
  assert.equal(languageFor({ country: 'Україна' }), 'uk'); assert.equal(languageFor({ country: 'Poland' }), 'en'); assert.equal(languageFor({ country: 'USA', leadLanguage: 'uk' }), 'uk');
  assert.match(withFooter('Body', { channel: 'email', lang: 'en' }), /reply "no"/); assert.equal(withFooter('Body', { channel: 'linkedin' }), 'Body');
  assert.match(withFooter('Body', { channel: 'email', lang: 'uk' }), /більше не писатиму/);
  assert.equal(wordCount("It's a 15-minute call"), 4);
  assert.equal(stripFooter(withFooter('Body.', { channel: 'email', lang: 'uk' })), 'Body.'); assert.equal(stripFooter('Only body'), 'Only body'); assert.ok(FOOTERS.en && FOOTERS.uk);
});
await test('draft: follow-ups after 3 and 7 days from the day it was sent; sensitive topics are recognised', () => {
  assert.deepEqual(followUpDates('2026-11-30T10:00:00Z'), ['2026-12-03', '2026-12-07']);
  assert.ok(isSensitive('What is your price?')); assert.ok(isSensitive('Надішліть договір')); assert.ok(!isSensitive('Thanks, Tuesday works'));
});

const READY = (key, over = {}) => ({ ...actionOf(key), ready: true, ...over }); // an action whose way to send is built (the future sender)
await test('autonomy: step 1 sends nothing, so every action is level 0 and says why; the platform rules are kept for the day a sender exists', () => {
  for (const a of ACTIONS) { const l = levelsFor(a.key, { level: 2 }); assert.deepEqual(l.allowed, [0], a.key); assert.equal(l.level, 0); assert.ok(l.locked[1] && l.locked[2], a.key + ' says why'); }
  assert.match(levelsFor('email_outreach').locked[1], /пошти/); assert.match(levelsFor('linkedin_message').locked[1], /LinkedIn забороняє/); assert.match(levelsFor('upwork_proposal').locked[2], /Upwork забороняє/); assert.match(levelsFor('social_post').locked[1], /доступ/);
  // once a sender exists: LinkedIn and Upwork stay at level 0 (the platforms forbid bots), email may go to 1, and to 2 only after 20 good drafts and the person's yes
  assert.deepEqual(levelsFor(READY('linkedin_message', { maxLevel: 1 }), { level: 2 }).allowed, [0, 1]);
  let rec = { streak: 0, unlockedAuto: false };
  assert.deepEqual(levelsFor(READY('email_outreach'), { record: rec }).allowed, [0, 1]); assert.match(levelsFor(READY('email_outreach'), { record: rec }).locked[2], /0 із 20/);
  for (let i = 0; i < UNLOCK_AFTER; i += 1) rec = recordDecision(rec, { approved: true, edited: false });
  assert.ok(canUnlockAuto(rec)); assert.deepEqual(levelsFor(READY('email_outreach'), { record: rec }).allowed, [0, 1]); // unlocked only by the person's yes
  assert.deepEqual(levelsFor(READY('email_outreach'), { record: { ...rec, unlockedAuto: true }, level: 2 }).allowed, [0, 1, 2]);
  assert.equal(actionOfChannel('upwork'), 'upwork_proposal'); assert.equal(actionOfChannel('linkedin'), 'linkedin_message'); assert.equal(actionOfChannel('email'), 'email_outreach');
});
await test('autonomy: one edit or one rejection breaks the streak', () => {
  const rec = { streak: 19, unlockedAuto: false };
  assert.equal(recordDecision(rec, { approved: true, edited: true }).streak, 0);
  assert.equal(recordDecision(rec, { approved: false, edited: false }).streak, 0);
  assert.equal(recordDecision(rec, { approved: true, edited: false }).streak, 20);
});
await test('autonomy: the mode of a message: with no sender everything is «prepare»; with a sender, level 2 still waits for a click when the text is sensitive, the day limit is used or it is a quiet hour; a stop holds everything', () => {
  assert.equal(sendMode('email_outreach', { level: 2, record: { streak: 25, unlockedAuto: true } }).mode, 'prepare');
  const action = READY('email_outreach'), on = { action, level: 2, record: { streak: 25, unlockedAuto: true } };
  assert.equal(sendMode('email_outreach', { ...on, text: 'Hello, thanks for your reply.' }).mode, 'auto');
  assert.equal(sendMode('email_outreach', { ...on, text: 'Here is our price list' }).mode, 'one_click');
  assert.equal(sendMode('email_outreach', { ...on, sentToday: 10 }).mode, 'one_click');
  assert.equal(sendMode('email_outreach', { ...on, quiet: true }).mode, 'one_click');
  assert.equal(sendMode('email_outreach', { ...on, stopped: true }).held[0], 'Команду зупинено');
  assert.equal(sendMode('linkedin_message', { action: READY('linkedin_message', { maxLevel: 1 }), level: 1 }).mode, 'one_click'); assert.equal(sendMode('linkedin_message', { action: READY('linkedin_message', { maxLevel: 1 }), level: 2 }).mode, 'prepare');
  assert.ok(isQuietHour(new Date('2026-11-30T22:30:00Z'), 'UTC')); assert.ok(!isQuietHour(new Date('2026-11-30T12:00:00Z'), 'UTC')); assert.ok(isQuietHour(new Date('2026-11-30T05:00:00Z'), 'UTC'));
  assert.equal(ACTIONS.length, 4);
});

const LEADS = [
  { id: 'a', name: 'Lumi', status: 'draft', verdict: 'ok', created_at: '2026-11-25T10:00:00Z' },
  { id: 'b', name: 'Kovalski', status: 'scored', verdict: 'ask', created_at: '2026-11-25T11:00:00Z' },
  { id: 'c', name: 'Brightside', status: 'sent', verdict: 'ok', sent_at: '2026-11-20T10:00:00Z', created_at: '2026-11-18T10:00:00Z' },
  { id: 'd', name: 'Hana', status: 'replied', verdict: 'ok', sent_at: '2026-11-19T10:00:00Z', replied_at: '2026-11-22T10:00:00Z', created_at: '2026-11-17T10:00:00Z' },
  { id: 'e', name: 'Sklep', status: 'won', verdict: 'ok', sent_at: '2026-10-01T10:00:00Z', replied_at: '2026-10-03T10:00:00Z', created_at: '2026-09-28T10:00:00Z' },
  { id: 'f', name: 'NordCoin', status: 'rejected', verdict: 'no', created_at: '2026-11-25T09:00:00Z' },
  { id: 'g', name: 'Verde', status: 'new', verdict: null, created_at: '2026-11-26T09:00:00Z' },
];
const DRAFTS = [
  { id: 1, lead_id: 'a', kind: 'letter', status: 'pending', created_at: '2026-11-25T10:05:00Z' },
  { id: 2, lead_id: 'd', kind: 'reply', status: 'pending', created_at: '2026-11-22T11:00:00Z' },
  { id: 3, lead_id: 'f', kind: 'letter', status: 'pending', created_at: '2026-11-25T09:05:00Z' }, // the lead was rejected: no decision for it
];
await test('flow: the queue puts leads to decide first, then letters, then replies, and skips ended leads', () => {
  const q = buildQueue({ leads: LEADS, drafts: DRAFTS });
  assert.deepEqual(q.map((x) => x.kind), ['lead', 'letter', 'reply']); assert.deepEqual(q.map((x) => x.leadId), ['b', 'a', 'd']);
});
await test('flow: the path counts (found 7, fit 5, wrote 3, replied 2, won 1) and the capsules in plain words', () => {
  assert.deepEqual(funnel(LEADS), { found: 7, fit: 5, wrote: 3, replied: 2, won: 1 });
  assert.equal(capsuleOf(LEADS[3], DRAFTS).label, 'Відповів: чекає вас'); assert.equal(capsuleOf(LEADS[0], DRAFTS).label, 'Лист чекає вас'); assert.equal(capsuleOf(LEADS[1], []).tone, 'warn');
  assert.deepEqual(monthStats(LEADS, new Date('2026-11-27T00:00:00Z')), { newThisMonth: 6, sent: 3, replied: 2 });
});
await test('flow: follow-ups come due 3 and 7 days after sending, at most two, none after a reply; the source is guessed from the link', () => {
  assert.deepEqual(followUpsDue(LEADS, [], '2026-11-24'), [{ leadId: 'c', step: 1, dueOn: '2026-11-23' }]);
  assert.deepEqual(followUpsDue(LEADS, [{ lead_id: 'c', kind: 'followup', status: 'sent' }], '2026-11-26'), []); // 2nd is due on the 27th
  assert.deepEqual(followUpsDue(LEADS, [{ lead_id: 'c', kind: 'followup', status: 'sent' }], '2026-11-27').map((x) => x.step), [2]);
  assert.deepEqual(followUpsDue(LEADS, [{ lead_id: 'c', kind: 'followup', status: 'sent' }, { lead_id: 'c', kind: 'followup', status: 'sent' }], '2026-12-30'), []);
  assert.equal(classifySource('https://www.linkedin.com/in/x'), 'linkedin'); assert.equal(classifySource('https://upwork.com/jobs/~01'), 'upwork'); assert.equal(classifySource('hello'), 'manual');
  assert.equal(firstUrl('see https://x.example/a?b=1, ok'), 'https://x.example/a?b=1,');
});
await test('flow: the code watches quiet deals (open, no change of stage for 7 days)', () => {
  const deals = [{ id: 1, title: 'old', stage_changed_at: '2026-11-01T00:00:00Z' }, { id: 2, title: 'fresh', stage_changed_at: '2026-11-25T00:00:00Z' }, { id: 3, title: 'closed', closed_at: '2026-11-02', stage_changed_at: '2026-11-01T00:00:00Z' }, { id: 4, title: 'arch', archived: true, stage_changed_at: '2026-11-01T00:00:00Z' }];
  assert.deepEqual(staleDeals(deals, { days: 7, now: new Date('2026-11-27T00:00:00Z') }).map((d) => [d.id, d.quietDays]), [[1, 26]]);
});
await test('site findings: only facts the code read; a Tag Manager container hides the «no pixel» claim; nothing is said about a site that was not read', () => {
  assert.deepEqual(detectTags('<script>fbq("init","1")</script><script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1"></script>'), { meta_pixel: true, ga: true, gtm: false });
  assert.equal(detectTags('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCD12"></script>').gtm, true);
  const home = { kind: 'home', ok: true, signals: { viewport: false, phone_link: false, email_link: false, messengers: [], images: 20, lazy_images: 0, forms: 0, returns_words: [], review_words: [] } };
  const prod = { kind: 'product', ok: true, signals: { structured: ['Organization'], returns_words: [], review_words: [], forms: 0 } };
  const ids = (o) => siteFindings(o).map((f) => f.id);
  assert.deepEqual(ids({ pages: [home, prod], tags: { meta_pixel: false, ga: false, gtm: false } }), ['no_viewport', 'no_meta_pixel', 'no_analytics', 'no_product_schema', 'no_returns_info', 'no_reviews', 'no_contact_channel', 'heavy_images', 'no_lead_form']);
  assert.ok(!ids({ pages: [home, prod], tags: { meta_pixel: false, ga: false, gtm: true } }).includes('no_meta_pixel')); // the pixel may live inside the container
  assert.deepEqual(ids({ pages: [{ kind: 'home', ok: false }], tags: null }), []);
  assert.deepEqual(ids({ pages: [home], tags: null }).filter((x) => x.startsWith('no_meta')), []); // tags unknown: no claim
});
await test('analyst answer: every quote is checked against the text; invented budget, ad spend and problem are dropped with a reason', () => {
  const lead = 'We run Meta ads for our candle shop, ROAS dropped to 1.2 last month. Budget is $2,000 per month. Based in the USA.';
  const good = { niche: 'ecommerce', subniche: 'home', pays_ads: 'yes', pays_ads_quote: 'We run Meta ads', budget_amount: 2000, budget_currency: 'usd', budget_quote: 'Budget is $2,000 per month', problem_quote: 'ROAS dropped to 1.2 last month', channel: 'meta', finding_id: 'no_viewport', country: 'USA' };
  const ok = checkAnalystAnswer(good, { leadText: lead, findingIds: ['no_viewport'] });
  assert.deepEqual([ok.fields.paysAds, ok.fields.budget_amount, ok.fields.budget_currency, ok.fields.problemNamed, ok.fields.finding_id, ok.dropped.length], ['yes', 2000, 'USD', true, 'no_viewport', 0]);
  const bad = checkAnalystAnswer({ ...good, pays_ads_quote: 'They spend a lot on ads', budget_quote: 'Budget is $5,000 per month', problem_quote: 'conversion is terrible', niche: 'candles', finding_id: 'made_up' }, { leadText: lead, findingIds: ['no_viewport'] });
  assert.deepEqual([bad.fields.paysAds, bad.fields.budget_amount, bad.fields.problemNamed, bad.fields.finding_id, bad.fields.niche], ['unknown', null, false, null, 'other']);
  assert.equal(bad.dropped.length, 4);
  assert.deepEqual(parseJsonLoose('Here you go:\n```json\n{"a":1}\n```'), { a: 1 }); assert.equal(parseJsonLoose('no json'), null);
  assert.equal(parseAuthorAnswer('{"body":"  "}'), null); assert.equal(parseAuthorAnswer('{"subject":"Hi","body":"Text"}').subject, 'Hi');
});

// ---- the pipeline with a stand-in model and a stand-in site (no network, no database)
const PAGES = [{ kind: 'home', ok: true, signals: { viewport: true, cart_link: true, phone_link: true, email_link: true, messengers: [], images: 5, lazy_images: 5, forms: 1, h1: ['Candles'], returns_words: ['returns'], review_words: ['reviews'] } }, { kind: 'product', ok: true, signals: { structured: ['Product'], returns_words: [], review_words: [], forms: 0 } }];
const SITE = { url: 'https://lumicandles.com/', pages: PAGES, tags: { meta_pixel: false, ga: true, gtm: false }, site: { url: 'https://lumicandles.com/', title: 'Lumi Candles', description: 'Handmade candles', h1: ['Candles'], text: 'Handmade soy candles. Free shipping.' } };
const UPWORK_TEXT = 'Need a Meta Ads expert for our candle shop https://lumicandles.com. We run Meta ads now, ROAS dropped to 1.2. Budget is $2,000 per month. Payment method verified. Total spent $12,000. Rating 4.9. Proposals: 8. Location: USA.';
const analystJson = (over = {}) => JSON.stringify({ company: 'Lumi Candles', country: 'USA', niche: 'ecommerce', subniche: 'other_ecom', pays_ads: 'yes', pays_ads_quote: 'We run Meta ads now', budget_amount: 2000, budget_currency: 'USD', budget_quote: 'Budget is $2,000 per month', problem_quote: 'ROAS dropped to 1.2', asks_guarantee: false, out_of_scope: false, language: 'en', channel: 'meta', finding_id: 'no_meta_pixel', upwork_payment_verified: true, upwork_payment_quote: 'Payment method verified', upwork_total_spent_usd: 12000, upwork_spent_quote: 'Total spent $12,000', upwork_rating: 4.9, upwork_rating_quote: 'Rating 4.9', upwork_proposals: 8, upwork_proposals_quote: 'Proposals: 8', ...over });
const LETTER = JSON.stringify({ subject: null, body: "Hi, I looked at lumicandles.com before writing. I could not find the Meta Pixel loading on your home page, which makes it hard for campaigns to learn from sales. We recently cut MellowDiamond's cost per purchase by 34% on Meta, starting from the same kind of audit. I can send a one-page list of what I would check first, or we can do a 15-minute call. Mon'Archi team" });
function crew({ analyst = analystJson(), author = [LETTER], site = SITE, settings = {} } = {}) {
  const repo = createMemoryGrRepo({ settings, brand: { voice: 'Direct', donts: 'No hype' } });
  const calls = []; let a = 0;
  const deps = { readSite: async (u) => { calls.push('site:' + u); if (site instanceof Error) throw site; return site; }, ask: async ({ agentKey }) => { calls.push(agentKey); if (agentKey === 'gr-analyst') return { text: analyst, costUsd: 0.01 }; return { text: author[Math.min(a++, author.length - 1)], costUsd: 0.02 }; } };
  return { repo, deps, calls };
}
const newLead = (repo, row) => repo.insertLead({ name: 'Lead', source: 'upwork', raw_text: UPWORK_TEXT, ...row });

await test('pipeline: a good Upwork lead is scored 90, gets the case, the finding and a pending letter; the journal has two runs with their cost', async () => {
  const { repo, deps, calls } = crew();
  const l = await newLead(repo); const out = await processLead({ repo, leadId: l.id, deps });
  assert.deepEqual([out.status, out.verdict, out.score, out.case_key, out.finding_id, out.website], ['draft', 'ok', 90, 'mellowdiamond', 'no_meta_pixel', 'https://lumicandles.com']);
  assert.deepEqual(calls, ['site:https://lumicandles.com', 'gr-analyst', 'gr-author']);
  assert.equal(repo.T.drafts.length, 1); const d = repo.T.drafts[0];
  assert.deepEqual([d.status, d.kind, d.channel, d.lang, d.issues.length, d.case_key], ['pending', 'letter', 'upwork', 'en', 0, 'mellowdiamond']);
  assert.ok(!/reply "no"/.test(d.body), 'no opt-out footer outside email');
  assert.equal(repo.T.runs.length, 2); assert.ok(Math.abs(await repo.monthSpend() - 0.03) < 1e-9);
  assert.equal(websiteOf({ raw_text: 'see https://www.linkedin.com/in/x and https://shop.example/a.' }), 'https://shop.example/a');
});
await test('pipeline: a letter by email gets the opt-out line added by code (not counted in the words)', async () => {
  const { repo, deps } = crew({ analyst: analystJson({ company: 'Brightside' }) });
  const l = await newLead(repo, { source: 'site', raw_text: 'Hi, we sell apparel at https://brightside.example, ads stopped working. We run Meta ads now. Budget is $2,000 per month.', website: null });
  await processLead({ repo, leadId: l.id, deps }); const d = repo.T.drafts[0];
  assert.equal(d.channel, 'email'); assert.match(d.body, /reply "no"/); assert.ok(d.words < 120);
});
await test('pipeline: the verdict «ask» stops before the letter and waits for the person; the missing facts are named', async () => {
  const { repo, deps, calls } = crew({ analyst: analystJson({ pays_ads: 'unknown', pays_ads_quote: null, budget_amount: null, budget_quote: null, niche: 'leadgen', subniche: 'services', upwork_payment_verified: null }) });
  const l = await newLead(repo, { source: 'site' }); const out = await processLead({ repo, leadId: l.id, deps });
  assert.deepEqual([out.status, out.verdict], ['scored', 'ask']); assert.equal(repo.T.drafts.length, 0); assert.ok(!calls.includes('gr-author'));
  assert.ok(out.missing.includes('рекламний бюджет'));
});
await test('pipeline: a lead from the grey market is refused by code without a letter, and a lead without a site is refused without reading anything', async () => {
  let c = crew({ analyst: analystJson({ niche: 'excluded' }) });
  let l = await newLead(c.repo); let out = await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.deepEqual([out.status, out.score], ['rejected', 0]); assert.match(out.reject_reason, /Ринок/); assert.equal(c.repo.T.drafts.length, 0);
  c = crew(); l = await newLead(c.repo, { raw_text: 'We need a Meta Ads expert, no site yet.' }); out = await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.equal(out.status, 'rejected'); assert.match(out.reject_reason, /сайту/); assert.ok(!c.calls.some((x) => x.startsWith('site:')));
});
await test('pipeline: a site that cannot be read does not reject the lead: it asks the person (flag), and Upwork without a verified payment in the text asks too', async () => {
  let c = crew({ site: new Error('timeout') });
  let l = await newLead(c.repo); let out = await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.deepEqual([out.status, out.verdict], ['scored', 'ask']); assert.ok(out.flags.some((f) => /Сайт не вдалося прочитати/.test(f)));
  c = crew({ analyst: analystJson({ upwork_payment_verified: null, upwork_payment_quote: null }) }); l = await newLead(c.repo); out = await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.equal(out.verdict, 'ask'); assert.ok(out.flags.some((f) => /Upwork: оплату/.test(f)));
});
await test('pipeline: what the model invents is not trusted: a budget with a quote that is not in the text is dropped and named', async () => {
  const { repo, deps } = crew({ analyst: analystJson({ budget_amount: 9000, budget_quote: 'Budget is $9,000 per month' }) });
  const l = await newLead(repo); const out = await processLead({ repo, leadId: l.id, deps });
  assert.equal(out.budget_usd, null); assert.ok(out.flags.some((f) => /Не прийнято від Аналітика: бюджет/.test(f)));
});
await test('pipeline: the stop and the month budget hold the work BEFORE the model is called; a broken answer marks the lead failed with the reason', async () => {
  let c = crew({ settings: { stopped: true } }); let l = await newLead(c.repo);
  await assert.rejects(() => processLead({ repo: c.repo, leadId: l.id, deps: c.deps }), (e) => e instanceof HeldError && e.kind === 'stopped'); assert.deepEqual(c.calls, []); assert.equal((await c.repo.getLead(l.id)).status, 'new');
  c = crew({ settings: { monthly_budget_usd: 0.05 } }); l = await newLead(c.repo); c.repo.T.runs.push({ cost_usd: 0.05 });
  await assert.rejects(() => analyseLead({ repo: c.repo, leadId: l.id, deps: c.deps }), (e) => e instanceof HeldError && e.kind === 'budget'); assert.deepEqual(c.calls, []);
  c = crew({ analyst: 'sorry, no json' }); l = await newLead(c.repo); const out = await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.equal(out.status, 'failed'); assert.match(out.error, /JSON/); assert.equal(c.repo.T.runs.at(-1).status, 'failed');
});
await test('pipeline: a letter that breaks the rules is rewritten once; one that still breaks them is saved WITH its issues for the person to fix', async () => {
  const bad = JSON.stringify({ body: "Hi, we guarantee results and we cut cost per purchase by 412% for HumanCentric. Let us talk about our price. Mon'Archi team. More words to pass the minimum length of the message so only the rules break here." });
  let c = crew({ author: [bad, LETTER] }); let l = await newLead(c.repo); await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.equal(c.calls.filter((x) => x === 'gr-author').length, 2); assert.equal(c.repo.T.drafts[0].issues.length, 0);
  c = crew({ author: [bad, bad] }); l = await newLead(c.repo); await processLead({ repo: c.repo, leadId: l.id, deps: c.deps });
  assert.ok(c.repo.T.drafts[0].issues.length >= 3, JSON.stringify(c.repo.T.drafts[0].issues)); assert.equal((await c.repo.getLead(l.id)).status, 'draft');
});
await test('pipeline: a reply is a draft of its own kind; the incoming words of the lead may be quoted back', async () => {
  const { repo, deps } = crew({ author: [JSON.stringify({ body: "Hi Hana, thanks for the quick answer. Before any terms I would like to look at your Meta account for 20 minutes, so what I say is specific to you. Would Tuesday or Wednesday work for a short call? Mon'Archi team" })] });
  const l = await newLead(repo, { source: 'linkedin', status: 'replied', case_key: null, country: 'Germany' });
  const d = await writeDraft({ repo, leadId: l.id, deps, kind: 'reply', incoming: 'Interesting, please send the terms. We spend about 3500 EUR a month.' });
  assert.deepEqual([d.kind, d.status, d.channel], ['reply', 'pending', 'linkedin']); assert.equal((await repo.getLead(l.id)).status, 'replied');
});
await test('the server side of the growth team is wired: the endpoint needs a signed-in person, the migration has RLS and no delete rights, nothing reaches the client agents', () => {
  const ep = fs.readFileSync(path.join(root, 'api/gr.js'), 'utf8'), mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261076000000_growth_team.sql'), 'utf8');
  assert.match(ep, /auth\.getUser\(token\)/); assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /HeldError/); assert.ok(!/wf_runs|enqueue/.test(ep));
  for (const t of ['gr_settings', 'gr_leads', 'gr_drafts', 'gr_runs']) assert.match(mig, new RegExp(`alter table public.${t} enable row level security`));
  assert.ok(!/grant[^;]*delete/i.test(mig) && !/for delete/i.test(mig)); assert.match(mig, /revoke all on public\.gr_settings[^;]*anon/);
  assert.match(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'), /api\/gr\.js/);
});

await test('the window «Зростання»: a tab after «Огляд проєктів» and a quick button with its own badge, a dark window, its own sheets keep Esc, the dev fixture never reaches the production build', () => {
  const home = fs.readFileSync(path.join(root, 'src/pages/AiAgents/AiAgentsHome.jsx'), 'utf8'), win = fs.readFileSync(path.join(root, 'src/pages/AiAgents/AiWindow.jsx'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'src/pages/AiAgents/Growth.jsx'), 'utf8'), api = fs.readFileSync(path.join(root, 'src/lib/api/growth.js'), 'utf8');
  assert.match(home, /growth: \{ title: "Зростання Mon'Archi", Page: Growth, dark: true \}/);
  assert.equal((home.match(/openWin\('growth'\)/g) || []).length, 2, 'the tab and the quick button');
  assert.match(home, /openWin\('overview'\)\}>Огляд проєктів<\/button>\s*<button type="button" className=\{'aia-tab' \+ \(win === 'growth'/, 'the tab stands right after «Огляд проєктів»');
  assert.match(home, /dark=\{!!WINDOWS\[win\]\.dark\}/); assert.match(win, /is-dark/); assert.match(win, /\.gr-ov/);
  assert.match(api, /import\.meta\.env\.DEV[\s\S]*fixtureApi/, 'the fixture is loaded only by a dev server');
  assert.ok(!/workflow\//.test(page.replace(/\/\/.*$/gm, '')) && !/api\/_lib/.test(page), 'the page does not touch the client agents');
  assert.match(page, /key=\{draft\.id \+ ':' \+ draft\.body\}/); // a new text starts a fresh editor
  assert.match(page, /issues\.length > 0/); // an approval is blocked while the text breaks a rule
  assert.match(page, /Ціни, знижки, договірні умови й скарги завжди тільки з вашим підтвердженням/);
});
await test('the growth modules are pure: no network, no database, no browser, no import from the client agents', () => {
  for (const f of ['icp', 'cases', 'draftRules', 'autonomy', 'leadFlow', 'siteFindings', 'prompts']) {
    const t = fs.readFileSync(path.join(root, `src/lib/growth/${f}.js`), 'utf8');
    assert.ok(!/\b(fetch|supabase|window|document|localStorage)\b/.test(t.replace(/\/\/.*$/gm, '')), f + ' is pure');
    assert.ok(!/workflow\//.test(t.replace(/\/\/.*$/gm, '')), f + ' does not touch the client agents');
  }
});

console.log(`\n${passed} growth checks passed`);
