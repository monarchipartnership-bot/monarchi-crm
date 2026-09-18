import { useState } from 'react';
import { createDepartment, updateDepartment } from '../../lib/api/departments';
import { ColorPickerControl } from '../../components/common/ColorPickerControl';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

// A small curated set of icons that read well as a department identity —
// no dedicated icon-picker exists anywhere else in the app yet, so this is
// a plain grid of buttons (same interaction shape as ColorPickerControl's
// quick-swatch row) rather than a new generic component, since departments
// are the only place this is needed so far.
const ICON_CHOICES = ['briefcase', 'target', 'barChart', 'megaphone', 'repeat', 'checklist', 'kanban', 'user', 'mapPin', 'document'];

// Create ("+ Новий відділ") or edit (`initial` given) a department. Saving
// just writes name/color/icon — createDepartment (departments.js) seeds the
// default 5-stage pipeline automatically, same convention as deals'
// createPipeline seeding DEFAULT_STAGE_TEMPLATE.
export default function DepartmentEditModal({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || '#7C3AED');
  const [icon, setIcon] = useState(initial?.icon || ICON_CHOICES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      if (initial) {
        await updateDepartment(initial.id, { name: trimmed, color, icon });
      } else {
        await createDepartment({ name: trimmed, color, icon });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError('Помилка збереження: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box">
        <div className="tmodal-head">
          <div className="tmodal-head-left tmodal-head-left--center">
            <span className="tmodal-head-icon" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 55%, #fff), ${color})` }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS[icon] || FIELD_ICONS.briefcase }} />
            <div className="tmodal-head-text">
              <h3>{initial ? 'Редагувати відділ' : 'Новий відділ'}</h3>
            </div>
          </div>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.title }} />
              <div>
                <label>Назва відділу</label>
                <p>Напр. "Sales відділ", "SEO відділ"</p>
              </div>
            </div>
            <div className="modal-field-control">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва відділу" autoFocus />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
              <div>
                <label>Колір</label>
                <p>Використовується у вкладці відділу та бейджах його задач</p>
              </div>
            </div>
            <div className="modal-field-control">
              <ColorPickerControl color={color} onChange={setColor} />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #F472B6, #DB2777)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.image }} />
              <div>
                <label>Іконка</label>
                <p>Обрати іконку відділу</p>
              </div>
            </div>
            <div className="modal-field-control department-icon-grid">
              {ICON_CHOICES.map((key) => (
                <button
                  type="button" key={key}
                  className={'department-icon-choice' + (icon === key ? ' active' : '')}
                  onClick={() => setIcon(key)}
                  style={icon === key ? { background: color } : undefined}
                  dangerouslySetInnerHTML={{ __html: FIELD_ICONS[key] }}
                />
              ))}
            </div>
          </div>
          {error && <p className="import-error">{error}</p>}
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={!name.trim() || saving}>
            <span className="deal-action-ic deal-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> {saving ? '...' : (initial ? 'Зберегти' : 'Створити')}
          </button>
        </div>
      </div>
    </div>
  );
}
