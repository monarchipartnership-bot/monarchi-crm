import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { agentAction, fetchPrompts, kickQueue, nextRunOf } from '../../../lib/api/agents';
import { fetchAgentClients, fetchAgentTasks, loadDeptTeam, loadOf, restartAgent } from '../../../lib/api/deptAgents';
import { creativeRoleDef } from '../../../lib/agents/creativeTeam';
import AgentHistory from '../../Smm/AgentHistory';
import { HealthLight, healthOf } from '../../Smm/AgentCardParts';
import { AgentSwitch } from '../../Smm/SmmAgents';
import { fmtDateTime, stateOf } from '../../Smm/agentUi';
import DeptProjects from './DeptProjects';
import DeptSettings from './DeptSettings';
import '../../../styles/projectWorkspace.css'; // the confirmation window of the agent switch lives in this sheet
import '../../../styles/smmPage.css';
import '../../../styles/deptAgent.css';

const TABS = [
  { key: 'overview', label: 'Огляд' },
  { key: 'health', label: 'Здоровʼя' },
  { key: 'projects', label: 'Проєкти' },
  { key: 'settings', label: 'Налаштування' },
  { key: 'journal', label: 'Журнал' },
];
const TASK_STATUS = { queued: 'У черзі', running: 'Виконується', done: 'Готово', failed: 'Помилка', cancelled: 'Скасовано' };
export const MODE_LABEL = { auto: 'Авто', manual: 'Вручну', paused: 'Пауза' };
const secs = (s) => (s == null ? '—' : s < 90 ? `${Math.round(s)} с` : `${Math.round(s / 60)} хв`);

// The page of ONE agent of a department: a worker with a queue of clients. Tabs: Огляд (what it does now, tasks with progress, planned), Здоровʼя (status,
// load, last and next run, restart), Проєкти (its clients: mode, priority, stop/continue), Налаштування (what it knows, prompts, trial run), Журнал.
export default function DeptAgentWindow({ role, onClose, onOpenLegacy = null }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState('overview');
  const [team, setTeam] = useState(null);
  const [clients, setClients] = useState([]);
  const [data, setData] = useState({ tasks: [], progress: {} });
  const [prompts, setPrompts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  useDialogA11y(box, onClose);
  const notify = (text, isError = false) => {
    clearTimeout(timer.current);
    setToast({ text, isError });
    timer.current = setTimeout(() => setToast(null), isError ? 7000 : 4000);
  };

  const agent = team?.agents.find((a) => a.role === role) || null;
  const reload = useCallback(async () => {
    const t = await loadDeptTeam(email);
    setTeam(t);
    const a = t.agents.find((x) => x.role === role);
    if (!a) return;
    const [c, d, p] = await Promise.all([fetchAgentClients(a.id), fetchAgentTasks(a.id), fetchPrompts(a.id)]);
    setClients(c); setData(d); setPrompts(p);
  }, [email, role]);
  useEffect(() => { reload().catch((e) => notify(e.message || 'Не вдалося завантажити агента. Перевірте, що застосовано міграції 20261040 і 20261041.', true)); }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const working = data.tasks.some((t) => t.status === 'queued' || t.status === 'running');
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => { reload().catch(() => {}); }, 6000);
    return () => clearInterval(t);
  }, [working, reload]);

  const def = creativeRoleDef(role);
  const nameOf = useCallback((campaignId) => { const c = clients.find((x) => x.campaign_id === campaignId); return c ? (c.project?.name || c.campaign?.name || `Кампанія ${campaignId}`) : `Кампанія ${campaignId}`; }, [clients]);
  const load = useMemo(() => loadOf(data.tasks), [data.tasks]);
  if (!team) return createPortal(<div className="smm-overlay cmp-agentwin" data-dd="plum"><div className="smm-dialog smm-dialog--page"><p className="smm-muted">Завантаження…</p></div></div>, document.body);
  if (!agent) return null;
  const health = healthOf(agent, team);
  const state = stateOf(agent, team);
  const next = agent.enabled && agent.schedule ? nextRunOf(agent) : null;

  async function run(fn, okText) {
    setBusy(true);
    try { await fn(); if (okText) notify(okText); await reload(); } catch (e) { notify(e.message || 'Не вдалося виконати дію.', true); } finally { setBusy(false); }
  }
  const retry = (t) => run(async () => { await agentAction('retry_task', { taskId: t.id }); kickQueue().then(() => reload()).catch(() => {}); }, 'Завдання повернуто в чергу.');
  async function restart() {
    if (!(await confirm({ title: `Перезапустити «${agent.name}»?`, body: 'Завдання, що зависли, і невдалі за останні 7 днів повернуться в чергу й виконаються ще раз. Нічого не видаляється.', confirmLabel: 'Перезапустити' }))) return;
    run(async () => { const r = await restartAgent(agent.id); kickQueue().then(() => reload()).catch(() => {}); notify(r.requeued ? `Повернуто в чергу завдань: ${r.requeued}.` : 'Нічого перезапускати: завислих і невдалих завдань немає.'); });
  }

  const open = data.tasks.filter((t) => t.status === 'queued' || t.status === 'running');
  const failed = data.tasks.filter((t) => t.status === 'failed');
  const recent = data.tasks.filter((t) => t.status === 'done').slice(0, 6);
  const runningNow = data.tasks.filter((t) => t.status === 'running');
  const pct = (rid) => { const p = data.progress[rid]; return p && p.total ? Math.round((p.done / p.total) * 100) : null; };

  return createPortal(
    <div className="smm-overlay cmp-agentwin" data-dd="plum" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="smm-dialog smm-dialog--page" role="dialog" aria-modal="true" aria-label={agent.name} tabIndex={-1}>
        <button type="button" className="smm-x smm-x--corner" onClick={onClose} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        <div className="smm-page smm-window-page">
          {toast && <div className={'smm-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
          <div className="smm-agentpage">
            <div className="smm-agent-head">
              <div className="smm-agent-title">
                <h2>{agent.name}</h2>
                <HealthLight health={health} label />
              </div>
              <AgentSwitch agent={agent} team={team} onChanged={reload} notify={notify} />
              {onOpenLegacy && <button type="button" className="smm-btn" onClick={onOpenLegacy}>Ручний інструмент</button>}
            </div>
            <p className="smm-agent-desc">{def?.description || agent.description}</p>

            <div className="smm-subtabs" role="tablist" aria-label="Розділи агента">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={'smm-subtab' + (tab === t.key ? ' is-active' : '')} onClick={() => setTab(t.key)}>
                  {t.label}{t.key === 'overview' && failed.length ? <span className="smm-tab-badge smm-tab-badge--bad">{failed.length}</span> : null}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <>
                <section className="smm-block">
                  <h3>Зараз у роботі</h3>
                  {runningNow.length ? <ul className="dpt-list">{runningNow.map((t) => <li key={t.id}><b>{nameOf(t.campaign_id)}</b><span>{data.progress[t.request_id]?.title || 'завдання без запиту'}</span><span className="dpt-chip dpt-chip--work">Виконується</span></li>)}</ul>
                    : <p className="smm-muted">{agent.enabled ? 'Агент вільний: чекає нових завдань.' : 'Агента вимкнено.'}</p>}
                </section>
                <section className="smm-block">
                  <h3>Проєкти агента ({clients.length})</h3>
                  {!clients.length && <p className="smm-muted">До агента ще не підключено жодного клієнта. Клієнт підключається при створенні кампанії.</p>}
                  <ul className="dpt-list">
                    {clients.map((c) => {
                      const mine = data.tasks.filter((t) => t.campaign_id === c.campaign_id);
                      return (
                        <li key={c.id}>
                          <b>{c.project?.name || c.campaign?.name}</b>
                          <span>{c.campaign?.name}</span>
                          <span className={'dpt-chip dpt-chip--' + (!c.enabled ? 'off' : c.mode)}>{!c.enabled ? 'Вимкнено' : MODE_LABEL[c.mode]}</span>
                          <span className="smm-muted">в черзі {mine.filter((t) => t.status === 'queued').length} · виконується {mine.filter((t) => t.status === 'running').length} · готово {mine.filter((t) => t.status === 'done').length}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="smm-block">
                  <h3>Задачі в роботі</h3>
                  {!open.length && !failed.length && <p className="smm-muted">Відкритих задач немає.</p>}
                  <ul className="dpt-list">
                    {[...open, ...failed].map((t) => {
                      const p = data.progress[t.request_id];
                      return (
                        <li key={t.id} className="dpt-task">
                          <b>{nameOf(t.campaign_id)}</b>
                          <span>{p?.title || (t.request_id ? `Запит ${t.request_id}` : agent.role === 'creative_analyst' ? 'тижневий аналіз' : 'завдання без запиту')}</span>
                          <span className={'dpt-chip dpt-chip--' + (t.status === 'failed' ? 'bad' : t.status === 'running' ? 'work' : 'wait')}>{TASK_STATUS[t.status]}</span>
                          {p && (
                            <span className="dpt-progress" title={`${p.done} з ${p.total} кроків запиту`}>
                              <i style={{ width: `${pct(t.request_id) ?? 0}%` }} /><em>{p.done} з {p.total}</em>
                            </span>
                          )}
                          {t.status === 'failed' && <><span className="smm-error">{t.error}</span><button type="button" className="smm-btn" disabled={busy} onClick={() => retry(t)}>Повторити</button></>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="smm-block">
                  <h3>Заплановані</h3>
                  {next ? <p>Тижневий запуск по кожному клієнту: <b>{fmtDateTime(next.at)}</b> (Київ).</p> : <p className="smm-muted">Розкладу немає: агент працює за запитами клієнтів.</p>}
                  {load.queued > 0 && <p className="smm-muted">У черзі чекають завдань: {load.queued}.</p>}
                </section>
                {recent.length > 0 && (
                  <section className="smm-block">
                    <h3>Нещодавно виконано</h3>
                    <ul className="dpt-list">{recent.map((t) => <li key={t.id}><b>{nameOf(t.campaign_id)}</b><span>{t.summary || 'без підсумку'}</span><span className="smm-muted">{fmtDateTime(t.finished_at)}</span></li>)}</ul>
                  </section>
                )}
              </>
            )}

            {tab === 'health' && (
              <div className="dpt-cards">
                <section className="smm-block"><h3>Статус</h3><p><HealthLight health={health} label /></p><p className="smm-muted">{health.note}</p></section>
                <section className="smm-block"><h3>Стан</h3><p><b>{state.label}</b></p>{state.note && <p className="smm-muted">{state.note}</p>}</section>
                <section className="smm-block"><h3>Завантаженість</h3><p>У черзі: <b>{load.queued}</b> · виконується: <b>{load.running}</b> · помилок: <b>{load.failed}</b></p><p className="smm-muted">Середня тривалість завдання: {secs(load.avgSeconds)}. Виконано за 30 днів: {load.done30}.</p></section>
                <section className="smm-block"><h3>Останній запуск</h3><p><b>{fmtDateTime(agent.last_run_at)}</b></p>{agent.last_message && <p className="smm-muted">{agent.last_message}</p>}</section>
                <section className="smm-block"><h3>Наступний запуск</h3><p>{next ? <b>{fmtDateTime(next.at)}</b> : 'Немає розкладу: за запитами клієнтів.'}</p></section>
                <section className="smm-block"><h3>Витрати за 30 днів</h3><p><b>${load.cost30.toFixed(2)}</b></p><p className="smm-muted">Виклики моделі цього агента по всіх клієнтах.</p></section>
                <section className="smm-block dpt-wide">
                  <h3>Перезапуск</h3>
                  <p className="smm-muted">Повертає в чергу завдання, що зависли, і невдалі за останні 7 днів. Нічого не видаляє.</p>
                  <button type="button" className="smm-btn smm-btn--primary" disabled={busy} onClick={restart}>Перезапустити агента</button>
                </section>
              </div>
            )}

            {tab === 'projects' && <DeptProjects agent={agent} team={team} clients={clients} tasks={data.tasks} reload={reload} notify={notify} />}
            {tab === 'settings' && <DeptSettings agent={agent} team={team} clients={clients} prompts={prompts} reload={reload} notify={notify} />}
            {tab === 'journal' && <AgentHistory agent={agent} notify={notify} />}
          </div>
        </div>
        {confirmDialog}
      </div>
    </div>,
    document.body,
  );
}
