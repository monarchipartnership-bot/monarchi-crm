// Small pieces shared by the agent windows (Hub style): line icons and the medallion (a ring whose colour carries meaning, a white disc, an icon tile).
export const ICON_PATHS = {
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a3 3 0 100-6M21 20a6 6 0 00-4-5.6',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  book: 'M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5zM8 7h8M8 11h8',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  play: 'M8 5v14l11-7z',
  chart: 'M4 20V10m6 10V4m6 16v-7',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  agent: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z',
  tool: 'M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.4 2.4-2.6-.6-.6-2.6z',
  chat: 'M4 5h16v11H9l-5 4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  doc: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5',
};

export const Icon = ({ k, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[k]} /></svg>
);

// `html` is an icon from the agent catalogue (a ready svg string with currentColor), `icon` a name from ICON_PATHS.
export const Medallion = ({ icon, html, size, ring = 4, color }) => (
  <span className="dwa-med" style={{ '--s': `${size}px`, '--r': `${ring}px`, ...(color ? { '--rc': color } : {}) }} aria-hidden="true">
    <i><b>{html ? <span className="dwa-med-svg" dangerouslySetInnerHTML={{ __html: html }} /> : <Icon k={icon} size={Math.round(size * 0.46)} />}</b></i>
  </span>
);
