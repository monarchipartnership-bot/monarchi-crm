import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProcess, fetchReadiness, patchState, requestRun, runTickNow, startProcess } from '../../lib/api/workflow';
import { readinessOf } from '../../lib/workflow/readiness';
import { agentCards, ageText, nowCard } from '../../lib/workflow/view';
import { Pill, Stepper } from './parts';
import Preflight from './Preflight';

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

      {state && (state.brief_pending || (state.launch_paused && state.stage < 3)) && (
        <div className="wf-card" style={{ background: 'var(--wf-info-bg)', boxShadow: 'none' }}>
          <h3>Швидкий старт</h3>
          {state.brief_pending && (
            <div className="wf-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div>{hasBrief ? 'Чернетку брифу складено з сайту: перевірте її, допишіть цифри (бюджет, ROAS, середній чек) і підтвердіть. Доки бриф не підтверджено, процес не стартує.' : 'Дослідник читає сайт і складає чернетку брифу. Коли вона з’явиться, перевірте її й підтвердіть.'}</div>
              <div className="wf-row">
                <button type="button" className="wf-btn sm" onClick={() => onGo?.('brief')}>Відкрити бриф</button>
                <button type="button" className="wf-btn p sm" disabled={busy || !hasBrief} onClick={() => act(() => patchState(projectId, { brief_pending: false }, email, 'Бриф підтверджено менеджером.'))}>Підтвердити бриф</button>
              </div>
            </div>
          )}
          {state.launch_paused && state.stage < 3 && <div className="wf-muted" style={{ fontSize: 13 }}>Перший запуск піде ВИМКНЕНИМ (PAUSED): гроші не витрачаються, доки ви самі не ввімкнете кампанії в Ads Manager.</div>}
        </div>
      )}

      {state && state.stage === 0 && (
        <div className="wf-card">
          <h3>Умови старту</h3>
          <Cond ok={hasBrief} label="Бриф заповнено" action={<button type="button" className="wf-btn sm" onClick={() => onGo?.('brief')}>Відкрити бриф</button>} />
          <Cond ok={!!state.paid_at} label="Оплату підтверджено" action={<button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(() => patchState(projectId, { paid_at: state.paid_at ? null : new Date().toISOString() }, email, state.paid_at ? 'Оплату знято.' : 'Оплату підтверджено.'))}>{state.paid_at ? 'Зняти' : 'Підтвердити'}</button>} />
          <Cond ok={!!state.contracts_signed_at} label="Договори підписано" action={<button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(() => patchState(projectId, { contracts_signed_at: state.contracts_signed_at ? null : new Date().toISOString() }, email, state.contracts_signed_at ? 'Підписання договорів знято.' : 'Договори підписано.'))}>{state.contracts_signed_at ? 'Зняти' : 'Підтвердити'}</button>} />
          <Cond ok={state.has_data != null} label={state.has_data == null ? 'Дані в кабінетах: Дослідник перевірить, коли заповнено бриф' : state.has_data ? 'У кабінетах є дані: буде аудит' : 'У кабінетах немає даних: аудиту не буде'} />
        </div>
      )}

      {state && state.stage >= 3 && (
        <div className="wf-card">
          <div className="wf-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0 }}>Налаштування агентів</h3>
              <div className="wf-muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 640 }}>Розклад, ліміти витрат, дрібні дії оптимізатора ({state.auto_small_actions ? 'зараз увімкнено' : 'зараз вимкнено'}), пороги й сповіщення: усе в одному місці.</div>
            </div>
            <button type="button" className="wf-btn sm p" onClick={() => onGo?.('settings')}>Відкрити налаштування</button>
          </div>
        </div>
      )}

      {state && state.stage < 3 && <Preflight projectId={projectId} email={email} state={state} onChanged={load} />}
      {state && <Readiness projectId={projectId} email={email} />}

      <div className="wf-grid wf-g2">
        <div className="wf-card">
          <h3>Агенти</h3>
          {cards.map((a) => (
            <div key={a.key} className={'wf-ag' + (a.active ? ' run' : '')}>
              <div className="ic" aria-hidden="true">{a.short}</div>
              <div><b>{a.name}</b><p>{a.note}</p></div>
              <div className="wf-row">
                {a.rerun && <button type="button" className="wf-btn sm" disabled={busy} onClick={() => act(async () => { if (!(await requestRun(projectId, a.key, a.rerun, email))) throw new Error('Такий запуск уже в черзі або виконується.'); })} title="Запустити останню навичку ще раз, наприклад коли з'явились нові матеріали">Запустити ще раз</button>}
                <Pill tone={a.tone}>{a.status}</Pill>
              </div>
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

// «Готовність до запуску»: one button checks the cabinet of Meta, the Facebook page and the token without creating anything in the cabinet.
function Readiness({ projectId, email }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setData(await fetchReadiness(projectId)); } catch (e) { setErr(e.message || String(e)); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const view = readinessOf(data || {});
  useEffect(() => { if (!view.busy) return undefined; const t = setInterval(load, 5000); return () => clearInterval(t); }, [view.busy, load]);
  async function check(readOnly) {
    setBusy(true); setErr('');
    try { if (!(await requestRun(projectId, 'mediabuyer', 'launch_check', email, readOnly ? { read_only: true } : {}))) setErr('Перевірка вже виконується.'); await load(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="wf-card">
      <div className="wf-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Готовність до запуску</h3>
        <Pill tone={view.tone}>{view.title}</Pill>
      </div>
      <div className="wf-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Перевіряє кабінет Meta, сторінку Facebook і доступи токена. У кабінеті нічого не створюється.</div>
      {err && <div className="wf-err" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
      {view.lines.map((l, i) => <div key={i} className={'wf-rd ' + l.tone}>{l.text}</div>)}
      <div className="wf-row" style={{ marginTop: 10 }}>
        <button type="button" className="wf-btn sm p" disabled={busy || view.busy} onClick={() => check(true)}>Перевірити</button>
        <details className="wf-muted" style={{ fontSize: 12.5 }}>
          <summary>Перевірити також право запису</summary>
          <div style={{ margin: '6px 0' }}>Надсилає в Meta пробний запит у режимі «без створення»: Meta перевіряє права, але нічого не зберігає. Для своїх і тестових проєктів.</div>
          <button type="button" className="wf-btn sm" disabled={busy || view.busy} onClick={() => check(false)}>Перевірити з правом запису</button>
        </details>
      </div>
    </div>
  );
}

function Cond({ ok, label, action }) {
  return <div className="wf-cond"><Pill tone={ok ? 'ok' : 'warn'}>{ok ? 'Готово' : 'Потрібно'}</Pill><span>{label}</span>{action}</div>;
}
