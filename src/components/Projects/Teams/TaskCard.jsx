import InlineName from './InlineName';
import { StatusPill, TypeLabel, TypeMedal } from './teamsUi';

// A task of a team as a card (owner's picks 2026-11-16, decision 51: three columns of teams): a coloured header with the type (medallion, name, a star for the main regular task),
// the name and the line of the schedule, and a footer with the status capsule and the buttons. A task that waits for the person gets a yellow frame and a yellow button.
//   task: { key, type, isMain, title, line, status, statusText, cta, onOpen, onRename?, actions: [{ label, onClick, disabled }] }
export default function TaskCard({ task }) {
  const ask = task.status === 'ask';
  return (
    <li className={'tb-card is-' + task.type + ' st-' + task.status}>
      <div className="tb-ch"><TypeMedal type={task.type} size={30} /><TypeLabel type={task.type} main={task.isMain} /></div>
      <div className="tb-cb">
        {task.onRename
          ? <InlineName value={task.title} fallback="Без назви" label={`Назва завдання «${task.title}»`} allowEmpty={false} onSave={task.onRename} />
          : <b className="tb-title">{task.title}</b>}
        {task.line && <small>{task.line}</small>}
      </div>
      <div className="tb-cf">
        <StatusPill status={task.status} text={task.statusText} />
        <div className="tb-acts">
          {(task.actions || []).map((a) => <button key={a.label} type="button" className="btn tmx-sm" disabled={a.disabled} onClick={a.onClick}>{a.label}</button>)}
          <button type="button" className={'btn tmx-sm' + (ask ? ' tb-gold' : '')} onClick={task.onOpen}>{ask ? (task.cta || 'Переглянути') : 'Відкрити'}</button>
        </div>
      </div>
    </li>
  );
}
