import { useState } from 'react';
import { replaceCampaignGroups } from '../../../lib/api/projectReportStore';
import '../../../styles/projectReports.css';

let seq = 1;
const emptyGroup = () => ({ key: seq++, name: '', keywords: '' });

// "Групи кампаній": the columns of the report. A campaign goes to the first
// group whose keyword appears in its name (any case); the rest land in "Інше".
export default function CampaignGroupsModal({ projectId, groups, campaignNames, onClose, onSaved }) {
  const [rows, setRows] = useState(() => (groups.length
    ? groups.map((g) => ({ key: seq++, name: g.name, keywords: (g.keywords || []).join(', ') }))
    : [emptyGroup()]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setRow(key, patch) { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await replaceCampaignGroups(projectId, rows.map((r) => ({ name: r.name, keywords: r.keywords.split(',') })));
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Не вдалося зберегти групи.');
    } finally {
      setSaving(false);
    }
  }

  // What each rule catches right now, so a typo in a keyword is visible at once.
  const matchCount = (kw) => {
    const keys = kw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!keys.length) return 0;
    return campaignNames.filter((n) => keys.some((k) => n.toLowerCase().includes(k))).length;
  };

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box prep-modal">
        <div className="modal-head">
          <h3>Групи кампаній</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          <div className="pacc-hint">Кожна група стає колонкою у звіті. Вкажіть слова з назви кампанії через кому (наприклад: <i>Kinky Bang, kinky</i>). Кампанія потрапляє до першої групи, чиє слово є в її назві, решта йде в «Інше».</div>
          <div className="prep-groups">
            {rows.map((r) => (
              <div className="prep-group-row" key={r.key}>
                <input type="text" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder="Назва колонки" />
                <input type="text" value={r.keywords} onChange={(e) => setRow(r.key, { keywords: e.target.value })} placeholder="слова з назви кампанії, через кому" />
                <span className="prep-group-count" title="Скільки кампаній зараз потрапляє в групу">{campaignNames.length ? matchCount(r.keywords) : ''}</span>
                <button type="button" className="pacc-link pacc-link--danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, emptyGroup()])}>+ Додати групу</button>
          {campaignNames.length > 0 && (
            <details className="prep-campaigns">
              <summary>Кампанії, які є зараз ({campaignNames.length})</summary>
              <ul>{campaignNames.map((n) => <li key={n}>{n}</li>)}</ul>
            </details>
          )}
          {error && <div className="form-err">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-p" onClick={save} disabled={saving}>{saving ? '...' : 'Зберегти'}</button>
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}
