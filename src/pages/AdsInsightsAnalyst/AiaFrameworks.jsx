import { useState } from 'react';

const EDIT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

// The sidebar's "Фреймворки" tab — a reusable library of audit frameworks
// (name + instructions), selectable, editable, deletable. CRUD calls and
// the `frameworks`/`selectedId` state live in AdsInsightsAnalyst.jsx; this
// component only owns the create/edit form's local draft state.
export default function AiaFrameworks({ frameworks, selectedId, onSelect, onCreate, onUpdate, onDelete, emptyIcon }) {
  const [editing, setEditing] = useState(null); // null | 'new' | frameworkId
  const [draftName, setDraftName] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  function startCreate() {
    setEditing('new');
    setDraftName('');
    setDraftInstructions('');
  }

  function startEdit(fw) {
    setEditing(fw.id);
    setDraftName(fw.name);
    setDraftInstructions(fw.instructions);
  }

  async function save() {
    if (!draftName.trim() || !draftInstructions.trim() || saving) return;
    setSaving(true);
    try {
      if (editing === 'new') await onCreate({ name: draftName, instructions: draftInstructions });
      else await onUpdate(editing, { name: draftName, instructions: draftInstructions });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  if (editing !== null) {
    return (
      <div className="aia-framework-form">
        <input
          type="text" placeholder="Назва фреймворку" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus
        />
        <textarea
          placeholder="Опишіть структуру аудиту: що перевіряти, в якому порядку, які порівняння робити, який формат висновку потрібен…"
          value={draftInstructions} onChange={(e) => setDraftInstructions(e.target.value)}
        />
        <div className="aia-framework-form-actions">
          <button type="button" className="aia-hotkey-btn" onClick={() => setEditing(null)} disabled={saving}>Скасувати</button>
          <button type="button" className="aia-new-convo-btn" onClick={save} disabled={saving || !draftName.trim() || !draftInstructions.trim()}>
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="aia-new-convo-btn" onClick={startCreate}>
        <span dangerouslySetInnerHTML={{ __html: PLUS_ICON }} /> Новий фреймворк
      </button>
      {!frameworks.length && (
        <div className="aia-panel-empty">
          {emptyIcon && <span className="aia-panel-empty-icon" dangerouslySetInnerHTML={{ __html: emptyIcon }} />}
          <div className="aia-panel-empty-title">Ще немає фреймворків</div>
          <div className="aia-panel-empty-text">Ще немає збережених фреймворків аудиту.</div>
        </div>
      )}
      {frameworks.map((fw) => (
        <div key={fw.id} className={'aia-framework-item' + (selectedId === fw.id ? ' active' : '')}>
          <button type="button" className="aia-framework-item-main" onClick={() => onSelect(fw.id)}>
            {fw.name}
          </button>
          <span className="aia-framework-item-actions">
            <button type="button" onClick={() => startEdit(fw)} aria-label="Редагувати" dangerouslySetInnerHTML={{ __html: EDIT_ICON }} />
            <button type="button" onClick={() => onDelete(fw.id)} aria-label="Видалити" dangerouslySetInnerHTML={{ __html: TRASH_ICON }} />
          </span>
        </div>
      ))}
    </>
  );
}
