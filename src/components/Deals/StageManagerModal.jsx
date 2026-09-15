import { useEffect, useState } from 'react';
import { createStage, updateStage, deleteStage, reorderStages } from '../../lib/api/dealStages';

export default function StageManagerModal({ pipelineId, pipelineName, stages, onClose, onChanged }) {
  const [rows, setRows] = useState(stages);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  // `onChanged` re-fetches stages up in DealsBoard, which passes a fresh
  // `stages` array back down — without this sync, an add/delete wouldn't
  // show up here since this component isn't remounted on refresh.
  useEffect(() => { setRows(stages); }, [stages]);

  async function refresh() {
    await onChanged();
  }

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    await createStage({ label, pipelineId });
    setNewLabel('');
    await refresh();
    setBusy(false);
  }

  async function handleRename(id, label) {
    setRows((r) => r.map((s) => (s.id === id ? { ...s, label } : s)));
  }
  async function handleRenameCommit(id, label) {
    await updateStage(id, { label });
    await refresh();
  }

  async function handleFlag(id, field, value) {
    await updateStage(id, { [field]: value });
    await refresh();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цей етап?')) return;
    try {
      await deleteStage(id);
      await refresh();
    } catch (e) {
      alert(e.message || 'Помилка видалення');
    }
  }

  async function move(id, dir) {
    const idx = rows.findIndex((s) => s.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= rows.length) return;
    const next = [...rows];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setRows(next);
    setBusy(true);
    await reorderStages(next.map((s) => s.id));
    await refresh();
    setBusy(false);
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box stage-manager-modal">
        <div className="tmodal-head">
          <h3>Налаштувати етапи{pipelineName ? ` — ${pipelineName}` : ''}</h3>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="stage-manager-list">
            {rows.map((s, i) => (
              <div className="stage-manager-row" key={s.id}>
                <span className="stage-manager-color" style={{ background: s.color || '#7C3AED' }} />
                <input
                  type="text"
                  value={s.label}
                  onChange={(e) => handleRename(s.id, e.target.value)}
                  onBlur={(e) => handleRenameCommit(s.id, e.target.value)}
                />
                <label className="task-recur-toggle">
                  <input type="checkbox" checked={!!s.is_won} onChange={(e) => handleFlag(s.id, 'is_won', e.target.checked)} />
                  Виграно
                </label>
                <label className="task-recur-toggle">
                  <input type="checkbox" checked={!!s.is_lost} onChange={(e) => handleFlag(s.id, 'is_lost', e.target.checked)} />
                  Програно
                </label>
                <button type="button" className="btn" disabled={i === 0 || busy} onClick={() => move(s.id, -1)}>&uarr;</button>
                <button type="button" className="btn" disabled={i === rows.length - 1 || busy} onClick={() => move(s.id, 1)}>&darr;</button>
                <button type="button" className="task-del" onClick={() => handleDelete(s.id)} aria-label="Видалити етап">&times;</button>
              </div>
            ))}
          </div>
          <div className="task-add-row" style={{ marginTop: 14 }}>
            <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Назва нового етапу..." />
            <button type="button" className="btn btn-p" onClick={handleAdd} disabled={!newLabel.trim() || busy}>+ Додати етап</button>
          </div>
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn btn-p" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
