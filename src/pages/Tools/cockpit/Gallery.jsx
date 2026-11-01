import { useEffect, useMemo, useState } from 'react';
import { Ic, Spinner } from './parts';

// The gallery of the materials of one request (the main zone of the project window, decision 34). Everything happens in place: a click on a thumbnail
// opens it larger in the same zone (no lightbox over the window), with its note, a comment field and the actions.
//   items: [{ id, url, downloadUrl, ratio, conceptName, status, kind, fileName, note }]
//   onAct(key, payload): Promise  (approve_one, approve_all, return, download_one, download_all)
const STATUS = { review: ['is-warn', 'на перегляд'], approved: ['is-ok', 'затверджено'], rejected: ['is-back', 'повернено'], failed: ['is-bad', 'впав'], producing: ['is-work', 'генерується'], planned: ['', 'заплановано'] };
const FALLBACK = ['linear-gradient(150deg,#B544B5,#661466)', 'linear-gradient(150deg,#F5B04A,#B5651D)', 'linear-gradient(150deg,#7C8CF8,#3B3FA8)', 'linear-gradient(150deg,#E46AA8,#8E1D63)', 'linear-gradient(150deg,#4AD488,#12803F)'];
const FILTERS = [['all', 'Усі', () => true], ['review', 'На перегляд', (i) => i.status === 'review'], ['approved', 'Затверджено', (i) => i.status === 'approved'], ['redo', 'Потребують переробки', (i) => i.status === 'rejected' || i.status === 'failed']];
const FILTER_STATUSES = { review: ['review'], approved: ['approved'], redo: ['rejected', 'failed'] };
const canApprove = (i) => i.status === 'review' || i.status === 'rejected';
const canReturn = (i) => i.status === 'review' || i.status === 'approved';
const canDownload = (i) => ['review', 'approved', 'rejected'].includes(i.status) && (i.downloadUrl || i.url);
const ratioOf = (r) => { const [a, b] = String(r || '4:5').split(':').map(Number); return a > 0 && b > 0 ? a / b : 0.8; };

function Picture({ item, index, large = false }) {
  const bg = item.url ? { backgroundImage: `url(${item.url})` } : { background: item.gradient || FALLBACK[index % FALLBACK.length] };
  const r = ratioOf(item.ratio);
  return (
    <div className={'ckp-gth' + (large ? ' is-large' : '')}>
      <span className={'ckp-gst ckp-chip ' + (STATUS[item.status]?.[0] || '')}>{item.status === 'producing' && <Spinner />}{STATUS[item.status]?.[1] || item.status}</span>
      <span className="ckp-grt">{item.ratio || '4:5'}{item.kind === 'video' ? ' · відео' : ''}</span>
      <div className="ckp-gim" style={{ ...bg, aspectRatio: String(r) }} role="img" aria-label={item.conceptName}>
        {!item.url && <b>{item.conceptName}</b>}
      </div>
    </div>
  );
}

export default function Gallery({ items = [], onAct, loadingHint = false }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [comment, setComment] = useState('');
  const [retId, setRetId] = useState(null); // the thumbnail whose comment field is open
  const pred = FILTERS.find((f) => f[0] === filter)[2];
  const shown = useMemo(() => items.filter(pred), [items, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k, , p]) => [k, items.filter(p).length])), [items]);
  const reviewN = counts.review;
  const idx = shown.findIndex((i) => i.id === openId);
  const open = idx >= 0 ? shown[idx] : null;
  useEffect(() => { if (openId != null && idx < 0) setOpenId(null); }, [openId, idx]);
  useEffect(() => { setComment(''); setErr(''); setRetId(null); }, [openId]);

  async function act(key, payload, id = key) {
    setErr(''); setBusy(id);
    try { await onAct?.(key, payload); } catch (e) { setErr(e?.message || 'Не вдалося виконати дію. Спробуйте ще раз.'); } finally { setBusy(''); }
  }
  const approve = (i) => act('approve_one', { creativeId: i.id }, 'ap' + i.id);
  const download = (i) => act('download_one', { creativeId: i.id }, 'dl' + i.id);
  function giveBack(i) {
    if (retId !== i.id && open?.id !== i.id) { setRetId(i.id); setComment(''); return; }
    if (!comment.trim()) { setErr('Напишіть, що змінити, і натисніть ще раз.'); return; }
    return act('return', { creativeIds: [i.id], comment: comment.trim() }, 'rt' + i.id).then(() => { setRetId(null); setComment(''); });
  }
  const go = (d) => { if (!shown.length) return; setOpenId(shown[(idx + d + shown.length) % shown.length].id); };

  const tools = (
    <div className="ckp-gtool">
      <div className="ckp-gtabs" role="group" aria-label="Фільтр матеріалів">
        {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={'ckp-chip' + (filter === k ? ' is-on' : k === 'review' && counts.review ? ' is-warn' : '')} onClick={() => setFilter(k)}>{label} {counts[k]}</button>)}
      </div>
      <span className="ckp-sp" />
      <button type="button" className="ckp-btn is-ok" disabled={!reviewN || !!busy} onClick={() => act('approve_all', { creativeIds: items.filter((i) => i.status === 'review').map((i) => i.id) }, 'all')}>{busy === 'all' ? <Spinner /> : <Ic n="check" size={15} />}Схвалити всі на перегляді ({reviewN})</button>
      <button type="button" className="ckp-btn" disabled={!items.some(canDownload) || !!busy} onClick={() => act('download_all', filter === 'all' ? {} : { statuses: FILTER_STATUSES[filter] }, 'dall')}>{busy === 'dall' ? <Spinner /> : <Ic n="download" size={15} />}Завантажити все (ZIP)</button>
    </div>
  );

  if (!items.length) return <div className="ckp-gal">{tools}<p className="ckp-empty-line">{loadingHint ? 'Завантажуємо матеріали…' : 'У цього запиту ще немає матеріалів. Вони з’являться тут, щойно агенти їх підготують.'}</p></div>;

  if (open) {
    return (
      <div className="ckp-gal">
        {tools}
        <div className="ckp-gdet">
          <Picture item={open} index={idx} large />
          <div className="ckp-ginfo">
            <div className="ckp-gmeta"><span className="ckp-chip">{open.ratio || '4:5'}</span><span className="ckp-chip">{open.kind === 'video' ? 'відео' : 'зображення'}</span>{open.fileName && <span className="ckp-chip is-grey">{open.fileName}</span>}</div>
            <h3>{open.conceptName}</h3>
            {open.note && <p>{open.note}</p>}
            {canReturn(open) && (
              <>
                <label className="ckp-lab" htmlFor="ckp-gcomment">Коментар, якщо повертаєте</label>
                <input id="ckp-gcomment" className="ckp-field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Що змінити…" maxLength={600} />
              </>
            )}
            <div className="ckp-acts">
              {canApprove(open) && <button type="button" className="ckp-btn is-ok" disabled={!!busy} onClick={() => approve(open)}>{busy === 'ap' + open.id ? <Spinner /> : <Ic n="check" size={15} />}Схвалити</button>}
              {canReturn(open) && <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => giveBack(open)}>{busy === 'rt' + open.id && <Spinner />}Повернути з коментарем</button>}
              {canDownload(open) && <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => download(open)}>{busy === 'dl' + open.id ? <Spinner /> : <Ic n="download" size={15} />}Завантажити</button>}
              <span className="ckp-sp" />
              <button type="button" className="ckp-btn" onClick={() => go(-1)} aria-label="Попередній матеріал"><Ic n="back" size={15} /></button>
              <button type="button" className="ckp-btn" onClick={() => go(1)} aria-label="Наступний матеріал"><Ic n="arrow" size={15} /></button>
              <button type="button" className="ckp-btn" onClick={() => setOpenId(null)}>До галереї</button>
            </div>
            {err && <p className="ckp-err" role="alert">{err}</p>}
          </div>
        </div>
        <div className="ckp-gstrip" role="list">
          {shown.map((i, k) => <button key={i.id} type="button" role="listitem" className={'ckp-mt' + (i.id === open.id ? ' is-on' : '') + (ratioOf(i.ratio) < 0.7 ? ' is-v' : '')} style={i.url ? { backgroundImage: `url(${i.url})` } : { background: i.gradient || FALLBACK[k % FALLBACK.length] }} onClick={() => setOpenId(i.id)} aria-label={i.conceptName} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="ckp-gal">
      {tools}
      <div className="ckp-ggrid">
        {shown.map((i, k) => (
          <div key={i.id} className="ckp-gcard">
            <button type="button" className="ckp-gopen" onClick={() => setOpenId(i.id)} aria-label={`Розгорнути: ${i.conceptName}`}><Picture item={i} index={k} /></button>
            <div className="ckp-gname">{i.conceptName}<small>{i.ratio || '4:5'} · {i.kind === 'video' ? 'відео' : 'зображення'}</small></div>
            {retId === i.id && (
              <input className="ckp-field" autoFocus value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') giveBack(i); if (e.key === 'Escape') setRetId(null); }} placeholder="Що змінити…" aria-label={`Коментар: ${i.conceptName}`} maxLength={600} />
            )}
            <div className="ckp-gacts">
              <button type="button" className="ckp-gb is-ok" disabled={!canApprove(i) || !!busy} onClick={() => approve(i)} aria-label={`Схвалити: ${i.conceptName}`}>{busy === 'ap' + i.id ? <Spinner /> : <Ic n="check" size={14} />}</button>
              <button type="button" className="ckp-gb ckp-gap" disabled={!canReturn(i) || !!busy} onClick={() => giveBack(i)}>{retId === i.id ? 'Повернути ↵' : 'Повернути'}</button>
              <button type="button" className="ckp-gb" disabled={!canDownload(i) || !!busy} onClick={() => download(i)} aria-label={`Завантажити: ${i.conceptName}`}>{busy === 'dl' + i.id ? <Spinner /> : <Ic n="download" size={14} />}</button>
            </div>
          </div>
        ))}
        {!shown.length && <p className="ckp-empty-line">У цьому фільтрі матеріалів немає.</p>}
      </div>
      {err && <p className="ckp-err" role="alert">{err}</p>}
    </div>
  );
}
