import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from '../common/DatePicker';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { useFloatingPosition } from '../../lib/useFloatingPosition';
import '../../styles/dropdownAnim.css';

const CLOSE_MS = 140;

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const PERSON_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';
const FILTER_ICON = '<svg viewBox="0 0 24 24"><path d="M4 4h16l-6.5 8v6l-3 1.5v-7.5z"/></svg>';
const CARD_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';

export const SMART_FILTERS = [
  { key: 'won', label: 'Усі виграні угоди' },
  { key: 'open', label: 'Усі відкриті угоди' },
  { key: 'lost', label: 'Усі програні угоди' },
  { key: 'archived', label: 'Усі видалені угоди' },
  { key: 'inactive', label: 'Неактивні угоди (14+ днів)' },
  { key: 'old3m', label: 'Угоди, яким більше 3 місяців' },
];

const TABS = [
  { key: 'owners', label: 'Власники', icon: PERSON_ICON },
  { key: 'smart', label: 'Фільтри', icon: FILTER_ICON },
  { key: 'fields', label: 'Поля картки', icon: CARD_ICON },
];

// Pipedrive-style combined filter dropdown — owners, canned "smart" filters,
// and a third tab for filtering directly by the deal card's own fields
// (creation date range, stage, source). Trigger + portal follow the same
// pattern as Select/DatePicker so it can't get clipped or lose a stacking
// fight, and it's the same floating-panel shape either way.
export default function DealsFilterMenu({
  managerOptions, managerFilter, onManagerChange,
  stages, stageFilterIds, onStageToggle,
  sourceOptions, sourceFilter, onSourceChange,
  smartFilter, onSmartChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  activeCount, onReset,
}) {
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const pos = useFloatingPosition(containerRef, open, 6, 440, 'right');
  const [tab, setTab] = useState('owners');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (containerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => { setQuery(''); }, [tab]);

  const q = query.trim().toLowerCase();
  const filteredOwners = useMemo(() => managerOptions.filter((m) => m.toLowerCase().includes(q)), [managerOptions, q]);
  const filteredSmart = useMemo(() => SMART_FILTERS.filter((f) => f.label.toLowerCase().includes(q)), [q]);

  return (
    <div className="deals-filter-wrap" ref={containerRef}>
      <button type="button" className={'btn task-filter-btn' + (activeCount ? ' has-active' : '')} onClick={() => setOpen((o) => !o)}>
        <span dangerouslySetInnerHTML={{ __html: FILTER_ICON }} />
        Фільтр{activeCount > 0 ? ` (${activeCount})` : ''}
        <span className="deals-filter-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />
      </button>
      {rendered && createPortal(
        <div
          ref={popoverRef}
          className={'deals-filter-panel' + (open ? '' : ' closing') + (pos.placement === 'top' ? ' placement-top' : '')}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right }}
        >
          {tab !== 'fields' && (
            <div className="deals-filter-search">
              <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук власника або фільтра" autoFocus
              />
            </div>
          )}

          <div className="deals-filter-tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={'deals-filter-tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
                <span dangerouslySetInnerHTML={{ __html: t.icon }} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="deals-filter-body">
            {tab === 'owners' && (
              <div className="deals-filter-list">
                <button type="button" className={'deals-filter-row' + (!managerFilter ? ' active' : '')} onClick={() => onManagerChange('')}>
                  Усі власники {!managerFilter && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                </button>
                {filteredOwners.length === 0 && <p className="deals-filter-empty">Нічого не знайдено.</p>}
                {filteredOwners.map((m) => (
                  <button key={m} type="button" className={'deals-filter-row' + (managerFilter === m ? ' active' : '')} onClick={() => onManagerChange(m)}>
                    {m} {managerFilter === m && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                  </button>
                ))}
              </div>
            )}

            {tab === 'smart' && (
              <div className="deals-filter-list">
                <button type="button" className={'deals-filter-row' + (!smartFilter ? ' active' : '')} onClick={() => onSmartChange(null)}>
                  Без фільтра {!smartFilter && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                </button>
                {filteredSmart.length === 0 && <p className="deals-filter-empty">Нічого не знайдено.</p>}
                {filteredSmart.map((f) => (
                  <button key={f.key} type="button" className={'deals-filter-row' + (smartFilter === f.key ? ' active' : '')} onClick={() => onSmartChange(f.key)}>
                    {f.label} {smartFilter === f.key && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                  </button>
                ))}
              </div>
            )}

            {tab === 'fields' && (
              <div className="deals-filter-fields">
                <div className="deals-filter-section">
                  <span className="deals-filter-section-label">Дата заведення</span>
                  <div className="deals-filter-date-row">
                    <DatePicker value={dateFrom} onChange={onDateFromChange} placeholder="з" />
                    <DatePicker value={dateTo} onChange={onDateToChange} placeholder="по" />
                  </div>
                </div>
                <div className="deals-filter-section">
                  <span className="deals-filter-section-label">Стадія</span>
                  <div className="deals-filter-list deals-filter-list-inline">
                    {stages.map((s) => (
                      <button
                        key={s.id} type="button"
                        className={'deals-filter-row' + (stageFilterIds.includes(s.id) ? ' active' : '')}
                        onClick={() => onStageToggle(s.id)}
                      >
                        <span className="deals-filter-row-label">
                          <span className="deals-filter-stage-dot" style={{ background: s.color || '#7C3AED' }} />
                          {s.label}
                        </span>
                        {stageFilterIds.includes(s.id) && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="deals-filter-section">
                  <span className="deals-filter-section-label">Source</span>
                  <div className="deals-filter-list deals-filter-list-inline">
                    <button type="button" className={'deals-filter-row' + (!sourceFilter ? ' active' : '')} onClick={() => onSourceChange('')}>
                      Усі джерела {!sourceFilter && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                    </button>
                    {sourceOptions.length === 0 && <p className="deals-filter-empty">Немає джерел.</p>}
                    {sourceOptions.map((s) => (
                      <button key={s} type="button" className={'deals-filter-row' + (sourceFilter === s ? ' active' : '')} onClick={() => onSourceChange(s)}>
                        {s} {sourceFilter === s && <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {activeCount > 0 && (
            <div className="deals-filter-foot">
              <button type="button" className="deals-filter-reset" onClick={onReset}>Скинути всі фільтри</button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
