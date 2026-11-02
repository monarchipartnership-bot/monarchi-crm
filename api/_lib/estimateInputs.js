// The two numbers the pre-launch estimate cannot know by itself (src/lib/agents/campaignEstimate.js): what one picture costs at Higgsfield (its free estimate
// endpoint, asked once with a neutral sample) and what each agent's run has cost so far (the average of its recent runs). Nothing is spent here.
import * as hfReal from './hfImage.js';

const must = (r) => { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data || []; };

// → { unitUsd: number|null, configured, history: { role: avg $ } , samples: { role: n } }
export async function estimateInputs(ctx, { ratio = '4:5' } = {}) {
  const { db } = ctx;
  const agents = must(await db.from('ag_agents').select('id, role'));
  const runs = must(await db.from('ag_runs').select('agent_id, cost_usd').gt('cost_usd', 0).order('id', { ascending: false }).limit(600));
  const roleOf = new Map(agents.map((a) => [a.id, a.role]));
  const acc = {};
  runs.forEach((r) => { const role = roleOf.get(r.agent_id); if (!role) return; (acc[role] ||= []).push(Number(r.cost_usd)); });
  const history = {}; const samples = {};
  Object.entries(acc).forEach(([role, list]) => { history[role] = Math.round((list.reduce((s, x) => s + x, 0) / list.length) * 10000) / 10000; samples[role] = list.length; });

  const client = ctx.hfImage === undefined ? (hfReal.isConfigured() ? hfReal : null) : ctx.hfImage;
  let unitUsd = null; let error = null;
  if (client) {
    try {
      const request = hfReal.buildImageRequest({ prompt: 'A clean product advertisement photo, soft studio light, plain background.', ratio, references: [] }, hfReal.profileFromEnv());
      unitUsd = await client.estimate({ request });
    } catch (e) { error = String(e.message || e); }
  }
  return { unitUsd, configured: !!client, history, samples, ...(error ? { error } : {}) };
}
