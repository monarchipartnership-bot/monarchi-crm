// The AUTOMATIC CHECK before an approval (step A5; document: «Автоматична перевірка перед апрувом»). It is code, not an agent: it researches nothing.
// The sections are written by different runs, so before the manager is asked, code checks three things:
//   1 · the numbers do not contradict each other (the budget the Unit Economy was counted from is the budget of the brief, the audit was judged by the
//       thresholds of the current Unit Economy, the currency is one, and later the strategy repeats the budget and the geo of the brief)
//   2 · every number has a source: what a skill could not prove is already marked «не підтверджено» in its section; the check confirms that the marks are
//       honest (nothing «підтверджено» without a proof) and counts what is still unproven, so the manager sees it before approving
//   3 · one list of tasks: the same problem found by two agents is one task (the higher priority wins, the evidence of both is kept)
// validateProject → { ok, problems[], warnings[], rerun: [{ agent, skill }], merged }. `problems` hold the stage (machine.js); `rerun` is asked ONLY when
// the section is older than its source and was written by an agent (so a mismatch that a rerun cannot fix never makes a loop).

const NAME = { brief: 'Бриф', unit_economy: 'Unit Economy', audit: 'Аудит кабінету', site: 'Сайт', audience: 'Аудиторія', competitors: 'Ринок і конкуренти', strategy: 'Стратегія' };
const NUM_KEYS = [['budget_monthly', 'місячний бюджет'], ['target_roas', 'цільовий ROAS'], ['avg_order', 'середній чек'], ['cogs_pct', 'собівартість, %'], ['shipping_cost', 'доставка й пакування'], ['fee_pct', 'комісії, %'], ['returns_pct', 'повернення, %'], ['site_cvr', 'конверсія сайту'], ['min_campaign_daily', 'мінімальний денний бюджет кампанії']];
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);
const shown = (v) => (v == null ? 'не вказано' : String(v));
const newer = (a, b) => !!a?.created_at && !!b?.created_at && new Date(a.created_at) > new Date(b.created_at);
const sig = (list) => JSON.stringify((list || []).map((p) => [String(p.name || '').trim().toLowerCase(), num(p.price ?? p.pays), num(p.cogs ?? p.list_value)]).sort());

// ---------------------------------------------------------------- 1 · numbers
// sections = { brief, unit_economy, audit, strategy } as readSection returns them ({ version: { content, created_at, author_kind } } or null)
export function compareNumbers(sections) {
  const problems = [], rerun = [];
  const b = sections.brief?.version, ue = sections.unit_economy?.version, au = sections.audit?.version, st = sections.strategy?.version;
  const be = b?.content?.economics || {};

  if (b && ue?.content?.inputs) {
    const ie = ue.content.inputs;
    const diffs = [];
    for (const [k, label] of NUM_KEYS) { const x = num(be[k]), y = num(ie[k]); if (!same(x, y)) diffs.push(`${label}: у брифі ${shown(x)}, в Unit Economy ${shown(y)}`); }
    if (sig(be.products) !== sig(ie.products) || sig(be.offers) !== sig(ie.offers)) diffs.push('товари або офери в брифі відрізняються від тих, за якими рахували Unit Economy');
    if (diffs.length) {
      problems.push(`Unit Economy пораховано за іншими цифрами, ніж у брифі (${diffs.join('; ')}).`);
      if (newer(b, ue) && ue.author_kind === 'agent') rerun.push({ agent: 'researcher', skill: 'unit_economy' });
    }
  }
  if (ue?.content?.thresholds && au?.content) {
    const x = ue.content.thresholds, y = au.content.thresholds;
    const diff = !y || ['breakeven_roas', 'target_roas', 'breakeven_cpa', 'target_cpa'].some((k) => !same(num(x[k]), num(y[k])));
    if (diff) {
      problems.push(!y ? 'Аудит кабінету зроблено без порогів Unit Economy, хоча тепер вони є: аудит не оцінює «збитково чи ні».' : 'Аудит кабінету оцінено за іншими порогами, ніж у поточному Unit Economy.');
      if (newer(ue, au) && au.author_kind === 'agent') rerun.push({ agent: 'researcher', skill: 'audit' });
    }
  }
  const cur = String(be.currency || '').toUpperCase(), acur = String(au?.content?.currency || '').toUpperCase();
  if (cur && acur && cur !== acur) problems.push(`Валюта брифу ${cur}, а кабінету ${acur}: суми в різних валютах порівнювати не можна.`);
  if (st?.content) {
    const sb = num(st.content.budget_monthly), bb = num(be.budget_monthly);
    if (sb != null && bb != null && !same(sb, bb)) { problems.push(`Бюджет у стратегії (${sb}) не збігається з брифом (${bb}), з якого рахували Unit Economy.`); }
    const sg = String(st.content.geo || '').trim().toLowerCase(), bg = String(b?.content?.general?.geo || '').trim().toLowerCase();
    if (sg && bg && sg !== bg) problems.push(`Географія в стратегії («${st.content.geo}») не збігається з брифом («${b.content.general.geo}»): географію веде бриф.`);
  }
  return { problems, rerun };
}

// ---------------------------------------------------------------- 2 · sources
// → { problems, warnings }. A «confirmed» mark with no proof is a PROBLEM (an invented number in the document); an unproven item is a warning (it is marked).
export function checkSources(sections) {
  const problems = [], warnings = [];
  const site = sections.site?.version?.content, aud = sections.audience?.version?.content, comp = sections.competitors?.version?.content;
  if (site?.findings) {
    const fake = site.findings.filter((f) => f.verified && (!f.evidence || (f.evidence.kind === 'quote' && !f.evidence.quote) || (f.evidence.kind === 'signal' && !f.evidence.signal) || !f.evidence.kind));
    if (fake.length) problems.push(`Сайт: ${fake.length} знахідок позначено підтвердженими без доказу.`);
    const un = site.findings.filter((f) => !f.verified).length;
    if (un) warnings.push(`Сайт: непідтверджених знахідок ${un}.`);
  }
  if (aud?.segments) {
    const fake = aud.segments.filter((s) => s.status === 'confirmed' && !(s.confirmed_by || []).length);
    if (fake.length) problems.push(`Аудиторія: ${fake.length} сегментів позначено підтвердженими без джерела.`);
    const hyp = aud.segments.filter((s) => s.status === 'hypothesis').length, un = aud.segments.filter((s) => s.status === 'unverified').length;
    if (hyp) warnings.push(`Аудиторія: сегментів, що лишаються гіпотезою, ${hyp}.`);
    if (un) warnings.push(`Аудиторія: сегментів із числом без джерела ${un}.`);
  }
  if (comp?.table) {
    const fake = comp.table.filter((r) => r.verified && !r.evidence?.quote);
    if (fake.length) problems.push(`Конкуренти: ${fake.length} рядків позначено підтвердженими без цитати.`);
    const un = comp.table.filter((r) => !r.verified).length;
    if (un) warnings.push(`Конкуренти: непідтверджених рядків ${un}.`);
    const adBad = (comp.ads_skipped || []).length;
    if (adBad) warnings.push(`Реклама конкурентів: ${adBad} оголошень без підтвердження менеджером не враховано.`);
    for (const a of comp.ads_analysis || []) if (!a.library_url || !a.active_since) problems.push('Реклама конкурентів: оголошення потрапило в аналіз без посилання на Бібліотеку або дати.');
  }
  if (sections.unit_economy?.version?.content?.provisional) warnings.push('Unit Economy попередній: частина цифр брифу лишається припущенням.');
  return { problems, warnings };
}

// ---------------------------------------------------------------- 3 · one list of tasks
const STOP = new Set(['сайт', 'для', 'щоб', 'при', 'або', 'його', 'цього', 'перейняти', 'додати', 'вказати', 'зробити', 'клієнта', 'клієнт']);
// words reduced to their first five letters (Ukrainian endings differ: «посилання» / «посиланням»); addresses and host names are dropped
const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[a-z0-9-]+(\.[a-z0-9-]+)+/g, ' ').split(/[^a-zа-яіїєґ0-9]+/i).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
const PRIO = { high: 3, medium: 2, low: 1 };

// → [{ keep, drop: [ids], priority, evidence }]: only proposals of agents (a person's or an approved task is never touched)
export function findDuplicateTasks(tasks, threshold = 0.6) {
  const pool = tasks.filter((t) => t.status === 'proposed' && (t.created_by_kind || 'agent') === 'agent').sort((a, b) => a.id - b.id);
  const used = new Set(), out = [];
  for (const a of pool) {
    if (used.has(a.id)) continue;
    const ta = tokens(a.title), group = [a];
    for (const b of pool) {
      if (b.id === a.id || used.has(b.id) || b.type !== a.type) continue;
      const tb = tokens(b.title);
      const inter = [...ta].filter((w) => tb.has(w)).length;
      const uni = new Set([...ta, ...tb]).size;
      if (inter >= 2 && uni && inter / uni >= threshold) group.push(b);
    }
    if (group.length < 2) continue;
    group.forEach((t) => used.add(t.id));
    const keep = group.slice().sort((x, y) => (PRIO[y.priority] || 0) - (PRIO[x.priority] || 0) || x.id - y.id)[0];
    const rest = group.filter((t) => t.id !== keep.id);
    const extra = rest.filter((t) => t.evidence && !String(keep.evidence || '').includes(t.evidence)).map((t) => t.evidence);
    out.push({ keep: keep.id, drop: rest.map((t) => t.id), priority: keep.priority, evidence: [keep.evidence, ...(extra.length ? ['Те саме знайшов інший агент: ' + extra.join(' ')] : [])].filter(Boolean).join(' ').slice(0, 800) });
  }
  return out;
}

// ---------------------------------------------------------------- the whole check for one project
export async function validateProject({ repo, projectId }) {
  const sections = {};
  for (const k of ['brief', 'unit_economy', 'audit', 'site', 'audience', 'competitors', 'strategy']) sections[k] = await repo.readSection(projectId, k);
  const n = compareNumbers(sections), s = checkSources(sections);
  let merged = 0;
  if (repo.listTasks && repo.mergeTasks) {
    const groups = findDuplicateTasks(await repo.listTasks(projectId));
    for (const g of groups) { await repo.mergeTasks(projectId, g.keep, { priority: g.priority, evidence: g.evidence }, g.drop); merged += g.drop.length; }
    if (merged && repo.journal) await repo.journal(projectId, { action: 'tasks_merged', summary: `Один список задач: об’єднано дублів ${merged} (ту саму проблему знайшли кілька агентів).`, meta: {} });
  }
  const problems = [...n.problems, ...s.problems];
  return { ok: problems.length === 0, problems, warnings: s.warnings, rerun: n.rerun, merged };
}

// the function the orchestrator calls (ctx.validate). The check matters before the approvals: stages 1 and 2; later stages are not held by it.
export function createValidator(repo) {
  return async ({ projectId, state }) => {
    if (!state || ![1, 2].includes(state.stage)) return { ok: true, problems: [], warnings: [], rerun: [], merged: 0 };
    return validateProject({ repo, projectId });
  };
}
export { NAME as SECTION_NAME };
