// Runs from the cron (every minute): tells the people about money spent by the AI agents — a notice for every N dollars of a campaign, a notice when a
// campaign reaches its cap, and one total per day. Where: the CRM bell (people in ai_agent_settings.notify_emails) and a Telegram topic (spec 2026-11-02, §7).
// db is the Supabase client of the agent user; telegram = { send({ chatId, text, threadId, silent }) } or null.
import { capMessage, capReached, digestDue, digestMessage, digestOf, dayWindow, dueStepNotices, stepMessage } from '../../src/lib/agents/spendNotices.js';

const must = (r) => { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data || []; };
const LINK = '/tools/constellation-test';

export async function runSpendNotices({ db, telegram = null, now = new Date(), senderEmail = 'ai-agents' }) {
  const settings = (await db.from('ai_agent_settings').select('*').eq('id', 1).maybeSingle()).data;
  if (!settings?.enabled) return { skipped: 'off' };
  const sent = { steps: 0, caps: 0, digest: false, errors: [] };

  const emails = (settings.notify_emails || []).filter(Boolean);
  const tell = async (kind, msg, { projectId = null, thread }) => {
    if (emails.length) {
      try { must(await db.from('notifications').insert(emails.map((email) => ({ recipient_email: email, sender_email: senderEmail, type: 'ai_agent', title: msg.title, body: msg.plain.slice(0, 400), link: LINK, project_id: projectId })))); } catch (e) { sent.errors.push(`${kind}: ${e.message}`); }
    }
    if (telegram && settings.tg_chat_id) {
      const r = await telegram.send({ chatId: settings.tg_chat_id, text: msg.html, threadId: thread || undefined, silent: kind === 'digest' }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (!r?.ok) sent.errors.push(`${kind} → Telegram: ${r?.error || 'не вдалося'}`);
    }
  };

  // ---- campaigns: steps and caps
  const campaigns = must(await db.from('ag_campaigns').select('id, project_id, name, status, notify_step_usd, notified_usd, spend_cap_usd').neq('status', 'cancelled'));
  const spendRows = campaigns.length ? must(await db.from('ag_campaign_spend').select('campaign_id, claude_usd, higgsfield_usd').in('campaign_id', campaigns.map((c) => c.id))) : [];
  const totals = new Map(spendRows.map((r) => [r.campaign_id, { claude: Number(r.claude_usd) || 0, higgsfield: Number(r.higgsfield_usd) || 0, total: (Number(r.claude_usd) || 0) + (Number(r.higgsfield_usd) || 0) }]));
  const projectIds = [...new Set(campaigns.map((c) => c.project_id).filter(Boolean))];
  const projects = projectIds.length ? must(await db.from('projects').select('id, name').in('id', projectIds)) : [];
  campaigns.forEach((c) => { const p = projects.find((x) => x.id === c.project_id); c.label = [p?.name, c.name].filter(Boolean).join(' — ') || `Кампанія ${c.id}`; });

  for (const n of dueStepNotices(campaigns, totals)) {
    // claim the step first: if another run took it already, nothing is sent twice
    const claimed = must(await db.from('ag_campaigns').update({ notified_usd: n.level }).eq('id', n.campaign.id).lt('notified_usd', n.level).select('id'));
    if (!claimed.length) continue;
    await tell('step', stepMessage(n), { projectId: n.campaign.project_id, thread: settings.spend_thread_id });
    sent.steps += 1;
  }
  for (const c of campaigns) {
    const t = totals.get(c.id);
    if (!t || !capReached(c, t.total)) continue;
    // the cap notice goes once per cap value: remembered in the campaign itself (a raised cap is a new value)
    const cfg = (await db.from('ag_campaigns').select('config').eq('id', c.id).maybeSingle()).data?.config || {};
    if (Number(cfg.cap_notified) === Number(c.spend_cap_usd)) continue;
    must(await db.from('ag_campaigns').update({ config: { ...cfg, cap_notified: Number(c.spend_cap_usd) } }).eq('id', c.id));
    await tell('cap', capMessage(c, t.total), { projectId: c.project_id, thread: settings.attention_thread_id });
    sent.caps += 1;
  }

  // ---- the daily total (yesterday), once after the chosen hour
  const due = digestDue({ settings, now });
  if (due.due) {
    const claimed = must(await db.from('ai_agent_settings').update({ last_digest_date: due.today }).eq('id', 1).select('id'));
    if (claimed.length) {
      const w = dayWindow(due.day);
      const tasks = must(await db.from('ag_tasks').select('campaign_id, cost_usd').gte('finished_at', w.from).lt('finished_at', w.to).limit(5000));
      const spends = must(await db.from('ag_creative_spend').select('campaign_id, usd').gte('created_at', w.from).lt('created_at', w.to).limit(5000));
      const d = digestOf({ tasks, spends, campaigns });
      if (d.total > 0) { await tell('digest', digestMessage(due.day, d), { thread: settings.spend_thread_id }); sent.digest = true; }
    }
  }
  return sent;
}
