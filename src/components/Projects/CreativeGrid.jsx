import { useState } from 'react';
import '../../styles/projectHistory.css';

const KIND = { image: 'Зображення', video: 'Відео', carousel: 'Карусель', catalog: 'Каталожне оголошення', unknown: 'Креатив' };

// The «Most effective creatives» of a report: the pictures with their captions; a click enlarges a picture. With `onReplace` / `onRemove` the owner of the
// report can change them. The same grid is meant for the page the client gets.
export default function CreativeGrid({ items, onReplace, onRemove }) {
  const [big, setBig] = useState(null);
  return (
    <>
      <div className="crx-grid">
        {items.map((c, i) => (
          <figure className="crx-item" key={c.adId + ':' + i}>
            {c.imageUrl ? (
              <button type="button" className="crx-img" onClick={() => setBig(c)} aria-label={`Збільшити: ${c.caption}`}><img src={c.imageUrl} alt={c.caption} loading="lazy" /></button>
            ) : (
              <div className="crx-img crx-img--empty" title="У цього оголошення немає однієї картинки (динамічне чи каталожне)">{KIND[c.kind] || KIND.unknown}<small>без зображення</small></div>
            )}
            <figcaption>
              <span>{c.caption}</span>
              {(onReplace || onRemove) && (
                <span className="crx-actions">
                  {onReplace && <button type="button" className="pacc-link" onClick={() => onReplace(i)}>Замінити</button>}
                  {onRemove && <button type="button" className="pacc-link pacc-link--danger" onClick={() => onRemove(i)}>Прибрати</button>}
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {big && (
        <div className="crx-lb" role="dialog" aria-modal="true" aria-label={big.caption} onClick={() => setBig(null)} onKeyDown={(e) => { if (e.key === 'Escape') setBig(null); }}>
          <button type="button" className="crx-lb-x" onClick={() => setBig(null)} aria-label="Закрити" autoFocus>&times;</button>
          <figure onClick={(e) => e.stopPropagation()}><img src={big.imageUrl} alt={big.caption} /><figcaption>{big.caption}</figcaption></figure>
        </div>
      )}
    </>
  );
}
