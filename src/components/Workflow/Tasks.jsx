import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createTask, fetchTasks, setTaskOwner, setTaskStatus } from '../../lib/api/workflow';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';
import { Pill } from './parts';
import { FILTERS, OWNER_LABEL, PRIORITY_LABEL, TYPE_LABEL, ageDays, digest, dueState, filterCounts, filterTasks, groupTasks, hasDraft, isBlocker, isOpen, parseEvidence, sourceLabel } from '../../lib/workflow/tasks';

const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : '');
const DUE_TONE = { overdue: 'bad', today: 'warn', soon: 'warn' };
const DUE_TEXT = { overdue: 'прострочено', today: 'сьогодні', soon: 'скоро' };

// One task: the head is a button, the body (evidence or the draft with «Скопіювати») opens under it.
function Task({ t, busy, onAct }) {
  const [open, setOpen] = useState(false);
  const [reject, setReject] = useState(false);
  const [why, setWhy] = useState('');
  const [note, setNote] = useState('');
  const { note: text, draft } = parseEvidence(t.evidence);
  const due = dueState(t);
  const live = isOpen(t);
  async function copy() {
    try { await navigator.clipboard.writeText(draft); setNote('Скопійовано. Вставте в чат клієнта.'); } catch { setNote('Не вдалося скопіювати автоматично: виділіть текст і скопіюйте вручну.'); }
  }
  return (
    <div className={'wf-task' + (live ? '' : ' done') + (open ? ' op' : '')}>
      <button type="button" className="hd" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={'dot ' + t.priority} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{t.title}</b>
          <span className="wf-row" style={{ marginTop: 4 }}>
            <span className="wf-chip">{TYPE_LABEL[t.type] || t.type}</span>
            <Pill tone="mute">{OWNER_LABEL[t.owner] || t.owner}</Pill>
            {draft && <Pill tone="info">чернетка</Pill>}
            {t.status === 'in_progress' && <Pill tone="info">в роботі</Pill>}
            {t.status === 'rejected' && <Pill tone="mute">відхилено</Pill>}
            {t.due_date && <span className={'wf-muted'} style={{ fontSize: 12.5 }}>до {dmy(t.due_date)}</span>}
            {due && <Pill tone={DUE_TONE[due]}>{DUE_TEXT[due]}</Pill>}
          </span>
        </span>
        <span className="chv" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></span>
      </button>
      {open && (
        <div className="wf-col">
          {text && <div className="wf-ev">{text}</div>}
          {draft && <div className="wf-ev draft">{draft}</div>}
          <div className="wf-muted" style={{ fontSize: 12 }}>{sourceLabel(t)} · {ageDays(t) ? `${ageDays(t)} дн. тому` : 'сьогодні'}{t.result ? ` · ${t.result}` : ''}</div>
          {live && (
            <div className="wf-row">
              {draft && <button type="button" className="wf-btn p sm" onClick={copy}>Скопіювати</button>}
              {draft ? <button type="button" className="wf-btn sm" disabled={busy} onClick={() => onAct(t, 'done', 'Надіслано клієнту')}>Надіслано</button> : <>
                {t.status !== 'in_progress' && <button type="button" className="wf-btn p sm" disabled={busy} onClick={() => onAct(t, 'in_progress')}>Взяти в роботу</button>}
                <button type="button" className="wf-btn sm" disabled={busy} onClick={() => onAct(t, 'done')}>Готово</button>
              </>}
              <button type="button" className="wf-btn sm d" disabled={busy} onClick={() => setReject((r) => !r)}>Відхилити</button>
              {t.owner === 'manager' ? <button type="button" className="wf-btn sm" disabled={busy} onClick={() => onAct(t, null, null, 'client')}>Передати клієнту</button> : <button type="button" className="wf-btn sm" disabled={busy} onClick={() => onAct(t, null, null, 'manager')}>Повернути собі</button>}
            </div>
          )}
          {reject && live && (
            <div className="wf-composer">
              <label className="wf-muted" style={{ fontSize: 12.5 }}>Чому відхиляєте (агенти врахують)<textarea className="wf-cmt" value={why} onChange={(e) => setWhy(e.target.value)} /></label>
              <div className="wf-row"><button type="button" className="wf-btn d sm" disabled={busy} onClick={() => onAct(t, 'rejected', why)}>Відхилити задачу</button></div>
            </div>
          )}
          {note && <div className="wf-muted" style={{ fontSize: 12.5 }}>{note}</div>}
        </div>
      )}
    </div>
  );
}

function AddTask({ projectId, email, onDone }) {
  const [f, setF] = useState({ title: '', type: 'client', owner: 'manager', priority: 'medium', due_date: '', evidence: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setV = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() { setBusy(true); setErr(''); try { await createTask(projectId, f, email); setF({ title: '', type: 'client', owner: 'manager', priority: 'medium', due_date: '', evidence: '' }); onDone(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } }
  return (
    <div className="wf-card wf-col">
      <h3>Нова задача</h3>
      <input className="wf-inp" aria-label="Що треба зробити" placeholder="Що треба зробити" value={f.title} onChange={set('title')} />
      <div className="wf-fr">
        <label className="wf-fld"><span>Тип</span><Select ariaLabel="Тип" value={f.type} onChange={(v) => setV('type', v)} options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></label>
        <label className="wf-fld"><span>Виконавець</span><Select ariaLabel="Виконавець" value={f.owner} onChange={(v) => setV('owner', v)} options={Object.entries(OWNER_LABEL).filter(([k]) => k !== 'agent').map(([k, v]) => ({ value: k, label: v }))} /></label>
        <label className="wf-fld"><span>Пріоритет</span><Select ariaLabel="Пріоритет" value={f.priority} onChange={(v) => setV('priority', v)} options={Object.entries(PRIORITY_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></label>
        <label className="wf-fld"><span>Строк</span><DatePicker value={f.due_date} onChange={(iso) => setV('due_date', iso)} placeholder="Без строку" /></label>
      </div>
      <textarea className="wf-cmt" aria-label="Деталі" placeholder="Деталі (необов’язково)" value={f.evidence} onChange={set('evidence')} />
      {err && <div className="wf-err" role="alert">{err}</div>}
      <div className="wf-row"><button type="button" className="wf-btn p sm" disabled={busy || !f.title.trim()} onClick={save}>Додати задачу</button></div>
    </div>
  );
}

// «Задачі» of a project (step A10: the concept «Мій день» of the owner with the block of blockers of «Що блокує»): the digest of the day, what stops the launch, the feed
// sorted by urgency, the drafts for the client with «Скопіювати» and «Надіслано».
export default function Tasks({ projectId }) {
  const { email } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setTasks(await fetchTasks(projectId)); setErr(''); } catch (e) { setErr(e.message || String(e)); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  async function act(t, status, result, owner) {
    setBusy(true); setErr('');
    try { if (owner) await setTaskOwner(t, owner, email); else await setTaskStatus(t, status, { result: result || '', email }); await load(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }
  if (!tasks) return <div className="wf wf-page">{err ? <div className="wf-err" role="alert">{err}</div> : <div className="wf-load">Завантаження…</div>}</div>;
  return <TasksBoard tasks={tasks} err={err} busy={busy} onAct={act} onReload={load} projectId={projectId} email={email} />;
}

// the page itself (the tasks are already loaded): the digest, the block of blockers, the filters and the feed
export function TasksBoard({ tasks, err, busy, onAct, onReload, projectId, email }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const today = useMemo(() => new Date(), []);
  // the blockers have their own block on top, so the feed does not repeat them (except under the filter «Блокують запуск», where the block is hidden and they are the feed)
  const view = useMemo(() => filterTasks(tasks, filter).filter((t) => filter === 'blockers' || !isBlocker(t)), [tasks, filter]);
  const groups = useMemo(() => groupTasks(view, today), [view, today]);
  const blockers = useMemo(() => tasks.filter(isBlocker), [tasks]);
  const counts = useMemo(() => filterCounts(tasks), [tasks]);
  const act = onAct;
  const open = tasks.filter(isOpen);
  return (
    <div className="wf wf-page wf-col">
      {err && <div className="wf-err" role="alert">{err}</div>}
      <div className="wf-card">
        <div className="wf-row" style={{ justifyContent: 'space-between' }}>
          <div><h2 style={{ margin: 0, fontSize: 17 }}>Задачі проєкту</h2><div className="wf-muted">{digest(tasks, today)}</div></div>
          <div className="wf-row"><Pill tone="mute">Відкритих: {open.length}</Pill>{counts.drafts > 0 && <Pill tone="info">Чернеток: {counts.drafts}</Pill>}<button type="button" className="wf-btn p sm" onClick={() => setAdding((a) => !a)}>{adding ? 'Сховати' : '+ Задача'}</button></div>
        </div>
      </div>
      {adding && <AddTask projectId={projectId} email={email} onDone={() => { setAdding(false); onReload(); }} />}

      {blockers.length > 0 && filter !== 'blockers' && (
        <div className="wf-blockers">
          <div className="wf-row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 16 }}>Блокує запуск · {blockers.length}</h2><span className="wf-muted" style={{ fontSize: 12.5 }}>Поки це не зроблено, запуск зупинено перевіркою</span></div>
          {blockers.map((t) => <Task key={'b' + t.id} t={t} busy={busy} onAct={act} />)}
        </div>
      )}

      <div className="wf-grid wf-g2task">
        <div className="wf-card wf-side">
          <h3>Фільтри</h3>
          {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}<b>{counts[k]}</b></button>)}
        </div>
        <div className="wf-col">
          {groups.length === 0 && <div className="wf-card"><div className="wf-empty">{tasks.length ? 'За цим фільтром задач немає.' : 'Задач поки немає. Коли агенти знайдуть або підготують щось для вас, воно з’явиться тут.'}</div></div>}
          {groups.map((g) => (
            <div key={g.key} className="wf-col">
              <h3 style={{ margin: '6px 0 0' }}>{g.title} · {g.items.length}</h3>
              {g.items.map((t) => <Task key={t.id} t={t} busy={busy} onAct={act} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
