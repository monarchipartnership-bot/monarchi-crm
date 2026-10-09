import { useCallback, useEffect, useMemo, useState } from 'react';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
import { DEFAULT_AGENT_CONFIG, addAgentEvent, connectAgent, disconnectAgent, fetchAgent, fetchAgentEvents, updateAgent } from '../../../lib/api/projectAgents';
import { STYLES } from '../../../lib/presentation/deckModel';
import { platformInfo } from '../../../lib/adAccounts';
import { useConfirm } from '../../common/ConfirmDialog';
import '../../../styles/projectAgent.css';
import Select from '../../common/Select';
import TimePicker from '../../common/TimePicker';
import { authedPost } from '../../../lib/adAccounts';

// «Запустити зараз» works (the agent makes a draft report and presentation on request). While this is false the
// agent does not yet start by itself on the schedule from the settings. Flip it when the scheduler is live.
export const AGENT_SCHEDULE_READY = false;
const RUN_TYPES = [{ value: 'weekly', label: 'Тижневий звіт' }, { value: 'monthly', label: 'Місячний звіт' }];

const DAYS = [[1, 'Понеділок'], [2, 'Вівторок'], [3, 'Середа'], [4, 'Четвер'], [5, 'Пʼятниця'], [6, 'Субота'], [7, 'Неділя']];
const TASKS = [
  ['weeklyReport', 'Тижневі звіти', 'Цифри з кабінетів, порівняння, текст «What was done»'],
  ['monthlyReport', 'Місячні звіти', 'Збирає місяць, включно з текстами тижневих звітів'],
  ['presentation', 'Презентації для клієнта', 'Створює презентацію зі збереженого звіту'],
];

export const KIND_LABEL = {
  connected: 'Підключення', enabled: 'Увімкнення', disabled: 'Вимкнення', config_changed: 'Налаштування', disconnected: 'Відключення',
  run_started: 'Запуск', report_created: 'Звіт', deck_created: 'Презентація', run_finished: 'Завершення', problem: 'Проблема',
};

function statusOf(agent) {
  if (!agent) return { key: 'none', label: 'Не підключено', tone: 'muted' };
  if (!agent.enabled) return { key: 'off', label: 'Вимкнено', tone: 'muted' };
  if (agent.run_state === 'running') return { key: 'running', label: 'Працює зараз', tone: 'ok' };
  return { key: 'on', label: 'Активний', tone: 'ok' };
}

function healthOf(agent) {
  if (!agent) return null;
  if (agent.health === 'problem') return { label: 'Є проблеми', tone: 'bad' };
  if (agent.health === 'ok') return { label: 'Проблем немає', tone: 'ok' };
  return { label: 'Ще не запускався', tone: 'muted' };
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA') : '—');
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function describeChanges(before, after) {
  const out = [];
  if (!sameJson(before.tasks, after.tasks)) out.push('що робить агент');
  if (!sameJson(before.platforms, after.platforms)) out.push('платформи');
  if (!sameJson(before.deck, after.deck)) out.push('стиль і мова презентації');
  if (!sameJson(before.schedule, after.schedule)) out.push('розклад');
  if (before.notify !== after.notify) out.push('сповіщення');
  if ((before.note || '') !== (after.note || '')) out.push('нотатка для агента');
  return out;
}

export default function ProjectAgentTab({ projectId }) {
  const [confirm, confirmDialog] = useConfirm();
  const { email } = useAuth();
  const [agent, setAgent] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [runType, setRunType] = useState('weekly');
  const [runResult, setRunResult] = useState(null);

  const load = useCallback(async () => {
    const [{ agent: a, missing: m }, accs, ev] = await Promise.all([fetchAgent(projectId), fetchProjectAccounts(projectId), fetchAgentEvents(projectId)]);
    setAgent(a);
    setMissing(m);
    setAccounts(accs);
    setEvents(ev);
    setForm(a ? { ...DEFAULT_AGENT_CONFIG, ...(a.config || {}) } : null);
    setLoaded(true);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const linked = useMemo(() => [...new Set(accounts.map((a) => a.platform))], [accounts]);
  const status = statusOf(agent);
  const health = healthOf(agent);
  const dirty = Boolean(agent && form && !sameJson(form, { ...DEFAULT_AGENT_CONFIG, ...(agent.config || {}) }));

  const setCfg = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));

  async function run(name, fn) {
    setBusy(name);
    setMessage('');
    try { await fn(); await load(); } catch (e) { setMessage(e.message || 'Не вдалося виконати дію.'); } finally { setBusy(''); }
  }

  const connect = () => run('connect', async () => {
    const cfg = { ...DEFAULT_AGENT_CONFIG, platforms: linked };
    await connectAgent(projectId, cfg, email);
    await addAgentEvent({ projectId, kind: 'connected', status: 'ok', message: 'Агента підключено до проєкту (вимкнений, чекає налаштування).', createdBy: email });
  });

  const setEnabled = (on) => run('toggle', async () => {
    if (on && (!form.platforms.length || !Object.values(form.tasks).some(Boolean))) throw new Error('Перед вмиканням оберіть, що робить агент і на яких платформах.');
    if (on && dirty) throw new Error('Спершу збережіть налаштування, потім вмикайте агента.');
    await updateAgent(projectId, { enabled: on, ...(on ? {} : { run_state: 'idle' }) });
    await addAgentEvent({ projectId, kind: on ? 'enabled' : 'disabled', status: 'info', message: on ? 'Агента ввімкнено.' : 'Агента вимкнено.', createdBy: email });
  });

  const save = () => run('save', async () => {
    const changed = describeChanges(agent.config || {}, form);
    await updateAgent(projectId, { config: form });
    await addAgentEvent({ projectId, kind: 'config_changed', status: 'info', message: changed.length ? `Змінено налаштування: ${changed.join(', ')}.` : 'Налаштування збережено.', details: { changed }, createdBy: email });
  });

  // The agent works as its own user on the server and answers when it is done (up to a few minutes).
  const runNow = () => run('run', async () => {
    if (dirty) throw new Error('Спершу збережіть налаштування, потім запускайте агента.');
    setRunResult(null);
    const res = await authedPost('/api/project-agent-run', { projectId: Number(projectId), periodType: runType });
    setRunResult(res);
  });

  const disconnect = async () => {
    if (!(await confirm({ title: 'Відключити агента?', body: 'Відключити агента від проєкту? Налаштування буде видалено, історія дій залишиться.', confirmLabel: 'Відключити', danger: true }))) return;
    run('disconnect', async () => {
      await disconnectAgent(projectId);
      await addAgentEvent({ projectId, kind: 'disconnected', status: 'info', message: 'Агента відключено від проєкту.', createdBy: email });
    });
  };

  const shown = events.filter((e) => (filter === 'all' ? true : filter === 'problem' ? e.status === 'problem' : filter === 'agent' ? e.actor === 'agent' : e.actor === 'user'));

  if (!loaded) return <div className="empty-hint">Завантаження...</div>;

  return (
    <div className="pag-wrap">
      {missing && (
        <div className="prep-internal-note" role="note">
          <b>Потрібна міграція.</b> У базі ще немає таблиць агента: застосуйте <code>20261010000000_project_agents.sql</code>, і вкладка запрацює повністю.
        </div>
      )}

      {/* Status */}
      <section className="pag-card pag-status">
        <div className="pag-status-main">
          <span className={'pag-dot pag-dot--' + status.tone} aria-hidden="true" />
          <div>
            <div className="pag-status-title">AI-агент · <b>{status.label}</b></div>
            <div className="pag-status-sub">
              {agent
                ? <>Останній запуск: {fmtTime(agent.last_run_at)}</>
                : 'Агент допоможе робити тижневі й місячні звіти та презентації для цього проєкту.'}
            </div>
          </div>
        </div>
        <div className="pag-status-side">
          {health && <span className={'pacc-pill pacc-pill--' + health.tone}>{health.label}</span>}
          {agent && (
            <label className="pag-switch" title={agent.enabled ? 'Вимкнути агента' : 'Увімкнути агента'}>
              <input type="checkbox" role="switch" checked={agent.enabled} disabled={busy === 'toggle'} onChange={(e) => setEnabled(e.target.checked)} aria-label="Агент увімкнено" />
              <span className="pag-switch-track"><span className="pag-switch-knob" /></span>
              <span className="pag-switch-label">{agent.enabled ? 'Увімкнено' : 'Вимкнено'}</span>
            </label>
          )}
          {!agent && <button type="button" className="btn btn-p" onClick={connect} disabled={busy === 'connect' || missing}>{busy === 'connect' ? 'Підключаємо…' : 'Підключити агента'}</button>}
        </div>
        {agent?.health === 'problem' && agent.last_error && <div className="pacc-err pag-error">Остання помилка: {agent.last_error}</div>}
        {agent && (
          <div className="pag-run">
            <div className="pag-run-head">Запустити зараз</div>
            <div className="pag-run-row">
              <Select value={runType} onChange={setRunType} ariaLabel="Який звіт зробити" options={RUN_TYPES} />
              <button type="button" className="btn btn-p" onClick={runNow} disabled={busy === 'run' || missing}>{busy === 'run' ? 'Агент працює…' : 'Створити чернетку'}</button>
            </div>
            <div className="pacc-hint">Агент збере цифри з кабінетів за останній завершений період, напише текст і підготує презентацію. Усе зберігається як чернетка: ви перевіряєте її у вкладках звітів і презентацій.</div>
            {busy === 'run' && <div className="pacc-hint">Це може тривати до хвилини-двох: агент читає кабінети й історію змін.</div>}
            {runResult && (
              <div className={'pag-run-result pag-run-result--' + runResult.status} role="status">
                <b>{runResult.status === 'ok' ? 'Готово' : runResult.status === 'skipped' ? 'Пропущено' : 'Не вдалося'}.</b> {runResult.message}
                {runResult.costUsd > 0 && <span className="pacc-hint"> Вартість запуску: ≈ ${Number(runResult.costUsd).toFixed(3)}.</span>}
                {runResult.notes?.length > 0 && <ul>{runResult.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
        {!AGENT_SCHEDULE_READY && (
          <div className="pacc-hint pag-hint">Запуск за розкладом ще не ввімкнено: поки агент працює лише за кнопкою «Створити чернетку». Перемикач і розклад збережуться й почнуть діяти, коли запуск за розкладом буде ввімкнено.</div>
        )}
        {message && <div className="pacc-err pag-error">{message}</div>}
      </section>

      {/* Settings */}
      {agent && form && (
        <section className="pag-card">
          <div className="pag-card-head">
            <div className="stitle">Налаштування агента</div>
            <div className="pag-card-actions">
              {dirty && <span className="pacc-hint">Є незбережені зміни</span>}
              <button type="button" className="btn btn-p" onClick={save} disabled={!dirty || busy === 'save'}>{busy === 'save' ? '...' : 'Зберегти'}</button>
              <button type="button" className="btn" onClick={disconnect} disabled={busy === 'disconnect'}>Відключити агента</button>
            </div>
          </div>

          <div className="pag-grid">
            <div className="pag-field pag-field--wide">
              <div className="pag-label">Що робить агент</div>
              <div className="pag-checks">
                {TASKS.map(([key, title, desc]) => (
                  <label className="pag-check" key={key}>
                    <input type="checkbox" checked={Boolean(form.tasks[key])} onChange={(e) => setCfg({ tasks: { ...form.tasks, [key]: e.target.checked } })} />
                    <span><b>{title}</b><small>{desc}</small></span>
                  </label>
                ))}
                <label className="pag-check pag-check--soon">
                  <input type="checkbox" disabled />
                  <span><b>Рекомендації з оптимізації кабінетів</b><small>Скоро</small></span>
                </label>
              </div>
            </div>

            <div className="pag-field">
              <div className="pag-label">Платформи</div>
              {linked.length === 0 && <div className="pacc-hint">До проєкту не підключено кабінетів. Додайте їх на вкладці «Огляд».</div>}
              <div className="pag-checks">
                {linked.map((p) => (
                  <label className="pag-check" key={p}>
                    <input type="checkbox" checked={form.platforms.includes(p)} onChange={() => toggleIn('platforms', p)} />
                    <span><b>{platformInfo(p).label}</b></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pag-field">
              <div className="pag-label">Презентація</div>
              <div className="pag-stack">
                <Select value={form.deck.style} onChange={(v) => setCfg({ deck: { ...form.deck, style: v } })} ariaLabel="Стиль презентації" options={STYLES.map((s) => ({ value: s.id, label: s.name }))} />
                <Select value={form.deck.lang} onChange={(v) => setCfg({ deck: { ...form.deck, lang: v } })} ariaLabel="Мова слайдів"
                  options={[{ value: 'en', label: 'Слайди англійською (для клієнта)' }, { value: 'uk', label: 'Слайди українською' }]} />
                <span className="pacc-hint">Фон обкладинки залежить від платформи звіту.</span>
              </div>
            </div>

            <div className="pag-field">
              <div className="pag-label">Розклад: тижневий звіт</div>
              <div className="pag-row">
                <Select value={Number(form.schedule.weeklyDay)} onChange={(v) => setCfg({ schedule: { ...form.schedule, weeklyDay: v } })} ariaLabel="День тижня" options={DAYS.map(([v, l]) => ({ value: v, label: l }))} />
                <TimePicker value={form.schedule.weeklyTime} onChange={(v) => setCfg({ schedule: { ...form.schedule, weeklyTime: v } })} />
              </div>
            </div>

            <div className="pag-field">
              <div className="pag-label">Розклад: місячний звіт</div>
              <div className="pag-row">
                <Select value={Number(form.schedule.monthlyDay)} onChange={(v) => setCfg({ schedule: { ...form.schedule, monthlyDay: v } })} ariaLabel="День місяця" options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}-го числа` }))} />
                <TimePicker value={form.schedule.monthlyTime} onChange={(v) => setCfg({ schedule: { ...form.schedule, monthlyTime: v } })} />
              </div>
            </div>

            <div className="pag-field pag-field--wide">
              <div className="pag-label">Після створення</div>
              <div className="pag-checks">
                <label className="pag-check">
                  <input type="checkbox" checked disabled />
                  <span><b>Звіт зберігається як чернетка</b><small>Менеджер перевіряє його, перш ніж відправити клієнту</small></span>
                </label>
                <label className="pag-check">
                  <input type="checkbox" checked={form.notify} onChange={(e) => setCfg({ notify: e.target.checked })} />
                  <span><b>Сповістити менеджера, що звіт готовий</b></span>
                </label>
              </div>
            </div>

            <div className="pag-field pag-field--wide">
              <div className="pag-label">Нотатка для агента</div>
              <AutoResizeTextarea value={form.note || ''} onChange={(v) => setCfg({ note: v })} placeholder="Контекст проєкту: акції, пріоритети, що не варто згадувати в звіті…" />
            </div>
          </div>
        </section>
      )}

      {/* History */}
      <section className="pag-card">
        <div className="pag-card-head">
          <div className="stitle">Історія дій</div>
          <div className="pag-card-actions">
            <div className="proj-tabs" role="tablist" aria-label="Фільтр історії">
              {[['all', 'Усе'], ['problem', 'Проблеми'], ['agent', 'Агент'], ['user', 'Менеджери']].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={'proj-tab' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <button type="button" className="btn" onClick={load}>Оновити</button>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="empty-hint">{events.length === 0 ? 'Дій ще немає. Тут зʼявляться підключення, налаштування та всі запуски агента.' : 'За цим фільтром нічого немає.'}</div>
        ) : (
          <ul className="pag-history">
            {shown.map((e) => (
              <li key={e.id} className={'pag-event pag-event--' + e.status}>
                <span className={'pag-dot pag-dot--' + (e.status === 'problem' ? 'bad' : e.status === 'ok' ? 'ok' : 'muted')} aria-hidden="true" />
                <div className="pag-event-body">
                  <div className="pag-event-msg">{e.message}</div>
                  <div className="pag-event-meta">
                    <span className="pag-kind">{KIND_LABEL[e.kind] || e.kind}</span>
                    <span>{e.actor === 'agent' ? 'AI-агент' : (e.created_by || 'Менеджер')}</span>
                    <span>{fmtTime(e.created_at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmDialog}
    </div>
  );
}
