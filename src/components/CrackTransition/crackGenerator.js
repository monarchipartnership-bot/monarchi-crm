// Deterministic "rock hit the screen" crack pattern — a dense, rough
// spiderweb radiating from one impact point, same seeded-PRNG approach used
// elsewhere in the app (System Map's star field etc.), kept as a local
// copy rather than a shared import since it's a few trivial lines.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grows one jagged line from (x, y) heading in `angle` direction. High
// `wobble` + short segments is what makes a line read as a rough fracture
// rather than a smooth curve — real glass cracks kink sharply and often,
// they don't arc gently.
function jaggedLine(rand, x, y, angle, length, segments, wobble) {
  const points = [[x, y]];
  let a = angle;
  const segLen = length / segments;
  for (let i = 0; i < segments; i++) {
    a += (rand() - 0.5) * wobble;
    const len = segLen * (0.55 + rand() * 0.9);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    points.push([x, y]);
  }
  return points;
}

function pointsToPath(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

// Returns `{ cracks, dust }`:
// - cracks: [{ d, delay, duration, width }] — SVG paths, pathLength="1" so
//   a plain 0->1 dashoffset animation works regardless of on-screen length.
// - dust: [{ x, y, r, opacity }] — tiny static specks scattered across the
//   shattered area (dust/grit texture real broken glass always has).
//
// Built in the order a real impact fracture actually happens:
//  1. a chaotic "crater" of hairline cracks right at the impact point;
//  2. long, ROUGH radial spokes shooting outward (short zigzagging
//     segments, not gentle curves), thick and bright near the origin;
//  3. short branches forking off the spokes partway out;
//  4. several rings of jagged facet-edge connectors between neighboring
//     spokes at increasing radii — irregular (some gaps skipped, some
//     connectors jump a spoke) so the shards read as uneven polygons, not
//     a tidy grid, appearing a beat after the spokes (real fractures
//     "settle" into their cross-connections after the initial shock lines);
//  5. loose hairline micro-cracks scattered anywhere in the affected disc,
//     independent of the spoke/ring structure, for extra roughness/noise.
export function generateCracks(seed, width, height, originX, originY, delayWindowMs) {
  const rand = mulberry32(seed);
  const cracks = [];
  const maxDist = Math.hypot(
    Math.max(originX, width - originX),
    Math.max(originY, height - originY),
  ) * 1.08;

  const spokeCount = 30 + Math.floor(rand() * 14); // 30-43
  const spokes = [];
  for (let i = 0; i < spokeCount; i++) {
    const slice = (Math.PI * 2) / spokeCount;
    const angle = slice * i + (rand() - 0.5) * slice * 0.8;
    const length = maxDist * (0.4 + rand() * 0.64);
    const segments = 11 + Math.floor(rand() * 8); // 11-18 — short kinks along the way
    const points = jaggedLine(rand, originX, originY, angle, length, segments, 1.0);
    spokes.push({ angle, length, points });
  }

  spokes.forEach((s) => {
    cracks.push({
      d: pointsToPath(s.points),
      delay: rand() * delayWindowMs * 0.3,
      duration: 240 + rand() * 260,
      width: 2.2 + rand() * 1.8,
    });

    const branchCount = rand() < 0.75 ? 1 + (rand() < 0.35 ? 1 : 0) : 0;
    for (let b = 0; b < branchCount; b++) {
      const branchIdx = 2 + Math.floor(rand() * Math.max(1, s.points.length - 3));
      const [bx, by] = s.points[branchIdx];
      const branchAngle = s.angle + (rand() < 0.5 ? 1 : -1) * (0.4 + rand() * 0.8);
      const branchLen = s.length * (0.12 + rand() * 0.28);
      const branchPoints = jaggedLine(rand, bx, by, branchAngle, branchLen, 4 + Math.floor(rand() * 4), 1.3);
      cracks.push({
        d: pointsToPath(branchPoints),
        delay: rand() * delayWindowMs * 0.45 + 200,
        duration: 180 + rand() * 220,
        width: 0.9 + rand() * 1,
      });
    }
  });

  const ringBands = 4 + Math.floor(rand() * 3); // 4-6
  for (let r = 0; r < ringBands; r++) {
    const t = (r + 1) / (ringBands + 0.6);
    const bandRadius = maxDist * (0.1 + t * 0.85);
    for (let i = 0; i < spokeCount; i++) {
      if (rand() < 0.42) continue; // gaps — irregular shard sizes, not a tidy web
      const jump = rand() < 0.15 ? 2 : 1; // occasional connector that skips a spoke
      const a1 = spokes[i % spokeCount].angle + (rand() - 0.5) * 0.2;
      const a2 = spokes[(i + jump) % spokeCount].angle + (rand() - 0.5) * 0.2;
      const rad1 = bandRadius * (0.82 + rand() * 0.34);
      const rad2 = bandRadius * (0.82 + rand() * 0.34);
      const x1 = originX + Math.cos(a1) * rad1, y1 = originY + Math.sin(a1) * rad1;
      const x2 = originX + Math.cos(a2) * rad2, y2 = originY + Math.sin(a2) * rad2;
      const midAngle = Math.atan2(y2 - y1, x2 - x1);
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const points = jaggedLine(rand, x1, y1, midAngle, segLen, 2 + Math.floor(rand() * 3), 1.1);
      cracks.push({
        d: pointsToPath(points),
        delay: delayWindowMs * 0.35 + rand() * delayWindowMs * 0.55,
        duration: 260 + rand() * 320,
        width: 0.8 + rand() * 0.9,
      });
    }
  }

  const microCount = 34 + Math.floor(rand() * 18);
  for (let i = 0; i < microCount; i++) {
    const rad = maxDist * (0.05 + rand() * 0.7) * (0.3 + rand() * 0.7);
    const angle = rand() * Math.PI * 2;
    const mx = originX + Math.cos(angle) * rad, my = originY + Math.sin(angle) * rad;
    const lineAngle = rand() * Math.PI * 2;
    const len = maxDist * (0.008 + rand() * 0.025);
    const points = jaggedLine(rand, mx, my, lineAngle, len, 2, 1.6);
    cracks.push({
      d: pointsToPath(points),
      delay: rand() * delayWindowMs * 0.7 + 100,
      duration: 120 + rand() * 160,
      width: 0.6 + rand() * 0.7,
    });
  }

  const craterCount = 9 + Math.floor(rand() * 6);
  for (let i = 0; i < craterCount; i++) {
    const angle = rand() * Math.PI * 2;
    const len = maxDist * (0.012 + rand() * 0.03);
    const points = jaggedLine(rand, originX, originY, angle, len, 2 + Math.floor(rand() * 2), 1.4);
    cracks.push({
      d: pointsToPath(points),
      delay: rand() * 100,
      duration: 110 + rand() * 130,
      width: 1.6 + rand() * 1.3,
    });
  }

  const dust = [];
  const dustCount = 70 + Math.floor(rand() * 40);
  for (let i = 0; i < dustCount; i++) {
    const rad = maxDist * Math.pow(rand(), 1.6) * 0.75; // denser near the impact
    const angle = rand() * Math.PI * 2;
    dust.push({
      x: originX + Math.cos(angle) * rad,
      y: originY + Math.sin(angle) * rad,
      r: 0.5 + rand() * 1.6,
      opacity: 0.12 + rand() * 0.3,
    });
  }

  return { cracks, dust };
}
