// «Готові матеріали» of a project (spec 2026-11-02, §1): the creatives, strategies, reports and analyses the agents delivered, with the decision of a person on each.
// Rows come from ag_deliverables (filled by the triggers of migration 20261057). Pure code: the page and the tests use it.

export const KIND_LABEL = { creative: 'Креативи', strategy: 'Стратегії', report: 'Звіти', analysis: 'Аналізи', other: 'Інше' };
export const KIND_ORDER = ['creative', 'strategy', 'report', 'analysis', 'other'];
export const STATUS_LABEL = { draft: 'Чекає рішення', approved: 'Схвалено', rejected: 'Повернуто' };

// When a person approves the result of these agents it becomes a field of the «AI-агенти» section of the project card (spec §1: «стратегия попадает в раздел после подтверждения»),
// where the other operations read it. role → key of project_creative.inputs.
export const INPUT_FOR_ROLE = { business_research: 'business', competitor_research: 'competitors', audience_research: 'audience', marketing_strategist: 'strategy', tracking_integrity: 'tracking' };

export const roleOf = (d) => d?.meta?.role || null;
export const inputKeyOf = (d) => (d?.kind && d.kind !== 'creative' ? INPUT_FOR_ROLE[roleOf(d)] || null : null);

// → [{ kind, label, items }] in the order of KIND_ORDER, newest first inside, empty kinds left out. filter: { status?, kind? }
export function groupDeliverables(list = [], filter = {}) {
  const shown = list.filter((d) => (!filter.status || d.status === filter.status) && (!filter.kind || d.kind === filter.kind));
  return KIND_ORDER.map((kind) => ({ kind, label: KIND_LABEL[kind], items: shown.filter((d) => (KIND_LABEL[d.kind] ? d.kind : 'other') === kind).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) })).filter((g) => g.items.length);
}

export const counts = (list = []) => ({ all: list.length, draft: list.filter((d) => d.status === 'draft').length, approved: list.filter((d) => d.status === 'approved').length, rejected: list.filter((d) => d.status === 'rejected').length });

// A safe name of the file to download: «Маркетинговий стратег 2026-11-10.md»
export function fileNameOf(d) {
  const base = String(d?.title || 'material').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'material';
  const day = String(d?.created_at || '').slice(0, 10);
  const ext = d?.file_url ? (String(d.file_url).split('?')[0].match(/\.(png|jpe?g|webp|gif|mp4)$/i)?.[1] || 'png').toLowerCase() : 'md';
  return `${base}${day ? ` ${day}` : ''}.${ext}`;
}

// The item stored in project_creative.inputs when a person approves the result of an agent (the same shape as the data of the agents: source 'agent').
export function inputFromDeliverable(d, by = null, now = new Date()) {
  const body = String(d?.body || '').trim().slice(0, 8000);
  return body ? { body, source: 'agent', by: by || null, filled_at: now.toISOString() } : null;
}

// What the manager sees as «why returned» is saved to the memory of the client (ag_client_events): { kind, subject, body, actor, meta }.
export function decisionEvent(d, status, reason, by) {
  return {
    kind: d.kind === 'creative' ? (status === 'approved' ? 'creative_approved' : 'creative_rejected') : 'decision',
    subject: `${status === 'approved' ? 'Схвалено' : 'Повернуто'}: ${d.title}`,
    body: String(reason || '').trim().slice(0, 1000), actor: by || null, meta: { deliverable_id: d.id, kind: d.kind, status },
  };
}
