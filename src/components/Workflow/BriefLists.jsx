import Select from '../common/Select';
import { STATUS_LABEL, STATUS_TONE } from '../../lib/workflow/brief';

// The lists of the brief: products, offers and the goals of the first creatives (moved from the old sheet of the brief; the page of the brief is BriefPage.jsx).
// form = the form of src/lib/workflow/brief.js; setForm changes it.
export default function BriefLists({ form, setForm, readOnly = false }) {
  const setList = (name, i, patch) => setForm((f) => ({ ...f, [name]: f[name].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addProduct = () => setForm((f) => ({ ...f, products: [...f.products, { name: '', price: '', cogs: '', status: 'assumption', source: '' }] }));
  const addOffer = () => setForm((f) => ({ ...f, offers: [...f.offers, { name: '', pays: '', list_value: '', extra_cost: '', approved: false, status: 'assumption', source: '' }] }));
  const addGoal = () => setForm((f) => ({ ...f, goals: [...(f.goals || []), { goal: '', product: '' }] }));
  const del = (name, i) => setForm((f) => ({ ...f, [name]: f[name].filter((_, j) => j !== i) }));
  const Pill = ({ status, onClick }) => (onClick && status !== 'empty'
    ? <button type="button" className={'wf-st ' + STATUS_TONE[status]} onClick={onClick} title="Натисніть, щоб змінити: підтверджено або припущення"><i />{STATUS_LABEL[status]}</button>
    : <span className={'wf-st ' + STATUS_TONE[status]}><i />{STATUS_LABEL[status]}</span>);
  const stOf = (x) => (x.status === 'confirmed' ? 'confirmed' : 'assumption');
  return (
    <div className="wf-col">
      <div>
        <div className="wf-h">Товари</div>
        {form.products.length === 0 && <div className="wf-muted" style={{ marginBottom: 6 }}>Товарів немає: без них Unit Economy рахується на середньому чеку.</div>}
        {form.products.length > 0 && (
          <div style={{ overflowX: 'auto' }}><table className="wf-sheet">
            <thead><tr><th>Назва</th><th>Ціна</th><th>Собівартість (якщо відрізняється)</th><th>Статус</th><th>Джерело</th>{!readOnly && <th />}</tr></thead>
            <tbody>{form.products.map((p, i) => (
              <tr key={i}>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? p.name : <input className="wf-inp" aria-label="Назва товару" value={p.name} onChange={(e) => setList('products', i, { name: e.target.value })} />}</td>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? p.price : <input className="wf-inp" aria-label="Ціна товару" inputMode="decimal" value={p.price} onChange={(e) => setList('products', i, { price: e.target.value })} />}</td>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? (p.cogs || '—') : <input className="wf-inp" aria-label="Собівартість товару" inputMode="decimal" value={p.cogs} onChange={(e) => setList('products', i, { cogs: e.target.value })} />}</td>
                <td><Pill status={stOf(p)} onClick={readOnly ? null : () => setList('products', i, { status: p.status === 'confirmed' ? 'assumption' : 'confirmed' })} /></td>
                <td className={readOnly ? 'ro wf-muted' : ''}>{readOnly ? p.source : <input className="wf-inp" aria-label="Джерело ціни" value={p.source} onChange={(e) => setList('products', i, { source: e.target.value })} />}</td>
                {!readOnly && <td><button type="button" className="wf-btn sm d" onClick={() => del('products', i)} aria-label="Прибрати товар">×</button></td>}
              </tr>))}</tbody>
          </table></div>
        )}
        {!readOnly && <button type="button" className="wf-btn sm" onClick={addProduct}>+ Товар</button>}
      </div>

      <div>
        <div className="wf-h">Офери</div>
        {form.offers.length === 0 && <div className="wf-muted" style={{ marginBottom: 6 }}>Оферів немає.</div>}
        {form.offers.length > 0 && (
          <div style={{ overflowX: 'auto' }}><table className="wf-sheet">
            <thead><tr><th>Назва</th><th>Клієнт платить</th><th>Прайсова вартість</th><th>Додаткова вартість (подарунок)</th><th>Погоджено клієнтом</th><th>Статус</th>{!readOnly && <th />}</tr></thead>
            <tbody>{form.offers.map((o, i) => (
              <tr key={i}>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? o.name : <input className="wf-inp" aria-label="Назва офера" value={o.name} onChange={(e) => setList('offers', i, { name: e.target.value })} />}</td>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? o.pays : <input className="wf-inp" aria-label="Клієнт платить" inputMode="decimal" value={o.pays} onChange={(e) => setList('offers', i, { pays: e.target.value })} />}</td>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? (o.list_value || '—') : <input className="wf-inp" aria-label="Прайсова вартість" inputMode="decimal" value={o.list_value} onChange={(e) => setList('offers', i, { list_value: e.target.value })} />}</td>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? (o.extra_cost || '—') : <input className="wf-inp" aria-label="Додаткова вартість" inputMode="decimal" value={o.extra_cost} onChange={(e) => setList('offers', i, { extra_cost: e.target.value })} />}</td>
                <td>{readOnly ? (o.approved ? 'Так' : 'Ні') : <input type="checkbox" aria-label="Офер погоджено клієнтом" checked={!!o.approved} onChange={(e) => setList('offers', i, { approved: e.target.checked })} />}</td>
                <td><Pill status={stOf(o)} onClick={readOnly ? null : () => setList('offers', i, { status: o.status === 'confirmed' ? 'assumption' : 'confirmed' })} /></td>
                {!readOnly && <td><button type="button" className="wf-btn sm d" onClick={() => del('offers', i)} aria-label="Прибрати офер">×</button></td>}
              </tr>))}</tbody>
          </table></div>
        )}
        {!readOnly && <button type="button" className="wf-btn sm" onClick={addOffer}>+ Офер</button>}
      </div>

      <div>
        <div className="wf-h">Цілі перших креативів</div>
        {(form.goals || []).length === 0 && <div className="wf-muted" style={{ marginBottom: 6 }}>Цілей немає: Креатор не створюватиме креативи, поки не буде хоча б однієї. Ціль каже, що рекламуємо і що хочемо отримати (наприклад: «продати хіт», «розпродаж», «повернути відвідувачів сайту»). Для кого, ідею, оффер і формат агент бере з досьє.</div>}
        {(form.goals || []).length > 0 && (
          <div style={{ overflowX: 'auto' }}><table className="wf-sheet">
            <thead><tr><th>Ціль креатива</th><th>Товар</th>{!readOnly && <th />}</tr></thead>
            <tbody>{form.goals.map((g, i) => (
              <tr key={i}>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? g.goal : <input className="wf-inp" aria-label="Ціль креатива" value={g.goal} onChange={(e) => setList('goals', i, { goal: e.target.value })} placeholder="Що рекламуємо і що хочемо отримати" />}</td>
                <td className={readOnly ? 'ro' : ''}>{readOnly ? (g.product || 'агент обере') : (
                  <Select ariaLabel="Товар для креатива" value={g.product} onChange={(v) => setList('goals', i, { product: v })} options={[{ value: '', label: 'Агент обере з брифу' }, ...form.products.filter((p) => p.name.trim()).map((p) => ({ value: p.name.trim(), label: p.name.trim() }))]} />
                )}</td>
                {!readOnly && <td><button type="button" className="wf-btn sm d" onClick={() => del('goals', i)} aria-label="Прибрати ціль">×</button></td>}
              </tr>))}</tbody>
          </table></div>
        )}
        {!readOnly && <button type="button" className="wf-btn sm" onClick={addGoal}>+ Ціль креатива</button>}
      </div>

    </div>
  );
}
