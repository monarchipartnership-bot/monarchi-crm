import { useEffect, useState } from 'react';
import { fetchClientHistory, fetchClientChangeLog } from '../../lib/api/clients';
import { fmtDate } from '../../lib/dateHelpers';

function isoToDMY(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return fmtDate(y, m, d);
}

const FIELD_LABELS = { platform: 'Платформа', lead_type: 'Тип', status: 'Статус', company: 'Компанія', name: "Ім'я" };

// Combines two independent activity sources into one chronological feed:
// weekly-report mentions (fetchClientHistory, already existed) and manual
// field edits (fetchClientChangeLog, new — client_changes table).
export default function ClientActivityTab({ clientId, name }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchClientHistory(name), fetchClientChangeLog(clientId)]).then(([history, changes]) => {
      if (cancelled) return;
      const merged = [
        ...history.map((h) => ({ kind: 'mention', date: h.weekStart, ...h })),
        ...changes.map((c) => ({ kind: 'change', date: c.changed_at.slice(0, 10), ...c })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      setEntries(merged);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [clientId, name]);

  if (loading) return <p className="client-history-empty">Завантаження…</p>;
  if (entries.length === 0) return <p className="client-history-empty">Активності ще немає.</p>;

  return (
    <div className="client-history-list">
      {entries.map((e, i) => (
        <div className="client-history-item" key={i}>
          <div className="client-history-week">
            {e.kind === 'mention' ? `${isoToDMY(e.weekStart)} – ${isoToDMY(e.weekEnd)}` : new Date(e.changed_at).toLocaleString('uk-UA')}
          </div>
          {e.kind === 'mention' ? (
            e.text && <div className="client-history-text">{e.text}</div>
          ) : (
            <div className="client-history-text">
              {FIELD_LABELS[e.field] || e.field}: <b>{e.old_value || '—'}</b> → <b>{e.new_value || '—'}</b>
              {e.changed_by && <span className="client-history-author"> · {e.changed_by}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
