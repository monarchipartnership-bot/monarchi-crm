// The work of the agents of the creative department (one handler for the six roles). The agent is a shared worker: the task says WHICH client
// (campaign_id) and, for the request chain, WHICH request. The handler gathers what the role needs for that client (the card of the project, the
// client's own settings from the link row, the request and its materials, the research of other departments, the analysis of past creatives, the
// results of the agents above it IN THIS REQUEST), builds the prompt (editable instruction + client instruction + locked rules), calls the model
// and saves the result as the task's output. The strategist's, brief writer's, copywriter's, maker's and checker's answers are JSON: they are
// parsed and checked here, and the maker's prompts become the rows of ag_creatives. Everything the outside world provides is handed in
// (ctx.read, ctx.campaignDeps), so tests run it with stand-ins.
import { PLATFORMS } from '../../src/lib/agents/campaignTeam.js';
import { REQUEST_LANGUAGES, REQUEST_RATIOS, MATERIAL_KINDS, MAX_CONCEPTS, creativeRoleDef } from '../../src/lib/agents/creativeTeam.js';
import { composeCreativeSystem } from '../../src/lib/agents/creativePrompts.js';
import { fetchBlock, loadAccounts, siteBlocks, summaryOf } from './campaignRun.js';
import { readJson } from './agentContent.js';
import { readSite } from './siteReader.js';

const MODEL = 'claude-sonnet-5';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const LANGUAGE_NAMES = { uk: 'Ukrainian', en: 'English' };
const RATIO_KEYS = REQUEST_RATIOS.map((r) => r.key);
const FRESH_DAYS = 14;
const asList = (v) => (Array.isArray(v) ? v : []);

// ------------------------------------------------------------------------------------------------------------------------ parsers
// The strategist's answer → { summary, directions, clarify }: at most three directions (and not more than the request asks), by priority.
export function parseCreativePlan(text, request = {}) {
  const j = readJson(text);
  const max = Math.min(MAX_CONCEPTS, Math.max(1, Number(request.brief?.count) || MAX_CONCEPTS));
  const seen = new Set();
  const directions = asList(j?.directions).map((d, i) => {
    let key = clip(d?.key, 20).replace(/[^\w-]/g, '') || `d${i + 1}`;
    if (seen.has(key)) key = `d${i + 1}`;
    seen.add(key);
    return {
      key, name: clip(d?.name, 80) || `Напрям ${i + 1}`, priority: Number(d?.priority) || i + 1, why: clip(d?.why, 800), audience: clip(d?.audience, 300),
      angle: clip(d?.angle, 400), message: clip(d?.message, 400), tests: clip(d?.tests, 400), notes: clip(d?.notes, 500),
    };
  }).filter((d) => d.angle || d.why).sort((a, b) => a.priority - b.priority).slice(0, max);
  if (!directions.length) throw new Error('Стратег не повернув жодного напряму. Спробуйте ще раз.');
  return { summary: clip(j?.summary, 800), directions, clarify: clip(j?.clarify, 600) };
}

// The brief writer's answer → { summary, concepts, notes }. Concepts are checked against the request (how many, which formats, texts or not).
export function parseCreativeBrief(text, request = {}, directions = []) {
  const j = readJson(text);
  const brief = request.brief || {};
  const allowed = asList(brief.ratios).filter((r) => RATIO_KEYS.includes(r));
  const ratios = allowed.length ? allowed : ['1:1'];
  const max = Math.max(1, Math.min(directions.length || MAX_CONCEPTS, Number(brief.count) || MAX_CONCEPTS));
  const seen = new Set();
  const concepts = asList(j?.concepts).slice(0, max).map((c, i) => {
    let key = clip(c?.key, 20).replace(/[^\w-]/g, '') || `c${i + 1}`;
    if (seen.has(key)) key = `c${i + 1}`;
    seen.add(key);
    const mine = asList(c?.ratios).filter((r) => ratios.includes(r));
    const needsText = brief.texts === 'yes' ? true : brief.texts === 'no' ? false : c?.needs_text !== false;
    return {
      key, direction: clip(c?.direction, 20), name: clip(c?.name, 80) || `Концепція ${i + 1}`, angle: clip(c?.angle, 400), audience: clip(c?.audience, 300), message: clip(c?.message, 400),
      visual: clip(c?.visual, 1200), uses_materials: asList(c?.uses_materials).map((m) => clip(m, 160)).filter(Boolean).slice(0, 6),
      ratios: mine.length ? mine : ratios, needs_text: needsText, text_brief: clip(c?.text_brief, 600), avoid: clip(c?.avoid, 400),
    };
  }).filter((c) => c.visual);
  if (!concepts.length) throw new Error('Агент по ТЗ не повернув жодної концепції з описом картинки. Спробуйте ще раз.');
  return { summary: clip(j?.summary, 800), concepts, notes: clip(j?.notes, 800) };
}

export function parseCreativeCopy(text, concepts = []) {
  const j = readJson(text);
  const keys = new Set(concepts.map((c) => c.key));
  const texts = asList(j?.texts).map((t) => ({
    concept: clip(t?.concept, 20), headline: clip(t?.headline, 90), primary_text: clip(t?.primary_text, 900), description: clip(t?.description, 160), cta: clip(t?.cta, 60),
  })).filter((t) => keys.has(t.concept) && (t.headline || t.primary_text));
  return { texts, notes: clip(j?.notes, 800) };
}

// The maker's prompts, one per concept and format. A concept or format the model skipped gets a plain prompt from the brief, so no creative is lost.
export function parseCreativeMaker(text, concepts = [], style = '') {
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
  if (!j || !creatives.length) throw new Error('Агент креативщик не повернув запитів. Спробуйте ще раз.');
  return { creatives, notes: clip(j?.notes, 800) };
}

// The checker's verdict: revise on any high issue or three medium ones, whatever the model said.
export function parseCreativeQc(text) {
  const j = readJson(text);
  if (!j) throw new Error('Агент перевірки якості не повернув вердикт. Спробуйте ще раз.');
  const issues = asList(j.issues).map((i) => ({
    target: ['copy', 'creative'].includes(i?.target) ? i.target : 'creative', concept: clip(i?.concept, 20), severity: ['high', 'medium', 'low'].includes(i?.severity) ? i.severity : 'low', comment: clip(i?.comment, 500),
  })).filter((i) => i.comment);
  const revise = issues.some((i) => i.severity === 'high') || issues.filter((i) => i.severity === 'medium').length >= 3;
  return { verdict: revise ? 'revise' : 'pass', summary: clip(j.summary, 300), issues };
}

// A readable version of the strategist's plan and of the brief, for the person and for the agents below.
export function renderPlan(p) {
  const lines = ['## Підсумок', p.summary || '(без підсумку)', '', '## Напрями'];
  p.directions.forEach((d) => {
    lines.push(`### ${d.priority}. ${d.name} (${d.key})`, `- Чому: ${d.why}`, `- Для кого: ${d.audience}`, `- Ідея: ${d.angle}`, `- Меседж: ${d.message}`, `- Що перевіряє: ${d.tests}`);
    if (d.notes) lines.push(`- Ризики: ${d.notes}`);
    lines.push('');
  });
  if (p.clarify) lines.push('## Що уточнити менеджеру', p.clarify);
  return lines.join('\n').trim();
}

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

// The card of the project (what the manager already filled in there) and the campaign brief: filled automatically, the manager only checks.
function projectBlock(project, campaign) {
  return {
    title: 'Картка проєкту',
    text: [
      `Проєкт: ${project.name || campaign.name}${project.client ? ` (клієнт: ${project.client})` : ''}`, project.website ? `Сайт: ${project.website}` : '', project.country ? `Країна: ${project.country}` : '',
      project.business_type ? `Тип бізнесу: ${project.business_type}` : '', asList(project.services).length ? `Послуги: ${project.services.join(', ')}` : '',
      project.notes ? `Нотатки: ${clip(project.notes, 1200)}` : '', project.additional_info ? `Додаткова інформація: ${clip(project.additional_info, 1200)}` : '',
      `Кампанія: ${campaign.name}`, `Платформи: ${asList(campaign.platforms).map((p) => PLATFORMS[p]?.label || p).join(', ')}`,
      campaign.config?.brief ? `Бриф кампанії: ${clip(campaign.config.brief, 1500)}` : '', campaign.config?.goals ? `Цілі кампанії: ${clip(campaign.config.goals, 1000)}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function requestBlock(req) {
  const b = req.brief || {};
  const ratios = asList(b.ratios).map((r) => REQUEST_RATIOS.find((x) => x.key === r)?.label || r).join(', ');
  return {
    title: 'Запит клієнта на креативи',
    text: [
      `Що потрібно від креативів: ${b.goal}`, b.product ? `Продукт або пропозиція: ${b.product}` : '', b.audience ? `Аудиторія: ${b.audience}` : '',
      b.message ? `Головний меседж: ${b.message}` : '', b.tone ? `Тон: ${b.tone}` : '', b.must ? `Обовʼязково: ${b.must}` : '', b.avoid ? `Не можна: ${b.avoid}` : '',
      `Формати: ${ratios || '1:1'}`, `Кількість напрямів: до ${b.count || MAX_CONCEPTS}`, `Тексти до креативів: ${{ auto: 'агент вирішує', yes: 'потрібні', no: 'не потрібні' }[b.texts] || 'агент вирішує'}`,
      `Мова текстів: ${REQUEST_LANGUAGES[b.language] || REQUEST_LANGUAGES.uk}`,
    ].filter(Boolean).join('\n'),
  };
}

// «from 20.10 (3 days ago, fresh)» / «(21 days ago, OUTDATED)»: the strategist must know how old what it gets is.
function freshness(iso, now) {
  if (!iso) return '';
  const days = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 86400000));
  return ` (звіт від ${String(iso).slice(0, 10)}: ${days} дн. тому, ${days <= FRESH_DAYS ? 'свіжий' : 'ЗАСТАРІВ'})`;
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

// What other departments produced for this client: the research agents (still per-campaign in the old campaign team) and the department's own
// analyst of past creatives.
const RESEARCH_ROLES = [['business_research', 'Дослідження бізнесу'], ['competitor_research', 'Дослідження конкурентів'], ['audience_research', 'Дослідження аудиторії']];
async function outsideInputs(db, campaignId, now) {
  const blocks = [];
  const research = (await db.from('ag_agents').select('id, role, name').eq('team', 'campaign').eq('scope_id', String(campaignId))).data || [];
  for (const [role, title] of RESEARCH_ROLES) {
    const a = research.find((x) => x.role === role);
    if (!a) continue;
    const last = (await db.from('ag_tasks').select('output, finished_at').eq('agent_id', a.id).eq('status', 'done').order('id', { ascending: false }).limit(1)).data?.[0];
    if (last?.output?.text) blocks.push({ title: `${title}${freshness(last.finished_at, now)}`, text: clip(last.output.text, 5000) });
  }
  return blocks;
}

async function latestAnalysis(db, dept, campaignId) {
  const analyst = dept.agents.find((a) => a.role === 'creative_analyst');
  if (!analyst) return null;
  return (await db.from('ag_tasks').select('output, finished_at').eq('agent_id', analyst.id).eq('campaign_id', campaignId).eq('status', 'done').order('id', { ascending: false }).limit(1)).data?.[0] || null;
}

// ------------------------------------------------------------------------------------------------------------------------ the handler
export async function creativeRole({ ctx, team: sub, agent, task, prompt, rec }) {
  const def = creativeRoleDef(agent.role);
  if (!def) throw new Error('Невідома роль агента відділу креативів.');
  const { db } = ctx;
  const now = ctx.now ? ctx.now() : new Date();
  const rid = task.request_id || null;
  const req = rid ? (await db.from('ag_creative_requests').select('*').eq('id', rid).maybeSingle()).data : null;
  if (rid && !req) throw new Error('Запит не знайдено (можливо, видалений).');
  const campaignId = task.campaign_id || req?.campaign_id;
  if (!campaignId) throw new Error('Завдання без клієнта: запустіть його зі сторінки агента або кампанії.');
  const campaign = (await db.from('ag_campaigns').select('*').eq('id', campaignId).maybeSingle()).data;
  if (!campaign) throw new Error('Кампанію не знайдено (можливо, видалена).');
  const project = (await db.from('projects').select('*').eq('id', campaign.project_id).maybeSingle()).data || {};
  const link = (await db.from('ag_agent_clients').select('*').eq('agent_id', agent.id).eq('campaign_id', campaignId).maybeSingle()).data;
  const cfg = agent.config || {};
  const mine = link?.config || {};
  const b = req?.brief || {};
  const language = LANGUAGE_NAMES[b.language] || 'Ukrainian';
  const read = ctx.read || readSite;
  const blocks = [projectBlock(project, campaign)];
  for (const f of def.clientFields || []) if (String(mine[f.key] || '').trim()) blocks.push({ title: `${f.label} (клієнт)`, text: clip(mine[f.key], 1500) });
  for (const f of def.fields || []) if (String(cfg[f.key] || '').trim()) blocks.push({ title: f.label, text: clip(cfg[f.key], 1800) });
  if (req) blocks.push(requestBlock(req), materialsBlock(req.materials));
  const failed = [];
  const accounts = await loadAccounts(db, campaign.project_id);
  const dept = sub;
  let brief = null;
  let plan = null;
  let json = true;

  if (agent.role === 'creative_analyst') {
    json = false;
    if (!campaign.platforms?.includes('meta') || !accounts.meta) {
      const text = '## Підсумок\nУ клієнта не підключено кабінет Meta: даних про креативи немає, аналіз не виконано.';
      return { output: { text, summary: 'Немає даних: кабінет Meta не підключено.', skipped: true, campaignId }, summary: 'Немає даних: кабінет Meta не підключено.' };
    }
    for (const spec of ['meta:ad:last_30d', 'meta:ad:last_7d']) {
      const got = await fetchBlock(spec, accounts, ctx.campaignDeps || {});
      blocks.push(got);
      if (!got.ok && !got.skipped) failed.push(`${got.title}: ${got.error}`);
    }
    if (failed.length >= 2) throw new Error(`Не вдалося отримати дані з кабінету Meta. ${failed[0]}`);
    const last = (await db.from('ag_tasks').select('output').eq('agent_id', agent.id).eq('campaign_id', campaignId).eq('status', 'done').order('id', { ascending: false }).limit(1)).data?.[0];
    if (last?.output?.summary) blocks.push({ title: 'Ваш попередній звіт (підсумок), для порівняння', text: clip(last.output.summary, 800) });
  }

  if (agent.role === 'creative_strategist') {
    blocks.push(...await outsideInputs(db, campaignId, now));
    const analysis = await latestAnalysis(db, dept, campaignId);
    if (analysis?.output?.text && !analysis.output.skipped) blocks.push({ title: `Аналіз ефективності креативів${freshness(analysis.finished_at, now)}`, text: clip(analysis.output.text, 6000) });
    else blocks.push({ title: 'Аналіз ефективності креативів', text: 'Аналізу немає (новий клієнт або кабінет Meta не підключено): напрями спираються на дослідження й сайт.' });
    // research that is missing or outdated is no excuse to work blind: the strategist reads the site (and the named competitors) itself
    const fresh = (re) => blocks.some((x) => re.test(x.title) && /свіжий/.test(x.title));
    if (!fresh(/^Дослідження бізнесу/)) blocks.push(...await siteBlocks(b.site || project.website, { limit: 2, read }));
    if (!fresh(/^Дослідження конкурентів/) && String(b.competitors || '').trim()) blocks.push({ title: 'Конкуренти, яких вказав менеджер', text: clip(b.competitors, 2000) }, ...await siteBlocks(b.competitors, { limit: 3, read }));
    if (String(b.examples || '').trim()) blocks.push({ title: 'Приклади креативів конкурентів (описав або вставив менеджер)', text: clip(b.examples, 3000) });
  }

  if (['creative_brief', 'creative_copywriter', 'creative_maker', 'creative_quality'].includes(agent.role)) {
    if (!rid) throw new Error('Це завдання працює лише в межах запиту на креативи.');
    const ups = await upstreamResults(db, sub, agent, rid);
    for (const u of ups) {
      if (u.output.json?.directions) { plan = u.output.json; blocks.push({ title: `План стратега (агент «${u.from.name}»)`, text: clip(u.output.text, 6000) }); }
      else if (u.output.json?.concepts) { brief = u.output.json; blocks.push({ title: `Технічне завдання (агент «${u.from.name}»)`, text: clip(u.output.text, 9000) }); }
      else blocks.push({ title: `Результат агента «${u.from.name}»`, text: clip(u.output.text, 6000) });
    }
    if (agent.role === 'creative_brief' && !plan) throw new Error('Немає плану від Агента креативний стратег у цьому запиті.');
    if (['creative_copywriter', 'creative_maker'].includes(agent.role) && !brief) throw new Error('Немає технічного завдання від Агента по ТЗ у цьому запиті.');
    if (agent.role === 'creative_quality') {
      if (!brief) {
        const t = (await db.from('ag_tasks').select('output').eq('request_id', rid).eq('status', 'done').order('id', { ascending: false })).data?.find((x) => x.output?.json?.concepts);
        brief = t?.output?.json || null;
        if (t) blocks.push({ title: 'Технічне завдання', text: clip(t.output.text, 9000) });
      }
      if (!brief) throw new Error('Немає технічного завдання для перевірки.');
    }
  }
  if (task.brief?.feedback) blocks.push({ title: 'Зауваження перевірки до попередньої версії (виправте саме їх)', text: clip(JSON.stringify(task.brief.feedback), 3000) });

  const user = blocks.map((x) => `### ${x.title}\n${x.text}`).join('\n\n') + (failed.length ? `\n\n### Вхідні дані, які не завантажились\n${failed.map((f) => '- ' + f).join('\n')}` : '');
  const system = composeCreativeSystem(agent.role, prompt.body, mine.extra, language);
  const result = await rec.callModel({ agentKey: `creative-${agent.role}`, params: { model: agent.model || MODEL, max_tokens: json ? 4200 : 2800, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
  const raw = String(result.text || '').trim();

  if (agent.role === 'creative_strategist') {
    const parsed = parseCreativePlan(raw, req || {});
    return { output: { text: renderPlan(parsed), summary: parsed.summary, json: parsed, requestId: rid, campaignId }, summary: parsed.summary || `Напрямів: ${parsed.directions.length}` };
  }
  if (agent.role === 'creative_brief') {
    const parsed = parseCreativeBrief(raw, req, plan.directions);
    return { output: { text: renderBrief(parsed), summary: parsed.summary, json: parsed, requestId: rid, campaignId }, summary: parsed.summary || `Концепцій: ${parsed.concepts.length}` };
  }
  if (agent.role === 'creative_copywriter') {
    const parsed = parseCreativeCopy(raw, brief.concepts);
    const text = parsed.texts.map((t) => `**${t.concept}** · ${t.headline}\n${t.primary_text}\n${t.description} — ${t.cta}`).join('\n\n') || 'Тексти не потрібні для жодної концепції.';
    return { output: { text, summary: `Текстів: ${parsed.texts.length}`, json: parsed, requestId: rid, campaignId }, summary: `Текстів: ${parsed.texts.length}` };
  }
  if (agent.role === 'creative_maker') {
    const parsed = parseCreativeMaker(raw, brief.concepts, clip(cfg.style, 600));
    const rows = await saveCreatives(db, rid, parsed.creatives, req.materials);
    const text = rows.map((c) => `**${c.concept_key} · ${c.ratio}**\n${c.prompt}`).join('\n\n');
    return { output: { text, summary: `Запитів до Higgsfield: ${rows.length}`, json: { creatives: parsed.creatives, notes: parsed.notes }, requestId: rid, campaignId }, summary: `Запитів до Higgsfield: ${rows.length}` };
  }
  if (agent.role === 'creative_quality') {
    const parsed = parseCreativeQc(raw);
    const text = [`## Підсумок\n${parsed.summary || (parsed.verdict === 'pass' ? 'Помилок не знайдено.' : 'Є зауваження.')}`, '', ...parsed.issues.map((i) => `- [${i.severity}] ${i.concept || '—'} (${i.target}): ${i.comment}`)].join('\n');
    return { output: { text, summary: parsed.summary || parsed.verdict, json: parsed, requestId: rid, campaignId }, summary: `${parsed.verdict === 'pass' ? 'Готово до перегляду' : 'Потрібна переробка'}: ${parsed.summary || ''}`.trim() };
  }
  return { output: { text: raw, summary: summaryOf(raw), inputs: blocks.map((x) => x.title), failedInputs: failed, requestId: rid, campaignId }, summary: summaryOf(raw) };
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
