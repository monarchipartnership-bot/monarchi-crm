import * as THREE from 'three';
import './taskMarkers.css';

// The carriers of the map: one small pill above the robot of the agent where a task is now (a running or queued task, a result that waits for the person's OK, a failed task),
// from the real tables (lib/agents/mapTasks.js). HTML on top of the scene, placed every frame like the labels of the islands; far from the agent it is a dot with a number, close
// it shows who and what. A click opens the campaign. The scene gives only what it knows: the camera, the root element and the agents with their place on the floor.
const COLORS = { running: '#EB9CEF', queued: '#8fb4ff', review: '#FBBF24', failed: '#ff5a6a' };
const NEAR = 22; // closer than this (metres from the camera) a carrier shows its text

export function createTaskMarkers({ root, camera, getSize, agents, floor = 0.62, onOpen }) {
  const els = new Map(); // task id → { el, task }
  const proj = new THREE.Vector3();
  const byKey = new Map();
  agents.forEach((a, i) => { if (a.key) byKey.set(a.key, i); });

  function set(tasks = []) {
    const keep = new Set(tasks.map((t) => t.id));
    for (const [id, m] of els) if (!keep.has(id)) { m.el.remove(); els.delete(id); }
    const perAgent = new Map();
    tasks.forEach((t) => {
      const idx = byKey.get(t.agentKey);
      if (idx == null) return; // the agent has no desk on this map (a chat tool, or not on the scene)
      const slot = perAgent.get(t.agentKey) || 0; perAgent.set(t.agentKey, slot + 1);
      let m = els.get(t.id);
      if (!m) {
        const el = document.createElement('button'); el.type = 'button'; el.className = 'am3-task';
        el.addEventListener('click', (e) => { e.stopPropagation(); const cur = els.get(t.id); if (cur && onOpen) onOpen(cur.task); });
        root.appendChild(el);
        m = { el, task: t, idx, slot };
        els.set(t.id, m);
      }
      m.task = t; m.idx = idx; m.slot = slot;
      m.el.style.setProperty('--c', COLORS[t.kind] || COLORS.running);
      m.el.dataset.kind = t.kind;
      m.el.classList.toggle('is-sel', !!t.selected); // the car chosen in «Рух задач»
      m.el.innerHTML = `<i></i><b>${t.count > 1 ? t.count : ''}</b><span>${escapeHtml(t.label)}</span>`;
      m.el.title = t.label;
    });
  }

  function update() {
    const { w, h } = getSize();
    for (const m of els.values()) {
      const a = agents[m.idx];
      proj.set(a.x, floor + 2.6 + m.slot * 0.55, a.z); // above the robot, the next carrier of the same agent above the first
      const dist = camera.position.distanceTo(proj);
      proj.project(camera);
      if (proj.z > 1) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      m.el.style.left = ((proj.x * 0.5 + 0.5) * w) + 'px';
      m.el.style.top = ((-proj.y * 0.5 + 0.5) * h) + 'px';
      m.el.classList.toggle('near', dist < NEAR);
    }
  }

  function dispose() { for (const m of els.values()) m.el.remove(); els.clear(); }
  return { set, update, dispose };
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
