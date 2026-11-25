// The Creator's skills «first_creatives» and «rework_creatives» (step A6.2 and A7.2; document, step 2).
// first_creatives. Branch A (the materials are enough): for every goal the manager wrote in the brief a card is made (texts, a picture brief, a tag), then the pictures are
// made through Higgsfield inside the limit of the project and copied into our storage. Branch B (not enough materials): nothing is made, the shoot brief already goes to the
// client with the strategy; the section says so. It can run again: cards that exist are kept, unfinished pictures are followed up, only new goals get new cards.
// rework_creatives. The manager (Апрув 1) or the client returned SOME creatives with a comment: only those cards are made again (a new version v+1, the old comment kept in
// their history), everything else stays as approved. ctx.ask is the model, ctx.hf the picture generator (the real one when its keys are set).
import { createHash } from 'node:crypto';
import * as hfReal from '../../hfImage.js';
import { affordableCount, buildBatchGoals, clampCount, markDuplicates } from './batchEngine.js';
import { DEFAULT_IMAGE_LIMIT_USD, buildCreativesPrompt, checkCards, gatherCreativeFacts, goalsOf, imageRequestOf, parseCreativesAnswer, referencePool, renderCreativesText, tagOf } from './creativesEngine.js';

const real = { buildImageRequest: hfReal.buildImageRequest, profile: hfReal.profileFromEnv, estimate: hfReal.estimate, submit: hfReal.submit, check: hfReal.check };
export const hfOf = (ctx) => (ctx.hf === undefined ? (hfReal.isConfigured() ? real : null) : ctx.hf);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const r4 = (x) => Math.round(x * 10000) / 10000;
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const sleepOf = (ctx) => ctx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

// The pictures of the cards that need one: the limit is the cost cap of the PROJECT (or a default one when the project has none); what the project already spent this month
// counts. Unfinished pictures (also of an earlier run) are followed until they are ready or the time of this run is over. → { imageSpent, open, limit, hf }
export async function makePictures({ items, ctx, run, modelCost }) {
  const hf = hfOf(ctx);
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const limit = snap.state?.cost_cap_usd != null ? Number(snap.state.cost_cap_usd) : DEFAULT_IMAGE_LIMIT_USD;
  const now = (ctx.now || (() => new Date()))();
  const before = await ctx.repo.projectCost(run.project_id, monthStart(now));
  let remaining = limit - before - modelCost;
  let imageSpent = 0;
  const open = [];
  if (!hf) { open.push('Higgsfield не налаштовано на сервері (потрібні HF_API_KEY_ID, HF_API_KEY_SECRET, HF_IMAGE_MODEL): картинки не створювались, тексти готові.'); return { imageSpent, open, limit, hf }; }
  const keyOf = (x) => `wf-${run.project_id}-${createHash('sha1').update(norm(x.goal) + (x.variation ? '|' + x.id : '')).digest('hex').slice(0, 12)}-v${x.version || 1}-${(x.attempt || 0) + 1}`; // ASCII only: an HTTP header cannot carry Cyrillic (found by the pilot: goals are written in Ukrainian)
  for (const x of items) {
    if (!['planned', 'failed'].includes(x.status) || x.job || !x.visual_prompt || !x.references?.length) continue;
    let usd;
    try { usd = await hf.estimate({ request: imageRequestOf(x, hf) }); } catch (e) { x.status = 'failed'; x.note = String(e.message || e).slice(0, 300); continue; }
    if (usd > remaining + 1e-9) { x.note = `Картинка не вміщується в ліміт проєкту ($${limit.toFixed(2)}): лишилось $${Math.max(0, remaining).toFixed(2)}, потрібно $${usd.toFixed(2)}.`; x.status = 'planned'; open.push(x.note); continue; }
    try {
      const job = await hf.submit({ request: imageRequestOf(x, hf), key: keyOf(x) });
      x.job = { id: job.jobId, statusUrl: job.statusUrl }; x.status = 'producing'; x.estimate_usd = usd; x.cost_usd = r4(Number(x.cost_usd || 0) + usd); x.attempt = (x.attempt || 0) + 1; x.note = '';
      remaining = r4(remaining - usd); imageSpent = r4(imageSpent + usd);
    } catch (e) { x.status = 'failed'; x.note = String(e.message || e).slice(0, 300); }
  }
  const maxWait = ctx.imageWaitMs ?? 200000, step = ctx.imageStepMs ?? 4000;
  let waited = 0;
  for (;;) {
    for (const x of items.filter((y) => y.status === 'producing' && y.job)) {
      const r = await hf.check({ statusUrl: x.job.statusUrl });
      if (r.state === 'ready') {
        const saved = await ctx.repo.persistProjectImage(run.project_id, { url: r.url, name: `${x.id}-v${x.version || 1}` });
        Object.assign(x, { status: 'ready', image_url: saved.url, path: saved.path || '', job: null, note: '' });
      } else if (r.state === 'failed') {
        imageSpent = r4(imageSpent - Number(x.estimate_usd || 0)); // a failed or moderated picture is not charged
        Object.assign(x, { status: 'failed', note: r.error || 'Генерація не вдалася.', cost_usd: Math.max(0, r4(Number(x.cost_usd || 0) - Number(x.estimate_usd || 0))), job: null });
      }
    }
    if (!items.some((y) => y.status === 'producing') || waited >= maxWait) break;
    await sleepOf(ctx)(step); waited += step;
  }
  if (items.some((y) => y.status === 'producing')) open.push('Частина картинок ще генерується: запустіть Креатора ще раз, він забере готові.');
  return { imageSpent, open, limit, hf };
}

export function finish({ items, ctx, run, goalsCount, fresh, modelCost, pics, answerCost, note, batches = [], videos = [] }) {
  const open = [...pics.open];
  items.forEach((x) => { if (x.status === 'needs_check') open.push(`«${x.tag}»: ${x.problems.join('; ')}.`); });
  if (items.some((x) => x.status === 'failed')) open.push('Не всі картинки вдалося створити: причини біля кожного креатива.');
  const spentAll = r4(items.reduce((s, x) => s + Number(x.cost_usd || 0), 0));
  const content = { schema: 1, branch: 'A', items, spent_usd: spentAll, limit_usd: pics.limit, open, ...(batches.length ? { batches } : {}), ...(videos.length ? { videos } : {}) }; // the videos belong to the section: a picture skill must not lose them
  const ready = items.filter((x) => x.status === 'ready').length;
  return {
    writes: [{ key: 'creatives', body: renderCreativesText(items, { branch: 'A', spent: spentAll, limit: pics.limit, open }), content, sources: [{ title: 'Бриф: цілі креативів' }, { title: 'Банк ідей' }, { title: 'Картка проєкту: матеріали' }] }],
    steps: [{ title: note }, { title: pics.hf ? `Картинок готово ${ready} з ${items.length}, витрачено $${pics.imageSpent.toFixed(2)}` : 'Картинки не створювались: Higgsfield не налаштовано', status: pics.hf ? undefined : 'info' }],
    output: { items: items.length, ready, image_usd: pics.imageSpent },
    costUsd: r4(modelCost + pics.imageSpent),
  };
}

export async function firstCreatives({ run, ctx }) {
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Креативи чекають на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  const goals = goalsOf(brief.version);
  const materialsSec = (await ctx.repo.readSection(run.project_id, 'materials'))?.version || null;

  // branch B: the materials are not enough: the creatives are made after they arrive and are approved separately (document)
  if (materialsSec?.content?.verdict === 'not_enough') {
    const note = 'Матеріалів недостатньо: ТЗ на зйомку іде клієнту разом зі стратегією. Креативи створюються після отримання матеріалів і погоджуються окремо. Коли матеріали з’являться, запустіть Креатора ще раз.';
    return { writes: [{ key: 'creatives', body: renderCreativesText([], { branch: 'B', note }), content: { schema: 1, branch: 'B', items: [], note, open: [] }, sources: [{ title: 'Креативи (матеріали)' }] }], steps: [{ title: 'Гілка Б: матеріалів недостатньо, креативи не створюються' }], output: { branch: 'B' } };
  }
  if (!goals.length) {
    return {
      blocked: { on: 'brief', reason: 'У брифі немає цілей перших креативів.' },
      tasks: [{ type: 'creatives', owner: 'manager', priority: 'high', title: 'Вказати цілі перших креативів у брифі', evidence: 'Ціль кожного креатива вказує менеджер: що рекламуємо і що хочемо отримати. Додайте її в таблиці брифу, блок «Цілі перших креативів».' }],
      steps: [{ title: 'Цілей креативів ще немає', status: 'info' }],
    };
  }
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const prev = (await ctx.repo.readSection(run.project_id, 'creatives'))?.version?.content;
  const items = prev?.branch === 'A' && Array.isArray(prev.items) ? prev.items.map((x) => ({ ...x })) : [];
  const known = new Set(items.map((x) => norm(x.goal)));
  const fresh = goals.filter((g) => !known.has(norm(g.goal)));

  const materials = await ctx.repo.readCreativeMaterials(run.project_id);
  const pool = referencePool(materials);
  let modelCost = 0;
  if (fresh.length) {
    const ideasSec = (await ctx.repo.readSection(run.project_id, 'ideas'))?.version?.content || null;
    const audSec = (await ctx.repo.readSection(run.project_id, 'audience'))?.version?.content || null;
    const brandDna = (await ctx.repo.readSection(run.project_id, 'brand_dna'))?.version?.content || null;
    const facts = gatherCreativeFacts({ brief: brief.version, materials, ideas: ideasSec, audience: audSec, goals: fresh, brandDna });
    const project = await ctx.repo.readProject(run.project_id);
    const prompt = buildCreativesPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
    const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 6000 });
    modelCost = answer.costUsd || 0;
    const checked = checkCards(parseCreativesAnswer(answer.text), { facts, pool });
    if (!checked.cards.length) throw new Error('Модель не повернула жодного придатного креатива.');
    const base = items.length;
    checked.cards.forEach((c, i) => items.push({ id: `c${base + i + 1}`, ...c, image_url: '', path: '', job: null, cost_usd: 0 })); // a goal the model skipped is made on the next run
  }
  const pics = await makePictures({ items, ctx, run, modelCost });
  return finish({ items, ctx, run, modelCost, pics, batches: prev?.batches || [], videos: prev?.videos || [], note: `Цілей: ${goals.length}, нових карток: ${fresh.length}` });
}

// remarks = [{ target: 'creative:c2', text }]: the creatives the manager or the client returned. Only they are made again.
export async function reworkCreatives({ run, ctx }) {
  const remarks = (run.input?.remarks || []).filter((r) => String(r?.target || '').startsWith('creative:') && String(r.text || '').trim());
  const sec = (await ctx.repo.readSection(run.project_id, 'creatives'))?.version?.content;
  if (!sec?.items?.length) return { output: { reworked: 0 }, steps: [{ title: 'Креативів ще немає: переробляти нічого', status: 'info' }] };
  const items = sec.items.map((x) => ({ ...x }));
  const targets = remarks.map((r) => ({ item: items.find((x) => x.id === r.target.slice(9)), text: String(r.text).trim().slice(0, 600) })).filter((t) => t.item);
  if (!targets.length) return { output: { reworked: 0 }, steps: [{ title: 'Зауваження не стосуються наявних креативів', status: 'info' }] };
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const brief = (await ctx.repo.readSection(run.project_id, 'brief'))?.version;
  const goals = targets.map((t) => ({ goal: t.item.goal, product: t.item.product }));
  const materials = await ctx.repo.readCreativeMaterials(run.project_id);
  const pool = referencePool(materials);
  const ideasSec = (await ctx.repo.readSection(run.project_id, 'ideas'))?.version?.content || null;
  const audSec = (await ctx.repo.readSection(run.project_id, 'audience'))?.version?.content || null;
  const brandDna = (await ctx.repo.readSection(run.project_id, 'brand_dna'))?.version?.content || null;
  const facts = gatherCreativeFacts({ brief, materials, ideas: ideasSec, audience: audSec, goals, brandDna });
  facts.rework = targets.map((t, i) => ({ goal_index: i + 1, comment: t.text, previous: { headline: t.item.headline, primary_text: t.item.primary_text, angle: t.item.angle, offer: t.item.offer, cta: t.item.cta, visual_prompt: t.item.visual_prompt } }));
  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildCreativesPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 6000 });
  const checked = checkCards(parseCreativesAnswer(answer.text), { facts, pool });
  if (!checked.cards.length) throw new Error('Модель не повернула жодного придатного креатива.');
  for (const c of checked.cards) {
    const t = targets[c.goal_index - 1]; if (!t) continue;
    const old = t.item, version = (old.version || 1) + 1;
    const card = { ...c, version }; card.tag = tagOf(card);
    Object.assign(old, card, { id: old.id, image_url: '', path: '', job: null, attempt: 0, estimate_usd: 0, note: '', rework: [...(old.rework || []), { from_version: old.version || 1, comment: t.text }] });
  }
  const pics = await makePictures({ items, ctx, run, modelCost: answer.costUsd || 0 });
  return finish({ items, ctx, run, modelCost: answer.costUsd || 0, pics, batches: sec.batches || [], videos: sec.videos || [], note: `Перероблено креативів: ${checked.cards.length}` });
}

// How many cards with NEW pictures the money allows: the limit of the project minus what it spent this month minus the pictures that are already planned and wait for money, divided by the price of one picture.
// Without a generator the texts cost nothing and nothing is cut. → { hf, count, limitedBy, perImage }
export async function capByLimit({ ctx, run, items, pool, count }) {
  const hf = hfOf(ctx);
  if (!hf) return { hf, count, limitedBy: null, perImage: null };
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const limit = snap.state?.cost_cap_usd != null ? Number(snap.state.cost_cap_usd) : DEFAULT_IMAGE_LIMIT_USD;
  const before = await ctx.repo.projectCost(run.project_id, monthStart((ctx.now || (() => new Date()))()));
  const sample = { visual_prompt: 'sample', ratio: '4:5', references: pool.filter((p) => p.kind === 'product').slice(0, 1).map((p) => ({ url: p.url })) };
  let perImage;
  try { perImage = await hf.estimate({ request: imageRequestOf(sample, hf) }); } catch (e) { throw new Error(`Не вдалося оцінити ціну картинки: ${String(e.message || e).slice(0, 200)}`); }
  const waiting = items.filter((x) => ['planned', 'failed'].includes(x.status) && !x.job && x.visual_prompt).length;
  const a = affordableCount({ count, remaining: limit - before - waiting * perImage, perImage });
  return { hf, count: a.count, limitedBy: a.limitedBy, perImage };
}

// The skill «batch_creatives» (Zeely item 2): a batch of static ads for ONE product. input = { product, count }. Code picks the number (at most 20, and no more than the image limit of the project can pay for),
// gives every card an idea of the bank and a format, the model writes the words, the same checks run, repeats of a headline go to the manager. The cards are added to the section «Креативи (готові)»
// (an approved section receives them as a proposal of the agent, which the manager accepts).
export async function batchCreatives({ run, ctx }) {
  const product = String(run.input?.product || '').trim();
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Пакет креативів чекає на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  const names = (brief.version.content?.economics?.products || []).map((p) => String(p?.name || '').trim()).filter(Boolean);
  const chosen = names.find((n) => norm(n) === norm(product));
  if (!chosen) throw new Error(product ? `Товару «${product}» немає в брифі: пакет створюється лише для товарів брифу.` : 'Не вказано товар для пакета креативів.');
  const materialsSec = (await ctx.repo.readSection(run.project_id, 'materials'))?.version || null;
  if (materialsSec?.content?.verdict === 'not_enough') return { blocked: { on: 'materials', reason: 'Матеріалів недостатньо: пакет робиться після їх отримання.' }, steps: [{ title: 'Матеріалів недостатньо', status: 'info' }] };
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const prev = (await ctx.repo.readSection(run.project_id, 'creatives'))?.version?.content;
  const items = prev?.branch === 'A' && Array.isArray(prev.items) ? prev.items.map((x) => ({ ...x })) : [];
  const materials = await ctx.repo.readCreativeMaterials(run.project_id);
  const pool = referencePool(materials);
  const ideasSec = (await ctx.repo.readSection(run.project_id, 'ideas'))?.version?.content || null;
  const audSec = (await ctx.repo.readSection(run.project_id, 'audience'))?.version?.content || null;
  const brandDna = (await ctx.repo.readSection(run.project_id, 'brand_dna'))?.version?.content || null;

  const asked = clampCount(run.input?.count);
  const cap = await capByLimit({ ctx, run, items, pool, count: asked });
  const { count, limitedBy, perImage } = cap;
  if (count === 0) return { output: { items: 0, limited: true }, steps: [{ title: `Ліміт проєкту на картинки вичерпано (картинка ≈ $${perImage.toFixed(2)}): пакет не створено`, status: 'info' }], tasks: [{ type: 'creatives', owner: 'manager', priority: 'medium', title: 'Підняти ліміт витрат проєкту на картинки', evidence: `Пакет креативів на «${chosen}» не створено: лишок ліміту не вистачає навіть на одну картинку.` }] };

  const ideas = ((ideasSec?.items) || []).filter((x) => x.status === 'ok').slice(0, 14).map((x) => ({ id: x.id }));
  const goals = buildBatchGoals({ product: chosen, count, ideas, existing: items });
  const facts = gatherCreativeFacts({ brief: brief.version, materials, ideas: ideasSec, audience: audSec, goals, brandDna });
  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildCreativesPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: Math.min(12000, 1500 + 520 * count) });
  const checked = checkCards(parseCreativesAnswer(answer.text), { facts, pool });
  if (!checked.cards.length) throw new Error('Модель не повернула жодного придатного креатива.');
  markDuplicates(checked.cards, items);
  const base = items.length;
  checked.cards.forEach((c, i) => items.push({ id: `c${base + i + 1}`, ...c, image_url: '', path: '', job: null, cost_usd: 0 }));
  const batches = [...(prev?.batches || []), { run: run.id, product: chosen, asked, made: checked.cards.length, limited_by: limitedBy, per_image_usd: perImage }];
  const pics = await makePictures({ items, ctx, run, modelCost: answer.costUsd || 0 });
  const out = finish({ items, ctx, run, modelCost: answer.costUsd || 0, pics, batches, videos: prev?.videos || [], note: `Пакет «${chosen}»: замовлено ${asked}, створено ${checked.cards.length}${limitedBy ? ' (більше не вміщається в ліміт проєкту)' : ''}${checked.missing.length ? `, модель пропустила ${checked.missing.length}` : ''}` });
  if (limitedBy) out.steps.unshift({ title: `Ліміт проєкту дозволяє ${count} з ${asked} картинок (одна ≈ $${perImage.toFixed(2)})`, status: 'info' });
  out.output = { ...out.output, asked, made: checked.cards.length, limited_by: limitedBy };
  return out;
}
