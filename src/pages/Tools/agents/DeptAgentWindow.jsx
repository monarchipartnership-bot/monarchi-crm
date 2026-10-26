import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import AgentWindowFrame from '../../../components/AgentWorkspace/AgentWindowFrame';
import { Icon, Medallion } from '../../../components/AgentWorkspace/AgentWindowParts';
import { AGENT_DEPTS } from '../../../data/aiAgentsData';
import { STATUS_TEXT } from '../aiMap/status';
import { agentAction, fetchPrompts, kickQueue, nextRunOf } from '../../../lib/api/agents';
import { fetchAgentClients, fetchAgentTasks, fetchHiggsfieldSpend, loadDeptTeam, loadOf, restartAgent } from '../../../lib/api/deptAgents';
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
  { key: 'overview', label: 'Огляд', icon: 'info' },
  { key: 'health', label: 'Здоровʼя', icon: 'pulse' },
  { key: 'projects', label: 'Проєкти', icon: 'users' },
  { key: 'settings', label: 'Налаштування', icon: 'gear' },
  { key: 'journal', label: 'Журнал', icon: 'book' },
];
const TASK_STATUS = { queued: 'У черзі', running: 'Виконується', done: 'Готово', failed: 'Помилка', cancelled: 'Скасовано' };
export const MODE_LABEL = { auto: 'Авто', manual: 'Вручну', paused: 'Пауза' };
const secs = (s) => (s == null ? '—' : s < 90 ? `${Math.round(s)} с` : `${Math.round(s / 60)} хв`);
const LADDER = [['human-led', 'Human-led', 'humanLed'], ['human-assisted', 'Human-assisted', 'humanAssisted'], ['fully-autonomous', 'Fully autonomous', 'fullyAutonomous']];

// The record of the agent in the catalogue of the map (autonomy, lifecycle status, wave, ladder, the human), found by the role of its page.
function catalogueOf(role) {
  for (const dept of Object.values(AGENT_DEPTS)) {
    for (const sc of dept.subcategories) {
      const a = sc.agents.find((x) => x.deptAgent === role);
      if (a) return { ...a, deptLabel: dept.label, subcatLabel: sc.label };
    }
  }
  return null;
}

// The page of ONE agent of a department, as a full-screen window (Hub style, variant B: navigation in a left column). Sections: Огляд (what it does now,
// tasks with progress, its place in the chain), Здоровʼя (status, load, last and next run, restart), Проєкти (its clients: mode, priority, stop/continue),
// Налаштування (what it knows, prompts, trial run), Журнал. `night`: the dark plum look (the page is dark or it is night on the map).
export default function DeptAgentWindow({ role, onClose, onOpenLegacy = null }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState('overview');
  const [team, setTeam] = useState(null);
  const [clients, setClients] = useState([]);
  const [data, setData] = useState({ tasks: [], progress: {} });
  const [prompts, setPrompts] = useState([]);
  const [spend, setSpend] = useState(null); // Higgsfield spend, only for the creative maker
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState('');
  const timer = useRef(null);
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
    if (role === 'creative_maker') setSpend(await fetchHiggsfieldSpend().catch(() => null));
  }, [email, role]);
  useEffect(() => { setLoadError(''); reload().catch((e) => setLoadError(e.message || 'Не вдалося завантажити агента. Перевірте, що застосовано міграції 20261040 і 20261041.')); }, [reload]);
  const working = data.tasks.some((t) => t.status === 'queued' || t.status === 'running');
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => { reload().catch(() => {}); }, 6000);
    return () => clearInterval(t);
  }, [working, reload]);

  const def = creativeRoleDef(role);
  const cat = useMemo(() => catalogueOf(role), [role]);
  const nameOf = useCallback((campaignId) => { const c = clients.find((x) => x.campaign_id === campaignId); return c ? (c.project?.name || c.campaign?.name || `Кампанія ${campaignId}`) : `Кампанія ${campaignId}`; }, [clients]);
  const load = useMemo(() => loadOf(data.tasks), [data.tasks]);
  // while the agent loads (or cannot be loaded) the window is still a window: it says so and can be closed
  if (!team) {
    return (
      <AgentWindowFrame label="Агент відділу" closeLabel="До відділу" eyebrow="Агент відділу" title="Завантаження…" onClose={onClose}>
        {loadError ? <p className="smm-error" role="alert">{loadError}</p> : <p className="dwa-mut">Завантаження…</p>}
      </AgentWindowFrame>
    );
  }
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
  const ringColor = health.key === 'ok' ? '#3FC77A' : health.key === 'bad' ? '#EF4D5E' : '#A7A0B0';
  const chipKind = health.key === 'ok' ? 'ok' : health.key === 'bad' ? 'bad' : '';
  const byId = new Map(team.agents.map((a) => [a.id, a]));
  const up = team.links.filter((l) => l.to_agent_id === agent.id).map((l) => ({ a: byId.get(l.from_agent_id), required: l.required })).filter((x) => x.a);
  const down = team.links.filter((l) => l.from_agent_id === agent.id).map((l) => ({ a: byId.get(l.to_agent_id), required: l.required })).filter((x) => x.a);
  const triggerText = agent.schedule?.weekday || def?.trigger === 'schedule' ? 'За розкладом' : 'За запитом';
  const current = TABS.find((t) => t.key === tab);
  const count = { overview: failed.length || null, projects: clients.length };

  const kpis = [['У черзі', load.queued, 'layers'], ['Виконується', load.running, 'play'], ['Готово за 30 днів', load.done30, 'chart'], ['Витрати за 30 днів', `$${load.cost30.toFixed(2)}`, 'pulse']];

  const about = (
    <section className="dwa-card">
      <h3>Про агента</h3>
      <p className="dwa-txt">{def?.description || agent.description}</p>
      <div className="dwa-sub-h">Місце в ланцюжку</div>
      <div className="dwa-place">
        <div><span>Отримує від</span>{up.length ? up.map(({ a, required }) => <b key={a.id} className="dwa-chip">{a.name}{required ? '' : ' (необовʼязково)'}</b>) : <em>нікого, стартує сам</em>}</div>
        <div><span>Передає далі</span>{down.length ? down.map(({ a, required }) => <b key={a.id} className="dwa-chip">{a.name}{required ? '' : ' (необовʼязково)'}</b>) : <em>це кінець ланцюжка</em>}</div>
      </div>
      {cat?.ladder && (
        <>
          <div className="dwa-sub-h">Рівень автономності</div>
          <div className="dwa-ladder">
            {LADDER.map(([lvl, label, key]) => (
              <div key={lvl} className={cat.autonomyLevel === lvl ? 'is-cur' : ''}><b>{label}</b>{cat.ladder[key]}</div>
            ))}
          </div>
        </>
      )}
      {cat?.theHuman && (<><div className="dwa-sub-h">Роль людини</div><p className="dwa-txt">{cat.theHuman}</p></>)}
    </section>
  );

  const renderOverview = () => (
    <div className="dwa-stack">
      <div className="dwa-kpis">
        {kpis.map(([label, v, ic]) => (
          <div key={label} className="dwa-kpi"><Medallion icon={ic} size={44} ring={3.5} /><span><b>{v}</b><small>{label}</small></span></div>
        ))}
      </div>
      <div className="dwa-grid2">
        <div className="dwa-stack">
          <section className="dwa-card">
            <h3>Зараз у роботі</h3>
            {runningNow.length ? (
              <ul className="dwa-rows">{runningNow.map((t) => {
                const p = data.progress[t.request_id];
                return (
                  <li key={t.id}>
                    <Medallion icon="play" size={40} ring={3.5} color="#3FC77A" />
                    <span className="dwa-r-main"><b>{nameOf(t.campaign_id)}</b><span>{p?.title || 'завдання без запиту'}</span></span>
                    {p && <><span className="dwa-bar"><i style={{ width: `${pct(t.request_id) ?? 0}%` }} /></span><span className="dwa-mut">{p.done} з {p.total}</span></>}
                  </li>
                );
              })}</ul>
            ) : <p className="dwa-mut">{agent.enabled ? 'Агент вільний: чекає нових завдань.' : 'Агента вимкнено.'}</p>}
          </section>
          <section className="dwa-card">
            <h3>Задачі <small>{open.length + failed.length ? `${open.length + failed.length} відкрито` : 'немає відкритих'}</small></h3>
            {!open.length && !failed.length ? <p className="dwa-mut">Відкритих задач немає.</p> : (
              <ul className="dwa-rows">
                {[...open, ...failed].map((t) => {
                  const p = data.progress[t.request_id];
                  return (
                    <li key={t.id}>
                      <span className="dwa-r-main"><b>{nameOf(t.campaign_id)}</b><span>{p?.title || (t.request_id ? `Запит ${t.request_id}` : agent.role === 'creative_analyst' ? 'тижневий аналіз' : 'завдання без запиту')}</span>{t.status === 'failed' && <span className="dwa-err">{t.error}</span>}</span>
                      {p && <span className="dwa-mut" title={`${p.done} з ${p.total} кроків запиту`}>{p.done} з {p.total}</span>}
                      <span className={'dwa-chip ' + (t.status === 'failed' ? 'bad' : t.status === 'running' ? 'ok' : '')}><i />{TASK_STATUS[t.status]}</span>
                      {t.status === 'failed' && <button type="button" className="dwa-btn sm" disabled={busy} onClick={() => retry(t)}>Повторити</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="dwa-card">
            <h3>Проєкти агента <small>{clients.length}</small></h3>
            {!clients.length ? <p className="dwa-mut">До агента ще не підключено жодного клієнта. Клієнт підключається при створенні кампанії.</p> : (
              <ul className="dwa-rows">
                {clients.map((c) => {
                  const mine = data.tasks.filter((t) => t.campaign_id === c.campaign_id);
                  return (
                    <li key={c.id}>
                      <Medallion icon="users" size={36} ring={3} />
                      <span className="dwa-r-main"><b>{c.project?.name || c.campaign?.name}</b><span>{c.campaign?.name} · в черзі {mine.filter((t) => t.status === 'queued').length} · виконується {mine.filter((t) => t.status === 'running').length} · готово {mine.filter((t) => t.status === 'done').length}</span></span>
                      <span className={'dwa-chip ' + (!c.enabled ? '' : c.mode === 'auto' ? 'ok' : c.mode === 'paused' ? 'warn' : '')}><i />{!c.enabled ? 'Вимкнено' : MODE_LABEL[c.mode]}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {recent.length > 0 && (
            <section className="dwa-card">
              <h3>Нещодавно виконано</h3>
              <ul className="dwa-rows">{recent.map((t) => <li key={t.id}><span className="dwa-r-main"><b>{nameOf(t.campaign_id)}</b><span>{t.summary || 'без підсумку'}</span></span><span className="dwa-mut">{fmtDateTime(t.finished_at)}</span></li>)}</ul>
            </section>
          )}
        </div>
        <div className="dwa-stack">
          {about}
          {role === 'creative_maker' && (
            <section className="dwa-card">
              <h3>Витрати Higgsfield</h3>
              {spend ? (
                <>
                  <p className="dwa-txt"><b>${spend.month.toFixed(2)}</b> за 30 днів · <b>${spend.total.toFixed(2)}</b> усього · <b>{spend.generations}</b> генерацій{spend.refunds ? `, повернено ${spend.refunds}` : ''}</p>
                  {spend.byClient.length > 0 && <ul className="dwa-rows">{spend.byClient.map((c) => <li key={c.campaignId}><span className="dwa-r-main"><b>{nameOf(c.campaignId)}</b><span>за 30 днів</span></span><b>${c.usd.toFixed(2)}</b></li>)}</ul>}
                  <p className="dwa-mut">Рахується те, що генерує система (за оцінкою Higgsfield перед запуском; відхилені картинки не оплачуються й повертаються). Ліміт на запит задається в «Налаштуваннях». Генерації, зроблені вручну в самому Higgsfield, тут не видно.</p>
                </>
              ) : <p className="dwa-mut">Обліку ще немає: застосуйте міграцію 20261044.</p>}
            </section>
          )}
          <section className="dwa-card">
            <h3>Заплановані</h3>
            {next ? <p className="dwa-txt">Тижневий запуск по кожному клієнту: <b>{fmtDateTime(next.at)}</b> (Київ).</p> : <p className="dwa-mut">Розкладу немає: агент працює за запитами клієнтів.</p>}
            {load.queued > 0 && <p className="dwa-mut">У черзі чекають завдань: {load.queued}.</p>}
          </section>
        </div>
      </div>
    </div>
  );

  const renderHealth = () => (
    <div className="dwa-tiles">
      <section className="dwa-card"><h3>Статус</h3><p className="dwa-txt"><HealthLight health={health} label /></p><p className="dwa-mut">{health.note}</p></section>
      <section className="dwa-card"><h3>Стан</h3><p className="dwa-txt"><b>{state.label}</b></p>{state.note && <p className="dwa-mut">{state.note}</p>}</section>
      <section className="dwa-card"><h3>Завантаженість</h3><p className="dwa-txt">У черзі: <b>{load.queued}</b> · виконується: <b>{load.running}</b> · помилок: <b>{load.failed}</b></p><p className="dwa-mut">Середня тривалість завдання: {secs(load.avgSeconds)}. Виконано за 30 днів: {load.done30}.</p></section>
      <section className="dwa-card"><h3>Останній запуск</h3><p className="dwa-txt"><b>{fmtDateTime(agent.last_run_at)}</b></p>{agent.last_message && <p className="dwa-mut">{agent.last_message}</p>}</section>
      <section className="dwa-card"><h3>Наступний запуск</h3><p className="dwa-txt">{next ? <b>{fmtDateTime(next.at)}</b> : 'Немає розкладу: за запитами клієнтів.'}</p></section>
      <section className="dwa-card"><h3>Витрати за 30 днів</h3><p className="dwa-txt"><b>${load.cost30.toFixed(2)}</b></p><p className="dwa-mut">Виклики моделі цього агента по всіх клієнтах.</p></section>
      {role === 'creative_maker' && <section className="dwa-card"><h3>Витрати Higgsfield</h3>{spend ? <><p className="dwa-txt"><b>${spend.month.toFixed(2)}</b> за 30 днів · <b>${spend.total.toFixed(2)}</b> усього</p><p className="dwa-mut">Генерацій: {spend.generations}{spend.refunds ? `, повернено: ${spend.refunds}` : ''}.</p></> : <p className="dwa-mut">Обліку ще немає: застосуйте міграцію 20261044.</p>}</section>}
      <section className="dwa-card dwa-wide">
        <h3>Перезапуск</h3>
        <p className="dwa-mut">Повертає в чергу завдання, що зависли, і невдалі за останні 7 днів. Нічого не видаляє.</p>
        <button type="button" className="dwa-cta" disabled={busy} onClick={restart}><Icon k="refresh" size={16} />Перезапустити агента</button>
      </section>
    </div>
  );

  return (
    <AgentWindowFrame
      label={agent.name} onClose={onClose} closeLabel="До відділу"
      who={{ name: agent.name, sub: cat ? cat.deptLabel : 'Відділ креативів', html: cat?.icon, ring: ringColor }}
      sections={TABS.map((x) => ({ key: x.key, label: x.label, icon: x.icon, count: count[x.key], bad: x.key === 'overview' }))}
      active={tab} onSection={setTab}
      eyebrow={def?.short || cat?.subcatLabel || 'Агент відділу'} title={current.label}
      headRight={(
        <>
          <span className={'dwa-chip ' + chipKind}><i />{health.label}</span>
          <AgentSwitch agent={agent} team={team} onChanged={reload} notify={notify} variant="power" />
        </>
      )}
      toast={toast && <div className={'smm-toast dwa-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
      chips={(
        <>
          {cat && <span className="dwa-chip">{LADDER.find((l) => l[0] === cat.autonomyLevel)?.[1] || cat.autonomyLevel}</span>}
          {cat && <span className="dwa-chip">{STATUS_TEXT[cat.status] || cat.status}</span>}
          {cat?.wave && <span className="dwa-chip">Хвиля {cat.wave}</span>}
          <span className="dwa-chip">{triggerText}</span>
        </>
      )}
      note={cat?.buildNotes || def?.short || agent.description}
      footer={(
        <>
          <span className="dwa-mut">{triggerText}{cat ? ` · ${cat.subcatLabel}` : ''}</span>
          <span className="dwa-foot-r">
            <button type="button" className="dwa-btn" disabled={busy} onClick={restart}><Icon k="refresh" size={15} />Перезапустити</button>
            {onOpenLegacy && <button type="button" className="dwa-cta" onClick={onOpenLegacy}>Відкрити ручний інструмент</button>}
          </span>
        </>
      )}
      extra={confirmDialog}
    >
      {tab === 'overview' && renderOverview()}
      {tab === 'health' && renderHealth()}
      {tab === 'projects' && <DeptProjects agent={agent} team={team} clients={clients} tasks={data.tasks} reload={reload} notify={notify} />}
      {tab === 'settings' && <DeptSettings agent={agent} team={team} clients={clients} prompts={prompts} reload={reload} notify={notify} />}
      {tab === 'journal' && <AgentHistory agent={agent} notify={notify} />}
    </AgentWindowFrame>
  );
}
