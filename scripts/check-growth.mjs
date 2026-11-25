// Checks of the internal growth team (docs/growth-workflow.md): the score of a lead, the choice of a case, the rules of a message, the levels of automation, the journey of a lead.
// Pure code, no network and no database. Run:  node scripts/check-growth.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_BUDGET_USD, THRESHOLDS, marketOf, scoreLead, toUsd } from '../src/lib/growth/icp.js';
import { CASES, caseFacts, pickCase } from '../src/lib/growth/cases.js';
import { MAX_WORDS, checkDraft, followUpDates, isSensitive, languageFor, withFooter, wordCount } from '../src/lib/growth/draftRules.js';
import { ACTIONS, UNLOCK_AFTER, canUnlockAuto, isQuietHour, levelsFor, recordDecision, sendMode } from '../src/lib/growth/autonomy.js';
import { buildQueue, capsuleOf, classifySource, firstUrl, followUpsDue, funnel, monthStats, staleDeals } from '../src/lib/growth/leadFlow.js';

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
});
await test('draft: follow-ups after 3 and 7 days from the day it was sent; sensitive topics are recognised', () => {
  assert.deepEqual(followUpDates('2026-11-30T10:00:00Z'), ['2026-12-03', '2026-12-07']);
  assert.ok(isSensitive('What is your price?')); assert.ok(isSensitive('Надішліть договір')); assert.ok(!isSensitive('Thanks, Tuesday works'));
});

await test('autonomy: LinkedIn and Upwork never go above level 1, social posts wait for the API, email level 2 needs 20 good drafts and the person\'s yes', () => {
  assert.deepEqual(levelsFor('linkedin_message', { level: 2 }).allowed, [0, 1]);
  assert.equal(levelsFor('linkedin_message', { level: 2 }).level, 0); // a forbidden level falls back to 0
  assert.deepEqual(levelsFor('upwork_proposal').allowed, [0, 1]);
  assert.deepEqual(levelsFor('social_post').allowed, [0]); assert.match(levelsFor('social_post').locked[1], /доступ/);
  let rec = { streak: 0, unlockedAuto: false };
  assert.deepEqual(levelsFor('email_outreach', { record: rec }).allowed, [0, 1]); assert.match(levelsFor('email_outreach', { record: rec }).locked[2], /0 із 20/);
  for (let i = 0; i < UNLOCK_AFTER; i += 1) rec = recordDecision(rec, { approved: true, edited: false });
  assert.ok(canUnlockAuto(rec)); assert.deepEqual(levelsFor('email_outreach', { record: rec }).allowed, [0, 1]); // unlocked only by the person's yes
  assert.deepEqual(levelsFor('email_outreach', { record: { ...rec, unlockedAuto: true }, level: 2 }).allowed, [0, 1, 2]);
});
await test('autonomy: one edit or one rejection breaks the streak', () => {
  let rec = { streak: 19, unlockedAuto: false };
  assert.equal(recordDecision(rec, { approved: true, edited: true }).streak, 0);
  assert.equal(recordDecision(rec, { approved: false, edited: false }).streak, 0);
  assert.equal(recordDecision(rec, { approved: true, edited: false }).streak, 20);
});
await test('autonomy: the mode of a message: level 2 still waits for a click when the text is sensitive, the day limit is used or it is a quiet hour; a stop holds everything', () => {
  const on = { level: 2, record: { streak: 25, unlockedAuto: true } };
  assert.equal(sendMode('email_outreach', { ...on, text: 'Hello, thanks for your reply.' }).mode, 'auto');
  assert.equal(sendMode('email_outreach', { ...on, text: 'Here is our price list' }).mode, 'one_click');
  assert.equal(sendMode('email_outreach', { ...on, sentToday: 10 }).mode, 'one_click');
  assert.equal(sendMode('email_outreach', { ...on, quiet: true }).mode, 'one_click');
  assert.equal(sendMode('email_outreach', { ...on, stopped: true }).held[0], 'Команду зупинено');
  assert.equal(sendMode('linkedin_message', { level: 1 }).mode, 'one_click'); assert.equal(sendMode('linkedin_message', { level: 2 }).mode, 'prepare');
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
await test('the growth modules are pure: no network, no database, no browser, no import from the client agents', () => {
  for (const f of ['icp', 'cases', 'draftRules', 'autonomy', 'leadFlow']) {
    const t = fs.readFileSync(path.join(root, `src/lib/growth/${f}.js`), 'utf8');
    assert.ok(!/\b(fetch|supabase|window|document|localStorage)\b/.test(t.replace(/\/\/.*$/gm, '')), f + ' is pure');
    assert.ok(!/workflow\//.test(t.replace(/\/\/.*$/gm, '')), f + ' does not touch the client agents');
  }
});

console.log(`\n${passed} growth checks passed`);
