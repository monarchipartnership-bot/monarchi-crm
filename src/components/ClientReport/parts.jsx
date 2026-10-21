import { useEffect, useRef, useState } from 'react';
import { Icon, Medallion, Mark } from './kit';
import { LOGO_SVG } from './logoSvg';
import { metricTable, prevName, rangeText } from '../../lib/clientReport';

// The parts a week and a month are built of: the table with the groups in columns, the text cards, the creatives with a magnifier.

export const MonarchiLogo = () => <div className="logo" role="img" aria-label="Mon'Archi" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;

// The small eye of the builder: «show to the client» on or off. The team always sees everything.
export function EyeToggle({ on, onToggle, label }) {
  return (
    <button type="button" className={'crh-eye' + (on ? ' on' : '')} aria-pressed={on} aria-label={`${label}: ${on ? 'показується клієнту' : 'приховано від клієнта'}`} title={on ? 'Клієнт бачить. Натисніть, щоб приховати' : 'Клієнт не бачить. Натисніть, щоб показати'} onClick={onToggle}>
      <Icon name="eye" />
    </button>
  );
}

// `placeholder`: shown in grey when the block has no text yet (the builder). `eye`: { on, onToggle } adds the client toggle.
export function TextCard({ icon, title, text, placeholder = '', eye = null }) {
  const has = String(text || '').trim();
  if (!has && !placeholder) return null;
  return (
    <div className={'tcard' + (eye && !eye.on ? ' crh-off' : '')}>
      <div className="tch"><Medallion icon={icon} cls="xs" /><b>{title}</b>{eye && <EyeToggle on={eye.on} onToggle={eye.onToggle} label={title} />}</div>
      <p className={has ? '' : 'crh-ph'}>{has ? text : placeholder}</p>
    </div>
  );
}

// The text blocks of a report (its own template snapshot, only those the client may see), in the template's order.
const BLOCK_ICONS = { whatWasDone: 'note', conclusion: 'check', plans: 'arrow' };
const EXTRA_ICONS = ['layers', 'spark', 'stat', 'alert'];
// `builder`: { placeholder, onToggle(key) } shows every block (grey placeholder, an eye per block) instead of only the filled ones.
export function ReportTexts({ view, builder = null }) {
  let extra = 0;
  return view.blocks.map((b) => {
    const icon = BLOCK_ICONS[b.key] || EXTRA_ICONS[extra++ % EXTRA_ICONS.length];
    return <TextCard key={b.key} icon={icon} title={b.title} text={view.sections?.[b.key]} placeholder={builder ? builder.placeholder : ''} eye={builder ? { on: b.client !== false, onToggle: () => builder.onToggle(b.key) } : null} />;
  });
}

export function Creatives({ items }) {
  const [big, setBig] = useState(null);
  const closeRef = useRef(null);
  useEffect(() => {
    if (!big) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setBig(null); };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);
  if (!items?.length) return null;
  return (
    <>
      <div className="sh">Most effective creatives</div>
      <div className="cra">
        {items.map((c, i) => (
          <figure className="cr" key={`${c.imageUrl || c.caption}:${i}`}>
            {c.imageUrl ? (
              <button type="button" className="crimg" onClick={() => setBig(c)} aria-label={`Enlarge: ${c.caption}`}><img src={c.imageUrl} alt={c.caption || ''} loading="lazy" /></button>
            ) : (
              <div className={`ph p${i % 3}`}><Icon name="image" /><span>No preview</span></div>
            )}
            <figcaption><b>{c.caption}</b></figcaption>
          </figure>
        ))}
      </div>
      {big && (
        <div className="crh-lb" role="dialog" aria-modal="true" aria-label={big.caption} onClick={() => setBig(null)}>
          <button type="button" className="crh-lb-x" ref={closeRef} onClick={() => setBig(null)} aria-label="Close">&times;</button>
          <figure onClick={(e) => e.stopPropagation()}><img src={big.imageUrl} alt={big.caption || ''} /><figcaption>{big.caption}</figcaption></figure>
        </div>
      )}
    </>
  );
}

function hintText(view, folded) {
  const parts = [];
  if (view.prev) parts.push(view.type === 'monthly' ? `Arrows compare with ${prevName(view)}` : `Arrows compare with the previous week (${rangeText(view.prev.period.start, view.prev.period.end)})`);
  const text = parts.length ? `${parts[0]}: green is better, red is worse, grey is neutral (costs: lower is better). ` : '';
  return `${text}Green cell is the best campaign group (ROAS, CPP, CTR), red is the weakest ROAS.${folded ? ' Small groups are folded into «Other».' : ''}`;
}

// The numbers of one report: «General» + a column per campaign group. With many groups the top ones are shown by name and the client opens the rest.
// `builder`: { hidden: [keys], onToggle(key) } puts an eye on every row (the metric is shown to the client or not).
export function MetricTable({ view, keys, custom, platformLabel, builder = null }) {
  const [showAll, setShowAll] = useState(false);
  const t = metricTable(view, { keys, custom, platformLabel, showAll });
  const canToggle = t.total > 6;
  return (
    <>
      <div className="scroll">
        <table className="hubt fx" style={{ minWidth: 176 + t.columns.length * 132 }}>
          <thead><tr><th />{t.columns.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.key} className={builder && builder.hidden.includes(r.key) ? 'crh-off' : undefined}>
                <td>{builder && <EyeToggle on={!builder.hidden.includes(r.key)} onToggle={() => builder.onToggle(r.key)} label={r.label} />}{r.label}</td>
                {r.cells.map((c, i) => (
                  <td key={t.columns[i].id} className={i === 0 ? 'gen' : c.cls}>
                    {c.text}
                    {c.isNew ? <span className="dm none">new</span> : view.prev || c.change ? <Mark change={c.change} /> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canToggle && (
        <button type="button" className="hb sec sm crh-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show top groups only' : `Show all ${t.total} groups`}
        </button>
      )}
      <p className="hint">{hintText(view, t.folded)}</p>
    </>
  );
}
