import { useEffect, useRef } from 'react';
import { MONTH_NAMES, daysInMonth } from '../../lib/dateHelpers';

const CALENDAR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';
const CHEVRON_LEFT = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
const WEEKDAY_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // Date#getDay(): 0 = Sunday

// One icon+color per season, keyed by month (1-12) — purely decorative
// context next to the month label, not tied to any real data.
const SEASON_ICONS = {
  winter: { color: '#38BDF8', icon: '<svg viewBox="0 0 24 24"><path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/></svg>' },
  spring: { color: '#4ADE80', icon: '<svg viewBox="0 0 24 24"><path d="M12 21v-9"/><path d="M12 12C12 8 8 6 4 6c0 4 2 8 8 6z"/><path d="M12 12c0-4 4-6 8-6 0 4-2 8-8 6z"/></svg>' },
  summer: { color: '#FBBF24', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>' },
  autumn: { color: '#FB923C', icon: '<svg viewBox="0 0 24 24"><path d="M12 3c-4.4 2-7 5.8-7 9.5a7 7 0 0 0 14 0C19 8.8 16.4 5 12 3z"/><path d="M12 12.5V21"/></svg>' },
};
function seasonFor(month) {
  if (month === 12 || month <= 2) return SEASON_ICONS.winter;
  if (month <= 5) return SEASON_ICONS.spring;
  if (month <= 8) return SEASON_ICONS.summer;
  return SEASON_ICONS.autumn;
}

// Combined page header + day picker for Daily Report — replaces the old
// separate title row (Рік/Місяць/День selects) and the boxy "Заповненість
// місяця" grid with one compact bar: icon + title on the left, a month
// nav + horizontal day strip on the right. `savedDays` is still the only
// thing we track per day, but each status now gets a full "our style"
// solid-gradient treatment instead of a pale flat tint — over/done color
// the whole pill (no separate dot needed once the pill itself carries the
// color), future stays a plain neutral surface since nothing's happened
// yet, and the currently-viewed day keeps its own purple so it never gets
// confused with "done" (which reads green, a distinct status).
export default function DailyReportHero({ year, month, currentDay, savedDays, onSelectDay, onChangeMonth }) {
  const dim = daysInMonth(year, month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const curRef = useRef(null);
  const scrollRef = useRef(null);
  const season = seasonFor(month);

  useEffect(() => {
    curRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [year, month, currentDay]);

  // Native wheel scroll on this row is vertical by default (it's a normal
  // mouse wheel, not a trackpad) — redirect it to horizontal so scrolling
  // over the strip pages through days instead of scrolling the whole page.
  // Has to be a real DOM listener (not React's onWheel) to call
  // preventDefault — React attaches wheel handlers as passive by default.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function scrollByPage(dir) {
    scrollRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });
  }

  return (
    <section className="daily-hero">
      <div className="daily-hero-title">
        <span className="daily-hero-icon" dangerouslySetInnerHTML={{ __html: CALENDAR_ICON }} />
        <div>
          <h1>Daily Report</h1>
          <p>Ваша щоденна активність в одному місці</p>
        </div>
      </div>

      <div className="daily-hero-calendar">
        <div className="daily-hero-nav">
          <button type="button" className="daily-hero-nav-btn" onClick={() => onChangeMonth(-1)} aria-label="Попередній місяць">
            <span dangerouslySetInnerHTML={{ __html: CHEVRON_LEFT }} />
          </button>
          <span className="daily-hero-nav-label">
            <span className="daily-hero-season-ic" style={{ color: season.color }} dangerouslySetInnerHTML={{ __html: season.icon }} />
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button type="button" className="daily-hero-nav-btn" onClick={() => onChangeMonth(1)} aria-label="Наступний місяць">
            <span dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
          </button>
        </div>

        <div className="daily-hero-days-wrap">
          <button type="button" className="daily-hero-scroll-btn left" onClick={() => scrollByPage(-1)} aria-label="Прокрутити ліворуч">
            <span dangerouslySetInnerHTML={{ __html: CHEVRON_LEFT }} />
          </button>

          <div className="daily-hero-days" ref={scrollRef}>
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
              const thisDate = new Date(year, month - 1, d);
              thisDate.setHours(0, 0, 0, 0);
              const dow = thisDate.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const hasReport = savedDays.has(d);
              let status;
              if (isWeekend) status = 'weekend';
              else if (thisDate.getTime() > today.getTime()) status = 'future';
              else if (hasReport) status = 'done';
              else status = 'over';
              const statusLabel = status === 'weekend' ? 'вихідний' : status === 'done' ? 'внесено' : status === 'over' ? 'прострочено' : 'ще не настав';
              const isCur = d === currentDay;
              return (
                <button
                  key={d}
                  type="button"
                  ref={isCur ? curRef : null}
                  className={'daily-hero-day ' + status + (isCur ? ' cur' : '')}
                  title={`${d} ${MONTH_NAMES[month - 1]} (${statusLabel})`}
                  onClick={() => onSelectDay(d)}
                >
                  <span className="daily-hero-day-num">{d}</span>
                  <span className="daily-hero-day-wd">{WEEKDAY_SHORT[thisDate.getDay()]}</span>
                </button>
              );
            })}
          </div>

          <button type="button" className="daily-hero-scroll-btn right" onClick={() => scrollByPage(1)} aria-label="Прокрутити праворуч">
            <span dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
          </button>
        </div>
      </div>
    </section>
  );
}
