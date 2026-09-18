import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createPipeline, updatePipeline, deletePipeline } from '../../lib/api/pipelines';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { ColorPickerControl, DEFAULT_QUICK_COLORS, sameColor } from '../common/ColorPickerControl';

export const PIPELINE_COLORS = DEFAULT_QUICK_COLORS;

const LAYERS_ICON = '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>';
const GRIP_ICON = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
const INFO_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 11h1v5h1"/></svg>';

function newRowId() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Everything here is staged in local `rows` state and only actually sent to
// Supabase when "Готово" is clicked (diffed against the `pipelines` prop) —
// "Скасувати" just closes without calling anything, so an accidental drag,
// recolor, delete or new source never touches the database until confirmed.
export default function PipelineManagerModal({ pipelines, onClose, onChanged }) {
  const [rows, setRows] = useState(() => pipelines.map((p) => ({ ...p })));
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  function handleRename(id, name) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, name } : p)));
  }
  function handleColor(id, color) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, color } : p)));
  }
  function handleDelete(id) {
    const row = rows.find((r) => r.id === id);
    const isNew = String(id).startsWith('new-');
    if (!isNew && !confirm(`Видалити «${row?.name || ''}» разом з усіма його етапами?`)) return;
    setRows((r) => r.filter((p) => p.id !== id));
  }
  function handleAddSource() {
    setRows((r) => [...r, { id: newRowId(), name: '', color: PIPELINE_COLORS[r.length % PIPELINE_COLORS.length] }]);
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
      // Removing the dragged item shifts everything after it left by one —
      // land the drop at the target's own slot (not after it) by adjusting
      // for that shift instead of inserting at its now-stale index.
      const insertAt = dragIndex < i ? i - 1 : i;
      next.splice(insertAt, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function handleDone() {
    if (rows.some((r) => !r.name.trim())) { alert('Вкажіть назву для кожного джерела.'); return; }
    setSaving(true);
    const errors = [];
    const originalById = Object.fromEntries(pipelines.map((p) => [p.id, p]));
    const currentIds = new Set(rows.map((r) => r.id));

    for (const p of pipelines) {
      if (!currentIds.has(p.id)) {
        try { await deletePipeline(p.id); } catch (e) { errors.push(`«${p.name}»: ${e.message || e}`); }
      }
    }

    const idMap = {};
    for (const r of rows) {
      if (!String(r.id).startsWith('new-')) continue;
      try {
        const created = await createPipeline({ name: r.name.trim(), color: r.color });
        idMap[r.id] = created.id;
      } catch (e) { errors.push(`«${r.name}»: ${e.message || e}`); }
    }

    for (const r of rows) {
      if (String(r.id).startsWith('new-')) continue;
      const orig = originalById[r.id];
      if (!orig) continue;
      const patch = {};
      if (r.name.trim() !== orig.name) patch.name = r.name.trim();
      if (!sameColor(r.color, orig.color)) patch.color = r.color;
      if (Object.keys(patch).length) {
        try { await updatePipeline(r.id, patch); } catch (e) { errors.push(`«${r.name}»: ${e.message || e}`); }
      }
    }

    let idx = 0;
    for (const r of rows) {
      idx += 1;
      const realId = String(r.id).startsWith('new-') ? idMap[r.id] : r.id;
      if (!realId) continue;
      const orig = originalById[realId];
      if (!orig || orig.position !== idx) {
        try { await updatePipeline(realId, { position: idx }); } catch (e) { errors.push(e.message || String(e)); }
      }
    }

    await onChanged();
    setSaving(false);
    if (errors.length) { alert('Не вдалося зберегти деякі зміни:\n' + errors.join('\n')); return; }
    onClose();
  }

  // Portaled straight to document.body — nested under the sticky TopBar's
  // shared ancestor (<main>), this modal's z-index (however high) never
  // actually wins against the topbar: browsers give a `position: sticky`
  // element its own persistent compositing layer that paints above ordinary
  // in-flow content sharing its stacking context regardless of z-index, so
  // a modal that's still a descendant of <main> renders under it. Moving the
  // overlay out to be a direct child of <body> sidesteps that entirely.
  return createPortal(
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box pipeline-manager-modal">
        <div className="tmodal-head">
          <div className="pipeline-modal-head">
            <span className="pipeline-modal-head-ic" dangerouslySetInnerHTML={{ __html: LAYERS_ICON }} />
            <div>
              <h3>Керувати Pipeline</h3>
              <p>Налаштуйте джерела заявок та їх кольори. Перетягуйте, щоб змінити порядок.</p>
            </div>
          </div>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="pipeline-manager-list">
            {rows.map((p, i) => (
              <div
                key={p.id}
                className={'pipeline-manager-row' + (dragOverIndex === i && dragIndex !== i ? ' drag-over' : '')}
                onDragOver={(e) => handleDragOverRow(e, i)}
                onDragLeave={() => handleDragLeaveRow(i)}
                onDrop={() => handleDropRow(i)}
              >
                <div className="pipeline-row-top">
                  <span
                    className="pipeline-drag-handle" draggable title="Перетягніть, щоб змінити порядок"
                    onDragStart={() => handleDragStart(i)} onDragEnd={handleDragEnd}
                    dangerouslySetInnerHTML={{ __html: GRIP_ICON }}
                  />
                  <span className="pipeline-manager-dot" style={{ background: p.color || '#7C3AED' }} />
                  <input
                    type="text" className="pipeline-name-input" value={p.name}
                    onChange={(e) => handleRename(p.id, e.target.value)}
                    placeholder="Назва джерела..."
                  />
                  <button type="button" className="pipeline-delete-btn" onClick={() => handleDelete(p.id)} aria-label="Видалити джерело" title="Видалити">
                    <span dangerouslySetInnerHTML={{ __html: TRASH_ICON }} />
                  </button>
                </div>
                <div className="pipeline-row-colors">
                  <ColorPickerControl color={p.color || '#7C3AED'} onChange={(c) => handleColor(p.id, c)} />
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="pipeline-add-source" onClick={handleAddSource}>
            <span className="pipeline-add-source-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} />
            <span>
              <span className="pipeline-add-source-title">Додати джерело</span>
              <span className="pipeline-add-source-sub">Створіть нове джерело заявок</span>
            </span>
          </button>
        </div>
        <div className="tmodal-foot pipeline-manager-foot">
          <span className="pipeline-foot-note">
            <span dangerouslySetInnerHTML={{ __html: INFO_ICON }} />
            Зміни збережуться після натискання «Готово»
          </span>
          <span className="pipeline-foot-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Скасувати</button>
            <button type="button" className="btn btn-p" onClick={handleDone} disabled={saving}>
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} /> {saving ? 'Збереження...' : 'Готово'}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
