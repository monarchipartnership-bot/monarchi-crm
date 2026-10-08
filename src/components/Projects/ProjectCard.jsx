import { STATUS_LABEL, fmtIsoDate } from '../../lib/projectConstants';
import { PAGE_ICONS, PLATFORM_ICONS, SERVICE_SYMBOL } from '../../lib/pageIcons';

const I = {
  manager: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  client: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h9v17" /><path d="M14 9h5v12" /><path d="M8 8h3M8 12h3M8 16h3" /></svg>,
  country: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.4" /></svg>,
  period: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
};

// One project of the list: folder next to the name, status, what is known about it (only
// what exists), and the services at the bottom.
export default function ProjectCard({ project: p, onClick }) {
  const dates = p.start_date || p.end_date ? `${fmtIsoDate(p.start_date) || '—'} – ${fmtIsoDate(p.end_date) || '—'}` : null;
  const meta = [
    p.manager && { key: 'manager', icon: I.manager, value: p.manager, label: 'Менеджер' },
    p.client && { key: 'client', icon: I.client, value: p.client, label: 'Клієнт' },
    p.country && { key: 'country', icon: I.country, value: p.country, label: 'Країна' },
    dates && { key: 'period', icon: I.period, value: dates, label: 'Період' },
  ].filter(Boolean);

  return (
    <div
      className="proj-card" role="link" tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div className="proj-card-top">
        <span className="proj-card-icon"><img src={PAGE_ICONS['page.projects'].src} alt="" width="56" height="56" draggable="false" /></span>
        <div className="proj-card-title">
          <div className="proj-name">{p.name}</div>
          <span className={'status-pill ' + p.status}><i aria-hidden="true" />{STATUS_LABEL[p.status]}</span>
        </div>
      </div>
      {meta.length > 0 && (
        <div className="proj-meta">
          {meta.map((m) => (
            <div className="proj-meta-row" key={m.key}>
              <span className="proj-meta-ic">{m.icon}</span>
              <span className="proj-meta-text"><span className="proj-meta-val">{m.value}</span><span className="proj-meta-lbl">{m.label}</span></span>
            </div>
          ))}
        </div>
      )}
      {!!p.services?.length && (
        <div className="proj-services">
          <span className="proj-services-label">Послуги</span>
          <div className="proj-tags">
            {p.services.map((s) => {
              const sym = SERVICE_SYMBOL[s] && PLATFORM_ICONS[SERVICE_SYMBOL[s]];
              return (
                <span className="svc-tag" key={s}>
                  {sym && <img src={sym.src} alt="" width="22" height="22" draggable="false" />}
                  {s}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
