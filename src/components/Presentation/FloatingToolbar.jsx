import { useLayoutEffect, useRef, useState } from 'react';
import { AlignButtons, ColorField, FontMenu, SizeField, StyleButtons, keepFocus } from './TextControls';
import { FONT_BY_ID } from '../../lib/presentation/fonts';
import { MIXED } from '../../lib/presentation/textModel';

// The short toolbar next to the selected text block. `blockEl` is the block's DOM element,
// `viewport` the canvas area it floats in.
export default function FloatingToolbar({ blockEl, viewport, info, cmds, tick }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!blockEl || !viewport || !ref.current) { setPos(null); return; }
    const b = blockEl.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let top = b.top - v.top - h - 10;
    if (top < 4) top = Math.min(b.bottom - v.top + 10, v.height - h - 4);
    const left = Math.min(Math.max(4, b.left - v.left), Math.max(4, v.width - w - 4));
    setPos({ top, left });
  }, [blockEl, viewport, info, tick]);

  if (!info) return null;
  const { style } = info;
  const fontId = style.f === MIXED ? null : style.f;
  const italicDisabled = fontId ? !FONT_BY_ID[fontId]?.italic : false;

  return (
    <div ref={ref} className="pb-floating" data-editor-only="true" data-floating role="toolbar" aria-label="Форматування тексту" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }} onMouseDown={(e) => { if (!/INPUT|SELECT/.test(e.target.tagName)) keepFocus(e); }}>
      <FontMenu compact value={style.f} onChange={cmds.font} />
      <SizeField compact value={style.s} onChange={cmds.size} />
      <StyleButtons
        bold={style.w === MIXED ? MIXED : style.w >= 600} italic={style.i} underline={style.u} italicDisabled={italicDisabled}
        onBold={cmds.bold} onItalic={cmds.italic} onUnderline={cmds.underline}
      />
      <AlignButtons value={style.align === MIXED ? null : style.align} onChange={cmds.align} />
      <ColorField compact value={style.c} onChange={cmds.color} />
    </div>
  );
}
