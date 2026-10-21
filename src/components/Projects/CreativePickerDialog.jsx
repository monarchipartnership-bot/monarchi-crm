import { useEffect, useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../lib/useDialogA11y';
import { fetchCreativeCandidates, pickCreativeItem } from '../../lib/api/reportCreatives';
import '../../styles/projectReports.css';
import '../../styles/projectHistory.css';
import '../../styles/reportWinHub.css';

const REASONS = { roas: 'За ROAS', purchases: 'За продажами', spend: 'За витратами' };
const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const SWAP_ICON = '<svg viewBox="0 0 24 24"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>';
const IMG_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const money = (v) => '$' + Math.round(v || 0).toLocaleString('uk-UA');
const roasText = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v).toFixed(2).replace('.', ',') + 'x');
const sales = (n) => `${n} ${n === 1 ? 'продаж' : n >= 2 && n <= 4 ? 'продажі' : 'продажів'}`;

// «Замінити креатив»: the best ads of the report's period with a preview; a click picks one (its picture is then copied to our storage).
// The filter only hides the ads chosen for another reason (ROAS, sales, spend); nothing is asked again.
export default function CreativePickerDialog({ row, taken = [], onPicked, onClose }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('all');

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

  const counts = useMemo(() => {
    const out = { all: (list || []).length };
    Object.keys(REASONS).forEach((k) => { out[k] = (list || []).filter((c) => c.reason === k).length; });
    return out;
  }, [list]);
  const shown = (list || []).filter((c) => reason === 'all' || c.reason === reason);
  const filters = ['all', ...Object.keys(REASONS)].filter((k) => k === 'all' || counts[k] > 0);

  return (
    <div className="rw-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} tabIndex={-1} className="rw-dialog rw-dialog--pick" role="dialog" aria-modal="true" aria-labelledby="crx-title">
        <div className="rw-dh">
          <span className="rw-md"><span className="rw-mi" dangerouslySetInnerHTML={{ __html: SWAP_ICON }} /></span>
          <div className="rw-dt"><h3 id="crx-title">Оберіть креатив</h3><small>Заміна у звіті · {row.period_start.split('-').reverse().join('.')} – {row.period_end.split('-').reverse().join('.')}</small></div>
          <button type="button" className="rw-x" onClick={onClose} disabled={Boolean(busy)} aria-label="Закрити" dangerouslySetInnerHTML={{ __html: X_ICON }} />
        </div>
        <div className="rw-db">
          <div className="rw-hint">Найкращі оголошення за період звіту, за ROAS і продажами. Картинка обраного копіюється в наше сховище.</div>
          {list == null && <><div className="rw-skl">{[0, 1, 2, 3, 4, 5].map((i) => <div className="rw-sk" key={i} />)}</div><div className="rw-hint" role="status">Завантажуємо оголошення з кабінету…</div></>}
          {list && !list.length && !error && (
            <div className="rw-empty"><span className="rw-md rw-md--xl rw-md--mu"><span className="rw-mi" dangerouslySetInnerHTML={{ __html: IMG_ICON }} /></span><h4>За цей період оголошень не знайдено</h4><p>У кабінеті Meta немає оголошень із показами за цей період звіту.</p></div>
          )}
          {error && <div className="rw-err" role="alert">{error}</div>}
          {list && list.length > 0 && (
            <>
              {filters.length > 2 && (
                <div className="rw-seg" role="group" aria-label="Причина відбору">
                  {filters.map((k) => (
                    <button type="button" key={k} className={reason === k ? 'on' : ''} aria-pressed={reason === k} onClick={() => setReason(k)}>{k === 'all' ? 'Усі' : REASONS[k]}<span>{counts[k]}</span></button>
                  ))}
                </div>
              )}
              <div className="rw-pg">
                {shown.map((c) => {
                  const used = taken.includes(c.adId);
                  const m = c.metrics || {};
                  return (
                    <button type="button" className={'rw-pc' + (used ? ' used' : '') + (busy === c.adId ? ' busy' : '')} key={c.adId} disabled={used || Boolean(busy)} onClick={() => pick(c)}>
                      <span className="rw-pim">
                        {c.preview ? <img src={c.preview} alt="" loading="lazy" /> : <span className="rw-pim-empty"><span dangerouslySetInnerHTML={{ __html: IMG_ICON }} />без зображення</span>}
                        {used && <span className="rw-ub"><span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />Уже у звіті</span>}
                        {busy === c.adId && <span className="rw-ub rw-ub--busy">Копіюємо…</span>}
                      </span>
                      <span className="rw-pcp">
                        <b>{c.caption}</b>
                        <span className="rw-pch">
                          {REASONS[c.reason] && <span className="rw-rc rw-rc--rs">{REASONS[c.reason]}</span>}
                          <span className="rw-rc">{sales(m.purchases || 0)}</span>
                          <span className="rw-rc">витрати {money(m.spend)}</span>
                          {roasText(m.roas) && <span className="rw-rc rw-rc--ro">ROAS {roasText(m.roas)}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="rw-df rw-df--start">
          <button type="button" className="rw-btn rw-btn--bad" onClick={onClose} disabled={Boolean(busy)}><span dangerouslySetInnerHTML={{ __html: X_ICON }} /> Скасувати</button>
        </div>
      </div>
    </div>
  );
}
