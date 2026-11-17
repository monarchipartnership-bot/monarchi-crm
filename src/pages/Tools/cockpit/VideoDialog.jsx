import { useEffect, useState } from 'react';
import { fmtUsd } from './format';
import { Spinner } from './parts';
import DialogShell, { LeftPicture, PriceBlock } from './DialogShell';
import '../../../styles/textEdit.css';

// «Створити відео» (step 3.5, 2026-11-13; the look of 2026-11-17, decision 55: the picture as the first frame, the length and the sound as chips, quick hints of the motion, the price at once): a short
// video made of a finished picture (the picture is the first frame). The price is asked first, nothing is made until the person confirms; the video comes next to the picture in the results in a few
// minutes. The words over the picture are NOT in the video (they are added by the person in an editor of video later).
//   item: { id, conceptName, rawUrl, url?, ratio }   onAct(key, payload): Promise   onClose()
const SECONDS = [[5, '5 секунд'], [8, '8 секунд']];
const SOUND = [['off', 'без звуку'], ['on', 'зі звуком']];
const MOTION = ['Повільний наїзд камери', 'Легкий рух волосся', 'Легке ковзання світла', 'Ледь помітний рух тканини'];

export default function VideoDialog({ item, onAct, onClose }) {
  const [seconds, setSeconds] = useState(5);
  const [sound, setSound] = useState('off');
  const [prompt, setPrompt] = useState('');
  const [est, setEst] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
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
  const bad = !!est && est.fits === false;
  const can = !busy && !asking && !!est && !bad;

  async function run() {
    if (!can) return;
    setBusy(true); setError('');
    try { await onAct('video_run', { creativeId: item.id, seconds, sound: sound === 'on', prompt }); setDone(true); } catch (e) { setError(e?.message || 'Не вдалося запустити.'); } finally { setBusy(false); }
  }
  const addMotion = (m) => setPrompt((p) => `${p ? `${p.replace(/[\s.]+$/, '')}. ` : ''}${m}`.slice(0, 600));
  const left = <LeftPicture item={item} tag="перший кадр" play />;
  if (done) {
    return (
      <DialogShell title={`Відео з «${item.conceptName}»`} sub="Картинка стане першим кадром" onClose={onClose} left={left} noFoot>
        <div className="rtd-fin" role="status">
          <span className="rtd-big">✓</span><h3>Відео запущено</h3>
          <p>Воно зʼявиться поруч з картинкою у розділі «Результати» за кілька хвилин.</p>
          <button type="button" className="ckp-btn is-primary" onClick={onClose}>Готово</button>
        </div>
      </DialogShell>
    );
  }
  const chips = (list, value, onPick, label) => (
    <div className="rtd-chips" role="group" aria-label={label}>{list.map(([k, name]) => <button key={k} type="button" aria-pressed={value === k} className={'rtd-chip' + (value === k ? ' is-on' : '')} onClick={() => onPick(k)}>{name}</button>)}</div>
  );
  return (
    <DialogShell title={`Відео з «${item.conceptName}»`} sub="Картинка стане першим кадром короткого відео" label={`Створити відео: ${item.conceptName}`} busy={busy} onClose={onClose} onSubmit={run} left={left}
      footer={<>
        <button type="button" className="ckp-btn" disabled={busy} onClick={onClose}>Скасувати</button>
        <button type="button" className="ckp-btn rtd-gold" disabled={!can} onClick={run}>{busy ? <Spinner /> : null}{est ? `Створити за ${fmtUsd(est.usd)}` : 'Створити'}</button>
      </>}>
      <div><span className="rtd-lab">Тривалість</span>{chips(SECONDS, seconds, setSeconds, 'Тривалість')}</div>
      <div><span className="rtd-lab">Звук</span>{chips(SOUND, sound, setSound, 'Звук')}</div>
      <div>
        <span className="rtd-lab">Що має рухатись <i>необовʼязково</i></span>
        <div className="rtd-chips" role="group" aria-label="Підказки руху">{MOTION.map((m) => <button key={m} type="button" className="rtd-chip" onClick={() => addMotion(m)}>+ {m}</button>)}</div>
        <textarea className="rtd-ta" rows={3} maxLength={600} value={prompt} placeholder="Наприклад: повільний наїзд камери, легкий рух тканини. Якщо порожньо, буде спокійний наїзд камери без нових предметів." onChange={(e) => setPrompt(e.target.value)} aria-label="Що має рухатись" />
      </div>
      <PriceBlock asking={asking} bad={bad} sum={est ? `≈ ${fmtUsd(est.usd)}` : ''} text={est ? `за відео ${est.seconds} с` : ''}
        note={bad ? `Не вміщується в ліміт завдання ($${est.limit}, вже витрачено ${fmtUsd(est.spent)}): збільшіть ліміт у налаштуваннях завдання.` : est ? 'Текст поверх картинки у відео не потрапляє.' : ''} />
      {error && <p className="ckp-err" role="alert">{error}</p>}
    </DialogShell>
  );
}
