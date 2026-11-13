import { useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { runRegularNow, saveRegular } from '../../../lib/api/operationCycles';
import { kickQueue } from '../../../lib/api/agents';
import { DEFAULT_CONCEPTS, creativeAutoOf } from '../../../lib/agents/creativeTeam';
import { describeRegular, kyivToday } from '../../../lib/agents/operationCycles';
import TaskBrief, { clearTaskDraft } from './TaskBrief';
import TaskExtras, { briefFromForm, extrasInitial } from './TaskExtras';
import ScheduleCalendar from './ScheduleCalendar';

// An additional REGULAR task of creatives (owner, 2026-11-12, step 3.0b): its own schedule and its own brief; everything about the client the agents take from the card of the project, and the
// agents of the task are tuned afterwards in the card of the task. The same window look as the one-off and the seasonal tasks.
//   data: fetchTeamsData result   campaign: the operation of the creative team   onClose()   onCreated(text, regularId)
export default function NewRegularTask({ data, campaign, email, onClose, onCreated }) {
  const box = useRef(null);
  const paused = campaign.status === 'paused';
  const today = useMemo(() => kyivToday(), []);
  const draftKey = `tm-regular-draft-${data.project.id}`;
  const [v, setV] = useState({ goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: data.project.client_language || 'uk', ...extrasInitial() });
  const [title, setTitle] = useState('');
  const [sch, setSch] = useState({ mode: 'every', every: '3', days: [1, 3, 5], time: '09:00', start: today, startNow: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useDialogA11y(box, () => { if (!busy) onClose(); });
  const scheduled = sch.mode === 'every' ? Number(sch.every) >= 1 : sch.days.length > 0;
  const ready = v.goal.trim().length >= 3 && v.ratios.length > 0 && scheduled;

  async function create() {
    setBusy(true); setError('');
    try {
      const brief = { ...briefFromForm(v), given_texts: [] }; // ready texts are for a one-off task only
      const schedule = sch.mode === 'every' ? { everyDays: Number(sch.every), time: String(sch.time).trim(), ...(sch.startNow ? {} : { startDate: sch.start }) } : { weekdays: sch.days, time: String(sch.time).trim() };
      const { campaign: saved, regular } = await saveRegular(campaign.id, { enabled: true, ...(title.trim() ? { title: title.trim() } : {}), ...schedule, brief }, email);
      if (sch.startNow && !paused) { await runRegularNow(saved, regular, email); kickQueue().catch(() => {}); }
      clearTaskDraft(draftKey);
      onCreated?.(`Регулярне завдання «${regular.title}» створено: ${describeRegular(regular)}.${paused ? ' Команда на паузі: завдання запуститься, коли ви її продовжите.' : sch.startNow ? ' Перший запуск іде зараз.' : ''}`, regular.id);
    } catch (e) { setError(e?.message || 'Не вдалося створити завдання.'); setBusy(false); }
  }

  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="nr-title" tabIndex={-1}>
        <header className="tm-head"><h2 id="nr-title">Регулярне завдання: креативи</h2><button type="button" className="tm-x" onClick={onClose} disabled={busy} aria-label="Закрити">×</button></header>
        <div className="tm-body">
          <p className="tm-lead">Ще одне завдання, яке запускається за своїм розкладом, зі своїми форматами й побажаннями. Усе про клієнта агенти беруть із картки проєкту, а кожного агента цього завдання можна налаштувати окремо в його картці.</p>
          {error && <p className="pcr-error" role="alert">{error}</p>}
          {paused && <p className="tm-hint">Команда «Креативи» зараз на паузі: завдання збережеться, але почне працювати, лише коли ви продовжите команду.</p>}
          <label className="tm-fl"><span>Назва завдання (необовʼязково)</span>
            <input className="tm-sel tm-text" type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад: Бестселери щотижня" /></label>
          <TaskBrief value={v} onChange={(patch) => setV((x) => ({ ...x, ...patch }))} projectId={data.project.id} draftKey={draftKey}>
            <TaskExtras value={v} onChange={(patch) => setV((x) => ({ ...x, ...patch }))} teamLimit={creativeAutoOf(campaign).maxUsd || null} regular />
            <div className="tm-fl tm-w2"><span>Коли запускати</span>
              <ScheduleCalendar value={sch} today={today} onChange={(patch) => setSch((x) => ({ ...x, ...patch }))} />
            </div>
          </TaskBrief>
          <p className="tm-hint">Вартість роботи агентів ≈ $0.15–0.3 за кожен запуск. Картинки Higgsfield (≈ $0.2 за штуку) генеруються автоматично в межах ліміту команди.</p>
        </div>
        <footer className="tm-foot">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Скасувати</button>
          <span className="tm-foot-note" />
          <button type="button" className="btn btn-p" disabled={busy || !ready} onClick={create}>{busy ? 'Створюємо…' : 'Створити регулярне завдання'}</button>
        </footer>
      </div>
    </div>
  );
}
