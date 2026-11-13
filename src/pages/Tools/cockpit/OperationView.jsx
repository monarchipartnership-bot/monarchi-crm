import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { kickQueue, startIntel } from '../../../lib/api/agents';
import { styleSamplesOf } from '../../../lib/agents/projectStyle';
import { addInstruction, fetchCampaignControl } from '../../../lib/api/campaignControl';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { createExtraCycle, removeRegular, runRegularNow, saveRegular, setRegularEnabled, setRegularLook, setRegularStyle, setRequestLook, setRequestStyle, updateExtraCycle } from '../../../lib/api/operationCycles';
import PicturesSetting from './PicturesSetting';
import { startRequest } from '../../../lib/api/creatives';
import { scopeCockpit } from '../../../lib/agents/taskScope';
import { MAX_REGULARS, SECTIONS, buildOperationView, cycleCosts, describeCycle } from '../../../lib/agents/operationCycles';
import { directionLimit } from '../../../lib/agents/creativeTeam';
import CampaignSpend from '../../AgentSpend/CampaignSpend';
import CampaignControl from '../campaigns/CampaignControl';
import CampaignPage from '../campaigns/CampaignPage';
import Deliverables from '../campaigns/Deliverables';
import RequestForm from '../campaigns/studio/RequestForm';
import AgentsSettings from './AgentsSettings';
import StepCards from './StepCards';
import LiveSteps from './LiveSteps';
import QuestionCard from './QuestionCard';
import RunJournal from './RunJournal';
import IntelCard from './IntelCard';
import StyleEditor from './StyleEditor';
import RealismPicker from './RealismPicker';
import TeamLimit from './TeamLimit';
import AgentNotes from './AgentNotes';
import AttentionRow from './AttentionRow';
import Gallery from './Gallery';
import { StageLine } from './ProjectWindow';
import { IconBadge, Ic, Progress, Spinner } from './parts';
import { fmtAgo, fmtDay, fmtUsd, plural } from './format';
import '../../../styles/studio.css';
import './ProjectCard.css';

// the sections of the card of ONE task and of the card of the team (step 3.0b); the card of a whole operation (SECTIONS) is kept for the old operations
const TASK_SECTIONS = [['now', 'Хід роботи'], ['review', 'Результати'], ['spend', 'Витрати'], ['settings', 'Налаштування']];
const TEAM_SECTIONS = [['client', 'Профіль клієнта'], ['settings', 'Ліміт і пауза'], ['spend', 'Витрати']];
const REQ_CHIP = { draft: 'is-grey', running: 'is-work', review: 'is-warn', problem: 'is-bad', approved: 'is-ok', paused: 'is-grey', waiting: 'is-warn' };
const STATE_CHIP = { review: 'is-warn', rework: 'is-back', checked: 'is-ok' };
const PASS_STATUS = { ok: 'успішно', failed: 'помилка', running: 'працює' };
const fmtWhen = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} о ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const countsLine = (c = {}) => [c.review ? `на перегляд: ${c.review}` : '', c.approved ? `затверджено: ${c.approved}` : '', c.rejected ? `повернено: ${c.rejected}` : '', c.producing ? `генерується: ${c.producing}` : ''].filter(Boolean).join(' · ') || 'рішень ще немає';

// One cycle that is in work: what it makes, how far it is, the step of the chain, what comes after it.
function CycleCard({ cycle, busy, onStart, onGo, paused = false, onRevised, onDismissNote, onAnswerNote, onGoFill, onPause, onResume, onAnswer }) {
  const s = cycle.stage;
  const pct = Math.round((cycle.progress || 0) * 100);
  return (
    <section className={'ckp-box opv-cycle' + (s.blocked === 'failed' ? ' is-bad' : s.blocked === 'estimate' || s.blocked === 'review' ? ' is-warn' : '')} aria-label={`Завдання ${cycle.id}`}>
      <div className="ckp-sec-h">
        <h3>Завдання №{cycle.id}</h3>
        <span className={'ckp-chip ' + (cycle.kind === 'regular' ? 'is-work' : '')}>{cycle.kindLabel}</span>
        <span className={'ckp-chip ' + (REQ_CHIP[cycle.status] || '')}>{s.blocked === 'estimate' ? 'Чекає підтвердження ціни' : cycle.statusLabel}</span>
        <span className="opv-date">оновлено {fmtAgo(cycle.updatedAt) || '—'}</span>
        <span className="opv-head-acts">
        {cycle.status === 'paused' && <button type="button" className="ckp-btn is-sm is-primary" disabled={!!busy} onClick={() => onResume(cycle)}>{busy === 'resume' + cycle.id ? <Spinner /> : <Ic n="play" size={13} />}Продовжити завдання</button>}
        {['running', 'review', 'problem'].includes(cycle.status) && <button type="button" className="ckp-btn is-sm" aria-pressed="false" disabled={!!busy} onClick={() => onPause(cycle)} title="Нові кроки й нові платні запити не стартують. Картинки, що вже відправлені в Higgsfield, дійдуть і зачекають на вас.">{busy === 'pause' + cycle.id ? <Spinner /> : <Ic n="clock" size={13} />}Пауза</button>}
        {['waiting', 'paused'].includes(cycle.status) && <button type="button" className="ckp-btn is-sm is-pressed" aria-pressed="true" disabled title={cycle.status === 'waiting' ? 'Агент поставив запитання: завдання вже на паузі, поки ви не відповісте.' : 'Завдання вже на паузі: натисніть «Продовжити завдання».'}><Ic n="clock" size={13} />На паузі</button>}
        </span>
      </div>
      <p className="opv-what">{cycle.text}</p>
      <div className="opv-prog"><Progress value={cycle.progress} /><em>{pct}%</em></div>
      {cycle.question && <QuestionCard question={cycle.question} busy={busy === 'answer' + cycle.id ? 'answer' : busy === 'proceed' + cycle.id ? 'proceed' : ''} onAnswer={(text) => onAnswer(cycle, { answer: text })} onProceed={() => onAnswer(cycle, { proceed: true })} />}
      {cycle.status !== 'draft' && <StageLine stages={cycle.stages} currentKey={cycle.currentStageKey} />}
      {cycle.status !== 'draft' && <LiveSteps steps={cycle.steps || []} working={cycle.status === 'running' && cycle.stages.some((x) => x.state === 'working')} />}
      <dl className="opv-steps">
        <div><dt>Зараз</dt><dd>{s.now}</dd></div>
        {s.next && <div><dt>Далі</dt><dd>{s.next}</dd></div>}
      </dl>
      {cycle.error && cycle.status === 'problem' && <p className="ckp-err" role="status">{cycle.error}</p>}
      <div className="ckp-acts">
        {(cycle.status === 'draft' || (cycle.status === 'problem' && !cycle.stages.some((x) => x.state === 'failed'))) && (
          <button type="button" className="ckp-btn is-primary" disabled={!!busy} onClick={() => onStart(cycle)}>{busy === 'start' + cycle.id ? <Spinner /> : <Ic n="play" size={15} />}{cycle.status === 'draft' ? 'Запустити завдання' : 'Запустити ще раз'}</button>
        )}
        {(s.blocked === 'failed' || s.blocked === 'estimate') && <button type="button" className="ckp-btn is-primary" onClick={() => onGo('messages')}>{s.blocked === 'estimate' ? 'Підтвердити генерацію картинок' : 'Перейти до повідомлень'}<Ic n="arrow" size={15} /></button>}
        {s.blocked === 'review' && <button type="button" className="ckp-btn is-primary" onClick={() => onGo('review', cycle.id)}>Перейти до перевірки<Ic n="arrow" size={15} /></button>}
      </div>
      {cycle.status !== 'draft' && <AgentNotes notes={cycle.notes || []} onDismiss={onDismissNote} onAnswer={onAnswerNote} onGoFill={onGoFill} />}
      {cycle.status !== 'draft' && <StepCards stages={cycle.stages} paused={paused} onRevised={onRevised} />}
    </section>
  );
}

// An operation without the creative department works by the schedules of its own agents: when each one worked last and when the agents run next.
function Passes({ campaignId }) {
  const [ctl, setCtl] = useState(null);
  useEffect(() => { let off = false; fetchCampaignControl(campaignId).then((d) => { if (!off) setCtl(d); }).catch(() => { if (!off) setCtl({ agents: [] }); }); return () => { off = true; }; }, [campaignId]);
  if (!ctl) return <div className="ckp-skel ckp-skel-wide" aria-hidden="true" />;
  const working = ctl.agents.filter((a) => a.mode !== 'paused' && (a.schedule || a.lastRunAt));
  const last = working.filter((a) => a.lastRunAt).sort((x, y) => String(y.lastRunAt).localeCompare(String(x.lastRunAt)))[0] || null;
  const next = working.filter((a) => a.nextAt).sort((x, y) => String(x.nextAt).localeCompare(String(y.nextAt)))[0] || null;
  return (
    <section className="ckp-box opv-cycle" aria-label="Робота агентів операції">
      <div className="ckp-sec-h"><h3>Агенти за розкладом</h3>{last && <span className="ckp-chip">{PASS_STATUS[last.lastStatus] || last.lastStatus || '—'}</span>}</div>
      <p className="opv-what">{last ? 'Кожен агент працює за своїм розкладом і передає результат наступному.' : 'Агенти ще не запускались: перший запуск буде за їхнім розкладом.'}</p>
      <dl className="opv-steps">
        {last && <div><dt>Останній запуск</dt><dd>{last.name}: {fmtWhen(last.lastRunAt)}</dd></div>}
        <div><dt>Наступний запуск</dt><dd>{next ? `${next.name}: ${fmtWhen(next.nextAt)}` : 'за розкладом агентів немає запланованих запусків'}</dd></div>
      </dl>
    </section>
  );
}

// The card of ONE operation inside the card of a project (owner, 2026-11-11), six sections:
//   «Зараз в роботі»            the cycles that are in work (regular or extra): what, how far, the step, what is next, when the regular one starts again
//   «Потребує перевірки»        a card per cycle with ready creatives: approve / return, the archive of the approved ones, download at any time
//   «Повідомлення від агентів»  everything the agents need from the person: a stopped step, a question, the price of the pictures to confirm
//   «Витрати»                   the money of the operation, by cycle and by period
//   «Налаштування»              the regular cycle (day, time, formats, how many, texts), the cap, the instructions, the agents
//   «Готові матеріали»          the approved materials of the last cycle
//   campaign: the ag_campaigns row  cockpit: the cabinet of the operation  run(item, key, payload): the action of the cabinet (useProjectCockpit)
//   regularFirst: the operation was just created → the form of the regular cycle opens at once
//   task: one task of the operation (taskScope.js): the card shows only its runs, notes and money, and its own settings (the agents' ones too)   teamOnly: the card of the team: the client, the limit, the money
export default function OperationView({ campaign, cockpit: cAll, project, loading = false, run, notify, onChanged, onBack, onOpenAgents, regularFirst = false, onGoFill = null, task = null, teamOnly = false }) {
  const c = useMemo(() => (task ? scopeCockpit(cAll, task) : cAll), [cAll, task]);
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [section, setSection] = useState(task ? 'now' : teamOnly ? 'client' : 'now');
  // the form of a cycle: { mode: 'extra', allowKind } (a new one, the kind is chosen in the form) | { mode: 'regular', regularId? } (a regular one: new or edited)
  const [form, setForm] = useState(regularFirst ? { mode: 'regular' } : null);
  const [openCycle, setOpenCycle] = useState(null);
  const [busy, setBusy] = useState('');
  const [rework, setRework] = useState(null); // { requestId, usd, count, skipped }
  const [fullPage, setFullPage] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false); // the card of an operation that stands alone has no «Налаштування агентів» tab: the agents open here
  const view = useMemo(() => buildOperationView({ campaign, cockpit: c }), [campaign, c]);
  const costs = useMemo(() => cycleCosts(c), [c]);
  const stopped = ['paused', 'archived'].includes(campaign.status);
  const act = useCallback((item, key, payload = {}) => run(item, key, { campaignId: campaign.id, ...payload }), [run, campaign.id]);
  // the answer of the manager to what the agents are unsure about: a manager's instruction for the operation (the agents read it in their next runs), the note is closed
  const answerNote = useCallback(async (n, text) => {
    await addInstruction(campaign.id, `${n.label}: ${String(text).trim()}`.slice(0, 1000));
    await act({ id: n.id }, 'dismiss');
    notify?.('Відповідь передано агентам: вони врахують її в наступних завданнях.');
  }, [campaign.id, act, notify]);
  const [reviewTab, setReviewTab] = useState('now'); // now (the cycles that wait for the person) | archive (the checked ones)
  const go = (key, cycleId = null) => {
    setSection(key); setOpenCycle(cycleId); setRework(null);
    if (key === 'review') setReviewTab(cycleId != null && view.review.some((r) => r.id === cycleId && !r.pending) ? 'archive' : 'now');
  };

  async function guard(id, fn, okText) {
    setBusy(id);
    try { await fn(); if (okText) notify?.(okText); await onChanged?.(); } catch (e) { notify?.(e?.message || 'Не вдалося виконати дію.', true); } finally { setBusy(''); }
  }
  // «Розвідка клієнта»: the scout makes the profile again (about $0.3-0.6); the cabinet is read at once, so its steps show up
  const refreshIntel = async () => {
    const again = !!c?.intel && ['ready', 'partial'].includes(c.intel.status);
    const yes = await confirm({ title: again ? 'Оновити профіль клієнта?' : 'Вивчити клієнта?', body: 'Агент-розвідник прочитає сайт і найкращі реклами з кабінету Meta. Це коштує приблизно $0.3–0.6 за виклик моделі й триває кілька хвилин.', confirmLabel: again ? 'Оновити' : 'Вивчити' });
    if (!yes) return;
    await guard('intel', async () => { const r = await startIntel(campaign.id, { force: again }); if (!r?.started && r?.reason === 'active') throw new Error('Розвідник уже працює: кроки видно нижче.'); }, 'Розвідка запущена: кроки видно в блоці «Кроки розвідника».');
  };
  const styleSamples = useMemo(() => styleSamplesOf(c), [c]);
  const startCycle = (cycle) => guard('start' + cycle.id, () => act(null, 'start_cycle', { requestId: cycle.id }), 'Завдання запущено: агенти працюють.');
  const pauseCycle = (cycle) => guard('pause' + cycle.id, () => act(null, 'pause', { requestId: cycle.id }), 'Завдання на паузі: нові кроки й нові платні запити не стартують.');
  const resumeCycle = (cycle) => guard('resume' + cycle.id, () => act(null, 'resume', { requestId: cycle.id }), 'Завдання продовжено.');
  const answerCycle = (cycle, { answer = '', proceed = false }) => guard((proceed ? 'proceed' : 'answer') + cycle.id, () => act(null, 'answer', { requestId: cycle.id, taskId: cycle.question.taskId, answer, proceed }), proceed ? 'Продовжуємо без відповіді: результат агента береться як є.' : 'Відповідь передано: агент працює над своїм кроком знову.');

  // the form: a regular cycle is kept in the operation (the form sends its day and time), a one-off one becomes a request and starts
  async function saveForm(values, start, schedule) {
    if (schedule) {
      const { campaign: saved, regular } = await saveRegular(campaign.id, { id: form.regularId, enabled: true, ...schedule, brief: values }, email);
      if (start) { await runRegularNow(saved, regular, email); kickQueue().catch(() => {}); }
      notify?.(start ? 'Регулярне завдання збережено, перше завдання запущено.' : 'Регулярне завдання збережено.');
    } else {
      await createExtraCycle(campaign.id, values, email, start);
      if (start) kickQueue().catch(() => {});
      notify?.(start ? 'Завдання запущено: агенти працюють.' : 'Завдання збережено як чернетку.');
    }
    setForm(null); setSection('now');
    await onChanged?.();
  }
  // the settings of the card of a task (step 3.0b): the regular task is saved in the operation (its title and its on/off state stay), a one-off task in its request
  const taskReg = task?.regularId ? view.regulars.find((r) => r.id === task.regularId) || null : null;
  const taskReq = task?.requestId != null ? (cAll?.requests || []).find((r) => r.id === task.requestId) || null : null;
  // the look of THIS task: saved in its brief (a regular task keeps it for every next run)
  const saveTaskLook = (look) => guard('look', () => (taskReg ? setRegularLook(campaign.id, taskReg.id, look) : setRequestLook(taskReq.id, taskReq.brief, look)), look ? 'Реалізм картинок збережено: він діє на нових картинках цього завдання.' : 'Повернуто «Як зараз»: до запитів нічого не додається.');
  const saveTaskStyle = (manual) => guard('style', () => (taskReg ? setRegularStyle(campaign.id, taskReg.id, manual) : setRequestStyle(taskReq.id, taskReq.brief, manual)), 'Стиль завдання збережено: він діє на креативах цього завдання.');
  async function saveTaskForm(valuesIn, start, schedule) {
    const values = { ...valuesIn, style: (taskReg || taskReq)?.brief?.style, look: (taskReg || taskReq)?.brief?.look }; // the form does not know the style of the task: it stays as it is
    if (taskReg) {
      const { campaign: saved, regular } = await saveRegular(campaign.id, { id: taskReg.id, enabled: taskReg.enabled, title: String(values.title || '').trim() || taskReg.title, ...schedule, brief: values }, email);
      if (start) { await runRegularNow(saved, regular, email); kickQueue().catch(() => {}); }
      notify?.(start ? 'Налаштування збережено, завдання запущено.' : 'Налаштування завдання збережено: вони діють з наступних запусків.');
    } else if (taskReq) {
      await updateExtraCycle(taskReq.id, values);
      if (start) { await startRequest(taskReq.id); kickQueue().catch(() => {}); }
      notify?.(start ? 'Налаштування збережено, завдання запущено ще раз.' : 'Налаштування завдання збережено.');
    }
    setSection(start ? 'now' : 'settings');
    await onChanged?.();
  }
  const editing = form?.regularId ? view.regulars.find((r) => r.id === form.regularId) || null : null;
  async function dropRegular(r) {
    if (!(await confirm({ title: 'Видалити регулярне завдання?', body: `«${r.title}» більше не запускатиметься сам. Завдання, які він уже зробив, залишаються.`, confirmLabel: 'Видалити', danger: true }))) return false;
    await guard('rm' + r.id, () => removeRegular(campaign.id, r.id), 'Регулярне завдання видалено.');
    return true;
  }

  // «Потребує перевірки»: the cycle that waits for the person is open at once; the checked cycles are kept in the tab «Архів завдань»
  const pending = view.review.filter((r) => r.pending);
  const archived = view.review.filter((r) => !r.pending);
  const cycle = reviewTab === 'now' ? pending.find((r) => r.id === openCycle) || pending[0] || null : archived.find((r) => r.id === openCycle) || null;
  const returned = cycle ? cycle.items.filter((i) => i.status === 'rejected') : [];
  async function estimateRework() {
    setBusy('rw');
    try { const res = await act(null, 'rework_estimate', { requestId: cycle.id, creativeIds: returned.map((i) => i.id) }); setRework({ requestId: cycle.id, ...res.rework }); } catch (e) { notify?.(e?.message || 'Не вдалося оцінити вартість.', true); } finally { setBusy(''); }
  }
  async function confirmRework() {
    setBusy('rw');
    try { const res = await act(null, 'rework_confirm', { requestId: cycle.id, creativeIds: returned.map((i) => i.id) }); setRework(null); notify?.(`Запущено картинок: ${res.submitted}. Нові версії зʼявляться тут за кілька хвилин.`); } catch (e) { notify?.(e?.message || 'Не вдалося запустити генерацію.', true); } finally { setBusy(''); }
  }
  const download = (requestId = null) => guard('dl' + (requestId ?? 'all'), async () => { const r = await act(null, 'download_approved', requestId != null ? { requestId } : {}); notify?.(`Завантажено файлів: ${r.downloaded}.`); });

  const sections = task ? TASK_SECTIONS : teamOnly ? TEAM_SECTIONS : SECTIONS;
  const badge = { now: view.counts.now + (task ? view.counts.messages : 0), review: view.counts.review, messages: view.counts.messages };
  return (
    <div className="opv">
      <nav className="opv-line" role="tablist" aria-label="Розділи операції">
        {sections.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={section === k} className={section === k ? 'is-on' : ''} onClick={() => go(k)}>
            {label}{badge[k] > 0 ? <em className={k === 'now' ? '' : k === 'messages' && view.counts.problems ? 'is-bad' : 'is-warn'}>{badge[k]}</em> : null}
          </button>
        ))}
      </nav>

      {section === 'now' && (
        <>
          {task && view.messages.length > 0 && (
            <section className="ckp-box" aria-label="Повідомлення від агентів">
              <div className="ckp-sec-h"><h3>Повідомлення від агентів</h3><span className="ckp-chip is-warn"><Ic n="clock" size={13} />{view.messages.length}</span></div>
              <div className="ckp-alist">{view.messages.map((a) => <AttentionRow key={a.id} item={a} onAction={act} />)}</div>
            </section>
          )}
          {view.creative && !task && (
            <div className="opv-nowhead">
              <span>{view.inWork.length ? `Завдань у роботі: ${view.inWork.length}` : 'Зараз немає завдань у роботі'}</span>
              <small className="sd-hint">Додаткові завдання створюються кнопкою «Додаткове завдання» в картці проєкту (вкладка «Запуск AI команди»).</small>
            </div>
          )}
          {view.creative && c && !task && (
            <IntelCard intel={c.intel} steps={c.scoutSteps || []} busy={busy === 'intel'} onRefresh={refreshIntel} />
          )}
          {!view.creative && <Passes campaignId={campaign.id} />}
          {view.creative && (
            <div className="opv-cycles">
              {!view.inWork.length && (
                <div className="ckp-calm"><IconBadge n="check" tone="green" /><div><b>Зараз нічого не в роботі</b><p>{view.counts.review ? `На вашу перевірку чекає креативів: ${view.counts.review}. ` : ''}{task ? task.line : view.nextText}</p></div></div>
              )}
              {view.inWork.map((x) => <CycleCard key={x.id} cycle={x} busy={busy} onStart={startCycle} onGo={go} paused={stopped} onDismissNote={(n) => act({ id: n.id }, 'dismiss')} onAnswerNote={answerNote} onGoFill={onGoFill} onPause={pauseCycle} onResume={resumeCycle} onAnswer={answerCycle} onRevised={(r) => { notify?.(r?.paused ? 'Правку прийнято. Крок виконається, коли ви відновите операцію.' : 'Правку надіслано: агент переробляє крок.'); onChanged?.(); }} />)}
            </div>
          )}
          {view.creative && !teamOnly && <RunJournal runs={(c?.requests || []).filter((r) => r.status !== 'draft')} />}
        </>
      )}

      {section === 'review' && view.creative && (
        <>
          <div className="ckp-ribbon opv-subtabs" role="tablist" aria-label="Завдання на перевірку">
            <button type="button" role="tab" aria-selected={reviewTab === 'now'} className={reviewTab === 'now' ? 'is-on' : ''} onClick={() => { setReviewTab('now'); setOpenCycle(null); setRework(null); }}>{pending.length > 1 ? 'Актуальні завдання' : 'Актуальне завдання'}<em className={pending.length ? 'is-warn' : ''}>{pending.length}</em></button>
            <button type="button" role="tab" aria-selected={reviewTab === 'archive'} className={reviewTab === 'archive' ? 'is-on' : ''} onClick={() => { setReviewTab('archive'); setOpenCycle(null); setRework(null); }}>Архів завдань<em>{archived.length}</em></button>
          </div>

          {reviewTab === 'now' && !cycle && (
            <div className="ckp-calm"><IconBadge n={view.messages.some((m) => m.kind === 'estimate') ? 'clock' : 'check'} tone={view.messages.some((m) => m.kind === 'estimate') ? 'amber' : 'green'} /><div><b>{view.messages.some((m) => m.kind === 'estimate') ? 'Картинок на перевірку ще немає: чекаємо вашого підтвердження' : 'Немає завдань на перевірку'}</b><p>{view.messages.some((m) => m.kind === 'estimate') ? `Агенти підготували запити на картинки, але генерація почнеться лише після того, як ви підтвердите ціну. Це робиться в розділі «Повідомлення від агентів»: ${view.messages.find((m) => m.kind === 'estimate').title.toLowerCase()}.` : archived.length ? 'Усі готові креативи перевірено: завдання лежать в архіві, їх можна відкрити й завантажити будь-коли.' : 'Готових креативів ще немає. Завдання зʼявиться тут, щойно агенти зроблять перші картинки.'}</p>{view.messages.some((m) => m.kind === 'estimate') && <button type="button" className="ckp-btn is-primary" onClick={() => go('messages')}>Підтвердити генерацію картинок<Ic n="arrow" size={15} /></button>}</div>{archived.length > 0 && <button type="button" className="ckp-btn" style={{ marginLeft: 'auto' }} onClick={() => setReviewTab('archive')}>Архів завдань<Ic n="arrow" size={15} /></button>}</div>
          )}
          {/* the cycles that wait for the person: one card per cycle says everything once (its kind, what it is, how many wait); with several, a click switches */}
          {reviewTab === 'now' && pending.length > 0 && (
            <div className="opv-rvs" role={pending.length > 1 ? 'tablist' : undefined} aria-label="Актуальні завдання">
              {pending.map((r) => {
                const on = cycle?.id === r.id;
                const body = (
                  <>
                    <span className="opv-cyc-kind">{r.kindLabel} · №{r.id}</span>
                    <b>{r.title}</b>
                    <small>{[`на перевірці: ${r.creatives.review}`, r.creatives.approved ? `затверджено: ${r.creatives.approved}` : '', r.creatives.rejected ? `повернено: ${r.creatives.rejected}` : '', r.creatives.producing ? `переробляється: ${r.creatives.producing}` : ''].filter(Boolean).join(' · ')}</small>
                  </>
                );
                return pending.length > 1
                  ? <button key={r.id} type="button" role="tab" aria-selected={on} className={'opv-cyc' + (on ? ' is-on' : '')} onClick={() => { setOpenCycle(r.id); setRework(null); }}>{body}</button>
                  : <div key={r.id} className="opv-cyc is-on is-single">{body}</div>;
              })}
            </div>
          )}

          {reviewTab === 'archive' && !cycle && (
            <>
              <div className="ckp-sec-h">
                <h3>Архів завдань</h3><span className="ckp-chip">{archived.length}</span>
                <button type="button" className="ckp-btn" style={{ marginLeft: 'auto' }} disabled={!view.archive.count || !!busy} onClick={() => download()}>{busy === 'dlall' ? <Spinner /> : <Ic n="download" size={15} />}Завантажити затверджені з усіх завдань ({view.archive.count})</button>
              </div>
              {!archived.length && <p className="ckp-empty-line">Архів порожній. Завдання переходить сюди, коли ви ухвалили рішення щодо всіх його креативів; його можна відкрити й завантажити будь-коли.</p>}
              <div className="opv-arcs">
                {archived.map((r) => (
                  <button key={r.id} type="button" className="opv-arc" onClick={() => { setOpenCycle(r.id); setRework(null); }}>
                    <span className="opv-arc-pic" style={r.items.find((i) => i.url) ? { backgroundImage: `url(${r.items.find((i) => i.url).url})` } : undefined} aria-hidden="true" />
                    <span className="opv-arc-tx">
                      <b>Завдання №{r.id} · {r.title}</b>
                      <small>{[r.kindLabel, countsLine(r.creatives)].join(' · ')}</small>
                      <span className="opv-arc-foot"><span className={'ckp-chip ' + STATE_CHIP[r.state]}>{r.stateLabel}</span><span className="pcd-op-date">{fmtDay(r.updatedAt) || '—'}</span></span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {cycle && (
            <>
              {reviewTab === 'archive' ? (
                <div className="pcd-opbar">
                  <button type="button" className="ckp-btn" onClick={() => { setOpenCycle(null); setRework(null); }}><Ic n="back" size={15} />Архів завдань</button>
                  <b>{cycle.kindLabel} · №{cycle.id} · {cycle.title}</b>
                  <span className={'ckp-chip ' + STATE_CHIP[cycle.state]}>{cycle.stateLabel}</span>
                  <span className="pcd-opbar-sp" />
                  {returned.length > 0 && !rework && <button type="button" className="ckp-btn" disabled={!!busy} onClick={estimateRework}>{busy === 'rw' ? <Spinner /> : <Ic n="refresh" size={15} />}Переробити повернені ({returned.length})</button>}
                  <button type="button" className="ckp-btn is-primary" disabled={!cycle.creatives.approved || !!busy} onClick={() => download(cycle.id)}>{busy === 'dl' + cycle.id ? <Spinner /> : <Ic n="download" size={15} />}Завантажити затверджені ({cycle.creatives.approved})</button>
                </div>
              ) : (
                <div className="opv-rowhead">
                  <span>Схваліть або поверніть кожен креатив. Повернені можна переробити з вашим коментарем.</span>
                  {returned.length > 0 && !rework && <button type="button" className="ckp-btn" disabled={!!busy} onClick={estimateRework}>{busy === 'rw' ? <Spinner /> : <Ic n="refresh" size={15} />}Переробити повернені ({returned.length})</button>}
                  {cycle.creatives.review > 0 && <button type="button" className="ckp-btn is-ok" disabled={!!busy} onClick={() => guard('apall', () => act(null, 'approve_all', { requestId: cycle.id, creativeIds: cycle.items.filter((x) => x.status === 'review').map((x) => x.id) }))}>{busy === 'apall' ? <Spinner /> : <Ic n="check" size={15} />}Схвалити всі на перегляді ({cycle.creatives.review})</button>}
                </div>
              )}
              {rework && rework.requestId === cycle.id && (
                <div className="ckp-box opv-rework" role="status">
                  <p className="opv-what">Повернені картинки будуть зроблені заново з вашим коментарем. Оцінка Higgsfield: <b>{fmtUsd(rework.usd)}</b> за {rework.count} {plural(rework.count, 'картинку', 'картинки', 'картинок')}{rework.skipped ? `; ще ${rework.skipped} не вміщаються в ліміт запиту` : ''}.</p>
                  <div className="ckp-acts">
                    <button type="button" className="ckp-btn is-money" disabled={!!busy || !rework.count} onClick={confirmRework}>{busy === 'rw' && <Spinner />}Підтвердити переробку · {fmtUsd(rework.usd)}</button>
                    <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => setRework(null)}>Скасувати</button>
                  </div>
                </div>
              )}
              <section className="ckp-gzone" aria-label={`Креативи завдання ${cycle.id}`}>
                <Gallery key={cycle.id} minimal items={cycle.items} onAct={(key, payload = {}) => act(null, key, { requestId: cycle.id, ...payload })} loadingHint={loading} textEdit={c?.intel ? { autoStyle: c.intel.autoStyle, taskStyle: cycle.brief?.style, look: cycle.brief?.look } : null} />
              </section>
            </>
          )}
        </>
      )}
      {section === 'review' && !view.creative && <div className="cmp-section pcd-embed"><Deliverables campaignId={campaign.id} notify={notify} /></div>}

      {section === 'messages' && (
        <section className="ckp-att" aria-label="Повідомлення від агентів">
          <div className="ckp-sec-h">
            <h3>Повідомлення від агентів</h3>
            {view.messages.length > 0 ? <span className="ckp-chip is-warn"><Ic n="clock" size={13} />{view.messages.length}</span> : <span className="ckp-chip is-ok"><Ic n="check" size={13} />нічого</span>}
            {view.counts.problems > 0 && <span className="ckp-chip is-bad"><Ic n="warn" size={13} />{view.counts.problems} {plural(view.counts.problems, 'помилка', 'помилки', 'помилок')}</span>}
          </div>
          {!view.messages.length && <div className="ckp-calm"><IconBadge n="check" tone="green" /><div><b>Усе гаразд</b><p>Агентам нічого від вас не потрібно. Тут зʼявляться зупинені кроки, питання агентів і оцінка вартості картинок на підтвердження.</p></div></div>}
          <div className="ckp-alist">
            {view.messages.map((a) => <AttentionRow key={a.id} item={a} onAction={act} />)}
          </div>
        </section>
      )}

      {section === 'spend' && (
        <>
          {view.creative && !teamOnly && (
            <section className="ckp-box" aria-label="Витрати за завданнями">
              <div className="ckp-sec-h"><h3>{task ? 'Витрати цього завдання' : 'Витрати за завданнями'}</h3><span className="ckp-chip">{fmtUsd(c?.spend?.total)} за весь час</span></div>
              {!costs.length && <p className="ckp-empty-line">Завдань ще не було.</p>}
              {costs.length > 0 && (
                <div className="opv-sp">
                  {costs.map((r) => {
                    const sum = (r.model || 0) + (r.higgsfield || 0);
                    return (
                      <article key={r.id} className="opv-spc" aria-label={`Завдання ${r.id}`}>
                        <b>Завдання №{r.id} · {r.title}</b>
                        <small>{r.kindLabel} · картинок: {r.pictures}</small>
                        <span className="opv-spc-big">{fmtUsd(r.total)}</span>
                        <span className="opv-spc-bar" aria-hidden="true"><i style={{ width: sum ? `${((r.model || 0) / sum) * 100}%` : '0%', background: '#EB9CEF' }} /><i style={{ width: sum ? `${((r.higgsfield || 0) / sum) * 100}%` : '0%', background: '#7C8CF8' }} /></span>
                        <span className="ckp-leg"><span><i style={{ background: '#EB9CEF' }} />Claude <b>{fmtUsd(r.model)}</b></span><span><i style={{ background: '#7C8CF8' }} />Higgsfield <b>{fmtUsd(r.higgsfield)}</b></span></span>
                      </article>
                    );
                  })}
                </div>
              )}
              <p className="ckp-empty-line">Claude за завданням рахується за останні 30 днів; повна сума операції — у блоці нижче.</p>
            </section>
          )}
          {!task && <div className="pcd-embed pcd-spend"><CampaignSpend campaignId={campaign.id} /></div>}
        </>
      )}

      {section === 'client' && teamOnly && view.creative && c && (
        <IntelCard intel={c.intel} steps={c.scoutSteps || []} busy={busy === 'intel'} onRefresh={refreshIntel} />
      )}

      {section === 'settings' && teamOnly && campaign.status !== 'draft' && <TeamLimit campaign={campaign} notify={notify} onChanged={onChanged} />}

      {section === 'settings' && task && (taskReg || taskReq) && (
        <div className="cmp-section pcd-embed">
          <RequestForm key={task.key} campaign={campaign} mode={taskReg ? 'regular' : 'extra'} title="Налаштування завдання" initial={taskReg ? { ...taskReg.brief, title: taskReg.title, materials: [] } : { ...taskReq.brief, title: taskReq.title, materials: [] }}
            schedule={taskReg ? { weekdays: taskReg.weekdays, everyDays: taskReg.everyDays, time: taskReg.time } : null} canStartNow={!stopped} inline onClose={() => {}} onSave={saveTaskForm}
            extraPanels={[
              { key: 'style', label: 'Стиль', after: 'creatives', node: (
                <>
                  <section className="ckp-box" aria-label="Реалізм картинок">
                    <RealismPicker key={task.key} look={(taskReg || taskReq).brief?.look} onSave={saveTaskLook} />
                  </section>
                  {c?.intel && (
                    <section className="ckp-box" aria-label="Стиль завдання">
                      <StyleEditor key={task.key} autoStyle={c.intel.autoStyle} manual={(taskReg || taskReq).brief?.style} samples={styleSamples} onSave={saveTaskStyle} />
                    </section>
                  )}
                </>
              ) },
              { key: 'control', label: 'Керування', after: 'more', node: (
                <section className="ckp-box opv-regular" aria-label="Керування завданням">
                  <div className="ckp-sec-h"><h3>Керування завданням</h3><span className="ckp-chip">{task.kindLabel}</span></div>
                  <p className="opv-what">{task.regularId ? 'Усе в цих розділах діє лише для цього завдання: в інших завдань клієнта свої налаштування, зокрема й у кожного агента. Зміни застосуються до наступних запусків.' : 'Усе в цих розділах діє лише для цього завдання, зокрема й налаштування кожного агента. Зміни застосуються, коли ви запустите завдання ще раз.'}</p>
                  {taskReg ? (
                    <div className="ckp-acts">
                      <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => guard('reg' + taskReg.id, () => setRegularEnabled(campaign.id, taskReg.id, !taskReg.enabled, email), taskReg.enabled ? 'Регулярне завдання вимкнено.' : 'Регулярне завдання увімкнено.')}><Ic n={taskReg.enabled ? 'stop' : 'play'} size={15} />{taskReg.enabled ? 'Вимкнути завдання' : 'Увімкнути завдання'}</button>
                      <button type="button" className="ckp-btn is-danger" disabled={!!busy} onClick={async () => { if (await dropRegular(taskReg)) onBack?.(); }}>Видалити завдання</button>
                    </div>
                  ) : (
                    <>
                      <p className="ckp-empty-line">Разове завдання: його можна запустити ще раз кнопкою «Зберегти й запустити ще раз» внизу.</p>
                      {taskReq && (
                        <div className="ckp-acts">
                          <button type="button" className="ckp-btn is-danger" disabled={!!busy} onClick={async () => {
                            const made = taskReq.creatives?.total || 0;
                            if (!(await confirm({ title: 'Видалити завдання?', body: `«${taskReq.title}» зникне зі списку разом із його журналом${made ? ` і креативами (${made})` : ''}. Агенти, що вже працюють, завершать свій крок, але нічого нового не запустять. Уже відправлені в Higgsfield картинки й відео оплачені, ці витрати лишаються в ліміті операції.`, confirmLabel: 'Видалити', danger: true }))) return;
                            await guard('del' + taskReq.id, () => act(null, 'delete_cycle', { requestId: taskReq.id }), 'Завдання видалено.');
                            onBack?.();
                          }}>Видалити завдання</button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              ) },
            ]} />
        </div>
      )}

      {section === 'settings' && !task && !teamOnly && (
        <>
          {view.creative && <PicturesSetting campaign={campaign} notify={notify} onChanged={onChanged} />}
          {view.creative && (
            <section className="ckp-box opv-regular" aria-label="Регулярні завдання">
              <div className="ckp-sec-h">
                <h3>Регулярні завдання</h3><span className="ckp-chip">{view.regulars.length}</span>
                <button type="button" className="ckp-btn is-primary" style={{ marginLeft: 'auto' }} disabled={view.regulars.length >= MAX_REGULARS} onClick={() => setForm({ mode: 'regular' })}><Ic n="plus" size={15} />Додати регулярне завдання</button>
              </div>
              <p className="opv-what">Регулярне завдання запускається щотижня у свій день і час, з однаковими параметрами. Їх може бути кілька. Зміни діють з наступного запуску.</p>
              {!view.regulars.length && <p className="ckp-empty-line">Регулярних завдань немає: операція працює лише коли ви створюєте завдання вручну.</p>}
              <div className="opv-regs">
                {view.regulars.map((r) => (
                  <article key={r.id} className={'opv-reg' + (r.enabled ? '' : ' is-off')} aria-label={r.title}>
                    <div className="ckp-sec-h"><b>{r.title}</b><span className={'ckp-chip ' + (r.enabled ? 'is-work' : 'is-grey')}>{r.enabled ? r.whenText : 'вимкнено'}</span></div>
                    <dl className="opv-list">
                      <div><dt>Що потрібно</dt><dd>{r.brief.goal}</dd></div>
                      <div><dt>Наступний запуск</dt><dd>{r.enabled ? (r.next ? `${r.next.text} (Київ)${stopped ? ': але операція на паузі' : ''}` : '—') : 'вимкнено'}</dd></div>
                      <div><dt>Формати і напрями</dt><dd>{r.brief.ratios.join(', ')} · напрямів: {directionLimit(r.brief)} (креативів на одне завдання: до {directionLimit(r.brief) * r.brief.ratios.length})</dd></div>
                      <div><dt>Тексти</dt><dd>{r.brief.texts === 'no' ? 'без тексту на картинці' : 'пише агент копірайтер'} · мова: {r.brief.language === 'en' ? 'English' : 'українська'}</dd></div>
                    </dl>
                    <div className="ckp-acts">
                      <button type="button" className="ckp-btn" onClick={() => setForm({ mode: 'regular', regularId: r.id })}><Ic n="pen" size={15} />Змінити</button>
                      <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => guard('reg' + r.id, () => setRegularEnabled(campaign.id, r.id, !r.enabled, email), r.enabled ? 'Регулярне завдання вимкнено.' : 'Регулярне завдання увімкнено.')}><Ic n={r.enabled ? 'stop' : 'play'} size={15} />{r.enabled ? 'Вимкнути' : 'Увімкнути'}</button>
                      <button type="button" className="ckp-btn is-danger" disabled={!!busy} onClick={() => dropRegular(r)}>Видалити</button>
                    </div>
                  </article>
                ))}
              </div>
              {onOpenAgents && <div className="ckp-acts"><button type="button" className="ckp-btn" onClick={onOpenAgents}>Налаштування агентів</button></div>}
            </section>
          )}
          {campaign.status !== 'draft' && <div className="cmp-section pcd-embed"><CampaignControl campaign={campaign} notify={notify} /></div>}
          {!onOpenAgents && <button type="button" className="ckp-btn pcd-agents-more" aria-expanded={agentsOpen} onClick={() => setAgentsOpen((v) => !v)}><span className={agentsOpen ? 'ckp-flip' : ''}><Ic n="chev" size={14} /></span>Налаштування агентів операції</button>}
          {!onOpenAgents && agentsOpen && <AgentsSettings campaigns={[campaign]} currentId={campaign.id} notify={notify} onChanged={onChanged} />}
          <button type="button" className="ckp-btn pcd-agents-more" aria-expanded={fullPage} onClick={() => setFullPage((v) => !v)}><span className={fullPage ? 'ckp-flip' : ''}><Ic n="chev" size={14} /></span>Схема агентів, звіти, архів і видалення операції</button>
          {fullPage && <div className="cmp-section pcd-embed"><CampaignPage key={campaign.id} campaign={campaign} project={project} notify={notify} onBack={onBack} onChanged={onChanged} /></div>}
        </>
      )}

      {section === 'ready' && view.creative && (
        <section className="ckp-box" aria-label="Готові матеріали останнього завдання">
          <div className="ckp-sec-h">
            <h3>Готові матеріали останнього завдання</h3>
            {view.ready && <span className="ckp-chip">Завдання №{view.ready.cycle.id} · {view.ready.cycle.kindLabel}</span>}
            {view.ready && <button type="button" className="ckp-btn is-primary" style={{ marginLeft: 'auto' }} disabled={!view.ready.items.length || !!busy} onClick={() => download(view.ready.cycle.id)}>{busy === 'dl' + view.ready.cycle.id ? <Spinner /> : <Ic n="download" size={15} />}Завантажити (ZIP)</button>}
          </div>
          {!view.ready && <p className="ckp-empty-line">Готових матеріалів ще немає: вони зʼявляться після першого завдання.</p>}
          {view.ready && (
            <>
              <p className="opv-what">{view.ready.cycle.title}</p>
              {(view.ready.pending > 0 || view.ready.returned > 0) && (
                <p className="ckp-empty-line">{[view.ready.pending ? `ще на перевірці: ${view.ready.pending}` : '', view.ready.returned ? `повернено на доопрацювання: ${view.ready.returned}` : ''].filter(Boolean).join(' · ')}. <button type="button" className="ckp-more" onClick={() => go('review', view.ready.cycle.id)}>Перейти до перевірки</button></p>
              )}
              {!view.ready.items.length && <p className="ckp-empty-line">У цьому завданні ще нічого не затверджено.</p>}
              <div className="opv-ready">
                {view.ready.items.map((i) => (
                  <article key={i.id} className="opv-mat">
                    <span className="opv-mat-pic" style={{ backgroundImage: `url(${i.url})` }} role="img" aria-label={i.conceptName} />
                    <div className="opv-mat-tx">
                      <b>{i.conceptName}</b>
                      <small>{i.ratio || '4:5'} · {i.fileName}</small>
                      {i.copy?.headline && <p><em>Заголовок:</em> {i.copy.headline}</p>}
                      {i.copy?.text && <p><em>Текст:</em> {i.copy.text}</p>}
                      {i.copy?.description && <p><em>Опис:</em> {i.copy.description}</p>}
                      {i.copy?.cta && <p><em>Кнопка:</em> {i.copy.cta}</p>}
                      <button type="button" className="ckp-btn is-sm" disabled={!!busy} onClick={() => guard('one' + i.id, () => act(null, 'download_one', { creativeId: i.id }))}><Ic n="download" size={14} />Завантажити</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {section === 'ready' && !view.creative && <div className="cmp-section pcd-embed"><Deliverables campaignId={campaign.id} notify={notify} /></div>}

      {form && (
        <div className="cmp-section pcd-embed">
          <RequestForm key={form.regularId || form.mode} campaign={campaign} mode={form.mode} allowKind={!!form.allowKind} title="Разове завдання: запит на креативи" initial={editing ? { ...editing.brief, materials: [] } : null}
            schedule={editing ? { weekdays: editing.weekdays, everyDays: editing.everyDays, time: editing.time } : null} canStartNow={!stopped} onClose={() => setForm(null)} onSave={saveForm} />
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
