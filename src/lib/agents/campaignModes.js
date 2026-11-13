// What the launch of a team (lib/agents/teams.js) still needs from the old «operation» model. The wizard with five modes is gone (13.11): a person launches
// the teams «Креативи», «Аналітика й оптимізація» and «Звіти» from the card of a project. Inside, an operation keeps a mode in `config.mode`:
//   creative  the operation of the team «Креативи» (the creative department works by requests; no campaign team)
//   ads       the operation of the team «Аналітика й оптимізація» (the analysts of the cabinets, the tracking control, the optimizers)
//   full      the hidden operation behind the one-off research tasks of a project (lib/api/oneoff.js)
import { participants } from './campaignTeam.js';

export const COST_PER_AGENT_RUN = 0.07; // a rough price of one agent run, for the estimate only

// the roles of the campaign team that the team «Аналітика й оптимізація» puts to work
const ADS_ROLES = ['meta_analyst', 'google_analyst', 'tiktok_analyst', 'tracking_integrity', 'meta_optimizer', 'google_optimizer'];

// The roles of the campaign team a mode switches ON for these channels. «creative» has none (the department is not a part of the campaign team);
// an agent of a channel that is not chosen stays off.
export function modeRoles(mode, platforms) {
  if (mode !== 'ads') return [];
  const taking = new Set(participants(platforms).map((r) => r.role));
  return ADS_ROLES.filter((role) => taking.has(role));
}

export const shortName = (name) => { const n = String(name).replace(/^Агент /, ''); return n.charAt(0).toUpperCase() + n.slice(1); };
