import { useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { saveInput } from '../../../lib/api/projectCreative';
import { launchTeam } from '../../../lib/api/teams';
import { CREATIVE_OPTIONAL, DEFAULT_CONCEPTS, TEXT_MODES, creativeRoleDef } from '../../../lib/agents/creativeTeam';
import { MAX_EVERY_DAYS, WEEKDAYS, cleanSchedule, describeSchedule } from '../../../lib/agents/campaignCycles';
import { cleanRegular, kyivToday } from '../../../lib/agents/operationCycles';
import ScheduleCalendar from './ScheduleCalendar';
import { TeamRing } from './teamsUi';
import Select from '../../common/Select';
import '../../../styles/projectTeamsLaunch.css';
import TaskBrief, { clearTaskDraft } from './TaskBrief';
import { languageLabel } from '../../../lib/agents/languages';
import { dayMonthOf, windowText } from '../../../lib/agents/scheduleCalendar';
import { TEAMS, estimateMonthly, teamAgentPlan, teamReadiness, teamsOf, describePlanSchedule } from '../../../lib/agents/teams';

const STEPS = ['Команди', 'Перевірка', 'Налаштування', 'Запуск'];
const SCHED_MODES = [{ value: 'every', label: 'Кожні N днів' }, { value: 'week', label: 'Щотижня' }, { value: 'manual', label: 'Лише вручну' }];
const WEEKDAY_OPTIONS = WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }));
const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}-го числа` }));
const PLATFORM = { meta: 'Meta', google: 'Google', tiktok: 'TikTok' };
const STATUS_TEXT = { ready: ['Усе готово', 'is-ok'], warn: ['Можна запускати, є бажане', 'is-wait'], blocked: ['Треба дозаповнити', 'is-old'] };
const clip = (v, n) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// the regular task of the creative team (launching the team IS making it): its schedule and its brief from the fields of the step of the settings
const taskSchedule = (p) => (p.mode === 'every' ? { everyDays: Number(p.every), time: String(p.time).trim(), ...(p.startNow ? {} : { startDate: p.start }) } : { weekdays: p.days, time: String(p.time).trim() });
const taskBrief = (p) => ({ goal: p.goal, count: Number(p.count), ratios: p.ratios, texts: p.texts, language: p.language });
const rowSchedule = (r) => (r.mode === 'every' ? { everyDays: Number(r.every), time: r.time } : r.mode === 'week' ? { weekday: Number(r.weekday), time: r.time } : null);

// One missing field of the card in the window of the check: written right here (it goes to the card of the project, the only place where it lives) or opened in the card.
function Missing({ item, level, value, open, saving, onOpen, onChange, onSave, onGo }) {
  return (
    <li className={'tm-miss is-' + level}>
      <div className="tm-miss-top">
        <span className="tm-miss-name"><b>{item.label}</b><em>{level === 'required' ? 'обовʼязково' : 'бажано'}</em></span>
        <small>потрібно: {item.agents.join(', ')}</small>
        {open ? null : (item.inline
          ? <button type="button" className="btn" onClick={onOpen}>Заповнити</button>
          : <button type="button" className="btn" onClick={() => onGo(item.where)}>Відкрити в картці</button>)}
      </div>
      {open && (
        <div className="tm-miss-edit">
          <textarea className="tm-area" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${item.label}: напишіть коротко й конкретно`} aria-label={item.label} autoFocus />
          <div className="tm-miss-acts">
            <button type="button" className="btn btn-p" disabled={saving || !value.trim()} onClick={onSave}>{saving ? 'Зберігаємо…' : 'Зберегти в картку проєкту'}</button>
            <button type="button" className="btn" disabled={saving} onClick={onOpen}>Скасувати</button>
          </div>
        </div>
      )}
    </li>
  );
}

// The launch of a team in four steps (owner, 2026-11-11): 1 which teams · 2 the check of what is filled and of the accesses · 3 the settings of the agents ·
// 4 the summary with the price and the launch.
//   data: lib/api/teams.js fetchTeamsData   reload(): reads it again (after a field was saved)   onGoFill(section): opens that section of the card
export default function LaunchTeamWizard({ data, reload, email, onClose, onGoFill, onLaunched }) {
  const box = useRef(null);
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState(() => new Set());
  const [plans, setPlans] = useState({});
  const [cap, setCap] = useState('20');
  const [edit, setEdit] = useState(null); // { key, text } of the field written in the check
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(null); // the team shown in the step of the settings
  const today = useMemo(() => kyivToday(), []);
  const draftKey = `tm-goal-draft-${data.project.id}`; // the draft of the description of the creative task (kept by TaskBrief)
  useDialogA11y(box, () => { if (!launching) onClose(); });

  const view = useMemo(() => teamsOf({ campaigns: data.campaigns, agent: data.agent }), [data]);
  const order = TEAMS.map((t) => t.key).filter((k) => picked.has(k));
  const ready = useMemo(() => Object.fromEntries(order.map((k) => [k, teamReadiness(k, { settings: data.settings, assets: data.assets, accounts: data.accounts, project: data.project })])), [order.join(), data]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = order.filter((k) => !ready[k].ok);
  const goal = clip(data.settings?.inputs?.goals?.body, 160);

  function initPlans() {
    setPlans((cur) => {
      const next = { ...cur };
      order.forEach((k) => {
        if (next[k]) return;
        if (k === 'analytics') next[k] = { rows: teamAgentPlan('analytics', data.accounts).map((p) => ({ ...p, enabled: true, mode: p.schedule?.everyDays ? 'every' : p.schedule?.weekday ? 'week' : p.runsAfter ? 'chain' : 'manual', every: p.schedule?.everyDays || 3, weekday: p.schedule?.weekday || 1, time: p.schedule?.time || '09:00' })) };
        if (k === 'creative') next[k] = { optional: new Set(CREATIVE_OPTIONAL), plan: teamAgentPlan('creative'), title: '', goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: data.project.client_language || 'uk', mode: 'every', every: '3', days: [1, 3, 5], time: '09:00', start: today, startNow: true, maxUsd: '3' };
        if (k === 'reports') next[k] = { weekly: true, weekday: 1, time: '09:00', monthly: true, mday: 1, mtime: '09:00', presentation: true };
      });
      return next;
    });
    setTab((t) => (order.includes(t) ? t : order[0]));
  }
  const patchPlan = (k, patch) => setPlans((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  const patchRow = (role, patch) => setPlans((p) => ({ ...p, analytics: { ...p.analytics, rows: p.analytics.rows.map((r) => (r.role === role ? { ...r, ...patch } : r)) } }));

  // what is checked when the person goes on from the step of the settings
  function validate() {
    for (const k of order) {
      if (k === 'analytics') for (const r of plans[k].rows.filter((x) => x.enabled && ['every', 'week'].includes(x.mode))) { try { cleanSchedule(rowSchedule(r)); } catch (e) { return `${r.name}: ${e.message}`; } }
      if (k === 'creative') { try { cleanRegular({ ...taskSchedule(plans[k]), brief: taskBrief(plans[k]) }, {}); } catch (e) { return `Креативи: ${e.message}`; } }
      if (k === 'reports') {
        const p = plans[k];
        if (!p.weekly && !p.monthly) return 'Звіти: оберіть хоча б один звіт, тижневий або місячний.';
        if (p.weekly && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(p.time).trim())) return 'Звіти: час тижневого звіту має бути у форматі ГГ:ХХ.';
        if (p.monthly && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(p.mtime).trim())) return 'Звіти: час місячного звіту має бути у форматі ГГ:ХХ.';
      }
    }
    return '';
  }
  const estimates = order.map((k) => {
    const p = plans[k];
    if (!p) return { key: k, usd: 0, text: '' };
    let sch = null;
    if (k === 'creative') sch = p.mode === 'every' ? { everyDays: Number(p.every) || 0 } : { weekdays: p.days };
    const e = k === 'analytics' ? estimateMonthly('analytics', p.rows.map((r) => ({ ...r, schedule: rowSchedule(r) }))) : k === 'creative' ? estimateMonthly('creative', [{ schedule: sch }]) : estimateMonthly(k);
    return { key: k, ...e };
  });
  const total = Math.round(estimates.reduce((s, e) => s + (e.usd || 0), 0) * 100) / 100;

  function go(next) {
    setError('');
    if (next === 3) initPlans();
    if (next === 4) { const bad = validate(); if (bad) { setError(bad); return; } }
    setStep(next);
  }
  async function saveField(item) {
    setSaving(true); setError('');
    try { await saveInput(data.project.id, item.key, edit.text, email); setEdit(null); await reload(); } catch (e) { setError(e?.message || 'Не вдалося зберегти поле.'); } finally { setSaving(false); }
  }

  async function launch() {
    setLaunching(true); setError('');
    const done = [];
    try {
      for (const k of order) {
        const p = plans[k];
        const title = TEAMS.find((t) => t.key === k).title;
        const res = await launchTeam({
          teamKey: k, project: data.project, accounts: data.accounts, existing: data.campaigns, goals: goal, email,
          plan: k === 'analytics' ? p.rows.map((r) => ({ role: r.role, enabled: r.enabled, schedule: rowSchedule(r) })) : [],
          optional: k === 'creative' ? [...p.optional] : [],
          creativeTask: k === 'creative' ? { title: clip(p.title, 100), brief: { ...taskBrief(p), agent_settings: { creative_maker: { max_usd: String(Number(String(p.maxUsd).replace(',', '.')) || 3) } } }, schedule: taskSchedule(p), startNow: p.startNow, autoGenerate: true } : null, // the limit of the pictures is a setting of THIS task (the agent «креативщик»)
          capUsd: k !== 'reports' && Number(String(cap).replace(',', '.')) > 0 ? Number(String(cap).replace(',', '.')) : null,
          reports: k === 'reports' ? { weekly: p.weekly ? { weekday: Number(p.weekday), time: p.time.trim() } : null, monthly: p.monthly ? { day: Number(p.mday), time: p.mtime.trim() } : null, tasks: { presentation: p.presentation } } : null,
        });
        done.push({ key: k, title, campaignId: res.campaignId || null, startError: res.startError || '' });
      }
      clearTaskDraft(draftKey);
      await onLaunched(done);
    } catch (e) {
      setError(`${done.length ? `Уже запущено: ${done.map((d) => d.title).join(', ')}. ` : ''}${e?.message || 'Не вдалося запустити команду.'}`);
      if (done.length) await reload();
      setLaunching(false);
    }
  }

  const canNext = step === 1 ? picked.size > 0 : step === 2 ? blocked.length === 0 : true;
  // the agents of a team for the tile of the first step (the first three and «+N»)
  const agentNames = (k) => (k === 'reports' ? ['Агент звітів'] : teamAgentPlan(k, data.accounts).map((a) => a.name));
  const sumChips = (k, p) => {
    if (k === 'analytics') return p.rows.filter((r) => r.enabled).map((r) => `${r.name}: ${r.runsAfter ? 'після інших' : describePlanSchedule(rowSchedule(r)) || 'вручну'}`);
    if (k === 'creative') return [describeSchedule(p.mode === 'every' ? { everyDays: Number(p.every), time: p.time } : { weekdays: p.days, time: p.time }) || 'за розкладом', `напрямів: ${p.count}`, `формати: ${p.ratios.join(', ') || '1:1'}`, `тексти: ${TEXT_MODES[p.texts].toLowerCase()}`, `мова клієнта: ${languageLabel(p.language)}`, `перший запуск ${p.startNow ? 'одразу' : `${p.mode === 'every' ? dayMonthOf(p.start) : 'за розкладом'} о ${p.time}`}`, `готово ${windowText(p.time)}`, `агентів: ${p.plan.filter((a) => !a.optional || p.optional.has(a.role)).length}`];
    return [p.weekly && `тижневий: ${WEEKDAYS[p.weekday - 1]} о ${p.time}`, p.monthly && `місячний: ${p.mday}-го о ${p.mtime}`, p.presentation && 'презентації для клієнта'].filter(Boolean);
  };
  return (
    <div className="tml" data-dd="night" role="presentation">
      <div ref={box} className="tml-win" role="dialog" aria-modal="true" aria-labelledby="tm-title" tabIndex={-1}>
        <header className="tml-head">
          <h2 id="tm-title"><TeamRing name="users" size={36} />Запуск AI команди</h2>
          <button type="button" className="tml-x" onClick={onClose} disabled={launching} aria-label="Закрити">×</button>
        </header>
        <ol className="tml-rail" aria-label="Кроки запуску">
          {STEPS.map((label, i) => <li key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}><span className="tml-m">{step > i + 1 ? '✓' : i + 1}</span>{label}</li>)}
        </ol>

        <div className="tml-body">
          <div className="tml-in">
            {error && <p className="pcr-error" role="alert">{error}</p>}

            {step === 1 && (
              <>
                <p className="tm-lead">Оберіть команди, які мають працювати для цього клієнта. Можна одну, кілька або всі.</p>
                <div className="tml-tiles" role="group" aria-label="Команди">
                  {TEAMS.map((def) => {
                    const st = view.teams.find((t) => t.key === def.key);
                    const taken = st.state !== 'none';
                    const on = picked.has(def.key);
                    const names = agentNames(def.key);
                    return (
                      <button key={def.key} type="button" className={'tml-tile' + (on ? ' on' : '') + (taken ? ' is-taken' : '')} disabled={taken} aria-pressed={on}
                        onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(def.key)) n.delete(def.key); else n.add(def.key); return n; })}>
                        <span className="tml-tick" aria-hidden="true">{on ? '✓' : ''}</span>
                        <TeamRing name={def.key} size={48} />
                        <b>{def.title}</b>
                        <small>{def.text.split('. ')[0].replace(/\.$/, '')}.</small>
                        <span className="tml-mini">{names.slice(0, 3).map((n) => <span key={n}>{n}</span>)}{names.length > 3 && <span>+{names.length - 3}</span>}</span>
                        {taken && <em>{st.state === 'running' ? 'вже працює' : 'вже запущена, зараз зупинена'}</em>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="tm-lead">Перевіряємо, чи заповнено все, що потрібно саме цим командам, і чи є доступи. Обовʼязкове треба заповнити, бажане можна пропустити.</p>
                {order.map((k) => {
                  const def = TEAMS.find((t) => t.key === k);
                  const r = ready[k];
                  const [text, tone] = STATUS_TEXT[r.status];
                  return (
                    <section key={k} className="tml-sec">
                      <div className="tml-sec-h"><TeamRing name={k} size={32} /><h3>{def.title}</h3><span className={'pcr-state ' + tone}>{text}</span></div>
                      <ul className="tm-access">
                        {k !== 'creative' && <li className={data.accounts.length ? 'ok' : 'bad'}>Рекламні кабінети: {data.accounts.length ? data.accounts.map((a) => `${PLATFORM[a.platform] || a.platform}${a.account_name ? ` «${a.account_name}»` : ''}`).join(', ') + ' підключено' : 'жодного не підключено'}</li>}
                        {k === 'creative' && <li className={data.project.website ? 'ok' : 'warn'}>Сайт клієнта: {data.project.website || 'не вказано'}</li>}
                      </ul>
                      {r.status === 'ready' && <p className="tm-ok">Усе, що потрібно цій команді, заповнено.</p>}
                      <ul className="tm-miss-list">
                        {r.required.map((x) => <Missing key={x.key} item={x} level="required" open={edit?.key === x.key} value={edit?.key === x.key ? edit.text : ''} saving={saving}
                          onOpen={() => setEdit(edit?.key === x.key ? null : { key: x.key, text: '' })} onChange={(t) => setEdit({ key: x.key, text: t })} onSave={() => saveField(x)} onGo={onGoFill} />)}
                        {r.recommended.map((x) => <Missing key={x.key} item={x} level="recommended" open={edit?.key === x.key} value={edit?.key === x.key ? edit.text : ''} saving={saving}
                          onOpen={() => setEdit(edit?.key === x.key ? null : { key: x.key, text: '' })} onChange={(t) => setEdit({ key: x.key, text: t })} onSave={() => saveField(x)} onGo={onGoFill} />)}
                      </ul>
                    </section>
                  );
                })}
              </>
            )}

            {step === 3 && tab && plans[tab] && (
              <>
                <p className="tm-lead">Розклад і режим роботи агентів. Усе можна змінити й після запуску.</p>
                {order.length > 1 && <div className="tml-caps" role="tablist" aria-label="Команда">{order.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{TEAMS.find((t) => t.key === k).title}</button>)}</div>}

                {tab === 'analytics' && (
                  <ul className="tm-agents">
                    {plans.analytics.rows.map((r) => (
                      <li key={r.role} className={'tm-agent' + (r.enabled ? '' : ' is-off')}>
                        <label className="tm-agent-on"><input type="checkbox" checked={r.enabled} onChange={(e) => patchRow(r.role, { enabled: e.target.checked })} aria-label={`Увімкнути: ${r.name}`} /><span><b>{r.name}</b><small>{r.short}</small></span></label>
                        {r.enabled && (r.runsAfter
                          ? <span className="tm-when">працює після агентів, від яких залежить</span>
                          : (
                            <span className="tm-sched">
                              <Select className="tm-ssel" value={r.mode} onChange={(v) => patchRow(r.role, { mode: v })} options={SCHED_MODES} ariaLabel={`Як часто: ${r.name}`} />
                              {r.mode === 'every' && <><input className="tm-num" type="number" min="1" max={MAX_EVERY_DAYS} value={r.every} onChange={(e) => patchRow(r.role, { every: e.target.value })} aria-label={`Кожні скільки днів: ${r.name}`} /><span>дн.</span></>}
                              {r.mode === 'week' && <Select className="tm-ssel" value={String(r.weekday)} onChange={(v) => patchRow(r.role, { weekday: v })} options={WEEKDAY_OPTIONS} ariaLabel={`День тижня: ${r.name}`} />}
                              {r.mode !== 'manual' && <input className="tm-time" type="text" inputMode="numeric" value={r.time} onChange={(e) => patchRow(r.role, { time: e.target.value })} placeholder="09:00" aria-label={`Час (Київ): ${r.name}`} />}
                            </span>
                          ))}
                      </li>
                    ))}
                  </ul>
                )}

                {tab === 'creative' && (
                  <>
                    <p className="tm-hint">Запуск команди й є регулярне завдання: агенти працюють за розкладом із цими параметрами. Усе про клієнта вони беруть із картки проєкту. Змінити можна будь-коли, а окреме разове завдання створюється кнопкою «Разове завдання».</p>
                    <label className="tm-fl"><span>Назва завдання (необовʼязково)</span>
                      <input className="tm-sel tm-text" type="text" maxLength={100} value={plans.creative.title} onChange={(e) => patchPlan('creative', { title: e.target.value })} placeholder="Наприклад: Постійні креативи" /></label>
                    <TaskBrief value={plans.creative} onChange={(patch) => patchPlan('creative', patch)} projectId={data.project.id} draftKey={draftKey}>
                      <div className="tm-fl tm-w2"><span>Коли запускати</span>
                        <ScheduleCalendar value={plans.creative} today={today} onChange={(patch) => patchPlan('creative', patch)} /></div>
                      <div className="tm-fl tm-w2"><span>Картинки</span>
                        <p className="tm-hint">Картинки генеруються автоматично: агенти доведуть завдання до готових креативів, а ви лише затверджуєте або повертаєте їх. Витрати стримує ліміт: підтвердження просимо тільки тоді, коли вартість не вміщується в нього.</p>
                        <label className="tm-cap">Ліміт на картинки цього завдання, $<input className="tm-num" type="text" inputMode="decimal" value={plans.creative.maxUsd} onChange={(e) => patchPlan('creative', { maxUsd: e.target.value })} aria-label="Ліміт на картинки одного завдання, $" /><small>Картинка Higgsfield коштує приблизно $0.2: на $3 вийде близько 15 картинок.</small></label>
                      </div>
                    </TaskBrief>
                    <p className="tm-hint">Агенти відділу: обовʼязкові працюють завжди, решту можна вимкнути.</p>
                    <ul className="tm-agents">
                      {plans.creative.plan.map((a) => (
                        <li key={a.role} className={'tm-agent' + (a.optional && !plans.creative.optional.has(a.role) ? ' is-off' : '')}>
                          <label className="tm-agent-on">
                            <input type="checkbox" checked={!a.optional || plans.creative.optional.has(a.role)} disabled={!a.optional} onChange={(e) => patchPlan('creative', { optional: (() => { const n = new Set(plans.creative.optional); if (e.target.checked) n.add(a.role); else n.delete(a.role); return n; })() })} aria-label={a.name} />
                            <span><b>{a.name}</b><small>{a.short}{a.required ? ' · обовʼязковий' : ''}</small></span>
                          </label>
                          <span className="tm-when">{a.shared ? `за загальним розкладом відділу: ${describePlanSchedule(a.schedule)}` : 'працює за запитом на завдання'}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {tab === 'reports' && (
                  <div className="tm-reports">
                    <div className="tm-rep">
                      <label className="tm-agent-on"><input type="checkbox" checked={plans.reports.weekly} onChange={(e) => patchPlan('reports', { weekly: e.target.checked })} /><span><b>Тижневий звіт</b><small>по кожній платформі й «Разом»</small></span></label>
                      {plans.reports.weekly && <span className="tm-sched"><Select className="tm-ssel" value={String(plans.reports.weekday)} onChange={(v) => patchPlan('reports', { weekday: v })} options={WEEKDAY_OPTIONS} ariaLabel="День тижневого звіту" /><input className="tm-time" type="text" inputMode="numeric" value={plans.reports.time} onChange={(e) => patchPlan('reports', { time: e.target.value })} aria-label="Час тижневого звіту" /></span>}
                    </div>
                    <div className="tm-rep">
                      <label className="tm-agent-on"><input type="checkbox" checked={plans.reports.monthly} onChange={(e) => patchPlan('reports', { monthly: e.target.checked })} /><span><b>Місячний звіт</b><small>підсумок місяця з текстами тижневих</small></span></label>
                      {plans.reports.monthly && <span className="tm-sched"><Select className="tm-ssel" value={String(plans.reports.mday)} onChange={(v) => patchPlan('reports', { mday: v })} options={MONTH_DAY_OPTIONS} ariaLabel="День місячного звіту" /><input className="tm-time" type="text" inputMode="numeric" value={plans.reports.mtime} onChange={(e) => patchPlan('reports', { mtime: e.target.value })} aria-label="Час місячного звіту" /></span>}
                    </div>
                    <div className="tm-rep">
                      <label className="tm-agent-on"><input type="checkbox" checked={plans.reports.presentation} onChange={(e) => patchPlan('reports', { presentation: e.target.checked })} /><span><b>Презентація для клієнта</b><small>зі збереженого звіту</small></span></label>
                    </div>
                    <p className="tm-hint">Отримувачі, чат Telegram і затверджувачі звітів налаштовуються в команді після запуску.</p>
                  </div>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <p className="tm-lead">Перевірте, що буде запущено.</p>
                {goal && <p className="tm-goal"><b>Мета з картки проєкту:</b> {goal}</p>}
                <div className="tml-sum">
                  {order.map((k) => {
                    const def = TEAMS.find((t) => t.key === k);
                    const p = plans[k];
                    const e = estimates.find((x) => x.key === k);
                    return (
                      <section key={k} className="tml-card">
                        <div className="tml-card-h"><TeamRing name={k} size={34} /><b>{def.title}</b></div>
                        {k === 'creative' && <small>{p.goal.trim() || '—'}</small>}
                        <div className="tml-chips">{sumChips(k, p).map((c) => <span key={c}>{c}</span>)}</div>
                        <p className="tml-cost">{e.usd ? <b>≈ ${e.usd.toFixed(2)} / міс</b> : null}<small>{e.text}</small></p>
                      </section>
                    );
                  })}
                  {total > 0 && <div className="tml-big"><span>Разом за агентів на місяць</span><b>≈ ${total.toFixed(2)}</b></div>}
                </div>
                {order.some((k) => k !== 'reports') && (
                  <label className="tm-cap">Ліміт витрат на місяць для команд операції, $
                    <input className="tm-num" type="text" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Ліміт витрат на місяць" />
                    <small>Досягши ліміту, команда не запускає нових платних кроків і попереджає вас. Порожньо: без ліміту.</small>
                  </label>
                )}
                <p className="tm-hint">Оцінка враховує лише роботу агентів. Картинки Higgsfield рахуються окремо (≈ $0.2 за штуку): вони генеруються автоматично в межах ліміту на завдання й операції.</p>
              </>
            )}
          </div>
        </div>

        <footer className="tml-foot">
          {step > 1 ? <button type="button" className="btn" disabled={launching} onClick={() => go(step - 1)}>Назад</button> : <span />}
          <span className="tml-mid">{step === 2 && blocked.length > 0 ? <span className="tml-warn">Заповніть обовʼязкові поля, щоб продовжити.</span> : <>Крок <b>{step}</b> з 4 · {STEPS[step - 1]}</>}</span>
          {step < 4 ? <button type="button" className="btn btn-p" disabled={!canNext} onClick={() => go(step + 1)}>Далі</button>
            : <button type="button" className="btn btn-p" disabled={launching} onClick={launch}>{launching ? 'Запускаємо…' : 'Запустити'}</button>}
        </footer>
      </div>
    </div>
  );
}
