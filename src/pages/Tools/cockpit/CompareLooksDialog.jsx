import { useEffect, useState } from 'react';
import { REAL_LOOKS } from '../../../lib/creatives/realism';
import { fmtUsd } from './format';
import { Spinner } from './parts';
import DialogShell, { LeftPicture, PriceBlock } from './DialogShell';
import LookThumb from '../../../components/Projects/Teams/LookThumb';
import '../../../styles/textEdit.css';

// «Порівняти реалізм» (step 3.4, 2026-11-13; the look of 2026-11-17, decision 55: the original on the left, the looks as cards with an example picture, the price at once): the SAME scene of a picture
// in other realism looks, side by side in the results. The price is asked first (about $0.2 a picture), nothing is made until the person confirms; the pictures come next to the original in a few
// minutes and are judged by eye: which one looks like a real photo.
//   item: { id, conceptName, url?, rawUrl? }   currentLook: the look of the task (not offered again)   onAct(key, payload): Promise   onClose()
export default function CompareLooksDialog({ item, currentLook = 'std', onAct, onClose }) {
  const [sel, setSel] = useState([]);
  const [est, setEst] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  // the price for the chosen looks
  useEffect(() => {
    setEst(null); setError('');
    if (!sel.length) return undefined;
    let dead = false; setAsking(true);
    onAct('compare_estimate', { creativeId: item.id, looks: sel }).then((r) => { if (!dead) setEst(r?.compare || null); }).catch((e) => { if (!dead) setError(e?.message || 'Не вдалося оцінити вартість.'); }).finally(() => { if (!dead) setAsking(false); });
    return () => { dead = true; };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= 3 ? s : [...s, k]));
  const bad = !!est && est.fits === false;
  const can = !busy && !!sel.length && !!est && !bad;

  async function run() {
    if (!can) return;
    setBusy(true); setError('');
    try { const r = await onAct('compare_run', { creativeId: item.id, looks: sel }); setDone(r?.submitted || sel.length); } catch (e) { setError(e?.message || 'Не вдалося запустити.'); } finally { setBusy(false); }
  }
  const left = <LeftPicture item={item} note="Оригінал. Обрані вигляди зʼявляться поруч." />;
  if (done > 0) {
    return (
      <DialogShell title={`Порівняти реалізм «${item.conceptName}»`} sub="Та сама сцена в інших виглядах" onClose={onClose} left={left} noFoot>
        <div className="rtd-fin" role="status">
          <span className="rtd-big">✓</span><h3>Запущено картинок: {done}</h3>
          <p>Вони зʼявляться поруч з оригіналом у розділі «Результати» за кілька хвилин.</p>
          <button type="button" className="ckp-btn is-primary" onClick={onClose}>Готово</button>
        </div>
      </DialogShell>
    );
  }
  return (
    <DialogShell wide title={`Порівняти реалізм «${item.conceptName}»`} sub="Та сама сцена в інших виглядах, поруч з оригіналом. До трьох виглядів за раз." label={`Порівняти реалізм: ${item.conceptName}`} busy={busy} onClose={onClose} onSubmit={run} left={left}
      footer={<>
        <button type="button" className="ckp-btn" disabled={busy} onClick={onClose}>Скасувати</button>
        <button type="button" className="ckp-btn rtd-gold" disabled={!can} onClick={run}>{busy ? <Spinner /> : null}{est ? `Створити за ${fmtUsd(est.usd)}` : 'Створити'}</button>
      </>}>
      <div>
        <span className="rtd-lab is-row">Вигляди <b>обрано {sel.length} з 3</b></span>
        <div className="rtd-looks" role="group" aria-label="Вигляди для порівняння">
          {REAL_LOOKS.map((l) => {
            const on = sel.includes(l.key), now = l.key === currentLook;
            return (
              <button key={l.key} type="button" aria-pressed={on} className={'rtd-lk' + (on ? ' is-on' : '')} disabled={now || (!on && sel.length >= 3)} onClick={() => toggle(l.key)}>
                <span className="rtd-tick" aria-hidden="true">✓</span>
                <LookThumb look={l.key} />
                <span><b>{l.label}</b><small>{now ? 'Уже вибрано для цього завдання.' : l.desc}</small></span>
              </button>
            );
          })}
        </div>
      </div>
      <PriceBlock hint="Оберіть до трьох виглядів: ціна зʼявиться тут." asking={asking} bad={bad}
        sum={est ? `≈ ${fmtUsd(est.usd)}` : ''} text={est ? `за ${est.count} ${est.count === 1 ? 'картинку' : 'картинки'}` : ''}
        note={bad ? `Не вміщується в ліміт завдання ($${est.limit}): збільшіть ліміт у налаштуваннях завдання.` : est ? 'Нічого не створюється, поки ви не натиснете кнопку.' : ''} />
      {error && <p className="ckp-err" role="alert">{error}</p>}
    </DialogShell>
  );
}
