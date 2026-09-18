import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LeaveCard from '../../components/Team/LeaveCard';
import { fetchLeaveForMonth, fetchProfilesByEmails } from '../../lib/api/leaveRequests';
import { MONTH_NAMES, daysInMonth, isoDate, todayIso } from '../../lib/dateHelpers';
import { LEAVE_TYPES, leaveTypeInfo } from '../../lib/leaveTypes';
import '../../styles/reportPage.css';
import '../../styles/teamPage.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// Monday-start grid for the month — leading `null`s pad out to the first
// real day so the weekday columns line up.
function buildCells(year, month) {
  const total = daysInMonth(year, month);
  const dow = new Date(year, month - 1, 1).getDay();
  const leading = dow === 0 ? 6 : dow - 1;
  const cells = Array(leading).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  return cells;
}

function initialPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function TeamCalendar() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(initialPeriod);
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setErrorMsg('');
    (async () => {
      try {
        const monthStart = isoDate(period.year, period.month, 1);
        const monthEnd = isoDate(period.year, period.month, daysInMonth(period.year, period.month));
        const data = await fetchLeaveForMonth(monthStart, monthEnd);
        if (cancelled) return;
        setRows(data);
        setProfiles(await fetchProfilesByEmails(data.map((r) => r.email)));
      } catch (e) {
        if (cancelled) return;
        console.warn('loadTeamCalendar failed', e);
        setErrorMsg('Не вдалося завантажити календар. Можливо, таблицю ще не створено в Supabase.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [period.year, period.month]);

  const monthStart = isoDate(period.year, period.month, 1);
  const monthEnd = isoDate(period.year, period.month, daysInMonth(period.year, period.month));
  const today = todayIso();

  const dotsByDay = {};
  rows.forEach((r) => {
    const from = r.date_start < monthStart ? monthStart : r.date_start;
    const to = r.date_end > monthEnd ? monthEnd : r.date_end;
    const typeKey = leaveTypeInfo(r.type).key;
    for (let d = new Date(from); isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()) <= to; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      (dotsByDay[day] ||= new Set()).add(typeKey);
    }
  });
  const usedTypes = LEAVE_TYPES.filter((t) => rows.some((r) => leaveTypeInfo(r.type).key === t.key));

  return (
    <div className="report-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
        <div className="sp" />
        <Link className="btn btn-p" to="/account">Подати заявку на відпустку &#8594;</Link>
      </div>

      <section className="rpt-hero">
        <h1>Team Calendar</h1>
        <p className="sub">Хто з команди у відпустці чи на лікарняному — доступно всім. Подати власну заявку можна у «Мій кабінет».</p>
      </section>

      <section className="report-section">
        <div className="cal-toolbar">
          <div className="pk-field">
            <label>Рік</label>
            <select value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: +e.target.value }))}>
              {[period.year - 1, period.year, period.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="pk-field">
            <label>Місяць</label>
            <select value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: +e.target.value }))}>
              {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>
        </div>

        <div className="teamcal-grid-wrap">
          <div className="mini-cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="mini-cal-dow">{w}</div>)}
            {buildCells(period.year, period.month).map((d, i) => {
              if (d === null) return <div key={`b${i}`} className="mini-cal-cell mini-cal-cell--blank" />;
              const iso = isoDate(period.year, period.month, d);
              const dots = dotsByDay[d];
              return (
                <div key={d} className={'mini-cal-cell' + (iso === today ? ' is-today' : '')}>
                  <span>{d}</span>
                  {dots && (
                    <span className="mini-cal-dots">
                      {[...dots].map((key) => (
                        <span key={key} className="mini-cal-dot" style={{ background: leaveTypeInfo(key).color }} />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {usedTypes.length > 0 && (
            <div className="mini-cal-legend">
              {usedTypes.map((t) => (
                <span key={t.key}><span className="mini-cal-dot" style={{ background: t.color }} />{t.label}</span>
              ))}
            </div>
          )}
        </div>

        <div className="leave-list">
          {!loaded ? null : errorMsg ? (
            <div className="leave-empty">{errorMsg}</div>
          ) : !rows.length ? (
            <div className="leave-empty">На цей місяць нікого немає у відпустці чи на лікарняному.</div>
          ) : (
            rows.map((row) => <LeaveCard key={row.id} row={row} profile={profiles[row.email]} />)
          )}
        </div>
      </section>
    </div>
  );
}
