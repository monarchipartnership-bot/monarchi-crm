import { useState } from 'react';
import AttentionCard from './AttentionCard';
import { IconBadge, Ic, Spinner } from './parts';
import { fmtUsd } from './format';

// A compact row of «Потребує вашої уваги»: the icon, the type in bold and a short text in one line; a quick button for the simple cases (retry a step,
// confirm a generation) and «Детальніше» that opens the full card (the long text, the answers, the upload) right under the row.
const KIND = { review: ['img', 'amber', 'Креативи на перегляд'], question: ['chat', 'blue', 'Питання агента'], missing_assets: ['upload', 'blue', 'Немає матеріалів'], failed_step: ['refresh', 'red', 'Впав крок'], qc_remark: ['shield', 'amber', 'Контроль якості'], estimate: ['wallet', 'green', 'Оцінка генерації'] };
const QUICK = new Set(['failed_step', 'estimate']);

export default function AttentionRow({ item, onAction, onShowReview }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [icon, tone, label] = KIND[item.kind] || ['doc', 'amber', item.title];
  const quick = QUICK.has(item.kind) ? (item.actions || []).find((a) => a.primary) : null;
  const bad = item.tone === 'problem';
  const rest = item.title.startsWith(label) ? item.title.slice(label.length).trim() : '';
  const short = item.kind === 'review' ? (item.text || '') : item.kind === 'failed_step' ? (rest || item.text) : item.kind === 'estimate' ? '' : (item.text || item.title);
  const paid = quick?.key === 'confirm_generation', head = item.kind === 'estimate' ? (paid ? 'Генерація' : item.estimate ? `Оцінка ≈ ${fmtUsd(item.estimate.usd)}` : label) : label;
  async function run() {
    setErr(''); setBusy(quick.key);
    try { await onAction?.(item, quick.key, {}); } catch (e) { setErr(e?.message || 'Не вдалося виконати дію.'); } finally { setBusy(''); }
  }
  return (
    <div className={'ckp-arow' + (bad ? ' is-bad' : '') + (quick && quick.label.length > 16 ? ' is-stack' : '')}>
      <IconBadge n={icon} tone={bad ? 'red' : tone} size={28} />
      <span className="ckp-atx" title={item.text || item.title}><b>{head}</b>{short ? <span> · {short}</span> : null}</span>
      <span className="ckp-ac2">
        {quick && <button type="button" className={'ckp-btn is-sm ' + (quick.key === 'confirm_generation' ? 'is-money' : item.kind === 'estimate' ? 'is-ok' : 'is-primary')} title={quick.key === 'confirm_generation' ? 'Це запустить платну генерацію' : undefined} disabled={!!busy} onClick={run}>{busy ? <Spinner /> : item.kind === 'failed_step' ? <Ic n="refresh" size={14} /> : quick.key === 'confirm_generation' ? <Ic n="wallet" size={14} /> : <Ic n="check" size={14} />}{quick.label}</button>}
        {item.kind === 'review' && onShowReview && <button type="button" className="ckp-more" onClick={onShowReview}>Показати</button>}
        {item.kind !== 'review' && <button type="button" className="ckp-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Згорнути' : 'Детальніше'}</button>}
      </span>
      {err && <p className="ckp-err ckp-aerr" role="alert">{err}</p>}
      {open && <div className="ckp-aopen"><AttentionCard item={item} onAction={onAction} /></div>}
    </div>
  );
}
