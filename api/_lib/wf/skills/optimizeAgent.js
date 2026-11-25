// The Media buyer's skill «optimize» (step A9; document, step 4). Runs on a schedule (the orchestrator, about once a day) after the launch. FIRST STAGE: RECOMMENDATIONS ONLY, nothing is changed in the cabinet.
// Reads the cabinet (ads of the launch for three periods: since the launch, the last 3 days, the 4 days before them, and the state of the ad sets and ads), judges by the economics
// of the client (optimizeEngine.analyse), records the advice with the numbers in the journal and in the steps of the run, opens tasks, and sends the significant changes
// (a campaign off, new creatives, a replacement of the last ad of a group) to Апрув 3. The reader is ctx.meta (read only).
import { analyse, pickSmallActions, renderOptimizeText } from './optimizeEngine.js';

const DAY = 864e5;
const ymd = (d) => d.toISOString().slice(0, 10);
const slim = (a) => ({ level: a.level, name: a.name, action: a.action, reason: a.reason, effect: a.effect || '', to_daily: a.to_daily ?? null });

export async function optimize({ run, ctx }) {
  const accounts = (await ctx.repo.listAdAccounts(run.project_id)).filter((a) => a.platform === 'meta');
  const snapSec = (await ctx.repo.readSection(run.project_id, 'launch'))?.version?.content || null;
  if (!accounts.length || snapSec?.status !== 'done') return { output: { skipped: true }, steps: [{ title: 'Запуску ще немає: оптимізувати нічого', status: 'info' }] };
  if (!ctx.meta?.insights) throw new Error('Немає доступу до Meta: у змінних середовища Vercel не задано META_ACCESS_TOKEN.');
  const accountId = accounts[0].account_id;
  const now = (ctx.now || (() => new Date()))();
  const ue = (await ctx.repo.readSection(run.project_id, 'unit_economy'))?.version?.content || null;
  const thresholds = { ...(ue?.thresholds || {}), ...Object.fromEntries(Object.entries(snapSec.targets || {}).filter(([, v]) => v != null)) };

  const today = new Date(ymd(now) + 'T00:00:00Z');
  const win = { life: { since: ymd(new Date(Math.min(new Date(snapSec.launched_at), today - DAY))), until: ymd(today) }, recent: { since: ymd(new Date(today - 3 * DAY)), until: ymd(new Date(today - DAY)) }, prior: { since: ymd(new Date(today - 7 * DAY)), until: ymd(new Date(today - 4 * DAY)) } };
  const read = async (w) => (await ctx.meta.insights({ accountId, level: 'ad', timeRange: w, maxPages: 10, limit: 500 })).rows;
  const rows = { life: await read(win.life), recent: await read(win.recent), prior: await read(win.prior) };

  // what really works in the cabinet now (a person may have switched something off by hand)
  const objects = { adsets: new Map(), ads: new Map() };
  const open = [];
  if (ctx.meta.objects) {
    try { for (const o of await ctx.meta.objects({ accountId, level: 'adset' })) objects.adsets.set(String(o.id), o); for (const o of await ctx.meta.objects({ accountId, level: 'ad' })) objects.ads.set(String(o.id), o); } catch (e) { open.push(`Стан груп і оголошень не вдалося прочитати: ${String(e?.message || e).slice(0, 120)}.`); }
  } else open.push('Стан груп і оголошень у кабінеті не читався: усі вважаються увімкненими.');
  const lastScale = ctx.repo.lastJournal ? await ctx.repo.lastJournal(run.project_id, 'optimize_scale') : null;

  const r = analyse({ snapshot: snapSec, thresholds, rows, objects, now, lastScaleAt: lastScale?.at || null });
  const actionable = r.actions.filter((a) => ['off', 'scale', 'replace', 'new_creative'].includes(a.action));
  const counts = ['off', 'scale', 'replace', 'new_creative', 'keep', 'wait'].map((k) => [k, r.actions.filter((a) => a.action === k).length]).filter(([, n]) => n);
  const period = `${win.life.since} – ${win.life.until}`;
  const summary = `Оптимізація: ${actionable.length ? 'рекомендацій ' + actionable.length : 'змін не потрібно'} (${counts.map(([k, n]) => `${k} ${n}`).join(', ')}). Витрачено ${r.totals.spend}, покупок ${r.totals.purchases}.`;
  await ctx.repo.journal(run.project_id, { actor_kind: 'agent', actor: 'mediabuyer', action: 'optimize', subject: 'optimize', summary, meta: { period, actions: actionable.map(slim), notes: r.notes } });
  if (r.actions.some((a) => a.action === 'scale')) await ctx.repo.journal(run.project_id, { actor_kind: 'agent', actor: 'mediabuyer', action: 'optimize_scale', subject: 'optimize', summary: 'Порекомендовано підняти бюджет: наступна така порада не раніше ніж через 72 години.', meta: {} });

  // the SMALL actions: only in a project that allows them (off by default), only through the closed list of optimizeEngine.pickSmallActions, only with a writer and a cabinet that was really read
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const auto = { enabled: snap.state?.auto_small_actions === true, applied: [], skipped: [], failed: [] };
  if (auto.enabled) {
    if (!ctx.metaWrite?.setAdStatus || !ctx.metaWrite?.setAdsetDaily) open.push('Дрібні дії ввімкнено, але запису в кабінет немає: лише рекомендації.');
    else if (!objects.ads.size) open.push('Дрібні дії ввімкнено, але стан оголошень у кабінеті не прочитано: нічого не змінювалось.');
    else {
      const brief = (await ctx.repo.readSection(run.project_id, 'brief'))?.version?.content;
      const monthly = Number(brief?.economics?.budget_monthly);
      const pick = pickSmallActions({ actions: r.actions, snapshot: snapSec, objects, dailyCap: Number.isFinite(monthly) && monthly > 0 ? monthly / 30 : null });
      auto.skipped = pick.skipped;
      for (const x of pick.apply) {
        try {
          if (x.kind === 'ad_off') await ctx.metaWrite.setAdStatus({ adId: x.id, status: 'PAUSED' });
          else await ctx.metaWrite.setAdsetDaily({ adsetId: x.id, dailyMinor: Math.round(x.to * 100) });
          auto.applied.push(x);
          await ctx.repo.journal(run.project_id, { actor_kind: 'agent', actor: 'mediabuyer', action: 'optimize_auto', subject: 'optimize', summary: x.kind === 'ad_off' ? `Автоматично призупинено оголошення «${x.name}»: ${x.reason} Відкотити: увімкнути його в Ads Manager.` : `Автоматично піднято бюджет «${x.name}»: ${x.from} → ${x.to} на день. ${x.reason}`, meta: { ...x, undo: x.kind === 'ad_off' ? { set_status: 'ACTIVE' } : { set_daily: x.from } } });
          if (x.kind === 'adset_scale') await ctx.repo.journal(run.project_id, { actor_kind: 'agent', actor: 'mediabuyer', action: 'optimize_scale', subject: 'optimize', summary: 'Бюджет піднято автоматично: наступне підняття не раніше ніж за 72 години.', meta: {} });
        } catch (e) { auto.failed.push({ name: x.name, error: String(e.message || e).slice(0, 200) }); }
      }
      if (auto.failed.length) open.push(`Дрібні дії не вдалися (${auto.failed.length}): ${auto.failed.map((f) => `«${f.name}»: ${f.error}`).join('; ')}`);
    }
  }

  // the significant changes go to Апрув 3 (one open request at a time)
  const pending = (snap.approvals || []).some((a) => a.kind === 'changes' && a.status === 'pending');
  const approvals = r.significant.length && !pending ? [{ kind: 'changes', subject: { source: 'optimize', period, actions: r.significant.map(slim) } }] : [];
  return {
    tasks: r.tasks, approvals,
    steps: [{ title: `Прочитано кабінет за ${period}: витрачено ${r.totals.spend}, покупок ${r.totals.purchases}` }, { title: summary, detail: { actions: r.actions.map(slim) } }, ...(approvals.length ? [{ title: `На Апрув 3: ${r.significant.length}` }] : []),
      ...auto.applied.map((x) => ({ title: x.kind === 'ad_off' ? `Автоматично призупинено оголошення «${x.name}»` : `Автоматично піднято бюджет «${x.name}»: ${x.from} → ${x.to} на день` })),
      ...(auto.enabled && auto.skipped.length ? [{ title: `Дрібні дії не зроблено (${auto.skipped.length}): ${auto.skipped.map((s) => `«${s.name}»: ${s.why}`).join('; ')}`.slice(0, 500), status: 'info' }] : []),
      ...open.map((t) => ({ title: t, status: 'info' }))],
    output: { actions: r.actions.length, actionable: actionable.length, significant: r.significant.length, auto_enabled: auto.enabled, applied: auto.applied.length, auto_skipped: auto.skipped.length, auto_failed: auto.failed.length },
  };
}
