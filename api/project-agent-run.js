// «Запустити зараз» on a project's AI Агент tab: the agent makes the report (and presentation) for the
// period that is due, as a draft. A signed-in CRM user starts it; the work itself is done as the agent user.
// POST { projectId, periodType: 'weekly' | 'monthly' } → { status, message, runId, reportId, deckIds, notes, costUsd }
// POST { action: 'telegram_test', projectId, periodType, chatId } → { ok } — sends a sample of the report message to the chat (marked as a test)
import { createClient } from '@supabase/supabase-js';
import { signInAgent } from './_lib/agentSession.js';
import { createAgentRepo } from './_lib/agentRepo.js';
import { makeInternalPost } from './_lib/internalPost.js';
import { runProjectReport } from './_lib/projectAgentRun.js';
import { makeCreativesCollector } from './_lib/metaCreatives.js';
import { hasToken, sendMessage } from './_lib/telegram.js';
import { buildReportMessage, reportAction, reportLink } from '../src/lib/projectReportMessage.js';
import { dueReportPeriod } from '../src/lib/reportEngine.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Потрібна авторизація' }); return; }
  const { data, error } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }

  const projectId = Number(req.body?.projectId);
  const periodType = req.body?.periodType;
  if (!Number.isInteger(projectId) || !['weekly', 'monthly'].includes(periodType)) { res.status(400).json({ error: 'projectId і periodType (weekly | monthly) обовʼязкові' }); return; }
  const crmUrl = process.env.CRM_BASE_URL || 'https://crm.monarchi.agency';

  if (req.body?.action === 'telegram_test') {
    const chatId = String(req.body?.chatId || '').trim();
    if (!chatId) { res.status(400).json({ error: 'Оберіть Telegram-чат.' }); return; }
    if (!hasToken()) { res.status(200).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не налаштовано на сервері.' }); return; }
    const userDb = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: project } = await userDb.from('projects').select('name').eq('id', projectId).maybeSingle();
    const due = dueReportPeriod(periodType, new Date().toISOString().slice(0, 10));
    const msg = buildReportMessage({ projectName: project?.name, period: due?.period, periodType, status: 'draft', action: reportAction(['«Plans for the next period»']), links: [{ label: 'Звіт', url: reportLink(crmUrl, projectId, periodType, null) }], test: true });
    const sent = await sendMessage({ chatId, threadId: req.body?.threadId || undefined, text: msg.text, buttons: msg.buttons });
    res.status(200).json(sent.ok ? { ok: true } : { ok: false, error: sent.error });
    return;
  }

  try {
    const agent = await signInAgent();
    const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + agent.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const result = await runProjectReport({
      repo: createAgentRepo(db, agent.email), post: makeInternalPost(agent.accessToken),
      projectId, periodType, trigger: 'manual', startedBy: data.user.email || null, creatives: makeCreativesCollector(db, process.env.META_ACCESS_TOKEN),
      telegram: hasToken() ? { send: (m) => sendMessage(m) } : null, crmUrl,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
