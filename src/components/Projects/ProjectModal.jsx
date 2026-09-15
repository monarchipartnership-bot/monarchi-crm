import { useState } from 'react';
import { SERVICES } from '../../lib/projectConstants';

const EMPTY_FORM = { name: '', manager: '', start_date: '', end_date: '', client: '', country: '', website: '', services: [] };

// Create-only: a project's editable metadata (status, CRM link, notes, etc.)
// lives on its ProjectDetail Overview tab once it exists. This modal is just
// the initial "+ Створити проект" form with the base fields.
export default function ProjectModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleService(s) {
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));
  }

  function handleSave() {
    const name = form.name.trim();
    if (!name) { setError('Введіть назву проекту.'); return; }
    onSave({
      name,
      manager: form.manager.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      services: form.services,
      client: form.client.trim() || null,
      country: form.country.trim() || null,
      website: form.website.trim() || null,
    });
  }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-head">
          <h3>Створити проект</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          <div className="pf-sec-label">Основне</div>
          <div className="pf-grid">
            <div className="pf full">
              <label>Назва проекту</label>
              <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="напр. Byme — Google Ads" />
            </div>
            <div className="pf">
              <label>Менеджер</label>
              <input type="text" value={form.manager} onChange={(e) => setField('manager', e.target.value)} placeholder="Ім'я менеджера" />
            </div>
            <div className="pf">
              <label>Дата початку</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setField('start_date', e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
              />
            </div>
            <div className="pf">
              <label>Дата закінчення</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setField('end_date', e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
              />
            </div>
          </div>
          <div className="pf full">
            <label>Послуги</label>
            <div className="svc-picker">
              {SERVICES.map((s) => (
                <label className="svc-opt" key={s}>
                  <input type="checkbox" checked={form.services.includes(s)} onChange={() => toggleService(s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pf-sec-label">Додатково</div>
          <div className="pf-grid">
            <div className="pf">
              <label>Клієнт</label>
              <input type="text" value={form.client} onChange={(e) => setField('client', e.target.value)} placeholder="напр. Acme Inc." />
            </div>
            <div className="pf">
              <label>Країна</label>
              <input type="text" value={form.country} onChange={(e) => setField('country', e.target.value)} placeholder="напр. USA" />
            </div>
            <div className="pf full">
              <label>Сайт</label>
              <input type="text" value={form.website} onChange={(e) => setField('website', e.target.value)} placeholder="https://..." />
            </div>
          </div>

          {error && <div className="form-err">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={saving}>{saving ? '...' : 'Зберегти'}</button>
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}
