import { useMemo } from 'react';
import { MAX_EVERY_DAYS } from '../../../lib/agents/campaignCycles';
import { MONTHS, SHORT_WEEKDAYS, WINDOW_MINUTES, dayMonthOf, monthCells, previewRuns, windowText } from '../../../lib/agents/scheduleCalendar';

// The schedule of a regular task as in the owner's pick (variant C, 2026-11-11): «Кожні N днів» with a first day chosen in the calendar, or the days of the week; the calendar shows
// every coming run; the time is shown as a range, because the creatives are not made in a moment.
//   value: { mode: 'every' | 'week', every, days: [1..7], time, start: 'YYYY-MM-DD', startNow }   onChange(patch)   today: 'YYYY-MM-DD' (Kyiv)
export default function ScheduleCalendar({ value, onChange, today }) {
  const runs = useMemo(() => previewRuns(value, today), [value, today]);
  const set = useMemo(() => new Set(runs), [runs]);
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const months = [[y, m], m === 11 ? [y + 1, 0] : [y, m + 1]];
  const toggleDay = (d) => onChange({ days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort((a, b) => a - b) });
  const pick = (date) => { if (value.mode === 'every' && date >= today) onChange({ start: date, startNow: false }); };

  return (
    <div className="sc">
      <div className="sc-seg" role="group" aria-label="Як часто запускати">
        {[['every', 'Кожні N днів'], ['week', 'Дні тижня']].map(([k, label]) => <button key={k} type="button" aria-pressed={value.mode === k} className={'btn' + (value.mode === k ? ' btn-p' : '')} onClick={() => onChange({ mode: k })}>{label}</button>)}
      </div>

      <div className="sc-row">
        {value.mode === 'every'
          ? <label>Кожні <input className="tm-num" type="number" min="1" max={MAX_EVERY_DAYS} value={value.every} onChange={(e) => onChange({ every: e.target.value })} aria-label="Кожні скільки днів" /> дн.</label>
          : <span className="sc-chips" role="group" aria-label="Дні тижня">{SHORT_WEEKDAYS.map((w, i) => <button key={w} type="button" aria-pressed={value.days.includes(i + 1)} className={'sc-chip' + (value.days.includes(i + 1) ? ' on' : '')} onClick={() => toggleDay(i + 1)}>{w}</button>)}</span>}
        <label>Початок о <input className="tm-time" type="time" value={value.time} onChange={(e) => onChange({ time: e.target.value })} aria-label="Час початку (Київ)" /></label>
      </div>
      {value.mode === 'every' && <p className="tm-hint">Перший день оберіть у календарі: від нього рахуються наступні запуски.</p>}

      <div className="sc-cals">
        {months.map(([yy, mm]) => (
          <div key={`${yy}-${mm}`}>
            <p className="sc-month">{MONTHS[mm]} {yy}</p>
            <div className="sc-grid" role="grid" aria-label={`${MONTHS[mm]} ${yy}`}>
              {SHORT_WEEKDAYS.map((w) => <i key={w} aria-hidden="true">{w}</i>)}
              {monthCells(yy, mm).map((c, i) => c.date === null
                ? <span key={'e' + i} className="sc-d is-empty" />
                : <button key={c.date} type="button" tabIndex={value.mode === 'every' && c.date >= today ? 0 : -1} disabled={value.mode !== 'every' || c.date < today}
                    className={'sc-d' + (c.date < today ? ' is-past' : '') + (set.has(c.date) ? ' is-run' : '') + (value.mode === 'every' && c.date === (value.startNow ? today : value.start) ? ' is-first' : '')}
                    aria-label={`${c.day} ${MONTHS[mm].toLowerCase()}${set.has(c.date) ? ', запуск' : ''}`} onClick={() => pick(c.date)}>{c.day}</button>)}
            </div>
          </div>
        ))}
      </div>

      <label className="tm-agent-on sc-now"><input type="checkbox" checked={value.startNow} onChange={(e) => onChange(e.target.checked ? { startNow: true, start: today } : { startNow: false })} />
        <span><b>Запустити перший раз одразу</b><small>Інакше перший запуск буде в обраний день{value.mode === 'week' ? ' тижня' : ''} о {value.time}.</small></span></label>

      <div className="sc-out" role="status">
        {runs.length || value.startNow
          ? <>
            <p>{runs.length ? <>Найближчі запуски: <b>{runs.slice(0, 4).map(dayMonthOf).join(', ')}</b>.</> : null}</p>
            <p>{value.startNow ? 'Перший запуск іде зараз і займає кілька хвилин. Далі креативи за розкладом' : 'Креативи'} будуть готові <b>{windowText(value.time)}</b>: вони не робляться миттєво (орієнтовно {WINDOW_MINUTES} хв).</p>
            <p>Це концепції й тексти. Картинки Higgsfield генеруються після вашого підтвердження ціни.</p>
          </>
          : <p>{value.mode === 'week' ? 'Оберіть хоча б один день тижня.' : 'Вкажіть, через скільки днів повторювати.'}</p>}
      </div>
    </div>
  );
}

