import { useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { createExtraCycle, createSeasonal } from '../../../lib/api/operationCycles';
import { kickQueue } from '../../../lib/api/agents';
import { DEFAULT_CONCEPTS, creativeAutoOf } from '../../../lib/agents/creativeTeam';
import { kyivToday, regularsOf, seasonOver } from '../../../lib/agents/operationCycles';
import { dayMonthOf, previewRuns } from '../../../lib/agents/scheduleCalendar';
import TaskBrief, { clearTaskDraft } from './TaskBrief';
import TaskExtras, { briefFromForm, extrasInitial } from './TaskExtras';
import ScheduleCalendar from './ScheduleCalendar';

// An additional task of creatives in the Hub style (owner, 2026-11-12): the same window look as the launch of a team. `seasonal` false: a one-off task (once, now); true: a task for a
// PERIOD (new year, a sale): its dates, how often it works and the question what to do with the main regular task meanwhile (rest or work side by side). Everything about the client
// the agents take from the card of the project.
//   data: fetchTeamsData result   campaign: the operation of the creative team   seasonal   onClose()   onCreated(text)
export default function OneOffCreativeDialog({ data, campaign, email, seasonal = false, onClose, onCreated }) {
  const box = useRef(null);
  const paused = campaign.status === 'paused';
  const today = useMemo(() => kyivToday(), []);
  const draftKey = `tm-${seasonal ? 'season' : 'oneoff'}-draft-${data.project.id}`;
  const [v, setV] = useState({ goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: data.project.client_language || 'uk', ...extrasInitial() });
  const [title, setTitle] = useState('');
  // the period: the calendar of the schedule (every N days from the first day, or days of the week) and the last day
  const [sch, setSch] = useState({ mode: 'every', every: '3', days: [1, 3, 5], time: '09:00', start: today, startNow: false });
  const [end, setEnd] = useState('');
  const mains = useMemo(() => regularsOf(campaign).filter((r) => r.enabled && !r.seasonal && !seasonOver(r)), [campaign]);
  const [stance, setStance] = useState('pause'); // what the main regular task does meanwhile: 'pause' | 'parallel'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useDialogA11y(box, () => { if (!busy) onClose(); });
  const first = sch.startNow ? today : sch.start;
  const runs = useMemo(() => (seasonal && end ? previewRuns({ ...sch, start: first, end }, today, 120) : []), [seasonal, sch, first, end, today]);
  const ready = v.goal.trim().length >= 3 && v.ratios.length > 0 && (v.texts !== 'given' || v.given_texts.length > 0) && (!seasonal || (title.trim() && end && end >= first && runs.length > 0));

  async function create() {
    setBusy(true); setError('');
    try {
      const brief = briefFromForm(v);
      if (seasonal) {
        const schedule = sch.mode === 'every' ? { everyDays: Number(sch.every), time: sch.time } : { weekdays: sch.days, time: sch.time };
        await createSeasonal(campaign, { title: title.trim(), brief, schedule, startDate: first, endDate: end, replaces: stance === 'pause' ? mains.map((r) => r.id) : [], startNow: sch.startNow && !paused }, email);
        if (sch.startNow && !paused) kickQueue().catch(() => {});
        clearTaskDraft(draftKey);
        onCreated?.(`Сезонне завдання «${title.trim()}» створено: ${dayMonthOf(first)} – ${dayMonthOf(end)}${stance === 'pause' && mains.length ? '; основне завдання на цей час на паузі' : ''}.`);
      } else {
        const row = await createExtraCycle(campaign.id, { ...brief, title: title.trim() }, email, !paused);
        if (!paused) kickQueue().catch(() => {});
        clearTaskDraft(draftKey);
        onCreated?.(paused ? 'Завдання збережено чернеткою: команда на паузі. Продовжте команду й запустіть його в картці команди.' : `Завдання №${row.id} створено й запущено: агенти працюють.`);
      }
    } catch (e) { setError(e?.message || 'Не вдалося створити завдання.'); setBusy(false); }
  }

  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="oc-title" tabIndex={-1}>
        <header className="tm-head"><h2 id="oc-title">{seasonal ? 'Сезонне завдання: креативи' : 'Разове завдання: креативи'}</h2><button type="button" className="tm-x" onClick={onClose} disabled={busy} aria-label="Закрити">×</button></header>
        <div className="tm-body">
          <p className="tm-lead">{seasonal ? 'Завдання на період, наприклад новорічні свята чи розпродаж: агенти працюють над ним у заданих межах дат. Усе про клієнта вони беруть із картки проєкту.' : 'Окреме завдання для команди «Креативи»: воно виконується один раз, незалежно від регулярного. Усе про клієнта агенти беруть із картки проєкту.'}</p>
          {error && <p className="pcr-error" role="alert">{error}</p>}
          {paused && <p className="tm-hint">Команда «Креативи» зараз на паузі: {seasonal ? 'сезонне завдання збережеться, але почне працювати, лише коли ви продовжите команду.' : 'завдання збережеться чернеткою й запуститься, коли ви продовжите команду й запустите його.'}</p>}
          <label className="tm-fl"><span>{seasonal ? 'Назва сезону' : 'Назва завдання (необовʼязково)'}</span>
            <input className="tm-sel tm-text" type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={seasonal ? 'Наприклад: Новий рік' : 'Наприклад: Осінній розпродаж (порожньо: назвемо за описом)'} aria-label="Назва" /></label>
          <TaskBrief value={v} onChange={(patch) => setV((x) => ({ ...x, ...patch }))} projectId={data.project.id} draftKey={draftKey} allowGiven={!seasonal}>
            <TaskExtras value={v} onChange={(patch) => setV((x) => ({ ...x, ...patch }))} teamLimit={creativeAutoOf(campaign).maxUsd || null} />
            {seasonal && (
              <div className="tm-fl tm-w2"><span>Період і частота</span>
                <ScheduleCalendar value={{ ...sch, end }} today={today} onChange={(patch) => setSch((x) => ({ ...x, ...patch }))} />
                <label className="tm-fl"><span>Остання доба сезону</span>
                  <input className="tm-sel tm-text" type="date" min={first} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Остання доба сезону" /></label>
                {end && end < first && <p className="vo-err" role="alert">Кінець сезону раніше за його початок.</p>}
                {end && end >= first && !runs.length && <p className="vo-err" role="alert">У цьому періоді немає жодного запуску: змініть дні чи частоту.</p>}
                {runs.length > 0 && <p className="tm-hint">Запусків за сезон: {runs.length}. Перший: {dayMonthOf(runs[0])}, останній: {dayMonthOf(runs[runs.length - 1])}.</p>}
              </div>
            )}
            {seasonal && mains.length > 0 && (
              <div className="tm-fl tm-w2"><span>Що робити з основним регулярним завданням на ці дати?</span>
                <div className="tm-stance" role="radiogroup" aria-label="Основне завдання на період сезону">
                  <label className={'tm-opt' + (stance === 'pause' ? ' on' : '')}><input type="radio" name="stance" checked={stance === 'pause'} onChange={() => setStance('pause')} /><span><b>Призупинити на період</b><small>Основне не запускатиметься в ці дати й само відновиться після останньої доби сезону.</small></span></label>
                  <label className={'tm-opt' + (stance === 'parallel' ? ' on' : '')}><input type="radio" name="stance" checked={stance === 'parallel'} onChange={() => setStance('parallel')} /><span><b>Працювати паралельно</b><small>Основне й сезонне запускаються як зазвичай, витрати складаються.</small></span></label>
                </div>
              </div>
            )}
          </TaskBrief>
          <p className="tm-hint">Вартість роботи агентів ≈ $0.15–0.3 за кожен запуск. Картинки Higgsfield (≈ $0.2 за штуку) генеруються автоматично в межах ліміту команди: ви перевіряєте готові креативи.</p>
        </div>
        <footer className="tm-foot">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Скасувати</button>
          <span className="tm-foot-note" />
          <button type="button" className="btn btn-p" disabled={busy || !ready} onClick={create}>{busy ? 'Створюємо…' : seasonal ? 'Створити сезонне завдання' : paused ? 'Зберегти чернетку' : 'Створити й запустити'}</button>
        </footer>
      </div>
    </div>
  );
}
