import { forwardRef, useEffect, useRef, useState } from 'react';
import Cover from './Cover';
import { COVER_H, COVER_W } from './exportCover';

// Scales the fixed-size cover to the width of its box (preview + thumbnails).
// The wrapper reserves the scaled size; the cover itself keeps its real
// 1000x750 layout, which is what makes preview, thumbnail and export agree.
const CoverStage = forwardRef(function CoverStage({ coverRef, className, ...cover }, _ref) {
  const box = useRef(null);
  const [k, setK] = useState(0.5);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setK(el.clientWidth / COVER_W));
    ro.observe(el);
    setK(el.clientWidth / COVER_W);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className={'cv-stage' + (className ? ' ' + className : '')} style={{ aspectRatio: `${COVER_W} / ${COVER_H}` }}>
      <div className="cv-scaler" style={{ width: COVER_W, height: COVER_H, transform: `scale(${k})` }}>
        <Cover ref={coverRef} {...cover} />
      </div>
    </div>
  );
});

export default CoverStage;
