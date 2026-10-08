import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Canvas from './Canvas';
import Filmstrip from './Filmstrip';
import AddSlideModal from './AddSlideModal';
import { CellPanel, DataPanel, DesignPanel, SlidePanel, TextPanel } from './Panels';
import useTextCommands from './useTextCommands';
import { readSelection } from './RichText';
import ActionIcon from '../common/ActionIcon';
import { Popover } from './TextControls';
import { blankSlide, uid } from '../../lib/presentation/deckModel';
import { blockDefaults } from '../../lib/presentation/textDefaults';
import { FONT_BY_ID, nearestWeight } from '../../lib/presentation/fonts';
import {
  duplicateSlide, insertSlide, moveSlide, removeSlide, setBlockText, setCell, setMeta,
  cellPaths, clearCellStyle, setCellStyle, setSlideImage, tableAddCol, tableAddRow, tableRemoveCol, tableRemoveRow, toggleHidden, updateSlideData,
} from '../../lib/presentation/deckOps';
import { setPlain } from '../../lib/presentation/textModel';

const MODES = [
  { id: 'data', name: 'Дані', icon: 'data' },
  { id: 'design', name: 'Дизайн', icon: 'design' },
  { id: 'slides', name: 'Слайди', icon: 'slides' },
];

// The editor: top bar, big slide, inspector on the right, filmstrip below. The page around
// it decides which report the deck comes from and where it is saved; this part edits the deck.
export default function Builder({ api, dataProps, onBack, onSave, saveLabel, saveBusy, onExport, exportBusy, exportMessage, onStyle }) {
  const { deck, update, undo, redo, canUndo, canRedo } = api;
  const [mode, setMode] = useState(deck.slides.length ? 'slides' : 'data');
  const [activeId, setActiveId] = useState(deck.slides[0]?.id || null);
  const [sel, setSel] = useState(null);
  const [cellSel, setCellSel] = useState(null); // id of the plain cell being edited
  const [adding, setAdding] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [safeFonts, setSafeFonts] = useState(() => { try { return localStorage.getItem('pres-safe-fonts') !== '0'; } catch { return true; } });
  const toggleSafe = (v) => { setSafeFonts(v); try { localStorage.setItem('pres-safe-fonts', v ? '1' : '0'); } catch { /* optional */ } };
  const selRef = useRef(null);
  const bus = useRef({ pending: null });
  const rootRef = useRef(null);
  const addBtn = useRef(null);
  const exportBtn = useRef(null);

  const hasDeckNow = deck.slides.length > 0;
  const hadDeck = useRef(hasDeckNow);
  useEffect(() => {
    if (hasDeckNow && !hadDeck.current) setMode('slides');
    if (!hasDeckNow) setMode('data');
    hadDeck.current = hasDeckNow;
  }, [hasDeckNow]);

  const index = Math.max(0, deck.slides.findIndex((s) => s.id === activeId));
  const slide = deck.slides[index];
  useEffect(() => { if (slide && slide.id !== activeId) setActiveId(slide.id); }, [slide, activeId]);
  useEffect(() => { if (!activeId && deck.slides[0]) setActiveId(deck.slides[0].id); }, [deck, activeId]);

  // Which text block / range is selected. The last selection inside a block is kept while the
  // person works in the side panels (their clicks move the browser's selection out of the text).
  useEffect(() => {
    const onChange = () => {
      const s = readSelection();
      if (!s) return;
      const prev = selRef.current;
      if (prev && prev.blockId === s.blockId && prev.start.p === s.start.p && prev.start.o === s.start.o && prev.end.p === s.end.p && prev.end.o === s.end.o) return;
      selRef.current = s;
      setSel(s);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);
  const clearSel = useCallback(() => { selRef.current = null; setSel(null); }, []);
  useEffect(() => { clearSel(); setCellSel(null); }, [activeId, clearSel]);

  const { info, cmds, onKey } = useTextCommands({ deck, update, sel, selRef, bus, rootRef });
  const textInfo = sel && info && mode !== 'data' && mode !== 'design' ? info : null;

  // Plain cells: formatting of the whole cell (or of every cell on the slide).
  const cell = useMemo(() => {
    if (!cellSel || !slide || cellSel.indexOf(slide.id + ':') !== 0) return null;
    const path = cellSel.slice(slide.id.length + 1);
    const el = rootRef.current?.querySelector('[data-cell="' + cellSel.replace(/"/g, '') + '"]');
    const d = blockDefaults(el);
    const own = slide.cellStyle?.[path] || {};
    return { path, style: { f: own.f || d.f, s: own.s || d.s, w: own.w || d.w, i: own.i ?? d.i, u: Boolean(own.u), c: own.c || d.c, align: own.align || d.align } };
  }, [cellSel, slide, rootRef]);
  const cellCmds = useMemo(() => {
    const run = (patch, all) => update((d) => {
      const sl = d.slides.find((x) => x.id === slide.id);
      if (!sl || !cell) return d;
      return setCellStyle(d, slide.id, all ? cellPaths(sl) : [cell.path], patch);
    });
    return {
      font: (f, all) => run({ f, ...(FONT_BY_ID[f]?.italic ? {} : { i: null }), w: nearestWeight(f, cell?.style.w || 400) }, all),
      size: (s, all) => run({ s }, all),
      color: (c, all) => run({ c }, all),
      align: (align, all) => run({ align }, all),
      weight: (w, all) => run({ w }, all),
      bold: (all) => run({ w: nearestWeight(cell?.style.f || 'Onest', cell?.style.w >= 600 ? 400 : 700) }, all),
      italic: (all) => run({ i: cell?.style.i ? null : true }, all),
      underline: (all) => run({ u: cell?.style.u ? null : true }, all),
      reset: (all) => update((d) => (all ? clearCellStyle(d, slide.id) : setCellStyle(d, slide.id, [cell.path], { f: null, w: null, i: null, u: null, s: null, c: null, align: null }))),
    };
  }, [update, slide, cell]);

  const editor = useMemo(() => ({
    bus,
    onText: (id, t) => update((d) => setBlockText(d, id, t), 'text:' + id),
    onCell: (id, v) => update((d) => setCell(d, id, v), 'cell:' + id),
    onFocusBlock: (id) => { if (!id) clearSel(); else setCellSel(null); },
    onFocusCell: (id) => setCellSel(id),
    onBlurBlock: () => {},
    onKey,
  }), [update, clearSel, onKey]);

  // Undo / redo work on the whole deck, also while the caret is in a text block.
  const onKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  };

  function addSlide(type, afterId) {
    const s = blankSlide(type, deck.meta.lang);
    update((d) => insertSlide(d, afterId, s));
    setActiveId(s.id);
    setAdding(false);
    setMode('slides');
  }

  function removeById(id) {
    const i = deck.slides.findIndex((s) => s.id === id);
    update((d) => removeSlide(d, id));
    if (id === activeId) setActiveId(deck.slides[i + 1]?.id || deck.slides[i - 1]?.id || null);
  }

  function duplicateById(id) {
    const nid = uid();
    update((d) => duplicateSlide(d, id, nid));
    setActiveId(nid);
  }

  function tableCmd(kind) {
    const fn = { addRow: tableAddRow, removeRow: tableRemoveRow, addCol: tableAddCol, removeCol: tableRemoveCol }[kind];
    update((d) => updateSlideData(d, slide.id, (s) => fn(s)));
  }

  const hasDeck = deck.slides.length > 0;
  let visibleNo = 0;
  for (let i = 0; i <= index && slide; i += 1) if (!deck.slides[i].hidden) visibleNo += 1;
  const pageNo = slide && !slide.hidden ? visibleNo : 0;

  return (
    <div className="pb" onKeyDown={onKeyDown}>
      <div className="pb-bar" data-editor-only="true">
        <button type="button" className="pb-barbtn" onClick={onBack}><ActionIcon name="back" size={18} /> Назад</button>
        <div className="pb-modes" role="tablist" aria-label="Режими">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={'pb-mode' + (mode === m.id ? ' on' : '')} onClick={() => setMode(m.id)} disabled={m.id !== 'data' && !hasDeck}>
              <ActionIcon name={m.icon} size={18} /> {m.name}
            </button>
          ))}
        </div>
        <span className="pb-sep" />
        <button ref={addBtn} type="button" className="pb-barbtn" disabled={!hasDeck} onClick={() => setAdding(true)}><ActionIcon name="create" size={18} /> Додати слайд</button>
        <span className="pb-spacer" />
        <button type="button" className="pb-barbtn icon" disabled={!canUndo} onClick={undo} aria-label="Скасувати (Ctrl+Z)" title="Скасувати (Ctrl+Z)">↶</button>
        <button type="button" className="pb-barbtn icon" disabled={!canRedo} onClick={redo} aria-label="Повторити (Ctrl+Shift+Z)" title="Повторити (Ctrl+Shift+Z)">↷</button>
        <span className="pb-savestate" role="status">{saveLabel}</span>
        <button type="button" className="pb-barbtn" disabled={!hasDeck || saveBusy} onClick={onSave}><ActionIcon name="save" size={18} /> Зберегти</button>
        <button ref={exportBtn} type="button" className="pb-cta" disabled={!hasDeck || exportBusy} aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((o) => !o)}>
          <ActionIcon name="download" size={18} /> {exportBusy ? 'Готуємо файл…' : 'Завантажити'}
        </button>
        {exportOpen && (
          <Popover anchor={exportBtn} onClose={() => setExportOpen(false)} width={270}>
            <div className="pb-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setExportOpen(false); onExport('pdf'); }}>PDF (для відправки)</button>
              <button type="button" role="menuitem" onClick={() => { setExportOpen(false); onExport('pptx', { safeFonts }); }}>PPTX (редагований)</button>
              <label className="pb-check" onMouseDown={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={safeFonts} onChange={(e) => toggleSafe(e.target.checked)} />
                <span>PPTX: замінити фірмові шрифти на стандартні (Arial, Georgia), щоб файл однаково виглядав у будь-якому PowerPoint</span>
              </label>
            </div>
          </Popover>
        )}
      </div>
      {exportMessage && <div className="pb-exportmsg" role="alert">{exportMessage}</div>}

      <div className="pb-body">
        <div className="pb-work">
          {hasDeck && slide ? (
            <Canvas
              deck={deck} slide={slide} pageNo={pageNo} total={deck.slides.length} editor={editor}
              textInfo={textInfo} cmds={cmds} sel={textInfo ? sel : null} rootRef={rootRef} onClear={clearSel}
            />
          ) : (
            <div className="pb-empty">
              <ActionIcon name="slides" size={40} />
              <h3>Презентації ще немає</h3>
              <p>Оберіть проєкт і період у панелі справа та створіть презентацію зі збереженого звіту.</p>
            </div>
          )}
          {hasDeck && (
            <Filmstrip
              deck={deck} activeId={slide?.id} onSelect={(id) => { setActiveId(id); }}
              onMove={(id, to) => update((d) => moveSlide(d, id, to))} onReorder={(id, to) => update((d) => moveSlide(d, id, to))}
              onToggleHidden={(id) => update((d) => toggleHidden(d, id))} onDuplicate={duplicateById} onRemove={removeById}
            />
          )}
        </div>

        <aside className="pb-inspector" aria-label="Параметри">
          {mode === 'data' && (
            <DataPanel
              {...dataProps} deck={deck} hasDeck={hasDeck}
              onClient={(v) => update((d) => setMeta(d, { client: setPlain(d.meta.client, v) }), 'meta:client')}
              onPeriod={(v) => update((d) => setMeta(d, { period: setPlain(d.meta.period, v) }), 'meta:period')}
            />
          )}
          {mode === 'design' && hasDeck && <DesignPanel deck={deck} onStyle={onStyle} />}
          {mode === 'slides' && hasDeck && slide && (textInfo
            ? <TextPanel info={textInfo} cmds={cmds} onClose={clearSel} />
            : cell ? <CellPanel style={cell.style} cmds={cellCmds} onClose={() => setCellSel(null)} />
            : (
              <SlidePanel
                slide={slide} index={index} total={deck.slides.length} tableCmd={tableCmd} onImage={(img) => update((d) => setSlideImage(d, slide.id, img))}
                onAdd={() => setAdding(true)} onHide={() => update((d) => toggleHidden(d, slide.id))}
                onDuplicate={() => duplicateById(slide.id)} onRemove={() => removeById(slide.id)}
              />
            ))}
        </aside>
      </div>

      {adding && <AddSlideModal deck={deck} afterId={slide?.id} onAdd={addSlide} onClose={() => setAdding(false)} openerRef={addBtn} />}
    </div>
  );
}
