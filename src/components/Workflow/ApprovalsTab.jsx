import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchApprovalsOf } from '../../lib/api/workflow';
import { headlineOf, historyOf, pendingItem, roadOf } from '../../lib/workflow/approvalsTab';
import { Pill } from './parts';
import Decision from './Decision';

const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const ROAD_TONE = { current: 'warn', done: 'ok', returned: 'bad', todo: 'mute' };

// The tab «Апруви» of a project (owner's choice A, 2026-11-24): what waits for the manager now (the package with the decision), the road of the decisions of the project and the history.
export default function ApprovalsTab({ projectId, projectName, onChanged, onGo }) {
  const { email } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setData(await fetchApprovalsOf(projectId)); setErr(''); } catch (e) { setErr(e.message || String(e)); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const done = useCallback(async () => { await load(); onChanged?.(); }, [load, onChanged]);

  if (err && !data) return <div className="wf wf-page"><div className="wf-err" role="alert">{err}</div></div>;
  if (!data) return <div className="wf wf-page"><div className="wf-load">Завантаження…</div></div>;
  if (!data.state) return <div className="wf wf-page"><div className="wf-card"><h3>Апруви</h3><div className="wf-empty">Процес для проєкту ще не запущено, рішень немає. Запустіть його на вкладці «Огляд».</div></div></div>;

  const base = { projectId, state: data.state, approvals: data.approvals };
  const item = pendingItem(base);
  const head = headlineOf(item);
  const road = roadOf(base);
  const hist = historyOf(data.approvals);
  return (
    <div className="wf wf-page wf-grid wf-ap">
      <div className={'wf-now ' + (item ? 'warn' : 'mute')}>
        <div><h2>{head.title}</h2><p>{head.text}</p></div>
        {item && <button type="button" className="wf-btn" onClick={() => document.getElementById('wf-ap-decision')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{item.kind === 'client' ? 'Записати відповідь клієнта' : 'Перейти до рішення'}</button>}
      </div>

      <ol className="wf-road" aria-label="Шлях рішень проєкту">
        {road.map((r, i) => (
          <li key={r.kind} className={'wf-rs ' + r.status} aria-current={r.status === 'current' ? 'step' : undefined}>
            <span className="wf-rm" aria-hidden="true"><b>{r.status === 'done' ? '✓' : r.status === 'returned' ? '!' : i + 1}</b></span>
            <b>{r.title}</b>
            <small>{r.hint}</small>
            <Pill tone={ROAD_TONE[r.status]}>{r.status === 'todo' ? 'ще попереду' : r.note}</Pill>
            {r.at && <small>{when(r.at)}</small>}
          </li>
        ))}
      </ol>

      {item && <div id="wf-ap-decision"><Decision item={item} email={email} onDone={done} projectName={projectName} onOpenDossier={() => onGo?.('dossier', 'strategy')} /></div>}

      <div className="wf-card">
        <h3>Історія рішень</h3>
        {hist.length === 0 ? <div className="wf-empty">Рішень ще не було.</div> : (
          <div className="wf-hist">
            {hist.map((h) => (
              <div key={h.id} className="wf-hr">
                <time dateTime={h.at || undefined}>{when(h.at)}</time>
                <div>
                  <div className="wf-row"><Pill tone={h.status === 'approved' ? 'ok' : 'bad'}>{h.kind === 'client' ? (h.status === 'approved' ? 'Клієнт погодив' : 'Клієнт повернув') : `${h.title} ${h.status === 'approved' ? 'схвалено' : 'повернуто'}`}</Pill>{h.who && <b>{h.who}</b>}</div>
                  {h.comment && <p className="wf-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{h.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
