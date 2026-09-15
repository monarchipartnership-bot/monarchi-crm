import { useState } from 'react';

const COLLAPSE_CHEVRON = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';

// Collapsible card with an icon+title+subtitle header and a chevron toggle —
// used by both Weekly Report's FinanceSection.jsx (editable) and Monthly
// Report's MonthlyFinanceSection.jsx (read-only rollups). `highlight` gives
// the card a purple tint (used for "Підсумок").
export default function FinCard({ icon, title, subtitle, children, highlight }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={'fin-card' + (highlight ? ' highlight' : '')}>
      <button type="button" className="fin-card-head" onClick={() => setOpen((o) => !o)}>
        <span className="fin-card-icon" dangerouslySetInnerHTML={{ __html: icon }} />
        <div className="fin-card-titles">
          <div className="fin-card-title">{title}</div>
          {subtitle && <div className="fin-card-subtitle">{subtitle}</div>}
        </div>
        <span className={'fin-card-toggle' + (open ? '' : ' closed')} dangerouslySetInnerHTML={{ __html: COLLAPSE_CHEVRON }} />
      </button>
      {open && <div className="fin-card-body">{children}</div>}
    </div>
  );
}
