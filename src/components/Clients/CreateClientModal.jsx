import { useEffect, useState } from 'react';
import PlatformPicker from '../common/PlatformPicker';
import Select from '../common/Select';
import { upsertClientDirectoryEntry } from '../../lib/api/clients';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { CLIENT_PLATFORMS } from '../../lib/reportConstants';
import { STATUSES } from '../../lib/clientStatus';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

// Manual "Створити контакт" form for ClientsDirectory.jsx — same minimal
// shape (ім'я + платформа + тип клієнта + менеджер) as every other place a
// contact gets created (WeeklyCreate.jsx's autosave, ClientPicker.jsx's
// inline quick-add while adding a deal, ImportDealsModal.jsx's CSV import),
// via the same upsertClientDirectoryEntry call. Everything else about the
// contact (source, country, tags, business-intake fields...) is left for
// the profile page, exactly as it already is for those other entry points.
export default function CreateClientModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState(CLIENT_PLATFORMS[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [manager, setManager] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchAllProfiles().then((rows) => setProfiles(rows.map(profileLabel))); }, []);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      const client = await upsertClientDirectoryEntry({ name: trimmed, platform, status, manager });
      if (!client) { setError('Не вдалося створити контакт.'); return; }
      onCreated(client);
    } catch (e) {
      setError('Помилка створення контакту: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box">
        <div className="tmodal-head">
          <h3>Створити контакт</h3>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="task-detail-edit-fields">
            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
              <div className="wk-field-body">
                <label>Ім'я</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я клієнта" autoFocus />
              </div>
            </div>

            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
              <div className="wk-field-body">
                <label>Платформа</label>
                <PlatformPicker value={platform} onChange={setPlatform} />
              </div>
            </div>

            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
              <div className="wk-field-body">
                <label>Статус</label>
                <Select bare value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />
              </div>
            </div>

            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.owner }} />
              <div className="wk-field-body">
                <label>Менеджер</label>
                <Select
                  bare value={manager} onChange={setManager}
                  options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p, label: p }))]}
                />
              </div>
            </div>
          </div>
          {error && <p className="import-error">{error}</p>}
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={!name.trim() || saving}>{saving ? '...' : 'Створити'}</button>
        </div>
      </div>
    </div>
  );
}
