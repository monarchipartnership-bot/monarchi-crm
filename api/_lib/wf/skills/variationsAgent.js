// The Creator's skill «ad_variations» (Zeely item 3): variations of an ad that worked (variationsEngine.js). input = { mode: 'vary' | 'merge' | 'localize', sources: ['c2'] | ['c1','c2'], vary: [...], count, language }.
// The cards are added to the section «Креативи (готові)» (an approved section receives them as a proposal of the agent, which the manager accepts). Variants that keep the picture cost nothing;
// the ones that need a new picture are cut to what the image limit of the project pays for, like a batch.
import { gatherCreativeFacts, parseCreativesAnswer, referencePool } from './creativesEngine.js';
import { capByLimit, finish, makePictures } from './creativesAgent.js';
import { buildVariationPrompt, checkVariations, needsPicture, normalizeRequest } from './variationsEngine.js';


export async function adVariations({ run, ctx }) {
  const req = normalizeRequest(run.input);
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Варіації чекають на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  const prev = (await ctx.repo.readSection(run.project_id, 'creatives'))?.version?.content;
  const items = prev?.branch === 'A' && Array.isArray(prev.items) ? prev.items.map((x) => ({ ...x })) : [];
  const sources = req.sources.map((id) => items.find((x) => x.id === id));
  const lost = req.sources.filter((id, i) => !sources[i]);
  if (lost.length) throw new Error(`Креатива ${lost.join(', ')} немає в розділі «Креативи (готові)»: варіації роблять лише з наявних карток.`);
  const noText = sources.find((s) => !s.headline || !s.primary_text);
  if (noText) throw new Error(`Креатив ${noText.id} без заголовка чи тексту: з нього не можна робити варіації.`);
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  const materials = await ctx.repo.readCreativeMaterials(run.project_id);
  const pool = referencePool(materials);
  const ideasSec = (await ctx.repo.readSection(run.project_id, 'ideas'))?.version?.content || null;
  const audSec = (await ctx.repo.readSection(run.project_id, 'audience'))?.version?.content || null;
  const brandDna = (await ctx.repo.readSection(run.project_id, 'brand_dna'))?.version?.content || null;

  // only the variants with a NEW picture cost money
  const picture = needsPicture(req);
  const cap = picture ? await capByLimit({ ctx, run, items, pool, count: req.count }) : { count: req.count, limitedBy: null, perImage: null };
  if (cap.count === 0) return { output: { items: 0, limited: true }, steps: [{ title: `Ліміт проєкту на картинки вичерпано (картинка ≈ $${cap.perImage.toFixed(2)}): варіації не створено`, status: 'info' }], tasks: [{ type: 'creatives', owner: 'manager', priority: 'medium', title: 'Підняти ліміт витрат проєкту на картинки', evidence: 'Варіації з новою картинкою не створено: лишок ліміту не вистачає навіть на одну картинку.' }] };
  const asked = req.count;
  req.count = cap.count;

  const facts = gatherCreativeFacts({ brief: brief.version, materials, ideas: ideasSec, audience: audSec, goals: [{ goal: sources[0].goal, product: sources[0].product }], brandDna });
  const prompt = buildVariationPrompt({ req, sources, facts });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: Math.min(10000, 1200 + 480 * req.count) });
  const checked = checkVariations(parseCreativesAnswer(answer.text), { req, sources, facts, existing: items });
  if (!checked.cards.length) throw new Error('Модель не повернула жодної придатної варіації.');
  const base = items.length;
  checked.cards.forEach((c, i) => items.push({ id: `c${base + i + 1}`, ...c }));
  const log = { run: run.id, mode: req.mode, of: req.sources, changed: req.vary, asked, made: checked.cards.length, limited_by: cap.limitedBy, ...(req.language ? { language: req.language } : {}) };
  const pics = await makePictures({ items, ctx, run, modelCost: answer.costUsd || 0 });
  const reused = checked.cards.filter((c) => c.status === 'ready').length;
  const out = finish({ items, ctx, run, modelCost: answer.costUsd || 0, pics, batches: [...(prev?.batches || []), log], note: `Варіацій (${req.mode}): замовлено ${asked}, створено ${checked.cards.length}${reused ? `, із старою картинкою ${reused}` : ''}${cap.limitedBy ? ' (більше не вміщається в ліміт проєкту)' : ''}` });
  if (cap.limitedBy) out.steps.unshift({ title: `Ліміт проєкту дозволяє ${cap.count} з ${asked} картинок (одна ≈ $${cap.perImage.toFixed(2)})`, status: 'info' });
  out.output = { ...out.output, mode: req.mode, asked, made: checked.cards.length, reused, limited_by: cap.limitedBy };
  return out;
}
