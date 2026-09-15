import { useEffect, useState } from 'react';
import { createPipeline, updatePipeline, deletePipeline } from '../../lib/api/pipelines';

export const PIPELINE_COLORS = [
  '#7C3AED', '#2F80ED', '#0EA5E9', '#1E9E5D', '#059669',
  '#D97706', '#D14343', '#EC4899', '#8B5CF6', '#64748B',
];

function ColorRow({ value, onPick }) {
  return (
    <div className="pipeline-color-row">
      {PIPELINE_COLORS.map((c) => (
        <button
          key={c} type="button" className={'pipeline-color-swatch' + (value === c ? ' active' : '')}
          style={{ background: c }} onClick={() => onPick(c)} aria-label={c}
        />
      ))}
    </div>
  );
}

export default function PipelineManagerModal({ pipelines, onClose, onChanged }) {
  const [rows, setRows] = useState(pipelines);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PIPELINE_COLORS[0]);
  const [busy, setBusy] = useState(false);

  // `onChanged` re-fetches pipelines up in DealsBoard, which passes a fresh
  // `pipelines` array back down here — after an add/delete this component
  // itself isn't remounted, so without this sync `rows` would keep showing
  // the pre-refresh list (e.g. a just-deleted pipeline still appearing).
  useEffect(() => { setRows(pipelines); }, [pipelines]);

  async function refresh() {
    await onChanged();
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createPipeline({ name, color: newColor });
      setNewName('');
      setNewColor(PIPELINE_COLORS[0]);
      await refresh();
    } catch (e) {
      alert('Помилка створення pipeline: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function handleRename(id, name) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, name } : p)));
  }
  async function handleRenameCommit(id, name) {
    if (!name.trim()) return;
    await updatePipeline(id, { name: name.trim() });
    await refresh();
  }

  async function handleColor(id, color) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, color } : p)));
    await updatePipeline(id, { color });
    await refresh();
  }

  async function handleDelete(id) {
    if (!confirm('Видалити цей pipeline разом з усіма його етапами?')) return;
    try {
      await deletePipeline(id);
      await refresh();
    } catch (e) {
      alert(e.message || 'Помилка видалення');
    }
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box pipeline-manager-modal">
        <div className="tmodal-head">
          <h3>Керувати Pipeline</h3>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="pipeline-manager-list">
            {rows.map((p) => (
              <div className="pipeline-manager-row" key={p.id}>
                <div className="pipeline-manager-row-main">
                  <span className="pipeline-manager-dot" style={{ background: p.color || '#7C3AED' }} />
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => handleRename(p.id, e.target.value)}
                    onBlur={(e) => handleRenameCommit(p.id, e.target.value)}
                  />
                  <button type="button" className="task-del" onClick={() => handleDelete(p.id)} aria-label="Видалити pipeline">&times;</button>
                </div>
                <ColorRow value={p.color} onPick={(c) => handleColor(p.id, c)} />
              </div>
            ))}
          </div>

          <div className="pipeline-manager-add">
            <div className="pipeline-manager-row-main">
              <span className="pipeline-manager-dot" style={{ background: newColor }} />
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Назва нового pipeline..." />
            </div>
            <ColorRow value={newColor} onPick={setNewColor} />
            <button type="button" className="btn btn-p" onClick={handleAdd} disabled={!newName.trim() || busy} style={{ marginTop: 10 }}>
              + Додати pipeline
            </button>
          </div>
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn btn-p" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
