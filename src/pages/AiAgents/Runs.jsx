import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchRunSteps, fetchRunsList, requestRun } from '../../lib/api/workflow';
import { STATUS_FILTERS, filterRuns, runCounts, runRows } from '../../lib/workflow/runsView';
import { money } from '../../lib/workflow/overview';
import { AGENTS, ageText } from '../../lib/workflow/view';
import { Pill } from '../../components/Workflow/parts';

// The window «Прогони» of the AI Agents section: one journal of all the runs of all projects with the reason of a failure and «Запустити ще раз».
// A row opens the steps of the run. The launch is never started again from here (it has its own road: Апрув 2 and the card of the stopped process).
export default function Runs() {
  const { email } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('all');
  const [agent, setAgent] = useState('');
  const [project, setProject] = useState('');
  const [sel, setSel] = useState(null);
  const [steps, setSteps] = useState(null);
  const load = useCallback(async () => { try { setData(await fetchRunsList()); setErr(''); } catch (e) { setErr(e.message || String(e)); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const rows = useMemo(() => (data ? runRows(data) : []), [data]);
  const counts = useMemo(() => runCounts(rows), [rows]);
  const shown = useMemo(() => filterRuns(rows, { status, agent, project }), [rows, status, agent, project]);
  const projects = useMemo(() => [...new Map(rows.map((r) => [r.projectId, r.project])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'uk')), [rows]);
  const chosen = rows.find((r) => r.id === sel) || null;
  useEffect(() => { setSteps(null); if (!sel) return undefined; let on = true; fetchRunSteps(sel).then((s) => { if (on) setSteps(s); }).catch(() => { if (on) setSteps([]); }); return () => { on = false; }; }, [sel]);

  async function again(r) {
    setBusy(true); setNote('');
    try { setNote((await requestRun(r.projectId, r.agent, r.skill, email)) ? `Запит надіслано: «${r.label}» для «${r.project}» запуститься на найближчому проході оркестратора.` : 'Такий запуск уже в черзі або виконується.'); await load(); } catch (e) { setNote(e.message || String(e)); } finally { setBusy(false); }
  }

  if (err && !data) return <div className="wf wf-page"><div className="wf-err" role="alert">{err}</div></div>;
  if (!data) return <div className="wf wf-page"><div className="wf-load">Завантаження…</div></div>;
  return (
    <div className="wf wf-page wf-grid wf-ru">
      {err && <div className="wf-err" role="alert">{err}</div>}
      {note && <div className="wf-okb" role="status">{note}</div>}
      <div className="wf-row" role="group" aria-label="Фільтри">
        {STATUS_FILTERS.map(([k, label]) => <button key={k} type="button" className="wf-fb" aria-pressed={status === k} onClick={() => setStatus(k)}>{label} · {counts[k]}</button>)}
        <label className="wf-muted" style={{ fontSize: 12.5 }}>Агент <select className="wf-inp" style={{ width: 150 }} value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Усі</option>{AGENTS.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
        <label className="wf-muted" style={{ fontSize: 12.5 }}>Проєкт <select className="wf-inp" style={{ width: 190 }} value={project} onChange={(e) => setProject(e.target.value)}><option value="">Усі</option>{projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      </div>
      <div className="wf-card">
        {shown.length === 0 ? <div className="wf-empty">У цьому фільтрі прогонів немає.</div> : (
          <div className="wf-tblwrap">
            <table className="wf-tbl">
              <thead><tr><th>Коли</th><th>Проєкт</th><th>Агент · навичка</th><th>Стан</th><th>Тривалість</th><th>Витрати</th><th /></tr></thead>
              <tbody>
                {shown.slice(0, 200).map((r) => (
                  <tr key={r.id} className={'wf-tr' + (sel === r.id ? ' sel' : '')} tabIndex={0} aria-selected={sel === r.id} onClick={() => setSel(sel === r.id ? null : r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(sel === r.id ? null : r.id); } }}>
                    <td title={new Date(r.at).toLocaleString('uk-UA')}>{ageText(r.at)} тому</td>
                    <td>{r.project}</td>
                    <td>{r.agentName} · {r.label}{r.manual && <span className="wf-muted"> (вручну)</span>}</td>
                    <td><Pill tone={r.tone}>{r.statusLabel}</Pill></td>
                    <td className="wf-muted">{r.duration}</td>
                    <td>{r.cost > 0 ? money(r.cost) : ''}</td>
                    <td>{r.canRerun && <button type="button" className="wf-btn sm" disabled={busy} onClick={(e) => { e.stopPropagation(); again(r); }}>Запустити ще раз</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {chosen && (
        <div className="wf-card wf-ov-drawer">
          <div className="wf-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{chosen.agentName} · {chosen.label} · {chosen.project}</h3><Pill tone={chosen.tone}>{chosen.statusLabel}</Pill></div>
          {chosen.error && <div className="wf-err" style={{ marginTop: 8 }}>{chosen.error}</div>}
          <h3 style={{ marginTop: 12 }}>Кроки</h3>
          {steps === null ? <div className="wf-load">Завантаження…</div> : steps.length === 0 ? <div className="wf-empty">Кроків не записано.</div> : steps.map((s) => <div key={s.n} className={'wf-rd ' + (s.status === 'info' ? 'info' : s.status === 'failed' ? 'bad' : '')}>{s.title}</div>)}
          <div className="wf-row" style={{ marginTop: 12 }}>
            <button type="button" className="wf-btn sm p" onClick={() => nav(`/projects/${chosen.projectId}?tab=process`)}>Відкрити проєкт</button>
            {chosen.canRerun && <button type="button" className="wf-btn sm" disabled={busy} onClick={() => again(chosen)}>Запустити ще раз</button>}
          </div>
        </div>
      )}
    </div>
  );
}
