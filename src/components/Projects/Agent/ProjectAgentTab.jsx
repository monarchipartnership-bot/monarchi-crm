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
import { nextScheduled } from '../../../lib/agentSchedule';
import { fetchAllProfiles, profileLabel } from '../../../lib/api/profile';
import { fetchTgChats } from '../../../lib/api/siteLeads';

// «Запустити зараз» makes a draft report on request; with the switch on, the scheduler (cron, api/agent-tick.js)
// also starts the reports by the schedule from the settings. Keep false only if the cron is turned off.
export const AGENT_SCHEDULE_READY = true;
const RUN_TYPES = [{ value: 'weekly', label: 'Тижневий звіт' }, { value: 'monthly', label: 'Місячний звіт' }];

const DAYS = [[1, 'Понеділок'], [2, 'Вівторок'], [3, 'Середа'], [4, 'Четвер'], [5, 'Пʼятниця'], [6, 'Субота'], [7, 'Неділя']];
const TASKS = [
  ['weeklyReport', 'Тижневі звіти', 'Окремий звіт по кожній платформі проєкту і «Разом»: цифри з кабінетів, порівняння, стовпці та формули з «+ Метрика», текст «What was done»'],
  ['monthlyReport', 'Місячні звіти', 'Збирає місяць, включно з текстами тижневих звітів'],
  ['presentation', 'Презентації для клієнта', 'Презентація по кожній платформі зі збереженого звіту, з тими ж стовпцями та формулами'],
];

// One group of the settings: the title and a line of explanation on the left, the controls on the right.
function PagSection({ title, hint, off = false, children }) {
  return (
    <div className={'pag-sec' + (off ? ' is-off' : '')}>
      <div className="pag-sec-head">
        <h4>{title}</h4>
        {hint && <p>{hint}</p>}
      </div>
      <div className="pag-sec-body">{children}</div>
    </div>
  );
}

// A tick as a small card: the chosen ones are framed purple.
function PagOption({ checked, onChange, title, desc, disabled = false }) {
  return (
    <label className={'pag-opt' + (checked ? ' on' : '') + (disabled ? ' off' : '')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span><b>{title}</b>{desc ? <small>{desc}</small> : null}</span>
    </label>
  );
}

export const KIND_LABEL = {
  connected: 'Підключення', enabled: 'Увімкнення', disabled: 'Вимкнення', config_changed: 'Налаштування', disconnected: 'Відключення',
  run_started: 'Запуск', report_created: 'Звіт', deck_created: 'Презентація', run_finished: 'Завершення', problem: 'Проблема', telegram_sent: 'Telegram', telegram_failed: 'Telegram',
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
  if (JSON.stringify([...(before.notifyEmails || [])].sort()) !== JSON.stringify([...(after.notifyEmails || [])].sort())) out.push('кому надсилати сповіщення');
  if (!sameJson(before.telegram || {}, after.telegram || {})) out.push('Telegram-чат для звітів');
  if ((before.note || '') !== (after.note || '')) out.push('нотатка для агента');
  return out;
}

// Everyone who can be picked: the CRM users with a profile, plus anyone already chosen who has none yet.
function recipientChoices(people, chosen) {
  const known = new Map(people.map((p) => [String(p.email).toLowerCase(), { email: String(p.email).toLowerCase(), label: profileLabel(p) }]));
  (chosen || []).forEach((e) => { if (!known.has(e)) known.set(e, { email: e, label: e }); });
  return [...known.values()].sort((a, b) => a.label.localeCompare(b.label, 'uk'));
}

// «Далі: тижневий — пн 12.10 о 09:00» for every report the agent is set to make.
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
function nextRuns(config) {
  const cfg = { ...DEFAULT_AGENT_CONFIG, ...(config || {}), tasks: { ...DEFAULT_AGENT_CONFIG.tasks, ...(config?.tasks || {}) } };
  const out = [];
  [['weekly', 'weeklyReport', 'тижневий'], ['monthly', 'monthlyReport', 'місячний']].forEach(([type, task, label]) => {
    if (!cfg.tasks[task]) return;
    const n = nextScheduled(type, cfg.schedule, new Date());
    if (!n) return;
    const [, m, d] = n.date.split('-');
    const wd = WD[(new Date(n.date + 'T12:00:00Z').getUTCDay() + 6) % 7];
    out.push(`${label} — ${wd} ${d}.${m} о ${type === 'weekly' ? cfg.schedule.weeklyTime : cfg.schedule.monthlyTime}`);
  });
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
  const [people, setPeople] = useState([]); // CRM users who can be picked to get the notifications
  const [runType, setRunType] = useState('weekly');
  const [runResult, setRunResult] = useState(null);
  const [tgChats, setTgChats] = useState([]); // chats the bot has seen (the choice for «Telegram-чат»)
  const [tgTest, setTgTest] = useState({ busy: false, ok: null, msg: '' });

  const load = useCallback(async () => {
    const [{ agent: a, missing: m }, accs, ev, profiles, chats] = await Promise.all([fetchAgent(projectId), fetchProjectAccounts(projectId), fetchAgentEvents(projectId), fetchAllProfiles(), fetchTgChats()]);
    setPeople(profiles);
    setTgChats(chats);
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
    const cfg = { ...DEFAULT_AGENT_CONFIG, platforms: linked, notifyEmails: email ? [email.toLowerCase()] : [] };
    await connectAgent(projectId, cfg, email);
    await addAgentEvent({ projectId, kind: 'connected', status: 'ok', message: 'Агента підключено до проєкту (вимкнений, чекає налаштування).', createdBy: email });
  });

  const setEnabled = (on) => run('toggle', async () => {
    if (on && (!form.platforms.length || !Object.values(form.tasks).some(Boolean))) throw new Error('Перед вмиканням оберіть, що робить агент і на яких платформах.');
    if (on && dirty) throw new Error('Спершу збережіть налаштування, потім вмикайте агента.');
    if (on && form.telegram?.enabled && !form.telegram?.chatId) throw new Error('Оберіть Telegram-чат для звітів або вимкніть надсилання в Telegram.');
    if (on && form.notify && !(form.notifyEmails || []).length) throw new Error('Оберіть, кому надсилати сповіщення про готові звіти, або вимкніть сповіщення.');
    // enabled_since: the scheduler only starts reports whose scheduled moment came after the agent was switched on.
    await updateAgent(projectId, { enabled: on, enabled_since: on ? new Date().toISOString() : null, ...(on ? {} : { run_state: 'idle' }) });
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

  // A sample of the report message (marked «Тест») goes to the chosen chat, so the form and the buttons can be seen before the first real report.
  const sendTgTest = async () => {
    setTgTest({ busy: true, ok: null, msg: '' });
    try {
      const r = await authedPost('/api/project-agent-run', { action: 'telegram_test', projectId: Number(projectId), periodType: 'weekly', chatId: form.telegram?.chatId });
      setTgTest({ busy: false, ok: Boolean(r.ok), msg: r.ok ? 'Тестове повідомлення надіслано в чат.' : (r.error || 'Не вдалося надіслати.') });
    } catch (e) { setTgTest({ busy: false, ok: false, msg: e.message || 'Не вдалося надіслати.' }); }
  };

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
                ? <>Останній запуск: {fmtTime(agent.last_run_at)}{agent.enabled && nextRuns(agent.config).length > 0 && <> · Далі: {nextRuns(agent.config).join('; ')}</>}</>
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

      {/* Settings: five groups in the order the agent works — what it does, when, the presentation, who is told, the note */}
      {agent && form && (
        <section className="pag-card pag-settings">
          <div className="pag-card-head">
            <div>
              <div className="stitle">Налаштування агента</div>
              <div className="pacc-hint">Що агент робить, коли і для кого. Зміни діють після збереження.</div>
            </div>
            <div className="pag-card-actions">
              {dirty && <span className="pacc-hint">Є незбережені зміни</span>}
              {dirty && <button type="button" className="btn" onClick={() => setForm({ ...DEFAULT_AGENT_CONFIG, ...(agent.config || {}) })} disabled={busy === 'save'}>Скасувати</button>}
              <button type="button" className="btn btn-p" onClick={save} disabled={!dirty || busy === 'save'}>{busy === 'save' ? 'Зберігаємо…' : 'Зберегти'}</button>
            </div>
          </div>

          <PagSection title="Що робить агент" hint="Завдання та платформи, з яких він збирає цифри.">
            <div className="pag-opts">
              {TASKS.map(([key, title, desc]) => (
                <PagOption key={key} checked={Boolean(form.tasks[key])} onChange={(v) => setCfg({ tasks: { ...form.tasks, [key]: v } })} title={title} desc={desc} />
              ))}
              <PagOption checked={false} disabled title="Рекомендації з оптимізації кабінетів" desc="Скоро" />
            </div>
            <div className="pag-sub">Платформи</div>
            {linked.length === 0 && <div className="pacc-hint">До проєкту не підключено кабінетів. Додайте їх на вкладці «Огляд».</div>}
            <div className="pag-opts pag-opts--compact">
              {linked.map((p) => (
                <PagOption key={p} checked={form.platforms.includes(p)} onChange={() => toggleIn('platforms', p)} title={platformInfo(p).label} />
              ))}
            </div>
          </PagSection>

          <PagSection title="Розклад" hint="Час за Києвом. Агент перевіряє розклад кожні 15 хвилин, тож звіт зʼявиться в межах чверті години після вказаного часу.">
            <div className="pag-two">
              <div className={'pag-box' + (form.tasks.weeklyReport ? '' : ' is-off')}>
                <div className="pag-sub">Тижневий звіт</div>
                <div className="pacc-hint">За останній завершений тиждень</div>
                <div className="pag-row">
                  <Select value={Number(form.schedule.weeklyDay)} onChange={(v) => setCfg({ schedule: { ...form.schedule, weeklyDay: v } })} ariaLabel="День тижня" options={DAYS.map(([v, l]) => ({ value: v, label: l }))} />
                  <TimePicker value={form.schedule.weeklyTime} onChange={(v) => setCfg({ schedule: { ...form.schedule, weeklyTime: v } })} />
                </div>
                {!form.tasks.weeklyReport && <div className="pacc-hint">Тижневі звіти вимкнені вище.</div>}
              </div>
              <div className={'pag-box' + (form.tasks.monthlyReport ? '' : ' is-off')}>
                <div className="pag-sub">Місячний звіт</div>
                <div className="pacc-hint">За останній завершений місяць, день від 1 до 28</div>
                <div className="pag-row">
                  <Select value={Number(form.schedule.monthlyDay)} onChange={(v) => setCfg({ schedule: { ...form.schedule, monthlyDay: v } })} ariaLabel="День місяця" options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}-го числа` }))} />
                  <TimePicker value={form.schedule.monthlyTime} onChange={(v) => setCfg({ schedule: { ...form.schedule, monthlyTime: v } })} />
                </div>
                {!form.tasks.monthlyReport && <div className="pacc-hint">Місячні звіти вимкнені вище.</div>}
              </div>
            </div>
          </PagSection>

          <PagSection title="Презентація" hint="Як виглядають слайди, які агент готує зі звіту." off={!form.tasks.presentation}>
            <div className="pag-two">
              <div className="pag-box">
                <div className="pag-sub">Стиль</div>
                <Select value={form.deck.style} onChange={(v) => setCfg({ deck: { ...form.deck, style: v } })} ariaLabel="Стиль презентації" options={STYLES.map((s) => ({ value: s.id, label: s.name }))} />
                <div className="pacc-hint">Фон обкладинки залежить від платформи звіту.</div>
              </div>
              <div className="pag-box">
                <div className="pag-sub">Мова слайдів</div>
                <Select value={form.deck.lang} onChange={(v) => setCfg({ deck: { ...form.deck, lang: v } })} ariaLabel="Мова слайдів"
                  options={[{ value: 'en', label: 'Англійською (для клієнта)' }, { value: 'uk', label: 'Українською' }]} />
              </div>
            </div>
            {!form.tasks.presentation && <div className="pacc-hint">Презентації вимкнені вище: ці параметри нічого не змінюють.</div>}
          </PagSection>

          <PagSection title="Сповіщення" hint="Хто дізнається про готовий звіт: дзвіночок CRM і Telegram-чат. Звіт завжди зберігається як чернетка: менеджер перевіряє його, перш ніж відправити клієнту.">
            <div className="pag-opts">
              <PagOption checked={form.notify} onChange={(v) => setCfg({ notify: v })} title="Сповіщати про результат" desc="Звіт готовий або агент не зміг його створити. Сповіщення зʼявляться в загальному дзвіночку CRM." />
            </div>
            {form.notify && (
              <>
                <div className="pag-sub">Кому надсилати</div>
                <div className="pag-opts pag-opts--compact">
                  {recipientChoices(people, form.notifyEmails).map((p) => (
                    <PagOption key={p.email} checked={(form.notifyEmails || []).includes(p.email)} onChange={() => toggleIn('notifyEmails', p.email)} title={p.label} desc={p.label !== p.email ? p.email : ''} />
                  ))}
                </div>
                {!(form.notifyEmails || []).length && <div className="pacc-hint">Нікого не обрано: сповіщень не буде, а увімкнути агента не вийде.</div>}
              </>
            )}

            <div className="pag-sub">Telegram-чат</div>
            <div className="pag-opts">
              <PagOption checked={Boolean(form.telegram?.enabled)} onChange={(v) => setCfg({ telegram: { ...(form.telegram || {}), enabled: v } })} title="Надсилати звіти в Telegram" desc="Коли агент створює тижневий або місячний звіт, у чат приходить повідомлення: проєкт, дата, тип звіту, статус, потрібна дія та кнопка для переходу до звіту." />
            </div>
            {form.telegram?.enabled && (
              <div className="pag-box">
                <div className="pag-sub">Чат для цього проєкту</div>
                {tgChats.length === 0 ? (
                  <div className="pacc-hint">Бот ще не бачив жодного чату. Додайте бота в потрібний чат і напишіть там будь-що (наприклад /start), потім оновіть сторінку. Чати та бот налаштовуються в «Налаштування → Заявки з сайту».</div>
                ) : (
                  <div className="pag-row">
                    <Select value={form.telegram?.chatId || ''} onChange={(v) => setCfg({ telegram: { ...(form.telegram || {}), chatId: v } })} ariaLabel="Telegram-чат"
                      options={[{ value: '', label: 'Оберіть чат…' }, ...tgChats.map((c) => ({ value: String(c.chat_id), label: c.title || String(c.chat_id) }))]} />
                    <button type="button" className="btn" onClick={sendTgTest} disabled={!form.telegram?.chatId || dirty || tgTest.busy} title={dirty ? 'Спершу збережіть налаштування' : ''}>{tgTest.busy ? 'Надсилаємо…' : 'Надіслати тест'}</button>
                  </div>
                )}
                {form.telegram?.enabled && !form.telegram?.chatId && tgChats.length > 0 && <div className="pacc-hint">Оберіть чат, інакше повідомлення нікуди не піде.</div>}
                {tgTest.msg && <div className={tgTest.ok ? 'pacc-hint' : 'pacc-err'}>{tgTest.msg}</div>}
              </div>
            )}
          </PagSection>

          <PagSection title="Нотатка для агента" hint="Контекст проєкту, який агент враховує, коли пише текст звіту.">
            <AutoResizeTextarea value={form.note || ''} onChange={(v) => setCfg({ note: v })} placeholder="Акції, пріоритети, що не варто згадувати в звіті…" />
          </PagSection>

          <div className="pag-danger">
            <div>
              <b>Відключити агента</b>
              <div className="pacc-hint">Налаштування буде видалено, історія дій залишиться.</div>
            </div>
            <button type="button" className="btn cg-danger" onClick={disconnect} disabled={busy === 'disconnect'}>Відключити</button>
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
