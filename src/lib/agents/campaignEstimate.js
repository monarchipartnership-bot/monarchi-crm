// «Попередній прорахунок» (spec 2026-11-02, §6): what a campaign will cost before it starts. Pure code, so the screen can recount while the manager changes the numbers.
//   Claude      the agents of the mode, one run each (their own average from the history of runs, a rough price when an agent has not run yet) +
//               the creative department for the requested concepts (strategist, brief writer, copywriter, maker, quality)
//   Higgsfield  the pictures: concepts × formats × the price of one picture (the exact price comes from Higgsfield's free estimate, see api/_lib/estimateInputs.js)
// It is an estimate, not a promise: the screen says so, and the real spending is told as it grows (money notices).
import { MODES, QUARTER_NODES, modeHasDepartment, modeRoles, shortName } from './campaignModes.js';

export const DEFAULT_ROLE_USD = { creative_maker: 0.15, creative_copywriter: 0.1, creative_strategy: 0.1, marketing_strategist: 0.12 };
export const DEFAULT_RUN_USD = 0.07;
const DEPT_ROLES = ['creative_strategy', 'creative_brief', 'creative_copywriter', 'creative_maker', 'creative_quality'];
const round = (n) => Math.round(Number(n || 0) * 100) / 100;

const nameOf = (role) => QUARTER_NODES.find((n) => n.id === role)?.name || shortName(role);

// history: { role: average $ of one run } from the runs already made; hfUnitUsd: $ of one picture or null when it is not known yet.
// → { rows, claude, claudeTeam, images, higgsfield: { unitUsd, total, exact }, once, monthly, repeats, overCap }
export function estimateCampaign({ mode, platforms = [], concepts = 0, ratios = [], departmentWanted = true, history = {}, hfUnitUsd = null, capUsd = null, perMonth = 4 } = {}) {
  const def = MODES[mode];
  if (!def) return { rows: [], claude: 0, claudeTeam: 0, images: 0, higgsfield: { unitUsd: hfUnitUsd, total: null, exact: false }, once: 0, monthly: null, repeats: false, overCap: false };
  const price = (role) => (Number(history[role]) > 0 ? { usd: Number(history[role]), basis: 'history' } : { usd: DEFAULT_ROLE_USD[role] ?? DEFAULT_RUN_USD, basis: 'default' });
  const row = (role, group) => ({ role, name: nameOf(role), group, ...price(role) });
  const team = modeRoles(mode, platforms).map((r) => row(r, 'team'));
  const withDept = modeHasDepartment(mode, departmentWanted) && concepts > 0;
  const dept = withDept ? DEPT_ROLES.map((r) => row(r, 'department')) : [];
  const rows = [...team, ...dept].map((r) => ({ ...r, usd: round(r.usd) }));
  const claudeTeam = round(team.reduce((s, r) => s + r.usd, 0));
  const claude = round(rows.reduce((s, r) => s + r.usd, 0));
  const images = withDept ? concepts * Math.max(1, ratios.length) : 0;
  const exact = hfUnitUsd != null && Number.isFinite(Number(hfUnitUsd));
  const hfTotal = images === 0 ? 0 : exact ? round(images * Number(hfUnitUsd)) : null;
  const once = round(claude + (hfTotal || 0));
  const repeats = !!def.repeat;
  return {
    rows, claude, claudeTeam, images,
    higgsfield: { unitUsd: exact ? Number(hfUnitUsd) : null, total: hfTotal, exact: images === 0 || exact },
    once, repeats, monthly: repeats ? round(claudeTeam * perMonth) : null,
    overCap: capUsd != null && Number(capUsd) > 0 && once > Number(capUsd),
  };
}

// The sentence under the numbers (what the person reads before pressing «Запустити»).
export function estimateSummary(e) {
  if (!e.rows.length && !e.images) return 'Ця операція нічого не витрачає, поки не буде запиту.';
  const parts = [`Claude ≈ $${e.claude.toFixed(2)}`];
  if (e.images) parts.push(e.higgsfield.total != null ? `Higgsfield ≈ $${e.higgsfield.total.toFixed(2)} (${e.images} зображ.)` : `Higgsfield: ${e.images} зображ., ціну покаже «Оцінити вартість»`);
  let text = `Перший запуск: ${parts.join(' + ')}${e.higgsfield.total != null ? ` = $${e.once.toFixed(2)}` : ''}.`;
  if (e.monthly != null) text += ` Далі щотижня ≈ $${(e.claudeTeam).toFixed(2)} (≈ $${e.monthly.toFixed(2)} на місяць).`;
  return text;
}
