import { useRef, useState } from 'react';
import { IconBadge, Ic, Spinner } from './parts';
import { fmtUsd } from './format';

// One card of «Потребує вашої уваги». Every action is done on the spot: the card calls onAction(item, key, payload) and shows a spinner on the button
// until the promise settles; a rejected promise shows its message under the card.
const KIND = { review: ['img', 'amber'], question: ['chat', 'blue'], missing_assets: ['upload', 'blue'], failed_step: ['refresh', 'red'], qc_remark: ['shield', 'amber'], estimate: ['wallet', 'green'] };
const GOOD = new Set(['approve_all', 'approve_one']);
const FALLBACK = ['linear-gradient(150deg,#B544B5,#661466)', 'linear-gradient(150deg,#F5B04A,#B5651D)', 'linear-gradient(150deg,#7C8CF8,#3B3FA8)', 'linear-gradient(150deg,#E46AA8,#8E1D63)', 'linear-gradient(150deg,#4AD488,#12803F)'];
const thumbSize = (ratio, h) => { const [a, b] = String(ratio || '1:1').split(':').map(Number); const r = a > 0 && b > 0 ? a / b : 1; return { height: h, width: Math.round(h * Math.max(0.5, Math.min(1.8, r))) }; };

export default function AttentionCard({ item, onAction, big = false }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [comment, setComment] = useState('');
  const [answer, setAnswer] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const commentRef = useRef(null);
  const [icon, tone] = KIND[item.kind] || ['doc', 'amber'];
  const actions = item.actions || [];
  const has = (k) => actions.some((a) => a.key === k);

  async function run(key, payload = {}, id = key) {
    setErr(''); setBusy(id);
    try { await onAction?.(item, key, payload); } catch (e) { setErr(e?.message || 'Не вдалося виконати дію. Спробуйте ще раз.'); } finally { setBusy(''); }
  }
  function click(a) {
    if (a.key === 'return') {
      if (!comment.trim()) { setErr('Напишіть, що змінити, і натисніть ще раз.'); commentRef.current?.focus(); return; }
      return run('return', { creativeIds: (item.creatives || []).map((c) => c.id), comment: comment.trim() });
    }
    if (a.key === 'answer') {
      if (!answer.trim()) { setErr('Оберіть відповідь або напишіть свою.'); return; }
      return run('answer', { text: answer.trim() });
    }
    if (a.key === 'upload_assets') { fileRef.current?.click(); return; }
    if (a.key === 'approve_one') return undefined; // it lives on every preview
    return run(a.key);
  }
  const upload = (files) => { const list = [...(files || [])].filter(Boolean); if (list.length) run('upload_assets', { files: list, kind: 'product' }); };
  const est = item.estimate;

  return (
    <article className={'ckp-acard' + (item.tone === 'problem' ? ' is-problem' : '')} aria-label={item.title}>
      <IconBadge n={icon} tone={item.tone === 'problem' ? 'red' : tone} />
      <div className="ckp-abd">
        <h4>{item.title}{item.tone === 'problem' && item.kind === 'failed_step' && <span className="ckp-chip is-bad">помилка</span>}{est && <span className="ckp-chip">≈ {fmtUsd(est.usd)}</span>}</h4>
        {item.text && <p>{item.text}</p>}

        {item.kind === 'review' && (item.creatives || []).length > 0 && (
          <div className="ckp-thumbs">
            {item.creatives.map((c, i) => (
              <figure key={c.id} className={'ckp-thumb is-' + (c.status || 'review')} style={{ ...thumbSize(c.ratio, big ? 108 : 88), backgroundImage: c.url ? `url(${c.url})` : (c.gradient || FALLBACK[i % FALLBACK.length]) }} title={c.conceptName}>
                {c.status === 'approved' && <span className="ckp-tick"><Ic n="check" size={11} /></span>}
                {c.status === 'failed' && <span className="ckp-tick is-bad"><Ic n="warn" size={11} /></span>}
                <figcaption>{c.conceptName}</figcaption>
                {has('approve_one') && c.status !== 'approved' && (
                  <button type="button" className="ckp-one" onClick={() => run('approve_one', { creativeId: c.id }, 'one' + c.id)} aria-label={`Схвалити: ${c.conceptName}`} disabled={!!busy}>
                    {busy === 'one' + c.id ? <Spinner /> : <Ic n="check" size={12} />}
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}

        {item.kind === 'question' && (item.options || []).length > 0 && (
          <div className="ckp-opts" role="group" aria-label="Готові відповіді">
            {item.options.map((o) => <button key={o} type="button" aria-pressed={answer === o} className={'ckp-chip' + (answer === o ? ' is-on' : '')} onClick={() => setAnswer(o)}>{o}</button>)}
          </div>
        )}
        {item.kind === 'question' && has('answer') && <input className="ckp-field" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Або напишіть свою відповідь" aria-label="Відповідь агенту" maxLength={500} />}

        {item.kind === 'missing_assets' && (
          <div className={'ckp-drop' + (drag ? ' is-over' : '')} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer?.files); }}>
            <Ic n="upload" size={17} />Перетягніть файли сюди
          </div>
        )}
        {(item.kind === 'missing_assets' || has('upload_assets')) && <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />}

        {item.kind === 'review' && has('return') && <input ref={commentRef} className="ckp-field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Що змінити (для «Повернути з коментарем»)" aria-label="Коментар до креативів" maxLength={600} />}

        {est && est.limitUsd > 0 && <p className="ckp-mini">Баланс Higgsfield {fmtUsd(est.limitUsd)}{est.usd > est.limitUsd ? '. Оцінка більша за баланс.' : '.'}</p>}

        {actions.filter((a) => a.key !== 'approve_one').length > 0 && (
          <div className="ckp-acts">
            {actions.filter((a) => a.key !== 'approve_one').map((a) => (
              <button key={a.key + a.label} type="button" className={'ckp-btn' + (a.primary ? (a.key === 'confirm_generation' ? ' is-money' : GOOD.has(a.key) ? ' is-ok' : ' is-primary') : '')} title={a.key === 'confirm_generation' ? 'Це запустить платну генерацію' : undefined} onClick={() => click(a)} disabled={!!busy}>
                {busy === a.key ? <Spinner /> : a.key === 'confirm_generation' ? <Ic n="wallet" size={15} /> : GOOD.has(a.key) && a.primary ? <Ic n="check" size={15} /> : a.key === 'retry_step' ? <Ic n="refresh" size={15} /> : a.key === 'upload_assets' ? <Ic n="upload" size={15} /> : null}
                {a.label}
              </button>
            ))}
          </div>
        )}
        {err && <p className="ckp-err" role="alert">{err}</p>}
      </div>
    </article>
  );
}
