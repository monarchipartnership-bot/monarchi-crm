import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from './parts';
import '../../../styles/styleEditor.css';
import '../../../styles/textEdit.css';

// «Повернути креатив» (owner's pick A, step 3.1e): the person first says WHAT is wrong: the picture (it is made again in Higgsfield with their comment, about $0.2) or only the words (the editor of the
// words opens, the picture stays, free).
//   item: { id, conceptName }   canEditText: the creative has a picture the words can be changed on   onRedo(comment): Promise   onText()   onClose()
export default function ReturnDialog({ item, canEditText = true, onRedo, onText, onClose }) {
  const box = useRef(null);
  const [mode, setMode] = useState('redo');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, busy]);

  async function next() {
    if (mode === 'text') { onText(); return; }
    if (!comment.trim()) { setError('Напишіть, що саме змінити в картинці.'); return; }
    setBusy(true); setError('');
    try { await onRedo(comment.trim()); onClose(); } catch (e) { setError(e?.message || 'Не вдалося повернути креатив.'); setBusy(false); }
  }
  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive ted-ov" data-ai-safe onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="ted-win ted-ret" role="dialog" aria-modal="true" aria-label={`Повернути креатив ${item.conceptName}`} tabIndex={-1}>
        <header className="ted-head"><div><h2>Повернути «{item.conceptName}»</h2><small>Що саме не так?</small></div></header>
        <div className="ted-opts" role="radiogroup" aria-label="Що змінити">
          <label className={'ted-opt' + (mode === 'redo' ? ' is-on' : '')}>
            <input type="radio" name="ret-mode" checked={mode === 'redo'} onChange={() => setMode('redo')} />
            <span><b>Переробити картинку</b><small>Нова генерація в Higgsfield з вашим коментарем, ≈ $0.2. Текст накладеться заново.</small></span>
          </label>
          <label className={'ted-opt' + (mode === 'text' ? ' is-on' : '') + (canEditText ? '' : ' is-off')}>
            <input type="radio" name="ret-mode" checked={mode === 'text'} disabled={!canEditText} onChange={() => setMode('text')} />
            <span><b>Змінити лише текст</b><small>{canEditText ? 'Відкриється редактор тексту. Картинка та сама, $0.' : 'Для цього креатива редактор тексту недоступний: немає чистої картинки.'}</small></span>
          </label>
        </div>
        {mode === 'redo' && (
          <label className="se-row ted-f">
            <span className="se-lab">Коментар для агентів</span>
            <textarea rows={3} value={comment} maxLength={600} autoFocus onChange={(e) => { setComment(e.target.value); setError(''); }} placeholder="Що не так? Наприклад: флакони не схожі на наші, зробити світліший фон" />
          </label>
        )}
        {error && <p className="ckp-err" role="alert">{error}</p>}
        <div className="se-acts">
          <button type="button" className="ckp-btn is-primary" disabled={busy} onClick={next}>{busy ? <Spinner /> : null}{mode === 'text' ? 'Відкрити редактор' : 'Повернути на переробку'}</button>
          <button type="button" className="ckp-btn" disabled={busy} onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
