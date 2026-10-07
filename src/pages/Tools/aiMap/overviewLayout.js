// Geometry of the AI Agents overview ("Мапа"): eight department spheres on an
// ellipse around the core, each with up to three agent satellites + a "+N"
// row, taken from approved-reference.png (1586x992). All numbers below are
// measured in reference pixels and converted to viewBox units with K, so the
// scene scales with the stage height exactly like the reference does.
//
// The layout is pure data -> data (no React, no DOM): the same real
// AGENT_DEPTS records feed it, nothing about agents/departments is invented
// by the picture. Satellites in the reference were illustrative; here every
// row is a real agent (first three in catalogue order, startHere first).

export const VIEWBOX_HALF = 700; // viewBox height is 2 * this (same as before)
export const K = (VIEWBOX_HALF * 2) / 992; // viewBox units per reference px

// Sizes (reference px). Sphere 96px / icon 48px / badge 24px / satellite 26px
// sit inside the ranges the kit allows at 1600x1000 (80-100 / 48 / 22-26 / 22-30).
export const NODE_R = 48 * K;
export const NODE_ICON = 48 * K;
export const NODE_HALO = 27 * K;
export const BADGE_R = 12 * K;
export const SAT_R = 13 * K;
export const FONT_DEPT = 16 * K;
export const FONT_COUNT = 13.5 * K;
export const FONT_SAT = 12.5 * K;

const TITLE_LH = 22 * K;
const SUB_GAP = 24 * K;
const WRAP_CHARS = 16; // department titles wrap past this (matches the reference's 2-line titles)
const SAT_WRAP = 30;
const MAX_NAMES = 3; // more than this -> three names + "+N агентів"

const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

// Satellite slots (sphere centres, reference px, relative to the node centre).
// [dx, dy]; the label sits on the outer side of each sphere (dx < 0 -> left).
const SLOTS = {
  // Row spacing is >= 35 reference px so two-line agent names never touch
  // (the reference had short names; the real catalogue has long ones).
  N: [[-80, -68], [82, -68], [-118, -30], [120, -30]],
  NE: [[115, -18], [126, 17], [131, 52], [122, 87]],
  E: [[127, 35], [110, 70], [95, 105], [80, 140]],
  SE: [[128, 39], [112, 74], [89, 109], [115, 144]],
  S: [[-90, 68], [-71, 103], [96, 68], [81, 103]],
  SW: [[-121, 25], [-107, 60], [-90, 95], [-96, 130]],
  W: [[-124, 28], [-109, 63], [-94, 98], [-79, 133]],
  NW: [[-126, 17], [-131, 52], [-122, 87], [-115, -18]],
};

// Department label block: horizontal anchor, x offset, y of the first title
// line (reference px). 'N' is bottom-anchored (grows upwards), the rest grow
// downwards from y0.
const LABELS = {
  N: { anchor: 'middle', x: 0, y0: -134, up: true, subY: -88 },
  NE: { anchor: 'start', x: 64, y0: -98 },
  E: { anchor: 'start', x: 90, y0: -46 },
  SE: { anchor: 'start', x: 92, y0: -40 },
  S: { anchor: 'middle', x: 0, y0: 120 },
  SW: { anchor: 'end', x: -89, y0: -42 },
  W: { anchor: 'end', x: -90, y0: -46 },
  NW: { anchor: 'end', x: -87, y0: -71 },
};

export function pluralAgents(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'агент';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'агенти';
  return 'агентів';
}

// Balanced two-line split at a word boundary (never mid-word).
export function wrapTwoLines(text, maxChars) {
  const t = String(text || '').trim();
  if (t.length <= maxChars) return [t];
  const words = t.split(/\s+/);
  if (words.length < 2) return [t];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

// Greedy wrap into at most `maxLines` lines of maxChars (a single long word
// keeps its own line) — used for the narrow-screen department titles.
export function wrapLines(text, maxChars, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= maxChars) lines[lines.length - 1] = cur + ' ' + w;
    else lines.push(w);
  }
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    return [...head, lines.slice(maxLines - 1).join(' ')];
  }
  return lines;
}

// Greedy wrap into at most two lines of maxChars, with an ellipsis if the
// text still does not fit — the full name stays available as <title>/aria.
export function wrapSatellite(text, maxChars = SAT_WRAP) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= maxChars) lines[lines.length - 1] = cur + ' ' + w;
    else if (lines.length < 2) lines.push(w);
    else { lines[1] = (lines[1] + ' ' + w); }
  }
  if (lines[1] && lines[1].length > maxChars) lines[1] = lines[1].slice(0, maxChars - 1).trimEnd() + '…';
  return lines.filter(Boolean);
}

// Which of the eight canonical directions a node angle (deg, -90 = top) is.
function dirOf(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360; // 0 = east, clockwise
  return DIRS[Math.round(a / 45) % 8];
}

// Sizes of one node/label set, in viewBox units. Desktop uses the reference
// measurements above; compact (phones / narrow windows) is defined in CSS px
// and converted with `upx` (units per px), so touch targets and text keep a
// real size no matter how the viewBox is scaled.
export function makeDims(compact, upx = 1.4, stageW = 390) {
  if (!compact) {
    return {
      nodeR: NODE_R, icon: NODE_ICON, halo: NODE_HALO, badgeR: BADGE_R, satR: SAT_R,
      fontDept: FONT_DEPT, fontCount: FONT_COUNT, fontSat: FONT_SAT, titleLh: TITLE_LH, subGap: SUB_GAP,
    };
  }
  const k = Math.min(1.5, Math.max(1, stageW / 390));
  return {
    nodeR: 25 * k * upx, icon: 30 * k * upx, halo: 14 * k * upx, badgeR: 9.5 * k * upx, satR: SAT_R,
    fontDept: 12 * k * upx, fontCount: 10.5 * k * upx, fontSat: FONT_SAT, titleLh: 14.5 * k * upx, subGap: 15 * k * upx,
  };
}

// Ellipse ring geometry for the stage (viewBox half extents). Compact: the
// ring lives in the free band between the header stack and the bottom
// stack (reserves in CSS px), so it returns the vertical centre offset too.
export function ringGeometry(halfW, halfH, compact, opt = {}) {
  if (compact) {
    // The map owns its own tall box on phones (the page scrolls around it), so
    // the ring is sized from that box: label extents above/below the top and
    // bottom nodes (three-line titles) decide the vertical radius.
    const { upx = 1.4, stageW = 390, stageH = 560 } = opt;
    const k = Math.min(1.5, Math.max(1, stageW / 390));
    const rxPx = Math.min(230, Math.max(92, stageW / 2 - 70 * k));
    const labelExtent = (25 + 8 + 14.5 * 3 + 15 + 10) * k;
    const ryPx = Math.min(300, Math.max(120, stageH / 2 - labelExtent));
    return { rx: rxPx * upx, ry: ryPx * upx, dy: 0 };
  }
  return { rx: Math.min(325 * K, halfW * 0.41), ry: 258 * K, dy: 0 };
}

// Agents of a department in display order: the "start here" agent first,
// then catalogue order.
export function orderedAgents(dept) {
  const all = dept.subcategories.flatMap((sc) => sc.agents.map((a) => ({ ...a, subcatLabel: sc.label })));
  if (!dept.startHere) return all;
  const i = all.findIndex((a) => a.key === dept.startHere);
  if (i <= 0) return all;
  return [all[i], ...all.slice(0, i), ...all.slice(i + 1)];
}

export function buildOverview(deptKeys, depts, ring, compact, dims = makeDims(false)) {
  const n = deptKeys.length;
  return deptKeys.map((key, i) => {
    const dept = depts[key];
    const angle = -90 + (360 / n) * i;
    const rad = (angle * Math.PI) / 180;
    const x = Math.cos(rad) * ring.rx;
    const y = Math.sin(rad) * ring.ry;
    const dir = dirOf(angle);
    const agents = orderedAgents(dept);
    const count = agents.length;

    const titleLines = compact ? wrapLines(dept.label, 13, 3) : wrapTwoLines(dept.label, WRAP_CHARS);
    let label;
    if (compact) {
      // compact: label centred above the sphere for the upper half, below it
      // for the lower half and the two side nodes
      const above = y < -ring.ry * 0.8; // only the top node; every other label sits under its sphere
      const g = dims.titleLh * 0.55;
      const lh = dims.titleLh;
      let y0; let subY;
      if (above) {
        subY = -(dims.nodeR + g);
        y0 = subY - dims.subGap - (titleLines.length - 1) * lh;
      } else {
        y0 = dims.nodeR + g + lh * 0.5;
        subY = y0 + (titleLines.length - 1) * lh + dims.subGap;
      }
      label = { anchor: 'middle', x: 0, y0, subY, lines: titleLines };
    } else {
      const L = LABELS[dir];
      let y0 = L.y0 * K;
      let subY;
      if (L.up) {
        subY = L.subY * K;
        y0 = subY - SUB_GAP - (titleLines.length - 1) * TITLE_LH;
      } else {
        subY = y0 + (titleLines.length - 1) * TITLE_LH + SUB_GAP;
      }
      label = { anchor: L.anchor, x: L.x * K, y0, subY, lines: titleLines };
    }

    const rows = [];
    if (!compact) {
      const slots = SLOTS[dir];
      const named = count > MAX_NAMES ? MAX_NAMES : count;
      for (let r = 0; r < named; r++) {
        const [dx, dy] = slots[r];
        rows.push({ kind: 'agent', x: dx * K, y: dy * K, side: dx < 0 ? 'l' : 'r', agent: agents[r], lines: wrapSatellite(agents[r].name) });
      }
      if (count > MAX_NAMES) {
        const [dx, dy] = slots[MAX_NAMES];
        const more = count - MAX_NAMES;
        rows.push({ kind: 'more', x: dx * K, y: dy * K, side: dx < 0 ? 'l' : 'r', more, lines: [`+${more} ${pluralAgents(more)}`] });
      }
    }
    return { key, dept, index: i, angle, x, y, dir, count, label, rows };
  });
}
