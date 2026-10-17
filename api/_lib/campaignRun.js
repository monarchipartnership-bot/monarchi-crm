// The work of the campaign-team agents (Meta / Google / TikTok campaigns of ONE client). One generic handler: it gathers what the
// role needs (the client brief, the ad-account numbers through the same connectors the CRM already uses, the public pages of the
// client and its competitors, the pasted TikTok numbers, and the latest results of the agents it depends on), builds the prompt
// (editable instruction + client-specific instruction + locked rules) and saves the report as the task's output.
// Everything the outside world provides is handed in (deps), so scripts/check-core.mjs runs it with stand-ins.
import { roleDef, PLATFORMS } from '../../src/lib/agents/campaignTeam.js';
import { composeCampaignSystem } from '../../src/lib/agents/locked.js';
import { runGoogleAdsReport } from './googleAdsData.js';
import { fetchMetaInsights } from './metaAdsData.js';
import { readSite } from './siteReader.js';

export const REPORT_LANGUAGES = { uk: 'Ukrainian', en: 'English' };
const MODEL = 'claude-sonnet-5';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const PERIOD = { last_7d: 'останні 7 днів', last_30d: 'останні 30 днів', LAST_7_DAYS: 'останні 7 днів', LAST_30_DAYS: 'останні 30 днів' };
const LEVEL = { account: 'кабінет загалом', campaign: 'кампанії', adset: 'групи оголошень', ad: 'оголошення', device: 'пристрої', keyword: 'ключові слова' };
const BLOCK_MAX = 7000;

export async function loadAccounts(db, projectId) {
  const { data } = await db.from('project_ad_accounts').select('platform, account_id, account_name').eq('project_id', projectId);
  const out = {};
  (data || []).forEach((a) => { out[a.platform] = a.account_id; });
  return out;
}

// The biggest rows first, so that cutting a long list keeps what matters (money spent).
function trimRows(rows, key, n) {
  return [...rows].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)).slice(0, n);
}

// 'platform:level:period' → { title, text, ok, skipped?, error? }. Never throws: a failed input is reported to the model and the person.
export async function fetchBlock(spec, accounts, deps = {}) {
  const [platform, level, period] = spec.split(':');
  const title = `${PLATFORMS[platform]?.label || platform} · ${LEVEL[level] || level} · ${PERIOD[period] || period}`;
  const id = accounts[platform];
  if (!id) return { title, ok: false, skipped: true, text: `Кабінет ${PLATFORMS[platform]?.label || platform} не підключено до проєкту: даних немає.` };
  try {
    let data;
    if (platform === 'google') {
      const g = await (deps.google || runGoogleAdsReport)(id, { dateRange: period, level });
      data = { period: g.period, ...Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'period').map(([k, v]) => [k, Array.isArray(v) ? trimRows(v, 'cost', 40) : v])) };
    } else if (platform === 'meta') {
      const token = deps.metaToken ?? process.env.META_ACCESS_TOKEN;
      if (!token) throw new Error('META_ACCESS_TOKEN не налаштовано на сервері');
      const m = await (deps.meta || fetchMetaInsights)({ accountId: id, level, datePreset: period, token });
      data = { account: m.account, rows: trimRows(m.rows, 'spend', 40), truncated: m.truncated };
    } else {
      return { title, ok: false, skipped: true, text: 'Для цієї платформи немає прямого підключення.' };
    }
    return { title, ok: true, text: clip(JSON.stringify(data), BLOCK_MAX) };
  } catch (e) {
    return { title, ok: false, error: String(e?.message || e).slice(0, 300), text: `Не вдалося отримати дані: ${String(e?.message || e).slice(0, 300)}` };
  }
}

const urlsIn = (text) => [...new Set((String(text || '').match(/https?:\/\/[^\s,;)]+|(?:www\.)[a-z0-9.-]+\.[a-z]{2,}[^\s,;)]*/gi) || []).map((u) => u.replace(/[.,]+$/, '')))];

// Public pages (the client's site, or the competitors') as text blocks.
async function siteBlocks(text, { limit, read }) {
  const out = [];
  for (const url of urlsIn(text).slice(0, limit)) {
    try {
      const site = await read(url.startsWith('http') ? url : 'https://' + url);
      if (site.blockedByRobots) { out.push({ title: `Сайт ${url}`, text: 'Сайт забороняє автоматичне читання (robots.txt).' }); continue; }
      const pages = site.pages.filter((p) => p.ok).slice(0, 4);
      out.push({ title: `Сайт ${url}`, text: pages.length ? clip(pages.map((p) => `${p.title || p.url}: ${clip(p.text, 1800)}`).join('\n\n'), BLOCK_MAX) : 'Не вдалося прочитати сторінки.' });
    } catch (e) { out.push({ title: `Сайт ${url}`, text: `Не вдалося прочитати: ${String(e.message || e).slice(0, 200)}` }); }
  }
  return out;
}

// The first section of the report (the «Підсумок»), used as the short message of the agent and the hint for the next agents.
export function summaryOf(text) {
  const t = String(text || '').trim();
  // split into sections at the headings; the summary is the section titled «Підсумок» / «Summary», else the first section with text
  const parts = t.split(/^#{1,4}[ \t]+(.*)$/m);
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) sections.push({ title: parts[i], body: (parts[i + 1] || '').replace(/^\s*-{3,}\s*$/gm, '').trim() });
  const pick = sections.find((x) => /підсумок|summary|итог/i.test(x.title) && x.body) || sections.find((x) => x.body);
  return clip((pick ? pick.body : t).replace(/\s+/g, ' '), 400);
}

export async function campaignRole({ ctx, team: sub, agent, task, prompt, rec }) {
  const def = roleDef(agent.role);
  if (!def) throw new Error('Невідома роль агента.');
  const { db } = ctx;
  const campaign = (await db.from('ag_campaigns').select('*').eq('id', Number(agent.scope_id)).maybeSingle()).data;
  if (!campaign) throw new Error('Кампанію не знайдено (можливо, видалена).');
  const project = (await db.from('projects').select('*').eq('id', campaign.project_id).maybeSingle()).data || {};
  const accounts = await loadAccounts(db, campaign.project_id);
  const cfg = agent.config || {};
  const cc = campaign.config || {};
  const language = REPORT_LANGUAGES[cc.language] ? cc.language : 'uk';
  const deps = ctx.campaignDeps || {};
  const blocks = [];

  blocks.push({ title: 'Клієнт і кампанія', text: [
    `Проєкт: ${project.name || campaign.name}${project.client ? ` (клієнт: ${project.client})` : ''}`, `Кампанія: ${campaign.name}`,
    `Платформи: ${campaign.platforms.map((p) => PLATFORMS[p]?.label || p).join(', ')}`,
    cc.brief ? `Бриф: ${clip(cc.brief, 2500)}` : 'Бриф не заповнено.', cc.goals ? `Цілі: ${clip(cc.goals, 1200)}` : '',
  ].filter(Boolean).join('\n') });
  for (const f of def.fields) {
    if (f.key === 'pasted' || f.key === 'sources' || f.key === 'competitors') continue;
    if (String(cfg[f.key] || '').trim()) blocks.push({ title: f.label, text: clip(cfg[f.key], 1500) });
  }

  const failed = [];
  if (agent.role === 'tiktok_analyst') {
    if (!String(cfg.pasted || '').trim()) throw new Error('Вставте дані з TikTok Ads Manager у налаштуваннях агента: прямого підключення немає.');
    blocks.push({ title: 'Дані з TikTok Ads Manager (вставив менеджер)', text: clip(cfg.pasted, 12000) });
  }
  if (agent.role === 'business_research') {
    const sites = await siteBlocks(cfg.sources, { limit: 2, read: ctx.read || readSite });
    blocks.push(...sites);
    if (!sites.length && !cc.brief) throw new Error('Немає з чого працювати: заповніть бриф кампанії або вкажіть адресу сайту клієнта в налаштуваннях агента.');
  }
  if (agent.role === 'competitor_research') {
    const comps = String(cfg.competitors || '').trim();
    if (!comps) throw new Error('Вкажіть конкурентів клієнта (назви й адреси сайтів) у налаштуваннях агента.');
    blocks.push({ title: 'Конкуренти, яких вказав менеджер', text: clip(comps, 2000) });
    blocks.push(...await siteBlocks(comps, { limit: 4, read: ctx.read || readSite }));
  }

  // ad-account numbers: only the platforms this campaign runs
  const specs = def.data.filter((s) => campaign.platforms.includes(s.split(':')[0]));
  if (specs.length) {
    const got = await Promise.all(specs.map((s) => fetchBlock(s, accounts, deps)));
    const okBlocks = got.filter((b) => b.ok);
    got.filter((b) => !b.ok && !b.skipped).forEach((b) => failed.push(`${b.title}: ${b.error}`));
    if (!okBlocks.length && def.data.length && !['quality_controller', 'cross_channel_report'].includes(agent.role)) {
      throw new Error(`Не вдалося отримати дані з кабінетів. ${got.map((b) => b.error || b.text).filter(Boolean)[0] || ''}`.trim());
    }
    blocks.push(...got);
  }

  // what the agents this one depends on produced last
  const byId = sub.byId;
  const upstream = sub.links.filter((l) => l.to_agent_id === agent.id);
  for (const l of upstream) {
    const from = byId.get(l.from_agent_id);
    if (!from) continue;
    const last = (await db.from('ag_tasks').select('output, finished_at').eq('agent_id', from.id).eq('status', 'done').order('finished_at', { ascending: false }).limit(1)).data?.[0];
    if (!last?.output?.text) {
      if (l.required) throw new Error(`Немає результату від «${from.name}»: запустіть його спочатку.`);
      continue;
    }
    blocks.push({ title: `Результат агента «${from.name}»`, text: clip(last.output.text, 6000) });
  }
  const mine = (await db.from('ag_tasks').select('output').eq('agent_id', agent.id).eq('status', 'done').order('finished_at', { ascending: false }).limit(1)).data?.[0];
  if (mine?.output?.summary) blocks.push({ title: 'Ваш попередній звіт (підсумок), для порівняння', text: clip(mine.output.summary, 800) });

  const user = blocks.map((b) => `### ${b.title}\n${b.text}`).join('\n\n') + (failed.length ? `\n\n### Вхідні дані, які не завантажились\n${failed.map((f) => '- ' + f).join('\n')}` : '');
  const system = composeCampaignSystem(prompt.body, cfg.extra, REPORT_LANGUAGES[language]);
  const result = await rec.callModel({ agentKey: `campaign-${agent.role}`, params: { model: agent.model || MODEL, max_tokens: agent.role === 'performance_copywriter' ? 3200 : 2600, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
  const text = String(result.text || '').trim();
  const summary = summaryOf(text);
  return { output: { text, summary, inputs: blocks.map((b) => b.title), failedInputs: failed, campaignId: campaign.id }, summary };
}
