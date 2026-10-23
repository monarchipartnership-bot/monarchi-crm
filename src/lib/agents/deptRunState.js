// What an agent of a department is doing right now, for the 3D map (colour of the hard hat, pad and pin), from the REAL tables of the agent model
// (ag_agents, ag_agent_clients, ag_tasks), not from chat activity. Pure code: the page and the tests use the same function.
//   problem  a task failed and was not retried, or the last run ended with a problem
//   working  a task is running or waiting in the queue (the agent is busy)
//   paused   the agent is switched off, or every client is stopped or paused for it, or a result waits for the person's OK
//   waiting  it is on and idle: ready for tasks
// The order is the order of importance: a problem is shown even when something else is running.

export function deptRunState({ agent, clients = [], tasks = [] }) {
  if (!agent) return 'waiting'; // the department is not created in the database yet: the agent is built and idle
  const mine = tasks.filter((t) => t.agent_id === agent.id);
  if (agent.enabled && (mine.some((t) => t.status === 'failed') || agent.last_status === 'problem')) return 'problem';
  if (!agent.enabled) return 'paused';
  if (mine.some((t) => t.status === 'done' && t.awaiting_pass)) return 'paused';
  if (mine.some((t) => t.status === 'running' || t.status === 'queued')) return 'working';
  const links = clients.filter((c) => c.agent_id === agent.id);
  if (links.length && links.every((c) => !c.enabled || c.mode === 'paused')) return 'paused';
  return 'waiting';
}

// registryAgents: the cards of the map ({ key, deptAgent }); data: { agents, clients, tasks }. → { registryKey: state } for the agents that have a page.
export function deptRunStates(registryAgents, { agents = [], clients = [], tasks = [] } = {}) {
  const out = {};
  registryAgents.filter((a) => a.deptAgent).forEach((a) => {
    out[a.key] = deptRunState({ agent: agents.find((x) => x.role === a.deptAgent), clients, tasks });
  });
  return out;
}
