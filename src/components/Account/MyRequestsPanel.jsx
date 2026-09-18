import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { submitLeaveRequest, cancelLeaveRequest } from '../../lib/api/profile';
import { logActivity } from '../../lib/api/activityLog';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { LEAVE_TYPES, leaveTypeInfo } from '../../lib/leaveTypes';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import '../../styles/comparePage.css';
import '../../styles/clientsDirectory.css';
import '../../styles/automationTasksPage.css';
import '../../styles/dropdownAnim.css';
import '../../styles/myRequestsPage.css';

const TYPE_PICKER_CLOSE_MS = 140;

const EYE_ICON = '<svg viewBox="0 0 24 24"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.2"/></svg>';
const CANCEL_ICON = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const COMMENT_ICON = '<svg viewBox="0 0 24 24"><path d="M4 5.5h16v10.5H9l-4.5 4V16H4z"/></svg>';
const PERSON_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const CALENDAR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 24 24"><path d="M21 3 3 10.5l7 3 3 7z"/><path d="M21 3 13 21l-3-7.5-7-3z"/></svg>';
const CLOCK_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';

const STATUS_LABELS = { pending: 'Очікує', approved: 'Затверджено', rejected: 'Відхилено' };
const TAB_PLURALS = { vacation: 'Відпустки', dayoff: 'Вихідні', sick: 'Лікарняні', paid_dayoff: 'Оплачувані вихідні', other: 'Інші' };

const KPI_CONFIG = [
  { key: 'total', label: 'Усього заявок', icon: SEND_ICON, tint: 'var(--purple-tint)', color: 'var(--purple)', sub: 'за останні 3 місяці', bars: [40, 55, 35, 70, 50, 65, 80] },
  { key: 'pending', label: 'Очікують розгляду', icon: CLOCK_ICON, tint: '#FBF3DF', color: '#B8860B', sub: 'потребують підтвердження', bars: [30, 45, 25, 40, 35, 50, 60] },
  { key: 'approved', label: 'Затверджено', icon: FIELD_ICONS.check, tint: '#E9F7EF', color: 'var(--ok)', sub: 'цього року', bars: [50, 60, 45, 70, 65, 80, 90] },
  { key: 'rejected', label: 'Відхилено', icon: FIELD_ICONS.close, tint: '#FBEAEA', color: 'var(--bad)', sub: 'цього року', bars: [60, 40, 55, 30, 45, 35, 50] },
];

const TABS = [
  { key: '', label: 'Усі заявки' },
  ...LEAVE_TYPES.map((t) => ({ key: t.key, label: TAB_PLURALS[t.key] || t.label })),
];

function fmtIsoDate(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleDateString('uk-UA') : '—';
}

function daysBetween(start, end) {
  if (!start || !end) return '—';
  const d = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return `${d} ${d === 1 ? 'день' : 'днів'}`;
}

// The full "Мої заявки" experience (KPIs, tabs, filters, table), embedded
// directly in the user's own /account page — every user only ever sees
// their own requests here, there's no separate shared route for it.
export default function MyRequestsPanel({ rows, loading, onChanged }) {
  const { email } = useAuth();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reqForm, setReqForm] = useState({ type: 'vacation', start: '', end: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typePickerRendered = useAnimatedOpen(typePickerOpen, TYPE_PICKER_CLOSE_MS);

  useEffect(() => {
    if (!typePickerOpen) return;
    function onDocClick(e) { if (!e.target.closest('.type-picker')) setTypePickerOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [typePickerOpen]);

  // Escape closes whichever layer is topmost — the type picker first if it's
  // open over the modal, otherwise the modal itself.
  useEffect(() => {
    if (!formOpen) return;
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (typePickerOpen) setTypePickerOpen(false);
      else setFormOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [formOpen, typePickerOpen]);

  const currentYear = new Date().getFullYear();
  const kpis = useMemo(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return {
      total: rows.length,
      recentDelta: rows.filter((r) => new Date(r.created_at) >= threeMonthsAgo).length,
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved' && new Date(r.created_at).getFullYear() === currentYear).length,
      rejected: rows.filter((r) => r.status === 'rejected' && new Date(r.created_at).getFullYear() === currentYear).length,
    };
  }, [rows, currentYear]);

  const tabCounts = useMemo(() => {
    const counts = { '': rows.length };
    LEAVE_TYPES.forEach((t) => { counts[t.key] = rows.filter((r) => r.type === t.key).length; });
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (periodFrom && r.date_end < periodFrom) return false;
      if (periodTo && r.date_start > periodTo) return false;
      if (q && !(r.reason || '').toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [rows, typeFilter, statusFilter, periodFrom, periodTo, keyword]);

  function resetFilters() {
    setTypeFilter(''); setStatusFilter(''); setPeriodFrom(''); setPeriodTo(''); setKeyword('');
  }

  const canSubmitRequest = Boolean(reqForm.start && reqForm.end && reqForm.end >= reqForm.start && reqForm.reason.trim());

  async function handleSubmitRequest() {
    if (!reqForm.start || !reqForm.end) { alert('Оберіть дату початку і закінчення.'); return; }
    if (reqForm.end < reqForm.start) { alert('Дата закінчення не може бути раніше дати початку.'); return; }
    if (!reqForm.reason.trim()) { alert('Заповніть коментар.'); return; }
    setSubmitting(true);
    try {
      await submitLeaveRequest({ email, ...reqForm });
      setReqForm({ type: 'vacation', start: '', end: '', reason: '' });
      setFormOpen(false);
      logActivity('account', 'leave_request_created', { type: reqForm.type }, email);
      onChanged();
    } catch (e) {
      console.warn('submitRequest failed', e);
      alert('Не вдалося подати заявку.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id) {
    try {
      await cancelLeaveRequest(id);
      onChanged();
    } catch (e) {
      console.warn('cancelRequest failed', e);
      alert('Не вдалося скасувати заявку.');
    }
  }

  return (
    <div className="myreq-panel" id="my-requests-section">
      <div className="myreq-hero-row">
        <div className="myreq-hero-title-row">
          <span className="myreq-hero-ic" dangerouslySetInnerHTML={{ __html: CALENDAR_ICON }} />
          <div>
            <h1>Мої заявки</h1>
            <p className="sub">Керуйте своїми відпустками, лікарняними та іншими заявками. Усі заявки відображаються тут.</p>
          </div>
        </div>
        <div className="myreq-hero-actions">
          <button type="button" className="btn" disabled title="Скоро">
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.download }} /> Експорт
          </button>
          <button type="button" className="btn btn-p" onClick={() => setFormOpen((o) => !o)}>
            Подати заявку
          </button>
        </div>
      </div>

      {formOpen && createPortal(
        // Rendered into document.body, not in place — an ancestor card here
        // uses backdrop-filter, which makes this overlay's position:fixed
        // resolve against that card instead of the viewport if left nested,
        // clipping the dimmed backdrop to the card instead of covering the
        // whole screen.
        <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setFormOpen(false); }}>
          <div className="tmodal-box myreq-form-box">
            <div className="tmodal-head">
              <h3>Подати заявку</h3>
              <button type="button" className="tmodal-close" onClick={() => setFormOpen(false)} aria-label="Закрити">&times;</button>
            </div>
            <div className="tmodal-body">
              <div className="pf">
                <label>Тип</label>
                <div className="type-picker">
                  <button type="button" className="type-picker-trigger" onClick={() => setTypePickerOpen((o) => !o)}>
                    <span className="type-picker-ic" style={{ background: leaveTypeInfo(reqForm.type).tint, color: leaveTypeInfo(reqForm.type).color }} dangerouslySetInnerHTML={{ __html: leaveTypeInfo(reqForm.type).icon }} />
                    <span>{leaveTypeInfo(reqForm.type).label}</span>
                    <span className="type-picker-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />
                  </button>
                  {typePickerRendered && (
                    <div className={'type-picker-menu' + (typePickerOpen ? '' : ' closing')}>
                      {LEAVE_TYPES.map((t) => (
                        <button
                          type="button" key={t.key}
                          className={'type-picker-row' + (reqForm.type === t.key ? ' active' : '')}
                          onClick={() => { setReqForm((f) => ({ ...f, type: t.key })); setTypePickerOpen(false); }}
                        >
                          <span className="type-picker-ic" style={{ background: t.tint, color: t.color }} dangerouslySetInnerHTML={{ __html: t.icon }} />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="pf"><label>Дата з</label><DatePicker value={reqForm.start} onChange={(iso) => setReqForm((f) => ({ ...f, start: iso }))} /></div>
              <div className="pf"><label>Дата по</label><DatePicker value={reqForm.end} onChange={(iso) => setReqForm((f) => ({ ...f, end: iso }))} /></div>
              <div className="pf"><label>Коментар</label><input type="text" value={reqForm.reason} onChange={(e) => setReqForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Коротко про причину" required /></div>
              <button type="button" className="btn btn-p myreq-form-submit" onClick={handleSubmitRequest} disabled={submitting || !canSubmitRequest}>
                {submitting ? '...' : 'Подати заявку'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="myreq-kpi-row">
        {KPI_CONFIG.map((k) => (
          <div className="myreq-kpi-card" key={k.key} style={{ background: k.tint }}>
            <div className="myreq-kpi-left">
              <span className="myreq-kpi-ic" style={{ color: k.color }} dangerouslySetInnerHTML={{ __html: k.icon }} />
              <div>
                <div className="myreq-kpi-label">{k.label}</div>
                <div className="myreq-kpi-value-row">
                  <span className="myreq-kpi-value">{kpis[k.key]}</span>
                  {k.key === 'total' && kpis.recentDelta > 0 && (
                    <span className="myreq-kpi-delta">&#8593; +{kpis.recentDelta}</span>
                  )}
                </div>
                <div className="myreq-kpi-sub">{k.sub}</div>
              </div>
            </div>
            <div className="myreq-kpi-spark">
              {k.bars.map((h, i) => (
                <span key={i} className="myreq-kpi-bar" style={{ height: h + '%', background: k.color, opacity: .3 + i * 0.09 }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="myreq-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={'myreq-tab' + (typeFilter === t.key ? ' active' : '')} onClick={() => setTypeFilter(t.key)}>
            {t.label} <span className="myreq-tab-count">{tabCounts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="myreq-filters">
        <div className="pf">
          <label>Статус</label>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Усі статуси"
            options={[
              { value: '', label: 'Усі статуси' },
              { value: 'pending', label: 'Очікує' },
              { value: 'approved', label: 'Затверджено' },
              { value: 'rejected', label: 'Відхилено' },
            ]}
          />
        </div>
        <div className="pf"><label>Період з</label><DatePicker value={periodFrom} onChange={setPeriodFrom} /></div>
        <div className="pf"><label>Період по</label><DatePicker value={periodTo} onChange={setPeriodTo} /></div>
        <div className="pf myreq-keyword">
          <label>Ключове слово</label>
          <div className="mc-client-search">
            <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Пошук у коментарях..." />
          </div>
        </div>
        <div className="pf myreq-reset-wrap">
          <label className="myreq-reset-label">&nbsp;</label>
          <button type="button" className="btn myreq-reset" onClick={resetFilters}>
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.undo }} /> Скинути
          </button>
        </div>
      </div>

      {loading ? (
        <div className="placeholder"><p>Завантаження…</p></div>
      ) : filtered.length === 0 ? (
        <div className="placeholder"><p>{rows.length === 0 ? 'Ви ще не подавали заявок.' : 'Немає заявок за цим фільтром.'}</p></div>
      ) : (
        <div className="tbl-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Тип</th>
                <th>Період</th>
                <th>Кількість днів</th>
                <th>Причина / Коментар</th>
                <th>Статус</th>
                <th>Дата подачі</th>
                <th className="client-menu-col myreq-actions-col" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <Fragment key={r.id}>
                  <tr className="client-row" onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}>
                    <td>{i + 1}</td>
                    <td>
                      {(() => {
                        const ti = leaveTypeInfo(r.type);
                        return (
                          <span className="tag type-tag" style={{ color: ti.color, background: ti.tint, border: `1px solid ${ti.color}4D` }}>
                            <span className="type-tag-ic" dangerouslySetInnerHTML={{ __html: ti.icon }} />
                            {ti.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{fmtIsoDate(r.date_start)} — {fmtIsoDate(r.date_end)}</td>
                    <td>{daysBetween(r.date_start, r.date_end)}</td>
                    <td className="myreq-reason-cell">{r.reason || '—'}</td>
                    <td><span className={'tag ' + r.status}>{STATUS_LABELS[r.status] || r.status}</span></td>
                    <td>{fmtDateTime(r.created_at)}</td>
                    <td className="client-menu-col myreq-actions-col" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="row-menu-btn myreq-eye-btn" title="Деталі" onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}>
                        <span dangerouslySetInnerHTML={{ __html: EYE_ICON }} />
                      </button>
                      {r.status === 'pending' && (
                        <button type="button" className="row-menu-btn myreq-cancel-btn" title="Скасувати заявку" onClick={() => handleCancel(r.id)}>
                          <span dangerouslySetInnerHTML={{ __html: CANCEL_ICON }} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr className="myreq-expand-row">
                      <td colSpan={8}>
                        <div className="myreq-expand-body">
                          <div className="myreq-expand-item">
                            <span className="myreq-expand-ic" dangerouslySetInnerHTML={{ __html: COMMENT_ICON }} />
                            <div>
                              <div className="myreq-expand-label">Повний коментар</div>
                              <div className="myreq-expand-value">{r.reason || '—'}</div>
                            </div>
                          </div>
                          <div className="myreq-expand-item">
                            <span className="myreq-expand-ic" dangerouslySetInnerHTML={{ __html: PERSON_ICON }} />
                            <div>
                              <div className="myreq-expand-label">Розглянув(ла)</div>
                              <div className="myreq-expand-value">{r.reviewed_by || '—'}</div>
                            </div>
                          </div>
                          <div className="myreq-expand-item">
                            <span className="myreq-expand-ic" dangerouslySetInnerHTML={{ __html: CLOCK_ICON }} />
                            <div>
                              <div className="myreq-expand-label">Оновлено</div>
                              <div className="myreq-expand-value">{fmtDateTime(r.updated_at)}</div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
