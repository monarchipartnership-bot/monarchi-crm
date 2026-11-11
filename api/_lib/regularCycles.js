// The regular cycles of an operation (owner, 2026-11-11): the operation keeps weekly days, times and parameters of the work (campaign.config.regulars, several may be);
// when the moment of one comes, a request is created from it with the client's current files and started, exactly as if a person pressed «Створити й запустити».
// The request made for a day and a cycle is the record that it was served (brief.scheduled_for + brief.regular_id), so nothing is kept in the campaign row that a page could overwrite.
// Money: the chain of agents runs by itself (model calls); the pictures still wait for the person's «Підтвердити генерацію» unless the maker is set to
// generate at once, and a campaign over its cap starts nothing.
import { dueRegulars, regularRequest, regularsOf } from '../../src/lib/agents/operationCycles.js';
import { cappedCampaigns } from './campaignCycles.js';
import { startRequest } from './creativeEngine.js';

const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const nowOf = (ctx) => (ctx.now ? ctx.now() : new Date());

// → { checked, started: [campaign ids], skipped: [{ id, reason }] }
export async function runRegularCycles(ctx) {
  const { db } = ctx;
  const out = { checked: 0, started: [], skipped: [] };
  const campaigns = (must(await db.from('ag_campaigns').select('*').eq('status', 'active'), 'campaigns') || []).filter((c) => regularsOf(c).some((r) => r.enabled));
  if (!campaigns.length) return out;
  const now = nowOf(ctx);
  const since = new Date(now.getTime() - 70 * 86400000).toISOString(); // a task «every N days» looks at its last served day, up to 60 days back
  const recent = must(await db.from('ag_creative_requests').select('id, campaign_id, brief, created_at').in('campaign_id', campaigns.map((c) => c.id)).gte('created_at', since), 'requests') || [];
  const capped = await cappedCampaigns(db).catch(() => new Set());
  for (const campaign of campaigns) {
    out.checked += 1;
    for (const { regular, scheduledFor } of dueRegulars({ campaign, requests: recent, now })) {
      if (capped.has(String(campaign.id))) { out.skipped.push({ id: campaign.id, reason: 'ліміт витрат' }); break; }
      try {
        const assets = campaign.project_id ? must(await db.from('project_creative_assets').select('kind, name, url, path').eq('project_id', campaign.project_id).order('id', { ascending: true }), 'assets') || [] : [];
        const row = must(await db.from('ag_creative_requests').insert(regularRequest(campaign, scheduledFor, assets, regular)).select().single(), 'request');
        // the cron and a page may come here at the same moment: the earliest request of the day for this cycle stays, the later one withdraws
        const same = (must(await db.from('ag_creative_requests').select('id, brief').eq('campaign_id', campaign.id).gte('created_at', since).order('id', { ascending: true }), 'requests') || []).filter((r) => r.brief?.scheduled_for === scheduledFor && (r.brief?.regular_id || 'r1') === regular.id);
        if (same.length > 1 && same[0].id !== row.id) { await db.from('ag_creative_requests').delete().eq('id', row.id); continue; }
        try { await startRequest({ ...ctx, email: 'розклад' }, row.id); out.started.push(campaign.id); } catch (e) {
          // the cycle exists and says why it did not start: the person sees it in «Зараз в роботі» and can start it again
          await db.from('ag_creative_requests').update({ status: 'problem', error: String(e?.message || e).slice(0, 500), updated_at: nowOf(ctx).toISOString() }).eq('id', row.id);
          out.skipped.push({ id: campaign.id, reason: String(e?.message || e) });
        }
      } catch (e) { out.skipped.push({ id: campaign.id, reason: String(e?.message || e) }); }
    }
  }
  return out;
}
