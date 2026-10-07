import { useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';

// "Мої кейси": save the current copy under a name and re-apply it later.
// Starts empty — nothing is pre-filled.
export default function CasesPanel({ cases, onSave, onApply, onDelete }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name);
    setName('');
  };
  return (
    <div className="cases">
      <form className="cases-add" onSubmit={submit}>
        <input className="field" value={name} maxLength={40} placeholder="Назва кейсу" aria-label="Назва кейсу" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="si-btn si-btn--soft" disabled={!name.trim()}>Зберегти</button>
      </form>
      {cases.length === 0 ? (
        <p className="si-note">Збережених кейсів ще немає. Збережений кейс запам’ятовує всі тексти, показники й теги.</p>
      ) : (
        <ul className="cases-list">
          {cases.map((c) => (
            <li key={c.id}>
              <button type="button" className="case-apply" onClick={() => onApply(c.content)}>{c.name}</button>
              <button type="button" className="tag-del" aria-label={`Видалити кейс ${c.name}`} onClick={() => onDelete(c.id)}>
                <ActionIcon name="clear" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
