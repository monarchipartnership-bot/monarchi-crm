import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEPTS } from '../../components/Sidebar/sidebarData';
import '../../styles/constellationTest.css';

// Experimental page — same idea as the "AI agent constellation" reference
// video: a radial graph built from real data instead of invented agents.
// Here the data is just our own sidebar menu (DEPTS/items already carry
// name/desc/icon/to, nothing new to model) — a quick way to see whether the
// visual works at all before considering it for anything real.

const DEPT_COLORS = {
  sales: '#7C3AED',
  pm: '#2F80ED',
  automation: '#9333EA',
  team: '#14B8A6',
  tools: '#EC4899',
};

const HUB_RADIUS = 190;
const LEAF_RADIUS = 150;
const LEAF_SPREAD_DEG = 64; // total angular fan-out per department branch

function toXY(angleDeg, r) {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * r, Math.sin(rad) * r];
}

// Small deterministic jitter so leaves look organic but don't reshuffle on
// every render (seeded by index, not Math.random()).
function jitter(seed) {
  return ((seed * 37) % 17) - 8;
}

export default function ConstellationTest() {
  const [focusedDept, setFocusedDept] = useState(null);
  const [hoveredDept, setHoveredDept] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const deptKeys = Object.keys(DEPTS);

  const layout = useMemo(() => {
    const n = deptKeys.length;
    return deptKeys.map((key, i) => {
      const dept = DEPTS[key];
      const angle = -90 + (360 / n) * i;
      const [hx, hy] = toXY(angle, HUB_RADIUS);
      const items = dept.items.map((it, j) => {
        const count = dept.items.length;
        const spread = count > 1 ? LEAF_SPREAD_DEG * (j / (count - 1) - 0.5) : 0;
        const leafAngle = angle + spread;
        const dist = LEAF_RADIUS + jitter(i * 10 + j);
        // Fan out from the hub's own position, not the origin — each leaf
        // sits `dist` away from the hub along its own fan angle.
        const [ux, uy] = toXY(leafAngle, 1);
        return { ...it, x: hx + ux * dist, y: hy + uy * dist };
      });
      return { key, dept, angle, hx, hy, items };
    });
  }, [deptKeys]);

  const isDimmed = (key) => focusedDept ? focusedDept !== key : (hoveredDept && hoveredDept !== key);

  return (
    <div className="constellation-page">
      <div className="constellation-head">
        <h1>Constellation — тестова візуалізація меню</h1>
        <p>Дані — реальні пункти сайдбару (жодного вигаданого агента). Клікни на відділ, щоб сфокусуватись, клікни на пункт — щоб побачити опис.</p>
        {focusedDept && (
          <button type="button" className="constellation-reset" onClick={() => setFocusedDept(null)}>&larr; Показати всі відділи</button>
        )}
      </div>

      <div className="constellation-stage">
        <svg viewBox="-420 -420 840 840" className="constellation-svg">
          {/* center particle cluster */}
          <g className="constellation-core">
            <circle r="34" className="core-glow" />
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i * 137.5) % 360;
              const r = 6 + ((i * 53) % 26);
              const [x, y] = toXY(a, r);
              return <circle key={i} cx={x} cy={y} r={1.6} className="core-particle" style={{ animationDelay: `${(i % 7) * 0.3}s` }} />;
            })}
          </g>

          {layout.map(({ key, dept, hx, hy, items }) => {
            const dimmed = isDimmed(key);
            const color = DEPT_COLORS[key] || 'var(--muted)';
            return (
              <g key={key} className={'constellation-branch' + (dimmed ? ' dimmed' : '')} style={{ '--dept-color': color }}>
                <line x1={0} y1={0} x2={hx} y2={hy} className="constellation-edge" />
                {items.map((it) => (
                  <line key={it.key} x1={hx} y1={hy} x2={it.x} y2={it.y} className="constellation-edge leaf" />
                ))}

                {items.map((it) => (
                  <g
                    key={it.key}
                    className={'constellation-leaf' + (selectedItem?.key === it.key && selectedItem?.deptKey === key ? ' active' : '')}
                    transform={`translate(${it.x} ${it.y})`}
                    onClick={() => setSelectedItem({ ...it, deptKey: key, deptLabel: dept.label, color })}
                    role="button"
                    tabIndex={0}
                  >
                    <circle r="20" className="leaf-circle" />
                    <foreignObject x="-10" y="-10" width="20" height="20"><span dangerouslySetInnerHTML={{ __html: it.icon }} /></foreignObject>
                    <text y="34" textAnchor="middle" className="leaf-label">{it.name}</text>
                  </g>
                ))}

                <g
                  className="constellation-hub"
                  transform={`translate(${hx} ${hy})`}
                  onClick={() => setFocusedDept(focusedDept === key ? null : key)}
                  onMouseEnter={() => setHoveredDept(key)}
                  onMouseLeave={() => setHoveredDept(null)}
                  role="button"
                  tabIndex={0}
                >
                  <circle r="30" className="hub-circle" />
                  <foreignObject x="-14" y="-14" width="28" height="28"><span dangerouslySetInnerHTML={{ __html: dept.icon }} /></foreignObject>
                  <text y="48" textAnchor="middle" className="hub-label">{dept.label.replace(' Department', '')}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedItem && (
        <div className="constellation-panel">
          <button type="button" className="constellation-panel-close" onClick={() => setSelectedItem(null)}>&times;</button>
          <div className="constellation-panel-icon" style={{ background: selectedItem.color + '22', color: selectedItem.color }} dangerouslySetInnerHTML={{ __html: selectedItem.icon }} />
          <div className="constellation-panel-dept">{selectedItem.deptLabel}</div>
          <h3>{selectedItem.name}</h3>
          <p>{selectedItem.desc}</p>
          <Link to={selectedItem.to} className="constellation-panel-link">Перейти &rarr;</Link>
        </div>
      )}
    </div>
  );
}
