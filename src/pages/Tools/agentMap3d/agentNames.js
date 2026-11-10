import * as THREE from 'three';
import './agentNames.css';

// The names of the robots and the cross-fade with the box of their department (owner, 2026-11-11): far from an island its box (name, load, dots) is shown; as the camera
// comes closer the box fades out and a small pill with the name appears above every robot of that island. HTML over the scene, placed every frame like the other labels.
// The scene gives what it knows: the camera, the islands (pos, r), the agents (x, z, team, name, key, status) and the elements of the department boxes.
//   near(isl) → true when the camera is at this island (its names are shown): a click on a robot then opens the agent, otherwise it first flies to the island
//   nearest() → the island the camera is at, or null
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// the distance the camera has after flying to an island (createAgentMap.flyTo): the names are fully shown a little beyond it and gone at about twice that
export const flyDist = (r) => Math.hypot(r * 1.05 + 3, r * 1.25 + 1.8);

export function createAgentNames({ root, camera, getSize, agents, islands, boxes, floor = 0.62, statusOf, onOpen }) {
  const proj = new THREE.Vector3();
  const far = new Map(); // island → 0 (camera at the island) .. 1 (far)
  const els = agents.map((a, i) => {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'am3-name'; el.style.display = 'none';
    el.addEventListener('click', (e) => { e.stopPropagation(); if (onOpen) onOpen(i); });
    root.appendChild(el);
    return el;
  });

  function refresh() { // the text and the lamp of every pill (after the states change)
    agents.forEach((a, i) => {
      const st = statusOf ? statusOf(a) : null;
      els[i].innerHTML = `<i style="background:${st ? st.color : '#b25cff'}"></i><span>${esc(a.name)}</span>`;
      els[i].title = st ? `${a.name} · ${st.name}` : a.name;
    });
  }

  function update() {
    const { w, h } = getSize();
    // only ONE island is «open» at a time: the one the camera is closest to (relative to its size); its neighbours keep their boxes, so the view stays calm
    let best = null, bk = 1;
    islands.forEach((isl) => { const f = flyDist(isl.r), k = smooth(f * 1.25, f * 1.9, camera.position.distanceTo(isl.pos)); if (k < bk) { bk = k; best = isl; } });
    islands.forEach((isl, i) => {
      const k = isl === best ? bk : 1;
      far.set(isl, k);
      const box = boxes[i];
      if (box) { box.style.opacity = k.toFixed(3); box.style.pointerEvents = k > 0.35 ? 'auto' : 'none'; box.style.visibility = k < 0.02 ? 'hidden' : ''; }
    });
    agents.forEach((a, i) => {
      const o = 1 - (far.get(a.team) ?? 1), el = els[i];
      if (o < 0.02) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      proj.set(a.x, floor + 2.0, a.z).project(camera);
      if (proj.z > 1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.opacity = o.toFixed(3);
      el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
      el.style.left = ((proj.x * 0.5 + 0.5) * w) + 'px';
      el.style.top = ((-proj.y * 0.5 + 0.5) * h) + 'px';
    });
  }

  const near = (isl) => (far.get(isl) ?? 1) < 0.5;
  function nearest() {
    let best = null, bk = 0.5;
    far.forEach((k, isl) => { if (k < bk) { bk = k; best = isl; } });
    return best;
  }
  function dispose() { els.forEach((el) => el.remove()); boxes.forEach((b) => { if (b) { b.style.opacity = ''; b.style.pointerEvents = ''; b.style.visibility = ''; } }); }

  refresh();
  return { update, refresh, near, nearest, dispose };
}
