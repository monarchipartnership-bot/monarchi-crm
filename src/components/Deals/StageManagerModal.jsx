import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createStage, updateStage, deleteStage } from '../../lib/api/dealStages';
import { ColorPickerControl, DEFAULT_QUICK_COLORS, sameColor } from '../common/ColorPickerControl';

const GRIP_ICON = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
const INFO_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 11h1v5h1"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
const UP_ICON = '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const DOWN_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
const LAYERS_ICON = '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>';

function newRowId() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Everything here is staged in local `rows` state and only actually sent to
// Supabase when "Готово" is clicked (diffed against the `stages` prop) —
// same convention as PipelineManagerModal, so both read as one system.
export default function StageManagerModal({ pipelineId, pipelineName, stages, onClose, onChanged }) {
  const [rows, setRows] = useState(() => stages.map((s) => ({ ...s })));
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_QUICK_COLORS[0]);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  function handleRename(id, label) {
    setRows((r) => r.map((s) => (s.id === id ? { ...s, label } : s)));
  }
  function handleColor(id, color) {
    setRows((r) => r.map((s) => (s.id === id ? { ...s, color } : s)));
  }
  // Only one stage can be the Won result and only one can be the Lost result
  // — checking one clears it off every other row, and clears the opposite
  // flag on this same row (a stage can't be both at once).
  function handleFlag(id, field, value) {
    const opposite = field === 'is_won' ? 'is_lost' : 'is_won';
    setRows((r) => r.map((s) => {
      if (s.id === id) return { ...s, [field]: value, ...(value ? { [opposite]: false } : {}) };
      return value ? { ...s, [field]: false } : s;
    }));
  }
  function handleDelete(id) {
    const row = rows.find((s) => s.id === id);
    const isNew = String(id).startsWith('new-');
    if (!isNew && !confirm(`Видалити етап «${row?.label || ''}»?`)) return;
    setRows((r) => r.filter((s) => s.id !== id));
  }
  function handleAddStage() {
    const label = newLabel.trim();
    if (!label) return;
    setRows((r) => [...r, { id: newRowId(), label, color: newColor, is_won: false, is_lost: false }]);
    setNewLabel('');
    setNewColor(DEFAULT_QUICK_COLORS[(rows.length + 1) % DEFAULT_QUICK_COLORS.length]);
  }

  function move(id, dir) {
    setRows((r) => {
      const idx = r.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (swap < 0 || swap >= r.length) return r;
      const next = [...r];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function handleDragStart(i) { setDragIndex(i); }
  function handleDragOverRow(e, i) { e.preventDefault(); setDragOverIndex(i); }
  function handleDragLeaveRow(i) { setDragOverIndex((cur) => (cur === i ? null : cur)); }
  function handleDragEnd() { setDragIndex(null); setDragOverIndex(null); }
  function handleDropRow(i) {
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); return; }
    setRows((r) => {
      const next = [...r];
      const [moved] = next.splice(dragIndex, 1);
      const insertAt = dragIndex < i ? i - 1 : i;
      next.splice(insertAt, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function handleDone() {
    if (rows.some((s) => !s.label.trim())) { alert('Вкажіть назву для кожного етапу.'); return; }
    setSaving(true);
    const errors = [];
    const originalById = Object.fromEntries(stages.map((s) => [s.id, s]));
    const currentIds = new Set(rows.map((s) => s.id));

    for (const s of stages) {
      if (!currentIds.has(s.id)) {
        try { await deleteStage(s.id); } catch (e) { errors.push(`«${s.label}»: ${e.message || e}`); }
      }
    }

    const idMap = {};
    for (const s of rows) {
      if (!String(s.id).startsWith('new-')) continue;
      try {
        const created = await createStage({ label: s.label.trim(), color: s.color, pipelineId });
        if (s.is_won || s.is_lost) await updateStage(created.id, { is_won: !!s.is_won, is_lost: !!s.is_lost });
        idMap[s.id] = created.id;
      } catch (e) { errors.push(`«${s.label}»: ${e.message || e}`); }
    }

    for (const s of rows) {
      if (String(s.id).startsWith('new-')) continue;
      const orig = originalById[s.id];
      if (!orig) continue;
      const patch = {};
      if (s.label.trim() !== orig.label) patch.label = s.label.trim();
      if (!sameColor(s.color, orig.color)) patch.color = s.color;
      if (!!s.is_won !== !!orig.is_won) patch.is_won = !!s.is_won;
      if (!!s.is_lost !== !!orig.is_lost) patch.is_lost = !!s.is_lost;
      if (Object.keys(patch).length) {
        try { await updateStage(s.id, patch); } catch (e) { errors.push(`«${s.label}»: ${e.message || e}`); }
      }
    }

    let idx = 0;
    for (const s of rows) {
      idx += 1;
      const realId = String(s.id).startsWith('new-') ? idMap[s.id] : s.id;
      if (!realId) continue;
      const orig = originalById[realId];
      if (!orig || orig.position !== idx) {
        try { await updateStage(realId, { position: idx }); } catch (e) { errors.push(e.message || String(e)); }
      }
    }

    await onChanged();
    setSaving(false);
    if (errors.length) { alert('Не вдалося зберегти деякі зміни:\n' + errors.join('\n')); return; }
    onClose();
  }

  return createPortal(
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box stage-manager-modal">
        <div className="tmodal-head">
          <div className="pipeline-modal-head">
            <span className="pipeline-modal-head-ic" dangerouslySetInnerHTML={{ __html: LAYERS_ICON }} />
            <div>
              <h3>Налаштувати етапи{pipelineName ? ` — ${pipelineName}` : ''}</h3>
              <p>Ви можете перейменувати етапи, змінити їх порядок, позначити фінальні результати та вибрати колір для кожного етапу.</p>
            </div>
          </div>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="stage-info-banner">
            <span className="stage-info-ic" dangerouslySetInnerHTML={{ __html: INFO_ICON }} />
            <span>Можна мати лише один етап <b>«Виграно»</b> і один етап <b>«Програно»</b>. Ці етапи вважаються фінальними результатами угоди.</span>
          </div>

          <div className="stage-table">
            <div className="stage-table-row stage-table-head">
              <span>#</span>
              <span>Етап</span>
              <span>Колір</span>
              <span>Фінальний результат</span>
              <span>Дії</span>
            </div>

            {rows.map((s, i) => (
              <div
                key={s.id}
                className={'stage-table-row' + (dragOverIndex === i && dragIndex !== i ? ' drag-over' : '')}
                onDragOver={(e) => handleDragOverRow(e, i)}
                onDragLeave={() => handleDragLeaveRow(i)}
                onDrop={() => handleDropRow(i)}
              >
                <span
                  className="pipeline-drag-handle" draggable title="Перетягніть, щоб змінити порядок"
                  onDragStart={() => handleDragStart(i)} onDragEnd={handleDragEnd}
                  dangerouslySetInnerHTML={{ __html: GRIP_ICON }}
                />
                <div className="stage-name-cell">
                  <span className="pipeline-manager-dot" style={{ background: s.color || '#7C3AED' }} />
                  <input
                    type="text" className="pipeline-name-input" value={s.label}
                    onChange={(e) => handleRename(s.id, e.target.value)}
                    placeholder="Назва етапу..."
                  />
                </div>
                <div className="stage-color-cell">
                  <ColorPickerControl color={s.color || '#7C3AED'} onChange={(c) => handleColor(s.id, c)} />
                </div>
                <div className="stage-final-cell">
                  <label className={'stage-final-check' + (s.is_won ? ' active-won' : '')}>
                    <input type="checkbox" checked={!!s.is_won} onChange={(e) => handleFlag(s.id, 'is_won', e.target.checked)} />
                    <span className="stage-final-box" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />
                    Виграно
                  </label>
                  <label className={'stage-final-check' + (s.is_lost ? ' active-lost' : '')}>
                    <input type="checkbox" checked={!!s.is_lost} onChange={(e) => handleFlag(s.id, 'is_lost', e.target.checked)} />
                    <span className="stage-final-box" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />
                    Програно
                  </label>
                </div>
                <div className="stage-actions-cell">
                  <button type="button" className="deal-field-icon-btn" disabled={i === 0} title="Вище" onClick={() => move(s.id, -1)} dangerouslySetInnerHTML={{ __html: UP_ICON }} />
                  <button type="button" className="deal-field-icon-btn" disabled={i === rows.length - 1} title="Нижче" onClick={() => move(s.id, 1)} dangerouslySetInnerHTML={{ __html: DOWN_ICON }} />
                  <button type="button" className="pipeline-delete-btn" onClick={() => handleDelete(s.id)} aria-label="Видалити етап" title="Видалити">
                    <span dangerouslySetInnerHTML={{ __html: TRASH_ICON }} />
                  </button>
                </div>
              </div>
            ))}

            <div className="stage-table-row stage-add-row">
              <span className="stage-add-ic">+</span>
              <div className="stage-name-cell">
                <input
                  type="text" className="pipeline-name-input" value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddStage(); }}
                  placeholder="Назва нового етапу..."
                />
              </div>
              <div className="stage-color-cell">
                <ColorPickerControl color={newColor} onChange={setNewColor} />
              </div>
              <div className="stage-actions-cell stage-add-actions">
                <button type="button" className="btn btn-p" onClick={handleAddStage} disabled={!newLabel.trim()}>+ Додати етап</button>
              </div>
            </div>
          </div>
        </div>
        <div className="tmodal-foot pipeline-manager-foot">
          <span className="pipeline-foot-note">
            <span dangerouslySetInnerHTML={{ __html: INFO_ICON }} />
            Зміни збережуться після натискання «Готово»
          </span>
          <span className="pipeline-foot-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Скасувати</button>
            <button type="button" className="btn btn-p" onClick={handleDone} disabled={saving}>
              <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} /> {saving ? 'Збереження...' : 'Готово'}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
