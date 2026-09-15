import { useState, useEffect } from 'react';

// Plain-text notes, separate from the auto-populated Weekly Report history —
// a manager's own free-form remarks about the client. Saved on blur (no
// markdown rendering — plain text is simpler and enough for this).
export default function ClientNotesTab({ notes, onSave }) {
  const [draft, setDraft] = useState(notes || '');

  useEffect(() => { setDraft(notes || ''); }, [notes]);

  return (
    <div className="client-notes-tab">
      <textarea
        className="client-notes-textarea"
        value={draft}
        placeholder="Нотатки про клієнта..."
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (notes || '')) onSave(draft); }}
        rows={10}
      />
    </div>
  );
}
