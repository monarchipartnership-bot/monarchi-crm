import { useState } from 'react';
import { BASE_TAGS, colorForTag } from '../../lib/tagColors';

// Chip-style multi-tag input. Type a word + Enter (or comma) commits a chip;
// × removes one. Base tags are shown as one-click suggestions when the
// draft field is empty and they aren't already selected.
// `colorFor` (optional) overrides the default hash-based colorForTag — Task
// Manager passes each department's own `task_categories` colors here
// instead, since a category's color is a real stored value, not a hash.
export default function TagInput({ tags, onChange, suggestions = BASE_TAGS, onNewTag, placeholder = 'Тег...', disabled, colorFor = colorForTag }) {
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
    <div className={'tag-input' + (disabled ? ' tag-input--disabled' : '')}>
      <div className="tag-input-chips">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag} style={{ background: colorFor(tag) }}>
            {tag}
            {!disabled && (
              <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={`Видалити тег ${tag}`}>&times;</button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => commit(draft)}
            placeholder={tags.length ? '' : placeholder}
          />
        )}
        {disabled && tags.length === 0 && <span className="tag-input-empty">—</span>}
      </div>
      {!disabled && availableSuggestions.length > 0 && (
        <div className="tag-input-suggestions">
          {availableSuggestions.map((tag) => (
            <button type="button" key={tag} className="tag-suggestion" style={{ '--tag-color': colorFor(tag) }} onClick={() => commit(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
