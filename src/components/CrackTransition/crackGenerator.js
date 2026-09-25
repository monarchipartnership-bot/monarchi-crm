// Deterministic "shattered glass" crack pattern — same seeded-PRNG approach
// used elsewhere in the app (System Map's star field etc.), kept as a
// local copy rather than a shared import since it's a few trivial lines.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grows one jagged crack line from (x, y) heading roughly in `angle`
// direction — each segment wobbles the heading a little so it reads as a
// natural fracture line rather than a straight ray.
function growCrack(rand, x, y, angle, segments, stepLen) {
  const points = [[x, y]];
  let a = angle;
  for (let i = 0; i < segments; i++) {
    a += (rand() - 0.5) * 1.1;
    const len = stepLen * (0.6 + rand() * 0.7);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    points.push([x, y]);
  }
  return points;
}

function pointsToPath(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

// Returns an array of { d, delay, duration } — each a single crack (SVG
// path, pathLength="1" so a plain 0->1 dashoffset animation works
// regardless of actual on-screen length). `delayWindowMs` is how much of
// the total crack-in duration the individual cracks' start times are
// spread across, so they keep appearing progressively rather than all
// drawing at once.
export function generateCracks(seed, width, height, count, delayWindowMs) {
  const rand = mulberry32(seed);
  const cracks = [];

  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const angle = rand() * Math.PI * 2;
    const segments = 5 + Math.floor(rand() * 4);
    const stepLen = Math.min(width, height) * (0.05 + rand() * 0.05);
    const points = growCrack(rand, x, y, angle, segments, stepLen);
    cracks.push({
      d: pointsToPath(points),
      delay: rand() * delayWindowMs,
      duration: 550 + rand() * 500,
      width: 1 + rand() * 1.4,
    });

    // A shorter branch forking off partway along the main crack — real
    // fractures rarely run as a single clean line.
    if (rand() < 0.7) {
      const branchStart = points[1 + Math.floor(rand() * (points.length - 2))];
      const branchAngle = angle + (rand() < 0.5 ? 1 : -1) * (0.6 + rand() * 0.9);
      const branchPoints = growCrack(rand, branchStart[0], branchStart[1], branchAngle, 3 + Math.floor(rand() * 3), stepLen * 0.8);
      cracks.push({
        d: pointsToPath(branchPoints),
        delay: rand() * delayWindowMs + 150,
        duration: 400 + rand() * 400,
        width: 0.8 + rand() * 1,
      });
    }
  }

  return cracks;
}
