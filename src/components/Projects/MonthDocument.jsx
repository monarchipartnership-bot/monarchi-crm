import { useRef } from 'react';
import { ReportBody } from './ArchiveReportModal';
import useDialogA11y from '../../lib/useDialogA11y';
import DesignTodo from '../common/DesignTodo';
import { REPORT_STATUS } from '../../lib/projectHistory';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';

const fmt = (s) => s.split('-').reverse().join('.');

// The combined document of a month: the weeks one under another, then the month. It is a view of the saved reports, nothing is stored or pulled
// again, so it opens at once. The same order is used by the page the client gets.
export default function MonthDocument({ month, projectName, custom, extraKeys, onClose }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const weeks = month.weeks.filter((w) => w.row);
  const monthly = month.monthly;
  const empty = !weeks.length && !monthly;

  return (
    <div className="arc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} className="arc-win" role="dialog" aria-modal="true" aria-labelledby="md-title">
        <div className="arc-head">
          <div className="arc-title">
            <h3 id="md-title">{month.label}: загальний документ</h3>
            <DesignTodo note="Вікно «Загальний документ»: тижні та підсумок місяця. Фінальний вигляд — клієнтська сторінка за макетом docs/mockups/client-report-mockup.html" />
            <div className="arc-sub">{projectName} · тижні {month.counts.approved} з {month.counts.total} затверджено{monthly ? ` · місяць: ${REPORT_STATUS[monthly.status] || monthly.status}` : ' · місячного звіту ще немає'}</div>
          </div>
          <div className="arc-actions"><button type="button" className="btn" onClick={onClose} aria-label="Закрити">Закрити ✕</button></div>
        </div>
        <div className="arc-body">
          {empty && <div className="empty-hint">У цьому місяці ще немає збережених звітів.</div>}
          {weeks.map((w) => (
            <section className="ph-doc-block" key={w.start}>
              <h4 className="ph-doc-title">Тиждень {w.n} <span>{fmt(w.start)} – {fmt(w.end)}</span><i className={'ph-chip ph-chip--' + w.row.status}>{REPORT_STATUS[w.row.status]}</i></h4>
              <ReportBody row={w.row} projectName={projectName} custom={custom} extraKeys={extraKeys(w.row)} />
            </section>
          ))}
          {monthly && (
            <section className="ph-doc-block">
              <h4 className="ph-doc-title">Підсумок місяця <span>{fmt(monthly.period_start)} – {fmt(monthly.period_end)}</span><i className={'ph-chip ph-chip--' + monthly.status}>{REPORT_STATUS[monthly.status]}</i></h4>
              <ReportBody row={monthly} projectName={projectName} custom={custom} extraKeys={extraKeys(monthly)} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
