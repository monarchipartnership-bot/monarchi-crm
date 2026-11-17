import { HUB_PATHS } from '../hubIcons';

// Small pieces of the tab «Запуск AI команди» in the plum look: the ring medallion of a team and the round icon buttons.
const OWN = {
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M8 5l11 7-11 7z" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  creative: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="M20.5 16l-5-5-8 8.5" /></>,
};
const TEAM_ICON = { creative: 'creative', analytics: 'bars', reports: 'file' };

export function TeamRing({ name, size = 36 }) {
  const d = OWN[TEAM_ICON[name] || name] || HUB_PATHS[TEAM_ICON[name] || name] || HUB_PATHS.users;
  return <span className="hub-ring tmx-ring" style={{ '--s': size + 'px', '--r': Math.max(3, Math.round(size / 12)) + 'px' }} aria-hidden="true"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24">{d}</svg></span></span>;
}

export function RoundBtn({ icon, label, onClick, disabled }) {
  return <button type="button" className="btn tmx-rb" title={label} aria-label={label} disabled={disabled} onClick={onClick}><svg viewBox="0 0 24 24" aria-hidden="true">{OWN[icon]}</svg></button>;
}

// ---- the types and the statuses of a task (owner's picks 2026-11-16, decision 51): the TYPE is a square medallion + a colour stripe on the left, the STATUS is a capsule with its own shape
const TASK_ICON = {
  repeat: <path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4" />,
  cal: <path d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4" />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  back: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2" />,
  alert: <path d="M12 9v4M12 17h.01M12 3.5l9.5 16.5h-19z" />,
  clock: <path d="M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />,
  pause: <path d="M8 5v14M16 5v14" />,
};
export const TASK_TYPE_DEF = { regular: { label: 'Регулярне', icon: 'repeat' }, seasonal: { label: 'Сезонне', icon: 'cal' }, oneoff: { label: 'Разове', icon: 'bolt' } };
// the status of a task: run (works), ask (waits for the person), pause, soon (not started yet), bad (stopped with an error)
export const TASK_STATUS_TEXT = { run: 'працює', ask: 'чекає вашого рішення', pause: 'на паузі', soon: 'скоро почнеться', bad: 'збій', done: 'перевірено', back: 'повернено' };
export const toStatus = (state) => ({ work: 'run', wait: 'ask', paused: 'pause', soon: 'soon', stopped: 'bad' }[state] || 'run');

export function TaskIcon({ name }) { return <svg viewBox="0 0 24 24" aria-hidden="true">{TASK_ICON[name]}</svg>; }
export function TypeMedal({ type, size = 34 }) { return <span className={'tb-med is-' + type} style={{ '--ms': size + 'px' }} aria-hidden="true"><TaskIcon name={TASK_TYPE_DEF[type].icon} /></span>; }
export function TypeLabel({ type, main = false }) {
  return <span className={'tb-kl is-' + type}>{TASK_TYPE_DEF[type].label}{main && <span className="tb-star" title="Основне регулярне завдання" aria-label="основне"><svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg></span>}</span>;
}
export function StatusPill({ status, text }) {
  return <span className={'tb-sp is-' + status}>{status === 'run' ? <i className="tb-dot" aria-hidden="true" /> : <TaskIcon name={status === 'ask' || status === 'bad' ? 'alert' : status === 'pause' ? 'pause' : status === 'done' ? 'check' : status === 'back' ? 'back' : 'clock'} />}{text || TASK_STATUS_TEXT[status]}</span>;
}
