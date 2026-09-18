import { useState } from 'react';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import DepartmentEditModal from './DepartmentEditModal';

const ALL_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

// Department switcher — same "our style" card row as ReportTypeSwitcher.jsx
// (gradient icon badge + label, active one outlined), just driven by real
// `departments` rows instead of a fixed array, plus a leading "Всі задачі"
// pseudo-tab (activeDepartmentId === null) and a trailing "+ Новий відділ".
export default function DepartmentTabs({ departments, activeDepartmentId, onSelect, onChanged }) {
  const [editing, setEditing] = useState(null); // null closed, 'new' blank, or a department object

  return (
    <>
      <div className="tm-dept-tabs">
        <button type="button" className={'tm-dept-card' + (activeDepartmentId === null ? ' active' : '')} onClick={() => onSelect(null)}>
          <span className="tm-dept-card-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: ALL_ICON }} />
          <span className="tm-dept-card-label">Всі задачі</span>
        </button>
        {departments.map((d) => (
          <button
            type="button" key={d.id}
            className={'tm-dept-card' + (activeDepartmentId === d.id ? ' active' : '')}
            onClick={() => onSelect(d.id)}
          >
            <span className="tm-dept-card-icon" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${d.color} 55%, #fff), ${d.color})` }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS[d.icon] || FIELD_ICONS.briefcase }} />
            <span className="tm-dept-card-label">{d.name}</span>
          </button>
        ))}
        <button type="button" className="btn btn-p tm-dept-add" onClick={() => setEditing('new')}>
          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} /> Новий відділ
        </button>
      </div>

      {editing && (
        <DepartmentEditModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
