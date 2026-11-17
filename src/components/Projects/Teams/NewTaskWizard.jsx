import { useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { createExtraCycle, createSeasonal, runRegularNow, saveRegular } from '../../../lib/api/operationCycles';
import { kickQueue } from '../../../lib/api/agents';
import { runOneOff } from '../../../lib/api/oneoff';
import { DEFAULT_CONCEPTS, creativeAutoOf } from '../../../lib/agents/creativeTeam';
import { describeRegular, kyivToday, regularsOf, seasonOver } from '../../../lib/agents/operationCycles';
import { dayMonthOf, previewRuns } from '../../../lib/agents/scheduleCalendar';
import { FIELD_LABELS, filledFields, missingFor } from '../../../lib/agents/agentRequirements';
import { ONEOFF, whereToFill } from '../../../lib/agents/teams';
import TaskBrief, { clearTaskDraft } from './TaskBrief';
import TaskExtras, { briefFromForm, extrasInitial } from './TaskExtras';
import ScheduleCalendar from './ScheduleCalendar';
import { TASK_TYPE_DEF, TaskIcon, TeamRing, TypeMedal } from './teamsUi';
import '../../../styles/projectTeamsLaunch.css';
import '../../../styles/newTaskWizard.css';

// «+ Нове завдання» as ONE window with steps (owner's picks 2026-11-16, decision 52: the window in the middle with the steps on top, the type chosen in the menu, the description with all the
// fields at once, the calendar with the list of runs, the screen «Готово» at the end). The type comes from the menu; then: the direction (creatives / reports / research), what the task
// needs and when it works, the check with the price, the screen «Готово». Everything about the client the agents take from the card of the project.
//   data: fetchTeamsData result   view: teamsOf result   initialKind: 'regular' | 'seasonal' | 'oneoff'   onCreated(): the lists are read again   onOpenTask(taskKey)
//   onOpenReports()  onOpenMaterials()  onGoFill(section)
const KIND_TEXT = {
  oneoff: { creative: 'Агенти заплановують, напишуть і намалюють, ви перевірите результат.', report: 'Звіт за будь-який період складається в конструкторі звіту, поряд зі щотижневим і щомісячним.', research: 'Агенти вивчають бізнес, конкурентів, аудиторію або складають стратегію: результат потрапляє в «Готові матеріали».' },
  seasonal: { creative: 'Завдання з датами початку й кінця. Основне регулярне завдання на цей час можна призупинити.' },
  regular: { creative: 'Ще одне регулярне завдання команди: свої день, час, формат і назва.', report: 'Тижневий і місячний звіти складає агент звітів за розкладом: день і час налаштовуються в його вкладці.' },
};
const DIRS = [
  { key: 'creative', title: 'Креативи', icon: 'creative', kinds: ['oneoff', 'seasonal', 'regular'] },
  { key: 'report', title: 'Звіти', icon: 'reports', kinds: ['oneoff', 'regular'] },
  { key: 'research', title: 'Дослідження й стратегія', icon: 'analytics', kinds: ['oneoff'] },
];
const STEP_LABEL = { dir: 'Напрям', brief: 'Що потрібно', when: 'Коли', report: 'Звіти', agents: 'Що дослідити', sum: 'Перевірка' };

export default function NewTaskWizard({ data, view, email, initialKind = 'oneoff', onClose, onCreated, onOpenTask, onOpenReports, onOpenMaterials, onGoFill }) {
  const box = useRef(null);
  const type = initialKind;
  const campaign = view.teams.find((t) => t.key === 'creative')?.campaign || null;
  const creativeOff = !campaign;
  const paused = campaign?.status === 'paused';
  const today = useMemo(() => kyivToday(), []);
  const [dir, setDir] = useState(null);
  const [step, setStep] = useState(0);
  const draftKey = `tm-${type === 'seasonal' ? 'season' : type === 'regular' ? 'regular' : 'oneoff'}-draft-${data.project.id}`;
  const [v, setV] = useState({ goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: data.project.client_language || 'uk', ...extrasInitial() });
  const [title, setTitle] = useState('');
  const [sch, setSch] = useState({ mode: 'every', every: '3', days: [1, 3, 5], time: '09:00', start: today, startNow: false });
  const [end, setEnd] = useState('');
  const [stance, setStance] = useState('pause'); // what the main regular task does meanwhile: 'pause' | 'parallel'
  const [roles, setRoles] = useState([]); // the research agents chosen (roles)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { text, taskKey?, lines? }
  useDialogA11y(box, () => { if (!busy) onClose(); });

  const mains = useMemo(() => (campaign ? regularsOf(campaign).filter((r) => r.enabled && !r.seasonal && !seasonOver(r)) : []), [campaign]);
  const first = sch.startNow ? today : sch.start;
  const runs = useMemo(() => (type === 'seasonal' && end ? previewRuns({ ...sch, start: first, end }, today, 120) : []), [type, sch, first, end, today]);
  const have = useMemo(() => filledFields({ settings: data.settings, assets: data.assets, accounts: data.accounts }), [data]);
  const scheduled = sch.mode === 'every' ? Number(sch.every) >= 1 : sch.days.length > 0;

  const steps = !dir ? ['dir'] : dir === 'creative' ? (type === 'oneoff' ? ['dir', 'brief', 'sum'] : ['dir', 'brief', 'when', 'sum']) : dir === 'report' ? ['dir', 'report'] : ['dir', 'agents', 'sum'];
  const cur = steps[step] || 'dir';
  const last = step === steps.length - 1 && dir;
  const briefOk = v.goal.trim().length >= 3 && v.ratios.length > 0 && (v.texts !== 'given' || (v.given_texts || []).length > 0) && (type !== 'seasonal' || !!title.trim());
  const whenOk = type === 'seasonal' ? !!end && end >= first && runs.length > 0 : scheduled;
  const canNext = cur === 'dir' ? !!dir && (dir !== 'creative' || !creativeOff) : cur === 'brief' ? briefOk : cur === 'when' ? whenOk : cur === 'agents' ? roles.length > 0 : true;

  const pickDir = (k) => { setDir(k); setStep(0); };
  const goto = (key) => { const i = steps.indexOf(key); if (i >= 0) setStep(i); };
  const reset = () => { setDir(null); setStep(0); setV({ goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: data.project.client_language || 'uk', ...extrasInitial() }); setTitle(''); setEnd(''); setRoles([]); setError(''); setDone(null); };

  async function createCreative() {
    const brief = briefFromForm(v);
    if (type === 'seasonal') {
      const schedule = sch.mode === 'every' ? { everyDays: Number(sch.every), time: sch.time } : { weekdays: sch.days, time: sch.time };
      const out = await createSeasonal(campaign, { title: title.trim(), brief, schedule, startDate: first, endDate: end, replaces: stance === 'pause' ? mains.map((r) => r.id) : [], startNow: sch.startNow && !paused }, email);
      if (sch.startNow && !paused) kickQueue().catch(() => {});
      return { text: `Сезонне завдання «${title.trim()}» створено: ${dayMonthOf(first)} – ${dayMonthOf(end)}${stance === 'pause' && mains.length ? '; основне завдання на цей час на паузі' : ''}.`, taskKey: out?.regular?.id ? `reg:${out.regular.id}` : null };
    }
    if (type === 'regular') {
      const rb = { ...brief, given_texts: [] }; // ready texts are for a one-off task only
      const schedule = sch.mode === 'every' ? { everyDays: Number(sch.every), time: String(sch.time).trim(), ...(sch.startNow ? {} : { startDate: sch.start }) } : { weekdays: sch.days, time: String(sch.time).trim() };
      const { campaign: saved, regular } = await saveRegular(campaign.id, { enabled: true, ...(title.trim() ? { title: title.trim() } : {}), ...schedule, brief: rb }, email);
      if (sch.startNow && !paused) { await runRegularNow(saved, regular, email); kickQueue().catch(() => {}); }
      return { text: `Регулярне завдання «${regular.title}» створено: ${describeRegular(regular)}.${paused ? ' Команда на паузі: завдання запуститься, коли ви її продовжите.' : sch.startNow ? ' Перший запуск іде зараз.' : ''}`, taskKey: `reg:${regular.id}` };
    }
    const row = await createExtraCycle(campaign.id, { ...brief, title: title.trim() }, email, !paused);
    if (!paused) kickQueue().catch(() => {});
    return { text: paused ? 'Завдання збережено чернеткою: команда на паузі. Продовжте команду й запустіть його в картці завдання.' : `Завдання створено й запущено: агенти працюють. Коли креативи будуть готові, воно зʼявиться у блоці «Потребує вашого рішення».`, taskKey: `one:${row.id}` };
  }
  async function createResearch() {
    const lines = [];
    for (const role of roles) {
      const item = ONEOFF.find((x) => x.role === role);
      try {
        const out = await runOneOff({ project: { id: data.project.id, name: data.project.name }, accounts: data.accounts, role, email });
        lines.push(out?.status === 'failed' ? { ok: false, text: `${item.title}: ${out.error || 'агент не зміг виконати завдання.'}` } : { ok: true, text: `${item.title}: готово, результат чекає вашого перегляду.` });
      } catch (e) { lines.push({ ok: false, text: `${item.title}: ${e?.message || 'не вдалося виконати.'}` }); }
    }
    return { text: 'Дослідження виконано. Результати у вкладці «Готові матеріали».', lines };
  }
  async function create() {
    setBusy(true); setError('');
    try {
      const out = dir === 'creative' ? await createCreative() : await createResearch();
      if (dir === 'creative') clearTaskDraft(draftKey);
      setDone(out); onCreated?.(out.text);
    } catch (e) { setError(e?.message || 'Не вдалося створити завдання.'); } finally { setBusy(false); }
  }
  function next() {
    if (cur === 'report') { onClose(); onOpenReports?.(); return; }
    if (last) create(); else setStep((s) => s + 1);
  }

  const kindName = TASK_TYPE_DEF[type].label;
  const patchV = (patch) => setV((x) => ({ ...x, ...patch }));
  const dirText = (k) => (KIND_TEXT[type] || {})[k];
  const dirNote = (d) => (d.key === 'creative' ? (creativeOff ? 'Команда «Креативи» ще не запущена: запустіть її, і тоді можна створювати завдання.' : paused ? 'Команда на паузі: завдання збережеться, але запуститься, коли ви її продовжите.' : 'Команда працює') : d.key === 'research' ? 'Перед запуском перевіримо, чи заповнено картку проєкту' : 'Агент звітів');
  const dirTone = (d) => (d.key === 'creative' ? (creativeOff ? 'bad' : paused ? 'warn' : 'ok') : 'ok');
  const sumRows = [];
  if (dir === 'creative') {
    sumRows.push(['Тип', kindName, null], ['Напрям', 'Креативи', 'dir']);
    sumRows.push(['Назва', title.trim() || 'Назвемо за описом', 'brief'], ['Що робимо', v.goal.trim().slice(0, 140) + (v.goal.trim().length > 140 ? '…' : ''), 'brief']);
    sumRows.push(['Параметри', `${v.count} ідей · формати ${v.ratios.join(', ')} · ${v.texts === 'no' ? 'без текстів' : v.texts === 'given' ? 'мої тексти' : 'з текстами'}`, 'brief']);
    if (type !== 'oneoff') sumRows.push(['Розклад', `${sch.mode === 'every' ? `кожні ${sch.every} дні` : 'у вибрані дні'} о ${sch.time}, з ${dayMonthOf(first)}${type === 'seasonal' ? ` до ${dayMonthOf(end)} · запусків: ${runs.length}` : ''}`, 'when']);
    if (type === 'seasonal') sumRows.push(['Основне завдання', mains.length ? (stance === 'pause' ? 'на паузі на ці дати' : 'працює паралельно') : 'немає основного завдання', 'when']);
  } else if (dir === 'research') {
    sumRows.push(['Тип', kindName, null], ['Напрям', 'Дослідження й стратегія', 'dir'], ['Агенти', roles.map((r) => ONEOFF.find((x) => x.role === r).title).join(', '), 'agents']);
  }

  return (
    <div className="tml ntw" data-dd="night" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="tml-win" role="dialog" aria-modal="true" aria-labelledby="ntw-title" tabIndex={-1}>
        <header className="tml-head">
          <h2 id="ntw-title">Нове завдання <span className={'tb-kl is-' + type}><TypeMedal type={type} size={26} />{kindName}</span></h2>
          <button type="button" className="tml-x" onClick={onClose} disabled={busy} aria-label="Закрити">×</button>
        </header>
        {!done ? (
          <ol className="ntw-steps" aria-label="Кроки">
            {steps.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? '✓' : i + 1}</span>{STEP_LABEL[s]}</li>)}
          </ol>
        ) : <div />}
        <div className="tml-body">
          <div className="tml-in">
            {error && <p className="pcr-error" role="alert">{error}</p>}

            {done && (
              <div className="ntw-fin" role="status">
                <span className="ntw-big"><TaskIcon name="check" /></span>
                <h3>Завдання створено</h3>
                <p>{done.text}</p>
                {done.lines && <ul className="ntw-lines">{done.lines.map((l) => <li key={l.text} className={l.ok ? 'ok' : 'bad'}>{l.text}</li>)}</ul>}
                <div className="ntw-fin-btns">
                  {done.taskKey && <button type="button" className="btn btn-p" onClick={() => { onClose(); onOpenTask?.(done.taskKey); }}>Відкрити завдання</button>}
                  {done.lines && <button type="button" className="btn btn-p" onClick={() => { onClose(); onOpenMaterials?.(); }}>Відкрити «Готові матеріали»</button>}
                  <button type="button" className="btn" onClick={reset}>Створити ще одне</button>
                  <button type="button" className="btn" onClick={onClose}>Закрити</button>
                </div>
              </div>
            )}

            {!done && cur === 'dir' && (
              <>
                <div><h3 className="ntw-h">Для якої команди?</h3><p className="tm-lead">Показано напрями, де можливе завдання типу «{kindName}».</p></div>
                <div className="ntw-cards">
                  {DIRS.filter((d) => d.kinds.includes(type)).map((d) => {
                    const tone = dirTone(d);
                    return (
                      <button key={d.key} type="button" className={'ntw-pick is-' + type + (dir === d.key ? ' on' : '')} disabled={d.key === 'creative' && creativeOff} aria-pressed={dir === d.key} onClick={() => pickDir(d.key)}>
                        <TeamRing name={d.icon} size={38} />
                        <b>{d.title}</b>
                        <small>{dirText(d.key)}</small>
                        <span className={'ntw-st is-' + tone}>{tone === 'ok' ? '● ' : '▲ '}{dirNote(d)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {!done && cur === 'brief' && (
              <>
                <div><h3 className="ntw-h">{type === 'seasonal' ? 'Що робимо в сезон' : 'Що потрібно від креативів'}</h3><p className="tm-lead">Опишіть своїми словами. Усе про клієнта агенти візьмуть із картки проєкту.</p></div>
                {paused && <p className="tm-hint">Команда «Креативи» зараз на паузі: завдання збережеться, але почне працювати, лише коли ви продовжите команду.</p>}
                <label className="tm-fl"><span>{type === 'seasonal' ? 'Назва сезону' : 'Назва завдання (необовʼязково)'}</span>
                  <input className="tm-sel tm-text" type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Назва" placeholder={type === 'seasonal' ? 'Наприклад: Новий рік' : type === 'regular' ? 'Наприклад: Бестселери щотижня' : 'Наприклад: Банер до дня народження бренду'} /></label>
                <TaskBrief value={v} onChange={patchV} projectId={data.project.id} draftKey={draftKey} allowGiven={type === 'oneoff'}>
                  <TaskExtras value={v} onChange={patchV} teamLimit={creativeAutoOf(campaign).maxUsd || null} regular={type === 'regular'} />
                </TaskBrief>
              </>
            )}

            {!done && cur === 'when' && (
              <>
                <div><h3 className="ntw-h">{type === 'seasonal' ? 'Період і частота' : 'Коли запускати'}</h3><p className="tm-lead">{type === 'seasonal' ? 'Задайте межі сезону й частоту запусків.' : 'Задайте день і час: агенти працюватимуть самі, поки ви не зупините завдання.'}</p></div>
                <ScheduleCalendar value={{ ...sch, end }} today={today} onChange={(patch) => setSch((x) => ({ ...x, ...patch }))} />
                {type === 'seasonal' && (
                  <>
                    <label className="tm-fl"><span>Остання доба сезону</span>
                      <input className="tm-sel tm-text" type="date" min={first} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Остання доба сезону" /></label>
                    {end && end < first && <p className="vo-err" role="alert">Кінець сезону раніше за його початок.</p>}
                    {end && end >= first && !runs.length && <p className="vo-err" role="alert">У цьому періоді немає жодного запуску: змініть дні чи частоту.</p>}
                    {runs.length > 0 && <p className="tm-hint">Запусків за сезон: {runs.length}. Перший: {dayMonthOf(runs[0])}, останній: {dayMonthOf(runs[runs.length - 1])}.</p>}
                    {mains.length > 0 && (
                      <div className="tm-fl"><span>Що робити з основним регулярним завданням на ці дати?</span>
                        <div className="tm-stance" role="radiogroup" aria-label="Основне завдання на період сезону">
                          <label className={'tm-opt' + (stance === 'pause' ? ' on' : '')}><input type="radio" name="stance" checked={stance === 'pause'} onChange={() => setStance('pause')} /><span><b>Призупинити на період</b><small>Основне не запускатиметься в ці дати й само відновиться після останньої доби сезону.</small></span></label>
                          <label className={'tm-opt' + (stance === 'parallel' ? ' on' : '')}><input type="radio" name="stance" checked={stance === 'parallel'} onChange={() => setStance('parallel')} /><span><b>Працювати паралельно</b><small>Основне й сезонне запускаються як зазвичай, витрати складаються.</small></span></label>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {!done && cur === 'report' && (
              <>
                <div><h3 className="ntw-h">{type === 'oneoff' ? 'Звіт за період' : 'Розклад звітів'}</h3><p className="tm-lead">{KIND_TEXT[type].report}</p></div>
                <p className="tm-goal">{type === 'oneoff' ? 'Далі відкриється конструктор звіту: там ви оберете період і платформи.' : 'Далі відкриється вкладка агента звітів: там задаються день і час тижневого й місячного звітів.'}</p>
              </>
            )}

            {!done && cur === 'agents' && (
              <>
                <div><h3 className="ntw-h">Що дослідити?</h3><p className="tm-lead">Обрані агенти запускаються один раз. Результат потрапить у «Готові матеріали».</p></div>
                <div className="ntw-cards">
                  {ONEOFF.map((item) => {
                    const stop = missingFor([item.role], have).required; const on = roles.includes(item.role);
                    return (
                      <div key={item.key} className={'ntw-pick is-oneoff' + (on ? ' on' : '') + (stop.length ? ' is-off' : '')}>
                        <label className="ntw-agent"><input type="checkbox" checked={on} disabled={stop.length > 0} onChange={() => setRoles((r) => (on ? r.filter((x) => x !== item.role) : [...r, item.role]))} /><b>{item.title}</b></label>
                        <small>{item.text}</small>
                        {stop.length > 0
                          ? <span className="ntw-st is-warn">▲ Спершу заповніть: {stop.map((x) => FIELD_LABELS[x.key] || x.label).join(', ')} <button type="button" className="oo-link" onClick={() => { onClose(); onGoFill?.(whereToFill(stop[0].key)); }}>Відкрити в картці</button></span>
                          : <span className="ntw-st is-ok">● до $0.05</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!done && cur === 'sum' && (
              <>
                <div><h3 className="ntw-h">Усе гаразд?</h3><p className="tm-lead">Перевірте й запускайте. Будь-який рядок можна виправити.</p></div>
                <div className="ntw-sum">
                  {sumRows.map(([k, val, to]) => <div key={k} className="ntw-sr"><span>{k}</span><b>{val}</b>{to ? <button type="button" onClick={() => goto(to)}>змінити</button> : <span />}</div>)}
                </div>
                {dir === 'creative' && paused && <p className="tm-hint">Команда на паузі: завдання збережеться чернеткою й запуститься, коли ви продовжите команду.</p>}
                <p className="ntw-cost">{dir === 'creative' ? <><b>≈ $0.15–0.3 за запуск агентів</b><small>Картинки Higgsfield (≈ $0.2 за штуку) генеруються автоматично в межах ліміту команди: ви перевіряєте готові креативи.</small></> : <><b>≈ ${(roles.length * 0.05).toFixed(2)}</b><small>До $0.05 за кожного агента.</small></>}</p>
                {busy && <p className="tm-hint" role="status">{dir === 'research' ? 'Агенти працюють: це може тривати до кількох хвилин. Вікно не закривайте.' : 'Створюємо завдання…'}</p>}
              </>
            )}
          </div>
        </div>
        {done ? <div /> : (
          <footer className="tml-foot">
            {step > 0 ? <button type="button" className="btn" disabled={busy} onClick={() => setStep((s) => s - 1)}>← Назад</button> : <span />}
            <span className="tml-mid">Крок <b>{step + 1}</b> з {steps.length}</span>
            <button type="button" className={'btn btn-p' + (last ? ' ntw-go' : '')} disabled={!canNext || busy} onClick={next}>
              {cur === 'report' ? (type === 'oneoff' ? 'Відкрити конструктор' : 'Налаштувати розклад') : last ? (busy ? 'Виконуємо…' : dir === 'research' ? 'Запустити' : type === 'seasonal' ? 'Створити сезонне завдання' : type === 'regular' ? 'Створити регулярне завдання' : paused ? 'Зберегти чернетку' : 'Створити й запустити') : 'Далі →'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
