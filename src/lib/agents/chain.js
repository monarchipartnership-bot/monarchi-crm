// The rules of the agent chain, as pure code (the page and the server use the same function, so what you see is what runs).
//   agents: ag_agents rows ({ id, enabled, name, role, ... }); links: ag_links rows ({ from_agent_id, to_agent_id, required }).
// An agent is
//   'off'      its own switch is off;
//   'blocked'  it is on, but an agent it REQUIRES upstream (directly or through other required links) is off;
//   'on'       it works.
// Only required links stop the chain: a link that is not required is just an input the agent likes to have.

export function requiredUpstream(agentId, links) {
  return links.filter((l) => l.required && l.to_agent_id === agentId).map((l) => l.from_agent_id);
}

// → { state, blockedBy: agent | null }. blockedBy is the NEAREST off agent upstream, so the reason is the thing to switch back on.
export function agentState(agent, agents, links) {
  if (!agent.enabled) return { state: 'off', blockedBy: null };
  const byId = new Map(agents.map((a) => [a.id, a]));
  const seen = new Set([agent.id]);
  let level = requiredUpstream(agent.id, links);
  while (level.length) {
    const off = level.map((id) => byId.get(id)).filter((a) => a && !a.enabled);
    if (off.length) return { state: 'blocked', blockedBy: off[0] };
    const next = [];
    for (const id of level) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(...requiredUpstream(id, links));
    }
    level = next.filter((id) => !seen.has(id));
  }
  return { state: 'on', blockedBy: null };
}

export function chainStates(agents, links) {
  return Object.fromEntries(agents.map((a) => [a.id, agentState(a, agents, links)]));
}

// Everything downstream of an agent through required links: what stops when this agent is switched off.
export function dependents(agentId, links) {
  const out = new Set();
  let level = [agentId];
  while (level.length) {
    const next = [];
    for (const id of level) {
      links.filter((l) => l.required && l.from_agent_id === id).forEach((l) => { if (!out.has(l.to_agent_id) && l.to_agent_id !== agentId) { out.add(l.to_agent_id); next.push(l.to_agent_id); } });
    }
    level = next;
  }
  return [...out];
}

// Every agent upstream of this one, through any links (required or not), nearest first.
export function ancestorsOf(agentId, links) {
  const out = [];
  const seen = new Set([agentId]);
  let level = [agentId];
  while (level.length) {
    const next = [];
    for (const id of level) for (const l of links) if (l.to_agent_id === id && !seen.has(l.from_agent_id)) { seen.add(l.from_agent_id); out.push(l.from_agent_id); next.push(l.from_agent_id); }
    level = next;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- the schedule of one agent
// agent.schedule = { weekday: 1..7 (Mon..Sun), time: 'HH:MM' } in Kyiv time, or null (the agent starts only from tasks).
// → { due, scheduledFor: 'YYYY-MM-DD', reason }. Missing a cron tick only delays a run, never loses it. A failed run is tried
// again after an hour, three tries in all. When an agent is switched on, the page sets last_scheduled to the current moment, so
// the first run is the NEXT scheduled one and not a late one for a moment that passed before it was on.
import { lastScheduled } from '../agentSchedule.js';

const MAX_TRIES = 3;
const RETRY_AFTER_MIN = 60;

export function agentDue({ agent, now = new Date() }) {
  if (!agent.schedule || !agent.schedule.weekday) return { due: false, reason: 'без розкладу' };
  const sched = lastScheduled('weekly', { weeklyDay: agent.schedule.weekday, weeklyTime: agent.schedule.time }, now);
  if (agent.enabled_since && sched.at < new Date(agent.enabled_since)) return { due: false, reason: 'запланований момент був до вмикання агента' };
  if (agent.last_scheduled === sched.date) {
    if (agent.last_status === 'ok') return { due: false, reason: 'вже виконано', scheduledFor: sched.date };
    if ((agent.attempts || 0) >= MAX_TRIES) return { due: false, reason: 'вичерпано спроби', scheduledFor: sched.date };
    if (agent.last_attempt_at && now.getTime() - new Date(agent.last_attempt_at).getTime() < RETRY_AFTER_MIN * 60000) return { due: false, reason: 'чекаємо перед повтором', scheduledFor: sched.date };
  }
  return { due: true, scheduledFor: sched.date };
}
