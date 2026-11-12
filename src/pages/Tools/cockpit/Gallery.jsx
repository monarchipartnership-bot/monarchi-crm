import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic, Spinner } from './parts';
import ReturnDialog from './ReturnDialog';
import TextEditDialog from './TextEditDialog';

// The gallery of the materials of one request (the main zone of the project window, decision 34). Everything happens in place: a click on a thumbnail
// opens it larger in the same zone (no lightbox over the window), with its note, a comment field and the actions.
//   items: [{ id, url, rawUrl, downloadUrl, ratio, conceptName, status, kind, fileName, note }]
//   textEdit (step 3.1e): { autoStyle, taskStyle } turns on «Редагувати текст» (the words of a ready creative without a new picture) and the choice in «Повернути»: the picture or only the words
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
    <div className={'ckp-gth' + (large ? ' is-large' : '')} style={large ? { '--gr': r, aspectRatio: String(r) } : undefined}>
      <span className={'ckp-gst ckp-chip ' + (STATUS[item.status]?.[0] || '')}>{item.status === 'producing' && <Spinner />}{STATUS[item.status]?.[1] || item.status}</span>
      <span className="ckp-grt">{item.ratio || '4:5'}{item.kind === 'video' ? ' · відео' : ''}</span>
      <div className="ckp-gim" style={{ ...bg, aspectRatio: String(r) }} role="img" aria-label={item.conceptName}>
        {!item.url && <b>{item.conceptName}</b>}
      </div>
    </div>
  );
}

// The whole creative on the whole screen (owner, 2026-11-11): the real file, as large as the screen lets, nothing cut. Arrows switch, Escape or a click closes.
function FullView({ item, count, onClose, onGo }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowLeft') onGo(-1); else if (e.key === 'ArrowRight') onGo(1); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onGo]);
  return createPortal(
    <div className="ckp ckp-glight" role="dialog" aria-modal="true" aria-label={`Креатив: ${item.conceptName}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ckp-glight-bar"><b>{item.conceptName}</b><span>{item.ratio || '4:5'}</span><span className={'ckp-chip ' + (STATUS[item.status]?.[0] || '')}>{STATUS[item.status]?.[1] || item.status}</span>
        <button type="button" className="ckp-x ckp-x-lg" onClick={onClose} aria-label="Закрити перегляд"><Ic n="close" size={17} /></button></div>
      {count > 1 && <button type="button" className="ckp-glight-nav is-prev" onClick={() => onGo(-1)} aria-label="Попередній креатив"><Ic n="back" size={22} /></button>}
      <img src={item.url} alt={item.conceptName} onClick={onClose} />
      {count > 1 && <button type="button" className="ckp-glight-nav is-next" onClick={() => onGo(1)} aria-label="Наступний креатив"><Ic n="arrow" size={22} /></button>}
    </div>,
    document.body,
  );
}

//   minimal: no bar of filters and bulk buttons above the pictures (the caller shows its own head)
export default function Gallery({ items = [], onAct, loadingHint = false, minimal = false, textEdit = null }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [returning, setReturning] = useState(null); // the creative the dialog «Повернути» is open for
  const [editing, setEditing] = useState(null); // the creative whose words are being edited
  const [full, setFull] = useState(false); // the opened creative on the whole screen
  const pred = FILTERS.find((f) => f[0] === filter)[2];
  const shown = useMemo(() => items.filter(pred), [items, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k, , p]) => [k, items.filter(p).length])), [items]);
  const reviewN = counts.review;
  const idx = shown.findIndex((i) => i.id === openId);
  const open = idx >= 0 ? shown[idx] : null;
  useEffect(() => { if (openId != null && idx < 0) { setOpenId(null); setFull(false); } }, [openId, idx]);
  useEffect(() => { setErr(''); }, [openId]);

  async function act(key, payload, id = key) {
    setErr(''); setBusy(id);
    try { await onAct?.(key, payload); } catch (e) { setErr(e?.message || 'Не вдалося виконати дію. Спробуйте ще раз.'); } finally { setBusy(''); }
  }
  const approve = (i) => act('approve_one', { creativeId: i.id }, 'ap' + i.id);
  const download = (i) => act('download_one', { creativeId: i.id }, 'dl' + i.id);
  const giveBack = (i) => setReturning(i); // the dialog asks what is wrong: the picture or only the words
  const canEditText = (i) => !!textEdit && !!i.rawUrl && i.kind !== 'video' && ['review', 'approved'].includes(i.status);
  const go = (d) => { if (!shown.length) return; setOpenId(shown[(idx + d + shown.length) % shown.length].id); };

  const tools = minimal ? null : (
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
        <div className="ckp-gdet gx-scene">
          <div className="gx-stage">
            {shown.length > 1 && <button type="button" className="gx-nv is-prev" onClick={() => go(-1)} aria-label="Попередній матеріал"><Ic n="back" size={20} /></button>}
            {open.url
              ? <button type="button" className="ckp-gzoom" style={{ '--gr': ratioOf(open.ratio) }} onClick={() => setFull(true)} aria-label={`Відкрити на весь екран: ${open.conceptName}`} title="Відкрити на весь екран"><Picture item={open} index={idx} large /></button>
              : <Picture item={open} index={idx} large />}
            {shown.length > 1 && <button type="button" className="gx-nv is-next" onClick={() => go(1)} aria-label="Наступний матеріал"><Ic n="arrow" size={20} /></button>}
            <div className="ckp-gstrip" role="list">
              {shown.map((i, k) => <button key={i.id} type="button" role="listitem" className={'ckp-mt' + (i.id === open.id ? ' is-on' : '') + (ratioOf(i.ratio) < 0.7 ? ' is-v' : '')} style={i.url ? { backgroundImage: `url(${i.url})` } : { background: i.gradient || FALLBACK[k % FALLBACK.length] }} onClick={() => setOpenId(i.id)} aria-label={i.conceptName} />)}
            </div>
          </div>
          <div className="ckp-ginfo gx-panel">
            <div className="ckp-gmeta"><span className="ckp-chip">{open.ratio || '4:5'}</span><span className="ckp-chip">{open.kind === 'video' ? 'відео' : 'зображення'}</span>{open.fileName && <span className="ckp-chip is-grey">{open.fileName}</span>}</div>
            <h3>{open.conceptName}</h3>
            {open.note && <p>{open.note}</p>}
            <div className="ckp-acts">
              {canApprove(open) && <button type="button" className="ckp-btn is-ok" disabled={!!busy} onClick={() => approve(open)}>{busy === 'ap' + open.id ? <Spinner /> : <Ic n="check" size={15} />}Схвалити</button>}
              {canReturn(open) && <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => giveBack(open)}>{busy === 'rt' + open.id && <Spinner />}Повернути</button>}
              {canEditText(open) && <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => setEditing(open)}><Ic n="pen" size={15} />Редагувати текст</button>}
              {canDownload(open) && <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => download(open)}>{busy === 'dl' + open.id ? <Spinner /> : <Ic n="download" size={15} />}Завантажити</button>}
            </div>
            <div className="ckp-acts">
              {open.url && <button type="button" className="ckp-btn is-sm" onClick={() => setFull(true)}>На весь екран</button>}
              <button type="button" className="ckp-btn is-sm" onClick={() => setOpenId(null)}>До галереї</button>
            </div>
            {err && <p className="ckp-err" role="alert">{err}</p>}
          </div>
        </div>
        {full && open.url && <FullView item={open} count={shown.length} onClose={() => setFull(false)} onGo={go} />}
      {returning && <ReturnDialog item={returning} canEditText={canEditText(returning)} textOption={!!textEdit} onClose={() => setReturning(null)}
        onRedo={(comment) => act('return', { creativeIds: [returning.id], comment }, 'rt' + returning.id)} onText={() => { setEditing(returning); setReturning(null); }} />}
      {editing && textEdit && <TextEditDialog item={editing} autoStyle={textEdit.autoStyle} taskStyle={textEdit.taskStyle} onClose={() => setEditing(null)} onSave={(edit) => onAct?.('edit_text', { creativeId: editing.id, edit })} />}
      </div>
    );
  }

  return (
    <div className="ckp-gal">
      {tools}
      <div className="ckp-ggrid">
        {shown.map((i, k) => (
          <div key={i.id} className="ckp-gcard gx-card" data-st={i.status}>
            <button type="button" className="ckp-gopen" onClick={() => setOpenId(i.id)} aria-label={`Розгорнути: ${i.conceptName}`}><Picture item={i} index={k} /></button>
            <div className="gx-ov">
              <div className="ckp-gname">{i.conceptName}<small>{i.ratio || '4:5'} · {i.kind === 'video' ? 'відео' : 'зображення'}</small></div>
              <div className="ckp-gacts">
                <button type="button" className="ckp-gb is-ok" disabled={!canApprove(i) || !!busy} onClick={() => approve(i)} aria-label={`Схвалити: ${i.conceptName}`}>{busy === 'ap' + i.id ? <Spinner /> : <Ic n="check" size={14} />}</button>
                <button type="button" className="ckp-gb ckp-gap" disabled={!canReturn(i) || !!busy} onClick={() => giveBack(i)}>Повернути</button>
                <button type="button" className="ckp-gb" disabled={!canEditText(i) || !!busy} onClick={() => setEditing(i)} aria-label={`Редагувати текст: ${i.conceptName}`}>Текст</button>
                <button type="button" className="ckp-gb" disabled={!canDownload(i) || !!busy} onClick={() => download(i)} aria-label={`Завантажити: ${i.conceptName}`}>{busy === 'dl' + i.id ? <Spinner /> : <Ic n="download" size={14} />}</button>
              </div>
            </div>
          </div>
        ))}
        {!shown.length && <p className="ckp-empty-line">У цьому фільтрі матеріалів немає.</p>}
      </div>
      {err && <p className="ckp-err" role="alert">{err}</p>}
      {returning && <ReturnDialog item={returning} canEditText={canEditText(returning)} textOption={!!textEdit} onClose={() => setReturning(null)}
        onRedo={(comment) => act('return', { creativeIds: [returning.id], comment }, 'rt' + returning.id)} onText={() => { setEditing(returning); setReturning(null); }} />}
      {editing && textEdit && <TextEditDialog item={editing} autoStyle={textEdit.autoStyle} taskStyle={textEdit.taskStyle} onClose={() => setEditing(null)} onSave={(edit) => onAct?.('edit_text', { creativeId: editing.id, edit })} />}
    </div>
  );
}
