import { useLayoutEffect, useState } from 'react';

// Position (viewport-relative) for a dropdown/menu portaled to document.body
// — needed because an ancestor card using backdrop-filter (the app's matte
// card style) creates its own stacking context, so a later sibling card
// always paints over a position:absolute dropdown from an earlier one no
// matter its z-index. Portaling + position:fixed with these coordinates
// escapes that entirely. Recomputed fresh each time the trigger opens.
// `estimatedHeight` is a guess at the menu's rendered height, used only to
// decide whether it fits below the trigger before that height is actually
// known (the menu hasn't rendered yet on this pass) — when the trigger sits
// near the bottom of the viewport (e.g. a low field inside a tall modal) and
// there's more room above than below, the menu flips to open upward instead
// of overflowing past the viewport edge with no way to reach its bottom.
// `align` picks which edge of the trigger the menu hangs from horizontally —
// 'left' lines up the menu's left edge with the trigger's, growing
// rightward; 'right' lines up the menu's right edge with the trigger's,
// growing leftward instead (for a trigger sitting near the right edge of its
// row, where growing rightward would run the menu off the viewport). 'auto'
// (default) picks whichever direction actually fits: it checks real
// available space against `estimatedWidth` (a guess, since the menu hasn't
// rendered yet on this pass — same idea as `estimatedHeight` below) and only
// flips to 'right' when growing rightward from here would run past the
// viewport edge AND there's more room on the left. A trigger sitting in a
// narrow right-hand sidebar (e.g. Daily Report's Менеджер select) hits this
// case; most other triggers have room either way and keep growing rightward.
// `side` picks which side of the trigger the menu opens on — 'bottom'
// (default) drops the menu below/above the trigger as described above; 'left'
// instead opens it as a flyout beside the trigger, top-aligned with it,
// growing leftward — for a trigger in a narrow sidebar where dropping below
// would land the menu far from the trigger (after the 'auto' align flip above
// pushes it left) and disconnect it visually from the row that opened it.
export function useFloatingPosition(triggerRef, open, gap = 6, estimatedHeight = 320, align = 'auto', estimatedWidth = 280, side = 'bottom') {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, placement: 'bottom' });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    if (side === 'left') {
      const top = Math.min(rect.top, Math.max(8, window.innerHeight - estimatedHeight - gap));
      setPos({
        top, bottom: undefined,
        left: undefined, right: window.innerWidth - rect.left + gap,
        width: undefined, placement: 'left',
      });
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const menuWidth = Math.max(rect.width, estimatedWidth);
    const spaceRight = window.innerWidth - rect.left;
    const spaceLeft = rect.right;
    const alignRight = align === 'right' || (align === 'auto' && spaceRight < menuWidth && spaceLeft > spaceRight);
    setPos({
      top: flip ? undefined : rect.bottom + gap,
      bottom: flip ? window.innerHeight - rect.top + gap : undefined,
      left: alignRight ? undefined : rect.left,
      right: alignRight ? window.innerWidth - rect.right : undefined,
      width: rect.width, placement: flip ? 'top' : 'bottom',
    });
  }, [open, triggerRef, gap, estimatedHeight, align, estimatedWidth, side]);

  return pos;
}
