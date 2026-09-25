// One-off generator for the CRM -> AI Agents screen-crack overlay's fixed
// geometry. Run it manually with:
//   node scripts/gen-crack-pattern.cjs src/effects/screen-crack
// It writes crackPattern.js and shardPattern.js as plain literal data —
// nothing in the app itself calls this script or any PRNG at runtime. Only
// re-run it (or hand-edit the generated files) if the crack pattern's
// overall composition needs to change; tweaking the numeric constants below
// (ray count, wobble, split probabilities, etc.) and re-running is the
// intended way to retune the look.
'use strict';
const fs = require('fs');
const path = require('path');

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Separate streams so tweaking one generation step's rand() call count never
// silently reshuffles an unrelated step's output.
const rand = mulberry32(19820512);
const randShard = mulberry32(70319415);

const W = 1920, H = 1080;
const IMPACT = { x: Math.round(W * 0.055), y: Math.round(H * 0.79) };

function round1(n) { return Math.round(n * 10) / 10; }
function clampPt([x, y]) { return [Math.max(-40, Math.min(W + 40, x)), Math.max(-40, Math.min(H + 40, y))]; }

function jagged(x0, y0, angleDeg, length, segments, wobbleDeg) {
  const pts = [[round1(x0), round1(y0)]];
  let a = (angleDeg * Math.PI) / 180;
  const segLen = length / segments;
  let x = x0, y = y0;
  const margin = 30;
  for (let i = 0; i < segments; i++) {
    a += (rand() - 0.5) * ((wobbleDeg * Math.PI) / 180);
    const len = segLen * (0.65 + rand() * 0.6);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    pts.push([round1(x), round1(y)]);
    // Stop growing once the line has clearly left the canvas — no point
    // piling up redundant clamped points off-screen.
    if (x < -margin || x > W + margin || y < -margin || y > H + margin) break;
  }
  return pts;
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
const MAXDIST = Math.hypot(W, H);

// ---------- MAIN CRACKS ----------
// 15 rays fanning from the impact point (bottom-left), angle range covers
// up + right (screen-space degrees: 0=right, -90=up, since Y grows down).
const RAY_COUNT = 15;
const mainCracks = [];
for (let i = 0; i < RAY_COUNT; i++) {
  const t = i / (RAY_COUNT - 1);
  const baseAngle = -104 + t * 122; // -104deg .. +18deg
  const angle = baseAngle + (rand() - 0.5) * 10;
  const proximityBoost = 1 - Math.abs(t - 0.35) * 0.6; // slightly denser mid-fan
  const length = MAXDIST * (0.34 + rand() * 0.62) * proximityBoost;
  const segments = 9 + Math.floor(rand() * 6);
  const wobble = 9 + rand() * 7; // moderate roughness — natural, not chaotic
  const points = jagged(IMPACT.x, IMPACT.y, angle, length, segments, wobble);
  mainCracks.push({
    id: `main-${String(i + 1).padStart(2, '0')}`,
    points,
    width: round1(1.0 + rand() * 0.6),
    delay: i < 6 ? Math.round(rand() * 260) : Math.round(280 + rand() * 420),
    duration: Math.round(340 + rand() * 260),
    highlight: rand() < 0.22,
  });
}
// A few extra long diagonal main fractures not anchored tightly to the
// impact point (short offset start) — reads like the glass took a second,
// longer stress line, matching the reference photo's few far-reaching cracks.
const extraMains = 3;
for (let i = 0; i < extraMains; i++) {
  const startAngle = -70 + rand() * 60;
  const startDist = 40 + rand() * 90;
  const sx = IMPACT.x + Math.cos((startAngle * Math.PI) / 180) * startDist;
  const sy = IMPACT.y + Math.sin((startAngle * Math.PI) / 180) * startDist;
  const angle = -55 + rand() * 55;
  const length = MAXDIST * (0.55 + rand() * 0.4);
  const points = jagged(sx, sy, angle, length, 10 + Math.floor(rand() * 5), 10 + rand() * 6);
  mainCracks.push({
    id: `main-ext-${i + 1}`,
    points,
    width: round1(1.0 + rand() * 0.6),
    delay: Math.round(320 + rand() * 460),
    duration: Math.round(360 + rand() * 260),
    highlight: rand() < 0.22,
  });
}

// ---------- SECONDARY CRACKS ----------
// 24 junctions branching off random points along main cracks, 1-3 lines each.
const secondaryCracks = [];
let secId = 1;
const JUNCTIONS = 24;
for (let j = 0; j < JUNCTIONS; j++) {
  const host = mainCracks[Math.floor(rand() * mainCracks.length)];
  const idx = 2 + Math.floor(rand() * Math.max(1, host.points.length - 3));
  const [bx, by] = host.points[idx];
  const branchCount = 1 + (rand() < 0.55 ? 1 : 0) + (rand() < 0.2 ? 1 : 0);
  for (let b = 0; b < branchCount; b++) {
    const angle = (rand() - 0.5) * 340;
    const length = 60 + rand() * 260;
    const points = jagged(bx, by, angle, length, 3 + Math.floor(rand() * 4), 16 + rand() * 14);
    secondaryCracks.push({
      id: `sec-${String(secId++).padStart(2, '0')}`,
      points,
      width: round1(0.65 + rand() * 0.35),
      delay: Math.round(820 + rand() * 620),
      duration: Math.round(260 + rand() * 220),
    });
  }
}

// ---------- MICRO CRACKS ----------
// 90 short hairline fractures, denser near impact / left / center, calmer
// toward the top-right.
const microCracks = [];
const MICRO_COUNT = 90;
for (let i = 0; i < MICRO_COUNT; i++) {
  // Weighted sample point: bias toward impact using a power falloff, then
  // additionally bias away from the top-right quadrant.
  let mx, my, weight;
  do {
    mx = rand() * W;
    my = rand() * H;
    const d = dist(mx, my, IMPACT.x, IMPACT.y) / MAXDIST;
    const topRightness = Math.max(0, (mx / W) - (my / H));
    weight = Math.pow(1 - d, 1.6) * 0.75 + 0.25 - topRightness * 0.35;
  } while (rand() > Math.max(0.05, weight));
  const angle = rand() * 360;
  const length = 30 + rand() * 130;
  const points = jagged(mx, my, angle, length, 2, 26 + rand() * 20);
  microCracks.push({
    id: `micro-${String(i + 1).padStart(3, '0')}`,
    points,
    width: round1(0.25 + rand() * 0.35),
    delay: Math.round(1500 + rand() * 900),
    duration: Math.round(160 + rand() * 160),
  });
}

// ---------- SHARD MAP ----------
// Recursive irregular subdivision of the 1920x1080 canvas, biased to split
// more near the impact point (small shards there) and less far away (large
// shards), then corners jittered so cells read as irregular polygons rather
// than a tidy grid.
const leaves = [];
function splitRect(rect, depth) {
  const { x, y, w, h } = rect;
  const cx = x + w / 2, cy = y + h / 2;
  const proximity = 1 - dist(cx, cy, IMPACT.x, IMPACT.y) / MAXDIST;
  const area = w * h;
  const minArea = 4000;
  const maxArea = W * H * 0.09; // no single leftover leaf may dominate the canvas
  const splitProb = 0.6 + proximity * 0.36;
  const forceSplit = area > maxArea && depth < 8;
  if (!forceSplit && (depth >= 8 || area < minArea || randShard() > splitProb)) {
    leaves.push({ x, y, w, h });
    return;
  }
  const vertical = w > h * 1.15 ? true : h > w * 1.15 ? false : randShard() < 0.5;
  const t = 0.32 + randShard() * 0.36;
  if (vertical) {
    const w1 = w * t;
    splitRect({ x, y, w: w1, h }, depth + 1);
    splitRect({ x: x + w1, y, w: w - w1, h }, depth + 1);
  } else {
    const h1 = h * t;
    splitRect({ x, y, w, h: h1 }, depth + 1);
    splitRect({ x, y: y + h1, w, h: h - h1 }, depth + 1);
  }
}
splitRect({ x: 0, y: 0, w: W, h: H }, 0);

function jitterPolygonFromRect(rect) {
  const { x, y, w, h } = rect;
  const jit = Math.min(w, h) * 0.1;
  const corners = [
    [x, y], [x + w, y], [x + w, y + h], [x, y + h],
  ].map(([px, py]) => [
    round1(px + (randShard() - 0.5) * jit),
    round1(py + (randShard() - 0.5) * jit),
  ]);
  // Occasionally bump one edge midpoint to break the quad silhouette.
  if (randShard() < 0.45) {
    const edge = Math.floor(randShard() * 4);
    const a = corners[edge], b = corners[(edge + 1) % 4];
    const mx = round1((a[0] + b[0]) / 2 + (randShard() - 0.5) * jit * 1.4);
    const my = round1((a[1] + b[1]) / 2 + (randShard() - 0.5) * jit * 1.4);
    corners.splice(edge + 1, 0, [mx, my]);
  }
  return corners.map(clampPt);
}

function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}
function polygonCenter(poly) {
  const n = poly.length;
  const cx = poly.reduce((s, p) => s + p[0], 0) / n;
  const cy = poly.reduce((s, p) => s + p[1], 0) / n;
  return [round1(cx), round1(cy)];
}

const rawShards = leaves.map((rect) => ({ rect, polygon: jitterPolygonFromRect(rect) }));
const areas = rawShards.map((s) => polygonArea(s.polygon));
const sortedAreas = [...areas].sort((a, b) => a - b);
const totalArea = areas.reduce((a, b) => a + b, 0);
// Find thresholds so cumulative area splits roughly 30% small / 50% medium / 20% large
function areaThreshold(targetCumFrac) {
  let cum = 0;
  for (const a of sortedAreas) {
    cum += a;
    if (cum / totalArea >= targetCumFrac) return a;
  }
  return sortedAreas[sortedAreas.length - 1];
}
const smallMax = areaThreshold(0.3);
const mediumMax = areaThreshold(0.8);

const shards = rawShards.map((s, i) => {
  const area = polygonArea(s.polygon);
  const size = area <= smallMax ? 'small' : area <= mediumMax ? 'medium' : 'large';
  const [cx, cy] = polygonCenter(s.polygon);
  const d = dist(cx, cy, IMPACT.x, IMPACT.y);
  const fallDelay = Math.round((d / MAXDIST) * 900 + randShard() * 260);
  const fallDirection = round1((Math.atan2(cy - IMPACT.y, cx - IMPACT.x) * 180) / Math.PI);
  const rotationDirection = randShard() < 0.5 ? -1 : 1;
  return {
    id: `shard-${String(i + 1).padStart(3, '0')}`,
    polygon: s.polygon,
    center: [cx, cy],
    size,
    fallDelay,
    fallDirection,
    rotationDirection,
  };
});

// ---------- Serialize ----------
function fmtPoints(points) {
  return `[${points.map((p) => `[${p[0]},${p[1]}]`).join(',')}]`;
}
function fmtCrackList(list) {
  return list
    .map(
      (c) =>
        `  { id: '${c.id}', points: ${fmtPoints(c.points)}, width: ${c.width}, delay: ${c.delay}, duration: ${c.duration}${
          'highlight' in c ? `, highlight: ${c.highlight}` : ''
        } },`,
    )
    .join('\n');
}

const crackPatternSrc = `// Fixed, hand-tunable crack geometry for the CRM -> AI Agents screen-crack
// overlay. Generated once (scripts/gen-crack-pattern.cjs, seeded PRNG) and
// then committed as plain literal data — nothing in this file is computed
// at runtime, so the pattern is byte-identical on every load, every replay,
// every viewport size. Do not import a PRNG here; edit the numbers by hand
// or re-run the generator and re-paste its output if the pattern needs to
// change.
//
// Coordinate space: a fixed 1920x1080 canvas (see CRACK_VIEWBOX). The
// overlay's <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
// scales/crops this same canvas to fit any real viewport without altering
// the geometry itself.

export const CRACK_VIEWBOX = { width: ${W}, height: ${H} };

// Where the "impact" is anchored — bottom-left, matching the reference
// screenshot. Expressed both normalized (0..1) and in canvas pixels.
export const IMPACT_POINT = {
  xNorm: ${IMPACT.x / W}, yNorm: ${IMPACT.y / H},
  x: ${IMPACT.x}, y: ${IMPACT.y},
};

// Primary fractures radiating from the impact point (plus a few longer
// stress cracks starting just off it) — thicker, drawn in first.
export const MAIN_CRACKS = [
${fmtCrackList(mainCracks)}
];

// Branch junctions off the main cracks — thinner, drawn in second.
export const SECONDARY_CRACKS = [
${fmtCrackList(secondaryCracks)}
];

// Hairline fractures scattered across the shattered area — thinnest,
// drawn in last, densest near the impact point and the left/center of the
// screen, sparser toward the top-right.
export const MICRO_CRACKS = [
${fmtCrackList(microCracks)}
];
`;

const shardPatternSrc = `// Fixed shard/fragment map derived from the same impact point and overall
// density profile as crackPattern.js — irregular polygons tiling the full
// 1920x1080 canvas (see CRACK_VIEWBOX in crackPattern.js), each with a
// stable id, its own centroid, a rough size bucket, and placeholder
// fall/rotation data for the future "shards fall away" animation phase.
// Generated once (scripts/gen-crack-pattern.cjs) and committed as literal
// data for the same determinism reasons as crackPattern.js — nothing here
// is computed at runtime.
//
// Shard = {
//   id: string,
//   polygon: Array<[x, y]>,   // canvas-space points, closed implicitly
//   center: [x, y],
//   size: 'small' | 'medium' | 'large',
//   fallDelay: number,        // ms, staggered outward from the impact point
//   fallDirection: number,    // degrees, radial direction away from impact
//   rotationDirection: 1 | -1,
// }

export const SHARDS = [
${shards
  .map(
    (s) =>
      `  { id: '${s.id}', polygon: ${fmtPoints(s.polygon)}, center: [${s.center[0]},${s.center[1]}], size: '${s.size}', fallDelay: ${s.fallDelay}, fallDirection: ${s.fallDirection}, rotationDirection: ${s.rotationDirection} },`,
  )
  .join('\n')}
];
`;

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/gen-crack-pattern.cjs <output-dir>');
  process.exit(1);
}
fs.writeFileSync(path.join(outDir, 'crackPattern.js'), crackPatternSrc);
fs.writeFileSync(path.join(outDir, 'shardPattern.js'), shardPatternSrc);

console.log('main:', mainCracks.length, 'secondary:', secondaryCracks.length, 'micro:', microCracks.length, 'shards:', shards.length);
for (const size of ['small', 'medium', 'large']) {
  const group = shards.filter((s) => s.size === size);
  const groupArea = group.reduce((sum, s) => sum + polygonArea(s.polygon), 0);
  console.log(size, 'count:', group.length, 'area%:', Math.round((groupArea / totalArea) * 100));
}
