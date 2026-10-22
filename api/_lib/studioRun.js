// The work of the creative-studio agents (one handler for the five roles). It gathers what the role needs for ONE request (the requirements,
// the materials, the client's site, the current ads, the competitors' pages, and the results of the agents above it IN THIS REQUEST), builds
// the prompt (editable instruction + client-specific instruction + locked rules), calls the model and saves the result as the task's output.
// The brief writer's, the copywriter's and the producer's answers are JSON: they are parsed and checked here, and the producer's prompts become
// the rows of ag_creatives. Everything the outside world provides is handed in (ctx.read, ctx.campaignDeps), so tests run it with stand-ins.
import { PLATFORMS } from '../../src/lib/agents/campaignTeam.js';
import { REQUEST_LANGUAGES, REQUEST_RATIOS, MATERIAL_KINDS, studioRoleDef } from '../../src/lib/agents/studioTeam.js';
import { composeStudioSystem } from '../../src/lib/agents/studioPrompts.js';
import { fetchBlock, loadAccounts, siteBlocks, summaryOf } from './campaignRun.js';
import { readJson } from './agentContent.js';
import { readSite } from './siteReader.js';

const MODEL = 'claude-sonnet-5';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const LANGUAGE_NAMES = { uk: 'Ukrainian', en: 'English' };
const RATIO_KEYS = REQUEST_RATIOS.map((r) => r.key);

// ------------------------------------------------------------------------------------------------------------------------ parsers
const asList = (v) => (Array.isArray(v) ? v : []);

// The brief writer's answer → { summary, concepts, notes }. Concepts are checked against the request (how many, which formats, texts or not).
export function parseStudioBrief(text, request = {}) {
  const j = readJson(text);
  const brief = request.brief || {};
  const allowed = asList(brief.ratios).filter((r) => RATIO_KEYS.includes(r));
  const ratios = allowed.length ? allowed : ['1:1'];
  const max = Math.max(1, Number(brief.count) || 3);
  const seen = new Set();
  const concepts = asList(j?.concepts).slice(0, max).map((c, i) => {
    let key = clip(c?.key, 20).replace(/[^\w-]/g, '') || `c${i + 1}`;
    if (seen.has(key)) key = `c${i + 1}`;
    seen.add(key);
    const mine = asList(c?.ratios).filter((r) => ratios.includes(r));
    const needsText = brief.texts === 'yes' ? true : brief.texts === 'no' ? false : c?.needs_text !== false;
    return {
      key, name: clip(c?.name, 80) || `Концепція ${i + 1}`, angle: clip(c?.angle, 400), audience: clip(c?.audience, 300), message: clip(c?.message, 400),
      visual: clip(c?.visual, 1200), uses_materials: asList(c?.uses_materials).map((m) => clip(m, 160)).filter(Boolean).slice(0, 6),
      ratios: mine.length ? mine : ratios, needs_text: needsText, text_brief: clip(c?.text_brief, 600), avoid: clip(c?.avoid, 400),
    };
  }).filter((c) => c.visual);
  if (!concepts.length) throw new Error('Автор ТЗ не повернув жодної концепції з описом картинки. Спробуйте ще раз.');
  return { summary: clip(j?.summary, 800), concepts, notes: clip(j?.notes, 800) };
}

export function parseStudioCopy(text, concepts = []) {
  const j = readJson(text);
  const keys = new Set(concepts.map((c) => c.key));
  const texts = asList(j?.texts).map((t) => ({
    concept: clip(t?.concept, 20), headline: clip(t?.headline, 90), primary_text: clip(t?.primary_text, 900), description: clip(t?.description, 160), cta: clip(t?.cta, 60),
  })).filter((t) => keys.has(t.concept) && (t.headline || t.primary_text));
  return { texts, notes: clip(j?.notes, 800) };
}

// The producer's prompts, one per concept and format. A concept or format the model skipped gets a plain prompt from the brief, so no creative is lost.
export function parseStudioProducer(text, concepts = [], style = '') {
  const j = readJson(text);
  const got = asList(j?.creatives);
  const creatives = [];
  for (const c of concepts) {
    for (const ratio of c.ratios) {
      const hit = got.find((g) => clip(g?.concept, 20) === c.key && clip(g?.ratio, 10) === ratio && clip(g?.prompt, 4000));
      const base = clip(hit?.prompt, 2500) || [c.visual, style].filter(Boolean).join('. ');
      creatives.push({
        concept_key: c.key, concept_name: c.name, ratio, prompt: base, negative_prompt: clip(hit?.negative_prompt, 500) || 'text, letters, watermark, logo, distorted hands, extra fingers',
        references: asList(hit?.references).map((r) => clip(r, 160)).filter(Boolean).slice(0, 6), fallback: !hit,
      });
    }
  }
  if (!j || !creatives.length) throw new Error('Виробник не повернув запитів. Спробуйте ще раз.');
  return { creatives, notes: clip(j?.notes, 800) };
}

// A readable version of the brief for the person and for the agents below.
export function renderBrief(p) {
  const lines = ['## Підсумок', p.summary || '(без підсумку)', '', '## Концепції'];
  p.concepts.forEach((c) => {
    lines.push(`### ${c.key}. ${c.name}`, `- Ідея: ${c.angle}`, `- Для кого: ${c.audience}`, `- Меседж: ${c.message}`, `- Картинка: ${c.visual}`,
      `- Формати: ${c.ratios.join(', ')}`, `- З матеріалів клієнта: ${c.uses_materials.join(', ') || 'без референсів'}`, `- Текст: ${c.needs_text ? c.text_brief || 'потрібен' : 'не потрібен'}`);
    if (c.avoid) lines.push(`- Не показувати: ${c.avoid}`);
    lines.push('');
  });
  if (p.notes) lines.push('## Що перевірити людині', p.notes);
  return lines.join('\n').trim();
}

// ------------------------------------------------------------------------------------------------------------------------ inputs
const materialsBlock = (materials = []) => ({
  title: 'Матеріали клієнта (файли запиту)',
  text: materials.length ? materials.map((m) => `- ${m.name} (${MATERIAL_KINDS[m.kind] || m.kind})`).join('\n') : 'Матеріалів не додано.',
});

function requestBlock(req, campaign, project) {
  const b = req.brief || {};
  const ratios = asList(b.ratios).map((r) => REQUEST_RATIOS.find((x) => x.key === r)?.label || r).join(', ');
  return {
    title: 'Запит клієнта на креативи',
    text: [
      `Проєкт: ${project.name || campaign.name}${project.client ? ` (клієнт: ${project.client})` : ''}`, `Кампанія: ${campaign.name}`,
      `Платформи: ${asList(campaign.platforms).map((p) => PLATFORMS[p]?.label || p).join(', ')}`,
      campaign.config?.brief ? `Бриф кампанії: ${clip(campaign.config.brief, 1500)}` : '',
      `Що потрібно від креативів: ${b.goal}`, b.product ? `Продукт або пропозиція: ${b.product}` : '', b.audience ? `Аудиторія: ${b.audience}` : '',
      b.message ? `Головний меседж: ${b.message}` : '', b.tone ? `Тон: ${b.tone}` : '', b.must ? `Обовʼязково: ${b.must}` : '', b.avoid ? `Не можна: ${b.avoid}` : '',
      `Формати: ${ratios || '1:1'}`, `Кількість концепцій: ${b.count || 3}`, `Тексти до креативів: ${{ auto: 'агент вирішує', yes: 'потрібні', no: 'не потрібні' }[b.texts] || 'агент вирішує'}`,
      `Мова текстів: ${REQUEST_LANGUAGES[b.language] || REQUEST_LANGUAGES.uk}`,
    ].filter(Boolean).join('\n'),
  };
}

// The newest finished result of an agent above this one in THIS request.
async function upstreamResults(db, sub, agent, rid) {
  const out = [];
  for (const l of sub.links.filter((x) => x.to_agent_id === agent.id)) {
    const from = sub.byId.get(l.from_agent_id);
    if (!from) continue;
    const last = (await db.from('ag_tasks').select('output').eq('agent_id', from.id).eq('request_id', rid).eq('status', 'done').order('id', { ascending: false }).limit(1)).data?.[0];
    if (!last?.output) {
      if (l.required) throw new Error(`Немає результату від «${from.name}» у цьому запиті.`);
      continue;
    }
    out.push({ from, output: last.output });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------ the handler
export async function studioRole({ ctx, team: sub, agent, task, prompt, rec }) {
  const def = studioRoleDef(agent.role);
  if (!def) throw new Error('Невідома роль агента студії.');
  const { db } = ctx;
  const rid = task.request_id;
  if (!rid) throw new Error('Завдання студії без запиту: запустіть запит зі сторінки «Креативна студія».');
  const req = (await db.from('ag_creative_requests').select('*').eq('id', rid).maybeSingle()).data;
  if (!req) throw new Error('Запит не знайдено (можливо, видалений).');
  const campaign = (await db.from('ag_campaigns').select('*').eq('id', Number(agent.scope_id)).maybeSingle()).data;
  if (!campaign) throw new Error('Кампанію не знайдено (можливо, видалена).');
  const project = (await db.from('projects').select('*').eq('id', campaign.project_id).maybeSingle()).data || {};
  const cfg = agent.config || {};
  const b = req.brief || {};
  const language = LANGUAGE_NAMES[b.language] || 'Ukrainian';
  const read = ctx.read || readSite;
  const blocks = [requestBlock(req, campaign, project), materialsBlock(req.materials)];
  const failed = [];

  if (agent.role === 'studio_client_analyst') {
    const sites = await siteBlocks(b.site || cfg.sources, { limit: 2, read });
    blocks.push(...sites);
    const accounts = await loadAccounts(db, campaign.project_id);
    if (campaign.platforms?.includes('meta') && accounts.meta) {
      const ads = await fetchBlock('meta:ad:last_30d', accounts, ctx.campaignDeps || {});
      blocks.push(ads);
      if (!ads.ok && !ads.skipped) failed.push(`${ads.title}: ${ads.error}`);
    } else {
      blocks.push({ title: 'Поточні креативи', text: 'Кабінет Meta не підключено до проєкту: даних про поточні креативи немає.' });
    }
    if (!sites.length) blocks.push({ title: 'Сайт клієнта', text: 'Адреси сайту немає в запиті й у налаштуваннях агента: сайт не читався.' });
  }

  if (agent.role === 'studio_competitor_analyst') {
    const comps = String(b.competitors || cfg.competitors || '').trim();
    const examples = String(b.examples || '').trim();
    if (!comps && !examples) throw new Error('Вкажіть конкурентів (у запиті або в налаштуваннях агента) чи додайте приклади їхніх креативів.');
    if (comps) { blocks.push({ title: 'Конкуренти, яких вказав менеджер', text: clip(comps, 2000) }); blocks.push(...await siteBlocks(comps, { limit: 4, read })); }
    if (examples) blocks.push({ title: 'Приклади креативів конкурентів (описав або вставив менеджер)', text: clip(examples, 3000) });
    const own = await siteBlocks(b.site || '', { limit: 1, read });
    blocks.push(...own.map((x) => ({ ...x, title: `Для порівняння: ${x.title}` })));
  }

  let brief = null;
  if (['studio_brief_writer', 'studio_copywriter', 'studio_producer'].includes(agent.role)) {
    const ups = await upstreamResults(db, sub, agent, rid);
    for (const u of ups) {
      if (u.output.json?.concepts) { brief = u.output.json; blocks.push({ title: `Технічне завдання (агент «${u.from.name}»)`, text: clip(u.output.text, 9000) }); }
      else blocks.push({ title: `Результат агента «${u.from.name}»`, text: clip(u.output.text, 6000) });
    }
    if (agent.role !== 'studio_brief_writer' && !brief) throw new Error('Немає технічного завдання від автора ТЗ у цьому запиті.');
  }
  for (const f of def.fields) {
    if (['sources', 'competitors'].includes(f.key)) continue;
    if (String(cfg[f.key] || '').trim()) blocks.push({ title: f.label, text: clip(cfg[f.key], 1800) });
  }

  const user = blocks.map((x) => `### ${x.title}\n${x.text}`).join('\n\n') + (failed.length ? `\n\n### Вхідні дані, які не завантажились\n${failed.map((f) => '- ' + f).join('\n')}` : '');
  const system = composeStudioSystem(agent.role, prompt.body, cfg.extra, language);
  const json = ['studio_brief_writer', 'studio_copywriter', 'studio_producer'].includes(agent.role);
  const result = await rec.callModel({ agentKey: `studio-${agent.role}`, params: { model: agent.model || MODEL, max_tokens: json ? 4200 : 2800, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
  const raw = String(result.text || '').trim();

  if (agent.role === 'studio_brief_writer') {
    const parsed = parseStudioBrief(raw, req);
    return { output: { text: renderBrief(parsed), summary: parsed.summary, json: parsed, requestId: rid }, summary: parsed.summary || `Концепцій: ${parsed.concepts.length}` };
  }
  if (agent.role === 'studio_copywriter') {
    const parsed = parseStudioCopy(raw, brief.concepts);
    const text = parsed.texts.map((t) => `**${t.concept}** · ${t.headline}\n${t.primary_text}\n${t.description} — ${t.cta}`).join('\n\n') || 'Тексти не потрібні для жодної концепції.';
    return { output: { text, summary: `Текстів: ${parsed.texts.length}`, json: parsed, requestId: rid }, summary: `Текстів: ${parsed.texts.length}` };
  }
  if (agent.role === 'studio_producer') {
    const parsed = parseStudioProducer(raw, brief.concepts, clip(cfg.style, 600));
    const rows = await saveCreatives(db, rid, parsed.creatives, req.materials);
    const text = rows.map((c) => `**${c.concept_key} · ${c.ratio}**\n${c.prompt}`).join('\n\n');
    return { output: { text, summary: `Запитів до Higgsfield: ${rows.length}`, json: { creatives: parsed.creatives, notes: parsed.notes }, requestId: rid }, summary: `Запитів до Higgsfield: ${rows.length}` };
  }
  const text = raw;
  return { output: { text, summary: summaryOf(text), inputs: blocks.map((x) => x.title), failedInputs: failed, requestId: rid }, summary: summaryOf(text) };
}

// One row per concept and format; a rerun updates the rows that are not yet approved instead of piling up copies.
async function saveCreatives(db, rid, creatives, materials = []) {
  const byName = new Map(materials.map((m) => [m.name, m]));
  const have = (await db.from('ag_creatives').select('id, concept_key, ratio, status').eq('request_id', rid)).data || [];
  const out = [];
  for (const c of creatives) {
    const refs = c.references.map((n) => byName.get(n)).filter(Boolean).map((m) => ({ name: m.name, url: m.url, kind: m.kind }));
    const fields = { concept_name: c.concept_name, prompt: c.prompt, negative_prompt: c.negative_prompt, hf: { references: refs }, updated_at: new Date().toISOString() };
    const old = have.find((h) => h.concept_key === c.concept_key && h.ratio === c.ratio);
    if (old) {
      if (!['approved', 'review', 'producing', 'qc'].includes(old.status)) await db.from('ag_creatives').update({ ...fields, status: 'planned' }).eq('id', old.id);
      out.push({ ...c, id: old.id });
    } else {
      const made = (await db.from('ag_creatives').insert({ request_id: rid, concept_key: c.concept_key, ratio: c.ratio, status: 'planned', ...fields }).select().single()).data;
      out.push({ ...c, id: made?.id });
    }
  }
  return out;
}
