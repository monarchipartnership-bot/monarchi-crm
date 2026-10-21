import { useEffect, useRef, useState } from 'react';
import useDialogA11y from '../../lib/useDialogA11y';
import { fetchCreativeCandidates, pickCreativeItem } from '../../lib/api/reportCreatives';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';

// «Замінити креатив»: the best ads of the report's period with a preview; a click picks one (its picture is then copied to our storage).
export default function CreativePickerDialog({ row, taken = [], onPicked, onClose }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let off = false;
    fetchCreativeCandidates({ projectId: row.project_id, start: row.period_start, end: row.period_end })
      .then((r) => { if (!off) setList(r); })
      .catch((e) => { if (!off) { setError(e.message || 'Не вдалося отримати оголошення.'); setList([]); } });
    return () => { off = true; };
  }, [row.project_id, row.period_start, row.period_end]);

  async function pick(c) {
    setBusy(c.adId);
    setError('');
    try { onPicked(await pickCreativeItem({ projectId: row.project_id, start: row.period_start, end: row.period_end, adId: c.adId })); } catch (e) { setError(e.message || 'Не вдалося вибрати креатив.'); setBusy(''); }
  }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} tabIndex={-1} className="modal-box prep-modal crx-picker" role="dialog" aria-modal="true" aria-labelledby="crx-title">
        <div className="modal-head">
          <h3 id="crx-title">Оберіть креатив</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={Boolean(busy)} aria-label="Закрити">&times;</button>
        </div>
        <div className="modal-body">
          <div className="pacc-hint">Найкращі оголошення за період звіту, за ROAS і продажами. Картинка обраного копіюється в наше сховище.</div>
          {list == null && <div className="empty-hint">Завантажуємо оголошення з кабінету…</div>}
          {list && !list.length && !error && <div className="empty-hint">За цей період оголошень не знайдено.</div>}
          {error && <div className="form-err">{error}</div>}
          {list && list.length > 0 && (
            <div className="crx-grid crx-grid--pick">
              {list.map((c) => {
                const used = taken.includes(c.adId);
                return (
                  <button type="button" className="crx-item crx-item--pick" key={c.adId} disabled={used || Boolean(busy)} onClick={() => pick(c)}>
                    {c.preview ? <span className="crx-img"><img src={c.preview} alt="" loading="lazy" /></span> : <span className="crx-img crx-img--empty">без зображення</span>}
                    <span className="crx-cap">{c.caption}<small>{used ? 'уже у звіті' : busy === c.adId ? 'копіюємо…' : `${c.metrics.purchases || 0} продажів · витрати ${Math.round(c.metrics.spend || 0)}`}</small></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose} disabled={Boolean(busy)}>Скасувати</button></div>
      </div>
    </div>
  );
}
