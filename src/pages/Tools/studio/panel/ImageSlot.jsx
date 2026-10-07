import { useRef, useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';
import { readImage } from '../images';

// Upload slot: click, Enter/Space or drop an image. The file input is a real
// (hidden) <input type=file>, so the keyboard path is just a button that opens it.
export default function ImageSlot({ id, label, hint, value, onChange, compact = false }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  async function take(file) {
    if (!file) return;
    try {
      setError('');
      onChange(await readImage(file));
    } catch (e) {
      setError(e.message || 'Не вдалося завантажити');
    }
  }

  return (
    <div className="si-field">
      <div
        className={'slot' + (compact ? ' compact' : '') + (drag ? ' drag' : '')}
        role="button"
        tabIndex={0}
        aria-label={`Завантажити: ${label}`}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}
      >
        {value ? (
          <img src={value} alt={label} />
        ) : (
          <div className="slot-in">
            <span className="up"><ActionIcon name="create" size={22} /></span>
            <b>{label}</b>
            <i>{hint}</i>
          </div>
        )}
      </div>
      {value && (
        <button type="button" className="si-link" onClick={() => onChange(null)}>
          <ActionIcon name="clear" size={14} />Видалити: {label}
        </button>
      )}
      {error && <p className="si-error" role="alert">{error}</p>}
      <input id={id} ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { take(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}
