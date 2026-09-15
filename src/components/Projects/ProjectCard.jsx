import { STATUS_LABEL, fmtIsoDate } from '../../lib/projectConstants';

export default function ProjectCard({ project: p, onClick }) {
  return (
    <div className="proj-card" onClick={onClick}>
      <div className="proj-card-top">
        <div className="proj-name">{p.name}</div>
        <span className={'status-pill ' + p.status}>{STATUS_LABEL[p.status]}</span>
      </div>
      <div className="proj-meta">
        {p.manager && (
          <div className="proj-meta-row">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
            <span>{p.manager}</span>
          </div>
        )}
        {(p.start_date || p.end_date) && (
          <div className="proj-meta-row">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            <span>{fmtIsoDate(p.start_date) || '—'} – {fmtIsoDate(p.end_date) || '—'}</span>
          </div>
        )}
        {p.client && (
          <div className="proj-meta-row">
            <svg viewBox="0 0 24 24"><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></svg>
            <span className="muted">{p.client}{p.country ? `, ${p.country}` : ''}</span>
          </div>
        )}
      </div>
      {!!p.services?.length && (
        <div className="proj-tags">
          {p.services.map((s) => <span className="svc-tag" key={s}>{s}</span>)}
        </div>
      )}
    </div>
  );
}
