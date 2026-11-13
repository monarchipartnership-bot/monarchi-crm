import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtUsd } from './format';
import { Spinner } from './parts';
import { Chips } from './StyleEditor';
import '../../../styles/styleEditor.css';
import '../../../styles/textEdit.css';

// «Створити відео» (step 3.5, 2026-11-13): a short video made of a finished picture (the picture is the first frame). The price is asked first, nothing is made until the person confirms;
// the video comes next to the picture in the results in a few minutes. The words over the picture are NOT in the video (they are added by the person in an editor of video later).
//   item: { id, conceptName, rawUrl, ratio }   onAct(key, payload): Promise   onClose()
const SECONDS = [[5, '5 секунд'], [8, '8 секунд']];
const SOUND = [['off', 'без звуку'], ['on', 'зі звуком']];

export default function VideoDialog({ item, onAct, onClose }) {
  const box = useRef(null);
  const [seconds, setSeconds] = useState(5);
  const [sound, setSound] = useState('off');
  const [prompt, setPrompt] = useState('');
  const [est, setEst] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, busy]);
  // the price for the chosen length and sound (the text of the motion does not change the price)
  useEffect(() => {
    setEst(null); setError(''); setAsking(true);
    let dead = false;
    onAct('video_estimate', { creativeId: item.id, seconds, sound: sound === 'on', prompt: '' })
      .then((r) => { if (!dead) setEst(r?.video || null); })
      .catch((e) => { if (!dead) setError(e?.message || 'Не вдалося оцінити вартість.'); })
      .finally(() => { if (!dead) setAsking(false); });
    return () => { dead = true; };
  }, [seconds, sound]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true); setError('');
    try { await onAct('video_run', { creativeId: item.id, seconds, sound: sound === 'on', prompt }); setDone(true); } catch (e) { setError(e?.message || 'Не вдалося запустити.'); } finally { setBusy(false); }
  }
  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive ted-ov" data-ai-safe onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="ted-win ted-ret" role="dialog" aria-modal="true" aria-label={`Створити відео: ${item.conceptName}`} tabIndex={-1}>
        <header className="ted-head"><div><h2>Відео з «{item.conceptName}»</h2><small>Картинка стане першим кадром короткого відео. Текст поверх картинки у відео не потрапляє.</small></div></header>
        {done ? (
          <>
            <p className="sd-note" role="status">Відео запущено. Воно зʼявиться поруч з картинкою у розділі «Результати» за кілька хвилин.</p>
            <div className="se-acts"><button type="button" className="ckp-btn is-primary" onClick={onClose}>Готово</button></div>
          </>
        ) : (
          <>
            <Chips label="Тривалість" value={seconds} options={SECONDS} onPick={setSeconds} />
            <Chips label="Звук" value={sound} options={SOUND} onPick={setSound} />
            <label className="se-row se-field">
              <span className="se-lab">Що має рухатись (необовʼязково)</span>
              <textarea rows={3} maxLength={600} value={prompt} placeholder="Наприклад: повільний наїзд камери, легкий рух тканини. Якщо порожньо, буде спокійний наїзд камери без нових предметів." onChange={(e) => setPrompt(e.target.value)} aria-label="Що має рухатись" />
            </label>
            <p className="sd-note" role="status">{asking ? 'Рахуємо вартість…' : est ? `≈ ${fmtUsd(est.usd)} за відео ${est.seconds} с${est.fits === false ? `. Не вміщується в ліміт завдання ($${est.limit}, вже витрачено ${fmtUsd(est.spent)}): збільшіть ліміт у налаштуваннях завдання.` : '.'}` : ''}</p>
            {error && <p className="ckp-err" role="alert">{error}</p>}
            <div className="se-acts">
              <button type="button" className="ckp-btn is-primary" disabled={busy || asking || !est || est.fits === false} onClick={run}>{busy ? <Spinner /> : null}{est ? `Створити за ${fmtUsd(est.usd)}` : 'Створити'}</button>
              <button type="button" className="ckp-btn" disabled={busy} onClick={onClose}>Скасувати</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
