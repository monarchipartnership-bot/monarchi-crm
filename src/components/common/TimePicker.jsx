import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { useFloatingPosition } from '../../lib/useFloatingPosition';
import '../../styles/dropdownAnim.css';
import '../../styles/timePicker.css';

const CLOSE_MS = 140;
const CLOCK_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// Custom rounded time dropdown replacing a native <input type="time"> — same
// portal + floating-position + animation pattern as DatePicker/Select, so it
// matches their look instead of the browser's own hour/minute wheel, and
// clicking anywhere on the trigger opens it rather than just the clock icon
// (the native input only responds to that tiny icon).
export default function TimePicker({ value, onChange, placeholder, bare, className, style }) {
  const containerRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const [open, setOpen] = useState(false);
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const pos = useFloatingPosition(containerRef, open, 6, 220);

  const [hh, mm] = (value || '').split(':');

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (!containerRef.current?.contains(e.target)) setOpen(false); }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Scroll the currently-picked hour/minute into view every time the panel
  // opens, instead of always starting the list at 00.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      hourListRef.current?.querySelector('.time-picker-active')?.scrollIntoView({ block: 'center' });
      minuteListRef.current?.querySelector('.time-picker-active')?.scrollIntoView({ block: 'center' });
    });
  }, [open]);

  function pickHour(h) { onChange(`${h}:${mm || '00'}`); }
  function pickMinute(m) { onChange(`${hh || '00'}:${m}`); }

  return (
    <div className={'time-picker' + (bare ? ' time-picker--bare' : '') + (className ? ' ' + className : '')} style={style} ref={containerRef}>
      <button type="button" className="time-picker-trigger" onClick={() => setOpen((o) => !o)}>
        <span className={value ? '' : 'time-picker-placeholder'}>{value || (placeholder || '--:--')}</span>
        <span className="time-picker-ic" dangerouslySetInnerHTML={{ __html: CLOCK_ICON }} />
      </button>
      {rendered && createPortal(
        <div
          className={'time-picker-menu' + (open ? '' : ' closing') + (pos.placement === 'top' ? ' placement-top' : '')}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}
        >
          <div className="time-picker-col" ref={hourListRef}>
            {HOURS.map((h) => (
              <button
                key={h} type="button" className={'time-picker-cell' + (h === hh ? ' time-picker-active' : '')}
                onClick={() => pickHour(h)}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="time-picker-col" ref={minuteListRef}>
            {MINUTES.map((m) => (
              <button
                key={m} type="button" className={'time-picker-cell' + (m === mm ? ' time-picker-active' : '')}
                onClick={() => pickMinute(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
