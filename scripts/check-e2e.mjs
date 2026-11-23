// THE END-TO-END RUN of the new agent system: one project goes through the whole process of the document with the REAL orchestrator, the REAL machine, the REAL handlers of all five agents
// and the REAL automatic check; only the outside world is replaced by plausible stand-ins: the websites, Meta (reading and writing), the model, the picture generator, the clock.
// The manager is played by this script: it writes the brief, confirms payment and contracts, returns Апрув 1 once (with remarks pinned to a creative and a block), approves, records the
// answer of the client, approves the launch. What is checked: every stage is reached, no run fails, every section of the dossier is written, the approvals go in the right order,
// the launch creates the objects in the cabinet exactly once, the optimiser and the Support agent work after the launch, the pool of tasks and the journal tell the story.
// Run:  node scripts/check-e2e.mjs
import assert from 'node:assert/strict';
import { createMemoryWfRepo } from './wfMemoryRepo.mjs';
import { processTick } from '../api/_lib/wf/tick.js';
import { createRealHandlers } from '../api/_lib/wf/agents.js';
import { createValidator } from '../api/_lib/wf/check.js';
import { signoffWanted } from '../src/lib/workflow/view.js';

const clock = { t: new Date('2026-11-23T09:00:00Z') };
const now = () => new Date(clock.t);
const advance = (ms) => { clock.t = new Date(clock.t.getTime() + ms); };
const DAY = 864e5;
const repo = createMemoryWfRepo({ now });
let PID = 1; // the project of the story (the second story runs on project 2 in the same repo, at the same time)
const log = (...a) => console.log('   ', ...a);
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed += 1; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; throw e; } };

// ------------------------------------------------------------------------------------------------ the outside world
const PAGES = {
  'https://shop.example/': '<html><head><title>Лоза: AirPlug</title><meta name="viewport" content="width=device-width"></head><body><nav><a href="/catalog/">Каталог</a><a href="/delivery">Доставка й оплата</a><a href="/contacts">Контакти</a></nav><h1>AirPlug: тиха ніч</h1><p>AirPlug + free 50 ml oil за 150 USD. AirPlug в наявності.</p><a class="btn" href="/catalog/">Дивитись каталог</a><a href="tel:+380501112233">Подзвонити</a></body></html>',
  'https://shop.example/catalog/': '<html><head><title>Каталог</title></head><body><h1>Каталог</h1><p>AirPlug, Extrait 30 ml.</p></body></html>',
  'https://shop.example/delivery': '<html><head><title>Доставка</title></head><body><p>Нова пошта 2-3 дні. Оплата карткою.</p></body></html>',
  'https://shop.example/contacts': '<html><head><title>Контакти</title></head><body><p>Київ, вул. Дубова 1.</p></body></html>',
  'https://rival.example/': '<html><head><title>Rival</title></head><body><h1>Беруші від виробника</h1><p>Подарунок до кожного замовлення. Безкоштовна доставка.</p></body></html>',
};
const fetchFn = async (url) => {
  const u = String(url);
  if (u.startsWith('https://store.example/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  if (u.endsWith('/robots.txt')) return new Response('', { status: 404 });
  return PAGES[u] != null ? new Response(PAGES[u], { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
};
const lookup = async () => [{ address: '93.184.216.34' }];

const world = { adIds: [], writerCalls: [], hfJobs: 0, asked: [] };
const meta = {
  insights: async ({ accountId, level, increment, timeRange, breakdowns }) => {
    if (level === 'account') { // the third client has a history of ads; the others are new: nothing was ever spent, so there is no audit
      if (String(accountId) !== '77') return { rows: [] };
      const mon = (m, spend, purchases) => ({ spend, impressions: spend * 40, clicks: spend * 0.7, purchases, revenue: purchases * 150, reach: spend * 20, period: { from_date: m + '-01', to_date: m + '-28' } });
      if (increment === 'monthly') return { rows: [mon('2026-08', 1500, 20), mon('2026-09', 1800, 26), mon('2026-10', 1700, 22)] };
      return { rows: [{ ...mon('2026-08', 5000, 68), period: { from_date: '2026-08-01', to_date: '2026-10-28' } }] };
    }
    if (level === 'ad' && timeRange) return { rows: world.adIds.map((id, i) => ({ ad_id: id, name: 'Креатив ' + (i + 1), spend: 220, purchases: 4, revenue: 600, impressions: 9000, clicks: 140, reach: 5000, period: { from_date: timeRange.since, to_date: timeRange.until } })) };
    return { rows: [] };
  },
  campaigns: async () => [],
  pixels: async () => [{ id: 'px1', name: 'Main', lastFired: new Date(clock.t.getTime() - DAY).toISOString() }],
  objects: async ({ level }) => (level === 'adset' ? [] : []),
};
let idn = 0;
const rec = (name, fn) => async (a) => { world.writerCalls.push([name, a]); const id = fn(a); if (name === 'ad') world.adIds.push(id); return id; };
const metaWrite = { accountInfo: async () => ({ name: 'Monarchi test', status: 1, currency: 'USD' }), createCampaign: rec('campaign', () => 'camp' + ++idn), createAdSet: rec('adset', () => 'set' + ++idn), uploadImage: rec('image', () => 'hash' + ++idn), createAdCreative: rec('creative', () => 'cre' + ++idn), createAd: rec('ad', () => 'ad' + ++idn) };
const hf = {
  buildImageRequest: (c) => ({ path: 'fake', body: { prompt: c.prompt, ratio: c.ratio, refs: c.references } }), profile: () => ({}),
  estimate: async () => 0.4, submit: async () => ({ jobId: 'job' + ++world.hfJobs, statusUrl: 'https://api.higgsfield.ai/requests/' + world.hfJobs + '/status' }),
  check: async ({ statusUrl }) => ({ state: 'ready', url: 'https://cdn.hf.example/' + statusUrl.split('/').slice(-2)[0] + '.png' }),
};

// the model: answers every skill with a valid, plausible JSON built from the facts it was given (what a reasonable model would do), so the checks of the code are exercised for real
const factsOf = (u) => JSON.parse(u.slice(u.indexOf('{'), u.lastIndexOf('}') + 1));
const respond = (system, user, project = {}) => {
  if (system.startsWith('You are a senior conversion-rate optimisation')) return { findings: [{ area: 'terms', severity: 'high', page: '', seen: 'Умов повернення на прочитаних сторінках немає.', evidence: { kind: 'absence' }, why: 'Покупець боїться купити без повернення.', change: 'Додати сторінку «Повернення».', acceptance: 'Сторінка відкривається з підвалу.' }], ok_areas: [{ area: 'contact', note: 'Телефон є.' }], not_checked: [{ area: 'speed', reason: 'Немає ключа PageSpeed.' }] };
  if (system.startsWith('You are a senior marketing strategist building the target AUDIENCE')) return { segments: [{ name: 'Молоді родини', who: 'Пари, які облаштовують першу квартиру', situation: 'Переїзд', wants: 'Тиша вночі', pains: 'Шум сусідів', blockers: 'Не знають, чи підійде', convincers: 'Відгуки', message: 'Спокійні ночі', formats: 'Відео', products: 'AirPlug', targeting: 'Інтереси: сон, ремонт', angles: ['Тиша в новій квартирі'], confirmed_by: [{ source: 'brief', ref: 'молоді родини' }] }], questions: [] };
  if (system.startsWith('You are a senior marketing analyst studying the COMPETITORS')) return { table: [...user.matchAll(/COMPETITOR ([^\s:]+):/g)].map((m) => ({ competitor: m[1], products: 'Беруші', prices: '', offers: 'Подарунок до кожного замовлення', angles: 'Виробник', approach: 'Прямий виробник', evidence: { quote: 'Подарунок до кожного замовлення' } })), site_comparison: [], ads: [], ideas: [{ approach: 'Прямий виробник', idea: 'Показати, як роблять беруші' }] };
  if (system.startsWith('You are the creative strategist')) {
    const f = factsOf(user), seg = f.audience?.[0]?.name || '';
    const ideas = ['Тиша після переїзду', 'Подарунок до першого замовлення', 'Сон без будильника сусідів', 'Беруші для подорожей', 'Заощадити на ремонті сну', 'Відгуки тих, хто спить'].map((hook, i) => ({ hook, angle: ['тиша', 'подарунок', 'комфорт', 'подорожі', 'економія', 'відгуки'][i], format: i % 2 ? 'статика' : 'відео 9:16', segment: seg, source: i === 0 ? 'competitor' : 'own', reference: i === 0 ? 'rival.example' : '', example: 'Коротка сцена вдома', offer: i === 1 ? { name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18 } : null }));
    return { materials: { verdict: 'enough', reason: 'Є фото продукту.', have: ['Фото продукту'], missing: [], shoot_list: [] }, ideas };
  }
  if (system.startsWith('You are the creative maker')) {
    const f = factsOf(user);
    return { cards: f.goals.map((g) => ({ goal_index: g.goal_index, product: g.product || 'AirPlug', segment: f.segments?.[0]?.name || '', idea_id: f.ideas?.[0]?.id || '', angle: 'тиша', format: g.goal_index % 2 ? '4:5' : '9:16', offer: '', headline: 'Тиха ніч без турбот', primary_text: 'Спокійний сон у будь-якому місці.', cta: 'Купити', visual_prompt: 'A calm bedroom at night, the earplug case on a night table', references: [1] })) };
  }
  if (system.startsWith('You are the media strategist')) {
    const f = factsOf(user), items = f.creatives.items, seg = f.segments?.[0]?.name || '';
    const half = Math.ceil(items.length / 2);
    return { summary: 'У першому місяці продаємо AirPlug молодим родинам.', priorities: [{ product: 'AirPlug', reason: 'Найкраща маржа.' }], campaigns: [
      { name: 'Холодна: молоді родини', segments: seg ? [seg] : [], products: ['AirPlug'], share_pct: 60, why: 'Основний сегмент.', ad_groups: [{ name: 'Молоді родини', segment: seg, creative_ids: items.slice(0, half).map((c) => c.id) }] },
      { name: 'Холодна: широка', segments: [], products: ['AirPlug'], share_pct: 40, why: 'Перевірка широкої аудиторії.', ad_groups: [{ name: 'Широка аудиторія', segment: '', creative_ids: items.slice(half).map((c) => c.id) }] }],
      remarketing: { visitors: 'Нагадуємо про товар.', cart: 'Нагадуємо про кошик.', checkout: 'Допомагаємо завершити замовлення.', note: 'Після набору аудиторії.' }, seasonal: [] };
  }
  if (system.startsWith('You are a media buyer of an advertising agency writing a short')) return { explanation: 'За тиждень результат стабільний, реклама прибуткова.', highlights: ['Креативи працюють'], next_steps: ['Лишаємо як є'], draft: 'Добрий день! Результати за тиждень у вкладенні.' };
  throw new Error('The stand-in model does not know this skill: ' + system.slice(0, 80));
};
const ask = async ({ system, user, images }) => { world.asked.push({ system: system.slice(0, 60), images: (images || []).length }); return { text: JSON.stringify(respond(system, user)), costUsd: 0.05 }; };

// ------------------------------------------------------------------------------------------------ the manager and the drive
const ctx = { repo, handlers: createRealHandlers(), now, validate: createValidator(repo), meta, metaWrite, ask, hf, fetchFn, lookup, imageWaitMs: 0, imageStepMs: 1 };
const state = () => repo.T.states.get(PID);
const runs = (agent, skill) => repo.T.runs.filter((r) => r.agent === agent && r.skill === skill);
const pending = (kind) => repo.T.approvals.filter((a) => a.project_id === PID && a.kind === kind && a.status === 'pending').at(-1) || null;
const section = async (key) => (await repo.readSection(PID, key))?.version || null;
const dump = () => repo.T.runs.filter((r) => r.status !== 'done').map((r) => `${r.agent}/${r.skill} ${r.status}${r.error ? ': ' + r.error : ''}`).join('\n      ');
async function drive(until, what, max = 80) {
  for (let i = 0; i < max; i += 1) {
    if (until()) return i;
    await processTick(ctx);
    advance(2000);
  }
  throw new Error(`Did not reach «${what}» in ${max} passes. Stage ${state().stage}. Not finished runs:\n      ${dump() || '(none)'}\n  Journal tail: ${repo.T.journal.slice(-4).map((j) => j.action + ': ' + j.summary).join(' | ')}`);
}
const noFailed = () => { const f = repo.T.runs.filter((r) => r.status === 'failed'); assert.equal(f.length, 0, 'failed runs:\n      ' + f.map((r) => `${r.agent}/${r.skill}: ${r.error}`).join('\n      ')); };
const decide = (a, status, comment, remarks) => Object.assign(a, { status, comment: comment || null, decided_by: 'manager@example.com', decided_at: now().toISOString(), ...(remarks ? { subject: { ...(a.subject || {}), remarks } } : {}) });
const signoff = (status, comment, remarks) => repo.T.approvals.push({ id: Math.max(0, ...repo.T.approvals.map((a) => a.id)) + 1, project_id: PID, kind: 'client', subject: { section: 'strategy', ...(remarks ? { remarks } : {}) }, status, comment: comment || null, requested_by: 'manager', decided_by: 'manager@example.com', requested_at: now().toISOString(), decided_at: now().toISOString() });

// ------------------------------------------------------------------------------------------------ the story
console.log('The end-to-end run: one new client, from the brief to the optimisation\n');
await repo.ensureState(PID);
repo.setProjectInfo(PID, { name: 'Меблі Лоза', client: 'Меблі Лоза', manager: 'Олена', client_language: 'uk' });
repo.setWebsite(PID, 'https://shop.example');
repo.addAccount(PID, { platform: 'meta', account_id: '55', account_name: 'Monarchi test', currency: 'USD' });
repo.setMaterials(PID, { settings: { cta_mode: 'always', cta_text: 'Купити\nДізнатись більше', inputs: { tone: { body: 'Тепло, на «ви»' } } }, assets: [{ kind: 'logo', name: 'logo.png', url: 'https://store.example/logo.png' }, { kind: 'product', name: 'p1.jpg', url: 'https://store.example/p1.jpg' }, { kind: 'product', name: 'p2.jpg', url: 'https://store.example/p2.jpg' }] });

const BRIEF = { schema: 1,
  general: { geo: 'США', goal: '60 замовлень на місяць', priority: '', audience: 'Жінки, які купують для першої квартири, та молоді родини', competitors: 'rival.example', fb_page_id: '777000111', payment_amount: '500 USD', payment_next_date: new Date(clock.t.getTime() + 7 * DAY).toISOString().slice(0, 10), payment_period: 'щомісяця' },
  economics: { currency: 'USD', avg_order: 175, cogs_pct: 30, shipping_cost: 12, fee_pct: 3, returns_pct: 3, target_roas: 2.5, budget_monthly: 4500, min_campaign_daily: 15, site_cvr: 0.02, products: [{ name: 'AirPlug', price: 150 }], offers: [{ name: 'AirPlug + free 50 ml oil', pays: 150, list_value: 150, extra_cost: 18, approved: true }] },
  creative_goals: [{ goal: 'Продати хіт', product: 'AirPlug' }, { goal: 'Розпродаж літа', product: 'AirPlug' }] };

await step('stage 0: the brief is written, the cabinet is checked (no history: no audit), the process waits for the payment and the contracts', async () => {
  await repo.writeSectionVersion(PID, 'brief', { author_kind: 'human', author: 'manager@example.com', body: 'Бриф', content: BRIEF });
  await drive(() => state().has_data !== null, 'the intake');
  assert.equal(state().has_data, false); assert.equal(state().stage, 0, 'without the payment and the contracts the process does not start');
  await processTick(ctx); advance(2000);
  assert.equal(state().stage, 0);
});
await step('stage 1: payment and contracts confirmed: the five research skills, the materials and the ideas are made, the automatic check lets the process on', async () => {
  await repo.setProjectFlag(PID, { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() });
  await drive(() => state().stage >= 2, 'stage 2 (strategy)');
  noFailed();
  for (const k of ['site', 'audience', 'unit_economy', 'competitors', 'materials', 'ideas']) assert.ok(await section(k), `the section «${k}» is written`);
  assert.equal(await section('audit'), null, 'a new client has no audit');
  const ue = (await section('unit_economy')).content; assert.equal(ue.thresholds.breakeven_cpa, 100); assert.equal(ue.thresholds.target_cpa, 70);
  assert.equal((await section('audience')).content.segments[0].status, 'confirmed');
  assert.ok((await section('ideas')).content.items.length >= 6);
  assert.equal(repo.T.tasks.some((t) => t.created_by === 'support/onboarding'), true, 'the onboarding of the Support agent worked');
  log('research done; tasks in the pool so far:', repo.T.tasks.length);
});
await step('stage 2: the creatives come first, then the strategy; Апрув 1 is asked with the result of the automatic check', async () => {
  await drive(() => !!pending('strategy'), 'Апрув 1');
  noFailed();
  const items = (await section('creatives')).content.items; assert.equal(items.length, 2); assert.ok(items.every((c) => c.status === 'ready' && /^https:\/\/store\.example\//.test(c.image_url)), 'pictures are made and kept in our storage');
  const st = (await section('strategy')).content; assert.equal(st.version, 1); assert.equal(st.budget_monthly, 4500); assert.equal(st.geo, 'США'); assert.equal(st.campaigns.length, 2);
  assert.equal(st.campaigns.reduce((s, c) => s + c.daily_budget, 0), 150); assert.ok(st.campaigns.every((c) => c.ad_groups[0].creatives.length >= 1), 'every ad group has creatives');
  assert.ok(Array.isArray(pending('strategy').subject.warnings), 'the warnings of the check travel with the approval');
  assert.ok(runs('creator', 'first_creatives').length === 1 && runs('strategist', 'strategy').length === 1);
  const order = repo.T.runs.map((r) => `${r.agent}/${r.skill}`); assert.ok(order.indexOf('creator/first_creatives') < order.indexOf('strategist/strategy'), 'creatives before strategy');
});
await step('Апрув 1 is RETURNED with remarks pinned to one creative and to a block: only that creative is made again, the strategy goes to version 2, a new Апрув 1 is asked', async () => {
  const ap = pending('strategy');
  decide(ap, 'returned', 'Креатив і гроші', [{ target: 'creative:c2', text: 'Змінити заголовок' }, { target: 'money', text: 'Менше на широку' }]);
  const before = (await section('creatives')).content.items.map((c) => ({ ...c }));
  await drive(() => !!pending('strategy') && pending('strategy').id !== ap.id, 'the second Апрув 1');
  noFailed();
  const after = (await section('creatives')).content.items;
  assert.deepEqual(after[0], before[0], 'the first creative is untouched'); assert.equal(after[1].version, 2); assert.match(after[1].tag, /· v2$/); assert.equal(after[1].rework[0].comment, 'Змінити заголовок');
  assert.equal((await section('strategy')).content.version, 2); assert.equal(runs('creator', 'rework_creatives').length, 1);
  const order = repo.T.runs.map((r) => `${r.agent}/${r.skill}`); assert.ok(order.lastIndexOf('creator/rework_creatives') < order.lastIndexOf('strategist/strategy'), 'the creative is reworked before the strategy is refreshed');
});
await step('Апрув 1 approved, the answer of the client recorded (the creatives approved), then Апрув 2 is asked', async () => {
  decide(pending('strategy'), 'approved');
  await drive(() => !!signoffWanted(state(), repo.T.approvals), 'the answer of the client is wanted');
  assert.equal(pending('launch'), null, 'the launch is not asked before the client answered');
  signoff('approved');
  await drive(() => !!pending('launch'), 'Апрув 2');
  noFailed();
  assert.equal(world.writerCalls.length, 0, 'nothing is written to the cabinet before Апрув 2');
});
await step('Апрув 2 approved: the check before the launch passes, the cabinet gets the campaigns, ad sets and ads exactly once, the snapshot of the launch is written, the stage is the optimisation', async () => {
  decide(pending('launch'), 'approved');
  await drive(() => state().stage >= 4, 'stage 4 (optimisation)');
  noFailed();
  const calls = world.writerCalls.map((c) => c[0]);
  assert.equal(calls.filter((c) => c === 'campaign').length, 2); assert.equal(calls.filter((c) => c === 'adset').length, 2); assert.equal(calls.filter((c) => c === 'ad').length, 2); assert.equal(calls.filter((c) => c === 'creative').length, 2);
  assert.ok(world.writerCalls.filter((c) => c[0] === 'campaign').every((c) => c[1].status === 'ACTIVE'));
  const link = world.writerCalls.find((c) => c[0] === 'creative')[1].link; assert.match(link, /^https:\/\/shop\.example\/\?utm_source=facebook&utm_medium=paid&utm_campaign=/);
  assert.equal(world.writerCalls.find((c) => c[0] === 'adset')[1].dailyMinor + world.writerCalls.filter((c) => c[0] === 'adset')[1][1].dailyMinor, 15000, 'the budgets in the cabinet add up to the 150 of the strategy');
  const snap = (await section('launch')).content; assert.equal(snap.status, 'done'); assert.equal(snap.targets.target_cpa, 70); assert.equal(snap.campaigns.every((c) => c.id && c.adsets.every((a) => a.id && a.ads.every((x) => x.ad_id))), true);
  assert.equal(runs('mediabuyer', 'launch').length, 1);
  assert.ok(repo.T.journal.some((j) => j.action === 'launch'));
});
await step('stage 4: after four days the optimiser reads the cabinet and gives advice with numbers; the Support agent makes the weekly feedback and the payment reminder; the launch is not repeated', async () => {
  advance(4 * DAY);
  await drive(() => runs('mediabuyer', 'optimize').some((r) => r.status === 'done') && runs('support', 'weekly_report').some((r) => r.status === 'done') && runs('support', 'payment_reminder').some((r) => r.status === 'done'), 'the optimiser and the Support agent', 40);
  noFailed();
  const j = repo.T.journal.find((x) => x.action === 'optimize'); assert.ok(j && /Оптимізація/.test(j.summary), 'the advice is in the journal');
  const fb = repo.T.tasks.find((t) => /Фідбек за тиждень/.test(t.title)); assert.ok(fb && fb.owner === 'manager' && /Чернетка листа клієнту/.test(fb.evidence) && /Прибуток після реклами/.test(fb.evidence), 'the feedback draft with the profit is a task for the manager');
  const pay = repo.T.tasks.find((t) => /оплату/.test(t.title)); assert.ok(pay && pay.evidence.startsWith('Чернетка:\n') && pay.due_date, 'the payment reminder is a draft with a due date');
  assert.equal(runs('mediabuyer', 'launch').length, 1); assert.equal(world.writerCalls.filter((c) => c[0] === 'campaign').length, 2, 'nothing is made twice in the cabinet');
});
await step('the whole story is consistent: all approvals in the right order, the journal tells it, the costs are counted, no run failed, nothing is left stuck', async () => {
  noFailed();
  assert.deepEqual(repo.T.approvals.filter((a) => a.kind !== 'changes').map((a) => `${a.kind}:${a.status}`), ['strategy:returned', 'strategy:approved', 'client:approved', 'launch:approved']);
  const stages = repo.T.journal.filter((j) => j.action === 'stage').map((j) => j.summary); assert.ok(stages.length >= 4, 'the stage changes are in the journal: ' + stages.length);
  const cost = repo.T.runs.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0); assert.ok(cost > 0 && cost < 10, 'the project cost is counted and small: ' + cost.toFixed(2));
  const stuck = repo.T.runs.filter((r) => ['queued', 'running'].includes(r.status)); assert.equal(stuck.length, 0, 'nothing is left running: ' + stuck.map((r) => r.agent + '/' + r.skill).join(', '));
  const keys = [...new Set(repo.T.sections.map((s) => s.key))].sort(); log('sections written:', keys.join(', ')); log('tasks:', repo.T.tasks.length, '| runs:', repo.T.runs.length, '| model calls:', world.asked.length, '| writes to Meta:', world.writerCalls.length, '| cost: $' + cost.toFixed(2));
  for (const k of ['brief', 'site', 'audience', 'unit_economy', 'competitors', 'materials', 'ideas', 'creatives', 'strategy', 'launch']) assert.ok(keys.includes(k), 'section ' + k);
});

// ------------------------------------------------------------------------------------------------ the second story: a client whose brief is incomplete
// The process must STOP where something is missing, say WHAT is missing (a task for the manager), change nothing in the cabinet, and go on by itself once it is fixed.
console.log('\nThe second story: a brief with gaps (no competitors, no Facebook page)\n');
PID = 2;
await repo.ensureState(PID);
repo.setProjectInfo(PID, { name: 'Другий клієнт', client: 'Другий клієнт', manager: 'Олена', client_language: 'uk' });
repo.setWebsite(PID, 'https://shop.example');
repo.addAccount(PID, { platform: 'meta', account_id: '66', account_name: 'Second test', currency: 'USD' });
repo.setMaterials(PID, { settings: { cta_mode: 'always', cta_text: 'Купити', inputs: {} }, assets: [{ kind: 'product', name: 'p1.jpg', url: 'https://store.example/p1.jpg' }] });
const gaps = { ...BRIEF, general: { ...BRIEF.general, competitors: '', fb_page_id: '', payment_next_date: '' } };
const callsBefore = () => world.writerCalls.length;
await step('story 2, stage 1: no competitors in the brief: the research waits, a task says what to add, nothing else is blocked wrongly', async () => {
  await repo.writeSectionVersion(PID, 'brief', { author_kind: 'human', author: 'manager@example.com', body: 'Бриф', content: gaps });
  await repo.setProjectFlag(PID, { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() });
  await drive(() => runs('researcher', 'competitors').some((r) => r.project_id === PID && r.status === 'waiting'), 'the competitors waiting for the brief');
  const mine = repo.T.runs.filter((r) => r.project_id === PID && r.status === 'waiting'); assert.ok(mine.every((r) => r.state?.blocked_on), 'a waiting run says what it waits for');
  assert.ok(repo.T.tasks.some((t) => t.project_id === PID && /сайти конкурентів/.test(t.title) && t.owner === 'manager'), 'a task for the manager says what to add');
  await drive(() => !!(repo.T.sections.find((x) => x.project_id === PID && x.key === 'audience')?.current_version_id), 'the audience is written while the competitors wait');
  assert.equal(state().stage, 1, 'the research does not finish without the competitors');
});
await step('story 2, stage 1: the manager adds the competitors: the waiting run wakes by itself and the process goes on to the strategy', async () => {
  advance(1000);
  await repo.writeSectionVersion(PID, 'brief', { author_kind: 'human', author: 'manager@example.com', body: 'Бриф', content: { ...gaps, general: { ...gaps.general, competitors: 'rival.example' } } });
  await drive(() => !!pending('strategy'), 'Апрув 1 of the second project');
  noFailed();
});
await step('story 2, launch: the check before the launch finds the missing Facebook page, tells the reasons in a task, writes NOTHING to the cabinet, and the launch goes on by itself after the fix', async () => {
  decide(pending('strategy'), 'approved');
  await drive(() => !!signoffWanted(state(), repo.T.approvals.filter((a) => a.project_id === PID)), 'the answer of the client');
  signoff('approved');
  await drive(() => !!pending('launch'), 'Апрув 2');
  decide(pending('launch'), 'approved');
  const before = callsBefore();
  await drive(() => runs('mediabuyer', 'launch').some((r) => r.project_id === PID && r.status === 'waiting'), 'the launch waiting for the fix');
  assert.equal(callsBefore(), before, 'a blocked launch changes nothing in the cabinet');
  assert.equal(state().stage, 3, 'the stage stays at the launch');
  const t = repo.T.tasks.find((x) => x.project_id === PID && /ID сторінки Facebook/.test(x.title)); assert.ok(t && t.owner === 'manager' && t.created_by === 'mediabuyer/launch', 'the blocker is a task of the check before the launch');
  advance(1000);
  await repo.writeSectionVersion(PID, 'brief', { author_kind: 'human', author: 'manager@example.com', body: 'Бриф', content: { ...gaps, general: { ...gaps.general, competitors: 'rival.example', fb_page_id: '888000222' } } });
  advance(31 * 60000); // the check is repeated every half hour
  await drive(() => state().stage >= 4, 'the optimisation of the second project');
  noFailed();
  const mineCalls = world.writerCalls.slice(before); assert.equal(mineCalls.filter((c) => c[0] === 'campaign').length, 2); assert.ok(mineCalls.filter((c) => c[0] === 'creative').every((c) => c[1].pageId === '888000222'), 'the ads are published from the page of the brief');
  assert.equal(runs('mediabuyer', 'launch').filter((r) => r.project_id === PID && r.status === 'done').length, 1);
});
await step('the two projects did not mix: every section, task and write belongs to its own project', async () => {
  for (const key of ['strategy', 'creatives', 'launch']) { const a = await repo.readSection(1, key), b = await repo.readSection(2, key); assert.ok(a?.version && b?.version, key + ' of both'); }
  const l1 = (await repo.readSection(1, 'launch')).version.content, l2 = (await repo.readSection(2, 'launch')).version.content;
  assert.equal(l1.account.id, '55'); assert.equal(l2.account.id, '66', 'each project launched into ITS OWN cabinet');
  assert.ok(repo.T.tasks.every((t) => [1, 2].includes(t.project_id)));
  noFailed();
});


// ------------------------------------------------------------------------------------------------ the third story: a client WITH a history of ads (the audit is made)
console.log('\nThe third story: a client with a history of ads\n');
PID = 3;
await repo.ensureState(PID);
repo.setProjectInfo(PID, { name: 'Третій клієнт', client: 'Третій клієнт', manager: 'Олена', client_language: 'uk' });
repo.setWebsite(PID, 'https://shop.example');
repo.addAccount(PID, { platform: 'meta', account_id: '77', account_name: 'History test', currency: 'USD' });
repo.setMaterials(PID, { settings: { cta_mode: 'always', cta_text: 'Купити', inputs: {} }, assets: [{ kind: 'product', name: 'p1.jpg', url: 'https://store.example/p1.jpg' }] });
await step('story 3: a cabinet with spend means data: the audit is made AFTER the Unit Economy, judged by its thresholds, and the audience and the strategy use it; the check finds nothing to fix', async () => {
  await repo.writeSectionVersion(PID, 'brief', { author_kind: 'human', author: 'manager@example.com', body: 'Бриф', content: BRIEF });
  await repo.setProjectFlag(PID, { paid_at: now().toISOString(), contracts_signed_at: now().toISOString() });
  await drive(() => !!pending('strategy'), 'Апрув 1 of the third project', 120);
  noFailed();
  assert.equal(state().has_data, true);
  const audit = (await section('audit')).content, ue = (await section('unit_economy')).content;
  assert.equal(audit.thresholds.breakeven_cpa, ue.thresholds.breakeven_cpa, 'the audit is judged by the thresholds of the Unit Economy, not without them');
  assert.equal(audit.overview.spend, 5000); assert.equal(audit.months.length, 3);
  assert.ok((await section('strategy')).content.campaigns.length >= 1);
  assert.equal(repo.T.journal.filter((j) => j.project_id === PID && j.action === 'check_failed').length, 0, 'the automatic check had nothing to complain about');
  const order = repo.T.runs.filter((r) => r.project_id === PID).map((r) => `${r.skill}`); assert.ok(order.includes('audit') && order.indexOf('unit_economy') !== -1);
});

console.log(`\n${passed} end-to-end steps passed`);
