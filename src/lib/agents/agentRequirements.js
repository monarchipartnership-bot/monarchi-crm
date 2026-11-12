// What every agent needs to know about a client, as a table (spec 2026-11-02, section 3): the fields of the «AI-агенти» section of the project card, the
// data of the connected ad accounts and the rules of the client. For each agent role the REQUIRED fields (without them it cannot do a useful job) and the
// RECOMMENDED ones (the result is better with them). The screens use it to say what is missing before a campaign is launched. Pure code.
import { INPUT_FIELDS, PROFILE_FIELDS } from './projectCreative.js';
import { CAMPAIGN_ROLES } from './campaignTeam.js';
import { CREATIVE_ROLES } from './creativeTeam.js';
import { MODES, modeHasDepartment, modeRoles, shortName } from './campaignModes.js';

// the fields that are not in the registries of the card: the rules of the client, the button, Figma, the library and the cabinets
export const FIELD_LABELS = {
  ...Object.fromEntries([...INPUT_FIELDS, ...PROFILE_FIELDS].map((f) => [f.key, f.label])),
  restrictions: 'Обмеження клієнта', cta: 'Кнопка заклику до дії', figma: 'Макет Figma', materials: 'Матеріали клієнта',
  cabinet: 'Підключений рекламний кабінет', cabinet_meta: 'Кабінет Meta', cabinet_google: 'Кабінет Google',
};

const R = (required = [], recommended = []) => ({ required, recommended });
export const REQUIREMENTS = {
  // the creative department
  creative_strategy: R(['offer'], ['about', 'audience', 'restrictions', 'materials', 'tone', 'goals', 'competitors', 'strategy']),
  creative_brief: R([], ['restrictions', 'materials', 'brand', 'cta']),
  creative_copywriter: R(['offer'], ['tone', 'restrictions', 'audience', 'markets']),
  creative_maker: R([], ['materials', 'brand', 'restrictions']),
  creative_quality: R([], ['restrictions', 'offer', 'tone']),
  creative_analyst: R(['cabinet'], []),
  creative_scout: R([], []), // it reads the site and the cabinet itself and says what it could not learn
  // the team of a campaign
  business_research: R(['about'], ['offer']),
  competitor_research: R(['competitor_sites'], ['about', 'competitor_notes']), // who to study: the sites of the competitors from the card of the project
  audience_research: R(['about'], ['offer', 'markets']),
  marketing_strategist: R(['about', 'goals'], ['offer', 'audience', 'competitors', 'budget', 'markets', 'seasonality']),
  meta_analyst: R(['cabinet_meta'], ['goals']),
  google_analyst: R(['cabinet_google'], ['goals']),
  tiktok_analyst: R([], ['goals']),
  tracking_integrity: R(['cabinet'], []),
  meta_optimizer: R(['cabinet_meta', 'goals'], ['budget', 'strategy']),
  google_optimizer: R(['cabinet_google', 'goals'], ['budget', 'strategy']),
  cross_channel_report: R(['cabinet'], ['goals']),
  account_manager: R([], ['about', 'goals']),
};

const NAME_OF = Object.fromEntries([...CAMPAIGN_ROLES, ...CREATIVE_ROLES].map((r) => [r.role, shortName(r.name)]));

// the agents that need a field (the ones that REQUIRE it first), for the hint under the field
export function agentsNeeding(key) {
  const need = (level) => Object.entries(REQUIREMENTS).filter(([, r]) => r[level].includes(key)).map(([role]) => NAME_OF[role] || role);
  return { required: need('required'), recommended: need('recommended') };
}

// → the keys of the fields that are filled for a project. settings = the row of project_creative, assets = the library, accounts = project_ad_accounts.
export function filledFields({ settings = {}, assets = [], accounts = [] } = {}) {
  const have = new Set();
  Object.entries(settings?.inputs || {}).forEach(([k, v]) => { if (String(v?.body || '').trim()) have.add(k); });
  if (String(settings?.restrictions || '').trim()) have.add('restrictions');
  if (settings?.cta_mode === 'none' || String(settings?.cta_text || '').trim()) have.add('cta');
  if (String(settings?.figma_url || '').trim()) have.add('figma');
  if (have.has('competitor_notes') || have.has('competitors')) have.add('competitor_sites'); // the competitors are named, with or without their addresses
  if (assets.length) have.add('materials');
  const platforms = new Set(accounts.map((a) => a.platform));
  if (platforms.has('meta')) { have.add('cabinet_meta'); have.add('cabinet'); }
  if (platforms.has('google')) { have.add('cabinet_google'); have.add('cabinet'); }
  return have;
}

// → what is missing for these roles: { required: [{ key, label, agents }], recommended: [...] }; each missing field is named once with every agent that needs it.
export function missingFor(roles, have) {
  const out = { required: new Map(), recommended: new Map() };
  [...new Set(roles)].forEach((role) => {
    const req = REQUIREMENTS[role];
    if (!req) return;
    [['required', req.required], ['recommended', req.recommended]].forEach(([level, keys]) => keys.forEach((key) => {
      if (have.has(key)) return;
      if (level === 'recommended' && out.required.has(key)) return;
      const bucket = out[level];
      if (!bucket.has(key)) bucket.set(key, { key, label: FIELD_LABELS[key] || key, agents: [] });
      bucket.get(key).agents.push(NAME_OF[role] || role);
    }));
  });
  // a field that is required by one agent is not also listed as recommended for another
  out.required.forEach((_, key) => out.recommended.delete(key));
  return { required: [...out.required.values()], recommended: [...out.recommended.values()] };
}

// The agents a mode puts to work for a client (the team of the campaign plus the creative department where the mode has it).
export function modeAgentRoles(mode, platforms, { departmentWanted = true } = {}) {
  const dept = modeHasDepartment(mode, departmentWanted) ? CREATIVE_ROLES.map((r) => r.role) : [];
  return [...modeRoles(mode, platforms), ...dept];
}

// → for every mode: what is missing before the campaign of this mode can start. Used by the card of the project and by the wizards.
export function readinessByMode(have, platforms) {
  return Object.fromEntries(Object.keys(MODES).map((mode) => [mode, missingFor(modeAgentRoles(mode, platforms), have)]));
}
