// Deterministic "rock hit the screen" crack pattern — a spiderweb radiating
// from one impact point, same seeded-PRNG approach used elsewhere in the
// app (System Map's star field etc.), kept as a local copy rather than a
// shared import since it's a few trivial lines.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grows one jagged line from (x, y) heading in `angle` direction — each
// segment wobbles the heading a little so it reads as a natural fracture
// rather than a straight ray. `wobble` controls how sharply it bends per
// step (radial spokes stay fairly straight; short branches/crater bits
// wander more).
function jaggedLine(rand, x, y, angle, length, segments, wobble) {
  const points = [[x, y]];
  let a = angle;
  const segLen = length / segments;
  for (let i = 0; i < segments; i++) {
    a += (rand() - 0.5) * wobble;
    x += Math.cos(a) * segLen * (0.75 + rand() * 0.5);
    y += Math.sin(a) * segLen * (0.75 + rand() * 0.5);
    points.push([x, y]);
  }
  return points;
}

function pointsToPath(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

// Returns { d, delay, duration, width } per crack (SVG path, pathLength="1"
// so a plain 0->1 dashoffset animation works regardless of actual on-screen
// length). Built like a real impact fracture, in the order it would
// physically happen:
//  1. a small chaotic "crater" right at the impact point;
//  2. long radial spokes shooting outward, thick near the origin;
//  3. short branches forking off the spokes partway out;
//  4. a couple of concentric rings connecting the spokes, settling in
//     slightly after the spokes (classic windshield-crack look) — this is
//     what was missing from the earlier scattered-random-lines version.
export function generateCracks(seed, width, height, originX, originY, delayWindowMs) {
  const rand = mulberry32(seed);
  const cracks = [];
  const maxDist = Math.hypot(
    Math.max(originX, width - originX),
    Math.max(originY, height - originY),
  ) * 1.08;

  const spokeCount = 13 + Math.floor(rand() * 6); // 13-18
  const spokes = [];
  for (let i = 0; i < spokeCount; i++) {
    const slice = (Math.PI * 2) / spokeCount;
    const angle = slice * i + (rand() - 0.5) * slice * 0.7;
    const length = maxDist * (0.42 + rand() * 0.62); // varied — some short, some reach near the edge
    const segments = 7 + Math.floor(rand() * 5);
    const points = jaggedLine(rand, originX, originY, angle, length, segments, 0.45);
    spokes.push({ angle, length, points });
  }

  spokes.forEach((s) => {
    cracks.push({
      d: pointsToPath(s.points),
      delay: rand() * delayWindowMs * 0.35,
      duration: 260 + rand() * 280,
      width: 2.4 + rand() * 1.6,
    });

    if (rand() < 0.6) {
      const branchIdx = 2 + Math.floor(rand() * Math.max(1, s.points.length - 3));
      const [bx, by] = s.points[branchIdx];
      const branchAngle = s.angle + (rand() < 0.5 ? 1 : -1) * (0.35 + rand() * 0.6);
      const branchLen = s.length * (0.18 + rand() * 0.32);
      const branchPoints = jaggedLine(rand, bx, by, branchAngle, branchLen, 3 + Math.floor(rand() * 3), 0.7);
      cracks.push({
        d: pointsToPath(branchPoints),
        delay: rand() * delayWindowMs * 0.5 + 250,
        duration: 200 + rand() * 220,
        width: 1 + rand() * 0.9,
      });
    }
  });

  const ringCount = 2 + Math.floor(rand() * 2); // 2-3
  for (let r = 0; r < ringCount; r++) {
    const ringRadius = maxDist * (0.16 + r * 0.24 + rand() * 0.07);
    const ringPoints = [];
    for (let i = 0; i <= spokeCount; i++) {
      const s = spokes[i % spokeCount];
      const angle = s.angle + (rand() - 0.5) * 0.18;
      const rad = ringRadius * (0.85 + rand() * 0.3);
      ringPoints.push([originX + Math.cos(angle) * rad, originY + Math.sin(angle) * rad]);
    }
    cracks.push({
      d: pointsToPath(ringPoints),
      delay: delayWindowMs * 0.4 + rand() * delayWindowMs * 0.5,
      duration: 550 + rand() * 450,
      width: 1 + rand() * 0.8,
    });
  }

  const craterCount = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < craterCount; i++) {
    const angle = rand() * Math.PI * 2;
    const len = maxDist * (0.015 + rand() * 0.035);
    const points = jaggedLine(rand, originX, originY, angle, len, 2 + Math.floor(rand() * 2), 1.2);
    cracks.push({
      d: pointsToPath(points),
      delay: rand() * 120,
      duration: 130 + rand() * 150,
      width: 1.6 + rand() * 1.2,
    });
  }

  return cracks;
}
