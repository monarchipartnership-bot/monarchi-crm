import { useEffect, useMemo, useRef, useState } from 'react';
import MonthFullness from '../../../components/Reports/MonthFullness';
import EditableClientList from '../../../components/Reports/EditableClientList';
import DailyTaskRow from '../../../components/Automation/DailyTaskRow';
import TaskDetailModal from '../../../components/Automation/TaskDetailModal';
import { fetchSavedDays, fetchReportByDate, saveDailyReport } from '../../../lib/api/dailyReports';
import { fetchAllProfiles } from '../../../lib/api/profile';
import {
  fetchTasksForDay, createTask, setTaskStatus, moveTask, cancelTask, deleteTask, deleteTaskSeries, updateTaskFields,
} from '../../../lib/api/tasks';
import { useAuth } from '../../../contexts/AuthContext';
import { daysInMonth, defaultDayFor, fmtDate, isoDate, MONTH_NAMES, yearOptions } from '../../../lib/dateHelpers';
import { CLIENT_PLATFORMS, CLIENT_TYPES } from '../../../lib/reportConstants';
import { exportPDF, exportJPEG } from '../../../lib/exportHelpers';
import { SECTION_ICONS, CHANNEL_ICONS } from '../../../lib/reportIcons';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import '../../../styles/reportPage.css';
import '../../../styles/automationTasksPage.css';
import '../../../styles/automationDashboard.css';

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
  const { email: myEmail } = useAuth();

  const [period, setPeriod] = useState(initialPeriod);
  const [name, setName] = useState('');
  // `done`/`plans` — legacy free-text task lists, kept only so an
  // already-saved report's history is preserved verbatim (shown read-only
  // below, in "Архів"); new reports don't add to them any more, since
  // "Задачі на сьогодні" now lives in the shared `tasks` engine instead.
  const [done, setDone] = useState([]);
  const [clients, setClients] = useState([]);
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
  const [quickAddText, setQuickAddText] = useState('');
  const saveTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    fetchAllProfiles().then(setProfiles);
  }, []);

  // The report's own manager select stores a display label (profileLabel),
  // not an email — looked up here since tasks.assignee_email is always an
  // email, so "Задачі на сьогодні" can filter to the report's own manager.
  const managerEmail = useMemo(() => profiles.find((p) => profileLabel(p) === name)?.email || '', [profiles, name]);
  const dateIso = isoDate(period.year, period.month, period.day);

  function reloadTasks() {
    setTasksLoading(true);
    fetchTasksForDay(dateIso, 'sales')
      .then((rows) => setSalesTasks(managerEmail ? rows.filter((t) => t.assignee_email === managerEmail) : []))
      .catch((e) => console.warn('load sales tasks failed', e))
      .finally(() => setTasksLoading(false));
  }

  useEffect(() => {
    reloadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso, managerEmail]);

  function handlePeriodChange(next) {
    const dim = daysInMonth(next.year, next.month);
    setPeriod({ year: next.year, month: next.month, day: Math.min(next.day, dim) });
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
          setClients([{ id: makeId(), platform: CLIENT_PLATFORMS[0], leadType: CLIENT_TYPES[0], name: '', text: '' }]);
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

  async function handleToggleDone(task) {
    const next = task.status === 'done' ? 'pending' : 'done';
    setSalesTasks((t) => t.map((it) => (it.id === task.id ? { ...it, status: next } : it)));
    setViewTask((v) => (v && v.id === task.id ? { ...v, status: next } : v));
    try {
      await setTaskStatus(task.id, next);
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
    try {
      await cancelTask(task.id, reason);
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

  // An ad-hoc task not planned ahead — created straight into today, so
  // "щось зробив поза планом" doesn't need a separate free-text field.
  async function handleQuickAdd() {
    const text = quickAddText.trim();
    if (!text || !managerEmail) return;
    try {
      const row = await createTask({
        text, plannedDate: dateIso, taskDate: dateIso, assigneeEmail: managerEmail,
        department: 'sales', createdByEmail: myEmail,
      });
      setSalesTasks((t) => [...t, row]);
      setQuickAddText('');
    } catch (e) {
      alert('Помилка додавання: ' + (e.message || e));
    }
  }

  async function handleExportJPEG() {
    await exportJPEG(pageRef.current, `daily_report_${isoDate(period.year, period.month, period.day)}.jpg`, {
      onStart: () => { setExportingJPEG(true); setCapturing(true); },
      onEnd: () => { setExportingJPEG(false); setCapturing(false); },
    });
  }

  const clientsAdded = clients.filter((c) => c.name?.trim()).length;
  const tasksDoneCount = salesTasks.filter((t) => t.status === 'done').length;
  const tasksPendingCount = salesTasks.filter((t) => t.status === 'pending').length;
  const hasArchive = done.some((d) => d.text?.trim()) || plans.some((p) => p.text?.trim());

  return (
    <div className="report-page daily-report-page" ref={pageRef}>
      <section className="rpt-hero">
        <div className="rpt-hero-top-row">
          <div className="rpt-hero-heading">
            <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS.con }} />
            <h1>Daily Report</h1>
          </div>

          <div className="month-period-picker">
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Рік</label>
                <select value={period.year} onChange={(e) => handlePeriodChange({ ...period, year: +e.target.value })}>
                  {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>Місяць</label>
                <select value={period.month} onChange={(e) => handlePeriodChange({ ...period, month: +e.target.value })}>
                  {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                </select>
              </div>
            </div>
            <div className="wk-field-box month-period-day">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
              <div className="wk-field-body">
                <label>День</label>
                <select value={period.day} onChange={(e) => handlePeriodChange({ ...period, day: +e.target.value })}>
                  {Array.from({ length: daysInMonth(period.year, period.month) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MonthFullness
        year={period.year}
        month={period.month}
        currentDay={period.day}
        savedDays={savedDays}
        onSelectDay={(day) => handlePeriodChange({ ...period, day })}
      />

      <div className="rpt-layout">
        <div>
          <section className="report-section">
            <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />Клієнти</div>
            <EditableClientList
              items={clients}
              onChange={(id, item) => setClients((c) => c.map((it) => (it.id === id ? item : it)))}
              onAdd={() => setClients((c) => [...c, { id: makeId(), platform: CLIENT_PLATFORMS[0], leadType: CLIENT_TYPES[0], name: '', text: '' }])}
              onRemove={(id) => setClients((c) => c.filter((it) => it.id !== id))}
              capturing={capturing}
              iconBoxed
            />
          </section>

          <section className="report-section">
            <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />Задачі на сьогодні</div>
            {!managerEmail ? (
              <div className="empty-hint">Оберіть менеджера справа, щоб побачити його задачі на цей день.</div>
            ) : (
              <>
                {!capturing && (
                  <div className="task-add-row" style={{ marginBottom: 14 }}>
                    <input
                      type="text"
                      value={quickAddText}
                      onChange={(e) => setQuickAddText(e.target.value)}
                      placeholder="Незапланована задача — додати одразу на сьогодні..."
                    />
                    <button type="button" className="btn btn-p" onClick={handleQuickAdd} disabled={!quickAddText.trim()}>+ Додати</button>
                  </div>
                )}
                {tasksLoading ? (
                  <div className="empty-hint">Завантаження...</div>
                ) : salesTasks.length === 0 ? (
                  <div className="empty-hint">На сьогодні немає запланованих задач — сплануйте тиждень у Weekly Tasks.</div>
                ) : (
                  <div className="task-list">
                    {salesTasks.map((task) => (
                      <DailyTaskRow
                        key={task.id}
                        task={task}
                        onView={openView}
                        onToggleDone={handleToggleDone}
                        onMove={openMove}
                        onCancel={openCancel}
                        onDelete={handleDeleteTask}
                        onDeleteSeries={handleDeleteSeries}
                        onSubtasksChange={handleSubtasksChange}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {hasArchive && (
            <section className="report-section">
              <div className="stitle">Архів (до оновлення)</div>
              <p className="empty-hint" style={{ marginBottom: 10 }}>Збережено до переходу на новий рушій задач — лише перегляд.</p>
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
            </section>
          )}
        </div>

        <div className="wk-sidebar">
          <div className="wk-side-panel">
            <div className="wk-side-label">Менеджер</div>
            <select className="mgr-select" value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">Оберіть менеджера</option>
              {profiles.map((p) => <option key={p.email} value={profileLabel(p)}>{profileLabel(p)}</option>)}
            </select>
          </div>
          <div className="wk-side-panel">
            <div className="wk-side-label">Завантажити</div>
            {!capturing && (
              <div className="rpt-hero-actions">
                <button type="button" className="btn" onClick={exportPDF}>&#8595; PDF</button>
                <button type="button" className="btn" onClick={handleExportJPEG} disabled={exportingJPEG}>
                  {exportingJPEG ? '...' : <>&#8595; JPEG</>}
                </button>
              </div>
            )}
            <div className="save-state">{statusLabel}</div>
          </div>
          <div className="wk-side-panel">
            <div className="wk-side-label">Сьогодні {fmtDate(period.year, period.month, period.day)}</div>
            <div className="wk-side-stat"><span>Клієнти додано</span><b>{clientsAdded}</b></div>
            <div className="wk-side-stat"><span>Задач виконано</span><b>{tasksDoneCount}</b></div>
            <div className="wk-side-stat"><span>Задач в очікуванні</span><b>{tasksPendingCount}</b></div>
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
    </div>
  );
}
