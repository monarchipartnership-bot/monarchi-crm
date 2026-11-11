import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSpeechInput, { SPEECH_LANGS } from '../../../lib/useSpeechInput';
import { fillCycleForm } from '../../../lib/api/creatives';
import { MIN_FILL_CHARS, applyFill } from '../../../lib/agents/cycleFormFill';
import useDialogA11y from '../../../lib/useDialogA11y';
import { saveInput } from '../../../lib/api/projectCreative';
import { launchTeam } from '../../../lib/api/teams';
import { CREATIVE_OPTIONAL, DEFAULT_CONCEPTS, MAX_CONCEPTS, REQUEST_LANGUAGES, REQUEST_RATIOS, TEXT_MODES, creativeRoleDef } from '../../../lib/agents/creativeTeam';
import { MAX_EVERY_DAYS, WEEKDAYS, cleanSchedule, describeSchedule } from '../../../lib/agents/campaignCycles';
import { cleanRegular, kyivToday } from '../../../lib/agents/operationCycles';
import ScheduleCalendar from './ScheduleCalendar';
import { dayMonthOf, windowText } from '../../../lib/agents/scheduleCalendar';
import { TEAMS, estimateMonthly, teamAgentPlan, teamReadiness, teamsOf, describePlanSchedule } from '../../../lib/agents/teams';

const STEPS = ['Команди', 'Перевірка', 'Налаштування', 'Запуск'];
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
  // «Що потрібно від креативів»: typed or dictated; the button reads the description with the card and fills the other fields. What the person set by hand stays.
  const [voiceLang, setVoiceLang] = useState('uk');
  const [an, setAn] = useState({ busy: false, error: '', filled: null, notes: '' });
  const touched = useRef(new Set());
  const draftKey = `tm-goal-draft-${data.project.id}`;
  const speech = useSpeechInput({ lang: voiceLang, onText: (txt) => { if (txt) setPlans((p) => (p.creative ? { ...p, creative: { ...p.creative, goal: `${p.creative.goal}${p.creative.goal && !/\s$/.test(p.creative.goal) ? ' ' : ''}${txt}`.slice(0, 3000) } } : p)); } });
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
        if (k === 'creative') next[k] = { optional: new Set(CREATIVE_OPTIONAL), plan: teamAgentPlan('creative'), goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: 'uk', mode: 'every', every: '3', days: [1, 3, 5], time: '09:00', start: today, startNow: true };
        if (k === 'reports') next[k] = { weekly: true, weekday: 1, time: '09:00', monthly: true, mday: 1, mtime: '09:00', presentation: true };
      });
      return next;
    });
    setTab((t) => (order.includes(t) ? t : order[0]));
  }
  const patchPlan = (k, patch) => setPlans((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  const patchByHand = (patch) => { Object.keys(patch).forEach((key) => touched.current.add(key)); patchPlan('creative', patch); }; // a field the person changed is not overwritten by the analysis
  // the draft of the description is kept in this browser, so a closed window does not lose a dictated text; it goes when the team is launched
  useEffect(() => { if (plans.creative && plans.creative.goal === '') { try { const d = localStorage.getItem(draftKey); if (d) patchPlan('creative', { goal: d }); } catch { /* no storage */ } } }, [!!plans.creative]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (plans.creative) { try { if (plans.creative.goal) localStorage.setItem(draftKey, plans.creative.goal); else localStorage.removeItem(draftKey); } catch { /* no storage */ } } }, [plans.creative?.goal]); // eslint-disable-line react-hooks/exhaustive-deps
  const analyse = useCallback(async () => {
    setAn({ busy: true, error: '', filled: null, notes: '' });
    try {
      const fill = await fillCycleForm({ projectId: data.project.id, text: plans.creative.goal });
      const fields = { ...fill.fields };
      if (fields.texts === 'given') delete fields.texts; // the launch has no ready texts: the copywriter writes them
      const r = applyFill({ current: { ...plans.creative, texts: plans.creative.texts }, fill: { ...fill, fields, agent_settings: {} }, touched: touched.current });
      const patch = {};
      ['count', 'ratios', 'texts', 'language'].forEach((k) => { if (r.patch[k] != null) patch[k] = k === 'count' ? String(r.patch[k]) : r.patch[k]; });
      patchPlan('creative', patch);
      const q = fill.quotes || {};
      const parts = [];
      if (r.patch.count != null) parts.push(`кількість напрямів: ${r.patch.count}${q.count ? ` (з опису: «${q.count}»)` : ''}${fill.clamped ? `; ви назвали ${fill.clamped}, а за один запуск максимум ${MAX_CONCEPTS}` : ''}`);
      if (r.patch.ratios) parts.push(`формати: ${r.patch.ratios.join(', ')}${q.ratios ? ` (з опису: «${q.ratios}»)` : ''}`);
      if (r.patch.texts != null) parts.push('тексти на креативах');
      if (r.patch.language != null) parts.push('мову текстів');
      setAn({ busy: false, error: '', filled: parts, notes: `${fill.clamped ? `Більше ${MAX_CONCEPTS} ідей за запуск не буває: потрібно більше, запустіть ще одне разове завдання. ` : ''}${fill.notes || ''}`.trim() });
    } catch (e) { setAn({ busy: false, error: e?.message || 'Не вдалося проаналізувати опис.', filled: null, notes: '' }); }
  }, [data.project.id, plans.creative]);
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
          creativeTask: k === 'creative' ? { brief: taskBrief(p), schedule: taskSchedule(p), startNow: p.startNow } : null,
          capUsd: k !== 'reports' && Number(String(cap).replace(',', '.')) > 0 ? Number(String(cap).replace(',', '.')) : null,
          reports: k === 'reports' ? { weekly: p.weekly ? { weekday: Number(p.weekday), time: p.time.trim() } : null, monthly: p.monthly ? { day: Number(p.mday), time: p.mtime.trim() } : null, tasks: { presentation: p.presentation } } : null,
        });
        done.push({ key: k, title, campaignId: res.campaignId || null, startError: res.startError || '' });
      }
      try { localStorage.removeItem(draftKey); } catch { /* no storage */ }
      await onLaunched(done);
    } catch (e) {
      setError(`${done.length ? `Уже запущено: ${done.map((d) => d.title).join(', ')}. ` : ''}${e?.message || 'Не вдалося запустити команду.'}`);
      if (done.length) await reload();
      setLaunching(false);
    }
  }

  const canNext = step === 1 ? picked.size > 0 : step === 2 ? blocked.length === 0 : true;
  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !launching) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="tm-title" tabIndex={-1}>
        <header className="tm-head">
          <h2 id="tm-title">Запуск AI команди</h2>
          <button type="button" className="tm-x" onClick={onClose} disabled={launching} aria-label="Закрити">×</button>
        </header>
        <ol className="tm-steps" aria-label="Кроки запуску">
          {STEPS.map((label, i) => <li key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}><b>{step > i + 1 ? '✓' : i + 1}</b>{label}</li>)}
        </ol>

        <div className="tm-body">
          {error && <p className="pcr-error" role="alert">{error}</p>}

          {step === 1 && (
            <>
              <p className="tm-lead">Оберіть команди, які мають працювати для цього клієнта. Можна одну, кілька або всі.</p>
              <div className="tm-pick" role="group" aria-label="Команди">
                {TEAMS.map((def) => {
                  const st = view.teams.find((t) => t.key === def.key);
                  const taken = st.state !== 'none';
                  const on = picked.has(def.key);
                  return (
                    <button key={def.key} type="button" className={'tm-pickcard' + (on ? ' on' : '') + (taken ? ' is-taken' : '')} disabled={taken} aria-pressed={on}
                      onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(def.key)) n.delete(def.key); else n.add(def.key); return n; })}>
                      <span className="tm-tick" aria-hidden="true">{on ? '✓' : ''}</span>
                      <b>{def.title}</b>
                      <small>{def.text}</small>
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
                  <section key={k} className="tm-check">
                    <div className="tm-check-h"><h3>{def.title}</h3><span className={'pcr-state ' + tone}>{text}</span></div>
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
              {order.length > 1 && <div className="pcr-tabs" role="tablist" aria-label="Команда">{order.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={'pcr-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{TEAMS.find((t) => t.key === k).title}</button>)}</div>}

              {tab === 'analytics' && (
                <ul className="tm-agents">
                  {plans.analytics.rows.map((r) => (
                    <li key={r.role} className={'tm-agent' + (r.enabled ? '' : ' is-off')}>
                      <label className="tm-agent-on"><input type="checkbox" checked={r.enabled} onChange={(e) => patchRow(r.role, { enabled: e.target.checked })} aria-label={`Увімкнути: ${r.name}`} /><span><b>{r.name}</b><small>{r.short}</small></span></label>
                      {r.enabled && (r.runsAfter
                        ? <span className="tm-when">працює після агентів, від яких залежить</span>
                        : (
                          <span className="tm-sched">
                            <select className="tm-sel" value={r.mode} onChange={(e) => patchRow(r.role, { mode: e.target.value })} aria-label={`Як часто: ${r.name}`}>
                              <option value="every">Кожні N днів</option><option value="week">Щотижня</option><option value="manual">Лише вручну</option>
                            </select>
                            {r.mode === 'every' && <><input className="tm-num" type="number" min="1" max={MAX_EVERY_DAYS} value={r.every} onChange={(e) => patchRow(r.role, { every: e.target.value })} aria-label={`Кожні скільки днів: ${r.name}`} /><span>дн.</span></>}
                            {r.mode === 'week' && <select className="tm-sel" value={r.weekday} onChange={(e) => patchRow(r.role, { weekday: e.target.value })} aria-label={`День тижня: ${r.name}`}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>}
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
                  <div className="tm-task">
                    <div className="tm-fl tm-w2"><label htmlFor="tm-goal">Що потрібно від креативів</label>
                      <textarea id="tm-goal" className="tm-area" rows={4} maxLength={3000} value={plans.creative.goal} onChange={(e) => patchPlan('creative', { goal: e.target.value })} placeholder="Напишіть або надиктуйте своїми словами: для чого креативи, що важливо, скільки ідей" />
                      {speech.listening && <p className="vo-live" role="status">Слухаю… {speech.interim}</p>}
                      {speech.error && <p className="vo-err" role="alert">{speech.error}</p>}
                      <div className="vo-bar">
                        <span className="vo-count">{plans.creative.goal.length} / 3000{plans.creative.goal ? ' · чернетка збережена в цьому браузері' : ''}</span>
                        {speech.supported
                          ? (<>
                            <select className="tm-sel vo-lang" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} disabled={speech.listening} aria-label="Мова, якою ви говорите">{SPEECH_LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
                            <button type="button" className={'btn vo-mic' + (speech.listening ? ' on' : '')} onClick={speech.toggle} aria-pressed={speech.listening} aria-label={speech.listening ? 'Зупинити запис' : 'Надиктувати голосом'} title={speech.listening ? 'Зупинити запис' : 'Надиктувати голосом'}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>{speech.listening ? 'Зупинити' : 'Голос'}
                            </button>
                          </>)
                          : <span className="vo-count" title="Цей браузер не вміє розпізнавати мову. Відкрийте CRM у Chrome, Edge або Safari.">голос: потрібен Chrome, Edge або Safari</span>}
                        <button type="button" className="btn btn-p" disabled={an.busy || plans.creative.goal.trim().length < MIN_FILL_CHARS} onClick={analyse} title={plans.creative.goal.trim().length < MIN_FILL_CHARS ? 'Спершу опишіть завдання хоча б одним-двома реченнями' : 'Агент розбере опис разом із карткою проєкту й заповнить напрями, формати, тексти й мову'}>{an.busy ? 'Аналізуємо…' : 'Заповнити поля з опису'}</button>
                      </div>
                      {an.error && <p className="vo-err" role="alert">{an.error}</p>}
                      {an.filled && <p className="vo-ok" role="status">{an.filled.length ? `Заповнено: ${an.filled.join('; ')}. Перевірте нижче: усе можна змінити.` : 'З опису нічого додаткового не визначено: поля нижче лишились як були.'}{an.notes ? ` ${an.notes}` : ''}</p>}
                    </div>
                    <label className="tm-fl"><span>Напрямів (ідей) за запуск</span>
                      <select className="tm-sel" value={plans.creative.count} onChange={(e) => patchByHand({ count: e.target.value })} aria-label="Напрямів за запуск">{Array.from({ length: MAX_CONCEPTS }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}</select></label>
                    <fieldset className="tm-fl tm-fs"><legend>Формати</legend>
                      {REQUEST_RATIOS.map((r) => <label key={r.key} className="tm-chk"><input type="checkbox" checked={plans.creative.ratios.includes(r.key)} onChange={(e) => patchByHand({ ratios: e.target.checked ? [...plans.creative.ratios, r.key] : plans.creative.ratios.filter((x) => x !== r.key) })} />{r.label}</label>)}
                    </fieldset>
                    <label className="tm-fl"><span>Тексти на креативах</span>
                      <select className="tm-sel" value={plans.creative.texts} onChange={(e) => patchByHand({ texts: e.target.value })} aria-label="Тексти на креативах">{['yes', 'no'].map((k) => <option key={k} value={k}>{TEXT_MODES[k]}</option>)}</select></label>
                    <label className="tm-fl"><span>Мова текстів</span>
                      <select className="tm-sel" value={plans.creative.language} onChange={(e) => patchByHand({ language: e.target.value })} aria-label="Мова текстів">{Object.entries(REQUEST_LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <div className="tm-fl tm-w2"><span>Коли запускати</span>
                      <ScheduleCalendar value={plans.creative} today={today} onChange={(patch) => patchPlan('creative', patch)} /></div>
                  </div>
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
                    {plans.reports.weekly && <span className="tm-sched"><select className="tm-sel" value={plans.reports.weekday} onChange={(e) => patchPlan('reports', { weekday: e.target.value })} aria-label="День тижневого звіту">{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select><input className="tm-time" type="text" inputMode="numeric" value={plans.reports.time} onChange={(e) => patchPlan('reports', { time: e.target.value })} aria-label="Час тижневого звіту" /></span>}
                  </div>
                  <div className="tm-rep">
                    <label className="tm-agent-on"><input type="checkbox" checked={plans.reports.monthly} onChange={(e) => patchPlan('reports', { monthly: e.target.checked })} /><span><b>Місячний звіт</b><small>підсумок місяця з текстами тижневих</small></span></label>
                    {plans.reports.monthly && <span className="tm-sched"><select className="tm-sel" value={plans.reports.mday} onChange={(e) => patchPlan('reports', { mday: e.target.value })} aria-label="День місячного звіту">{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}-го числа</option>)}</select><input className="tm-time" type="text" inputMode="numeric" value={plans.reports.mtime} onChange={(e) => patchPlan('reports', { mtime: e.target.value })} aria-label="Час місячного звіту" /></span>}
                  </div>
                  <label className="tm-agent-on"><input type="checkbox" checked={plans.reports.presentation} onChange={(e) => patchPlan('reports', { presentation: e.target.checked })} /><span><b>Презентація для клієнта</b><small>зі збереженого звіту</small></span></label>
                  <p className="tm-hint">Отримувачі, чат Telegram і затверджувачі звітів налаштовуються в команді після запуску.</p>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <p className="tm-lead">Перевірте, що буде запущено.</p>
              {goal && <p className="tm-goal"><b>Мета з картки проєкту:</b> {goal}</p>}
              {order.map((k) => {
                const def = TEAMS.find((t) => t.key === k);
                const p = plans[k];
                const e = estimates.find((x) => x.key === k);
                return (
                  <section key={k} className="tm-sum">
                    <h3>{def.title}</h3>
                    <ul>
                      {k === 'analytics' && p.rows.filter((r) => r.enabled).map((r) => <li key={r.role}><b>{r.name}</b>: {r.runsAfter ? 'після агентів, від яких залежить' : describePlanSchedule(rowSchedule(r)) || 'лише вручну'}</li>)}
                      {k === 'creative' && <><li><b>Завдання:</b> {p.goal.trim() || '—'}</li><li>Напрямів: {p.count} · формати: {p.ratios.join(', ') || '1:1'} · тексти: {TEXT_MODES[p.texts].toLowerCase()} · мова: {REQUEST_LANGUAGES[p.language]}</li><li>Запускається {describeSchedule(p.mode === 'every' ? { everyDays: Number(p.every), time: p.time } : { weekdays: p.days, time: p.time }) || 'за розкладом'}; перший запуск {p.startNow ? 'одразу, далі за розкладом' : `${p.mode === 'every' ? dayMonthOf(p.start) : 'за розкладом'} о ${p.time}`}; за розкладом готово {windowText(p.time)}</li><li>Агентів відділу: {p.plan.filter((a) => !a.optional || p.optional.has(a.role)).map((a) => creativeRoleDef(a.role)?.name || a.role).length}</li></>}
                      {k === 'reports' && <>{p.weekly && <li>Тижневий звіт: {WEEKDAYS[p.weekday - 1]} о {p.time}</li>}{p.monthly && <li>Місячний звіт: {p.mday}-го числа о {p.mtime}</li>}{p.presentation && <li>Презентації для клієнта</li>}</>}
                    </ul>
                    <p className="tm-est">{k === 'creative' ? 'Вартість: ' : 'Орієнтовна вартість: '}{e.usd ? <b>≈ ${e.usd.toFixed(2)} на місяць</b> : null} {e.text}</p>
                  </section>
                );
              })}
              {order.some((k) => k !== 'reports') && (
                <label className="tm-cap">Ліміт витрат на місяць для команд операції, $
                  <input className="tm-num" type="text" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Ліміт витрат на місяць" />
                  <small>Досягши ліміту, команда не запускає нових платних кроків і попереджає вас. Порожньо: без ліміту.</small>
                </label>
              )}
              <p className="tm-hint">Оцінка враховує лише роботу агентів. Картинки Higgsfield рахуються окремо: ціну ви побачите й підтвердите перед кожною генерацією.{total ? ` Разом за агентів: ≈ $${total.toFixed(2)} на місяць.` : ''}</p>
            </>
          )}
        </div>

        <footer className="tm-foot">
          {step > 1 ? <button type="button" className="btn" disabled={launching} onClick={() => go(step - 1)}>Назад</button> : <span />}
          <span className="tm-foot-note">{step === 2 && blocked.length > 0 ? 'Заповніть обовʼязкові поля, щоб продовжити.' : ''}</span>
          {step < 4 ? <button type="button" className="btn btn-p" disabled={!canNext} onClick={() => go(step + 1)}>Далі</button>
            : <button type="button" className="btn btn-p" disabled={launching} onClick={launch}>{launching ? 'Запускаємо…' : 'Запустити'}</button>}
        </footer>
      </div>
    </div>
  );
}
