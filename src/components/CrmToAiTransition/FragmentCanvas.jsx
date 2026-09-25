import { useEffect, useRef } from 'react';
import { hashStringToInt, LIMITS, PHASE, seededRandom } from '../../lib/crmToAiTokens';
import './FragmentCanvas.css';

const PARTICLE_COLORS = ['#9B5CFF', '#7C3AED', '#4F7CFF', '#22D3EE', '#FFFFFF'];

// Real CRM block rects tagged with data-transition-fragment (Home.jsx) are
// the preferred source. "AI Agents" is reachable from the sidebar on any
// CRM page though, not just Home — pages with no tagged blocks fall back to
// a loose grid over Layout's always-present .view wrapper, so the effect
// never looks broken (or throws) away from the dashboard.
function collectSourceZones() {
  const tagged = Array.from(document.querySelectorAll('[data-transition-fragment]'));
  if (tagged.length > 0) {
    return tagged.map((el) => ({ id: el.getAttribute('data-transition-fragment') || 'zone', rect: el.getBoundingClientRect() }));
  }
  const view = document.querySelector('.view');
  const base = (view || document.body).getBoundingClientRect();
  const cols = 3, rows = 2;
  const zones = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      zones.push({
        id: `fallback-${r}-${c}`,
        rect: {
          x: base.x + (base.width / cols) * c,
          y: base.y + (base.height / rows) * r,
          width: base.width / cols,
          height: base.height / rows,
        },
      });
    }
  }
  return zones;
}

// Deterministic per source id + particle index (crm-to-ai spec section 21
// "Determinism") — never Math.random() in the render/animation path.
function buildParticles(zones, centerX, centerY, countTarget) {
  const perZone = Math.max(1, Math.round(countTarget / Math.max(1, zones.length)));
  const particles = [];
  let idx = 0;
  for (const zone of zones) {
    const seedBase = hashStringToInt(zone.id);
    for (let i = 0; i < perZone; i++) {
      const rand = (n) => seededRandom(seedBase + i * 97 + n);
      const sx = zone.rect.x + rand(1) * zone.rect.width;
      const sy = zone.rect.y + rand(2) * zone.rect.height;
      // Quadratic-bezier control point offset perpendicular to the
      // straight source->center line, so paths curve instead of reading as
      // dead-straight rays all converging on one point.
      const dx = centerX - sx, dy = centerY - sy;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (rand(3) - 0.5) * 220;
      const cx = sx + dx * 0.5 - (dy / len) * bend;
      const cy = sy + dy * 0.5 + (dx / len) * bend;
      const isGlyph = idx % 23 === 0; // a handful of larger translucent "glyph" fragments
      particles.push({
        sx, sy, cx, cy, tx: centerX, ty: centerY,
        radius: isGlyph ? 6 + rand(4) * 4 : 0.8 + rand(4) * (rand(5) < 0.25 ? 2.2 : 0.9),
        isGlyph,
        color: PARTICLE_COLORS[Math.floor(rand(6) * PARTICLE_COLORS.length)],
        delay: rand(7) * 0.55,
        duration: 0.55 + rand(8) * 0.55,
      });
      idx++;
    }
  }
  return particles;
}

// One-shot: CRM block rects -> particles converging on screen center over
// the fragmentation/travel phases. Unlike ParticleFieldCanvas this has no
// idle loop — it plays once per transition run and is unmounted with the
// rest of TransitionPortal. All particle state lives in a ref (never React
// state per frame).
export default function FragmentCanvas({ startedAt }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, LIMITS.dprMax);
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    }
    resize();
    window.addEventListener('resize', resize);

    const { w, h } = sizeRef.current;
    const zones = collectSourceZones();
    const countTarget = w >= 1280 ? LIMITS.fragmentParticlesDesktop[1] : w >= 768 ? 380 : 200;
    particlesRef.current = buildParticles(zones, w / 2, h / 2, countTarget);

    const fragmentationStart = PHASE.fragmentation[0];

    function frame() {
      rafRef.current = requestAnimationFrame(frame);
      const elapsed = (performance.now() - startedAt) / 1000;
      const { w: cw, h: ch } = sizeRef.current;
      ctx.clearRect(0, 0, cw, ch);
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const t = Math.max(0, Math.min(1, (elapsed - fragmentationStart - p.delay) / p.duration));
        if (t <= 0) continue;
        const u = 1 - t;
        const x = u * u * p.sx + 2 * u * t * p.cx + t * t * p.tx;
        const y = u * u * p.sy + 2 * u * t * p.cy + t * t * p.ty;
        const alpha = t < 0.15 ? t / 0.15 : 1 - t ** 2.2;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * (p.isGlyph ? 0.35 : 0.9);
        ctx.fillStyle = p.color;
        if (p.isGlyph) {
          ctx.fillRect(x - p.radius, y - p.radius * 0.6, p.radius * 2, p.radius * 1.2);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [startedAt]);

  return (
    <div className="fragment-canvas-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
