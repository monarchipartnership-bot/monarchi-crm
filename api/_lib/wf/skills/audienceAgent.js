// The Researcher's skill «audience» (step A4; document 1.3): segments of the target audience by the situation of buying.
// Reads the brief (the only obligatory source), the audit of the ad cabinet if there is one, and the client's GA4 if its Property ID is in the brief.
// One model call proposes the segments, code checks every confirmation against its source (audienceEngine.js), then the section «Аудиторія» is written.
import { collectGa4Audience } from './ga4Audience.js';
import { buildAudiencePrompt, checkSegments, gatherFacts, parseAudienceAnswer, questionsTask, renderAudienceText, sourceNotes } from './audienceEngine.js';

export async function audience({ run, ctx }) {
  const brief = await ctx.repo.readSection(run.project_id, 'brief');
  if (!brief?.version) return { blocked: { on: 'brief', reason: 'Аудиторія чекає на бриф.' }, steps: [{ title: 'Брифу ще немає', status: 'info' }] };
  if (!ctx.ask) throw new Error('Немає доступу до моделі: у змінних середовища Vercel не задано ANTHROPIC_API_KEY.');

  // the audit of the cabinet gives age, gender, placements: if that skill is still working, wait for it (if it is itself waiting for an account, go on without)
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const auditSec = await ctx.repo.readSection(run.project_id, 'audit');
  const auditBusy = snap.runs.some((r) => r.agent === 'researcher' && r.skill === 'audit' && ['queued', 'running'].includes(r.status));
  if (!auditSec?.version && auditBusy) return { blocked: { on: 'audit', reason: 'Аудиторія чекає на аудит кабінету: з нього беремо вік, стать і плейсменти.' }, steps: [{ title: 'Чекаємо аудит кабінету', status: 'info' }] };

  const propertyGiven = String(brief.version.content?.general?.ga4_property || '').replace(/\D/g, '');
  let ga4 = null;
  if (propertyGiven && ctx.ga4) ga4 = await collectGa4Audience(ctx.ga4, propertyGiven, ctx.now ? ctx.now() : new Date());
  const facts = gatherFacts({ brief: brief.version, audit: auditSec?.version?.content || null, ga4 });
  const notes = sourceNotes({ facts, ga4, hasAudit: !!auditSec?.version, propertyGiven: !!propertyGiven });

  const project = await ctx.repo.readProject(run.project_id);
  const prompt = buildAudiencePrompt({ facts, language: project?.client_language === 'en' ? 'en' : 'uk' });
  const answer = await ctx.ask({ projectId: run.project_id, runId: run.id, system: prompt.system, user: prompt.user, maxTokens: 6000 });
  const checked = checkSegments(parseAudienceAnswer(answer.text), facts);
  if (!checked.segments.length) throw new Error('Модель не повернула жодного придатного сегмента.');

  const open = [];
  if (checked.dropped) open.push(`Відкинуто сегментів без обов’язкових полів: ${checked.dropped}.`);
  if (ga4?.errors?.length) open.push(`Не вдалося прочитати частину GA4: ${ga4.errors.join('; ')}.`);
  const content = { schema: 1, segments: checked.segments, questions: checked.questions, sources: notes, ga4: ga4 ? { window: ga4.window, demographics: ga4.demographics, funnel: ga4.funnel } : null, angles: checked.segments.flatMap((s) => s.angles.map((a) => ({ segment: s.name, angle: a }))), open };
  const tasks = [questionsTask(checked.questions)].filter(Boolean);
  if (propertyGiven && ga4?.errors?.length && !Object.keys(ga4.reports).length) tasks.push({ type: 'client', owner: 'manager', priority: 'medium', title: 'Дати нашому Google-акаунту доступ до GA4 клієнта', evidence: ga4.errors[0] });
  const count = (st) => checked.segments.filter((s) => s.status === st).length;
  return {
    writes: [{ key: 'audience', body: renderAudienceText(checked, { notes }) + (open.length ? '\n\nВідкриті питання\n' + open.map((o) => `• ${o}`).join('\n') : ''), content, sources: [{ title: 'Бриф', version: brief.version.version ?? null }, ...(facts.meta ? [{ title: 'Аудит кабінету Meta' }] : []), ...(facts.ga4 ? [{ title: `GA4 ${ga4.property}` }] : [])] }],
    tasks,
    steps: [{ title: `Джерела: ${notes.used.length}, пропущено: ${notes.skipped.length}` }, { title: `Сегментів: ${checked.segments.length} (підтверджено ${count('confirmed')}, гіпотез ${count('hypothesis')}, не підтверджено ${count('unverified')})` }, ...(tasks.length ? [{ title: `Задач менеджеру: ${tasks.length}` }] : [])],
    output: { segments: checked.segments.length, confirmed: count('confirmed') },
    costUsd: answer.costUsd || 0,
  };
}
