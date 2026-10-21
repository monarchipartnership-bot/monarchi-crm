import { useEffect, useRef, useState } from 'react';
import { Icon, Medallion, Mark } from './kit';
import { LOGO_SVG } from './logoSvg';
import { metricTable, prevName, rangeText } from '../../lib/clientReport';

// The parts a week and a month are built of: the table with the groups in columns, the text cards, the creatives with a magnifier.

export const MonarchiLogo = () => <div className="logo" role="img" aria-label="Mon'Archi" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;

export function TextCard({ icon, title, text }) {
  if (!String(text || '').trim()) return null;
  return (
    <div className="tcard">
      <div className="tch"><Medallion icon={icon} cls="xs" /><b>{title}</b></div>
      <p>{text}</p>
    </div>
  );
}

// The three texts of a report, in the order of the sheet.
export const TEXT_BLOCKS = [['whatWasDone', 'note', 'What was done'], ['conclusion', 'check', 'Conclusion'], ['plans', 'arrow', 'Plans for the next period']];
export function ReportTexts({ sections }) {
  return TEXT_BLOCKS.map(([key, icon, title]) => <TextCard key={key} icon={icon} title={title} text={sections?.[key]} />);
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
export function MetricTable({ view, keys, custom, platformLabel }) {
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
              <tr key={r.key}>
                <td>{r.label}</td>
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
