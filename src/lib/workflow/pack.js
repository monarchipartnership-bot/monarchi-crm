// The PACKAGE of the first launch (step A7.2; the concept «Пакет клієнта» of the owner with the step-by-step review): the strategy and the creatives shown as the client will see them,
// in blocks. The manager reviews the blocks (Апрув 1) and records the answer of the client on the same blocks. A remark is pinned to a block («summary», «scheme» ...) or to one
// creative («creative:c2»): the orchestrator sends only the pinned items back (api/_lib/wf/machine.js). Pure code, checked in scripts/check-workflow.mjs.

export const PACK_BLOCKS = [
  { key: 'summary', step: 'Ціль і гроші', title: 'Підсумок', question: 'Чи ціль і бюджет відповідають брифу?' },
  { key: 'priorities', step: 'Пріоритети', title: 'Що просуваємо', question: 'Чи ті товари просуваємо першими?' },
  { key: 'scheme', step: 'Схема й реклама', title: 'Схема першого місяця і реклама', question: 'Чи кампанії, групи й реклама мають сенс?' },
  { key: 'money', step: 'Гроші', title: 'Куди йдуть гроші', question: 'Чи розподіл бюджету правильний?' },
  { key: 'timeline', step: 'Строки', title: 'Перший місяць за датами', question: 'Чи реальні строки?' },
  { key: 'optimisation', step: 'Оптимізація', title: 'Як оптимізуємо', question: 'Чи правила оптимізації підходять?' },
];
// Ukrainian plural: 1 зауваження, 2-4 зауваження, 5+ зауважень
export const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
export const blockOfTarget = (t) => (String(t).startsWith('creative:') ? 'scheme' : String(t));
const titleOf = (key) => PACK_BLOCKS.find((b) => b.key === key)?.step || key;

// The state of the review. A block is answered when it is marked «добре» or has a remark. Approve only when every block is marked good and there is no remark;
// return only with at least one remark (the agents must know what to fix).
export function reviewState(reviewed = {}, remarks = []) {
  const withRemark = new Set(remarks.map((r) => blockOfTarget(r.target)));
  const answered = PACK_BLOCKS.filter((b) => reviewed[b.key] || withRemark.has(b.key)).length;
  const pending = PACK_BLOCKS.filter((b) => !reviewed[b.key] && !withRemark.has(b.key)).map((b) => b.key);
  return { total: PACK_BLOCKS.length, answered, pending, withRemark, canApprove: remarks.length === 0 && pending.length === 0, canReturn: remarks.length > 0 };
}

// the text that goes into the comment of the approval and the journal: «Блок: зауваження» per line; a creative is named by its goal
export function remarksText(remarks, creatives = []) {
  const goal = (id) => creatives.find((c) => c.id === id)?.goal || id;
  return remarks.filter((r) => String(r.text || '').trim()).map((r) => `${String(r.target).startsWith('creative:') ? `Креатив «${goal(String(r.target).slice(9))}»` : titleOf(r.target)}: ${String(r.text).trim()}`).join('\n');
}

// → what the blocks show, from the content of the sections «Стратегія» and «Креативи (готові)». Creatives are found by the ids of the groups.
export function buildPack(strategy, creatives) {
  const s = strategy || {}, items = creatives?.items || [];
  const byId = Object.fromEntries(items.map((c) => [c.id, c]));
  const placed = new Set();
  const campaigns = (s.campaigns || []).map((c) => ({ ...c, groups: (c.ad_groups || []).map((g) => ({ ...g, ads: (g.creatives || []).map((x) => { placed.add(x.id); return byId[x.id] || { id: x.id, tag: x.tag, missing: true }; }) })) }));
  const unplaced = items.filter((c) => !placed.has(c.id));
  const daily = s.budget?.daily ?? null;
  const base = s.goal?.base || null;
  const needed = s.needed_from_client || [];
  const milestones = [
    ...needed.map((n) => ({ date: n.due, title: n.what, client: true })),
    { date: '', title: 'Запуск', note: 'Після погодження клієнта й Апрува 2' },
    { date: '', title: 'День 3', note: 'Перше рев’ю: трекінг і доставка, без урізання бюджетів' },
    { date: '', title: 'День 7', note: 'Беззбитковий CPA проти фактичного' },
    ...(s.remarketing?.enabled ? [{ date: '', title: 'Тиждень 2', note: 'Ремаркетинг, якщо холодні кампанії набрали аудиторію' }] : []),
    { date: '', title: 'День 30', note: 'Підсумок і план на наступний місяць' },
  ];
  return {
    version: s.version || 1, rework: s.rework || null,
    summary: { goal: s.goal?.text || '', base, monthly: s.budget_monthly ?? s.budget?.monthly ?? null, daily, currency: s.currency || 'USD', geo: s.geo || '', text: s.summary || '', campaigns: campaigns.length },
    priorities: { source: s.priority_source, instruction: s.priority_instruction, list: s.priorities || [], notes: (s.notes || []).filter((n) => /маржа|рекламуємо/.test(n)) },
    scheme: { campaigns, unplaced, branch: creatives?.branch || null, note: creatives?.note || '' },
    money: { daily, monthly: s.budget?.monthly ?? null, min_daily: s.budget?.min_daily ?? null, max_campaigns: s.budget?.max_campaigns ?? null, campaigns: campaigns.map((c) => ({ name: c.name, daily_budget: c.daily_budget })), scenarios: s.budget?.scenarios || [], currency: s.currency || 'USD' },
    timeline: { milestones, remarketing: s.remarketing || null, seasonal: s.seasonal || [] },
    optimisation: { rules: s.optimisation?.rules || [], assumptions: s.optimisation?.assumptions || [] },
    warnings: [...(s.warnings || [])], assumptions: s.assumptions || [],
  };
}
