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
