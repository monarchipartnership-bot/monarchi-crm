import { useState } from 'react';
import '../../styles/projectHistory.css';

const KIND = { image: 'Зображення', video: 'Відео', carousel: 'Карусель', catalog: 'Каталожне оголошення', unknown: 'Креатив' };
const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : '$' + Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 0 }));
const roasText = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v).toFixed(2).replace('.', ',') + 'x');
const sales = (n) => `${n} ${n === 1 ? 'продаж' : n >= 2 && n <= 4 ? 'продажі' : 'продажів'}`;

// The «Most effective creatives» of a report as a ranking: a number, the picture (a click enlarges it), the caption with its numbers. With `onReplace` /
// `onRemove` the owner of the report can change them. The same list is meant for the page the client gets.
export default function CreativeGrid({ items, onReplace, onRemove }) {
  const [big, setBig] = useState(null);
  return (
    <>
      <ol className="crx-list">
        {items.map((c, i) => {
          const m = c.metrics || {};
          return (
            <li className="crx-row" key={c.adId + ':' + i}>
              <span className="crx-rank">{i + 1}</span>
              {c.imageUrl ? (
                <button type="button" className="crx-thumb" onClick={() => setBig(c)} aria-label={`Збільшити: ${c.caption}`}><img src={c.imageUrl} alt={c.caption} loading="lazy" /></button>
              ) : (
                <span className="crx-thumb crx-thumb--empty" title="У цього оголошення немає однієї картинки (динамічне чи каталожне)">{KIND[c.kind] || KIND.unknown}</span>
              )}
              <div className="crx-body">
                <b>{c.caption}</b>
                <div className="crx-chips">
                  {m.purchases != null && <span className="crx-chip">{sales(m.purchases || 0)}</span>}
                  {money(m.spend) && <span className="crx-chip">витрати {money(m.spend)}</span>}
                  {roasText(m.roas) && <span className="crx-chip crx-chip--roas">ROAS {roasText(m.roas)}</span>}
                </div>
              </div>
              {(onReplace || onRemove) && (
                <span className="crx-actions">
                  {onReplace && <button type="button" className="crx-btn" onClick={() => onReplace(i)}>Замінити</button>}
                  {onRemove && <button type="button" className="crx-btn crx-btn--bad" onClick={() => onRemove(i)}>Прибрати</button>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {big && (
        <div className="crx-lb" role="dialog" aria-modal="true" aria-label={big.caption} onClick={() => setBig(null)} onKeyDown={(e) => { if (e.key === 'Escape') setBig(null); }}>
          <button type="button" className="crx-lb-x" onClick={() => setBig(null)} aria-label="Закрити" autoFocus>&times;</button>
          <figure onClick={(e) => e.stopPropagation()}><img src={big.imageUrl} alt={big.caption} /><figcaption>{big.caption}</figcaption></figure>
        </div>
      )}
    </>
  );
}
