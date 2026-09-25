import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import ScreenCrackOverlay from '../../effects/screen-crack/ScreenCrackOverlay';
import './CrackTransition.css';

// The CRM -> AI Agents transition:
// 1. a fixed, deterministic crack pattern (see effects/screen-crack/) draws
//    in across the whole platform over 5s — always the same geometry, not
//    anchored to where the AI Agents item was clicked (`origin` is accepted
//    for backward compatibility but no longer used — see ScreenCrackOverlay);
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

export default function CrackTransition({ onBlackScreen }) {
  const [phase, setPhase] = useState('cracks'); // 'cracks' | 'crumble' | 'black'
  const [screenshot, setScreenshot] = useState(null);
  const capturedRef = useRef(false);

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
      {phase === 'cracks' && <ScreenCrackOverlay />}

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
