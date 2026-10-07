import { useEffect, useRef } from 'react';
import { AI_ASSETS } from '../../lib/aiAgentsAssets';
import MOTION from './motionConfig.json';
import './AiEnvironment.css';

// The decorative "cosmos" of the AI Agents section: plum base, nebula bitmap,
// a readability mask, up to three CSS planets and ONE particle canvas with
// three depth layers (dust / stars / foreground). Nothing in here is
// clickable or carries data — it never intercepts pointer events, and it is
// never meant to imply that agents are running (see motion-prompt.md).
// Production parameters come straight from motion-config.json.

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['#F9EDF9', '#EB9CEF', '#D5A9DC', '#B544B5'];
const LAYERS = ['dust', 'stars', 'foreground'];
// radius range (CSS px), base alpha range, wobble amplitude (px) per layer.
const LOOK = {
  dust: { r: [0.5, 1.0], a: [0.16, 0.38], wobble: [0.4, 1.2], twinkle: 0 },
  stars: { r: [1.0, 1.8], a: [0.32, 0.72], wobble: [0.6, 1.8], twinkle: 1 },
  foreground: { r: [2.0, 3.2], a: [0.22, 0.42], wobble: [1.5, 3.5], twinkle: 0.25 },
};

function lerp(range, t) { return range[0] + (range[1] - range[0]) * t; }

function buildParticles(w, h, tier, seed) {
  const rand = mulberry32(seed);
  const margin = 20;
  const list = [];
  LAYERS.forEach((layer) => {
    const count = MOTION.quality[tier][layer];
    const look = LOOK[layer];
    const speed = MOTION.speedPxSec[layer];
    for (let i = 0; i < count; i++) {
      const heading = rand() * Math.PI * 2;
      const v = lerp(speed, rand());
      list.push({
        layer,
        x0: rand() * (w + margin * 2) - margin,
        y0: rand() * (h + margin * 2) - margin,
        vx: Math.cos(heading) * v,
        vy: Math.sin(heading) * v,
        wob: lerp(look.wobble, rand()),
        wf: 0.05 + rand() * 0.12,
        wp: rand() * Math.PI * 2,
        r: lerp(look.r, rand()),
        a: lerp(look.a, rand()),
        tw: 0.4 + rand() * 0.9,
        color: COLORS[Math.floor(rand() * COLORS.length)],
      });
    }
  });
  return list;
}

// Soft round dot sprite per colour, drawn once — keeps the per-frame work to
// plain drawImage calls (no shadowBlur, no allocation).
function makeSprite(color) {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + 'aa');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export default function AiEnvironment({ calm = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const calmRef = useRef(calm);
  useEffect(() => { calmRef.current = calm; }, [calm]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const sprites = Object.fromEntries(COLORS.map((c) => [c, makeSprite(c)]));
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const state = {
      w: 0, h: 0, tier: null, particles: [], clock: 0, last: 0, raf: 0,
      hidden: document.hidden, offscreen: false, safe: [], safeAt: 0, lowSince: null, fpsFrames: 0, fpsStart: 0,
    };

    function measureSafe() {
      // Bright particles are not drawn under the interface: anything the
      // page marks with data-ai-safe (navigation, labels, inputs, panels).
      const box = root.getBoundingClientRect();
      const page = root.parentElement || document;
      state.safe = [...page.querySelectorAll('[data-ai-safe]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - box.left - 8, t: r.top - box.top - 8, r: r.right - box.left + 8, b: r.bottom - box.top + 8 };
      }).filter((s) => s.r > s.l && s.b > s.t);
      state.safeAt = performance.now();
    }

    function inSafe(x, y) {
      for (let i = 0; i < state.safe.length; i++) {
        const s = state.safe[i];
        if (x > s.l && x < s.r && y > s.t && y < s.b) return true;
      }
      return false;
    }

    function resize() {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      const tier = w < 720 ? 'mobile' : 'desktop';
      const dpr = Math.min(window.devicePixelRatio || 1, MOTION.quality[tier].dpr);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.w = w; state.h = h;
      if (tier !== state.tier || !state.particles.length) {
        state.tier = tier;
        state.particles = buildParticles(w, h, tier, tier === 'mobile' ? 7711 : 4207);
      }
      measureSafe();
      draw();
    }

    function draw() {
      const { w, h } = state;
      ctx.clearRect(0, 0, w, h);
      const t = state.clock;
      const calmK = calmRef.current ? 0.5 : 1;
      const mw = w + 40, mh = h + 40;
      const list = state.particles;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        let x = (((p.x0 + p.vx * t) % mw) + mw) % mw - 20;
        let y = (((p.y0 + p.vy * t) % mh) + mh) % mh - 20;
        x += Math.sin(t * p.wf + p.wp) * p.wob;
        y += Math.cos(t * p.wf * 0.8 + p.wp) * p.wob;
        let a = p.a * calmK;
        const bright = p.layer !== 'dust';
        if (state.safe.length && inSafe(x, y)) {
          if (bright) continue;
          a *= 0.35;
        }
        // soft fade at the very edges so wrapping never pops
        const edge = Math.min(x + 20, y + 20, w + 20 - x, h + 20 - y);
        if (edge < 40) a *= Math.max(0, edge / 40);
        const look = LOOK[p.layer];
        if (look.twinkle) a *= 1 - look.twinkle * 0.5 + look.twinkle * 0.5 * Math.sin(t * p.tw + p.wp);
        if (a <= 0.01) continue;
        ctx.globalAlpha = Math.min(1, a);
        if (p.layer === 'dust') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const s = p.r * (p.layer === 'foreground' ? 5 : 3.2);
          ctx.drawImage(sprites[p.color], x - s, y - s, s * 2, s * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      state.raf = requestAnimationFrame(frame);
      if (state.hidden || state.offscreen) { state.last = now; return; }
      if (!state.last) state.last = now;
      const dt = Math.min(0.05, (now - state.last) / 1000); // delta cap 50ms
      state.last = now;
      state.clock += dt * (calmRef.current ? 0.5 : 1);

      // sustained slow frames: drop quality once instead of fighting
      state.fpsFrames++;
      if (now - state.fpsStart > 1000) {
        const fps = (state.fpsFrames * 1000) / (now - state.fpsStart);
        state.fpsFrames = 0; state.fpsStart = now;
        if (fps < 35) {
          state.lowSince = state.lowSince ?? now;
          if (now - state.lowSince > 3000 && state.particles.length > 60) {
            state.particles = state.particles.filter((_, i) => i % 3 !== 0);
            state.lowSince = null;
          }
        } else state.lowSince = null;
      }
      if (now - state.safeAt > 600) measureSafe();
      draw();
    }

    function start() {
      cancelAnimationFrame(state.raf);
      if (mq.matches) { draw(); return; } // reduced motion: static field, no loop
      state.last = 0; state.fpsStart = 0;
      state.raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(root);
    const io = new IntersectionObserver(([e]) => { state.offscreen = !e.isIntersecting; if (!state.offscreen) state.last = 0; });
    io.observe(root);
    const onVis = () => { state.hidden = document.hidden; state.last = 0; };
    document.addEventListener('visibilitychange', onVis);
    const onMq = () => start();
    if (mq.addEventListener) mq.addEventListener('change', onMq);

    resize();
    start();

    return () => {
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (mq.removeEventListener) mq.removeEventListener('change', onMq);
    };
  }, []);

  return (
    <div ref={rootRef} className={'ai-env' + (calm ? ' is-calm' : '')} aria-hidden="true">
      <div className="ai-nebula" style={{ backgroundImage: `url(${AI_ASSETS.nebula})` }} />
      <div className="ai-env-mask" />
      <span className="ai-planet ai-planet-1" />
      <span className="ai-planet ai-planet-2" />
      <span className="ai-planet ai-planet-3" />
      <canvas ref={canvasRef} className="ai-particles" />
    </div>
  );
}
