import { useState } from 'react';
import { Spinner } from './parts';
import DialogShell, { LeftPicture } from './DialogShell';
import '../../../styles/styleEditor.css';
import '../../../styles/textEdit.css';

// «Повернути креатив» (owner's picks 2026-11-17, decision 54: the window with the creative on the left, the quick reasons as chips + a comment, the two ways as cards with the price): the person
// says WHAT is wrong: the picture (it is made again in Higgsfield with the reasons and the comment, about $0.2) or only the words (the editor of the words opens, the picture stays, free).
// The chosen reasons are written as a sentence and put before the own comment, so the agents get one text.
//   item: { id, conceptName, url?, ratio? }   canEditText: the creative has a picture the words can be changed on   onRedo(comment): Promise   onText()   onClose()
//   textOption: false = this screen has no editor of the words: the dialog only asks the reasons for a new picture
export const RETURN_REASONS = [
  ['Не схоже на наш товар', 'товар не схожий на наш'],
  ['Не ті кольори чи фон', 'змінити кольори та фон'],
  ['Текст погано видно', 'текст погано видно, зробити контрастнішим'],
  ['Немає логотипу чи бренду', 'додати логотип бренду'],
  ['Дефект картинки (спотворення)', 'є спотворення на картинці'],
  ['Не той настрій', 'інший настрій, тепліший'],
  ['Не той кадр чи формат', 'змінити кадр'],
];
// the text the agents get: the sentences of the chosen reasons, then the own comment
export const returnComment = (reasons, comment) => [reasons.map((r) => RETURN_REASONS.find(([k]) => k === r)?.[1]).filter(Boolean).join('; '), String(comment || '').trim()].filter(Boolean).join('. ');

const Icon = ({ d }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const IMG = 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM21 16l-5-5-8 8';
const TXT = 'M5 6h14M12 6v13M9 19h6';

export default function ReturnDialog({ item, canEditText = true, textOption = true, onRedo, onText, onClose }) {
  const [mode, setMode] = useState('redo');
  const [reasons, setReasons] = useState([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const composed = returnComment(reasons, comment);

  async function next() {
    if (mode === 'text') { onText(); return; }
    if (!composed) { setError('Оберіть причину або напишіть, що саме змінити.'); return; }
    setBusy(true); setError('');
    try { await onRedo(composed); onClose(); } catch (e) { setError(e?.message || 'Не вдалося повернути креатив.'); setBusy(false); }
  }
  const toggle = (k) => { setReasons((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k])); setError(''); };
  return (
    <DialogShell title={`Повернути «${item.conceptName}»`} sub="Що саме не так?" label={`Повернути креатив ${item.conceptName}`} busy={busy} onClose={onClose} onSubmit={next}
      left={<LeftPicture item={item} note={`${item.conceptName}${item.ratio ? ` · ${item.ratio}` : ''}`} />}
      footer={<>
        <button type="button" className="ckp-btn" disabled={busy} onClick={onClose}>Скасувати</button>
        <button type="button" className="ckp-btn is-primary" disabled={busy} onClick={next}>{busy ? <Spinner /> : null}{mode === 'text' ? 'Відкрити редактор' : 'Повернути на переробку · ≈ $0.2'}</button>
      </>}>
      {textOption && (
        <div>
          <span className="rtd-lab">Що змінити</span>
          <div className="rtd-opts" role="radiogroup" aria-label="Що змінити">
            <button type="button" role="radio" aria-checked={mode === 'redo'} className={'rtd-opt' + (mode === 'redo' ? ' is-on' : '')} onClick={() => setMode('redo')}>
              <span className="rtd-ic"><Icon d={IMG} /></span>
              <span><b>Картинку</b><small>Нова генерація з вашим коментарем. Текст накладеться заново.</small><em>≈ $0.2</em></span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'text'} disabled={!canEditText} className={'rtd-opt' + (mode === 'text' ? ' is-on' : '')} onClick={() => setMode('text')}>
              <span className="rtd-ic"><Icon d={TXT} /></span>
              <span><b>Лише текст</b><small>{canEditText ? 'Відкриється редактор, картинка та сама.' : 'Для цього креатива редактор тексту недоступний.'}</small><em>$0</em></span>
            </button>
          </div>
        </div>
      )}
      {mode === 'redo' && (
        <>
          <div>
            <span className="rtd-lab">Що не так?</span>
            <div className="rtd-chips" role="group" aria-label="Швидкі причини">
              {RETURN_REASONS.map(([k]) => <button key={k} type="button" aria-pressed={reasons.includes(k)} className={'rtd-chip' + (reasons.includes(k) ? ' is-on' : '')} onClick={() => toggle(k)}>{k}</button>)}
            </div>
          </div>
          <label className="rtd-cm">
            <span className="rtd-lab">Коментар для агентів <i>необовʼязково, якщо обрали причину</i></span>
            <textarea rows={3} value={comment} maxLength={600} autoFocus onChange={(e) => { setComment(e.target.value); setError(''); }} placeholder="Своїми словами: що змінити. Наприклад: зробити світліший фон" />
            <span className="rtd-cnt">{reasons.length ? <span>Агенти отримають: «{composed}»</span> : <span />}<span>{comment.length} / 600</span></span>
          </label>
        </>
      )}
      {error && <p className="ckp-err" role="alert">{error}</p>}
    </DialogShell>
  );
}
