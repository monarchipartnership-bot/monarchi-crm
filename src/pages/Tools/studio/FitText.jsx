import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Text block that shrinks its own font-size until it fits `maxH` (px, in the
// 1000x750 cover's own coordinates — offsetHeight ignores the preview's CSS
// scale, so the result is identical in the preview, thumbnails and export).
// `k` is the user's text-size slider (1 = as designed).
// Re-fits on every render and once the web fonts have finished loading.
export default function FitText({ max, min = 24, maxH, step = 2, k = 1, className, style, children }) {
  const ref = useRef(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let size = Math.round(max * k);
    el.style.maxHeight = 'none';
    el.style.fontSize = size + 'px';
    while (el.offsetHeight > maxH && size > min) {
      size -= step;
      el.style.fontSize = size + 'px';
    }
    // Still too tall at the smallest size (extreme text): cut it off rather
    // than let it run over the elements below.
    el.style.maxHeight = maxH + 'px';
  }, [max, min, maxH, step, k]);

  useLayoutEffect(() => { fit(); });

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return undefined;
    let alive = true;
    const refit = () => { if (alive) fit(); };
    fonts.ready.then(refit);
    fonts.addEventListener?.('loadingdone', refit);
    return () => { alive = false; fonts.removeEventListener?.('loadingdone', refit); };
  }, [fit]);

  return <div ref={ref} className={className} style={{ overflow: 'hidden', ...style }}>{children}</div>;
}
