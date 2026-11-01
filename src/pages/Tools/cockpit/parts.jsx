import { initials } from './format';

// Shared small pieces of the project cockpit: icons, the client avatar, status chips, the progress bar.
const PATHS = {
  close: 'M6 6l12 12M18 6L6 18', download: 'M12 4v11M7 11l5 5 5-5M5 20h14', back: 'M15 5l-7 7 7 7', check: 'M5 12.5l4.5 4.5L19 7.5', chev: 'M6 9l6 6 6-6', plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14M13 6l6 6-6 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', warn: 'M12 3l10 18H2zM12 10v5M12 18v.5', refresh: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  chat: 'M4 5h16v11H9l-5 4z', upload: 'M12 16V5M7 10l5-5 5 5M5 20h14', wallet: 'M3 9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 10h18M16 14h2', stop: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  play: 'M8 5l11 7-11 7z', user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-5 15-5 16 0', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  strategy: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3', doc: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7', pen: 'M4 20l1-4L16 5l3 3L8 19z',
  img: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM21 16l-5-5-8 8', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
};

export function Ic({ n, size = 16 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[n] || PATHS.doc} /></svg>;
}

// The gradient icon badge (the fixed brand style of the CRM): white icon on a plum gradient.
export function IconBadge({ n, tone = '', size = 34 }) {
  return <span className={'ckp-ico' + (tone ? ' is-' + tone : '')} style={{ width: size, height: size }}><Ic n={n} size={Math.round(size * 0.52)} /></span>;
}

export function Avatar({ name, size = 40 }) {
  return <span className="ckp-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }} aria-hidden="true">{initials(name)}</span>;
}

// «чекає на вас: 3» (amber), «потрібна увага: 1» (red, a step failed) or «усе гаразд»
export function WaitChip({ tone, waiting }) {
  if (tone === 'ok' || !waiting) return <span className="ckp-chip is-ok"><Ic n="check" size={13} />усе гаразд</span>;
  return <span className={'ckp-chip ' + (tone === 'problem' ? 'is-bad' : 'is-warn')}><Ic n={tone === 'problem' ? 'warn' : 'clock'} size={13} />чекає на вас: {waiting}</span>;
}

export function Progress({ value = 0 }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return <div className="ckp-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}><i style={{ width: `${Math.round(v * 100)}%` }} /></div>;
}

export function Spinner() { return <span className="ckp-spin" aria-hidden="true" />; }
