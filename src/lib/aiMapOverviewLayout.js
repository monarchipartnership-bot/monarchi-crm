// Single source of truth for the AI Map overview's department-hub
// positions — imported by both ConstellationTest.jsx (the real map) and
// TemporaryNetworkLayer.jsx (the CRM->AI transition's temporary build-up
// network), so the temporary network's hub dots land in the *exact* same
// screen position as the real map's hubs and the handoff crossfade has no
// jump at the node level. Child/label positions are NOT single-sourced —
// the temporary network's child dots are generic/approximate since they
// fade to 0 opacity at handoff rather than needing to align pixel-for-pixel.

// Kept as a plain numeric constant in both this file and ConstellationTest.jsx
// (not re-exported/imported both ways) — trivial to keep in sync by eye,
// lower risk than threading an import through ConstellationTest's existing
// working layout code for a single number.
export const HUB_RADIUS = 190;

export function computeOverviewHubs(deptKeys, agentDepts) {
  const n = deptKeys.length;
  return deptKeys.map((key, i) => {
    const dept = agentDepts[key];
    const deptAngle = -90 + (360 / n) * i;
    const rad = (deptAngle * Math.PI) / 180;
    const hx = Math.cos(rad) * HUB_RADIUS;
    const hy = Math.sin(rad) * HUB_RADIUS;
    return { key, dept, deptAngle, hx, hy };
  });
}
