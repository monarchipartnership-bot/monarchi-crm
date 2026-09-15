import { useState } from 'react';
import { BASE_TAGS, colorForTag } from '../../lib/tagColors';

// Chip-style multi-tag input. Type a word + Enter (or comma) commits a chip;
// × removes one. Base tags are shown as one-click suggestions when the
// draft field is empty and they aren't already selected.
export default function TagInput({ tags, onChange, suggestions = BASE_TAGS, onNewTag }) {
  const [draft, setDraft] = useState('');

  function commit(raw) {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) { setDraft(''); return; }
    if (!suggestions.includes(tag)) onNewTag?.(tag);
    onChange([...tags, tag]);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  const availableSuggestions = suggestions.filter((t) => !tags.includes(t));

  return (
    <div className="tag-input">
      <div className="tag-input-chips">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag} style={{ background: colorForTag(tag) }}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={`Видалити тег ${tag}`}>&times;</button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          placeholder={tags.length ? '' : 'Тег...'}
        />
      </div>
      {availableSuggestions.length > 0 && (
        <div className="tag-input-suggestions">
          {availableSuggestions.map((tag) => (
            <button type="button" key={tag} className="tag-suggestion" style={{ '--tag-color': colorForTag(tag) }} onClick={() => commit(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
