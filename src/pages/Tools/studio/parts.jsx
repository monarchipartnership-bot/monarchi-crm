import { BRAND_LOGO_URL } from './brandLogo';

// Small building blocks shared by every cover template.

export function Logo({ height = 46, className = '' }) {
  return <img className={'cv-logo ' + className} src={BRAND_LOGO_URL} alt="" style={{ height }} />;
}

export function Kicker({ children }) {
  if (!String(children || '').trim()) return null;
  return <div className="cv-kicker">{children}</div>;
}

// Two-tone headline: `title` in the text colour, `accent` in the gold
// highlight. Either can be empty and simply disappears.
export function TitleLines({ title, accent }) {
  return (
    <>
      {String(title || '').trim() && <span className="cv-title-a">{title}</span>}
      {String(accent || '').trim() && <span className="cv-title-b">{accent}</span>}
    </>
  );
}

// variant: chips | cards | plain | ledger | stat | strip (see studio.css).
// Pairs with an empty value are dropped.
export function Metrics({ items, variant = 'chips' }) {
  const list = (items || []).filter((m) => m && String(m.v || '').trim());
  if (!list.length) return null;
  return (
    <div className={'cv-metrics cv-metrics--' + variant}>
      {list.map((m, i) => (
        <div className="cv-metric" key={i}>
          <b>{m.v}</b>
          <span>{m.l}</span>
        </div>
      ))}
    </div>
  );
}

export function Tags({ items, max = 6 }) {
  const list = (items || []).filter((t) => t && String(t.t || '').trim()).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="cv-tags">
      {list.map((t, i) => <span key={i} className={'cv-tag' + (t.a ? ' is-accent' : '')}>{t.t}</span>)}
    </div>
  );
}

// Cut-out portrait that sits directly on the cover (no frame). Without an
// upload it shows a silhouette placeholder.
export function Person({ src, className = '' }) {
  return (
    <div className={'cv-person ' + className}>
      <div className="cv-person-glow" />
      {src ? (
        <img src={src} alt="" />
      ) : (
        <div className="cv-person-ph">
          <svg viewBox="0 0 400 520" aria-hidden="true">
            <ellipse cx="200" cy="170" rx="78" ry="92" />
            <path d="M24 520C28 392 100 330 160 316L240 316C300 330 372 392 376 520Z" />
          </svg>
          <span>YOUR PHOTO</span>
        </div>
      )}
    </div>
  );
}

export function Bubble({ kind = 'lines', tone = 'mag', tail = 'l', style }) {
  return (
    <div className={`cv-bubble cv-bubble--${tone} cv-bubble--${tail}`} style={style}>
      {kind === 'dots' ? <><i /><i /><i /></> : <><u /><u className="s" /></>}
    </div>
  );
}

export function PicIcon({ size = 56 }) {
  return (
    <svg className="cv-picicon" width={size} height={size} viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="10" width="44" height="36" rx="6" />
      <path d="M10 40l12-14 8 9 6-6 10 11z" fill="currentColor" stroke="none" />
      <circle cx="38" cy="21" r="3.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Browser window mock with the screenshot inside and an address-bar pill.
export function BrowserWin({ src, url, placeholder = 'DROP SCREENSHOT', style, className = '' }) {
  return (
    <div className={'cv-browser ' + className} style={style}>
      <div className="cv-browser-bar">
        <i /><i /><i />
        {String(url || '').trim() && <span className="cv-browser-url">{url}</span>}
      </div>
      <div className="cv-browser-body">
        {src ? <img src={src} alt="" /> : (
          <div className="cv-ph"><PicIcon /><span>{placeholder}</span></div>
        )}
      </div>
    </div>
  );
}

// Phone mock; `n` labels the empty placeholder ("SCREEN 01").
export function PhoneMock({ src, n, style }) {
  return (
    <div className="cv-phone" style={style}>
      <div className="cv-phone-screen">
        {src ? <img src={src} alt="" /> : (
          <div className="cv-ph"><PicIcon size={46} /><span>SCREEN 0{n}</span></div>
        )}
      </div>
      <b className="cv-phone-notch" />
      <b className="cv-phone-home" />
    </div>
  );
}

export function Squares({ items }) {
  return items.map(([x, y], i) => <i key={i} className="cv-sq" style={{ left: x, top: y }} />);
}

// Framed picture (screenshot/photo) with a dashed placeholder.
export function ImageCard({ src, label = 'DROP IMAGE', className = '', style }) {
  return (
    <div className={'cv-imgcard ' + className} style={style}>
      {src ? <img src={src} alt="" /> : <div className="cv-ph"><PicIcon /><span>{label}</span></div>}
    </div>
  );
}

export function Bar() { return <i className="cv-bar" />; }
