import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import DatePicker from '../../components/common/DatePicker';
import Select from '../../components/common/Select';
import { agentAction, fetchPrompts, fetchServerStatus, fetchTasks, nextRunOf, setLinkRequired } from '../../lib/api/agents';
import AgentSettings, { LANGUAGE_OPTIONS } from './AgentSettings';
import AgentPrompts from './AgentPrompts';
import AgentHistory from './AgentHistory';
import AgentTasks from './AgentTasks';
import { AgentStateChip, fmtDateTime, roleMeta, stateOf } from './agentUi';
import { AgentSwitch } from './SmmAgents';
import { nextMondayYmd } from '../../lib/smmDates';
import { Dialog } from './smmCommon';

const SUBTABS = [
  { key: 'overview', label: 'Огляд' },
  { key: 'settings', label: 'Налаштування' },
  { key: 'prompts', label: 'Промти' },
  { key: 'history', label: 'Історія запитів' },
  { key: 'tasks', label: 'Завдання' },
];
const MANUAL_RUN = ['strategist', 'seo', 'competitors'];
const canRunByHand = (agent) => agent.team === 'campaign' || MANUAL_RUN.includes(agent.role);
const RUN_LABEL = { strategist: 'Скласти план тижня', seo: 'Запустити аудит сайту', competitors: 'Проаналізувати конкурентів' };
const RUN_NOTE = { strategist: 'Агент складе план і покладе його в «Чергу схвалення» чекати на ваше «ок». Це займає до хвилини.', seo: 'Агент прочитає публічні сторінки сайту (до двох хвилин). Результат зʼявиться у вкладці «Сайт».', competitors: 'Агент прочитає сайти конкурентів (до двох хвилин).' };

function RunDialog({ agent, prompts, onClose, onRun }) {
  const cfg = agent.config || {};
  const [weekStart, setWeekStart] = useState(nextMondayYmd());
  const [language, setLanguage] = useState(cfg.language || 'en');
  const [focus, setFocus] = useState(cfg.focus || '');
  const [promptId, setPromptId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await onRun(agent.role === 'strategist' ? { weekStart, language, focus, ...(promptId ? { prompt_id: Number(promptId) } : {}) } : (promptId ? { prompt_id: Number(promptId) } : {})); } catch (err) { setError(err.message || 'Не вдалося виконати.'); setBusy(false); }
  }
  return (
    <Dialog
      title={RUN_LABEL[agent.role] || 'Запустити зараз'} onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="smm-btn" onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" form="smm-run-form" className="smm-btn smm-btn--primary" disabled={busy}><ActionIcon name="generate" size={18} />{busy ? 'Працює…' : 'Запустити'}</button>
        </>
      )}
    >
      <form id="smm-run-form" className="smm-form" onSubmit={submit}>
        <p className="smm-note smm-field--wide">{RUN_NOTE[agent.role] || 'Агент прочитає дані кампанії та результати агентів, від яких залежить, і складе звіт. Це займає до двох хвилин.'}{!agent.enabled ? ' Агент вимкнений: це разовий запуск вручну, розклад він не вмикає.' : ''}</p>
        {agent.role === 'strategist' && (
          <>
            <div className="smm-field"><label>Тиждень починається (понеділок)</label><DatePicker value={weekStart} onChange={setWeekStart} /></div>
            <div className="smm-field"><label>Мова постів</label><Select value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} ariaLabel="Мова" /></div>
            <div className="smm-field smm-field--wide"><label htmlFor="smm-run-focus">Фокус тижня (необовʼязково)</label><textarea id="smm-run-focus" rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={600} /></div>
          </>
        )}
        {prompts.length > 1 && (
          <div className="smm-field smm-field--wide"><label>Який промт використати</label>
            <Select value={promptId} onChange={setPromptId} options={[{ value: '', label: 'Основний' }, ...prompts.map((p) => ({ value: String(p.id), label: p.name }))]} ariaLabel="Промт" />
          </div>
        )}
        {busy && <p className="smm-note smm-field--wide" role="status">Агент працює, не закривайте вікно.</p>}
        {error && <p className="smm-error smm-field--wide" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

function Links({ agent, team, notify, reloadTeam, open }) {
  const up = team.links.filter((l) => l.to_agent_id === agent.id);
  const down = team.links.filter((l) => l.from_agent_id === agent.id);
  const byId = new Map(team.agents.map((a) => [a.id, a]));
  async function toggle(link, required) {
    try { await setLinkRequired(link.id, required); await reloadTeam(); notify(required ? 'Звʼязок зроблено обовʼязковим: якщо агент вимкнений, цей теж зупиняється.' : 'Звʼязок необовʼязковий: агент працює й без цих даних.'); } catch (e) { notify(e.message || 'Не вдалося змінити.', true); }
  }
  const row = (link, other, direction) => (
    <li key={link.id}>
      <button type="button" className="smm-link-btn" onClick={() => open(other.role)}>{other.name}</button>
      <AgentStateChip state={stateOf(other, team)} />
      <label className="smm-check" title="Якщо агент у цьому звʼязку вимкнений, залежний від нього теж зупиняється">
        <input type="checkbox" checked={link.required} onChange={(e) => toggle(link, e.target.checked)} /> обовʼязковий
      </label>
    </li>
  );
  return (
    <div className="smm-rep-grid">
      <div className="smm-rep-sec">
        <h5>Отримує завдання й дані від</h5>
        {up.length ? <ul className="smm-linklist">{up.map((l) => row(l, byId.get(l.from_agent_id), 'up'))}</ul> : <p className="smm-muted">Нікого: стартує за розкладом або вручну.</p>}
      </div>
      <div className="smm-rep-sec">
        <h5>Передає далі</h5>
        {down.length ? <ul className="smm-linklist">{down.map((l) => row(l, byId.get(l.to_agent_id), 'down'))}</ul> : <p className="smm-muted">Нікому: це кінець ланцюжка.</p>}
      </div>
    </div>
  );
}

export default function AgentPage({ role, team, posts, notify, reloadTeam, reloadAll, back, open, go, kick }) {
  const agent = team.agents.find((a) => a.role === role);
  const [sub, setSub] = useState('overview');
  const [prompts, setPrompts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [running, setRunning] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const headRef = useRef(null);

  const loadMine = useCallback(async () => {
    if (!agent) return;
    const [p, t] = await Promise.all([fetchPrompts(agent.id), fetchTasks(agent.id, 60)]);
    setPrompts(p); setTasks(t);
  }, [agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => { headRef.current?.focus(); }, [role]);
  useEffect(() => { if (role === 'visual') fetchServerStatus().then(setServerStatus).catch(() => setServerStatus(null)); }, [role]);

  const st = agent ? stateOf(agent, team) : null;
  const month = Date.now() - 30 * 86400000;
  const cost30 = useMemo(() => tasks.filter((t) => new Date(t.created_at).getTime() >= month).reduce((s, t) => s + Number(t.cost_usd || 0), 0), [tasks, month]);
  if (!agent) return <p className="smm-muted">Агента не знайдено. <button type="button" className="smm-link-btn" onClick={back}>До команди</button></p>;
  const meta = roleMeta(role);
  const next = agent.enabled ? nextRunOf(agent) : null;
  const queued = tasks.filter((t) => t.status === 'queued' || t.status === 'running').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;

  async function run(brief) {
    setRunning(true);
    try {
      const r = await agentAction('run_agent', { agentId: agent.id, brief });
      setDialog(false);
      if (r.status === 'failed') notify(r.error || 'Агент не зміг виконати завдання.', true);
      else notify(role === 'strategist' ? 'План готовий і чекає на ваше «ок» у черзі схвалення.' : 'Готово. Звіт у вкладці «Завдання».');
      await Promise.all([reloadAll(), loadMine()]);
      if (r.queue?.left) kick();
    } finally { setRunning(false); }
  }

  return (
    <div className="smm-agentpage">
      <div className="smm-agent-head">
        <button type="button" className="smm-btn" onClick={back}><ActionIcon name="back" size={18} />Команда</button>
        <div className="smm-agent-title">
          <h2 ref={headRef} tabIndex={-1}>{agent.name}</h2>
          <AgentStateChip state={st} />
        </div>
        <AgentSwitch agent={agent} team={team} onChanged={async () => { await reloadTeam(); }} notify={notify} />
      </div>

      <div className="smm-subtabs" role="tablist" aria-label="Розділи агента">
        {SUBTABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={sub === t.key} className={'smm-subtab' + (sub === t.key ? ' is-active' : '')} onClick={() => setSub(t.key)}>
            {t.label}{t.key === 'tasks' && failed ? <span className="smm-tab-badge smm-tab-badge--bad">{failed}</span> : null}
          </button>
        ))}
      </div>

      {sub === 'overview' && (
        <>
          {st.key === 'blocked' && <p className="smm-warn-banner" role="status">Агент зупинено, бо вимкнено «{st.blockedBy.name}», від якого він залежить. Його завдання чекають у черзі й продовжаться, щойно ви увімкнете «{st.blockedBy.name}».</p>}
          {st.key === 'wait' && <p className="smm-warn-banner" role="status">{meta.readyNote} Поки цього немає, агент не може працювати, але його промт і налаштування вже можна готувати.</p>}
          {role === 'visual' && serverStatus && !serverStatus.higgsfield && <p className="smm-warn-banner" role="status">Ключі Higgsfield ще не додані на сервері, тому агент пише промти, але не запускає генерацію. Щоб підключити, додайте HF_API_KEY_ID і HF_API_KEY_SECRET у Vercel (Settings, Environment Variables) і перезапустіть розгортання. Ключі ніколи не вводяться в чат чи на сторінку.</p>}
          {role === 'visual' && serverStatus?.higgsfield && <p className="smm-note">Higgsfield підключено: після промту зображення або відео генерується автоматично й зберігається в нашому сховищі.</p>}
          <p className="smm-agent-desc">{agent.description}</p>
          <div className="smm-stats">
            <div className="smm-stat"><b>{agent.last_run_at ? fmtDateTime(agent.last_run_at) : '—'}</b><span>останній запуск{agent.last_status === 'problem' ? ' (з помилкою)' : ''}</span></div>
            <div className="smm-stat"><b>{next ? fmtDateTime(next.at.toISOString()) : agent.schedule ? 'вимкнено' : 'за завданнями'}</b><span>наступний запуск за розкладом</span></div>
            <div className="smm-stat"><b>{queued}{failed ? ` + ${failed} ⚠` : ''}</b><span>у черзі{failed ? ' + помилки' : ''}</span></div>
            <div className="smm-stat"><b>${cost30.toFixed(2)}</b><span>витрати за 30 днів</span></div>
          </div>
          {agent.last_message && <p className={'smm-last' + (agent.last_status === 'problem' ? ' smm-bad' : '')}>{agent.last_message}</p>}
          {canRunByHand(agent) && meta.ready && (
            <div className="smm-form-foot">
              <button type="button" className="smm-btn smm-btn--primary" onClick={() => (role === 'strategist' || prompts.length > 1 ? setDialog(true) : run({}).catch((e) => notify(e.message || 'Не вдалося виконати.', true)))} disabled={running}><ActionIcon name="generate" size={18} />{running ? 'Працює…' : RUN_LABEL[role] || 'Запустити зараз'}</button>
              {running && <span className="smm-muted">Не закривайте сторінку, це займає до двох хвилин.</span>}
            </div>
          )}
          <section className="smm-block"><h3>Звʼязки в ланцюжку</h3><Links agent={agent} team={team} notify={notify} reloadTeam={reloadTeam} open={open} /></section>
          {role === 'strategist' && <p className="smm-muted">План, який складає стратег, чекає у <button type="button" className="smm-link-btn" onClick={() => go('queue')}>черзі схвалення</button>. Після вашого «ок» стратег ставить завдання копірайтеру й візуал-агенту.</p>}
        </>
      )}
      {sub === 'settings' && <AgentSettings agent={agent} notify={notify} reload={reloadTeam} />}
      {sub === 'prompts' && <AgentPrompts agent={agent} prompts={prompts} reload={loadMine} notify={notify} />}
      {sub === 'history' && <AgentHistory agent={agent} notify={notify} />}
      {sub === 'tasks' && <AgentTasks agent={agent} team={team} tasks={tasks} posts={posts} reload={async () => { await Promise.all([loadMine(), reloadTeam()]); }} notify={notify} kick={kick} />}

      {dialog && <RunDialog agent={agent} prompts={prompts} onClose={() => setDialog(false)} onRun={run} />}
    </div>
  );
}
