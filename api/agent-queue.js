// The agent framework's endpoint. One door for everything that runs agents:
//   POST { action: 'process' }                       run what is due and the queued tasks of the agents that are on (the page calls it
//                                                    after a plan is approved; the cron calls it too, via GET with CRON_SECRET)
//   POST { action: 'approve_plan', planId }          the person's «ок» on a week plan: the posts go into production
//   POST { action: 'reject_plan', planId, reason }   the plan is rejected; the reason is fed back to the strategist
//   POST { action: 'run_agent', agentId, brief? }    run one agent now (strategist, SEO, competitors), even if it is switched off
//   POST { action: 'retry_task' | 'cancel_task', taskId }
//   POST { action: 'launch_campaign', campaignId }   a campaign team goes live: its first agents get their first tasks
//   POST { action: 'site_overview' }                 the website analyst's main page: is GA4 / Search Console connected, and the live figures
//   POST { action: 'poll_assets' }                   look at the pictures/videos being generated; { action: 'redo_visual', postId, note? }; { action: 'status' }
// A person acts with their own session (row-level security applies); the cron signs in as the agent user. The model key stays on the server.
import { createClient } from '@supabase/supabase-js';
import { isCronRequest, signInAgent } from './_lib/agentSession.js';
import { getModelClient } from './_lib/ai.js';
import { approvePlan, cancelTask, generatorReady, launchCampaign, pollAssets, processQueue, redoVisual, rejectPlan, retryTask, runNow } from './_lib/agentEngine.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { siteOverview } from './_lib/googleSiteData.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

const bad = (res, code, error) => res.status(code).json({ error });
const clientFor = (token) => createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });

export default async function handler(req, res) {
  try {
    let token; let email; let trigger;
    if (isCronRequest(req)) {
      const agent = await signInAgent();
      token = agent.accessToken; email = agent.email; trigger = 'cron';
    } else {
      if (req.method !== 'POST') { bad(res, 405, 'Method not allowed'); return; }
      token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) { bad(res, 401, 'Потрібна авторизація'); return; }
      const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
      if (error || !data?.user) { bad(res, 401, 'Сесія недійсна'); return; }
      email = data.user.email || null; trigger = 'user';
    }
    if (!process.env.ANTHROPIC_API_KEY) { bad(res, 500, 'ANTHROPIC_API_KEY не налаштовано'); return; }
    const ctx = { db: clientFor(token), model: getModelClient(token), email, trigger, now: () => new Date() };
    const body = req.body || {};
    const action = trigger === 'cron' ? 'process' : String(body.action || 'process');
    let out;
    if (action === 'process') out = await processQueue(ctx);
    else if (action === 'approve_plan') out = await approvePlan(ctx, Number(body.planId)); // the page then calls `process` until the queue is empty
    else if (action === 'reject_plan') out = await rejectPlan(ctx, Number(body.planId), body.reason);
    else if (action === 'run_agent') { out = await runNow(ctx, Number(body.agentId), body.brief && typeof body.brief === 'object' ? body.brief : {}); if (out.status === 'done') out.queue = await processQueue(ctx, { maxMs: 120000 }); }
    else if (action === 'retry_task') out = await retryTask(ctx, Number(body.taskId));
    else if (action === 'cancel_task') out = await cancelTask(ctx, Number(body.taskId));
    else if (action === 'poll_assets') out = { changed: await pollAssets(ctx) };
    else if (action === 'redo_visual') out = await redoVisual(ctx, Number(body.postId), body.note);
    else if (action === 'launch_campaign') out = await launchCampaign(ctx, Number(body.campaignId)); // the page then calls `process` until the queue is empty
    else if (action === 'status') out = { higgsfield: generatorReady(ctx) };
    else if (action === 'site_overview') { // the website analyst's main page: connection status + the live figures (read-only, no model)
      const cfg = (await ctx.db.from('ag_agents').select('config').eq('team', 'smm').eq('role', 'site_analyst').maybeSingle()).data?.config || {};
      out = await siteOverview({ config: cfg });
    }
    else { bad(res, 400, 'Невідома дія'); return; }
    res.status(200).json(out);
  } catch (e) {
    if (e instanceof BudgetError) { bad(res, 429, e.message); return; }
    if (e instanceof ModelError) { bad(res, 502, e.message); return; }
    bad(res, 500, e.message || String(e));
  }
}
