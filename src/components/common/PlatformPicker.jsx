import { useEffect, useRef, useState } from 'react';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { PLATFORMS } from '../../lib/platforms';
import '../../styles/dropdownAnim.css';
import '../../styles/platformPicker.css';

const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
const CLOSE_MS = 160;

// Same icon-row dropdown style as "Мій кабінет"'s leave-type picker
// (.type-picker*, myRequestsPage.css) — a logo `<img>` per row instead of a
// tinted SVG icon box, since these platform logos already carry their own
// brand colors. `allowClear`/`clearLabel` add an "Усі"-style empty option,
// for filter contexts (a client's own platform is never actually empty).
export default function PlatformPicker({ value, onChange, placeholder, allowClear, clearLabel, className, disabled }) {
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const current = PLATFORMS.find((p) => p.value === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (!containerRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className={'platform-picker' + (disabled ? ' platform-picker--disabled' : '') + (className ? ' ' + className : '')} ref={containerRef}>
      <button type="button" className="platform-picker-trigger" onClick={() => setOpen((o) => !o)} disabled={disabled}>
        {!value && allowClear ? (
          <span className="platform-picker-label">{clearLabel || 'Усі платформи'}</span>
        ) : current ? (
          <>
            <img className="platform-picker-ic" src={current.logo} alt="" />
            <span className="platform-picker-label">{current.label}</span>
          </>
        ) : (
          <span className="platform-picker-placeholder">{placeholder || 'Оберіть платформу'}</span>
        )}
        {!disabled && <span className="platform-picker-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />}
      </button>
      {rendered && !disabled && (
        <div className={'platform-picker-menu' + (open ? '' : ' closing')}>
          {allowClear && (
            <button type="button" className={'platform-picker-row' + (!value ? ' active' : '')} onClick={() => pick('')}>
              {clearLabel || 'Усі платформи'}
            </button>
          )}
          {PLATFORMS.map((p) => (
            <button
              type="button" key={p.value}
              className={'platform-picker-row' + (value === p.value ? ' active' : '')}
              onClick={() => pick(p.value)}
            >
              <img className="platform-picker-ic" src={p.logo} alt="" />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
