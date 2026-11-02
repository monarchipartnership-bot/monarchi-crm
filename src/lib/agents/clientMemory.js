// The memory of a client (spec 2026-11-02, §9): what was approved, returned and why, so the next work does not repeat a mistake. It is a RECORDED history (the table
// ag_client_events), not the memory of the model: the agents are given a short dossier made from it as one more block of their prompt.
// Pure code: events in, a compact Ukrainian text out. The newest facts come first inside each group; the whole dossier is kept short on purpose.

const dayOf = (iso) => String(iso || '').slice(0, 10);
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export const MEMORY_LIMITS = { events: 60, returned: 8, comments: 6, approved: 8, notes: 6, chars: 3200 };

// events: rows of ag_client_events { kind, subject, body, actor, created_at } in any order. → { text, counts } (text is '' when there is nothing to tell)
export function buildDossier(events = [], limits = MEMORY_LIMITS) {
  const sorted = [...events].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const of = (kind) => sorted.filter((e) => e.kind === kind);
  const returned = of('creative_rejected'); const approved = of('creative_approved'); const comments = of('creative_comment');
  const notes = sorted.filter((e) => ['decision', 'note'].includes(e.kind));
  const counts = { approved: approved.length, returned: returned.length, comments: comments.length, notes: notes.length };
  const parts = [];
  if (returned.length) parts.push(`Повернуто менеджером (${returned.length}): чого уникати\n${returned.slice(0, limits.returned).map((e) => `- ${dayOf(e.created_at)} ${clip(e.subject, 80)}${e.body ? `: ${clip(e.body, 240)}` : ' (причину не вказано)'}`).join('\n')}`);
  if (comments.length) parts.push(`Зауваження до матеріалів\n${comments.slice(0, limits.comments).map((e) => `- ${dayOf(e.created_at)} ${clip(e.subject, 80)}: ${clip(e.body, 240)}`).join('\n')}`);
  if (approved.length) parts.push(`Затверджено (${approved.length}): що спрацювало для клієнта\n${approved.slice(0, limits.approved).map((e) => `- ${dayOf(e.created_at)} ${clip(e.subject, 80)}${e.body ? `: ${clip(e.body, 160)}` : ''}`).join('\n')}`);
  if (notes.length) parts.push(`Рішення й нотатки\n${notes.slice(0, limits.notes).map((e) => `- ${dayOf(e.created_at)} ${clip(e.subject, 80)}${e.body ? `: ${clip(e.body, 240)}` : ''}`).join('\n')}`);
  let text = parts.join('\n\n');
  if (text.length > limits.chars) text = `${text.slice(0, limits.chars - 1)}…`;
  return { text, counts };
}

// The block handed to the agents: the title explains how to use it.
export const memoryBlock = (dossier) => (dossier.text ? { title: 'Пам’ять про клієнта: що вже затверджували, повертали і чому (історія рішень менеджера, не вигадка)', text: dossier.text } : null);
