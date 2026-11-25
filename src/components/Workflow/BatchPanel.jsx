import { useEffect, useState } from 'react';
import { fetchBriefProducts, requestRun } from '../../lib/api/workflow';
import { BATCH_DEFAULT, BATCH_MAX } from '../../../api/_lib/wf/skills/batchEngine.js';

// «Пакет креативів» (Zeely item 2): a manager asks the Creator for a batch of static ads for one product. The number is only a wish: the code cuts it to what the image limit of the project pays for.
// While an agent proposal waits in the section, a new batch would be built on the old text and lose the cards of the proposal, so the panel waits until the manager answers it.
export default function BatchPanel({ projectId, email, proposals = 0, onRequested }) {
  const [products, setProducts] = useState(null);
  const [product, setProduct] = useState('');
  const [count, setCount] = useState(BATCH_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    fetchBriefProducts(projectId).then((list) => { if (live) { setProducts(list); setProduct((p) => p || list[0] || ''); } }).catch((e) => { if (live) { setProducts([]); setErr(e.message || String(e)); } });
    return () => { live = false; };
  }, [projectId]);

  async function go() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const ok = await requestRun(projectId, 'creator', 'batch_creatives', email, { product, count: Math.max(1, Math.min(BATCH_MAX, Math.floor(Number(count)) || BATCH_DEFAULT)) });
      setMsg(ok ? 'Креатор візьметься за пакет найближчою хвилиною. Нові картки з’являться тут як пропозиція агента: прийміть її.' : 'Попередній пакет ще виконується: дочекайтесь його.');
      if (ok && onRequested) onRequested();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  if (products == null) return null;
  return (
    <div className="wf-card" style={{ background: 'var(--wf-bg)', boxShadow: 'none', marginBottom: 12 }}>
      <h3>Пакет креативів на товар</h3>
      {products.length === 0 ? <div className="wf-muted">У брифі немає товарів: додайте їх у таблицю товарів, і тут можна буде замовити пакет.</div> : (
        <>
          <div className="wf-row" style={{ alignItems: 'flex-end' }}>
            <div className="wf-col" style={{ gap: 4 }}>
              <label htmlFor="wf-batch-product" className="wf-muted" style={{ fontSize: 12.5 }}>Товар</label>
              <select id="wf-batch-product" className="wf-bd-in" value={product} onChange={(e) => setProduct(e.target.value)}>{products.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            </div>
            <div className="wf-col" style={{ gap: 4 }}>
              <label htmlFor="wf-batch-count" className="wf-muted" style={{ fontSize: 12.5 }}>Скільки креативів (до {BATCH_MAX})</label>
              <input id="wf-batch-count" type="number" min={1} max={BATCH_MAX} className="wf-bd-in" style={{ width: 90 }} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <button type="button" className="wf-btn p" disabled={busy || !product || proposals > 0} onClick={go}>Створити пакет</button>
          </div>
          <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            {proposals > 0 ? 'Спершу прийміть або відхиліть пропозицію агента нижче: пакет будується на поточному тексті розділу.' : 'Кожен креатив отримує свою ідею з банку ідей і свій формат (4:5, 9:16, 1:1). Якщо ліміт витрат проєкту на картинки менший за замовлене, кількість зменшиться автоматично.'}
          </div>
        </>
      )}
      {msg && <div className="wf-muted" style={{ marginTop: 8 }} role="status">{msg}</div>}
      {err && <div className="wf-err" style={{ marginTop: 8 }} role="alert">{err}</div>}
    </div>
  );
}
