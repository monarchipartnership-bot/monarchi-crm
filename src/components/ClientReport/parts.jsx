import { useEffect, useRef, useState } from 'react';
import { Icon, Medallion, Mark } from './kit';
import { LOGO_SVG } from './logoSvg';
import { metricTable, prevName, rangeText } from '../../lib/clientReport';
import { trFor } from '../../lib/clientLang';
import { useT } from './langContext';
import { useRowTools } from './rowTools';
import { FUNNEL_CANDIDATES } from '../../lib/reportFunnel';

const FUNNEL_KEYS = FUNNEL_CANDIDATES;
const SECTION_OF = (key) => (['spend', 'revenue', 'purchases', 'leads', 'roas', 'cpp', 'cpl', 'aov'].includes(key) ? 0 : FUNNEL_KEYS.includes(key) ? 2 : key.startsWith('custom_') ? 3 : 1);
const SECTION_NAMES = ['Results', 'Delivery', 'Funnel steps', 'Custom metrics'];

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
// A text in which most lines start with a dash is a list: it is read as bullets, anything else stays a paragraph.
const BULLET = /^\s*(?:[-–—•*]|\d+[.)])\s+/;
function Body({ text }) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => BULLET.test(l));
  if (lines.length > 1 && bullets.length >= Math.ceil(lines.length / 2)) {
    return <ul className="cx-list">{lines.map((l, i) => <li key={i}>{l.replace(BULLET, '')}</li>)}</ul>;
  }
  return <p>{text}</p>;
}

export function TextCard({ icon, title, text, placeholder = '', eye = null }) {
  const has = String(text || '').trim();
  if (!has && !placeholder) return null;
  return (
    <div className={'tcard' + (eye && !eye.on ? ' crh-off' : '')}>
      <div className="tch"><Medallion icon={icon} cls="xs" /><b>{title}</b>{eye && <EyeToggle on={eye.on} onToggle={eye.onToggle} label={title} />}</div>
      {has ? <Body text={text} /> : <p className="crh-ph">{placeholder}</p>}
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

// The manager's texts on their own, wide and easy to read: the first block (what was done) on the left, the others one under another on the right.
export function NotesGrid({ view }) {
  let extra = 0;
  const cards = view.blocks.filter((b) => String(view.sections?.[b.key] || '').trim()).map((b) => {
    const icon = BLOCK_ICONS[b.key] || EXTRA_ICONS[extra++ % EXTRA_ICONS.length];
    return <TextCard key={b.key} icon={icon} title={b.title} text={view.sections[b.key]} />;
  });
  if (!cards.length) return null;
  const [first, ...rest] = cards;
  return (
    <div className={'cx-notes' + (rest.length ? '' : ' one')}>
      <div className="cx-nl">{first}</div>
      {rest.length > 0 && <div className="cx-nr">{rest}</div>}
    </div>
  );
}

// A Google asset group as a card (plan 2.14, mockup A of 16.11): several pictures, the videos, the money of the group, the first headlines. Google gives the numbers to a
// whole group, not to a picture, so the card shows them once. `onBig(url)` opens a picture in the lightbox.
const money0 = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }));
function GroupCard({ c, t, onBig }) {
  const m = c.metrics || {};
  const heads = (c.headlines || []).slice(0, 3);
  const moreImgs = (c.images || []).length > 4 ? (c.images || []).length - 3 : 0; // the 4th picture carries «+N» only when there are more than four
  return (
    <figure className="cr cr--group">
      <div className="cg-imgs">
        {(c.images || []).slice(0, 4).map((u, k) => (
          <button type="button" key={u} onClick={() => onBig(u)} aria-label={t('Enlarge: {name}', { name: c.caption })}><img src={u} alt="" loading="lazy" />{k === 3 && moreImgs > 0 && <span className="cg-more">+{moreImgs}</span>}</button>
        ))}
      </div>
      {(c.videos || []).length > 0 && (
        <div className="cg-vids">
          {(c.videos || []).slice(0, 3).map((v) => <a key={v.youtubeId} href={`https://www.youtube.com/watch?v=${v.youtubeId}`} target="_blank" rel="noopener noreferrer" aria-label="Video"><img src={v.thumb} alt="" loading="lazy" /><i aria-hidden="true">▶</i></a>)}
        </div>
      )}
      <figcaption><b>{c.caption}</b></figcaption>
      <div className="cg-m">
        {money0(m.spend) && <span>{t('Spent')} {money0(m.spend)}</span>}
        {money0(m.revenue) && <span>{t('Revenue')} {money0(m.revenue)}</span>}
      </div>
      {heads.length > 0 && <p className="cg-tx">{heads.join(' · ')}</p>}
    </figure>
  );
}

// `heading`: the small title above the grid (the page puts its own section heading instead). `big`: larger cards (the page).
export function Creatives({ items, heading = true, large = false }) {
  const t = useT();
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
      {heading && <div className="sh">{t('Most effective creatives')}</div>}
      <div className={'cra' + (large ? ' big' : '')}>
        {items.map((c, i) => (c.images?.length > 1 ? (
          <GroupCard key={`${c.adId || c.caption}:${i}`} c={c} t={t} onBig={(u) => setBig({ imageUrl: u, caption: c.caption })} />
        ) : (
          <figure className="cr" key={`${c.imageUrl || c.caption}:${i}`}>
            {large && <span className="cx-rank">{i + 1}</span>}
            {c.imageUrl ? (
              <button type="button" className="crimg" onClick={() => setBig(c)} aria-label={t('Enlarge: {name}', { name: c.caption })}><img src={c.imageUrl} alt={c.caption || ''} loading="lazy" /></button>
            ) : (
              <div className={`ph p${i % 3}`}><Icon name="image" /><span>{t('No preview')}</span></div>
            )}
            <figcaption><b>{c.caption}</b></figcaption>
          </figure>
        )))}
      </div>
      {big && (
        <div className="crh-lb" role="dialog" aria-modal="true" aria-label={big.caption} onClick={() => setBig(null)}>
          <button type="button" className="crh-lb-x" ref={closeRef} onClick={() => setBig(null)} aria-label={t('Close')}>&times;</button>
          <figure onClick={(e) => e.stopPropagation()}><img src={big.imageUrl} alt={big.caption || ''} /><figcaption>{big.caption}</figcaption></figure>
        </div>
      )}
    </>
  );
}

function hintText(view, folded) {
  const t = trFor(view.lang);
  const parts = [];
  const range = view.prev ? rangeText(view.prev.period.start, view.prev.period.end) : '';
  if (view.prev) parts.push(view.type === 'monthly' ? t('Arrows compare with {name}', { name: prevName(view) }) : view.type === 'custom' ? t('Arrows compare with the previous period ({range})', { range }) : t('Arrows compare with the previous week ({range})', { range }));
  const text = parts.length ? `${parts[0]}${t(': green is better, red is worse, grey is neutral (costs: lower is better). ')}` : '';
  return `${text}${t('Green cell is the best campaign group (ROAS, CPP, CTR), red is the weakest ROAS.')}${folded ? t(' Small groups are folded into «Other».') : ''}`;
}

// The numbers of one report: «General» + a column per campaign group. With many groups the top ones are shown by name and the client opens the rest.
// `builder`: { hidden: [keys], onToggle(key) } puts an eye on every row (the metric is shown to the client or not).
//   builder.tools = { onChange(action, key, toKey, toIndex), options(key) } lets a person drag a metric row up or down (smoothly, the other rows make room) and click it to replace or
//   remove it: the buttons appear to the left of the metric. Alt + ↑ / ↓ on the focused metric moves it for the keyboard.
export function MetricTable({ view, keys, custom, platformLabel, builder = null, full = false }) {
  const [showAll, setShowAll] = useState(false);
  const rt = useRowTools(builder?.tools || null);
  const tr = trFor(view.lang);
  const t = metricTable(view, { keys, custom, platformLabel, showAll });
  const canToggle = t.foldable;
  // The client's page (`full`): the table takes the whole width and does not scroll sideways, the groups are columns with a short name and a stage tag, and the rows are grouped
  // into Results / Delivery / Funnel steps. On a phone the width is not enough, so there it scrolls. In the builder the rows stay flat (they can be dragged).
  if (full && !builder) {
    const order = t.rows.map((r, i) => ({ r, i, sec: SECTION_OF(r.key) })).sort((a, b) => a.sec - b.sec || a.i - b.i);
    const sections = new Set(order.map((x) => x.sec));
    const dense = t.columns.length > 8 ? ' dense' : '';
    let last = -1;
    return (
      <>
        <div className="cx-tw">
          <table className={'hubt fx full' + dense} style={{ '--cols': t.columns.length }}>
            <thead>
              <tr>
                <th>{tr('Metric')}</th>
                {t.columns.map((c, i) => (
                  <th key={c.id} className={i === 0 ? 'gen' : ''} title={c.full || c.label}>
                    {c.stage && <span className="cx-stage">{c.stage}</span>}
                    <span className="cx-hl">{c.short || c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.flatMap(({ r, sec }) => {
                const rows = [];
                if (sections.size > 1 && sec !== last) rows.push(<tr className="cx-secrow" key={`s${sec}`}><td colSpan={t.columns.length + 1}>{tr(SECTION_NAMES[sec])}</td></tr>);
                last = sec;
                rows.push(
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    {r.cells.map((c, i) => (
                      <td key={t.columns[i].id} className={i === 0 || t.columns[i].kind === 'sum' ? 'gen' : c.cls}>
                        <span className="cx-v">{c.text}</span>
                        {c.isNew ? <span className="dm none">{tr('new')}</span> : view.prev || c.change ? <Mark change={c.change} /> : null}
                      </td>
                    ))}
                  </tr>,
                );
                return rows;
              })}
            </tbody>
          </table>
        </div>
        {canToggle && (
          <button type="button" className="hb sec sm crh-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? tr('Show top groups only') : tr('Show all {n} groups', { n: t.total })}
          </button>
        )}
        <p className="hint">{hintText(view, t.folded)}</p>
      </>
    );
  }
  return (
    <>
      <div className="scroll">
        <table className="hubt fx" style={{ minWidth: 176 + t.columns.length * 132 }}>
          <thead><tr><th />{t.columns.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={r.key} {...rt.rowAttrs(r.key, ri, builder && builder.hidden.includes(r.key) ? 'crh-off' : '')}>
                <td {...rt.cellAttrs(r.key, ri, t.rows.map((x) => x.key))}>
                  {rt.toolbar(r.key, r.label)}
                  {builder && <EyeToggle on={!builder.hidden.includes(r.key)} onToggle={() => builder.onToggle(r.key)} label={r.label} />}
                  {rt.name(r.key, r.label)}
                  {rt.replaceBox(r.key, r.label)}
                </td>
                {r.cells.map((c, i) => (
                  <td key={t.columns[i].id} className={i === 0 || t.columns[i].kind === 'sum' ? 'gen' : c.cls}>
                    {c.text}
                    {c.isNew ? <span className="dm none">{tr('new')}</span> : view.prev || c.change ? <Mark change={c.change} /> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canToggle && (
        <button type="button" className="hb sec sm crh-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? tr('Show top groups only') : tr('Show all {n} groups', { n: t.total })}
        </button>
      )}
      <p className="hint">{hintText(view, t.folded)}</p>
    </>
  );
}
