import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSpendData } from '../../lib/api/workflow';
import { monthLabel, monthsOffered, spendReport } from '../../lib/workflow/spendStats';
import { money } from '../../lib/workflow/overview';
import { ageText } from '../../lib/workflow/view';

// The window «Витрати» of the AI Agents section (restored 2026-11-24, on the new data): what the agents cost this month against the limits, by project, agent, skill and day,
// the model apart from the pictures, and the other spend of the AI in the CRM. The limits themselves are changed in «Огляд проєктів».
function Bar({ pct, hot }) { return <div className={'wf-bar' + (hot ? ' hot' : '')} role="img" aria-label={`${pct}%`}><i style={{ width: pct + '%' }} /></div>; }

// the spend by day: one bar per day of the month, drawn to one scale (the labels are the real values: 0, the half and the top of the scale)
function DayChart({ rep }) {
  const W = 720, H = 150, PAD = 30, bw = (W - PAD) / rep.perDay.length;
  const max = Math.max(0.01, ...rep.perDay.map((d) => d.spent));
  const y = (v) => H - 22 - (v / max) * (H - 36);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Витрати агентів по днях місяця" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={PAD} x2={W} y1={y(max * t)} y2={y(max * t)} stroke="var(--wf-line)" /><text x={PAD - 4} y={y(max * t) + 4} textAnchor="end" fontSize="10" fill="var(--wf-muted)">{money(max * t)}</text></g>)}
      {rep.perDay.map((d, i) => (
        <g key={d.date}>
          <rect x={PAD + i * bw + 2} y={y(d.spent)} width={Math.max(2, bw - 4)} height={Math.max(0, H - 22 - y(d.spent))} rx="2" fill={d.future ? 'var(--wf-line)' : 'var(--wf-orchid)'}><title>{`${d.date}: ${money(d.spent)}`}</title></rect>
          {(d.day === 1 || d.day % 5 === 0) && <text x={PAD + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--wf-muted)">{d.day}</text>}
        </g>
      ))}
    </svg>
  );
}

export default function Spend({ onOpen }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [month, setMonth] = useState(monthsOffered()[0]);
  const load = useCallback(async () => { try { setData(await fetchSpendData()); setErr(''); } catch (e) { setErr(e.message || String(e)); } }, []);
  useEffect(() => { load(); }, [load]);
  const rep = useMemo(() => (data ? spendReport({ ...data, month }) : null), [data, month]);

  if (err && !data) return <div className="wf wf-page"><div className="wf-err" role="alert">{err}</div></div>;
  if (!rep) return <div className="wf wf-page"><div className="wf-load">Завантаження…</div></div>;
  const maxAgent = Math.max(0.0001, ...rep.perAgent.map((a) => a.spent));
  return (
    <div className="wf wf-page wf-grid wf-sp">
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-row" role="group" aria-label="Місяць">
          {monthsOffered().map((m) => <button key={m} type="button" className="wf-fb" aria-pressed={m === month} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}
        </div>
        {onOpen && <button type="button" className="wf-btn sm" onClick={() => onOpen('overview')}>Змінити ліміти</button>}
      </div>

      <div className="wf-card">
        <div className="wf-ov-nums">
          <div className={'wf-ov-num' + (rep.hot ? ' hot' : '')}><b>{money(rep.spent)}</b><span>витрачено агентами{rep.cap != null ? ` з ${money(rep.cap)}` : ''}</span></div>
          {rep.forecast != null && <div className="wf-ov-num"><b>{money(rep.forecast)}</b><span>прогноз на місяць</span></div>}
          <div className="wf-ov-num"><b>{money(rep.modelCost)}</b><span>модель</span></div>
          <div className="wf-ov-num"><b>{money(rep.picturesCost)}</b><span>картинки</span></div>
          <div className="wf-ov-num"><b>{rep.runs}</b><span>прогонів</span></div>
        </div>
        {rep.cap != null && <div style={{ maxWidth: 420, marginTop: 10 }}><div className="wf-muted" style={{ fontSize: 12.5 }}>Загальний ліміт місяця {money(rep.cap)}: використано {rep.pct}%</div><Bar pct={rep.pct} hot={rep.hot} /></div>}
      </div>

      <div className="wf-card"><h3>По днях</h3><DayChart rep={rep} /></div>

      <div className="wf-grid wf-g2">
        <div className="wf-card">
          <h3>По проєктах</h3>
          {rep.perProject.length === 0 ? <div className="wf-empty">Цього місяця витрат немає.</div> : rep.perProject.map((p) => (
            <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--wf-line)' }}>
              <div className="wf-row" style={{ justifyContent: 'space-between' }}><b>{p.name}</b><span>{money(p.spent)}{p.cap != null ? <span className="wf-muted"> з {money(p.cap)}{p.ownCap != null ? ' (власний)' : ''}</span> : null}</span></div>
              {p.cap != null && <Bar pct={p.pct} hot={p.hot} />}
              <div className="wf-muted" style={{ fontSize: 12 }}>прогонів {p.runs}</div>
            </div>
          ))}
        </div>
        <div className="wf-card">
          <h3>По агентах</h3>
          {rep.perAgent.map((a) => (
            <div key={a.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--wf-line)' }}>
              <div className="wf-row" style={{ justifyContent: 'space-between' }}><b>{a.name}</b><span>{money(a.spent)} <span className="wf-muted">· прогонів {a.runs}{a.failed ? `, помилок ${a.failed}` : ''}</span></span></div>
              <Bar pct={Math.round((a.spent / maxAgent) * 100)} />
            </div>
          ))}
        </div>
      </div>

      <div className="wf-grid wf-g2">
        <div className="wf-card">
          <h3>Найдорожчі навички</h3>
          {rep.perSkill.length === 0 ? <div className="wf-empty">Немає даних.</div> : (
            <div className="wf-tblwrap"><table className="wf-tbl"><thead><tr><th>Навичка</th><th>Прогонів</th><th>Витрати</th></tr></thead><tbody>{rep.perSkill.map((s) => <tr key={s.key}><td>{s.label}</td><td>{s.runs}</td><td>{money(s.spent)}</td></tr>)}</tbody></table></div>
          )}
        </div>
        <div className="wf-card">
          <h3>Найдорожчі прогони</h3>
          {rep.topRuns.length === 0 ? <div className="wf-empty">Немає даних.</div> : rep.topRuns.map((r) => <div key={r.id} className="wf-ag" style={{ padding: '6px 0' }}><div><b>{r.project}</b><p>{r.label} · {ageText(r.at)} тому</p></div><span>{money(r.cost)}</span></div>)}
        </div>
      </div>

      <div className="wf-card">
        <h3>Інші витрати ШІ в CRM</h3>
        {rep.other.length === 0 ? <div className="wf-empty">Інших витрат цього місяця немає.</div> : (
          <>
            <div className="wf-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Це не робота п’яти агентів (агент звітів проєкту, старі креативні агенти): разом {money(rep.otherTotal)}.</div>
            {rep.other.map((o) => <div key={o.label} className="wf-ag" style={{ padding: '6px 0' }}><div><b>{o.label}</b><p>викликів моделі {o.calls}</p></div><span>{money(o.spent)}</span></div>)}
          </>
        )}
      </div>
    </div>
  );
}
