import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DailyReportHero from '../../../components/Reports/DailyReportHero';
import ReportTypeSwitcher from '../../../components/Reports/ReportTypeSwitcher';
import ActionIcon from '../../../components/common/ActionIcon';
import AddClientModal from '../../../components/Reports/AddClientModal';
import TaskDetailModal from '../../../components/Automation/TaskDetailModal';
import TaskFormModal from '../../../pages/TaskManager/TaskFormModal';
import TaskBadges from '../../../components/Automation/TaskBadges';
import TaskSubtasks from '../../../components/Automation/TaskSubtasks';
import ClientAvatar from '../../../components/Clients/ClientAvatar';
import { colorForTag } from '../../../lib/tagColors';
import { deriveDueStatus } from '../../../lib/dueStatus';
import { iconForTag } from '../../../lib/tagIcons';
import { fetchSavedDays, fetchReportByDate, saveDailyReport } from '../../../lib/api/dailyReports';
import { fetchAllProfiles } from '../../../lib/api/profile';
import { syncReportClientsToDirectory } from '../../../lib/reportClientSync';
import { fetchOpenDealForClient } from '../../../lib/api/deals';
import { fetchPipelines } from '../../../lib/api/pipelines';
import { stagePillStyle } from '../../../lib/stagePillStyle';
import {
  fetchTasksForDay, moveTask, deleteTask, deleteTaskSeries, updateTaskFields,
} from '../../../lib/api/tasks';
import { fetchDepartmentIdByName } from '../../../lib/api/departments';
import { fetchTaskStages, moveTaskStage } from '../../../lib/api/taskStages';
import { MONTH_NAMES, daysInMonth, defaultDayFor, fmtDate, isoDate } from '../../../lib/dateHelpers';
import { CLIENT_PLATFORMS } from '../../../lib/reportConstants';
import { STATUSES, STATUS_META } from '../../../lib/clientStatus';
import { platformColor, platformLogo } from '../../../lib/platforms';
import { exportPDF, exportJPEG } from '../../../lib/exportHelpers';
import { SECTION_ICONS } from '../../../lib/reportIcons';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import Select from '../../../components/common/Select';
import DonutChart from '../../../components/Automation/DonutChart';
import '../../../styles/reportPage.css';
import '../../../styles/dailyReportDesign.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/automationDashboard.css';
import '../../../styles/dealsBoard.css';
import '../../../styles/comparePage.css';
import '../../../styles/clientsDirectory.css';

// Status chip colour: the shared pill style plus the colour itself, which the folder design uses for a pale chip with a coloured dot.
const chipStyle = (color) => ({ ...stagePillStyle(color), '--chip': color });

const MONTH_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

// True while the window is at least `query` wide (the manager / save state / exports then sit in the top bar).
function useMatchMedia(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

function makeId() {
  return crypto.randomUUID();
}

function profileLabel(p) {
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || p.email;
}

function initialPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, day: defaultDayFor(year, month) };
}

export default function DailyCreate() {
  const pageRef = useRef(null);
  const navigate = useNavigate();

  const [period, setPeriod] = useState(initialPeriod);
  const [name, setName] = useState('');
  // `done`/`plans` — legacy free-text task lists, kept only so an
  // already-saved report's history is preserved verbatim (shown read-only
  // below, in "Архів"); new reports don't add to them any more, since
  // "Задачі на сьогодні" now lives in the shared `tasks` engine instead.
  const [done, setDone] = useState([]);
  const [clients, setClients] = useState([]);
  // Клієнти "Додати"/"Редагувати" popup — null (closed), 'new' (blank form),
  // or the row object being edited in place. See AddClientModal.jsx.
  const [clientModal, setClientModal] = useState(null);
  // Клієнти row id currently expanded to reveal its "Відкрити угоду"/
  // "Відкрити контакт" shortcut buttons — at most one at a time.
  const [expandedClientId, setExpandedClientId] = useState(null);
  // Same idea for Задачі rows (Виконано/Перенести/Скасувати/Редагувати).
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [savedDays, setSavedDays] = useState(() => new Set());
  const [statusLabel, setStatusLabel] = useState('—');
  const [capturing, setCapturing] = useState(false);
  const [exportingJPEG, setExportingJPEG] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [salesTasks, setSalesTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [viewTask, setViewTask] = useState(null);
  const [viewInitialMode, setViewInitialMode] = useState('view');
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [salesDeptId, setSalesDeptId] = useState(null);
  const [salesStages, setSalesStages] = useState([]);
  const wide = useMatchMedia('(min-width: 1100px)');
  const [toolbarSlot, setToolbarSlot] = useState(null);
  useEffect(() => { setToolbarSlot(document.getElementById('topbar-slot')); }, []);
  const saveTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    fetchAllProfiles().then(setProfiles);
  }, []);

  // Задачі на сьогодні is a fixed "Sales department only" surface (not
  // user-configurable) — resolve its real department id once, then its
  // stage pipeline + categories, so quick actions can move tasks along
  // Sales' own stages instead of a bare status toggle.
  useEffect(() => {
    fetchDepartmentIdByName('Sales відділ').then((id) => {
      setSalesDeptId(id);
      if (!id) return;
      fetchTaskStages(id).then(setSalesStages);
    });
  }, []);

  // "Click elsewhere collapses it back" — a row's own onClick toggles/
  // switches expandedClientId already; this only needs to catch a click
  // that lands outside the whole Клієнти list.
  useEffect(() => {
    if (!expandedClientId) return;
    function onDocClick(e) { if (!e.target.closest('.daily-client-grid')) setExpandedClientId(null); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [expandedClientId]);

  useEffect(() => {
    if (!expandedTaskId) return;
    function onDocClick(e) { if (!e.target.closest('.daily-task-grid')) setExpandedTaskId(null); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [expandedTaskId]);

  // The report's own manager select stores a display label (profileLabel),
  // not an email — looked up here since tasks.assignee_email is always an
  // email, so "Задачі на сьогодні" can filter to the report's own manager.
  const managerEmail = useMemo(() => profiles.find((p) => profileLabel(p) === name)?.email || '', [profiles, name]);
  const dateIso = isoDate(period.year, period.month, period.day);

  function reloadTasks() {
    if (!salesDeptId) return;
    setTasksLoading(true);
    fetchTasksForDay(dateIso, salesDeptId)
      .then((rows) => setSalesTasks(managerEmail ? rows.filter((t) => t.assignee_email === managerEmail) : []))
      .catch((e) => console.warn('load sales tasks failed', e))
      .finally(() => setTasksLoading(false));
  }

  useEffect(() => {
    reloadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso, managerEmail, salesDeptId]);

  function handlePeriodChange(next) {
    const dim = daysInMonth(next.year, next.month);
    setPeriod({ year: next.year, month: next.month, day: Math.min(next.day, dim) });
  }

  function handleMonthNav(delta) {
    let y = period.year, m = period.month + delta;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    // Keeping the same day-of-month across a month switch highlighted a day
    // that hadn't happened yet for any future month (or one long past, for
    // an earlier one) — jump to today's date if that's the real current
    // month, otherwise the 1st, same rule the page's own initial load uses.
    handlePeriodChange({ year: y, month: m, day: defaultDayFor(y, m) });
  }

  useEffect(() => {
    let cancelled = false;
    fetchSavedDays(period.year, period.month).then((days) => { if (!cancelled) setSavedDays(days); });
    return () => { cancelled = true; };
  }, [period.year, period.month]);

  useEffect(() => {
    let cancelled = false;
    setStatusLabel('Завантаження...');
    fetchReportByDate(period.year, period.month, period.day)
      .then((row) => {
        if (cancelled) return;
        skipNextSaveRef.current = true;
        if (row) {
          const data = row.data || {};
          setName(data.name || row.author || '');
          setDone((data.done || []).map((it) => ({ ...it, id: it.id || makeId() })));
          setClients((data.clients || []).map((it) => ({ ...it, id: makeId() })));
          setPlans((data.plans || []).map((it) => ({ ...it, id: it.id || makeId() })));
          setStatusLabel('Збережено ' + new Date(row.updated_at).toLocaleString('uk-UA'));
        } else {
          setName('');
          setDone([]);
          setClients([{ id: makeId(), platform: CLIENT_PLATFORMS[0], leadType: STATUSES[0], name: '', title: '', text: '', clientId: null, channel: '', upworkChannel: '' }]);
          setPlans([]);
          setStatusLabel('Ще не збережено');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('loadReport failed', e);
        setStatusLabel('Помилка завантаження');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.year, period.month, period.day]);

  // Autosave — debounced so a burst of keystrokes across done/clients/plans
  // collapses into one write; skipped once right after a period's data loads
  // so re-populating the form from a fetched row doesn't immediately re-save it.
  useEffect(() => {
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    clearTimeout(saveTimerRef.current);
    setStatusLabel('Зберігається...');
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveDailyReport({ year: period.year, month: period.month, day: period.day, name, done, clients, plans });
        setSavedDays((prev) => new Set(prev).add(period.day));
        setStatusLabel('Збережено ' + new Date().toLocaleString('uk-UA'));
        syncReportClientsToDirectory(clients, name, isoDate(period.year, period.month, period.day), (rowId, clientId) => {
          setClients((cs) => cs.map((it) => (it.id === rowId ? { ...it, clientId } : it)));
        });
      } catch (e) {
        console.warn('autosave failed', e);
        setStatusLabel('Помилка збереження');
      }
    }, 900);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, done, clients, plans]);

  // ---- Задачі на сьогодні (live tasks-engine widget, replaces the old
  // free-text done/plans sections for anything created going forward) ----
  function openView(task) { setViewTask(task); setViewInitialMode('view'); }
  function openMove(task) { setViewTask(task); setViewInitialMode('move'); }
  function openCancel(task) { setViewTask(task); setViewInitialMode('cancel'); }

  // "Виконано"/"Повернути" now moves the task along Sales' own stage
  // pipeline instead of flipping a bare status string — landing on the
  // department's is_done stage, or back to its first (position 1) stage.
  async function handleToggleDone(task) {
    const doneStage = salesStages.find((s) => s.is_done);
    const firstStage = salesStages[0];
    const currentIsDone = salesStages.find((s) => s.id === task.stage_id)?.is_done;
    const targetStage = currentIsDone ? firstStage : doneStage;
    if (!targetStage) return;
    setSalesTasks((t) => t.map((it) => (it.id === task.id ? { ...it, stage_id: targetStage.id, status: currentIsDone ? 'pending' : 'done' } : it)));
    setViewTask((v) => (v && v.id === task.id ? { ...v, stage_id: targetStage.id, status: currentIsDone ? 'pending' : 'done' } : v));
    try {
      await moveTaskStage(task.id, targetStage);
    } catch (e) {
      alert('Помилка: ' + (e.message || e));
      reloadTasks();
    }
  }

  async function handleMove(task, newDateIso, reason) {
    try {
      await moveTask(task.id, newDateIso, reason);
      setViewTask(null);
      reloadTasks();
    } catch (e) {
      alert('Помилка перенесення: ' + (e.message || e));
      reloadTasks();
    }
  }

  async function handleCancel(task, reason) {
    const cancelledStage = salesStages.find((s) => s.is_cancelled);
    if (!cancelledStage) return;
    try {
      await moveTaskStage(task.id, cancelledStage, reason);
      setViewTask(null);
      reloadTasks();
    } catch (e) {
      alert('Помилка скасування: ' + (e.message || e));
      reloadTasks();
    }
  }

  async function handleSaveEdits(task, patchFields) {
    setSalesTasks((t) => t.map((it) => (it.id === task.id ? { ...it, ...patchFields } : it)));
    setViewTask((v) => (v && v.id === task.id ? { ...v, ...patchFields } : v));
    try {
      await updateTaskFields(task.id, patchFields);
    } catch (e) {
      alert('Помилка збереження: ' + (e.message || e));
      reloadTasks();
    }
  }

  async function handleSubtasksChange(task, subtasks) {
    setSalesTasks((t) => t.map((it) => (it.id === task.id ? { ...it, subtasks } : it)));
    setViewTask((v) => (v && v.id === task.id ? { ...v, subtasks } : v));
    try {
      await updateTaskFields(task.id, { subtasks });
    } catch (e) {
      console.warn('updateTaskFields (subtasks) failed', e);
      reloadTasks();
    }
  }

  async function handleDeleteTask(task) {
    if (!confirm('Видалити цю задачу?')) return;
    setSalesTasks((t) => t.filter((it) => it.id !== task.id));
    try {
      await deleteTask(task.id);
    } catch (e) {
      alert('Помилка видалення: ' + (e.message || e));
      reloadTasks();
    }
  }

  async function handleDeleteSeries(task) {
    if (!confirm('Видалити всі майбутні задачі цієї серії (ще не виконані)? Минулі залишаться.')) return;
    try {
      await deleteTaskSeries(task.series_id, dateIso);
      reloadTasks();
    } catch (e) {
      alert('Помилка видалення серії: ' + (e.message || e));
    }
  }

  async function handleExportJPEG() {
    await exportJPEG(pageRef.current, `daily_report_${isoDate(period.year, period.month, period.day)}.jpg`, {
      onStart: () => { setExportingJPEG(true); setCapturing(true); },
      onEnd: () => { setExportingJPEG(false); setCapturing(false); },
    });
  }

  // Looks up this client's own open deal in the pipeline matching the row's
  // platform (same matching rule reportClientSync.js uses to find/create it)
  // — the row itself only knows `clientId`, never the deal's own id, since
  // the deal is created asynchronously by the report's own autosave.
  async function handleOpenDeal(item) {
    if (!item.clientId) return;
    const pipelines = await fetchPipelines();
    const pipeline = pipelines.find((p) => p.name === item.platform);
    if (!pipeline) return;
    const deal = await fetchOpenDealForClient(item.clientId, pipeline.id);
    if (deal) navigate(`/reports/deals?open=${deal.id}`);
    else alert('Відкриту угоду для цього клієнта ще не знайдено.');
  }

  const clientsAdded = clients.filter((c) => c.name?.trim()).length;
  const tasksDoneCount = salesTasks.filter((t) => t.status === 'done').length;
  const tasksPendingCount = salesTasks.filter((t) => t.status === 'pending').length;

  // Same over/done/future classification as DailyReportHero's own day
  // pills, aggregated into month-wide counts for the sidebar's "Заповненість
  // місяця" donut — weekends fold into `future` here (no report expected
  // there either way), matching the day-strip's own "always neutral"
  // treatment while keeping this summary to the same 3 buckets shown there.
  const monthFillStats = useMemo(() => {
    const dim = daysInMonth(period.year, period.month);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let done = 0, over = 0, future = 0;
    for (let d = 1; d <= dim; d++) {
      const thisDate = new Date(period.year, period.month - 1, d);
      thisDate.setHours(0, 0, 0, 0);
      const dow = thisDate.getDay();
      if (dow === 0 || dow === 6 || thisDate.getTime() > today.getTime()) future++;
      else if (savedDays.has(d)) done++;
      else over++;
    }
    return { done, over, future, total: dim, pct: dim > 0 ? Math.round((done / dim) * 100) : 0 };
  }, [period.year, period.month, savedDays]);
  const hasArchive = done.some((d) => d.text?.trim()) || plans.some((p) => p.text?.trim());

  const saveTone = /^Помилка/.test(statusLabel) ? 'err' : /^Збережено/.test(statusLabel) ? 'ok' : /^(Завантаження|Зберігається)/.test(statusLabel) ? 'busy' : 'idle';
  // Manager, save state and exports: in the top bar when the window is wide, in the side pocket otherwise (never both).
  const controls = (
    <div className="daily-controls" data-dd="plum">
      <div className="daily-manager">
        <Select
          value={name} onChange={setName} placeholder="Оберіть менеджера" side="left" ariaLabel="Менеджер"
          options={[{ value: '', label: 'Не обрано' }, ...profiles.map((p) => ({ value: profileLabel(p), label: profileLabel(p) }))]}
        />
      </div>
      <span className={'daily-save-state daily-save-state--' + saveTone} role="status" aria-live="polite">{statusLabel}</span>
      {!capturing && (
        <>
          <button type="button" className="btn" onClick={exportPDF}><ActionIcon name="download" size={18} /> PDF</button>
          <button type="button" className="btn" onClick={handleExportJPEG} disabled={exportingJPEG}>
            {exportingJPEG ? '...' : <><ActionIcon name="download" size={18} /> JPEG</>}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="report-page daily-report-page daily-report-design" data-dd="plum" ref={pageRef}>
      {wide && toolbarSlot && createPortal(controls, toolbarSlot)}
      <div className="folder-shell">
        {!capturing && <ReportTypeSwitcher />}
        <div className="folder-sheet">
      <DailyReportHero
        year={period.year}
        month={period.month}
        currentDay={period.day}
        savedDays={savedDays}
        onSelectDay={(day) => handlePeriodChange({ ...period, day })}
        onChangeMonth={handleMonthNav}
      />

      <div className="rpt-layout">
        <div className="folder-main">
          <section className="report-section folder-section">
            <div className="stitle">
              <span className="section-tab">
                <span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
                Клієнти <b className="section-count">{clients.length}</b>
              </span>
              {!capturing && (
                <button type="button" className="btn stitle-filter" onClick={() => setClientModal('new')}>
                  <ActionIcon name="create" size={18} /> Додати клієнта
                </button>
              )}
            </div>
            {clients.length === 0 ? (
              <div className="empty-hint">Немає клієнтів &mdash; додайте першого.</div>
            ) : (
              <div className="client-grid daily-client-grid">
                <div className="client-grid-header">
                  <div>Клієнт</div>
                  <div>Статус</div>
                  <div>Платформа</div>
                  <div>Назва угоди</div>
                  <div />
                </div>
                {clients.map((item) => {
                  const brandColor = item.platform ? platformColor(item.platform) : null;
                  const brandLogo = item.platform ? platformLogo(item.platform) : null;
                  const statusMeta = item.leadType ? STATUS_META[item.leadType] : null;
                  const expanded = expandedClientId === item.id;
                  const toggleRow = () => setExpandedClientId((cur) => (cur === item.id ? null : item.id));
                  return (
                    <div
                      className={'client-grid-row' + (expanded ? ' expanded' : '')}
                      key={item.id}
                      onClick={() => !capturing && toggleRow()}
                    >
                      <div className="daily-list-row-main">
                        <div className="client-grid-name-cell">
                          <ClientAvatar name={item.name || '?'} size={34} />
                          <div className="client-grid-name-text">
                            <div className="ink">{item.name || '—'}</div>
                          </div>
                        </div>
                        <div>
                          {statusMeta ? (
                            <span className="client-grid-badge client-grid-status-badge" style={chipStyle(statusMeta.color)}>
                              <span className="client-grid-status-dot" style={{ background: 'rgba(255,255,255,.7)' }} />
                              {item.leadType}
                            </span>
                          ) : '—'}
                        </div>
                        <div>
                          {item.platform ? (
                            <span
                              className="client-grid-badge client-grid-badge--platform"
                              style={{
                                color: brandColor,
                                background: `linear-gradient(135deg, #fff, ${brandColor}26)`,
                                border: `1px solid ${brandColor}55`,
                                boxShadow: `0 3px 8px -3px ${brandColor}66`,
                              }}
                            >
                              {brandLogo && <img className="client-grid-badge-logo" src={brandLogo} alt="" />}
                              {item.platform}
                            </span>
                          ) : '—'}
                        </div>
                        <div className="client-grid-plain">{item.title || '—'}</div>
                        {!capturing ? (
                          <button
                            type="button" className="row-more" aria-label="Дії з клієнтом" aria-expanded={expanded}
                            onClick={(e) => { e.stopPropagation(); toggleRow(); }}
                            dangerouslySetInnerHTML={{ __html: FIELD_ICONS.more }}
                          />
                        ) : <div />}
                      </div>
                      {!capturing && expanded && (
                        <div className="daily-list-row-actions">
                          <button
                            type="button" className="row-action" title="Відкрити угоду"
                            onClick={(e) => { e.stopPropagation(); handleOpenDeal(item); }}
                            disabled={!item.clientId}
                          ><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />Відкрити угоду</button>
                          <button
                            type="button" className="row-action" title="Відкрити контакт"
                            onClick={(e) => { e.stopPropagation(); navigate(`/reports/clients-directory/${item.clientId}`); }}
                            disabled={!item.clientId}
                          ><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.user }} />Відкрити контакт</button>
                          <button
                            type="button" className="row-action" title="Редагувати" aria-label="Редагувати"
                            onClick={(e) => { e.stopPropagation(); setClientModal(item); }}
                          ><ActionIcon name="edit" size={18} />Редагувати</button>
                          <button
                            type="button" className="row-action row-action--danger" title="Видалити" aria-label="Видалити"
                            onClick={(e) => { e.stopPropagation(); setClients((c) => c.filter((it) => it.id !== item.id)); }}
                          ><ActionIcon name="delete" size={18} />Видалити</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {clientModal && (
            <AddClientModal
              initial={clientModal === 'new' ? null : clientModal}
              defaultPlatform={CLIENT_PLATFORMS[0]}
              defaultStatus={STATUSES[0]}
              onClose={() => setClientModal(null)}
              onSave={(fields) => {
                if (clientModal === 'new') {
                  setClients((c) => [...c, { id: makeId(), clientId: null, ...fields }]);
                } else {
                  setClients((c) => c.map((it) => (it.id === clientModal.id ? { ...it, ...fields } : it)));
                }
                setClientModal(null);
              }}
            />
          )}

          <section className="report-section folder-section">
            <div className="stitle">
              <span className="section-tab">
                <span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
                Задачі на сьогодні {managerEmail && !tasksLoading && <b className="section-count">{salesTasks.length}</b>}
              </span>
              {!capturing && managerEmail && salesDeptId && (
                <button type="button" className="btn stitle-filter" onClick={() => setTaskFormOpen(true)}>
                  <ActionIcon name="create" size={18} /> Додати задачу
                </button>
              )}
            </div>
            {!managerEmail ? (
              <div className="empty-hint">Оберіть менеджера, щоб побачити його задачі на цей день.</div>
            ) : (
              <>
                {tasksLoading ? (
                  <div className="empty-hint">Завантаження...</div>
                ) : salesTasks.length === 0 ? (
                  <div className="empty-hint">На сьогодні немає запланованих задач — сплануйте тиждень у Task Manager.</div>
                ) : (
                  <div className="client-grid daily-task-grid">
                    <div className="client-grid-header">
                      <div>Задача</div>
                      <div>Статус</div>
                      <div>Підзадачі</div>
                      <div />
                    </div>
                    {salesTasks.map((task) => {
                      const done = task.status === 'done';
                      const expanded = expandedTaskId === task.id;
                      const isOverdue = deriveDueStatus(task) === 'overdue';
                      const primaryTag = task.tags?.[0];
                      const [title, ...descParts] = (task.text || '').split('\n');
                      const description = descParts.join(' ').trim();
                      const subs = task.subtasks || [];
                      const subsDone = subs.filter((s) => s.done).length;
                      const toggleRow = () => setExpandedTaskId((cur) => (cur === task.id ? null : task.id));
                      return (
                        <div key={task.id}>
                          <div
                            className={'client-grid-row' + (expanded ? ' expanded' : '') + (isOverdue ? ' overdue' : '')}
                            onClick={() => !capturing && toggleRow()}
                          >
                            <div className="daily-list-row-main">
                              <div className="client-grid-name-cell">
                                {!capturing && (
                                  <input
                                    type="checkbox" className="task-check" checked={done}
                                    aria-label={done ? 'Повернути задачу' : 'Позначити задачу виконаною'}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => handleToggleDone(task)}
                                  />
                                )}
                                <span
                                  className="daily-task-grid-icon"
                                  style={{ background: colorForTag(primaryTag || 'default') }}
                                  dangerouslySetInnerHTML={{ __html: iconForTag(primaryTag) }}
                                />
                                <div className="client-grid-name-text">
                                  <div className="ink">{title}</div>
                                  {description && <div className="client-grid-subtitle">{description}</div>}
                                  <TaskBadges task={task} />
                                </div>
                              </div>
                              <div className="daily-task-status-cell">
                                {isOverdue && (
                                  <span className="client-grid-badge client-grid-status-badge" style={chipStyle('#D14343')}>
                                    <span className="client-grid-status-dot" style={{ background: 'rgba(255,255,255,.7)' }} />
                                    Протерміновано
                                  </span>
                                )}
                                <span className="client-grid-badge client-grid-status-badge" style={chipStyle(done ? '#1E9E5D' : '#F59E0B')}>
                                  <span className="client-grid-status-dot" style={{ background: 'rgba(255,255,255,.7)' }} />
                                  {done ? 'Виконано' : 'В очікуванні'}
                                </span>
                              </div>
                              <div className="task-progress" aria-label={subs.length ? `Підзадачі: ${subsDone} з ${subs.length}` : 'Підзадач немає'}>
                                {subs.length > 0 ? (
                                  <>
                                    <span className="task-progress-count">{subsDone}/{subs.length}</span>
                                    <span className="task-progress-bar"><span style={{ width: (subsDone / subs.length) * 100 + '%' }} /></span>
                                  </>
                                ) : '—'}
                              </div>
                              {!capturing ? (
                                <button
                                  type="button" className="row-more" aria-label="Дії із задачею" aria-expanded={expanded}
                                  onClick={(e) => { e.stopPropagation(); toggleRow(); }}
                                  dangerouslySetInnerHTML={{ __html: FIELD_ICONS.more }}
                                />
                              ) : <div />}
                            </div>
                            {!capturing && expanded && (
                              <div className="daily-list-row-actions">
                                {done ? (
                                  <button
                                    type="button" className="row-action" title="Повернути"
                                    onClick={(e) => { e.stopPropagation(); handleToggleDone(task); }}
                                  ><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} />Повернути</button>
                                ) : (
                                  <>
                                    <button
                                      type="button" className="row-action" title="Виконано"
                                      onClick={(e) => { e.stopPropagation(); handleToggleDone(task); }}
                                    ><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />Виконано</button>
                                    <button
                                      type="button" className="row-action" title="Перенести"
                                      onClick={(e) => { e.stopPropagation(); openMove(task); }}
                                    ><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />Перенести</button>
                                    <button
                                      type="button" className="row-action" title="Скасувати" aria-label="Скасувати"
                                      onClick={(e) => { e.stopPropagation(); openCancel(task); }}
                                    ><ActionIcon name="close" size={18} />Скасувати</button>
                                  </>
                                )}
                                <button
                                  type="button" className="row-action" title="Редагувати" aria-label="Редагувати"
                                  onClick={(e) => { e.stopPropagation(); openView(task); }}
                                ><ActionIcon name="edit" size={18} />Редагувати</button>
                              </div>
                            )}
                          </div>
                          <TaskSubtasks
                            subtasks={task.subtasks}
                            onChange={(next) => handleSubtasksChange(task, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <aside className="side-pocket-col">
          {!(wide && toolbarSlot) && (
            <div className="side-pocket pocket-controls">
              <h3>Менеджер і експорт</h3>
              {controls}
            </div>
          )}
          <div className="side-pocket pocket-summary">
            <h3>Підсумок за {period.day} {MONTH_GENITIVE[period.month - 1]}</h3>
            <div className="summary-stats">
              <div><b>{clientsAdded}</b><span>клієнтів додано</span></div>
              <div><b>{tasksDoneCount}</b><span>задач виконано</span></div>
              <div><b>{tasksPendingCount}</b><span>в очікуванні</span></div>
            </div>
            <p className="summary-meta">Менеджер: <b>{name || 'не обрано'}</b> · {fmtDate(period.year, period.month, period.day)}</p>
          </div>
          <div className="side-pocket pocket-progress">
            <h3>Прогрес за місяць</h3>
            <div className="progress-row">
              <div className="progress-ring">
                <DonutChart
                  slices={[
                    { label: 'Внесено', value: monthFillStats.done, color: '#1E9E5D' },
                    { label: 'Просрочено', value: monthFillStats.over, color: '#D14343' },
                    { label: 'Ще не настав', value: monthFillStats.future, color: '#E1D9EA' },
                  ]}
                  centerValue={`${monthFillStats.pct}%`}
                  showLegend={false}
                  gradient smallCenter
                />
              </div>
              <ul className="progress-legend">
                <li className="done"><span>Внесено</span><b>{monthFillStats.done}</b></li>
                <li className="over"><span>Прострочено</span><b>{monthFillStats.over}</b></li>
                <li className="future"><span>Ще не настав</span><b>{monthFillStats.future}</b></li>
                <li className="total"><span>Всього ({MONTH_NAMES[period.month - 1].toLowerCase()})</span><b>{monthFillStats.total}</b></li>
              </ul>
            </div>
          </div>
          {hasArchive && (
            <div className="side-pocket pocket-archive">
              <h3>Архів (до оновлення)</h3>
              <p className="archive-note">Збережено до переходу на новий рушій задач — лише перегляд.</p>
              {done.filter((d) => d.text?.trim()).length > 0 && (
                <>
                  <div className="ssub">Виконано за день</div>
                  <ul className="archive-list">{done.filter((d) => d.text?.trim()).map((d) => <li key={d.id}>{d.text}</li>)}</ul>
                </>
              )}
              {plans.filter((p) => p.text?.trim()).length > 0 && (
                <>
                  <div className="ssub">Плани на завтра</div>
                  <ul className="archive-list">{plans.filter((p) => p.text?.trim()).map((p) => <li key={p.id}>{p.text}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
        </div>
      </div>

      {viewTask && (
        <TaskDetailModal
          task={viewTask}
          assigneeOptions={[]}
          initialMode={viewInitialMode}
          onClose={() => setViewTask(null)}
          onToggleDone={handleToggleDone}
          onMove={handleMove}
          onCancel={handleCancel}
          onDelete={handleDeleteTask}
          onDeleteSeries={handleDeleteSeries}
          onSubtasksChange={handleSubtasksChange}
          onSaveEdits={handleSaveEdits}
        />
      )}

      {taskFormOpen && (
        <TaskFormModal
          departments={[{ id: salesDeptId, name: 'Sales відділ' }]}
          defaultDepartmentId={salesDeptId}
          defaultAssigneeEmail={managerEmail}
          defaultTaskDate={dateIso}
          onClose={() => setTaskFormOpen(false)}
          onSaved={reloadTasks}
        />
      )}
    </div>
  );
}
