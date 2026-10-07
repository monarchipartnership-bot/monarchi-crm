import ActionIcon from '../../../../components/common/ActionIcon';

// Editable tag list: text, accent-colour toggle and delete per tag.
export default function TagsEditor({ tags, max, onAdd, onChange, onRemove }) {
  return (
    <div className="tags-ed">
      {tags.map((t, i) => (
        <div className={'tag-row' + (i >= max ? ' is-hidden' : '')} key={i}>
          <button
            type="button"
            className={'tag-dot' + (t.a ? ' on' : '')}
            aria-pressed={t.a}
            aria-label={`Тег ${i + 1}: акцентний колір`}
            title="Акцентний колір"
            onClick={() => onChange(i, { a: !t.a })}
          />
          <input className="field" value={t.t} maxLength={32} aria-label={`Тег ${i + 1}`} onChange={(e) => onChange(i, { t: e.target.value })} />
          <button type="button" className="tag-del" aria-label={`Видалити тег ${i + 1}`} onClick={() => onRemove(i)}>
            <ActionIcon name="clear" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="si-link" onClick={onAdd} disabled={tags.length >= 14}>
        <ActionIcon name="create" size={14} />Додати тег
      </button>
      <p className="si-note">Крапка — акцентний колір. На обкладинці показуються перші {max}.</p>
    </div>
  );
}
