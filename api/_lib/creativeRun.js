// The work of the agents of the creative department (one handler for the six roles). The agent is a shared worker: the task says WHICH client
// (campaign_id) and, for the request chain, WHICH request. The handler gathers what the role needs for that client (the card of the project, the
// client's own settings from the link row, the request and its materials, the research of other departments, the analysis of past creatives, the
// results of the agents above it IN THIS REQUEST), builds the prompt (editable instruction + client instruction + locked rules), calls the model
// and saves the result as the task's output. The strategist's, brief writer's, copywriter's, maker's and checker's answers are JSON: they are
// parsed and checked here, and the maker's prompts become the rows of ag_creatives. Everything the outside world provides is handed in
// (ctx.read, ctx.campaignDeps), so tests run it with stand-ins.
import { PLATFORMS } from '../../src/lib/agents/campaignTeam.js';
import { IDEA_SOURCES, REQUEST_LANGUAGES, REQUEST_RATIOS, MATERIAL_KINDS, MAX_CONCEPTS, creativeRoleDef, cycleAgentFields, directionLimit } from '../../src/lib/agents/creativeTeam.js';
import { ASSET_KINDS, CTA_MODES, INPUT_FIELDS, PROFILE_FIELDS, ctaVariants, inputState } from '../../src/lib/agents/projectCreative.js';
import { composeCreativeSystem } from '../../src/lib/agents/creativePrompts.js';
import { instructionBlock } from '../../src/lib/agents/campaignCycles.js';
import { MEMORY_LIMITS, buildDossier, memoryBlock } from '../../src/lib/agents/clientMemory.js';
import { fetchBlock, loadAccounts, siteBlocks, summaryOf } from './campaignRun.js';
import { readJson } from './agentContent.js';
import { readSite } from './siteReader.js';
import { figmaText, figmaToken, readFigma } from './figma.js';
import { generateCreatives } from './creativeMake.js';

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
  const max = directionLimit(request.brief || {});
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
  return { summary: clip(j?.summary, 800), directions, inventory: parseInventory(j), clarify: clip(j?.clarify, 600) };
}

// What the strategist saw in the materials: what is there and what it is good for, what is missing, what can be generated instead.
function parseInventory(j) {
  const inv = j?.inventory || {};
  return {
    have: asList(inv.have).map((h) => ({ file: clip(h?.file, 160), what: clip(h?.what, 240), use: clip(h?.use, 240) })).filter((h) => h.file).slice(0, 12),
    missing: asList(inv.missing).map((m) => clip(m, 240)).filter(Boolean).slice(0, 8),
    to_generate: asList(inv.to_generate).map((m) => clip(m, 240)).filter(Boolean).slice(0, 8),
  };
}

const TEXT_ZONES = ['left', 'right', 'top', 'bottom', 'center', 'none'];
const REF_ROLES = ['product', 'logo', 'style', 'person', 'other'];
// Who puts the words on the picture: the image model itself ('model', tried on English: it spells exactly), the system over a clean picture ('overlay',
// the default for other languages until the model is tried on them), or nobody ('none'). Decided by the system from the request, not by an agent.
export function textRender(brief = {}, needsText = true) {
  if (!needsText || brief.texts === 'no') return 'none';
  return brief.language === 'en' ? 'model' : 'overlay';
}
export const COPY_LINES = (c) => [c.copy?.headline && `headline "${c.copy.headline}"`, c.copy?.subline && `subline "${c.copy.subline}"`, c.copy?.badge && `badge "${c.copy.badge}"`].filter(Boolean);

// The brief writer's answer → { summary, concepts, notes }. Concepts are checked against the request (how many, which formats, texts or not).
export function parseCreativeBrief(text, request = {}, directions = []) {
  const j = readJson(text);
  const brief = request.brief || {};
  const allowed = asList(brief.ratios).filter((r) => RATIO_KEYS.includes(r));
  const ratios = allowed.length ? allowed : ['1:1'];
  const max = Math.max(1, Math.min(directions.length || MAX_CONCEPTS, directionLimit(brief)));
  const seen = new Set();
  // the files the picture may be built on: the materials of the request (when there are none on record, any name is accepted)
  const known = new Set(asList(request.materials).map((m) => m.name));
  const isKnown = (n) => !known.size || known.has(n);
  const given = brief.texts === 'given' ? asList(brief.given_texts) : [];
  const concepts = asList(j?.concepts).slice(0, max).map((c, i) => {
    let key = clip(c?.key, 20).replace(/[^\w-]/g, '') || `c${i + 1}`;
    if (seen.has(key)) key = `c${i + 1}`;
    seen.add(key);
    const mine = asList(c?.ratios).filter((r) => ratios.includes(r));
    const needsText = brief.texts === 'yes' || brief.texts === 'given' ? true : brief.texts === 'no' ? false : c?.needs_text !== false;
    const references = asList(c?.references).map((r) => ({ file: clip(r?.file, 160), role: REF_ROLES.includes(r?.role) ? r.role : 'other', keep: clip(r?.keep, 300) })).filter((r) => r.file && isKnown(r.file)).slice(0, 6);
    const files = [...new Set([...references.map((r) => r.file), ...asList(c?.uses_materials).map((m) => clip(m, 160)).filter((m) => m && isKnown(m))])].slice(0, 6);
    // the manager's texts are not trusted to the model: the text i of the request goes to the direction i word for word
    const at = directions.findIndex((d) => d.key === clip(c?.direction, 20));
    const g = given[at >= 0 ? at : i];
    const copy = g ? { source: 'given', headline: g.headline, subline: g.subline, badge: g.badge } : { source: needsText ? 'copywriter' : 'none', headline: '', subline: '', badge: '' };
    const zone = TEXT_ZONES.includes(c?.layout?.text_zone) ? c.layout.text_zone : needsText ? 'left' : 'none';
    return {
      key, direction: clip(c?.direction, 20), name: clip(c?.name, 80) || `Концепція ${i + 1}`, angle: clip(c?.angle, 400), audience: clip(c?.audience, 300), message: clip(c?.message, 400),
      visual: clip(c?.visual, 1200), references, uses_materials: files, layout: { text_zone: zone, note: clip(c?.layout?.note, 300) },
      ratios: mine.length ? mine : ratios, needs_text: needsText, text_brief: clip(c?.text_brief, 600), copy, text_render: textRender(brief, needsText),
      cta: { show: brief.cta !== false, text: clip(brief.cta_text, 40) }, avoid: clip(c?.avoid, 400),
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

// An answer cut off by the token limit still holds the complete objects before the cut: they are taken, the rest of the pictures get the plain prompt of the brief.
export function salvageCreatives(text) {
  const raw = String(text || '');
  const start = raw.indexOf('"creatives"');
  const open = start < 0 ? -1 : raw.indexOf('[', start);
  if (open < 0) return null;
  const out = [];
  let depth = 0; let from = -1; let str = false; let esc = false;
  for (let i = open + 1; i < raw.length; i += 1) {
    const ch = raw[i];
    if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true;
    else if (ch === '{') { if (depth === 0) from = i; depth += 1; }
    else if (ch === '}') { depth -= 1; if (depth === 0 && from >= 0) { try { out.push(JSON.parse(raw.slice(from, i + 1))); } catch { /* a broken object is skipped */ } from = -1; } }
  }
  return out.length ? { creatives: out, notes: 'Відповідь моделі обірвалась: частину запитів складено з технічного завдання, перевірте їх.' } : null;
}

// How many pictures the maker answers for: one per concept and format. Its answer budget grows with it.
export const makerTokens = (concepts = []) => Math.min(12000, 400 * concepts.reduce((n, c) => n + (c.ratios?.length || 1), 0) + 1000);

// The maker's prompts, one per concept and format. A concept or format the model skipped gets a plain prompt from the brief, so no creative is lost.
export function parseCreativeMaker(text, concepts = [], style = '') {
  const j = readJson(text) || salvageCreatives(text);
  const got = asList(j?.creatives);
  const creatives = [];
  for (const c of concepts) {
    for (const ratio of c.ratios) {
      const hit = got.find((g) => clip(g?.concept, 20) === c.key && clip(g?.ratio, 10) === ratio && clip(g?.prompt, 4000));
      const words = c.text_render === 'model' ? COPY_LINES(c) : [];
      const base = clip(hit?.prompt, 2500) || [c.visual, style, words.length ? `Text in the picture, spelled exactly as written, clean sans-serif type with a clear hierarchy, in the free ${c.layout?.text_zone || 'left'} zone: ${words.join(', ')}. No other words` : ''].filter(Boolean).join('. ');
      creatives.push({
        concept_key: c.key, concept_name: c.name, ratio, prompt: base, negative_prompt: clip(hit?.negative_prompt, 500) || (c.text_render === 'model' ? 'watermark, extra words, misspelled words, distorted hands, extra fingers' : 'text, letters, watermark, logo, distorted hands, extra fingers'),
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
  const inv = p.inventory;
  if (inv && (inv.have.length || inv.missing.length || inv.to_generate.length)) {
    lines.push('## Матеріали: що є, чого немає');
    if (inv.have.length) lines.push('Є:', ...inv.have.map((h) => `- ${h.file}: ${h.what}${h.use ? `; годиться: ${h.use}` : ''}`));
    if (inv.missing.length) lines.push('Немає:', ...inv.missing.map((m) => `- ${m}`));
    if (inv.to_generate.length) lines.push('Можна згенерувати:', ...inv.to_generate.map((m) => `- ${m}`));
    lines.push('');
  }
  if (p.clarify) lines.push('## Що уточнити менеджеру', p.clarify);
  return lines.join('\n').trim();
}

export function renderBrief(p) {
  const lines = ['## Підсумок', p.summary || '(без підсумку)', '', '## Концепції'];
  p.concepts.forEach((c) => {
    const refs = c.references?.length ? c.references.map((r) => `${r.file} (${r.role}${r.keep ? `; лишити як у файлі: ${r.keep}` : ''})`).join('; ') : c.uses_materials.join(', ') || 'без референсів';
    const copy = COPY_LINES(c);
    lines.push(`### ${c.key}. ${c.name}`, `- Ідея: ${c.angle}`, `- Для кого: ${c.audience}`, `- Меседж: ${c.message}`, `- Картинка: ${c.visual}`,
      `- Референси: ${refs}`, `- Місце під текст: ${c.layout?.text_zone || 'none'}${c.layout?.note ? ` (${c.layout.note})` : ''}`,
      `- Формати: ${c.ratios.join(', ')}`, `- Текст: ${c.needs_text ? (copy.length ? `${c.copy.source === 'given' ? 'заданий менеджером, дослівно' : 'від копірайтера'}: ${copy.join(', ')}` : c.text_brief || 'потрібен') : 'не потрібен'}`,
      `- Хто робить текст на картинці: ${{ model: 'модель (точний текст у запиті)', overlay: 'система накладає поверх чистої картинки', none: 'ніхто' }[c.text_render || 'none']}`,
      `- Кнопка заклику до дії: ${c.cta?.show === false ? 'ні' : `так${c.cta?.text ? `, «${c.cta.text}»` : ''}`}`);
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
      `Формати: ${ratios || '1:1'}`, b.texts === 'given' ? `Кількість напрямів: рівно ${directionLimit(b)}, по одному на кожен заданий текст` : `Кількість напрямів: до ${b.count || MAX_CONCEPTS}`,
      `Тексти до креативів: ${{ auto: 'агент вирішує', yes: 'потрібні, пише копірайтер', given: 'задані менеджером, використовувати дослівно', no: 'не потрібні' }[b.texts] || 'агент вирішує'}`,
      ...(b.texts === 'given' ? asList(b.given_texts).map((t, i) => `Заданий текст ${i + 1}: заголовок «${t.headline}»${t.subline ? `; підзаголовок «${t.subline}»` : ''}${t.badge ? `; плашка «${t.badge}»` : ''}`) : []),
      `Мова текстів: ${REQUEST_LANGUAGES[b.language] || REQUEST_LANGUAGES.uk}`,
      `Звідки брати ідеї: ${IDEA_SOURCES[b.idea_source] || IDEA_SOURCES.mix}`, b.figma ? `Макет у Figma: ${b.figma}` : '',
      b.cta === false ? 'Кнопка заклику до дії: не потрібна' : `Кнопка заклику до дії: так${b.cta_text ? `, текст кнопки «${b.cta_text}»` : ''}`,
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

// What the project keeps for the creative department (tab «Креативи»): the client's rules and library for every role of the request chain, and,
// for the strategist, what other departments' agents delivered (or what is still missing, so it says so instead of guessing).
async function projectCreativeBlocks(db, projectId, now, { inputs = false } = {}) {
  const row = (await db.from('project_creative').select('*').eq('project_id', projectId).maybeSingle()).data || null;
  const assets = (await db.from('project_creative_assets').select('name, kind').eq('project_id', projectId).order('id', { ascending: true })).data || [];
  const blocks = [];
  const rules = [
    row?.figma_url ? `Макет бренду в Figma: ${row.figma_url}` : '',
    `Кнопка заклику до дії на креативі: ${CTA_MODES[row?.cta_mode || 'always']}${ctaVariants(row?.cta_text).length ? `. Варіанти тексту кнопки від клієнта (для кожного креативу візьми той, що підходить йому за змістом): ${ctaVariants(row.cta_text).map((v) => `«${v}»`).join(', ')}` : ''}`,
    row?.restrictions ? `Обмеження клієнта: ${clip(row.restrictions, 2000)}` : '',
  ].filter(Boolean);
  blocks.push({ title: 'Правила клієнта для креативів (вкладка «Креативи» проєкту)', text: rules.join('\n') });
  // what the manager told about the client (the section «AI-агенти» of the project card): every role reads it
  PROFILE_FIELDS.forEach((f) => {
    const item = row?.inputs?.[f.key];
    if (String(item?.body || '').trim()) blocks.push({ title: `${f.label} (картка проєкту, ${item.by ? `вказав ${item.by}` : 'вказано вручну'})`, text: clip(item.body, 3000) });
  });
  blocks.push({ title: 'Бібліотека матеріалів клієнта (вкладка «Креативи» проєкту)', text: assets.length ? assets.map((a) => `- ${a.name} (${ASSET_KINDS[a.kind] || a.kind})`).join('\n') : 'Бібліотека порожня.' });
  // the recorded history of the manager's decisions on this client's materials (what was approved, returned and why)
  const memory = memoryBlock(buildDossier((await db.from('ag_client_events').select('kind, subject, body, actor, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(MEMORY_LIMITS.events)).data || []));
  if (memory) blocks.push(memory);
  const have = new Set();
  if (inputs) {
    const missing = [];
    for (const f of INPUT_FIELDS) {
      const item = row?.inputs?.[f.key];
      const st = inputState(item, now);
      if (st.state === 'wait') { missing.push(`- ${f.label} (заповнює: ${f.agent})`); continue; }
      have.add(f.key);
      const who = item.source === 'manual' ? `введено вручну${item.by ? `, ${item.by}` : ''}` : `агент: ${item.by || f.agent}`;
      blocks.push({ title: `${f.label}${freshness(item.filled_at, now)} [${who}]`, text: clip(item.body, 5000) });
    }
    if (missing.length) blocks.push({ title: 'Дані від інших відділів, яких ще немає', text: `${missing.join('\n')}\nПрацюйте без них і чесно скажіть у результаті, чого не вистачило.` });
  }
  return { blocks, have, row };
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
  if (!campaignId) throw new Error('Завдання без клієнта: запустіть його зі сторінки агента або операції.');
  const campaign = (await db.from('ag_campaigns').select('*').eq('id', campaignId).maybeSingle()).data;
  if (!campaign) throw new Error('Операцію не знайдено (можливо, видалена).');
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
  // what the manager asked of THIS agent for THIS cycle (the form of the cycle): it counts above the general settings of the agent
  const cycleSet = b.agent_settings?.[agent.role] || {};
  for (const f of cycleAgentFields(agent.role)) if (f.type !== 'check' && f.key !== 'max_usd' && String(cycleSet[f.key] || '').trim()) blocks.push({ title: `${f.label} (для цього завдання: важливіше за загальні налаштування)`, text: clip(cycleSet[f.key], 1500) });
  const orders = instructionBlock(campaign.config?.instructions, agent.role); // what the manager asked of this campaign's agents
  if (orders) blocks.push(orders);
  if (req) blocks.push(requestBlock(req), materialsBlock(req.materials));
  const own = await projectCreativeBlocks(db, campaign.project_id, now, { inputs: agent.role === 'creative_strategy' });
  if (agent.role !== 'creative_analyst') blocks.push(...own.blocks);
  const failed = [];
  const accounts = await loadAccounts(db, campaign.project_id);
  const dept = sub;
  let brief = null;
  let plan = null;
  let json = true;
  let images = []; // pictures the strategist looks at: materials, competitors' ads, frames of the Figma file
  let figmaInfo = null;
  let imagesNote = '';

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

  if (agent.role === 'creative_strategy') {
    blocks.push(...(await outsideInputs(db, campaignId, now)).filter((x) => !(own.have.has('business') && /^Дослідження бізнесу/.test(x.title)) && !(own.have.has('competitors') && /^Дослідження конкурентів/.test(x.title)) && !(own.have.has('audience') && /^Дослідження аудиторії/.test(x.title))));
    const analysis = await latestAnalysis(db, dept, campaignId);
    if (analysis?.output?.text && !analysis.output.skipped) blocks.push({ title: `Аналіз ефективності креативів${freshness(analysis.finished_at, now)}`, text: clip(analysis.output.text, 6000) });
    else blocks.push({ title: 'Аналіз ефективності креативів', text: 'Аналізу немає (новий клієнт або кабінет Meta не підключено): напрями спираються на дослідження й сайт.' });
    // research that is missing or outdated is no excuse to work blind: the strategist reads the site (and the named competitors) itself
    const fresh = (re) => blocks.some((x) => re.test(x.title) && /свіжий/.test(x.title));
    if (!fresh(/^Дослідження бізнесу/)) blocks.push(...await siteBlocks(b.site || project.website, { limit: 2, read }));
    if (!fresh(/^(Дослідження конкурентів|Конкуренти)/) && String(b.competitors || '').trim()) blocks.push({ title: 'Конкуренти, яких вказав менеджер', text: clip(b.competitors, 2000) }, ...await siteBlocks(b.competitors, { limit: 3, read }));
    if (String(b.examples || '').trim()) blocks.push({ title: 'Приклади креативів конкурентів (описав або вставив менеджер)', text: clip(b.examples, 3000) });
    // the strategist LOOKS at the materials, the competitors' screenshots and the frames of the Figma file: the inventory is made from what it sees
    const mats = asList(req?.materials);
    images = [
      ...mats.filter((m) => m.kind !== 'competitor').slice(0, 6).map((m) => ({ url: m.url, caption: `Матеріал клієнта: ${m.name} (${MATERIAL_KINDS[m.kind] || m.kind})` })),
      ...mats.filter((m) => m.kind === 'competitor').slice(0, 6).map((m) => ({ url: m.url, caption: `Реклама конкурента (скриншот): ${m.name}` })),
    ];
    const figmaUrl = b.figma || own.row?.figma_url || '';
    if (figmaUrl) {
      const res = await Promise.resolve().then(() => (ctx.figma ? ctx.figma(figmaUrl) : readFigma(figmaUrl, { token: figmaToken() }))).catch((e) => ({ ok: false, error: String(e?.message || e) }));
      figmaInfo = { status: res.ok ? 'read' : res.noToken ? 'no_token' : 'error', name: res.name || '', frames: res.ok ? res.frames.length : 0, error: res.ok ? '' : res.error };
      blocks.push({ title: 'Макет бренду у Figma', text: figmaText(res) });
      if (res.ok) res.frames.filter((f) => f.imageUrl).forEach((f) => images.push({ url: f.imageUrl, caption: `Figma, кадр: ${f.name || f.id}` }));
    }
    images = images.filter((im) => /^https?:\/\//i.test(im.url || '')).slice(0, 16);
    blocks.push({ title: 'Картинки, додані до цього повідомлення', text: images.length ? images.map((im) => `- ${im.caption}`).join('\n') : 'Картинок не додано: матеріали видно лише за назвами файлів. Скажіть у результаті, що самі файли ви не бачили.' });
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
  if (task.brief?.feedback) {
    blocks.push({ title: `Зауваження перевірки якості (круг переробки ${task.brief.round || 1}): виправте саме їх, решту лишіть як було`, text: clip(asList(task.brief.feedback).map((f) => `- [${f.severity || ''}] ${f.concept ? `${f.concept}: ` : ''}${f.comment}`).join('\n'), 3000) });
    const prev = (await db.from('ag_tasks').select('output').eq('agent_id', agent.id).eq('request_id', rid).eq('status', 'done').order('id', { ascending: false }).limit(1)).data?.[0];
    if (prev?.output?.text) blocks.push({ title: 'Ваша попередня версія (її й виправляєте)', text: clip(prev.output.text, 6000) });
  }

  const user = blocks.map((x) => `### ${x.title}\n${x.text}`).join('\n\n') + (failed.length ? `\n\n### Вхідні дані, які не завантажились\n${failed.map((f) => '- ' + f).join('\n')}` : '');
  const system = composeCreativeSystem(agent.role, prompt.body, mine.extra, language);
  // more directions = a longer JSON answer: the room for it grows with the number of directions the request asks for
  const ask = (content) => rec.callModel({ agentKey: `creative-${agent.role}`, params: { model: agent.model || MODEL, max_tokens: agent.role === 'creative_maker' ? Math.max(4200, makerTokens(brief?.concepts)) : json ? Math.min(16000, Math.max(4200, 1500 + 1200 * directionLimit(b))) : 2800, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] } });
  let result;
  if (images.length) {
    const parts = [{ type: 'text', text: user }];
    images.forEach((im) => parts.push({ type: 'text', text: `[${im.caption}]` }, { type: 'image', source: { type: 'url', url: im.url } }));
    try { result = await ask(parts); } catch (e) {
      // a picture the model could not fetch must not stop the whole plan: ask again with the text only and say so
      if (!/image|url|media/i.test(String(e?.message || e))) throw e;
      imagesNote = 'Картинки не вдалося завантажити в модель: план складено лише за текстом.';
      images = [];
      result = await ask(`${user}\n\n### Картинки\n${imagesNote} Скажіть про це в результаті.`);
    }
  } else result = await ask(user);
  const raw = String(result.text || '').trim();

  if (agent.role === 'creative_strategy') {
    const parsed = parseCreativePlan(raw, req || {});
    return { output: { text: renderPlan(parsed), summary: parsed.summary, json: parsed, requestId: rid, campaignId, figma: figmaInfo, imagesSeen: images.length, imagesNote }, summary: parsed.summary || `Напрямів: ${parsed.directions.length}` };
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
    const parsed = parseCreativeMaker(raw, brief.concepts, clip(cycleSet.style || cfg.style, 600));
    const rows = ctx.dryRun ? parsed.creatives : await saveCreatives(db, rid, parsed.creatives, req.materials); // a trial run saves nothing
    const text = rows.map((c) => `**${c.concept_key} · ${c.ratio}**\n${c.prompt}`).join('\n\n');
    // with «Генерувати одразу» on, the pictures go to Higgsfield at once (within the limit of the agent); otherwise the person starts it from the request window
    const generation = !ctx.dryRun && (cycleSet.auto_generate === true || cfg.auto_generate) ? await generateCreatives(ctx, rid).catch((e) => ({ ok: false, error: String(e?.message || e) })) : null;
    return { output: { text, summary: `Запитів до Higgsfield: ${rows.length}`, json: { creatives: parsed.creatives, notes: parsed.notes }, requestId: rid, campaignId, generation }, summary: `Запитів до Higgsfield: ${rows.length}` };
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
