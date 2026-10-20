import { PLATFORM_ICONS, PLATFORM_SYMBOL } from '../../lib/pageIcons';

// Small pieces of the Hub style used on the project card: line icons, the medallion title of a box,
// and the platform mark for the segmented ribbons.
export const HUB_PATHS = {
  plug: <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" />,
  info: <><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v14H6z" /><path d="M9 11h6M9 15h4" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  layers: <><path d="M12 4l8.5 4.5L12 13 3.5 8.5z" /><path d="M3.5 12.5L12 17l8.5-4.5" /></>,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  note: <><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M9 9h6M9 13h6M9 17h4" /></>,
  file: <><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  wallet: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v4M4 7.5V17a2 2 0 0 0 2 2h13V9H6.5A2.5 2.5 0 0 1 4 7.5zM16 14h.01" />,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  click: <path d="M9 4l1 5M4 9l5 1M6 6l3 3M10 10l9 3.5-4 1.5-1.5 4z" />,
  pct: <path d="M19 5L5 19M7 7h.01M17 17h.01" />,
  coin: <><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2 0 3 5.5 1.5 5.5 4.5 0 1.2-1 2-2.5 2-1.2 0-2.2-.6-2.7-1.6M12 6.5V8M12 16v1.5" /></>,
  cart: <><path d="M3 4h2l2.5 11h10l2-8H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  roas: <path d="M4 17l5-5 4 4 7-8M15 8h5v5" />,
  alert: <><path d="M12 3.5l9 15.5H3z" /><path d="M12 10v4M12 17h.01" /></>,
  pie: <><path d="M12 3v9h9a9 9 0 1 1-9-9z" /><path d="M15.5 3.5A9 9 0 0 1 20.5 8.5H15.5z" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14a6 6 0 0 1 3 6" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chev: <path d="M6 9l6 6 6-6" />,
  open: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  link: <path d="M9 15l6-6M13 6l1-1a3 3 0 1 1 4 4l-2 2M11 18l-1 1a3 3 0 1 1-4-4l2-2" />,
  bars: <path d="M5 20V11M12 20V4M19 20v-7" />,
  stat: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
};

// A box title with a ring medallion: <HubTitle icon="plug">Рекламні кабінети</HubTitle>
export function HubTitle({ icon, children, as: Tag = 'div', className = 'stitle' }) {
  return (
    <Tag className={className + ' hub-title'}>
      <span className="hub-ring hub-ring--sm"><span className="hub-tile hub-tile--ln"><svg viewBox="0 0 24 24" aria-hidden="true">{HUB_PATHS[icon]}</svg></span></span>
      <span>{children}</span>
    </Tag>
  );
}

// The mark in front of a platform tab of the segmented ribbon: the platform's logo, or the "layers" glyph for «Разом».
export function RibbonMark({ platform }) {
  const sym = platform && PLATFORM_ICONS[PLATFORM_SYMBOL[platform]];
  if (sym) return <span className="rg-ic"><img src={sym.src} alt="" draggable="false" /></span>;
  return <span className="rg-ic"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{HUB_PATHS.layers}</svg></span>;
}
