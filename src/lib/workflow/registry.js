// THE REGISTRY OF THE AGENTS (owner's decision, 2026-11-24): the one place where the team is described. The map, the tab «Агенти», the cards of a project and the tests all read it,
// so the team cannot be «forgotten» in one screen. PURE data.
// An agent = a description (what it does, skills, what it reads, what it writes, its right) as the document «Робочий процес клієнта» says; the work itself runs per client (wf_runs).
//   rights: 'read' (looks only) | 'write' (may change an ad cabinet; only the Media buyer, only after Апрув 2)
//   skill.integrated === false: the skill is described here but is not yet a real run (period_report: the report agent of a project is being merged into the Support agent; stub: the orchestrator already asks for it, the skill is a stand-in)

export const ACTIVE_AGENTS = [
  {
    key: 'researcher', name: 'Дослідник', short: 'До', does: 'Сайт, аудиторія, конкуренти, аудит, юніт-економіка', rights: 'read',
    skills: [
      { key: 'intake', label: 'перевіряє кабінети' }, { key: 'audit', label: 'аудитує кабінети' }, { key: 'site', label: 'аналізує сайт' },
      { key: 'audience', label: 'вивчає аудиторію' }, { key: 'unit_economy', label: 'рахує юніт-економіку' }, { key: 'competitors', label: 'аналізує конкурентів' },
    ],
    reads: ['Кабінети Meta', 'GA4 клієнта', 'Сайт клієнта і конкурентів', 'Бриф'], writes: ['Сайт', 'Аудиторія', 'Юніт-економіка', 'Конкуренти', 'Аудит кабінету'],
  },
  {
    key: 'creator', name: 'Креатор', short: 'Кр', does: 'Матеріали, ідеї та креативи', rights: 'read',
    skills: [
      { key: 'materials_ideas', label: 'готує матеріали та ідеї' }, { key: 'first_creatives', label: 'робить перші креативи' }, { key: 'rework_creatives', label: 'переробляє креативи за зауваженнями' },
    ],
    reads: ['Бриф', 'Файли й бренд клієнта', 'Аудиторія і конкуренти'], writes: ['Матеріали', 'Ідеї', 'Креативи (готові)'], note: 'Картинки створюються через Higgsfield в межах ліміту проєкту.',
  },
  {
    key: 'strategist', name: 'Стратег', short: 'Ст', does: 'Стратегія та план на місяць', rights: 'read',
    skills: [{ key: 'strategy', label: 'складає стратегію' }, { key: 'monthly_plan', label: 'складає план на місяць' }],
    reads: ['Усі розділи Досьє', 'Пороги Unit Economy'], writes: ['Стратегія', 'План на місяць'], note: 'Бюджет рахує код, структуру кампаній обирає модель.',
  },
  {
    key: 'mediabuyer', name: 'Медіабаєр', short: 'Ме', does: 'Запуск і оптимізація кампаній', rights: 'write',
    skills: [
      { key: 'launch', label: 'запускає кампанії' }, { key: 'launch_check', label: 'перевіряє право запису в кабінет' }, { key: 'optimize', label: 'оптимізує кампанії' },
    ],
    reads: ['Кабінети', 'Стратегія і креативи', 'Пороги Unit Economy'], writes: ['Знімок запуску', 'Журнал оптимізації', 'Кампанії в кабінеті (лише після Апрува 2)'],
    note: 'Єдиний агент із правом запису в кабінет. Оптимізація поки лише дає рекомендації.',
  },
  {
    key: 'support', name: 'Супровід', short: 'Су', does: 'Матеріали для звіту та спілкування з клієнтом', rights: 'read',
    skills: [
      { key: 'onboarding', label: 'готує супровід' }, { key: 'payment_reminder', label: 'дивиться календар оплат' },
      { key: 'weekly_report', label: 'готує тижневий фідбек' }, { key: 'monthly_report', label: 'готує місячний фідбек' },
      { key: 'period_report', label: 'готує звіт за період (агент звітів проєкту)', integrated: false },
    ],
    reads: ['Бриф', 'Календар оплат', 'Цифри кабінетів'], writes: ['Чернетки в «Задачах»', 'Звіти проєкту'], note: 'Клієнту повідомлення надсилає людина. Агент звітів проєкту зливається сюди (рішення 2026-11-24).',
  },
];

// The departments of the old system that are NOT in work (moved to the archive on 2026-11-19). They stay on the map with the mark «в архіві» until a document of their own process exists.
export const ARCHIVED_DEPARTMENTS = [
  { key: 'service', label: 'Службові агенти', agents: ['Головний AI-координатор', 'AI-асистент по веденню CRM', 'Агент контролю цілісності даних CRM'] },
  { key: 'sales', label: 'Нові клієнти (Sales)', agents: ['Агент пошуку лідів і проєктів', 'Агент аналізу оголошень про проєкти', 'Агент доповнення даних про клієнта', 'Агент кваліфікації лідів', 'Агент підбору релевантного кейсу', 'Агент написання супровідних листів', 'Агент аналізу відповідей', 'Агент контролю стану угод', 'AI-координатор онбордингу клієнта та зустрічей'] },
  { key: 'seo', label: 'SEO сайту Mon’Archi', agents: ['Аналітик сайту', 'SEO-оптимізатор', 'Агент конкурентів сайту'] },
  { key: 'smm', label: 'SMM соцмереж Mon’Archi', agents: ['Контент-стратег', 'Копірайтер соцмереж', 'Візуал-агент', 'Контроль якості соцмереж', 'Публікатор', 'Аналітик соцмереж', 'Аналітик конкурентів у соцмережах', 'Відповіді на коментарі'] },
];

export const ARCHIVE_NOTE = 'В архіві: цей відділ не в роботі, поки для його процесу немає документа. Код і дані збережено, повернути можна.';

// the skills that are really run by the orchestrator
export const INTEGRATED_SKILLS = ACTIVE_AGENTS.flatMap((a) => a.skills.filter((s) => s.integrated !== false).map((s) => `${a.key}/${s.key}`));
export const agentOf = (key) => ACTIVE_AGENTS.find((a) => a.key === key) || null;
export const rightLabel = (r) => (r === 'write' ? 'Запис у кабінет' : 'Лише читання');

// The islands of the 3D map: the team of the client (5 pods) and the archived departments, evenly round the central hub (the Orchestrator).
// angle 0 = north, clockwise; the ring is as far from the hub as the scene wants it.
const RING = 25;
const COLORS = { team: 0xd25bff, service: 0x8f86a8, sales: 0x8f86a8, seo: 0x8f86a8, smm: 0x8f86a8 };
const GLYPHS = {
  team: { main: 'megaphone', orbit: ['target', 'magnifier', 'bulb', 'chart', 'coins'] },
  service: { main: 'gear', orbit: ['headset', 'refresh', 'layers', 'org'] }, sales: { main: 'funnel', orbit: ['person', 'phone', 'mail', 'check'] },
  seo: { main: 'magnifier', orbit: ['key', 'chart', 'link'] }, smm: { main: 'megaphone', orbit: ['play', 'image', 'chat', 'people', 'chart', 'heart', 'plane'] },
};
export function mapIslands() {
  const list = [
    { key: 'team', label: 'Команда клієнта', archived: false, agents: ACTIVE_AGENTS.map((a) => ({ key: a.key, name: a.name })) },
    ...ARCHIVED_DEPARTMENTS.map((d) => ({ key: d.key, label: `${d.label} · в архіві`, archived: true, agents: d.agents.map((n, i) => ({ key: `${d.key}-${i + 1}`, name: n })) })),
  ];
  return list.map((isl, i) => {
    const a = (360 / list.length) * i;
    return { ...isl, a, p: [Math.round(RING * Math.sin((a * Math.PI) / 180) * 10) / 10, Math.round(-RING * Math.cos((a * Math.PI) / 180) * 10) / 10], color: COLORS[isl.key], ...GLYPHS[isl.key] };
  });
}
