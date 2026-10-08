import { useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { addCustomMetric, deleteCustomMetric } from '../../../lib/api/projectReportStore';
import { FORMAT_LABELS, OPERATIONS, metricOptions, slugKey, formatMetric, computeMetric } from '../../../lib/reportMetrics';
import { useAuth } from '../../../contexts/AuthContext';
import Select from '../../common/Select';
import '../../../styles/projectReports.css';

const FORMAT_OPTIONS = Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value, label }));
const NUMBER = '__number__';

// "+ Метрика": a custom metric from two others (or a number): name = A ÷ × + − B.
// Saved for this project, or for every project.
export default function CustomMetricModal({ projectId, custom, sample, onClose, onChanged }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const { email } = useAuth();
  const options = metricOptions(custom);
  const [name, setName] = useState('');
  const [a, setA] = useState('revenue');
  const [op, setOp] = useState('/');
  const [bKind, setBKind] = useState('purchases');
  const [bNumber, setBNumber] = useState('');
  const [format, setFormat] = useState('money');
  const [global, setGlobal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const b = bKind === NUMBER ? bNumber : bKind;
  const draft = { key: 'draft', name: 'draft', formula: { a, op, b }, format };
  const preview = sample ? computeMetric('draft', sample.base, [...custom, draft]) : null;

  async function save() {
    const clean = name.trim();
    if (!clean) { setError('Введіть назву метрики.'); return; }
    if (bKind === NUMBER && (bNumber === '' || Number.isNaN(Number(bNumber)))) { setError('Введіть число.'); return; }
    setSaving(true);
    setError('');
    try {
      await addCustomMetric({ projectId, global, name: clean, key: slugKey(clean), formula: { a, op, b: bKind === NUMBER ? Number(bNumber) : bKind }, format, createdBy: email });
      await onChanged();
      setName('');
    } catch (e) {
      setError(e.message || 'Не вдалося зберегти метрику.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try { await deleteCustomMetric(id); await onChanged(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); }
  }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} className="modal-box prep-modal" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <div className="modal-head">
          <h3 id="cm-title">Свої метрики</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="modal-body">
          {custom.length > 0 && (
            <>
              <div className="pf-sec-label">Створені</div>
              <ul className="prep-metric-list">
                {custom.map((c) => (
                  <li key={c.id}>
                    <span><b>{c.name}</b> = {labelOf(options, c.formula.a)} {c.formula.op} {labelOf(options, c.formula.b)}{c.project_id == null ? ' · для всіх проєктів' : ''}</span>
                    <button type="button" className="pacc-link pacc-link--danger" onClick={() => remove(c.id)}>Видалити</button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="pf-sec-label">Нова метрика</div>
          <div className="pf full">
            <label>Назва</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Дохід на клік" />
          </div>
          <div className="prep-formula">
            <Select value={a} onChange={setA} options={options.map((o) => ({ value: o.key, label: o.label }))} searchable />
            <Select value={op} onChange={setOp} options={OPERATIONS} />
            <Select value={bKind} onChange={setBKind} options={[...options.map((o) => ({ value: o.key, label: o.label })), { value: NUMBER, label: 'Число…' }]} searchable />
            {bKind === NUMBER && <input type="number" value={bNumber} onChange={(e) => setBNumber(e.target.value)} placeholder="напр. 100" />}
          </div>
          <div className="pf">
            <label>Як показувати</label>
            <Select value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
          </div>
          <label className="prep-check">
            <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
            <span>Доступна в усіх проєктах</span>
          </label>
          {sample && (
            <div className="pacc-hint">
              Приклад на поточних даних ({sample.label}): <b>{formatMetric(preview, format, sample.currency)}</b>
            </div>
          )}
          {error && <div className="form-err">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-p" onClick={save} disabled={saving}>{saving ? '...' : 'Додати метрику'}</button>
          <button type="button" className="btn" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}

function labelOf(options, key) {
  if (typeof key === 'number') return String(key);
  return options.find((o) => o.key === key)?.label || key;
}
