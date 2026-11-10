import { supabase } from '../supabaseClient';
import { agentAction } from './agents';
import { decisionEvent, inputFromDeliverable, inputKeyOf } from '../agents/deliverables';

const must = ({ data, error }) => { if (error) throw error; return data; };

// The ready materials of a project (all its operations) or of one operation, newest first.
export async function fetchDeliverables({ projectId = null, campaignId = null, limit = 300 } = {}) {
  let q = supabase.from('ag_deliverables').select('*').order('created_at', { ascending: false }).limit(limit);
  if (campaignId != null) q = q.eq('campaign_id', campaignId);
  else if (projectId != null) q = q.eq('project_id', projectId);
  return must(await q) || [];
}

// «Схвалити» / «Повернути» (the reason is kept in the memory of the client so that the next work does not repeat the mistake).
//  - a creative: the creative itself changes (its trigger writes the memory and the journal);
//  - the result of an agent that waits for the person: it is passed on through the server (it checks the rights and starts the next agents);
//  - any other: the status of the material.
// An approved strategy / research becomes a field of the «AI-агенти» section of the project card.
export async function decideDeliverable(d, status, { email = null, reason = '' } = {}) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Невідоме рішення.');
  const now = new Date().toISOString();
  if (d.source_table === 'ag_creatives' && d.source_id) {
    must(await supabase.from('ag_creatives').update({ status, ...(reason ? { note: reason } : {}) }).eq('id', d.source_id).select('id'));
  } else {
    let passedOn = false;
    if (status === 'approved' && d.source_table === 'ag_tasks' && d.source_id) {
      const t = must(await supabase.from('ag_tasks').select('status, output').eq('id', d.source_id).maybeSingle());
      if (t?.status === 'done' && (t.output?.awaiting_pass === true || t.output?.awaiting_pass === 'true')) { await agentAction('pass_on', { taskId: d.source_id }); passedOn = true; }
    }
    must(await supabase.from('ag_deliverables').update({ status, approved_by: status === 'approved' ? email : null, approved_at: status === 'approved' ? now : null, updated_at: now }).eq('id', d.id).select('id'));
    if (!passedOn || status === 'rejected') must(await supabase.from('ag_client_events').insert({ project_id: d.project_id, campaign_id: d.campaign_id, ...decisionEvent(d, status, reason, email) }).select('id'));
  }
  const key = status === 'approved' ? inputKeyOf(d) : null;
  if (key) {
    const item = inputFromDeliverable(d, email);
    if (item) {
      const row = must(await supabase.from('project_creative').select('inputs').eq('project_id', d.project_id).maybeSingle());
      must(await supabase.from('project_creative').upsert({ project_id: d.project_id, inputs: { ...(row?.inputs || {}), [key]: item }, updated_by: email, updated_at: now }, { onConflict: 'project_id' }).select('project_id'));
    }
  }
  return { ok: true, wroteField: key };
}
