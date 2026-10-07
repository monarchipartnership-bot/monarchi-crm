// Geometry of the focused department graph (Department -> Function -> Agent).
// Extracted unchanged from ConstellationTest.jsx when the overview was rebuilt
// for the "update ai agents" design; only the overview wheel code was removed.
// Pure and deterministic: every offset is a function of a node's own index.

export const VIEWBOX_HALF = 700;
// Scales purely visual sizes (circles, icons, text, strokes) so they read at
// a sensible size inside the large viewBox; positions are NOT multiplied.
export const UI_SCALE = VIEWBOX_HALF / 420;

// ---------------------------------------------------------------------
// Focused-department graph (Department → Function → Agent)
// ---------------------------------------------------------------------
// A completely separate layout from the overview wheel above, used only
// for whichever single department is currently focused — every sibling
// department is hidden then (see .focus-hidden), so instead of reusing the
// tight 45°-apart overview budget, this spreads across most of the free
// screen area: one big Department root, its Functions orbiting it as small
// hubs, and each Function's own Agents fanning out further still. See
// calculateDepartmentGraphLayout below.
//
// Reserved fractions of the (aspect-corrected) usable width/height the
// graph must stay clear of — mirrors the panel/nav/carousel chrome actually
// drawn over the stage, so a node can never land somewhere unclickable.
const GRAPH_RESERVE_LEFT = 0.23;
const GRAPH_RESERVE_RIGHT = 0.035;
const GRAPH_RESERVE_TOP = 0.135;
const GRAPH_RESERVE_BOTTOM = 0.18;
// Department root sits toward the left of the *usable* (already-reserved)
// area, not dead center of it, so Functions/Agents have the whole rest of
// the freed-up space to fan rightward into.
const GRAPH_DEPT_X_FRACTION = 0.16;
const GRAPH_DEPT_Y_FRACTION = 0.52;

export const FUNCTION_RADIUS_BASE = 285;
const FUNCTION_RADIUS_PER_EXTRA = 9;
// The free screen area is wide and short: functions/agents spread further
// sideways than up/down so nothing runs under the header or the carousel.
const FN_STRETCH_X = 1.3;
const FN_STRETCH_Y = 0.9;
const AG_STRETCH_X = 1.15;
const GRAPH_AGENT_RADIUS_BASE = 175;
// Minimum center-to-center distance kept between two agent nodes by the
// collision pass below.
const AGENT_MIN_DIST = 165;
// Font size (viewbox units) the agent/function labels actually render at
// (must match .dept-graph-agent-label / .dept-graph-fn-label in
// constellationTest.css) — used only to approximate label bounding boxes
// for the collision pass below, since this is a pure layout function with
// no access to the real rendered text width.
const GRAPH_LABEL_FONT = 13 * UI_SCALE;

export function toXY(angleDeg, r) {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * r, Math.sin(rad) * r];
}

function jitter(seed) {
  return ((seed * 37) % 17) - 8;
}

function fanAngle(baseAngle, index, count, spreadDeg) {
  return baseAngle + (count > 1 ? spreadDeg * (index / (count - 1) - 0.5) : 0);
}

export function findAgent(dept, agentKey) {
  for (const sc of dept.subcategories) {
    const found = sc.agents.find((a) => a.key === agentKey);
    if (found) return { ...found, subcatLabel: sc.label };
  }
  return null;
}

// A point on a cubic bezier at parameter t (De Casteljau's formula, direct
// form) — used both to place the mid-edge decoration dots and internally by
// cubicEdge below.
function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

// A soft cubic-bezier connection between two points, bent perpendicular to
// the straight line by `bend` (second control point bends less than the
// first, so the curve eases into its endpoint instead of arriving at an
// angle) — replaces the old single-control-point quadratic edge with the
// "M x1 y1 C cx1 cy1, cx2 cy2, x2 y2" shape the reference layout uses.
function cubicEdge(x1, y1, x2, y2, bend) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const p0 = [x1, y1];
  const p1 = [x1 + dx * 0.33 + nx * bend, y1 + dy * 0.33 + ny * bend];
  const p2 = [x1 + dx * 0.67 + nx * bend * 0.55, y1 + dy * 0.67 + ny * bend * 0.55];
  const p3 = [x2, y2];
  return { path: `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`, p0, p1, p2, p3 };
}

// 1-3 small decoration points along an edge's curve, at fixed t positions —
// purely visual "current flowing along the wire" dots, not separate data.
function edgeDots(edge, ts) {
  return ts.map((t) => cubicPoint(edge.p0, edge.p1, edge.p2, edge.p3, t));
}

// Which side a node's label should sit on, based on the node's offset from
// the department root — right/left when the node is mostly to one side,
// top/bottom when it's mostly straight up/down from the root.
function pickLabelSide(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy) * 0.6) return dx >= 0 ? 'right' : 'left';
  return dy < 0 ? 'top' : 'bottom';
}

export function labelProps(side, gap) {
  switch (side) {
    case 'right': return { x: gap, y: 0, textAnchor: 'start', dominantBaseline: 'middle' };
    case 'left': return { x: -gap, y: 0, textAnchor: 'end', dominantBaseline: 'middle' };
    case 'top': return { x: 0, y: -gap, textAnchor: 'middle', dominantBaseline: 'text-after-edge' };
    default: return { x: 0, y: gap, textAnchor: 'middle', dominantBaseline: 'hanging' };
  }
}

// Rough label bounding box for a given side/gap/text, in the same viewbox
// units as everything else — there's no DOM here to measure real text
// width against, so this is a plain char-count estimate (good enough to
// steer the collision pass away from an obvious overlap, not pixel-exact).
function approxLabelBBox(x, y, side, gap, text) {
  // 0.62 (not the narrower ~0.56 an English-only estimate would use) — all
  // labels are Ukrainian/Cyrillic now, whose glyphs run wider on average
  // than Latin text at the same font size (fewer narrow letters like i/l/t).
  const w = (text?.length || 6) * GRAPH_LABEL_FONT * 0.62;
  const h = GRAPH_LABEL_FONT * 1.15;
  switch (side) {
    case 'right': return { left: x + gap, right: x + gap + w, top: y - h / 2, bottom: y + h / 2 };
    case 'left': return { left: x - gap - w, right: x - gap, top: y - h / 2, bottom: y + h / 2 };
    case 'top': return { left: x - w / 2, right: x + w / 2, top: y - gap - h, bottom: y - gap };
    default: return { left: x - w / 2, right: x + w / 2, top: y + gap, bottom: y + gap + h };
  }
}
function bboxHitsCircle(bbox, cx, cy, r) {
  const nx = Math.max(bbox.left, Math.min(cx, bbox.right));
  const ny = Math.max(bbox.top, Math.min(cy, bbox.bottom));
  return Math.hypot(cx - nx, cy - ny) < r;
}
const LABEL_SIDE_TRY_ORDER = {
  right: ['right', 'left', 'top', 'bottom'],
  left: ['left', 'right', 'top', 'bottom'],
  top: ['top', 'bottom', 'right', 'left'],
  bottom: ['bottom', 'top', 'right', 'left'],
};
function withinBounds(bbox, bounds) {
  return bbox.left >= bounds.minX && bbox.right <= bounds.maxX && bbox.top >= bounds.minY && bbox.bottom <= bounds.maxY;
}
// Picks the first side (starting from the natural/preferred one) whose
// approximate label box clears every node in `circles` and stays inside
// `bounds` ({minX, maxX, minY, maxY} — the reserved panel/nav/carousel
// margins) — deterministic, not a general solver. `bounds` is a hard
// constraint (reading text under the department panel or the carousel
// pill is worse than one label overlapping a node it otherwise wouldn't),
// so a second pass relaxes the node-collision check but keeps enforcing
// it before finally falling back to the natural side untested — a long
// Ukrainian agent name can be wide enough that no side clears every node,
// but some side still keeps it off the reserved chrome.
function boxesOverlap(a, b) {
  const pad = 6;
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
}
// `boxes` holds the label boxes already placed in this pass, so two labels
// never land on top of each other either (new in the AI Agents redesign:
// long Ukrainian names made label-on-label overlap the common failure).
function resolveLabelSide(x, y, naturalSide, gap, text, circles, bounds, boxes) {
  const order = LABEL_SIDE_TRY_ORDER[naturalSide];
  for (const side of order) {
    const bbox = approxLabelBBox(x, y, side, gap, text);
    if (!withinBounds(bbox, bounds)) continue;
    if (circles.some((c) => bboxHitsCircle(bbox, c.x, c.y, c.r))) continue;
    if (boxes.some((b) => boxesOverlap(bbox, b))) continue;
    boxes.push(bbox);
    return side;
  }
  for (const side of order) {
    const bbox = approxLabelBBox(x, y, side, gap, text);
    if (withinBounds(bbox, bounds) && !circles.some((c) => bboxHitsCircle(bbox, c.x, c.y, c.r))) { boxes.push(bbox); return side; }
  }
  for (const side of order) {
    const bbox = approxLabelBBox(x, y, side, gap, text);
    if (withinBounds(bbox, bounds)) { boxes.push(bbox); return side; }
  }
  boxes.push(approxLabelBBox(x, y, naturalSide, gap, text));
  return naturalSide;
}

// ---------------------------------------------------------------------
// calculateDepartmentGraphLayout — the focused single-department graph.
// ---------------------------------------------------------------------
// Pure, deterministic (no Math.random — every offset is a function of a
// node's own index, via jitter() below, so the graph never reshuffles
// between visits): Department root → Function hubs orbiting it → each
// Function's own Agents fanning out further still. `halfW`/`halfH` are the
// SVG viewBox's own half-extents (already corrected for the stage's real
// aspect ratio, see `stageAspect`), so the reserved-space fractions below
// translate directly into safe screen-relative margins regardless of
// window size.
export function calculateDepartmentGraphLayout(dept, halfW, halfH) {
  const usableXMin = -halfW + GRAPH_RESERVE_LEFT * halfW * 2;
  const usableXMax = halfW - GRAPH_RESERVE_RIGHT * halfW * 2;
  const usableYMin = -halfH + GRAPH_RESERVE_TOP * halfH * 2;
  const usableYMax = halfH - GRAPH_RESERVE_BOTTOM * halfH * 2;
  const deptX = usableXMin + (usableXMax - usableXMin) * GRAPH_DEPT_X_FRACTION;
  const deptY = usableYMin + (usableYMax - usableYMin) * GRAPH_DEPT_Y_FRACTION;

  const fnCount = dept.subcategories.length;
  const functions = dept.subcategories.map((sc, fi) => {
    // A lone Function doesn't fan out (nothing to spread against), so it
    // gets a small fixed tilt off due-right instead of sitting on a flat
    // horizontal line.
    const tilt = fnCount === 1 ? -18 : 0;
    // Narrower arc than before (was up to 210deg): with nine agents the
    // outermost functions used to point straight up/down and ran off the
    // free area. The width the arc gives up is recovered horizontally below.
    const spread = Math.min(124, 41 * (fnCount - 1));
    const baseAngle = fanAngle(tilt, fi, fnCount, spread) + jitter(fi * 13 + 3) * 0.6;
    const radius = FUNCTION_RADIUS_BASE + fi * FUNCTION_RADIUS_PER_EXTRA + jitter(fi * 7 + 1) * 1.4;
    const [ux, uy] = toXY(baseAngle, 1);
    const fx = deptX + ux * radius * FN_STRETCH_X;
    const fy = deptY + uy * radius * FN_STRETCH_Y;
    const deptEdge = cubicEdge(deptX, deptY, fx, fy, (baseAngle < tilt ? -1 : 1) * 22);

    const agCount = sc.agents.length;
    const agents = sc.agents.map((ag, ai) => {
      const agSpread = Math.min(130, 46 * (agCount - 1));
      const agAngle = fanAngle(baseAngle, ai, agCount, agSpread) + jitter(fi * 31 + ai * 17 + 5) * 0.8;
      // ±~22% length variance per agent so a function's fan reads as an
      // organic spray, not a mechanically even row of equal-length spokes.
      const radiusMul = 1 + (jitter(fi * 19 + ai * 11 + 9) / 8) * 0.22;
      const agRadius = GRAPH_AGENT_RADIUS_BASE * radiusMul;
      const [aux, auy] = toXY(agAngle, 1);
      const ax = fx + aux * agRadius * AG_STRETCH_X;
      const ay = fy + auy * agRadius;
      return { ...ag, x: ax, y: ay, angle: agAngle, subcatKey: sc.key, subcatLabel: sc.label };
    });

    return {
      ...sc, x: fx, y: fy, angle: baseAngle,
      edgePath: deptEdge.path,
      edgeDots: edgeDots(deptEdge, [0.35, 0.68]),
      // Anchored toward the department, not outward — outward is where
      // this Function's own Agents fan out to, and a label reaching that
      // way would run straight into the first one of them. Finalized
      // below (resolveLabelSide) once every node's final position — and
      // so every node's collision circle — is known.
      naturalLabelSide: pickLabelSide(deptX - fx, deptY - fy),
      agents,
    };
  });

  // Deterministic collision pass — not a physics/force simulation (the
  // layout must land in the same spot every time a department is opened),
  // just a few fixed passes pushing whichever of two too-close agents sits
  // further from its own Function hub a bit further out along its own
  // angle, until they clear AGENT_MIN_DIST.
  const flat = functions.flatMap((f) => f.agents.map((a) => ({ a, f })));
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const A = flat[i], B = flat[j];
        const dx = B.a.x - A.a.x, dy = B.a.y - A.a.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist >= AGENT_MIN_DIST) continue;
        const distA = Math.hypot(A.a.x - A.f.x, A.a.y - A.f.y);
        const distB = Math.hypot(B.a.x - B.f.x, B.a.y - B.f.y);
        const target = distA >= distB ? A : B;
        const push = AGENT_MIN_DIST - dist;
        const [ux, uy] = toXY(target.a.angle, 1);
        target.a.x += ux * push;
        target.a.y += uy * push;
      }
    }
    // Keep every agent (and its function hub) inside the free area between
    // the header chrome and the carousel — a pushed-out node must never end
    // up under the navigation or the department name.
    const padX = 40 * UI_SCALE, padY = 36 * UI_SCALE;
    flat.forEach(({ a: ag }) => {
      ag.x = Math.min(usableXMax - padX * 2.2, Math.max(usableXMin + padX, ag.x));
      ag.y = Math.min(usableYMax - padY, Math.max(usableYMin + padY, ag.y));
    });
  }

  // Edges are finalized after the collision pass so they reflect any
  // nudged position.
  functions.forEach((f) => {
    f.agents.forEach((a) => {
      const agEdge = cubicEdge(f.x, f.y, a.x, a.y, (a.angle < f.angle ? -1 : 1) * 12);
      a.edgePath = agEdge.path;
      a.edgeDots = edgeDots(agEdge, [0.5]);
      // Relative to its own Function hub, not the department — siblings of
      // the same function fan out at different angles from each other, so
      // this diverges their label sides more reliably than a department-
      // relative direction would (which several siblings can share).
      a.naturalLabelSide = pickLabelSide(a.x - f.x, a.y - f.y);
    });
  });

  // Every node's final position (and so its collision circle) is now
  // known — resolve each label's actual side against all of them plus the
  // reserved panel margin, in one pass, instead of guessing blind.
  const collisionCircles = [
    { x: deptX, y: deptY, r: 46 * UI_SCALE },
    ...functions.map((f) => ({ x: f.x, y: f.y, r: 17 * UI_SCALE })),
    ...flat.map(({ a }) => ({ x: a.x, y: a.y, r: 22 * UI_SCALE })),
  ];
  const labelBounds = { minX: usableXMin, maxX: usableXMax, minY: usableYMin, maxY: usableYMax };
  const placedBoxes = [];
  functions.forEach((f) => {
    f.labelSide = resolveLabelSide(f.x, f.y, f.naturalLabelSide, 17 * UI_SCALE, f.label, collisionCircles, labelBounds, placedBoxes);
  });
  functions.forEach((f) => {
    f.agents.forEach((a) => {
      a.labelSide = resolveLabelSide(a.x, a.y, a.naturalLabelSide, 30 * UI_SCALE, a.name, collisionCircles, labelBounds, placedBoxes);
    });
  });

  return { x: deptX, y: deptY, functions };
}
