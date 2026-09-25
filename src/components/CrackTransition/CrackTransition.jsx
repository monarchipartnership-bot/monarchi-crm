import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { generateCracks } from './crackGenerator';
import './CrackTransition.css';

// The new (from-scratch) CRM -> AI Agents transition:
// 1. a spiderweb of cracks radiates from the impact point (`origin` —
//    wherever the AI Agents sidebar item actually sits) across the whole
//    platform over 5s;
// 2. the cracked view crumbles apart, tile by tile, bottom row first, over
//    another 5s;
// 3. a plain black screen remains — this component's own job ends here; it
//    calls onBlackScreen() and leaves what happens next entirely up to the
//    caller (Layout navigates to the AI Map and holds the overlay a little
//    longer as a safety margin — see Layout.jsx).
const CRACK_PHASE_MS = 5000;
const CRUMBLE_PHASE_MS = 5000;
const TILE_COLS = 12;
const TILE_ROWS = 8;
const TILE_FALL_MS = 900;

export default function CrackTransition({ onBlackScreen, origin }) {
  const [phase, setPhase] = useState('cracks'); // 'cracks' | 'crumble' | 'black'
  const [screenshot, setScreenshot] = useState(null);
  const capturedRef = useRef(false);
  // Impact point the whole spiderweb radiates from — defaults to roughly
  // where the AI Agents sidebar item sits if the caller didn't measure it,
  // rather than dead center, so it still reads as "something hit the
  // screen from over there" even without a captured rect.
  const [cracks] = useState(() => generateCracks(
    Date.now() | 0, window.innerWidth, window.innerHeight,
    origin?.x ?? window.innerWidth * 0.12, origin?.y ?? window.innerHeight * 0.55,
    CRACK_PHASE_MS * 0.6,
  ));

  // Captured immediately, in the background — ready well before the
  // crumble phase needs it, rather than triggering a live (possibly slow)
  // html2canvas call right at the 5s mark. Skips the "hide buttons first"
  // trick other exports in this app use (dealExport.js) — display:none-ing
  // anything inside the subtree html2canvas is about to walk is what makes
  // it hang, per that file's own note.
  //
  // No "cancelled" guard here on purpose: StrictMode's dev-only double
  // effect invocation (mount -> cleanup -> mount) does NOT actually
  // unmount the component, but a `cancelled` flag set by the first
  // invocation's cleanup would still poison the one real capture this ref
  // guard allows to run — setScreenshot() would silently never fire. This
  // component is short-lived and self-contained; calling setScreenshot
  // after an unrelated real unmount is harmless.
  useEffect(() => {
    if (capturedRef.current) return;
    capturedRef.current = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 30));
      if (document.fonts?.ready) await document.fonts.ready;
      try {
        const canvas = await html2canvas(document.body, {
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          width: window.innerWidth,
          height: window.innerHeight,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
        });
        setScreenshot({ url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
      } catch {
        // Falls back to plain dark tiles below — the crumble still plays,
        // it just isn't textured with the real screenshot.
        setScreenshot(false);
      }
    })();
  }, []);

  // Which tiles have started falling — driven by individual setTimeouts
  // rather than a per-tile CSS `animation-delay`. Chromium (at least in
  // this environment) doesn't reliably paint a `will-change: transform,
  // opacity` element in its normal resting state while an
  // animation-fill-mode:forwards animation on it hasn't started yet — the
  // whole 96-tile grid rendered fully transparent for its entire pre-fall
  // delay despite every computed style (opacity, transform, background)
  // reporting correctly. Toggling a class exactly when each tile should
  // start, with no CSS delay involved at all, sidesteps that rather than
  // fighting it.
  const [fallingTiles, setFallingTiles] = useState(() => new Set());

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('crumble'), CRACK_PHASE_MS);
    const t2 = setTimeout(() => { setPhase('black'); onBlackScreen?.(); }, CRACK_PHASE_MS + CRUMBLE_PHASE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'crumble') return undefined;
    const timers = [];
    const stagger = (CRUMBLE_PHASE_MS - TILE_FALL_MS) / (TILE_ROWS - 1);
    for (let row = 0; row < TILE_ROWS; row++) {
      const rowFromBottom = TILE_ROWS - 1 - row;
      for (let col = 0; col < TILE_COLS; col++) {
        const key = `${row}-${col}`;
        const jitter = ((row * TILE_COLS + col) * 47) % 260;
        const delay = Math.max(0, rowFromBottom * stagger + jitter);
        timers.push(setTimeout(() => {
          setFallingTiles((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        }, delay));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const vw = window.innerWidth, vh = window.innerHeight;

  return (
    <div className="crack-transition-overlay" aria-busy="true">
      {phase === 'cracks' && (
        <svg className="crack-svg" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
          {cracks.map((c, i) => (
            <path
              key={i} d={c.d} pathLength="1" className="crack-line"
              style={{ strokeWidth: c.width, animationDelay: `${c.delay}ms`, animationDuration: `${c.duration}ms` }}
            />
          ))}
        </svg>
      )}

      {phase === 'crumble' && (
        <div className="crumble-stage">
          {Array.from({ length: TILE_ROWS }, (_, row) => {
            const tileW = vw / TILE_COLS;
            const tileH = vh / TILE_ROWS;
            return Array.from({ length: TILE_COLS }, (__, col) => {
              const key = `${row}-${col}`;
              return (
                <div
                  key={key}
                  className={'crumble-tile' + (fallingTiles.has(key) ? ' falling' : '')}
                  style={{
                    left: col * tileW, top: row * tileH, width: tileW, height: tileH,
                    backgroundImage: screenshot ? `url(${screenshot.url})` : 'none',
                    backgroundSize: screenshot ? `${screenshot.w}px ${screenshot.h}px` : undefined,
                    backgroundPosition: screenshot ? `-${col * tileW}px -${row * tileH}px` : undefined,
                  }}
                />
              );
            });
          })}
        </div>
      )}

      {phase === 'black' && <div className="crack-final-black" />}
    </div>
  );
}
