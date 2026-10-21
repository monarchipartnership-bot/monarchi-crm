import { useRef, useState } from 'react';
import { ReportBody } from './ArchiveReportModal';
import useDialogA11y from '../../lib/useDialogA11y';
import { REPORT_STATUS, APPROVED, PENDING } from '../../lib/projectHistory';
import { scopeOf } from '../../lib/clientReport';
import { computeMetric, formatMetric, metricMeta } from '../../lib/reportMetrics';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';
import '../../styles/reportWinHub.css';

const fmt = (s) => s.split('-').reverse().join('.');
const short = (s) => s.split('-').reverse().slice(0, 2).join('.');

const ICONS = {
  doc: <><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  week: <path d="M5 20V10M12 20V4M19 20v-7" />,
  month: <><path d="M5 6h14M5 12h9M5 18h14" /><path d="M17 10l2 2-2 2" /></>,
  chev: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};
const Svg = ({ n }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[n]}</svg>;

const money = (v, currency) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(v).replace(/,/g, ' '); } catch { return String(Math.round(v)); }
};

// Three numbers that tell what the report is about, so a closed block is still useful: spend, and sales with ROAS (or leads with their cost).
function figuresOf(row) {
  const data = row.data || {};
  const scope = scopeOf(data.platforms);
  if (!scope) return [];
  const keys = data.kind === 'leadgen' ? ['spend', 'leads', 'cpl'] : ['spend', 'roas', 'purchases'];
  return keys.map((k) => {
    const meta = metricMeta(k);
    const v = computeMetric(k, scope.total);
    if (v == null) return null;
    const value = meta.format === 'money' ? money(v, scope.currency) : formatMetric(v, meta.format, scope.currency);
    return { key: k, label: meta.label.split(' (')[0], value };
  }).filter(Boolean);
}

// The combined document of a month: the weeks one under another, then the month. It is a view of the saved reports, nothing is stored or pulled
// again, so it opens at once. The same order is used by the page the client gets. Every block folds, a ribbon of contents jumps between them.
export default function MonthDocument({ month, projectName, custom, extraKeys, onClose }) {
  const box = useRef(null);
  const body = useRef(null);
  useDialogA11y(box, onClose);
  const weeks = month.weeks.filter((w) => w.row);
  const monthly = month.monthly;
  const empty = !weeks.length && !monthly;

  const sections = [
    ...weeks.map((w) => ({ id: w.start, kind: 'week', title: `Тиждень ${w.n}`, dates: `${fmt(w.start)} – ${fmt(w.end)}`, chip: `${short(w.start)} – ${short(w.end)}`, row: w.row })),
    ...(monthly ? [{ id: 'month', kind: 'month', title: 'Підсумок місяця', dates: `${fmt(monthly.period_start)} – ${fmt(monthly.period_end)}`, chip: month.label.split(' ')[0].toLowerCase(), row: monthly }] : []),
  ];
  const [open, setOpen] = useState(() => {
    const latest = weeks.length ? weeks[weeks.length - 1].start : null;
    return new Set([latest, monthly ? 'month' : null].filter(Boolean));
  });
  const [active, setActive] = useState(sections[0]?.id || null);

  const toggle = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const jump = (id) => {
    setActive(id);
    setOpen((o) => (o.has(id) ? o : new Set(o).add(id)));
    requestAnimationFrame(() => { document.getElementById('md-sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };
  // The ribbon follows the reading: the active item is the last block whose top has passed the top of the window.
  const onScroll = () => {
    const root = body.current;
    if (!root) return;
    const line = root.getBoundingClientRect().top + 48;
    let cur = sections[0]?.id;
    sections.forEach((s) => { const el = document.getElementById('md-sec-' + s.id); if (el && el.getBoundingClientRect().top <= line) cur = s.id; });
    setActive(cur);
  };

  const allApproved = month.counts.total > 0 && month.counts.approved === month.counts.total;

  return (
    <div className="arc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} className="arc-win md-win" role="dialog" aria-modal="true" aria-labelledby="md-title">
        <div className="arc-head">
          <span className="arc-md"><span className="arc-mi"><Svg n="doc" /></span></span>
          <div className="arc-title">
            <h3 id="md-title">{month.label}: загальний документ</h3>
            <div className="arc-sub">
              <span className="arc-pc">{projectName}</span>
              {!empty && <span className={'arc-chip arc-chip--' + (allApproved ? APPROVED : PENDING)}>Тижні {month.counts.approved} з {month.counts.total} затверджено</span>}
              {!empty && (monthly
                ? <><span className="md-lbl">місяць:</span><span className={'arc-chip arc-chip--' + monthly.status}>{REPORT_STATUS[monthly.status] || monthly.status}</span></>
                : <span className="arc-chip">Місячного звіту ще немає</span>)}
            </div>
          </div>
          <div className="arc-actions"><button type="button" className="arc-x" onClick={onClose} aria-label="Закрити"><Svg n="close" /></button></div>
        </div>

        {!empty && (
          <nav className="md-toc" aria-label="Зміст">
            {sections.map((s) => (
              <button key={s.id} type="button" className={'md-tc' + (active === s.id ? ' is-on' : '')} onClick={() => jump(s.id)} aria-current={active === s.id ? 'true' : undefined}>
                <i className={'md-dot md-dot--' + s.row.status} />
                <b>{s.title}</b>
                <span>{s.chip}</span>
              </button>
            ))}
            <span className="md-tools">
              <button type="button" className="btn" onClick={() => setOpen(new Set(sections.map((s) => s.id)))}>Розгорнути всі</button>
              <button type="button" className="btn" onClick={() => setOpen(new Set())}>Згорнути всі</button>
            </span>
          </nav>
        )}

        <div ref={body} className="arc-body md-body" onScroll={onScroll}>
          {empty && (
            <div className="md-empty">
              <span className="arc-md"><span className="arc-mi"><Svg n="doc" /></span></span>
              <h4>У цьому місяці ще немає збережених звітів</h4>
              <p>Тижневі звіти й підсумок місяця зʼявляться тут одразу після збереження.</p>
            </div>
          )}
          <div className="md-stack">
            {sections.map((s) => {
              const isOpen = open.has(s.id);
              const figs = figuresOf(s.row);
              return (
                <section key={s.id} id={'md-sec-' + s.id} className={'md-acc' + (isOpen ? ' is-open' : '')}>
                  <button type="button" className="md-ach" onClick={() => toggle(s.id)} aria-expanded={isOpen} aria-controls={'md-panel-' + s.id}>
                    <span className="md-mini"><span><Svg n={s.kind} /></span></span>
                    <span className="md-act"><b>{s.title}</b><span>{s.dates}</span></span>
                    <span className="md-sp" />
                    {figs.length > 0 && <span className="md-figs">{figs.map((f) => <span className="md-fg" key={f.key}><em>{f.label}</em><b>{f.value}</b></span>)}</span>}
                    <span className={'arc-chip arc-chip--' + s.row.status}>{REPORT_STATUS[s.row.status] || s.row.status}</span>
                    <span className="md-chv"><Svg n="chev" /></span>
                  </button>
                  {isOpen && (
                    <div className="md-acb" id={'md-panel-' + s.id}>
                      <ReportBody row={s.row} projectName={projectName} custom={custom} extraKeys={extraKeys(s.row)} />
                    </div>
                  )}
                </section>
              );
            })}
            {!empty && !monthly && (
              <div className="md-nom">
                <span className="md-mini md-mini--mu"><span><Svg n="month" /></span></span>
                <div><b>Місячного звіту ще немає</b><span>Підсумок зʼявиться тут, коли його буде збережено.</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
