import { useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import '../../../styles/projectReports.css';
import DatePicker from '../../common/DatePicker';

const fmt = (s) => s.split('-').reverse().join('.');
const days = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) + 1;

// "Порівняти": what the numbers of the shown period are compared with. Nothing is applied until
// the person confirms. Opened by the «Порівняти» button, and also offered right after a new
// period is shown (`offer`), where it can be switched off for good.
//   current = { from, to }           the period on screen
//   presets = [{ key, title, hint, range: { from, to } }]   ready-made choices (previous period, ...)
//   value   = the comparison in force: { mode: preset key } | { mode: 'custom', from, to } | null
// onApply gets the same shapes, or null for "no comparison".
export default function CompareModal({ current, presets, value, offer, onApply, onClose, onNeverAsk }) {
  const [mode, setMode] = useState(value?.mode || presets[0].key);
  const [from, setFrom] = useState(value?.mode === 'custom' ? value.from : presets[0].range.from);
  const [to, setTo] = useState(value?.mode === 'custom' ? value.to : presets[0].range.to);
  const [never, setNever] = useState(false);
  const [error, setError] = useState('');
  const box = useRef(null);

  function apply() {
    if (mode === 'none') { onApply(null); return; }
    if (mode !== 'custom') { onApply({ mode }); return; }
    if (!from || !to) { setError('Вкажіть початок і кінець періоду для порівняння.'); return; }
    if (from > to) { setError('Початок періоду пізніше за кінець.'); return; }
    onApply({ mode: 'custom', from, to });
  }

  function close() {
    if (never) onNeverAsk?.();
    onClose();
  }

  useDialogA11y(box, close);

  const curDays = days(current.from, current.to);
  const chosen = presets.find((p) => p.key === mode);
  const cmpDays = mode === 'custom' && from && to && from <= to ? days(from, to) : chosen ? days(chosen.range.from, chosen.range.to) : curDays;
  const pick = (m) => { setMode(m); setError(''); };

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} tabIndex={-1} className="modal-box prep-modal" role="dialog" aria-modal="true" aria-labelledby="cmp-title">
        <div className="modal-head">
          <h3 id="cmp-title">{offer ? 'Додати порівняння з іншим періодом?' : 'Порівняння з іншим періодом'}</h3>
          <button type="button" className="modal-close" onClick={close} aria-label="Закрити">&times;</button>
        </div>
        <div className="modal-body">
          <div className="pacc-hint">Показано період {fmt(current.from)} – {fmt(current.to)} ({curDays} дн.). З чим порівняти цифри?</div>
          <div className="prep-cmp-options" role="radiogroup" aria-label="Період для порівняння">
            {presets.map((p) => (
              <label key={p.key} className={'prep-cmp-opt' + (mode === p.key ? ' on' : '')}>
                <input type="radio" name="cmp" checked={mode === p.key} onChange={() => pick(p.key)} />
                <span><b>{p.title}</b><small>{fmt(p.range.from)} – {fmt(p.range.to)}{p.hint ? `: ${p.hint}` : ''}</small></span>
              </label>
            ))}
            <label className={'prep-cmp-opt' + (mode === 'custom' ? ' on' : '')}>
              <input type="radio" name="cmp" checked={mode === 'custom'} onChange={() => pick('custom')} />
              <span>
                <b>Обрати свій період</b>
                <small>Будь-які дати, наприклад той самий тиждень минулого місяця</small>
                {mode === 'custom' && (
                  <span className="prep-cmp-dates">
                    <DatePicker value={from} onChange={setFrom} placeholder="Від" />
                    <span>–</span>
                    <DatePicker value={to} onChange={setTo} placeholder="До" />
                  </span>
                )}
              </span>
            </label>
            <label className={'prep-cmp-opt' + (mode === 'none' ? ' on' : '')}>
              <input type="radio" name="cmp" checked={mode === 'none'} onChange={() => pick('none')} />
              <span><b>Без порівняння</b><small>Показати лише цифри обраного періоду</small></span>
            </label>
          </div>
          {mode !== 'none' && cmpDays !== curDays && (
            <div className="prep-internal-note" role="note">Періоди різної тривалості ({curDays} дн. і {cmpDays} дн.): суми (витрати, кліки, продажі) порівнювати некоректно, дивіться відносні показники (CTR, CPC, CPM, ROAS).</div>
          )}
          {error && <div className="form-err">{error}</div>}
          {offer && (
            <label className="prep-check">
              <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
              <span>Більше не пропонувати після побудови періоду (порівняння можна додати кнопкою «Порівняти»)</span>
            </label>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-p" onClick={apply}>{mode === 'none' ? 'Без порівняння' : 'Порівняти'}</button>
          <button type="button" className="btn" onClick={close}>{offer ? 'Пропустити' : 'Скасувати'}</button>
        </div>
      </div>
    </div>
  );
}
