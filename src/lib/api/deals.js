import { supabase } from '../supabaseClient';

const DEAL_SELECT = '*, clients(name, name_key, company, country, phone), deal_stages(id, label, color, is_won, is_lost, position), pipelines(id, name, color)';

function nowIso() {
  return new Date().toISOString();
}

// Every tab on the Угоди page is scoped to one pipeline at a time — deals
// belonging to other pipelines are simply never fetched.
export async function fetchDeals(pipelineId) {
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('pipeline_id', pipelineId).order('updated_at', { ascending: false });
  if (error) { console.warn('fetchDeals failed', error); return []; }
  return data ?? [];
}

// Every deal across every pipeline — used to enrich the cross-deal "Задачі"
// list (each task only stores a bare deal_id) rather than to render a board.
export async function fetchAllDeals() {
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).order('updated_at', { ascending: false });
  if (error) { console.warn('fetchAllDeals failed', error); return []; }
  return data ?? [];
}

export async function fetchDealsForClient(clientId) {
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('client_id', clientId).order('created_at', { ascending: false });
  if (error) { console.warn('fetchDealsForClient failed', error); return []; }
  return data ?? [];
}

// One client shouldn't accumulate a new deal every time a weekly sync runs
// while an existing one is still open — this is what autosave checks first.
// "Open" = stage flagged neither won nor lost. Scoped to one pipeline — a
// client can have a genuinely separate open deal in each pipeline at once
// (e.g. an Upwork conversation and a LinkedIn conversation are different deals).
export async function fetchOpenDealForClient(clientId, pipelineId) {
  const { data: openStages, error: stagesError } = await supabase.from('deal_stages').select('id').eq('pipeline_id', pipelineId).eq('is_won', false).eq('is_lost', false);
  if (stagesError) { console.warn('fetchOpenDealForClient (stages) failed', stagesError); return null; }
  const openIds = (openStages || []).map((s) => s.id);
  if (!openIds.length) return null;
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('client_id', clientId)
    .in('stage_id', openIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn('fetchOpenDealForClient failed', error); return null; }
  return data;
}

export async function createDeal({ clientId, manager, stageId, pipelineId, amount, currency, expectedCloseDate, title, source, chatLink }) {
  let sid = stageId;
  let pid = pipelineId;
  if (!sid) {
    const { data: firstStage } = await supabase.from('deal_stages').select('id, pipeline_id').eq('pipeline_id', pid).order('position', { ascending: true }).limit(1).maybeSingle();
    sid = firstStage?.id;
    pid = pid || firstStage?.pipeline_id;
  }
  const { data, error } = await supabase.from('deals').insert({
    client_id: clientId,
    manager: manager || null,
    stage_id: sid,
    pipeline_id: pid,
    amount: amount || null,
    currency: currency || 'USD',
    expected_close_date: expectedCloseDate || null,
    title: title?.trim() || null,
    source: source?.trim() || null,
    chat_link: chatLink?.trim() || null,
  }).select(DEAL_SELECT).single();
  if (error) { console.warn('createDeal failed', error); return null; }
  return data;
}

export async function updateDealFields(id, patch) {
  const { error } = await supabase.from('deals').update({ ...patch, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

// `stage` is the full deal_stages row (not just an id) — the caller already
// has the stage list loaded, so this avoids a re-fetch just to check
// is_won/is_lost. Moving to an is_lost stage records the reason; any other
// stage clears it. Entering a closed stage (won or lost) stamps `closed_at`;
// moving back out to an open stage clears it again.
//
// `archived` (separate from is_won/is_lost) is what actually hides a deal
// from the Kanban/List boards into the Архів tab — a Lost deal has nothing
// left to do, so it archives itself immediately; a Won deal keeps working
// (invoices, follow-up notes) and only archives once someone explicitly
// clicks "Завершити угоду" (see archiveDeal below). Moving to ANY stage
// here always resets `archived` to match — reopening a deal (won, lost, or
// already archived) into a working stage un-archives it.
export async function moveDealStage(id, stage, lostReason) {
  const payload = {
    stage_id: stage.id,
    lost_reason: stage.is_lost ? (lostReason || null) : null,
    closed_at: (stage.is_won || stage.is_lost) ? nowIso() : null,
    archived: Boolean(stage.is_lost),
    stage_changed_at: nowIso(),
    updated_at: nowIso(),
  };
  const { error } = await supabase.from('deals').update(payload).eq('id', id);
  if (error) throw error;
}

// Explicit "done, nothing more to do" for a Won deal — moves it into the
// Архів tab without touching its stage (unlike a Lost deal, it doesn't
// archive itself the moment it closes).
export async function archiveDeal(id) {
  const { error } = await supabase.from('deals').update({ archived: true, archived_at: nowIso(), updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

export async function deleteDeal(id) {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

// Copies only the deal's core fields onto a fresh deal in the same pipeline,
// dropped back onto the first stage — notes/tasks/participants/history are
// intentionally not carried over, per product decision.
export async function duplicateDeal(deal, stages) {
  const firstStage = [...(stages || [])].sort((a, b) => a.position - b.position)[0];
  const row = await createDeal({
    clientId: deal.client_id,
    manager: deal.manager,
    stageId: firstStage?.id,
    pipelineId: deal.pipeline_id,
    amount: deal.amount,
    currency: deal.currency,
    expectedCloseDate: deal.expected_close_date,
    title: (deal.title || deal.clients?.company || deal.clients?.name || 'Угода') + ' (копія)',
    source: deal.source,
    chatLink: deal.chat_link,
  });
  if (row && deal.website) {
    await updateDealFields(row.id, { website: deal.website });
  }
  return row;
}
