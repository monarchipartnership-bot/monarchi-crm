import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REAL_LOOKS } from '../../../lib/creatives/realism';
import { fmtUsd } from './format';
import { Spinner } from './parts';
import '../../../styles/styleEditor.css';
import '../../../styles/textEdit.css';

// «Порівняти реалізм» (step 3.4, 2026-11-13): the SAME scene of a picture in other realism looks, side by side in the results. The price is asked first (about $0.2 a picture), nothing is made until the person
// confirms; the pictures come next to the original in a few minutes and are judged by eye: which one looks like a real photo.
//   item: { id, conceptName }   currentLook: the look of the task (not offered again)   onAct(key, payload): Promise   onClose()
export default function CompareLooksDialog({ item, currentLook = 'std', onAct, onClose }) {
  const box = useRef(null);
  const [sel, setSel] = useState([]);
  const [est, setEst] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, busy]);
  // the price for the chosen looks
  useEffect(() => {
    setEst(null); setError('');
    if (!sel.length) return undefined;
    let dead = false; setAsking(true);
    onAct('compare_estimate', { creativeId: item.id, looks: sel }).then((r) => { if (!dead) setEst(r?.compare || null); }).catch((e) => { if (!dead) setError(e?.message || 'Не вдалося оцінити вартість.'); }).finally(() => { if (!dead) setAsking(false); });
    return () => { dead = true; };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= 3 ? s : [...s, k]));

  async function run() {
    setBusy(true); setError('');
    try { const r = await onAct('compare_run', { creativeId: item.id, looks: sel }); setDone(r?.submitted || sel.length); } catch (e) { setError(e?.message || 'Не вдалося запустити.'); } finally { setBusy(false); }
  }
  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive ted-ov" data-ai-safe onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="ted-win ted-ret" role="dialog" aria-modal="true" aria-label={`Порівняти реалізм: ${item.conceptName}`} tabIndex={-1}>
        <header className="ted-head"><div><h2>Порівняти реалізм «{item.conceptName}»</h2><small>Та сама сцена в інших виглядах, поруч з оригіналом. До трьох вигладів за раз.</small></div></header>
        {done > 0 ? (
          <>
            <p className="sd-note" role="status">Запущено картинок: {done}. Вони зʼявляться поруч з оригіналом у розділі «Результати» за кілька хвилин.</p>
            <div className="se-acts"><button type="button" className="ckp-btn is-primary" onClick={onClose}>Готово</button></div>
          </>
        ) : (
          <>
            <div className="ted-opts" role="group" aria-label="Вигляди для порівняння">
              {REAL_LOOKS.map((l) => (
                <label key={l.key} className={'ted-opt' + (sel.includes(l.key) ? ' is-on' : '') + (l.key === currentLook ? ' is-off' : '')}>
                  <input type="checkbox" checked={sel.includes(l.key)} disabled={l.key === currentLook || (!sel.includes(l.key) && sel.length >= 3)} onChange={() => toggle(l.key)} />
                  <span><b>{l.label}</b><small>{l.key === currentLook ? 'Уже вибрано для цього завдання.' : l.desc}</small></span>
                </label>
              ))}
            </div>
            {sel.length > 0 && (
              <p className="sd-note" role="status">{asking ? 'Рахуємо вартість…' : est ? `≈ ${fmtUsd(est.usd)} за ${est.count} ${est.count === 1 ? 'картинку' : 'картинки'}${est.fits === false ? `. Не вміщується в ліміт завдання ($${est.limit}): збільшіть ліміт у налаштуваннях завдання.` : '.'}` : ''}</p>
            )}
            {error && <p className="ckp-err" role="alert">{error}</p>}
            <div className="se-acts">
              <button type="button" className="ckp-btn is-primary" disabled={busy || !sel.length || !est || est.fits === false} onClick={run}>{busy ? <Spinner /> : null}{est ? `Створити за ${fmtUsd(est.usd)}` : 'Створити'}</button>
              <button type="button" className="ckp-btn" disabled={busy} onClick={onClose}>Скасувати</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
