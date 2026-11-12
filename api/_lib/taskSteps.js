// The live steps of the agents (owner, 2026-11-12): one short line per REAL event of the code while a task runs («читаю сторінку 4 з 9», «Higgsfield: картинка 1 з 2, очікую результат»),
// written to ag_task_steps; the card of the operation shows them as they come. Best effort: a step that cannot be written never stops the work of the agent.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// who: { id?, request_id?, campaign_id?, role? } (a task row, or the same fields). state: 'running' | 'done' | 'info' | 'failed'
export async function logStep(ctx, who, text, state = 'info') {
  if (!ctx?.db || ctx.dryRun || !text) return;
  try {
    await ctx.db.from('ag_task_steps').insert({ task_id: who.task_id ?? who.id ?? null, request_id: who.request_id ?? null, campaign_id: who.campaign_id ?? null, role: who.role ?? null, text: clip(text, 300), state });
  } catch (e) { console.warn('logStep failed:', e?.message || e); }
}

// A logger bound to one task: step('Читаю сайт…'), step('Готово', 'done')
export const stepsOf = (ctx, who) => (text, state = 'info') => logStep(ctx, who, text, state);
