import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MONTH_NAMES, isoDate, todayIso, buildMonthGrid } from '../../lib/dateHelpers';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { useFloatingPosition } from '../../lib/useFloatingPosition';
import '../../styles/dropdownAnim.css';
import '../../styles/datePicker.css';

const CLOSE_MS = 140;

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const CALENDAR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/></svg>';
const CHEVRON_LEFT = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>';

function fmtDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// Custom rounded calendar dropdown replacing the native <input type="date">
// picker — clicking anywhere on the trigger row opens it, not just a tiny
// icon, and it matches the app's own "type-picker"-style dropdown look.
export default function DatePicker({ value, onChange, placeholder, bare, className, style }) {
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const pos = useFloatingPosition(containerRef, open);
  const [viewYear, setViewYear] = useState(() => (value ? new Date(value).getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (value ? new Date(value).getMonth() + 1 : new Date().getMonth() + 1));

  useEffect(() => {
    if (!open) return;
    // Checks this instance's own container, not just any ".date-picker" —
    // several of these can be on screen at once (e.g. "Дата з"/"Дата по"),
    // and closest('.date-picker') would match a click on a *different*
    // picker's trigger too, leaving this one stuck open behind it.
    function onDocClick(e) { if (!containerRef.current?.contains(e.target)) setOpen(false); }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function openPicker() {
    const b = value ? new Date(value) : new Date();
    setViewYear(b.getFullYear());
    setViewMonth(b.getMonth() + 1);
    setOpen((o) => !o);
  }

  function shiftMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  function select(cell) {
    onChange(isoDate(cell.year, cell.month, cell.day));
    setOpen(false);
  }

  const today = todayIso();
  const cells = buildMonthGrid(viewYear, viewMonth);

  return (
    <div className={'date-picker' + (bare ? ' date-picker--bare' : '') + (className ? ' ' + className : '')} style={style} ref={containerRef}>
      <button type="button" className="date-picker-trigger" onClick={openPicker}>
        <span className={value ? '' : 'date-picker-placeholder'}>{value ? fmtDisplay(value) : (placeholder || 'дд.мм.рррр')}</span>
        <span className="date-picker-ic" dangerouslySetInnerHTML={{ __html: CALENDAR_ICON }} />
      </button>
      {rendered && createPortal(
        <div
          className={'date-picker-menu' + (open ? '' : ' closing') + (pos.placement === 'top' ? ' placement-top' : '')}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}
        >
          <div className="date-picker-nav">
            <span className="date-picker-month-label">{MONTH_NAMES[viewMonth - 1]} {viewYear}</span>
            <div className="date-picker-nav-btns">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Попередній місяць" dangerouslySetInnerHTML={{ __html: CHEVRON_LEFT }} />
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Наступний місяць" dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
            </div>
          </div>
          <div className="date-picker-grid">
            {WEEKDAYS.map((w) => <span key={w} className="date-picker-dow">{w}</span>)}
            {cells.map((c, i) => {
              const iso = isoDate(c.year, c.month, c.day);
              return (
                <button
                  type="button" key={i}
                  className={'date-picker-day' + (c.out ? ' out' : '') + (iso === today ? ' today' : '') + (iso === value ? ' selected' : '')}
                  onClick={() => select(c)}
                >
                  {c.day}
                </button>
              );
            })}
          </div>
          <div className="date-picker-footer">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Очистити</button>
            <button type="button" onClick={() => { onChange(today); setOpen(false); }}>Сьогодні</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
