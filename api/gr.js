// The internal growth team (docs/growth-workflow.md): one endpoint for the model work on a lead. The decisions of the person (approve, edit, skip, mark as sent) are written by the page itself
// under the row-level security; only what needs the model and the network goes through here.
//   POST { action: 'add', text, url?, source?, name?, website?, contactName?, contactEmail?, country? } → { lead, draft? }  creates the lead and runs the whole path
//        { action: 'run', leadId }                     → { lead, draft? }  tries again: a lead that failed, or one that waits for its letter
//        { action: 'approve_lead', leadId }            → { lead, draft }   the person said «писати» to a lead with the verdict «ask»: the Author writes the letter
//        { action: 'draft', leadId, kind: 'letter'|'followup'|'reply', incoming? } → { draft }
// Needs a signed-in person. Nothing here touches the agents of the client projects.
import { createClient } from '@supabase/supabase-js';
import { getModelClient } from './_lib/ai.js';
import { BudgetError, ModelError } from './_lib/modelClient.js';
import { createGrRepo } from './_lib/gr/repo.js';
import { readLeadSite } from './_lib/gr/leadSite.js';
import { HeldError, analyseLead, processLead, writeDraft } from './_lib/gr/pipeline.js';
import { SOURCE_LABEL, classifySource, firstUrl } from '../src/lib/growth/leadFlow.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';
const MODEL = 'claude-sonnet-5';

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const BOARD = /(^|\.)(linkedin|upwork)\.com$/i; // a job board or a social network is not the name of the company
const nameOf = ({ name, website, url, source }) => String(name || '').trim().slice(0, 120) || hostOf(website) || (hostOf(url) && !BOARD.test(hostOf(url)) ? hostOf(url) : null) || `Лід з ${SOURCE_LABEL[source] || 'джерела'}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Не авторизовано' }); return; }
  const { data: userData, error: authError } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token);
  if (authError || !userData?.user) { res.status(401).json({ error: 'Сесія недійсна' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY не налаштовано на сервері' }); return; }
  const email = userData.user.email;
  const repo = createGrRepo(token);
  const model = getModelClient(token);
  const deps = {
    readSite: (url) => readLeadSite(url),
    ask: ({ system, user, maxTokens, agentKey }) => model.callModel({ agentKey, actor: email, params: { model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } }),
  };
  try {
    const b = req.body || {};
    if (b.action === 'add') {
      const text = String(b.text || '').trim();
      if (text.length < 8 && !b.url && !b.website) { res.status(400).json({ error: 'Вставте посилання на оголошення чи профіль або текст заявки.' }); return; }
      const url = String(b.url || '').trim() || firstUrl(text);
      const source = ['site', 'linkedin', 'upwork', 'manual'].includes(b.source) ? b.source : classifySource(url || text);
      const website = String(b.website || '').trim() || null;
      const lead = await repo.insertLead({
        name: nameOf({ name: b.name, website, url, source }), source, source_url: url || null, website,
        raw_text: [text, url && !text.includes(url) ? url : ''].filter(Boolean).join('\n').slice(0, 20000), contact_name: b.contactName ? String(b.contactName).slice(0, 120) : null,
        contact_email: b.contactEmail ? String(b.contactEmail).slice(0, 200) : null, country: b.country ? String(b.country).slice(0, 60) : null, created_by: email,
      });
      const done = await processLead({ repo, leadId: lead.id, deps });
      res.status(200).json({ lead: done }); return;
    }
    const leadId = String(b.leadId || '');
    const lead = leadId ? await repo.getLead(leadId) : null;
    if (!lead) { res.status(404).json({ error: 'Ліда не знайдено.' }); return; }
    if (b.action === 'run') {
      if (['new', 'failed'].includes(lead.status)) { const done = await processLead({ repo, leadId, deps }); res.status(200).json({ lead: done }); return; }
      if (lead.status === 'drafting') { const draft = await writeDraft({ repo, leadId, deps }); res.status(200).json({ lead: await repo.getLead(leadId), draft }); return; }
      res.status(400).json({ error: 'Цей лід уже оброблено.' }); return;
    }
    if (b.action === 'approve_lead') {
      if (lead.status !== 'scored') { res.status(400).json({ error: 'Лід не чекає вашого рішення.' }); return; }
      await repo.updateLead(leadId, { status: 'drafting', decided_by: email });
      const draft = await writeDraft({ repo, leadId, deps });
      res.status(200).json({ lead: await repo.getLead(leadId), draft }); return;
    }
    if (b.action === 'draft') {
      const kind = ['letter', 'followup', 'reply'].includes(b.kind) ? b.kind : 'letter';
      if (kind === 'reply' && String(b.incoming || '').trim().length < 3) { res.status(400).json({ error: 'Вставте текст відповіді ліда.' }); return; }
      const draft = await writeDraft({ repo, leadId, deps, kind, incoming: String(b.incoming || '') });
      res.status(200).json({ draft }); return;
    }
    if (b.action === 'rescore') { const done = await analyseLead({ repo, leadId, deps }); res.status(200).json({ lead: done }); return; }
    res.status(400).json({ error: 'Невідома дія.' });
  } catch (e) {
    if (e instanceof HeldError) { res.status(409).json({ error: e.message, held: e.kind }); return; }
    if (e instanceof BudgetError) { res.status(429).json({ error: e.message }); return; }
    if (e instanceof ModelError) { res.status(502).json({ error: 'Помилка моделі: ' + e.message }); return; }
    res.status(500).json({ error: e?.message || 'Не вдалося виконати.' });
  }
}
