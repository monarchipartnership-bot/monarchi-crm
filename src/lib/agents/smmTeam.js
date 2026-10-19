// The SMM team as DATA: which agents it has, what each does, how they are linked, what each starts with.
// ensureSmmTeam() writes it into the framework tables the first time (and only adds what is missing, never overwrites
// what a person has changed). The same shape will describe a client team: the roles are instantiated per client.
import { DEFAULT_PROMPTS } from './defaultPrompts.js';

export const TEAM = 'smm';

// ready: false = the agent exists and can be configured, but its work needs something that is not there yet (readyNote says what).
export const SMM_ROLES = [
  { role: 'site_analyst', name: 'Аналітик сайту', short: 'відвідуваність, запити', sort: 1, ready: true, schedule: { weekday: 1, time: '08:00' }, config: { ga4PropertyId: '503944052', gscSiteUrl: 'sc-domain:monarchi.agency' },
    description: 'Збирає відвідуваність, пошукові запити й сторінки сайту та показує, що росте й падає. Передає звіт SEO-оптимізатору й стратегу.' },
  { role: 'seo', name: 'SEO-оптимізатор', short: 'прогалини й правки', sort: 2, ready: true, schedule: { weekday: 2, time: '09:00' }, config: {},
    description: 'Читає публічні сторінки сайту, знаходить технічні й контентні проблеми та пропонує нові title, description, H1. Передає прогалини в контенті стратегу.' },
  { role: 'competitors', name: 'Конкуренти', short: 'їхні теми й слабкі місця', sort: 3, ready: true, schedule: { weekday: 3, time: '09:00' }, config: { refreshDays: 6 },
    description: 'Читає публічні сайти конкурентів, знаходить їхні теми, пропозиції й слабкі місця. Передає інсайти стратегу.' },
  { role: 'social_analyst', name: 'Аналітик соцмереж', short: 'що спрацювало', sort: 4, ready: false, readyNote: 'Потрібен доступ до статистики соцмереж і публікатор.', schedule: null, config: {},
    description: 'Після публікації збирає охоплення, реакції й кліки та повертає стратегу висновок, що спрацювало.' },
  { role: 'strategist', name: 'Контент-стратег', short: 'план тижня і завдання', sort: 5, ready: true, schedule: { weekday: 5, time: '12:00' },
    config: { counts: { linkedin: 3, instagram: 2, threads: 2, facebook: 0, tiktok: 0 }, language: 'en', focus: '', requirePlanApproval: true, notifyEmails: [] },
    description: 'Складає план тижня: теми, рубрики, формат, мережа, день. Після вашого «ок» ставить завдання копірайтеру й візуал-агенту.' },
  { role: 'copywriter', name: 'Копірайтер', short: 'текст під кожну мережу', sort: 6, ready: true, schedule: null, config: {},
    description: 'Пише текст поста у форматі мережі (довжина, хук, хештеги, мова) за брифом стратега.' },
  { role: 'visual', name: 'Візуал-агент', short: 'промт і генерація Higgsfield', sort: 7, ready: true, schedule: null, config: { generator: 'higgsfield', generate: true },
    description: 'Перетворює візуальний бриф на промт за універсальним шаблоном Higgsfield і запускає генерацію зображення або відео.' },
  { role: 'qc', name: 'Контроль якості', short: 'факти, тон, текст і візуал', sort: 8, ready: true, schedule: null, config: { maxRounds: 2 },
    description: 'Перевіряє зібраний пост: факти проти бренд-профілю, тон, довжину, відповідність тексту й візуалу. Повертає на доопрацювання або передає вам.' },
  { role: 'publisher', name: 'Публікатор', short: 'постинг за розкладом', sort: 9, ready: false, readyNote: 'Потрібні додатки API Instagram, Facebook, Threads, TikTok і LinkedIn.', schedule: null, config: {},
    description: 'Публікує схвалені пости в мережах у призначений час і передає посилання аналітику соцмереж.' },
];

// from -> to, required = the downstream agent stops when the upstream one is switched off.
export const SMM_LINKS = [
  { from: 'site_analyst', to: 'seo', required: false },
  { from: 'site_analyst', to: 'strategist', required: false },
  { from: 'seo', to: 'strategist', required: false },
  { from: 'competitors', to: 'strategist', required: false },
  { from: 'social_analyst', to: 'strategist', required: false },
  { from: 'strategist', to: 'copywriter', required: true },
  { from: 'strategist', to: 'visual', required: true },
  { from: 'copywriter', to: 'qc', required: true },
  { from: 'visual', to: 'qc', required: true },
  { from: 'qc', to: 'publisher', required: true },
  { from: 'publisher', to: 'social_analyst', required: true },
];

// Makes sure the team exists in the database: agents, links, and the starting prompt of every agent.
// db: a Supabase client. Only missing things are added. → { agents, links }
export async function ensureSmmTeam(db, email = null) {
  const must = (r) => { if (r.error) throw r.error; return r.data; };
  let agents = must(await db.from('ag_agents').select('*').eq('team', TEAM).eq('scope_type', 'internal').eq('scope_id', '')) || [];
  const have = new Set(agents.map((a) => a.role));
  const missing = SMM_ROLES.filter((r) => !have.has(r.role));
  if (missing.length) {
    const rows = missing.map((r) => ({ team: TEAM, scope_type: 'internal', scope_id: '', role: r.role, name: r.name, description: r.description, enabled: false, config: r.config || {}, schedule: r.schedule, sort: r.sort, updated_by: email }));
    must(await db.from('ag_agents').insert(rows).select());
    agents = must(await db.from('ag_agents').select('*').eq('team', TEAM).eq('scope_type', 'internal').eq('scope_id', ''));
  }
  const byRole = new Map(agents.map((a) => [a.role, a]));
  let links = must(await db.from('ag_links').select('*').in('from_agent_id', agents.map((a) => a.id))) || [];
  const haveLink = new Set(links.map((l) => `${l.from_agent_id}>${l.to_agent_id}`));
  const newLinks = SMM_LINKS.map((l) => ({ from_agent_id: byRole.get(l.from)?.id, to_agent_id: byRole.get(l.to)?.id, required: l.required }))
    .filter((l) => l.from_agent_id && l.to_agent_id && !haveLink.has(`${l.from_agent_id}>${l.to_agent_id}`));
  if (newLinks.length) {
    must(await db.from('ag_links').insert(newLinks).select());
    links = must(await db.from('ag_links').select('*').in('from_agent_id', agents.map((a) => a.id)));
  }
  // The starting prompt of every agent that has no prompt yet.
  const prompts = must(await db.from('ag_prompts').select('agent_id').in('agent_id', agents.map((a) => a.id))) || [];
  const hasPrompt = new Set(prompts.map((p) => p.agent_id));
  const newPrompts = agents.filter((a) => !hasPrompt.has(a.id) && DEFAULT_PROMPTS[a.role]).map((a) => ({ agent_id: a.id, name: DEFAULT_PROMPTS[a.role].name, body: DEFAULT_PROMPTS[a.role].body, is_default: true, current_version: 1, note: 'Стартовий промт', created_by: email }));
  if (newPrompts.length) {
    const created = must(await db.from('ag_prompts').insert(newPrompts).select());
    must(await db.from('ag_prompt_versions').insert(created.map((p) => ({ prompt_id: p.id, version: 1, body: p.body, note: 'Стартовий промт', created_by: email }))));
  }
  return { agents, links };
}
