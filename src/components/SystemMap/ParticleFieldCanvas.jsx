import { useEffect, useRef } from 'react';
import './ParticleFieldCanvas.css';

// Same seeded-RNG algorithm as CosmicBackground's star field — kept as a
// separate local copy (not imported) so this component has no dependency
// on that one; both are trivially small.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ~65% violet/purple/blue, the rest spread across the same department
// palette already used elsewhere in the map (aiAgentsData.js) — not
// invented colors, and never enough of any one accent to read as a rainbow.
const PALETTE = [
  ...Array(6).fill('#8B5CF6'), // violet
  ...Array(4).fill('#A855F7'), // purple
  ...Array(3).fill('#3B82F6'), // blue
  '#22D3EE', '#22D3EE', // cyan
  '#14B8A6', // teal
  '#EC4899', '#EC4899', // pink
  '#F43F5E', // red
  '#EAB308', // gold
];

function countForWidth(w) {
  if (w >= 1280) return 900; // desktop
  if (w >= 1024) return 650; // laptop
  if (w >= 768) return 400; // tablet
  return 220; // mobile
}

function makeParticles(count, w, h, seed) {
  const rand = mulberry32(seed);
  const maxR = Math.max(180, Math.min(450, Math.min(w, h) * 0.42));
  const particles = [];
  for (let i = 0; i < count; i++) {
    // Irwin-Hall-ish average of 3 samples: peaks around maxR/2 rather than
    // at the center, giving a "medium near core, dense in a mid band,
    // tapering at the edge" radial profile instead of a flat disc or a
    // center-heavy blob.
    const t = (rand() + rand() + rand()) / 3;
    const orbitRadius = t * maxR;
    const period = 70 + rand() * 150; // seconds per full revolution
    const sizeRoll = rand();
    const radius = sizeRoll < 0.7 ? 0.7 + rand() * 0.8 : sizeRoll < 0.95 ? 1.5 + rand() * 0.8 : 2.5 + rand() * 1.5;
    particles.push({
      angle: rand() * Math.PI * 2,
      orbitRadius,
      ellipseFactor: 0.55 + rand() * 0.25,
      orbitSpeed: ((Math.PI * 2) / period) * (rand() < 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      phase2: rand() * Math.PI * 2,
      freq: 0.15 + rand() * 0.25,
      freq2: 0.15 + rand() * 0.25,
      amp: 1 + rand() * 3,
      amp2: 1 + rand() * 3,
      pulseSpeed: 0.3 + rand() * 0.5,
      baseOpacity: 0.15 + rand() * 0.6,
      radius,
      color: PALETTE[Math.floor(rand() * PALETTE.length)],
      glow: rand() < 0.06,
    });
  }
  return particles;
}

// The ambient "digital dust" cloud around the core — the one genuinely new
// visual subsystem (nothing like this existed before). Single <canvas>,
// own rAF loop, all particle state in refs (never React state — this
// would repaint 900 times a frame otherwise). Renders behind the network
// SVG and never intercepts clicks.
export default function ParticleFieldCanvas() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const particlesRef = useRef([]);
  const tierRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const pausedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const rafRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onMqChange = () => { reducedMotionRef.current = mq.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onMqChange); else mq.addListener(onMqChange);

    function resize() {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      // Only rebuild the particle array when the breakpoint tier actually
      // changes, not on every pixel of a drag-resize — a full rebuild just
      // recenters the same particle count around the new middle otherwise.
      const tier = countForWidth(w);
      if (tier !== tierRef.current) {
        tierRef.current = tier;
        particlesRef.current = makeParticles(tier, w, h, 90210 + tier);
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    function onVisibility() { pausedRef.current = document.visibilityState !== 'visible'; }
    document.addEventListener('visibilitychange', onVisibility);

    function onMouseMove(e) {
      const rect = container.getBoundingClientRect();
      mouseRef.current.targetX = e.clientX - rect.left - sizeRef.current.w / 2;
      mouseRef.current.targetY = e.clientY - rect.top - sizeRef.current.h / 2;
    }
    window.addEventListener('mousemove', onMouseMove);

    let lastT = performance.now();
    let fpsFrames = 0, fpsWindowStart = lastT, lowFpsSince = null;

    function frame(t) {
      rafRef.current = requestAnimationFrame(frame);
      if (pausedRef.current) { lastT = t; return; }
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      // Cheap FPS sampler — if the average stays under ~35 for a few
      // seconds, drop the live particle count once rather than continuously
      // fighting the frame rate.
      fpsFrames++;
      if (t - fpsWindowStart > 1000) {
        const fps = (fpsFrames * 1000) / (t - fpsWindowStart);
        fpsFrames = 0; fpsWindowStart = t;
        if (fps < 35) {
          lowFpsSince = lowFpsSince ?? t;
          if (t - lowFpsSince > 3000 && particlesRef.current.length > 150) {
            particlesRef.current = particlesRef.current.slice(0, Math.floor(particlesRef.current.length * 0.65));
            lowFpsSince = null;
          }
        } else {
          lowFpsSince = null;
        }
      }

      const reduced = reducedMotionRef.current;
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.03;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.03;

      const { w, h } = sizeRef.current;
      const cx = w / 2, cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      const timeSec = t / 1000;
      const parallaxX = reduced ? 0 : mouseRef.current.x * 0.006;
      const parallaxY = reduced ? 0 : mouseRef.current.y * 0.006;
      const mouseWorldX = cx + mouseRef.current.x, mouseWorldY = cy + mouseRef.current.y;

      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!reduced) p.angle += p.orbitSpeed * dt;

        let x = cx + Math.cos(p.angle) * p.orbitRadius + parallaxX;
        let y = cy + Math.sin(p.angle) * p.orbitRadius * p.ellipseFactor + parallaxY;

        if (!reduced) {
          x += Math.sin(timeSec * p.freq + p.phase) * p.amp;
          y += Math.cos(timeSec * p.freq2 + p.phase2) * p.amp2;

          // Very soft repulsion in a small radius around the cursor —
          // nudges particles a few px away, never a hard scatter.
          const dx = x - mouseWorldX, dy = y - mouseWorldY;
          const dist = Math.hypot(dx, dy);
          if (dist < 100 && dist > 0.01) {
            const push = (1 - dist / 100) * 6;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          }
        }

        const opacity = reduced ? p.baseOpacity : p.baseOpacity * (0.82 + Math.sin(timeSec * p.pulseSpeed + p.phase) * 0.18);
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.fillStyle = p.color;
        if (p.glow) { ctx.shadowBlur = 8; ctx.shadowColor = p.color; } else { ctx.shadowBlur = 0; }
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mousemove', onMouseMove);
      if (mq.removeEventListener) mq.removeEventListener('change', onMqChange); else mq.removeListener(onMqChange);
    };
  }, []);

  return (
    <div ref={containerRef} className="particle-field-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
