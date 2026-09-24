import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AGENT_DEPTS } from '../../data/aiAgentsData';
import ParticleSphere from '../../components/ParticleSphere/ParticleSphere';
import KnowledgeBase from '../KnowledgeBase/KnowledgeBase';
import AdsInsightsAnalyst from '../AdsInsightsAnalyst/AdsInsightsAnalyst';
import '../../styles/constellationTest.css';

// Agents with a real interactive tool (as opposed to the generic read-only
// info modal) register here by their aiAgentsData.js `tool` key — see
// `agentToolOpen` below. One entry so far; the next priority agents plug in
// the same way instead of hardcoding another agent key into the JSX.
const AGENT_TOOLS = {
  'ads-insights-chat': AdsInsightsAnalyst,
};

// Stage 2 of the AI Agents entrance: the darken + welcome beat (stage 1)
// now plays *before* this page even mounts (see IntroTransition, triggered
// from the sidebar) — by the time we're here, the screen is already black.
// This page only owns the reveal itself: the core lights up, then every
// department flies out from it, clockwise, staggered by `deptIdx`.
const REVEAL_TIMELINE = {
  core: 250,
  hubs: 650,
  done: 650 + 2400,
};

// AI Agents Constellation — 3-level radial map (department → subcategory →
// agent) built from the real agent catalog in aiAgentsData.js. Zooms into a
// department on click (CSS transform, not viewBox animation — keeps the
// math simple: translate the focused hub to the origin, then scale).

// Sized for 8 departments 45° apart (see AGENT_DEPTS) — hubs pulled in
// close to the core so the whole graph fits a normal viewport without
// clipping, now that every branch's dot-web renders at once (not just the
// focused one). Subcat/agent fan angles are no longer one fixed degree for
// everyone — they scale with how many siblings actually need to fit (see
// fanSpread below), so a department with 4 subcategories (Sales) gets a
// wider fan than one with a single subcategory, instead of either cramming
// 4 into the same slice a lone subcat would use, or wasting a wide slice
// on a department that doesn't need it.
const HUB_RADIUS = 190;
const SUBCAT_RADIUS = 130;
const SUBCAT_DEG_PER_ITEM = 24;
const SUBCAT_MAX_SPREAD = 72;
// Agents within one subcategory chain outward by radius (each one further
// from the subcat than the last) rather than fanning wide by angle — a
// narrow angular fan wasn't enough room for a 3-agent subcategory to clear
// its neighbor once every subcat's whole fan is visible at once (not just
// the focused one), no matter how the angle budget was split: for two
// points close in angle, distance is dominated by their radius gap, not
// the (tiny) arc between them, so the radius step has to be the main
// separator — a wide-but-short step just puts them back on top of each
// other. STEP is doubled from the first pass at this (36→72) per explicit
// feedback that the dots still read as cramped. BASE equals STEP so the
// subcat-to-first-agent gap matches the agent-to-agent gap instead of
// being its own (much smaller) distance — that mismatch was the "plain
// dot sits almost on top of the first agent" feedback.
const AGENT_RADIUS_BASE = 72;
const AGENT_RADIUS_STEP = 72;
const AGENT_ANGLE_PER_ITEM = 10;
const AGENT_ANGLE_MAX = 20;
// Extra rotation added per step outward, alternating direction per
// subcategory — bends a chain into a curve instead of a straight radial
// line. Also the fix for a single-subcategory department's chain running
// dead straight toward its own outer label: with this, only the innermost
// agent (k=0) still sits on that exact line, everything past it curves
// away.
const SPIRAL_DEG_PER_STEP = 15;
// Past the outermost agent leaf (hub + subcat + longest agent chain), so
// the department name sits beyond the whole branch — like the reference
// layout's labels floating past the edge of each petal, not tucked under
// the hub itself.
const CHAIN_MAX_RADIUS = HUB_RADIUS + SUBCAT_RADIUS + AGENT_RADIUS_BASE + AGENT_RADIUS_STEP * 2;
const LABEL_BASE_GAP = 40;
// The label text itself is ~90-100 units wide and centered on the label
// point — for a department sitting left/right, that whole width reads back
// toward the hub, along the same line the agent chain approaches from, so
// clearing it needs a much bigger margin than a top/bottom department
// does (where the text's width runs sideways, away from the chain, and
// only its much shorter height matters). labelRadius() below scales this
// extra margin by how "horizontal" the department's own angle is —
// full width for due left/right, none of it for due up/down — instead of
// handing every department the worst case and pushing top/bottom labels
// needlessly far out.
const LABEL_TEXT_MARGIN = 100;
function labelRadius(deptAngleDeg) {
  const horizontalness = Math.abs(Math.cos((deptAngleDeg * Math.PI) / 180));
  return CHAIN_MAX_RADIUS + LABEL_BASE_GAP + LABEL_TEXT_MARGIN * horizontalness;
}
// Half-size of the graph SVG's own viewBox — content must stay within this
// radius from center or risk being clipped by the stage container on some
// window shapes (unlike overview elements outside it, which only rely on
// overflow:visible and a lucky letterboxed margin). Doubling the dot
// spacing above pushed the label radius well past the old 420, so this
// grew with it.
const VIEWBOX_HALF = 700;
// The bigger viewBox needed for the wider spacing above also shrinks
// everything mapped into it (same screen space, more world-units per
// pixel) — this scales the purely-visual sizes (circles, icons, text,
// strokes) back up so hubs/leaves/labels read at roughly their old size
// even though they now sit further apart. Position radii above are NOT
// multiplied by this — only how big things are drawn, not where.
const UI_SCALE = VIEWBOX_HALF / 420;

// The overview's spread (above) is deliberately tight — 8 branches all
// visible at once, 45° apart, must not collide with a neighbor.
const OVERVIEW_PARAMS = {
  subcatRadius: SUBCAT_RADIUS, subcatDegPerItem: SUBCAT_DEG_PER_ITEM, subcatMaxSpread: SUBCAT_MAX_SPREAD,
  agentRadiusBase: AGENT_RADIUS_BASE, agentRadiusStep: AGENT_RADIUS_STEP,
  agentAnglePerItem: AGENT_ANGLE_PER_ITEM, agentAngleMax: AGENT_ANGLE_MAX,
};

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
const GRAPH_RESERVE_TOP = 0.09;
const GRAPH_RESERVE_BOTTOM = 0.14;
// Department root sits toward the left of the *usable* (already-reserved)
// area, not dead center of it, so Functions/Agents have the whole rest of
// the freed-up space to fan rightward into.
const GRAPH_DEPT_X_FRACTION = 0.16;
const GRAPH_DEPT_Y_FRACTION = 0.52;

const FUNCTION_RADIUS_BASE = 285;
const FUNCTION_RADIUS_PER_EXTRA = 9;
const GRAPH_AGENT_RADIUS_BASE = 175;
// Minimum center-to-center distance kept between two agent nodes by the
// collision pass below.
const AGENT_MIN_DIST = 130;
// Font size (viewbox units) the agent/function labels actually render at
// (must match .dept-graph-agent-label / .dept-graph-fn-label in
// constellationTest.css) — used only to approximate label bounding boxes
// for the collision pass below, since this is a pure layout function with
// no access to the real rendered text width.
const GRAPH_LABEL_FONT = 13 * UI_SCALE;

// Deterministic star-field — seeded, not Math.random(), so the scatter
// doesn't reshuffle on every render (same trick as jitter() below).
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Star field lives in its own full-bleed SVG (see constellation-starfield-svg
// below), sized to the stage's real aspect ratio every resize (STAGE_ASPECT
// clamp below) so preserveAspectRatio can stay the default "meet" — stars
// reach every corner on a wide screen without ever stretching into ellipses,
// which is what a fixed square viewBox + preserveAspectRatio="none" did.
// The data range (x: ±960, y: ±480) is generous enough to fully cover the
// widest clamped aspect ratio the viewBox can take. About a quarter of the
// stars get a slow pulsing glow on top of the plain twinkle; the rest stay
// as plain dim points.
function buildStarField(count) {
  const rand = mulberry32(20260908);
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    x: (rand() - 0.5) * 1920,
    y: (rand() - 0.5) * 960,
    r: 0.5 + rand() * 1,
    baseOpacity: 0.08 + rand() * 0.18,
    twinkle: 2.5 + rand() * 3.5,
    delay: rand() * 5,
    glow: rand() < 0.25,
    glowDuration: 3 + rand() * 3,
    glowDelay: rand() * 4,
  }));
}
const STAR_FIELD = buildStarField(190);

const AUTONOMY_LABEL = {
  'human-led': 'HUMAN-LED',
  'human-assisted': 'HUMAN-ASSISTED',
  'fully-autonomous': 'FULLY AUTONOMOUS',
};
const STATUS_LABEL = {
  not_started: 'Not started',
  in_development: 'In development',
  live: 'Live',
};
const WAVE_LABEL = { 1: 'WAVE 1', 2: 'WAVE 2', 3: 'WAVE 3' };

// CHART tab: matrix view of a single department's own agents — rows are
// the autonomy ladder, columns are the rollout stage (see the `stage`
// comment in aiAgentsData.js). Reuses the same agent-detail modal as the
// graph (via onSelectAgent) instead of building a second card layout.
const LADDER_ORDER = ['human-led', 'human-assisted', 'fully-autonomous'];
const LADDER_ROW_LABEL = {
  'human-led': 'Human-led',
  'human-assisted': 'Human-assisted',
  'fully-autonomous': 'Fully autonomous',
};
const STAGE_ORDER = ['foundation', 'capture', 'generate', 'orchestrate'];
const STAGE_LABEL = {
  foundation: 'Foundation',
  capture: 'Capture',
  generate: 'Generate',
  orchestrate: 'Orchestrate',
};

function DeptChartView({ dept, deptKey, onSelectAgent }) {
  const agents = dept.subcategories.flatMap((sc) => sc.agents.map((a) => ({ ...a, subcatLabel: sc.label })));
  const total = agents.length;
  const autonomousCount = agents.filter((a) => a.autonomyLevel === 'fully-autonomous').length;
  const assistedCount = agents.filter((a) => a.autonomyLevel === 'human-assisted').length;
  const humanCount = agents.filter((a) => a.autonomyLevel === 'human-led').length;

  return (
    <div className="chart-view" style={{ '--dept-color': dept.color }}>
      <div className="chart-header">
        <div className="dept-panel-eyebrow">Відділ · Chart</div>
        <h2>{dept.label}</h2>
        <p className="chart-stats">
          {autonomousCount} з {total} {total === 1 ? 'завдання' : 'завдань'} виконуються автономно · {assistedCount} асистовано · {humanCount} лишаються повністю на людині
        </p>
      </div>

      <div className="chart-grid" style={{ '--stage-cols': STAGE_ORDER.length }}>
        <div className="chart-corner" />
        {STAGE_ORDER.map((stage) => (
          <div key={stage} className="chart-col-header">{STAGE_LABEL[stage]}</div>
        ))}
        {LADDER_ORDER.map((level) => (
          <Fragment key={level}>
            <div className="chart-row-label">{LADDER_ROW_LABEL[level]}</div>
            {STAGE_ORDER.map((stage) => {
              const cellAgents = agents.filter((a) => a.autonomyLevel === level && a.stage === stage);
              return (
                <div key={stage} className="chart-cell">
                  {cellAgents.length === 0 && <span className="chart-cell-empty">—</span>}
                  {cellAgents.map((a) => (
                    <button
                      key={a.key} type="button" className="chart-card"
                      onClick={() => onSelectAgent({ ...a, deptKey, deptLabel: dept.label, color: dept.color })}
                    >
                      <span className="chart-card-ic" dangerouslySetInnerHTML={{ __html: a.icon }} />
                      <span className="chart-card-body">
                        <span className="chart-card-name">{a.name}</span>
                        <span className="chart-card-sub">{a.subcatLabel}</span>
                      </span>
                      {a.wave && <span className={'chart-card-wave wave-' + a.wave}>W{a.wave}</span>}
                      <span className={'chart-card-dot status-' + a.status} />
                    </button>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function toXY(angleDeg, r) {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * r, Math.sin(rad) * r];
}

function jitter(seed) {
  return ((seed * 37) % 17) - 8;
}

function fanAngle(baseAngle, index, count, spreadDeg) {
  return baseAngle + (count > 1 ? spreadDeg * (index / (count - 1) - 0.5) : 0);
}

// How wide a fan `count` siblings need — scales with the actual count
// instead of handing every branch the same fixed angle regardless of how
// crowded it is.
function fanSpread(count, degPerItem, maxSpread) {
  return Math.min(maxSpread, degPerItem * (count - 1));
}

// Control point for a quadratic-bezier edge between two points, offset
// perpendicular to the straight line by `bend` — curved "vine" edges
// instead of dead-straight spokes, and it doubles as a cheap way to keep a
// single-subcategory chain from running dead straight toward its own
// department label (see SPIRAL_DEG_PER_STEP below).
function curvePoint(x1, y1, x2, y2, bend) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return [mx - (dy / len) * bend, my + (dx / len) * bend];
}

// Builds one department's subcategory/agent positions around its hub —
// used only for the overview wheel now (see calculateDepartmentGraphLayout
// below for the focused single-department graph).
function buildSubcats(dept, deptAngle, hx, hy, seedBase, params) {
  const subcatSpread = fanSpread(dept.subcategories.length, params.subcatDegPerItem, params.subcatMaxSpread);
  return dept.subcategories.map((sc, j) => {
    const subAngle = fanAngle(deptAngle, j, dept.subcategories.length, subcatSpread);
    const [sux, suy] = toXY(subAngle, 1);
    const sDist = params.subcatRadius + jitter(seedBase * 20 + j);
    const sx = hx + sux * sDist;
    const sy = hy + suy * sDist;
    const hubBend = (subAngle - deptAngle < 0 ? -1 : 1) * 14;
    const [hubEdgeCx, hubEdgeCy] = curvePoint(hx, hy, sx, sy, hubBend);

    const agentSpread = fanSpread(sc.agents.length, params.agentAnglePerItem, params.agentAngleMax);
    // Spiral away from the department's own center line, not just
    // alternating by index — a subcat sitting left of center needs its
    // chain curving further left (away from its neighbors), not toward
    // whichever one happens to be next in the list.
    const subOffset = subAngle - deptAngle;
    const spiralDir = subOffset < 0 ? -1 : 1;
    const agents = sc.agents.map((ag, k) => {
      const agentAngle = fanAngle(subAngle, k, sc.agents.length, agentSpread) + spiralDir * k * SPIRAL_DEG_PER_STEP;
      const [aux, auy] = toXY(agentAngle, 1);
      // No radius jitter here (unlike the subcat radius above) — the
      // radius step is the load-bearing separator between agents at
      // similar angles, so it needs to be exact, not nudged by a few
      // units. The spiral rotation above is what varies the shape.
      const aDist = params.agentRadiusBase + k * params.agentRadiusStep;
      const ax = sx + aux * aDist;
      const ay = sy + auy * aDist;
      const [edgeCx, edgeCy] = curvePoint(sx, sy, ax, ay, (k % 2 === 0 ? 1 : -1) * (10 + k * 5));
      return { ...ag, x: ax, y: ay, edgeCx, edgeCy, subcatKey: sc.key, subcatLabel: sc.label };
    });

    return { ...sc, x: sx, y: sy, hubEdgeCx, hubEdgeCy, agents };
  });
}

function findAgent(dept, agentKey) {
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

function labelProps(side, gap) {
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
function resolveLabelSide(x, y, naturalSide, gap, text, circles, bounds) {
  const order = LABEL_SIDE_TRY_ORDER[naturalSide];
  for (const side of order) {
    const bbox = approxLabelBBox(x, y, side, gap, text);
    if (!withinBounds(bbox, bounds)) continue;
    if (!circles.some((c) => bboxHitsCircle(bbox, c.x, c.y, c.r))) return side;
  }
  for (const side of order) {
    if (withinBounds(approxLabelBBox(x, y, side, gap, text), bounds)) return side;
  }
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
function calculateDepartmentGraphLayout(dept, halfW, halfH) {
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
    const spread = Math.min(210, 55 * (fnCount - 1));
    const baseAngle = fanAngle(tilt, fi, fnCount, spread) + jitter(fi * 13 + 3) * 0.6;
    const radius = FUNCTION_RADIUS_BASE + fi * FUNCTION_RADIUS_PER_EXTRA + jitter(fi * 7 + 1) * 1.4;
    const [ux, uy] = toXY(baseAngle, 1);
    const fx = deptX + ux * radius;
    const fy = deptY + uy * radius;
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
      const ax = fx + aux * agRadius;
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
  for (let iter = 0; iter < 3; iter++) {
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
  functions.forEach((f) => {
    f.labelSide = resolveLabelSide(f.x, f.y, f.naturalLabelSide, 17 * UI_SCALE, f.label, collisionCircles, labelBounds);
    f.agents.forEach((a) => {
      a.labelSide = resolveLabelSide(a.x, a.y, a.naturalLabelSide, 30 * UI_SCALE, a.name, collisionCircles, labelBounds);
    });
  });

  return { x: deptX, y: deptY, functions };
}

export default function ConstellationTest() {
  const [focusedDept, setFocusedDept] = useState(null);
  const [hoveredDept, setHoveredDept] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [coreOpen, setCoreOpen] = useState(false);
  const [agentToolOpen, setAgentToolOpen] = useState(null);
  const [deptPanelClosed, setDeptPanelClosed] = useState(false);
  const [viewMode, setViewMode] = useState('map');
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [introPhase, setIntroPhase] = useState('start');

  useEffect(() => {
    const timers = Object.entries(REVEAL_TIMELINE).map(([phase, delay]) => setTimeout(() => setIntroPhase(phase), delay));
    return () => timers.forEach(clearTimeout);
  }, []);
  const introDone = introPhase === 'done';

  const stageRef = useRef(null);

  // Real stage aspect ratio, clamped to what the star field's data range
  // can cover without gaps — drives the starfield SVG's own viewBox so it
  // can use the default (non-distorting) preserveAspectRatio and still
  // reach every edge of the screen.
  const [stageAspect, setStageAspect] = useState(16 / 9);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setStageAspect(Math.min(2, Math.max(1, width / height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const starHalfH = 480;
  const starHalfW = starHalfH * stageAspect;
  const starViewBox = `${-starHalfW} ${-starHalfH} ${starHalfW * 2} ${starHalfH * 2}`;

  // The main graph's own viewBox widens the same way (see starViewBox
  // above) so the focused department's graph has real width to spread
  // into instead of being letterboxed into a square in the middle of a
  // wide window — the overview wheel is unaffected, since every overview
  // position is a fixed radius from center regardless of how much extra
  // margin sits past it.
  const graphHalfW = VIEWBOX_HALF * stageAspect;
  const graphHalfH = VIEWBOX_HALF;

  const deptKeys = Object.keys(AGENT_DEPTS);

  // Re-show the department overview panel every time a (different)
  // department comes into focus — closing it is per-visit, not permanent.
  // CHART is per-visit too: entering a (different) department always starts
  // on MAP, same as the dept panel re-opening.
  useEffect(() => { setDeptPanelClosed(false); setViewMode('map'); }, [focusedDept]);

  const layout = useMemo(() => {
    const n = deptKeys.length;
    return deptKeys.map((key, i) => {
      const dept = AGENT_DEPTS[key];
      const deptAngle = -90 + (360 / n) * i;
      const [hx, hy] = toXY(deptAngle, HUB_RADIUS);
      const subcats = buildSubcats(dept, deptAngle, hx, hy, i, OVERVIEW_PARAMS);
      return { key, dept, deptAngle, hx, hy, subcats };
    });
  }, [deptKeys]);

  // The Department → Function → Agent graph for whichever department is
  // currently focused (see calculateDepartmentGraphLayout) — recomputed
  // when the focus changes, or when the stage is resized (so it keeps
  // using the freed-up space correctly after a window resize).
  const focusedGraph = useMemo(() => {
    if (!focusedDept) return null;
    const dept = AGENT_DEPTS[focusedDept];
    if (!dept) return null;
    return calculateDepartmentGraphLayout(dept, graphHalfW, graphHalfH);
  }, [focusedDept, graphHalfW, graphHalfH]);

  const isDimmed = (key) => {
    if (focusedDept) return focusedDept !== key;
    if (hoveredDept) return hoveredDept !== key;
    return false;
  };
  const focused = layout.find((l) => l.key === focusedDept);

  // `view` no longer positions the focused graph itself — that's now
  // computed directly in on-screen coordinates by calculateDepartmentGraphLayout
  // (see the dedicated, untransformed <g> in the render below) — it only
  // drives the pre-existing subtle background dot-grid drift (gridTransform
  // below), which stays purely cosmetic and lives outside the graph SVG.
  function focusDept(key) {
    const next = focusedDept === key ? null : key;
    setFocusedDept(next);
    setView(next ? { scale: 1.08, x: 40, y: 20 } : { scale: 1, x: 0, y: 0 });
  }
  function resetView() {
    setFocusedDept(null);
    setView({ scale: 1, x: 0, y: 0 });
  }
  function cycleDept(dir) {
    if (!focusedDept) return;
    const idx = deptKeys.indexOf(focusedDept);
    const nextKey = deptKeys[(idx + dir + deptKeys.length) % deptKeys.length];
    setFocusedDept(nextKey);
    setView({ scale: 1.08, x: 40, y: 20 });
  }

  // Mouse wheel cycles departments while one is focused — same action as
  // the ‹ › carousel buttons, just via scroll. Throttled so a single
  // trackpad flick doesn't skip past several departments at once, and
  // skipped over the dept-panel/chart-view so their own overflow still
  // scrolls normally instead of cycling the department underneath them.
  const wheelCooldownRef = useRef(0);
  useEffect(() => {
    if (!focusedDept || selectedAgent || coreOpen) return undefined;
    function handleWheel(e) {
      if (e.target.closest('.chart-view, .dept-panel')) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelCooldownRef.current < 450 || Math.abs(e.deltaY) < 8) return;
      wheelCooldownRef.current = now;
      cycleDept(e.deltaY > 0 ? 1 : -1);
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedDept, selectedAgent, coreOpen]);

  // Escape backs out one layer at a time: closes an open agent/core modal
  // first, otherwise returns from a focused department to the overview.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (agentToolOpen) { setAgentToolOpen(null); return; }
      if (selectedAgent) { setSelectedAgent(null); return; }
      if (coreOpen) { setCoreOpen(false); return; }
      if (focusedDept) resetView();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAgent, coreOpen, agentToolOpen, focusedDept]);

  const stageTransform = `scale(${view.scale}) translate(${-view.x}px, ${-view.y}px)`;
  const transitionCss = 'transform .6s cubic-bezier(.16,1,.3,1)';
  // Background dot-grid: only a sliver of the real zoom/pan (so it stays
  // reassuringly fine no matter how far into a department you go), damped
  // enough that it still visibly drifts/settles with every zoom move.
  const gridTransform = `scale(${1 + (view.scale - 1) * 0.045}) translate(${-view.x * 0.14}px, ${-view.y * 0.14}px)`;

  return (
    <div className="constellation-page" style={{ '--ui-scale': UI_SCALE }}>
      <Link to="/" className="constellation-exit">
        <svg viewBox="0 0 24 24"><path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" /></svg>
        CRM
      </Link>

      <div className="constellation-overlay">
        {focused && (
          <div className="constellation-breadcrumb-pill">
            <span className="constellation-focus-dot" style={{ background: focused.dept.color }} />
            <b>{focused.dept.label}</b><span className="sep">·</span>{focused.dept.subtitle}
          </div>
        )}
        {focused && (
          <button type="button" className="constellation-reset" onClick={resetView}>&larr; Всі відділи</button>
        )}
      </div>

      {focused && !focused.dept.comingSoon && (
        <div className="view-tabs">
          <button type="button" className={'view-tab' + (viewMode === 'map' ? ' active' : '')} onClick={() => setViewMode('map')}>MAP</button>
          <button type="button" className={'view-tab' + (viewMode === 'chart' ? ' active' : '')} onClick={() => setViewMode('chart')}>CHART</button>
        </div>
      )}

      {focused && (
        <div className="constellation-carousel" style={{ '--dept-color': focused.dept.color }}>
          <button type="button" aria-label="Попередній відділ" onClick={() => cycleDept(-1)}>&lsaquo;</button>
          <div className="constellation-carousel-info">
            <div className="constellation-carousel-name">{focused.dept.label}</div>
            {focused.dept.tagline && <div className="constellation-carousel-tagline">{focused.dept.tagline}</div>}
          </div>
          <button type="button" aria-label="Наступний відділ" onClick={() => cycleDept(1)}>&rsaquo;</button>
        </div>
      )}

      {focused && viewMode === 'map' && !deptPanelClosed && (() => {
        const dept = focused.dept;

        if (dept.comingSoon) {
          return (
            <div className="dept-panel dept-panel-soon" style={{ '--dept-color': dept.color }}>
              <button type="button" className="dept-panel-close" onClick={() => setDeptPanelClosed(true)}>&times;</button>
              <div className="dept-panel-eyebrow">Відділ · СКОРО</div>
              <h2>{dept.label}</h2>
              <div className="dept-panel-subtitle">{dept.subtitle}</div>
              {dept.comingSoonNote && <p className="dept-panel-narrative">{dept.comingSoonNote}</p>}
              <div className="dept-panel-soon-note">Узгоджено з командою як частина цільової карти відділів. Реалізація ще не почалась.</div>
            </div>
          );
        }

        const totalAgents = dept.subcategories.reduce((sum, sc) => sum + sc.agents.length, 0);
        const startHereAgent = dept.startHere ? findAgent(dept, dept.startHere) : null;
        return (
          <div className="dept-panel" style={{ '--dept-color': dept.color }}>
            <button type="button" className="dept-panel-close" onClick={() => setDeptPanelClosed(true)}>&times;</button>
            <div className="dept-panel-eyebrow">Відділ</div>
            <h2>{dept.label}</h2>
            <div className="dept-panel-subtitle">{dept.subtitle}</div>
            {dept.narrative && <p className="dept-panel-narrative">{dept.narrative}</p>}

            <div className="dept-panel-section">
              <h4>Що охоплює</h4>
              <div className="dept-panel-pills">
                {dept.subcategories.map((sc) => <span key={sc.key} className="dept-panel-pill">{sc.label}</span>)}
              </div>
            </div>

            <div className="dept-panel-section">
              <h4>Функції</h4>
              <ul className="dept-panel-functions">
                {dept.subcategories.map((sc) => (
                  <li key={sc.key}><span>{sc.label}</span><span className="dept-panel-count">{sc.agents.length} {sc.agents.length === 1 ? 'агент' : 'агенти'}</span></li>
                ))}
              </ul>
            </div>

            {startHereAgent && (
              <div className="dept-panel-section">
                <h4>З чого почати</h4>
                <button
                  type="button" className="dept-panel-starthere"
                  onClick={() => setSelectedAgent({ ...startHereAgent, deptKey: focused.key, deptLabel: dept.label, color: dept.color })}
                >
                  {startHereAgent.name} &rarr;
                </button>
              </div>
            )}

            <div className="dept-panel-numbers">
              {totalAgents} {totalAgents === 1 ? 'агент' : 'агентів'} · {dept.subcategories.length} {dept.subcategories.length === 1 ? 'функція' : 'функції'}
            </div>
          </div>
        );
      })()}

      {focused && viewMode === 'chart' && !focused.dept.comingSoon && (
        <DeptChartView dept={focused.dept} deptKey={focused.key} onSelectAgent={setSelectedAgent} />
      )}

      <div
        className="constellation-stage" ref={stageRef}
        style={{ pointerEvents: introDone && viewMode === 'map' ? 'auto' : 'none' }}
      >
        <div className="constellation-grid" style={{ transform: gridTransform, transition: transitionCss }} />
        <div className="constellation-fog fog-1" />
        <div className="constellation-fog fog-2" />
        <div className="constellation-fog fog-3" />

        <svg viewBox={starViewBox} className="constellation-starfield-svg">
          {STAR_FIELD.map((s) => (
            <circle
              key={s.key} cx={s.x} cy={s.y} r={s.r} className="bg-star"
              style={{
                '--base-o': s.baseOpacity,
                animation: s.glow
                  ? `starTwinkle ${s.twinkle}s ease-in-out ${s.delay}s infinite, starGlowPulse ${s.glowDuration}s ease-in-out ${s.glowDelay}s infinite`
                  : `starTwinkle ${s.twinkle}s ease-in-out ${s.delay}s infinite`,
              }}
            />
          ))}
        </svg>

        <svg viewBox={`${-graphHalfW} ${-graphHalfH} ${graphHalfW * 2} ${graphHalfH * 2}`} className="constellation-svg">
          <defs>
            <filter id="edgeGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>


          <g style={{ transformBox: 'view-box', transformOrigin: '0px 0px', transform: stageTransform, transition: transitionCss }}>
            <circle r={HUB_RADIUS} className={'orbit-ring' + (introPhase === 'hubs' || introDone ? ' visible' : '')} />

            <g
              className={'constellation-core-btn' + (introPhase !== 'start' ? ' lit' : '')}
              onClick={() => setCoreOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="Інформаційна база"
            >
              <circle r={140 * UI_SCALE} className="core-hit-area" />
              <ParticleSphere scale={0.38 * UI_SCALE} />
            </g>

            {layout.map(({ key, dept, deptAngle, hx, hy, subcats: overviewSubcats }, deptIdx) => {
              const dimmed = isDimmed(key);
              const isFocused = focusedDept === key;
              // Any OTHER department fully disappears while one is
              // focused, instead of just dimming — per feedback, seeing
              // faint neighboring hubs/webs peeking in around the edges
              // while zoomed into one was clutter, not context.
              const hiddenByFocus = focusedDept !== null && !isFocused;
              const subcats = overviewSubcats;
              const branchRevealClass = introPhase === 'hubs' ? ' revealed' : (introDone ? '' : ' pre-reveal');
              const color = dept.color;
              const [outerDotX, outerDotY] = toXY(deptAngle, 30 * UI_SCALE);
              const [innerDotX, innerDotY] = toXY(deptAngle + 180, 30 * UI_SCALE);
              const [labelX, labelY] = toXY(deptAngle, labelRadius(deptAngle));
              return (
                <g
                  key={key}
                  className={'constellation-branch' + (dimmed ? ' dimmed' : '') + (hiddenByFocus ? ' focus-hidden' : '') + branchRevealClass}
                  style={{ '--dept-color': color, '--pulse-delay': `${deptIdx * 0.6}s`, '--fly-delay': `${deptIdx * 90}ms` }}
                >
                  {/* The currently-focused department's own hub/web is
                      replaced entirely by its dedicated Department→
                      Function→Agent graph (see focusedGraph, rendered as
                      its own untransformed <g> right after this loop) — it
                      has nothing left to draw here itself. Every other
                      department keeps its normal small overview branch,
                      just hidden via .focus-hidden while one is focused. */}
                  {!isFocused && (
                    <>
                      <line x1={0} y1={0} x2={hx} y2={hy} className="constellation-edge spoke" filter="url(#edgeGlow)" />

                      {/* Data "flowing" from each department into the shared
                          core — everything the agents produce converges into
                          one knowledge base at the center. */}
                      <circle r={2.2 * UI_SCALE} className="flow-dot" style={{ '--sx': `${hx}px`, '--sy': `${hy}px`, animationDelay: `${(deptIdx % 8) * 0.35}s` }} />
                      <circle r={2.2 * UI_SCALE} className="flow-dot" style={{ '--sx': `${hx}px`, '--sy': `${hy}px`, animationDelay: `${(deptIdx % 8) * 0.35 + 1.6}s` }} />

                      {subcats.map((sc) => (
                        <g key={sc.key}>
                          <path
                            d={`M ${hx} ${hy} Q ${sc.hubEdgeCx} ${sc.hubEdgeCy} ${sc.x} ${sc.y}`}
                            fill="none" className="constellation-edge leaf"
                          />
                          {sc.agents.map((ag) => (
                            <path
                              key={ag.key} d={`M ${sc.x} ${sc.y} Q ${ag.edgeCx} ${ag.edgeCy} ${ag.x} ${ag.y}`}
                              fill="none" className="constellation-edge agent-edge"
                            />
                          ))}
                        </g>
                      ))}

                      {subcats.map((sc) => (
                        <g key={sc.key} className="constellation-subcat" transform={`translate(${sc.x} ${sc.y})`}>
                          <circle r={8 * UI_SCALE} className="subcat-circle" />
                          <text x={13 * UI_SCALE} y={0} textAnchor="start" dominantBaseline="middle" className="subcat-label">
                            {sc.label}
                          </text>
                        </g>
                      ))}

                      {subcats.flatMap((sc) => sc.agents).map((ag) => (
                        <g
                          key={ag.key}
                          className={'constellation-leaf' + (selectedAgent?.key === ag.key ? ' active' : '')}
                          transform={`translate(${ag.x} ${ag.y})`}
                          role="button"
                          tabIndex={-1}
                        >
                          <circle r={16 * UI_SCALE} className="leaf-circle" />
                          {ag.status === 'live' && <circle r={3 * UI_SCALE} className="leaf-live-dot" cx={12 * UI_SCALE} cy={-12 * UI_SCALE} />}
                          <foreignObject
                            x={-8 * UI_SCALE} y={-8 * UI_SCALE} width={16 * UI_SCALE} height={16 * UI_SCALE}
                          ><span dangerouslySetInnerHTML={{ __html: ag.icon }} /></foreignObject>
                          <text x={28 * UI_SCALE} y={0} textAnchor="start" dominantBaseline="middle" className="leaf-label">
                            {ag.name}
                          </text>
                        </g>
                      ))}

                      <g
                        className={'constellation-hub' + (dept.comingSoon ? ' coming-soon' : '')}
                        transform={`translate(${hx} ${hy})`}
                        onClick={() => focusDept(key)}
                        onMouseEnter={() => setHoveredDept(key)}
                        onMouseLeave={() => setHoveredDept(null)}
                        role="button"
                        tabIndex={0}
                      >
                        <circle r={42 * UI_SCALE} className="hub-glow-outer" />
                        <circle r={30 * UI_SCALE} className={'hub-circle' + (!focusedDept && !dimmed ? ' breathing' : '')} />
                        <circle cx={outerDotX} cy={outerDotY} r={2.6 * UI_SCALE} className="hub-marker-dot" />
                        <circle cx={innerDotX} cy={innerDotY} r={2.6 * UI_SCALE} className="hub-marker-dot" />
                        {dept.icon && <foreignObject x={-13 * UI_SCALE} y={-13 * UI_SCALE} width={26 * UI_SCALE} height={26 * UI_SCALE}><span dangerouslySetInnerHTML={{ __html: dept.icon }} /></foreignObject>}
                      </g>

                      {/* Department name — floats past the outermost agent
                          leaf of this branch (see LABEL_RADIUS), not tucked
                          under the hub, matching the reference layout.
                          Overview only: once any department is focused, its
                          name is already shown in the breadcrumb/panel/
                          carousel instead. */}
                      {!focusedDept && (
                        <g transform={`translate(${labelX} ${labelY})`} className="constellation-dept-label">
                          <text y="0" textAnchor="middle" className="hub-label">{dept.label}</text>
                          {dept.tagline && <text y={16 * UI_SCALE} textAnchor="middle" className="hub-tagline">{dept.tagline}</text>}
                          {dept.comingSoon && <text y={30 * UI_SCALE} textAnchor="middle" className="hub-soon-badge">СКОРО</text>}
                        </g>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* The focused department's own graph — Department root →
              Function hubs → Agents — rendered in its own untransformed
              <g> (not the stageTransform one above) since its coordinates
              are already computed as final on-screen positions by
              calculateDepartmentGraphLayout. */}
          {focused && focusedGraph && (
            <g className="dept-graph" style={{ '--dept-color': focused.dept.color }}>
              {[0.55, 0.85, 1.18].map((mul, i) => (
                <circle
                  key={i} r={FUNCTION_RADIUS_BASE * mul} className="dept-graph-orbit"
                  transform={`translate(${focusedGraph.x} ${focusedGraph.y})`}
                />
              ))}

              {focusedGraph.functions.map((fn) => (
                <Fragment key={fn.key}>
                  <path d={fn.edgePath} fill="none" className="dept-graph-edge dept-graph-edge-fn" />
                  {fn.edgeDots.map(([dx, dy], i) => (
                    <circle key={i} cx={dx} cy={dy} r={3 * UI_SCALE} className="dept-graph-dot" />
                  ))}
                  {fn.agents.map((ag) => (
                    <Fragment key={ag.key}>
                      <path d={ag.edgePath} fill="none" className="dept-graph-edge dept-graph-edge-agent" />
                      {ag.edgeDots.map(([dx, dy], i) => (
                        <circle key={i} cx={dx} cy={dy} r={2.3 * UI_SCALE} className="dept-graph-dot dept-graph-dot-small" />
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}

              {focusedGraph.functions.map((fn) => (
                <g key={fn.key} className="dept-graph-fn" transform={`translate(${fn.x} ${fn.y})`}>
                  <circle r={17 * UI_SCALE} className="dept-graph-fn-halo" />
                  <circle r={9 * UI_SCALE} className="dept-graph-fn-circle" />
                  <text {...labelProps(fn.labelSide, 17 * UI_SCALE)} className="dept-graph-fn-label">{fn.label}</text>
                </g>
              ))}

              {focusedGraph.functions.flatMap((fn) => fn.agents).map((ag) => (
                <g
                  key={ag.key}
                  className={'dept-graph-agent' + (selectedAgent?.key === ag.key ? ' active' : '')}
                  transform={`translate(${ag.x} ${ag.y})`}
                  onClick={() => setSelectedAgent({ ...ag, deptKey: focused.key, deptLabel: focused.dept.label, color: focused.dept.color })}
                  role="button"
                  tabIndex={0}
                >
                  <circle r={23 * UI_SCALE} className="dept-graph-agent-glow" />
                  <circle r={20 * UI_SCALE} className="dept-graph-agent-circle" />
                  {ag.status === 'live' && <circle r={3.4 * UI_SCALE} className="leaf-live-dot" cx={14 * UI_SCALE} cy={-14 * UI_SCALE} />}
                  <foreignObject x={-10 * UI_SCALE} y={-10 * UI_SCALE} width={20 * UI_SCALE} height={20 * UI_SCALE}>
                    <span dangerouslySetInnerHTML={{ __html: ag.icon }} />
                  </foreignObject>
                  <text {...labelProps(ag.labelSide, 30 * UI_SCALE)} className="dept-graph-agent-label">{ag.name}</text>
                </g>
              ))}

              <g
                className="dept-graph-root"
                transform={`translate(${focusedGraph.x} ${focusedGraph.y})`}
                onClick={resetView}
                role="button"
                tabIndex={0}
                aria-label={`${focused.dept.label} — назад до всіх відділів`}
              >
                <circle r={62 * UI_SCALE} className="dept-graph-root-glow" />
                <circle r={46 * UI_SCALE} className="dept-graph-root-circle" />
                {focused.dept.icon && (
                  <foreignObject x={-13 * UI_SCALE} y={-30 * UI_SCALE} width={26 * UI_SCALE} height={26 * UI_SCALE}>
                    <span dangerouslySetInnerHTML={{ __html: focused.dept.icon }} />
                  </foreignObject>
                )}
                <text y={16 * UI_SCALE} textAnchor="middle" className="dept-graph-root-label">{focused.dept.label}</text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {coreOpen && <KnowledgeBase onClose={() => setCoreOpen(false)} />}

      {agentToolOpen && AGENT_TOOLS[agentToolOpen] && (() => {
        const AgentTool = AGENT_TOOLS[agentToolOpen];
        return <AgentTool onClose={() => setAgentToolOpen(null)} />;
      })()}

      {selectedAgent && (
        <div className="agent-modal-backdrop" onClick={() => setSelectedAgent(null)}>
          <div className="agent-modal" onClick={(e) => e.stopPropagation()} style={{ '--dept-color': selectedAgent.color }}>
            <button type="button" className="agent-modal-close" onClick={() => setSelectedAgent(null)}>&times;</button>

            <div className="agent-modal-badges">
              <span className="agent-badge autonomy">{AUTONOMY_LABEL[selectedAgent.autonomyLevel]}</span>
              <span className={'agent-badge status status-' + selectedAgent.status}>{STATUS_LABEL[selectedAgent.status]}</span>
              {selectedAgent.wave && <span className={'agent-badge wave wave-' + selectedAgent.wave}>{WAVE_LABEL[selectedAgent.wave]}</span>}
            </div>
            <div className="agent-modal-breadcrumb">{selectedAgent.deptLabel} · {selectedAgent.subcatLabel}</div>
            <h2>{selectedAgent.name}</h2>
            <p className="agent-modal-desc">{selectedAgent.description}</p>

            {selectedAgent.breaksInto?.length > 0 && (
              <div className="agent-modal-section">
                <h4>BREAKS INTO</h4>
                <div className="agent-pills">{selectedAgent.breaksInto.map((p) => <span key={p} className="agent-pill">{p}</span>)}</div>
              </div>
            )}
            {selectedAgent.wiredInto?.length > 0 && (
              <div className="agent-modal-section">
                <h4>WIRED INTO</h4>
                <div className="agent-pills">{selectedAgent.wiredInto.map((p) => <span key={p} className="agent-pill">{p}</span>)}</div>
              </div>
            )}
            {selectedAgent.buildsOn?.length > 0 && (
              <div className="agent-modal-section">
                <h4>BUILDS ON</h4>
                <div className="agent-pills">{selectedAgent.buildsOn.map((p) => <span key={p} className="agent-pill">{p}</span>)}</div>
              </div>
            )}
            {selectedAgent.whatItReplaces && (
              <div className="agent-modal-section">
                <h4>WHAT IT REPLACES</h4>
                <p>{selectedAgent.whatItReplaces}</p>
              </div>
            )}

            {selectedAgent.ladder && (
              <div className="agent-modal-section">
                <h4>THE LADDER</h4>
                <div className="agent-ladder">
                  {[
                    ['human-led', 'Human-led', selectedAgent.ladder.humanLed],
                    ['human-assisted', 'Human-assisted', selectedAgent.ladder.humanAssisted],
                    ['fully-autonomous', 'Fully autonomous', selectedAgent.ladder.fullyAutonomous],
                  ].map(([lvl, label, text]) => (
                    <div key={lvl} className={'ladder-row' + (selectedAgent.autonomyLevel === lvl ? ' current' : '')}>
                      <div className="ladder-row-label">{label}</div>
                      <div className="ladder-row-text">{text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedAgent.theHuman && (
              <div className="agent-modal-section">
                <h4>THE HUMAN</h4>
                <p>{selectedAgent.theHuman}</p>
              </div>
            )}
            {selectedAgent.buildNotes && (
              <div className="agent-modal-section">
                <h4>BUILD NOTES</h4>
                <p>{selectedAgent.buildNotes}</p>
              </div>
            )}

            <div className="agent-modal-cta">
              {AGENT_TOOLS[selectedAgent.tool] ? (
                <button type="button" className="btn btn-p" onClick={() => { setAgentToolOpen(selectedAgent.tool); setSelectedAgent(null); }}>
                  Відкрити чат &rarr;
                </button>
              ) : selectedAgent.cta ? (
                <Link to={selectedAgent.cta.to} className="btn btn-p">{selectedAgent.cta.label} &rarr;</Link>
              ) : (
                <button type="button" className="btn" disabled title="Ще не реалізовано">Запустити (скоро)</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
