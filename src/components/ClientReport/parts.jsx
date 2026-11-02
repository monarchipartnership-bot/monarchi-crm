import { useEffect, useRef, useState } from 'react';
import { Icon, Medallion, Mark } from './kit';
import { LOGO_SVG } from './logoSvg';
import { metricTable, prevName, rangeText } from '../../lib/clientReport';
import Select from '../common/Select';

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
//   builder.tools = { onChange(action, key, toKey, toIndex), options(key) } lets a person drag a metric row up or down (smoothly, the other rows make room) and click it to replace or
//   remove it: the buttons appear to the left of the metric. Alt + ↑ / ↓ on the focused metric moves it for the keyboard.
export function MetricTable({ view, keys, custom, platformLabel, builder = null }) {
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState(null); // the metric row that is picked (builder)
  const [replacing, setReplacing] = useState(false);
  const tools = builder?.tools || null;
  const act = (action, key, toKey, toIndex) => { setReplacing(false); if (action === 'remove' || action === 'replace') setSel(null); tools.onChange(action, key, toKey, toIndex); };
  // ---- dragging a row: it follows the pointer, the rows it passes slide out of the way, and on release it settles into its place
  const rowEls = useRef(new Map());
  const skipClick = useRef(false);
  const [drag, setDrag] = useState(null); // { key, from, to, dy, h, settling }
  const SETTLE_MS = 160;
  function startRowDrag(e, key, from, rowKeys) {
    if (!tools || e.button !== 0 || e.target.closest('.mt-tools, .mt-replace, .crh-eye')) return;
    const rects = rowKeys.map((k) => rowEls.current.get(k)?.getBoundingClientRect());
    if (rects.some((r) => !r)) return;
    const startY = e.clientY;
    const h = rects[from].height;
    const mids = rects.map((r) => r.top + r.height / 2);
    let started = false;
    let last = { to: from, dy: 0 };
    const move = (ev) => {
      const dy = ev.clientY - startY;
      if (!started && Math.abs(dy) < 6) return; // a click is not a drag
      started = true;
      const centre = mids[from] + dy;
      const to = mids.filter((m, i) => i !== from && m < centre).length; // the place in the new order: how many other rows are above the dragged one
      last = { to, dy };
      setDrag({ key, from, to, dy, h, settling: false });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!started) return;
      skipClick.current = true;
      setTimeout(() => { skipClick.current = false; }, 0);
      const { to } = last;
      const slot = to > from ? rects[to].top + rects[to].height - h : rects[to].top; // where the row ends up
      setDrag({ key, from, to, dy: slot - rects[from].top, h, settling: true });
      setTimeout(() => { setDrag(null); if (to !== from) act('move', key, null, to); }, SETTLE_MS);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  const rowStyle = (rowIndex, key) => {
    if (!drag) return undefined;
    const base = { position: 'relative' };
    if (key === drag.key) return { ...base, transform: `translateY(${drag.dy}px)`, transition: drag.settling ? `transform ${SETTLE_MS}ms ease` : 'none', zIndex: 3, boxShadow: '0 8px 22px rgba(104,39,104,.25)', background: '#fff' };
    const shift = drag.from < drag.to && rowIndex > drag.from && rowIndex <= drag.to ? -drag.h : drag.from > drag.to && rowIndex >= drag.to && rowIndex < drag.from ? drag.h : 0;
    return { ...base, transform: shift ? `translateY(${shift}px)` : 'none', transition: `transform ${SETTLE_MS}ms ease` };
  };
  const t = metricTable(view, { keys, custom, platformLabel, showAll });
  const canToggle = t.foldable;
  return (
    <>
      <div className="scroll">
        <table className="hubt fx" style={{ minWidth: 176 + t.columns.length * 132 }}>
          <thead><tr><th />{t.columns.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={r.key} ref={(el) => { if (el) rowEls.current.set(r.key, el); else rowEls.current.delete(r.key); }} style={rowStyle(ri, r.key)} className={(builder && builder.hidden.includes(r.key) ? 'crh-off' : '') + (tools && sel === r.key ? ' crh-picked' : '') + (tools ? ' mt-row' : '') + (drag?.key === r.key ? ' mt-dragging' : '') || undefined}>
                <td onPointerDown={tools ? (e) => startRowDrag(e, r.key, ri, t.rows.map((x) => x.key)) : undefined}>
                  {tools && sel === r.key && (
                    <span className="mt-tools" role="toolbar" aria-label={`Дії з метрикою ${r.label}`}>
                      <button type="button" className={'mt-tool' + (replacing ? ' on' : '')} aria-expanded={replacing} aria-label="Замінити" title="Замінити" onClick={() => setReplacing((v) => !v)}>&#8644;</button>
                      <button type="button" className="mt-tool mt-tool--bad" aria-label="Видалити" title="Видалити" onClick={() => act('remove', r.key)}>&times;</button>
                    </span>
                  )}
                  {builder && <EyeToggle on={!builder.hidden.includes(r.key)} onToggle={() => builder.onToggle(r.key)} label={r.label} />}
                  {tools ? <button type="button" className="mt-name" aria-pressed={sel === r.key} title="Перетягніть вгору чи вниз, щоб змінити порядок; натисніть, щоб замінити або видалити" onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); act('up', r.key); } else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); act('down', r.key); } }} onClick={() => { if (skipClick.current) return; setReplacing(false); setSel(sel === r.key ? null : r.key); }}>{r.label}</button> : r.label}
                  {tools && sel === r.key && replacing && (
                    <div className="mt-replace">
                      <Select value="" searchable placeholder="Замінити на…" ariaLabel={`Замінити метрику ${r.label}`} options={tools.options(r.key)} onChange={(to) => to && act('replace', r.key, to)} />
                    </div>
                  )}
                </td>
                {r.cells.map((c, i) => (
                  <td key={t.columns[i].id} className={i === 0 || t.columns[i].kind === 'sum' ? 'gen' : c.cls}>
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
