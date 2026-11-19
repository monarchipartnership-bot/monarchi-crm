// The Creator's skill «first_creatives» (step A6.2; document, step 2). Branch A (the materials are enough): for every goal the manager wrote in the brief a card is made
// (texts, a picture brief, a tag), then the pictures are made through Higgsfield inside the limit of the project and copied into our storage. Branch B (not enough
// materials): nothing is made, the shoot brief already goes to the client with the strategy; the section says so. It can run again: cards that exist are kept,
// unfinished pictures are followed up, only new goals get new cards. ctx.ask is the model, ctx.hf the picture generator (the real one when its keys are set).
import * as hfReal from '../../hfImage.js';
import { DEFAULT_IMAGE_LIMIT_USD, buildCreativesPrompt, checkCards, gatherCreativeFacts, goalsOf, imageRequestOf, parseCreativesAnswer, referencePool, renderCreativesText } from './creativesEngine.js';

const real = { buildImageRequest: hfReal.buildImageRequest, profile: hfReal.profileFromEnv, estimate: hfReal.estimate, submit: hfReal.submit, check: hfReal.check };
const hfOf = (ctx) => (ctx.hf === undefined ? (hfReal.isConfigured() ? real : null) : ctx.hf);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const r4 = (x) => Math.round(x * 10000) / 10000;
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const sleepOf = (ctx) => ctx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

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
  let items = prev?.branch === 'A' && Array.isArray(prev.items) ? prev.items.map((x) => ({ ...x })) : [];
  const known = new Set(items.map((x) => norm(x.goal)));
  const fresh = goals.filter((g) => !known.has(norm(g.goal)));

  const materials = await ctx.repo.readCreativeMaterials(run.project_id);
  const pool = referencePool(materials);
  let modelCost = 0;
  if (fresh.length) {
    const ideasSec = (await ctx.repo.readSection(run.project_id, 'ideas'))?.version?.content || null;
    const audSec = (await ctx.repo.readSection(run.project_id, 'audience'))?.version?.content || null;
    const facts = gatherCreativeFacts({ brief: brief.version, materials, ideas: ideasSec, audience: audSec, goals: fresh });
    const project = await ctx.repo.readProject(run.project_id);
    const prompt = buildCreativesPrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
    const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 6000 });
    modelCost = answer.costUsd || 0;
    const checked = checkCards(parseCreativesAnswer(answer.text), { facts, pool });
    if (!checked.cards.length) throw new Error('Модель не повернула жодного придатного креатива.');
    const base = items.length;
    checked.cards.forEach((c, i) => items.push({ id: `c${base + i + 1}`, ...c, image_url: '', path: '', job: null, cost_usd: 0 }));
    // a goal the model skipped stays a goal: it is made on the next run
  }

  // the pictures: the limit is the cost cap of the PROJECT (or a default one when the project has none); what the project already spent this month counts
  const hf = hfOf(ctx);
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const limit = snap.state?.cost_cap_usd != null ? Number(snap.state.cost_cap_usd) : DEFAULT_IMAGE_LIMIT_USD;
  const now = (ctx.now || (() => new Date()))();
  const before = await ctx.repo.projectCost(run.project_id, monthStart(now));
  let remaining = limit - before - modelCost;
  let imageSpent = 0;
  const open = [];
  if (!hf) open.push('Higgsfield не налаштовано на сервері (потрібні HF_API_KEY_ID, HF_API_KEY_SECRET, HF_IMAGE_MODEL): картинки не створювались, тексти готові.');
  else {
    const profileKey = (x) => `wf-${run.project_id}-${norm(x.goal).slice(0, 40)}-v${x.version || 1}-${(x.attempt || 0) + 1}`;
    for (const x of items) {
      if (!['planned', 'failed'].includes(x.status) || x.job || !x.visual_prompt || !x.references?.length) continue;
      let usd;
      try { usd = await hf.estimate({ request: imageRequestOf(x, hf) }); } catch (e) { x.status = 'failed'; x.note = String(e.message || e).slice(0, 300); continue; }
      if (usd > remaining + 1e-9) { x.note = `Картинка не вміщується в ліміт проєкту ($${limit.toFixed(2)}): лишилось $${Math.max(0, remaining).toFixed(2)}, потрібно $${usd.toFixed(2)}.`; x.status = 'planned'; open.push(x.note); continue; }
      try {
        const job = await hf.submit({ request: imageRequestOf(x, hf), key: profileKey(x) });
        x.job = { id: job.jobId, statusUrl: job.statusUrl }; x.status = 'producing'; x.estimate_usd = usd; x.cost_usd = r4(Number(x.cost_usd || 0) + usd); x.attempt = (x.attempt || 0) + 1; x.note = '';
        remaining = r4(remaining - usd); imageSpent = r4(imageSpent + usd);
      } catch (e) { x.status = 'failed'; x.note = String(e.message || e).slice(0, 300); }
    }
    // follow the unfinished pictures (also those of an earlier run) until they are ready or the time of this run is over
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
  }
  items.forEach((x) => { if (x.status === 'needs_check') open.push(`«${x.tag}»: ${x.problems.join('; ')}.`); });
  if (items.some((x) => x.status === 'failed')) open.push('Не всі картинки вдалося створити: причини біля кожного креатива.');
  const spentAll = r4(items.reduce((s, x) => s + Number(x.cost_usd || 0), 0));
  const content = { schema: 1, branch: 'A', items, spent_usd: spentAll, limit_usd: limit, open };
  const ready = items.filter((x) => x.status === 'ready').length;
  return {
    writes: [{ key: 'creatives', body: renderCreativesText(items, { branch: 'A', spent: spentAll, limit, open }), content, sources: [{ title: 'Бриф: цілі креативів' }, { title: 'Банк ідей' }, { title: 'Картка проєкту: матеріали' }] }],
    steps: [{ title: `Цілей: ${goals.length}, нових карток: ${fresh.length}` }, { title: hf ? `Картинок готово ${ready} з ${items.length}, витрачено $${imageSpent.toFixed(2)}` : 'Картинки не створювались: Higgsfield не налаштовано', status: hf ? undefined : 'info' }],
    output: { items: items.length, ready, image_usd: imageSpent },
    costUsd: r4(modelCost + imageSpent),
  };
}
