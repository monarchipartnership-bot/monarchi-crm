import { useState } from 'react';

function nextSubtaskId(list) {
  return list.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0) + 1;
}

// Collapsed "2/5" progress toggle that expands into a checklist. `onChange`
// receives the whole new subtasks array — the caller (TaskRow/DailyTaskRow)
// is responsible for persisting it via updateTaskFields. `readOnly` (Monthly
// rollup) drops all editing controls and hides entirely when there's nothing
// to show. `forceOpen` (the task detail modal, and the creation form) always
// shows the checklist body and drops the collapse toggle — appropriate there
// since it's the only content in that section, unlike the compact grid card
// where staying collapsed by default keeps cards a uniform size.
export default function TaskSubtasks({ subtasks, onChange, readOnly, forceOpen }) {
  const [openState, setOpenState] = useState(false);
  const open = forceOpen || openState;
  const [draft, setDraft] = useState('');
  const list = subtasks || [];
  const done = list.filter((s) => s.done).length;

  // No collapsed "+ Чекліст" add-affordance on an already-empty list outside
  // forceOpen contexts (detail modal / creation form) — on the compact grid
  // card it read as a leftover "checklist" feature; adding the first subtask
  // now happens via those two forceOpen surfaces instead.
  if (!list.length && !forceOpen) return null;

  function toggle(id) {
    onChange(list.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function remove(id) {
    onChange(list.filter((s) => s.id !== id));
  }
  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([...list, { id: nextSubtaskId(list), text, done: false }]);
    setDraft('');
  }

  return (
    <div className={'task-subtasks' + (forceOpen ? ' forced' : '')} onClick={(e) => e.stopPropagation()}>
      {!forceOpen && (
        <button type="button" className="task-subtasks-toggle" onClick={() => setOpenState((o) => !o)}>
          {list.length > 0 ? `${done}/${list.length}` : '+ Чекліст'}
          <span className={'caret' + (open ? ' open' : '')}>&#9662;</span>
        </button>
      )}
      {open && (
        <div className="task-subtasks-body">
          {list.map((s) => (
            <div className="subtask-row" key={s.id}>
              {!readOnly && <input type="checkbox" checked={!!s.done} onChange={() => toggle(s.id)} />}
              <span className={'subtask-text' + (s.done ? ' done' : '')}>{s.text}</span>
              {!readOnly && <button type="button" className="subtask-del" onClick={() => remove(s.id)}>&times;</button>}
            </div>
          ))}
          {!readOnly && (
            <div className="subtask-add-row">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder={forceOpen ? 'Додати підзадачу...' : 'Новий пункт...'}
              />
              <button type="button" onClick={add}>+</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
