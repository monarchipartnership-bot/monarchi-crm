import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProcess, patchState, requestRun, runTickNow, startProcess } from '../../lib/api/workflow';
import { agentCards, ageText, nowCard } from '../../lib/workflow/view';
import { Pill, Stepper } from './parts';

// «Огляд» of a project (screen 1 of step A3, the variant B of the mockup): the card «Зараз» first, then the stages, the five agents and the journal.
export default function ProcessOverview({ projectId, onGo }) {
  const { email } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await fetchProcess(projectId)); setErr(''); } catch (e) { setErr(e.message || String(e)); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function act(fn) { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } }

  if (err && !data) return <div className="wf wf-page"><div className="wf-err" role="alert">{err}</div></div>;
  if (!data) return <div className="wf wf-page"><div className="wf-load">Завантаження…</div></div>;

  const { state, runs, approvals, journal, sections } = data;
  const hasBrief = !!sections.find((s) => s.key === 'brief')?.current_version_id;
  const now = nowCard({ state, runs, approvals, hasBrief, journal });
  const cards = agentCards(runs);
  const mainAction = {
    start: () => act(() => startProcess(projectId, email)),
    resume: () => act(() => patchState(projectId, { paused: false, paused_reason: null }, email, 'Паузу знято.')),
    decide: () => onGo?.('approvals'), // the decisions live in the tab «Апруви» (owner's choice A, 2026-11-24)
    signoff: () => onGo?.('approvals'),
    dossier: () => onGo?.('dossier'),
    tasks: () => onGo?.('tasks'),
  }[now.action];
  const actionLabel = { start: 'Запустити процес', resume: 'Зняти паузу', decide: 'Відкрити «Апруви»', signoff: 'Відкрити «Апруви»', tasks: 'Відкрити задачі', dossier: 'Відкрити Досьє' }[now.action];

  return (
    <div className="wf wf-page wf-grid">
      {err && <div className="wf-err" role="alert">{err}</div>}
      <div className={'wf-now ' + now.tone}>
        <div><h2>{now.title}</h2><p>{now.text}</p></div>
        {now.rerun && <button type="button" className="wf-btn" disabled={busy} onClick={() => act(async () => { if (!(await requestRun(projectId, now.rerun.agent, now.rerun.skill, email))) throw new Error('Такий запуск уже в черзі або виконується.'); })} title="Спершу виправте причину зупинки, потім запустіть крок вручну">Запустити ще раз</button>}
        {mainAction && <button type="button" className="wf-btn" disabled={busy} onClick={mainAction}>{actionLabel}</button>}
      </div>

      {state && (
        <div className="wf-card">
          <div className="wf-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Етап процесу</h3>
            <div className="wf-row">
              <button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(runTickNow)} title="Оркестратор виконує один прохід: планує та запускає кроки">Виконати крок зараз</button>
              {!state.paused && <button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(() => patchState(projectId, { paused: true, paused_reason: 'Поставлено на паузу вручну' }, email, 'Проєкт поставлено на паузу.'))}>Пауза</button>}
            </div>
          </div>
          <Stepper stage={state.stage} />
        </div>
      )}

      {state && state.stage === 0 && (
        <div className="wf-card">
          <h3>Умови старту</h3>
          <Cond ok={hasBrief} label="Бриф заповнено" action={<button type="button" className="wf-btn sm" onClick={() => onGo?.('dossier', 'brief')}>Відкрити бриф</button>} />
          <Cond ok={!!state.paid_at} label="Оплату підтверджено" action={<button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(() => patchState(projectId, { paid_at: state.paid_at ? null : new Date().toISOString() }, email, state.paid_at ? 'Оплату знято.' : 'Оплату підтверджено.'))}>{state.paid_at ? 'Зняти' : 'Підтвердити'}</button>} />
          <Cond ok={!!state.contracts_signed_at} label="Договори підписано" action={<button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(() => patchState(projectId, { contracts_signed_at: state.contracts_signed_at ? null : new Date().toISOString() }, email, state.contracts_signed_at ? 'Підписання договорів знято.' : 'Договори підписано.'))}>{state.contracts_signed_at ? 'Зняти' : 'Підтвердити'}</button>} />
          <Cond ok={state.has_data != null} label={state.has_data == null ? 'Дані в кабінетах: Дослідник перевірить, коли заповнено бриф' : state.has_data ? 'У кабінетах є дані: буде аудит' : 'У кабінетах немає даних: аудиту не буде'} />
        </div>
      )}

      <div className="wf-grid wf-g2">
        <div className="wf-card">
          <h3>Агенти</h3>
          {cards.map((a) => (
            <div key={a.key} className={'wf-ag' + (a.active ? ' run' : '')}>
              <div className="ic" aria-hidden="true">{a.short}</div>
              <div><b>{a.name}</b><p>{a.note}</p></div>
              <Pill tone={a.tone}>{a.status}</Pill>
            </div>
          ))}
        </div>
        <div className="wf-card">
          <h3>Журнал проєкту</h3>
          {journal.length === 0 ? <div className="wf-empty">Записів ще немає.</div> : (
            <div className="wf-j">{journal.map((j) => <div key={j.id}><time dateTime={j.at} title={new Date(j.at).toLocaleString('uk-UA')}>{ageText(j.at)}</time><span>{j.summary}</span></div>)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cond({ ok, label, action }) {
  return <div className="wf-cond"><Pill tone={ok ? 'ok' : 'warn'}>{ok ? 'Готово' : 'Потрібно'}</Pill><span>{label}</span>{action}</div>;
}
